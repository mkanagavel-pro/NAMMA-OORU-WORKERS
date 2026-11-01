// This module used to be a JSON-file-backed in-memory store (data/db.json).
// It is now a thin set of MongoDB/Mongoose-backed helpers. Route files
// import the models directly (server/models/*.ts) for their own CRUD; this
// file keeps the small set of CROSS-CUTTING helpers that many routes share
// (audit logging, notifications, OTP security, session revocation, distance
// math, and periodic maintenance) so their behavior stays identical to
// before, just backed by real persistence instead of a JSON file.
//
// The original JSON-based implementation is preserved at
// server/db.ts.old-json-backup for reference during the migration.

import crypto from 'crypto';
import { AuditLogModel } from './models/AuditLog';
import { NotificationModel } from './models/Notification';
import { OtpModel } from './models/Otp';
import { UserModel } from './models/User';
import { WorkerModel } from './models/Worker';
import { WarningModel } from './models/Warning';
import { SuspensionModel } from './models/Suspension';

// ---------- Pure geo helpers (unchanged from the original implementation) ----------

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function getDistanceCategory(distanceKm: number): 'Nearby' | 'Moderate distance' | 'Far' {
  if (distanceKm <= 7) return 'Nearby';
  if (distanceKm <= 20) return 'Moderate distance';
  return 'Far';
}

// ---------- Audit logging ----------

export async function addAuditLog(
  actor: string,
  action: string,
  entity: string,
  targetId: string,
  oldValue: any = null,
  newValue: any = null
) {
  await AuditLogModel.create({
    id: crypto.randomUUID(),
    actor,
    action,
    entity,
    targetId,
    oldValue,
    newValue,
    timestamp: new Date().toISOString(),
  });
  // Old records aren't deleted here anymore (the 500-cap used to be
  // enforced by popping the in-memory array). Admin's GET /audit-logs
  // already returns only the most recent 500, sorted newest-first, so the
  // full history is preserved in the database and just not all served at
  // once - a strict improvement over silently discarding old audit history.
}

// ---------- Notifications (in-app + simulated email inbox) ----------

export async function sendNotification(
  recipientId: string,
  type: 'suspension' | 'appeal' | 'warning' | 'verification' | 'system',
  title: string,
  message: string,
  isEmail = false
) {
  await NotificationModel.create({
    id: crypto.randomUUID(),
    recipientId,
    type,
    title,
    message,
    read: false,
    isEmail,
    createdAt: new Date().toISOString(),
  });
}

// ---------- OTP security ----------
// Hashed storage, brute-force attempt limit, and a resend cooldown. A TTL
// index on the Otp model (see server/models/Otp.ts) also garbage-collects
// expired records automatically at the database level.

const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 45 * 1000;
const OTP_TTL_MS = 15 * 60 * 1000;

export function hashOtp(otp: string): string {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

export async function createOtp(email: string, purpose: string, otp: string) {
  const normalizedEmail = email.toLowerCase();
  // A new OTP always invalidates any previous one for this email/purpose.
  await OtpModel.deleteMany({ email: normalizedEmail, purpose });
  const now = Date.now();
  await OtpModel.create({
    email: normalizedEmail,
    purpose,
    otpHash: hashOtp(otp),
    expiresAt: now + OTP_TTL_MS,
    attempts: 0,
    createdAt: now,
    expireAt: new Date(now + OTP_TTL_MS),
  });
}

export async function verifyAndConsumeOtp(
  email: string,
  purpose: string,
  submitted: string
): Promise<{ ok: boolean; reason?: string }> {
  const normalizedEmail = email.toLowerCase();
  const record = await OtpModel.findOne({ email: normalizedEmail, purpose });

  if (!record) return { ok: false, reason: 'No active verification code found. Please request a new one.' };

  if ((record.attempts || 0) >= OTP_MAX_ATTEMPTS) {
    await OtpModel.deleteMany({ email: normalizedEmail, purpose });
    return { ok: false, reason: 'Too many incorrect attempts. Please request a new code.' };
  }

  if (Date.now() > record.expiresAt) {
    await OtpModel.deleteMany({ email: normalizedEmail, purpose });
    return { ok: false, reason: 'This code has expired. Please request a new one.' };
  }

  const submittedHash = hashOtp((submitted || '').trim());
  const a = Buffer.from(submittedHash, 'hex');
  const b = Buffer.from(record.otpHash, 'hex');
  const matches = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!matches) {
    record.attempts = (record.attempts || 0) + 1;
    await record.save();
    return { ok: false, reason: 'Invalid code. Please check and re-enter.' };
  }

  await OtpModel.deleteMany({ email: normalizedEmail, purpose });
  return { ok: true };
}

export async function isOtpResendOnCooldown(email: string, purpose: string): Promise<boolean> {
  const record = await OtpModel.findOne({ email: email.toLowerCase(), purpose });
  if (!record || !record.createdAt) return false;
  return Date.now() - record.createdAt < OTP_RESEND_COOLDOWN_MS;
}

// ---------- Session revocation ----------

export async function bumpTokenVersion(userId: string) {
  await UserModel.updateOne({ id: userId }, { $inc: { tokenVersion: 1 } });
}

// ---------- Periodic maintenance ----------
// Auto-expires suspensions whose endDate has passed, and resets a worker's
// active warning count after 6 clean months. Called on an interval from
// server.ts (see setInterval there).

export async function runPeriodicMaintenance() {
  const now = new Date();

  // 1) Auto-expire suspensions
  const activeSuspensions = await SuspensionModel.find({ status: 'active' });
  for (const susp of activeSuspensions) {
    const endDate = new Date(susp.endDate);
    const remainingDays = Math.ceil((endDate.getTime() - now.getTime()) / 86400000);

    if (endDate.getTime() <= now.getTime()) {
      susp.status = 'expired';
      susp.updatedAt = now.toISOString();
      await susp.save();

      await WorkerModel.updateOne(
        { id: susp.workerId },
        { isSuspended: false, availability: 'Available', suspensionInfo: null, updatedAt: now.toISOString() }
      );

      await sendNotification(
        susp.workerId,
        'suspension',
        'Suspension Ended - Account Active',
        'Your suspension period has ended. Your account is now Available again.',
        true
      );
      await sendNotification(
        susp.workerId,
        'suspension',
        'Suspension Ended - Account Active',
        'Your suspension period has ended. Your account is now Available again.',
        false
      );
    } else {
      // Keep the embedded worker.suspensionInfo.remainingDays snapshot fresh
      // for the dashboard (no live hour/minute countdown, per business rules).
      await WorkerModel.updateOne(
        { id: susp.workerId, isSuspended: true },
        { 'suspensionInfo.remainingDays': Math.max(0, remainingDays) }
      );
    }
  }

  // 2) Reset active warning counts after 6 clean months
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const workersWithWarnings = await WorkerModel.find({ warningCount: { $gt: 0 } });
  for (const worker of workersWithWarnings) {
    const activeWarnings = await WarningModel.find({ workerId: worker.id, active: true });
    if (activeWarnings.length === 0) continue;

    const mostRecent = activeWarnings.reduce((latest: number, w: any) => {
      const t = new Date(w.issuedAt).getTime();
      return t > latest ? t : latest;
    }, 0);

    if (mostRecent <= sixMonthsAgo.getTime()) {
      const oldCount = worker.warningCount;
      await WarningModel.updateMany(
        { workerId: worker.id, active: true },
        { active: false, resetAt: now.toISOString() }
      );
      await WorkerModel.updateOne({ id: worker.id }, { warningCount: 0, updatedAt: now.toISOString() });

      await addAuditLog('System', 'warnings_clean_reset', 'worker', worker.id, { warningCount: oldCount }, { warningCount: 0 });
      await sendNotification(
        worker.id,
        'warning',
        'Active Warnings Reset',
        'Your 6-month clean record has been reached. Your active warning count has reset to 0.',
        false
      );
    }
  }
}
