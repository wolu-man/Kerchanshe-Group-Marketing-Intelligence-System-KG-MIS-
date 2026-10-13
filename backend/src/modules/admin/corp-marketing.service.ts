import sql from 'mssql';
import { db } from '../../db/pool';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface CorpTaskRow {
  CorpTaskID: number;
  PlanYear: number;
  Month: number;
  TaskId: string;
  ParentCode: string;
  MainActivityKpi: string | null;
  TaskIndex: number;
  TaskName: string;
  ResponsibleRole: string | null;
  ResponsiblePerson: string | null;
  Status: string;
  CompletionPercent: number | null;
  EvidenceRemarks: string | null;
  VerificationNote: string | null;
  VerifiedByUserID: number | null;
  VerifiedByName: string | null;
  VerifiedAt: string | null;
  UpdatedAt: string | null;
}

export interface CorpEventRow {
  CorpEventID: number;
  EventCode: string;
  Category: string | null;
  EventName: string | null;
  BusinessUnit: string | null;
  ResponsiblePerson: string | null;
  ResponsibleRole: string | null;
  Location: string | null;
  StartDate: string | null;
  EndDate: string | null;
  Status: string;
  PlannedParticipants: number | null;
  ActualParticipants: number | null;
  LeadsGenerated: number | null;
  Conversions: number | null;
  PlannedRevenue: number | null;
  ActualRevenue: number | null;
  ApprovedBudget: number | null;
  ActualCost: number | null;
  ReachImpressions: number | null;
  Engagements: number | null;
  SatisfactionScore: number | null;
  KpiTarget: string | null;
  KpiActual: string | null;
  EvidenceLink: string | null;
  Remarks: string | null;
  UpdatedAt: string | null;
  // derived (computed at read time, not stored)
  Month: number | null;
  IsoWeek: number | null;
  ConversionRate: number | null;
  ROIPercent: number | null;
  BudgetVariance: number | null;
  AttendanceRate: number | null;
  EngagementRate: number | null;
}

function pct(numerator: number | null, denominator: number | null): number | null {
  if (numerator == null || denominator == null || denominator === 0) return null;
  return Math.round((numerator / denominator) * 10000) / 100;
}

function deriveEvent(row: Record<string, unknown>): CorpEventRow {
  const startDate = row.StartDate ? new Date(String(row.StartDate)) : null;
  const validDate = startDate && !Number.isNaN(startDate.getTime());
  let month: number | null = null;
  let isoWeek: number | null = null;
  if (validDate && startDate) {
    month = startDate.getMonth() + 1;
    const d = new Date(Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()));
    const dayNum = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dayNum + 3);
    const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    const fDayNum = (firstThursday.getUTCDay() + 6) % 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() - fDayNum + 3);
    isoWeek = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  }

  const leads = (row.LeadsGenerated as number | null) ?? null;
  const conv = (row.Conversions as number | null) ?? null;
  const plannedP = (row.PlannedParticipants as number | null) ?? null;
  const actualP = (row.ActualParticipants as number | null) ?? null;
  const revenue = (row.ActualRevenue as number | null) ?? null;
  const cost = (row.ActualCost as number | null) ?? null;
  const budget = (row.ApprovedBudget as number | null) ?? null;
  const reach = (row.ReachImpressions as number | null) ?? null;
  const engagements = (row.Engagements as number | null) ?? null;

  let roi: number | null = null;
  if (revenue != null && cost != null && cost !== 0) roi = Math.round(((revenue - cost) / cost) * 10000) / 100;
  let variance: number | null = null;
  if (budget != null && cost != null) variance = budget - cost;

  return {
    ...row,
    StartDate: row.StartDate ? String(row.StartDate).slice(0, 10) : null,
    EndDate: row.EndDate ? String(row.EndDate).slice(0, 10) : null,
    VerifiedAt: row.VerifiedAt ? String(row.VerifiedAt) : null,
    UpdatedAt: row.UpdatedAt ? String(row.UpdatedAt) : null,
    Month: month,
    IsoWeek: isoWeek,
    ConversionRate: pct(conv, leads),
    ROIPercent: roi,
    BudgetVariance: variance,
    AttendanceRate: pct(actualP, plannedP),
    EngagementRate: pct(engagements, reach),
  } as unknown as CorpEventRow;
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
export async function listTasks(query: {
  year?: string;
  month?: string;
  role?: string;
  status?: string;
  parentCode?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = query.page ?? 1;
  const pageSize = Math.min(query.pageSize ?? 200, 500);
  const offset = (page - 1) * pageSize;
  const year = Number(query.year) || new Date().getFullYear();

  const request = db.request();
  const conditions: string[] = ['t.PlanYear = @Year'];
  request.input('Year', sql.Int, year);

  if (query.month) {
    conditions.push('t.Month = @Month');
    request.input('Month', sql.TinyInt, Number(query.month));
  }
  if (query.role) {
    conditions.push('t.ResponsibleRole = @Role');
    request.input('Role', sql.NVarChar(200), query.role);
  }
  if (query.status) {
    conditions.push('t.Status = @Status');
    request.input('Status', sql.NVarChar(30), query.status);
  }
  if (query.parentCode) {
    conditions.push('t.ParentCode = @ParentCode');
    request.input('ParentCode', sql.NVarChar(20), query.parentCode);
  }
  if (query.search) {
    conditions.push('(t.TaskName LIKE @Search OR t.ParentCode LIKE @Search OR t.ResponsiblePerson LIKE @Search OR p.MainActivityKpi LIKE @Search)');
    request.input('Search', sql.NVarChar(200), `%${query.search}%`);
  }

  const where = conditions.join(' AND ');
  const countResult = await request.query(`SELECT COUNT(*) AS total FROM dbo.CorpMarketingTask t
    LEFT JOIN dbo.CorpMarketingPlanItem p ON p.PlanYear = t.PlanYear AND p.ParentCode = t.ParentCode
    WHERE ${where}`);

  const pageRequest = db.request();
  pageRequest.input('Year', sql.Int, year);
  if (query.month) pageRequest.input('Month', sql.TinyInt, Number(query.month));
  if (query.role) pageRequest.input('Role', sql.NVarChar(200), query.role);
  if (query.status) pageRequest.input('Status', sql.NVarChar(30), query.status);
  if (query.parentCode) pageRequest.input('ParentCode', sql.NVarChar(20), query.parentCode);
  if (query.search) pageRequest.input('Search', sql.NVarChar(200), `%${query.search}%`);
  pageRequest.input('Limit', sql.Int, pageSize);
  pageRequest.input('Offset', sql.Int, offset);

  const items = await pageRequest.query(`
    SELECT t.CorpTaskID, t.PlanYear, t.Month, t.TaskId, t.ParentCode, p.MainActivityKpi,
           t.TaskIndex, t.TaskName, t.ResponsibleRole, t.ResponsiblePerson, t.Status,
           t.CompletionPercent, t.EvidenceRemarks, t.VerificationNote,
           t.VerifiedByUserID, u.Name AS VerifiedByName, t.VerifiedAt, t.UpdatedAt
    FROM dbo.CorpMarketingTask t
    LEFT JOIN dbo.CorpMarketingPlanItem p ON p.PlanYear = t.PlanYear AND p.ParentCode = t.ParentCode
    LEFT JOIN dbo.[User] u ON u.UserID = t.VerifiedByUserID
    WHERE ${where}
    ORDER BY t.ParentCode, t.TaskIndex
    OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY
  `);

  return {
    items: items.recordset as CorpTaskRow[],
    total: countResult.recordset[0].total as number,
    page,
    pageSize,
    year,
    month: query.month ? Number(query.month) : null,
  };
}

export async function updateTask(corpTaskId: number, data: {
  taskName?: string;
  responsibleRole?: string | null;
  responsiblePerson?: string | null;
  completionPercent?: number | null;
  evidenceRemarks?: string | null;
}) {
  const request = db.request();
  request.input('CorpTaskID', sql.Int, corpTaskId);
  const existing = await request.query('SELECT CorpTaskID, Status FROM dbo.CorpMarketingTask WHERE CorpTaskID = @CorpTaskID');
  if (existing.recordset.length === 0) throw new Error('TASK_NOT_FOUND');
  const currentStatus = existing.recordset[0].Status as string;

  const sets: string[] = [];
  const updateRequest = db.request();
  updateRequest.input('CorpTaskID', sql.Int, corpTaskId);
  if (data.taskName !== undefined) {
    sets.push('TaskName = @TaskName');
    updateRequest.input('TaskName', sql.NVarChar(500), data.taskName);
  }
  if (data.responsibleRole !== undefined) {
    sets.push('ResponsibleRole = @ResponsibleRole');
    updateRequest.input('ResponsibleRole', sql.NVarChar(200), data.responsibleRole);
  }
  if (data.responsiblePerson !== undefined) {
    sets.push('ResponsiblePerson = @ResponsiblePerson');
    updateRequest.input('ResponsiblePerson', sql.NVarChar(200), data.responsiblePerson);
  }
  if (data.completionPercent !== undefined) {
    sets.push('CompletionPercent = @CompletionPercent');
    updateRequest.input('CompletionPercent', sql.Decimal(5, 2), data.completionPercent);
  }
  if (data.evidenceRemarks !== undefined) {
    sets.push('EvidenceRemarks = @EvidenceRemarks');
    updateRequest.input('EvidenceRemarks', sql.NVarChar(2000), data.evidenceRemarks);
  }
  if (sets.length === 0) return { corpTaskId, requeued: false };

  // Editing a rejected task returns it to the verification queue.
  let requeued = false;
  if (currentStatus === 'Rejected') {
    sets.push("Status = 'Not Verified'");
    sets.push('VerificationNote = NULL');
    sets.push('VerifiedByUserID = NULL');
    sets.push('VerifiedAt = NULL');
    requeued = true;
  }
  sets.push('UpdatedAt = SYSUTCDATETIME()');

  await updateRequest.query(`
    UPDATE dbo.CorpMarketingTask SET ${sets.join(', ')}
    WHERE CorpTaskID = @CorpTaskID
  `);

  return { corpTaskId, requeued };
}

export async function createTask(data: {
  planYear: number;
  month: number;
  parentCode: string;
  parentName?: string | null;
  taskName: string;
  responsibleRole?: string | null;
  responsiblePerson?: string | null;
  completionPercent?: number | null;
  evidenceRemarks?: string | null;
}) {
  const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const request = db.request();
  request.input('PlanYear', sql.Int, data.planYear);
  request.input('ParentCode', sql.NVarChar(20), data.parentCode);
  const parent = await request.query(
    'SELECT ParentCode FROM dbo.CorpMarketingPlanItem WHERE PlanYear = @PlanYear AND ParentCode = @ParentCode'
  );

  if (parent.recordset.length === 0) {
    const p = db.request();
    p.input('PlanYear', sql.Int, data.planYear);
    p.input('ParentCode', sql.NVarChar(20), data.parentCode);
    p.input('MainActivityKpi', sql.NVarChar(500), data.parentName ?? data.parentCode);
    await p.query(`
      INSERT INTO dbo.CorpMarketingPlanItem (PlanYear, ParentCode, MainActivityKpi)
      VALUES (@PlanYear, @ParentCode, @MainActivityKpi)
    `);
  } else if (data.parentName) {
    const p = db.request();
    p.input('PlanYear', sql.Int, data.planYear);
    p.input('ParentCode', sql.NVarChar(20), data.parentCode);
    p.input('MainActivityKpi', sql.NVarChar(500), data.parentName);
    await p.query(`
      UPDATE dbo.CorpMarketingPlanItem SET MainActivityKpi = @MainActivityKpi
      WHERE PlanYear = @PlanYear AND ParentCode = @ParentCode
    `);
  }

  const idxRequest = db.request();
  idxRequest.input('PlanYear', sql.Int, data.planYear);
  idxRequest.input('ParentCode', sql.NVarChar(20), data.parentCode);
  idxRequest.input('Month', sql.TinyInt, data.month);
  const idxResult = await idxRequest.query(`
    SELECT ISNULL(MAX(TaskIndex), 0) + 1 AS nextIndex
    FROM dbo.CorpMarketingTask
    WHERE PlanYear = @PlanYear AND ParentCode = @ParentCode AND Month = @Month
  `);
  const taskIndex = idxResult.recordset[0].nextIndex as number;

  const prefix = `${MONTH_ABBR[data.month - 1]}-${data.parentCode}`;
  const idRequest = db.request();
  idRequest.input('Prefix', sql.NVarChar(50), `${prefix}-%`);
  const idResult = await idRequest.query(`
    SELECT TOP 1 TaskId FROM dbo.CorpMarketingTask
    WHERE TaskId LIKE @Prefix ORDER BY TaskId DESC
  `);
  let seq = 1;
  if (idResult.recordset.length > 0) {
    const last = String(idResult.recordset[0].TaskId);
    const m = last.match(/-(\d+)$/);
    if (m) seq = Number(m[1]) + 1;
  }
  let taskId = `${prefix}-${String(seq).padStart(2, '0')}`;
  for (let attempt = 0; attempt < 20; attempt++) {
    const c = db.request();
    c.input('TaskId', sql.NVarChar(50), taskId);
    const dupe = await c.query('SELECT 1 FROM dbo.CorpMarketingTask WHERE TaskId = @TaskId');
    if (dupe.recordset.length === 0) break;
    seq += 1;
    taskId = `${prefix}-${String(seq).padStart(2, '0')}`;
  }

  const insert = db.request();
  insert.input('PlanYear', sql.Int, data.planYear);
  insert.input('Month', sql.TinyInt, data.month);
  insert.input('TaskId', sql.NVarChar(50), taskId);
  insert.input('ParentCode', sql.NVarChar(20), data.parentCode);
  insert.input('TaskIndex', sql.Int, taskIndex);
  insert.input('TaskName', sql.NVarChar(500), data.taskName);
  insert.input('ResponsibleRole', sql.NVarChar(200), data.responsibleRole ?? null);
  insert.input('ResponsiblePerson', sql.NVarChar(200), data.responsiblePerson ?? null);
  insert.input('CompletionPercent', sql.Decimal(5, 2), data.completionPercent ?? null);
  insert.input('EvidenceRemarks', sql.NVarChar(2000), data.evidenceRemarks ?? null);
  const inserted = await insert.query(`
    INSERT INTO dbo.CorpMarketingTask
      (PlanYear, Month, TaskId, ParentCode, TaskIndex, TaskName, ResponsibleRole, ResponsiblePerson, CompletionPercent, EvidenceRemarks)
    OUTPUT INSERTED.CorpTaskID
    VALUES (@PlanYear, @Month, @TaskId, @ParentCode, @TaskIndex, @TaskName, @ResponsibleRole, @ResponsiblePerson, @CompletionPercent, @EvidenceRemarks)
  `);

  return { corpTaskId: inserted.recordset[0].CorpTaskID as number, taskId };
}

export async function deleteTask(corpTaskId: number) {
  const request = db.request();
  request.input('CorpTaskID', sql.Int, corpTaskId);
  const result = await request.query('DELETE FROM dbo.CorpMarketingTask WHERE CorpTaskID = @CorpTaskID');
  if ((result.rowsAffected[0] ?? 0) === 0) throw new Error('TASK_NOT_FOUND');
  return { deleted: true, corpTaskId };
}

export async function verifyTasks(data: {
  ids: number[];
  decision: 'Verified' | 'Rejected';
  note?: string | null;
  reviewerUserId: number;
}) {
  const request = db.request();
  request.input('Decision', sql.NVarChar(20), data.decision);
  request.input('Note', sql.NVarChar(500), data.note ?? null);
  request.input('ReviewerUserID', sql.Int, data.reviewerUserId);
  const idParams = data.ids.map((id, i) => {
    request.input(`Id${i}`, sql.Int, id);
    return `@Id${i}`;
  });

  const result = await request.query(`
    UPDATE dbo.CorpMarketingTask SET
      Status = @Decision, VerificationNote = @Note,
      VerifiedByUserID = @ReviewerUserID, VerifiedAt = SYSUTCDATETIME(),
      UpdatedAt = SYSUTCDATETIME()
    WHERE CorpTaskID IN (${idParams.join(', ')})
      AND Status = 'Not Verified'
  `);

  return { updated: result.rowsAffected[0] ?? 0, decision: data.decision };
}

export async function getTaskSummary(query: { year?: string; month?: string }) {
  const year = Number(query.year) || new Date().getFullYear();
  const request = db.request();
  request.input('Year', sql.Int, year);
  let monthFilter = '';
  if (query.month) {
    monthFilter = 'AND Month = @Month';
    request.input('Month', sql.TinyInt, Number(query.month));
  }

  const result = await request.query(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN Status = 'Verified' THEN 1 ELSE 0 END) AS verified,
      SUM(CASE WHEN Status = 'Rejected' THEN 1 ELSE 0 END) AS rejected,
      SUM(CASE WHEN Status = 'Not Verified' THEN 1 ELSE 0 END) AS notVerified,
      AVG(CompletionPercent) AS avgCompletion,
      SUM(CASE WHEN ResponsiblePerson IS NOT NULL THEN 1 ELSE 0 END) AS assigned
    FROM dbo.CorpMarketingTask
    WHERE PlanYear = @Year ${monthFilter}
  `);

  const events = await db.request().query(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN Status = 'Planned' THEN 1 ELSE 0 END) AS planned,
      SUM(CASE WHEN Status = 'In Progress' THEN 1 ELSE 0 END) AS inProgress,
      SUM(CASE WHEN Status = 'Completed' THEN 1 ELSE 0 END) AS completed
    FROM dbo.CorpMarketingEvent
  `);

  const byRole = await request.query(`
    SELECT ResponsibleRole, COUNT(*) AS total,
      SUM(CASE WHEN Status = 'Verified' THEN 1 ELSE 0 END) AS verified,
      AVG(CompletionPercent) AS avgCompletion
    FROM dbo.CorpMarketingTask
    WHERE PlanYear = @Year ${monthFilter}
    GROUP BY ResponsibleRole
    ORDER BY ResponsibleRole
  `);

  const row = result.recordset[0];
  return {
    year,
    month: query.month ? Number(query.month) : null,
    tasks: {
      total: row.total ?? 0,
      verified: row.verified ?? 0,
      rejected: row.rejected ?? 0,
      notVerified: row.notVerified ?? 0,
      avgCompletion: row.avgCompletion != null ? Math.round(Number(row.avgCompletion) * 10) / 10 : null,
      assigned: row.assigned ?? 0,
    },
    byRole: byRole.recordset,
    events: events.recordset[0],
  };
}

// ---------------------------------------------------------------------------
// Events & Campaigns
// ---------------------------------------------------------------------------
export async function listEvents(query: { status?: string; search?: string }) {
  const request = db.request();
  const conditions: string[] = ['1=1'];
  if (query.status) {
    conditions.push('Status = @Status');
    request.input('Status', sql.NVarChar(30), query.status);
  }
  if (query.search) {
    conditions.push('(EventCode LIKE @Search OR EventName LIKE @Search OR Category LIKE @Search OR BusinessUnit LIKE @Search OR ResponsiblePerson LIKE @Search)');
    request.input('Search', sql.NVarChar(200), `%${query.search}%`);
  }

  const result = await request.query(`
    SELECT * FROM dbo.CorpMarketingEvent
    WHERE ${conditions.join(' AND ')}
    ORDER BY EventCode
  `);

  const items = result.recordset.map((r) => deriveEvent(r as Record<string, unknown>));
  return { items, total: items.length };
}

export async function createEvent(data: {
  category?: string | null;
  eventName: string;
  businessUnit?: string | null;
  responsiblePerson?: string | null;
  responsibleRole?: string | null;
  location?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: string;
  plannedParticipants?: number | null;
  actualParticipants?: number | null;
  leadsGenerated?: number | null;
  conversions?: number | null;
  plannedRevenue?: number | null;
  actualRevenue?: number | null;
  approvedBudget?: number | null;
  actualCost?: number | null;
  reachImpressions?: number | null;
  engagements?: number | null;
  satisfactionScore?: number | null;
  kpiTarget?: string | null;
  kpiActual?: string | null;
  evidenceLink?: string | null;
  remarks?: string | null;
}) {
  const codeResult = await db.request().query(`
    SELECT TOP 1 EventCode FROM dbo.CorpMarketingEvent
    WHERE EventCode LIKE 'EVT-%' ORDER BY EventCode DESC
  `);
  let seq = 1;
  if (codeResult.recordset.length > 0) {
    const m = String(codeResult.recordset[0].EventCode).match(/(\d+)$/);
    if (m) seq = Number(m[1]) + 1;
  }
  let eventCode = `EVT-${String(seq).padStart(3, '0')}`;
  for (let attempt = 0; attempt < 20; attempt++) {
    const c = db.request();
    c.input('EventCode', sql.NVarChar(20), eventCode);
    const dupe = await c.query('SELECT 1 FROM dbo.CorpMarketingEvent WHERE EventCode = @EventCode');
    if (dupe.recordset.length === 0) break;
    seq += 1;
    eventCode = `EVT-${String(seq).padStart(3, '0')}`;
  }

  const r = db.request();
  r.input('EventCode', sql.NVarChar(20), eventCode);
  r.input('EventName', sql.NVarChar(300), data.eventName);
  r.input('Category', sql.NVarChar(100), data.category ?? null);
  r.input('BusinessUnit', sql.NVarChar(100), data.businessUnit ?? null);
  r.input('ResponsiblePerson', sql.NVarChar(200), data.responsiblePerson ?? null);
  r.input('ResponsibleRole', sql.NVarChar(200), data.responsibleRole ?? null);
  r.input('Location', sql.NVarChar(200), data.location ?? null);
  r.input('StartDate', sql.Date, data.startDate ?? null);
  r.input('EndDate', sql.Date, data.endDate ?? null);
  r.input('Status', sql.NVarChar(30), data.status ?? 'Planned');
  r.input('PlannedParticipants', sql.Int, data.plannedParticipants ?? null);
  r.input('ActualParticipants', sql.Int, data.actualParticipants ?? null);
  r.input('LeadsGenerated', sql.Int, data.leadsGenerated ?? null);
  r.input('Conversions', sql.Int, data.conversions ?? null);
  r.input('PlannedRevenue', sql.Decimal(18, 2), data.plannedRevenue ?? null);
  r.input('ActualRevenue', sql.Decimal(18, 2), data.actualRevenue ?? null);
  r.input('ApprovedBudget', sql.Decimal(18, 2), data.approvedBudget ?? null);
  r.input('ActualCost', sql.Decimal(18, 2), data.actualCost ?? null);
  r.input('ReachImpressions', sql.BigInt, data.reachImpressions ?? null);
  r.input('Engagements', sql.Int, data.engagements ?? null);
  r.input('SatisfactionScore', sql.Decimal(5, 2), data.satisfactionScore ?? null);
  r.input('KpiTarget', sql.NVarChar(500), data.kpiTarget ?? null);
  r.input('KpiActual', sql.NVarChar(500), data.kpiActual ?? null);
  r.input('EvidenceLink', sql.NVarChar(500), data.evidenceLink ?? null);
  r.input('Remarks', sql.NVarChar(2000), data.remarks ?? null);

  const inserted = await r.query(`
    INSERT INTO dbo.CorpMarketingEvent
      (EventCode, Category, EventName, BusinessUnit, ResponsiblePerson, ResponsibleRole, Location,
       StartDate, EndDate, Status, PlannedParticipants, ActualParticipants, LeadsGenerated, Conversions,
       PlannedRevenue, ActualRevenue, ApprovedBudget, ActualCost, ReachImpressions, Engagements,
       SatisfactionScore, KpiTarget, KpiActual, EvidenceLink, Remarks)
    OUTPUT INSERTED.CorpEventID
    VALUES (@EventCode, @Category, @EventName, @BusinessUnit, @ResponsiblePerson, @ResponsibleRole, @Location,
       @StartDate, @EndDate, @Status, @PlannedParticipants, @ActualParticipants, @LeadsGenerated, @Conversions,
       @PlannedRevenue, @ActualRevenue, @ApprovedBudget, @ActualCost, @ReachImpressions, @Engagements,
       @SatisfactionScore, @KpiTarget, @KpiActual, @EvidenceLink, @Remarks)
  `);

  const created = await db.request()
    .input('CorpEventID', sql.Int, inserted.recordset[0].CorpEventID as number)
    .query('SELECT * FROM dbo.CorpMarketingEvent WHERE CorpEventID = @CorpEventID');
  return deriveEvent(created.recordset[0] as Record<string, unknown>);
}

export async function deleteEvent(corpEventId: number) {
  const request = db.request();
  request.input('CorpEventID', sql.Int, corpEventId);
  const result = await request.query('DELETE FROM dbo.CorpMarketingEvent WHERE CorpEventID = @CorpEventID');
  if ((result.rowsAffected[0] ?? 0) === 0) throw new Error('EVENT_NOT_FOUND');
  return { deleted: true, corpEventId };
}

export async function updateEvent(corpEventId: number, data: {
  category?: string | null;
  eventName?: string | null;
  businessUnit?: string | null;
  responsiblePerson?: string | null;
  responsibleRole?: string | null;
  location?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: string;
  plannedParticipants?: number | null;
  actualParticipants?: number | null;
  leadsGenerated?: number | null;
  conversions?: number | null;
  plannedRevenue?: number | null;
  actualRevenue?: number | null;
  approvedBudget?: number | null;
  actualCost?: number | null;
  reachImpressions?: number | null;
  engagements?: number | null;
  satisfactionScore?: number | null;
  kpiTarget?: string | null;
  kpiActual?: string | null;
  evidenceLink?: string | null;
  remarks?: string | null;
}) {
  const request = db.request();
  request.input('CorpEventID', sql.Int, corpEventId);
  const existing = await request.query('SELECT CorpEventID FROM dbo.CorpMarketingEvent WHERE CorpEventID = @CorpEventID');
  if (existing.recordset.length === 0) throw new Error('EVENT_NOT_FOUND');

  const r = db.request();
  r.input('CorpEventID', sql.Int, corpEventId);

  const sets: string[] = [];
  const put = (column: string, type: Parameters<sql.Request['input']>[1], value: unknown) => {
    sets.push(`${column} = @${column}`);
    r.input(column, type, value as never);
  };
  if (data.category !== undefined) put('Category', sql.NVarChar(100), data.category);
  if (data.eventName !== undefined) put('EventName', sql.NVarChar(300), data.eventName);
  if (data.businessUnit !== undefined) put('BusinessUnit', sql.NVarChar(100), data.businessUnit);
  if (data.responsiblePerson !== undefined) put('ResponsiblePerson', sql.NVarChar(200), data.responsiblePerson);
  if (data.responsibleRole !== undefined) put('ResponsibleRole', sql.NVarChar(200), data.responsibleRole);
  if (data.location !== undefined) put('Location', sql.NVarChar(200), data.location);
  if (data.startDate !== undefined) put('StartDate', sql.Date, data.startDate);
  if (data.endDate !== undefined) put('EndDate', sql.Date, data.endDate);
  if (data.status !== undefined) put('Status', sql.NVarChar(30), data.status);
  if (data.plannedParticipants !== undefined) put('PlannedParticipants', sql.Int, data.plannedParticipants);
  if (data.actualParticipants !== undefined) put('ActualParticipants', sql.Int, data.actualParticipants);
  if (data.leadsGenerated !== undefined) put('LeadsGenerated', sql.Int, data.leadsGenerated);
  if (data.conversions !== undefined) put('Conversions', sql.Int, data.conversions);
  if (data.plannedRevenue !== undefined) put('PlannedRevenue', sql.Decimal(18, 2), data.plannedRevenue);
  if (data.actualRevenue !== undefined) put('ActualRevenue', sql.Decimal(18, 2), data.actualRevenue);
  if (data.approvedBudget !== undefined) put('ApprovedBudget', sql.Decimal(18, 2), data.approvedBudget);
  if (data.actualCost !== undefined) put('ActualCost', sql.Decimal(18, 2), data.actualCost);
  if (data.reachImpressions !== undefined) put('ReachImpressions', sql.BigInt, data.reachImpressions);
  if (data.engagements !== undefined) put('Engagements', sql.Int, data.engagements);
  if (data.satisfactionScore !== undefined) put('SatisfactionScore', sql.Decimal(5, 2), data.satisfactionScore);
  if (data.kpiTarget !== undefined) put('KpiTarget', sql.NVarChar(500), data.kpiTarget);
  if (data.kpiActual !== undefined) put('KpiActual', sql.NVarChar(500), data.kpiActual);
  if (data.evidenceLink !== undefined) put('EvidenceLink', sql.NVarChar(500), data.evidenceLink);
  if (data.remarks !== undefined) put('Remarks', sql.NVarChar(2000), data.remarks);

  if (sets.length === 0) {
    const current = await db.request()
      .input('CorpEventID', sql.Int, corpEventId)
      .query('SELECT * FROM dbo.CorpMarketingEvent WHERE CorpEventID = @CorpEventID');
    if (current.recordset.length === 0) throw new Error('EVENT_NOT_FOUND');
    return deriveEvent(current.recordset[0] as Record<string, unknown>);
  }
  sets.push('UpdatedAt = SYSUTCDATETIME()');

  await r.query(`
    UPDATE dbo.CorpMarketingEvent SET ${sets.join(', ')}
    WHERE CorpEventID = @CorpEventID
  `);

  const updated = await db.request()
    .input('CorpEventID', sql.Int, corpEventId)
    .query('SELECT * FROM dbo.CorpMarketingEvent WHERE CorpEventID = @CorpEventID');
  return deriveEvent(updated.recordset[0] as Record<string, unknown>);
}

export async function getRoles() {
  const result = await db.request().query(`
    SELECT DISTINCT ResponsibleRole FROM dbo.CorpMarketingTask
    WHERE ResponsibleRole IS NOT NULL ORDER BY ResponsibleRole
  `);
  return result.recordset.map((r) => r.ResponsibleRole as string);
}

export async function listParents(year?: number) {
  const y = year || new Date().getFullYear();
  const request = db.request();
  request.input('PlanYear', sql.Int, y);
  const result = await request.query(`
    SELECT p.ParentCode, p.MainActivityKpi, COUNT(t.CorpTaskID) AS taskCount
    FROM dbo.CorpMarketingPlanItem p
    LEFT JOIN dbo.CorpMarketingTask t ON t.PlanYear = p.PlanYear AND t.ParentCode = p.ParentCode
    WHERE p.PlanYear = @PlanYear
    GROUP BY p.ParentCode, p.MainActivityKpi
    ORDER BY p.ParentCode
  `);
  return result.recordset;
}
