import test from 'node:test';
import assert from 'node:assert/strict';
import { planWorkerAuthMigration, makeLoginId } from '../services/workerAuthMigration';
import { normalizeUserId } from '../services/workerIdentity';
import { emailIndexNeedsRebuild } from '../services/authIndexPlan';

const seq = (() => { let i = 0; return () => ((i++ * 7919) % 10000) / 10000; })();

test('plan: assigns unique rule-compliant User IDs and copies unambiguous phones; never touches passwords/emails', () => {
  const users = [
    { id: 'u1', role: 'worker', email: 'a@x.com', workerId: 'w1' },
    { id: 'u2', role: 'worker', email: 'b@x.com', workerId: 'w2' },
    { id: 'u3', role: 'customer', email: 'c@x.com' },
    { id: 'u4', role: 'admin', email: 'd@x.com' },
  ];
  const workers = [{ id: 'w1', phone: '98765 43210' }, { id: 'w2', phone: '+91 91234 56780' }];
  const plan = planWorkerAuthMigration(users as any, workers as any, seq);
  assert.equal(plan.userPatches.length, 2);
  const ids = plan.userPatches.map((p) => p.set.loginId!);
  assert.equal(new Set(ids).size, 2);
  for (const id of ids) assert.equal(normalizeUserId(id), id);
  assert.deepEqual(plan.userPatches.map((p) => p.set.phone), ['9876543210', '9123456780']);
  assert.ok(!plan.userPatches.some((p) => p.userId === 'u3' || p.userId === 'u4'));
  assert.ok(plan.userPatches.every((p) => Object.keys(p.set).every((k) => k === 'loginId' || k === 'phone')));
});
test('plan: duplicate / invalid / missing phones are reported, never guessed', () => {
  const users = [
    { id: 'u1', role: 'worker', workerId: 'w1' },
    { id: 'u2', role: 'worker', workerId: 'w2' },
    { id: 'u3', role: 'worker', workerId: 'w3' },
    { id: 'u4', role: 'worker', workerId: 'w4' },
  ];
  const workers = [
    { id: 'w1', phone: '9876543210' }, { id: 'w2', phone: '+91 98765 43210' },
    { id: 'w3', phone: '12345' }, { id: 'w4', phone: '' },
  ];
  const plan = planWorkerAuthMigration(users as any, workers as any, seq);
  assert.equal(plan.userPatches.filter((p) => p.set.phone).length, 0);
  assert.deepEqual(plan.issues.map((i) => i.kind).sort(), ['phone_duplicate', 'phone_duplicate', 'phone_invalid', 'phone_missing']);
  assert.equal(plan.userPatches.length, 4); // loginIds still assigned so nobody is locked out of the new login form
});
test('plan: a phone already held by another account is not reassigned', () => {
  const users = [
    { id: 'u1', role: 'worker', workerId: 'w1', phone: '9876543210', loginId: 'raja1' },
    { id: 'u2', role: 'worker', workerId: 'w2' },
  ];
  const workers = [{ id: 'w1', phone: '9876543210', phoneVerified: false }, { id: 'w2', phone: '9876543210' }];
  const plan = planWorkerAuthMigration(users as any, workers as any, seq);
  assert.equal(plan.userPatches.find((p) => p.userId === 'u2')!.set.phone, undefined);
  assert.equal(plan.issues[0].kind, 'phone_duplicate');
});
test('plan is idempotent: already-migrated accounts produce no patches', () => {
  const users = [{ id: 'u1', role: 'worker', workerId: 'w1', phone: '9876543210', loginId: 'raja1' }];
  const workers = [{ id: 'w1', phone: '+919876543210', phoneVerified: false }];
  const plan = planWorkerAuthMigration(users as any, workers as any, seq);
  assert.equal(plan.userPatches.length, 0);
  assert.equal(plan.workerPatches.length, 0);
  assert.equal(plan.summary.alreadyMigrated, 1);
});
test('makeLoginId avoids taken ids even when the RNG is stuck', () => {
  const taken = new Set(['worker0000']);
  for (let i = 1; i < 10000; i++) taken.add(`worker${String(i).padStart(4, '0')}`);
  const id = makeLoginId(taken, () => 0);
  assert.ok(!taken.has(id));
  assert.equal(normalizeUserId(id), id);
});
test('index guard recognises the legacy non-partial unique email index only', () => {
  assert.equal(emailIndexNeedsRebuild([{ name: 'email_1', key: { email: 1 }, unique: true }]), true);
  assert.equal(emailIndexNeedsRebuild([{ name: 'email_1', key: { email: 1 }, unique: true, partialFilterExpression: { email: { $type: 'string' } } }]), false);
  assert.equal(emailIndexNeedsRebuild([{ name: 'email_1', key: { email: 1 }, unique: true, sparse: true }]), false);
  assert.equal(emailIndexNeedsRebuild([{ name: 'id_1', key: { id: 1 }, unique: true }]), false);
  assert.equal(emailIndexNeedsRebuild([]), false);
});
