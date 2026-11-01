// Pure, DB-free helpers for worker identity: phone normalization, User ID
// rules, password rules and "what did the user type into the login box".
// Kept free of imports so they are trivially unit-testable and so the exact
// same rules are used by registration, login, profile and recovery.

export const MIN_PASSWORD_LENGTH = 6;
export const MAX_PASSWORD_LENGTH = 128;

/**
 * Normalizes an Indian mobile number to its canonical 10-digit form.
 * Accepts "98765 43210", "+91 98765-43210", "919876543210", "09876543210".
 * Returns null when it is not a plausible Indian mobile number (10 digits,
 * first digit 6-9). This only says the FORMAT is valid - it never means the
 * number is verified or belongs to the person who typed it.
 */
export function normalizeIndianMobile(input: unknown): string | null {
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  let digits = String(input).replace(/[^0-9]/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (!/^[6-9][0-9]{9}$/.test(digits)) return null;
  return digits;
}

/** Canonical stored form for Worker.phone (what customer.ts builds tel:/wa.me links from). */
export function toStoredPhone(normalized: string): string {
  return `+91${normalized}`;
}

export function maskPhone(input: unknown): string {
  const n = normalizeIndianMobile(input);
  if (!n) return '—';
  return `${n.slice(0, 2)}XXXXX${n.slice(7)}`;
}

export const USER_ID_RULE_TEXT =
  'User ID must be 4-20 characters: lowercase letters, numbers, dot or underscore, starting with a letter.';

/** Lower-cases and trims; returns null if it does not satisfy the User ID rules. */
export function normalizeUserId(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const v = input.trim().toLowerCase();
  if (!/^[a-z][a-z0-9._]{3,19}$/.test(v)) return null;
  if (/[._]{2,}/.test(v) || /[._]$/.test(v)) return null;
  return v;
}

export function validateNewPassword(password: unknown, confirm?: unknown): { ok: true } | { ok: false; error: string; field: 'password' | 'confirmPassword' } {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`, field: 'password' };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters`, field: 'password' };
  }
  if (confirm !== undefined && confirm !== password) {
    return { ok: false, error: 'Password and Confirm Password do not match', field: 'confirmPassword' };
  }
  return { ok: true };
}

export type IdentifierKind = 'email' | 'phone' | 'userId';

/**
 * Decides what the login box contained. "@" means email; something that is
 * a plausible phone number (digits/+/spaces/dashes only) means phone;
 * everything else is treated as a User ID. All three resolve to the same
 * single account record in the route.
 */
export function classifyIdentifier(raw: unknown): { kind: IdentifierKind; value: string } | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (!v || v.length > 254) return null;
  if (v.includes('@')) return { kind: 'email', value: v.toLowerCase() };
  if (/^[+0-9][0-9\s\-()+]*$/.test(v)) {
    const n = normalizeIndianMobile(v);
    return n ? { kind: 'phone', value: n } : null;
  }
  const id = normalizeUserId(v);
  return id ? { kind: 'userId', value: id } : null;
}

// ---------- per-account login lockout ----------

export const LOCKOUT_MAX_FAILURES = 8;
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

export interface LockoutState {
  failedLoginCount?: number;
  lockedUntil?: number | null;
  lastFailedAt?: number | null;
}

export function isLockedOut(state: LockoutState, now: number): boolean {
  return typeof state.lockedUntil === 'number' && state.lockedUntil > now;
}

/** Returns the new state after one failed attempt. */
export function registerFailedLogin(state: LockoutState, now: number): Required<LockoutState> {
  const stale = !state.lastFailedAt || now - state.lastFailedAt > LOCKOUT_WINDOW_MS;
  const count = (stale ? 0 : state.failedLoginCount || 0) + 1;
  return {
    failedLoginCount: count >= LOCKOUT_MAX_FAILURES ? 0 : count,
    lockedUntil: count >= LOCKOUT_MAX_FAILURES ? now + LOCKOUT_WINDOW_MS : null,
    lastFailedAt: now,
  };
}
