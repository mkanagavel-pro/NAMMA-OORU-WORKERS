import express, { Response } from 'express';
import crypto from 'crypto';
import { sendNotification, addAuditLog } from '../db';
import { AuthRequest } from '../auth';
import { reportLimiter } from '../middleware/rateLimit';
import { WorkerModel } from '../models/Worker';
import { ReportModel, VALID_REPORT_REASONS } from '../models/Report';

const router = express.Router();

// 1. Submit a Report against a worker
router.post('/', reportLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { workerId, reason, description } = req.body;
    const user = req.user;

    if (!workerId || !reason) {
      return res.status(400).json({ error: 'Worker ID and reason are required' });
    }

    // Req 13: fixed reasons only, no "Other"
    if (!VALID_REPORT_REASONS.includes(reason)) {
      return res.status(400).json({
        error: `Invalid report reason. Allowed reasons: ${VALID_REPORT_REASONS.join(', ')}`,
      });
    }

    if (description !== undefined && (typeof description !== 'string' || description.length > 1000)) {
      return res.status(400).json({ error: 'Description must be 1000 characters or fewer' });
    }

    const worker = await WorkerModel.findOne({ id: workerId });
    if (!worker) {
      return res.status(404).json({ error: 'Worker not found' });
    }

    const reportId = crypto.randomUUID();
    const now = new Date().toISOString();
    await ReportModel.create({
      id: reportId,
      customerId: user?.userId || 'guest_user',
      customerEmail: user?.email || 'guest@anonymous', // internal only - never exposed to the reported worker
      workerId,
      workerName: worker.name,
      reason,
      description: description || '',
      status: 'Pending',
      adminAction: null,
      createdAt: now,
      updatedAt: now,
    });

    await sendNotification('admin', 'warning', 'New Worker Report Received', `Report filed against ${worker.name} for "${reason}". Please review in admin panel.`);
    await addAuditLog(user?.email || 'guest', 'report_worker', 'report', reportId, null, { workerId, reason });

    res.status(201).json({
      success: true,
      message: 'Report submitted successfully. Our safety administration will review this promptly.',
    });
  } catch (err) {
    console.error('report submit error:', err);
    res.status(500).json({ error: 'Report submission failed. Please try again.' });
  }
});

export default router;
