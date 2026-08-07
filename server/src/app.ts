import express, { type Express } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { env } from './config/env';
import authRoutes from './modules/auth/auth.routes';
import marketVisitsRoutes from './modules/marketVisits/marketVisits.routes';
import surveysRoutes from './modules/surveys/surveys.routes';
import competitorPricingRoutes from './modules/competitorPricing/competitorPricing.routes';
import syncRoutes from './modules/sync/sync.routes';
import notificationsRoutes from './modules/notifications/notifications.routes';
import reportsRoutes from './modules/reports/reports.routes';
import referenceRoutes from './modules/reference/reference.routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

export function createApp(): Express {
  const app = express();

  app.use(cors({ origin: env.app.origin, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  if (!env.isProduction) {
    app.use(morgan('dev'));
  }

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'kg-mis-api', time: new Date().toISOString() });
  });

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/market-visits', marketVisitsRoutes);
  app.use('/api/v1/surveys', surveysRoutes);
  app.use('/api/v1/competitor-prices', competitorPricingRoutes);
  app.use('/api/v1/sync', syncRoutes);
  app.use('/api/v1/notifications', notificationsRoutes);
  app.use('/api/v1/reports', reportsRoutes);
  app.use('/api/v1', referenceRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
