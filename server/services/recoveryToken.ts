import crypto from 'crypto';

// Pure helpers for the admin-assisted password recovery workflow.
// Only the SHA-256 hash of a reset token is ever stored; the raw token
// exists in memory long enough to be returned ONCE to the approving admin.

export const RECOVERY_STATUSES = [
  'pending', // worker asked, admin has not decided
  'no_match', // decoy for an unknown identifier (hidden from admins, shown as "pending" to the requester)
  'approved', // admin verified identity, no link issued yet
  'link_issued', // single-use link generated
  'completed', // password actually reset (set only by the reset endpoint)
  'rejected',
  'expired', // link expired unused
] as const;
export type RecoveryStatus = (typeof RECOVERY_STATUSES)[number];

export const OPEN_STATUSES: RecoveryStatus[] = ['pending', 'no_match', 'approved', 'link_issued'];

export const DEFAULT_RESET_TTL_MINUTES = 30;

export function getResetTtlMinutes(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.RECOVERY_LINK_TTL_MINUTES);
  return Number.isFinite(n) && n >= 5 && n <= 24 * 60 ? Math.floor(n) : DEFAULT_RESET_TTL_MINUTES;
}

export function generateResetToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString('base64url');
  return { raw, hash: hashResetToken(raw) };
}

export function hashResetToken(raw: string): string {
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
export function generateReference(): string {
  const bytes = crypto.randomBytes(10);
  let out = '';
  for (let i = 0; i < 10; i++) out += REF_ALPHABET[bytes[i] % REF_ALPHABET.length];
  return `NOW-${out}`;
}

/** Stable key used to merge duplicate open requests without storing the raw identifier. */
export function identifierKey(kind: string, value: string): string {
  return crypto.createHash('sha256').update(`${kind}:${value}`).digest('hex');
}

const TRANSITIONS: Record<RecoveryStatus, RecoveryStatus[]> = {
  pending: ['approved', 'rejected'],
  no_match: [],
  approved: ['link_issued', 'rejected'],
  link_issued: ['link_issued', 'completed', 'expired', 'rejected'],
  expired: ['link_issued', 'rejected'],
  completed: [],
  rejected: [],
};
export function canTransition(from: RecoveryStatus, to: RecoveryStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** What the (unauthenticated) requester may learn from a reference number. */
export function publicStatus(status: RecoveryStatus): 'pending' | 'approved' | 'completed' | 'rejected' | 'expired' {
  switch (status) {
    case 'pending':
    case 'no_match':
      return 'pending';
    case 'approved':
    case 'link_issued':
      return 'approved';
    default:
      return status;
  }
}

export interface TokenRecord {
  status: string;
  tokenHash?: string | null;
  tokenExpiresAt?: number | null;
  tokenUsedAt?: number | null;
}
export function evaluateResetToken(rec: TokenRecord | null | undefined, now: number): { ok: true } | { ok: false; reason: 'invalid' | 'used' | 'expired' } {
  if (!rec || !rec.tokenHash) return { ok: false, reason: 'invalid' };
  if (rec.tokenUsedAt || rec.status === 'completed') return { ok: false, reason: 'used' };
  if (rec.status !== 'link_issued') return { ok: false, reason: 'invalid' };
  if (!rec.tokenExpiresAt || rec.tokenExpiresAt <= now) return { ok: false, reason: 'expired' };
  return { ok: true };
}

export function getPublicBaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.PUBLIC_APP_URL || env.APP_URL || '';
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

/** The token goes in the URL fragment so it is never sent to servers in Referer or access logs. */
export function buildResetUrl(baseUrl: string, rawToken: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/reset-password#token=${encodeURIComponent(rawToken)}`;
}

/** wa.me needs the international number with no "+" or spaces. */
export function buildWhatsappUrl(normalizedPhone10: string, message: string): string {
  return `https://wa.me/91${normalizedPhone10}?text=${encodeURIComponent(message)}`;
}
