import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { UserModel } from './models/User';

// SECURITY: There is no insecure fallback secret. The server refuses to
// start rather than sign/verify tokens with a guessable, publicly-known
// default. Generate a real secret with:
//   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
// Validation runs once at import time and returns a `string` (never undefined), so the narrowing is
// preserved inside the functions below without any cast or non-null assertion.
function loadJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'JWT_SECRET environment variable is missing or too short (must be at least 32 characters). ' +
      'Refusing to start the server with an insecure signing key. Set JWT_SECRET in your .env file.'
    );
  }
  return secret;
}
const JWT_SECRET: string = loadJwtSecret();

export interface TokenPayload {
  userId: string;
  email: string;
  role: 'customer' | 'worker' | 'admin';
  workerId?: string;
  tokenVersion: number;
  iat: number;
  exp: number;
}

// ---------- Password hashing ----------
// scrypt with a random per-password salt and a timing-safe comparison.
// (Argon2id would need a native/npm dependency - if you add `argon2` to
// package.json this is the one function to swap; the rest of the app only
// calls hashPassword()/verifyPassword() and never touches the raw format.)
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, hash] = storedHash.split(':');
    if (!salt || !hash) return false;
    const testHash = crypto.scryptSync(password, salt, 64).toString('hex');
    const a = Buffer.from(testHash, 'hex');
    const b = Buffer.from(hash, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ---------- JWT (HS256, hand-rolled to avoid an extra dependency) ----------
// tokenVersion is the revocation mechanism: it's stored on the user record
// and stamped into every token. Bumping it (bumpTokenVersion in db.ts)
// instantly invalidates every previously-issued token for that account -
// used on password change, email change, and account deletion/restriction.
export function generateToken(payload: {
  userId: string;
  email: string;
  role: 'customer' | 'worker' | 'admin';
  workerId?: string;
  tokenVersion: number;
}): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days, revocable via tokenVersion
  const iat = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({ ...payload, exp, iat })).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');

    // Timing-safe signature comparison. Different lengths can never be a
    // valid signature, so it's safe to short-circuit on length alone.
    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

    const payload: TokenPayload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export interface AuthRequest extends Request {
  user?: TokenPayload;
}

// Verifies the JWT AND re-checks live account state on every request:
//   - account still exists (deleted accounts lose access immediately)
//   - account is not restricted
//   - tokenVersion still matches (password/email change or admin action
//     invalidates every other outstanding token)
// Role/email/workerId are taken fresh from the DB, never trusted from the
// token payload, so a stale token can't carry an old role forward.
//
// This is async (a real MongoDB lookup) - Express supports async
// middleware fine as long as next() is always eventually called, which the
// try/catch below guarantees even if the DB lookup throws.
export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }
  const token = authHeader.split(' ')[1];
  const payload = verifyToken(token);
  if (!payload) return next();

  try {
    const account = await UserModel.findOne({ id: payload.userId });

    if (!account) return next(); // deleted account - treat as unauthenticated
    if (account.status === 'restricted') return next(); // restricted - no active access
    if ((account.tokenVersion ?? 1) !== payload.tokenVersion) return next(); // revoked session

    req.user = {
      ...payload,
      role: account.role as 'customer' | 'worker' | 'admin',
      // Workers who registered without an email are identified by their User ID here.
      email: account.email || (account as any).loginId || account.id,
      workerId: account.workerId || undefined,
    };
  } catch {
    // If the DB lookup fails for any reason, fail closed (unauthenticated)
    // rather than trusting the raw token payload.
  }
  next();
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

export function requireRole(...roles: Array<'customer' | 'worker' | 'admin'>) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    // Not signed in (or session revoked / account restricted) -> 401.
    // Signed in but the SERVER-side role is not allowed -> 403.
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }
    next();
  };
}