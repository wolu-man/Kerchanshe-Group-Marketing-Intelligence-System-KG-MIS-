import sql from 'mssql';
import { db } from '../../db/pool';

// ---------------------------------------------------------------------------
// Officer Self-Performance Service
// Provides read-only KPI data scoped to the requesting officer's own userId.
// ---------------------------------------------------------------------------

function dateFilter(alias: string, from?: string, to?: string): string {
  const clauses: string[] = [];
  if (from) clauses.push(`${alias}.CreatedAt >= @From`);
  if (to) clauses.push(`${alias}.CreatedAt <= @To`);
  return clauses.length ? ` AND ${clauses.join(' AND ')}` : '';
}

// ---------------------------------------------------------------------------
// getOfficerSummary — own activity counts, completion, satisfaction
// ---------------------------------------------------------------------------
export async function getOfficerSummary(userId: number, query: { from?: string; to?: string }) {
  const request = db.request();
  request.input('UserId', sql.Int, userId);
  if (query.from) request.input('From', sql.Date, query.from);
  if (query.to) request.input('To', sql.Date, query.to);

  const df = (alias: string) => dateFilter(alias, query.from, query.to);

  const result = await request.query(`
    WITH visits AS (
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN Status IN ('Submitted','Reviewed','Approved') THEN 1 ELSE 0 END) AS submitted,
        SUM(CASE WHEN Status = 'Approved' THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN Status = 'Rejected' THEN 1 ELSE 0 END) AS rejected,
        SUM(ISNULL(ShopsVisited, 0)) AS shops
      FROM dbo.MarketVisitReport WHERE UserID = @UserId ${df('m')}
    ),
    interviews AS (
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN Status IN ('Submitted','Reviewed','Approved') THEN 1 ELSE 0 END) AS submitted,
        SUM(CASE WHEN Status = 'Approved' THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN Status = 'Rejected' THEN 1 ELSE 0 END) AS rejected,
        AVG(CAST(SatisfactionScore AS FLOAT)) AS avgSatisfaction
      FROM dbo.Interview WHERE UserID = @UserId ${df('i')}
    ),
    sales AS (
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN Status = 'Rejected' THEN 1 ELSE 0 END) AS rejected
      FROM dbo.WeeklySales WHERE SubmittedBy = @UserId ${df('w')}
    ),
    multimedia AS (
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN ValidationStatus = 'Validated' THEN 1 ELSE 0 END) AS validated,
        SUM(CASE WHEN ValidationStatus = 'Rejected' THEN 1 ELSE 0 END) AS rejected
      FROM dbo.MultimediaAsset WHERE CapturedBy = @UserId ${df('ma')}
    ),
    pricing AS (
      SELECT COUNT(*) AS total FROM dbo.CompetitorPrice WHERE RecordedBy = @UserId ${df('cp')}
    ),
    forms AS (
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN Status = 'Submitted' THEN 1 ELSE 0 END) AS submitted
      FROM dbo.FormResponse WHERE RespondentUserID = @UserId AND IsErased = 0
        ${query.from ? ' AND CreatedAt >= @From' : ''} ${query.to ? ' AND CreatedAt <= @To' : ''}
    )
    SELECT
      ISNULL((SELECT total FROM visits), 0) AS totalVisits,
      ISNULL((SELECT submitted FROM visits), 0) AS submittedVisits,
      ISNULL((SELECT approved FROM visits), 0) AS approvedVisits,
      ISNULL((SELECT rejected FROM visits), 0) AS rejectedVisits,
      ISNULL((SELECT shops FROM visits), 0) AS shopsVisited,
      ISNULL((SELECT total FROM interviews), 0) AS totalInterviews,
      ISNULL((SELECT submitted FROM interviews), 0) AS submittedInterviews,
      ISNULL((SELECT approved FROM interviews), 0) AS approvedInterviews,
      ISNULL((SELECT rejected FROM interviews), 0) AS rejectedInterviews,
      (SELECT avgSatisfaction FROM interviews) AS avgSatisfaction,
      ISNULL((SELECT total FROM sales), 0) AS totalSales,
      ISNULL((SELECT rejected FROM sales), 0) AS rejectedSales,
      ISNULL((SELECT total FROM multimedia), 0) AS totalMultimedia,
      ISNULL((SELECT validated FROM multimedia), 0) AS validatedMultimedia,
      ISNULL((SELECT rejected FROM multimedia), 0) AS rejectedMultimedia,
      ISNULL((SELECT total FROM pricing), 0) AS totalPricing,
      ISNULL((SELECT total FROM forms), 0) AS totalForms,
      ISNULL((SELECT submitted FROM forms), 0) AS submittedForms
  `);

  const r = result.recordset[0];
  const totalActivities = r.totalVisits + r.totalInterviews + r.totalSales + r.totalMultimedia + r.totalPricing + r.totalForms;
  const completed = r.submittedVisits + r.submittedInterviews + (r.totalSales - r.rejectedSales) + r.validatedMultimedia + r.submittedForms;
  const rejected = r.rejectedVisits + r.rejectedInterviews + r.rejectedSales + r.rejectedMultimedia;

  return {
    totalActivities,
    completed,
    pending: totalActivities - completed - rejected,
    rejected,
    completionRate: totalActivities > 0 ? Math.round((completed / totalActivities) * 1000) / 10 : 0,
    avgSatisfaction: r.avgSatisfaction != null ? Math.round(Number(r.avgSatisfaction) * 100) / 100 : null,
    modules: {
      visits: { total: r.totalVisits, submitted: r.submittedVisits, approved: r.approvedVisits, rejected: r.rejectedVisits, shops: r.shopsVisited },
      interviews: { total: r.totalInterviews, submitted: r.submittedInterviews, approved: r.approvedInterviews, rejected: r.rejectedInterviews },
      sales: { total: r.totalSales, rejected: r.rejectedSales },
      multimedia: { total: r.totalMultimedia, validated: r.validatedMultimedia, rejected: r.rejectedMultimedia },
      pricing: { total: r.totalPricing },
      forms: { total: r.totalForms, submitted: r.submittedForms },
    },
  };
}

// ---------------------------------------------------------------------------
// getOfficerTrends — own monthly activity counts
// ---------------------------------------------------------------------------
export async function getOfficerTrends(userId: number, query: { from?: string; to?: string }) {
  const request = db.request();
  request.input('UserId', sql.Int, userId);
  if (query.from) request.input('From', sql.Date, query.from);
  if (query.to) request.input('To', sql.Date, query.to);

  const result = await request.query(`
    SELECT
      FORMAT(CreatedAt, 'yyyy-MM') AS period,
      COUNT(*) AS totalActivities,
      SUM(CASE WHEN Status IN ('Submitted','Reviewed','Approved','Validated','Reconciled') THEN 1 ELSE 0 END) AS completedActivities
    FROM (
      SELECT CreatedAt, Status FROM dbo.MarketVisitReport WHERE UserID = @UserId
      UNION ALL
      SELECT CreatedAt, Status FROM dbo.Interview WHERE UserID = @UserId
      UNION ALL
      SELECT CreatedAt, Status FROM dbo.WeeklySales WHERE SubmittedBy = @UserId
      UNION ALL
      SELECT CreatedAt, ValidationStatus AS Status FROM dbo.MultimediaAsset WHERE CapturedBy = @UserId
      UNION ALL
      SELECT CreatedAt, 'Submitted' AS Status FROM dbo.CompetitorPrice WHERE RecordedBy = @UserId
    ) all_activity
    WHERE 1=1
      ${query.from ? ' AND CreatedAt >= @From' : ''} ${query.to ? ' AND CreatedAt <= @To' : ''}
    GROUP BY FORMAT(CreatedAt, 'yyyy-MM')
    ORDER BY period
  `);

  return result.recordset.map((r: any) => ({
    period: r.period,
    totalActivities: r.totalActivities,
    completedActivities: r.completedActivities,
    completionRate: r.totalActivities > 0 ? Math.round(r.completedActivities / r.totalActivities * 1000) / 10 : 0,
  }));
}

// ---------------------------------------------------------------------------
// getOfficerResults — own KPI results with definition details
// ---------------------------------------------------------------------------
export async function getOfficerResults(userId: number) {
  const request = db.request();
  request.input('UserId', sql.Int, userId);

  const result = await request.query(`
    SELECT
      kr.KpiResultID, kr.KpiDefID, kd.KpiCode, kd.KpiName, kd.Category,
      kr.PeriodStart, kr.PeriodEnd, kr.Frequency,
      kr.TargetValue, kr.ActualValue, kr.AchievementPercent,
      kr.WeightedScore, kr.Rating, kr.DataSource, kr.Remarks,
      kr.CreatedAt
    FROM dbo.KpiResult kr
    JOIN dbo.KpiDefinition kd ON kd.KpiDefID = kr.KpiDefID
    WHERE kr.UserID = @UserId
    ORDER BY kr.PeriodStart DESC
  `);

  return result.recordset;
}

// ---------------------------------------------------------------------------
// getOfficerPlans — plans assigned to the officer
// ---------------------------------------------------------------------------
export async function getOfficerPlans(userId: number) {
  const request = db.request();
  request.input('UserId', sql.Int, userId);

  const result = await request.query(`
    SELECT
      p.PlanID, p.Title, p.Description, p.Frequency,
      p.PeriodStart, p.PeriodEnd, p.Status, p.ApprovalStatus,
      p.ResponsibleTeam, p.MainFocus, p.KeyDeliverable,
      p.CreatedAt,
      (SELECT COUNT(*) FROM dbo.PlanActivity pa WHERE pa.PlanID = p.PlanID) AS activityCount,
      (SELECT COUNT(*) FROM dbo.PlanActivity pa WHERE pa.PlanID = p.PlanID AND pa.Status = 'Completed') AS completedActivities
    FROM dbo.[Plan] p
    WHERE p.ResponsibleUserID = @UserId
    ORDER BY p.PeriodEnd DESC
  `);

  return result.recordset.map((r: any) => ({
    ...r,
    activityCount: Number(r.activityCount),
    completedActivities: Number(r.completedActivities),
    progressPercent: Number(r.activityCount) > 0 ? Math.round(Number(r.completedActivities) / Number(r.activityCount) * 100) : 0,
  }));
}

// ---------------------------------------------------------------------------
// getOfficerActivityLog — recent activity across all modules (own)
// ---------------------------------------------------------------------------
export async function getOfficerActivityLog(userId: number, query: { from?: string; to?: string; limit?: number }) {
  const request = db.request();
  request.input('UserId', sql.Int, userId);
  if (query.from) request.input('From', sql.Date, query.from);
  if (query.to) request.input('To', sql.Date, query.to);
  const limit = Math.min(query.limit ?? 50, 200);

  const result = await request.query(`
    SELECT TOP ${limit} module, date, status, createdAt FROM (
      SELECT 'Market Visit' AS module, CAST(VisitDate AS NVARCHAR(50)) AS date, Status AS status, CreatedAt
      FROM dbo.MarketVisitReport WHERE UserID = @UserId
      ${query.from ? ' AND CreatedAt >= @From' : ''} ${query.to ? ' AND CreatedAt <= @To' : ''}
      UNION ALL
      SELECT 'Interview' AS module, CAST(InterviewDate AS NVARCHAR(50)) AS date, Status AS status, CreatedAt
      FROM dbo.Interview WHERE UserID = @UserId
      ${query.from ? ' AND CreatedAt >= @From' : ''} ${query.to ? ' AND CreatedAt <= @To' : ''}
      UNION ALL
      SELECT 'Weekly Sales' AS module, CAST(WeekEnding AS NVARCHAR(50)) AS date, Status AS status, CreatedAt
      FROM dbo.WeeklySales WHERE SubmittedBy = @UserId
      ${query.from ? ' AND CreatedAt >= @From' : ''} ${query.to ? ' AND CreatedAt <= @To' : ''}
      UNION ALL
      SELECT 'Multimedia' AS module, CAST(CaptureDate AS NVARCHAR(50)) AS date, ValidationStatus AS status, CreatedAt
      FROM dbo.MultimediaAsset WHERE CapturedBy = @UserId
      ${query.from ? ' AND CreatedAt >= @From' : ''} ${query.to ? ' AND CreatedAt <= @To' : ''}
      UNION ALL
      SELECT 'Pricing' AS module, CAST(RecordedDate AS NVARCHAR(50)) AS date, 'Recorded' AS status, CreatedAt
      FROM dbo.CompetitorPrice WHERE RecordedBy = @UserId
      ${query.from ? ' AND CreatedAt >= @From' : ''} ${query.to ? ' AND CreatedAt <= @To' : ''}
    ) all_activity
    ORDER BY createdAt DESC
  `);

  return result.recordset;
}
