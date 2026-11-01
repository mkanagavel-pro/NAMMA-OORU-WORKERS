/**
 * Tests for the AI-assisted search (dictionary + Gemini adapter), no network.
 * Gemini is replaced by injected fake callers, so timeout / quota / invalid
 * output / missing key paths are all exercised deterministically.
 * Run: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  CATEGORY_TERMS, UNMAPPED_TERMS, matchOccupations, normalizeQuery, editDistance,
} from '../services/occupationDictionary';
import {
  AiSearchService, loadAiConfig, validateGeminiOutput, buildSystemInstruction, classifyError,
  DEFAULT_GEMINI_MODEL, GEMINI_RESPONSE_SCHEMA, describeError, redactSecrets, type GeminiCaller, type AiSearchConfig,
} from '../services/aiSearch';
import {
  parseSearchQuery, searchWorkers, buildFilter, toMongoFilter, matchesFilter, getEnabledDistricts,
  type SearchRepo, type SearchFilter, type SearchParams,
} from '../services/workerSearch';
import { WORKER_CATEGORIES } from '../../src/data/tamilNaduData';

const cats = (q: string) => matchOccupations(q).categories;
const KEY = 'AIzaSy-SECRET-TEST-KEY-123456';

function cfg(over: Partial<AiSearchConfig> = {}): AiSearchConfig {
  return { ...loadAiConfig({ GEMINI_API_KEY: KEY }), cacheTtlMs: 60_000, ...over };
}
const okJson = (categories: string[], keywords: string[] = [], intent = 'find_worker') =>
  JSON.stringify({ intent, categories, keywords });
function svc(caller: GeminiCaller | undefined, over: Partial<AiSearchConfig> = {}, logs: string[] = [], now?: () => number) {
  return new AiSearchService(cfg(over), { caller, log: (m) => logs.push(m), now });
}

// ---------------------------------------------------------------- dictionary
test('dictionary only references real categories (no invented ids)', () => {
  const real = new Set(WORKER_CATEGORIES.map((c) => c.id));
  for (const id of Object.keys(CATEGORY_TERMS)) assert.ok(real.has(id), `unknown category ${id}`);
  for (const id of real) assert.ok(CATEGORY_TERMS[id]?.length, `category ${id} has no terms`);
});

test('required examples: koththukar / kothanar / கொத்தனார் / mason -> mason', () => {
  for (const q of ['koththukar', 'kothanar', 'கொத்தனார்', 'mason', 'Koththukar venum', 'கொத்தனாரை தேடுகிறேன்']) {
    assert.deepEqual(cats(q), ['mason'], q);
  }
});
test('Tamil-script and Tanglish searches', () => {
  assert.deepEqual(cats('மின்சார வேலை'), ['electrician']);
  assert.deepEqual(cats('குழாய் பழுது'), ['plumber']);
  assert.deepEqual(cats('தச்சர்'), ['carpenter']);
  assert.deepEqual(cats('ஏசி ரிப்பேர்'), ['ac_appliance']);
  assert.deepEqual(cats('minsara velai'), ['electrician']);
  assert.deepEqual(cats('thachar venum'), ['carpenter']);
});
test('common typos (case-insensitive, punctuation-insensitive)', () => {
  assert.deepEqual(cats('eletrician'), ['electrician']);
  assert.deepEqual(cats('Electrican'), ['electrician']);
  assert.deepEqual(cats('plumer'), ['plumber']);
  assert.deepEqual(cats('carpanter'), ['carpenter']);
  assert.deepEqual(cats('AC repare'), ['ac_appliance']);
  assert.deepEqual(cats('  Pipe-Leak!! '), ['plumber']);
  assert.deepEqual(cats('painnter'), ['painter']);
});
test('natural-language requests', () => {
  assert.deepEqual(cats('fan repair panna aal venum'), ['electrician']);
  assert.deepEqual(cats('veetukku paint adikka aal venum'), ['painter']);
  assert.deepEqual(cats('bike mechanic venum'), ['mechanic']);
  assert.deepEqual(cats('AC problem'), ['ac_appliance']);
  assert.deepEqual(cats('wood work'), ['carpenter']);
  assert.deepEqual(cats('pipe leak'), ['plumber']);
});
test('longest phrase wins: "ac mechanic" is AC only, not also Mechanic', () => {
  assert.deepEqual(cats('ac mechanic'), ['ac_appliance']);
  assert.deepEqual(cats('car driver venum'), ['driver']);
});
test('multiple plausible categories are all returned (no false certainty)', () => {
  assert.deepEqual(cats('house wiring and pipe leak').sort(), ['electrician', 'plumber']);
});
test('every existing category is reachable by its English and Tamil names', () => {
  for (const c of WORKER_CATEGORIES) {
    const hit = Object.entries(CATEGORY_TERMS).find(([id]) => id === c.id)!;
    assert.ok(hit[1].length >= 3, c.id);
  }
  for (const [q, id] of [['driver', 'driver'], ['tailor', 'tailor'], ['welder', 'welder'], ['gardener', 'gardener'],
    ['cctv', 'cctv_tech'], ['pest control', 'pest_control'], ['painter', 'painter'], ['house cleaning', 'cleaning'],
    ['car mechanic', 'mechanic'], ['டிரைவர்', 'driver'], ['தையல்', 'tailor']] as const) {
    assert.deepEqual(cats(q), [id], q);
  }
});
test('cook is now a real category (Cook / Home Cook); UNMAPPED_TERMS is empty, nothing invented', () => {
  const r = matchOccupations('cook venum');
  assert.deepEqual(r.categories, ['cook']);
  assert.deepEqual(r.unmapped, []);
  assert.ok(r.clear);
  assert.deepEqual(cats('samayal'), ['cook']);
  assert.deepEqual(cats('சமையல்காரர்'), ['cook']);
  assert.equal(Object.keys(UNMAPPED_TERMS).length, 0);
});
test('no false positives on unrelated text / names / filler words', () => {
  for (const q of ['hello', 'murugan', 'printer', 'rate', 'package', 'service venum', 'zzzzzz', '12345']) {
    assert.deepEqual(cats(q), [], q);
  }
  assert.equal(normalizeQuery('  A/C  Repair!! '), 'a c repair');
  assert.equal(editDistance('plumer', 'plumber'), 1);
});

// ---------------------------------------------------------------- validator
test('validator accepts a well-formed answer and de-duplicates', () => {
  const v = validateGeminiOutput(okJson(['plumber', 'plumber'], ['leak', 'leak']));
  assert.deepEqual(v, { ok: true, intent: 'find_worker', categories: ['plumber'], keywords: ['leak'] });
});
test('validator rejects invalid / hostile output', () => {
  const bad: unknown[] = [
    undefined, '', 'not json', '[]', 'null', '"x"', '{"intent":"find_worker"}',
    okJson(['astrologer']), okJson(['PLUMBER']), okJson(['plumber', 'electrician', 'mason', 'painter']),
    JSON.stringify({ intent: 'find_worker', categories: [], keywords: [], extra: 1 }),
    JSON.stringify({ intent: 'hack', categories: [], keywords: [] }),
    JSON.stringify({ intent: 'find_worker', categories: 'plumber', keywords: [] }),
    JSON.stringify({ intent: 'find_worker', categories: [{ $ne: 1 }], keywords: [] }),
    JSON.stringify({ intent: 'find_worker', categories: [], keywords: ['{$where}'] }),
    JSON.stringify({ intent: 'find_worker', categories: [], keywords: ['a'.repeat(31)] }),
    JSON.stringify({ intent: 'find_worker', categories: [], keywords: ['a1', 'b1', 'c1', 'd1', 'e1', 'f1'] }),
    JSON.stringify({ intent: 'find_worker', categories: [], keywords: [], pad: 'x'.repeat(1200) }),
  ];
  for (const b of bad) assert.equal(validateGeminiOutput(b).ok, false, String(b).slice(0, 60));
});

// ---------------------------------------------------------------- config / prompt
test('model id defaults to the verified Flash-Lite id and can be overridden safely', () => {
  assert.equal(DEFAULT_GEMINI_MODEL, 'gemini-3.5-flash-lite');
  assert.equal(loadAiConfig({}).model, DEFAULT_GEMINI_MODEL);
  assert.equal(loadAiConfig({ GEMINI_MODEL: 'gemini-3.1-flash-lite' }).model, 'gemini-3.1-flash-lite');
  assert.equal(loadAiConfig({ GEMINI_MODEL: 'bad model; rm -rf' }).model, DEFAULT_GEMINI_MODEL);
  assert.equal(loadAiConfig({}).apiKey, undefined);
  assert.equal(loadAiConfig({ AI_SEARCH_TIMEOUT_MS: '99999999' }).timeoutMs, 20000);
  assert.equal(loadAiConfig({}).timeoutMs, 8000);
  assert.equal(loadAiConfig({}).fallbackModel, 'gemini-3.1-flash-lite');
  assert.equal(loadAiConfig({ GEMINI_FALLBACK_MODEL: '' }).fallbackModel, '');
});
test('prompt + schema carry only the category vocabulary (no worker data)', () => {
  const p = buildSystemInstruction();
  for (const c of WORKER_CATEGORIES) assert.ok(p.includes(c.id));
  assert.deepEqual((GEMINI_RESPONSE_SCHEMA.properties.categories.items.enum as readonly string[]).slice().sort(),
    WORKER_CATEGORIES.map((c) => c.id).sort());
  assert.ok(!/phone number|e-?mail address|password|token|@/i.test(p));
});

// ---------------------------------------------------------------- service flow
test('clear dictionary match skips Gemini entirely', async () => {
  let calls = 0;
  const s = svc(async () => { calls++; return okJson(['plumber']); });
  const r = await s.resolve('koththukar');
  assert.equal(calls, 0);
  assert.equal(r.source, 'dictionary');
  assert.deepEqual(r.categories, ['mason']);
});
test('ambiguous natural-language phrase goes to Gemini once; only phrase + model are passed', async () => {
  const seen: any[] = [];
  const s = svc(async (phrase, ctx) => { seen.push([phrase, ctx.model, typeof ctx.signal.aborted]); return okJson(['carpenter', 'mason'], ['kitchen']); });
  const r = await s.resolve('Kitchen Shelf Fix Pannanum!');
  assert.equal(r.source, 'ai');
  assert.deepEqual(r.categories, ['carpenter', 'mason']);
  assert.deepEqual(seen, [['kitchen shelf fix pannanum', DEFAULT_GEMINI_MODEL, 'boolean']]);
});
test('identical normalised queries are cached; concurrent ones share one call', async () => {
  let calls = 0;
  const s = svc(async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return okJson(['mason']); });
  const [a, b] = await Promise.all([s.resolve('house building help'), s.resolve('  HOUSE  building help ')]);
  assert.equal(calls, 1);
  assert.deepEqual(a.categories, b.categories);
  const c = await s.resolve('house building help');
  assert.equal(c.source, 'ai_cache');
  assert.equal(calls, 1);
});
test('cache expires after the TTL', async () => {
  let calls = 0, t = 1_000;
  const s = svc(async () => { calls++; return okJson(['mason']); }, { cacheTtlMs: 5_000 }, [], () => t);
  await s.resolve('house building help');
  t += 6_000;
  await s.resolve('house building help');
  assert.equal(calls, 2);
});
test('invalid Gemini output -> safe fallback (no categories, no throw)', async () => {
  const logs: string[] = [];
  const s = svc(async () => 'I am not JSON', {}, logs);
  const r = await s.resolve('something unclear here');
  assert.equal(r.source, 'fallback');
  assert.equal(r.fallbackReason, 'invalid_output');
  assert.deepEqual(r.categories, []);
});
test('unknown category from Gemini is rejected as a whole', async () => {
  const s = svc(async () => okJson(['astronaut']));
  const r = await s.resolve('moon landing help');
  assert.equal(r.fallbackReason, 'invalid_output');
  assert.deepEqual(r.categories, []);
});
test('Gemini timeout: returns within the timeout, falls back, never blocks', async () => {
  const s = svc(() => new Promise(() => { /* never resolves, ignores abort */ }), { timeoutMs: 500 });
  const t0 = Date.now();
  const r = await s.resolve('something unclear here');
  assert.ok(Date.now() - t0 < 1500);
  assert.equal(r.fallbackReason, 'timeout');
});
test('quota error: falls back, and is NOT retried (circuit breaker)', async () => {
  let calls = 0;
  const logs: string[] = [];
  const s = svc(async () => { calls++; const e: any = new Error('429 RESOURCE_EXHAUSTED quota ' + KEY); e.status = 429; throw e; }, {}, logs);
  const a = await s.resolve('first unclear phrase');
  const b = await s.resolve('second unclear phrase');
  const c = await s.resolve('third unclear phrase');
  assert.equal(a.fallbackReason, 'quota');
  assert.equal(b.fallbackReason, 'circuit_open');
  assert.equal(c.fallbackReason, 'circuit_open');
  assert.equal(calls, 1);
  assert.ok(!logs.join('\n').includes(KEY), 'key must never be logged');
  assert.ok(!logs.join('\n').includes('unclear phrase'), 'phrase must not be logged');
});
test('breaker closes again after the cool-down', async () => {
  let calls = 0, t = 1_000;
  const s = svc(async () => { calls++; const e: any = new Error('x'); e.status = 429; throw e; }, {}, [], () => t);
  await s.resolve('first unclear phrase');
  t += 121_000;
  await s.resolve('second unclear phrase');
  assert.equal(calls, 2);
});
test('missing API key: no Gemini call, dictionary + fallback still work', async () => {
  const s = new AiSearchService(loadAiConfig({}), { log: () => {} });
  assert.equal(s.aiAvailable, false);
  assert.equal((await s.resolve('something unclear here')).fallbackReason, 'no_api_key');
  assert.deepEqual((await s.resolve('plumer')).categories, ['plumber']);
});
test('AI_SEARCH_ENABLED=false disables Gemini', async () => {
  let calls = 0;
  const s = new AiSearchService(loadAiConfig({ GEMINI_API_KEY: KEY, AI_SEARCH_ENABLED: 'false' }), { caller: async () => { calls++; return okJson([]); }, log: () => {} });
  assert.equal((await s.resolve('something unclear here')).fallbackReason, 'disabled');
  assert.equal(calls, 0);
});
test('short / non-letter phrases never reach Gemini', async () => {
  let calls = 0;
  const s = svc(async () => { calls++; return okJson([]); });
  assert.equal((await s.resolve('xyz')).fallbackReason, 'too_short');
  assert.equal((await s.resolve('12345678')).fallbackReason, 'no_letters');
  assert.equal(calls, 0);
  // ...but short valid occupation names still work via the dictionary
  assert.deepEqual((await s.resolve('ac')).categories, ['ac_appliance']);
  assert.deepEqual((await s.resolve('கார் ரிப்பேர்')).categories, ['mechanic']);
});
test('per-client rate limit: excess requests fall back, other clients unaffected', async () => {
  let calls = 0;
  const s = svc(async () => { calls++; return okJson([]); }, { perClientPerMinute: 2 });
  const r = [] as any[];
  for (let i = 0; i < 4; i++) r.push(await s.resolve(`unclear phrase number ${'x'.repeat(i + 1)}`, 'ip-A'));
  assert.equal(calls, 2);
  assert.equal(r[2].fallbackReason, 'rate_limited');
  assert.equal((await s.resolve('another unclear phrase', 'ip-B')).source, 'ai');
});
test('Gemini "unclear" intent yields no categories (plain text search)', async () => {
  const s = svc(async () => okJson(['plumber'], ['x1'], 'unclear'));
  const r = await s.resolve('what is the weather');
  assert.deepEqual(r.categories, []);
  assert.deepEqual(r.keywords, []);
});
test('classifyError', () => {
  assert.equal(classifyError({ status: 429 }), 'quota');
  assert.equal(classifyError({ status: 403 }), 'auth');
  assert.equal(classifyError({ name: 'AbortError' }), 'timeout');
  assert.equal(classifyError(new Error('boom')), 'error');
});
test('the API key never appears in service output', async () => {
  const s = svc(async () => okJson(['mason']));
  const out = JSON.stringify([await s.resolve('house building help'), await s.resolve('plumer'), s.cfg.apiKey === KEY]);
  assert.ok(!out.includes(KEY));
});

// ---------------------------------------------------------------- search integration (real filter + in-memory repo)
const SALEM = { lat: 11.6643, lng: 78.146 };
let n = 0;
function w(over: any = {}) {
  n += 1;
  return {
    id: `a${String(n).padStart(3, '0')}`, name: `Worker ${n}`, category: 'electrician', district: 'salem',
    publicArea: 'Hasthampatti', serviceAreas: ['Hasthampatti'], description: 'desc', experience: 3, rate: '₹300',
    profilePhoto: null, availability: 'Available', verificationStatus: 'verified', isSuspended: false,
    phone: '9876543210', email: `a${n}@x.com`,
    ratingSummary: { averageRating: 4, totalRatings: 5, breakdown: {} }, createdAt: '2026-01-01',
    coordinates: { lat: SALEM.lat + 0.01, lng: SALEM.lng + 0.01 }, ...over,
  };
}
const km = (d: number) => ({ coordinates: { lat: SALEM.lat + d / 111.19, lng: SALEM.lng } });
function memRepo(data: any[]): SearchRepo {
  const m = (f: SearchFilter) => data.filter((x) => matchesFilter(f, x));
  return {
    count: async (f) => m(f).length,
    findPage: async (f, _s, skip, limit) => m(f).slice(skip, skip + limit),
    findCandidates: async (f, cap) => m(f).slice(0, cap),
  };
}
async function aiSearch(q: Record<string, string>, data: any[], service = svc(async () => okJson([]))) {
  const parsed = parseSearchQuery(q, getEnabledDistricts('salem'));
  assert.ok(parsed.ok, JSON.stringify(parsed));
  const params = (parsed as any).params as SearchParams;
  if (params.text) {
    const intent = await service.resolve(params.text);
    params.aiCategories = intent.categories;
    params.aiKeywords = intent.keywords;
  }
  return searchWorkers(params, memRepo(data));
}
const ids = (r: any) => r.workers.map((x: any) => x.id);

test('koththukar returns real Mason workers only (and none are fabricated)', async () => {
  const mason = w({ category: 'mason' }), elec = w(), db = [mason, elec];
  const r = await aiSearch({ query: 'koththukar' }, db);
  assert.deepEqual(ids(r), [mason.id]);
  for (const x of r.workers) assert.ok(db.some((d) => d.id === x.id));
});
test('no matching workers in the DB -> empty result, nothing invented', async () => {
  const r = await aiSearch({ query: 'plumer' }, [w({ category: 'mason' })]);
  assert.equal(r.total, 0);
  assert.deepEqual(r.workers, []);
});
test('multiple categories return workers of each, not others', async () => {
  const e = w(), p = w({ category: 'plumber' }), m = w({ category: 'mason' });
  const r = await aiSearch({ query: 'house wiring and pipe leak' }, [e, p, m]);
  assert.deepEqual(ids(r).sort(), [e.id, p.id].sort());
});
test('Gemini-derived categories feed the same search (kitchen shelf -> carpenter)', async () => {
  const c = w({ category: 'carpenter' }), e = w();
  const r = await aiSearch({ query: 'kitchen shelf fix pannanum' }, [c, e], svc(async () => okJson(['carpenter'], ['shelf'])));
  assert.deepEqual(ids(r), [c.id]);
});
test('Gemini unavailable -> falls back to the existing text search', async () => {
  const hit = w({ description: 'We do kitchen shelf fixing' }), other = w({ description: 'nothing' });
  const r = await aiSearch({ query: 'kitchen shelf' }, [hit, other], svc(async () => { throw Object.assign(new Error('x'), { status: 429 }); }));
  assert.deepEqual(ids(r), [hit.id]);
});
test('visibility rules still hold: rejected hidden, pending only when not verified-only, suspended last', async () => {
  const ok = w({ category: 'mason' });
  const rej = w({ category: 'mason', verificationStatus: 'rejected' });
  const pend = w({ category: 'mason', verificationStatus: 'pending' });
  const susp = w({ category: 'mason', isSuspended: true });
  const r = await aiSearch({ query: 'mason' }, [ok, rej, pend, susp]);
  assert.ok(!ids(r).includes(rej.id));
  assert.equal(r.total, 3);
  assert.deepEqual(ids(await aiSearch({ query: 'mason', verified: 'true' }, [ok, rej, pend, susp])).sort(), [ok.id, susp.id].sort());
  const avail = await aiSearch({ query: 'mason', available: 'true' }, [ok, rej, pend, susp, w({ category: 'mason', availability: 'Offline' })]);
  assert.deepEqual(ids(avail).sort(), [ok.id, pend.id].sort());
});
test('AI categories cannot widen district / area / taluk scope', async () => {
  const salem = w({ category: 'mason', publicArea: 'Fairlands', serviceAreas: ['Fairlands'] });
  const chennai = w({ category: 'mason', district: 'chennai' });
  const other = w({ category: 'mason', publicArea: 'Gugai', serviceAreas: ['Gugai'] });
  assert.deepEqual(ids(await aiSearch({ query: 'koththukar' }, [salem, chennai, other])).sort(), [salem.id, other.id].sort());
  assert.deepEqual(ids(await aiSearch({ query: 'koththukar', area: 'Fairlands' }, [salem, chennai, other])), [salem.id]);
  assert.equal((await aiSearch({ query: 'koththukar', district: 'chennai' }, [salem, chennai])).total, 0);
});
test('explicit category dropdown still ANDs with the AI categories', async () => {
  const m = w({ category: 'mason' }), e = w();
  assert.equal((await aiSearch({ query: 'koththukar', category: 'electrician' }, [m, e])).total, 0);
  assert.deepEqual(ids(await aiSearch({ query: 'koththukar', category: 'mason' }, [m, e])), [m.id]);
});
test('GPS radius + missing coordinates + availability-first ordering + pagination with AI query', async () => {
  const near = w({ category: 'mason', ...km(2) });
  const nearOffline = w({ category: 'mason', availability: 'Offline', ...km(1) });
  const far = w({ category: 'mason', ...km(30) });
  const noCoords = w({ category: 'mason', coordinates: { lat: 0, lng: 0 } });
  const gps = { lat: String(SALEM.lat), lng: String(SALEM.lng) };
  const inRadius = await aiSearch({ query: 'koththukar', ...gps, radius: '10' }, [far, noCoords, nearOffline, near]);
  assert.deepEqual(ids(inRadius), [near.id, nearOffline.id]); // available first, then closer-but-offline
  const all = await aiSearch({ query: 'koththukar', ...gps }, [far, noCoords, nearOffline, near]);
  assert.equal(all.total, 4);
  const p1 = await aiSearch({ query: 'koththukar', limit: '2', page: '1' }, [near, nearOffline, far, noCoords]);
  const p2 = await aiSearch({ query: 'koththukar', limit: '2', page: '2' }, [near, nearOffline, far, noCoords]);
  assert.equal(p1.total, 4);
  assert.equal(p1.hasMore, true);
  assert.equal(p2.hasMore, false);
  assert.equal(new Set([...ids(p1), ...ids(p2)]).size, 4);
});
test('public output never exposes phone/email/coordinates', async () => {
  const r = await aiSearch({ query: 'koththukar' }, [w({ category: 'mason' })]);
  const s = JSON.stringify(r);
  assert.ok(!/9876543210|@x\.com|coordinates/.test(s));
});
test('Mongo filter: AI categories are an $in OR inside the same $and as visibility/district', () => {
  const parsed: any = parseSearchQuery({ query: 'koththukar' }, getEnabledDistricts('salem'));
  parsed.params.aiCategories = ['mason', 'bogus'];
  const f = toMongoFilter(buildFilter(parsed.params)) as any;
  assert.deepEqual(f.verificationStatus, { $ne: 'rejected' });
  const ors = JSON.stringify(f.$and);
  assert.ok(ors.includes('"$in":["mason"]'));
  assert.ok(!ors.includes('bogus'));
  assert.ok(f.$and.some((c: any) => c.district)); // district scope still enforced
});
test('query-string hardening is unchanged (operators / arrays rejected)', () => {
  assert.equal(parseSearchQuery({ query: ['a', 'b'] } as any, getEnabledDistricts('salem')).ok, false);
  assert.equal(parseSearchQuery({ query: { $ne: 'x' } } as any, getEnabledDistricts('salem')).ok, false);
  assert.equal(parseSearchQuery({ query: 'x'.repeat(101) }, getEnabledDistricts('salem')).ok, false);
});

// ---------------------------------------------------------------- key exposure
test('GEMINI_API_KEY is referenced only by server code, never by the frontend bundle sources', () => {
  const root = process.cwd(); // npm test runs from the project root
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
  const read = (f: string) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
  const offenders = [...walk(path.join(root, 'src')), path.join(root, 'index.html')]
    .filter((f) => /GEMINI|genai|import\.meta\.env|process\.env/i.test(read(f)))
    .map((f) => path.relative(root, f));
  // vite.config.ts must not inject any env var into the browser bundle (`define` / loadEnv) nor mention the key.
  if (/GEMINI|loadEnv|define\s*:/i.test(read(path.join(root, 'vite.config.ts')))) offenders.push('vite.config.ts');
  assert.deepEqual(offenders, []);
});

// ---------------------------------------------------------------- diagnostics (V18)
const googleErr = (status: number, gStatus: string, msg: string) => {
  const e: any = new Error(JSON.stringify({ error: { code: status, message: msg, status: gStatus, details: [{ reason: 'X' }] } }));
  e.name = 'ApiError'; e.status = status; return e;
};
test('describeError tells an application timeout apart from errors returned by Google', () => {
  const t = new Error('no response within 8000ms'); t.name = 'AiTimeoutError';
  const d = describeError(t, KEY, 8000);
  assert.equal(d.kind, 'app_timeout'); assert.match(d.hint, /NOT an error returned by Google/);
  const g = describeError(googleErr(429, 'RESOURCE_EXHAUSTED', 'Quota exceeded'), KEY);
  assert.equal(g.kind, 'google_api_error'); assert.equal(g.reason, 'quota'); assert.equal(g.httpStatus, 429);
  assert.equal(g.googleStatus, 'RESOURCE_EXHAUSTED'); assert.match(g.googleMessage!, /Quota exceeded/); assert.ok(g.googleDetails);
});
test('describeError: bad key, unknown model, bad request, 5xx, network, SDK missing', () => {
  assert.equal(describeError(googleErr(400, 'INVALID_ARGUMENT', 'API key not valid. Please pass a valid API key.'), KEY).reason, 'auth');
  assert.equal(describeError(googleErr(403, 'PERMISSION_DENIED', 'denied'), KEY).reason, 'auth');
  assert.equal(describeError(googleErr(404, 'NOT_FOUND', 'models/x is not found for API version v1beta'), KEY).reason, 'model');
  assert.equal(describeError(googleErr(400, 'INVALID_ARGUMENT', 'Unknown name "foo"'), KEY).reason, 'error');
  assert.equal(describeError(googleErr(503, 'UNAVAILABLE', 'overloaded'), KEY).kind, 'google_api_error');
  const net: any = new TypeError('fetch failed'); net.cause = Object.assign(new Error('getaddrinfo ENOTFOUND generativelanguage.googleapis.com'), { code: 'ENOTFOUND' });
  const n = describeError(net, KEY);
  assert.equal(n.kind, 'network_error'); assert.equal(n.networkCode, 'ENOTFOUND'); assert.match(n.message, /ENOTFOUND/);
  const sdk = Object.assign(new Error('Could not load @google/genai'), { name: 'SdkLoadError' });
  assert.equal(describeError(sdk, KEY).kind, 'sdk_error');
});
test('redactSecrets removes the key in every shape it can appear', () => {
  const t = `url=https://x/y?key=${KEY}&a=1 header x-goog-api-key: ${KEY} raw ${KEY} AIzaSyABCDEFGHIJKLMNOPQRSTUV`;
  const r = redactSecrets(t, KEY);
  assert.ok(!r.includes(KEY) && !r.includes('AIzaSyABCDEFGHIJKLMNOPQRSTUV'));
});
test('failures are logged with model, duration, HTTP/Google status, message - and never the key or phrase', async () => {
  const logs: string[] = [];
  const s = svc(async () => { throw googleErr(403, 'PERMISSION_DENIED', `API key ${KEY} is restricted`); }, {}, logs);
  const r = await s.resolve('secret unclear phrase here');
  const out = logs.join('\n');
  assert.equal(r.fallbackReason, 'auth');
  assert.match(out, /GOOGLE API ERROR/); assert.match(out, new RegExp(`model=${DEFAULT_GEMINI_MODEL}`));
  assert.match(out, /duration=\d+ms/); assert.match(out, /httpStatus=403 googleStatus=PERMISSION_DENIED/);
  assert.match(out, /googleMessage=.*restricted/);
  assert.ok(!out.includes(KEY), 'key leaked'); assert.ok(!out.includes('secret unclear phrase'), 'phrase leaked');
});
test('an application timeout is labelled as such in the log (not as a Google error)', async () => {
  const logs: string[] = [];
  const s = svc(() => new Promise(() => {}), { timeoutMs: 500 }, logs);
  const r = await s.resolve('something unclear here');
  assert.equal(r.fallbackReason, 'timeout');
  const out = logs.join('\n');
  assert.match(out, /APPLICATION TIMEOUT/); assert.match(out, /timeoutConfigured=500ms/); assert.match(out, /NOT an error returned by Google/);
  assert.ok(!/GOOGLE API ERROR/.test(out));
});
test('slow SDK start-up is NOT counted against the Gemini timeout', async () => {
  const caller: GeminiCaller = async () => okJson(['mason']);
  caller.warmup = () => new Promise((res) => setTimeout(() => res({ sdkVersion: 't' }), 700)); // slower than the 500ms timeout
  const s = svc(caller, { timeoutMs: 500 });
  const r = await s.resolve('house building help');
  assert.equal(r.source, 'ai');
});
test('SDK load failure is reported as sdk (not timeout) and does not call Gemini', async () => {
  let calls = 0; const logs: string[] = [];
  const caller: GeminiCaller = async () => { calls++; return okJson([]); };
  caller.warmup = async () => { throw Object.assign(new Error('Cannot find package'), { name: 'SdkLoadError' }); };
  const r = await svc(caller, {}, logs).resolve('something unclear here');
  assert.equal(r.fallbackReason, 'sdk'); assert.equal(calls, 0);
  assert.match(logs.join('\n'), /SDK load FAILED/);
});
test('unknown model: switches ONCE to the documented fallback and remembers it', async () => {
  const seen: string[] = []; const logs: string[] = [];
  const s = svc(async (_p, ctx) => { seen.push(ctx.model); if (ctx.model === DEFAULT_GEMINI_MODEL) throw googleErr(404, 'NOT_FOUND', 'model not found'); return okJson(['mason']); }, {}, logs);
  const r = await s.resolve('house building help');
  assert.equal(r.source, 'ai');
  assert.deepEqual(seen, [DEFAULT_GEMINI_MODEL, 'gemini-3.1-flash-lite']);
  await s.resolve('another house building idea'); // uses the working model directly
  assert.equal(seen[2], 'gemini-3.1-flash-lite');
  assert.match(logs.join('\n'), /trying the configured fallback/);
});
test('unknown model with no working fallback: falls back to text search, no loop', async () => {
  let calls = 0;
  const s = svc(async () => { calls++; throw googleErr(404, 'NOT_FOUND', 'model not found'); });
  const r = await s.resolve('house building help');
  assert.equal(r.fallbackReason, 'model'); assert.equal(calls, 2);
  assert.equal((await s.resolve('second unclear phrase')).fallbackReason, 'circuit_open');
});
test('logStatus never prints the key', () => {
  const logs: string[] = []; svc(undefined, {}, logs).logStatus();
  const out = logs.join('\n'); assert.ok(!out.includes(KEY)); assert.match(out, /Gemini ON/);
  const l2: string[] = []; new AiSearchService(loadAiConfig({}), { log: (m) => l2.push(m) }).logStatus();
  assert.match(l2.join(''), /GEMINI_API_KEY is not set/);
});
