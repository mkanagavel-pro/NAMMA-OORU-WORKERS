/**
 * End-to-end test of GET /api/workers against a REAL MongoDB.
 *
 * Skipped unless TEST_MONGODB_URI is set. SAFETY: refuses to run unless the
 * database name ends with "_test", and only ever touches documents whose id
 * starts with "it-" (created and removed by this file).
 *
 *   TEST_MONGODB_URI="mongodb://127.0.0.1:27017/namma_ooru_test" npm test
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

const URI = process.env.TEST_MONGODB_URI;
const skip = !URI ? 'TEST_MONGODB_URI not set - real-MongoDB integration test skipped' : false;

const SALEM = { lat: 11.6643, lng: 78.146 };
const at = (km: number) => ({ lat: SALEM.lat + km / 111.19, lng: SALEM.lng });
let base = '';
let server: any;
let WorkerModel: any;
let mongoose: any;

function mk(id: string, over: any = {}) {
  const c = over.coordinates ?? at(1);
  return {
    id: `it-${id}`, userId: `it-u-${id}`, name: `IT ${id}`, email: `it-${id}@example.com`, phone: '9876543210',
    category: 'electrician', description: 'integration', experience: 2, rate: '', profilePhoto: null,
    district: 'salem', publicArea: 'Hasthampatti', serviceAreas: ['Hasthampatti'],
    availability: 'Available', verificationStatus: 'verified', isSuspended: false,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    coordinates: c, ...over,
  };
}
const get = async (qs: string) => {
  const r = await fetch(`${base}/api/workers?${qs}`);
  return { status: r.status, body: (await r.json()) as any };
};
const ids = (b: any) => b.workers.map((w: any) => w.id.replace('it-', ''));

before(async () => {
  if (skip) return;
  const dbName = new URL(URI!).pathname.replace('/', '');
  if (!dbName.endsWith('_test')) throw new Error(`Refusing to run: database "${dbName}" must end with _test`);
  process.env.JWT_SECRET ||= 'integration-test-secret-integration-test-secret';
  process.env.ENABLED_DISTRICTS = 'salem';
  mongoose = (await import('mongoose')).default;
  await mongoose.connect(URI!);
  ({ WorkerModel } = await import('../models/Worker'));
  await WorkerModel.init(); // build indexes
  await WorkerModel.deleteMany({ id: /^it-/ });
  const express = (await import('express')).default;
  const workerRoutes = (await import('../routes/workers')).default;
  const app = express();
  app.use('/api/workers', workerRoutes);
  await new Promise<void>((res) => { server = app.listen(0, '127.0.0.1', () => res()); });
  base = `http://127.0.0.1:${server.address().port}`;

  for (const doc of [
    mk('near', { coordinates: at(1) }),
    mk('mid', { coordinates: at(8), category: 'plumber', publicArea: 'Gugai', serviceAreas: ['Gugai'] }),
    mk('far', { coordinates: at(40) }),
    mk('offline-close', { coordinates: at(0.3), availability: 'Offline' }),
    mk('suspended', { coordinates: at(0.1), isSuspended: true }),
    mk('rejected', { verificationStatus: 'rejected' }),
    mk('pending', { verificationStatus: 'pending', coordinates: at(2) }),
    mk('chennai', { district: 'chennai', coordinates: { lat: 13.0827, lng: 80.2707 } }),
    mk('messy-district', { district: '  SALEM ', coordinates: at(3) }),
    mk('t-attur', { taluk: 'attur', publicArea: 'Test Village', serviceAreas: ['Test Village'], coordinates: at(5) }),
    mk('t-omalur', { taluk: 'omalur', publicArea: 'Test Village', serviceAreas: ['Test Village'], coordinates: at(6) }),
  ]) await new WorkerModel(doc).save();
});
after(async () => {
  if (skip) return;
  await WorkerModel.deleteMany({ id: /^it-/ });
  await mongoose.disconnect();
  await new Promise((r) => server.close(r));
});

test('Salem scope, hidden rejected, other district excluded', { skip }, async () => {
  const { body } = await get('limit=50');
  const got = ids(body).filter((i: string) => !i.startsWith('x'));
  assert.ok(got.includes('near') && got.includes('pending') && got.includes('messy-district'));
  assert.ok(!got.includes('chennai') && !got.includes('rejected'));
  assert.equal((await get('district=chennai')).body.total, 0);
});
test('area + category filters', { skip }, async () => {
  assert.deepEqual(ids((await get('area=Gugai')).body), ['mid']);
  assert.deepEqual(ids((await get('category=plumber&area=gugai')).body), ['mid']);
  assert.equal((await get('area=Nowhere')).body.total, 0);
});
test('GPS ordering: Available by distance, then Offline, suspended last; radius enforced', { skip }, async () => {
  const { body } = await get(`lat=${SALEM.lat}&lng=${SALEM.lng}&limit=50`);
  const order = ids(body);
  assert.ok(order.indexOf('near') < order.indexOf('mid') && order.indexOf('mid') < order.indexOf('far'));
  assert.ok(order.indexOf('far') < order.indexOf('offline-close'));
  assert.equal(order[order.length - 1], 'suspended');
  const r = await get(`lat=${SALEM.lat}&lng=${SALEM.lng}&radius=10&limit=50`);
  assert.ok(!ids(r.body).includes('far'));
});
test('validation + injection attempts -> 400', { skip }, async () => {
  for (const qs of ['lat=999&lng=78', 'lat=11&lng=78&radius=-1', 'category[$ne]=x', 'district[$regex]=.*', 'category=nope'])
    assert.equal((await get(qs)).status, 400, qs);
});
test('public response never contains coordinates / phone / email', { skip }, async () => {
  const { body } = await get(`lat=${SALEM.lat}&lng=${SALEM.lng}&limit=50`);
  const s = JSON.stringify(body);
  for (const k of ['coordinates', '"phone"', '"email"', 'userId', 'warningCount', 'distanceKm', '9876543210'])
    assert.ok(!s.includes(k), k);
});
test('pagination is stable across pages', { skip }, async () => {
  const all = ids((await get('limit=50')).body);
  const p1 = ids((await get('limit=3&page=1')).body), p2 = ids((await get('limit=3&page=2')).body);
  assert.deepEqual([...p1, ...p2], all.slice(0, 6));
});

test('taluk filter: only that taluk; legacy workers without a taluk are excluded from taluk search but kept in district search', { skip }, async () => {
  assert.deepEqual(ids((await get('taluk=attur')).body), ['t-attur']);
  assert.deepEqual(ids((await get('taluk=omalur&area=test village')).body), ['t-omalur']);
  assert.equal((await get('taluk=hosur')).status, 400);
  assert.ok(ids((await get('limit=50')).body).includes('near')); // legacy: no taluk, still in district search
});
test('search-config lists 13 official taluks', { skip }, async () => {
  const r = await fetch(`${base}/api/workers/search-config`);
  const j: any = await r.json();
  assert.equal(j.districts[0].taluks.length, 13);
});
