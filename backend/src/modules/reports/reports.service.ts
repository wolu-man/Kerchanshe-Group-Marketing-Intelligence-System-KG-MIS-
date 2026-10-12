import sql from 'mssql';
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { db } from '../../db/pool';
import { scopeClauseViaOutlet, type DataScope } from '../../utils/scope';

export interface SalesFilters {
  from?: string;
  to?: string;
  regionId?: number;
  colorId?: number;
  dataScope: DataScope;
  userId: number;
}

function bindSalesParams(request: sql.Request, filters: SalesFilters): void {
  request.input('UserId', sql.Int, filters.userId);
  if (filters.from) request.input('From', sql.Date, filters.from);
  if (filters.to) request.input('To', sql.Date, filters.to);
  if (filters.regionId) request.input('RegionId', sql.Int, filters.regionId);
  if (filters.colorId) request.input('ColorId', sql.Int, filters.colorId);
}

function salesWhere(filters: SalesFilters): string {
  const where: string[] = ['1=1'];
  if (filters.from) where.push('s.SaleDate >= @From');
  if (filters.to) where.push('s.SaleDate <= @To');
  if (filters.regionId) where.push('s.RegionID = @RegionId');
  if (filters.colorId) where.push('s.ProductColorID = @ColorId');
  const scope = scopeClauseViaOutlet(filters.dataScope, { alias: 's' });
  if (scope) where.push(scope);
  return where.join(' AND ');
}

export async function salesOverview(filters: SalesFilters): Promise<any> {
  const whereSql = salesWhere(filters);

  const request1 = db.request();
  bindSalesParams(request1, filters);
  const totals = await request1.query(
    `SELECT COUNT(DISTINCT SalesID) AS OrderCount,
            ISNULL(SUM(Quantity), 0) AS TotalQuantity,
            ISNULL(SUM(Amount), 0) AS TotalAmount,
            COUNT(DISTINCT ProductID) AS ProductsSold,
            COUNT(DISTINCT RegionID) AS RegionsCovered
     FROM dbo.vw_Report_SalesByOutlet s WHERE ${whereSql}`
  );

  const request2 = db.request();
  bindSalesParams(request2, filters);
  const byRegion = await request2.query(
    `SELECT COALESCE(RegionName, 'Unassigned') AS RegionName, ISNULL(SUM(Amount), 0) AS Amount, COUNT(DISTINCT SalesID) AS Orders
     FROM dbo.vw_Report_SalesByOutlet s
     WHERE ${whereSql}
     GROUP BY RegionName ORDER BY Amount DESC`
  );

  const request3 = db.request();
  bindSalesParams(request3, filters);
  const topProducts = await request3.query(
    `SELECT TOP 10 ProductName, Category, COALESCE(ProductColorName, 'Unspecified') AS Color,
            ISNULL(SUM(Quantity), 0) AS Quantity, ISNULL(SUM(Amount), 0) AS Amount
     FROM dbo.vw_Report_SalesByOutlet s
     WHERE ${whereSql}
     GROUP BY ProductName, Category, ProductColorName ORDER BY Amount DESC`
  );

  const request4 = db.request();
  bindSalesParams(request4, filters);
  const byColor = await request4.query(
    `SELECT COALESCE(ProductColorName, 'Unspecified') AS Color,
            ISNULL(SUM(Amount), 0) AS Amount, ISNULL(SUM(Quantity), 0) AS Quantity, COUNT(DISTINCT SalesID) AS Orders
     FROM dbo.vw_Report_SalesByOutlet s
     WHERE ${whereSql}
     GROUP BY ProductColorName ORDER BY Amount DESC`
  );

  return {
    totals: totals.recordset[0],
    byRegion: byRegion.recordset,
    topProducts: topProducts.recordset,
    byColor: byColor.recordset,
  };
}

export async function priceComparison(opts: { dataScope: DataScope; userId: number; regionId?: number; category?: string; colorId?: number }): Promise<any> {
  const where: string[] = ['1=1'];
  const request = db.request();
  request.input('UserId', sql.Int, opts.userId);
  if (opts.regionId) { where.push('s.RegionID = @RegionId'); request.input('RegionId', sql.Int, opts.regionId); }
  if (opts.category) { where.push('s.Category = @Category'); request.input('Category', sql.VarChar(100), opts.category); }
  if (opts.colorId) {
    where.push('EXISTS (SELECT 1 FROM dbo.ProductColor pcF WHERE pcF.ProductID = s.ProductID AND pcF.ColorID = @ColorId)');
    request.input('ColorId', sql.Int, opts.colorId);
  }
  const scope = scopeClauseViaOutlet(opts.dataScope, { alias: 's' });
  if (scope) where.push(scope);
  const whereSql = where.join(' AND ');
  const result = await request.query(
    `SELECT ProductName, Category, ProductColors, CompetitorName, CompetitorPrice, OwnPrice, GapPercent, RegionName, RecordedDate
     FROM dbo.vw_Report_PriceComparison s
     WHERE ${whereSql}
     ORDER BY RecordedDate DESC`
  );
  return { items: result.recordset };
}

export async function marketVisits(opts: { dataScope: DataScope; userId: number; from?: string; to?: string }): Promise<any> {
  const where: string[] = ['1=1'];
  const request = db.request();
  request.input('UserId', sql.Int, opts.userId);
  if (opts.from) { where.push('VisitDate >= @From'); request.input('From', sql.Date, opts.from); }
  if (opts.to) { where.push('VisitDate <= @To'); request.input('To', sql.Date, opts.to); }
  const scope = scopeClauseViaOutlet(opts.dataScope, { alias: 'm' });
  if (scope) where.push(scope);
  const whereSql = where.join(' AND ');
  const result = await request.query(
    `SELECT ReportID, VisitDate, Status, OutletName, City, RegionName, Country, SubmittedByName, ShopsVisited
     FROM dbo.vw_Report_MarketVisits m
     WHERE ${whereSql}
     ORDER BY VisitDate DESC`
  );
  return { items: result.recordset };
}

export async function formAnswers(opts: { dataScope: DataScope; userId: number; formId?: number }): Promise<any> {
  const request = db.request();
  let where = '1=1';
  if (opts.formId) { where = 'TemplateID = @FormId'; request.input('FormId', sql.Int, opts.formId); }
  const result = await request.query(
    `SELECT ResponseID, SubmittedAt, FormTitle, VersionNumber, FieldKey, ValueJSON, RespondentType
     FROM dbo.vw_Report_FormResponseAnswers
     WHERE ${where}
     ORDER BY SubmittedAt DESC`
  );
  return { items: result.recordset };
}

export async function productAvailability(opts: { colorId?: number } = {}): Promise<any> {
  const request = db.request();
  let salesJoin = 'LEFT JOIN dbo.SalesRecord s ON s.RegionID = r.RegionID';
  let totalFilter = '';
  if (opts.colorId) {
    request.input('ColorId', sql.Int, opts.colorId);
    salesJoin = `LEFT JOIN dbo.SalesRecord s ON s.RegionID = r.RegionID
                  AND EXISTS (SELECT 1 FROM dbo.ProductColor pcS WHERE pcS.ProductID = s.ProductID AND pcS.ColorID = @ColorId)`;
    totalFilter = 'AND EXISTS (SELECT 1 FROM dbo.ProductColor pcT WHERE pcT.ProductID = p.ProductID AND pcT.ColorID = @ColorId)';
  }
  const result = await request.query(
    `SELECT r.RegionName, o.OutletName, o.City,
            COUNT(DISTINCT s.ProductID) AS ProductsAvailable,
            (SELECT COUNT(*) FROM dbo.Product p WHERE p.IsActive = 1 ${totalFilter}) AS TotalActiveProducts,
            CASE WHEN (SELECT COUNT(*) FROM dbo.Product p WHERE p.IsActive = 1 ${totalFilter}) > 0
                 THEN ROUND(CAST(COUNT(DISTINCT s.ProductID) AS FLOAT) /
                            NULLIF((SELECT COUNT(*) FROM dbo.Product p WHERE p.IsActive = 1 ${totalFilter}), 0) * 100.0, 2)
                 ELSE 0 END AS AvailabilityRate
     FROM dbo.Outlet o
     JOIN dbo.Region r ON r.RegionID = o.RegionID
     ${salesJoin}
     GROUP BY r.RegionID, r.RegionName, o.OutletID, o.OutletName, o.City
     ORDER BY AvailabilityRate ASC`
  );
  return { items: result.recordset };
}

// ---------------------------------------------------------------------------
// Rule-based statistical summary (FDS EPIC-06 / FR-06.2). No ML - aggregates
// the views above and flags statistically notable observations.
// ---------------------------------------------------------------------------
export async function aiInsights(filters: SalesFilters): Promise<any> {
  const sales = await salesOverview(filters);
  const gaps = await db.request().query(
    `SELECT COUNT(*) AS ActiveGaps,
            AVG(ABS(GapPercent)) AS AvgAbsGap
     FROM dbo.vw_Report_PriceComparison
     WHERE GapPercent IS NOT NULL`
  );
  const visits = await db.request().query(
    `SELECT COUNT(*) AS TotalVisits,
            ISNULL(SUM(ShopsVisited), 0) AS TotalShopsVisited,
            SUM(CASE WHEN Status = 'Reviewed' THEN 1 ELSE 0 END) AS ReviewedVisits,
            SUM(CASE WHEN Status = 'Approved' THEN 1 ELSE 0 END) AS ApprovedVisits,
            SUM(CASE WHEN FollowUpRequired = 1 THEN 1 ELSE 0 END) AS FollowUpsOpen
     FROM dbo.vw_Report_MarketVisits`
  );
  const forms = await db.request().query(
    `SELECT COUNT(DISTINCT TemplateID) AS PublishedForms,
            COUNT(*) AS TotalResponses
     FROM dbo.vw_Report_FormResponseAnswers`
  );
  const interviews = await db.request().query(
    `SELECT COUNT(*) AS Total,
            AVG(CAST(SatisfactionScore AS FLOAT)) AS AvgSatisfaction,
            SUM(CASE WHEN Sentiment = 'Positive' THEN 1 ELSE 0 END) AS PositiveCount,
            SUM(CASE WHEN Sentiment = 'Negative' THEN 1 ELSE 0 END) AS NegativeCount
     FROM dbo.vw_Report_Interviews`
  );
  const availability = await db.request().query(
    `SELECT AVG(AvailabilityRate) AS AvgAvailability
     FROM dbo.vw_Report_ProductAvailability`
  );
  const weekly = await db.request().query(
    `SELECT COUNT(*) AS Total,
            ISNULL(SUM(Revenue), 0) AS Revenue
     FROM dbo.vw_Report_WeeklySales
     WHERE Status = 'Submitted'`
  );

  const total = Number(sales.totals.TotalAmount ?? 0);
  const gapStats = gaps.recordset[0];
  const visitStats = visits.recordset[0];
  const formStats = forms.recordset[0];
  const interviewStats = interviews.recordset[0];
  const availabilityStats = availability.recordset[0];
  const weeklyStats = weekly.recordset[0];

  const observations: string[] = [];
  const generatedAlerts: Array<{ type: string; severity: 'low' | 'medium' | 'high'; message: string }> = [];

  const topRegion = sales.byRegion[0];
  if (topRegion) observations.push(`Highest sales region: ${topRegion.RegionName} (${Number(topRegion.Amount).toLocaleString()}).`);
  const topProduct = sales.topProducts[0];
  if (topProduct) observations.push(`Best performing product: ${topProduct.ProductName} (${Number(topProduct.Amount).toLocaleString()} revenue).`);
  if (Number(gapStats.ActiveGaps) > 0) {
    observations.push(`${gapStats.ActiveGaps} active price-gap alerts; average gap magnitude ${Number(gapStats.AvgAbsGap).toFixed(2)}%.`);
  }
  if (Number(visitStats.TotalVisits) > 0) {
    const approvedRate = Math.round((Number(visitStats.ApprovedVisits) / Number(visitStats.TotalVisits)) * 100);
    observations.push(`${approvedRate}% of market visit reports approved. ${Number(visitStats.FollowUpsOpen) ?? 0} visits still need follow-up. ${Number(visitStats.TotalShopsVisited) || 0} shops visited in total.`);
    if (Number(visitStats.FollowUpsOpen) > 0) {
      generatedAlerts.push({
        type: 'FollowUpRequired',
        severity: 'medium',
        message: `${Number(visitStats.FollowUpsOpen)} market visit(s) were flagged as needing follow-up.`,
      });
    }
  }
  observations.push(`${formStats.PublishedForms} published forms with ${formStats.TotalResponses} total responses.`);
  if (Number(interviewStats.Total) > 0) {
    observations.push(`Average customer satisfaction ${Number(interviewStats.AvgSatisfaction).toFixed(2)}/5 across ${Number(interviewStats.Total)} interviews (${Number(interviewStats.PositiveCount)} positive, ${Number(interviewStats.NegativeCount)} negative).`);
    if (Number(interviewStats.AvgSatisfaction) < 3) {
      generatedAlerts.push({ type: 'LowSatisfaction', severity: 'high', message: 'Average interview satisfaction is below 3/5 — investigate customer friction.' });
    }
    if (Number(interviewStats.NegativeCount) > Number(interviewStats.PositiveCount) && Number(interviewStats.NegativeCount) > 0) {
      generatedAlerts.push({ type: 'NegativeSentiment', severity: 'medium', message: 'Negative interview sentiment outweighs positive — review feedback themes.' });
    }
  }
  if (availabilityStats?.AvgAvailability != null) {
    observations.push(`Average product availability across outlets: ${Number(availabilityStats.AvgAvailability).toFixed(1)}%.`);
    if (Number(availabilityStats.AvgAvailability) < 60) {
      generatedAlerts.push({ type: 'StockShortage', severity: 'high', message: `Product availability is only ${Number(availabilityStats.AvgAvailability).toFixed(1)}% — potential stock shortages.` });
    }
  }
  if (Number(weeklyStats.Total) > 0) {
    observations.push(`Weekly sales capture: ${Number(weeklyStats.Revenue).toLocaleString()} ETB across ${Number(weeklyStats.Total)} reported rows.`);
  }

  // Customer & Product stats
  const customerStats = await db.request().query(
    `SELECT COUNT(*) AS TotalCustomers,
            COUNT(DISTINCT c.CustomerTypeID) AS CustomerTypes,
            COUNT(DISTINCT c.RegionID) AS RegionsWithCustomers
     FROM dbo.Customer c WHERE c.IsActive = 1`
  );
  const productStats = await db.request().query(
    `SELECT COUNT(DISTINCT p.ProductID) AS TotalProducts,
            COUNT(DISTINCT p.Category) AS Categories,
            COUNT(DISTINCT pp.ProductID) AS ProductsWithTiers,
            COUNT(DISTINCT pc.ProductID) AS ProductsWithColors
     FROM dbo.Product p
     LEFT JOIN dbo.ProductPrice pp ON pp.ProductID = p.ProductID
     LEFT JOIN dbo.ProductColor pc ON pc.ProductID = p.ProductID
     WHERE p.IsActive = 1`
  );
  const custData = customerStats.recordset[0];
  const prodData = productStats.recordset[0];
  observations.push(`${custData.TotalCustomers} active customers across ${custData.CustomerTypes} customer types and ${custData.RegionsWithCustomers} regions.`);
  observations.push(`${prodData.TotalProducts} active products in ${prodData.Categories} categories; ${prodData.ProductsWithTiers} have per-type pricing configured.`);
  if (Number(prodData.ProductsWithColors) > 0) {
    observations.push(`${prodData.ProductsWithColors} products have linked color palettes.`);
  }

  // Top color by captured weekly revenue (only color-tagged rows count)
  const topColor = await db.request().query(
    `SELECT TOP 1 COALESCE(wc.Name, 'Unspecified') AS ColorName,
            ISNULL(SUM(w.Revenue), 0) AS Revenue, COUNT(*) AS Rows
     FROM dbo.WeeklySales w
     LEFT JOIN dbo.Color wc ON wc.ColorID = w.ColorID
     WHERE w.ColorID IS NOT NULL AND w.Status = 'Submitted'
     GROUP BY wc.Name
     ORDER BY SUM(w.Revenue) DESC`
  );
  const topColorData = topColor.recordset[0];
  if (topColorData && Number(topColorData.Revenue) > 0) {
    observations.push(`Top reported color by weekly revenue: ${topColorData.ColorName} (${Number(topColorData.Revenue).toLocaleString()} ETB across ${topColorData.Rows} rows).`);
  }

  // KPI performance stats
  const kpiStats = await db.request().query(
    `SELECT COUNT(*) AS TotalResults,
            ISNULL(AVG(AchievementPercent), 0) AS AvgAchievement,
            COUNT(DISTINCT UserID) AS OfficersWithKpis
     FROM dbo.KpiResult`
  );
  const kpiData = kpiStats.recordset[0];
  if (Number(kpiData.TotalResults) > 0) {
    observations.push(`${kpiData.OfficersWithKpis} officers have KPI results recorded. Average achievement: ${Number(kpiData.AvgAchievement).toFixed(1)}%.`);
    if (Number(kpiData.AvgAchievement) < 60) {
      generatedAlerts.push({ type: 'LowKpiAchievement', severity: 'high', message: `Average KPI achievement is only ${Number(kpiData.AvgAchievement).toFixed(1)}% — officer performance needs attention.` });
    }
  }

  const decline = await db.request().query(
    `WITH M AS (
       SELECT YEAR(SaleDate) AS Yr, MONTH(SaleDate) AS Mo, SUM(Amount) AS Amt
       FROM dbo.vw_Report_SalesByOutlet
       GROUP BY YEAR(SaleDate), MONTH(SaleDate)
     )
     SELECT TOP 2 * FROM M ORDER BY Yr DESC, Mo DESC`
  );
  const months = decline.recordset;
  if (months.length === 2) {
    const [latest, prev] = [Number(months[0].Amt), Number(months[1].Amt)];
    if (prev > 0 && latest < prev) {
      const pct = Math.round(((prev - latest) / prev) * 100);
      generatedAlerts.push({ type: 'DecliningSales', severity: 'medium', message: `Sales declined ${pct}% versus the previous period.` });
    }
  }

  return {
    period: { from: filters.from ?? null, to: filters.to ?? null },
    kpis: {
      totalSales: total,
      activePriceGaps: Number(gapStats.ActiveGaps),
      marketVisits: Number(visitStats.TotalVisits),
      shopsVisited: Number(visitStats.TotalShopsVisited),
      formResponses: Number(formStats.TotalResponses),
      avgSatisfaction: interviewStats.AvgSatisfaction != null ? Number(Number(interviewStats.AvgSatisfaction).toFixed(2)) : null,
      totalInterviews: Number(interviewStats.Total),
      availabilityRate: availabilityStats?.AvgAvailability != null ? Number(Number(availabilityStats.AvgAvailability).toFixed(1)) : null,
      weeklySalesRevenue: Number(weeklyStats.Revenue),
      totalCustomers: Number(custData.TotalCustomers),
      totalProducts: Number(prodData.TotalProducts),
      kpiAchievement: Number(kpiData.AvgAchievement),
      officerCount: Number(kpiData.OfficersWithKpis),
    },
    observations,
    generatedAlerts,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Customers Overview
// ---------------------------------------------------------------------------
export async function customersOverview(opts: { dataScope: DataScope; userId: number; regionId?: number; businessGroupId?: number }): Promise<any> {
  const where: string[] = ['c.IsActive = 1'];
  const request = db.request();
  request.input('UserId', sql.Int, opts.userId);
  if (opts.regionId) { where.push('c.RegionID = @RegionId'); request.input('RegionId', sql.Int, opts.regionId); }
  if (opts.businessGroupId) { where.push('c.BusinessGroupID = @BgId'); request.input('BgId', sql.Int, opts.businessGroupId); }
  const scope = scopeClauseViaOutlet(opts.dataScope, { alias: 'c' });
  if (scope) where.push(scope);
  const whereSql = where.join(' AND ');

  const totals = await request.query(
    `SELECT COUNT(*) AS TotalCustomers,
            COUNT(DISTINCT c.RegionID) AS RegionsCovered,
            COUNT(DISTINCT c.BusinessGroupID) AS BusinessGroups
     FROM dbo.Customer c WHERE ${whereSql}`
  );

  const byType = await request.query(
    `SELECT ct.Name AS CustomerTypeName, COUNT(*) AS Count
     FROM dbo.Customer c
     LEFT JOIN dbo.CustomerType ct ON ct.CustomerTypeID = c.CustomerTypeID
     WHERE ${whereSql}
     GROUP BY ct.Name ORDER BY Count DESC`
  );

  const byRegion = await request.query(
    `SELECT r.RegionName, COUNT(*) AS Count
     FROM dbo.Customer c
     LEFT JOIN dbo.Region r ON r.RegionID = c.RegionID
     WHERE ${whereSql} AND r.RegionName IS NOT NULL
     GROUP BY r.RegionName ORDER BY Count DESC`
  );

  const byBusinessGroup = await request.query(
    `SELECT bg.Name AS BusinessGroupName, COUNT(*) AS Count
     FROM dbo.Customer c
     LEFT JOIN dbo.BusinessGroup bg ON bg.BusinessGroupID = c.BusinessGroupID
     WHERE ${whereSql} AND bg.Name IS NOT NULL
     GROUP BY bg.Name ORDER BY Count DESC`
  );

  const byStarRating = await request.query(
    `SELECT ISNULL(c.StarRating, 'Unrated') AS StarRating, COUNT(*) AS Count
     FROM dbo.Customer c WHERE ${whereSql}
     GROUP BY c.StarRating ORDER BY Count DESC`
  );

  return {
    totals: totals.recordset[0],
    byType: byType.recordset,
    byRegion: byRegion.recordset,
    byBusinessGroup: byBusinessGroup.recordset,
    byStarRating: byStarRating.recordset,
  };
}

// ---------------------------------------------------------------------------
// Products Overview
// ---------------------------------------------------------------------------
export async function productsOverview(opts: { dataScope: DataScope; userId: number; businessGroupId?: number; colorId?: number }): Promise<any> {
  const where: string[] = ['p.IsActive = 1'];
  const request = db.request();
  request.input('UserId', sql.Int, opts.userId);
  if (opts.businessGroupId) { where.push('p.BusinessGroupID = @BgId'); request.input('BgId', sql.Int, opts.businessGroupId); }
  if (opts.colorId) {
    where.push('EXISTS (SELECT 1 FROM dbo.ProductColor pcF WHERE pcF.ProductID = p.ProductID AND pcF.ColorID = @ColorId)');
    request.input('ColorId', sql.Int, opts.colorId);
  }
  const whereSql = where.join(' AND ');

  const totals = await request.query(
    `SELECT COUNT(*) AS TotalProducts,
            COUNT(DISTINCT p.Category) AS Categories,
            COUNT(DISTINCT p.BusinessGroupID) AS BusinessGroups,
            ISNULL(AVG(p.UnitPrice), 0) AS AvgPrice
     FROM dbo.Product p WHERE ${whereSql}`
  );

  const byCategory = await request.query(
    `SELECT p.Category, COUNT(*) AS Count, ISNULL(AVG(p.UnitPrice), 0) AS AvgPrice
     FROM dbo.Product p WHERE ${whereSql}
     GROUP BY p.Category ORDER BY Count DESC`
  );

  const byBusinessGroup = await request.query(
    `SELECT bg.Name AS BusinessGroupName, COUNT(*) AS Count
     FROM dbo.Product p
     LEFT JOIN dbo.BusinessGroup bg ON bg.BusinessGroupID = p.BusinessGroupID
     WHERE ${whereSql} AND bg.Name IS NOT NULL
     GROUP BY bg.Name ORDER BY Count DESC`
  );

  const request2 = db.request();
  request2.input('UserId', sql.Int, opts.userId);
  if (opts.businessGroupId) request2.input('BgId', sql.Int, opts.businessGroupId);
  if (opts.colorId) request2.input('ColorId', sql.Int, opts.colorId);
  const byColor = await request2.query(
    `SELECT COALESCE(c.Name, 'Unspecified') AS Color,
            COUNT(DISTINCT p.ProductID) AS Count, ISNULL(AVG(p.UnitPrice), 0) AS AvgPrice
     FROM dbo.Product p
     LEFT JOIN dbo.ProductColor pc ON pc.ProductID = p.ProductID
     LEFT JOIN dbo.Color c ON c.ColorID = pc.ColorID
     WHERE ${whereSql}
     GROUP BY c.Name, c.SortOrder
     ORDER BY c.SortOrder, c.Name`
  );

  const withPricing = await request.query(
    `SELECT COUNT(DISTINCT pp.ProductID) AS ProductsWithTiers
     FROM dbo.ProductPrice pp
     JOIN dbo.Product p ON p.ProductID = pp.ProductID
     WHERE ${whereSql.replace('p.', 'p.').replace('p.IsActive', 'p.IsActive')}`
  );

  const pricingTiers = await request.query(
    `SELECT ct.Name AS CustomerTypeName, COUNT(*) AS PriceCount, ISNULL(AVG(pp.UnitPrice), 0) AS AvgPrice
     FROM dbo.ProductPrice pp
     JOIN dbo.CustomerType ct ON ct.CustomerTypeID = pp.CustomerTypeID
     JOIN dbo.Product p ON p.ProductID = pp.ProductID
     WHERE ${whereSql}
     GROUP BY ct.Name ORDER BY PriceCount DESC`
  );

  return {
    totals: totals.recordset[0],
    byCategory: byCategory.recordset,
    byBusinessGroup: byBusinessGroup.recordset,
    byColor: byColor.recordset,
    productsWithTiers: withPricing.recordset[0].ProductsWithTiers,
    pricingTiers: pricingTiers.recordset,
  };
}

// ---------------------------------------------------------------------------
// Competitor Intelligence (interactive report)
// ---------------------------------------------------------------------------
export async function competitorIntelReport(opts: { dataScope: DataScope; userId: number; regionId?: number; competitorId?: number; colorId?: number }): Promise<any> {
  const where: string[] = ['1=1'];
  const request = db.request();
  request.input('UserId', sql.Int, opts.userId);
  if (opts.regionId) { where.push('s.RegionID = @RegionId'); request.input('RegionId', sql.Int, opts.regionId); }
  if (opts.competitorId) { where.push('s.CompetitorID = @CompId'); request.input('CompId', sql.Int, opts.competitorId); }
  if (opts.colorId) {
    where.push('EXISTS (SELECT 1 FROM dbo.ProductColor pcF WHERE pcF.ProductID = s.ProductID AND pcF.ColorID = @ColorId)');
    request.input('ColorId', sql.Int, opts.colorId);
  }
  const scope = scopeClauseViaOutlet(opts.dataScope, { alias: 's' });
  if (scope) where.push(scope);
  const whereSql = where.join(' AND ');

  const summary = await request.query(
    `SELECT COUNT(DISTINCT CompetitorName) AS CompetitorsTracked,
            COUNT(*) AS TotalRecords,
            ISNULL(AVG(ABS(GapPercent)), 0) AS AvgGapPercent
     FROM dbo.vw_Report_CompetitorIntelligence s
     WHERE ${whereSql} AND GapPercent IS NOT NULL`
  );

  const byCompetitor = await request.query(
    `SELECT CompetitorName, COUNT(*) AS Records,
            ISNULL(AVG(CompetitorPrice), 0) AS AvgPrice,
            ISNULL(AVG(GapPercent), 0) AS AvgGap
     FROM dbo.vw_Report_CompetitorIntelligence s
     WHERE ${whereSql}
     GROUP BY CompetitorName ORDER BY Records DESC`
  );

  const items = await request.query(
    `SELECT TOP 100 RecordedDate, CompetitorName, ProductCode, ProductName, Category, ProductColors,
            CompetitorPrice, OwnPrice, GapPercent, Availability, PromotionObserved,
            QualityObservation, RegionName, OutletName, RecordedByName
     FROM dbo.vw_Report_CompetitorIntelligence s
     WHERE ${whereSql}
     ORDER BY RecordedDate DESC`
  );

  return {
    summary: summary.recordset[0],
    byCompetitor: byCompetitor.recordset,
    items: items.recordset,
  };
}

// ---------------------------------------------------------------------------
// KPI Performance (aggregated from admin KPI data)
// ---------------------------------------------------------------------------
export async function kpiPerformance(opts: { dataScope: DataScope; userId: number; frequency?: string; regionId?: number }): Promise<any> {
  const where: string[] = ['1=1'];
  const request = db.request();
  request.input('UserId', sql.Int, opts.userId);
  if (opts.frequency) { where.push('kr.Frequency = @Frequency'); request.input('Frequency', sql.NVarChar(20), opts.frequency); }
  if (opts.regionId) { where.push('kr.RegionID = @RegionId'); request.input('RegionId', sql.Int, opts.regionId); }
  const whereSql = where.join(' AND ');

  const summary = await request.query(
    `SELECT COUNT(DISTINCT kr.UserID) AS OfficersWithResults,
            COUNT(*) AS TotalResults,
            ISNULL(AVG(kr.AchievementPercent), 0) AS AvgAchievement,
            ISNULL(SUM(kr.WeightedScore), 0) AS TotalWeightedScore
     FROM dbo.KpiResult kr WHERE ${whereSql}`
  );

  const byKpi = await request.query(
    `SELECT kd.KpiCode, kd.KpiName, kd.Category, kd.Weight,
            SUM(kr.TargetValue) AS TotalTarget,
            SUM(kr.ActualValue) AS TotalActual,
            CASE WHEN SUM(kr.TargetValue) > 0
              THEN ROUND(SUM(kr.ActualValue) / SUM(kr.TargetValue) * 100, 1)
              ELSE 0 END AS AchievementPercent,
            COUNT(DISTINCT kr.UserID) AS OfficerCount
     FROM dbo.KpiResult kr
     JOIN dbo.KpiDefinition kd ON kd.KpiDefID = kr.KpiDefID
     WHERE ${whereSql}
     GROUP BY kd.KpiCode, kd.KpiName, kd.Category, kd.Weight
     ORDER BY kd.Category, kd.KpiName`
  );

  const byOfficer = await request.query(
    `SELECT u.UserID, u.Name AS UserName,
            STRING_AGG(r.RegionName, ', ') WITHIN GROUP (ORDER BY r.RegionName) AS RegionNames,
            SUM(kr.WeightedScore) AS TotalWeightedScore,
            AVG(kr.AchievementPercent) AS AvgAchievement,
            COUNT(DISTINCT kr.KpiDefID) AS KpiCount,
            CASE
              WHEN AVG(kr.AchievementPercent) >= 85 THEN 'Excellent'
              WHEN AVG(kr.AchievementPercent) >= 70 THEN 'Good'
              WHEN AVG(kr.AchievementPercent) >= 50 THEN 'Average'
              ELSE 'Needs Attention'
            END AS Rating
     FROM dbo.KpiResult kr
     JOIN dbo.[User] u ON u.UserID = kr.UserID
     LEFT JOIN dbo.UserRegionAssignment ura ON ura.UserID = u.UserID
     LEFT JOIN dbo.Region r ON r.RegionID = ura.RegionID
     WHERE ${whereSql}
     GROUP BY u.UserID, u.Name
     ORDER BY TotalWeightedScore DESC`
  );

  return {
    summary: summary.recordset[0],
    byKpi: byKpi.recordset,
    byOfficer: byOfficer.recordset.map((r: any, i: number) => ({ ...r, Rank: i + 1 })),
  };
}

// ---------------------------------------------------------------------------
// SRD-aligned operational overviews used by the Reports UI and exports.
// ---------------------------------------------------------------------------
export async function interviewsOverview(opts: { dataScope: DataScope; userId: number; from?: string; to?: string; regionId?: number }): Promise<any> {
  const where: string[] = ['1=1'];
  const request = db.request();
  request.input('UserId', sql.Int, opts.userId);
  if (opts.from) { where.push('i.InterviewDate >= @From'); request.input('From', sql.Date, opts.from); }
  if (opts.to) { where.push('i.InterviewDate <= @To'); request.input('To', sql.Date, opts.to); }
  if (opts.regionId) { where.push('i.RegionID = @RegionId'); request.input('RegionId', sql.Int, opts.regionId); }
  const scope = scopeClauseViaOutlet(opts.dataScope, { alias: 'i' });
  if (scope) where.push(scope);
  const whereSql = where.join(' AND ');

  const summary = await request.query(
    `SELECT COUNT(*) AS Total,
            AVG(CAST(SatisfactionScore AS FLOAT)) AS AvgSatisfaction,
            SUM(CASE WHEN Sentiment = 'Positive' THEN 1 ELSE 0 END) AS PositiveCount,
            SUM(CASE WHEN Sentiment = 'Neutral' THEN 1 ELSE 0 END) AS NeutralCount,
            SUM(CASE WHEN Sentiment = 'Negative' THEN 1 ELSE 0 END) AS NegativeCount
     FROM dbo.vw_Report_Interviews i WHERE ${whereSql}`
  );

  const request2 = db.request();
  request2.input('UserId', sql.Int, opts.userId);
  if (opts.from) request2.input('From', sql.Date, opts.from);
  if (opts.to) request2.input('To', sql.Date, opts.to);
  if (opts.regionId) request2.input('RegionId', sql.Int, opts.regionId);
  const byRegion = await request2.query(
    `SELECT RegionName, COUNT(*) AS Total, AVG(CAST(SatisfactionScore AS FLOAT)) AS AvgSatisfaction
     FROM dbo.vw_Report_Interviews i WHERE ${whereSql}
     GROUP BY RegionName ORDER BY Total DESC`
  );
  return { summary: summary.recordset[0], byRegion: byRegion.recordset };
}

export async function weeklySalesOverview(opts: { dataScope: DataScope; userId: number; from?: string; to?: string; regionId?: number; businessGroupId?: number; colorId?: number }): Promise<any> {
  const where: string[] = ['1=1'];
  const request = db.request();
  request.input('UserId', sql.Int, opts.userId);
  if (opts.from) { where.push('w.WeekEnding >= @From'); request.input('From', sql.Date, opts.from); }
  if (opts.to) { where.push('w.WeekEnding <= @To'); request.input('To', sql.Date, opts.to); }
  if (opts.regionId) { where.push('w.RegionID = @RegionId'); request.input('RegionId', sql.Int, opts.regionId); }
  if (opts.businessGroupId) { where.push('w.BusinessGroupID = @BgId'); request.input('BgId', sql.Int, opts.businessGroupId); }
  if (opts.colorId) { where.push('w.ColorID = @ColorId'); request.input('ColorId', sql.Int, opts.colorId); }
  const scope = scopeClauseViaOutlet(opts.dataScope, { alias: 'w' });
  if (scope) where.push(scope);
  const whereSql = where.join(' AND ');

  const totals = await request.query(
    `SELECT COUNT(*) AS [RowCount], ISNULL(SUM(QuantitySold),0) AS Quantity, ISNULL(SUM(Revenue),0) AS Revenue
     FROM dbo.vw_Report_WeeklySales w WHERE ${whereSql} AND w.Status = 'Submitted'`
  );

  const request2 = db.request();
  request2.input('UserId', sql.Int, opts.userId);
  if (opts.from) request2.input('From', sql.Date, opts.from);
  if (opts.to) request2.input('To', sql.Date, opts.to);
  if (opts.regionId) request2.input('RegionId', sql.Int, opts.regionId);
  if (opts.businessGroupId) request2.input('BgId', sql.Int, opts.businessGroupId);
  if (opts.colorId) request2.input('ColorId', sql.Int, opts.colorId);
  const byRegion = await request2.query(
    `SELECT RegionName, ISNULL(SUM(Revenue),0) AS Revenue, COUNT(*) AS Rows
     FROM dbo.vw_Report_WeeklySales w WHERE ${whereSql} AND w.Status = 'Submitted'
     GROUP BY RegionName ORDER BY Revenue DESC`
  );

  const request3 = db.request();
  request3.input('UserId', sql.Int, opts.userId);
  if (opts.from) request3.input('From', sql.Date, opts.from);
  if (opts.to) request3.input('To', sql.Date, opts.to);
  if (opts.regionId) request3.input('RegionId', sql.Int, opts.regionId);
  if (opts.businessGroupId) request3.input('BgId', sql.Int, opts.businessGroupId);
  if (opts.colorId) request3.input('ColorId', sql.Int, opts.colorId);
  const byProduct = await request3.query(
    `SELECT TOP 10 ProductName, Category, ISNULL(SUM(QuantitySold),0) AS Quantity, ISNULL(SUM(Revenue),0) AS Revenue
     FROM dbo.vw_Report_WeeklySales w WHERE ${whereSql} AND w.Status = 'Submitted'
     GROUP BY ProductName, Category ORDER BY Revenue DESC`
  );

  const request4 = db.request();
  request4.input('UserId', sql.Int, opts.userId);
  if (opts.from) request4.input('From', sql.Date, opts.from);
  if (opts.to) request4.input('To', sql.Date, opts.to);
  if (opts.regionId) request4.input('RegionId', sql.Int, opts.regionId);
  if (opts.businessGroupId) request4.input('BgId', sql.Int, opts.businessGroupId);
  if (opts.colorId) request4.input('ColorId', sql.Int, opts.colorId);
  const byColor = await request4.query(
    `SELECT COALESCE(w.ProductColorName, 'Unspecified') AS Color,
            ISNULL(SUM(w.Revenue),0) AS Revenue, ISNULL(SUM(w.QuantitySold),0) AS Quantity, COUNT(*) AS Rows
     FROM dbo.vw_Report_WeeklySales w WHERE ${whereSql} AND w.Status = 'Submitted'
     GROUP BY w.ProductColorName ORDER BY Revenue DESC`
  );

  return { totals: totals.recordset[0], byRegion: byRegion.recordset, byProduct: byProduct.recordset, byColor: byColor.recordset };
}

// ---------------------------------------------------------------------------
// Excel export for the SRD standard reports (MI-RP-02/03).
// Generates XLSX with logo, styled title header, and column auto-filters.
// ---------------------------------------------------------------------------
const EXPORT_QUERIES: Record<string, () => Promise<any[]>> = {
  'market-visits': async () => (await db.request().query(
    `SELECT VisitDate, Status, VisitType, BusinessGroupName, RegionName, OutletName, City,
            SubmittedByName, StockLevelObserved, CompetitorPresenceNoted, KeyFindings,
            FollowUpRequired, PhotoVideoRef, ShopsVisited
     FROM dbo.vw_Report_MarketVisits ORDER BY VisitDate DESC`
  )).recordset,
  interviews: async () => (await db.request().query(
    `SELECT InterviewDate, Status, BusinessGroupName, RegionName, OutletName,
            RespondentType, RespondentName, SatisfactionScore, Sentiment, KeyFeedback,
            InterviewerName
     FROM dbo.vw_Report_Interviews ORDER BY InterviewDate DESC`
  )).recordset,
  multimedia: async () => (await db.request().query(
    `SELECT CaptureDate, MediaType, OriginName, Tag, ValidationStatus, CapturedByName,
            BusinessGroupName, RegionName, OutletName, RelatedModule, RelatedRecordID,
            CaptureLat, CaptureLng, TranscriptionRequired, Transcription
     FROM dbo.vw_Report_Multimedia ORDER BY CaptureDate DESC`
  )).recordset,
  'weekly-sales': async () => (await db.request().query(
    `SELECT v.WeekEnding, v.Status, v.BusinessGroupName, v.ProductCode, v.ProductName, v.Category,
            COALESCE(v.ProductColorName, pcols.ProductColors) AS ProductColor,
            v.RegionName, v.OutletName, v.CustomerName, v.QuantitySold, v.UnitPrice, v.Revenue, v.SubmittedByName
     FROM dbo.vw_Report_WeeklySales v
     OUTER APPLY (
       SELECT STRING_AGG(c.Name, ', ') WITHIN GROUP (ORDER BY c.SortOrder, c.Name) AS ProductColors
       FROM dbo.ProductColor pc
       JOIN dbo.Color c ON c.ColorID = pc.ColorID
       WHERE pc.ProductID = v.ProductID
     ) pcols
     ORDER BY v.WeekEnding DESC`
  )).recordset,
  competitor: async () => (await db.request().query(
    `SELECT RecordedDate, CompetitorName, ProductCode, ProductName, Category, ProductColors,
            CompetitorPrice, OwnPrice, GapPercent, Availability, PromotionObserved,
            QualityObservation, BusinessGroupName, RegionName, OutletName, RecordedByName
     FROM dbo.vw_Report_CompetitorIntelligence ORDER BY RecordedDate DESC`
  )).recordset,
  customers: async () => (await db.request().query(
    `SELECT c.CustomerCode, c.Name, ct.Name AS CustomerType, c.ContactPerson,
            c.ContactPhone, c.Email, r.RegionName, bg.Name AS BusinessGroupName,
            c.Address, c.Area, c.StarRating, c.ProductInterest, c.IsActive
     FROM dbo.Customer c
     LEFT JOIN dbo.CustomerType ct ON ct.CustomerTypeID = c.CustomerTypeID
     LEFT JOIN dbo.Region r ON r.RegionID = c.RegionID
     LEFT JOIN dbo.BusinessGroup bg ON bg.BusinessGroupID = c.BusinessGroupID
     ORDER BY c.Name`
  )).recordset,
  products: async () => (await db.request().query(
    `SELECT p.ProductCode, p.Name, p.Category, pcols.ProductColors AS Color, p.Size, p.WeightKg,
            p.UnitPrice, bg.Name AS BusinessGroupName, p.IsActive
     FROM dbo.Product p
     LEFT JOIN dbo.BusinessGroup bg ON bg.BusinessGroupID = p.BusinessGroupID
     OUTER APPLY (
       SELECT STRING_AGG(c.Name, ', ') WITHIN GROUP (ORDER BY c.SortOrder, c.Name) AS ProductColors
       FROM dbo.ProductColor pc
       JOIN dbo.Color c ON c.ColorID = pc.ColorID
       WHERE pc.ProductID = p.ProductID
     ) pcols
     ORDER BY p.Name`
  )).recordset,
  'kpi-results': async () => (await db.request().query(
    `SELECT kd.KpiCode, kd.KpiName, kd.Category, u.Name AS OfficerName,
            kr.PeriodStart, kr.PeriodEnd, kr.Frequency,
            kr.TargetValue, kr.ActualValue, kr.AchievementPercent,
            kr.WeightedScore, kr.Rating, kr.DataSource
     FROM dbo.KpiResult kr
     JOIN dbo.KpiDefinition kd ON kd.KpiDefID = kr.KpiDefID
     JOIN dbo.[User] u ON u.UserID = kr.UserID
     ORDER BY kr.PeriodStart DESC, u.Name`
  )).recordset,
};

const REPORT_TITLES: Record<string, string> = {
  'market-visits': 'Market Visits Report',
  interviews: 'Interviews Report',
  multimedia: 'Multimedia Report',
  'weekly-sales': 'Weekly Sales Report',
  competitor: 'Competitor Intelligence Report',
  customers: 'Customers Report',
  products: 'Products Report',
  'kpi-results': 'KPI Results Report',
};

const LOGO_PATH = path.join(__dirname, '../../../assets/logo.png');
let logoBuffer: Buffer | null = null;
try {
  logoBuffer = fs.readFileSync(LOGO_PATH);
} catch {
  // Logo not found — exports will omit the image
}

function colLetter(index: number): string {
  let s = '';
  let n = index;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

export async function exportExcel(kind: string): Promise<{ filename: string; buffer: Buffer }> {
  const run = EXPORT_QUERIES[kind];
  if (!run) throw new Error(`Unknown export kind: ${kind}`);
  const rows = await run();
  const title = REPORT_TITLES[kind] ?? kind;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(title);

  if (rows.length === 0) {
    sheet.addRow([title]);
    sheet.getRow(1).font = { bold: true, size: 18, color: { argb: 'FF0047AB' } };
    const buffer = await workbook.xlsx.writeBuffer();
    return { filename: `${kind}.xlsx`, buffer: Buffer.from(buffer) };
  }

  const headers = Object.keys(rows[0]);
  const numCols = headers.length;
  const lastColLetter = colLetter(numCols - 1);

  // --- Row 1: Logo + Report Title ---
  const titleRow = sheet.getRow(1);
  titleRow.height = 45;

  if (logoBuffer) {
    const imageId = workbook.addImage({ buffer: logoBuffer as unknown as ExcelJS.Buffer, extension: 'png' });
    sheet.addImage(imageId, {
      tl: { col: 0, row: 0 },
      ext: { width: 120, height: 40 },
    });
  }

  if (numCols > 1) {
    sheet.mergeCells(1, 2, 1, numCols);
  }
  const titleCell = titleRow.getCell(2);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0047AB' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  // Fill remaining title cells with the same background
  for (let c = 3; c <= numCols; c++) {
    const cell = titleRow.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0047AB' } };
  }

  // --- Row 2: Spacer ---
  sheet.getRow(2).height = 8;

  // --- Row 3: Column Headers ---
  const headerRow = sheet.getRow(3);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 11, color: { argb: 'FF1C2329' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F3F5' } };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FFDDE1E6' } },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  });
  headerRow.height = 28;

  // Auto-filter on header row
  sheet.autoFilter = `A3:${lastColLetter}3`;

  // --- Data Rows (starting at row 4) ---
  for (const row of rows) {
    const values = headers.map((h) => {
      const v = row[h];
      if (v === null || v === undefined) return '';
      if (v instanceof Date) return v;
      return v;
    });
    const dataRow = sheet.addRow(values);
    dataRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.alignment = { vertical: 'middle', indent: 1 };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFEDF0F2' } },
      };
    });
  }

  // --- Auto-fit column widths ---
  for (let c = 1; c <= numCols; c++) {
    const col = sheet.getColumn(c);
    let maxLen = headers[c - 1]?.length ?? 12;
    col.eachCell({ includeEmpty: false }, (cell) => {
      const len = cell.value ? String(cell.value).length : 0;
      if (len > maxLen) maxLen = len;
    });
    col.width = Math.min(Math.max(maxLen + 3, 12), 50);
  }

  // Freeze header row
  sheet.views = [{ state: 'frozen', ySplit: 3 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return { filename: `${kind}.xlsx`, buffer: Buffer.from(buffer) };
}
