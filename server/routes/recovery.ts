import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { addAuditLog, sendNotification, bumpTokenVersion } from '../db';
import { hashPassword } from '../auth';
import { recoveryRequestLimiter, recoveryLookupLimiter, recoveryResetLimiter } from '../middleware/rateLimit';
import { UserModel } from '../models/User';
import { RecoveryRequestModel } from '../models/RecoveryRequest';
import { classifyIdentifier, validateNewPassword } from '../services/workerIdentity';
import {
  OPEN_STATUSES,
  generateReference,
  identifierKey,
  hashResetToken,
  evaluateResetToken,
  publicStatus,
  type RecoveryStatus,
} from '../services/recoveryToken';

// PUBLIC (unauthenticated) half of the admin-assisted password recovery
// used by workers who have no email. Nothing here ever resets a password
// just because someone knows a User ID or phone number: a request only
// creates a record for an administrator, who must verify identity first.
const router = express.Router();

const DAILY_REQUEST_CAP = 3;
const DECOY_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const NEUTRAL_MESSAGE =
  'Your request has been recorded. An administrator may contact you on your registered phone number to verify your identity. Please keep your reference number.';

router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// 1. Worker (no email) asks for help. The response is IDENTICAL whether or
// not the account exists (unknown identifiers get a hidden "decoy" record, so
// even the reference number and the status lookup behave the same).
router.post('/request', recoveryRequestLimiter, async (req: Request, res: Response) => {
  try {
    const ident = classifyIdentifier(req.body?.identifier);
    if (!ident || ident.kind === 'email') {
      return res.status(400).json({ error: 'Please enter your User ID or your 10-digit registered phone number.' });
    }
    const key = identifierKey(ident.kind, ident.value);
    const now = Date.now();

    const open = await RecoveryRequestModel.findOne({
      identifierKey: key,
      type: 'password_reset',
      status: { $in: OPEN_STATUSES },
    }).sort({ createdAt: -1 });
    if (open) {
      return res.json({ success: true, reference: open.reference, message: NEUTRAL_MESSAGE });
    }

    const recent = await RecoveryRequestModel.find({
      identifierKey: key,
      type: 'password_reset',
      createdAt: { $gt: now - 24 * 60 * 60 * 1000 },
    }).sort({ createdAt: -1 });
    if (recent.length >= DAILY_REQUEST_CAP) {
      return res.json({ success: true, reference: recent[0].reference, message: NEUTRAL_MESSAGE });
    }

    const user = await UserModel.findOne(
      ident.kind === 'phone' ? { phone: ident.value, role: 'worker' } : { loginId: ident.value, role: 'worker' }
    );

    const reference = generateReference();
    await RecoveryRequestModel.create({
      id: crypto.randomUUID(),
      reference,
      type: 'password_reset',
      status: user ? 'pending' : 'no_match',
      userId: user ? user.id : null,
      identifierKey: key,
      identifierKind: ident.kind,
      createdAt: now,
      updatedAt: now,
      expireAt: user ? null : new Date(now + DECOY_RETENTION_MS),
    });

    if (user) {
      await addAuditLog('anonymous', 'recovery_requested', 'user', user.id, null, { reference });
      await sendNotification('admin', 'verification', 'Password recovery request', `A worker requested password help (ref ${reference}). Review it under Recovery Requests.`);
    }

    res.json({ success: true, reference, message: NEUTRAL_MESSAGE });
  } catch (err) {
    console.error('recovery/request error:', err);
    res.status(500).json({ error: 'Request failed. Please try again.' });
  }
});

// 2. Coarse status for a reference number the requester already holds.
router.get('/status', recoveryLookupLimiter, async (req: Request, res: Response) => {
  try {
    const ref = String(req.query.reference || '').trim().toUpperCase();
    if (!/^NOW-[A-Z2-9]{10}$/.test(ref)) return res.status(400).json({ error: 'Invalid reference number' });
    const r = await RecoveryRequestModel.findOne({ reference: ref });
    if (!r) return res.status(404).json({ error: 'Reference number not found' });
    let st = r.status as RecoveryStatus;
    if (st === 'link_issued' && (r.tokenExpiresAt || 0) <= Date.now()) st = 'expired';
    res.json({ status: publicStatus(st) });
  } catch (err) {
    console.error('recovery/status error:', err);
    res.status(500).json({ error: 'Could not check status.' });
  }
});

function readToken(body: any): string | null {
  const t = body?.token;
  return typeof t === 'string' && t.length >= 20 && t.length <= 200 ? t : null;
}

// 3. Is this reset link still usable? (lets the reset page show a clear message before typing a password)
router.post('/check', recoveryLookupLimiter, async (req: Request, res: Response) => {
  try {
    const token = readToken(req.body);
    if (!token) return res.json({ valid: false, reason: 'invalid' });
    const rec = await RecoveryRequestModel.findOne({ tokenHash: hashResetToken(token), type: 'password_reset' });
    const verdict = evaluateResetToken(rec as any, Date.now());
    res.json(verdict.ok ? { valid: true } : { valid: false, reason: verdict.reason });
  } catch (err) {
    console.error('recovery/check error:', err);
    res.status(500).json({ error: 'Could not check the link.' });
  }
});

// 4. Complete the reset. The token is consumed with ONE atomic update, so
// two simultaneous submissions can never both succeed.
router.post('/reset', recoveryResetLimiter, async (req: Request, res: Response) => {
  try {
    const token = readToken(req.body);
    const { newPassword, confirmPassword } = req.body || {};
    if (!token) return res.status(400).json({ error: 'This reset link is not valid.', reason: 'invalid' });

    const pw = validateNewPassword(newPassword, confirmPassword === undefined ? '' : confirmPassword);
    if (!pw.ok) return res.status(400).json({ error: pw.error, field: pw.field });

    const hash = hashResetToken(token);
    const now = Date.now();
    const consumed = await RecoveryRequestModel.findOneAndUpdate(
      { tokenHash: hash, type: 'password_reset', status: 'link_issued', tokenUsedAt: null, tokenExpiresAt: { $gt: now } },
      { $set: { tokenUsedAt: now, status: 'completed', completedAt: now, updatedAt: now } },
      { new: true }
    );

    if (!consumed) {
      const rec = await RecoveryRequestModel.findOne({ tokenHash: hash });
      const verdict = evaluateResetToken(rec as any, now);
      const reason = verdict.ok ? 'invalid' : verdict.reason;
      const msg =
        reason === 'used' ? 'This reset link has already been used.'
        : reason === 'expired' ? 'This reset link has expired. Please ask the administrator for a new one.'
        : 'This reset link is not valid.';
      return res.status(400).json({ error: msg, reason });
    }

    const revert = () =>
      RecoveryRequestModel.updateOne({ id: consumed.id }, { $set: { tokenUsedAt: null, status: 'link_issued', completedAt: null } }).catch(() => {});

    const user = consumed.userId ? await UserModel.findOne({ id: consumed.userId, role: 'worker' }) : null;
    if (!user) {
      await revert();
      return res.status(400).json({ error: 'This reset link is not valid.', reason: 'invalid' });
    }

    try {
      await UserModel.updateOne(
        { id: user.id },
        { $set: { passwordHash: hashPassword(newPassword), failedLoginCount: 0, lockedUntil: null, lastFailedAt: null, updatedAt: new Date().toISOString() } }
      );
    } catch (e) {
      await revert();
      throw e;
    }

    await bumpTokenVersion(user.id); // signs out every existing session
    // Any other outstanding link for this account is now void.
    await RecoveryRequestModel.updateMany(
      { userId: user.id, type: 'password_reset', status: 'link_issued', id: { $ne: consumed.id } },
      { $set: { status: 'expired', tokenHash: null, tokenExpiresAt: null, updatedAt: now } }
    );
    await addAuditLog(user.loginId || user.id, 'password_reset_admin_assisted', 'user', user.id, null, { reference: consumed.reference });

    res.json({ success: true, message: 'Your password has been changed. You can now log in with your new password.' });
  } catch (err) {
    console.error('recovery/reset error:', err);
    res.status(500).json({ error: 'Reset failed. Please try again.' });
  }
});

export default router;
