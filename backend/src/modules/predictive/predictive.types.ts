// =============================================================================
// Predictive Insights — shared contract (schemas + types).
//
// EVERY number in a PredictiveInsight is computed deterministically by the
// server (statistical models below, never an LLM). The model may only
// interpret and narrate values that already exist in this structure.
// =============================================================================

import { z } from 'zod';

export const PREDICTIVE_MODULES = [
  'sales',
  'weeklySales',
  'kpi',
  'competitorPrice',
  'pricing',
  'products',
  'customers',
  'surveys',
  'interviews',
  'visits',
  'multimedia',
] as const;
export type PredictiveModule = (typeof PREDICTIVE_MODULES)[number];

export const GRANULARITIES = ['day', 'week', 'month'] as const;
export type Granularity = (typeof GRANULARITIES)[number];

export const CONFIDENCE_LEVELS = ['High', 'Moderate', 'Low', 'Insufficient'] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

/** Shown whenever history is too thin to forecast honestly. */
export const INSUFFICIENT_NOTICE = 'Insufficient historical data for reliable prediction.';

/** Minimum observed periods before ANY forecast is emitted. */
export const MIN_FORECAST_POINTS = 8;

/** Upper bound of history periods loaded per granularity. */
export const MAX_HISTORY: Record<Granularity, number> = { day: 400, week: 160, month: 48 };

export interface SeriesPoint {
  /** period label: 'YYYY-MM' (month) | 'YYYY-MM-DD' (day, week starts Monday) */
  period: string;
  value: number;
}

export interface ForecastPoint {
  period: string;
  value: number;
  lower: number;
  upper: number;
}

export interface AnomalyPoint {
  period: string;
  value: number;
  /** Modified z-score (MAD based). */
  zScore: number;
  direction: 'high' | 'low';
  severity: 'low' | 'medium' | 'high';
}

export interface RiskOpportunity {
  kind: 'risk' | 'opportunity';
  code: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
}

export interface BacktestStats {
  mae: number;
  rmse: number;
  /** null when every actual in the folds was 0. */
  mape: number | null;
  folds: number;
}

export const seriesPointSchema = z.object({
  period: z.string().max(20),
  value: z.number().finite(),
});

export const forecastPointSchema = z.object({
  period: z.string().max(20),
  value: z.number().finite(),
  lower: z.number().finite(),
  upper: z.number().finite(),
});

export const backtestStatsSchema = z.object({
  mae: z.number().nonnegative(),
  rmse: z.number().nonnegative(),
  mape: z.number().nonnegative().nullable(),
  folds: z.number().int().nonnegative(),
});

export const anomalyPointSchema = z.object({
  period: z.string().max(20),
  value: z.number().finite(),
  zScore: z.number().finite(),
  direction: z.enum(['high', 'low']),
  severity: z.enum(['low', 'medium', 'high']),
});

export const riskOpportunitySchema = z.object({
  kind: z.enum(['risk', 'opportunity']),
  code: z.string().max(60),
  message: z.string().max(400),
  severity: z.enum(['low', 'medium', 'high']),
});

/** The standardized shape every module returns (docs §Predictive Insights). */
export const predictiveInsightSchema = z.object({
  module: z.enum(PREDICTIVE_MODULES),
  metric: z.string().max(60),
  label: z.string().max(120),
  unit: z.enum(['currency', 'count', 'percent']),
  granularity: z.enum(GRANULARITIES),
  horizon: z.number().int().min(1).max(12),
  model: z.string().max(80),
  modelVersion: z.string().max(40),
  confidence: z.enum(CONFIDENCE_LEVELS),
  confidenceReasons: z.array(z.string().max(300)).max(10),
  sufficientData: z.boolean(),
  notice: z.string().max(300).nullable(),
  historyWindow: z.object({
    from: z.string().max(20),
    to: z.string().max(20),
    points: z.number().int().nonnegative(),
    gaps: z.number().int().nonnegative(),
  }),
  series: z.array(seriesPointSchema).max(500),
  forecast: z.array(forecastPointSchema).max(12),
  backtest: backtestStatsSchema.nullable(),
  anomalies: z.array(anomalyPointSchema).max(50),
  signals: z.array(riskOpportunitySchema).max(20),
  dataGaps: z.array(z.string().max(300)).max(10),
  generatedAt: z.string().max(40),
});

export type PredictiveInsight = z.infer<typeof predictiveInsightSchema>;

/**
 * Compact card for a dashboard grid — everything the shell needs to render one
 * tile without shipping the full series (the full insight stays one call away).
 */
export const predictiveCardSchema = z.object({
  module: z.enum(PREDICTIVE_MODULES),
  metric: z.string().max(60),
  label: z.string().max(120),
  unit: z.enum(['currency', 'count', 'percent']),
  granularity: z.enum(GRANULARITIES),
  confidence: z.enum(CONFIDENCE_LEVELS),
  sufficientData: z.boolean(),
  notice: z.string().max(300).nullable(),
  model: z.string().max(80),
  /** Last observed period + value. */
  latest: z.object({ period: z.string().max(20), value: z.number().finite() }),
  /** Change of the last observation against the one before it (null if < 2 points). */
  changePct: z.number().finite().nullable(),
  /** Next projected period (forecast[0]); null when data is insufficient. */
  next: forecastPointSchema.nullable(),
  anomalies: z.number().int().nonnegative(),
  signals: z.array(riskOpportunitySchema).max(20),
  generatedAt: z.string().max(40),
});

export type PredictiveCard = z.infer<typeof predictiveCardSchema>;

/** GET /api/v1/ai/predictive/summary payload. */
export const predictiveSummarySchema = z.object({
  generatedAt: z.string().max(40),
  cards: z.array(predictiveCardSchema),
  /** Modules skipped because the caller's role cannot read them. */
  unavailable: z.array(z.string().max(40)),
});

export type PredictiveSummary = z.infer<typeof predictiveSummarySchema>;

/** Request accepted by POST /api/v1/ai/predictive (and the PREDICT tools). */
export const predictiveRequestSchema = z.object({
  module: z.enum(PREDICTIVE_MODULES),
  /** Defaults to the module's primary metric. */
  metric: z.string().max(60).optional(),
  granularity: z.enum(GRANULARITIES).optional(),
  horizon: z.number().int().min(1).max(12).optional(),
  regionId: z.number().int().positive().optional(),
  productId: z.number().int().positive().optional(),
  colorId: z.number().int().positive().optional(),
  formId: z.number().int().positive().optional(),
});

export type PredictiveRequest = z.infer<typeof predictiveRequestSchema>;
