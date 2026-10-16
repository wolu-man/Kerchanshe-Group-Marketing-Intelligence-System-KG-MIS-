import cron from 'node-cron';
import sql from 'mssql';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { db } from '../db/pool';
import { executeSync } from '../modules/sync/sync.service';
import { processErasureRequests } from '../modules/forms/responses.service';
import { activeGapCount } from '../modules/competitorPricing/competitorPricing.service';
import { recomputeAnomalies } from '../modules/forms/anomaly.service';
import { dispatchEvent } from '../modules/notifications/notifications.service';
import { collectAllSources, sendDeadlineReminders } from '../modules/tenders/collection.service';
import { purgeExpiredInsights, refreshPredictions } from '../modules/predictive/predictive.service';
import { purgeOldAttachments } from '../modules/ai/attachments';
import { getConfigStore, AI_CONFIG_KEYS } from '../config/config-store';
import { audit } from '../db/audit';

/** Reads a string SystemConfig value (cron: no user context). */
async function configStr(key: string, fallback: string): Promise<string> {
  try {
    const row = await db.request().input('Key', sql.VarChar(100), key).query(
      `SELECT ConfigValue FROM dbo.SystemConfig WHERE ConfigKey = @Key`
    );
    return row.recordset[0]?.ConfigValue ?? fallback;
  } catch {
    return fallback;
  }
}

/** Reads an integer SystemConfig value (cron: no user context). */
async function configInt(key: string, fallback: number): Promise<number> {
  try {
    const row = await db.request().input('Key', sql.VarChar(100), key).query(
      `SELECT ConfigValue FROM dbo.SystemConfig WHERE ConfigKey = @Key`
    );
    const n = Number(row.recordset[0]?.ConfigValue);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

/** Reads a boolean SystemConfig value (cron: no user context). */
async function configBool(key: string, fallback: boolean): Promise<boolean> {
  const val = await configStr(key, String(fallback));
  return val === 'true';
}

/** Check if AI key rotation is due and mark it. Runs daily at 02:00 UTC. */
async function checkAiKeyRotation(): Promise<void> {
  try {
    const enabled = await configBool(AI_CONFIG_KEYS.ROTATION_ENABLED, false);
    if (!enabled) return;

    const nextRunStr = await configStr(AI_CONFIG_KEYS.ROTATION_NEXT_RUN, '');
    if (!nextRunStr) return;

    const nextRun = new Date(nextRunStr);
    if (isNaN(nextRun.getTime())) return;

    const now = new Date();
    if (nextRun > now) return; // Not due yet

    // Check if already marked due
    const alreadyDue = await configBool(AI_CONFIG_KEYS.ROTATION_DUE, false);
    if (alreadyDue) {
      logger.info('ai.rotation.already_due', { nextRun: nextRunStr });
      return;
    }

    // Mark as due - admin needs to provide new key
    const configStore = getConfigStore();
    await configStore.set(AI_CONFIG_KEYS.ROTATION_DUE, 'true');

    // Audit log
    await audit({
      userId: null, // System-initiated
      action: 'AI_ROTATION_DUE',
      entity: 'AiProvider',
      detail: { nextRun: nextRunStr, provider: await configStr(AI_CONFIG_KEYS.ROTATION_PROVIDER, '') },
      ipAddress: null,
    });

    logger.warn('ai.rotation.due', { nextRun: nextRunStr });
  } catch (err) {
    logger.error('ai.rotation.check_failed', { error: (err as Error).message });
  }
}

/** Audit retention policy (OP-08): purge AuditLog entries older than N days. */
async function purgeAuditLog(): Promise<number> {
  const days = await configInt('audit.retentionDays', 365);
  const result = await db.request().input('Days', sql.Int, days).query(
    `DELETE FROM dbo.AuditLog WHERE CreatedAt < DATEADD(day, -@Days, SYSUTCDATETIME())`
  );
  return result.rowsAffected[0] ?? 0;
}

/** Partial-draft retention: drop InProgress drafts untouched for N days. */
async function purgeDrafts(): Promise<number> {
  const days = await configInt('draft.retentionDays', 7);
  const result = await db.request().input('Days', sql.Int, days).query(
    `UPDATE dbo.FormResponse SET Status = 'Abandoned'
     WHERE Status = 'InProgress' AND DraftSavedAt < DATEADD(day, -@Days, SYSUTCDATETIME())`
  );
  return result.rowsAffected[0] ?? 0;
}

/** Nightly anomaly re-scan across all published forms (DR-13, OP-07). */
async function rescanAnomalies(): Promise<number> {
  const forms = await db.request().query(
    `SELECT TemplateID FROM dbo.FormTemplate WHERE Status = 'Published'`
  );
  let scanned = 0;
  for (const f of forms.recordset) {
    try {
      const n = await recomputeAnomalies(f.TemplateID);
      scanned += n;
    } catch (err) {
      logger.error('Anomaly rescan failed', { templateId: f.TemplateID, error: (err as Error).message });
    }
  }
  return scanned;
}

/** Daily form expiry reminders: notify owners of forms expiring within 24h. */
async function sendFormReminders(): Promise<number> {
  const expiring = await db.request().query(
    `SELECT TemplateID, Title, OwnerUserID, ExpireAt
     FROM dbo.FormTemplate
     WHERE Status = 'Published'
       AND ExpireAt IS NOT NULL
       AND ExpireAt > SYSUTCDATETIME()
       AND ExpireAt <= DATEADD(hour, 24, SYSUTCDATETIME())`
  );
  let sent = 0;
  for (const form of expiring.recordset) {
    try {
      await dispatchEvent({
        event: 'FORM_REMINDER',
        subject: `Form expiring soon: ${form.Title}`,
        body: `The form "${form.Title}" will expire on ${new Date(form.ExpireAt).toUTCString()}.`,
        payload: { templateId: form.TemplateID, expiresAt: form.ExpireAt },
        userIds: [form.OwnerUserID],
      });
      sent++;
    } catch (err) {
      logger.error('FORM_REMINDER dispatch failed', { templateId: form.TemplateID, error: (err as Error).message });
    }
  }
  return sent;
}

function startScheduledJobs(): void {
  if (env.d365fo.syncEnabled) {
    cron.schedule(env.d365fo.syncCron, async () => {
      logger.info('Scheduled D365FO sync started');
      try {
        const result = await executeSync(null);
        logger.info('Scheduled D365FO sync completed', { overall: result.overall });
      } catch (err) {
        logger.error('Scheduled D365FO sync failed', { error: (err as Error).message });
      }
    });
    logger.info('Scheduled job registered: D365FO sync', { cron: env.d365fo.syncCron });
  }

  // GDPR erasure of Pending requests older than 30 days (FR-01.25).
  cron.schedule('0 3 * * *', async () => {
    try {
      const purged = await processErasureRequests();
      logger.info('Erasure job completed', { purged });
    } catch (err) {
      logger.error('Erasure job failed', { error: (err as Error).message });
    }
  });

  // Daily health signal: active price-gap alerts (monitoring aid).
  cron.schedule('0 7 * * *', async () => {
    try {
      const count = await activeGapCount();
      logger.info('Active price-gap alerts', { count });
    } catch (err) {
      logger.error('Alert health check failed', { error: (err as Error).message });
    }
  });

  // Nightly maintenance: audit retention (OP-08) + abandoned draft purge.
  cron.schedule('0 4 * * *', async () => {
    try {
      const [auditPurged, draftsPurged] = await Promise.all([purgeAuditLog(), purgeDrafts()]);
      logger.info('Retention/purge job completed', { auditPurged, draftsPurged });
    } catch (err) {
      logger.error('Retention/purge job failed', { error: (err as Error).message });
    }
  });

  // Nightly predictive refresh (04:15): recompute every card so the morning
  // dashboard opens on fresh forecasts, then drop expired/aged insight rows.
  cron.schedule('15 4 * * *', async () => {
    try {
      const { refreshed, failed } = await refreshPredictions();
      const purged = await purgeExpiredInsights();
      logger.info('Predictive refresh completed', { refreshed, failed, ...purged });
    } catch (err) {
      logger.error('Predictive refresh failed', { error: (err as Error).message });
    }
  });
  logger.info('Scheduled job registered: predictive refresh', { cron: '15 4 * * *' });

  // Nightly AI chat attachment sweep (04:45): drop ai-* uploads past the TTL.
  cron.schedule('45 4 * * *', async () => {
    try {
      const removed = await purgeOldAttachments();
      if (removed > 0) logger.info('AI attachment purge completed', { removed });
    } catch (err) {
      logger.error('AI attachment purge failed', { error: (err as Error).message });
    }
  });
  logger.info('Scheduled job registered: ai attachment purge', { cron: '45 4 * * *' });

  // Nightly anomaly re-scan (DR-13).
  cron.schedule('30 4 * * *', async () => {
    try {
      const scanned = await rescanAnomalies();
      logger.info('Anomaly rescan completed', { scanned });
    } catch (err) {
      logger.error('Anomaly rescan failed', { error: (err as Error).message });
    }
  });

  // Daily form expiry reminders (09:00 UTC).
  cron.schedule('0 9 * * *', async () => {
    try {
      const sent = await sendFormReminders();
      logger.info('Form reminders sent', { sent });
    } catch (err) {
      logger.error('Form reminder job failed', { error: (err as Error).message });
    }
  });

  // AI key rotation check (02:00 UTC daily) - marks rotation as due when nextRun arrives.
  cron.schedule('0 2 * * *', async () => {
    try {
      await checkAiKeyRotation();
    } catch (err) {
      logger.error('AI rotation check failed', { error: (err as Error).message });
    }
  });
  logger.info('Scheduled job registered: AI key rotation check', { cron: '0 2 * * *' });

  // Tender source collection (configurable, disabled by default in dev).
  if (env.tenders.collectionEnabled) {
    cron.schedule(env.tenders.collectionCron, async () => {
      logger.info('Scheduled tender source collection started');
      try {
        const results = await collectAllSources();
        const success = results.filter((r) => r.status !== 'Failed').length;
        const failed = results.filter((r) => r.status === 'Failed').length;
        logger.info('Scheduled tender source collection completed', { success, failed });
      } catch (err) {
        logger.error('Scheduled tender source collection failed', { error: (err as Error).message });
      }
    });
    logger.info('Scheduled job registered: tender source collection', { cron: env.tenders.collectionCron });
  }

  // Daily tender deadline reminders (09:00 UTC).
  cron.schedule(env.tenders.reminderCron, async () => {
    try {
      const sent = await sendDeadlineReminders();
      logger.info('Tender deadline reminders sent', { sent });
    } catch (err) {
      logger.error('Tender deadline reminder job failed', { error: (err as Error).message });
    }
  });
  logger.info('Scheduled job registered: tender deadline reminders', { cron: env.tenders.reminderCron });
}

export { startScheduledJobs };
