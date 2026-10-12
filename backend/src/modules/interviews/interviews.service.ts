import sql from 'mssql';
import { db } from '../../db/pool';
import { scopeClause, type DataScope } from '../../utils/scope';
import { NotFoundError, ConflictError, BadRequestError } from '../../utils/errors';
import { dispatchEvent } from '../notifications/notifications.service';

export interface InterviewFilters {
  regionId?: number;
  outletId?: number;
  businessGroupId?: number;
  respondentType?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
  dataScope: DataScope;
  userId: number;
  page?: number;
  pageSize?: number;
}

const BASE_SELECT = `
  SELECT i.InterviewID, i.UserID, i.BusinessGroupID, i.RegionID, i.OutletID,
         i.InterviewDate, i.RespondentType, i.RespondentName, i.SatisfactionScore,
         i.Sentiment, i.KeyFeedback, i.PhotoVideoRef, i.Address,
         i.CapturedLat, i.CapturedLng, i.Status, i.ReviewedBy, i.ReviewedAt,
         i.ApprovedBy, i.ApprovedAt, i.CreatedAt, i.UpdatedAt,
         bg.Code AS BusinessGroupCode, bg.Name AS BusinessGroupName,
         r.RegionName, r.Country, o.OutletName, o.City,
         u.Name AS InterviewerName
  FROM dbo.Interview i
  JOIN dbo.BusinessGroup bg ON bg.BusinessGroupID = i.BusinessGroupID
  JOIN dbo.Region r ON r.RegionID = i.RegionID
  LEFT JOIN dbo.Outlet o ON o.OutletID = i.OutletID
  JOIN dbo.[User] u ON u.UserID = i.UserID`;

export async function listInterviews(filters: InterviewFilters): Promise<{ items: any[]; total: number; page: number; pageSize: number }> {
  const where: string[] = ['1=1'];
  const request = db.request();

  if (filters.regionId) { where.push('i.RegionID = @RegionId'); request.input('RegionId', sql.Int, filters.regionId); }
  if (filters.outletId) { where.push('i.OutletID = @OutletId'); request.input('OutletId', sql.Int, filters.outletId); }
  if (filters.businessGroupId) { where.push('i.BusinessGroupID = @BgId'); request.input('BgId', sql.Int, filters.businessGroupId); }
  if (filters.respondentType) { where.push('i.RespondentType = @RespType'); request.input('RespType', sql.VarChar(50), filters.respondentType); }
  if (filters.status) { where.push('i.Status = @Status'); request.input('Status', sql.VarChar(20), filters.status); }
  if (filters.fromDate) { where.push('i.InterviewDate >= @From'); request.input('From', sql.Date, filters.fromDate); }
  if (filters.toDate) { where.push('i.InterviewDate <= @To'); request.input('To', sql.Date, filters.toDate); }

  request.input('UserId', sql.Int, filters.userId);
  const scope = scopeClause(filters.dataScope, { alias: 'i', ownerColumn: 'UserID', regionColumn: 'RegionID' });
  if (scope) where.push(scope);

  const whereSql = where.join(' AND ');
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const offset = (page - 1) * pageSize;
  request.input('Offset', sql.Int, offset);
  request.input('Limit', sql.Int, pageSize);
  const count = await request.query(`SELECT COUNT(*) AS Total FROM (${BASE_SELECT} WHERE ${whereSql}) t`);
  const result = await request.query(`${BASE_SELECT} WHERE ${whereSql} ORDER BY i.InterviewDate DESC, i.CreatedAt DESC OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY`);
  return { items: result.recordset, total: count.recordset[0].Total, page, pageSize };
}

// ---------------------------------------------------------------------------
// Read-only: recent feedback snippets for AI theme extraction (Ask AI tool).
// Capped server-side at 25 rows with 300-char feedback — no respondent names.
// ---------------------------------------------------------------------------
export interface InterviewThemesFilters {
  from?: string;
  to?: string;
  regionId?: number;
  dataScope: DataScope;
  userId: number;
}

export async function interviewThemes(filters: InterviewThemesFilters): Promise<{ items: any[]; total: number }> {
  const where: string[] = ["i.KeyFeedback IS NOT NULL AND i.KeyFeedback <> ''"];
  const request = db.request();
  if (filters.regionId) { where.push('i.RegionID = @RegionId'); request.input('RegionId', sql.Int, filters.regionId); }
  if (filters.from) { where.push('i.InterviewDate >= @From'); request.input('From', sql.Date, filters.from); }
  if (filters.to) { where.push('i.InterviewDate <= @To'); request.input('To', sql.Date, filters.to); }
  request.input('UserId', sql.Int, filters.userId);
  const scope = scopeClause(filters.dataScope, { alias: 'i', ownerColumn: 'UserID', regionColumn: 'RegionID' });
  if (scope) where.push(scope);

  const whereSql = where.join(' AND ');
  const count = await request.query(`SELECT COUNT(*) AS Total FROM dbo.Interview i WHERE ${whereSql}`);
  const result = await request.query(
    `SELECT TOP (25) i.InterviewDate, i.RespondentType, i.SatisfactionScore, i.Sentiment,
            i.Status, LEFT(i.KeyFeedback, 300) AS KeyFeedback, r.RegionName, o.City
     FROM dbo.Interview i
     JOIN dbo.Region r ON r.RegionID = i.RegionID
     LEFT JOIN dbo.Outlet o ON o.OutletID = i.OutletID
     WHERE ${whereSql}
     ORDER BY i.InterviewDate DESC, i.CreatedAt DESC`
  );
  return { items: result.recordset, total: count.recordset[0].Total };
}

export async function getInterview(id: number): Promise<any> {
  const result = await db.request().input('Id', sql.Int, id).query(`${BASE_SELECT} WHERE i.InterviewID = @Id`);
  if (result.recordset.length === 0) throw new NotFoundError('Interview not found');
  const interview = result.recordset[0];
  interview.QAs = await getQAs(id);
  return interview;
}

export interface InterviewInput {
  businessGroupId: number;
  regionId: number;
  outletId?: number | null;
  interviewDate: string;
  respondentType: string;
  respondentName: string;
  satisfactionScore?: number | null;
  sentiment?: string | null;
  keyFeedback?: string | null;
  photoVideoRef?: string | null;
  address?: string | null;
  capturedLat?: number | null;
  capturedLng?: number | null;
  qas?: Array<{ question: string; answer?: string | null }>;
}

async function saveQAs(interviewId: number, qas: Array<{ question: string; answer?: string | null }>): Promise<void> {
  await db.request().input('InterviewId', sql.Int, interviewId).query(
    `DELETE FROM dbo.InterviewQA WHERE InterviewID = @InterviewId`
  );
  for (let i = 0; i < qas.length; i++) {
    const qa = qas[i];
    if (!qa.question?.trim()) continue;
    await db.request()
      .input('InterviewId', sql.Int, interviewId)
      .input('Question', sql.NVarChar(500), qa.question.trim())
      .input('Answer', sql.NVarChar(sql.MAX), qa.answer?.trim() || null)
      .input('SortOrder', sql.Int, i)
      .query(
        `INSERT INTO dbo.InterviewQA (InterviewID, Question, Answer, SortOrder)
         VALUES (@InterviewId, @Question, @Answer, @SortOrder)`
      );
  }
}

async function getQAs(interviewId: number): Promise<Array<{ QuestionID: number; Question: string; Answer: string | null; SortOrder: number }>> {
  const result = await db.request().input('InterviewId', sql.Int, interviewId).query(
    `SELECT QaID AS QuestionID, Question, Answer, SortOrder
     FROM dbo.InterviewQA WHERE InterviewID = @InterviewId ORDER BY SortOrder`
  );
  return result.recordset;
}

export async function createInterview(data: InterviewInput & { userId: number }): Promise<number> {
  const result = await db
    .request()
    .input('UserId', sql.Int, data.userId)
    .input('BusinessGroupId', sql.Int, data.businessGroupId)
    .input('RegionId', sql.Int, data.regionId)
    .input('OutletId', sql.Int, data.outletId ?? null)
    .input('InterviewDate', sql.Date, data.interviewDate)
    .input('RespondentType', sql.VarChar(50), data.respondentType)
    .input('RespondentName', sql.NVarChar(150), data.respondentName)
    .input('SatisfactionScore', sql.Int, data.satisfactionScore ?? null)
    .input('Sentiment', sql.VarChar(50), data.sentiment ?? null)
    .input('KeyFeedback', sql.NVarChar(sql.MAX), data.keyFeedback ?? null)
    .input('PhotoVideoRef', sql.NVarChar(1000), data.photoVideoRef ?? null)
    .input('Address', sql.NVarChar(500), data.address ?? null)
    .input('CapturedLat', sql.Decimal(10, 6), data.capturedLat ?? null)
    .input('CapturedLng', sql.Decimal(10, 6), data.capturedLng ?? null)
    .query(
      `INSERT INTO dbo.Interview (UserID, BusinessGroupID, RegionID, OutletID, InterviewDate,
              RespondentType, RespondentName, SatisfactionScore, Sentiment, KeyFeedback,
              PhotoVideoRef, Address, CapturedLat, CapturedLng, Status)
       OUTPUT INSERTED.InterviewID
       VALUES (@UserId, @BusinessGroupId, @RegionId, @OutletId, @InterviewDate,
              @RespondentType, @RespondentName, @SatisfactionScore, @Sentiment, @KeyFeedback,
              @PhotoVideoRef, @Address, @CapturedLat, @CapturedLng, 'Draft')`
    );
  const interviewId = result.recordset[0].InterviewID;
  if (data.qas?.length) {
    await saveQAs(interviewId, data.qas);
  }
  return interviewId;
}

export async function updateInterview(id: number, data: Partial<InterviewInput>): Promise<void> {
  const interview = await getInterview(id);
  if (interview.Status !== 'Draft') {
    throw new ConflictError('Only draft interviews can be edited', 'NOT_DRAFT');
  }
  const request = db.request().input('Id', sql.Int, id);
  const sets: string[] = ['UpdatedAt = SYSUTCDATETIME()'];
  const map: Array<[keyof InterviewInput, string, any]> = [
    ['businessGroupId', 'BusinessGroupID', sql.Int],
    ['regionId', 'RegionID', sql.Int],
    ['outletId', 'OutletID', sql.Int],
    ['interviewDate', 'InterviewDate', sql.Date],
    ['respondentType', 'RespondentType', sql.VarChar(50)],
    ['respondentName', 'RespondentName', sql.NVarChar(150)],
    ['satisfactionScore', 'SatisfactionScore', sql.Int],
    ['sentiment', 'Sentiment', sql.VarChar(50)],
    ['keyFeedback', 'KeyFeedback', sql.NVarChar(sql.MAX)],
    ['photoVideoRef', 'PhotoVideoRef', sql.NVarChar(1000)],
    ['address', 'Address', sql.NVarChar(500)],
    ['capturedLat', 'CapturedLat', sql.Decimal(10, 6)],
    ['capturedLng', 'CapturedLng', sql.Decimal(10, 6)],
  ];
  for (const [key, column, type] of map) {
    const value = data[key];
    if (value !== undefined) {
      sets.push(`${column} = @${column}`);
      request.input(column, type, value ?? null);
    }
  }
  await request.query(`UPDATE dbo.Interview SET ${sets.join(', ')} WHERE InterviewID = @Id`);
  if (data.qas && Array.isArray(data.qas)) {
    await saveQAs(id, data.qas);
  }
}

export async function submitInterview(id: number): Promise<void> {
  const interview = await getInterview(id);
  if (interview.Status !== 'Draft') throw new ConflictError('Only draft interviews can be submitted', 'NOT_DRAFT');
  await db.request().input('Id', sql.Int, id).query(
    `UPDATE dbo.Interview SET Status = 'Submitted', UpdatedAt = SYSUTCDATETIME() WHERE InterviewID = @Id`
  );
  await dispatchEvent({
    event: 'NewInterview',
    subject: `New customer interview: ${interview.RespondentName}`,
    body: `${interview.InterviewerName} submitted an interview with ${interview.RespondentName} (${interview.RespondentType}) on ${new Date(interview.InterviewDate).toDateString()}.`,
    payload: { interviewId: id, respondent: interview.RespondentName, status: 'Submitted' },
  });
}

export async function reviewInterview(id: number, reviewerId: number): Promise<void> {
  const interview = await getInterview(id);
  if (interview.Status === 'Draft') throw new BadRequestError('An interview must be submitted before review', 'NOT_SUBMITTED');
  await db.request().input('Id', sql.Int, id).input('ReviewerId', sql.Int, reviewerId).query(
    `UPDATE dbo.Interview SET Status = 'Reviewed', ReviewedBy = @ReviewerId, ReviewedAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME() WHERE InterviewID = @Id`
  );
}

export async function approveInterview(id: number, approverId: number): Promise<void> {
  const interview = await getInterview(id);
  if (interview.Status !== 'Reviewed') throw new BadRequestError('An interview must be reviewed before approval', 'NOT_REVIEWED');
  await db.request().input('Id', sql.Int, id).input('ApproverId', sql.Int, approverId).query(
    `UPDATE dbo.Interview SET Status = 'Approved', ApprovedBy = @ApproverId, ApprovedAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME() WHERE InterviewID = @Id`
  );
  await dispatchEvent({
    event: 'InterviewApproved',
    subject: `Interview approved: ${interview.RespondentName}`,
    body: `Your interview with ${interview.RespondentName} has been approved.`,
    payload: { interviewId: id, respondent: interview.RespondentName, status: 'Approved' },
    userIds: [interview.UserID],
  });
}

export async function rejectInterview(id: number, reviewerId: number, reason: string): Promise<void> {
  const interview = await getInterview(id);
  if (interview.Status !== 'Reviewed') throw new BadRequestError('An interview must be reviewed before rejection', 'NOT_REVIEWED');
  await db.request().input('Id', sql.Int, id).input('ReviewerId', sql.Int, reviewerId).input('Reason', sql.NVarChar(sql.MAX), reason).query(
    `UPDATE dbo.Interview SET Status = 'Rejected', RejectedBy = @ReviewerId, RejectedAt = SYSUTCDATETIME(),
     RejectionReason = @Reason, UpdatedAt = SYSUTCDATETIME() WHERE InterviewID = @Id`
  );
  await dispatchEvent({
    event: 'InterviewRejected',
    subject: `Interview rejected: ${interview.RespondentName}`,
    body: `Your interview with ${interview.RespondentName} has been rejected. Reason: ${reason}`,
    payload: { interviewId: id, respondent: interview.RespondentName, status: 'Rejected', reason },
    userIds: [interview.UserID],
  });
}
