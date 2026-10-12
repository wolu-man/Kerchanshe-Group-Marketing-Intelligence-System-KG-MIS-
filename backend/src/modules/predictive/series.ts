// =============================================================================
// Time-series extractors — one loader per module, all scope-aware.
//
// Every loader returns observed { period, value } buckets ordered oldest →
// newest, built from the SAME views/tables the report services read (never a
// bespoke shadow schema). Bucketing is deterministic T-SQL date math:
//   month → 'YYYY-MM'    week → Monday-start 'YYYY-MM-DD'    day → 'YYYY-MM-DD'
// =============================================================================

import sql from 'mssql';
import { db } from '../../db/pool';
import { scopeClause, scopeClauseViaOutlet, type DataScope } from '../../utils/scope';
import {
  MAX_HISTORY,
  type Granularity,
  type PredictiveModule,
  type SeriesPoint,
} from './predictive.types';

export interface LoadOpts {
  granularity: Granularity;
  dataScope: DataScope;
  userId: number;
  regionId?: number;
  productId?: number;
  colorId?: number;
  formId?: number;
  /** Inclusive ISO lower bound (history window start). */
  from: string;
}

export interface MetricDef {
  module: PredictiveModule;
  metric: string;
  label: string;
  unit: 'currency' | 'count' | 'percent';
  granularityDefault: Granularity;
  /** Zero-fill periods with no observations (counts/sums); averages never fill. */
  fillZeros: boolean;
  /** Mirror of the guard on the equivalent read-only tool (null = route guard only). */
  requiredAction: string | null;
  load: (opts: LoadOpts) => Promise<SeriesPoint[]>;
}

// ---------------------------------------------------------------------------
// Shared SQL helpers
// ---------------------------------------------------------------------------
function bucketExpr(col: string, g: Granularity): string {
  if (g === 'month') return `CONVERT(char(7), ${col}, 120)`;
  if (g === 'week') return `CONVERT(char(10), DATEADD(day, -(DATEDIFF(day, 0, ${col}) % 7), ${col}), 120)`;
  return `CONVERT(char(10), ${col}, 120)`;
}

async function bucketed(
  text: string,
  bind: (r: sql.Request) => void
): Promise<SeriesPoint[]> {
  const request = db.request();
  bind(request);
  const result = await request.query(text);
  return result.recordset.map((r: Record<string, unknown>) => ({
    period: String(r.Period ?? ''),
    value: Number(r.MetricValue ?? 0),
  }));
}

function bindCommon(request: sql.Request, opts: LoadOpts): void {
  request.input('From', sql.Date, opts.from);
  request.input('UserId', sql.Int, opts.userId);
  if (opts.regionId) request.input('RegionId', sql.Int, opts.regionId);
  if (opts.productId) request.input('ProductId', sql.Int, opts.productId);
  if (opts.colorId) request.input('ColorId', sql.Int, opts.colorId);
  if (opts.formId) request.input('FormId', sql.Int, opts.formId);
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------
const salesAgg: Record<string, string> = {
  revenue: 'ISNULL(SUM(s.Amount), 0)',
  quantity: 'ISNULL(SUM(s.Quantity), 0)',
  orders: 'COUNT(DISTINCT s.SalesID)',
};

async function loadSales(metric: string, opts: LoadOpts): Promise<SeriesPoint[]> {
  const agg = salesAgg[metric] ?? salesAgg.revenue;
  const where = [`${bucketExpr('s.SaleDate', opts.granularity)} IS NOT NULL`, 's.SaleDate >= @From'];
  if (opts.regionId) where.push('s.RegionID = @RegionId');
  if (opts.colorId) where.push('s.ProductColorID = @ColorId');
  const scope = scopeClauseViaOutlet(opts.dataScope, { alias: 's' });
  if (scope) where.push(scope);
  const bucket = bucketExpr('s.SaleDate', opts.granularity);
  return bucketed(
    `SELECT ${bucket} AS Period, ${agg} AS MetricValue
     FROM dbo.vw_Report_SalesByOutlet s
     WHERE ${where.join(' AND ')}
     GROUP BY ${bucket}
     ORDER BY Period`,
    (r) => bindCommon(r, opts)
  );
}

async function loadWeeklySales(metric: string, opts: LoadOpts): Promise<SeriesPoint[]> {
  const agg = metric === 'quantity' ? 'ISNULL(SUM(w.QuantitySold), 0)' : 'ISNULL(SUM(w.Revenue), 0)';
  const where = ['w.WeekEnding >= @From', "w.Status = 'Submitted'"];
  if (opts.regionId) where.push('w.RegionID = @RegionId');
  if (opts.colorId) where.push('w.ColorID = @ColorId');
  const scope = scopeClauseViaOutlet(opts.dataScope, { alias: 'w' });
  if (scope) where.push(scope);
  const bucket = bucketExpr('w.WeekEnding', opts.granularity);
  return bucketed(
    `SELECT ${bucket} AS Period, ${agg} AS MetricValue
     FROM dbo.vw_Report_WeeklySales w
     WHERE ${where.join(' AND ')}
     GROUP BY ${bucket}
     ORDER BY Period`,
    (r) => bindCommon(r, opts)
  );
}

async function loadKpi(opts: LoadOpts): Promise<SeriesPoint[]> {
  const where = ['kr.PeriodStart >= @From'];
  if (opts.regionId) where.push('kr.RegionID = @RegionId');
  const bucket = bucketExpr('kr.PeriodStart', opts.granularity);
  return bucketed(
    `SELECT ${bucket} AS Period, ISNULL(AVG(kr.AchievementPercent), 0) AS MetricValue
     FROM dbo.KpiResult kr
     WHERE ${where.join(' AND ')}
     GROUP BY ${bucket}
     ORDER BY Period`,
    (r) => bindCommon(r, opts)
  );
}

async function loadCompetitorPrice(metric: string, opts: LoadOpts): Promise<SeriesPoint[]> {
  const agg = metric === 'observations' ? 'COUNT(*)' : 'ISNULL(AVG(s.CompetitorPrice), 0)';
  const where = ['s.RecordedDate >= @From'];
  if (opts.regionId) where.push('s.RegionID = @RegionId');
  if (opts.colorId) where.push('EXISTS (SELECT 1 FROM dbo.ProductColor pcF WHERE pcF.ProductID = s.ProductID AND pcF.ColorID = @ColorId)');
  const scope = scopeClauseViaOutlet(opts.dataScope, { alias: 's' });
  if (scope) where.push(scope);
  const bucket = bucketExpr('s.RecordedDate', opts.granularity);
  return bucketed(
    `SELECT ${bucket} AS Period, ${agg} AS MetricValue
     FROM dbo.vw_Report_PriceComparison s
     WHERE ${where.join(' AND ')}
     GROUP BY ${bucket}
     ORDER BY Period`,
    (r) => bindCommon(r, opts)
  );
}

async function loadPriceGap(opts: LoadOpts): Promise<SeriesPoint[]> {
  const where = ['s.RecordedDate >= @From', 's.GapPercent IS NOT NULL'];
  if (opts.regionId) where.push('s.RegionID = @RegionId');
  if (opts.colorId) where.push('EXISTS (SELECT 1 FROM dbo.ProductColor pcF WHERE pcF.ProductID = s.ProductID AND pcF.ColorID = @ColorId)');
  const scope = scopeClauseViaOutlet(opts.dataScope, { alias: 's' });
  if (scope) where.push(scope);
  const bucket = bucketExpr('s.RecordedDate', opts.granularity);
  return bucketed(
    `SELECT ${bucket} AS Period, ISNULL(AVG(s.GapPercent), 0) AS MetricValue
     FROM dbo.vw_Report_PriceComparison s
     WHERE ${where.join(' AND ')}
     GROUP BY ${bucket}
     ORDER BY Period`,
    (r) => bindCommon(r, opts)
  );
}

async function loadProductDemand(metric: string, opts: LoadOpts): Promise<SeriesPoint[]> {
  const agg = metric === 'revenue' ? 'ISNULL(SUM(s.Amount), 0)' : 'ISNULL(SUM(s.Quantity), 0)';
  const where = ['s.SaleDate >= @From'];
  if (opts.regionId) where.push('s.RegionID = @RegionId');
  if (opts.productId) where.push('s.ProductID = @ProductId');
  if (opts.colorId) where.push('s.ProductColorID = @ColorId');
  const scope = scopeClauseViaOutlet(opts.dataScope, { alias: 's' });
  if (scope) where.push(scope);
  const bucket = bucketExpr('s.SaleDate', opts.granularity);
  return bucketed(
    `SELECT ${bucket} AS Period, ${agg} AS MetricValue
     FROM dbo.vw_Report_SalesByOutlet s
     WHERE ${where.join(' AND ')}
     GROUP BY ${bucket}
     ORDER BY Period`,
    (r) => bindCommon(r, opts)
  );
}

async function loadCustomerGrowth(opts: LoadOpts): Promise<SeriesPoint[]> {
  const bucket = bucketExpr('c.CreatedAt', opts.granularity);
  return bucketed(
    `SELECT ${bucket} AS Period, COUNT(*) AS MetricValue
     FROM dbo.Customer c
     WHERE c.CreatedAt >= @From
     GROUP BY ${bucket}
     ORDER BY Period`,
    (r) => bindCommon(r, opts)
  );
}

async function loadSurveyResponses(opts: LoadOpts): Promise<SeriesPoint[]> {
  const where = ["fr.Status = 'Submitted'", 'fr.IsErased = 0', 'fr.SubmittedAt >= @From'];
  if (opts.formId) where.push('fr.TemplateID = @FormId');
  if (opts.dataScope === 'own') {
    where.push('fr.TemplateID IN (SELECT TemplateID FROM dbo.FormTemplate WHERE OwnerUserID = @UserId)');
  }
  const bucket = bucketExpr('fr.SubmittedAt', opts.granularity);
  return bucketed(
    `SELECT ${bucket} AS Period, COUNT(*) AS MetricValue
     FROM dbo.FormResponse fr
     WHERE ${where.join(' AND ')}
     GROUP BY ${bucket}
     ORDER BY Period`,
    (r) => bindCommon(r, opts)
  );
}

async function loadInterviews(opts: LoadOpts): Promise<SeriesPoint[]> {
  const where = ['i.InterviewDate >= @From'];
  if (opts.regionId) where.push('i.RegionID = @RegionId');
  const scope = scopeClause(opts.dataScope, { alias: 'i', ownerColumn: 'UserID', regionColumn: 'RegionID' });
  if (scope) where.push(scope);
  const bucket = bucketExpr('i.InterviewDate', opts.granularity);
  return bucketed(
    `SELECT ${bucket} AS Period, COUNT(*) AS MetricValue
     FROM dbo.Interview i
     WHERE ${where.join(' AND ')}
     GROUP BY ${bucket}
     ORDER BY Period`,
    (r) => bindCommon(r, opts)
  );
}

async function loadVisits(opts: LoadOpts): Promise<SeriesPoint[]> {
  const where = ['m.VisitDate >= @From'];
  if (opts.regionId) where.push('m.RegionID = @RegionId');
  const scope = scopeClauseViaOutlet(opts.dataScope, { alias: 'm' });
  if (scope) where.push(scope);
  const bucket = bucketExpr('m.VisitDate', opts.granularity);
  return bucketed(
    `SELECT ${bucket} AS Period, COUNT(*) AS MetricValue
     FROM dbo.vw_Report_MarketVisits m
     WHERE ${where.join(' AND ')}
     GROUP BY ${bucket}
     ORDER BY Period`,
    (r) => bindCommon(r, opts)
  );
}

async function loadMultimedia(opts: LoadOpts): Promise<SeriesPoint[]> {
  const where = ['ma.CaptureDate >= @From'];
  if (opts.regionId) where.push('ma.RegionID = @RegionId');
  const scope = scopeClause(opts.dataScope, { alias: 'ma', ownerColumn: 'CapturedBy', regionColumn: 'RegionID' });
  if (scope) where.push(scope);
  const bucket = bucketExpr('ma.CaptureDate', opts.granularity);
  return bucketed(
    `SELECT ${bucket} AS Period, COUNT(*) AS MetricValue
     FROM dbo.MultimediaAsset ma
     WHERE ${where.join(' AND ')}
     GROUP BY ${bucket}
     ORDER BY Period`,
    (r) => bindCommon(r, opts)
  );
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
export const METRICS: readonly MetricDef[] = [
  // Sales (ERP cache)
  { module: 'sales', metric: 'revenue', label: 'Sales revenue', unit: 'currency', granularityDefault: 'month', fillZeros: true, requiredAction: 'reports.view', load: (o) => loadSales('revenue', o) },
  { module: 'sales', metric: 'quantity', label: 'Units sold', unit: 'count', granularityDefault: 'month', fillZeros: true, requiredAction: 'reports.view', load: (o) => loadSales('quantity', o) },
  { module: 'sales', metric: 'orders', label: 'Order count', unit: 'count', granularityDefault: 'month', fillZeros: true, requiredAction: 'reports.view', load: (o) => loadSales('orders', o) },
  // Weekly sales (field capture)
  { module: 'weeklySales', metric: 'revenue', label: 'Weekly sales revenue', unit: 'currency', granularityDefault: 'week', fillZeros: true, requiredAction: 'weeklySales.view', load: (o) => loadWeeklySales('revenue', o) },
  { module: 'weeklySales', metric: 'quantity', label: 'Weekly units sold', unit: 'count', granularityDefault: 'week', fillZeros: true, requiredAction: 'weeklySales.view', load: (o) => loadWeeklySales('quantity', o) },
  // KPI achievement
  { module: 'kpi', metric: 'achievement', label: 'KPI achievement %', unit: 'percent', granularityDefault: 'month', fillZeros: false, requiredAction: 'reports.view', load: (o) => loadKpi(o) },
  // Competitor price level
  { module: 'competitorPrice', metric: 'avgPrice', label: 'Average competitor price', unit: 'currency', granularityDefault: 'month', fillZeros: false, requiredAction: 'competitors.view', load: (o) => loadCompetitorPrice('avgPrice', o) },
  { module: 'competitorPrice', metric: 'observations', label: 'Competitor price observations', unit: 'count', granularityDefault: 'month', fillZeros: true, requiredAction: 'competitors.view', load: (o) => loadCompetitorPrice('observations', o) },
  // Own vs competitor price gap
  { module: 'pricing', metric: 'avgGap', label: 'Average price gap %', unit: 'percent', granularityDefault: 'month', fillZeros: false, requiredAction: 'pricing.view', load: (o) => loadPriceGap(o) },
  // Product demand (units sold)
  { module: 'products', metric: 'units', label: 'Product demand (units)', unit: 'count', granularityDefault: 'month', fillZeros: true, requiredAction: 'reports.view', load: (o) => loadProductDemand('units', o) },
  { module: 'products', metric: 'revenue', label: 'Product demand revenue', unit: 'currency', granularityDefault: 'month', fillZeros: true, requiredAction: 'reports.view', load: (o) => loadProductDemand('revenue', o) },
  // Customer acquisition
  { module: 'customers', metric: 'newCustomers', label: 'New customers', unit: 'count', granularityDefault: 'month', fillZeros: true, requiredAction: null, load: (o) => loadCustomerGrowth(o) },
  // Survey responses
  { module: 'surveys', metric: 'responses', label: 'Survey responses', unit: 'count', granularityDefault: 'month', fillZeros: true, requiredAction: 'forms.viewResponses', load: (o) => loadSurveyResponses(o) },
  // Interviews
  { module: 'interviews', metric: 'interviews', label: 'Interviews conducted', unit: 'count', granularityDefault: 'month', fillZeros: true, requiredAction: 'interviews.view', load: (o) => loadInterviews(o) },
  // Market visits
  { module: 'visits', metric: 'visits', label: 'Market visits', unit: 'count', granularityDefault: 'month', fillZeros: true, requiredAction: null, load: (o) => loadVisits(o) },
  // Multimedia captures
  { module: 'multimedia', metric: 'assets', label: 'Multimedia assets captured', unit: 'count', granularityDefault: 'month', fillZeros: true, requiredAction: 'multimedia.view', load: (o) => loadMultimedia(o) },
];

const DEFAULT_METRIC: Record<PredictiveModule, string> = {
  sales: 'revenue',
  weeklySales: 'revenue',
  kpi: 'achievement',
  competitorPrice: 'avgPrice',
  pricing: 'avgGap',
  products: 'units',
  customers: 'newCustomers',
  surveys: 'responses',
  interviews: 'interviews',
  visits: 'visits',
  multimedia: 'assets',
};

export function resolveMetric(module: PredictiveModule, metric?: string): MetricDef {
  const key = metric ?? DEFAULT_METRIC[module];
  const def = METRICS.find((m) => m.module === module && m.metric === key);
  if (!def) {
    const options = METRICS.filter((m) => m.module === module).map((m) => m.metric).join(', ');
    throw new Error(`Unknown metric "${key}" for module "${module}" (available: ${options || 'none'})`);
  }
  return def;
}

export function metricsForModule(module: PredictiveModule): MetricDef[] {
  return METRICS.filter((m) => m.module === module);
}

// ---------------------------------------------------------------------------
// Period arithmetic (shared with the service for forecast labels)
// ---------------------------------------------------------------------------
export function historyStart(g: Granularity): string {
  const now = new Date();
  if (g === 'month') {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - MAX_HISTORY.month, 1));
    return d.toISOString().slice(0, 10);
  }
  const days = g === 'week' ? MAX_HISTORY.week * 7 : MAX_HISTORY.day;
  return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

/** Label of the period `steps` periods after `label` (negative steps allowed). */
export function shiftPeriod(label: string, g: Granularity, steps = 1): string {
  if (g === 'month') {
    const [y, m] = label.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + steps, 1));
    return d.toISOString().slice(0, 7);
  }
  const base = Date.parse(`${label}T00:00:00.000Z`);
  const stepDays = g === 'week' ? 7 * steps : steps;
  return new Date(base + stepDays * 86_400_000).toISOString().slice(0, 10);
}

/** All period labels from `from` to `to` inclusive, oldest first. */
export function enumeratePeriods(from: string, to: string, g: Granularity): string[] {
  const out: string[] = [];
  let cursor = from;
  let guard = 0;
  while (cursor <= to && guard < 1000) {
    out.push(cursor);
    cursor = shiftPeriod(cursor, g, 1);
    guard++;
  }
  return out;
}
