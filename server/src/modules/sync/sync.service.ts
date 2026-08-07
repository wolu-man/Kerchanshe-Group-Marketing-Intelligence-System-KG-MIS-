import sql from 'mssql';
import { getPool } from '../../db/pool';
import { upsertFromD365fo } from '../../integrations/d365fo';
import { notifyEvent } from '../notifications/notifications.service';

export type SyncEntity = 'Product' | 'Customer' | 'Sales';

const ENTITIES: SyncEntity[] = ['Product', 'Customer', 'Sales'];

/**
 * Runs a synchronization for a D365FO entity (FDS EPIC-03 / FR-03.2, FR-03.3).
 * A failed run is logged in SyncLog and does not overwrite the last good cache;
 * an alert is sent to the Administrator via CNS (Integration Design Section 3).
 */
export async function runSyncForEntity(entity: SyncEntity, triggeredBy: number | null): Promise<void> {
  const pool = await getPool();
  const syncLogId = await startSyncLog(entity, triggeredBy);
  let recordsProcessed = 0;
  let errorCount = 0;
  let errorDetail: string | null = null;

  try {
    const result = await upsertFromD365fo(entity);
    recordsProcessed = result.recordsProcessed;
  } catch (err) {
    errorCount = 1;
    errorDetail = err instanceof Error ? err.message : 'Unknown sync error';
  }

  const status = errorCount > 0 ? 'Failed' : 'Success';
  await finishSyncLog(syncLogId, status, recordsProcessed, errorCount, errorDetail);

  if (status === 'Failed') {
    await notifyEvent('SyncFailure', {
      subject: `D365FO sync failed: ${entity}`,
      message: `The scheduled/on-demand D365FO sync for "${entity}" failed: ${errorDetail}. The last good cache was retained.`,
    });
  }
}

/** Runs the full sync for all entities (used by the scheduled job and manual trigger). */
export async function runFullSync(triggeredBy: number | null): Promise<Array<{ entity: SyncEntity; status: string; recordsProcessed: number }>> {
  const results: Array<{ entity: SyncEntity; status: string; recordsProcessed: number }> = [];
  for (const entity of ENTITIES) {
    await runSyncForEntity(entity, triggeredBy);
    results.push({ entity, status: 'Completed', recordsProcessed: await lastRunCount(entity) });
  }
  return results;
}

export async function listSyncLogs(page = 1, pageSize = 50) {
  const pool = await getPool();
  const offset = (page - 1) * pageSize;
  const countResult = await pool.request().query('SELECT COUNT(*) AS Total FROM dbo.SyncLog');
  const rows = await pool.request().query(`
    SELECT SyncLogID, Entity, Status, RecordsProcessed, ErrorCount, ErrorDetail, TriggeredBy,
           StartedAt, FinishedAt
    FROM dbo.SyncLog
    ORDER BY StartedAt DESC
    OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY
  `);
  return { total: Number(countResult.recordset[0].Total), page, pageSize, items: rows.recordset };
}

async function startSyncLog(entity: SyncEntity, triggeredBy: number | null): Promise<number> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('entity', sql.VarChar(50), entity)
    .input('triggeredBy', sql.Int, triggeredBy)
    .query(`
      INSERT INTO dbo.SyncLog (Entity, Status, TriggeredBy)
      VALUES (@entity, 'Running', @triggeredBy);
      SELECT SCOPE_IDENTITY() AS SyncLogID;
    `);
  return Number(result.recordset[0].SyncLogID);
}

async function finishSyncLog(
  syncLogId: number,
  status: string,
  recordsProcessed: number,
  errorCount: number,
  errorDetail: string | null,
): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input('id', sql.Int, syncLogId)
    .input('status', sql.VarChar(20), status)
    .input('records', sql.Int, recordsProcessed)
    .input('errors', sql.Int, errorCount)
    .input('detail', sql.NVarChar(sql.MAX), errorDetail)
    .input('finishedAt', sql.DateTime2, new Date())
    .query(`
      UPDATE dbo.SyncLog
      SET Status = @status, RecordsProcessed = @records, ErrorCount = @errors,
          ErrorDetail = @detail, FinishedAt = @finishedAt
      WHERE SyncLogID = @id
    `);
}

async function lastRunCount(entity: SyncEntity): Promise<number> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('entity', sql.VarChar(50), entity)
    .query(`
      SELECT TOP 1 RecordsProcessed FROM dbo.SyncLog
      WHERE Entity = @entity AND Status = 'Success'
      ORDER BY StartedAt DESC
    `);
  return result.recordset.length > 0 ? Number(result.recordset[0].RecordsProcessed) : 0;
}
