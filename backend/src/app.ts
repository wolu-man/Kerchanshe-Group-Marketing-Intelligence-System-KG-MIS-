import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { authRouter } from './modules/auth/auth.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { marketVisitsRouter } from './modules/marketVisits/marketVisits.routes';
import { formsModule } from './modules/forms/forms.module';
import { competitorPricingRouter } from './modules/competitorPricing/competitorPricing.routes';
import { syncRouter } from './modules/sync/sync.routes';
import { adminRouter } from './modules/admin/admin.routes';
import { referenceRouter } from './modules/reference/reference.routes';
import { reportsRouter } from './modules/reports/reports.routes';
import { interviewsRouter } from './modules/interviews/interviews.routes';
import { multimediaRouter } from './modules/multimedia/multimedia.routes';
import { weeklySalesRouter } from './modules/weeklySales/weeklySales.routes';
import { competitorsRouter } from './modules/competitors/competitors.routes';
import { relationshipRouter } from './modules/relationship/relationship.routes';
import { officerPerformanceRouter } from './modules/officer/officer.routes';
import { aiPublicRouter, aiRouter } from './modules/ai/ai.routes';
import { aiRenewalRouter } from './modules/ai/ai-renewal.routes';
import { tendersRouter } from './modules/tenders/tenders.routes';
import { db } from './db/pool';

export const app = express();

// Trust proxy for correct IP resolution behind load balancers/reverse proxies
app.set('trust proxy', true);

app.use(cors({ origin: env.cors.origin, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

// Public email assets (logo) — no auth required for email images.
app.use('/email-assets', express.static(path.resolve('public/email')));

// Form file uploads (authenticated access only).
app.use('/uploads', express.static(path.resolve(env.files.uploadDir)));

// Health check.
app.get('/health', async (_req, res) => {
  try {
    await db.request().query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'unreachable' });
  }
});

// TDS §4: versioned API surface under /api/v1.
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/notifications', notificationsRouter);
app.use('/api/v1/market-visits', marketVisitsRouter);
app.use('/api/v1', formsModule);
// Anonymous AI surface must be registered first: aiRouter requires auth for
// every request it receives.
app.use('/api/v1/ai', aiPublicRouter);
app.use('/api/v1/ai', aiRouter);
app.use('/api/v1/ai/renewal', aiRenewalRouter);
app.use('/api/v1/competitor-pricing', competitorPricingRouter);
app.use('/api/v1/sync', syncRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/reference', referenceRouter);
app.use('/api/v1/reports', reportsRouter);
app.use('/api/v1/interviews', interviewsRouter);
app.use('/api/v1/multimedia', multimediaRouter);
app.use('/api/v1/weekly-sales', weeklySalesRouter);
app.use('/api/v1/configurations', relationshipRouter);
app.use('/api/v1/competitors', competitorsRouter);
app.use('/api/v1/officer/performance', officerPerformanceRouter);
app.use('/api/v1/tenders', tendersRouter);

// 404 for unknown API routes.
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', message: 'Route not found' });
});

// Structured error responses first (AppError → correct status code).
app.use(errorHandler);

// Last-resort error handler — only for unexpected non-AppError failures.
// Must run AFTER errorHandler so 403/404/422 etc. are not swallowed as 500.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof Error && (err as any).statusCode) {
    // Already handled shape-wise by errorHandler; if we got here, respond with its status.
    if (!res.headersSent) {
      res.status((err as any).statusCode).json({ error: (err as any).code || 'ERROR', message: err.message });
    }
    return;
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  const stack = err instanceof Error ? err.stack : undefined;
  console.error('[FINAL ERROR HANDLER]', message, stack);
  if (!res.headersSent) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message });
  }
});
