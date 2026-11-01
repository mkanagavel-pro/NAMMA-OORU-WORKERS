/**
 * Curated occupation synonym dictionary for the worker search box.
 *
 * Maps Tamil-script, Tanglish (Tamil in English letters), English and common
 * misspellings to the project's REAL category ids (WORKER_CATEGORIES in
 * src/data/tamilNaduData.ts). It never invents categories: every key of
 * CATEGORY_TERMS is checked against WORKER_CATEGORIES by the unit tests.
 *
 * Pure (no network, no DB). A clear dictionary match means Gemini is NOT called.
 *
 * HOW TO EXTEND: add a lowercase term to the right array below. Rules:
 *  - Latin-script terms are matched on whole words / word sequences
 *    ("ac" will not match inside "pack"). Single Latin words of 5+ letters
 *    also get typo tolerance automatically - do not list every misspelling.
 *  - Tamil-script terms are matched as substrings (Tamil adds suffixes:
 *    கொத்தனாரை, கொத்தனாருக்கு) .
 *  - When two terms overlap, the LONGEST wins ("ac mechanic" -> AC only,
 *    not also Mechanic).
 *  - A term that fits no existing category goes in UNMAPPED_TERMS (we do not
 *    add or rename categories here).
 */

/** category id -> lowercase terms */
export const CATEGORY_TERMS: Record<string, string[]> = {
  electrician: [
    'electrician', 'electricians', 'electrical', 'electric', 'electricity', 'current work', 'current problem',
    'wiring', 'wireman', 'wire man', 'house wiring', 'switch board', 'switchboard', 'mcb', 'fan repair', 'fan',
    'fan fitting', 'tube light', 'bulb', 'light fitting', 'inverter', 'earthing', 'eb work',
    'minsara velai', 'minsaram', 'minsara', 'current velai', 'minvisiri',
    'மின்சார வேலை', 'மின்சாரம்', 'மின்சார', 'மின் பணியாளர்', 'மின் வேலை', 'எலக்ட்ரீஷியன்', 'எலக்ட்ரிசியன்',
    'வயரிங்', 'மின்விசிறி', 'மின் விசிறி', 'பேன் ரிப்பேர்',
  ],
  plumber: [
    'plumber', 'plumbers', 'plumbing', 'pipe', 'pipes', 'pipe leak', 'pipe leakage', 'pipe repair', 'pipe fitting',
    'pipeline', 'leakage', 'water leak', 'water leakage', 'leaking', 'tap', 'tap repair', 'bathroom fitting',
    'drainage', 'drain block', 'kuzhai', 'kuzhai pazhuthu', 'kuzhai velai', 'kulai',
    'குழாய் பழுது', 'குழாய் வேலை', 'குழாய்', 'பிளம்பர்', 'பிளம்பிங்', 'தண்ணீர் கசிவு', 'கசிவு',
  ],
  carpenter: [
    'carpenter', 'carpenters', 'carpentry', 'wood work', 'woodwork', 'wooden work', 'wood worker', 'furniture',
    'furniture repair', 'door repair', 'door fitting', 'window frame', 'almirah', 'cupboard', 'cot repair',
    'thachar', 'thatchar', 'tachar', 'thachan', 'thachu', 'thachu velai', 'thatchu', 'maravelai', 'mara velai',
    'தச்சர்', 'தச்சு வேலை', 'தச்சு', 'மர வேலை', 'மரவேலை', 'கார்பென்டர்', 'கார்பெண்டர்',
  ],
  painter: [
    'painter', 'painters', 'painting', 'paint', 'paints', 'paint adikka', 'paint adi', 'house paint', 'wall paint',
    'whitewash', 'white wash', 'distemper', 'putty work', 'colour adikka', 'color adikka', 'colour work',
    'varnam', 'varnam poosu',
    'பெயிண்டர்', 'பெயின்டர்', 'பெயிண்ட்', 'வர்ணம் பூசு', 'வர்ணம்', 'சுவர் பெயிண்ட்',
  ],
  mason: [
    'mason', 'masons', 'masonry', 'mason / builder', 'builder', 'builders', 'construction', 'construction work',
    'building work', 'house construction', 'cement work', 'brick work', 'bricklayer',
    'koththanar', 'koththukar', 'koththukaran', 'kothanar', 'kotthanar', 'kothanaar', 'koththanaar', 'kothukaran',
    'kothu velai', 'koththu velai', 'mestri', 'mesthiri', 'mestiri', 'maistry', 'maistri', 'mestry', 'mesthri',
    'கொத்தனார்', 'கொத்தனா', 'மேஸ்திரி', 'மேஸ்த்ரி', 'கட்டிட வேலை', 'கட்டுமான', 'சிமெண்ட் வேலை',
  ],
  ac_appliance: [
    'ac', 'a c', 'ac repair', 'ac service', 'ac mechanic', 'ac technician', 'ac fitting', 'ac installation',
    'ac problem', 'split ac', 'air conditioner', 'air conditioning', 'airconditioner', 'appliance', 'appliances', 'home appliance',
    'tv repair', 'television', 'microwave', 'air cooler', 'cooler repair', 'mixer grinder', 'grinder repair',
    'ஏசி', 'ஏசி ரிப்பேர்', 'ஏசி மெக்கானிக்', 'டிவி ரிப்பேர்', 'வீட்டு உபகரண',
  ],
  mechanic: [
    'mechanic', 'mechanics', 'garage', 'bike', 'bikes', 'bike mechanic', 'bike repair', 'bike service',
    'two wheeler', 'two wheeler mechanic', 'four wheeler', 'four wheeler mechanic', 'car', 'car mechanic',
    'car repair', 'car service', 'auto mechanic', 'vehicle', 'vehicle repair', 'vehicle mechanic', 'scooter',
    'scooty', 'motorcycle', 'motorbike', 'puncture', 'tyre', 'tire', 'tyre puncture',
    'மெக்கானிக்', 'பைக் மெக்கானிக்', 'பைக் ரிப்பேர்', 'பைக்', 'கார் மெக்கானிக்', 'கார் ரிப்பேர்', 'கார் சர்வீஸ்',
    'வாகன மெக்கானிக்', 'வாகன', 'ஸ்கூட்டர்', 'பஞ்சர்', 'டூவீலர்',
  ],
  welder: [
    'welder', 'welders', 'welding', 'weld', 'fabrication', 'fabricator', 'grill work', 'gate work', 'iron work',
    'steel work', 'welding velai',
    'வெல்டர்', 'வெல்டிங்', 'இரும்பு வேலை', 'கிரில் வேலை', 'கேட் வேலை', 'ஃபேப்ரிகேஷன்',
  ],
  cleaning: [
    'cleaning', 'cleaner', 'cleaners', 'house cleaning', 'home cleaning', 'deep cleaning', 'maid', 'maids',
    'house maid', 'housemaid', 'house keeping', 'housekeeping', 'sweeping', 'mopping', 'tank cleaning',
    'water tank cleaning', 'sofa cleaning', 'bathroom cleaning', 'veetu velai', 'velaikari', 'velaikkari',
    'velaikaari',
    'கிளீனிங்', 'வீட்டு வேலை', 'வேலைக்காரி', 'வீடு சுத்தம்', 'சுத்தம்',
  ],
  gardener: [
    'gardener', 'gardeners', 'gardening', 'garden', 'garden work', 'landscaper', 'landscaping', 'lawn', 'plants',
    'tree cutting', 'tree trimming', 'thottam', 'thottakaran', 'thottakkaran', 'thotta velai',
    'தோட்டக்காரர்', 'தோட்ட வேலை', 'தோட்டம்', 'மரம் வெட்ட',
  ],
  driver: [
    'driver', 'drivers', 'car driver', 'acting driver', 'taxi', 'cab', 'auto driver', 'lorry driver', 'van driver',
    'bus driver', 'personal driver', 'driving', 'drivar', 'oturnar', 'ottunar',
    'ஓட்டுநர்', 'டிரைவர்', 'ஆட்டோ ஓட்டுநர்', 'கார் ஓட்டுநர்', 'டாக்ஸி', 'லாரி',
  ],
  cctv_tech: [
    'cctv', 'cctv camera', 'cctv installation', 'cctv technician', 'camera installation', 'security camera',
    'surveillance', 'dvr', 'alarm system', 'security system',
    'சிசிடிவி', 'சிசிடிவி கேமரா', 'கண்காணிப்பு கேமரா',
  ],
  tailor: [
    'tailor', 'tailors', 'tailoring', 'stitching', 'stitch', 'blouse stitching', 'blouse', 'dress stitching',
    'alteration', 'alterations', 'sewing', 'darzi', 'tailer', 'thaiyal', 'thayal', 'thaiyalkaran',
    'தையல்', 'தையல்காரர்', 'டெய்லர்', 'டைலர்', 'பிளவுஸ்',
  ],
  pest_control: [
    'pest control', 'pest controller', 'pest', 'pests', 'termite', 'termite control', 'cockroach',
    'cockroach control', 'bed bugs', 'bedbug', 'rat', 'rats', 'mosquito', 'ant control', 'fumigation', 'pesticide',
    'poochi', 'poochi marundhu', 'karaiyan',
    'பூச்சி கட்டுப்பாடு', 'பூச்சி', 'கரப்பான்', 'கரையான்', 'எலி',
  ],
  mobile_repair: [
    'mobile repair', 'mobile phone repair', 'phone repair', 'mobile service', 'mobile shop', 'cell phone repair',
    'cellphone repair', 'smartphone repair', 'screen replacement', 'mobile screen', 'mobile', 'mobiles', 'phone',
    'மொபைல் ரிப்பேர்', 'போன் ரிப்பேர்', 'மொபைல்', 'செல்போன்',
  ],
  computer_repair: [
    'computer', 'computers', 'computer repair', 'computer service', 'laptop', 'laptops', 'laptop repair', 'laptop service',
    'pc repair', 'desktop repair', 'kanini',
    'கணினி', 'கம்ப்யூட்டர்', 'லேப்டாப்',
  ],
  washing_machine: [
    'washing machine', 'washing machine repair', 'washing machine service', 'washer', 'washer repair',
    'வாஷிங் மெஷின்',
  ],
  refrigerator: [
    'refrigerator', 'refrigerators', 'refrigerator repair', 'fridge', 'fridge repair', 'freezer', 'freezer repair',
    'ஃப்ரிட்ஜ்', 'பிரிட்ஜ்', 'குளிர்சாதன பெட்டி', 'குளிர்சாதனப் பெட்டி',
  ],
  ro_purifier: [
    'ro', 'ro service', 'ro water purifier', 'ro purifier', 'water purifier', 'purifier', 'water filter', 'aquaguard', 'ro plant',
    'ஆர்ஓ', 'ஆர்.ஓ', 'வாட்டர் பியூரிஃபயர்', 'குடிநீர் சுத்திகரிப்பான்',
  ],
  solar: [
    'solar', 'solar panel', 'solar panels', 'solar installation', 'solar panel installation', 'solar water heater', 'solar heater',
    'சோலார்', 'சோலார் பேனல்',
  ],
  tile_flooring: [
    'tile', 'tiles', 'tile work', 'tiling', 'tile fitting', 'tiles fitting', 'flooring', 'floor tiles', 'marble work', 'granite work',
    'டைல்ஸ்', 'டைல்ஸ் வேலை', 'தரை அமைப்பு',
  ],
  plastering: [
    'plastering', 'plaster', 'plaster work', 'plastering work', 'wall plastering', 'cement plaster',
    'சுவர் பூச்சு', 'பூச்சு வேலை', 'பிளாஸ்டரிங்',
  ],
  borewell_pump: [
    'borewell', 'bore well', 'borewell repair', 'water pump', 'pump repair', 'motor pump', 'pump set', 'monoblock', 'submersible',
    'submersible pump', 'pump technician', 'well digging',
    'ஆழ்துளை', 'ஆழ்துளை கிணறு', 'போர்வெல்', 'மோட்டார் பம்ப்', 'பம்ப் செட்', 'தண்ணீர் மோட்டார்', 'கிணறு',
  ],
  packers_movers: [
    'packers', 'packers and movers', 'packers movers', 'movers', 'house shifting', 'home shifting', 'shifting', 'shifting service',
    'relocation', 'lorry shifting',
    'வீடு மாற்றம்', 'சாமான் மாற்றம்', 'ஷிஃப்டிங்', 'பேக்கர்ஸ்',
  ],
  cook: [
    'cook', 'cooks', 'cooking', 'home cook', 'chef', 'catering', 'cooking master', 'samayal', 'samaiyal', 'samayal karar', 'samayalkaran',
    'சமையல்', 'சமையல்காரர்', 'சமையல் வேலை',
  ],
  laundry: [
    'laundry', 'laundry service', 'ironing', 'ironing service', 'iron box', 'dhobi', 'dhobhi', 'washerman', 'dry clean', 'dry cleaning',
    'clothes ironing',
    'சலவை', 'அயர்னிங்', 'இஸ்திரி',
  ],
  beautician: [
    'beautician', 'beauty parlour', 'beauty parlor', 'parlour', 'parlor', 'beauty', 'beauty service', 'makeup', 'make up',
    'bridal makeup', 'mehndi', 'mehandi', 'facial', 'salon',
    'பியூட்டி பார்லர்', 'பியூட்டிஷியன்', 'அழகு நிலையம்', 'அழகுக்கலை', 'மேக்கப்', 'மெஹந்தி',
  ],
  photographer: [
    'photographer', 'photographers', 'photography', 'videographer', 'videography', 'photo', 'video shoot', 'wedding photographer',
    'wedding photography', 'candid', 'studio', 'camera man', 'cameraman',
    'போட்டோகிராபர்', 'புகைப்படம்', 'வீடியோகிராபர்', 'போட்டோ',
  ],
  tuition_teacher: [
    'tuition', 'tuition teacher', 'tutor', 'teacher', 'home tuition', 'tuition master', 'coaching', 'private tutor', 'maths tuition',
    'ட்யூஷன்', 'டியூஷன்', 'டியூசன்', 'ஆசிரியர்',
  ],
  purohit: [
    'purohit', 'purohitar', 'purohith', 'ayyar', 'iyer', 'iyer pooja', 'pooja', 'puja', 'pooja service', 'pooja services', 'homam',
    'griha pravesam', 'gruhapravesam', 'house warming', 'pandit', 'pandith', 'pundit', 'priest',
    'புரோகிதர்', 'ஐயர்', 'பூஜை', 'பூசை', 'ஹோமம்', 'கிரகப்பிரவேசம்', 'பண்டிட்',
  ],
};

/**
 * Real occupations that have NO category in the app yet. Currently none: Cook now has its own category. A match
 * is treated as understood (Gemini is not called), maps to no category, and
 * the search falls back to plain text matching - it never invents a category.
 */
export const UNMAPPED_TERMS: Record<string, string[]> = {};
/** Filler words that must never be typo-matched to an occupation. */
const FUZZY_STOPWORDS = new Set([
  'venum', 'vendum', 'venumnu', 'repair', 'repairs', 'service', 'services', 'work', 'works', 'need', 'needed', 'wanted',
  'looking', 'please', 'nearby', 'helper', 'worker', 'workers', 'urgent', 'house', 'home', 'veetukku', 'panna',
  'pannanum', 'aalu', 'oruthar', 'person', 'available', 'contact', 'number', 'problem', 'problems', 'broken',
  // real words that are 1 edit away from an occupation word
  'printer', 'printers', 'painted', 'planner', 'planter', 'cooker', 'cookies', 'tailed', 'masons', 'drive', 'driven',
  'prices', 'cleaned', 'welded', 'garden',
]);

const norm = (s: string) =>
  s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Lower-case, strip punctuation, collapse whitespace. Tamil script is preserved. */
export function normalizeQuery(q: unknown): string {
  return typeof q === 'string' ? norm(q) : '';
}

const isLatin = (s: string) => /^[\p{Script=Latin}\p{N} ]+$/u.test(s);

interface Entry {
  term: string;
  category: string | null; // null => unmapped occupation
  label: string;
  latin: boolean;
}

function buildEntries(): Entry[] {
  const out: Entry[] = [];
  const seen = new Set<string>();
  const add = (category: string | null, label: string, raw: string) => {
    const term = norm(raw);
    if (!term) return;
    const key = `${category}|${term}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ term, category, label, latin: isLatin(term) });
  };
  for (const [cat, terms] of Object.entries(CATEGORY_TERMS)) for (const t of terms) add(cat, cat, t);
  for (const [label, terms] of Object.entries(UNMAPPED_TERMS)) for (const t of terms) add(null, label, t);
  // Longest first, so "ac mechanic" claims its words before "mechanic" can.
  return out.sort((a, b) => b.term.length - a.term.length || a.term.localeCompare(b.term));
}

const ENTRIES = buildEntries();
const FUZZY_ENTRIES = ENTRIES.filter((e) => e.latin && !e.term.includes(' ') && e.term.length >= 5);

/** Optimal-string-alignment edit distance (insert/delete/substitute/transpose), capped. */
export function editDistance(a: string, b: string, cap = 3): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const dp: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    dp[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[a.length][b.length];
}

function fuzzyThreshold(len: number): number {
  if (len < 5) return 0;
  if (len <= 7) return 1;
  return 2;
}

export interface DictionaryMatch {
  term: string;
  category: string | null;
  kind: 'exact' | 'fuzzy';
}

export interface DictionaryResult {
  /** Real category ids, in order of first appearance in the query. */
  categories: string[];
  /** Understood occupations that have no category in the app (e.g. "cook"). */
  unmapped: string[];
  matches: DictionaryMatch[];
  /** True when the dictionary understood the query well enough to skip Gemini. */
  clear: boolean;
}

/** Match a free-text query against the dictionary (exact phrases, then typo tolerance). */
export function matchOccupations(raw: string): DictionaryResult {
  const q = normalizeQuery(raw);
  const result: DictionaryResult = { categories: [], unmapped: [], matches: [], clear: false };
  if (!q) return result;

  const padded = ` ${q} `;
  const used = new Array<boolean>(padded.length).fill(false);
  const hits: { pos: number; m: DictionaryMatch }[] = [];

  const record = (pos: number, m: DictionaryMatch) => hits.push({ pos, m });

  // 1. Exact terms (longest first). Latin: whole words. Tamil: substring.
  for (const e of ENTRIES) {
    const needle = e.latin ? ` ${e.term} ` : e.term;
    let from = 0;
    while (true) {
      const idx = padded.indexOf(needle, from);
      if (idx === -1) break;
      // for padded Latin needles the match includes the surrounding spaces; shrink to the word span
      const start = e.latin ? idx + 1 : idx;
      const end = e.latin ? idx + needle.length - 1 : idx + needle.length;
      let free = true;
      for (let i = start; i < end; i++) if (used[i]) { free = false; break; }
      if (free) {
        for (let i = start; i < end; i++) used[i] = true;
        record(start, { term: e.term, category: e.category, kind: 'exact' });
        break; // one occurrence per term is enough
      }
      from = idx + 1;
    }
  }

  // 2. Typo tolerance on remaining single Latin words.
  let offset = 1; // padded starts with a space
  for (const token of q.split(' ')) {
    const start = offset;
    offset += token.length + 1;
    if (token.length < 5 || !isLatin(token) || FUZZY_STOPWORDS.has(token)) continue;
    let free = true;
    for (let i = start; i < start + token.length; i++) if (used[i]) { free = false; break; }
    if (!free) continue;
    const limit = fuzzyThreshold(token.length);
    let best = limit + 1;
    let bestEntries: Entry[] = [];
    for (const e of FUZZY_ENTRIES) {
      const d = editDistance(token, e.term, limit);
      if (d > limit) continue;
      if (d < best) { best = d; bestEntries = [e]; }
      else if (d === best) bestEntries.push(e);
    }
    if (bestEntries.length === 0) continue;
    for (let i = start; i < start + token.length; i++) used[i] = true;
    // A typo equally close to several categories is reported as all of them (no false certainty).
    const seen = new Set<string>();
    for (const e of bestEntries) {
      const k = String(e.category ?? e.label);
      if (seen.has(k)) continue;
      seen.add(k);
      record(start, { term: e.term, category: e.category, kind: 'fuzzy' });
    }
  }

  hits.sort((a, b) => a.pos - b.pos);
  for (const { m } of hits) {
    result.matches.push(m);
    if (m.category) {
      if (!result.categories.includes(m.category)) result.categories.push(m.category);
    } else {
      const label = ENTRIES.find((e) => e.term === m.term && e.category === null)?.label;
      if (label && !result.unmapped.includes(label)) result.unmapped.push(label);
    }
  }
  result.clear = result.categories.length > 0 || result.unmapped.length > 0;
  return result;
}
