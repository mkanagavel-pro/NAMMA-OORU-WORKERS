/**
 * SEO data layer: anonymous aggregates only.
 *
 * Only verified, not-suspended workers in publicly enabled districts are counted - the same visibility rule as
 * public search. Individual worker names, phones, coordinates or ids NEVER leave this module: callers receive
 * counts, public service-area names (already shown on public worker cards), availability and real rating averages.
 *
 * `aggregateWorkers` is pure (unit-tested). `createMongoStatsProvider` loads rows lazily and caches the result.
 */
import type { SeoStats, PageStats } from './seoCore';
import { EMPTY_STATS } from './seoCore';

export interface WorkerSeoRow {
  category: string;
  district: string;
  publicArea?: string | null;
  serviceAreas?: string[] | null;
  availability?: string | null;
  updatedAt?: string | null;
  ratingSummary?: { averageRating?: number | null; totalRatings?: number | null } | null;
}

interface Acc {
  count: number;
  available: number;
  ratingCount: number;
  ratingSum: number;
  areas: Map<string, number>;
  lastmod: string | null;
}

const newAcc = (): Acc => ({ count: 0, available: 0, ratingCount: 0, ratingSum: 0, areas: new Map(), lastmod: null });

function add(acc: Acc, w: WorkerSeoRow) {
  acc.count += 1;
  if (w.availability === 'Available') acc.available += 1;
  const n = Number(w.ratingSummary?.totalRatings ?? 0);
  const avg = Number(w.ratingSummary?.averageRating ?? 0);
  if (Number.isFinite(n) && n > 0 && Number.isFinite(avg) && avg > 0) {
    acc.ratingCount += n;
    acc.ratingSum += avg * n;
  }
  const names = new Set<string>();
  for (const a of [w.publicArea, ...(w.serviceAreas ?? [])]) {
    const t = typeof a === 'string' ? a.trim() : '';
    if (t && t.length <= 60) names.add(t);
  }
  for (const nm of names) acc.areas.set(nm, (acc.areas.get(nm) ?? 0) + 1);
  if (w.updatedAt && (!acc.lastmod || w.updatedAt > acc.lastmod)) acc.lastmod = w.updatedAt;
}

function finish(a: Acc): PageStats {
  return {
    count: a.count,
    available: a.available,
    ratingCount: a.ratingCount,
    averageRating: a.ratingCount > 0 ? Math.round((a.ratingSum / a.ratingCount) * 10) / 10 : null,
    areas: [...a.areas.entries()].map(([name, count]) => ({ name, count })).sort((x, y) => y.count - x.count || x.name.localeCompare(y.name)),
    lastmod: a.lastmod,
  };
}

/** rows must already be filtered to verified, non-suspended workers in enabled districts. */
export function aggregateWorkers(rows: WorkerSeoRow[]): SeoStats {
  const cat = new Map<string, Acc>();
  const catDist = new Map<string, Acc>();
  let total = 0;
  let lastmod: string | null = null;
  for (const w of rows) {
    if (!w.category || !w.district) continue;
    total += 1;
    if (w.updatedAt && (!lastmod || w.updatedAt > lastmod)) lastmod = w.updatedAt;
    const c = cat.get(w.category) ?? newAcc();
    add(c, w);
    cat.set(w.category, c);
    const k = `${w.category}|${w.district}`;
    const cd = catDist.get(k) ?? newAcc();
    add(cd, w);
    catDist.set(k, cd);
  }
  const byCategory: Record<string, PageStats> = {};
  const byCategoryDistrict: Record<string, PageStats> = {};
  for (const [k, v] of cat) byCategory[k] = finish(v);
  for (const [k, v] of catDist) byCategoryDistrict[k] = finish(v);
  return { total, lastmod, byCategory, byCategoryDistrict };
}

export type StatsProvider = () => Promise<SeoStats>;

/** Cached provider. Failures serve the last good value (or empty stats) so the site never breaks because of SEO. */
export function cachedProvider(load: () => Promise<SeoStats>, ttlMs = 10 * 60 * 1000, now: () => number = Date.now): StatsProvider {
  let value: SeoStats = EMPTY_STATS;
  let at = 0;
  let loaded = false;
  let inflight: Promise<SeoStats> | null = null;
  return async () => {
    if (loaded && now() - at < ttlMs) return value;
    if (!inflight) {
      inflight = load()
        .then((v) => {
          value = v;
          at = now();
          loaded = true;
          return v;
        })
        .catch((err) => {
          console.error('[seo] stats load failed:', err?.message || err);
          at = now() - ttlMs + 60 * 1000; // retry in a minute
          return value;
        })
        .finally(() => {
          inflight = null;
        });
    }
    return inflight;
  };
}

export function createMongoStatsProvider(enabled: () => Array<{ id: string; nameEn: string }>, ttlMs?: number): StatsProvider {
  return cachedProvider(async () => {
    const { WorkerModel } = await import('../models/Worker');
    const districts = enabled();
    // Workers store the district by English name (legacy spellings differ in case/whitespace) - match like public search does.
    const alt = districts.map((d) => d.nameEn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const rows = (await WorkerModel.find(
      { verificationStatus: 'verified', isSuspended: false, district: { $regex: `^\\s*(?:${alt})\\s*$`, $options: 'i' } },
      { category: 1, district: 1, publicArea: 1, serviceAreas: 1, availability: 1, updatedAt: 1, 'ratingSummary.averageRating': 1, 'ratingSummary.totalRatings': 1, _id: 0 }
    )
      .limit(20000)
      .lean()) as unknown as WorkerSeoRow[];
    const idOf = (name: string) => districts.find((d) => d.nameEn.toLowerCase() === name.trim().toLowerCase() || d.id === name.trim().toLowerCase())?.id;
    const normalised = rows.flatMap((r) => {
      const id = idOf(String(r.district ?? ''));
      return id ? [{ ...r, district: id }] : [];
    });
    return aggregateWorkers(normalised);
  }, ttlMs);
}
