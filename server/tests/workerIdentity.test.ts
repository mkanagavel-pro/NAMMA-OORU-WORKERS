import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeIndianMobile, toStoredPhone, maskPhone, normalizeUserId, validateNewPassword,
  classifyIdentifier, isLockedOut, registerFailedLogin, LOCKOUT_MAX_FAILURES, LOCKOUT_WINDOW_MS,
} from '../services/workerIdentity';

test('phone normalization: every common spelling maps to the same 10 digits', () => {
  for (const v of ['9876543210', '98765 43210', '+91 98765-43210', '919876543210', '09876543210', '+91-9876543210', 9876543210]) {
    assert.equal(normalizeIndianMobile(v as any), '9876543210', String(v));
  }
});
test('phone normalization rejects bad numbers', () => {
  for (const v of ['', '12345', '5876543210', '98765432101', '+1 415 555 2671', 'abcdefghij', null, undefined, {}, '91987654321']) {
    assert.equal(normalizeIndianMobile(v as any), null, String(v));
  }
});
test('stored phone keeps the +91 prefix customer.ts relies on, and masking hides the middle', () => {
  assert.equal(toStoredPhone('9876543210'), '+919876543210');
  assert.equal(maskPhone('+91 98765 43210'), '98XXXXX210');
  assert.equal(maskPhone('garbage'), '—');
});
test('User ID rules', () => {
  assert.equal(normalizeUserId('  Raja_Mason '), 'raja_mason');
  assert.equal(normalizeUserId('ab'), null);
  assert.equal(normalizeUserId('1raja'), null);
  assert.equal(normalizeUserId('raja mason'), null);
  assert.equal(normalizeUserId('raja..mason'), null);
  assert.equal(normalizeUserId('raja_'), null);
  assert.equal(normalizeUserId('a'.repeat(21)), null);
  assert.equal(normalizeUserId('a'.repeat(20)), 'a'.repeat(20));
  assert.equal(normalizeUserId(null), null);
  assert.equal(normalizeUserId('raja@x.com'), null);
});
test('password: minimum 6, max 128, confirm must match', () => {
  assert.equal(validateNewPassword('12345').ok, false);
  assert.equal(validateNewPassword('123456').ok, true);
  assert.equal(validateNewPassword('x'.repeat(129)).ok, false);
  assert.equal(validateNewPassword(undefined).ok, false);
  const bad = validateNewPassword('123456', '1234567');
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.field, 'confirmPassword');
  assert.equal(validateNewPassword('123456', '123456').ok, true);
  assert.equal(validateNewPassword('123456', '').ok, false);
});
test('login identifier classification: email / phone / userId', () => {
  assert.deepEqual(classifyIdentifier(' Raja@Mail.COM '), { kind: 'email', value: 'raja@mail.com' });
  assert.deepEqual(classifyIdentifier('+91 98765 43210'), { kind: 'phone', value: '9876543210' });
  assert.deepEqual(classifyIdentifier('raja_mason'), { kind: 'userId', value: 'raja_mason' });
  assert.equal(classifyIdentifier('12345'), null); // digits but not a phone
  assert.equal(classifyIdentifier(''), null);
  assert.equal(classifyIdentifier({ $ne: 1 } as any), null); // NoSQL-injection shaped input
  assert.equal(classifyIdentifier('x'.repeat(300)), null);
});
test('different spellings of one phone resolve to the same lookup value', () => {
  const a = classifyIdentifier('98765 43210');
  const b = classifyIdentifier('+91-9876543210');
  assert.deepEqual(a, b);
});
test('lockout: locks after N failures within the window, resets after quiet period', () => {
  let s: any = {};
  const t0 = 1_000_000;
  for (let i = 0; i < LOCKOUT_MAX_FAILURES - 1; i++) {
    s = registerFailedLogin(s, t0 + i);
    assert.equal(isLockedOut(s, t0 + i), false);
  }
  s = registerFailedLogin(s, t0 + 100);
  assert.equal(isLockedOut(s, t0 + 101), true);
  assert.equal(isLockedOut(s, t0 + 100 + LOCKOUT_WINDOW_MS + 1), false);
  // old failures outside the window do not accumulate
  const fresh = registerFailedLogin({ failedLoginCount: 7, lastFailedAt: t0, lockedUntil: null }, t0 + LOCKOUT_WINDOW_MS + 5);
  assert.equal(fresh.failedLoginCount, 1);
  assert.equal(fresh.lockedUntil, null);
});
