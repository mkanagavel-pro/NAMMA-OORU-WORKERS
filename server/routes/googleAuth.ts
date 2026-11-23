import express, { Request, Response } from 'express';
import { addAuditLog } from '../db';
import { generateToken, AuthRequest, requireAuth } from '../auth';
import {
  googleStartLimiter,
  googleCallbackLimiter,
  googleExchangeLimiter,
  googleCompleteLimiter,
} from '../middleware/rateLimit';
import { UserModel } from '../models/User';
import { WorkerModel } from '../models/Worker';
import { GoogleAuthStateModel } from '../models/GoogleAuthState';
import { GoogleAuthTicketModel } from '../models/GoogleAuthTicket';
import {
  readGoogleConfig,
  createGoogleClient,
  createPkce,
  buildAuthorizationUrl,
  validateIdTokenPayload,
  decideGoogleSignIn,
  decideGoogleLink,
  bindingCookie,
  parseCookies,
  BINDING_COOKIE,
  sha256Hex,
  randomToken,
  safeEqualHex,
  STATE_TTL_MS,
  TICKET_TTL_MS,
  SESSION_TICKET_TTL_MS,
  type GoogleClient,
  type GoogleConfig,
  type GoogleErrorCode,
  type AccountView,
} from '../services/googleAuth';
import { parseGoogleSignupInput, createGoogleAccount } from '../services/googleSignup';

// "Continue with Google" - OAuth 2.0 authorization-code flow with PKCE, state, nonce and a browser-binding
// cookie. Everything that matters is decided HERE, on the server, from the ID token Google signed:
// nothing the browser sends (email, name, role, Google id) is ever trusted for identity.
//
//   GET  /start      browser -> Google
//   GET  /callback   Google -> server (code+state); server verifies, then redirects to the app with a
//                    one-time ticket in the URL FRAGMENT (#google=...) or an error code (#google-error=...)
//   POST /exchange   app trades a session ticket for the normal session token (or reads a signup ticket)
//   POST /complete   new Google user picks Customer/Worker + gives the details Google cannot supply
//   POST /link/start already signed-in user links Google ("authenticate first" path)
const router = express.Router();
const isProd = process.env.NODE_ENV === 'production';

router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Test hook (sandbox/unit tests inject a fake Google). Production always uses google-auth-library.
let clientFactory: (cfg: GoogleConfig) => GoogleClient = createGoogleClient;
export function __setGoogleClientFactoryForTests(f: ((cfg: GoogleConfig) => GoogleClient) | null) {
  clientFactory = f || createGoogleClient;
}

const view = (u: any): AccountView | null =>
  u ? { id: u.id, role: u.role, status: u.status, emailVerified: u.emailVerified, googleId: u.googleId || null } : null;

const appError = (res: Response, code: GoogleErrorCode) => res.redirect(302, `/#google-error=${code}`);

// ---- state ------------------------------------------------------------------------------------
async function beginFlow(cfg: GoogleConfig, intent: 'login' | 'link', linkUserId?: string) {
  const state = randomToken(32);
  const binding = randomToken(32);
  const nonce = randomToken(24);
  const pkce = createPkce();
  const now = Date.now();
  await GoogleAuthStateModel.create({
    stateHash: sha256Hex(state),
    bindingHash: sha256Hex(binding),
    nonce,
    codeVerifier: pkce.verifier,
    intent,
    linkUserId: linkUserId || null,
    createdAt: now,
    expiresAt: new Date(now + STATE_TTL_MS),
  });
  return { binding, url: buildAuthorizationUrl(cfg, { state, nonce, codeChallenge: pkce.challenge }) };
}

/** Marks the state used (atomically, once) - a replayed or expired state yields null. */
async function consumeState(state: string) {
  return GoogleAuthStateModel.findOneAndUpdate(
    { stateHash: sha256Hex(state), usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: Date.now() } }
  );
}

// ---- tickets ----------------------------------------------------------------------------------
async function createTicket(kind: 'session' | 'signup', p: { userId?: string; sub: string; email: string; name: string }) {
  const raw = randomToken(32);
  const now = Date.now();
  await GoogleAuthTicketModel.create({
    ticketHash: sha256Hex(raw),
    kind,
    userId: p.userId || null,
    googleSub: p.sub,
    email: p.email,
    name: p.name,
    createdAt: now,
    expiresAt: new Date(now + (kind === 'session' ? SESSION_TICKET_TTL_MS : TICKET_TTL_MS)),
  });
  return raw;
}
const validTicketQuery = (raw: string, kind?: 'session' | 'signup') => ({
  ticketHash: sha256Hex(raw),
  usedAt: null,
  expiresAt: { $gt: new Date() },
  ...(kind ? { kind } : {}),
});
const ticketFromBody = (v: unknown): string | null => (typeof v === 'string' && v.length >= 20 && v.length <= 200 ? v : null);
const claimTicket = (raw: string, kind: 'session' | 'signup') =>
  GoogleAuthTicketModel.findOneAndUpdate(validTicketQuery(raw, kind), { $set: { usedAt: Date.now() } });
const releaseTicket = (raw: string) =>
  GoogleAuthTicketModel.updateOne({ ticketHash: sha256Hex(raw) }, { $set: { usedAt: null } }).catch(() => {});

// ---- session payload (same shapes the normal login endpoints return) --------------------------
async function sessionPayload(user: any) {
  const worker = user.role === 'worker' ? await WorkerModel.findOne({ id: user.workerId }) : null;
  const token = generateToken({
    userId: user.id,
    email: user.email || user.loginId || user.id,
    role: user.role,
    workerId: user.workerId || undefined,
    tokenVersion: user.tokenVersion || 1,
  });
  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      loginId: user.loginId || null,
      role: user.role,
      emailVerified: user.emailVerified,
      favourites: user.favourites || [],
      status: user.status,
      workerId: user.workerId || undefined,
      googleLinked: Boolean(user.googleId),
    },
    worker,
  };
}

async function linkGoogle(user: any, sub: string) {
  const now = new Date().toISOString();
  user.googleId = sub;
  if (!user.authProviders.includes('google')) user.authProviders.push('google');
  user.googleLinkedAt = now;
  user.updatedAt = now;
  await user.save();
}

// 0. Is Google sign-in available on this deployment?
router.get('/config', (_req: Request, res: Response) => {
  res.json({ enabled: Boolean(readGoogleConfig()) });
});

// 1. Start: browser -> Google
router.get('/start', googleStartLimiter, async (_req: Request, res: Response) => {
  try {
    const cfg = readGoogleConfig();
    if (!cfg) return appError(res, 'not_configured');
    const { binding, url } = await beginFlow(cfg, 'login');
    res.setHeader('Set-Cookie', bindingCookie(binding, isProd));
    res.redirect(302, url);
  } catch (err) {
    console.error('google/start error:', err);
    appError(res, 'server');
  }
});

// 1b. Start for an ALREADY signed-in user who wants to link Google (the "authenticate first" path).
router.post('/link/start', googleStartLimiter, requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const cfg = readGoogleConfig();
    if (!cfg) return res.status(503).json({ error: 'Google sign-in is not configured on this server', code: 'not_configured' });
    const user = await UserModel.findOne({ id: req.user!.userId });
    if (!user || user.role === 'admin' || user.status === 'restricted') {
      return res.status(403).json({ error: 'This account cannot link a Google account.', code: 'not_allowed' });
    }
    const { binding, url } = await beginFlow(cfg, 'link', user.id);
    res.setHeader('Set-Cookie', bindingCookie(binding, isProd));
    res.json({ url });
  } catch (err) {
    console.error('google/link/start error:', err);
    res.status(500).json({ error: 'Could not start Google linking. Please try again.' });
  }
});

// 2. Callback: Google -> server
router.get('/callback', googleCallbackLimiter, async (req: Request, res: Response) => {
  res.setHeader('Set-Cookie', bindingCookie(null, isProd)); // one use, always cleared
  try {
    const cfg = readGoogleConfig();
    if (!cfg) return appError(res, 'not_configured');

    // state: must exist, be unused, unexpired AND belong to THIS browser (binding cookie).
    const state = typeof req.query.state === 'string' && req.query.state.length <= 200 ? req.query.state : '';
    const binding = parseCookies(req.headers.cookie)[BINDING_COOKIE] || '';
    const rec: any = state ? await consumeState(state) : null; // consumed even if Google reported an error below
    if (!rec || !binding || !safeEqualHex(sha256Hex(binding), rec.bindingHash)) return appError(res, 'state');

    if (typeof req.query.error === 'string') return appError(res, req.query.error === 'access_denied' ? 'cancelled' : 'exchange');
    const code = typeof req.query.code === 'string' && req.query.code.length <= 2048 ? req.query.code : '';
    if (!code) return appError(res, 'exchange');

    const client = clientFactory(cfg);
    let idToken: string;
    try {
      const exchanged = await client.exchangeCode({ code, codeVerifier: rec.codeVerifier });
      if (!exchanged?.idToken) return appError(res, 'exchange');
      idToken = exchanged.idToken; // access/refresh tokens are never kept
    } catch {
      return appError(res, 'exchange');
    }

    let payload: Record<string, any> | null;
    try {
      payload = await client.verifyIdToken(idToken); // signature, issuer, audience, expiry
    } catch {
      return appError(res, 'token');
    }
    const check = validateIdTokenPayload(payload, { clientId: cfg.clientId, nonce: rec.nonce });
    if (!check.ok) return appError(res, check.reason === 'email_unverified' ? 'email_unverified_google' : 'token');
    const { sub, email, name } = check.identity;

    // ---- link (signed-in user) ----
    if (rec.intent === 'link') {
      const current = await UserModel.findOne({ id: rec.linkUserId });
      // The signed-in account must still exist; same outcome decideGoogleLink gives for a missing account.
      if (!current) return appError(res, 'state');
      const owner = await UserModel.findOne({ googleId: sub });
      const d = decideGoogleLink(sub, view(current), view(owner));
      if (d.action !== 'link') return appError(res, d.action === 'error' ? d.code : 'server');
      try {
        await linkGoogle(current, sub);
      } catch (e: any) {
        if (e?.code === 11000) return appError(res, 'google_in_use');
        throw e;
      }
      await addAuditLog(current.email || current.loginId || current.id, 'google_linked', 'auth', current.id);
      return res.redirect(302, '/#google-linked=1');
    }

    // ---- sign in / sign up ----
    const userBySub = await UserModel.findOne({ googleId: sub });
    const userByEmail = userBySub ? null : await UserModel.findOne({ email });
    const d = decideGoogleSignIn(sub, view(userBySub), view(userByEmail));

    if (d.action === 'error') {
      if (d.code === 'not_allowed') await addAuditLog(email, 'google_signin_blocked', 'auth', (userBySub || userByEmail)?.id || '');
      return appError(res, d.code);
    }
    if (d.action === 'signup') {
      const ticket = await createTicket('signup', { sub, email, name });
      return res.redirect(302, `/#google=${ticket}`);
    }
    const user: any = d.action === 'login' ? userBySub : userByEmail;
    if (d.action === 'link') {
      try {
        await linkGoogle(user, sub);
      } catch (e: any) {
        if (e?.code === 11000) return appError(res, 'google_in_use');
        throw e;
      }
      await addAuditLog(user.email || user.id, 'google_linked', 'auth', user.id);
    } else {
      await addAuditLog(user.email || user.loginId || user.id, 'google_login', 'auth', user.id);
    }
    const ticket = await createTicket('session', { userId: user.id, sub, email, name });
    res.redirect(302, `/#google=${ticket}`);
  } catch (err) {
    console.error('google/callback error:', err);
    appError(res, 'server');
  }
});

// 3. Exchange: the app trades the ticket for a session (or reads what a signup ticket is for)
router.post('/exchange', googleExchangeLimiter, async (req: Request, res: Response) => {
  try {
    const raw = ticketFromBody(req.body?.ticket);
    if (!raw) return res.status(400).json({ error: 'This sign-in link is not valid.', code: 'ticket' });
    const peek: any = await GoogleAuthTicketModel.findOne(validTicketQuery(raw));
    if (!peek) return res.status(400).json({ error: 'This sign-in link has expired. Please try again.', code: 'ticket' });

    if (peek.kind === 'signup') {
      // Not consumed: the person still has to fill in the form. Only the e-mail/name Google verified are shown.
      return res.json({ signup: true, email: peek.email, name: peek.name || '' });
    }
    const claimed: any = await claimTicket(raw, 'session');
    if (!claimed) return res.status(400).json({ error: 'This sign-in link has already been used.', code: 'ticket' });
    const user: any = await UserModel.findOne({ id: claimed.userId });
    if (!user || user.role === 'admin' || user.status === 'restricted') {
      return res.status(403).json({ error: 'This account cannot sign in with Google.', code: user?.status === 'restricted' ? 'restricted' : 'not_allowed' });
    }
    res.json(await sessionPayload(user));
  } catch (err) {
    console.error('google/exchange error:', err);
    res.status(500).json({ error: 'Google sign-in failed. Please try again.' });
  }
});

// 4. Complete a Google sign-up (role + the details Google cannot provide)
router.post('/complete', googleCompleteLimiter, async (req: Request, res: Response) => {
  const raw = ticketFromBody(req.body?.ticket);
  try {
    if (!raw) return res.status(400).json({ error: 'This sign-up link is not valid.', code: 'ticket' });
    const peek: any = await GoogleAuthTicketModel.findOne(validTicketQuery(raw, 'signup'));
    if (!peek) return res.status(400).json({ error: 'This sign-up link has expired. Please start again with Google.', code: 'ticket' });

    // Validate everything BEFORE using up the ticket, so a typo never costs the person their Google sign-in.
    const parsed = parseGoogleSignupInput(req.body);
    if (!parsed.ok) return res.status(parsed.status).json({ error: parsed.error, ...(parsed.field ? { field: parsed.field } : {}) });

    const claimed: any = await claimTicket(raw, 'signup');
    if (!claimed) return res.status(400).json({ error: 'This sign-up link has already been used.', code: 'ticket' });

    let result;
    try {
      // Identity comes from the stored, server-verified ticket - never from the request body.
      result = await createGoogleAccount({ sub: claimed.googleSub, email: claimed.email, name: claimed.name || '' }, parsed.value, req.body?.guestFavourites);
    } catch (e) {
      await releaseTicket(raw); // unexpected failure: let the person retry
      throw e;
    }
    if (!result.ok) {
      await releaseTicket(raw); // e.g. User ID taken: pick another and resubmit
      return res.status(result.status).json({ error: result.error, ...(result.field ? { field: result.field } : {}) });
    }
    await addAuditLog(result.user.email, 'google_register', 'auth', result.user.id);
    const session = await sessionPayload(result.user);
    res.status(201).json({
      ...session,
      message:
        result.user.role === 'worker'
          ? 'Worker registered successfully! Your profile is pending admin approval.'
          : 'Account created successfully!',
    });
  } catch (err) {
    console.error('google/complete error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

export default router;