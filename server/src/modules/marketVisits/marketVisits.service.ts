import sql from 'mssql';
import { getPool } from '../../db/pool';
import { ForbiddenError, NotFoundError } from '../../utils/errors';

export interface MarketVisitFilters {
  outletId?: number;
  regionId?: number;
  fromDate?: string;
  toDate?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface MarketVisitInput {
  outletId: number;
  visitDate: string;
  notes?: string;
}

const VALID_STATUSES = ['Draft', 'Submitted', 'Reviewed'];

export function assertValidStatus(status: string): void {
  if (!VALID_STATUSES.includes(status)) {
    throw new ForbiddenError(`Invalid status '${status}'. Allowed: ${VALID_STATUSES.join(', ')}`);
  }
}

export async function listMarketVisits(filters: MarketVisitFilters) {
  const pool = await getPool();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  let where = 'WHERE 1=1';
  const request = pool.request();
  if (filters.outletId) {
    where += ' AND r.OutletID = @outletId';
    request.input('outletId', sql.Int, filters.outletId);
  }
  if (filters.regionId) {
    where += ' AND o.RegionID = @regionId';
    request.input('regionId', sql.Int, filters.regionId);
  }
  if (filters.fromDate) {
    where += ' AND r.VisitDate >= @fromDate';
    request.input('fromDate', sql.Date, filters.fromDate);
  }
  if (filters.toDate) {
    where += ' AND r.VisitDate <= @toDate';
    request.input('toDate', sql.Date, filters.toDate);
  }
  if (filters.status) {
    where += ' AND r.Status = @status';
    request.input('status', sql.VarChar(20), filters.status);
  }

  const countResult = await request.query(`
    SELECT COUNT(*) AS Total
    FROM dbo.MarketVisitReport r
    JOIN dbo.Outlet o ON o.OutletID = r.OutletID
    ${where}
  `);
  const total = Number(countResult.recordset[0].Total);

  const rows = await pool.request().query(`
    SELECT
      r.ReportID, r.UserID, u.Name AS SubmittedByName, r.OutletID, o.OutletName, o.City,
      reg.RegionID, reg.RegionName, r.VisitDate, r.Notes, r.Status, r.CreatedAt, r.UpdatedAt
    FROM dbo.MarketVisitReport r
    JOIN dbo.[User] u ON u.UserID = r.UserID
    JOIN dbo.Outlet o ON o.OutletID = r.OutletID
    JOIN dbo.Region reg ON reg.RegionID = o.RegionID
    ${where}
    ORDER BY r.CreatedAt DESC
    OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY
  `);

  return { total, page, pageSize, items: rows.recordset };
}

export async function getMarketVisit(id: number) {
  const pool = await getPool();
  const result = await pool.request().input('id', sql.Int, id).query(`
    SELECT
      r.ReportID, r.UserID, u.Name AS SubmittedByName, r.OutletID, o.OutletName, o.City,
      reg.RegionID, reg.RegionName, r.VisitDate, r.Notes, r.Status, r.CreatedAt, r.UpdatedAt
    FROM dbo.MarketVisitReport r
    JOIN dbo.[User] u ON u.UserID = r.UserID
    JOIN dbo.Outlet o ON o.OutletID = r.OutletID
    JOIN dbo.Region reg ON reg.RegionID = o.RegionID
    WHERE r.ReportID = @id
  `);
  const row = result.recordset[0];
  if (!row) throw new NotFoundError('Market visit report not found');
  return row;
}

export async function createMarketVisit(userId: number, input: MarketVisitInput) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('userId', sql.Int, userId)
    .input('outletId', sql.Int, input.outletId)
    .input('visitDate', sql.Date, new Date(input.visitDate))
    .input('notes', sql.NVarChar(sql.MAX), input.notes ?? null)
    .query(`
      INSERT INTO dbo.MarketVisitReport (UserID, OutletID, VisitDate, Notes, Status)
      VALUES (@userId, @outletId, @visitDate, @notes, 'Draft');
      SELECT SCOPE_IDENTITY() AS ReportID;
    `);
  return getMarketVisit(Number(result.recordset[0].ReportID));
}

export async function updateMarketVisit(id: number, userId: number, role: string, input: Partial<MarketVisitInput>) {
  const existing = await getMarketVisit(id);
  if (existing.Status !== 'Draft') {
    throw new ForbiddenError('Only Draft reports can be updated. Submitted/Reviewed reports must be cloned.');
  }
  if (existing.UserID !== userId && role !== 'Administrator') {
    throw new ForbiddenError('Only the submitting officer can edit this report');
  }

  const pool = await getPool();
  await pool
    .request()
    .input('id', sql.Int, id)
    .input('outletId', sql.Int, input.outletId ?? existing.OutletID)
    .input('visitDate', sql.Date, new Date(input.visitDate ?? existing.VisitDate))
    .input('notes', sql.NVarChar(sql.MAX), input.notes ?? existing.Notes)
    .query(`
      UPDATE dbo.MarketVisitReport
      SET OutletID = @outletId, VisitDate = @visitDate, Notes = @notes, UpdatedAt = SYSUTCDATETIME()
      WHERE ReportID = @id
    `);
  return getMarketVisit(id);
}

export async function submitMarketVisit(id: number, userId: number, role: string) {
  const existing = await getMarketVisit(id);
  if (existing.Status !== 'Draft') {
    throw new ForbiddenError('Only Draft reports can be submitted');
  }
  if (existing.UserID !== userId && role !== 'Administrator') {
    throw new ForbiddenError('Only the submitting officer can submit this report');
  }

  const pool = await getPool();
  await pool
    .request()
    .input('id', sql.Int, id)
    .query(`
      UPDATE dbo.MarketVisitReport
      SET Status = 'Submitted', UpdatedAt = SYSUTCDATETIME()
      WHERE ReportID = @id
    `);
  return getMarketVisit(id);
}
