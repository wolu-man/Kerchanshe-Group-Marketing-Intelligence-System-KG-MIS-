import sql from 'mssql';
import { getPool } from './pool';

export interface AuditEntry {
  userId: number | null;
  action: string;
  entity: string;
  entityId?: number | null;
  detail?: string | null;
}

/** Records a user action for traceability (SDD Section 7.3). */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    const pool = await getPool();
    await pool
      .request()
      .input('userId', sql.Int, entry.userId)
      .input('action', sql.VarChar(100), entry.action)
      .input('entity', sql.VarChar(50), entry.entity)
      .input('entityId', sql.Int, entry.entityId ?? null)
      .input('detail', sql.NVarChar(sql.MAX), entry.detail ?? null)
      .query(`
        INSERT INTO dbo.AuditLog (UserID, Action, Entity, EntityID, Detail)
        VALUES (@userId, @action, @entity, @entityId, @detail)
      `);
  } catch {
    // Audit failures must never break the primary request flow.
  }
}
