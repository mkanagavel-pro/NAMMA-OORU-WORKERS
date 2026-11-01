import crypto from 'crypto';

// Pure helpers for "Continue with Google" (OAuth 2.0 authorization-code flow + OpenID Connect).
// No database or network access in here, so every rule below is unit-testable.
//
// Design, in one paragraph: the browser is sent to Google with a random `state`, a `nonce` and a
// PKCE challenge. Google redirects back to GOOGLE_CALLBACK_URL with a `code`. The SERVER (never the
// browser) exchanges the code, verifies the returned ID token (signature, issuer, audience, expiry via
// google-auth-library, plus the nonce and email_verified checks below) and only then decides what
// the Google identity may do. Access/refresh tokens are discarded immediately - only the OpenID
// `sub` (stable Google account id) and the verified email are used.

export const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_CALLBACK_PATH = '/api/auth/google/callback';
export const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
}

/** Returns the config only when all three variables are present AND sane; otherwise null (feature off). */
export function readGoogleConfig(env: Record<string, string | undefined> = process.env): GoogleConfig | null {
  const clientId = (env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (env.GOOGLE_CLIENT_SECRET || '').trim();
  const callbackUrl = (env.GOOGLE_CALLBACK_URL || '').trim();
  if (!clientId || !clientSecret || !callbackUrl) return null;
  let u: URL;
  try {
    u = new URL(callbackUrl);
  } catch {
    return null;
  }
  const isProd = env.NODE_ENV === 'production';
  const localhost = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && localhost && !isProd)) return null; // https only (http allowed for local dev)
  if (u.pathname.replace(/\/+$/, '') !== GOOGLE_CALLBACK_PATH) return null; // the route this server actually serves
  if (u.search || u.hash) return null; // Google requires an exact match; no query/fragment
  return { clientId, clientSecret, callbackUrl: u.origin + GOOGLE_CALLBACK_PATH };
}

export const sha256Hex = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** PKCE (RFC 7636, S256). The verifier stays on the server. */
export function createPkce() {
  const verifier = randomToken(48); // 64 chars, within the 43-128 range
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function buildAuthorizationUrl(
  cfg: GoogleConfig,
  p: { state: string; nonce: string; codeChallenge: string }
): string {
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.callbackUrl,
    response_type: 'code',
    scope: 'openid email profile',
    state: p.state,
    nonce: p.nonce,
    code_challenge: p.codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'select_account', // always let the person choose the Google account
    // No access_type=offline: we never want a refresh token.
  });
  return `${GOOGLE_AUTH_ENDPOINT}?${q.toString()}`;
}

export type TokenCheck =
  | { ok: true; identity: { sub: string; email: string; name: string } }
  | { ok: false; reason: 'issuer' | 'audience' | 'expired' | 'nonce' | 'email_unverified' | 'no_subject' | 'no_email' | 'malformed' };

/**
 * Defence in depth on top of google-auth-library's own verifyIdToken (which already checks the
 * signature against Google's certificates, the audience and the expiry): we re-check issuer,
 * audience, expiry, and additionally the nonce we generated and email_verified.
 */
export function validateIdTokenPayload(
  payload: Record<string, any> | null | undefined,
  opts: { clientId: string; nonce: string; nowSec?: number }
): TokenCheck {
  if (!payload || typeof payload !== 'object') return { ok: false, reason: 'malformed' };
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  if (!GOOGLE_ISSUERS.includes(payload.iss)) return { ok: false, reason: 'issuer' };
  const aud = payload.aud;
  if (!(aud === opts.clientId || (Array.isArray(aud) && aud.includes(opts.clientId)))) return { ok: false, reason: 'audience' };
  if (typeof payload.exp !== 'number' || payload.exp <= now) return { ok: false, reason: 'expired' };
  if (typeof payload.nonce !== 'string' || typeof opts.nonce !== 'string' || !safeEqualHex(payload.nonce, opts.nonce)) {
    return { ok: false, reason: 'nonce' };
  }
  if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255) return { ok: false, reason: 'no_subject' };
  if (typeof payload.email !== 'string' || !payload.email) return { ok: false, reason: 'no_email' };
  // Google sends a real boolean; accept only `true` (never the string "false", never missing).
  if (payload.email_verified !== true) return { ok: false, reason: 'email_unverified' };
  const email = payload.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, reason: 'no_email' };
  const name = typeof payload.name === 'string' ? payload.name.trim().slice(0, 100) : '';
  return { ok: true, identity: { sub: payload.sub, email, name } };
}

// ---------------------------------------------------------------------------------------------
// What may a verified Google identity do? Pure decision, so the rules are easy to test and audit.
// ---------------------------------------------------------------------------------------------
export type GoogleErrorCode =
  | 'cancelled' | 'not_configured' | 'state' | 'exchange' | 'token' | 'email_unverified_google'
  | 'not_allowed' | 'restricted' | 'google_conflict' | 'google_in_use' | 'email_unverified_existing' | 'ticket' | 'server';

export interface AccountView {
  id: string;
  role: 'customer' | 'worker' | 'admin';
  status?: string;
  emailVerified?: boolean;
  googleId?: string | null;
}

export type GoogleDecision =
  | { action: 'login'; userId: string }
  | { action: 'link'; userId: string }
  | { action: 'signup' }
  | { action: 'error'; code: GoogleErrorCode };

/**
 * Sign-in / sign-up via Google.
 *  - The Google `sub` is the primary identity: an account already linked to it just logs in.
 *  - Otherwise a matching VERIFIED email may be linked automatically. An unverified existing account is
 *    never linked (someone could have registered the address first), and an account already linked to a
 *    DIFFERENT Google identity is never overwritten.
 *  - Administrators can never use Google, so an admin email can neither log in nor be linked.
 */
export function decideGoogleSignIn(sub: string, userBySub: AccountView | null, userByEmail: AccountView | null): GoogleDecision {
  if (userBySub) {
    if (userBySub.role === 'admin') return { action: 'error', code: 'not_allowed' };
    if (userBySub.status === 'restricted') return { action: 'error', code: 'restricted' };
    return { action: 'login', userId: userBySub.id };
  }
  if (!userByEmail) return { action: 'signup' };
  if (userByEmail.role === 'admin') return { action: 'error', code: 'not_allowed' };
  if (userByEmail.status === 'restricted') return { action: 'error', code: 'restricted' };
  if (userByEmail.googleId && userByEmail.googleId !== sub) return { action: 'error', code: 'google_conflict' };
  if (!userByEmail.emailVerified) return { action: 'error', code: 'email_unverified_existing' };
  return { action: 'link', userId: userByEmail.id };
}

/** A person who is ALREADY signed in explicitly links a Google account (the "authenticate first" path). */
export function decideGoogleLink(sub: string, current: AccountView | null, userBySub: AccountView | null): GoogleDecision {
  if (!current) return { action: 'error', code: 'state' };
  if (current.role === 'admin') return { action: 'error', code: 'not_allowed' };
  if (current.status === 'restricted') return { action: 'error', code: 'restricted' };
  if (userBySub && userBySub.id !== current.id) return { action: 'error', code: 'google_in_use' };
  if (current.googleId && current.googleId !== sub) return { action: 'error', code: 'google_conflict' };
  return { action: 'link', userId: current.id };
}

// ---------------------------------------------------------------------------------------------
// Binding cookie (login-CSRF defence): the `state` alone is not enough, because an attacker can start a
// flow in THEIR browser and trick a victim into opening the callback URL. The callback therefore also
// requires this HttpOnly cookie, which only the browser that started the flow holds.
// ---------------------------------------------------------------------------------------------
export const BINDING_COOKIE = 'now_g_bind';

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k && !(k in out)) out[k] = part.slice(i + 1).trim();
  }
  return out;
}

export function bindingCookie(value: string | null, secure: boolean): string {
  const attrs = ['Path=/api/auth/google', 'HttpOnly', 'SameSite=Lax']; // Lax: sent on the top-level redirect back from Google
  if (secure) attrs.push('Secure');
  if (value === null) attrs.push('Max-Age=0');
  else attrs.push('Max-Age=600');
  return `${BINDING_COOKIE}=${value ?? ''}; ${attrs.join('; ')}`;
}

export const STATE_TTL_MS = 10 * 60 * 1000;
export const TICKET_TTL_MS = 10 * 60 * 1000; // signup ticket: time to fill in the extra details
export const SESSION_TICKET_TTL_MS = 2 * 60 * 1000; // login hand-over: consumed immediately by the app

// ---------------------------------------------------------------------------------------------
// Network side, behind a tiny interface so tests can inject a fake Google.
// ---------------------------------------------------------------------------------------------
export interface GoogleClient {
  /** Exchange the authorization code. Returns ONLY the id_token; access/refresh tokens are dropped. */
  exchangeCode(p: { code: string; codeVerifier: string }): Promise<{ idToken: string } | null>;
  /** Signature / issuer / audience / expiry verification (google-auth-library). Returns the payload. */
  verifyIdToken(idToken: string): Promise<Record<string, any> | null>;
}

export function createGoogleClient(cfg: GoogleConfig): GoogleClient {
  let clientPromise: Promise<any> | null = null;
  const getClient = () =>
    (clientPromise ||= import('google-auth-library').then(
      ({ OAuth2Client }) => new OAuth2Client(cfg.clientId, cfg.clientSecret, cfg.callbackUrl)
    ));
  return {
    async exchangeCode({ code, codeVerifier }) {
      const client = await getClient();
      const { tokens } = await client.getToken({ code, codeVerifier, redirect_uri: cfg.callbackUrl });
      return tokens?.id_token ? { idToken: tokens.id_token } : null;
    },
    async verifyIdToken(idToken) {
      const client = await getClient();
      const ticket = await client.verifyIdToken({ idToken, audience: cfg.clientId });
      return (ticket.getPayload() as Record<string, any>) || null;
    },
  };
}
