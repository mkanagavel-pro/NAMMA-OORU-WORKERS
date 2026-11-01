import express, { Response } from 'express';
import { addAuditLog } from '../db';
import { AuthRequest, requireRole } from '../auth';
import { adminActionLimiter } from '../middleware/rateLimit';
import { UserModel } from '../models/User';
import { WorkerModel } from '../models/Worker';
import { RecoveryRequestModel } from '../models/RecoveryRequest';
import { maskPhone, normalizeIndianMobile, toStoredPhone } from '../services/workerIdentity';
import {
  buildResetUrl,
  canTransition,
  generateResetToken,
  getPublicBaseUrl,
  getResetTtlMinutes,
  type RecoveryStatus,
} from '../services/recoveryToken';

// Admin-only half of the recovery workflow. Mounted at /api/admin/recovery.
// Admins can NEVER see passwords or password hashes here, and the raw reset
// token is returned exactly once (to the admin who generates the link) and
// is never stored, logged or listed.
const router = express.Router();
router.use(requireRole('admin'));
router.use(adminActionLimiter);
router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

const adminId = (req: AuthRequest) => req.user!.email || req.user!.userId;
const cleanNote = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 500) : '');

async function expireStaleLinks() {
  const now = Date.now();
  await RecoveryRequestModel.updateMany(
    { status: 'link_issued', tokenExpiresAt: { $lte: now } },
    { $set: { status: 'expired', updatedAt: now } }
  );
}

// 1. List (minimal info only - phone is masked until explicitly revealed).
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    await expireStaleLinks();
    const filter = String(req.query.status || 'open');
    const type = String(req.query.type || 'all');
    const q: any = { status: { $ne: 'no_match' } };
    if (filter === 'open') q.status = { $in: ['pending', 'approved', 'link_issued', 'expired'] };
    else if (filter === 'closed') q.status = { $in: ['completed', 'rejected'] };
    if (type === 'password_reset' || type === 'phone_change') q.type = type;

    const rows = await RecoveryRequestModel.find(q).sort({ createdAt: -1 }).limit(100);
    const users = await UserModel.find({ id: { $in: rows.map((r) => r.userId).filter(Boolean) as string[] } });
    const byUser = new Map(users.map((u) => [u.id, u]));
    const workers = await WorkerModel.find({ id: { $in: users.map((u) => u.workerId).filter(Boolean) as string[] } });
    const byWorker = new Map(workers.map((w) => [w.id, w]));

    res.json({
      items: rows.map((r) => {
        const u: any = r.userId ? byUser.get(r.userId) : null;
        const w: any = u?.workerId ? byWorker.get(u.workerId) : null;
        return {
          id: r.id,
          reference: r.reference,
          type: r.type,
          status: r.status,
          createdAt: r.createdAt,
          loginId: u?.loginId || null,
          workerId: w?.id || null,
          workerName: w?.name || null,
          district: w?.district || null,
          publicArea: w?.publicArea || null,
          category: w?.category || null,
          phoneMasked: maskPhone(u?.phone ?? w?.phone),
          newPhoneMasked: r.newPhone ? maskPhone(r.newPhone) : null,
          phoneVerified: w?.phoneVerified === true,
          hasVerifiedEmail: Boolean(u?.email && u?.emailVerified),
          identityVerified: r.identityVerified,
          adminNote: r.adminNote || '',
          decidedBy: r.decidedBy,
          decidedAt: r.decidedAt,
          linkIssuedAt: r.linkIssuedAt,
          tokenExpiresAt: r.status === 'link_issued' || r.status === 'expired' ? r.tokenExpiresAt : null,
        };
      }),
    });
  } catch (err) {
    console.error('admin recovery list error:', err);
    res.status(500).json({ error: 'Could not load recovery requests.' });
  }
});

async function loadOpen(id: string) {
  const r = await RecoveryRequestModel.findOne({ id });
  return r;
}

// 2. Reveal the full phone number so the admin can call the worker. Audited.
router.post('/:id/phone', async (req: AuthRequest, res: Response) => {
  try {
    const r = await loadOpen(req.params.id);
    if (!r || r.status === 'no_match') return res.status(404).json({ error: 'Request not found' });
    if (['completed', 'rejected'].includes(r.status)) return res.status(400).json({ error: 'This request is closed.' });
    const u: any = r.userId ? await UserModel.findOne({ id: r.userId }) : null;
    if (!u) return res.status(404).json({ error: 'Account not found' });
    await addAuditLog(adminId(req), 'recovery_phone_viewed', 'recovery_request', r.id);
    const w: any = u.workerId ? await WorkerModel.findOne({ id: u.workerId }) : null;
    res.json({ phone: u.phone || normalizeIndianMobile(w?.phone) || null, newPhone: r.newPhone || null });
  } catch (err) {
    console.error('admin recovery phone error:', err);
    res.status(500).json({ error: 'Could not load the phone number.' });
  }
});

// 3. Approve. identityVerified MUST be true - the admin attests they have
// personally verified the person (call-back / in person). For a phone
// change, approval also applies the change.
router.post('/:id/approve', async (req: AuthRequest, res: Response) => {
  try {
    const r = await loadOpen(req.params.id);
    if (!r || r.status === 'no_match') return res.status(404).json({ error: 'Request not found' });
    if (req.body?.identityVerified !== true) {
      return res.status(400).json({ error: "Confirm that you have verified the worker's identity before approving." });
    }
    if (r.status !== 'pending') return res.status(400).json({ error: 'Only pending requests can be approved.' });
    const now = Date.now();
    const note = cleanNote(req.body?.note);

    if (r.type === 'phone_change') {
      const u: any = r.userId ? await UserModel.findOne({ id: r.userId }) : null;
      const newPhone = r.newPhone && normalizeIndianMobile(r.newPhone);
      if (!u || !newPhone) return res.status(400).json({ error: 'This request cannot be applied.' });
      const taken = await UserModel.exists({ phone: newPhone, id: { $ne: u.id } });
      if (taken) return res.status(409).json({ error: 'That number is now registered to another account.' });
      const oldPhone = u.phone;
      try {
        await UserModel.updateOne({ id: u.id }, { $set: { phone: newPhone, updatedAt: new Date().toISOString() } });
      } catch (e: any) {
        if (e?.code === 11000) return res.status(409).json({ error: 'That number is now registered to another account.' });
        throw e;
      }
      // The admin confirms (by calling the NEW number) whether ownership was verified.
      const verified = req.body?.phoneVerified === true;
      await WorkerModel.updateOne(
        { id: u.workerId },
        {
          $set: {
            phone: toStoredPhone(newPhone),
            phoneVerified: verified,
            phoneVerifiedAt: verified ? new Date(now).toISOString() : null,
            phoneVerifiedBy: verified ? adminId(req) : null,
            updatedAt: new Date(now).toISOString(),
          },
        }
      );
      await RecoveryRequestModel.updateOne(
        { id: r.id },
        { $set: { status: 'completed', identityVerified: true, adminNote: note, decidedBy: adminId(req), decidedAt: now, completedAt: now, updatedAt: now } }
      );
      await addAuditLog(adminId(req), 'phone_change_approved', 'user', u.id, { phone: maskPhone(oldPhone) }, { phone: maskPhone(newPhone), phoneVerified: verified });
      return res.json({ success: true, status: 'completed' });
    }

    if (!canTransition(r.status as RecoveryStatus, 'approved')) return res.status(400).json({ error: 'Invalid state.' });
    const upd = await RecoveryRequestModel.updateOne(
      { id: r.id, status: 'pending' },
      { $set: { status: 'approved', identityVerified: true, adminNote: note, decidedBy: adminId(req), decidedAt: now, updatedAt: now } }
    );
    if (!upd.modifiedCount) return res.status(409).json({ error: 'Request was changed by someone else. Reload and try again.' });
    await addAuditLog(adminId(req), 'recovery_approved', 'recovery_request', r.id, null, { reference: r.reference });
    res.json({ success: true, status: 'approved' });
  } catch (err) {
    console.error('admin recovery approve error:', err);
    res.status(500).json({ error: 'Could not approve the request.' });
  }
});

// 4. Reject (also voids any link already issued).
router.post('/:id/reject', async (req: AuthRequest, res: Response) => {
  try {
    const r = await loadOpen(req.params.id);
    if (!r || r.status === 'no_match') return res.status(404).json({ error: 'Request not found' });
    if (!canTransition(r.status as RecoveryStatus, 'rejected')) return res.status(400).json({ error: 'This request can no longer be rejected.' });
    const now = Date.now();
    await RecoveryRequestModel.updateOne(
      { id: r.id, status: r.status },
      { $set: { status: 'rejected', adminNote: cleanNote(req.body?.note), decidedBy: adminId(req), decidedAt: now, tokenHash: null, tokenExpiresAt: null, updatedAt: now } }
    );
    await addAuditLog(adminId(req), 'recovery_rejected', 'recovery_request', r.id, null, { reference: r.reference });
    res.json({ success: true, status: 'rejected' });
  } catch (err) {
    console.error('admin recovery reject error:', err);
    res.status(500).json({ error: 'Could not reject the request.' });
  }
});

// 5. Generate the single-use reset link (only after approval). Generating a
// new link voids the previous one. The raw token is in the response ONLY.
router.post('/:id/generate-link', async (req: AuthRequest, res: Response) => {
  try {
    const r = await loadOpen(req.params.id);
    if (!r || r.type !== 'password_reset' || r.status === 'no_match') return res.status(404).json({ error: 'Request not found' });
    if (!r.identityVerified || !['approved', 'link_issued', 'expired'].includes(r.status)) {
      return res.status(400).json({ error: 'Approve the request (after verifying identity) before generating a link.' });
    }
    const base = getPublicBaseUrl();
    if (!base || (process.env.NODE_ENV === 'production' && !/^https:\/\//i.test(base))) {
      return res.status(503).json({ error: 'PUBLIC_APP_URL is not configured with an https:// address on the server.' });
    }
    const u: any = r.userId ? await UserModel.findOne({ id: r.userId, role: 'worker' }) : null;
    const w: any = u?.workerId ? await WorkerModel.findOne({ id: u.workerId }) : null;
    const phone = u ? normalizeIndianMobile(u.phone) || normalizeIndianMobile(w?.phone) : null;
    if (!u || !phone) {
      return res.status(400).json({ error: 'This account has no valid registered phone number for WhatsApp.' });
    }

    const ttl = getResetTtlMinutes();
    const now = Date.now();
    const { raw, hash } = generateResetToken();
    const upd = await RecoveryRequestModel.updateOne(
      { id: r.id, status: r.status },
      {
        $set: { status: 'link_issued', tokenHash: hash, tokenExpiresAt: now + ttl * 60_000, tokenUsedAt: null, linkIssuedBy: adminId(req), linkIssuedAt: now, updatedAt: now },
        $inc: { linkIssueCount: 1 },
      }
    );
    if (!upd.modifiedCount) return res.status(409).json({ error: 'Request was changed by someone else. Reload and try again.' });

    // Audit: who and when - never the token.
    await addAuditLog(adminId(req), 'recovery_link_generated', 'recovery_request', r.id, null, { reference: r.reference, ttlMinutes: ttl });

    res.json({
      resetUrl: buildResetUrl(base, raw),
      waPhone: `91${phone}`,
      workerName: w?.name || '',
      ttlMinutes: ttl,
      expiresAt: now + ttl * 60_000,
    });
  } catch (err) {
    console.error('admin recovery generate-link error:', err);
    res.status(500).json({ error: 'Could not generate the link.' });
  }
});

// 6. "Phone Number Verified" - separate from profile approval. Only an admin sets it.
router.post('/workers/:workerId/phone-verified', async (req: AuthRequest, res: Response) => {
  try {
    const verified = req.body?.verified === true;
    const w = await WorkerModel.findOne({ id: req.params.workerId });
    if (!w) return res.status(404).json({ error: 'Worker not found' });
    const now = new Date().toISOString();
    w.phoneVerified = verified;
    (w as any).phoneVerifiedAt = verified ? now : null;
    (w as any).phoneVerifiedBy = verified ? adminId(req) : null;
    w.updatedAt = now;
    await w.save();
    await addAuditLog(adminId(req), verified ? 'phone_marked_verified' : 'phone_unmarked_verified', 'worker', w.id);
    res.json({ success: true, phoneVerified: verified });
  } catch (err) {
    console.error('admin phone-verified error:', err);
    res.status(500).json({ error: 'Could not update the status.' });
  }
});

export default router;
