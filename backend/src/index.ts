import { app } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { db } from './db/pool';
import { startScheduledJobs } from './cron/jobs';

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', { reason: String(reason) });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
});

async function main(): Promise<void> {
  await db.connect();
  logger.info('Database connected', { db: env.db.name, host: env.db.host, port: env.db.port });

  app.listen(env.port, () => {
    logger.info(`KG-MIS API listening on port ${env.port}`);
    startScheduledJobs();
  });
}

main().catch((err) => {
  logger.error('Startup failed', { error: (err as Error).message });
  process.exit(1);
});
