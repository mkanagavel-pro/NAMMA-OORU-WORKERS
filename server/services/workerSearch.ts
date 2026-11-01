/**
 * Worker search service - district/area/category/GPS filtering + ranking.
 *
 * Deliberately has NO mongoose / express imports so every rule in here can
 * be unit-tested without a database (see server/tests/workerSearch.test.ts).
 * The Express route (server/routes/workers.ts) supplies a Mongo-backed
 * `SearchRepo`; tests supply an in-memory one.
 *
 * Security notes:
 *  - Every query value must be a plain string. Arrays / objects (e.g.
 *    `?category[$ne]=x`) are rejected with a 400 before reaching MongoDB.
 *  - District and category are resolved against server-side configuration
 *    (TN_DISTRICTS / WORKER_CATEGORIES) - raw user text never reaches a
 *    district regex. Free-text area/text input is regex-escaped, length
 *    limited and anchored/escaped before use.
 *  - Public output is a whitelist; exact coordinates never leave the server.
 */
import {
  LOCATION_CONFIGURED_DISTRICTS,
  findTaluk,
  getSelectableAreasForTaluk,
} from '../../src/data/salemLocations';
import {
  TN_DISTRICTS,
  WORKER_CATEGORIES,
  type DistrictInfo,
} from '../../src/data/tamilNaduData';

// ---------------------------------------------------------------------------
// Launch scope
// ---------------------------------------------------------------------------

export const DEFAULT_ENABLED_DISTRICTS = ['salem'];

/**
 * Districts whose workers are publicly searchable. Configure with
 * ENABLED_DISTRICTS="salem,coimbatore" (district ids from tamilNaduData.ts).
 * Unknown ids are ignored; an empty/invalid value falls back to Salem so a
 * typo can never silently open the whole state.
 */
export function getEnabledDistricts(raw: string | undefined = process.env.ENABLED_DISTRICTS): DistrictInfo[] {
  const ids = (raw ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const wanted = ids.length > 0 ? ids : DEFAULT_ENABLED_DISTRICTS;
  let found = TN_DISTRICTS.filter((d) => wanted.includes(d.id));
  if (found.length === 0) found = TN_DISTRICTS.filter((d) => DEFAULT_ENABLED_DISTRICTS.includes(d.id));
  return found;
}

// ---------------------------------------------------------------------------
// Query parsing / validation
// ---------------------------------------------------------------------------

export type SortMode = 'default' | 'proximity' | 'rating';

export interface SearchParams {
  /** Districts the search is restricted to (never empty unless outOfScope). */
  districts: DistrictInfo[];
  /** A real, known district was requested but it is not enabled yet. */
  outOfScope: boolean;
  category: string | null;
  /** canonical taluk id (validated against the central location config) */
  taluk: string | null;
  area: string | null;
  text: string | null;
  /** Real category ids inferred from `text` (dictionary / Gemini). Never user-supplied. */
  aiCategories: string[];
  /** Short validated keywords, used only when no category was inferred. */
  aiKeywords: string[];
  availableOnly: boolean;
  verifiedOnly: boolean;
  sort: SortMode;
  customer: { lat: number; lng: number } | null;
  radiusKm: number | null;
  page: number;
  limit: number;
}

export type ParseResult = { ok: true; params: SearchParams } | { ok: false; error: string };

export const MAX_PAGE_SIZE = 50;
export const DEFAULT_PAGE_SIZE = 24;
export const MAX_RADIUS_KM = 200;
/** Max candidates read into memory for a GPS-ranked search. */
export const GPS_CANDIDATE_CAP = 5000;

const KNOWN_KEYS = [
  'query', 'category', 'district', 'taluk', 'area', 'available', 'verified',
  'lat', 'lng', 'radius', 'sort', 'page', 'limit',
] as const;

const NUMBER_RE = /^-?\d+(\.\d+)?$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;

function strictNumber(v: string): number | null {
  if (!NUMBER_RE.test(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function parseSearchQuery(
  q: Record<string, unknown>,
  enabled: DistrictInfo[] = getEnabledDistricts()
): ParseResult {
  // 1. Every known key must be a plain string (blocks arrays / nested objects).
  const s: Partial<Record<(typeof KNOWN_KEYS)[number], string>> = {};
  for (const key of KNOWN_KEYS) {
    const v = q[key];
    if (v === undefined) continue;
    if (typeof v !== 'string') return { ok: false, error: `Invalid value for "${key}".` };
    const t = v.trim();
    if (t !== '') s[key] = t;
  }

  // 2. District - resolved against configuration, never used as raw text.
  let districts = enabled;
  let outOfScope = false;
  if (s.district && s.district.toLowerCase() !== 'all') {
    const wanted = s.district.toLowerCase();
    const known = TN_DISTRICTS.find((d) => d.id === wanted || d.nameEn.toLowerCase() === wanted);
    if (!known) return { ok: false, error: 'Unknown district.' };
    const isEnabled = enabled.find((d) => d.id === known.id);
    if (isEnabled) districts = [isEnabled];
    else {
      districts = [];
      outOfScope = true;
    }
  }

  // 3. Category - must be one of the project's real categories.
  let category: string | null = null;
  if (s.category && s.category.toLowerCase() !== 'all') {
    if (!WORKER_CATEGORIES.some((c) => c.id === s.category)) {
      return { ok: false, error: 'Unknown category.' };
    }
    category = s.category;
  }

  // 3b. Taluk - must exist in the central configuration of a district in scope.
  let taluk: string | null = null;
  if (s.taluk && s.taluk.toLowerCase() !== 'all') {
    const scope = districts.length > 0 ? districts : enabled;
    const hit = scope
      .map((d) => findTaluk(d.id, s.taluk, LOCATION_CONFIGURED_DISTRICTS[d.id]?.taluks ?? []))
      .find(Boolean);
    if (!hit) return { ok: false, error: 'Unknown taluk.' };
    taluk = hit.id;
  }

  // 4. Area (free text, but bounded and escaped when used).
  let area: string | null = null;
  if (s.area && s.area.toLowerCase() !== 'all') {
    if (s.area.length > 60 || CONTROL_CHARS_RE.test(s.area)) return { ok: false, error: 'Invalid area.' };
    area = s.area.replace(/\s+/g, ' ');
  }

  // 5. Free-text query.
  let text: string | null = null;
  if (s.query) {
    if (s.query.length > 100 || CONTROL_CHARS_RE.test(s.query)) return { ok: false, error: 'Invalid search text.' };
    text = s.query;
  }

  // 6. Booleans.
  const bool = (key: 'available' | 'verified'): boolean | null => {
    const v = s[key];
    if (v === undefined || v === 'false') return false;
    if (v === 'true') return true;
    return null;
  };
  const availableOnly = bool('available');
  const verifiedOnly = bool('verified');
  if (availableOnly === null || verifiedOnly === null) return { ok: false, error: 'Invalid filter value.' };

  // 7. Sort.
  const sort = (s.sort ?? 'default') as SortMode;
  if (!['default', 'proximity', 'rating'].includes(sort)) return { ok: false, error: 'Invalid sort option.' };

  // 8. GPS: lat+lng together, valid ranges; radius needs coordinates.
  let customer: { lat: number; lng: number } | null = null;
  if (s.lat !== undefined || s.lng !== undefined) {
    if (s.lat === undefined || s.lng === undefined) {
      return { ok: false, error: 'Both lat and lng are required.' };
    }
    const lat = strictNumber(s.lat);
    const lng = strictNumber(s.lng);
    if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return { ok: false, error: 'Invalid coordinates.' };
    }
    customer = { lat, lng };
  }
  let radiusKm: number | null = null;
  if (s.radius !== undefined) {
    const r = strictNumber(s.radius);
    if (r === null || r <= 0 || r > MAX_RADIUS_KM) return { ok: false, error: 'Invalid radius.' };
    if (!customer) return { ok: false, error: 'Radius requires lat and lng.' };
    radiusKm = r;
  }

  // 9. Pagination.
  let page = 1;
  if (s.page !== undefined) {
    if (!/^\d+$/.test(s.page)) return { ok: false, error: 'Invalid page.' };
    page = Number(s.page);
    if (page < 1 || page > 100000) return { ok: false, error: 'Invalid page.' };
  }
  let limit = DEFAULT_PAGE_SIZE;
  if (s.limit !== undefined) {
    if (!/^\d+$/.test(s.limit)) return { ok: false, error: 'Invalid limit.' };
    limit = Number(s.limit);
    if (limit < 1 || limit > MAX_PAGE_SIZE) return { ok: false, error: 'Invalid limit.' };
  }

  return {
    ok: true,
    params: { districts, outOfScope, category, taluk, area, text, aiCategories: [], aiKeywords: [], availableOnly, verifiedOnly, sort, customer, radiusKm, page, limit },
  };
}

// ---------------------------------------------------------------------------
// Declarative filter + Mongo translation
// ---------------------------------------------------------------------------

export interface SearchFilter {
  /** Lower-cased district spellings that count as "in scope". */
  districtNames: string[];
  category: string | null;
  taluk: string | null;
  area: string | null;
  text: string | null;
  aiCategories: string[];
  aiKeywords: string[];
  availableOnly: boolean;
  verifiedOnly: boolean;
  /** Coarse bounding box for radius searches (exact distance applied after). */
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null;
}

const KM_PER_DEG_LAT = 111.19;

export function buildFilter(p: SearchParams): SearchFilter {
  const names = new Set<string>();
  for (const d of p.districts) {
    names.add(d.id.toLowerCase());
    names.add(d.nameEn.toLowerCase());
    names.add(d.nameTa.toLowerCase());
  }
  let bbox: SearchFilter['bbox'] = null;
  if (p.customer && p.radiusKm !== null) {
    const dLat = p.radiusKm / KM_PER_DEG_LAT;
    const cos = Math.cos((p.customer.lat * Math.PI) / 180);
    // Near the poles the longitude span explodes; skip the lng bound there.
    const dLng = cos > 0.01 ? p.radiusKm / (KM_PER_DEG_LAT * cos) : 360;
    bbox = {
      minLat: p.customer.lat - dLat,
      maxLat: p.customer.lat + dLat,
      minLng: p.customer.lng - dLng,
      maxLng: p.customer.lng + dLng,
    };
  }
  return {
    districtNames: [...names],
    category: p.category,
    taluk: p.taluk,
    area: p.area,
    text: p.text,
    // Defence in depth: only real category ids / short plain keywords ever reach the query.
    aiCategories: (p.aiCategories ?? []).filter((c) => WORKER_CATEGORIES.some((w) => w.id === c)),
    aiKeywords: (p.aiKeywords ?? []).filter((k) => typeof k === 'string' && k.length >= 2 && k.length <= 30).slice(0, 5),
    availableOnly: p.availableOnly,
    verifiedOnly: p.verifiedOnly,
    bbox,
  };
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function anchoredRegex(value: string): string {
  return `^\\s*${escapeRegex(value)}\\s*$`;
}

/** Translate the declarative filter into a MongoDB filter. All user input is escaped/validated. */
export function toMongoFilter(f: SearchFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = {
    // Req 11: rejected workers are never public. Pending stay visible
    // ("Verification Pending") unless the caller asks for verified only.
    verificationStatus: f.verifiedOnly ? 'verified' : { $ne: 'rejected' },
  };
  const and: Record<string, unknown>[] = [];

  // Case/whitespace-insensitive district match against legacy-spelled data.
  const districtAlt = f.districtNames.map(escapeRegex).join('|');
  and.push({ district: { $regex: `^\\s*(?:${districtAlt})\\s*$`, $options: 'i' } });

  if (f.category) filter.category = f.category;
  if (f.taluk) filter.taluk = f.taluk; // canonical id validated in parseSearchQuery

  if (f.area) {
    const re = anchoredRegex(f.area);
    and.push({ $or: [{ publicArea: { $regex: re, $options: 'i' } }, { serviceAreas: { $regex: re, $options: 'i' } }] });
  }

  if (f.text) {
    // Unchanged plain-text match, widened (OR) by what the dictionary/Gemini understood.
    // It only ever ADDS candidates inside the same district/taluk/area/visibility/availability
    // filters above and below - it cannot bring back a hidden worker.
    const re = { $regex: escapeRegex(f.text), $options: 'i' };
    const or: Record<string, unknown>[] = [{ name: re }, { category: re }, { publicArea: re }, { serviceAreas: re }, { description: re }];
    if (f.aiCategories.length > 0) or.push({ category: { $in: f.aiCategories } });
    else for (const k of f.aiKeywords) or.push({ description: { $regex: escapeRegex(k), $options: 'i' } }, { category: { $regex: escapeRegex(k), $options: 'i' } });
    and.push({ $or: or });
  }

  if (f.availableOnly) {
    filter.availability = 'Available';
    filter.isSuspended = false;
  }

  if (f.bbox) {
    filter['coordinates.lat'] = { $gte: f.bbox.minLat, $lte: f.bbox.maxLat };
    filter['coordinates.lng'] = { $gte: f.bbox.minLng, $lte: f.bbox.maxLng };
  }

  filter.$and = and;
  return filter;
}

// ---------------------------------------------------------------------------
// Distance + ranking
// ---------------------------------------------------------------------------

/** Same formula/constants as calculateDistance() in server/db.ts (R = 6371 km). */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Same thresholds as getDistanceCategory() in server/db.ts. */
export function distanceCategory(km: number): 'Nearby' | 'Moderate distance' | 'Far' {
  if (km <= 7) return 'Nearby';
  if (km <= 20) return 'Moderate distance';
  return 'Far';
}

/**
 * A worker only has a usable position if lat/lng are finite, in range and
 * not the (0,0) schema default - otherwise they must never be shown as near.
 */
export function hasValidCoords(c: any): boolean {
  const lat = c?.lat;
  const lng = c?.lng;
  return (
    typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

export interface RankedWorker {
  worker: any;
  distanceKm: number | null;
}

/** Mongo sort used when no GPS is supplied (also mirrors rankWorkers' non-GPS order). */
export function dbSortSpec(sort: SortMode): Record<string, 1 | -1> {
  if (sort === 'rating') {
    return { isSuspended: 1, availability: 1, 'ratingSummary.averageRating': -1, 'ratingSummary.totalRatings': -1, id: 1 };
  }
  // 'Available' < 'Offline'; 'verified' > 'pending' (so -1 puts verified first).
  return { isSuspended: 1, availability: 1, verificationStatus: -1, 'ratingSummary.totalRatings': -1, id: 1 };
}

function compareWorkers(a: RankedWorker, b: RankedWorker, sort: SortMode): number {
  const wa = a.worker, wb = b.worker;
  // Suspended always last.
  if (!!wa.isSuspended !== !!wb.isSuspended) return wa.isSuspended ? 1 : -1;
  // Available before Offline (before distance, so a closer Offline worker never outranks Available).
  const aAvail = wa.availability === 'Available', bAvail = wb.availability === 'Available';
  if (aAvail !== bAvail) return aAvail ? -1 : 1;

  if (sort === 'rating') {
    const d = (wb.ratingSummary?.averageRating || 0) - (wa.ratingSummary?.averageRating || 0);
    if (d !== 0) return d;
    const t = (wb.ratingSummary?.totalRatings || 0) - (wa.ratingSummary?.totalRatings || 0);
    if (t !== 0) return t;
  }

  // Distance (only when both have a real, computed distance; those without come after).
  if (a.distanceKm !== null || b.distanceKm !== null) {
    if (a.distanceKm === null) return 1;
    if (b.distanceKm === null) return -1;
    if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
  }

  if (sort !== 'rating') {
    const av = wa.verificationStatus === 'verified', bv = wb.verificationStatus === 'verified';
    if (av !== bv) return av ? -1 : 1;
    const t = (wb.ratingSummary?.totalRatings || 0) - (wa.ratingSummary?.totalRatings || 0);
    if (t !== 0) return t;
  }
  // Stable, deterministic final tie-break.
  return String(wa.id).localeCompare(String(wb.id));
}

/**
 * Compute distances (only for workers with valid coordinates), apply the exact
 * radius cut-off, and sort. Workers with no valid coordinates get
 * distanceKm = null and are EXCLUDED when a radius is requested.
 */
export function rankWorkers(workers: any[], p: SearchParams): RankedWorker[] {
  const ranked: RankedWorker[] = [];
  for (const w of workers) {
    let distanceKm: number | null = null;
    if (p.customer && hasValidCoords(w.coordinates)) {
      distanceKm = haversineKm(p.customer.lat, p.customer.lng, w.coordinates.lat, w.coordinates.lng);
    }
    if (p.radiusKm !== null && (distanceKm === null || distanceKm > p.radiusKm)) continue;
    ranked.push({ worker: w, distanceKm });
  }
  ranked.sort((a, b) => compareWorkers(a, b, p.sort));
  return ranked;
}

// ---------------------------------------------------------------------------
// JS predicate mirroring toMongoFilter (used by the in-memory test repo)
// ---------------------------------------------------------------------------

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

export function matchesFilter(f: SearchFilter, w: any): boolean {
  if (f.verifiedOnly ? w.verificationStatus !== 'verified' : w.verificationStatus === 'rejected') return false;
  if (!f.districtNames.includes(norm(w.district))) return false;
  if (f.category && w.category !== f.category) return false;
  if (f.taluk && w.taluk !== f.taluk) return false;
  if (f.area) {
    const a = norm(f.area);
    const areas = [w.publicArea, ...(Array.isArray(w.serviceAreas) ? w.serviceAreas : [])].map(norm);
    if (!areas.includes(a)) return false;
  }
  if (f.text) {
    const t = f.text.toLowerCase();
    const hay = [w.name, w.category, w.publicArea, ...(w.serviceAreas || []), w.description].map((x) => String(x ?? '').toLowerCase());
    let ok = hay.some((h) => h.includes(t));
    if (!ok && f.aiCategories.length > 0) ok = f.aiCategories.includes(w.category);
    if (!ok && f.aiCategories.length === 0) {
      ok = (f.aiKeywords ?? []).some((k) => [String(w.description ?? ''), String(w.category ?? '')].some((h) => h.toLowerCase().includes(k)));
    }
    if (!ok) return false;
  }
  if (f.availableOnly && !(w.availability === 'Available' && w.isSuspended === false)) return false;
  if (f.bbox) {
    const { lat, lng } = w.coordinates || {};
    if (typeof lat !== 'number' || typeof lng !== 'number') return false;
    if (lat < f.bbox.minLat || lat > f.bbox.maxLat || lng < f.bbox.minLng || lng > f.bbox.maxLng) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Public serialization (whitelist - coordinates / phone / email never included)
// ---------------------------------------------------------------------------

export function toPublicSearchWorker(w: any, category: 'Nearby' | 'Moderate distance' | 'Far' | null) {
  return {
    id: w.id,
    name: w.name,
    category: w.category,
    district: w.district,
    taluk: w.taluk ?? null,
    publicArea: w.publicArea,
    serviceAreas: w.serviceAreas,
    description: w.description,
    experience: w.experience,
    rate: w.rate,
    profilePhoto: w.profilePhoto,
    availability: w.availability,
    verificationStatus: w.verificationStatus,
    isSuspended: w.isSuspended,
    ratingSummary: w.ratingSummary,
    distanceCategory: category,
    canContact: !w.isSuspended,
    createdAt: w.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Search orchestration
// ---------------------------------------------------------------------------

export interface SearchRepo {
  count(filter: SearchFilter): Promise<number>;
  findPage(filter: SearchFilter, sort: Record<string, 1 | -1>, skip: number, limit: number): Promise<any[]>;
  findCandidates(filter: SearchFilter, cap: number): Promise<any[]>;
}

export interface SearchResult {
  total: number;
  workers: ReturnType<typeof toPublicSearchWorker>[];
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
  truncated?: boolean;
}

export async function searchWorkers(p: SearchParams, repo: SearchRepo): Promise<SearchResult> {
  const empty = (): SearchResult => ({ total: 0, workers: [], page: p.page, pageSize: p.limit, totalPages: 0, hasMore: false });
  if (p.outOfScope || p.districts.length === 0) return empty();

  const filter = buildFilter(p);
  const skip = (p.page - 1) * p.limit;

  if (!p.customer) {
    // No GPS: availability-first ordering, fully in the database (real skip/limit).
    const total = await repo.count(filter);
    const rows = total > skip ? await repo.findPage(filter, dbSortSpec(p.sort), skip, p.limit) : [];
    const totalPages = Math.ceil(total / p.limit);
    return {
      total,
      workers: rows.map((w) => toPublicSearchWorker(w, null)),
      page: p.page,
      pageSize: p.limit,
      totalPages,
      hasMore: p.page < totalPages,
    };
  }

  // GPS: distances are computed server-side, the radius is enforced exactly,
  // then the ranked list is paginated so pages never overlap or mis-order.
  const fetched = await repo.findCandidates(filter, GPS_CANDIDATE_CAP + 1);
  const truncated = fetched.length > GPS_CANDIDATE_CAP;
  const ranked = rankWorkers(truncated ? fetched.slice(0, GPS_CANDIDATE_CAP) : fetched, p);
  const total = ranked.length;
  const totalPages = Math.ceil(total / p.limit);
  const pageRows = ranked.slice(skip, skip + p.limit);
  const result: SearchResult = {
    total,
    workers: pageRows.map((r) => toPublicSearchWorker(r.worker, r.distanceKm === null ? null : distanceCategory(r.distanceKm))),
    page: p.page,
    pageSize: p.limit,
    totalPages,
    hasMore: p.page < totalPages,
  };
  if (truncated) result.truncated = true;
  return result;
}

// ---------------------------------------------------------------------------
// Search configuration exposed to the frontend
// ---------------------------------------------------------------------------

export function describeEnabledDistricts(
  extraAreas: Record<string, string[]> = {},
  enabled = getEnabledDistricts(),
  extraTalukAreas: Record<string, string[]> = {}
) {
  const dedupe = (names: string[], skip: Set<string>) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const a of names) {
      const clean = String(a).trim();
      const key = clean.toLowerCase();
      if (!clean || skip.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push(clean);
    }
    return out;
  };
  return enabled.map((d) => {
    const skip = new Set([d.id.toLowerCase(), d.nameEn.toLowerCase(), d.nameTa.toLowerCase()]);
    const cfg = LOCATION_CONFIGURED_DISTRICTS[d.id];
    const sorted = (xs: string[] = []) => xs.slice().sort((x, y) => x.localeCompare(y));
    if (!cfg) {
      // Districts without a taluk configuration keep the legacy flat area list.
      return {
        id: d.id, nameEn: d.nameEn, nameTa: d.nameTa, lat: d.lat, lng: d.lng,
        taluks: [] as { id: string; nameEn: string; areas: string[] }[],
        areas: dedupe([...d.towns, ...sorted(extraAreas[d.id])], skip),
      };
    }
    // Configured districts: ONLY verified listed areas + areas real workers use. The
    // unofficial legacy `towns` list is not offered.
    const taluks = cfg.taluks.map((t) => ({
      id: t.id,
      nameEn: t.nameEn,
      areas: dedupe([...getSelectableAreasForTaluk(t.id, cfg.areas).map((a) => a.nameEn), ...sorted(extraTalukAreas[t.id])], skip),
    }));
    return {
      id: d.id, nameEn: d.nameEn, nameTa: d.nameTa, lat: d.lat, lng: d.lng,
      taluks,
      areas: dedupe([...cfg.areas.filter((a) => a.mappingStatus === 'verified' || a.mappingStatus === 'provisional').map((a) => a.nameEn), ...sorted(extraAreas[d.id])], skip),
    };
  });
}
