import fs from 'fs';
import path from 'path';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { getEnabledDistricts } from '../services/workerSearch';
import { readSeoConfig } from '../seo/seoCore';
import { createMongoStatsProvider } from '../seo/seoData';
import { respond, respondHtml, type SeoDeps, type SeoResponse } from '../seo/seoServer';

function send(req: Request, res: Response, r: SeoResponse) {
  res.status(r.status);
  for (const [k, v] of Object.entries(r.headers)) res.setHeader(k, v);
  if (r.status === 301) return res.end();
  res.send(req.method === 'HEAD' ? undefined : r.body);
}

export function createSeoHandlers(distPath: string | null) {
  const cfg = readSeoConfig();
  let tpl: string | null | undefined;
  const deps: SeoDeps = {
    cfg,
    enabled: () => getEnabledDistricts(),
    stats: createMongoStatsProvider(() => getEnabledDistricts()),
    template: () => {
      if (tpl !== undefined) return tpl;
      try {
        tpl = distPath ? fs.readFileSync(path.join(distPath, 'index.html'), 'utf8') : null;
      } catch {
        tpl = null;
      }
      return tpl;
    },
  };
  /** robots.txt, sitemap.xml and the optional Search Console verification file. Mounted BEFORE static files. */
  const files: RequestHandler = (req, res, next) => {
    respond({ method: req.method, path: req.path }, deps).then((r) => (r ? send(req, res, r) : next()), next);
  };
  /** HTML pages, redirects and real 404s. Mounted AFTER static files and the /api routes. */
  const pages: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    respondHtml({ method: req.method, path: req.path }, deps).then((r) => (r ? send(req, res, r) : next()), next);
  };
  return { files, pages, cfg };
}
