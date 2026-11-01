import crypto from 'crypto';
import { UserModel } from './models/User';
import { hashPassword } from './auth';
import { addAuditLog } from './db';

// Ensures exactly one admin account exists, using MongoDB as the source of
// truth (not a JSON seed file, not frontend code). This is the ONLY startup
// data-creation this server performs - no demo workers, no demo customers,
// no sample ratings/reports/anything. An empty database starts genuinely
// empty except for this one bootstrapped admin.
//
// Production: ADMIN_EMAIL and ADMIN_PASSWORD are REQUIRED. The server
// refuses to start without them rather than falling back to any default
// credential.
//
// Development: if ADMIN_PASSWORD is unset, a random one-time password is
// generated and printed ONCE to the console. It is never written to disk,
// never put in .env.example, and the seeded admin is flagged
// requiresPasswordChange so the frontend can prompt for a change on first
// login (see server/routes/auth.ts admin/login).
export async function ensureAdminBootstrap(): Promise<void> {
  const isProd = process.env.NODE_ENV === 'production';
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@nammaooruworkers.com').toLowerCase();

  const existing = await UserModel.findOne({ role: 'admin' });
  if (existing) {
    return; // an admin already exists in the database - nothing to bootstrap
  }

  let adminPassword = process.env.ADMIN_PASSWORD;
  let generated = false;

  if (!adminPassword) {
    if (isProd) {
      throw new Error(
        'ADMIN_PASSWORD is not set and no admin account exists in the database yet. ' +
        'Refusing to start in production without an explicit admin bootstrap credential. ' +
        'Set ADMIN_EMAIL and ADMIN_PASSWORD in your environment and restart.'
      );
    }
    adminPassword = crypto.randomBytes(12).toString('base64url');
    generated = true;
  }

  const now = new Date().toISOString();
  await UserModel.create({
    id: `user_admin_${crypto.randomUUID().slice(0, 8)}`,
    email: adminEmail,
    passwordHash: hashPassword(adminPassword),
    role: 'admin',
    authProviders: ['local'],
    emailVerified: true,
    favourites: [],
    status: 'active',
    tokenVersion: 1,
    requiresPasswordChange: generated,
    createdAt: now,
    updatedAt: now,
  });

  await addAuditLog('System Bootstrap', 'admin_account_created', 'user', adminEmail, null, { generated });

  if (generated) {
    // eslint-disable-next-line no-console
    console.warn(
      `\n[DEV ONLY] No admin account existed and ADMIN_PASSWORD was not set - created one with a generated one-time password:\n` +
      `  email:    ${adminEmail}\n  password: ${adminPassword}\n` +
      `Set ADMIN_EMAIL / ADMIN_PASSWORD in .env to use fixed credentials instead. ` +
      `You will be prompted to change this password on first login.\n`
    );
  } else {
    console.log(`Admin account bootstrapped for ${adminEmail}`);
  }
}
