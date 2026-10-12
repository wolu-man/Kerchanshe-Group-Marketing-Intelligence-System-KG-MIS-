import sql from 'mssql';
import { db } from '../../db/pool';
import { scopeClause, type DataScope } from '../../utils/scope';
import { NotFoundError, ConflictError, BadRequestError } from '../../utils/errors';
import { dispatchEvent } from '../notifications/notifications.service';

export interface VisitFilters {
  outletId?: number;
  regionId?: number;
  fromDate?: string;
  toDate?: string;
  status?: string;
  userId?: number;
  businessGroupId?: number;
  dataScope: DataScope;
  page?: number;
  pageSize?: number;
}

const BASE_SELECT = `
  SELECT m.ReportID, m.UserID, m.OutletID, m.VisitDate, m.Notes, m.Status,
         m.BusinessGroupID, m.VisitType, m.StockLevelObserved, m.CompetitorPresenceNoted,
         m.KeyFindings, m.PhotoVideoRef, m.FollowUpRequired, m.ShopsVisited,
         m.ReviewedBy, m.ReviewedAt, m.ApprovedBy, m.ApprovedAt, m.CreatedAt, m.UpdatedAt,
         bg.Code AS BusinessGroupCode, bg.Name AS BusinessGroupName,
         o.OutletName, o.City, r.RegionID, r.RegionName, r.Country,
         u.Name AS SubmittedByName
  FROM dbo.MarketVisitReport m
  JOIN dbo.Outlet o ON o.OutletID = m.OutletID
  JOIN dbo.Region r ON r.RegionID = o.RegionID
  JOIN dbo.[User] u ON u.UserID = m.UserID
  LEFT JOIN dbo.BusinessGroup bg ON bg.BusinessGroupID = m.BusinessGroupID`;

export async function listVisits(filters: VisitFilters, userId: number): Promise<{ items: any[]; total: number; page: number; pageSize: number }> {
  const where: string[] = ['1=1'];
  const request = db.request();

  if (filters.outletId) {
    where.push('m.OutletID = @OutletId');
    request.input('OutletId', sql.Int, filters.outletId);
  }
  if (filters.regionId) {
    where.push('r.RegionID = @RegionId');
    request.input('RegionId', sql.Int, filters.regionId);
  }
  if (filters.status) {
    where.push('m.Status = @Status');
    request.input('Status', sql.VarChar(20), filters.status);
  }
  if (filters.fromDate) {
    where.push('m.VisitDate >= @FromDate');
    request.input('FromDate', sql.Date, filters.fromDate);
  }
  if (filters.toDate) {
    where.push('m.VisitDate <= @ToDate');
    request.input('ToDate', sql.Date, filters.toDate);
  }
  if (filters.userId) {
    where.push('m.UserID = @FilterUserId');
    request.input('FilterUserId', sql.Int, filters.userId);
  }
  if (filters.businessGroupId) {
    where.push('m.BusinessGroupID = @BgId');
    request.input('BgId', sql.Int, filters.businessGroupId);
  }
  // Always bind @UserId: the scope clause references it for 'own'/'region'.
  request.input('UserId', sql.Int, userId);
  const scope = scopeClause(filters.dataScope, { alias: 'm', ownerColumn: 'UserID', regionColumn: 'RegionID' });
  if (scope) where.push(scope);

  const whereSql = where.join(' AND ');
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const offset = (page - 1) * pageSize;
  request.input('Offset', sql.Int, offset);
  request.input('Limit', sql.Int, pageSize);
  const count = await request.query(`SELECT COUNT(*) AS Total FROM (${BASE_SELECT} WHERE ${whereSql}) t`);
  const result = await request.query(`${BASE_SELECT} WHERE ${whereSql} ORDER BY m.VisitDate DESC, m.CreatedAt DESC OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY`);
  return { items: result.recordset, total: count.recordset[0].Total, page, pageSize };
}

export async function getVisit(id: number): Promise<any> {
  const result = await db
    .request()
    .input('Id', sql.Int, id)
    .query(`${BASE_SELECT} WHERE m.ReportID = @Id`);
  if (result.recordset.length === 0) throw new NotFoundError('Market visit report not found');
  return result.recordset[0];
}

export interface VisitInput {
  outletId: number;
  visitDate: string;
  notes?: string | null;
  businessGroupId?: number | null;
  visitType?: string | null;
  stockLevelObserved?: string | null;
  competitorPresenceNoted?: string | null;
  keyFindings?: string | null;
  photoVideoRef?: string | null;
  followUpRequired?: boolean | null;
  shopsVisited?: number | null;
}

export async function createVisit(data: VisitInput & { userId: number }): Promise<number> {
  const result = await db
    .request()
    .input('UserId', sql.Int, data.userId)
    .input('OutletId', sql.Int, data.outletId)
    .input('VisitDate', sql.Date, data.visitDate)
    .input('Notes', sql.NVarChar(sql.MAX), data.notes ?? null)
    .input('BusinessGroupId', sql.Int, data.businessGroupId ?? null)
    .input('VisitType', sql.VarChar(50), data.visitType ?? null)
    .input('StockLevelObserved', sql.VarChar(50), data.stockLevelObserved ?? null)
    .input('CompetitorPresenceNoted', sql.NVarChar(500), data.competitorPresenceNoted ?? null)
    .input('KeyFindings', sql.NVarChar(sql.MAX), data.keyFindings ?? null)
    .input('PhotoVideoRef', sql.NVarChar(1000), data.photoVideoRef ?? null)
    .input('FollowUpRequired', sql.Bit, data.followUpRequired ?? null)
    .input('ShopsVisited', sql.Int, data.shopsVisited ?? null)
    .query(
      `INSERT INTO dbo.MarketVisitReport (UserID, OutletID, VisitDate, Notes, BusinessGroupID,
              VisitType, StockLevelObserved, CompetitorPresenceNoted, KeyFindings, PhotoVideoRef, FollowUpRequired, ShopsVisited, Status)
       OUTPUT INSERTED.ReportID
       VALUES (@UserId, @OutletId, @VisitDate, @Notes, @BusinessGroupId,
              @VisitType, @StockLevelObserved, @CompetitorPresenceNoted, @KeyFindings, @PhotoVideoRef, @FollowUpRequired, @ShopsVisited, 'Draft')`
    );
  return result.recordset[0].ReportID;
}

export async function updateVisit(id: number, data: Partial<VisitInput>): Promise<void> {
  const report = await getVisit(id);
  if (report.Status !== 'Draft') {
    throw new ConflictError('Only draft reports can be edited', 'NOT_DRAFT');
  }
  const request = db.request().input('Id', sql.Int, id);
  const sets: string[] = ['UpdatedAt = SYSUTCDATETIME()'];
  const map: Array<[keyof VisitInput, string, any]> = [
    ['outletId', 'OutletID', sql.Int],
    ['visitDate', 'VisitDate', sql.Date],
    ['notes', 'Notes', sql.NVarChar(sql.MAX)],
    ['businessGroupId', 'BusinessGroupID', sql.Int],
    ['visitType', 'VisitType', sql.VarChar(50)],
    ['stockLevelObserved', 'StockLevelObserved', sql.VarChar(50)],
    ['competitorPresenceNoted', 'CompetitorPresenceNoted', sql.NVarChar(500)],
    ['keyFindings', 'KeyFindings', sql.NVarChar(sql.MAX)],
    ['photoVideoRef', 'PhotoVideoRef', sql.NVarChar(1000)],
    ['followUpRequired', 'FollowUpRequired', sql.Bit],
    ['shopsVisited', 'ShopsVisited', sql.Int],
  ];
  for (const [key, column, type] of map) {
    const value = data[key];
    if (value !== undefined) {
      sets.push(`${column} = @${column}`);
      request.input(column, type, value ?? null);
    }
  }
  await request.query(`UPDATE dbo.MarketVisitReport SET ${sets.join(', ')} WHERE ReportID = @Id`);
}

export async function submitVisit(id: number): Promise<void> {
  const report = await getVisit(id);
  if (report.Status !== 'Draft') {
    throw new ConflictError('Only draft reports can be submitted', 'NOT_DRAFT');
  }
  await db
    .request()
    .input('Id', sql.Int, id)
    .query(
      `UPDATE dbo.MarketVisitReport SET Status = 'Submitted', UpdatedAt = SYSUTCDATETIME() WHERE ReportID = @Id`
    );

  // Email notification: new market visit report submitted (FDS EPIC-05, Integration Design 5.2)
  await dispatchEvent({
    event: 'NewReport',
    subject: `New market visit report: ${report.OutletName}`,
    body: `${report.SubmittedByName} submitted a market visit report for ${report.OutletName} on ${new Date(report.VisitDate).toDateString()}.`,
    payload: { reportId: id, outlet: report.OutletName, status: 'Submitted' },
  });
}

export async function reviewVisit(id: number, reviewerId: number): Promise<void> {
  const report = await getVisit(id);
  if (report.Status === 'Draft') {
    throw new BadRequestError('A report must be submitted before it can be reviewed', 'NOT_SUBMITTED');
  }
  await db
    .request()
    .input('Id', sql.Int, id)
    .input('ReviewerId', sql.Int, reviewerId)
    .query(
      `UPDATE dbo.MarketVisitReport
       SET Status = 'Reviewed', ReviewedBy = @ReviewerId, ReviewedAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME()
       WHERE ReportID = @Id`
    );
}

export async function approveVisit(id: number, approverId: number): Promise<void> {
  const report = await getVisit(id);
  if (report.Status !== 'Reviewed') {
    throw new BadRequestError('A report must be reviewed before it can be approved', 'NOT_REVIEWED');
  }
  await db
    .request()
    .input('Id', sql.Int, id)
    .input('ApproverId', sql.Int, approverId)
    .query(
      `UPDATE dbo.MarketVisitReport
       SET Status = 'Approved', ApprovedBy = @ApproverId, ApprovedAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME()
       WHERE ReportID = @Id`
    );

  await dispatchEvent({
    event: 'ReportApproved',
    subject: `Visit report approved: ${report.OutletName}`,
    body: `Your market visit report for ${report.OutletName} has been approved.`,
    payload: { reportId: id, outlet: report.OutletName, status: 'Approved' },
    userIds: [report.UserID],
  });
}

export async function rejectVisit(id: number, reviewerId: number, reason: string): Promise<void> {
  const report = await getVisit(id);
  if (report.Status !== 'Reviewed') {
    throw new BadRequestError('A report must be reviewed before it can be rejected', 'NOT_REVIEWED');
  }
  await db
    .request()
    .input('Id', sql.Int, id)
    .input('ReviewerId', sql.Int, reviewerId)
    .input('Reason', sql.NVarChar(sql.MAX), reason)
    .query(
      `UPDATE dbo.MarketVisitReport
       SET Status = 'Rejected', RejectedBy = @ReviewerId, RejectedAt = SYSUTCDATETIME(),
           RejectionReason = @Reason, UpdatedAt = SYSUTCDATETIME()
       WHERE ReportID = @Id`
    );

  await dispatchEvent({
    event: 'ReportRejected',
    subject: `Visit report rejected: ${report.OutletName}`,
    body: `Your market visit report for ${report.OutletName} has been rejected. Reason: ${reason}`,
    payload: { reportId: id, outlet: report.OutletName, status: 'Rejected', reason },
    userIds: [report.UserID],
  });
}
