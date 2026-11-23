// MUST be the first import: every other module (auth.ts especially, which
// fails fast if JWT_SECRET is missing) reads process.env at import time.
import 'dotenv/config';
import { getAiSearchService } from './server/services/aiSearch';

import express from 'express';
import path from 'path';
import helmet from 'helmet';
import cors from 'cors';
import mongoSanitize from 'express-mongo-sanitize';
import { createServer as createViteServer } from 'vite';
import { runPeriodicMaintenance } from './server/db';
import { connectMongo } from './server/mongo';
import { ensureAdminBootstrap } from './server/bootstrap';
import { ensureAuthIndexes } from './server/services/authIndexes';
import { authMiddleware } from './server/auth';
import { apiLimiter } from './server/middleware/rateLimit';
import authRoutes from './server/routes/auth';
import workerRoutes from './server/routes/workers';
import ratingRoutes from './server/routes/ratings';
import customerRoutes from './server/routes/customer';
import reportRoutes from './server/routes/reports';
import adminRoutes from './server/routes/admin';
import recoveryRoutes from './server/routes/recovery';
import googleAuthRoutes from './server/routes/googleAuth';
import adminRecoveryRoutes from './server/routes/adminRecovery';
import notificationRoutes from './server/routes/notifications';
import { createSeoHandlers } from './server/routes/seo';
import { compression } from './server/middleware/compress';

const isProd = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Connect to MongoDB Atlas (or local MongoDB) and ensure exactly one
  // admin account exists. This is the ONLY startup data-creation this
  // server performs - the app starts genuinely empty otherwise. A bad
  // MONGODB_URI or missing ADMIN_PASSWORD in production throws here and
  // crashes startup loudly, rather than failing silently later.
  await connectMongo();
  await ensureAdminBootstrap();
  // Index-only, idempotent: lets several workers exist without an email (see server/services/authIndexes.ts).
  try {
    const idx = await ensureAuthIndexes();
    if (idx.rebuiltEmailIndex) console.log('auth: replaced legacy users.email index with partial unique index');
    if (idx.rebuiltGoogleIdIndex) console.log('auth: replaced legacy users.googleId index with partial unique index');
    if (idx.duplicateGoogleIds.length) {
      console.error(`auth: ${idx.duplicateGoogleIds.length} Google id(s) are linked to more than one user - the unique googleId index was NOT created. Resolve these manually (no data was changed).`);
    }
  } catch (e) {
    console.error('auth: could not verify/repair auth indexes - run `npm run migrate:worker-auth -- --fix-indexes`:', (e as Error).message);
  }

  // Reduces Express fingerprinting (spec section 12).
  app.disable('x-powered-by');

  // Security headers. CSP is relaxed in development because Vite's dev
  // middleware (HMR websocket, inline module scripts) needs it - a real
  // production build serves static, pre-bundled assets and gets the
  // stricter policy below.
  app.use(
    helmet({
      contentSecurityPolicy: isProd
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
              fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
              imgSrc: ["'self'", 'data:', 'https:'], // worker profile photos are hotlinked https URLs
              connectSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
              upgradeInsecureRequests: [],
            },
          }
        : false,
      crossOriginEmbedderPolicy: false, // avoid breaking Vite dev asset loading
    })
  );

  // CORS - explicit allowed origin, not a wildcard. This app currently
  // serves the frontend and API from the same origin/port, so this mostly
  // matters if the frontend is ever split out to its own domain.
  const allowedOrigin = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000';
  app.use(
    cors({
      origin: allowedOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // Body size limits. Profile photos are stored as hotlinked URLs, not
  // base64 blobs, so there's no legitimate need for a large JSON body here.
  if (isProd) app.use(compression());
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: true, limit: '256kb' }));

  // Strips any request key starting with '$' or containing '.' from
  // req.body/req.query/req.params - the standard defense against MongoDB
  // operator injection (e.g. a client sending {"workerId": {"$ne": null}}
  // to make a findOne({ id: workerId }) match everything instead of one
  // specific document). Runs on every request, before any route sees it.
  app.use(mongoSanitize());

  app.use(authMiddleware as express.RequestHandler);

  // General API-wide rate-limit safety net. Route-specific limiters in
  // server/middleware/rateLimit.ts (applied per-route) are the primary
  // defense for sensitive endpoints - this just bounds total traffic.
  app.use('/api', apiLimiter);

  // Periodic maintenance timer (checks suspension expiry, 1-day warnings, 6-month clean warning resets)
  setInterval(() => {
    try {
      runPeriodicMaintenance().catch((e) => console.error('Periodic maintenance error:', e));
    } catch (e) {
      console.error('Periodic maintenance error:', e);
    }
  }, 60 * 1000);

  // Health API
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      platform: 'Namma Ooru Workers',
      timestamp: new Date().toISOString(),
    });
  });

  // REST API Routes
  // Recovery routers are mounted BEFORE their parents so '/api/auth/recovery/*' and
  // '/api/admin/recovery/*' are matched here (the admin one enforces its own admin role).
  app.use('/api/auth/recovery', recoveryRoutes);
  app.use('/api/auth/google', googleAuthRoutes);
  app.use('/api/admin/recovery', adminRecoveryRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/workers', workerRoutes);
  app.use('/api/ratings', ratingRoutes);
  app.use('/api/customer', customerRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/notifications', notificationRoutes);

  // Unknown API paths are real 404s (JSON), never the HTML app shell.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // SEO: robots.txt, sitemap.xml (+ optional Search Console verification file) are generated from live data and
  // mounted before static files so they always win over any stale file in /public.
  const distPath = path.join(process.cwd(), 'dist');
  const seo = createSeoHandlers(isProd ? distPath : null);
  app.use(seo.files);

  // Vite middleware for development vs static for production
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Hashed build assets are immutable; everything else revalidates. index.html is served by the SEO handler
    // (per-route title/meta/canonical), so static must not answer "/" itself.
    app.use(
      express.static(distPath, {
        index: false,
        setHeaders(res, filePath) {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          else res.setHeader('Cache-Control', 'public, max-age=86400');
        },
      })
    );
    app.use(seo.pages); // home, landing pages, 301 redirects, real 404s
  }

  // Centralized error handler - must be registered last. Never leaks stack
  // traces, internal file paths, or raw database/library errors to the
  // client; full detail still goes to the server log.
  app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[unhandled error]', err);
    const status = typeof err?.status === 'number' ? err.status : 500;
    res.status(status).json({
      error: status === 500 ? 'Something went wrong. Please try again.' : (err?.message || 'Request failed'),
    });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Namma Ooru Workers server running on http://0.0.0.0:${PORT} (${isProd ? 'production' : 'development'})`);
    // AI search: print secret-free status and pre-load the Gemini SDK (never blocks startup).
    const ai = getAiSearchService();
    ai.logStatus();
    void ai.warmup();
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
