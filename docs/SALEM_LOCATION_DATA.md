# Salem location data

Single source of truth: `src/data/salemLocations.ts` (used by the registration
form, worker dashboard, customer search and the backend validators).

| Dataset | Official page | Status |
|---|---|---|
| Taluks (13) | https://salem.nic.in/tehsil/ | **verified & imported** |
| Town Panchayats | https://salem.nic.in/town-panchayats/ | **not imported** |
| Village Panchayats | https://salem.nic.in/village-panchayats/ | **not imported** |

## Area data status: PROVISIONAL (read this)

`SALEM_AREAS` is built from the **starter list supplied by the product owner**
(221 areas across the 13 official taluks, 15-22 per taluk). Every row has
`mappingStatus: 'provisional'`: it is offered under its taluk in the registration
form, worker dashboard and customer search, **but it has not been checked
against the official Salem revenue-village lists**.

* The official pages (`/village-panchayats/`, `/town-panchayats/`, revenue
  villages) are disallowed for automated access by the site's `robots.txt`, so
  they could not be fetched and were not worked around.
* Nothing was added from memory beyond the supplied list.
* **Thalaivasal** appears in the supplied list but is not one of the 13 taluks on
  https://salem.nic.in/tehsil/. Its 22 names were NOT assigned to any taluk.
  Add it to `SALEM_TALUKS` only after an official source confirms it.
* Names found under two taluks (kept separate, please confirm): **Karipatti**
  (Salem, Valapady), **Belur** (Valapady, Gangavalli).
* "Pakoda Point area", "Lady's Seat area" and "Yercaud Lake area" are tourist
  landmarks rather than villages; they are kept as supplied.
* Block/panchayat names may not map one-to-one to a revenue taluk. That is why the
  status stays `provisional` until each row is checked.

`npm run locations:validate` prints per-taluk counts, how many rows are verified,
duplicate names and skipped sections.

## Promoting / adding areas

1. Check the name against the official list in a browser (or ask the District office).
2. In `PROVISIONAL_AREA_NAMES` (taluk id -> names) fix or add the name. To mark a
   row verified, give it `mappingStatus: 'verified'` (add it to `SALEM_AREAS` as an
   explicit `LocationArea` with the official `source` URL and remove it from the
   provisional list).
3. A taluk is only "complete" when it has >= 15 distinct areas **and** all are verified
   (`talukCoverage()` reports both). Currently none is fully verified.
4. Run `npm run locations:validate` and `npm test`.

Dropdown rules: the area list shows only the selected taluk's verified + provisional
areas, then **"Other area in this taluk"** last (free text, stored with `areaId = null`).
The backend re-validates: an area id from another taluk is rejected. Rows with status
`unverified` are never offered.

## Existing workers

```bash
npm run locations:audit                       # dry run
npx tsx server/scripts/auditWorkerLocations.ts --csv needs-location.csv
npx tsx server/scripts/auditWorkerLocations.ts --apply   # district spelling only
```

Statuses: `complete`, `missing_taluk`, `invalid_taluk`, `area_missing`,
`area_mismatch`, `district_not_launch`, `district_unrecognized`.
The script never assigns a taluk or area. Legacy Salem workers without a taluk
stay visible in district-level search, are excluded from taluk-filtered search,
and see a "Location incomplete" prompt in their dashboard; admins see the same
flag in the worker table.
