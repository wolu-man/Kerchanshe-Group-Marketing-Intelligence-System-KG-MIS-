import { createApp } from './app';
import { getPool } from './db/pool';
import { env } from './config/env';
import { startScheduledJobs } from './jobs/scheduledJobs';

async function bootstrap(): Promise<void> {
  await getPool();
  console.log(`[DB] Connected to ${env.db.server}/${env.db.database}`);

  const app = createApp();
  app.listen(env.app.port, () => {
    console.log(`[API] KG-MIS API listening on http://localhost:${env.app.port}`);
  });

  if (!env.isProduction) {
    // Scheduled jobs can run in all environments; mock adapters keep them safe offline.
  }
  startScheduledJobs();
}

bootstrap().catch((err) => {
  console.error('[API] Failed to start:', err);
  process.exit(1);
});
