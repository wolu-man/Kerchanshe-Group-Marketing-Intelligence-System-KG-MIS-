// =============================================================================
// Tender Source Service — CRUD operations for data sources.
//
// listSources strips ApiConfig (credentials) for safety.
// getSource includes ApiConfig only when requested by an Administrator.
// =============================================================================

import sql from 'mssql';
import { db } from '../../db/pool';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { isRestrictedSourceUrl, restrictedSourceMessage } from './source-policy';
import type { TenderSourceDTO, TenderSourceAdminDTO } from './tenders.types';

const SOURCE_COLUMNS = `TenderSourceID, Name, SourceType, URL, Schedule, RateLimitMs,
            RobotsCompliance, IsActive, AiAutoEnrich, QualityScore, LastCollectedAt, LastCollectionStatus,
            LastCollectionError, TotalCollected, CreatedAt, UpdatedAt`;

/** Maps a DB row to a DTO without ApiConfig (credentials never leave the server). */
function toDTO(row: Record<string, unknown>): TenderSourceDTO {
  return {
    TenderSourceID: row.TenderSourceID as number,
    Name: row.Name as string,
    SourceType: row.SourceType as string,
    URL: row.URL as string,
    Schedule: row.Schedule as string,
    RateLimitMs: row.RateLimitMs as number,
    RobotsCompliance: !!row.RobotsCompliance,
    IsActive: !!row.IsActive,
    AiAutoEnrich: !!row.AiAutoEnrich,
    QualityScore: row.QualityScore == null ? 70 : Number(row.QualityScore),
    LastCollectedAt: row.LastCollectedAt ? new Date(row.LastCollectedAt as Date).toISOString() : null,
    LastCollectionStatus: (row.LastCollectionStatus as string) || null,
    LastCollectionError: (row.LastCollectionError as string) || null,
    TotalCollected: row.TotalCollected as number,
    Restricted: isRestrictedSourceUrl(row.URL as string),
    CreatedAt: new Date(row.CreatedAt as Date).toISOString(),
    UpdatedAt: row.UpdatedAt ? new Date(row.UpdatedAt as Date).toISOString() : null,
  };
}

/** Maps a DB row to an admin DTO (includes ApiConfig). */
function toAdminDTO(row: Record<string, unknown>): TenderSourceAdminDTO {
  return {
    ...toDTO(row),
    ApiConfig: (row.ApiConfig as string) || null,
  };
}

/** Lists all sources. Strips ApiConfig for safety. */
export async function listSources(): Promise<TenderSourceDTO[]> {
  const result = await db.request().query(
    `SELECT ${SOURCE_COLUMNS}
     FROM dbo.TenderSource
     ORDER BY CreatedAt DESC`
  );
  return result.recordset.map(toDTO);
}

/** Gets a single source by ID. Includes ApiConfig when includeConfig is true. */
export async function getSource(id: number, includeConfig = false): Promise<TenderSourceDTO | TenderSourceAdminDTO> {
  const result = await db
    .request()
    .input('Id', sql.Int, id)
    .query(
      `SELECT ${includeConfig ? 'ApiConfig, ' : ''}${SOURCE_COLUMNS}
       FROM dbo.TenderSource
       WHERE TenderSourceID = @Id`
    );
  if (result.recordset.length === 0) {
    throw new NotFoundError('Tender source not found');
  }
  return includeConfig ? toAdminDTO(result.recordset[0]) : toDTO(result.recordset[0]);
}

/** Reads just the current URL of a source (used to evaluate policy on update). */
async function getCurrentUrl(id: number): Promise<string> {
  const result = await db
    .request()
    .input('Id', sql.Int, id)
    .query(`SELECT URL FROM dbo.TenderSource WHERE TenderSourceID = @Id`);
  if (result.recordset.length === 0) {
    throw new NotFoundError('Tender source not found');
  }
  return result.recordset[0].URL as string;
}

/** Creates a new data source. Restricted hosts are always stored inactive. */
export async function createSource(
  data: {
    Name: string;
    SourceType: 'api' | 'rss' | 'scraping';
    URL: string;
    ApiConfig?: string | null;
    Schedule?: string;
    RateLimitMs?: number;
    RobotsCompliance?: boolean;
    IsActive?: boolean;
    AiAutoEnrich?: boolean;
    QualityScore?: number;
  },
  includeConfig = false,
): Promise<TenderSourceDTO | TenderSourceAdminDTO> {
  const restricted = isRestrictedSourceUrl(data.URL);
  const result = await db
    .request()
    .input('Name', sql.NVarChar(200), data.Name)
    .input('SourceType', sql.VarChar(20), data.SourceType)
    .input('URL', sql.NVarChar(1000), data.URL)
    .input('ApiConfig', sql.NVarChar(sql.MAX), data.ApiConfig || null)
    .input('Schedule', sql.VarChar(20), data.Schedule || '6h')
    .input('RateLimitMs', sql.Int, data.RateLimitMs ?? 2000)
    .input('RobotsCompliance', sql.Bit, data.RobotsCompliance !== false)
    .input('IsActive', sql.Bit, restricted ? false : data.IsActive !== false)
    .input('AiAutoEnrich', sql.Bit, data.AiAutoEnrich === true)
    .input('QualityScore', sql.Int, data.QualityScore ?? 70)
    .query(
      `INSERT INTO dbo.TenderSource (Name, SourceType, URL, ApiConfig, Schedule, RateLimitMs, RobotsCompliance, IsActive, AiAutoEnrich, QualityScore)
       OUTPUT INSERTED.TenderSourceID, INSERTED.Name, INSERTED.SourceType, INSERTED.URL, INSERTED.ApiConfig,
              INSERTED.Schedule, INSERTED.RateLimitMs, INSERTED.RobotsCompliance, INSERTED.IsActive, INSERTED.AiAutoEnrich, INSERTED.QualityScore,
              INSERTED.LastCollectedAt, INSERTED.LastCollectionStatus, INSERTED.LastCollectionError,
              INSERTED.TotalCollected, INSERTED.CreatedAt, INSERTED.UpdatedAt
       VALUES (@Name, @SourceType, @URL, @ApiConfig, @Schedule, @RateLimitMs, @RobotsCompliance, @IsActive, @AiAutoEnrich, @QualityScore)`
    );
  return includeConfig ? toAdminDTO(result.recordset[0]) : toDTO(result.recordset[0]);
}

/**
 * Updates an existing data source.
 *
 * - `ApiConfig: undefined` leaves the stored configuration untouched;
 *   `ApiConfig: null` clears it. Only Administrators receive it back.
 * - Restricted hosts can never be activated.
 */
export async function updateSource(
  id: number,
  data: {
    Name?: string;
    SourceType?: 'api' | 'rss' | 'scraping';
    URL?: string;
    ApiConfig?: string | null;
    Schedule?: string;
    RateLimitMs?: number;
    RobotsCompliance?: boolean;
    IsActive?: boolean;
    AiAutoEnrich?: boolean;
    QualityScore?: number;
  },
  includeConfig = false,
): Promise<TenderSourceDTO | TenderSourceAdminDTO> {
  const currentUrl = await getCurrentUrl(id);
  const effectiveUrl = data.URL ?? currentUrl;
  const restricted = isRestrictedSourceUrl(effectiveUrl);

  if (restricted && data.IsActive === true) {
    throw new BadRequestError(restrictedSourceMessage(effectiveUrl), 'SOURCE_RESTRICTED');
  }
  if (restricted) {
    // Never allow a restricted host to remain (or become) active.
    data = { ...data, IsActive: false };
  }

  const sets: string[] = [];
  const req = db.request().input('Id', sql.Int, id);

  if (data.Name !== undefined) { req.input('Name', sql.NVarChar(200), data.Name); sets.push('Name = @Name'); }
  if (data.SourceType !== undefined) { req.input('SourceType', sql.VarChar(20), data.SourceType); sets.push('SourceType = @SourceType'); }
  if (data.URL !== undefined) { req.input('URL', sql.NVarChar(1000), data.URL); sets.push('URL = @URL'); }
  if (data.ApiConfig !== undefined) { req.input('ApiConfig', sql.NVarChar(sql.MAX), data.ApiConfig); sets.push('ApiConfig = @ApiConfig'); }
  if (data.Schedule !== undefined) { req.input('Schedule', sql.VarChar(20), data.Schedule); sets.push('Schedule = @Schedule'); }
  if (data.RateLimitMs !== undefined) { req.input('RateLimitMs', sql.Int, data.RateLimitMs); sets.push('RateLimitMs = @RateLimitMs'); }
  if (data.RobotsCompliance !== undefined) { req.input('RobotsCompliance', sql.Bit, data.RobotsCompliance); sets.push('RobotsCompliance = @RobotsCompliance'); }
  if (data.IsActive !== undefined) { req.input('IsActive', sql.Bit, data.IsActive); sets.push('IsActive = @IsActive'); }
  if (data.AiAutoEnrich !== undefined) { req.input('AiAutoEnrich', sql.Bit, data.AiAutoEnrich); sets.push('AiAutoEnrich = @AiAutoEnrich'); }
  if (data.QualityScore !== undefined) { req.input('QualityScore', sql.Int, data.QualityScore); sets.push('QualityScore = @QualityScore'); }

  if (sets.length === 0) {
    return getSource(id, includeConfig);
  }

  sets.push('UpdatedAt = SYSUTCDATETIME()');
  const result = await req.query(
    `UPDATE dbo.TenderSource SET ${sets.join(', ')}
     OUTPUT INSERTED.TenderSourceID, INSERTED.Name, INSERTED.SourceType, INSERTED.URL, INSERTED.ApiConfig,
            INSERTED.Schedule, INSERTED.RateLimitMs, INSERTED.RobotsCompliance, INSERTED.IsActive, INSERTED.AiAutoEnrich, INSERTED.QualityScore,
            INSERTED.LastCollectedAt, INSERTED.LastCollectionStatus, INSERTED.LastCollectionError,
            INSERTED.TotalCollected, INSERTED.CreatedAt, INSERTED.UpdatedAt
     WHERE TenderSourceID = @Id`
  );
  if (result.recordset.length === 0) {
    throw new NotFoundError('Tender source not found');
  }
  return includeConfig ? toAdminDTO(result.recordset[0]) : toDTO(result.recordset[0]);
}


/** Deletes a data source. */
export async function deleteSource(id: number): Promise<void> {
  // Check if any opportunities reference this source.
  const check = await db
    .request()
    .input('Id', sql.Int, id)
    .query(
      `SELECT COUNT(*) AS cnt FROM dbo.TenderOpportunity WHERE TenderSourceID = @Id`
    );
  if (check.recordset[0].cnt > 0) {
    // Nullify the FK instead of blocking deletion.
    await db
      .request()
      .input('Id', sql.Int, id)
      .query(
        `UPDATE dbo.TenderOpportunity SET TenderSourceID = NULL WHERE TenderSourceID = @Id`
      );
  }
  const result = await db
    .request()
    .input('Id', sql.Int, id)
    .query(
      `DELETE FROM dbo.TenderSource WHERE TenderSourceID = @Id`
    );
  if (result.rowsAffected[0] === 0) {
    throw new NotFoundError('Tender source not found');
  }
}

/** Loads a source config for collection (includes ApiConfig). */
export async function getSourceForCollection(id: number): Promise<Record<string, unknown> | null> {
  const result = await db
    .request()
    .input('Id', sql.Int, id)
    .query(
      `SELECT TenderSourceID, Name, SourceType, URL, ApiConfig, RateLimitMs, RobotsCompliance, AiAutoEnrich
       FROM dbo.TenderSource
       WHERE TenderSourceID = @Id AND IsActive = 1`
    );
  return result.recordset.length > 0 ? result.recordset[0] : null;
}

/** Lists all active sources for collection. */
export async function listActiveSourcesForCollection(): Promise<Record<string, unknown>[]> {
  const result = await db.request().query(
    `SELECT TenderSourceID, Name, SourceType, URL, ApiConfig, RateLimitMs, RobotsCompliance, AiAutoEnrich
     FROM dbo.TenderSource
     WHERE IsActive = 1
     ORDER BY TenderSourceID`
  );
  return result.recordset;
}

/** Updates the last-collected status on a source. */
export async function updateCollectionStatus(
  id: number,
  status: 'Success' | 'Failed' | 'Partial',
  newCount: number,
  error: string | null,
): Promise<void> {
  await db
    .request()
    .input('Id', sql.Int, id)
    .input('Status', sql.VarChar(20), status)
    .input('Error', sql.NVarChar(sql.MAX), error)
    .input('Count', sql.Int, newCount)
    .query(
      `UPDATE dbo.TenderSource
       SET LastCollectedAt = SYSUTCDATETIME(),
           LastCollectionStatus = @Status,
           LastCollectionError = @Error,
           TotalCollected = TotalCollected + @Count,
           UpdatedAt = SYSUTCDATETIME()
       WHERE TenderSourceID = @Id`
    );
}
