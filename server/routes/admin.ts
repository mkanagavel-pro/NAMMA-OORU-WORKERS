import express, { Response } from 'express';
import crypto from 'crypto';
import { addAuditLog, sendNotification } from '../db';
import { AuthRequest, requireRole } from '../auth';
import { adminActionLimiter } from '../middleware/rateLimit';
import { WorkerModel } from '../models/Worker';
import { UserModel } from '../models/User';
import { RatingModel } from '../models/Rating';
import { ReportModel, VALID_REPORT_STATUSES } from '../models/Report';
import { WarningModel } from '../models/Warning';
import { SuspensionModel } from '../models/Suspension';
import { AppealModel } from '../models/Appeal';
import { AuditLogModel } from '../models/AuditLog';
import { getSettingsSingleton } from '../models/Settings';

const router = express.Router();

// Enforce admin role AND a rate limit on every admin route - bounds the
// blast radius if a single admin session/token is ever compromised.
router.use(requireRole('admin'));
router.use(adminActionLimiter);

// Shared pagination parsing for the 5 admin list endpoints below. Every one
// now returns { items, total, page, pageSize, totalPages } instead of a raw
// array/500-cap - the AdminPanel frontend has been updated to consume this
// shape and render page controls (see fetchAdminData in AdminPanel.tsx).
function getPagination(req: AuthRequest) {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? '25'), 10) || 25));
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip };
}
function paginatedResponse(items: any[], total: number, page: number, pageSize: number) {
  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

// 1. Dashboard Overview Stats
router.get('/stats', async (req: AuthRequest, res: Response) => {
  try {
    const [totalWorkers, verifiedWorkers, pendingWorkers, suspendedWorkers, totalCustomers, totalRatings, pendingReports, pendingAppeals] =
      await Promise.all([
        WorkerModel.countDocuments({}),
        WorkerModel.countDocuments({ verificationStatus: 'verified' }),
        WorkerModel.countDocuments({ verificationStatus: 'pending' }),
        WorkerModel.countDocuments({ isSuspended: true }),
        UserModel.countDocuments({ role: 'customer' }),
        RatingModel.countDocuments({}),
        ReportModel.countDocuments({ status: { $in: ['Pending', 'Under Review'] } }),
        AppealModel.countDocuments({ status: 'Pending' }),
      ]);

    res.json({ totalWorkers, verifiedWorkers, pendingWorkers, suspendedWorkers, totalCustomers, totalRatings, pendingReports, pendingAppeals });
  } catch (err) {
    console.error('admin stats error:', err);
    res.status(500).json({ error: 'Could not load dashboard stats.' });
  }
});

// 2. Full Worker Management List (with admin details: phone, warningCount, full status)
router.get('/workers', async (req: AuthRequest, res: Response) => {
  try {
    const { status, category, district, search } = req.query;
    const query: Record<string, unknown> = {};

    if (status === 'verified') { query.verificationStatus = 'verified'; query.isSuspended = false; }
    if (status === 'pending') query.verificationStatus = 'pending';
    if (status === 'suspended') query.isSuspended = true;
    if (status === 'rejected') query.verificationStatus = 'rejected';
    if (category && category !== 'all') query.category = category;
    if (district && district !== 'all') {
      // escaped: raw input must never become part of a regex
      query.district = new RegExp(`^\\s*${String(district).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
    }

    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(q, 'i');
      query.$or = [{ name: re }, { email: re }, { phone: re }, { publicArea: re }];
    }

    const { page, pageSize, skip } = getPagination(req);
    const total = await WorkerModel.countDocuments(query);
    const list = await WorkerModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(pageSize);

    const enriched = await Promise.all(
      list.map(async (w: any) => {
        const activeSusp = await SuspensionModel.findOne({ workerId: w.id, status: 'active' });
        const workerWarnings = await WarningModel.find({ workerId: w.id });
        return { ...w.toObject(), activeSuspension: activeSusp || null, warningsHistory: workerWarnings };
      })
    );

    res.json(paginatedResponse(enriched, total, page, pageSize));
  } catch (err) {
    console.error('admin workers list error:', err);
    res.status(500).json({ error: 'Could not load workers.' });
  }
});

// 3. Verify Worker (Req 17 & 53)
router.post('/workers/:id/verify', async (req: AuthRequest, res: Response) => {
  try {
    const adminEmail = req.user!.email;
    const worker = await WorkerModel.findOne({ id: req.params.id });
    if (!worker) return res.status(404).json({ error: 'Worker not found' });

    const oldStatus = worker.verificationStatus;
    worker.verificationStatus = 'verified';
    worker.updatedAt = new Date().toISOString();
    await worker.save();

    await addAuditLog(adminEmail, 'worker_verify', 'worker', worker.id, { verificationStatus: oldStatus }, { verificationStatus: 'verified' });
    await sendNotification(worker.id, 'verification', 'Profile Verified', 'Congratulations! Your worker profile has been verified by the administrator.', true);
    await sendNotification(worker.id, 'verification', 'Profile Verified', 'Congratulations! Your worker profile has been verified by the administrator.', false);

    res.json({ success: true, worker, message: `${worker.name} is now verified!` });
  } catch (err) {
    console.error('worker verify error:', err);
    res.status(500).json({ error: 'Could not verify worker.' });
  }
});

// 4. Reject Worker (Req 18 & 53: rejected workers are NOT publicly visible)
router.post('/workers/:id/reject', async (req: AuthRequest, res: Response) => {
  try {
    const { reason } = req.body;
    const adminEmail = req.user!.email;
    const worker = await WorkerModel.findOne({ id: req.params.id });
    if (!worker) return res.status(404).json({ error: 'Worker not found' });

    const oldStatus = worker.verificationStatus;
    worker.verificationStatus = 'rejected';
    worker.updatedAt = new Date().toISOString();
    await worker.save();

    await addAuditLog(adminEmail, 'worker_reject', 'worker', worker.id, { verificationStatus: oldStatus }, { verificationStatus: 'rejected', reason });
    await sendNotification(worker.id, 'verification', 'Application Rejected', `Your worker profile application was rejected. Reason: ${reason || 'Incomplete profile details.'}`, true);

    res.json({ success: true, worker, message: `${worker.name} application has been rejected.` });
  } catch (err) {
    console.error('worker reject error:', err);
    res.status(500).json({ error: 'Could not reject worker.' });
  }
});

// 5. Suspend Worker (Req 30-36)
router.post('/workers/:id/suspend', async (req: AuthRequest, res: Response) => {
  try {
    const { durationDays, reason, note } = req.body;
    const adminEmail = req.user!.email;

    if (!durationDays || Number(durationDays) <= 0) {
      return res.status(400).json({ error: 'Valid suspension duration in days is required' });
    }

    const worker = await WorkerModel.findOne({ id: req.params.id });
    if (!worker) return res.status(404).json({ error: 'Worker not found' });

    const days = Number(durationDays);
    const startDate = new Date().toISOString();
    const endDate = new Date(Date.now() + days * 86400000).toISOString();
    const suspId = crypto.randomUUID();
    const finalReason = reason || 'Violation of platform guidelines';

    const suspension = await SuspensionModel.create({
      id: suspId,
      workerId: worker.id,
      workerName: worker.name,
      reason: finalReason,
      note: note || '',
      startDate,
      endDate,
      durationDays: days,
      remainingDays: days,
      status: 'active',
      createdBy: adminEmail,
      resolvedBy: null,
      resolutionNote: null,
      createdAt: startDate,
      updatedAt: startDate,
    });

    worker.isSuspended = true;
    worker.suspensionInfo = {
      id: suspId,
      reason: finalReason,
      note: note || '',
      startDate,
      endDate,
      durationDays: days,
      remainingDays: days,
      status: 'active',
      actionBy: 'Namma Ooru Workers Admin',
    } as any;
    worker.updatedAt = new Date().toISOString();
    await worker.save();

    await addAuditLog(adminEmail, 'worker_suspend', 'worker', worker.id, null, { suspensionId: suspId, durationDays: days, reason: finalReason, note });

    const suspMessage = `Your account has been suspended for ${days} days. Reason: ${finalReason}. Direct contact and new ratings are temporarily disabled.`;
    await sendNotification(worker.id, 'suspension', 'Account Suspended', suspMessage, true);
    await sendNotification(worker.id, 'suspension', 'Account Suspended', suspMessage, false);

    res.json({ success: true, worker, suspension, message: `${worker.name} has been suspended for ${days} days.` });
  } catch (err) {
    console.error('worker suspend error:', err);
    res.status(500).json({ error: 'Could not suspend worker.' });
  }
});

// 6. Modify Active Suspension (Extend/Reduce Duration, or Edit Reason/Note) (Req 32 & 49)
router.post('/workers/:id/suspend/modify', async (req: AuthRequest, res: Response) => {
  try {
    const { newDurationDays, newReason, newNote } = req.body;
    const adminEmail = req.user!.email;

    const worker = await WorkerModel.findOne({ id: req.params.id });
    if (!worker || !worker.isSuspended) {
      return res.status(400).json({ error: 'Worker is not currently suspended' });
    }

    const activeSusp = await SuspensionModel.findOne({ workerId: worker.id, status: 'active' });
    if (!activeSusp) {
      return res.status(404).json({ error: 'Active suspension record not found' });
    }

    // Req 49: old values must NOT be destroyed - preserved in the audit log.
    const oldValues = {
      durationDays: activeSusp.durationDays,
      endDate: activeSusp.endDate,
      reason: activeSusp.reason,
      note: activeSusp.note,
    };

    if (newDurationDays && Number(newDurationDays) > 0) {
      const days = Number(newDurationDays);
      activeSusp.durationDays = days;
      const start = new Date(activeSusp.startDate).getTime();
      activeSusp.endDate = new Date(start + days * 86400000).toISOString();
      const remainingMs = new Date(activeSusp.endDate).getTime() - Date.now();
      activeSusp.remainingDays = Math.max(0, Math.ceil(remainingMs / 86400000));
    }
    if (newReason !== undefined) activeSusp.reason = newReason;
    if (newNote !== undefined) activeSusp.note = newNote;
    activeSusp.updatedAt = new Date().toISOString();
    await activeSusp.save();

    worker.suspensionInfo = {
      id: activeSusp.id,
      reason: activeSusp.reason,
      note: activeSusp.note,
      startDate: activeSusp.startDate,
      endDate: activeSusp.endDate,
      durationDays: activeSusp.durationDays,
      remainingDays: activeSusp.remainingDays,
      status: 'active',
      actionBy: 'Namma Ooru Workers Admin',
    } as any;
    await worker.save();

    await addAuditLog(adminEmail, 'suspension_modified', 'suspension', activeSusp.id, oldValues, {
      durationDays: activeSusp.durationDays,
      endDate: activeSusp.endDate,
      reason: activeSusp.reason,
      note: activeSusp.note,
    });

    const updateMsg = `Your suspension details have been updated. Duration is now ${activeSusp.durationDays} days (Remaining: ${activeSusp.remainingDays} days). Reason: ${activeSusp.reason}.`;
    await sendNotification(worker.id, 'suspension', 'Suspension Details Updated', updateMsg, true);
    await sendNotification(worker.id, 'suspension', 'Suspension Details Updated', updateMsg, false);

    res.json({ success: true, suspension: activeSusp, message: 'Suspension successfully modified.' });
  } catch (err) {
    console.error('suspension modify error:', err);
    res.status(500).json({ error: 'Could not modify suspension.' });
  }
});

// 7. Manually Resolve Suspension Early (Req 32 & 50)
router.post('/workers/:id/suspend/resolve', async (req: AuthRequest, res: Response) => {
  try {
    const { resolutionNote } = req.body;
    const adminEmail = req.user!.email;

    const worker = await WorkerModel.findOne({ id: req.params.id });
    if (!worker || !worker.isSuspended) {
      return res.status(400).json({ error: 'Worker is not currently suspended' });
    }

    const activeSusp = await SuspensionModel.findOne({ workerId: worker.id, status: 'active' });
    if (activeSusp) {
      activeSusp.status = 'resolved';
      activeSusp.resolvedBy = adminEmail;
      activeSusp.resolutionNote = resolutionNote || 'Resolved early by administrator';
      activeSusp.updatedAt = new Date().toISOString();
      await activeSusp.save();
    }

    worker.isSuspended = false;
    worker.availability = 'Available'; // Req 50: worker becomes Available
    worker.suspensionInfo = null;
    worker.updatedAt = new Date().toISOString();
    await worker.save();

    await addAuditLog(adminEmail, 'suspension_resolved_early', 'worker', worker.id, { suspensionId: activeSusp?.id }, { status: 'Available' });

    const msg = 'Your account suspension has been resolved early by administration. Your status is now Available, and contact and ratings are restored.';
    await sendNotification(worker.id, 'suspension', 'Suspension Resolved Early', msg, true);
    await sendNotification(worker.id, 'suspension', 'Suspension Resolved Early', msg, false);

    res.json({ success: true, worker, message: `Suspension for ${worker.name} has been resolved.` });
  } catch (err) {
    console.error('suspension resolve error:', err);
    res.status(500).json({ error: 'Could not resolve suspension.' });
  }
});

// 8. Issue Worker Warning (Req 28: 3 active warnings = permanent deletion!)
router.post('/workers/:id/warning', async (req: AuthRequest, res: Response) => {
  try {
    const { reason, source = 'manual', reportId } = req.body;
    const adminEmail = req.user!.email;

    if (!reason) return res.status(400).json({ error: 'Warning reason is required' });

    const worker = await WorkerModel.findOne({ id: req.params.id });
    if (!worker) return res.status(404).json({ error: 'Worker not found' });

    const warningId = crypto.randomUUID();
    const warning = await WarningModel.create({
      id: warningId,
      workerId: worker.id,
      reason,
      source: source === 'report' ? 'report' : 'manual',
      active: true,
      issuedBy: adminEmail,
      issuedAt: new Date().toISOString(),
      resetAt: null,
    });

    worker.warningCount = (worker.warningCount || 0) + 1;

    if (reportId) {
      await ReportModel.updateOne(
        { id: reportId },
        { status: 'Resolved', adminAction: `Issued warning #${warningId.substring(0, 6)}` }
      );
    }

    await addAuditLog(adminEmail, 'warning_issued', 'worker', worker.id, null, { warningId, reason, newWarningCount: worker.warningCount });

    // Req 34: 3 active warnings = PERMANENTLY DELETE worker account!
    if (worker.warningCount >= 3) {
      await WorkerModel.deleteOne({ id: worker.id });
      await UserModel.deleteOne({ workerId: worker.id });

      await addAuditLog('System', 'worker_deleted_3_warnings', 'worker', worker.id, { warningCount: 3 }, { action: 'permanent_deletion' });
      await sendNotification(
        worker.id,
        'warning',
        'Account Deleted (3 Warnings)',
        'Your worker account has accumulated 3 active warnings and has been permanently deleted in accordance with platform policy.',
        true
      );

      return res.json({
        success: true,
        deleted: true,
        message: `${worker.name} received 3rd active warning and was permanently deleted from the platform.`,
      });
    }

    await worker.save();

    await sendNotification(
      worker.id,
      'warning',
      `Official Warning (${worker.warningCount}/3)`,
      `You have received an official warning. Reason: ${reason}. Note: 3 active warnings will result in permanent account deletion. Clean record for 6 months resets warnings.`,
      true
    );

    res.json({ success: true, warning, warningCount: worker.warningCount, message: `Warning issued to ${worker.name} (Active warnings: ${worker.warningCount}/3).` });
  } catch (err) {
    console.error('warning issue error:', err);
    res.status(500).json({ error: 'Could not issue warning.' });
  }
});

// 9. Remove Active Warning (Admin moderation)
router.post('/workers/:id/warning/:warningId/remove', async (req: AuthRequest, res: Response) => {
  try {
    const { id, warningId } = req.params;
    const adminEmail = req.user!.email;

    const worker = await WorkerModel.findOne({ id });
    const warning = await WarningModel.findOne({ id: warningId, workerId: id });
    if (!worker || !warning) return res.status(404).json({ error: 'Worker or warning not found' });

    if (warning.active) {
      warning.active = false;
      warning.resetAt = new Date().toISOString();
      await warning.save();

      worker.warningCount = Math.max(0, (worker.warningCount || 1) - 1);
      await worker.save();

      await addAuditLog(adminEmail, 'warning_removed', 'worker', worker.id, { warningId }, { warningCount: worker.warningCount });
    }

    res.json({ success: true, warningCount: worker.warningCount, message: 'Warning removed.' });
  } catch (err) {
    console.error('warning remove error:', err);
    res.status(500).json({ error: 'Could not remove warning.' });
  }
});

// 10. Delete Worker Account Permanently (Req 37: serious/fake accounts can be immediately deleted regardless of warning count)
router.delete('/workers/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminEmail = req.user!.email;

    const worker = await WorkerModel.findOne({ id });
    if (!worker) return res.status(404).json({ error: 'Worker not found' });

    await UserModel.deleteOne({ $or: [{ workerId: worker.id }, { id: worker.userId }] });
    await WorkerModel.deleteOne({ id });
    await SuspensionModel.deleteMany({ workerId: id });
    await WarningModel.deleteMany({ workerId: id });
    await AppealModel.deleteMany({ workerId: id });

    await addAuditLog(adminEmail, 'admin_delete_worker', 'worker', id, { workerName: worker.name }, { reason });

    res.json({ success: true, message: `Worker ${worker.name} permanently deleted.` });
  } catch (err) {
    console.error('worker delete error:', err);
    res.status(500).json({ error: 'Could not delete worker.' });
  }
});

// 11. Appeals Review & Decision (Req 41-48)
router.get('/appeals', async (req: AuthRequest, res: Response) => {
  try {
    const { page, pageSize, skip } = getPagination(req);
    const total = await AppealModel.countDocuments({});
    const appeals = await AppealModel.find({}).sort({ createdAt: -1 }).skip(skip).limit(pageSize);
    res.json(paginatedResponse(appeals, total, page, pageSize));
  } catch (err) {
    console.error('admin appeals list error:', err);
    res.status(500).json({ error: 'Could not load appeals.' });
  }
});

router.post('/appeals/:id/decision', async (req: AuthRequest, res: Response) => {
  try {
    const { decision, adminNote } = req.body; // 'Approved' | 'Rejected'
    const adminEmail = req.user!.email;

    if (decision !== 'Approved' && decision !== 'Rejected') {
      return res.status(400).json({ error: 'Decision must be Approved or Rejected' });
    }

    const appeal = await AppealModel.findOne({ id: req.params.id });
    if (!appeal) return res.status(404).json({ error: 'Appeal not found' });

    const worker = await WorkerModel.findOne({ id: appeal.workerId });
    const decisionDate = new Date().toISOString();

    appeal.status = decision;
    appeal.adminNote = adminNote || null; // Req 47: optional, kept in audit log, never shown to the worker
    appeal.decisionDate = decisionDate;
    await appeal.save();

    if (decision === 'Approved') {
      // Req 45: immediately remove suspension, status -> Available
      if (worker) {
        worker.isSuspended = false;
        worker.availability = 'Available';
        worker.suspensionInfo = null;
        await worker.save();
      }

      const activeSusp = await SuspensionModel.findOne({ id: appeal.suspensionId });
      if (activeSusp) {
        activeSusp.status = 'appealed';
        activeSusp.resolvedBy = adminEmail;
        await activeSusp.save();
      }

      await sendNotification(appeal.workerId, 'appeal', 'Appeal Approved - Account Restored', 'Your appeal has been approved by administration. Your account is now active and Available.', true);
      await sendNotification(appeal.workerId, 'appeal', 'Appeal Approved - Account Restored', 'Your appeal has been approved by administration. Your account is now active and Available.', false);
    } else {
      // Req 46: rejected appeal - original suspension end date remains unchanged
      await sendNotification(appeal.workerId, 'appeal', 'Appeal Rejected', 'Your review request was not approved. The current suspension remains in effect until the scheduled expiry date.', true);
      await sendNotification(appeal.workerId, 'appeal', 'Appeal Rejected', 'Your review request was not approved. The current suspension remains in effect until the scheduled expiry date.', false);
    }

    await addAuditLog(adminEmail, `appeal_${decision.toLowerCase()}`, 'appeal', appeal.id, null, { decision, adminNote, workerId: appeal.workerId });

    res.json({ success: true, appeal, message: `Appeal ${decision} for ${appeal.workerName || 'worker'}.` });
  } catch (err) {
    console.error('appeal decision error:', err);
    res.status(500).json({ error: 'Could not process appeal decision.' });
  }
});

// 12. Reports Review
router.get('/reports', async (req: AuthRequest, res: Response) => {
  try {
    const { page, pageSize, skip } = getPagination(req);
    const total = await ReportModel.countDocuments({});
    const reports = await ReportModel.find({}).sort({ createdAt: -1 }).skip(skip).limit(pageSize);
    res.json(paginatedResponse(reports, total, page, pageSize));
  } catch (err) {
    console.error('admin reports list error:', err);
    res.status(500).json({ error: 'Could not load reports.' });
  }
});

router.put('/reports/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { status, adminAction } = req.body;
    const adminEmail = req.user!.email;

    if (!VALID_REPORT_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${VALID_REPORT_STATUSES.join(', ')}` });
    }

    const report = await ReportModel.findOne({ id: req.params.id });
    if (!report) return res.status(404).json({ error: 'Report not found' });

    report.status = status;
    if (adminAction) report.adminAction = String(adminAction).slice(0, 500);
    report.updatedAt = new Date().toISOString();
    await report.save();

    await addAuditLog(adminEmail, 'report_status_update', 'report', report.id, null, { status, adminAction });

    res.json({ success: true, report, message: 'Report status updated.' });
  } catch (err) {
    console.error('report status update error:', err);
    res.status(500).json({ error: 'Could not update report.' });
  }
});

// 13. Customer Management
router.get('/customers', async (req: AuthRequest, res: Response) => {
  try {
    const { page, pageSize, skip } = getPagination(req);
    const total = await UserModel.countDocuments({ role: 'customer' });
    const users = await UserModel.find({ role: 'customer' }).sort({ createdAt: -1 }).skip(skip).limit(pageSize);
    const customers = users.map((u: any) => ({
      id: u.id,
      email: u.email,
      emailVerified: u.emailVerified,
      status: u.status,
      favouritesCount: (u.favourites || []).length,
      createdAt: u.createdAt,
    }));
    res.json(paginatedResponse(customers, total, page, pageSize));
  } catch (err) {
    console.error('admin customers list error:', err);
    res.status(500).json({ error: 'Could not load customers.' });
  }
});

router.post('/customers/:id/restrict', async (req: AuthRequest, res: Response) => {
  try {
    const adminEmail = req.user!.email;
    const customer = await UserModel.findOne({ id: req.params.id, role: 'customer' });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    customer.status = customer.status === 'restricted' ? 'active' : 'restricted';
    customer.updatedAt = new Date().toISOString();
    await customer.save();

    await addAuditLog(adminEmail, 'customer_status_toggle', 'customer', customer.id, null, { status: customer.status });

    res.json({ success: true, status: customer.status, message: `Customer is now ${customer.status}.` });
  } catch (err) {
    console.error('customer restrict error:', err);
    res.status(500).json({ error: 'Could not update customer status.' });
  }
});

// 14. Audit Logs (Req 55)
router.get('/audit-logs', async (req: AuthRequest, res: Response) => {
  try {
    const { page, pageSize, skip } = getPagination(req);
    const total = await AuditLogModel.countDocuments({});
    const logs = await AuditLogModel.find({}).sort({ timestamp: -1 }).skip(skip).limit(pageSize);
    res.json(paginatedResponse(logs, total, page, pageSize));
  } catch (err) {
    console.error('audit logs error:', err);
    res.status(500).json({ error: 'Could not load audit logs.' });
  }
});

// 15. Platform Settings (Req 54 & 75: Auto Verify New Workers ON/OFF)
router.get('/settings', async (req: AuthRequest, res: Response) => {
  try {
    const settings = await getSettingsSingleton();
    res.json(settings);
  } catch (err) {
    console.error('settings get error:', err);
    res.status(500).json({ error: 'Could not load settings.' });
  }
});

router.put('/settings', async (req: AuthRequest, res: Response) => {
  try {
    const { autoVerifyWorkers } = req.body;
    const adminEmail = req.user!.email;

    const settings = await getSettingsSingleton();
    const oldVal = settings.autoVerifyWorkers;
    if (autoVerifyWorkers !== undefined) {
      settings.autoVerifyWorkers = Boolean(autoVerifyWorkers);
      await settings.save();
    }

    await addAuditLog(adminEmail, 'settings_update', 'settings', 'platform', { autoVerifyWorkers: oldVal }, { autoVerifyWorkers: settings.autoVerifyWorkers });

    res.json({ success: true, settings, message: `Auto Verify New Workers is now ${settings.autoVerifyWorkers ? 'ON' : 'OFF'}.` });
  } catch (err) {
    console.error('settings update error:', err);
    res.status(500).json({ error: 'Could not update settings.' });
  }
});

export default router;
