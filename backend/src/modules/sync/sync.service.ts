import sql from 'mssql';
import { db } from '../../db/pool';
import { runFullSync, type SyncEntity } from '../../integrations/d365fo';
import { dispatchEvent } from '../notifications/notifications.service';
import { logger } from '../../config/logger';

export interface SyncRunResult {
  overall: 'Success' | 'Failed';
  entities: SyncEntity[];
  startedAt: string;
  finishedAt: string;
}

function startLog(triggeredBy: number | null): Promise<number> {
  return db
    .request()
    .input('TriggeredBy', sql.Int, triggeredBy)
    .query(
      `INSERT INTO dbo.SyncLog (Entity, Status, TriggeredBy)
       OUTPUT INSERTED.SyncLogID
       VALUES ('Product', 'Running', @TriggeredBy)`
    )
    .then((r) => r.recordset[0].SyncLogID);
}

async function finishLog(logId: number, entity: string, result: SyncEntity): Promise<void> {
  const status = result.errorCount > 0 ? 'Failed' : 'Success';
  await db
    .request()
    .input('Id', sql.Int, logId)
    .input('Entity', sql.VarChar(50), entity)
    .input('Status', sql.VarChar(20), status)
    .input('Processed', sql.Int, result.recordsProcessed)
    .input('Errors', sql.Int, result.errorCount)
    .query(
      `UPDATE dbo.SyncLog
       SET Entity = @Entity, Status = @Status, RecordsProcessed = @Processed,
           ErrorCount = @Errors, FinishedAt = SYSUTCDATETIME()
       WHERE SyncLogID = @Id`
    );
}

/** Runs the full D365FO master-data sync and records a SyncLog per entity. */
export async function executeSync(triggeredBy: number | null): Promise<SyncRunResult> {
  const startedAt = new Date().toISOString();
  const logId = await startLog(triggeredBy);
  const entities = await runFullSync();
  await finishLog(logId, 'Product', entities[0]);
  for (const e of entities) {
    // Skip Product entity - already logged above
    if (e.entity === 'Product') continue;
    const id = await db.request().query(
      `INSERT INTO dbo.SyncLog (Entity, Status, TriggeredBy)
       OUTPUT INSERTED.SyncLogID
       VALUES ('${e.entity}', 'Running', NULL)`
    );
    await finishLog(id.recordset[0].SyncLogID, e.entity, e);
  }
  const finishedAt = new Date().toISOString();
  const failed = entities.some((e) => e.errorCount > 0);

  if (failed) {
    await dispatchEvent({
      event: 'SyncFailure',
      subject: 'D365FO sync failed',
      body: 'One or more D365FO sync jobs completed with errors. Check the sync log.',
      payload: { entities },
    });
  }

  logger.info('D365FO sync completed', { entities, failed });
  return { overall: failed ? 'Failed' : 'Success', entities, startedAt, finishedAt };
}

export async function listSyncLogs(limit = 50): Promise<any[]> {
  const result = await db.request().input('Limit', sql.Int, limit).query(
    `SELECT TOP (@Limit) SyncLogID, Entity, Status, RecordsProcessed, ErrorCount,
            ErrorDetail, TriggeredBy, StartedAt, FinishedAt, u.Name AS TriggeredByName
     FROM dbo.SyncLog s
     LEFT JOIN dbo.[User] u ON u.UserID = s.TriggeredBy
     ORDER BY StartedAt DESC`
  );
  return result.recordset;
}
