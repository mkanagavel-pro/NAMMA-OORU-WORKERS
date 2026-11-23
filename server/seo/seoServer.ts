/**
 * Framework-agnostic SEO responder. `respond()` maps (method, path) to a status, headers and body; the thin Express
 * adapter lives in server/routes/seo.ts. No express / mongoose imports so it is fully unit-testable.
 */
import type { DistrictInfo } from '../../src/data/tamilNaduData';
import {
  buildMeta, injectIntoTemplate, render404, renderBody, renderHead, renderRobots, renderSitemap, resolveRoute, sitemapEntries,
  type SeoConfig, type SeoStats,
} from './seoCore';

export interface SeoDeps {
  cfg: SeoConfig;
  enabled: () => DistrictInfo[];
  stats: () => Promise<SeoStats>;
  /** Built dist/index.html (with seo markers), or null when not available (development). */
  template: () => string | null;
}

export interface SeoResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

const HTML = 'text/html; charset=utf-8';

export async function respond(req: { method: string; path: string }, deps: SeoDeps): Promise<SeoResponse | null> {
  const method = req.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return null;
  const path = req.path;
  const { cfg } = deps;

  if (path === '/index.html') {
    return { status: 301, headers: { Location: '/', 'Cache-Control': 'public, max-age=3600' }, body: '' };
  }
  if (path === '/robots.txt') {
    return { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }, body: renderRobots(cfg) };
  }
  if (path === '/sitemap.xml') {
    const xml = renderSitemap(sitemapEntries(await deps.stats(), deps.enabled(), cfg));
    return { status: 200, headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }, body: xml };
  }
  if (cfg.googleVerificationFile && path === '/' + cfg.googleVerificationFile) {
    return { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }, body: `google-site-verification: ${cfg.googleVerificationFile}` };
  }
  return null;
}

/** HTML pages (home, landing pages, app shell, redirects, 404). Called after static files have had their chance. */
export async function respondHtml(req: { method: string; path: string }, deps: SeoDeps): Promise<SeoResponse | null> {
  const method = req.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return null;
  const { cfg } = deps;
  const enabled = deps.enabled();
  const route = resolveRoute(req.path, enabled);

  if (route.kind === 'redirect') {
    return { status: 301, headers: { Location: route.to, 'Cache-Control': 'public, max-age=3600' }, body: '' };
  }
  // Anything that looks like a file (has an extension) and was not served by static is a real 404, never the app shell.
  if (route.kind === 'notFound') {
    return { status: 404, headers: { 'Content-Type': HTML, 'Cache-Control': 'no-cache', 'X-Robots-Tag': 'noindex' }, body: render404(cfg) };
  }
  const template = deps.template();
  if (!template) return null;
  const stats = route.kind === 'app' ? { total: 0, lastmod: null, byCategory: {}, byCategoryDistrict: {} } : await deps.stats();
  const meta = buildMeta(route, stats, cfg);
  const html = injectIntoTemplate(template, renderHead(meta, cfg), route.kind === 'app' ? '' : renderBody(route, stats, enabled, cfg));
  const headers: Record<string, string> = { 'Content-Type': HTML, 'Cache-Control': 'no-cache' };
  if (meta.robots.startsWith('noindex')) headers['X-Robots-Tag'] = 'noindex';
  return { status: 200, headers, body: html };
}
