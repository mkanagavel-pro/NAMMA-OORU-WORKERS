/**
 * Location tests: central dataset, registration/profile validation,
 * taluk <-> area mapping, legacy-record audit, and taluk-aware customer search.
 * No database needed. Run: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SALEM_TALUKS, SALEM_AREAS, SALEM_LOCATION_SOURCES, OTHER_AREA_ID, validateLocationDataset,
  getVerifiedAreasForTaluk, formatWorkerLocation, findTaluk, type LocationArea,
} from '../../src/data/salemLocations';
import {
  validateWorkerLocation, sanitizeServiceAreas, classifyWorkerLocation, getRegistrationDistrictIds, cleanAreaText,
} from '../services/workerLocation';
import { parseSearchQuery, searchWorkers, getEnabledDistricts, describeEnabledDistricts, matchesFilter, type SearchRepo, type SearchFilter } from '../services/workerSearch';

// Official names exactly as listed on https://salem.nic.in/tehsil/ (numbered 1-13)
const OFFICIAL_TALUKS = ['Salem', 'Salem West', 'Salem South', 'Yercaud', 'Gangavalli', 'Attur', 'Pethanaickenpalayam', 'Valapady', 'Sankari', 'Edapadi', 'Mettur', 'Omalur', 'Kadayampatti'];

// Test-only fixture areas (NOT real data) to exercise the mapping rules.
const FIX: LocationArea[] = [
  { id: 'fx-a', nameEn: 'Fixture Alpha', type: 'town_panchayat', taluk: 'attur', mappingStatus: 'verified', source: 'test' },
  { id: 'fx-b', nameEn: 'Fixture Beta', type: 'village_panchayat', block: 'Some Block', taluk: 'omalur', mappingStatus: 'verified', source: 'test' },
  { id: 'fx-c', nameEn: 'Fixture Gamma', type: 'village_panchayat', taluk: null, mappingStatus: 'unverified', source: 'test', note: 'taluk not stated by source' },
];
const REG = ['salem'];
const reg = (input: any) => validateWorkerLocation(input, { registrationDistrictIds: REG, areas: FIX });

// ---- central dataset ------------------------------------------------------
test('taluk list equals the 13 official taluks, unique ids, source recorded', () => {
  assert.deepEqual(SALEM_TALUKS.map((t) => t.nameEn), OFFICIAL_TALUKS);
  assert.equal(new Set(SALEM_TALUKS.map((t) => t.id)).size, 13);
  assert.ok(SALEM_TALUKS.every((t) => t.source === 'https://salem.nic.in/tehsil/'));
  assert.equal(findTaluk('salem', 'Salem West')!.id, 'salem-west');
  assert.equal(findTaluk('salem', '  SALEM south ')!.id, 'salem-south');
  assert.equal(findTaluk('salem', 'Chennai'), null);
});
test('shipped dataset is valid; unverified panchayat data is NOT invented', () => {
  assert.deepEqual(validateLocationDataset(), []);
  assert.equal(SALEM_AREAS.filter((a) => a.mappingStatus === 'verified').length, 0);
  assert.equal(SALEM_LOCATION_SOURCES.townPanchayats.status, 'not_imported');
  assert.equal(SALEM_LOCATION_SOURCES.villagePanchayats.status, 'not_imported');
});
test('dataset validator catches duplicates, unknown taluks, and unverified rows carrying a taluk', () => {
  const bad: LocationArea[] = [
    { id: 'x', nameEn: 'One', type: 'town_panchayat', taluk: 'nowhere', mappingStatus: 'verified', source: 's' },
    { id: 'x', nameEn: 'Two', type: 'town_panchayat', taluk: 'attur', mappingStatus: 'verified', source: 's' },
    { id: 'y', nameEn: 'Two', type: 'town_panchayat', taluk: 'attur', mappingStatus: 'verified', source: 's' },
    { id: 'z', nameEn: 'Three', type: 'village_panchayat', taluk: 'attur', mappingStatus: 'unverified', source: 's' },
  ];
  const p = validateLocationDataset(SALEM_TALUKS, bad).join('|');
  assert.match(p, /duplicate area id: x/);
  assert.match(p, /unknown taluk "nowhere"/);
  assert.match(p, /duplicate area name in taluk: Two/);
  assert.match(p, /unverified area "Three" must not carry a taluk/);
});
test('only verified, mapped areas are offered under a taluk', () => {
  assert.deepEqual(getVerifiedAreasForTaluk('attur', FIX).map((a) => a.id), ['fx-a']);
  assert.deepEqual(getVerifiedAreasForTaluk('omalur', FIX).map((a) => a.id), ['fx-b']);
  assert.deepEqual(getVerifiedAreasForTaluk('salem', FIX), []);
});

// ---- registration: district --------------------------------------------------
test('registration is Salem-only: other districts / junk are rejected', () => {
  for (const d of ['chennai', 'Madurai', 'coimbatore', 'tiruchirappalli', 'nowhere', '', '  ', 'salem|chennai', '.*']) {
    const r = reg({ district: d, taluk: 'attur', publicArea: 'Somewhere' });
    assert.equal(r.ok, false, d);
    assert.equal((r as any).field, 'district');
  }
  for (const d of [undefined, null, 5, ['salem'], { $ne: 'x' }]) assert.equal(reg({ district: d, taluk: 'attur', publicArea: 'Abc' }).ok, false);
  assert.equal(reg({ district: 'Salem', taluk: 'attur', publicArea: 'Abc' }).ok, true);
  assert.equal(reg({ district: ' SALEM ', taluk: 'attur', publicArea: 'Abc' }).ok, true);
});
test('enabling more districts in ENABLED_DISTRICTS does not open registration without a taluk config', () => {
  assert.deepEqual(getRegistrationDistrictIds('salem,chennai,madurai'), ['salem']);
  assert.deepEqual(getRegistrationDistrictIds(''), ['salem']);
});

// ---- registration: taluk ---------------------------------------------------
test('taluk is required, must be an official taluk; stored as canonical id', () => {
  assert.equal((reg({ district: 'salem', publicArea: 'Abc' }) as any).field, 'taluk');
  assert.equal((reg({ district: 'salem', taluk: '', publicArea: 'Abc' }) as any).field, 'taluk');
  for (const t of ['Chennai', 'Hosur', 'attur; drop', { $ne: 1 }, ['attur'], 7]) {
    assert.equal((reg({ district: 'salem', taluk: t, publicArea: 'Abc' }) as any).field, 'taluk', JSON.stringify(t));
  }
  const ok = reg({ district: 'salem', taluk: 'Salem West', publicArea: 'Abc' });
  assert.ok(ok.ok); assert.equal((ok as any).location.taluk, 'salem-west'); assert.equal((ok as any).location.district, 'salem');
});

// ---- registration: area + taluk mapping --------------------------------------
test('listed area must belong to the selected taluk (manipulated ids rejected)', () => {
  const good = reg({ district: 'salem', taluk: 'attur', areaId: 'fx-a' });
  assert.ok(good.ok); assert.deepEqual((good as any).location, { district: 'salem', taluk: 'attur', areaId: 'fx-a', publicArea: 'Fixture Alpha' });
  // area from a different taluk, unverified area, unknown id, wrong types
  for (const id of ['fx-b', 'fx-c', 'nope', 7, ['fx-a'], { $ne: 1 }]) {
    const r = reg({ district: 'salem', taluk: 'attur', areaId: id, publicArea: 'Whatever' });
    assert.equal(r.ok, false, JSON.stringify(id)); assert.equal((r as any).field, 'area');
  }
  // client-supplied publicArea cannot override a listed area's name
  const o = reg({ district: 'salem', taluk: 'attur', areaId: 'fx-a', publicArea: 'Hacked Name' });
  assert.equal((o as any).location.publicArea, 'Fixture Alpha');
});
test('manual "Other area in this taluk" works and is stored with areaId=null', () => {
  for (const id of [undefined, null, '', OTHER_AREA_ID]) {
    const r = reg({ district: 'salem', taluk: 'edapadi', areaId: id, publicArea: '  My   Village  ' });
    assert.ok(r.ok); assert.deepEqual((r as any).location, { district: 'salem', taluk: 'edapadi', areaId: null, publicArea: 'My Village' });
  }
  // Tamil text is allowed
  assert.ok(reg({ district: 'salem', taluk: 'edapadi', publicArea: 'எடப்பாடி' }).ok);
});
test('area is required and safe; manual text cannot dodge the mapping', () => {
  for (const a of [undefined, '', ' ', 'x', 'a'.repeat(61), '<script>alert(1)</script>', '{"$ne":1}', 'a$b', 'x\u0000y', 5, ['a'], { $gt: '' }]) {
    const r = reg({ district: 'salem', taluk: 'attur', publicArea: a });
    assert.equal(r.ok, false, JSON.stringify(a)); assert.equal((r as any).field, 'area');
  }
  // manual text equal to a verified area of ANOTHER taluk is refused...
  const r = reg({ district: 'salem', taluk: 'attur', publicArea: 'fixture beta' });
  assert.equal(r.ok, false); assert.match((r as any).error, /different taluk/);
  // ...and equal to a verified area of the SAME taluk is normalised to the listed entry
  const s = reg({ district: 'salem', taluk: 'attur', publicArea: 'fixture alpha' });
  assert.deepEqual((s as any).location, { district: 'salem', taluk: 'attur', areaId: 'fx-a', publicArea: 'Fixture Alpha' });
  assert.equal(cleanAreaText('Ok Place'), 'Ok Place');
});
test('service areas: sanitised, deduped, always includes the primary area, capped', () => {
  assert.deepEqual(sanitizeServiceAreas(undefined, 'Main'), { ok: true, value: ['Main'] });
  assert.deepEqual(sanitizeServiceAreas('Aa, Bb , aa,, main', 'Main'), { ok: true, value: ['Main', 'Aa', 'Bb'] });
  assert.deepEqual(sanitizeServiceAreas(['Xx', 'Yy'], 'Main'), { ok: true, value: ['Main', 'Xx', 'Yy'] });
  for (const bad of ['<b>x</b>', ['ok', '$where'], 5, { a: 1 }]) assert.equal(sanitizeServiceAreas(bad as any, 'Main').ok, false);
  assert.equal(sanitizeServiceAreas(Array.from({ length: 12 }, (_, i) => `Area ${i}`), 'Main').ok, false);
});

// ---- legacy workers (no guessing) ---------------------------------------------
test('legacy records are classified, never auto-assigned a taluk', () => {
  const c = (w: any) => classifyWorkerLocation(w, { registrationDistrictIds: REG, areas: FIX });
  assert.equal(c({ district: 'salem', taluk: 'attur', publicArea: 'Abc', areaId: null }).status, 'complete');
  assert.equal(c({ district: 'salem', taluk: 'attur', publicArea: 'Fixture Alpha', areaId: 'fx-a' }).status, 'complete');
  // free-text area that merely LOOKS like a taluk is not turned into a taluk
  assert.equal(c({ district: 'salem', publicArea: 'Attur' }).status, 'missing_taluk');
  assert.equal(c({ district: 'salem', taluk: null, publicArea: 'Mettur' }).status, 'missing_taluk');
  assert.equal(c({ district: 'salem', taluk: 'Attur', publicArea: 'Abc' }).status, 'invalid_taluk'); // must be the canonical id
  assert.equal(c({ district: 'salem', taluk: 'hosur', publicArea: 'Abc' }).status, 'invalid_taluk');
  assert.equal(c({ district: 'salem', taluk: 'attur', publicArea: '' }).status, 'area_missing');
  assert.equal(c({ district: 'salem', taluk: 'attur', publicArea: 'Fixture Beta', areaId: 'fx-b' }).status, 'area_mismatch');
  assert.equal(c({ district: 'madurai', publicArea: 'Anna Nagar' }).status, 'district_not_launch');
  assert.equal(c({ district: 'Narnia', publicArea: 'X' }).status, 'district_unrecognized');
  // the only safe auto-fix is district spelling
  assert.deepEqual(c({ district: ' SALEM ', publicArea: 'X' }).safeFix, { district: 'salem' });
  assert.equal(c({ district: 'salem', publicArea: 'X' }).safeFix, null);
});
test('formatWorkerLocation flags incomplete (legacy) records for the admin panel', () => {
  assert.deepEqual(formatWorkerLocation({ district: 'salem', taluk: 'salem-west', publicArea: 'Abc' }), { district: 'salem', taluk: 'Salem West', area: 'Abc', complete: true });
  assert.equal(formatWorkerLocation({ district: 'salem', publicArea: 'Abc' }).complete, false);
  assert.equal(formatWorkerLocation({ district: 'salem', taluk: 'bogus', publicArea: 'Abc' }).complete, false);
});

// ---- customer search against stored location data -----------------------------
let n = 0;
const SALEM = { lat: 11.6643, lng: 78.146 };
function w(over: any = {}) {
  n++;
  return {
    id: `l${String(n).padStart(3, '0')}`, name: `W${n}`, category: 'electrician', district: 'salem', taluk: 'attur',
    publicArea: 'Abc', areaId: null, serviceAreas: ['Abc'], description: '', experience: 1, rate: '', profilePhoto: null,
    availability: 'Available', verificationStatus: 'verified', isSuspended: false,
    ratingSummary: { averageRating: 0, totalRatings: 0, breakdown: {} }, createdAt: 'x',
    coordinates: { lat: SALEM.lat + 0.01 * n, lng: SALEM.lng }, phone: '9', email: 'a@b.c', ...over,
  };
}
const repo = (data: any[]): SearchRepo => {
  const m = (f: SearchFilter) => data.filter((x) => matchesFilter(f, x));
  return { count: async (f) => m(f).length, findPage: async (f, _s, skip, limit) => m(f).slice(skip, skip + limit), findCandidates: async (f, cap) => m(f).slice(0, cap) };
};
const P = (q: Record<string, string>) => { const r = parseSearchQuery(q, getEnabledDistricts('salem')); assert.ok(r.ok, JSON.stringify(r)); return (r as any).params; };
const ids = (r: any) => r.workers.map((x: any) => x.id);

test('search by taluk returns only that taluk; legacy (no-taluk) workers stay in district search only', async () => {
  const a = w({ taluk: 'attur' }), o = w({ taluk: 'omalur' }), legacy = w({ taluk: null }), legacy2 = w({ taluk: undefined });
  const data = [a, o, legacy, legacy2];
  assert.deepEqual(ids(await searchWorkers(P({ taluk: 'attur' }), repo(data))), [a.id]);
  assert.deepEqual(ids(await searchWorkers(P({ taluk: 'Omalur' }), repo(data))), [o.id]);
  assert.equal((await searchWorkers(P({ district: 'salem' }), repo(data))).total, 4);
  assert.equal((await searchWorkers(P({ taluk: 'yercaud' }), repo(data))).total, 0);
});
test('taluk + area + category + GPS + availability combine on stored data', async () => {
  const hit = w({ taluk: 'attur', publicArea: 'Village One', serviceAreas: ['Village One'], category: 'plumber', coordinates: { lat: SALEM.lat + 0.02, lng: SALEM.lng } });
  const offline = w({ taluk: 'attur', publicArea: 'Village One', serviceAreas: ['Village One'], category: 'plumber', availability: 'Offline', coordinates: { lat: SALEM.lat + 0.001, lng: SALEM.lng } });
  const other = [w({ taluk: 'omalur', publicArea: 'Village One', category: 'plumber' }), w({ taluk: 'attur', publicArea: 'Village Two', category: 'plumber' }), w({ taluk: 'attur', publicArea: 'Village One', category: 'painter' }), w({ district: 'madurai', taluk: 'attur' })];
  const r = await searchWorkers(P({ taluk: 'attur', area: 'village one', category: 'plumber', lat: String(SALEM.lat), lng: String(SALEM.lng), radius: '25' }), repo([hit, offline, ...other]));
  assert.deepEqual(ids(r), [hit.id, offline.id]); // Available first even though Offline is closer
  assert.equal((await searchWorkers(P({ taluk: 'attur', available: 'true' }), repo([hit, offline]))).total, 1);
});
test('invalid / manipulated taluk query values are rejected', () => {
  const en = getEnabledDistricts('salem');
  for (const t of ['hosur', 'attur;x', '.*', 'chennai']) assert.equal(parseSearchQuery({ taluk: t }, en).ok, false, t);
  for (const t of [['attur'], { $ne: 'x' }]) assert.equal(parseSearchQuery({ taluk: t as any }, en).ok, false);
  assert.equal(parseSearchQuery({ taluk: 'all' }, en).ok, true);
});
test('public results expose taluk but still no coordinates/phone/email', async () => {
  const r = await searchWorkers(P({ lat: String(SALEM.lat), lng: String(SALEM.lng) }), repo([w()]));
  assert.equal(r.workers[0].taluk, 'attur');
  const s = JSON.stringify(r);
  for (const k of ['coordinates', '"phone"', '"email"', 'distanceKm', 'areaId']) assert.ok(!s.includes(k), k);
});
test('search-config returns the 13 taluks and never the unofficial legacy town list for Salem', () => {
  const cfg = describeEnabledDistricts({ salem: ['Kondalampatti'] }, getEnabledDistricts('salem'), { attur: ['Village One'], omalur: [] });
  const salem = cfg[0] as any;
  assert.deepEqual(salem.taluks.map((t: any) => t.nameEn), OFFICIAL_TALUKS);
  const attur = salem.taluks.find((t: any) => t.id === 'attur').areas;
  assert.ok(attur.includes('Village One') && attur.includes('Malliakarai'));
  assert.ok(!attur.includes('Suramangalam'), 'another taluk area leaked into Attur');
  assert.ok(salem.areas.includes('Kondalampatti') && salem.areas.includes('Omalur'));
  assert.ok(!salem.areas.includes('Hasthampatti') && !salem.areas.includes('Fairlands'));
});

// ---- taluk -> area dataset (owner-supplied starter list, provisional) --------
import { getSelectableAreasForTaluk, talukCoverage, MIN_AREAS_PER_TALUK, SKIPPED_SOURCE_SECTIONS } from '../../src/data/salemLocations';

test('every one of the 13 taluks has >= 15 distinct areas, all honestly marked provisional', () => {
  const cov = talukCoverage();
  assert.equal(cov.length, 13);
  for (const c of cov) {
    assert.ok(c.distinct >= MIN_AREAS_PER_TALUK, `${c.nameEn} has only ${c.distinct}`);
    assert.equal(c.verified, 0, `${c.nameEn} must not claim verification`);
    assert.equal(c.fullyVerified, false);
  }
  assert.ok(SALEM_AREAS.every((a) => a.mappingStatus === 'provisional' && a.note));
  assert.deepEqual(validateLocationDataset(), []);
});
test('Thalaivasal is not invented as a taluk and its names are not dumped into another taluk', () => {
  assert.equal(findTaluk('salem', 'Thalaivasal'), null);
  assert.ok(SKIPPED_SOURCE_SECTIONS.some((x) => x.name === 'Thalaivasal'));
  const all = SALEM_AREAS.map((a) => a.nameEn);
  for (const n of ['Aragalur', 'Deviyakurichi', 'Sarvoy', 'Veppampoondi']) assert.ok(!all.includes(n), n);
});
test('selected taluk controls the area list; no other taluk\'s areas ever appear', () => {
  for (const t of SALEM_TALUKS) {
    const mine = getSelectableAreasForTaluk(t.id);
    assert.ok(mine.length >= 15);
    assert.ok(mine.every((a) => a.taluk === t.id));
    assert.equal(new Set(mine.map((a) => a.id)).size, mine.length);
  }
  const attur = getSelectableAreasForTaluk('attur').map((a) => a.nameEn);
  assert.ok(attur.includes('Attur') && !attur.includes('Omalur'));
  // same name in two taluks (e.g. Karipatti, Belur) stays separate, with separate ids
  assert.ok(getSelectableAreasForTaluk('salem').some((a) => a.id === 'salem-karipatti'));
  assert.ok(getSelectableAreasForTaluk('valapady').some((a) => a.id === 'valapady-karipatti'));
  assert.ok(!getSelectableAreasForTaluk('sankari').some((a) => a.nameEn === 'Karipatti'));
});
test('registration works for every taluk: first listed area, last listed area, and "Other area in this taluk"', () => {
  for (const t of SALEM_TALUKS) {
    const list = getSelectableAreasForTaluk(t.id);
    for (const a of [list[0], list[list.length - 1]]) {
      const r = validateWorkerLocation({ district: 'salem', taluk: t.id, areaId: a.id });
      assert.equal(r.ok, true, `${t.id}/${a.id}`);
      assert.deepEqual((r as any).location, { district: 'salem', taluk: t.id, areaId: a.id, publicArea: a.nameEn });
    }
    const other = validateWorkerLocation({ district: 'salem', taluk: t.id, areaId: OTHER_AREA_ID, publicArea: 'Gandhi Colony' });
    assert.deepEqual((other as any).location, { district: 'salem', taluk: t.id, areaId: null, publicArea: 'Gandhi Colony' });
    const noText = validateWorkerLocation({ district: 'salem', taluk: t.id, areaId: OTHER_AREA_ID, publicArea: '' });
    assert.equal(noText.ok, false);
  }
});
test('an area id from another taluk is rejected (changing taluk cannot keep a stale area)', () => {
  const r = validateWorkerLocation({ district: 'salem', taluk: 'attur', areaId: 'omalur-omalur' });
  assert.equal(r.ok, false);
  assert.equal((r as any).field, 'area');
  assert.equal(validateWorkerLocation({ district: 'salem', taluk: 'attur', areaId: 'attur-nowhere' }).ok, false);
  assert.equal(validateWorkerLocation({ district: 'salem', taluk: 'attur', areaId: { $ne: 1 } as any }).ok, false);
});
test('typing a listed area name manually resolves to the listed area of the SAME taluk', () => {
  const r = validateWorkerLocation({ district: 'salem', taluk: 'valapady', areaId: OTHER_AREA_ID, publicArea: ' karipatti ' });
  assert.deepEqual((r as any).location.areaId, 'valapady-karipatti');
});
test('legacy audit accepts provisional listed areas as complete', () => {
  const r = classifyWorkerLocation({ district: 'salem', taluk: 'attur', areaId: 'attur-attur', publicArea: 'Attur' });
  assert.equal(r.status, 'complete');
});
