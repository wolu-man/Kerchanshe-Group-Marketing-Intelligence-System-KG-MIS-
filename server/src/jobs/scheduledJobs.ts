import cron from 'node-cron';
import { env } from '../config/env';
import { runFullSync } from '../modules/sync/sync.service';

let syncJob: cron.ScheduledTask | null = null;

/** Starts the D365FO scheduled synchronization job (FDS EPIC-03 / FR-03.2). */
export function startScheduledJobs(): void {
  if (syncJob) return;
  syncJob = cron.schedule(env.d365fo.syncCron, async () => {
    try {
      await runFullSync(null);
    } catch (err) {
      console.error('[SyncJob] Failed:', err);
    }
  });
  console.log(`[Jobs] D365FO sync scheduled with cron '${env.d365fo.syncCron}'`);
}

export function stopScheduledJobs(): void {
  if (syncJob) {
    syncJob.stop();
    syncJob = null;
  }
}
