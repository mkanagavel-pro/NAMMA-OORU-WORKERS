import test from 'node:test';
import assert from 'node:assert/strict';
import { localizePlace, localizeTaluk, localizeDistrict, localizePlaces, missingTamilLocationNames } from '../../src/i18n/locationNames';
import { PLACE_TA, PLACE_TA_TRANSLITERATED, TALUK_TA } from '../../src/i18n/locationNamesTa';
import { SALEM_TALUKS, SALEM_AREAS, normalizeKey } from '../../src/data/salemLocations';
import { TN_DISTRICTS } from '../../src/data/tamilNaduData';

const TAMIL_ONLY = /^[஀-௿0-9 .()\-]+$/;

test('English mode returns the stored English value unchanged', () => {
  assert.equal(localizePlace('Hasthampatti', 'en'), 'Hasthampatti');
  assert.equal(localizePlace('Some Unlisted Village', 'en'), 'Some Unlisted Village');
  assert.equal(localizeTaluk('salem-west', 'en'), 'Salem West');
  assert.equal(localizeDistrict('salem', 'en'), 'Salem');
});

test('Tamil mode: known names translate, unknown names fall back to English (never guessed)', () => {
  assert.equal(localizePlace('Hasthampatti', 'ta'), 'ஹஸ்தம்பட்டி');
  assert.equal(localizePlace('  hasthampatti ', 'ta'), 'ஹஸ்தம்பட்டி'); // lookup is case/space-insensitive
  assert.equal(localizePlace('Some Unlisted Village', 'ta'), 'Some Unlisted Village');
  assert.equal(localizePlace('', 'ta'), '');
  assert.deepEqual(localizePlaces(['Gugai', 'Unknownpatti'], 'ta'), ['குகை', 'Unknownpatti']);
  assert.equal(localizeDistrict('salem', 'ta'), 'சேலம்');
  assert.equal(localizeDistrict('nowhere', 'ta'), 'nowhere');
});

test('"<District> Town" follows the district Tamil name', () => {
  assert.equal(localizePlace('Theni Town', 'ta'), 'தேனி நகரம்');
});

test('every taluk (id or name) has a Tamil name; ids are untouched', () => {
  for (const t of SALEM_TALUKS) {
    assert.ok(TALUK_TA[t.id], `no Tamil for taluk ${t.id}`);
    assert.equal(localizeTaluk(t.id, 'ta'), TALUK_TA[t.id]);
    assert.equal(localizeTaluk(t.nameEn, 'ta'), TALUK_TA[t.id]);
  }
});

test('Tamil dictionary hygiene: normalised keys, Tamil-script values, no empties', () => {
  for (const [k, v] of Object.entries(PLACE_TA)) {
    assert.equal(k, normalizeKey(k), `key not normalised: ${k}`);
    assert.ok(v && TAMIL_ONLY.test(v), `bad Tamil value for ${k}: ${v}`);
  }
  for (const d of TN_DISTRICTS) assert.ok(TAMIL_ONLY.test(d.nameTa), `district ${d.id}`);
});

test('coverage report: totals match the datasets and nothing is silently missing', () => {
  const r = missingTamilLocationNames();
  assert.equal(r.total.districts, 38);
  assert.equal(r.taluks.length, 0);
  assert.equal(r.districts.length, 0);
  // Remaining gaps are reported for manual review, not hidden (see docs/LOCATION_TAMIL_NAMES.md).
  assert.ok(r.areas.length < r.total.areas);
  assert.ok(r.towns.length < r.total.towns);
});

test('EVERY Salem area name (all 13 taluks) has a Tamil display name; English mode and stored values are untouched', () => {
  for (const a of SALEM_AREAS) {
    const ta = localizePlace(a.nameEn, 'ta');
    assert.notEqual(ta, a.nameEn, `no Tamil for area "${a.nameEn}" (${a.taluk})`);
    assert.ok(/[\u0b80-\u0bff]/.test(ta) && TAMIL_ONLY.test(ta), `bad Tamil for ${a.nameEn}: ${ta}`);
    assert.equal(localizePlace(a.nameEn, 'en'), a.nameEn);
  }
  assert.equal(missingTamilLocationNames().areas.length, 0);
});

test('transliterated map: normalised keys, Tamil-script values, not duplicating the confirmed map', () => {
  for (const [k, v] of Object.entries(PLACE_TA_TRANSLITERATED)) {
    assert.equal(k, normalizeKey(k), `key not normalised: ${k}`);
    assert.ok(TAMIL_ONLY.test(v), `bad Tamil value for ${k}: ${v}`);
    assert.ok(!(k in PLACE_TA), `duplicate in both maps: ${k}`);
  }
});
