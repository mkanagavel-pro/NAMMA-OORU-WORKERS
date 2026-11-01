import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  readGoogleConfig, createPkce, buildAuthorizationUrl, validateIdTokenPayload, decideGoogleSignIn, decideGoogleLink,
  parseCookies, bindingCookie, BINDING_COOKIE, safeEqualHex,
} from '../services/googleAuth';
import { googleIdIndexNeedsRebuild, emailIndexNeedsRebuild } from '../services/authIndexPlan';

const ENV = { GOOGLE_CLIENT_ID: 'cid.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'shh', GOOGLE_CALLBACK_URL: 'https://namma.example.org/api/auth/google/callback' };

test('config: needs all three variables, https, and the exact callback path', () => {
  assert.ok(readGoogleConfig(ENV));
  for (const k of Object.keys(ENV)) assert.equal(readGoogleConfig({ ...ENV, [k]: '' }), null, `missing ${k}`);
  assert.equal(readGoogleConfig({ ...ENV, GOOGLE_CALLBACK_URL: 'http://namma.example.org/api/auth/google/callback' }), null, 'http not allowed on a real host');
  assert.equal(readGoogleConfig({ ...ENV, GOOGLE_CALLBACK_URL: 'https://namma.example.org/auth/callback' }), null, 'wrong path');
  assert.equal(readGoogleConfig({ ...ENV, GOOGLE_CALLBACK_URL: 'https://namma.example.org/api/auth/google/callback?x=1' }), null, 'query not allowed');
  assert.equal(readGoogleConfig({ ...ENV, GOOGLE_CALLBACK_URL: 'not a url' }), null);
  assert.ok(readGoogleConfig({ ...ENV, GOOGLE_CALLBACK_URL: 'http://localhost:3000/api/auth/google/callback' }), 'http://localhost ok in dev');
  assert.equal(readGoogleConfig({ ...ENV, NODE_ENV: 'production', GOOGLE_CALLBACK_URL: 'http://localhost:3000/api/auth/google/callback' }), null, 'never http in production');
});

test('PKCE pair: S256 challenge matches verifier; every pair is different', () => {
  const a = createPkce(), b = createPkce();
  assert.notEqual(a.verifier, b.verifier);
  assert.ok(a.verifier.length >= 43 && a.verifier.length <= 128);
  assert.equal(a.challenge, crypto.createHash('sha256').update(a.verifier).digest('base64url'));
});

test('authorization URL: code flow, openid email profile, state, nonce, PKCE S256, no offline access', () => {
  const cfg = readGoogleConfig(ENV)!;
  const u = new URL(buildAuthorizationUrl(cfg, { state: 'S', nonce: 'N', codeChallenge: 'C' }));
  assert.equal(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  const q = u.searchParams;
  assert.equal(q.get('response_type'), 'code');
  assert.equal(q.get('client_id'), ENV.GOOGLE_CLIENT_ID);
  assert.equal(q.get('redirect_uri'), ENV.GOOGLE_CALLBACK_URL);
  assert.equal(q.get('scope'), 'openid email profile');
  assert.equal(q.get('state'), 'S'); assert.equal(q.get('nonce'), 'N');
  assert.equal(q.get('code_challenge'), 'C'); assert.equal(q.get('code_challenge_method'), 'S256');
  assert.equal(q.get('access_type'), null, 'no refresh token requested');
  assert.equal(u.toString().includes(ENV.GOOGLE_CLIENT_SECRET), false, 'client secret never goes to the browser');
});

const now = 1_800_000_000;
const good = () => ({ iss: 'https://accounts.google.com', aud: ENV.GOOGLE_CLIENT_ID, exp: now + 600, sub: '1234567890', email: 'Kannan@Example.com', email_verified: true, name: 'S. Kannan', nonce: 'NONCE' });
const chk = (p: any, over: any = {}) => validateIdTokenPayload(p, { clientId: ENV.GOOGLE_CLIENT_ID, nonce: 'NONCE', nowSec: now, ...over });

test('ID token payload: accepts a good token and lower-cases the email', () => {
  const r: any = chk(good());
  assert.equal(r.ok, true);
  assert.deepEqual(r.identity, { sub: '1234567890', email: 'kannan@example.com', name: 'S. Kannan' });
  assert.equal(chk({ ...good(), iss: 'accounts.google.com' }).ok, true, 'both Google issuer spellings');
});

test('ID token payload: rejects wrong issuer, audience, expired, wrong/missing nonce, unverified email, no sub, no email', () => {
  const cases: [string, any, string][] = [
    ['issuer', { ...good(), iss: 'https://evil.example' }, 'issuer'],
    ['audience', { ...good(), aud: 'someone-elses-client-id' }, 'audience'],
    ['expired', { ...good(), exp: now - 1 }, 'expired'],
    ['expired exactly now', { ...good(), exp: now }, 'expired'],
    ['no exp', { ...good(), exp: undefined }, 'expired'],
    ['wrong nonce', { ...good(), nonce: 'OTHER' }, 'nonce'],
    ['missing nonce', { ...good(), nonce: undefined }, 'nonce'],
    ['unverified email', { ...good(), email_verified: false }, 'email_unverified'],
    ['email_verified as string', { ...good(), email_verified: 'true' }, 'email_unverified'],
    ['email_verified missing', { ...good(), email_verified: undefined }, 'email_unverified'],
    ['no sub', { ...good(), sub: '' }, 'no_subject'],
    ['no email', { ...good(), email: undefined }, 'no_email'],
    ['junk email', { ...good(), email: 'not-an-email' }, 'no_email'],
    ['null payload', null, 'malformed'],
  ];
  for (const [label, p, reason] of cases) {
    const r: any = chk(p);
    assert.equal(r.ok, false, label);
    assert.equal(r.reason, reason, label);
  }
  assert.equal(chk({ ...good(), aud: [ENV.GOOGLE_CLIENT_ID, 'other'] }).ok, true, 'aud array containing our id');
  assert.equal(chk({ ...good(), aud: ['other'] }).ok, false);
});

const acct = (o: any = {}) => ({ id: 'u1', role: 'customer' as const, status: 'active', emailVerified: true, googleId: null, ...o });

test('sign-in decision: linked sub logs in; verified email links; unknown email signs up', () => {
  assert.deepEqual(decideGoogleSignIn('S', acct({ googleId: 'S' }), null), { action: 'login', userId: 'u1' });
  assert.deepEqual(decideGoogleSignIn('S', null, acct()), { action: 'link', userId: 'u1' });
  assert.deepEqual(decideGoogleSignIn('S', null, acct({ role: 'worker' })), { action: 'link', userId: 'u1' });
  assert.deepEqual(decideGoogleSignIn('S', null, null), { action: 'signup' });
});

test('sign-in decision: NEVER links an unverified existing account (pre-registration takeover)', () => {
  assert.deepEqual(decideGoogleSignIn('S', null, acct({ emailVerified: false })), { action: 'error', code: 'email_unverified_existing' });
});

test('sign-in decision: administrators can never use Google (log in or be linked)', () => {
  assert.deepEqual(decideGoogleSignIn('S', null, acct({ role: 'admin' })), { action: 'error', code: 'not_allowed' });
  assert.deepEqual(decideGoogleSignIn('S', acct({ role: 'admin', googleId: 'S' }), null), { action: 'error', code: 'not_allowed' });
});

test('sign-in decision: restricted accounts are refused; a different linked Google identity is never overwritten', () => {
  assert.deepEqual(decideGoogleSignIn('S', null, acct({ status: 'restricted' })), { action: 'error', code: 'restricted' });
  assert.deepEqual(decideGoogleSignIn('S', acct({ status: 'restricted', googleId: 'S' }), null), { action: 'error', code: 'restricted' });
  assert.deepEqual(decideGoogleSignIn('S', null, acct({ googleId: 'OTHER' })), { action: 'error', code: 'google_conflict' });
});

test('sign-in decision: when the sub is already linked it wins over a different account with the same email (no duplicates, no re-link)', () => {
  assert.deepEqual(decideGoogleSignIn('S', acct({ id: 'a', googleId: 'S' }), acct({ id: 'b' })), { action: 'login', userId: 'a' });
});

test('link decision (signed-in user): ok, idempotent, conflicts and admins', () => {
  assert.deepEqual(decideGoogleLink('S', acct(), null), { action: 'link', userId: 'u1' });
  assert.deepEqual(decideGoogleLink('S', acct({ googleId: 'S' }), acct({ googleId: 'S' })), { action: 'link', userId: 'u1' }, 're-linking the same Google account is harmless');
  assert.deepEqual(decideGoogleLink('S', acct(), acct({ id: 'other', googleId: 'S' })), { action: 'error', code: 'google_in_use' });
  assert.deepEqual(decideGoogleLink('S', acct({ googleId: 'OLD' }), null), { action: 'error', code: 'google_conflict' });
  assert.deepEqual(decideGoogleLink('S', acct({ role: 'admin' }), null), { action: 'error', code: 'not_allowed' });
  assert.deepEqual(decideGoogleLink('S', acct({ status: 'restricted' }), null), { action: 'error', code: 'restricted' });
  assert.deepEqual(decideGoogleLink('S', null, null), { action: 'error', code: 'state' });
});

test('binding cookie: HttpOnly, SameSite=Lax, scoped path, Secure in production, cleared with Max-Age=0', () => {
  const c = bindingCookie('abc', true);
  assert.ok(c.startsWith(`${BINDING_COOKIE}=abc;`));
  for (const a of ['HttpOnly', 'SameSite=Lax', 'Path=/api/auth/google', 'Secure', 'Max-Age=600']) assert.ok(c.includes(a), a);
  assert.equal(bindingCookie('abc', false).includes('Secure'), false);
  assert.ok(bindingCookie(null, true).includes('Max-Age=0'));
  assert.deepEqual(parseCookies('a=1; now_g_bind=xyz; b=2'), { a: '1', now_g_bind: 'xyz', b: '2' });
  assert.deepEqual(parseCookies(undefined), {});
  assert.equal(safeEqualHex('abc', 'abc'), true); assert.equal(safeEqualHex('abc', 'abd'), false); assert.equal(safeEqualHex('abc', 'ab'), false);
});

test('index plan: legacy sparse googleId index is replaced by the partial unique one; existing good index is left alone', () => {
  assert.equal(googleIdIndexNeedsRebuild([{ name: 'googleId_1', key: { googleId: 1 }, sparse: true }]), true);
  assert.equal(googleIdIndexNeedsRebuild([{ name: 'googleId_1', key: { googleId: 1 }, unique: true, partialFilterExpression: { googleId: { $type: 'string' } } }]), false);
  assert.equal(googleIdIndexNeedsRebuild([]), false);
  assert.equal(emailIndexNeedsRebuild([{ key: { email: 1 }, unique: true }]), true, 'email plan unchanged');
});
