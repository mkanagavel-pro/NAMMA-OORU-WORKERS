# Namma Ooru Workers

A local worker discovery and connection platform for Tamil Nadu - bilingual
(Tamil/English), connecting customers with local service providers
(electricians, plumbers, carpenters, painters, and more).

## Stack

- **Frontend**: React + Vite (served by the same Express process in dev; static build in production)
- **Backend**: Express + TypeScript, run directly via `tsx` in dev, bundled via `esbuild` for production
- **Database**: MongoDB (Atlas or local) via Mongoose

## Setup

```bash
cp .env.example .env   # fill in real values, see below
npm install
npm run dev             # http://localhost:3000 - serves both API and frontend
```

### Required environment variables

- `MONGODB_URI` - MongoDB Atlas or local connection string. The server refuses to start without it.
- `JWT_SECRET` - at least 32 random characters. Generate one with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
  The server refuses to start without it (no insecure fallback exists).

### Admin bootstrap

There is no public admin signup route. On first startup, if no admin
account exists in MongoDB yet:
- **Production** (`NODE_ENV=production`): `ADMIN_EMAIL` and `ADMIN_PASSWORD` are required in `.env`, or the server refuses to start.
- **Development**: if `ADMIN_PASSWORD` is unset, a random one-time password is generated and printed once to the console. The seeded admin is flagged to require a password change on first login.

### Optional environment variables

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` - enables "Continue with Google" (server-side OAuth authorization-code flow with PKCE, state and nonce; ID token verified with `google-auth-library`). Without all three, the button is shown disabled (not faked). Setup and security notes: [docs/GOOGLE_AUTH.md](docs/GOOGLE_AUTH.md).
- `EMAIL_PROVIDER` / `EMAIL_API_KEY` - not yet wired to a real email provider; OTPs are currently delivered only through the in-app "simulated email" notification inbox (see Known limitations below).
- `GEMINI_API_KEY` - optional, server-side only; enables Gemini-assisted worker search (see **AI search** below). Everything works without it.

## Development sample data

The app starts with an **empty database** except for the bootstrapped
admin account - no demo workers, no demo customers, no fake data of any
kind. To populate realistic sample data for local testing/demoing:

```bash
npm run seed:dev
```

This is **never** run automatically (not by `npm run dev`, not by
`npm start`) and refuses to run at all if `NODE_ENV=production`. It creates
one demo customer (`customer@gmail.com` / `customer123`) and 8 demo workers
(`worker123` password) across different Tamil Nadu districts and
categories, with sample ratings.

## Production build

```bash
npm run build   # vite build (frontend) + esbuild bundle (backend) -> dist/
npm start        # runs dist/server.cjs
```

## Type checking

```bash
npm run lint     # tsc --noEmit
```

## Known limitations (as of this migration pass)

- **Email delivery is simulated**, not real. OTPs (email verification,
  password reset, etc.) are stored as in-app "email" notifications viewable
  via the notification drawer - there is no SMTP/SendGrid integration yet.
  This must be wired up before any real user relies on password reset.
- **Worker registration does not yet capture real GPS coordinates** - the
  frontend currently sends a fixed fallback coordinate (Tamil Nadu's
  approximate center) for every new worker rather than prompting for
  location permission. Distance-based search therefore won't be accurate
  until this is fixed on the frontend.
- **Mobile responsive audit not yet performed** in this pass - the app was
  not systematically tested/fixed across 320px-1280px breakpoints.
- Admin list endpoints (`/api/admin/workers`, `/customers`, `/reports`,
  `/appeals`, `/audit-logs`) are capped at 500 results rather than properly
  paginated, to avoid changing response shapes the frontend already
  depends on. Real pagination needs a coordinated frontend change.

## Worker search: launch district, areas and GPS

`GET /api/workers` is filtered, ranked and paginated on the server
(`server/services/workerSearch.ts`).

| Query param | Meaning |
|---|---|
| `district` | district id/name; omitted or `all` = every **enabled** district. A known but not-yet-enabled district returns an empty result. |
| `area` | selected area (matches `publicArea` or any `serviceAreas`, case/space-insensitive) |
| `category` | one of the ids in `WORKER_CATEGORIES` (400 otherwise) |
| `available`, `verified` | `true` / `false` |
| `lat`, `lng` | customer GPS (both required, validated ranges) |
| `radius` | km, `0 < r <= 200`, requires `lat`/`lng`; workers without valid coordinates are excluded |
| `sort` | `default`, `proximity`, `rating` |
| `page`, `limit` | 1-based page, `limit` 1-50 (default 24) |

Ordering: suspended last; Available before Offline; then nearest first when
GPS is supplied (workers without valid coordinates after those with a
distance, never labelled "Nearby"); then verified, rating count, id.
Response: `{ total, workers, page, pageSize, totalPages, hasMore }`; exact
coordinates, phone and email are never returned.

`GET /api/workers/search-config` lists the enabled districts and their real
areas (configured towns plus areas used by existing workers) for the UI.

Launch scope is `ENABLED_DISTRICTS` (default `salem`).

### Tests

```bash
npm test                                   # unit tests (no database needed)
TEST_MONGODB_URI=mongodb://127.0.0.1:27017/namma_ooru_test npm test   # + real MongoDB integration test
```

## Worker location (Salem-first)

* Worker registration and profile edits are limited to Salem district and require
  **district -> taluk -> area**, validated on the server against
  `src/data/salemLocations.ts` (13 official taluks from https://salem.nic.in/tehsil/).
* Stored on the worker: `district` (id), `taluk` (id), `areaId` (verified area id or `null`),
  `publicArea` (display name).
* Town/village lists are **not imported yet** (source pages block automated access) - workers use
  "Other area in this taluk". See `docs/SALEM_LOCATION_DATA.md` for how to add verified rows,
  `npm run locations:validate` to check the dataset, and `npm run locations:audit` for existing workers.


## AI search (Gemini Flash-Lite)

The worker search box understands Tamil script, Tanglish, English, typos and
natural-language requests (`koththukar`, `கொத்தனார்`, `plumer`, `pipe leak`,
`fan repair panna aal venum`, `veetukku paint adikka aal venum`).

**How it works** (`server/services/aiSearch.ts`, `occupationDictionary.ts`):

1. The phrase is normalised (case, spaces, punctuation).
2. A curated synonym dictionary (Tamil / Tanglish / English / misspellings, with
   typo tolerance) maps it to the app's real category ids. A clear match **never calls Gemini**.
3. Only ambiguous phrases (4+ characters) go to Gemini, and only the phrase plus the
   category list are sent - no worker data, phones, emails, tokens or user ids.
4. Gemini must return a small JSON (`intent`, `categories`, `keywords`). It is strictly
   validated server-side (known category ids only, size/shape limits, no extra fields); invalid output is discarded.
5. The resulting category ids feed the **existing MongoDB search**, so all existing rules
   (district/taluk/area, GPS radius, verification, suspension, availability, pagination) still decide who is
   shown. Gemini never returns or invents workers.
6. On timeout, quota/auth error, invalid output, rate limit, missing key or `AI_SEARCH_ENABLED=false`, the
   search silently falls back to dictionary + plain text search.

**Add or fix a synonym:** edit `CATEGORY_TERMS` in `server/services/occupationDictionary.ts` (lowercase terms; the
unit tests check every id against `WORKER_CATEGORIES`). There is currently **no Cook category**: cook terms are
understood but map to no category (text search only). Add a category to `WORKER_CATEGORIES` first if you want one.

**Setup** - put these in your own `.env` (never commit it; `.env.example` has placeholders only):

```
GEMINI_API_KEY="your-key-from-Google-AI-Studio"
GEMINI_MODEL="gemini-3.5-flash-lite"
```

Optional: `AI_SEARCH_ENABLED`, `AI_SEARCH_TIMEOUT_MS` (default 8000), `GEMINI_FALLBACK_MODEL`, `AI_SEARCH_CACHE_TTL_SECONDS` (600),
`AI_SEARCH_MIN_CHARS` (4), `AI_SEARCH_PER_IP_PER_MINUTE` (12), `AI_SEARCH_GLOBAL_PER_MINUTE` (120).

**Cost / quota protection:** the browser debounces typing (700 ms) and sends on Enter / the Search button; the
server de-duplicates identical in-flight phrases, caches identical normalised phrases (10 min), enforces per-IP and
global per-minute limits, an 8 s timeout (`AI_SEARCH_TIMEOUT_MS`), input/output size limits, and stops calling Gemini for a cool-down after a
quota/auth/timeout error (no retry storm). Google's free-tier limits and model availability can change and are not
unlimited - check <https://ai.google.dev/gemini-api/docs/rate-limits> and the model pages for current values.
Models are deprecated over time; if `gemini-3.5-flash-lite` is retired, set `GEMINI_MODEL` to a current Flash-Lite id.

The API response keeps its existing shape; an additive `interpretation` field
(`source`, `categories`, `fallback`) is included when a text query was interpreted.

### Troubleshooting AI search

Run `npm run ai:check`. It tests, in order: `.env` configuration, the SDK, DNS + HTTPS to
`generativelanguage.googleapis.com` (also lists the Flash-Lite models your key can use) and a real
search request, printing timings and the real error. It never prints the key.

Server log lines start with `[ai-search]` and say which of these happened:
* `APPLICATION TIMEOUT` - Google did not answer in time (network/firewall/proxy). Not a Google error.
* `GOOGLE API ERROR` - Google answered with an error; HTTP status, Google status and message are printed
  (bad key, quota, unknown model, bad request).
* `NETWORK ERROR` - the connection failed before any HTTP answer (DNS, TLS, offline).
* `SDK ERROR` - `@google/genai` could not be loaded (`npm install`).
Search always falls back to dictionary + text search, so the site stays usable.

## Worker categories

`WORKER_CATEGORIES` in `src/data/tamilNaduData.ts` is the single source of truth (30 categories). It feeds
registration, profile editing, the customer filter, admin filters, backend validation (`isValidCategoryId`),
the AI search vocabulary and the synonym dictionary. The customer bar shows All Workers + Electrician, Plumber,
Mason / Builder, Carpenter (`QUICK_CATEGORY_IDS`) and a searchable **More Categories** popup with the other 26.
To add a category: add it to `WORKER_CATEGORIES`, add synonyms to `CATEGORY_TERMS`
(`server/services/occupationDictionary.ts`), then run `npm test`. Existing ids must never be renamed.

## Worker authentication & recovery (V6)
See [docs/WORKER_AUTH_V6.md](docs/WORKER_AUTH_V6.md). Env: `PUBLIC_APP_URL`, `RECOVERY_LINK_TTL_MINUTES`. Migration: `npm run migrate:worker-auth` (dry run by default).
