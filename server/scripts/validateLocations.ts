/** `npm run locations:validate` - checks the central Salem location dataset and prints coverage. */
import {
  SALEM_TALUKS, SALEM_AREAS, SALEM_LOCATION_SOURCES, SKIPPED_SOURCE_SECTIONS, MIN_AREAS_PER_TALUK,
  validateLocationDataset, talukCoverage, normalizeKey,
} from '../../src/data/salemLocations';

const problems = validateLocationDataset(SALEM_TALUKS, SALEM_AREAS);
const count = (s: string) => SALEM_AREAS.filter((a) => a.mappingStatus === s).length;
console.log(`taluks: ${SALEM_TALUKS.length}  (source: ${SALEM_LOCATION_SOURCES.taluks.url}, ${SALEM_LOCATION_SOURCES.taluks.status})`);
console.log(`areas: ${SALEM_AREAS.length} total | ${count('verified')} verified | ${count('provisional')} PROVISIONAL (owner-supplied, not verified) | ${count('unverified')} unverified`);
console.log(`town panchayats source: ${SALEM_LOCATION_SOURCES.townPanchayats.status}`);
console.log(`village panchayats source: ${SALEM_LOCATION_SOURCES.villagePanchayats.status}`);
console.log('\nper-taluk coverage (minimum ' + MIN_AREAS_PER_TALUK + ' distinct):');
for (const c of talukCoverage()) {
  console.log(`  ${c.nameEn.padEnd(22)} ${String(c.distinct).padStart(3)} areas  verified=${c.verified}  provisional=${c.provisional}  ${c.meetsMinimum ? 'ok' : 'BELOW MINIMUM'}${c.fullyVerified ? '' : '  (not fully verified)'}`);
}
const byName = new Map<string, Set<string>>();
for (const a of SALEM_AREAS) {
  const k = normalizeKey(a.nameEn);
  if (!byName.has(k)) byName.set(k, new Set());
  byName.get(k)!.add(a.taluk ?? '?');
}
const dups = [...byName].filter(([, t]) => t.size > 1);
if (dups.length) {
  console.log('\nSame name listed under more than one taluk (kept separate - please confirm which is right):');
  for (const [n, t] of dups) console.log(`  ${n}: ${[...t].join(', ')}`);
}
for (const s of SKIPPED_SOURCE_SECTIONS) console.log(`\nSKIPPED section "${s.name}": ${s.reason}`);
const below = talukCoverage().filter((c) => !c.meetsMinimum);
if (problems.length || below.length) {
  console.error('PROBLEMS:\n' + [...problems, ...below.map((c) => `${c.nameEn} below minimum`)].join('\n'));
  process.exit(1);
}
console.log('\ndataset structure OK (areas are PROVISIONAL, not verified against official lists)');
