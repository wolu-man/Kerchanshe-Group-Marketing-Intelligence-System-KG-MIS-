import sql from 'mssql';
import { db } from '../../db/pool';
import { dispatchEvent } from '../notifications/notifications.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface PlanRow {
  PlanID: number;
  ParentPlanID: number | null;
  Title: string;
  Description: string | null;
  Frequency: string;
  PeriodStart: string;
  PeriodEnd: string;
  PlannedSubmissionDate: string | null;
  ActualSubmissionDate: string | null;
  Status: string;
  ResponsibleUserID: number | null;
  ResponsibleUserName: string | null;
  ResponsibleTeam: string | null;
  RegionID: number | null;
  RegionName: string | null;
  MainFocus: string | null;
  KeyDeliverable: string | null;
  ApprovalStatus: string;
  ApprovedBy: number | null;
  ApprovedByName: string | null;
  ApprovedAt: string | null;
  Remarks: string | null;
  CreatedBy: number | null;
  CreatedByName: string | null;
  CreatedAt: string;
  UpdatedAt: string | null;
  ActivityCount?: number;
  CompletedActivities?: number;
  ChildCount?: number;
}

export interface ActivityRow {
  ActivityID: number;
  PlanID: number;
  Title: string;
  Description: string | null;
  DetailedActivity: string | null;
  Frequency: string | null;
  StartDate: string;
  EndDate: string;
  PlannedSubmissionDate: string | null;
  ActualSubmissionDate: string | null;
  Status: string;
  Priority: string;
  ResponsibleUserID: number | null;
  ResponsibleUserName: string | null;
  ResponsibleTeam: string | null;
  RegionID: number | null;
  RegionName: string | null;
  ProductID: number | null;
  ProductName: string | null;
  MainFocus: string | null;
  ActivityType: string | null;
  ExpectedDeliverable: string | null;
  Target: string | null;
  Unit: string | null;
  ApprovalStatus: string;
  Remarks: string | null;
  CreatedBy: number | null;
  CreatedByName: string | null;
  CreatedAt: string;
  UpdatedAt: string | null;
}

export interface PlanWithChildren extends PlanRow {
  children: PlanWithChildren[];
  activities: ActivityRow[];
}

// ---------------------------------------------------------------------------
// Plan CRUD
// ---------------------------------------------------------------------------
export async function listPlans(query: {
  frequency?: string;
  status?: string;
  parentId?: string;
  responsibleUserId?: string;
  regionId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = query.page ?? 1;
  const pageSize = Math.min(query.pageSize ?? 20, 100);
  const offset = (page - 1) * pageSize;

  const request = db.request();
  const conditions: string[] = ['1=1'];

  if (query.frequency) {
    conditions.push('p.Frequency = @Frequency');
    request.input('Frequency', sql.NVarChar(20), query.frequency);
  }
  if (query.status) {
    conditions.push('p.Status = @Status');
    request.input('Status', sql.NVarChar(30), query.status);
  }
  if (query.parentId) {
    if (query.parentId === 'null') {
      conditions.push('p.ParentPlanID IS NULL');
    } else {
      conditions.push('p.ParentPlanID = @ParentPlanID');
      request.input('ParentPlanID', sql.Int, Number(query.parentId));
    }
  }
  if (query.responsibleUserId) {
    conditions.push('p.ResponsibleUserID = @ResponsibleUserID');
    request.input('ResponsibleUserID', sql.Int, Number(query.responsibleUserId));
  }
  if (query.regionId) {
    conditions.push('p.RegionID = @RegionID');
    request.input('RegionID', sql.Int, Number(query.regionId));
  }
  if (query.search) {
    conditions.push('(p.Title LIKE @Search OR p.Description LIKE @Search)');
    request.input('Search', sql.NVarChar(200), `%${query.search}%`);
  }

  const where = conditions.join(' AND ');

  const countResult = await request.query(`SELECT COUNT(*) AS total FROM dbo.[Plan] p WHERE ${where}`);
  const total = countResult.recordset[0].total;

  const dataRequest = db.request();
  if (query.frequency) dataRequest.input('Frequency', sql.NVarChar(20), query.frequency);
  if (query.status) dataRequest.input('Status', sql.NVarChar(30), query.status);
  if (query.parentId) {
    if (query.parentId === 'null') {
    } else {
      dataRequest.input('ParentPlanID', sql.Int, Number(query.parentId));
    }
  }
  if (query.responsibleUserId) dataRequest.input('ResponsibleUserID', sql.Int, Number(query.responsibleUserId));
  if (query.regionId) dataRequest.input('RegionID', sql.Int, Number(query.regionId));
  if (query.search) dataRequest.input('Search', sql.NVarChar(200), `%${query.search}%`);
  dataRequest.input('Offset', sql.Int, offset);
  dataRequest.input('Limit', sql.Int, pageSize);

  const result = await dataRequest.query<PlanRow>(`
    SELECT
      p.*,
      ru.Name AS ResponsibleUserName,
      r.RegionName,
      ab.Name AS ApprovedByName,
      cb.Name AS CreatedByName,
      (SELECT COUNT(*) FROM dbo.[Plan] cp WHERE cp.ParentPlanID = p.PlanID) AS ChildCount,
      (SELECT COUNT(*) FROM dbo.PlanActivity pa WHERE pa.PlanID = p.PlanID) AS ActivityCount,
      (SELECT COUNT(*) FROM dbo.PlanActivity pa WHERE pa.PlanID = p.PlanID AND pa.Status = 'Completed') AS CompletedActivities
    FROM dbo.[Plan] p
    LEFT JOIN dbo.[User] ru ON ru.UserID = p.ResponsibleUserID
    LEFT JOIN dbo.Region r ON r.RegionID = p.RegionID
    LEFT JOIN dbo.[User] ab ON ab.UserID = p.ApprovedBy
    LEFT JOIN dbo.[User] cb ON cb.UserID = p.CreatedBy
    WHERE ${where}
    ORDER BY p.PeriodStart DESC, p.Frequency
    OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY
  `);

  return { items: result.recordset, total, page, pageSize };
}

export async function getPlanDetail(planId: number): Promise<PlanWithChildren | null> {
  const request = db.request();
  request.input('PlanID', sql.Int, planId);

  const planResult = await request.query<PlanRow>(`
    SELECT
      p.*,
      ru.Name AS ResponsibleUserName,
      r.RegionName,
      ab.Name AS ApprovedByName,
      cb.Name AS CreatedByName,
      (SELECT COUNT(*) FROM dbo.[Plan] cp WHERE cp.ParentPlanID = p.PlanID) AS ChildCount,
      (SELECT COUNT(*) FROM dbo.PlanActivity pa WHERE pa.PlanID = p.PlanID) AS ActivityCount,
      (SELECT COUNT(*) FROM dbo.PlanActivity pa WHERE pa.PlanID = p.PlanID AND pa.Status = 'Completed') AS CompletedActivities
    FROM dbo.[Plan] p
    LEFT JOIN dbo.[User] ru ON ru.UserID = p.ResponsibleUserID
    LEFT JOIN dbo.Region r ON r.RegionID = p.RegionID
    LEFT JOIN dbo.[User] ab ON ab.UserID = p.ApprovedBy
    LEFT JOIN dbo.[User] cb ON cb.UserID = p.CreatedBy
    WHERE p.PlanID = @PlanID
  `);

  if (planResult.recordset.length === 0) return null;
  const plan = planResult.recordset[0];

  const childResult = await request.query<PlanRow>(`
    SELECT
      p.*,
      ru.Name AS ResponsibleUserName,
      r.RegionName,
      ab.Name AS ApprovedByName,
      cb.Name AS CreatedByName,
      (SELECT COUNT(*) FROM dbo.[Plan] cp WHERE cp.ParentPlanID = p.PlanID) AS ChildCount,
      (SELECT COUNT(*) FROM dbo.PlanActivity pa WHERE pa.PlanID = p.PlanID) AS ActivityCount,
      (SELECT COUNT(*) FROM dbo.PlanActivity pa WHERE pa.PlanID = p.PlanID AND pa.Status = 'Completed') AS CompletedActivities
    FROM dbo.[Plan] p
    LEFT JOIN dbo.[User] ru ON ru.UserID = p.ResponsibleUserID
    LEFT JOIN dbo.Region r ON r.RegionID = p.RegionID
    LEFT JOIN dbo.[User] ab ON ab.UserID = p.ApprovedBy
    LEFT JOIN dbo.[User] cb ON cb.UserID = p.CreatedBy
    WHERE p.ParentPlanID = @PlanID
    ORDER BY p.PeriodStart
  `);

  const activityResult = await request.query<ActivityRow>(`
    SELECT
      pa.*,
      ru.Name AS ResponsibleUserName,
      r.RegionName,
      pr.Name AS ProductName,
      cb.Name AS CreatedByName
    FROM dbo.PlanActivity pa
    LEFT JOIN dbo.[User] ru ON ru.UserID = pa.ResponsibleUserID
    LEFT JOIN dbo.Region r ON r.RegionID = pa.RegionID
    LEFT JOIN dbo.Product pr ON pr.ProductID = pa.ProductID
    LEFT JOIN dbo.[User] cb ON cb.UserID = pa.CreatedBy
    WHERE pa.PlanID = @PlanID
    ORDER BY pa.StartDate
  `);

  return {
    ...plan,
    children: childResult.recordset.map((c) => ({ ...c, children: [], activities: [] } as PlanWithChildren)),
    activities: activityResult.recordset,
  };
}

export async function createPlan(data: {
  parentPlanId?: number;
  title: string;
  description?: string;
  frequency: string;
  periodStart: string;
  periodEnd: string;
  plannedSubmissionDate?: string;
  responsibleUserId?: number;
  responsibleTeam?: string;
  regionId?: number;
  mainFocus?: string;
  keyDeliverable?: string;
  remarks?: string;
  createdBy?: number;
}) {
  const request = db.request();
  request.input('Title', sql.NVarChar(200), data.title);
  request.input('Description', sql.NVarChar(sql.MAX), data.description ?? null);
  request.input('Frequency', sql.NVarChar(20), data.frequency);
  request.input('PeriodStart', sql.Date, data.periodStart);
  request.input('PeriodEnd', sql.Date, data.periodEnd);
  request.input('PlannedSubmissionDate', sql.Date, data.plannedSubmissionDate ?? null);
  request.input('ResponsibleUserID', sql.Int, data.responsibleUserId ?? null);
  request.input('ResponsibleTeam', sql.NVarChar(100), data.responsibleTeam ?? null);
  request.input('RegionID', sql.Int, data.regionId ?? null);
  request.input('MainFocus', sql.NVarChar(200), data.mainFocus ?? null);
  request.input('KeyDeliverable', sql.NVarChar(sql.MAX), data.keyDeliverable ?? null);
  request.input('Remarks', sql.NVarChar(sql.MAX), data.remarks ?? null);
  request.input('CreatedBy', sql.Int, data.createdBy ?? null);

  const result = await request.query(`
    INSERT INTO dbo.[Plan] (
      ParentPlanID, Title, Description, Frequency, PeriodStart, PeriodEnd,
      PlannedSubmissionDate, ResponsibleUserID, ResponsibleTeam, RegionID,
      MainFocus, KeyDeliverable, Remarks, CreatedBy
    ) VALUES (
      @ParentPlanID, @Title, @Description, @Frequency, @PeriodStart, @PeriodEnd,
      @PlannedSubmissionDate, @ResponsibleUserID, @ResponsibleTeam, @RegionID,
      @MainFocus, @KeyDeliverable, @Remarks, @CreatedBy
    );
    SELECT SCOPE_IDENTITY() AS PlanID;
  `);

  if (data.parentPlanId) {
    const updateReq = db.request();
    updateReq.input('ParentPlanID', sql.Int, data.parentPlanId);
    updateReq.input('PlanID', sql.Int, result.recordset[0].PlanID);
    await updateReq.query(`UPDATE dbo.[Plan] SET ParentPlanID = @ParentPlanID WHERE PlanID = @PlanID`);
  }

  // Dispatch notification to officers, managers, and analysts
  await dispatchEvent({
    event: 'NEW_PLAN_CREATED',
    subject: `New plan created: ${data.title}`,
    body: `A new ${data.frequency} plan "${data.title}" has been created for the period ${data.periodStart} to ${data.periodEnd}.`,
    payload: {
      planId: result.recordset[0].PlanID,
      planName: data.title,
      planType: data.frequency,
      year: data.periodStart,
      startDate: data.periodStart,
      endDate: data.periodEnd,
      assignedTo: data.responsibleUserId ? `User #${data.responsibleUserId}` : null,
    },
  });

  return { planId: result.recordset[0].PlanID };
}

export async function updatePlan(planId: number, data: {
  title?: string;
  description?: string;
  frequency?: string;
  periodStart?: string;
  periodEnd?: string;
  plannedSubmissionDate?: string;
  actualSubmissionDate?: string;
  status?: string;
  responsibleUserId?: number;
  responsibleTeam?: string;
  regionId?: number;
  mainFocus?: string;
  keyDeliverable?: string;
  approvalStatus?: string;
  approvedBy?: number;
  remarks?: string;
}) {
  const sets: string[] = [];
  const request = db.request();
  request.input('PlanID', sql.Int, planId);

  if (data.title !== undefined) { sets.push('Title = @Title'); request.input('Title', sql.NVarChar(200), data.title); }
  if (data.description !== undefined) { sets.push('Description = @Description'); request.input('Description', sql.NVarChar(sql.MAX), data.description); }
  if (data.frequency !== undefined) { sets.push('Frequency = @Frequency'); request.input('Frequency', sql.NVarChar(20), data.frequency); }
  if (data.periodStart !== undefined) { sets.push('PeriodStart = @PeriodStart'); request.input('PeriodStart', sql.Date, data.periodStart); }
  if (data.periodEnd !== undefined) { sets.push('PeriodEnd = @PeriodEnd'); request.input('PeriodEnd', sql.Date, data.periodEnd); }
  if (data.plannedSubmissionDate !== undefined) { sets.push('PlannedSubmissionDate = @PlannedSubmissionDate'); request.input('PlannedSubmissionDate', sql.Date, data.plannedSubmissionDate); }
  if (data.actualSubmissionDate !== undefined) { sets.push('ActualSubmissionDate = @ActualSubmissionDate'); request.input('ActualSubmissionDate', sql.Date, data.actualSubmissionDate); }
  if (data.status !== undefined) { sets.push('Status = @Status'); request.input('Status', sql.NVarChar(30), data.status); }
  if (data.responsibleUserId !== undefined) { sets.push('ResponsibleUserID = @ResponsibleUserID'); request.input('ResponsibleUserID', sql.Int, data.responsibleUserId); }
  if (data.responsibleTeam !== undefined) { sets.push('ResponsibleTeam = @ResponsibleTeam'); request.input('ResponsibleTeam', sql.NVarChar(100), data.responsibleTeam); }
  if (data.regionId !== undefined) { sets.push('RegionID = @RegionID'); request.input('RegionID', sql.Int, data.regionId); }
  if (data.mainFocus !== undefined) { sets.push('MainFocus = @MainFocus'); request.input('MainFocus', sql.NVarChar(200), data.mainFocus); }
  if (data.keyDeliverable !== undefined) { sets.push('KeyDeliverable = @KeyDeliverable'); request.input('KeyDeliverable', sql.NVarChar(sql.MAX), data.keyDeliverable); }
  if (data.approvalStatus !== undefined) { sets.push('ApprovalStatus = @ApprovalStatus'); request.input('ApprovalStatus', sql.NVarChar(30), data.approvalStatus); }
  if (data.approvedBy !== undefined) { sets.push('ApprovedBy = @ApprovedBy'); request.input('ApprovedBy', sql.Int, data.approvedBy); if (data.approvalStatus === 'Approved') { sets.push('ApprovedAt = SYSUTCDATETIME()'); } }
  if (data.remarks !== undefined) { sets.push('Remarks = @Remarks'); request.input('Remarks', sql.NVarChar(sql.MAX), data.remarks); }

  if (sets.length === 0) return;

  sets.push('UpdatedAt = SYSUTCDATETIME()');
  await request.query(`UPDATE dbo.[Plan] SET ${sets.join(', ')} WHERE PlanID = @PlanID`);
}

export async function deletePlan(planId: number) {
  const request = db.request();
  request.input('PlanID', sql.Int, planId);
  await request.query(`DELETE FROM dbo.[Plan] WHERE PlanID = @PlanID`);
}

// ---------------------------------------------------------------------------
// Activity CRUD
// ---------------------------------------------------------------------------
export async function listActivities(planId: number, query: {
  status?: string;
  priority?: string;
  responsibleUserId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = query.page ?? 1;
  const pageSize = Math.min(query.pageSize ?? 20, 100);
  const offset = (page - 1) * pageSize;

  const request = db.request();
  request.input('PlanID', sql.Int, planId);
  const conditions: string[] = ['pa.PlanID = @PlanID'];

  if (query.status) {
    conditions.push('pa.Status = @Status');
    request.input('Status', sql.NVarChar(30), query.status);
  }
  if (query.priority) {
    conditions.push('pa.Priority = @Priority');
    request.input('Priority', sql.NVarChar(20), query.priority);
  }
  if (query.responsibleUserId) {
    conditions.push('pa.ResponsibleUserID = @ResponsibleUserID');
    request.input('ResponsibleUserID', sql.Int, Number(query.responsibleUserId));
  }
  if (query.search) {
    conditions.push('(pa.Title LIKE @Search OR pa.Description LIKE @Search)');
    request.input('Search', sql.NVarChar(200), `%${query.search}%`);
  }

  const where = conditions.join(' AND ');

  const countResult = await request.query(`SELECT COUNT(*) AS total FROM dbo.PlanActivity pa WHERE ${where}`);
  const total = countResult.recordset[0].total;

  const dataRequest = db.request();
  dataRequest.input('PlanID', sql.Int, planId);
  if (query.status) dataRequest.input('Status', sql.NVarChar(30), query.status);
  if (query.priority) dataRequest.input('Priority', sql.NVarChar(20), query.priority);
  if (query.responsibleUserId) dataRequest.input('ResponsibleUserID', sql.Int, Number(query.responsibleUserId));
  if (query.search) dataRequest.input('Search', sql.NVarChar(200), `%${query.search}%`);
  dataRequest.input('Offset', sql.Int, offset);
  dataRequest.input('Limit', sql.Int, pageSize);

  const result = await dataRequest.query<ActivityRow>(`
    SELECT
      pa.*,
      ru.Name AS ResponsibleUserName,
      r.RegionName,
      pr.Name AS ProductName,
      cb.Name AS CreatedByName
    FROM dbo.PlanActivity pa
    LEFT JOIN dbo.[User] ru ON ru.UserID = pa.ResponsibleUserID
    LEFT JOIN dbo.Region r ON r.RegionID = pa.RegionID
    LEFT JOIN dbo.Product pr ON pr.ProductID = pa.ProductID
    LEFT JOIN dbo.[User] cb ON cb.UserID = pa.CreatedBy
    WHERE ${where}
    ORDER BY pa.StartDate
    OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY
  `);

  return { items: result.recordset, total, page, pageSize };
}

export async function createActivity(planId: number, data: {
  title: string;
  description?: string;
  detailedActivity?: string;
  frequency?: string;
  startDate: string;
  endDate: string;
  plannedSubmissionDate?: string;
  status?: string;
  priority?: string;
  responsibleUserId?: number;
  responsibleTeam?: string;
  regionId?: number;
  productId?: number;
  mainFocus?: string;
  activityType?: string;
  expectedDeliverable?: string;
  target?: string;
  unit?: string;
  remarks?: string;
  createdBy?: number;
}) {
  const request = db.request();
  request.input('PlanID', sql.Int, planId);
  request.input('Title', sql.NVarChar(200), data.title);
  request.input('Description', sql.NVarChar(sql.MAX), data.description ?? null);
  request.input('DetailedActivity', sql.NVarChar(sql.MAX), data.detailedActivity ?? null);
  request.input('Frequency', sql.NVarChar(20), data.frequency ?? null);
  request.input('StartDate', sql.Date, data.startDate);
  request.input('EndDate', sql.Date, data.endDate);
  request.input('PlannedSubmissionDate', sql.Date, data.plannedSubmissionDate ?? null);
  request.input('Status', sql.NVarChar(30), data.status ?? 'Not Started');
  request.input('Priority', sql.NVarChar(20), data.priority ?? 'Medium');
  request.input('ResponsibleUserID', sql.Int, data.responsibleUserId ?? null);
  request.input('ResponsibleTeam', sql.NVarChar(100), data.responsibleTeam ?? null);
  request.input('RegionID', sql.Int, data.regionId ?? null);
  request.input('ProductID', sql.Int, data.productId ?? null);
  request.input('MainFocus', sql.NVarChar(200), data.mainFocus ?? null);
  request.input('ActivityType', sql.NVarChar(100), data.activityType ?? null);
  request.input('ExpectedDeliverable', sql.NVarChar(sql.MAX), data.expectedDeliverable ?? null);
  request.input('Target', sql.NVarChar(100), data.target ?? null);
  request.input('Unit', sql.NVarChar(50), data.unit ?? null);
  request.input('Remarks', sql.NVarChar(sql.MAX), data.remarks ?? null);
  request.input('CreatedBy', sql.Int, data.createdBy ?? null);

  const result = await request.query(`
    INSERT INTO dbo.PlanActivity (
      PlanID, Title, Description, DetailedActivity, Frequency, StartDate, EndDate,
      PlannedSubmissionDate, Status, Priority, ResponsibleUserID, ResponsibleTeam,
      RegionID, ProductID, MainFocus, ActivityType, ExpectedDeliverable, Target,
      Unit, Remarks, CreatedBy
    ) VALUES (
      @PlanID, @Title, @Description, @DetailedActivity, @Frequency, @StartDate, @EndDate,
      @PlannedSubmissionDate, @Status, @Priority, @ResponsibleUserID, @ResponsibleTeam,
      @RegionID, @ProductID, @MainFocus, @ActivityType, @ExpectedDeliverable, @Target,
      @Unit, @Remarks, @CreatedBy
    );
    SELECT SCOPE_IDENTITY() AS ActivityID;
  `);

  return { activityId: result.recordset[0].ActivityID };
}

export async function updateActivity(activityId: number, data: {
  title?: string;
  description?: string;
  detailedActivity?: string;
  frequency?: string;
  startDate?: string;
  endDate?: string;
  plannedSubmissionDate?: string;
  actualSubmissionDate?: string;
  status?: string;
  priority?: string;
  responsibleUserId?: number;
  responsibleTeam?: string;
  regionId?: number;
  productId?: number;
  mainFocus?: string;
  activityType?: string;
  expectedDeliverable?: string;
  target?: string;
  unit?: string;
  approvalStatus?: string;
  approvedBy?: number;
  remarks?: string;
}) {
  const sets: string[] = [];
  const request = db.request();
  request.input('ActivityID', sql.Int, activityId);

  if (data.title !== undefined) { sets.push('Title = @Title'); request.input('Title', sql.NVarChar(200), data.title); }
  if (data.description !== undefined) { sets.push('Description = @Description'); request.input('Description', sql.NVarChar(sql.MAX), data.description); }
  if (data.detailedActivity !== undefined) { sets.push('DetailedActivity = @DetailedActivity'); request.input('DetailedActivity', sql.NVarChar(sql.MAX), data.detailedActivity); }
  if (data.frequency !== undefined) { sets.push('Frequency = @Frequency'); request.input('Frequency', sql.NVarChar(20), data.frequency); }
  if (data.startDate !== undefined) { sets.push('StartDate = @StartDate'); request.input('StartDate', sql.Date, data.startDate); }
  if (data.endDate !== undefined) { sets.push('EndDate = @EndDate'); request.input('EndDate', sql.Date, data.endDate); }
  if (data.plannedSubmissionDate !== undefined) { sets.push('PlannedSubmissionDate = @PlannedSubmissionDate'); request.input('PlannedSubmissionDate', sql.Date, data.plannedSubmissionDate); }
  if (data.actualSubmissionDate !== undefined) { sets.push('ActualSubmissionDate = @ActualSubmissionDate'); request.input('ActualSubmissionDate', sql.Date, data.actualSubmissionDate); }
  if (data.status !== undefined) { sets.push('Status = @Status'); request.input('Status', sql.NVarChar(30), data.status); }
  if (data.priority !== undefined) { sets.push('Priority = @Priority'); request.input('Priority', sql.NVarChar(20), data.priority); }
  if (data.responsibleUserId !== undefined) { sets.push('ResponsibleUserID = @ResponsibleUserID'); request.input('ResponsibleUserID', sql.Int, data.responsibleUserId); }
  if (data.responsibleTeam !== undefined) { sets.push('ResponsibleTeam = @ResponsibleTeam'); request.input('ResponsibleTeam', sql.NVarChar(100), data.responsibleTeam); }
  if (data.regionId !== undefined) { sets.push('RegionID = @RegionID'); request.input('RegionID', sql.Int, data.regionId); }
  if (data.productId !== undefined) { sets.push('ProductID = @ProductID'); request.input('ProductID', sql.Int, data.productId); }
  if (data.mainFocus !== undefined) { sets.push('MainFocus = @MainFocus'); request.input('MainFocus', sql.NVarChar(200), data.mainFocus); }
  if (data.activityType !== undefined) { sets.push('ActivityType = @ActivityType'); request.input('ActivityType', sql.NVarChar(100), data.activityType); }
  if (data.expectedDeliverable !== undefined) { sets.push('ExpectedDeliverable = @ExpectedDeliverable'); request.input('ExpectedDeliverable', sql.NVarChar(sql.MAX), data.expectedDeliverable); }
  if (data.target !== undefined) { sets.push('Target = @Target'); request.input('Target', sql.NVarChar(100), data.target); }
  if (data.unit !== undefined) { sets.push('Unit = @Unit'); request.input('Unit', sql.NVarChar(50), data.unit); }
  if (data.approvalStatus !== undefined) { sets.push('ApprovalStatus = @ApprovalStatus'); request.input('ApprovalStatus', sql.NVarChar(30), data.approvalStatus); }
  if (data.approvedBy !== undefined) { sets.push('ApprovedBy = @ApprovedBy'); request.input('ApprovedBy', sql.Int, data.approvedBy); if (data.approvalStatus === 'Approved') { sets.push('ApprovedAt = SYSUTCDATETIME()'); } }
  if (data.remarks !== undefined) { sets.push('Remarks = @Remarks'); request.input('Remarks', sql.NVarChar(sql.MAX), data.remarks); }

  if (sets.length === 0) return;

  sets.push('UpdatedAt = SYSUTCDATETIME()');
  await request.query(`UPDATE dbo.PlanActivity SET ${sets.join(', ')} WHERE ActivityID = @ActivityID`);
}

export async function deleteActivity(activityId: number) {
  const request = db.request();
  request.input('ActivityID', sql.Int, activityId);
  await request.query(`DELETE FROM dbo.PlanActivity WHERE ActivityID = @ActivityID`);
}

// ---------------------------------------------------------------------------
// Planning Dashboard Summary
// ---------------------------------------------------------------------------
export async function getPlanningSummary(query: { from?: string; to?: string }) {
  const request = db.request();
  if (query.from) request.input('From', sql.Date, query.from);
  if (query.to) request.input('To', sql.Date, query.to);

  const result = await request.query(`
    SELECT
      (SELECT COUNT(*) FROM dbo.[Plan] p WHERE 1=1 ${query.from ? ' AND p.PeriodStart >= @From' : ''} ${query.to ? ' AND p.PeriodEnd <= @To' : ''}) AS totalPlans,
      (SELECT COUNT(*) FROM dbo.[Plan] p WHERE p.Status = 'Completed' ${query.from ? ' AND p.PeriodStart >= @From' : ''} ${query.to ? ' AND p.PeriodEnd <= @To' : ''}) AS completedPlans,
      (SELECT COUNT(*) FROM dbo.[Plan] p WHERE p.Status = 'In Progress' ${query.from ? ' AND p.PeriodStart >= @From' : ''} ${query.to ? ' AND p.PeriodEnd <= @To' : ''}) AS activePlans,
      (SELECT COUNT(*) FROM dbo.[Plan] p WHERE p.Status = 'Delayed' ${query.from ? ' AND p.PeriodStart >= @From' : ''} ${query.to ? ' AND p.PeriodEnd <= @To' : ''}) AS delayedPlans,
      (SELECT COUNT(*) FROM dbo.PlanActivity pa
        JOIN dbo.[Plan] p ON p.PlanID = pa.PlanID
        WHERE 1=1 ${query.from ? ' AND pa.StartDate >= @From' : ''} ${query.to ? ' AND pa.EndDate <= @To' : ''}) AS totalActivities,
      (SELECT COUNT(*) FROM dbo.PlanActivity pa
        JOIN dbo.[Plan] p ON p.PlanID = pa.PlanID
        WHERE pa.Status = 'Completed' ${query.from ? ' AND pa.StartDate >= @From' : ''} ${query.to ? ' AND pa.EndDate <= @To' : ''}) AS completedActivities,
      (SELECT COUNT(*) FROM dbo.PlanActivity pa
        JOIN dbo.[Plan] p ON p.PlanID = pa.PlanID
        WHERE pa.Status = 'In Progress' ${query.from ? ' AND pa.StartDate >= @From' : ''} ${query.to ? ' AND pa.EndDate <= @To' : ''}) AS activeActivities,
      (SELECT COUNT(*) FROM dbo.PlanActivity pa
        JOIN dbo.[Plan] p ON p.PlanID = pa.PlanID
        WHERE pa.Status = 'Delayed' ${query.from ? ' AND pa.StartDate >= @From' : ''} ${query.to ? ' AND pa.EndDate <= @To' : ''}) AS overdueActivities
  `);

  const upcomingResult = await request.query(`
    SELECT TOP 10
      p.PlanID, p.Title, p.Frequency, p.PeriodEnd, p.Status,
      p.PlannedSubmissionDate, p.ResponsibleTeam
    FROM dbo.[Plan] p
    WHERE p.Status NOT IN ('Completed', 'Delayed')
      AND p.PeriodEnd >= CAST(SYSUTCDATETIME() AS DATE)
    ORDER BY p.PeriodEnd ASC
  `);

  const recentActivityResult = await request.query(`
    SELECT TOP 10
      pa.ActivityID, pa.Title, pa.Status, pa.Priority,
      pa.StartDate, pa.EndDate, pa.PlanID,
      p.Title AS PlanTitle, p.Frequency,
      ru.Name AS ResponsibleUserName
    FROM dbo.PlanActivity pa
    JOIN dbo.[Plan] p ON p.PlanID = pa.PlanID
    LEFT JOIN dbo.[User] ru ON ru.UserID = pa.ResponsibleUserID
    WHERE pa.Status IN ('Completed', 'In Progress', 'Under Review')
    ORDER BY pa.ActualSubmissionDate DESC, pa.UpdatedAt DESC
  `);

  const row = result.recordset[0];
  return {
    totalPlans: row.totalPlans,
    completedPlans: row.completedPlans,
    activePlans: row.activePlans,
    delayedPlans: row.delayedPlans,
    totalActivities: row.totalActivities,
    completedActivities: row.completedActivities,
    activeActivities: row.activeActivities,
    overdueActivities: row.overdueActivities,
    upcomingDeadlines: upcomingResult.recordset,
    recentActivity: recentActivityResult.recordset,
  };
}
