/**
 * SEO core: URL rules, page metadata, JSON-LD and the readable HTML that is injected into the SPA shell.
 *
 * Deliberately has NO express / mongoose imports so every rule can be unit-tested without a server or database
 * (see server/tests/seo.test.ts). Nothing here ever receives a worker's name, phone, e-mail, exact location or
 * any other private field: the data provider only hands over anonymous aggregates (see seoData.ts).
 *
 * Page types
 *   /                              home (always indexable)
 *   /workers/<category>            category landing page      (indexable only when enough verified workers exist)
 *   /workers/<category>/<district> category + district page   (indexable only when enough verified workers exist)
 *   /admin, /admin/login, /reset-password   app shell, never indexed
 *   anything else                  real 404
 */
import { TN_DISTRICTS, WORKER_CATEGORIES, type DistrictInfo, type WorkerCategoryInfo } from '../../src/data/tamilNaduData';

export const SITE_NAME = 'Namma Ooru Workers';
export const SITE_NAME_TA = 'நம் ஊரு ஒர்க்கர்ஸ்';
export const DEFAULT_SITE_URL = 'https://namma-ooru-workers.onrender.com';
/** A category / category+district page is only indexed (and listed in the sitemap) when at least this many verified workers back it. */
export const DEFAULT_MIN_WORKERS = 2;

// ---------------------------------------------------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------------------------------------------------

export interface SeoConfig {
  /** Canonical origin, no trailing slash, e.g. https://namma-ooru-workers.onrender.com */
  siteUrl: string;
  minWorkers: number;
  /** Optional Google Search Console HTML-tag verification token (the content="..." value). */
  googleVerificationToken: string | null;
  /** Optional Google Search Console HTML-file verification name, e.g. google0123456789abcdef.html */
  googleVerificationFile: string | null;
}

export function readSeoConfig(env: Record<string, string | undefined> = process.env): SeoConfig {
  const raw = (env.SITE_URL || env.APP_URL || DEFAULT_SITE_URL).trim();
  let siteUrl = DEFAULT_SITE_URL;
  try {
    const u = new URL(raw);
    // Only http(s) origins are accepted; any path/query/hash on the value is dropped.
    if (u.protocol === 'https:' || u.protocol === 'http:') siteUrl = u.origin;
  } catch {
    /* keep default */
  }
  const min = Number.parseInt(env.SEO_MIN_WORKERS ?? '', 10);
  const tok = (env.GOOGLE_SITE_VERIFICATION ?? '').trim();
  const file = (env.GOOGLE_SITE_VERIFICATION_FILE ?? '').trim();
  return {
    siteUrl,
    minWorkers: Number.isFinite(min) && min >= 1 ? min : DEFAULT_MIN_WORKERS,
    googleVerificationToken: /^[A-Za-z0-9_-]{20,100}$/.test(tok) ? tok : null,
    googleVerificationFile: /^google[a-z0-9]{8,64}\.html$/i.test(file) ? file : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Aggregates supplied by the data layer (anonymous: counts, area names, dates - never individual workers)
// ---------------------------------------------------------------------------------------------------------------------

export interface PageStats {
  /** Verified, not-suspended workers behind this page. */
  count: number;
  available: number;
  /** Ratings actually submitted by customers (0 when none). */
  ratingCount: number;
  /** Weighted average of real ratings, or null when there are none. Never invented. */
  averageRating: number | null;
  /** Public service areas (already public on worker cards) with how many verified workers list them. */
  areas: Array<{ name: string; count: number }>;
  /** ISO date of the most recent profile change, or null. */
  lastmod: string | null;
}

export interface SeoStats {
  total: number;
  lastmod: string | null;
  byCategory: Record<string, PageStats>;
  /** key = `${categoryId}|${districtId}` */
  byCategoryDistrict: Record<string, PageStats>;
}

export const EMPTY_STATS: SeoStats = { total: 0, lastmod: null, byCategory: {}, byCategoryDistrict: {} };

// ---------------------------------------------------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------------------------------------------------

export type SeoRoute =
  | { kind: 'home' }
  | { kind: 'category'; category: WorkerCategoryInfo }
  | { kind: 'categoryDistrict'; category: WorkerCategoryInfo; district: DistrictInfo }
  | { kind: 'app' } // admin / reset-password: SPA shell, noindex
  | { kind: 'redirect'; to: string }
  | { kind: 'notFound' };

const APP_PATHS = new Set(['/admin', '/admin/login', '/reset-password']);

export function categoryById(id: string): WorkerCategoryInfo | undefined {
  return WORKER_CATEGORIES.find((c) => c.id === id);
}

/** Resolve a request path (no query string) to a route. Pure: `enabled` are the districts open for public search. */
export function resolveRoute(rawPath: string, enabled: DistrictInfo[]): SeoRoute {
  let p = rawPath || '/';
  try {
    p = decodeURIComponent(p);
  } catch {
    return { kind: 'notFound' };
  }
  if (!p.startsWith('/') || /[\u0000-\u001f]/.test(p)) return { kind: 'notFound' };

  // One canonical form: collapse duplicate slashes, drop a trailing slash, lower-case.
  const canonical = ('/' + p.split('/').filter(Boolean).join('/')).toLowerCase();
  if (canonical !== p && p !== '/') return { kind: 'redirect', to: canonical };
  if (p === '/') return { kind: 'home' };
  if (APP_PATHS.has(canonical)) return { kind: 'app' };

  const parts = canonical.split('/').filter(Boolean);
  if (parts[0] === 'workers') {
    if (parts.length === 1) return { kind: 'redirect', to: '/' }; // there is no workers index page
    const category = categoryById(parts[1]);
    if (!category) return { kind: 'notFound' };
    if (parts.length === 2) return { kind: 'category', category };
    if (parts.length === 3) {
      const district = enabled.find((d) => d.id === parts[2]);
      return district ? { kind: 'categoryDistrict', category, district } : { kind: 'notFound' };
    }
  }
  return { kind: 'notFound' };
}

export function categoryPath(c: WorkerCategoryInfo): string {
  return `/workers/${c.id}`;
}
export function categoryDistrictPath(c: WorkerCategoryInfo, d: DistrictInfo): string {
  return `/workers/${c.id}/${d.id}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------------------------------------------------

/** "Mason / Builder" -> "Mason / Builder"; Tamil names already contain the English term after a slash. */
function taShort(c: WorkerCategoryInfo): string {
  return c.nameTa;
}

// ---------------------------------------------------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------------------------------------------------

export function escapeHtml(v: string): string {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** JSON for a <script type="application/ld+json"> block: "<" is escaped so the data can never close the tag. */
export function jsonLdScript(obj: unknown): string {
  const json = JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `<script type="application/ld+json">${json}</script>`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Page model
// ---------------------------------------------------------------------------------------------------------------------

export interface PageMeta {
  title: string;
  description: string;
  /** Absolute canonical URL, or null for pages that must not declare one (404). */
  canonical: string | null;
  robots: string; // e.g. "index,follow" | "noindex,nofollow"
  /** Structured data objects (serialised by renderHead). */
  jsonLd: unknown[];
}

const article = (w: string) => (/^[aeiou]/i.test(w) ? 'an' : 'a');

export function isIndexable(stats: PageStats | undefined, cfg: SeoConfig): boolean {
  return !!stats && stats.count >= cfg.minWorkers;
}

const HOME_DESCRIPTION =
  'Find trusted local workers in Tamil Nadu: electricians, plumbers, masons, painters, carpenters, drivers, cooks and more. ' +
  'Search by area, view admin-verified profiles and ratings, and contact workers directly by call or WhatsApp. ' +
  'நம்பகமான உள்ளூர் பணியாளர்களைக் கண்டறியுங்கள்.';

export function buildMeta(route: SeoRoute, stats: SeoStats, cfg: SeoConfig): PageMeta {
  const abs = (path: string) => cfg.siteUrl + (path === '/' ? '/' : path);
  const logo = `${cfg.siteUrl}/logo-official.png`;

  const organization = {
    '@type': 'Organization',
    '@id': `${cfg.siteUrl}/#organization`,
    name: SITE_NAME,
    alternateName: SITE_NAME_TA,
    url: cfg.siteUrl + '/',
    logo,
    areaServed: { '@type': 'State', name: 'Tamil Nadu' },
  };
  const website = {
    '@type': 'WebSite',
    '@id': `${cfg.siteUrl}/#website`,
    url: cfg.siteUrl + '/',
    name: SITE_NAME,
    alternateName: SITE_NAME_TA,
    inLanguage: ['en', 'ta'],
    publisher: { '@id': `${cfg.siteUrl}/#organization` },
  };

  switch (route.kind) {
    case 'home':
      return {
        title: `${SITE_NAME} | Find Trusted Local Workers in Tamil Nadu`,
        description: HOME_DESCRIPTION,
        canonical: abs('/'),
        robots: 'index,follow,max-image-preview:large',
        jsonLd: [
          { '@context': 'https://schema.org', '@graph': [organization, website, { '@type': 'WebPage', '@id': `${cfg.siteUrl}/#webpage`, url: cfg.siteUrl + '/', name: `${SITE_NAME} - Trusted Local Workers in Tamil Nadu`, isPartOf: { '@id': `${cfg.siteUrl}/#website` }, inLanguage: 'en' }] },
        ],
      };

    case 'category': {
      const s = stats.byCategory[route.category.id];
      const name = route.category.nameEn;
      const path = categoryPath(route.category);
      return {
        title: `${name} in Tamil Nadu | ${SITE_NAME}`,
        description:
          `Find ${article(name)} ${name.toLowerCase()} near you in Tamil Nadu on ${SITE_NAME}. ` +
          (s && s.count > 0 ? `${s.count} admin-verified ${s.count === 1 ? 'worker is' : 'workers are'} listed. ` : '') +
          `Compare profiles and contact workers directly by call or WhatsApp. ${taShort(route.category)}.`,
        canonical: abs(path),
        robots: isIndexable(s, cfg) ? 'index,follow,max-image-preview:large' : 'noindex,follow',
        jsonLd: [
          {
            '@context': 'https://schema.org',
            '@graph': [
              { '@type': 'CollectionPage', '@id': `${abs(path)}#webpage`, url: abs(path), name: `${name} in Tamil Nadu`, isPartOf: { '@id': `${cfg.siteUrl}/#website` }, inLanguage: 'en' },
              breadcrumb(cfg, [['Home', '/'], [name, path]]),
            ],
          },
        ],
      };
    }

    case 'categoryDistrict': {
      const s = stats.byCategoryDistrict[`${route.category.id}|${route.district.id}`];
      const name = route.category.nameEn;
      const place = route.district.nameEn;
      const path = categoryDistrictPath(route.category, route.district);
      return {
        title: `${name} in ${place} | ${SITE_NAME}`,
        description:
          `Find ${article(name)} ${name.toLowerCase()} in ${place}, Tamil Nadu. ` +
          (s && s.count > 0 ? `${s.count} admin-verified ${s.count === 1 ? 'worker is' : 'workers are'} listed on ${SITE_NAME}. ` : '') +
          `Contact workers directly by call or WhatsApp. ${route.district.nameTa} - ${taShort(route.category)}.`,
        canonical: abs(path),
        robots: isIndexable(s, cfg) ? 'index,follow,max-image-preview:large' : 'noindex,follow',
        jsonLd: [
          {
            '@context': 'https://schema.org',
            '@graph': [
              { '@type': 'CollectionPage', '@id': `${abs(path)}#webpage`, url: abs(path), name: `${name} in ${place}`, isPartOf: { '@id': `${cfg.siteUrl}/#website` }, inLanguage: 'en', about: { '@type': 'Place', name: `${place}, Tamil Nadu` } },
              breadcrumb(cfg, [['Home', '/'], [name, categoryPath(route.category)], [place, path]]),
            ],
          },
        ],
      };
    }

    case 'app':
      return { title: `${SITE_NAME}`, description: HOME_DESCRIPTION, canonical: null, robots: 'noindex,nofollow', jsonLd: [] };

    default:
      return { title: `Page not found | ${SITE_NAME}`, description: 'The page you are looking for does not exist.', canonical: null, robots: 'noindex,nofollow', jsonLd: [] };
  }
}

function breadcrumb(cfg: SeoConfig, items: Array<[string, string]>) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: cfg.siteUrl + (path === '/' ? '/' : path) })),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// <head> and body HTML
// ---------------------------------------------------------------------------------------------------------------------

/** Everything between the seo:head markers of index.html. Replaces (never duplicates) the static defaults. */
export function renderHead(meta: PageMeta, cfg: SeoConfig): string {
  const e = escapeHtml;
  const lines = [
    `<title>${e(meta.title)}</title>`,
    `<meta name="description" content="${e(meta.description)}" />`,
    `<meta name="robots" content="${e(meta.robots)}" />`,
  ];
  if (meta.canonical) lines.push(`<link rel="canonical" href="${e(meta.canonical)}" />`);
  if (cfg.googleVerificationToken) lines.push(`<meta name="google-site-verification" content="${e(cfg.googleVerificationToken)}" />`);
  // Open Graph / Twitter only for pages that are meant to be shared.
  if (meta.canonical) {
    lines.push(
      `<meta property="og:site_name" content="${e(SITE_NAME)}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:title" content="${e(meta.title)}" />`,
      `<meta property="og:description" content="${e(meta.description)}" />`,
      `<meta property="og:url" content="${e(meta.canonical)}" />`,
      `<meta property="og:image" content="${e(cfg.siteUrl + '/logo-official.png')}" />`,
      `<meta property="og:image:alt" content="${e(SITE_NAME + ' logo')}" />`,
      `<meta property="og:locale" content="en_IN" />`,
      `<meta property="og:locale:alternate" content="ta_IN" />`,
      `<meta name="twitter:card" content="summary" />`,
      `<meta name="twitter:title" content="${e(meta.title)}" />`,
      `<meta name="twitter:description" content="${e(meta.description)}" />`,
      `<meta name="twitter:image" content="${e(cfg.siteUrl + '/logo-official.png')}" />`
    );
  }
  for (const obj of meta.jsonLd) lines.push(jsonLdScript(obj));
  return lines.join('\n    ');
}

const STYLE =
  'font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Tamil","Noto Sans",sans-serif;max-width:56rem;margin:0 auto;padding:1.25rem 1rem 3rem;color:#26332D;line-height:1.6;background:#FAF7EF';

function categoryLinks(districtId?: string): string {
  return WORKER_CATEGORIES.map((c) => `<li><a href="${districtId ? `/workers/${c.id}/${districtId}` : `/workers/${c.id}`}">${escapeHtml(c.nameEn)}</a> <span lang="ta">(${escapeHtml(c.nameTa)})</span></li>`).join('');
}

function areaList(stats: PageStats): string {
  if (stats.areas.length === 0) return '';
  const items = stats.areas.slice(0, 30).map((a) => `<li>${escapeHtml(a.name)} (${a.count})</li>`).join('');
  return `<h2>Areas covered</h2><ul>${items}</ul>`;
}

function statsParagraph(stats: PageStats | undefined, label: string): string {
  if (!stats || stats.count === 0) {
    return `<p>No admin-verified ${escapeHtml(label)} are listed here yet. Try the full search below or another area.</p>`;
  }
  const bits = [`${stats.count} admin-verified ${stats.count === 1 ? 'worker' : 'workers'} listed`];
  if (stats.available > 0) bits.push(`${stats.available} currently marked available`);
  if (stats.ratingCount > 0 && stats.averageRating !== null) bits.push(`average customer rating ${stats.averageRating.toFixed(1)} from ${stats.ratingCount} ${stats.ratingCount === 1 ? 'rating' : 'ratings'}`);
  return `<p>${escapeHtml(bits.join(' · '))}.</p>`;
}

/** Readable HTML placed inside <div id="root">. React replaces it when the app mounts (createRoot, no hydration). */
export function renderBody(route: SeoRoute, stats: SeoStats, enabled: DistrictInfo[], cfg: SeoConfig): string {
  const e = escapeHtml;
  const howItWorks =
    '<h2>How it works</h2><ol>' +
    '<li>Choose a category and your area.</li>' +
    '<li>Open a worker profile to see the work done, experience, rate and customer ratings.</li>' +
    '<li>Contact the worker directly by call or WhatsApp - no commission, no middleman.</li>' +
    '</ol><p>Workers marked <strong>Verified</strong> have had their profile approved by the Namma Ooru Workers admin team.</p>';

  switch (route.kind) {
    case 'home': {
      const places = enabled.map((d) => e(d.nameEn)).join(', ');
      return (
        `<main style="${STYLE}">` +
        `<h1>Find trusted local workers in Tamil Nadu</h1>` +
        `<p lang="ta">${e(SITE_NAME_TA)} - நம்பகமான உள்ளூர் பணியாளர்களைக் கண்டறியுங்கள்.</p>` +
        `<p>${e(SITE_NAME)} connects customers with local electricians, plumbers, masons, painters, carpenters, drivers, cooks and other service providers${places ? ` in ${places}` : ''}. Search by area, check verified profiles and ratings, and contact workers directly.</p>` +
        `<h2>Worker categories</h2><ul>${categoryLinks()}</ul>` +
        howItWorks +
        `<noscript><p>Please enable JavaScript to search and contact workers.</p></noscript>` +
        `</main>`
      );
    }
    case 'category': {
      const s = stats.byCategory[route.category.id];
      return (
        `<main style="${STYLE}">` +
        `<nav aria-label="Breadcrumb"><a href="/">Home</a> › ${e(route.category.nameEn)}</nav>` +
        `<h1>${e(route.category.nameEn)} in Tamil Nadu</h1>` +
        `<p lang="ta">${e(route.category.nameTa)}</p>` +
        statsParagraph(s, route.category.nameEn.toLowerCase() + ' workers') +
        (enabled.length ? `<h2>Choose a district</h2><ul>${enabled.map((d) => `<li><a href="${categoryDistrictPath(route.category, d)}">${e(route.category.nameEn)} in ${e(d.nameEn)}</a> <span lang="ta">(${e(d.nameTa)})</span></li>`).join('')}</ul>` : '') +
        (s ? areaList(s) : '') +
        howItWorks +
        `<p><a href="/">Search all worker categories</a></p>` +
        `<noscript><p>Please enable JavaScript to search and contact workers.</p></noscript>` +
        `</main>`
      );
    }
    case 'categoryDistrict': {
      const s = stats.byCategoryDistrict[`${route.category.id}|${route.district.id}`];
      return (
        `<main style="${STYLE}">` +
        `<nav aria-label="Breadcrumb"><a href="/">Home</a> › <a href="${categoryPath(route.category)}">${e(route.category.nameEn)}</a> › ${e(route.district.nameEn)}</nav>` +
        `<h1>${e(route.category.nameEn)} in ${e(route.district.nameEn)}</h1>` +
        `<p lang="ta">${e(route.district.nameTa)} - ${e(route.category.nameTa)}</p>` +
        statsParagraph(s, route.category.nameEn.toLowerCase() + ' workers in ' + route.district.nameEn) +
        (s ? areaList(s) : '') +
        howItWorks +
        `<h2>Other categories in ${e(route.district.nameEn)}</h2><ul>${categoryLinks(route.district.id)}</ul>` +
        `<noscript><p>Please enable JavaScript to search and contact workers.</p></noscript>` +
        `</main>`
      );
    }
    default:
      return '';
  }
}

/** Standalone page for real 404s (no JavaScript, no app shell). */
export function render404(cfg: SeoConfig): string {
  const meta = buildMeta({ kind: 'notFound' }, EMPTY_STATS, cfg);
  return (
    `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />` +
    `${renderHead(meta, cfg)}<link rel="icon" type="image/svg+xml" href="/logo.svg" /></head><body>` +
    `<main style="${STYLE}"><h1>Page not found</h1><p lang="ta">பக்கம் கிடைக்கவில்லை.</p>` +
    `<p>The page you asked for does not exist or has moved.</p><p><a href="/">Go to the ${escapeHtml(SITE_NAME)} home page</a></p></main></body></html>`
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Template injection
// ---------------------------------------------------------------------------------------------------------------------

export const HEAD_START = '<!--seo:head-start-->';
export const HEAD_END = '<!--seo:head-end-->';
export const BODY_MARK = '<!--seo:body-->';

/** Replace the head block and the body marker of the built index.html. Throws if the template lacks the markers. */
export function injectIntoTemplate(template: string, head: string, body: string): string {
  const a = template.indexOf(HEAD_START);
  const b = template.indexOf(HEAD_END);
  if (a < 0 || b < a || !template.includes(BODY_MARK)) throw new Error('index.html is missing the seo markers');
  return template.slice(0, a) + head + template.slice(b + HEAD_END.length).replace(BODY_MARK, body);
}

// ---------------------------------------------------------------------------------------------------------------------
// robots.txt and sitemap.xml
// ---------------------------------------------------------------------------------------------------------------------

export function renderRobots(cfg: SeoConfig): string {
  return [
    '# robots.txt for ' + cfg.siteUrl,
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /admin',
    'Disallow: /reset-password',
    '',
    `Sitemap: ${cfg.siteUrl}/sitemap.xml`,
    '',
  ].join('\n');
}

export interface SitemapEntry {
  loc: string;
  lastmod: string | null;
}

export function sitemapEntries(stats: SeoStats, enabled: DistrictInfo[], cfg: SeoConfig): SitemapEntry[] {
  const out: SitemapEntry[] = [{ loc: cfg.siteUrl + '/', lastmod: stats.lastmod }];
  for (const c of WORKER_CATEGORIES) {
    const s = stats.byCategory[c.id];
    if (isIndexable(s, cfg)) out.push({ loc: cfg.siteUrl + categoryPath(c), lastmod: s!.lastmod });
    for (const d of enabled) {
      const sd = stats.byCategoryDistrict[`${c.id}|${d.id}`];
      if (isIndexable(sd, cfg)) out.push({ loc: cfg.siteUrl + categoryDistrictPath(c, d), lastmod: sd!.lastmod });
    }
  }
  return out;
}

function w3cDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function renderSitemap(entries: SitemapEntry[]): string {
  const rows = entries
    .map((en) => {
      const lm = w3cDate(en.lastmod);
      return `  <url><loc>${escapeHtml(en.loc)}</loc>${lm ? `<lastmod>${lm}</lastmod>` : ''}</url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows}\n</urlset>\n`;
}

export { TN_DISTRICTS };
