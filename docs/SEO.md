# SEO implementation

## How Google sees the site
The app is a single-page React app. Before this change every URL returned an empty `<div id="root">` with HTTP 200
(including unknown URLs), so crawlers relied entirely on JavaScript rendering and soft-404s were possible.

Now (production only) Express injects per-route `<title>`, description, canonical, robots, Open Graph/Twitter tags,
JSON-LD and readable HTML into `dist/index.html` before sending it (`server/seo/*`, `server/routes/seo.ts`).
React still mounts with `createRoot` and replaces the injected HTML, so the client app is unchanged.

| URL | Result |
|---|---|
| `/` | 200, indexable |
| `/workers/<category>` and `/workers/<category>/<district>` | 200; indexable only with >= `SEO_MIN_WORKERS` verified workers, else `noindex,follow` and left out of the sitemap |
| `/admin`, `/admin/login`, `/reset-password` | 200 app shell, `noindex,nofollow`, disallowed in robots.txt |
| `/Workers/X`, trailing slash, `/index.html`, `/workers` | 301 to the canonical form |
| anything else (also missing files, unknown `/api/*`) | real 404 (HTML page, or JSON for `/api`) |

Landing pages open the normal search UI with the category / district preselected.

## Decisions
* **No per-worker pages, no LocalBusiness schema.** Workers have no public address or phone, profiles have no URLs, and
  the registration consent covers publishing on the platform, not search-engine indexing. Landing pages show only
  anonymous aggregates (counts, public service-area names, real average rating when ratings exist). No worker names.
* Structured data: Organization, WebSite, WebPage (home); CollectionPage + BreadcrumbList (landing pages). No invented ratings/reviews.
* Only districts in `ENABLED_DISTRICTS` get pages (default Salem). Tamil text is included naturally in titles/body.
* robots.txt and sitemap.xml are generated (`/robots.txt`, `/sitemap.xml`) from live data, cached 10 min. They are served
  before static files, so any old `public/robots.txt` / `public/sitemap.xml` is ignored; delete them from the repo
  (they were not in the project zip, only in your GitHub copy).

## Performance
gzip/brotli for text responses, immutable one-year cache for hashed `/assets/*`, admin / worker dashboard / reset /
admin-login code split with `React.lazy`, lazy-loaded worker photos, a single `<h1>` per view.

## Google Search Console
1. Set `SITE_URL` on Render to the final public origin (custom domain if you add one).
2. Add property. *URL prefix* with the Render URL works. Verify with ONE of:
   * HTML tag: put the token (content value only) in `GOOGLE_SITE_VERIFICATION`, redeploy, Verify.
   * HTML file: put the file name (e.g. `google0123456789abcdef.html`) in `GOOGLE_SITE_VERIFICATION_FILE`; the server answers that URL with the required content.
   * Domain property (custom domain): DNS TXT record at your registrar.
3. Sitemaps -> submit `sitemap.xml`. 4. URL Inspection -> test live URL on `/` and a landing page.
Landing pages appear in the sitemap only once enough verified workers exist, so a brand-new site will list just `/`.

## Pending / not done
* Google Fonts are blocked by the production CSP (`styleSrc` lacks https://fonts.googleapis.com, no `fontSrc` for https://fonts.gstatic.com). Left unchanged as requested; one-line fix when you approve.
* A dedicated 1200x630 social image would improve link previews (the logo is used now).
