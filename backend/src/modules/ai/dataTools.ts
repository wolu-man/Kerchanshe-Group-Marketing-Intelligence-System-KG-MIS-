// =============================================================================
// Domain-aware data intelligence — read + predict query catalogue.
//
// The model never writes SQL and never sees a table: it picks a named query
// from this catalogue, the server validates the arguments with zod, checks the
// caller's permission for that specific domain, runs the EXISTING service
// function (scope-aware, parameterized SQL) and only then hands the result to
// the model. Read tools return stored data; predict tools return statistics
// computed by the deterministic forecasting engine. There is no write path.
// =============================================================================

import { z } from 'zod';
import { AppError, ForbiddenError, ValidationError } from '../../utils/errors';
import { isRole, resolveCapability, type Role } from '../../security/permissions';
import type { DataScope } from '../../utils/scope';
import { getForm } from '../forms/forms.service';
import { getReport } from '../forms/responses.service';
import * as reports from '../reports/reports.service';
import * as multimedia from '../multimedia/multimedia.service';
import * as interviews from '../interviews/interviews.service';
import { getPredictions } from '../predictive/predictive.service';
import { PREDICTIVE_MODULES } from '../predictive/predictive.types';
import type { PredictiveModule, PredictiveRequest } from '../predictive/predictive.types';
import { metricsForModule } from '../predictive/series';
import { getDashboard, listOpportunities } from '../tenders/tenders.service';
import { OPPORTUNITY_TYPES } from '../tenders/classifier';
import type { ToolSpec } from './systemPrompt';

export const DATA_LIMITS = {
  /** Characters of tool output handed back to the model. */
  resultChars: 20000,
  /** Rows kept from any array in a tool result. */
  maxRows: 25,
} as const;

export interface DataToolContext {
  userId: number;
  role: string;
  dataScope: DataScope;
}

export interface DataToolResult {
  name: string;
  label: string;
  args: Record<string, unknown>;
  data: unknown;
  rowCount: number;
}

interface DataToolDef {
  name: string;
  label: string;
  /**
   * How the assistant may use this tool.
   *   read    — returns stored data (nothing changes);
   *   predict — returns server-computed statistics (forecast/anomaly numbers
   *             come from the deterministic engine, never the model).
   */
  classification: 'read' | 'predict' | 'suggest' | 'write';
  /** Existing service that backs the query — no bespoke SQL lives here. */
  source: string;
  /** Shown to the model in the catalogue. */
  description: string;
  /** JSON Schema for the model (guidance only — zod below is the contract). */
  jsonArgs: Record<string, unknown>;
  args: z.ZodTypeAny;
  /** Extra permission checked against the caller's role before execution. */
  requiredAction?: string;
  run: (args: any, ctx: DataToolContext) => Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Shared argument fragments
// ---------------------------------------------------------------------------
const dateArg = {
  type: 'string',
  description: 'Optional ISO date, e.g. 2026-01-31 (inclusive)',
} as const;
const idArg = (description: string) => ({ type: 'integer', description });

const zId = z.number().int().positive();
const zDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

// ---------------------------------------------------------------------------
// Predict tools — shared argument contract.
// The numbers are produced by the deterministic forecasting engine
// (predictive.service), never by the model.
// ---------------------------------------------------------------------------
/** 'monthly' → 'month', 'Weekly' → 'week'; anything else passes through. */
function normGranularity(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  const s = v.trim().toLowerCase();
  const map: Record<string, string> = { daily: 'day', days: 'day', weekly: 'week', weeks: 'week', monthly: 'month', months: 'month' };
  return map[s] ?? s;
}

/** Catalogue/query names the model likes to use → predictive module keys. */
const MODULE_ALIASES: Record<string, string> = {
  sales: 'sales', sales_summary: 'sales', salesrecord: 'sales', erp: 'sales',
  weeklysales: 'weeklySales', weekly_sales: 'weeklySales', weekly_sales_summary: 'weeklySales', field: 'weeklySales',
  kpi: 'kpi', kpis: 'kpi', kpi_performance: 'kpi', kpiresult: 'kpi',
  competitorprice: 'competitorPrice', competitor_price: 'competitorPrice', competitor_intel: 'competitorPrice', competitors: 'competitorPrice',
  pricing: 'pricing', price_comparison: 'pricing', price_gap: 'pricing',
  products: 'products', product_overview: 'products', product_demand: 'products', product_availability: 'products',
  customers: 'customers', customer_overview: 'customers', customer_growth: 'customers',
  surveys: 'surveys', survey: 'surveys', survey_metrics: 'surveys', forms: 'surveys', responses: 'surveys',
  interviews: 'interviews', interview: 'interviews', interview_overview: 'interviews',
  visits: 'visits', visit: 'visits', market_visits: 'visits',
  multimedia: 'multimedia', media: 'multimedia', photos: 'multimedia', multimedia_overview: 'multimedia',
};

function normModule(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  const s = v.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return MODULE_ALIASES[s] ?? s;
}

/** Metric aliases ('sales revenue', 'achievement %', …) → registry metric keys. */
const METRIC_ALIASES: Record<string, string> = {
  revenue: 'revenue', sales: 'revenue', amount: 'revenue', total: 'revenue', money: 'revenue',
  quantity: 'quantity', units: 'quantity', qty: 'quantity', volume: 'quantity',
  orders: 'orders', order: 'orders', order_count: 'orders',
  achievement: 'achievement', ach: 'achievement', achievement_pct: 'achievement', percent: 'achievement',
  avgprice: 'avgPrice', average_price: 'avgPrice', price: 'avgPrice', competitor_price: 'avgPrice',
  observations: 'observations', observation: 'observations', counts: 'observations',
  avggap: 'avgGap', gap: 'avgGap', price_gap: 'avgGap', gap_pct: 'avgGap',
  newcustomers: 'newCustomers', new_customers: 'newCustomers', registrations: 'newCustomers', growth: 'newCustomers',
  responses: 'responses', response: 'responses', survey_responses: 'responses',
  interviews: 'interviews', interview: 'interviews',
  visits: 'visits', visit: 'visits',
  assets: 'assets', asset: 'assets', media: 'assets', captures: 'assets',
  units_sold: 'units', demand: 'units',
};

function normMetric(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  const s = v.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return METRIC_ALIASES[s.replace(/_/g, '')] ?? METRIC_ALIASES[s] ?? s;
}

const zGranularity = z.preprocess(normGranularity, z.enum(['day', 'week', 'month']));
const zHorizon = z.preprocess(
  (v) => {
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      return Number.isFinite(n) ? n : v;
    }
    return v;
  },
  z.number().int().min(1).max(12)
);

const predictJsonArgs = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  granularity: {
    type: 'string',
    enum: ['day', 'week', 'month'],
    description: 'Bucket size (day|week|month). Omit for the module default (sales/KPI month, field weekly sales week).',
  },
  horizon: { type: 'integer', description: 'How many periods to project (1-12). Default: month 3, week 4, day 7.' },
  ...extra,
});

const predictArgs = (extra: Record<string, z.ZodTypeAny> = {}) =>
  z.object({
    granularity: zGranularity.optional(),
    horizon: zHorizon.optional(),
    ...extra,
  });

/** Optional metric: aliases are normalised, unknown values fall back to the module default. */
function zMetric(choices: readonly string[]): z.ZodTypeAny {
  const set = choices as unknown as [string, ...string[]];
  return z.preprocess(
    (v) => {
      if (v === undefined || v === null || v === '') return undefined;
      const n = normMetric(v);
      return typeof n === 'string' && (choices as readonly string[]).includes(n) ? n : undefined;
    },
    z.enum(set).optional()
  );
}

/** Required module: catalogue names and friendly aliases map to the registry keys. */
const zModule = z.preprocess(normModule, z.enum(PREDICTIVE_MODULES));

/** Free metric slot: normalised, never rejected here (checked against the module registry at run time). */
const zMetricFree = z.preprocess(
  (v) => (v === undefined || v === null || v === '' ? undefined : normMetric(v)),
  z.string().min(1).max(60).optional()
);

/** Runs one deterministic prediction with the caller's permission + scope. */
function runPredict(
  module: PredictiveModule,
  a: { granularity?: 'day' | 'week' | 'month'; horizon?: number; metric?: string; regionId?: number; productId?: number; colorId?: number; formId?: number },
  ctx: DataToolContext
): Promise<unknown> {
  const req: PredictiveRequest = {
    module,
    ...(a.metric ? { metric: a.metric } : {}),
    ...(a.granularity ? { granularity: a.granularity } : {}),
    ...(a.horizon ? { horizon: a.horizon } : {}),
    ...(a.regionId ? { regionId: a.regionId } : {}),
    ...(a.productId ? { productId: a.productId } : {}),
    ...(a.colorId ? { colorId: a.colorId } : {}),
    ...(a.formId ? { formId: a.formId } : {}),
  };
  return getPredictions(req, { userId: ctx.userId, role: ctx.role as Role, dataScope: ctx.dataScope }, 'tool');
}

const DAY_MS = 86_400_000;
const isoDate = (d: Date): string => d.toISOString().slice(0, 10);
const parseDate = (s: string): Date => new Date(`${s}T00:00:00.000Z`);

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------
const TOOLS: DataToolDef[] = [
  {
    name: 'sales_summary',
    label: 'Sales (D365FO)',
    classification: 'read',
    source: 'reports.service.salesOverview',
    description: 'Sales totals, by region and top products from the ERP sales cache.',
    jsonArgs: { from: dateArg, to: dateArg, regionId: idArg('Region ID'), colorId: idArg('Product color ID') },
    args: z.object({ from: zDate.optional(), to: zDate.optional(), regionId: zId.optional(), colorId: zId.optional() }),
    requiredAction: 'reports.view',
    run: (a, ctx) =>
      reports.salesOverview({
        dataScope: ctx.dataScope,
        userId: ctx.userId,
        ...(a.from ? { from: a.from } : {}),
        ...(a.to ? { to: a.to } : {}),
        ...(a.regionId ? { regionId: a.regionId } : {}),
        ...(a.colorId ? { colorId: a.colorId } : {}),
      }),
  },
  {
    name: 'weekly_sales_summary',
    label: 'Weekly sales (field)',
    classification: 'read',
    source: 'reports.service.weeklySalesOverview',
    description: 'Field-captured weekly sales totals by region, product and business group.',
    jsonArgs: { from: dateArg, to: dateArg, regionId: idArg('Region ID'), businessGroupId: idArg('Business group ID'), colorId: idArg('Product color ID') },
    args: z.object({
      from: zDate.optional(),
      to: zDate.optional(),
      regionId: zId.optional(),
      businessGroupId: zId.optional(),
      colorId: zId.optional(),
    }),
    run: (a, ctx) =>
      reports.weeklySalesOverview({
        dataScope: ctx.dataScope,
        userId: ctx.userId,
        ...(a.from ? { from: a.from } : {}),
        ...(a.to ? { to: a.to } : {}),
        ...(a.regionId ? { regionId: a.regionId } : {}),
        ...(a.businessGroupId ? { businessGroupId: a.businessGroupId } : {}),
        ...(a.colorId ? { colorId: a.colorId } : {}),
      }),
  },
  {
    name: 'price_comparison',
    label: 'Own vs competitor price',
    classification: 'read',
    source: 'reports.service.priceComparison',
    description: 'Price gaps between our products and competitor prices for a category or region.',
    jsonArgs: { regionId: idArg('Region ID'), category: { type: 'string', description: 'Product category' }, colorId: idArg('Product color ID') },
    args: z.object({ regionId: zId.optional(), category: z.string().max(120).optional(), colorId: zId.optional() }),
    requiredAction: 'pricing.view',
    run: (a, ctx) =>
      reports.priceComparison({
        dataScope: ctx.dataScope,
        userId: ctx.userId,
        ...(a.regionId ? { regionId: a.regionId } : {}),
        ...(a.category ? { category: a.category } : {}),
        ...(a.colorId ? { colorId: a.colorId } : {}),
      }),
  },
  {
    name: 'competitor_intel',
    label: 'Competitor intelligence',
    classification: 'read',
    source: 'reports.service.competitorIntelReport',
    description: 'Observed competitor prices, availability and promotions, aggregated by competitor.',
    jsonArgs: { regionId: idArg('Region ID'), competitorId: idArg('Competitor ID'), colorId: idArg('Product color ID') },
    args: z.object({ regionId: zId.optional(), competitorId: zId.optional(), colorId: zId.optional() }),
    requiredAction: 'competitors.view',
    run: (a, ctx) =>
      reports.competitorIntelReport({
        dataScope: ctx.dataScope,
        userId: ctx.userId,
        ...(a.regionId ? { regionId: a.regionId } : {}),
        ...(a.competitorId ? { competitorId: a.competitorId } : {}),
        ...(a.colorId ? { colorId: a.colorId } : {}),
      }),
  },
  {
    name: 'customer_overview',
    label: 'Customers',
    classification: 'read',
    source: 'reports.service.customersOverview',
    description: 'Customers by type, region, business group and star rating.',
    jsonArgs: { regionId: idArg('Region ID'), businessGroupId: idArg('Business group ID') },
    args: z.object({ regionId: zId.optional(), businessGroupId: zId.optional() }),
    run: (a, ctx) =>
      reports.customersOverview({
        dataScope: ctx.dataScope,
        userId: ctx.userId,
        ...(a.regionId ? { regionId: a.regionId } : {}),
        ...(a.businessGroupId ? { businessGroupId: a.businessGroupId } : {}),
      }),
  },
  {
    name: 'product_overview',
    label: 'Products',
    classification: 'read',
    source: 'reports.service.productsOverview',
    description: 'Product catalogue counts by category, business group, color and price tier.',
    jsonArgs: { businessGroupId: idArg('Business group ID'), colorId: idArg('Product color ID') },
    args: z.object({ businessGroupId: zId.optional(), colorId: zId.optional() }),
    run: (a, ctx) =>
      reports.productsOverview({
        dataScope: ctx.dataScope,
        userId: ctx.userId,
        ...(a.businessGroupId ? { businessGroupId: a.businessGroupId } : {}),
        ...(a.colorId ? { colorId: a.colorId } : {}),
      }),
  },
  {
    name: 'interview_overview',
    label: 'Interviews',
    classification: 'read',
    source: 'reports.service.interviewsOverview',
    description: 'Interview counts, average satisfaction and sentiment split by region.',
    jsonArgs: { from: dateArg, to: dateArg, regionId: idArg('Region ID') },
    args: z.object({ from: zDate.optional(), to: zDate.optional(), regionId: zId.optional() }),
    run: (a, ctx) =>
      reports.interviewsOverview({
        dataScope: ctx.dataScope,
        userId: ctx.userId,
        ...(a.from ? { from: a.from } : {}),
        ...(a.to ? { to: a.to } : {}),
        ...(a.regionId ? { regionId: a.regionId } : {}),
      }),
  },
  {
    name: 'market_visits',
    label: 'Market visits',
    classification: 'read',
    source: 'reports.service.marketVisits',
    description: 'Market visit counts and findings for a period.',
    jsonArgs: { from: dateArg, to: dateArg },
    args: z.object({ from: zDate.optional(), to: zDate.optional() }),
    run: (a, ctx) =>
      reports.marketVisits({
        dataScope: ctx.dataScope,
        userId: ctx.userId,
        ...(a.from ? { from: a.from } : {}),
        ...(a.to ? { to: a.to } : {}),
      }),
  },
  {
    name: 'kpi_performance',
    label: 'KPI performance',
    classification: 'read',
    source: 'reports.service.kpiPerformance',
    description: 'KPI achievement by KPI and by officer for a period.',
    jsonArgs: {
      frequency: { type: 'string', description: 'e.g. monthly, quarterly' },
      regionId: idArg('Region ID'),
    },
    args: z.object({ frequency: z.string().max(40).optional(), regionId: zId.optional() }),
    run: (a, ctx) =>
      reports.kpiPerformance({
        dataScope: ctx.dataScope,
        userId: ctx.userId,
        ...(a.frequency ? { frequency: a.frequency } : {}),
        ...(a.regionId ? { regionId: a.regionId } : {}),
      }),
  },
  {
    name: 'product_availability',
    label: 'Product availability',
    classification: 'read',
    source: 'reports.service.productAvailability',
    description: 'Availability rates of products observed in the field (not region scoped).',
    jsonArgs: { colorId: idArg('Product color ID') },
    args: z.object({ colorId: zId.optional() }),
    run: (a) => reports.productAvailability({ ...(a.colorId ? { colorId: a.colorId } : {}) }),
  },
  {
    name: 'survey_metrics',
    label: 'Survey / form metrics',
    classification: 'read',
    source: 'forms/responses.service.getReport',
    description:
      'Response counts, rating averages, distributions and per-month trends for ONE form. Use when the question is about survey responses. Requires the formId.',
    jsonArgs: { formId: idArg('Form (template) ID'), from: dateArg, to: dateArg },
    args: z.object({ formId: zId, from: zDate.optional(), to: zDate.optional() }),
    requiredAction: 'forms.viewResponses',
    run: async (a, ctx) => {
      const form = await getForm(a.formId);
      if (ctx.dataScope === 'own' && form.OwnerUserID !== ctx.userId) {
        throw new ForbiddenError('You can only analyse your own forms');
      }
      return getReport(a.formId, {
        ...(a.from ? { from: a.from } : {}),
        ...(a.to ? { to: a.to } : {}),
      });
    },
  },
  {
    name: 'sales_period_comparison',
    label: 'Sales: period vs period',
    classification: 'read',
    source: 'reports.service.salesOverview (called for both windows)',
    description:
      'Compare ERP sales totals of two periods (current vs previous) with computed deltas and percent changes. Windows default to the last 30 days and the 30 days before them; pass from/to to set the current window explicitly.',
    jsonArgs: { from: dateArg, to: dateArg, previousFrom: dateArg, previousTo: dateArg, regionId: idArg('Region ID'), colorId: idArg('Product color ID') },
    args: z.object({
      from: zDate.optional(),
      to: zDate.optional(),
      previousFrom: zDate.optional(),
      previousTo: zDate.optional(),
      regionId: zId.optional(),
      colorId: zId.optional(),
    }),
    requiredAction: 'reports.view',
    run: async (a, ctx) => {
      const to = a.to ?? isoDate(new Date());
      const from = a.from ?? isoDate(new Date(parseDate(to).getTime() - 29 * DAY_MS));
      let previousFrom: string;
      let previousTo: string;
      if (a.previousFrom && a.previousTo) {
        previousFrom = a.previousFrom;
        previousTo = a.previousTo;
      } else {
        const days = Math.max(1, Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / DAY_MS) + 1);
        const prevEnd = new Date(parseDate(from).getTime() - DAY_MS);
        previousTo = isoDate(prevEnd);
        previousFrom = isoDate(new Date(prevEnd.getTime() - (days - 1) * DAY_MS));
      }
      const base = {
        dataScope: ctx.dataScope,
        userId: ctx.userId,
        ...(a.regionId ? { regionId: a.regionId } : {}),
        ...(a.colorId ? { colorId: a.colorId } : {}),
      };
      const [current, previous] = await Promise.all([
        reports.salesOverview({ ...base, from, to }),
        reports.salesOverview({ ...base, from: previousFrom, to: previousTo }),
      ]);
      const num = (v: unknown): number => Number(v ?? 0);
      const pct = (cur: number, prev: number): number | null =>
        prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null;
      const cTotals = current.totals ?? {};
      const pTotals = previous.totals ?? {};
      const amountDelta = num(cTotals.TotalAmount) - num(pTotals.TotalAmount);
      return {
        current: { period: { from, to }, totals: cTotals, byRegion: current.byRegion, topProducts: current.topProducts },
        previous: { period: { from: previousFrom, to: previousTo }, totals: pTotals },
        delta: {
          totalAmount: amountDelta,
          totalAmountPct: pct(num(cTotals.TotalAmount), num(pTotals.TotalAmount)),
          totalQuantity: num(cTotals.TotalQuantity) - num(pTotals.TotalQuantity),
          totalQuantityPct: pct(num(cTotals.TotalQuantity), num(pTotals.TotalQuantity)),
          orderCount: num(cTotals.OrderCount) - num(pTotals.OrderCount),
          orderCountPct: pct(num(cTotals.OrderCount), num(pTotals.OrderCount)),
        },
      };
    },
  },
  {
    name: 'executive_report_summary',
    label: 'Executive report summary',
    classification: 'read',
    source: 'reports.service.aiInsights',
    description:
      'Executive KPI snapshot across sales, price gaps, market visits, forms, interviews, availability, customers, products and KPI achievement, with rule-based observations and alerts. Use for “summarize the business / give me the executive view”.',
    jsonArgs: { from: dateArg, to: dateArg, regionId: idArg('Region ID') },
    args: z.object({ from: zDate.optional(), to: zDate.optional(), regionId: zId.optional() }),
    requiredAction: 'reports.view',
    run: (a, ctx) =>
      reports.aiInsights({
        dataScope: ctx.dataScope,
        userId: ctx.userId,
        ...(a.from ? { from: a.from } : {}),
        ...(a.to ? { to: a.to } : {}),
        ...(a.regionId ? { regionId: a.regionId } : {}),
      }),
  },
  {
    name: 'multimedia_overview',
    label: 'Multimedia assets',
    classification: 'read',
    source: 'multimedia.service.multimediaOverview',
    description:
      'Photo/video/audio asset counts by media type, validation status and capture month, plus total size and contributors, for an optional period.',
    jsonArgs: {
      from: dateArg,
      to: dateArg,
      regionId: idArg('Region ID'),
      businessGroupId: idArg('Business group ID'),
      mediaType: { type: 'string', description: 'e.g. Photo, Video, Audio' },
      validationStatus: { type: 'string', description: 'e.g. Pending, Validated, Rejected' },
    },
    args: z.object({
      from: zDate.optional(),
      to: zDate.optional(),
      regionId: zId.optional(),
      businessGroupId: zId.optional(),
      mediaType: z.string().max(20).optional(),
      validationStatus: z.string().max(20).optional(),
    }),
    requiredAction: 'multimedia.view',
    run: (a, ctx) =>
      multimedia.multimediaOverview({
        dataScope: ctx.dataScope,
        userId: ctx.userId,
        ...(a.from ? { fromDate: a.from } : {}),
        ...(a.to ? { toDate: a.to } : {}),
        ...(a.regionId ? { regionId: a.regionId } : {}),
        ...(a.businessGroupId ? { businessGroupId: a.businessGroupId } : {}),
        ...(a.mediaType ? { mediaType: a.mediaType } : {}),
        ...(a.validationStatus ? { validationStatus: a.validationStatus } : {}),
      }),
  },
  {
    name: 'interview_themes',
    label: 'Interview feedback (themes)',
    classification: 'read',
    source: 'interviews.service.interviewThemes',
    description:
      'Recent interview feedback snippets with satisfaction, sentiment and region (max 25, each capped at 300 chars) — use to identify recurring themes, praise and complaints in open text.',
    jsonArgs: { from: dateArg, to: dateArg, regionId: idArg('Region ID') },
    args: z.object({ from: zDate.optional(), to: zDate.optional(), regionId: zId.optional() }),
    requiredAction: 'interviews.view',
    run: (a, ctx) =>
      interviews.interviewThemes({
        dataScope: ctx.dataScope,
        userId: ctx.userId,
        ...(a.from ? { from: a.from } : {}),
        ...(a.to ? { to: a.to } : {}),
        ...(a.regionId ? { regionId: a.regionId } : {}),
      }),
  },
  // -------------------------------------------------------------------------
  // PREDICT tools — deterministic forecasting engine behind them.
  // The numbers are computed server-side (forecast + band + confidence);
  // the model only explains what comes back.
  // -------------------------------------------------------------------------
  {
    name: 'forecast_sales',
    label: 'Sales forecast',
    classification: 'predict',
    source: 'predictive.service.getPredictions',
    description:
      'Project ERP sales revenue / units / orders for the next periods, with confidence band, model name and confidence level.',
    jsonArgs: predictJsonArgs({ metric: { type: 'string', enum: ['revenue', 'quantity', 'orders'], description: 'Which series (default revenue)' }, colorId: idArg('Product color ID') }),
    args: predictArgs({ metric: zMetric(['revenue', 'quantity', 'orders']), colorId: zId.optional() }),
    requiredAction: 'reports.view',
    run: (a, ctx) => runPredict('sales', a, ctx),
  },
  {
    name: 'forecast_weekly_sales',
    label: 'Weekly sales forecast',
    classification: 'predict',
    source: 'predictive.service.getPredictions',
    description: 'Project field weekly sales revenue or units for the coming weeks, with band, model and confidence level.',
    jsonArgs: predictJsonArgs({ metric: { type: 'string', enum: ['revenue', 'quantity'], description: 'Which series (default revenue)' }, colorId: idArg('Product color ID') }),
    args: predictArgs({ metric: zMetric(['revenue', 'quantity']), colorId: zId.optional() }),
    requiredAction: 'weeklySales.view',
    run: (a, ctx) => runPredict('weeklySales', a, ctx),
  },
  {
    name: 'forecast_kpi',
    label: 'KPI forecast',
    classification: 'predict',
    source: 'predictive.service.getPredictions',
    description: 'Project monthly KPI achievement % for the coming periods, with band, model and confidence level.',
    jsonArgs: predictJsonArgs(),
    args: predictArgs(),
    requiredAction: 'reports.view',
    run: (a, ctx) => runPredict('kpi', a, ctx),
  },
  {
    name: 'forecast_competitor_price',
    label: 'Competitor price forecast',
    classification: 'predict',
    source: 'predictive.service.getPredictions',
    description: 'Project the average observed competitor price or observation volume for the coming periods.',
    jsonArgs: predictJsonArgs({ metric: { type: 'string', enum: ['avgPrice', 'observations'], description: 'Which series (default avgPrice)' }, colorId: idArg('Product color ID') }),
    args: predictArgs({ metric: zMetric(['avgPrice', 'observations']), colorId: zId.optional() }),
    requiredAction: 'competitors.view',
    run: (a, ctx) => runPredict('competitorPrice', a, ctx),
  },
  {
    name: 'forecast_price_gap',
    label: 'Price gap forecast',
    classification: 'predict',
    source: 'predictive.service.getPredictions',
    description: 'Project the average % gap between our price and competitor prices for the coming periods.',
    jsonArgs: predictJsonArgs({ colorId: idArg('Product color ID') }),
    args: predictArgs({ colorId: zId.optional() }),
    requiredAction: 'pricing.view',
    run: (a, ctx) => runPredict('pricing', a, ctx),
  },
  {
    name: 'forecast_product_demand',
    label: 'Product demand forecast',
    classification: 'predict',
    source: 'predictive.service.getPredictions',
    description: 'Project units or revenue per product (optionally one productId or color) for the coming periods.',
    jsonArgs: predictJsonArgs({
      metric: { type: 'string', enum: ['units', 'revenue'], description: 'Which series (default units)' },
      productId: idArg('Product ID'),
      colorId: idArg('Product color ID'),
    }),
    args: predictArgs({ metric: zMetric(['units', 'revenue']), productId: zId.optional(), colorId: zId.optional() }),
    requiredAction: 'reports.view',
    run: (a, ctx) => runPredict('products', a, ctx),
  },
  {
    name: 'forecast_customer_growth',
    label: 'Customer growth forecast',
    classification: 'predict',
    source: 'predictive.service.getPredictions',
    description: 'Project new customer registrations per month for the coming periods.',
    jsonArgs: predictJsonArgs(),
    args: predictArgs(),
    run: (a, ctx) => runPredict('customers', a, ctx),
  },
  {
    name: 'predict_survey_volume',
    label: 'Survey response forecast',
    classification: 'predict',
    source: 'predictive.service.getPredictions',
    description: 'Project monthly form/survey response volume (formId to target one form) for the coming periods.',
    jsonArgs: predictJsonArgs({ formId: idArg('Form template ID') }),
    args: predictArgs({ formId: zId.optional() }),
    requiredAction: 'forms.viewResponses',
    run: (a, ctx) => runPredict('surveys', a, ctx),
  },
  {
    name: 'predict_interview_activity',
    label: 'Interview activity forecast',
    classification: 'predict',
    source: 'predictive.service.getPredictions',
    description: 'Project the number of interviews conducted per month for the coming periods.',
    jsonArgs: predictJsonArgs({ regionId: idArg('Region ID') }),
    args: predictArgs({ regionId: zId.optional() }),
    requiredAction: 'interviews.view',
    run: (a, ctx) => runPredict('interviews', a, ctx),
  },
  {
    name: 'predict_visit_activity',
    label: 'Market visit forecast',
    classification: 'predict',
    source: 'predictive.service.getPredictions',
    description: 'Project the number of market visit reports per month for the coming periods.',
    jsonArgs: predictJsonArgs({ regionId: idArg('Region ID') }),
    args: predictArgs({ regionId: zId.optional() }),
    run: (a, ctx) => runPredict('visits', a, ctx),
  },
  {
    name: 'forecast_multimedia_capture',
    label: 'Media capture forecast',
    classification: 'predict',
    source: 'predictive.service.getPredictions',
    description: 'Project multimedia assets captured per month (photo/video/audio) for the coming periods.',
    jsonArgs: predictJsonArgs({ regionId: idArg('Region ID') }),
    args: predictArgs({ regionId: zId.optional() }),
    requiredAction: 'multimedia.view',
    run: (a, ctx) => runPredict('multimedia', a, ctx),
  },
  {
    name: 'detect_anomalies',
    label: 'Anomaly detection',
    classification: 'predict',
    source: 'predictive.service.getPredictions',
    description:
      'Flag unexpected spikes or drops in any tracked series: returns the anomalies, trend direction and data-gap notes for one module and metric.',
    jsonArgs: {
      module: { type: 'string', enum: PREDICTIVE_MODULES, description: 'Which series to scan (e.g. sales, kpi, surveys).' },
      metric: { type: 'string', description: 'Metric within that module; omit for the default.' },
      granularity: { type: 'string', enum: ['day', 'week', 'month'], description: 'Bucket size. Omit for the module default.' },
      regionId: idArg('Region ID'),
      productId: idArg('Product ID'),
      colorId: idArg('Product color ID'),
      formId: idArg('Form template ID'),
    },
    args: z.object({
      module: zModule,
      metric: zMetricFree,
      granularity: zGranularity.optional(),
      regionId: zId.optional(),
      productId: zId.optional(),
      colorId: zId.optional(),
      formId: zId.optional(),
    }),
    run: async (a, ctx) => {
      // Drop a metric that the module does not track → the default metric runs
      // instead of failing the whole call on an alias we could not resolve.
      const known = metricsForModule(a.module).map((m) => m.metric);
      const metric = a.metric && known.includes(a.metric) ? a.metric : undefined;
      const insight = (await runPredict(a.module, { ...a, ...(metric ? { metric } : { metric: undefined }) }, ctx)) as {
        module: string;
        metric: string;
        label: string;
        granularity: string;
        unit: string;
        confidence: string;
        sufficientData: boolean;
        notice: string | null;
        historyWindow: unknown;
        anomalies: unknown[];
        signals: unknown[];
        dataGaps: unknown;
      };
      return {
        module: insight.module,
        metric: insight.metric,
        label: insight.label,
        granularity: insight.granularity,
        unit: insight.unit,
        confidence: insight.confidence,
        sufficientData: insight.sufficientData,
        notice: insight.notice,
        historyWindow: insight.historyWindow,
        anomalies: insight.anomalies,
        signals: insight.signals,
        dataGaps: insight.dataGaps,
      };
    },
  },
  {
    name: 'opportunity_overview',
    label: 'Opportunities (dashboard)',
    classification: 'read',
    source: 'tenders.service.getDashboard',
    description:
      'KPI snapshot of the opportunity pipeline: total, new this week, deadline-soon, saved, high-relevance, counts by type (TENDER/RFQ/BUYER_LEAD/TRADE_INTELLIGENCE/MARKET_SIGNAL), export (outside Ethiopia), trade intelligence, plus breakdowns by source, country, sector and product group, the relevance distribution, an 8-week deadline trend and the next deadlines. Use for "how many … opportunities" and for distribution questions.',
    jsonArgs: {},
    args: z.object({}),
    requiredAction: 'tenders.view',
    run: (_a, ctx) => getDashboard(ctx.userId),
  },
  {
    name: 'opportunity_list',
    label: 'Opportunities (search)',
    classification: 'read',
    source: 'tenders.service.listOpportunities',
    description:
      'Search and count stored opportunities with filters. Returns { items (up to 25), total, page, pageSize } — use total for counts and items for listing. Each item carries title, type, organization, country, sector, product group, publication/deadline dates, estimated value, relevance score, confidence, data quality, saved flag and source. Supports free text, opportunity type, country, sector, product group code, business group code, buyer/organization, source id, minimum relevance score, publication and deadline date ranges (use deadline from/to for "closing soon"), minimum confidence, data quality label, exportOnly (outside Ethiopia) and savedOnly (my saved list).',
    jsonArgs: {
      search: { type: 'string', description: 'Free-text match on title, organization or description.' },
      type: { type: 'string', enum: OPPORTUNITY_TYPES, description: 'Opportunity type.' },
      country: { type: 'string', description: 'Exact country name, e.g. Ethiopia.' },
      sector: { type: 'string', description: 'Sector substring, e.g. Construction.' },
      productGroup: { type: 'string', description: 'Product group CODE (e.g. COFFEE) or numeric id.' },
      businessGroup: { type: 'string', description: 'Business group code, e.g. KCC or BPN.' },
      organization: { type: 'string', description: 'Buyer / organization name substring.' },
      sourceId: idArg('Tender source id'),
      relevanceMin: { type: 'integer', description: 'Minimum relevance score 0-100.' },
      fromDeadline: { ...dateArg, description: 'Deadline on/after this date (ISO). Part of "closing soon".' },
      toDeadline: { ...dateArg, description: 'Deadline on/before this date (ISO).' },
      fromPublication: { ...dateArg, description: 'Published on/after this date (ISO).' },
      toPublication: { ...dateArg, description: 'Published on/before this date (ISO).' },
      confidenceMin: { type: 'integer', description: 'Minimum data confidence 0-100.' },
      dataQuality: { type: 'string', enum: ['Complete', 'Partial', 'Sparse'], description: 'Data quality label.' },
      exportOnly: { type: 'boolean', description: 'true = only opportunities outside Ethiopia.' },
      savedOnly: { type: 'boolean', description: 'true = only opportunities the caller saved.' },
    },
    args: z.object({
      search: z.string().min(1).max(300).optional(),
      type: z.enum(OPPORTUNITY_TYPES as unknown as [string, ...string[]]).optional(),
      country: z.string().min(1).max(100).optional(),
      sector: z.string().min(1).max(200).optional(),
      productGroup: z.string().min(1).max(50).optional(),
      businessGroup: z.string().min(1).max(20).optional(),
      organization: z.string().min(1).max(300).optional(),
      sourceId: zId.optional(),
      relevanceMin: z.number().int().min(0).max(100).optional(),
      fromDeadline: zDate.optional(),
      toDeadline: zDate.optional(),
      fromPublication: zDate.optional(),
      toPublication: zDate.optional(),
      confidenceMin: z.number().int().min(0).max(100).optional(),
      dataQuality: z.enum(['Complete', 'Partial', 'Sparse']).optional(),
      exportOnly: z.boolean().optional(),
      savedOnly: z.boolean().optional(),
    }),
    requiredAction: 'tenders.view',
    run: async (a, ctx) => {
      const page = await listOpportunities({ userId: ctx.userId, page: 1, pageSize: 25, ...a });
      return {
        ...page,
        items: page.items.map((o) => ({
          TenderOpportunityID: o.TenderOpportunityID,
          Title: o.Title,
          OpportunityType: o.OpportunityType,
          Organization: o.Organization,
          Country: o.Country,
          Sector: o.Sector,
          ProductGroupCode: o.ProductGroupCode,
          PublicationDate: o.PublicationDate,
          DeadlineDate: o.DeadlineDate,
          EstimatedValue: o.EstimatedValue,
          Currency: o.Currency,
          RelevanceScore: o.RelevanceScore,
          Confidence: o.Confidence,
          DataQuality: o.DataQuality,
          IsSaved: o.IsSaved,
          SourceName: o.SourceName,
        })),
      };
    },
  },
];

export const DATA_TOOL_NAMES = TOOLS.map((t) => t.name);

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

// ---------------------------------------------------------------------------
// Central tool registry — the single source of truth for docs and tests.
// Every entry is read-only or predict-only: there is no write path in this
// module (writes stay exclusive to the Form Assistant action flow).
// ---------------------------------------------------------------------------
export type ToolClassification = 'read' | 'predict' | 'suggest' | 'write';

export interface ToolRegistryEntry {
  name: string;
  label: string;
  description: string;
  classification: ToolClassification;
  /** Extra permission required beyond the route guard (null = none). */
  requiredAction: string | null;
  /** Data scope the tool honours: always the caller's resolved scope. */
  dataScope: 'caller';
  /** Existing service backing the query. */
  source: string;
  /** zod contract (jsonArgs shown to the model is guidance only). */
  validation: 'zod';
  /** Audit action recorded when the tool runs. */
  audit: string;
}

export const TOOL_REGISTRY: readonly ToolRegistryEntry[] = TOOLS.map((t) => ({
  name: t.name,
  label: t.label,
  description: t.description,
  classification: t.classification,
  requiredAction: t.requiredAction ?? null,
  dataScope: 'caller',
  source: t.source,
  validation: 'zod',
  audit: t.classification === 'predict' ? 'AI_PREDICTION_GENERATED' : 'AI_DATA_QUERY',
}));

// ---------------------------------------------------------------------------
// The single tool the model may call
// ---------------------------------------------------------------------------
function catalogueText(): string {
  return TOOLS.map(
    (t) =>
      `- ${t.name} — ${t.label}: ${t.description}${
        Object.keys(t.jsonArgs).length > 0
          ? ` Args: ${Object.entries(t.jsonArgs)
              .map(([k, v]) => {
                const spec = v as { type?: string; enum?: readonly unknown[] };
                const values = Array.isArray(spec.enum) ? spec.enum.join('|') : null;
                return `${k}? (${values ?? spec.type ?? 'any'})`;
              })
              .join(', ')}`
          : ' No arguments.'
      }${t.requiredAction ? ` Requires: ${t.requiredAction}.` : ''}`
  ).join('\n');
}

export const DATA_TOOL: ToolSpec = {
  name: 'query_kmis_data',
  description:
    'Run at most one read-only, pre-approved KG-MIS data query. The system executes it and returns the result for your final answer.',
  parameters: {
    type: 'object',
    additionalProperties: true,
    properties: {
      reply: {
        type: 'string',
        description:
          'Your answer when no data is needed, otherwise a one-line acknowledgement of what you will look up.',
      },
      query: {
        type: 'object',
        additionalProperties: true,
        properties: {
          name: {
            type: 'string',
            enum: DATA_TOOL_NAMES,
            description: 'Name of the query to run — one of the catalogue entries.',
          },
          args: {
            type: 'object',
            additionalProperties: true,
            description: 'Arguments for that query. Omit optional ones you do not need.',
          },
        },
        required: ['name'],
        description: 'Omit (or null) when no data query is required.',
      },
    },
    required: ['reply'],
  },
};

export function dataCatalogueText(): string {
  return catalogueText();
}

// ---------------------------------------------------------------------------
// Validation + execution
// ---------------------------------------------------------------------------
function rowCountOf(data: unknown): number {
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.items)) return obj.items.length;
    if (Array.isArray(obj.rows)) return obj.rows.length;
    if (Array.isArray(obj.fields)) return obj.fields.length;
    if (Array.isArray(obj.data)) return obj.data.length;
    return 1;
  }
  return 0;
}

/** Shrinks a tool result to the prompt budget without losing its shape. */
export function capData(data: unknown, limit = DATA_LIMITS.resultChars): unknown {
  const str = JSON.stringify(data);
  if (!str) return data;
  if (str.length <= limit) return data;

  const shrink = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.slice(0, DATA_LIMITS.maxRows).map(shrink);
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = shrink(v);
      return out;
    }
    if (typeof value === 'string' && value.length > 2000) return `${value.slice(0, 2000)}…`;
    return value;
  };

  const shrunk = JSON.stringify(shrink(data));
  if (shrunk && shrunk.length <= limit) return JSON.parse(shrunk) as unknown;
  return { _truncated: true, preview: shrunk ? shrunk.slice(0, Math.max(0, limit - 30)) : '' };
}

/** Parses `{query:{name,args}}` from the model and runs the matching query. */
export async function executeDataTool(
  payload: unknown,
  ctx: DataToolContext
): Promise<DataToolResult> {
  const envelope = z
    .object({
      query: z.object({
        name: z.string().min(1).max(60),
        args: z.record(z.unknown()).optional(),
      }),
    })
    .safeParse(payload);

  if (!envelope.success) {
    throw new AppError(422, 'AI_MALFORMED_RESPONSE', 'Expected { query: { name, args } }');
  }

  const { name, args } = envelope.data.query;
  const tool = BY_NAME.get(name);
  if (!tool) {
    throw new AppError(422, 'AI_UNKNOWN_TOOL', `Unknown query "${name}"`);
  }
  if (!isRole(ctx.role)) {
    throw new ForbiddenError('Unknown role');
  }
  if (tool.requiredAction && !resolveCapability(tool.requiredAction, ctx.role as Role).allowed) {
    throw new ForbiddenError(`Your role cannot run ${tool.label}`);
  }

  const parsed = tool.args.safeParse(args ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ValidationError(
      `Invalid arguments for ${tool.name}`,
      issue ? [{ path: issue.path.join('.') || '(root)', message: issue.message }] : []
    );
  }

  let data: unknown;
  try {
    data = await tool.run(parsed.data, ctx);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(502, 'AI_QUERY_FAILED', `${tool.label} could not be read right now`);
  }

  return {
    name: tool.name,
    label: tool.label,
    args: parsed.data as Record<string, unknown>,
    data: capData(data),
    rowCount: rowCountOf(data),
  };
}

export function listDataTools(): Array<{ name: string; label: string }> {
  return TOOLS.map((t) => ({ name: t.name, label: t.label }));
}
