/**
 * Central, verified location configuration for worker registration and search.
 *
 * SOURCE OF TRUTH: the official Salem District (Govt. of Tamil Nadu) website.
 * Nothing in this file is written from memory. Each dataset records which
 * official page it came from and what has / has not been verified:
 *
 *   Taluks            https://salem.nic.in/tehsil/            -> VERIFIED (13 taluks)
 *   Town Panchayats   https://salem.nic.in/town-panchayats/   -> NOT IMPORTED (see below)
 *   Village Panchayats https://salem.nic.in/village-panchayats/ -> NOT IMPORTED (see below)
 *
 * Why towns / villages from the official panchayat pages are not imported: when this was built, the two panchayat pages
 * could not be retrieved (the site's robots.txt disallows automated access) and
 * the taluk page does NOT list which towns/villages belong to which taluk.
 * Guessing a taluk for a town would put workers in the wrong search results. The
 * only areas shipped are the owner-supplied starter list, marked 'provisional'
 * (see docs/SALEM_LOCATION_DATA.md and `npm run locations:validate`).
 *
 * Types are kept separate on purpose: a revenue TALUK, a development BLOCK, a
 * TOWN panchayat and a VILLAGE panchayat are different administrative units. A
 * block is never treated as a taluk. An area is only offered under a taluk when
 * `mappingStatus` is 'verified' or 'provisional' and `taluk` is set.
 *
 * Workers whose locality is not listed use the manual "Other area in this
 * taluk" option (stored with areaId = null).
 */

export const SALEM_DISTRICT_ID = 'salem';
export const OTHER_AREA_ID = '__other__';

export const SALEM_LOCATION_SOURCES = {
  taluks: { url: 'https://salem.nic.in/tehsil/', status: 'verified' as const },
  townPanchayats: { url: 'https://salem.nic.in/town-panchayats/', status: 'not_imported' as const },
  villagePanchayats: { url: 'https://salem.nic.in/village-panchayats/', status: 'not_imported' as const },
};

export interface Taluk {
  /** Stable machine id stored on the worker record (`taluk`). */
  id: string;
  /** Name exactly as written on the official page. */
  nameEn: string;
  source: string;
}

/** 13 revenue taluks, as numbered 1-13 on https://salem.nic.in/tehsil/ */
export const SALEM_TALUKS: Taluk[] = [
  'Salem',
  'Salem West',
  'Salem South',
  'Yercaud',
  'Gangavalli',
  'Attur',
  'Pethanaickenpalayam',
  'Valapady',
  'Sankari',
  'Edapadi',
  'Mettur',
  'Omalur',
  'Kadayampatti',
].map((nameEn) => ({
  id: nameEn.toLowerCase().replace(/\s+/g, '-'),
  nameEn,
  source: SALEM_LOCATION_SOURCES.taluks.url,
}));

export type AreaType = 'town_panchayat' | 'village_panchayat' | 'municipality' | 'revenue_village' | 'locality';

export interface LocationArea {
  /** Stable id, e.g. "vp-<block>-<name>". Unique across the dataset. */
  id: string;
  nameEn: string;
  type: AreaType;
  /** Development block as listed by the source (NOT a taluk). Optional. */
  block?: string;
  /** Taluk id this area belongs to; null when the relationship is unknown. */
  taluk: string | null;
  /**
   * 'verified'    - taluk relationship confirmed by an official source.
   * 'provisional' - supplied by the product owner as a starter list; offered in the
   *                 dropdowns under that taluk but NOT yet checked against the
   *                 official Salem revenue-village lists (see docs/SALEM_LOCATION_DATA.md).
   * 'unverified'  - relationship unknown; never offered (must carry no taluk).
   */
  mappingStatus: 'verified' | 'provisional' | 'unverified';
  /** Official page this row came from. */
  source: string;
  /** Why the mapping is uncertain / what still needs checking. */
  note?: string;
}

/**
 * Starter list of areas per taluk, supplied by the product owner (see docs/SALEM_LOCATION_DATA.md).
 * STATUS: PROVISIONAL. The official pages that would confirm each taluk mapping
 * (revenue-village lists, village panchayats) block automated access via robots.txt,
 * so NOTHING here is claimed as verified. Each taluk has at least 15 distinct entries.
 * To promote a row, check it against the official list and set its status to 'verified'.
 *
 * Keys are taluk ids (see SALEM_TALUKS). Names are used exactly as supplied.
 */
const PROVISIONAL_AREA_NAMES: Record<string, string[]> = {
  salem: ['Salem', 'Valasaiyur', 'Panamarathupatti', 'Mallur', 'Veeranam', 'Ayothiapattinam', 'Minnampalli', 'Karipatti', 'Udayapatti', 'Kuppanur', 'Veeraganur', 'Nilavarapatti', 'Sukkampatti', 'Achankuttapatti', 'Dasanaickenpatti'],
  'salem-west': ['Suramangalam', 'Alagapuram', 'Thirumalaigiri', 'Chettichavadi', 'Inamvedugathampatti', 'Mallamooppampatti', 'Sarkargollapatti', 'Selathampatti', 'Kondappanaickenpatti', 'Erumapalayam', 'Sanyasigundu', 'Vattamuthampatti', 'Majaragollapatti', 'Perumampatti', 'Puthur Agraharam'],
  'salem-south': ['Kondalampatti', 'Vembadithalam', 'Veerapandi', 'Elampillai', 'Attayampatti', 'Poolavari', 'Rakkipatti', 'Uthamasolapuram', 'Papparapatti', 'Marulayampalayam', 'Perumagoundampatti', 'Chennagiri', 'Kalparapatti', 'Anaikuttapatti', 'Senaipalayam'],
  yercaud: ['Yercaud', 'Manjakuttai', 'Maramangalam', 'Nagalur', 'Semmanatham', 'Thalaisolai', 'Vazhavanthi', 'Vellakkadai', 'Velur', 'Puthur', 'Kottachedu', 'Kiliyur', 'Pakoda Point area', "Lady's Seat area", 'Yercaud Lake area'],
  valapady: ['Valapady', 'Belur', 'Karipatti', 'Arunuthumalai', 'Athanurpatti', 'Chandrapillaivalasu', 'Chinnamanaickenpalayam', 'Kattuveppilaipatti', 'Kolathukombai', 'Kurichi', 'Mannarpalayam', 'Muthampatti', 'Neermullikuttai', 'Ponnarampatti', 'Singipuram'],
  attur: ['Attur', 'Malliakarai', 'Ammampalayam', 'Appamasamudram', 'Arasanatham', 'Chokkanathapuram', 'Eachampatty', 'Kallanatham', 'Kalpaganur', 'Koolamedu', 'Kothampadi', 'Manjini', 'Paithur', 'Pungavadi', 'Thandavarayapuram'],
  pethanaickenpalayam: ['Pethanaickenpalayam', 'Ethapur', 'Kottavadi', 'Puthiragoundampalayam', 'Thumbal', 'Panamadal', 'Oddapatti', 'Olappadi', 'Sekkadipatti', 'Thamayanur', 'Thandanur', 'Umayalpuram', 'Vadugathampatti', 'Veeragoundanoor', 'West Rajapalayam'],
  gangavalli: ['Gangavalli', 'Anaiyampatti', 'Belur', 'Goodamalai', 'Jangamasamudram', 'Kadambur', 'Kondayampalli', 'Krishnapuram', 'Manmalai', 'Naduvalur', 'Nagiyampatti', 'Odiyathur', 'Pachamalai', 'Thagarapudur', 'Ulipuram'],
  sankari: ['Sankari', 'Sankari East', 'Sankari West', 'Devur', 'Ernapuram', 'Alathur', 'Annathanapatti', 'Chinnagoundanur', 'Devannagoundanur', 'Irugalur', 'Iveli', 'Katheri', 'Kaveripatti', 'Koneripatti', 'Morur East', 'Morur West', 'Mottaianur', 'Pullagoundampatti', 'Sanyasipatti Agraharam', 'Vaikundam', 'Veerachipalayam', 'Vadugapatti'],
  edapadi: ['Edappadi', 'Konganapuram', 'Poolampatti', 'Adaiyur', 'Avaniperur East', 'Chettimankurichi', 'Chithoor', 'Dadhapuram', 'Iruppali', 'Nedungulam', 'Pakkanadu', 'Vellarivelli', 'Vembaneri', 'Erumaipatti', 'Katchupalli', 'Konasamudram', 'Koranampatti', 'Kurumbapatti', 'Pudupalayam', 'Samudram'],
  mettur: ['Mettur', 'Kolathur', 'Palamalai', 'Nangavalli', 'Mecheri', 'Pottaneri', 'Alamarathupatti', 'Chithiraipattipudur', 'Dhinnaipatti', 'Kannamoochi', 'Karungallur', 'Kaveripuram', 'Kolnaickenpatti', 'Lakkampatti', 'Moolakkadu', 'Navapatti', 'Pannavadi', 'Sampalli', 'Singiripatti', 'Koonandiyur', 'Virudasampatti'],
  omalur: ['Omalur', 'Taramangalam', 'Karuppur', 'Balbakki', 'Ettikuttapatti', 'Gollapatti', 'Kamalapuram', 'Kottagoundampatti', 'Kottamettupatti', 'M. Chettipatti', 'Manguppai', 'Moogilpadi', 'Muthunaickenpatti', 'Nallagoundampatti', 'Naranampalayam', 'Pachanampatti', 'Pagalpatti', 'Periyeripatti', 'Pottipuram', 'Tholasampatti'],
  kadayampatti: ['Kadayampatti', 'Semmandapatti', 'Bommiampatti', 'Danishpet', 'Deevattipatti', 'Dharapuram', 'Gundakkal', 'Kanavaipudur', 'Kanjanaickenpatti', 'Karuvalli', 'Kongupatti', 'Kookkuttapatti', 'Mookkanur', 'Nadupatti', 'Pannapatti', 'Poosaripatti', 'Umbilikkampatti', 'Veppilai'],
};

/** Sections of the supplied list that could NOT be imported, and why. Reported by `npm run locations:validate`. */
export const SKIPPED_SOURCE_SECTIONS = [
  {
    name: 'Thalaivasal',
    reason:
      'Not one of the 13 taluks on https://salem.nic.in/tehsil/ (the central taluk list). Its 22 names were NOT added under any other taluk, because guessing the mapping would put workers in the wrong search results. Add Thalaivasal to SALEM_TALUKS only once an official source confirms it.',
  },
];

const PROVISIONAL_NOTE =
  'Starter list supplied by the product owner; taluk mapping NOT yet verified against the official Salem revenue-village lists (robots.txt blocks automated access).';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function buildProvisionalAreas(): LocationArea[] {
  const out: LocationArea[] = [];
  for (const [taluk, names] of Object.entries(PROVISIONAL_AREA_NAMES)) {
    const seen = new Set<string>();
    for (const nameEn of names) {
      const key = normalizeKey(nameEn);
      if (seen.has(key)) continue; // never list a name twice inside one taluk
      seen.add(key);
      out.push({
        id: `${taluk}-${slug(nameEn)}`,
        nameEn,
        type: 'locality',
        taluk,
        mappingStatus: 'provisional',
        source: 'product-owner starter list (docs/SALEM_LOCATION_DATA.md)',
        note: PROVISIONAL_NOTE,
      });
    }
  }
  return out;
}

/** Areas offered under taluks. See `mappingStatus` - every shipped row is currently 'provisional'. */
export const SALEM_AREAS: LocationArea[] = buildProvisionalAreas();

/** Minimum distinct areas a taluk needs before it is considered covered. */
export const MIN_AREAS_PER_TALUK = 15;

// ---------------------------------------------------------------------------
// Helpers (all take the dataset as an argument so tests can inject fixtures)
// ---------------------------------------------------------------------------

/** District ids that have a taluk configuration -> worker registration is limited to these. */
export const LOCATION_CONFIGURED_DISTRICTS: Record<string, { taluks: Taluk[]; areas: LocationArea[] }> = {
  [SALEM_DISTRICT_ID]: { taluks: SALEM_TALUKS, areas: SALEM_AREAS },
};

export function normalizeKey(s: unknown): string {
  return String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Resolve a taluk by id or exact (case-insensitive) official name. */
export function findTaluk(districtId: string, value: unknown, taluks: Taluk[] = LOCATION_CONFIGURED_DISTRICTS[districtId]?.taluks ?? []): Taluk | null {
  const k = normalizeKey(value);
  if (!k) return null;
  return taluks.find((t) => t.id === k || normalizeKey(t.nameEn) === k) ?? null;
}

/** Areas with an officially VERIFIED taluk mapping only. */
export function getVerifiedAreasForTaluk(talukId: string, areas: LocationArea[] = SALEM_AREAS): LocationArea[] {
  return areas.filter((a) => a.mappingStatus === 'verified' && a.taluk === talukId);
}

/**
 * Areas offered in dropdowns / accepted by the API under a taluk: verified AND
 * provisional (owner-supplied) rows. Never another taluk's areas, never 'unverified' rows.
 */
export function getSelectableAreasForTaluk(talukId: string, areas: LocationArea[] = SALEM_AREAS): LocationArea[] {
  return areas.filter((a) => (a.mappingStatus === 'verified' || a.mappingStatus === 'provisional') && a.taluk === talukId);
}

/** Per-taluk coverage report (distinct names, how many are verified). */
export function talukCoverage(taluks: Taluk[] = SALEM_TALUKS, areas: LocationArea[] = SALEM_AREAS) {
  return taluks.map((t) => {
    const mine = getSelectableAreasForTaluk(t.id, areas);
    const distinct = new Set(mine.map((a) => normalizeKey(a.nameEn))).size;
    const verified = mine.filter((a) => a.mappingStatus === 'verified').length;
    return {
      taluk: t.id,
      nameEn: t.nameEn,
      distinct,
      verified,
      provisional: mine.length - verified,
      meetsMinimum: distinct >= MIN_AREAS_PER_TALUK,
      fullyVerified: distinct >= MIN_AREAS_PER_TALUK && verified === mine.length,
    };
  });
}

/** Human label for a stored worker location, e.g. "Hasthampatti, Salem West taluk". */
export function formatWorkerLocation(w: { district?: string; taluk?: string | null; publicArea?: string }): {
  district: string;
  taluk: string | null;
  area: string;
  complete: boolean;
} {
  const taluk = w.taluk ? findTaluk(SALEM_DISTRICT_ID, w.taluk)?.nameEn ?? null : null;
  return { district: String(w.district ?? ''), taluk, area: String(w.publicArea ?? ''), complete: Boolean(taluk) };
}

/** Dataset integrity problems (empty array = OK). Used by tests and `npm run locations:validate`. */
export function validateLocationDataset(taluks: Taluk[] = SALEM_TALUKS, areas: LocationArea[] = SALEM_AREAS): string[] {
  const problems: string[] = [];
  const talukIds = new Set<string>();
  for (const t of taluks) {
    if (!t.id || !t.nameEn || !t.source) problems.push(`taluk incomplete: ${JSON.stringify(t)}`);
    if (talukIds.has(t.id)) problems.push(`duplicate taluk id: ${t.id}`);
    talukIds.add(t.id);
  }
  const areaIds = new Set<string>();
  const seenNameInTaluk = new Set<string>();
  for (const a of areas) {
    if (!a.id || !a.nameEn || !a.source) problems.push(`area incomplete: ${JSON.stringify(a)}`);
    if (areaIds.has(a.id)) problems.push(`duplicate area id: ${a.id}`);
    areaIds.add(a.id);
    if (a.mappingStatus === 'verified' || a.mappingStatus === 'provisional') {
      if (!a.taluk || !talukIds.has(a.taluk)) problems.push(`${a.mappingStatus} area "${a.nameEn}" maps to unknown taluk "${a.taluk}"`);
      const key = `${a.taluk}|${normalizeKey(a.nameEn)}`;
      if (seenNameInTaluk.has(key)) problems.push(`duplicate area name in taluk: ${a.nameEn}`);
      seenNameInTaluk.add(key);
    } else if (a.taluk) {
      problems.push(`unverified area "${a.nameEn}" must not carry a taluk until verified`);
    }
    if ((a.type as string) === 'taluk' || (a.type as string) === 'block') problems.push(`area "${a.nameEn}" has an administrative type that must stay separate`);
  }
  return problems;
}
