import sql from 'mssql';
import { db } from './pool';
import { logger } from '../config/logger';

export interface AuditEntry {
  userId: number | null;
  action: string;
  entity: string;
  entityId?: number | null;
  detail?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

// Writes an audit entry. Failures are logged but never break the caller
// (audit must not affect the primary operation). Security Matrix Section 7.
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await db
      .request()
      .input('UserID', sql.Int, entry.userId)
      .input('Action', sql.VarChar(100), entry.action)
      .input('Entity', sql.VarChar(50), entry.entity)
      .input('EntityID', sql.Int, entry.entityId ?? null)
      .input('Detail', sql.NVarChar(sql.MAX), entry.detail ? JSON.stringify(entry.detail) : null)
      .input('IPAddress', sql.VarChar(45), entry.ipAddress ?? null)
      .query(
        `INSERT INTO dbo.AuditLog (UserID, Action, Entity, EntityID, Detail, IPAddress)
         VALUES (@UserID, @Action, @Entity, @EntityID, @Detail, @IPAddress)`
      );
  } catch (err) {
    logger.error('Audit write failed', { error: (err as Error).message });
  }
}
