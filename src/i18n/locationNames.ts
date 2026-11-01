import { PLACE_TA, PLACE_TA_TRANSLITERATED, TALUK_TA, TOWN_SUFFIX_TA } from './locationNamesTa';
import { TN_DISTRICTS } from '../data/tamilNaduData';
import { SALEM_AREAS, SALEM_TALUKS, findTaluk, normalizeKey, LOCATION_CONFIGURED_DISTRICTS } from '../data/salemLocations';

/**
 * Central location-name localisation. DISPLAY ONLY - never feed the result back
 * into stored values, API calls or filters (those keep using the English
 * name / id). A name with no confirmed Tamil spelling is returned unchanged.
 */

const districtByKey = new Map<string, { nameEn: string; nameTa: string }>();
for (const d of TN_DISTRICTS) {
  districtByKey.set(normalizeKey(d.id), d);
  districtByKey.set(normalizeKey(d.nameEn), d);
}

/** Tamil name for a district id or English name; the input unchanged if unknown. */
export function localizeDistrict(idOrName: string | null | undefined, lang: string): string {
  const raw = String(idOrName ?? '');
  if (lang !== 'ta') return districtByKey.get(normalizeKey(raw))?.nameEn ?? raw;
  return districtByKey.get(normalizeKey(raw))?.nameTa ?? raw;
}

/** Tamil name for a town / locality / area / service-area (English name in, English name out when unknown). */
export function localizePlace(name: string | null | undefined, lang: string): string {
  const raw = String(name ?? '');
  if (lang !== 'ta' || !raw) return raw;
  const k = normalizeKey(raw);
  if (PLACE_TA[k]) return PLACE_TA[k];
  if (PLACE_TA_TRANSLITERATED[k]) return PLACE_TA_TRANSLITERATED[k];
  const d = districtByKey.get(k);
  if (d) return d.nameTa;
  // "<District> Town" -> "<district in Tamil> நகரம்"
  const m = /^(.+?) town$/.exec(k);
  if (m && districtByKey.has(m[1])) return `${districtByKey.get(m[1])!.nameTa} ${TOWN_SUFFIX_TA}`;
  return raw;
}

/** Tamil taluk name from a taluk id or English name. */
export function localizeTaluk(idOrName: string | null | undefined, lang: string, districtId = 'salem'): string {
  const raw = String(idOrName ?? '');
  const hit = findTaluk(districtId, raw);
  if (lang !== 'ta') return hit?.nameEn ?? raw;
  if (hit && TALUK_TA[hit.id]) return TALUK_TA[hit.id];
  return localizePlace(hit?.nameEn ?? raw, lang);
}

/** Localise every entry of a list (e.g. a worker's service areas). */
export function localizePlaces(names: string[] | null | undefined, lang: string): string[] {
  return (names ?? []).map((n) => localizePlace(n, lang));
}

/** Names in the shipped location datasets that still have no Tamil spelling (for manual review). */
export function missingTamilLocationNames() {
  const has = (n: string) => localizePlace(n, 'ta') !== n;
  const taluks = SALEM_TALUKS.filter((t) => !TALUK_TA[t.id]).map((t) => t.nameEn);
  const areas = [...new Set(SALEM_AREAS.map((a) => a.nameEn))].filter((n) => !has(n));
  const towns = [...new Set(TN_DISTRICTS.flatMap((d) => d.towns))].filter((n) => !has(n));
  const districts = TN_DISTRICTS.filter((d) => !d.nameTa).map((d) => d.nameEn);
  const total = {
    districts: TN_DISTRICTS.length,
    taluks: SALEM_TALUKS.length,
    areas: new Set(SALEM_AREAS.map((a) => a.nameEn)).size,
    towns: new Set(TN_DISTRICTS.flatMap((d) => d.towns)).size,
  };
  const transliterated = [...new Set(SALEM_AREAS.map((a) => a.nameEn))].filter((n) => PLACE_TA_TRANSLITERATED[normalizeKey(n)] && !PLACE_TA[normalizeKey(n)]);
  return { total, transliterated, districts, taluks, areas, towns, configured: Object.keys(LOCATION_CONFIGURED_DISTRICTS) };
}
