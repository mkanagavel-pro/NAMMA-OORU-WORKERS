/**
 * Category list (single source of truth), More-Categories helpers, backend validation,
 * AI/dictionary coverage of all 30 categories. No database needed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKER_CATEGORIES, QUICK_CATEGORY_IDS, getQuickCategories, getMoreCategories, isValidCategoryId, filterCategories,
} from '../../src/data/tamilNaduData';
import { CATEGORY_TERMS, matchOccupations } from '../services/occupationDictionary';
import { parseSearchQuery, searchWorkers, getEnabledDistricts, matchesFilter, buildFilter, type SearchRepo, type SearchFilter } from '../services/workerSearch';
import { buildSystemInstruction, validateGeminiOutput } from '../services/aiSearch';

const ORIGINAL_14 = [
  'Electrician', 'Plumber', 'Carpenter', 'Painter', 'Mason / Builder', 'AC & Appliance Tech', 'Two / Four Wheeler Mechanic',
  'Welder & Fabrication', 'House Cleaning & Maid', 'Gardener & Landscaper', 'Driver (Personal / Commercial)',
  'CCTV & Security Tech', 'Tailor & Stitching', 'Pest Control',
];
const NEW_16 = [
  'Mobile Phone Repair', 'Computer / Laptop Repair', 'Washing Machine Repair', 'Refrigerator Repair', 'RO Water Purifier Service',
  'Solar Panel Installation', 'Tile / Flooring Worker', 'Plastering Worker', 'Borewell / Water Pump Technician',
  'House Shifting / Packers', 'Cook / Home Cook', 'Laundry / Ironing Service', 'Beautician', 'Photographer / Videographer',
  'Tuition Teacher', 'Purohitar / Ayyar (Pooja Services)',
];

test('exactly 30 categories: the original 14 unchanged and in order, then the 16 new ones', () => {
  assert.equal(WORKER_CATEGORIES.length, 30);
  assert.deepEqual(WORKER_CATEGORIES.slice(0, 14).map((c) => c.nameEn), ORIGINAL_14);
  assert.deepEqual(WORKER_CATEGORIES.slice(14).map((c) => c.nameEn), NEW_16);
});
test('ids and English / Tamil labels are unique and non-empty (no duplicates)', () => {
  const ids = new Set(WORKER_CATEGORIES.map((c) => c.id));
  assert.equal(ids.size, 30);
  assert.equal(new Set(WORKER_CATEGORIES.map((c) => c.nameEn.toLowerCase())).size, 30);
  assert.equal(new Set(WORKER_CATEGORIES.map((c) => c.nameTa)).size, 30);
  for (const c of WORKER_CATEGORIES) {
    assert.match(c.id, /^[a-z][a-z0-9_]*$/);
    assert.ok(c.nameEn.trim() && c.nameTa.trim() && c.iconName);
  }
});
test('original category ids were not renamed (existing workers keep working)', () => {
  assert.deepEqual(WORKER_CATEGORIES.slice(0, 14).map((c) => c.id), [
    'electrician', 'plumber', 'carpenter', 'painter', 'mason', 'ac_appliance', 'mechanic', 'welder', 'cleaning', 'gardener',
    'driver', 'cctv_tech', 'tailor', 'pest_control',
  ]);
});
test('quick bar = Electrician, Plumber, Mason / Builder, Carpenter; "More Categories" = every other category', () => {
  assert.deepEqual(QUICK_CATEGORY_IDS, ['electrician', 'plumber', 'mason', 'carpenter']);
  assert.deepEqual(getQuickCategories().map((c) => c.nameEn), ['Electrician', 'Plumber', 'Mason / Builder', 'Carpenter']);
  const more = getMoreCategories();
  assert.equal(more.length, 26); // 10 remaining existing + 16 new
  assert.equal(more.filter((c) => ORIGINAL_14.includes(c.nameEn)).length, 10);
  assert.equal(more.filter((c) => NEW_16.includes(c.nameEn)).length, 16);
  const quick = new Set<string>(QUICK_CATEGORY_IDS);
  assert.ok(more.every((c) => !quick.has(c.id)));
  assert.equal(new Set([...more.map((c) => c.id), ...QUICK_CATEGORY_IDS]).size, 30);
});
test('category search: immediate, case-insensitive, English or Tamil, "no results" is an empty list', () => {
  const more = getMoreCategories();
  assert.equal(filterCategories(more, '').length, 26);
  assert.deepEqual(filterCategories(more, 'PAINT').map((c) => c.id), ['painter']);
  assert.deepEqual(filterCategories(more, 'repair').map((c) => c.id), ['mobile_repair', 'computer_repair', 'washing_machine', 'refrigerator']);
  assert.ok(filterCategories(more, 'laptop').some((c) => c.id === 'computer_repair'));
  assert.ok(filterCategories(more, '  pooja ').some((c) => c.id === 'purohit'));
  assert.ok(filterCategories(more, 'சமையல்').some((c) => c.id === 'cook'));
  assert.deepEqual(filterCategories(more, 'zzzz-nothing'), []);
  assert.ok(!filterCategories(more, 'electrician').length); // quick-access ones are not in the popup
});
test('backend category validation accepts all 30 ids and rejects everything else', () => {
  for (const c of WORKER_CATEGORIES) assert.equal(isValidCategoryId(c.id), true, c.id);
  for (const bad of ['', 'Electrician', 'astrologer', 'ELECTRICIAN', ' plumber', undefined, null, 5, ['plumber'], { $ne: 'x' }, 'cook ']) {
    assert.equal(isValidCategoryId(bad), false, String(JSON.stringify(bad)));
  }
});
test('customer category filter accepts every new id and still rejects unknown / operator values', () => {
  const en = getEnabledDistricts('salem');
  for (const c of WORKER_CATEGORIES) assert.equal(parseSearchQuery({ category: c.id }, en).ok, true, c.id);
  assert.equal(parseSearchQuery({ category: 'astrologer' }, en).ok, false);
  assert.equal(parseSearchQuery({ category: ['cook'] } as any, en).ok, false);
  assert.equal(parseSearchQuery({ category: { $ne: 'cook' } } as any, en).ok, false);
});
test('a category only returns workers that actually exist: no fake workers for new categories', async () => {
  const data: any[] = [
    { id: 'w1', name: 'Real Cook', category: 'cook', district: 'salem', publicArea: 'A1', serviceAreas: ['A1'], description: '', availability: 'Available', verificationStatus: 'verified', isSuspended: false, ratingSummary: {}, coordinates: { lat: 11.6, lng: 78.1 } },
    { id: 'w2', name: 'Electric', category: 'electrician', district: 'salem', publicArea: 'A1', serviceAreas: ['A1'], description: '', availability: 'Available', verificationStatus: 'verified', isSuspended: false, ratingSummary: {}, coordinates: { lat: 11.6, lng: 78.1 } },
  ];
  const repo: SearchRepo = {
    count: async (f) => data.filter((w) => matchesFilter(f, w)).length,
    findPage: async (f, _s, skip, limit) => data.filter((w) => matchesFilter(f, w)).slice(skip, skip + limit),
    findCandidates: async (f) => data.filter((w) => matchesFilter(f, w)),
  };
  const run = async (category: string) => {
    const p = parseSearchQuery({ category }, getEnabledDistricts('salem')); assert.ok(p.ok);
    return searchWorkers((p as any).params, repo);
  };
  assert.deepEqual((await run('cook')).workers.map((w) => w.id), ['w1']);
  for (const c of WORKER_CATEGORIES.filter((c) => !['cook', 'electrician'].includes(c.id))) {
    const r = await run(c.id);
    assert.equal(r.total, 0, c.id);
    assert.deepEqual(r.workers, []);
  }
});

// ---- AI search / dictionary ----
test('dictionary has terms for every one of the 30 categories and only real ids', () => {
  const ids = new Set(WORKER_CATEGORIES.map((c) => c.id));
  assert.deepEqual(Object.keys(CATEGORY_TERMS).sort(), [...ids].sort());
  for (const [id, terms] of Object.entries(CATEGORY_TERMS)) assert.ok(terms.length >= 5, `${id} has too few synonyms`);
});
const cats = (q: string) => matchOccupations(q).categories;
test('new categories are found from English, Tanglish, Tamil and typos', () => {
  const cases: [string, string][] = [
    ['mobile repair', 'mobile_repair'], ['phone screen replacement', 'mobile_repair'], ['மொபைல் ரிப்பேர்', 'mobile_repair'],
    ['laptop repair', 'computer_repair'], ['லேப்டாப்', 'computer_repair'], ['labtop repair', 'computer_repair'],
    ['washing machine repair', 'washing_machine'], ['வாஷிங் மெஷின்', 'washing_machine'],
    ['fridge repair', 'refrigerator'], ['refrigerater', 'refrigerator'], ['பிரிட்ஜ்', 'refrigerator'],
    ['RO water purifier service', 'ro_purifier'], ['ro service', 'ro_purifier'], ['water purifier', 'ro_purifier'],
    ['solar panel installation', 'solar'], ['சோலார்', 'solar'],
    ['tile work', 'tile_flooring'], ['flooring', 'tile_flooring'], ['டைல்ஸ்', 'tile_flooring'],
    ['plastering', 'plastering'], ['சுவர் பூச்சு', 'plastering'], ['plaster work venum', 'plastering'],
    ['borewell', 'borewell_pump'], ['water pump repair', 'borewell_pump'], ['போர்வெல்', 'borewell_pump'],
    ['packers and movers', 'packers_movers'], ['house shifting', 'packers_movers'], ['வீடு மாற்றம்', 'packers_movers'],
    ['cook venum', 'cook'], ['samayal', 'cook'], ['home cook', 'cook'],
    ['ironing', 'laundry'], ['laundry service', 'laundry'], ['சலவை', 'laundry'],
    ['beautician', 'beautician'], ['bridal makeup', 'beautician'], ['பியூட்டி பார்லர்', 'beautician'],
    ['wedding photographer', 'photographer'], ['videographer', 'photographer'], ['போட்டோகிராபர்', 'photographer'],
    ['tuition teacher', 'tuition_teacher'], ['home tuition', 'tuition_teacher'], ['ட்யூஷன்', 'tuition_teacher'],
    ['purohit', 'purohit'], ['ayyar for pooja', 'purohit'], ['griha pravesam', 'purohit'], ['புரோகிதர்', 'purohit'],
  ];
  for (const [q, id] of cases) assert.deepEqual(cats(q), [id], q);
});
test('terms moved from old categories no longer double-match', () => {
  assert.deepEqual(cats('tile work'), ['tile_flooring']);
  assert.deepEqual(cats('plastering'), ['plastering']);
  assert.deepEqual(cats('fridge'), ['refrigerator']);
  assert.deepEqual(cats('washing machine'), ['washing_machine']);
  assert.deepEqual(cats('ac repair'), ['ac_appliance']);
  assert.deepEqual(cats('koththukar'), ['mason']);
  assert.deepEqual(cats('camera installation'), ['cctv_tech']);
});
test('Gemini vocabulary and validator know all 30 categories', () => {
  const p = buildSystemInstruction();
  for (const c of WORKER_CATEGORIES) assert.ok(p.includes(c.id) && p.includes(c.nameEn), c.id);
  for (const c of WORKER_CATEGORIES) assert.equal(validateGeminiOutput(JSON.stringify({ intent: 'find_worker', categories: [c.id], keywords: [] })).ok, true, c.id);
  assert.equal(validateGeminiOutput(JSON.stringify({ intent: 'find_worker', categories: ['astrologer'], keywords: [] })).ok, false);
});
test('AI categories widen text search only within the normal filters (new category, in-memory repo)', () => {
  const p = parseSearchQuery({ query: 'purohit' }, getEnabledDistricts('salem')) as any;
  p.params.aiCategories = ['purohit'];
  const f = buildFilter(p.params) as SearchFilter;
  assert.equal(matchesFilter(f, { category: 'purohit', district: 'salem', verificationStatus: 'verified', name: 'x', publicArea: 'a', serviceAreas: [], description: '' }), true);
  assert.equal(matchesFilter(f, { category: 'purohit', district: 'chennai', verificationStatus: 'verified', name: 'x', publicArea: 'a', serviceAreas: [], description: '' }), false);
  assert.equal(matchesFilter(f, { category: 'purohit', district: 'salem', verificationStatus: 'rejected', name: 'x', publicArea: 'a', serviceAreas: [], description: '' }), false);
});
