import sql from 'mssql';
import { db } from '../../db/pool';

// ---------------------------------------------------------------------------
// KPI scoring weights (configurable)
// ---------------------------------------------------------------------------
const WEIGHTS = { productivity: 0.30, completion: 0.30, quality: 0.20, timeliness: 0.20 };

function category(score: number): 'Excellent' | 'Good' | 'Average' | 'Needs Attention' {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Average';
  return 'Needs Attention';
}

function normalize(values: number[]): number[] {
  if (values.length <= 1) return values.map(() => 100);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  if (range === 0) return values.map(() => 100);
  return values.map((v) => Math.round(((v - min) / range) * 100));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function dateFilter(alias: string, from?: string, to?: string): string {
  const clauses: string[] = [];
  if (from) clauses.push(`${alias}.CreatedAt >= @From`);
  if (to) clauses.push(`${alias}.CreatedAt <= @To`);
  return clauses.length ? ` AND ${clauses.join(' AND ')}` : '';
}

// ---------------------------------------------------------------------------
// Raw data aggregation per Field Officer
// ---------------------------------------------------------------------------
interface RawOfficerRow {
  UserID: number;
  Name: string;
  Email: string | null;
  RegionNames: string | null;
  // Visits
  TotalVisits: number;
  SubmittedVisits: number;
  ApprovedVisits: number;
  RejectedVisits: number;
  AvgVisitSubmitDays: number | null;
  TotalShopsVisited: number;
  // Interviews
  TotalInterviews: number;
  SubmittedInterviews: number;
  ApprovedInterviews: number;
  RejectedInterviews: number;
  AvgSatisfaction: number | null;
  PositiveInterviews: number;
  NeutralInterviews: number;
  NegativeInterviews: number;
  AvgInterviewSubmitDays: number | null;
  // Weekly Sales
  TotalSales: number;
  RejectedSales: number;
  // Multimedia
  TotalMultimedia: number;
  ValidatedMultimedia: number;
  RejectedMultimedia: number;
  // Pricing
  TotalPricing: number;
  // Forms
  TotalForms: number;
  SubmittedForms: number;
}

async function fetchRawData(from?: string, to?: string): Promise<RawOfficerRow[]> {
  const request = db.request();
  if (from) request.input('From', sql.Date, from);
  if (to) request.input('To', sql.Date, to);

  const result = await request.query<RawOfficerRow>(`
    WITH officer_base AS (
      SELECT u.UserID, u.Name, u.Email,
        STRING_AGG(r.RegionName, ', ') WITHIN GROUP (ORDER BY r.RegionName) AS RegionNames
      FROM dbo.[User] u
      LEFT JOIN dbo.UserRegionAssignment ura ON ura.UserID = u.UserID
      LEFT JOIN dbo.Region r ON r.RegionID = ura.RegionID
      WHERE u.RoleID = (SELECT RoleID FROM dbo.Role WHERE RoleName = 'Field Officer')
        AND u.IsActive = 1
      GROUP BY u.UserID, u.Name, u.Email
    ),
    visits AS (
      SELECT m.UserID,
        COUNT(*) AS TotalVisits,
        SUM(CASE WHEN m.Status IN ('Submitted','Reviewed','Approved') THEN 1 ELSE 0 END) AS SubmittedVisits,
        SUM(CASE WHEN m.Status = 'Approved' THEN 1 ELSE 0 END) AS ApprovedVisits,
        SUM(CASE WHEN m.Status = 'Rejected' THEN 1 ELSE 0 END) AS RejectedVisits,
        AVG(CASE WHEN m.UpdatedAt IS NOT NULL THEN CAST(DATEDIFF(day, m.CreatedAt, m.UpdatedAt) AS FLOAT) END) AS AvgVisitSubmitDays,
        SUM(ISNULL(m.ShopsVisited, 0)) AS TotalShopsVisited
      FROM dbo.MarketVisitReport m
      WHERE 1=1 ${dateFilter('m', from, to)}
      GROUP BY m.UserID
    ),
    interviews AS (
      SELECT i.UserID,
        COUNT(*) AS TotalInterviews,
        SUM(CASE WHEN i.Status IN ('Submitted','Reviewed','Approved') THEN 1 ELSE 0 END) AS SubmittedInterviews,
        SUM(CASE WHEN i.Status = 'Approved' THEN 1 ELSE 0 END) AS ApprovedInterviews,
        SUM(CASE WHEN i.Status = 'Rejected' THEN 1 ELSE 0 END) AS RejectedInterviews,
        AVG(CAST(i.SatisfactionScore AS FLOAT)) AS AvgSatisfaction,
        SUM(CASE WHEN i.Sentiment = 'Positive' THEN 1 ELSE 0 END) AS PositiveInterviews,
        SUM(CASE WHEN i.Sentiment = 'Neutral' THEN 1 ELSE 0 END) AS NeutralInterviews,
        SUM(CASE WHEN i.Sentiment = 'Negative' THEN 1 ELSE 0 END) AS NegativeInterviews,
        AVG(CASE WHEN i.UpdatedAt IS NOT NULL THEN CAST(DATEDIFF(day, i.CreatedAt, i.UpdatedAt) AS FLOAT) END) AS AvgInterviewSubmitDays
      FROM dbo.Interview i
      WHERE 1=1 ${dateFilter('i', from, to)}
      GROUP BY i.UserID
    ),
    sales AS (
      SELECT w.SubmittedBy AS UserID,
        COUNT(*) AS TotalSales,
        SUM(CASE WHEN w.Status = 'Rejected' THEN 1 ELSE 0 END) AS RejectedSales
      FROM dbo.WeeklySales w
      WHERE 1=1 ${dateFilter('w', from, to)}
      GROUP BY w.SubmittedBy
    ),
    multimedia AS (
      SELECT ma.CapturedBy AS UserID,
        COUNT(*) AS TotalMultimedia,
        SUM(CASE WHEN ma.ValidationStatus = 'Validated' THEN 1 ELSE 0 END) AS ValidatedMultimedia,
        SUM(CASE WHEN ma.ValidationStatus = 'Rejected' THEN 1 ELSE 0 END) AS RejectedMultimedia
      FROM dbo.MultimediaAsset ma
      WHERE 1=1 ${dateFilter('ma', from, to)}
      GROUP BY ma.CapturedBy
    ),
    pricing AS (
      SELECT cp.RecordedBy AS UserID,
        COUNT(*) AS TotalPricing
      FROM dbo.CompetitorPrice cp
      WHERE 1=1 ${dateFilter('cp', from, to)}
      GROUP BY cp.RecordedBy
    ),
    forms AS (
      SELECT fr.RespondentUserID AS UserID,
        COUNT(*) AS TotalForms,
        SUM(CASE WHEN fr.Status = 'Submitted' THEN 1 ELSE 0 END) AS SubmittedForms
      FROM dbo.FormResponse fr
      WHERE fr.RespondentUserID IS NOT NULL
        AND fr.IsErased = 0
        ${from ? ' AND fr.CreatedAt >= @From' : ''}
        ${to ? ' AND fr.CreatedAt <= @To' : ''}
      GROUP BY fr.RespondentUserID
    )
    SELECT
      ob.UserID, ob.Name, ob.Email, ob.RegionNames,
      ISNULL(v.TotalVisits, 0) AS TotalVisits,
      ISNULL(v.SubmittedVisits, 0) AS SubmittedVisits,
      ISNULL(v.ApprovedVisits, 0) AS ApprovedVisits,
      ISNULL(v.RejectedVisits, 0) AS RejectedVisits,
      v.AvgVisitSubmitDays,
      ISNULL(v.TotalShopsVisited, 0) AS TotalShopsVisited,
      ISNULL(i.TotalInterviews, 0) AS TotalInterviews,
      ISNULL(i.SubmittedInterviews, 0) AS SubmittedInterviews,
      ISNULL(i.ApprovedInterviews, 0) AS ApprovedInterviews,
      ISNULL(i.RejectedInterviews, 0) AS RejectedInterviews,
      i.AvgSatisfaction,
      ISNULL(i.PositiveInterviews, 0) AS PositiveInterviews,
      ISNULL(i.NeutralInterviews, 0) AS NeutralInterviews,
      ISNULL(i.NegativeInterviews, 0) AS NegativeInterviews,
      i.AvgInterviewSubmitDays,
      ISNULL(s.TotalSales, 0) AS TotalSales,
      ISNULL(s.RejectedSales, 0) AS RejectedSales,
      ISNULL(m.TotalMultimedia, 0) AS TotalMultimedia,
      ISNULL(m.ValidatedMultimedia, 0) AS ValidatedMultimedia,
      ISNULL(m.RejectedMultimedia, 0) AS RejectedMultimedia,
      ISNULL(p.TotalPricing, 0) AS TotalPricing,
      ISNULL(f.TotalForms, 0) AS TotalForms,
      ISNULL(f.SubmittedForms, 0) AS SubmittedForms
    FROM officer_base ob
    LEFT JOIN visits v ON v.UserID = ob.UserID
    LEFT JOIN interviews i ON i.UserID = ob.UserID
    LEFT JOIN sales s ON s.UserID = ob.UserID
    LEFT JOIN multimedia m ON m.UserID = ob.UserID
    LEFT JOIN pricing p ON p.UserID = ob.UserID
    LEFT JOIN forms f ON f.UserID = ob.UserID
    ORDER BY ob.Name
  `);
  return result.recordset;
}

// ---------------------------------------------------------------------------
// Score calculation
// ---------------------------------------------------------------------------
function computeScores(rows: RawOfficerRow[]) {
  const totalActivities = rows.map((r) =>
    r.TotalVisits + r.TotalInterviews + r.TotalSales + r.TotalMultimedia + r.TotalPricing + r.TotalForms
  );
  const completed = rows.map((r) => {
    const moduleVisits = r.SubmittedVisits;
    const moduleInterviews = r.SubmittedInterviews;
    const moduleSales = r.TotalSales - r.RejectedSales;
    const moduleMulti = r.ValidatedMultimedia;
    const moduleForms = r.SubmittedForms;
    return moduleVisits + moduleInterviews + moduleSales + moduleMulti + moduleForms;
  });
  const totalPossible = rows.map((r) => {
    const v = r.TotalVisits || 0;
    const i = r.TotalInterviews || 0;
    const s = r.TotalSales || 0;
    const m = r.TotalMultimedia || 0;
    const f = r.TotalForms || 0;
    return v + i + s + m + f || 1;
  });
  const completionRates = rows.map((_r, idx) => completed[idx] / totalPossible[idx]);

  const productivityRaw = totalActivities;
  const qualityRaw = rows.map((r) => {
    const totalInt = r.PositiveInterviews + r.NeutralInterviews + r.NegativeInterviews;
    const satisfactionComponent = r.AvgSatisfaction != null ? (r.AvgSatisfaction / 5) * 100 : 50;
    const sentimentComponent = totalInt > 0 ? (r.PositiveInterviews / totalInt) * 100 : 50;
    const totalMedia = r.ValidatedMultimedia + r.RejectedMultimedia;
    const validationComponent = totalMedia > 0 ? (r.ValidatedMultimedia / totalMedia) * 100 : 50;
    return satisfactionComponent * 0.50 + sentimentComponent * 0.25 + validationComponent * 0.25;
  });
  const timelinessRaw = rows.map((r) => {
    const days = (r.AvgVisitSubmitDays ?? 0) * 0.5 + (r.AvgInterviewSubmitDays ?? 0) * 0.5;
    return clamp(Math.round(100 - days * 10), 0, 100);
  });

  const prodNorm = normalize(productivityRaw);
  const compNorm = normalize(completionRates.map((r) => r * 100));
  const qualNorm = normalize(qualityRaw);
  const timeNorm = normalize(timelinessRaw);

  return rows.map((r, idx) => {
    const productivityScore = prodNorm[idx];
    const completionScore = compNorm[idx];
    const qualityScore = qualNorm[idx];
    const timelinessScore = timeNorm[idx];
    const overallScore = Math.round(
      productivityScore * WEIGHTS.productivity +
      completionScore * WEIGHTS.completion +
      qualityScore * WEIGHTS.quality +
      timelinessScore * WEIGHTS.timeliness
    );
    const total = r.TotalVisits + r.TotalInterviews + r.TotalSales + r.TotalMultimedia + r.TotalPricing + r.TotalForms;
    const rej = r.RejectedVisits + r.RejectedInterviews + r.RejectedSales + r.RejectedMultimedia;
    const comp = completed[idx];
    return {
      ...r,
      totalActivities: total,
      completed: comp,
      pending: total - comp - rej,
      rejected: rej,
      completionRate: Math.round(completionRates[idx] * 1000) / 10,
      productivityScore,
      completionScore,
      qualityScore,
      timelinessScore,
      overallScore,
      category: category(overallScore),
    };
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export async function getKpiSummary(query: { from?: string; to?: string }) {
  const rows = await fetchRawData(query.from, query.to);
  if (rows.length === 0) {
    return {
      totalOfficers: 0, activeOfficers: 0, totalActivities: 0,
      completedActivities: 0, pendingActivities: 0, rejectedActivities: 0,
      completionRate: 0, avgActivitiesPerOfficer: 0, avgSatisfaction: null,
      topPerformer: null, needsAttention: 0,
    };
  }
  const scored = computeScores(rows);
  let totalAct = 0; let completed = 0; let pending = 0; let rejected = 0;
  let satSum = 0; let satCount = 0; let needsAttention = 0;
  let topScore = -1; let topName = '';
  for (const r of scored) {
    totalAct += r.totalActivities;
    completed += r.completed;
    pending += r.pending;
    rejected += r.rejected;
    if (r.AvgSatisfaction != null) { satSum += r.AvgSatisfaction; satCount++; }
    if (r.category === 'Needs Attention') needsAttention++;
    if (r.overallScore > topScore) { topScore = r.overallScore; topName = r.Name; }
  }
  return {
    totalOfficers: rows.length,
    activeOfficers: rows.length,
    totalActivities: totalAct,
    completedActivities: completed,
    pendingActivities: pending,
    rejectedActivities: rejected,
    completionRate: totalAct > 0 ? Math.round((completed / totalAct) * 1000) / 10 : 0,
    avgActivitiesPerOfficer: rows.length > 0 ? Math.round(totalAct / rows.length * 10) / 10 : 0,
    avgSatisfaction: satCount > 0 ? Math.round((satSum / satCount) * 100) / 100 : null,
    topPerformer: topScore >= 0 ? { name: topName, score: topScore } : null,
    needsAttention,
  };
}

export async function getOfficerRanking(query: { from?: string; to?: string; regionId?: string; category?: string; search?: string; sort?: string }) {
  let rows = await fetchRawData(query.from, query.to);
  if (rows.length === 0) return [];
  let scored = computeScores(rows);

  if (query.search) {
    const s = query.search.toLowerCase();
    scored = scored.filter((r) => r.Name.toLowerCase().includes(s));
  }
  if (query.regionId) {
    scored = scored.filter((r) => {
      if (!r.RegionNames) return false;
      return r.RegionNames.includes(query.regionId!);
    });
  }
  if (query.category) {
    scored = scored.filter((r) => r.category === query.category);
  }

  const sortKey = query.sort ?? 'overallScore';
  scored.sort((a: any, b: any) => (b[sortKey] ?? 0) - (a[sortKey] ?? 0));

  return scored.map((r, i) => ({
    userId: r.UserID,
    name: r.Name,
    email: r.Email,
    regionNames: r.RegionNames ?? '—',
    totalActivities: r.totalActivities,
    visits: r.TotalVisits,
    shopsVisited: r.TotalShopsVisited ?? 0,
    interviews: r.TotalInterviews,
    weeklySales: r.TotalSales,
    multimedia: r.TotalMultimedia,
    pricing: r.TotalPricing,
    forms: r.TotalForms,
    completed: r.completed,
    pending: r.pending,
    rejected: r.rejected,
    completionRate: r.completionRate,
    productivityScore: r.productivityScore,
    completionScore: r.completionScore,
    qualityScore: r.qualityScore,
    timelinessScore: r.timelinessScore,
    overallScore: r.overallScore,
    rank: i + 1,
    category: r.category,
  }));
}

export async function getOfficerDetail(userId: number, query: { from?: string; to?: string }) {
  const rows = await getOfficerRanking({ ...query });
  const officer = rows.find((r) => r.userId === userId);
  if (!officer) return null;

  // Recent activity from base tables
  const request = db.request();
  request.input('UserId', sql.Int, userId);
  if (query.from) request.input('From', sql.Date, query.from);
  if (query.to) request.input('To', sql.Date, query.to);

  const recentResult = await request.query(`
    SELECT * FROM (
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
    ORDER BY CreatedAt DESC
  `);

  // Monthly trend
  const trendResult = await request.query(`
    SELECT
      FORMAT(CreatedAt, 'yyyy-MM') AS month,
      COUNT(*) AS activities
    FROM (
      SELECT CreatedAt FROM dbo.MarketVisitReport WHERE UserID = @UserId
      UNION ALL
      SELECT CreatedAt FROM dbo.Interview WHERE UserID = @UserId
      UNION ALL
      SELECT CreatedAt FROM dbo.WeeklySales WHERE SubmittedBy = @UserId
      UNION ALL
      SELECT CreatedAt FROM dbo.MultimediaAsset WHERE CapturedBy = @UserId
      UNION ALL
      SELECT CreatedAt FROM dbo.CompetitorPrice WHERE RecordedBy = @UserId
    ) all_activity
    WHERE 1=1
      ${query.from ? ' AND CreatedAt >= @From' : ''} ${query.to ? ' AND CreatedAt <= @To' : ''}
    GROUP BY FORMAT(CreatedAt, 'yyyy-MM')
    ORDER BY month
  `);

  return {
    ...officer,
    recentActivity: recentResult.recordset.slice(0, 20).map((r: any) => ({
      module: r.module,
      date: r.date,
      status: r.status,
    })),
    monthlyTrend: trendResult.recordset.map((r: any) => ({
      month: r.month,
      activities: r.activities,
      score: 0,
    })),
  };
}

export async function getKpiTrends(query: { from?: string; to?: string }) {
  const request = db.request();
  if (query.from) request.input('From', sql.Date, query.from);
  if (query.to) request.input('To', sql.Date, query.to);

  const result = await request.query(`
    SELECT
      FORMAT(CreatedAt, 'yyyy-MM') AS period,
      COUNT(*) AS totalActivities,
      SUM(CASE WHEN Status IN ('Submitted','Reviewed','Approved','Validated','Reconciled') THEN 1 ELSE 0 END) AS completedActivities,
      CASE WHEN COUNT(*) > 0
        THEN ROUND(CAST(SUM(CASE WHEN Status IN ('Submitted','Reviewed','Approved','Validated','Reconciled') THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) * 100, 1)
        ELSE 0
      END AS completionRate
    FROM (
      SELECT CreatedAt, Status FROM dbo.MarketVisitReport
      UNION ALL
      SELECT CreatedAt, Status FROM dbo.Interview
      UNION ALL
      SELECT CreatedAt, Status FROM dbo.WeeklySales
      UNION ALL
      SELECT CreatedAt, ValidationStatus AS Status FROM dbo.MultimediaAsset
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
    completionRate: r.completionRate,
  }));
}
