/**
 * Worker location validation (district -> taluk -> area), shared by worker
 * registration, profile update and the legacy-data audit script.
 *
 * Pure (no mongoose/express) so it is unit-tested without a database.
 * NEVER trusts the client: district/taluk/area ids are resolved against the
 * central configuration (src/data/salemLocations.ts) and free text is
 * validated and normalised before it is stored.
 */
import { TN_DISTRICTS } from '../../src/data/tamilNaduData';
import {
  LOCATION_CONFIGURED_DISTRICTS,
  OTHER_AREA_ID,
  SALEM_AREAS,
  findTaluk,
  getSelectableAreasForTaluk,
  normalizeKey,
  type LocationArea,
} from '../../src/data/salemLocations';
import { getEnabledDistricts } from './workerSearch';

export interface WorkerLocation {
  /** canonical district id, e.g. "salem" */
  district: string;
  /** canonical taluk id, e.g. "salem-west" */
  taluk: string;
  /** id of a verified listed area, or null for a manually entered locality */
  areaId: string | null;
  /** display name of the area (listed name, or the sanitised manual text) */
  publicArea: string;
}

export type LocationResult = { ok: true; location: WorkerLocation } | { ok: false; error: string; field: 'district' | 'taluk' | 'area' };

export const AREA_MIN = 2;
export const AREA_MAX = 60;
export const MAX_SERVICE_AREAS = 10;
// Letters/marks/digits (any script - Tamil included), space and a few safe separators. No < > $ { } etc.
const SAFE_AREA_RE = /^[\p{L}\p{M}\p{N} .,'’()/&-]+$/u;

export function cleanAreaText(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (t.length < AREA_MIN || t.length > AREA_MAX) return null;
  return SAFE_AREA_RE.test(t) ? t : null;
}

/** District ids where worker registration/location is allowed: enabled for launch AND has a taluk configuration. */
export function getRegistrationDistrictIds(enabledRaw?: string): string[] {
  return getEnabledDistricts(enabledRaw).map((d) => d.id).filter((id) => id in LOCATION_CONFIGURED_DISTRICTS);
}

export function resolveDistrictId(v: unknown): string | null {
  const k = normalizeKey(v);
  if (!k) return null;
  const d = TN_DISTRICTS.find((x) => x.id === k || normalizeKey(x.nameEn) === k || normalizeKey(x.nameTa) === k);
  return d ? d.id : null;
}

export function validateWorkerLocation(
  input: { district?: unknown; taluk?: unknown; areaId?: unknown; publicArea?: unknown },
  opts: { registrationDistrictIds?: string[]; areas?: LocationArea[] } = {}
): LocationResult {
  const allowed = opts.registrationDistrictIds ?? getRegistrationDistrictIds();
  const areas = opts.areas ?? SALEM_AREAS;

  // 1. district
  if (typeof input.district !== 'string' || !input.district.trim()) {
    return { ok: false, field: 'district', error: 'District is required.' };
  }
  const districtId = resolveDistrictId(input.district);
  if (!districtId || !allowed.includes(districtId)) {
    return { ok: false, field: 'district', error: 'Worker registration is currently available for Salem district only.' };
  }
  const cfg = LOCATION_CONFIGURED_DISTRICTS[districtId];

  // 2. taluk
  if (typeof input.taluk !== 'string' || !input.taluk.trim()) {
    return { ok: false, field: 'taluk', error: 'Taluk is required.' };
  }
  const taluk = findTaluk(districtId, input.taluk, cfg.taluks);
  if (!taluk) return { ok: false, field: 'taluk', error: 'Please select a valid taluk of the chosen district.' };

  // 3. area - listed (verified mapping) or manual "Other area in this taluk"
  const verified = getSelectableAreasForTaluk(taluk.id, areas);
  const rawId = input.areaId;
  const wantsListed = rawId !== undefined && rawId !== null && rawId !== '' && rawId !== OTHER_AREA_ID;
  if (wantsListed) {
    if (typeof rawId !== 'string') return { ok: false, field: 'area', error: 'Invalid area selection.' };
    const area = verified.find((a) => a.id === rawId);
    if (!area) return { ok: false, field: 'area', error: 'The selected area does not belong to the selected taluk.' };
    return { ok: true, location: { district: districtId, taluk: taluk.id, areaId: area.id, publicArea: area.nameEn } };
  }

  const text = cleanAreaText(input.publicArea);
  if (!text) {
    return {
      ok: false,
      field: 'area',
      error: `Area is required (${AREA_MIN}-${AREA_MAX} characters; letters, numbers, spaces and . , - ' ( ) / & only).`,
    };
  }
  const key = normalizeKey(text);
  // A "manual" name that is actually a verified area elsewhere must not be used to dodge the mapping.
  const elsewhere = areas.find((a) => a.mappingStatus === 'verified' && a.taluk !== taluk.id && normalizeKey(a.nameEn) === key);
  const same = verified.find((a) => normalizeKey(a.nameEn) === key);
  if (same) return { ok: true, location: { district: districtId, taluk: taluk.id, areaId: same.id, publicArea: same.nameEn } };
  if (elsewhere) {
    return { ok: false, field: 'area', error: 'That area belongs to a different taluk. Choose the correct taluk or a different area.' };
  }
  return { ok: true, location: { district: districtId, taluk: taluk.id, areaId: null, publicArea: text } };
}

/** Service areas: optional list, sanitised, always includes the primary area, never empty. */
export function sanitizeServiceAreas(
  input: unknown,
  primaryArea: string
): { ok: true; value: string[] } | { ok: false; error: string } {
  let raw: unknown[] = [];
  if (input === undefined || input === null || input === '') raw = [];
  else if (Array.isArray(input)) raw = input;
  else if (typeof input === 'string') raw = input.split(',');
  else return { ok: false, error: 'Invalid service areas.' };

  const out: string[] = [primaryArea];
  const seen = new Set<string>([normalizeKey(primaryArea)]);
  for (const item of raw) {
    if (typeof item === 'string' && item.trim() === '') continue;
    const t = cleanAreaText(item);
    if (!t) return { ok: false, error: 'Service areas contain an invalid entry.' };
    const k = normalizeKey(t);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  if (out.length > MAX_SERVICE_AREAS) return { ok: false, error: `At most ${MAX_SERVICE_AREAS} service areas are allowed.` };
  return { ok: true, value: out };
}

// ---------------------------------------------------------------------------
// Legacy data audit
// ---------------------------------------------------------------------------

export type LocationStatus =
  | 'complete'
  | 'missing_taluk'
  | 'invalid_taluk'
  | 'area_missing'
  | 'area_mismatch'
  | 'district_not_launch'
  | 'district_unrecognized';

export interface LocationAudit {
  status: LocationStatus;
  /** The only automatic fix that is safe: canonical spelling of an already-recognised district. */
  safeFix: { district?: string } | null;
}

/**
 * Classify a stored worker. NEVER infers a taluk: a worker without a valid
 * taluk is reported as needing the worker (or an admin) to choose one.
 */
export function classifyWorkerLocation(
  w: { district?: unknown; taluk?: unknown; areaId?: unknown; publicArea?: unknown },
  opts: { registrationDistrictIds?: string[]; areas?: LocationArea[] } = {}
): LocationAudit {
  const allowed = opts.registrationDistrictIds ?? getRegistrationDistrictIds();
  const areas = opts.areas ?? SALEM_AREAS;
  const districtId = resolveDistrictId(w.district);
  if (!districtId) return { status: 'district_unrecognized', safeFix: null };
  const safeFix = typeof w.district === 'string' && w.district !== districtId ? { district: districtId } : null;
  if (!allowed.includes(districtId)) return { status: 'district_not_launch', safeFix };

  const hasTaluk = typeof w.taluk === 'string' && w.taluk.trim() !== '';
  if (!hasTaluk) return { status: 'missing_taluk', safeFix };
  const taluk = findTaluk(districtId, w.taluk);
  if (!taluk || taluk.id !== w.taluk) return { status: 'invalid_taluk', safeFix };
  if (typeof w.publicArea !== 'string' || !w.publicArea.trim()) return { status: 'area_missing', safeFix };
  if (w.areaId !== undefined && w.areaId !== null) {
    const ok = getSelectableAreasForTaluk(taluk.id, areas).some((a) => a.id === w.areaId);
    if (!ok) return { status: 'area_mismatch', safeFix };
  }
  return { status: 'complete', safeFix };
}
