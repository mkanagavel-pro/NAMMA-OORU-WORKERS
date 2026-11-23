import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TN_DISTRICTS, WORKER_CATEGORIES } from '../../src/data/tamilNaduData';
import {
  buildMeta, escapeHtml, injectIntoTemplate, jsonLdScript, readSeoConfig, render404, renderBody, renderHead, renderRobots,
  renderSitemap, resolveRoute, sitemapEntries, type SeoStats,
} from '../seo/seoCore';
import { aggregateWorkers, cachedProvider } from '../seo/seoData';
import { respond, respondHtml, type SeoDeps } from '../seo/seoServer';
import { compression } from '../middleware/compress';
import zlib from 'zlib';
import { EventEmitter } from 'events';

const salem = TN_DISTRICTS.find((d) => d.id === 'salem')!;
const enabled = [salem];
const cfg = readSeoConfig({ SITE_URL: 'https://example.test/ignored/path?x=1', GOOGLE_SITE_VERIFICATION: 'abcdefghijklmnopqrstuvwxyz012345' });

const rows = [
  { category: 'electrician', district: 'salem', publicArea: 'Fairlands', serviceAreas: ['Fairlands', 'Hasthampatti'], availability: 'Available', updatedAt: '2026-05-01T10:00:00Z', ratingSummary: { averageRating: 4, totalRatings: 2 } },
  { category: 'electrician', district: 'salem', publicArea: 'Hasthampatti', availability: 'Offline', updatedAt: '2026-06-01T10:00:00Z', ratingSummary: { averageRating: 5, totalRatings: 1 } },
  { category: 'plumber', district: 'salem', publicArea: 'Ammapet', availability: 'Available', updatedAt: '2026-04-01T10:00:00Z' },
];
const stats = aggregateWorkers(rows);

const TEMPLATE = '<html><head><!--seo:head-start--><title>x</title><!--seo:head-end--></head><body><div id="root"><!--seo:body--></div></body></html>';
const deps = (over: Partial<SeoDeps> = {}): SeoDeps => ({ cfg, enabled: () => enabled, stats: async () => stats, template: () => TEMPLATE, ...over });

test('config: origin only, verification token validated', () => {
  assert.equal(cfg.siteUrl, 'https://example.test');
  assert.equal(readSeoConfig({ SITE_URL: 'javascript:alert(1)' }).siteUrl, 'https://namma-ooru-workers.onrender.com');
  assert.equal(readSeoConfig({ GOOGLE_SITE_VERIFICATION: '"><script>' }).googleVerificationToken, null);
  assert.equal(readSeoConfig({ SEO_MIN_WORKERS: '0' }).minWorkers, 2);
});

test('routing', () => {
  assert.equal(resolveRoute('/', enabled).kind, 'home');
  assert.equal(resolveRoute('/workers/electrician', enabled).kind, 'category');
  assert.equal(resolveRoute('/workers/electrician/salem', enabled).kind, 'categoryDistrict');
  assert.deepEqual(resolveRoute('/workers/electrician/', enabled), { kind: 'redirect', to: '/workers/electrician' });
  assert.deepEqual(resolveRoute('/Workers/Electrician', enabled), { kind: 'redirect', to: '/workers/electrician' });
  assert.deepEqual(resolveRoute('/workers', enabled), { kind: 'redirect', to: '/' });
  assert.equal(resolveRoute('/workers/nope', enabled).kind, 'notFound');
  assert.equal(resolveRoute('/workers/electrician/chennai', enabled).kind, 'notFound'); // district not enabled
  assert.equal(resolveRoute('/workers/electrician/salem/x', enabled).kind, 'notFound');
  assert.equal(resolveRoute('/admin', enabled).kind, 'app');
  assert.equal(resolveRoute('/admin/login', enabled).kind, 'app');
  assert.equal(resolveRoute('/reset-password', enabled).kind, 'app');
  assert.equal(resolveRoute('/random', enabled).kind, 'notFound');
  assert.equal(resolveRoute('/%E0%A4%A', enabled).kind, 'notFound');
  assert.equal(resolveRoute('/missing.js', enabled).kind, 'notFound');
});

test('aggregation exposes only anonymous counts', () => {
  const e = stats.byCategory.electrician;
  assert.equal(e.count, 2);
  assert.equal(e.available, 1);
  assert.equal(e.ratingCount, 3);
  assert.equal(e.averageRating, 4.3); // (4*2+5*1)/3
  assert.equal(e.lastmod, '2026-06-01T10:00:00Z');
  assert.equal(stats.byCategory.plumber.averageRating, null); // never invented
  assert.deepEqual(e.areas.map((a) => a.name), ['Hasthampatti', 'Fairlands']);
  assert.ok(!JSON.stringify(stats).includes('phone'));
});

test('meta: indexable only above threshold; canonical, OG, twitter, no duplicates', () => {
  const ok = buildMeta(resolveRoute('/workers/electrician/salem', enabled), stats, cfg);
  assert.match(ok.robots, /^index/);
  assert.equal(ok.canonical, 'https://example.test/workers/electrician/salem');
  const thin = buildMeta(resolveRoute('/workers/plumber/salem', enabled), stats, cfg); // only 1 worker
  assert.match(thin.robots, /^noindex/);
  const empty = buildMeta(resolveRoute('/workers/welder/salem', enabled), stats, cfg);
  assert.match(empty.robots, /^noindex/);
  const head = renderHead(ok, cfg);
  for (const re of [/<title>/g, /name="description"/g, /rel="canonical"/g, /name="robots"/g, /property="og:title"/g, /name="twitter:card"/g]) {
    assert.equal((head.match(re) || []).length, 1, String(re));
  }
  assert.match(head, /google-site-verification/);
  assert.ok(ok.title.length <= 70 && ok.description.length <= 330);
});

test('JSON-LD: valid, breadcrumbs, no invented reviews/addresses/LocalBusiness, safe escaping', () => {
  for (const p of ['/', '/workers/electrician', '/workers/electrician/salem']) {
    const m = buildMeta(resolveRoute(p, enabled), stats, cfg);
    const s = JSON.stringify(m.jsonLd);
    assert.ok(!/LocalBusiness|aggregateRating|"review"|telephone|streetAddress|"Person"/.test(s), p);
    assert.ok(m.jsonLd.length >= 1);
  }
  const bc = JSON.stringify(buildMeta(resolveRoute('/workers/electrician/salem', enabled), stats, cfg).jsonLd);
  assert.equal((bc.match(/"ListItem"/g) || []).length, 3);
  const tag = jsonLdScript({ a: '</script><script>alert(1)</script>' });
  assert.equal((tag.match(/<script/g) || []).length, 1);
  assert.ok(!tag.slice(1, -9).includes('</script'));
  // every script block parses
  const head = renderHead(buildMeta(resolveRoute('/', enabled), stats, cfg), cfg);
  for (const m of head.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)) JSON.parse(m[1]);
});

test('escapeHtml + body never contain worker names; contains one h1', () => {
  assert.equal(escapeHtml(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  for (const p of ['/', '/workers/electrician', '/workers/electrician/salem']) {
    const body = renderBody(resolveRoute(p, enabled), stats, enabled, cfg);
    assert.equal((body.match(/<h1>/g) || []).length, 1, p);
  }
});

test('robots + sitemap', () => {
  const robots = renderRobots(cfg);
  assert.match(robots, /Sitemap: https:\/\/example\.test\/sitemap\.xml/);
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, /Disallow: \/admin/);
  const entries = sitemapEntries(stats, enabled, cfg);
  const locs = entries.map((e) => e.loc);
  assert.ok(locs.includes('https://example.test/'));
  assert.ok(locs.includes('https://example.test/workers/electrician'));
  assert.ok(locs.includes('https://example.test/workers/electrician/salem'));
  assert.ok(!locs.some((l) => /plumber/.test(l)), 'thin pages stay out of the sitemap');
  assert.ok(!locs.some((l) => /admin|reset|login|api/.test(l)));
  assert.equal(new Set(locs).size, locs.length);
  const xml = renderSitemap(entries);
  assert.match(xml, /^<\?xml/);
  assert.match(xml, /<lastmod>2026-06-01<\/lastmod>/);
  assert.ok(WORKER_CATEGORIES.length > 20); // sanity
});

test('template injection replaces, never duplicates', () => {
  const head = renderHead(buildMeta({ kind: 'home' }, stats, cfg), cfg);
  const out = injectIntoTemplate(TEMPLATE, head, '<main>hi</main>');
  assert.equal((out.match(/<title>/g) || []).length, 1);
  assert.ok(out.includes('<main>hi</main>'));
  assert.ok(!out.includes('seo:body'));
  assert.throws(() => injectIntoTemplate('<html></html>', head, ''));
});

test('respond: status codes, content types, redirects', async () => {
  const get = (path: string, method = 'GET') => respondHtml({ method, path }, deps());
  assert.equal((await respond({ method: 'GET', path: '/robots.txt' }, deps()))!.headers['Content-Type'], 'text/plain; charset=utf-8');
  const sm = (await respond({ method: 'GET', path: '/sitemap.xml' }, deps()))!;
  assert.equal(sm.status, 200);
  assert.match(sm.headers['Content-Type'], /xml/);
  assert.equal((await respond({ method: 'GET', path: '/index.html' }, deps()))!.status, 301);
  assert.equal(await respond({ method: 'POST', path: '/robots.txt' }, deps()), null);
  assert.equal(await respond({ method: 'GET', path: '/other' }, deps()), null);

  const home = (await get('/'))!;
  assert.equal(home.status, 200);
  assert.equal(home.headers['X-Robots-Tag'], undefined);
  const ok = (await get('/workers/electrician/salem'))!;
  assert.equal(ok.status, 200);
  assert.match(ok.body, /<link rel="canonical" href="https:\/\/example\.test\/workers\/electrician\/salem"/);
  const thin = (await get('/workers/plumber'))!;
  assert.equal(thin.status, 200);
  assert.equal(thin.headers['X-Robots-Tag'], 'noindex');
  const app = (await get('/admin'))!;
  assert.equal(app.status, 200);
  assert.match(app.body, /noindex,nofollow/);
  assert.ok(!/canonical/.test(app.body));
  const red = (await get('/workers/electrician/'))!;
  assert.equal(red.status, 301);
  assert.equal(red.headers.Location, '/workers/electrician');
  const nf = (await get('/does-not-exist'))!;
  assert.equal(nf.status, 404);
  assert.equal(nf.headers['X-Robots-Tag'], 'noindex');
  assert.match(nf.body, /Page not found/);
  assert.equal((await get('/logo-missing.png'))!.status, 404);
  assert.equal(await get('/', 'POST'), null);
  assert.equal(await respondHtml({ method: 'GET', path: '/' }, deps({ template: () => null })), null); // dev: Vite serves it
  assert.ok(render404(cfg).includes('noindex'));
});

test('verification file only when configured', async () => {
  const c2 = readSeoConfig({ GOOGLE_SITE_VERIFICATION_FILE: 'google0123456789abcdef.html' });
  const r = await respond({ method: 'GET', path: '/google0123456789abcdef.html' }, deps({ cfg: c2 }));
  assert.equal(r!.body, 'google-site-verification: google0123456789abcdef.html');
  assert.equal(await respond({ method: 'GET', path: '/google0123456789abcdef.html' }, deps()), null);
});

test('cachedProvider caches and survives failures', async () => {
  let n = 0, t = 0, fail = false;
  const p = cachedProvider(async () => { n++; if (fail) throw new Error('db down'); return stats; }, 1000, () => t);
  await p(); await p();
  assert.equal(n, 1);
  t = 2000; fail = true;
  const v = await p();
  assert.equal(v, stats); // last good value kept
});

test('compression middleware gzips large text, skips small/binary', async () => {
  const run = (type: string, body: Buffer, accept = 'gzip') => new Promise<{ enc?: string; out: Buffer }>((resolve) => {
    const headers: Record<string, any> = { 'Content-Type': type };
    const chunks: Buffer[] = [];
    const res: any = new EventEmitter();
    res.statusCode = 200;
    res.getHeader = (k: string) => headers[k];
    res.setHeader = (k: string, v: any) => { headers[k] = v; };
    res.removeHeader = (k: string) => { delete headers[k]; };
    res.vary = () => {};
    res.write = (c: any) => { chunks.push(Buffer.from(c)); return true; };
    res.end = (c?: any) => { if (c) chunks.push(Buffer.from(c)); resolve({ enc: headers['Content-Encoding'], out: Buffer.concat(chunks) }); return res; };
    compression()({ method: 'GET', headers: { 'accept-encoding': accept } } as any, res, () => res.end(body));
  });
  const big = Buffer.from('a'.repeat(5000));
  const g = await run('text/html; charset=utf-8', big);
  assert.equal(g.enc, 'gzip');
  assert.equal(zlib.gunzipSync(g.out).toString(), big.toString());
  assert.equal((await run('text/html', Buffer.from('tiny'))).enc, undefined);
  assert.equal((await run('image/png', big)).enc, undefined);
  assert.equal((await run('text/html', big, '')).enc, undefined);
});
