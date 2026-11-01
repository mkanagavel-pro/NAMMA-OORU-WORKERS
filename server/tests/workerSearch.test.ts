/**
 * Unit tests for the worker search service (no database required).
 * Run:  npm test      (tsx --test server/tests/*.test.ts)
 *
 * The in-memory repo below applies the SAME declarative filter + sort spec
 * the Mongo repo uses. The Mongo translation itself is checked structurally
 * here and end-to-end in workerSearch.integration.test.ts (needs MongoDB).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSearchQuery, searchWorkers, buildFilter, toMongoFilter, matchesFilter, rankWorkers,
  dbSortSpec, getEnabledDistricts, describeEnabledDistricts, haversineKm, hasValidCoords,
  type SearchRepo, type SearchParams, type SearchFilter,
} from '../services/workerSearch';
import { WORKER_CATEGORIES, TN_DISTRICTS } from '../../src/data/tamilNaduData';

// ---- fixtures -------------------------------------------------------------
const SALEM = { lat: 11.6643, lng: 78.146 };
let n = 0;
function w(over: any = {}) {
  n += 1;
  return {
    id: `w${String(n).padStart(3, '0')}`,
    name: `Worker ${n}`,
    email: `w${n}@example.com`, phone: '9876543210', userId: `u${n}`, warningCount: 2,
    category: 'electrician', district: 'salem', publicArea: 'Hasthampatti', serviceAreas: ['Hasthampatti'],
    description: 'desc', experience: 3, rate: '₹300', profilePhoto: null,
    availability: 'Available', verificationStatus: 'verified', isSuspended: false,
    ratingSummary: { averageRating: 4, totalRatings: 5, breakdown: {} }, createdAt: '2026-01-01',
    coordinates: { lat: SALEM.lat + 0.01, lng: SALEM.lng + 0.01 },
    location: { type: 'Point', coordinates: [SALEM.lng + 0.01, SALEM.lat + 0.01] },
    ...over,
  };
}
const at = (km: number) => ({ coordinates: { lat: SALEM.lat + km / 111.19, lng: SALEM.lng } });

function sortBySpec(rows: any[], spec: Record<string, 1 | -1>) {
  const get = (o: any, path: string) => path.split('.').reduce((a, k) => a?.[k], o);
  const cmp = (x: any, y: any) => (typeof x === 'string' ? (x < y ? -1 : x > y ? 1 : 0) : (x === y ? 0 : x < y ? -1 : 1));
  return [...rows].sort((a, b) => {
    for (const [k, dir] of Object.entries(spec)) {
      const c = cmp(get(a, k) ?? 0, get(b, k) ?? 0);
      if (c !== 0) return c * dir;
    }
    return 0;
  });
}
function memRepo(data: any[]): SearchRepo {
  const m = (f: SearchFilter) => data.filter((x) => matchesFilter(f, x));
  return {
    count: async (f) => m(f).length,
    findPage: async (f, sort, skip, limit) => sortBySpec(m(f), sort).slice(skip, skip + limit),
    findCandidates: async (f, cap) => m(f).slice(0, cap),
  };
}
function params(q: Record<string, unknown> = {}): SearchParams {
  // Express always delivers query values as strings.
  const qs = Object.fromEntries(Object.entries(q).map(([k, v]) => [k, typeof v === 'number' ? String(v) : v]));
  const r = parseSearchQuery(qs, getEnabledDistricts('salem'));
  assert.ok(r.ok, JSON.stringify(r));
  return (r as any).params;
}
const ids = (r: any) => r.workers.map((x: any) => x.id);

// ---- 1-2. Salem scope / other district excluded ---------------------------
test('1. Salem worker appears in Salem district search', async () => {
  const s = w();
  const r = await searchWorkers(params({ district: 'salem' }), memRepo([s]));
  assert.deepEqual(ids(r), [s.id]);
});
test('1b. default (no district) is restricted to the enabled launch district', async () => {
  const s = w(), c = w({ district: 'chennai' });
  const r = await searchWorkers(params({}), memRepo([s, c]));
  assert.deepEqual(ids(r), [s.id]);
});
test('1c. legacy spellings of the district (case/whitespace) still match', async () => {
  const a = w({ district: ' SALEM ' }), b = w({ district: 'Salem' });
  const r = await searchWorkers(params({}), memRepo([a, b]));
  assert.equal(r.total, 2);
});
test('2. worker from another district is excluded; requesting a not-yet-enabled district returns empty', async () => {
  const s = w(), c = w({ district: 'chennai' });
  const repo = memRepo([s, c]);
  assert.deepEqual(ids(await searchWorkers(params({ district: 'salem' }), repo)), [s.id]);
  const r = await searchWorkers(params({ district: 'chennai' }), repo);
  assert.equal(r.total, 0);
  assert.deepEqual(r.workers, []);
});
test('2b. a future district can be enabled by configuration only', async () => {
  const s = w(), c = w({ district: 'chennai' });
  const p = parseSearchQuery({}, getEnabledDistricts('salem,chennai'));
  assert.ok(p.ok);
  const r = await searchWorkers((p as any).params, memRepo([s, c]));
  assert.equal(r.total, 2);
});
test('ENABLED_DISTRICTS parsing: default Salem, unknown ids ignored, typo never opens the whole state', () => {
  assert.deepEqual(getEnabledDistricts('').map((d) => d.id), ['salem']);
  assert.deepEqual(getEnabledDistricts(undefined as any).map((d) => d.id), ['salem']);
  assert.deepEqual(getEnabledDistricts('nowhere').map((d) => d.id), ['salem']);
  assert.deepEqual(getEnabledDistricts(' Salem , chennai ').map((d) => d.id).sort(), ['chennai', 'salem']);
});

// ---- 3. area --------------------------------------------------------------
test('3. area matches publicArea or a service area; mismatch gives empty', async () => {
  const a = w({ publicArea: 'Fairlands', serviceAreas: ['Fairlands'] });
  const b = w({ publicArea: 'Gugai', serviceAreas: ['Gugai', 'Shevapet'] });
  const repo = memRepo([a, b]);
  assert.deepEqual(ids(await searchWorkers(params({ area: 'fairlands' }), repo)), [a.id]);
  assert.deepEqual(ids(await searchWorkers(params({ area: ' Shevapet ' }), repo)), [b.id]);
  const none = await searchWorkers(params({ area: 'Attur' }), repo);
  assert.equal(none.total, 0);
});

// ---- 4-5. categories ------------------------------------------------------
test('4. every existing category filters correctly (and none were removed)', async () => {
  assert.ok(WORKER_CATEGORIES.length >= 14);
  const workers = WORKER_CATEGORIES.map((c) => w({ category: c.id }));
  const repo = memRepo(workers);
  for (const c of WORKER_CATEGORIES) {
    const r = await searchWorkers(params({ category: c.id }), repo);
    assert.equal(r.total, 1, c.id);
    assert.equal(r.workers[0].category, c.id);
  }
  assert.equal((await searchWorkers(params({ category: 'all' }), repo)).total, WORKER_CATEGORIES.length);
});
test('5. category + district + area combine (AND)', async () => {
  const hit = w({ category: 'plumber', publicArea: 'Gugai', serviceAreas: ['Gugai'] });
  const wrongCat = w({ category: 'painter', publicArea: 'Gugai', serviceAreas: ['Gugai'] });
  const wrongArea = w({ category: 'plumber', publicArea: 'Attur', serviceAreas: ['Attur'] });
  const wrongDistrict = w({ category: 'plumber', district: 'chennai', publicArea: 'Gugai', serviceAreas: ['Gugai'] });
  const r = await searchWorkers(params({ district: 'salem', category: 'plumber', area: 'Gugai' }),
    memRepo([hit, wrongCat, wrongArea, wrongDistrict]));
  assert.deepEqual(ids(r), [hit.id]);
});

// ---- 6-8. availability / distance sorting ---------------------------------
test('6. Available workers rank before Offline (no GPS)', async () => {
  const off = w({ availability: 'Offline' }), on = w({ availability: 'Available' });
  const r = await searchWorkers(params({}), memRepo([off, on]));
  assert.deepEqual(ids(r), [on.id, off.id]);
});
test('7. nearby Available workers rank by increasing distance', async () => {
  const far = w({ ...at(15) }), near = w({ ...at(1) }), mid = w({ ...at(5) });
  const r = await searchWorkers(params({ lat: SALEM.lat, lng: SALEM.lng }), memRepo([far, near, mid]));
  assert.deepEqual(ids(r), [near.id, mid.id, far.id]);
  assert.deepEqual(r.workers.map((x) => x.distanceCategory), ['Nearby', 'Nearby', 'Moderate distance']);
});
test('8. Offline workers stay after Available workers even when closer', async () => {
  const offNear = w({ availability: 'Offline', ...at(0.5) });
  const onFar = w({ availability: 'Available', ...at(30) });
  const r = await searchWorkers(params({ lat: SALEM.lat, lng: SALEM.lng }), memRepo([offNear, onFar]));
  assert.deepEqual(ids(r), [onFar.id, offNear.id]);
});
test('8b. suspended workers always last, even if Available and nearest', async () => {
  const susp = w({ isSuspended: true, availability: 'Available', ...at(0.2) });
  const off = w({ availability: 'Offline', ...at(20) });
  const r = await searchWorkers(params({ lat: SALEM.lat, lng: SALEM.lng }), memRepo([susp, off]));
  assert.deepEqual(ids(r), [off.id, susp.id]);
  assert.equal(r.workers[1].canContact, false);
});
test('7b. equal distances fall back to deterministic order (verified, then id)', async () => {
  const a = w({ ...at(2), verificationStatus: 'pending' }), b = w({ ...at(2) }), c = w({ ...at(2) });
  const r = await searchWorkers(params({ lat: SALEM.lat, lng: SALEM.lng }), memRepo([a, c, b]));
  assert.deepEqual(ids(r), [b.id, c.id, a.id].sort((x, y) => (x === a.id ? 1 : y === a.id ? -1 : x.localeCompare(y))));
});

// ---- 9. radius ------------------------------------------------------------
test('9. workers outside the requested radius are excluded', async () => {
  const inside = w({ ...at(4) }), outside = w({ ...at(12) });
  const r = await searchWorkers(params({ lat: SALEM.lat, lng: SALEM.lng, radius: '10' }), memRepo([inside, outside]));
  assert.deepEqual(ids(r), [inside.id]);
});

// ---- 10. GPS denied -> manual ---------------------------------------------
test('10. without GPS the manual district/area search returns valid results', async () => {
  const a = w({ publicArea: 'Ammapet', serviceAreas: ['Ammapet'] });
  const r = await searchWorkers(params({ district: 'salem', area: 'Ammapet' }), memRepo([a, w()]));
  assert.deepEqual(ids(r), [a.id]);
  assert.equal(r.workers[0].distanceCategory, null);
});

// ---- 11. invalid coords / radius ------------------------------------------
test('11. invalid coordinates and radius are rejected', () => {
  const bad: Record<string, unknown>[] = [
    { lat: '91', lng: '78' }, { lat: '-91', lng: '78' }, { lat: '11', lng: '181' }, { lat: '11', lng: '-181' },
    { lat: 'abc', lng: '78' }, { lat: '11', lng: 'NaN' }, { lat: 'Infinity', lng: '78' }, { lat: '1e3', lng: '78' },
    { lat: '11' }, { lng: '78' },
    { lat: '11', lng: '78', radius: '0' }, { lat: '11', lng: '78', radius: '-5' }, { lat: '11', lng: '78', radius: 'x' },
    { lat: '11', lng: '78', radius: '201' }, { radius: '10' },
  ];
  for (const q of bad) assert.equal(parseSearchQuery(q, getEnabledDistricts('salem')).ok, false, JSON.stringify(q));
  assert.equal(parseSearchQuery({ lat: '11.66', lng: '78.14', radius: '25' }, getEnabledDistricts('salem')).ok, true);
});

// ---- 12. missing coordinates ----------------------------------------------
test('12. workers without valid coordinates never get a fabricated distance / "Nearby"', async () => {
  const noCoords = w({ coordinates: undefined });
  const nullIsland = w({ coordinates: { lat: 0, lng: 0 } });
  const nan = w({ coordinates: { lat: NaN, lng: 78 } });
  const good = w({ ...at(30) });
  const repo = memRepo([noCoords, nullIsland, nan, good]);
  const r = await searchWorkers(params({ lat: SALEM.lat, lng: SALEM.lng }), repo);
  assert.equal(r.workers[0].id, good.id);
  const byId = Object.fromEntries(r.workers.map((x) => [x.id, x.distanceCategory]));
  assert.equal(byId[noCoords.id], null);
  assert.equal(byId[nullIsland.id], null);
  assert.equal(byId[nan.id], null);
  // and they are excluded entirely when a radius is requested
  const rr = await searchWorkers(params({ lat: SALEM.lat, lng: SALEM.lng, radius: '100' }), repo);
  assert.deepEqual(ids(rr), [good.id]);
  assert.equal(hasValidCoords({ lat: 0, lng: 0 }), false);
  assert.equal(hasValidCoords({ lat: 11, lng: 78 }), true);
});

// ---- 13. visibility rules -------------------------------------------------
test('13. rejected hidden; pending visible; suspended visible but last; verified filter works', async () => {
  const ok = w(), pending = w({ verificationStatus: 'pending' }), rejected = w({ verificationStatus: 'rejected' });
  const susp = w({ isSuspended: true });
  const repo = memRepo([rejected, susp, pending, ok]);
  const r = await searchWorkers(params({}), repo);
  assert.ok(!ids(r).includes(rejected.id));
  assert.deepEqual(ids(r), [ok.id, pending.id, susp.id]);
  assert.deepEqual(ids(await searchWorkers(params({ verified: 'true' }), repo)).sort(), [ok.id, susp.id].sort());
  // available=true keeps suspended workers out (existing behaviour)
  assert.ok(!ids(await searchWorkers(params({ available: 'true' }), repo)).includes(susp.id));
});

// ---- 14. pagination / stable sort -----------------------------------------
test('14. pagination: pages are disjoint, complete, correctly ordered, and counts are right', async () => {
  const list: any[] = [];
  for (let i = 0; i < 23; i++) list.push(w({ availability: i % 3 === 0 ? 'Offline' : 'Available', ...at(i + 1) }));
  for (const gps of [false, true]) {
    const base: any = gps ? { lat: SALEM.lat, lng: SALEM.lng } : {};
    const repo = memRepo(list);
    const all = await searchWorkers(params({ ...base, limit: '50' }), repo);
    const seen: string[] = [];
    for (let page = 1; page <= 3; page++) {
      const r = await searchWorkers(params({ ...base, limit: '10', page: String(page) }), repo);
      assert.equal(r.total, 23); assert.equal(r.totalPages, 3);
      assert.equal(r.hasMore, page < 3);
      seen.push(...ids(r));
    }
    assert.equal(new Set(seen).size, 23);
    assert.deepEqual(seen, ids(all), gps ? 'GPS paging matches full ordering' : 'DB paging matches full ordering');
  }
});
test('14b. non-GPS DB sort spec == in-memory ranking (keeps both paths consistent)', () => {
  const list = [w({ availability: 'Offline' }), w({ verificationStatus: 'pending' }), w({ isSuspended: true }),
    w({ ratingSummary: { averageRating: 5, totalRatings: 40 } }), w(), w()];
  for (const mode of ['default', 'rating'] as const) {
    const a = sortBySpec(list, dbSortSpec(mode)).map((x) => x.id);
    const p = params({ sort: mode });
    const b = rankWorkers(list, p).map((x) => x.worker.id);
    assert.deepEqual(a, b, mode);
  }
});
test('14c. page beyond the end returns an empty page, not an error', async () => {
  const r = await searchWorkers(params({ page: '9' }), memRepo([w()]));
  assert.deepEqual(r.workers, []); assert.equal(r.total, 1); assert.equal(r.hasMore, false);
});

// ---- 15. empty ------------------------------------------------------------
test('15. empty result is a genuine empty result', async () => {
  const r = await searchWorkers(params({ category: 'plumber', area: 'Mettur' }), memRepo([w()]));
  assert.deepEqual(r, { total: 0, workers: [], page: 1, pageSize: 24, totalPages: 0, hasMore: false });
  const r2 = await searchWorkers(params({ lat: SALEM.lat, lng: SALEM.lng }), memRepo([]));
  assert.equal(r2.total, 0);
});

// ---- 16. privacy ----------------------------------------------------------
test('16. public results never expose coordinates, phone, email, userId, warnings or internals', async () => {
  const r = await searchWorkers(params({ lat: SALEM.lat, lng: SALEM.lng }), memRepo([w(), w({ ...at(3) })]));
  const forbidden = ['coordinates', 'location', 'phone', 'email', 'userId', 'warningCount', 'distanceKm', 'suspensionInfo', '_id', '__v'];
  for (const wk of r.workers) for (const k of forbidden) assert.ok(!(k in wk), `leaked ${k}`);
  const json = JSON.stringify(r);
  assert.ok(!json.includes('9876543210'));
  assert.ok(!json.includes(String(SALEM.lat + 0.01).slice(0, 8)));
});

// ---- 17. malformed params -------------------------------------------------
test('17. malformed / injection-style parameters are rejected or neutralised', () => {
  const en = getEnabledDistricts('salem');
  const hostile: Record<string, unknown>[] = [
    { category: { $ne: 'x' } }, { category: ['plumber', 'painter'] }, { district: { $regex: '.*' } },
    { district: ['salem', 'chennai'] }, { area: { $gt: '' } }, { available: { $ne: 'false' } },
    { query: ['a', 'b'] }, { lat: ['11'], lng: '78' }, { sort: { $natural: 1 } }, { page: { $gt: 0 } },
    { category: 'plumber; drop' }, { category: '$where' }, { category: '.*' }, { district: '.*' },
    { district: 'salem|chennai' }, { sort: 'hacked' }, { available: 'yes' }, { limit: '1000' },
    { limit: '0' }, { page: '0' }, { page: '-1' }, { page: '1.5' }, { area: 'x'.repeat(61) }, { query: 'x'.repeat(101) },
    { area: 'a\u0000b' },
  ];
  for (const q of hostile) assert.equal(parseSearchQuery(q, en).ok, false, JSON.stringify(q));
});
test('17b. user text can never alter the Mongo filter structure or the district match', () => {
  const p = params({ area: '.*|$where', query: '(a+)+$' });
  const f = toMongoFilter(buildFilter(p)) as any;
  const json = JSON.stringify(f);
  assert.ok(!json.includes('$where'.replace('$', '') + '":') );
  const [districtClause, areaClause, textClause] = f.$and;
  assert.equal(districtClause.district.$regex, '^\\s*(?:salem|சேலம்)\\s*$');
  assert.equal(areaClause.$or[0].publicArea.$regex, '^\\s*\\.\\*\\|\\$where\\s*$');
  assert.equal(textClause.$or[0].name.$regex, '\\(a\\+\\)\\+\\$');
  // only expected top-level operators, each scalar/regex - no user-supplied operator objects
  assert.deepEqual(Object.keys(f).sort(), ['$and', 'verificationStatus']);
});
test('Mongo filter: rejected excluded, verified-only, available-only, bbox', () => {
  const p = params({ available: 'true', category: 'plumber', lat: '11.66', lng: '78.14', radius: '10' });
  const f = toMongoFilter(buildFilter(p)) as any;
  assert.deepEqual(f.verificationStatus, { $ne: 'rejected' });
  assert.equal(f.availability, 'Available'); assert.equal(f.isSuspended, false);
  assert.equal(f.category, 'plumber');
  assert.ok(f['coordinates.lat'].$gte < 11.66 && f['coordinates.lat'].$lte > 11.66);
  assert.ok(f['coordinates.lng'].$gte < 78.14 && f['coordinates.lng'].$lte > 78.14);
  assert.equal((toMongoFilter(buildFilter(params({ verified: 'true' }))) as any).verificationStatus, 'verified');
});
test('bbox never excludes a worker that is actually inside the radius', () => {
  for (const lat of [0.5, 11.66, 40, 70]) for (const km of [1, 10, 100, 200]) {
    const p = params({ lat: String(lat), lng: '78', radius: String(km) });
    const f = buildFilter(p);
    for (let b = 0; b < 360; b += 15) {
      const rad = (b * Math.PI) / 180;
      const dLat = (km * 0.999 * Math.cos(rad)) / 111.19;
      const dLng = (km * 0.999 * Math.sin(rad)) / (111.19 * Math.cos((lat * Math.PI) / 180));
      const wk = w({ coordinates: { lat: lat + dLat, lng: 78 + dLng } });
      if (haversineKm(lat, 78, wk.coordinates.lat, wk.coordinates.lng) <= km) {
        assert.ok(matchesFilter(f, wk), `lat=${lat} km=${km} bearing=${b}`);
      }
    }
  }
});

// ---- config / areas -------------------------------------------------------
test('search-config lists only enabled districts; Salem areas come only from verified data + real workers', () => {
  const cfg = describeEnabledDistricts({ salem: ['Kondalampatti', 'hasthampatti', 'Hasthampatti', 'Salem', ''] }, getEnabledDistricts('salem'));
  assert.equal(cfg.length, 1); assert.equal(cfg[0].id, 'salem');
  assert.equal(cfg[0].taluks.length, 13);
  assert.ok(cfg[0].areas.includes('Kondalampatti'));
  assert.equal(cfg[0].areas.filter((a) => a.toLowerCase() === 'hasthampatti').length, 1, 'case-insensitive dedupe');
  assert.ok(!cfg[0].areas.some((a) => a.toLowerCase() === 'salem'), 'district name itself is not an "area"');
  // districts without a taluk configuration keep their legacy configured towns
  const chennai = describeEnabledDistricts({}, getEnabledDistricts('chennai'))[0];
  assert.ok(chennai.areas.includes('T. Nagar') && chennai.taluks.length === 0);
});
