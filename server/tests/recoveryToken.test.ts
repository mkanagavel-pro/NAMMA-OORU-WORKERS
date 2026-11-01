import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateResetToken, hashResetToken, generateReference, identifierKey, canTransition, publicStatus,
  evaluateResetToken, buildResetUrl, buildWhatsappUrl, getPublicBaseUrl, getResetTtlMinutes,
} from '../services/recoveryToken';

test('reset token: unpredictable, hash differs from raw, hash is stable', () => {
  const a = generateResetToken();
  const b = generateResetToken();
  assert.notEqual(a.raw, b.raw);
  assert.ok(a.raw.length >= 43);
  assert.notEqual(a.raw, a.hash);
  assert.equal(hashResetToken(a.raw), a.hash);
  assert.ok(!a.hash.includes(a.raw));
});
test('reference numbers look right and do not collide in a large sample', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 5000; i++) {
    const r = generateReference();
    assert.match(r, /^NOW-[A-Z2-9]{10}$/);
    seen.add(r);
  }
  assert.equal(seen.size, 5000);
});
test('identifierKey is deterministic and does not contain the identifier', () => {
  const k = identifierKey('phone', '9876543210');
  assert.equal(k, identifierKey('phone', '9876543210'));
  assert.notEqual(k, identifierKey('userId', '9876543210'));
  assert.ok(!k.includes('9876543210'));
});
test('state machine: completed only reachable from link_issued; no shortcuts', () => {
  assert.equal(canTransition('pending', 'completed'), false);
  assert.equal(canTransition('approved', 'completed'), false);
  assert.equal(canTransition('pending', 'link_issued'), false);
  assert.equal(canTransition('pending', 'approved'), true);
  assert.equal(canTransition('approved', 'link_issued'), true);
  assert.equal(canTransition('link_issued', 'completed'), true);
  assert.equal(canTransition('link_issued', 'link_issued'), true); // regenerate
  assert.equal(canTransition('expired', 'link_issued'), true);
  assert.equal(canTransition('completed', 'link_issued'), false);
  assert.equal(canTransition('rejected', 'approved'), false);
  assert.equal(canTransition('no_match', 'approved'), false);
});
test('public status never reveals decoys', () => {
  assert.equal(publicStatus('no_match'), publicStatus('pending'));
  assert.equal(publicStatus('link_issued'), 'approved');
});
test('token evaluation: valid, expired, used, revoked, invalid', () => {
  const now = 1_000_000;
  const ok = { status: 'link_issued', tokenHash: 'h', tokenExpiresAt: now + 1000, tokenUsedAt: null };
  assert.deepEqual(evaluateResetToken(ok, now), { ok: true });
  assert.deepEqual(evaluateResetToken({ ...ok, tokenExpiresAt: now - 1 }, now), { ok: false, reason: 'expired' });
  assert.deepEqual(evaluateResetToken({ ...ok, tokenExpiresAt: now }, now), { ok: false, reason: 'expired' });
  assert.deepEqual(evaluateResetToken({ ...ok, tokenUsedAt: now - 5 }, now), { ok: false, reason: 'used' });
  assert.deepEqual(evaluateResetToken({ ...ok, status: 'completed' }, now), { ok: false, reason: 'used' });
  assert.deepEqual(evaluateResetToken({ ...ok, status: 'rejected', tokenHash: null }, now), { ok: false, reason: 'invalid' });
  assert.deepEqual(evaluateResetToken({ ...ok, status: 'approved' }, now), { ok: false, reason: 'invalid' });
  assert.deepEqual(evaluateResetToken(null, now), { ok: false, reason: 'invalid' });
});
test('reset URL keeps the token in the fragment; WhatsApp URL is wa.me with an encoded message', () => {
  const u = buildResetUrl('https://example.org/', 'abc-DEF_123');
  assert.equal(u, 'https://example.org/reset-password#token=abc-DEF_123');
  assert.ok(!u.includes('?'));
  const w = buildWhatsappUrl('9876543210', 'Vanakkam! link: ' + u);
  assert.ok(w.startsWith('https://wa.me/919876543210?text='));
  assert.ok(!w.includes(' '));
  assert.equal(decodeURIComponent(w.split('text=')[1]), 'Vanakkam! link: ' + u);
});
test('config: PUBLIC_APP_URL wins over APP_URL, must be http(s); TTL has a safe default and bounds', () => {
  assert.equal(getPublicBaseUrl({ PUBLIC_APP_URL: 'https://a.example/', APP_URL: 'http://localhost:3000' } as any), 'https://a.example');
  assert.equal(getPublicBaseUrl({ APP_URL: 'http://localhost:3000' } as any), 'http://localhost:3000');
  assert.equal(getPublicBaseUrl({ PUBLIC_APP_URL: 'javascript:alert(1)' } as any), null);
  assert.equal(getPublicBaseUrl({} as any), null);
  assert.equal(getResetTtlMinutes({} as any), 30);
  assert.equal(getResetTtlMinutes({ RECOVERY_LINK_TTL_MINUTES: '45' } as any), 45);
  assert.equal(getResetTtlMinutes({ RECOVERY_LINK_TTL_MINUTES: '1' } as any), 30);
  assert.equal(getResetTtlMinutes({ RECOVERY_LINK_TTL_MINUTES: 'abc' } as any), 30);
});
