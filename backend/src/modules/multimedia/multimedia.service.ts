import sql from 'mssql';
import fs from 'fs';
import path from 'path';
import { db } from '../../db/pool';
import { env } from '../../config/env';
import { NotFoundError, BadRequestError } from '../../utils/errors';
import { scopeClause, type DataScope } from '../../utils/scope';

export interface MediaFilters {
  relatedModule?: string;
  relatedRecordId?: number;
  mediaType?: string;
  validationStatus?: string;
  regionId?: number;
  businessGroupId?: number;
  fromDate?: string;
  toDate?: string;
  dataScope: DataScope;
  userId: number;
}

const BASE_SELECT = `
  SELECT ma.MediaID, ma.CaptureDate, ma.CapturedAt, ma.CapturedBy, ma.BusinessGroupID,
         ma.RegionID, ma.OutletID, ma.RelatedModule, ma.RelatedRecordID, ma.MediaType,
         ma.StorageURL, ma.OriginName, ma.SizeBytes, ma.MimeType, ma.CaptureLat,
         ma.CaptureLng, ma.Tag, ma.TranscriptionRequired, ma.Transcription,
         ma.ValidationStatus, ma.Notes, ma.CreatedAt,
         bg.Code AS BusinessGroupCode, bg.Name AS BusinessGroupName,
         r.RegionName, o.OutletName, u.Name AS CapturedByName
  FROM dbo.MultimediaAsset ma
  LEFT JOIN dbo.BusinessGroup bg ON bg.BusinessGroupID = ma.BusinessGroupID
  LEFT JOIN dbo.Region r ON r.RegionID = ma.RegionID
  LEFT JOIN dbo.Outlet o ON o.OutletID = ma.OutletID
  JOIN dbo.[User] u ON u.UserID = ma.CapturedBy`;

export async function listMedia(filters: MediaFilters): Promise<{ items: any[]; total: number }> {
  const where: string[] = ['1=1'];
  const request = db.request();
  if (filters.relatedModule) { where.push('ma.RelatedModule = @Module'); request.input('Module', sql.VarChar(50), filters.relatedModule); }
  if (filters.relatedRecordId) { where.push('ma.RelatedRecordID = @RecordId'); request.input('RecordId', sql.Int, filters.relatedRecordId); }
  if (filters.mediaType) { where.push('ma.MediaType = @MediaType'); request.input('MediaType', sql.VarChar(20), filters.mediaType); }
  if (filters.validationStatus) { where.push('ma.ValidationStatus = @ValStatus'); request.input('ValStatus', sql.VarChar(20), filters.validationStatus); }
  if (filters.regionId) { where.push('ma.RegionID = @RegionId'); request.input('RegionId', sql.Int, filters.regionId); }
  if (filters.businessGroupId) { where.push('ma.BusinessGroupID = @BgId'); request.input('BgId', sql.Int, filters.businessGroupId); }
  if (filters.fromDate) { where.push('ma.CaptureDate >= @From'); request.input('From', sql.Date, filters.fromDate); }
  if (filters.toDate) { where.push('ma.CaptureDate <= @To'); request.input('To', sql.Date, filters.toDate); }
  request.input('UserId', sql.Int, filters.userId);
  const scope = scopeClause(filters.dataScope, { alias: 'ma', ownerColumn: 'CapturedBy', regionColumn: 'RegionID' });
  if (scope) where.push(scope);

  const whereSql = where.join(' AND ');
  const count = await request.query(`SELECT COUNT(*) AS Total FROM (${BASE_SELECT} WHERE ${whereSql}) t`);
  const result = await request.query(`${BASE_SELECT} WHERE ${whereSql} ORDER BY ma.CapturedAt DESC, ma.CreatedAt DESC`);
  return { items: result.recordset, total: count.recordset[0].Total };
}

export async function getMedia(id: number): Promise<any> {
  const result = await db.request().input('Id', sql.Int, id).query(`${BASE_SELECT} WHERE ma.MediaID = @Id`);
  if (result.recordset.length === 0) throw new NotFoundError('Media asset not found');
  return result.recordset[0];
}

// ---------------------------------------------------------------------------
// Read-only aggregate for the Ask AI tool — counts by type, validation status
// and capture month. Honours the caller's data scope like listMedia.
// ---------------------------------------------------------------------------
export async function multimediaOverview(filters: MediaFilters): Promise<any> {
  const where: string[] = ['1=1'];
  const request = db.request();
  if (filters.mediaType) { where.push('ma.MediaType = @MediaType'); request.input('MediaType', sql.VarChar(20), filters.mediaType); }
  if (filters.validationStatus) { where.push('ma.ValidationStatus = @ValStatus'); request.input('ValStatus', sql.VarChar(20), filters.validationStatus); }
  if (filters.regionId) { where.push('ma.RegionID = @RegionId'); request.input('RegionId', sql.Int, filters.regionId); }
  if (filters.businessGroupId) { where.push('ma.BusinessGroupID = @BgId'); request.input('BgId', sql.Int, filters.businessGroupId); }
  if (filters.fromDate) { where.push('ma.CaptureDate >= @From'); request.input('From', sql.Date, filters.fromDate); }
  if (filters.toDate) { where.push('ma.CaptureDate <= @To'); request.input('To', sql.Date, filters.toDate); }
  request.input('UserId', sql.Int, filters.userId);
  const scope = scopeClause(filters.dataScope, { alias: 'ma', ownerColumn: 'CapturedBy', regionColumn: 'RegionID' });
  if (scope) where.push(scope);
  const whereSql = where.join(' AND ');

  const totals = await request.query(
    `SELECT COUNT(*) AS TotalAssets, ISNULL(SUM(ma.SizeBytes), 0) AS TotalBytes,
            COUNT(DISTINCT ma.CapturedBy) AS Contributors
     FROM dbo.MultimediaAsset ma WHERE ${whereSql}`
  );
  const byType = await request.query(
    `SELECT ma.MediaType, COUNT(*) AS Assets FROM dbo.MultimediaAsset ma
     WHERE ${whereSql} GROUP BY ma.MediaType ORDER BY Assets DESC`
  );
  const byStatus = await request.query(
    `SELECT ISNULL(ma.ValidationStatus, 'Unknown') AS ValidationStatus, COUNT(*) AS Assets
     FROM dbo.MultimediaAsset ma WHERE ${whereSql}
     GROUP BY ma.ValidationStatus ORDER BY Assets DESC`
  );
  const byMonth = await request.query(
    `SELECT TOP (12) FORMAT(ma.CaptureDate, 'yyyy-MM') AS Month, COUNT(*) AS Assets
     FROM dbo.MultimediaAsset ma WHERE ${whereSql}
     GROUP BY FORMAT(ma.CaptureDate, 'yyyy-MM') ORDER BY Month DESC`
  );

  return {
    totals: totals.recordset[0],
    byType: byType.recordset,
    byStatus: byStatus.recordset,
    byMonth: byMonth.recordset,
  };
}

export interface MediaUploadInput {
  capturedBy: number;
  captureDate: string;
  capturedAt?: string | null;
  businessGroupId?: number | null;
  regionId?: number | null;
  outletId?: number | null;
  relatedModule?: string | null;
  relatedRecordId?: number | null;
  mediaType: string;
  tag?: string | null;
  transcriptionRequired?: boolean;
  capturedLat?: number | null;
  capturedLng?: number | null;
  notes?: string | null;
}

export async function registerMedia(
  data: MediaUploadInput,
  file: { originalname: string; filename: string; size: number; mimetype: string }
): Promise<number> {
  const storageUrl = `/uploads/${file.filename}`;
  const result = await db
    .request()
    .input('CaptureDate', sql.Date, data.captureDate)
    .input('CapturedAt', sql.DateTime2, data.capturedAt ? new Date(data.capturedAt) : null)
    .input('CapturedBy', sql.Int, data.capturedBy)
    .input('BusinessGroupId', sql.Int, data.businessGroupId ?? null)
    .input('RegionId', sql.Int, data.regionId ?? null)
    .input('OutletId', sql.Int, data.outletId ?? null)
    .input('RelatedModule', sql.VarChar(50), data.relatedModule ?? null)
    .input('RelatedRecordId', sql.Int, data.relatedRecordId ?? null)
    .input('MediaType', sql.VarChar(20), data.mediaType)
    .input('StorageURL', sql.NVarChar(500), storageUrl)
    .input('OriginName', sql.NVarChar(255), file.originalname)
    .input('SizeBytes', sql.BigInt, file.size)
    .input('MimeType', sql.VarChar(100), file.mimetype)
    .input('CaptureLat', sql.Decimal(10, 6), data.capturedLat ?? null)
    .input('CaptureLng', sql.Decimal(10, 6), data.capturedLng ?? null)
    .input('Tag', sql.NVarChar(100), data.tag ?? null)
    .input('TranscriptionRequired', sql.Bit, data.transcriptionRequired ? true : false)
    .input('Notes', sql.NVarChar(sql.MAX), data.notes ?? null)
    .query(
      `INSERT INTO dbo.MultimediaAsset (CaptureDate, CapturedAt, CapturedBy, BusinessGroupID, RegionID,
              OutletID, RelatedModule, RelatedRecordID, MediaType, StorageURL, OriginName,
              SizeBytes, MimeType, CaptureLat, CaptureLng, Tag, TranscriptionRequired, Notes, ValidationStatus)
       OUTPUT INSERTED.MediaID
       VALUES (@CaptureDate, @CapturedAt, @CapturedBy, @BusinessGroupId, @RegionId,
              @OutletId, @RelatedModule, @RelatedRecordId, @MediaType, @StorageURL, @OriginName,
              @SizeBytes, @MimeType, @CaptureLat, @CaptureLng, @Tag, @TranscriptionRequired, @Notes, 'Pending')`
    );
  return result.recordset[0].MediaID;
}

export async function validateMedia(id: number, status: 'Validated' | 'Rejected'): Promise<void> {
  if (!['Validated', 'Rejected'].includes(status)) throw new BadRequestError('Invalid validation status');
  const result = await db.request().input('Id', sql.Int, id).input('Status', sql.VarChar(20), status).query(
    `UPDATE dbo.MultimediaAsset SET ValidationStatus = @Status, UpdatedAt = SYSUTCDATETIME() WHERE MediaID = @Id`
  );
  if (result.rowsAffected[0] === 0) throw new NotFoundError('Media asset not found');
}

export async function updateTranscription(id: number, transcription: string, transcriptionRequired: boolean): Promise<void> {
  const result = await db.request()
    .input('Id', sql.Int, id)
    .input('Transcription', sql.NVarChar(sql.MAX), transcription)
    .input('Required', sql.Bit, transcriptionRequired)
    .query(
      `UPDATE dbo.MultimediaAsset SET Transcription = @Transcription, TranscriptionRequired = @Required, UpdatedAt = SYSUTCDATETIME() WHERE MediaID = @Id`
    );
  if (result.rowsAffected[0] === 0) throw new NotFoundError('Media asset not found');
}

export async function deleteMedia(id: number): Promise<void> {
  const media = await getMedia(id);
  const filename = path.basename(media.StorageURL ?? '');
  const diskPath = path.resolve(env.files.uploadDir, filename);
  const result = await db.request().input('Id', sql.Int, id).query(`DELETE FROM dbo.MultimediaAsset WHERE MediaID = @Id`);
  if (result.rowsAffected[0] === 0) throw new NotFoundError('Media asset not found');
  try {
    if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
  } catch {
    // best-effort disk cleanup; the register row is the source of truth
  }
}
