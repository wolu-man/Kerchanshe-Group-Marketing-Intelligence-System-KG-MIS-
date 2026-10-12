// =============================================================================
// Predictive service — the one place a PredictiveInsight is produced.
//
// Pipeline: permission → cache → SQL series → gap policy → insufficiency gate
// → backtest-driven model selection → forecast + bands → confidence grade →
// anomalies/signals → audit (compute only) → persist + cache.
//
// Deterministic by construction: no randomness, no LLM in the loop. The same
// request against the same data always returns the same numbers.
// =============================================================================

import sql from 'mssql';
import { db } from '../../db/pool';
import { logger } from '../../config/logger';
import { audit } from '../../db/audit';
import { ForbiddenError } from '../../utils/errors';
import { resolveCapability, type Role } from '../../security/permissions';
import type { DataScope } from '../../utils/scope';
import {
  MIN_FORECAST_POINTS,
  INSUFFICIENT_NOTICE,
  PREDICTIVE_MODULES,
  type AnomalyPoint,
  type ConfidenceLevel,
  type ForecastPoint,
  type Granularity,
  type PredictiveCard,
  type PredictiveInsight,
  type PredictiveRequest,
  type PredictiveSummary,
  type RiskOpportunity,
  type SeriesPoint,
} from './predictive.types';
import { backtest, gradeConfidence, type BacktestResult } from './backtest';
import { candidateModels, type ForecastModel } from './models';
import { classifySignals, detectAnomalies } from './anomaly';
import { enumeratePeriods, historyStart, resolveMetric, shiftPeriod, type MetricDef } from './series';
import { buildCacheKey, clearCache, getCached, setCached } from './cache';

export interface PredictiveAccess {
  userId: number;
  role: Role;
  dataScope: DataScope;
}

export type PredictiveSource = 'endpoint' | 'tool' | 'cron';

const DEFAULT_HORIZON: Record<Granularity, number> = { month: 3, week: 4, day: 7 };

/** Prediction toggle (prediction.enabled=1) — cron honours it, on-demand does not. */
export async function predictionsEnabled(): Promise<boolean> {
  try {
    const row = await db.request().input('Key', sql.VarChar(100), 'prediction.enabled').query(
      `SELECT ConfigValue FROM dbo.SystemConfig WHERE ConfigKey = @Key`
    );
    const v = String(row.recordset[0]?.ConfigValue ?? '1');
    return v === '1' || v.toLowerCase() === 'true';
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
export async function getPredictions(
  req: PredictiveRequest,
  access: PredictiveAccess,
  source: PredictiveSource = 'endpoint'
): Promise<PredictiveInsight> {
  const def = resolveMetric(req.module, req.metric);
  if (def.requiredAction && !resolveCapability(def.requiredAction, access.role).allowed) {
    throw new ForbiddenError(`Your role cannot read ${def.label.toLowerCase()} predictions`);
  }

  const granularity: Granularity = req.granularity ?? def.granularityDefault;
  const horizon = req.horizon ?? DEFAULT_HORIZON[granularity];

  const cacheKey = buildCacheKey({
    module: req.module,
    metric: def.metric,
    granularity,
    horizon,
    dataScope: access.dataScope,
    userId: access.userId,
    ...(req.regionId ? { regionId: req.regionId } : {}),
    ...(req.productId ? { productId: req.productId } : {}),
    ...(req.colorId ? { colorId: req.colorId } : {}),
    ...(req.formId ? { formId: req.formId } : {}),
  });

  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const insight = await computeInsight(req, def, granularity, horizon, access, source, cacheKey);
  await setCached(cacheKey, insight);
  return insight;
}

// ---------------------------------------------------------------------------
// Compute
// ---------------------------------------------------------------------------
async function computeInsight(
  req: PredictiveRequest,
  def: MetricDef,
  granularity: Granularity,
  horizon: number,
  access: PredictiveAccess,
  source: PredictiveSource,
  cacheKey: string
): Promise<PredictiveInsight> {
  const observed = await def.load({
    granularity,
    dataScope: access.dataScope,
    userId: access.userId,
    ...(req.regionId ? { regionId: req.regionId } : {}),
    ...(req.productId ? { productId: req.productId } : {}),
    ...(req.colorId ? { colorId: req.colorId } : {}),
    ...(req.formId ? { formId: req.formId } : {}),
    from: historyStart(granularity),
  });

  const { series, gaps, dataGaps } = buildSeries(observed, granularity, def.fillZeros);
  const first = series[0]?.period ?? '';
  const last = series[series.length - 1]?.period ?? '';
  const points = series.length;

  let model = 'none';
  let modelVersion = 'v1';
  let confidence: ConfidenceLevel = 'Insufficient';
  let reasons: string[] = [];
  let forecast: ForecastPoint[] = [];
  let backtestStats: PredictiveInsight['backtest'] = null;
  let notice: string | null = INSUFFICIENT_NOTICE;

  if (points >= MIN_FORECAST_POINTS) {
    const history = series.map((p) => p.value);
    const selection = selectModel(history, granularity);
    const predicted = selection.model.predict(history, horizon);

    forecast = predicted.map((value, i) => {
      const v = round2(Math.max(0, value));
      const band =
        selection.backtest && selection.backtest.stats.rmse > 0
          ? round2(selection.backtest.stats.rmse * Math.sqrt(i + 1))
          : 0;
      return {
        period: shiftPeriod(last, granularity, i + 1),
        value: v,
        lower: round2(Math.max(0, v - band)),
        upper: round2(v + band),
      };
    });

    const grade = gradeConfidence({
      points,
      gaps,
      backtest: selection.backtest,
    });
    confidence = grade.level;
    reasons = grade.reasons;
    backtestStats = selection.backtest ? selection.backtest.stats : null;
    model = selection.model.label;
    modelVersion = selection.model.version;
    notice = null;
  } else {
    reasons = [
      `Only ${points} observed period(s) — at least ${MIN_FORECAST_POINTS} are required before any forecast is emitted.`,
    ];
  }

  const anomalies: AnomalyPoint[] = detectAnomalies(series);
  const signals: RiskOpportunity[] = classifySignals({
    series,
    forecast,
    lastActual: series[series.length - 1]?.value ?? 0,
  });

  const insight: PredictiveInsight = {
    module: req.module,
    metric: def.metric,
    label: def.label,
    unit: def.unit,
    granularity,
    horizon,
    model,
    modelVersion,
    confidence,
    confidenceReasons: reasons,
    sufficientData: confidence !== 'Insufficient',
    notice,
    historyWindow: { from: first, to: last, points, gaps },
    series,
    forecast,
    backtest: backtestStats,
    anomalies,
    signals,
    dataGaps,
    generatedAt: new Date().toISOString(),
  };

  const detail = {
    module: req.module,
    metric: def.metric,
    granularity,
    horizon,
    model,
    confidence,
    sufficientData: insight.sufficientData,
    source,
    cached: false,
    points,
  };
  await audit({
    userId: access.userId,
    action: insight.sufficientData ? 'AI_PREDICTION_GENERATED' : 'AI_PREDICTION_INSUFFICIENT',
    entity: 'PredictiveInsight',
    detail,
  });
  await persistInsight(insight, cacheKey, access.userId);

  if (source === 'cron') {
    logger.info('Prediction refreshed by cron', { module: req.module, metric: def.metric, confidence });
  }
  return insight;
}

// ---------------------------------------------------------------------------
// Dashboard summary — one card per readable module, built from the same
// pipeline (so cards and POST /predictive can never disagree).
// ---------------------------------------------------------------------------
async function toCard(req: PredictiveRequest, access: PredictiveAccess, source: PredictiveSource = 'endpoint'): Promise<PredictiveCard> {
  const insight = await getPredictions(req, access, source);
  const last = insight.series[insight.series.length - 1];
  const prev = insight.series[insight.series.length - 2];
  return {
    module: insight.module,
    metric: insight.metric,
    label: insight.label,
    unit: insight.unit,
    granularity: insight.granularity,
    confidence: insight.confidence,
    sufficientData: insight.sufficientData,
    notice: insight.notice,
    model: insight.model,
    latest: { period: last?.period ?? '', value: last?.value ?? 0 },
    changePct: last && prev && prev.value !== 0 ? round2(((last.value - prev.value) / Math.abs(prev.value)) * 100) : null,
    next: insight.forecast[0] ?? null,
    anomalies: insight.anomalies.length,
    signals: insight.signals,
    generatedAt: insight.generatedAt,
  };
}

/**
 * Cards for every module the caller's role may read. Modules without the
 * required capability are reported as `unavailable` instead of failing the
 * whole grid; unreadable metrics never leak through.
 */
export async function getPredictiveSummary(access: PredictiveAccess): Promise<PredictiveSummary> {
  const cards: PredictiveCard[] = [];
  const unavailable: string[] = [];

  for (const module of PREDICTIVE_MODULES) {
    let def;
    try {
      def = resolveMetric(module);
    } catch {
      unavailable.push(module);
      continue;
    }
    if (def.requiredAction && !resolveCapability(def.requiredAction, access.role).allowed) {
      unavailable.push(module);
      continue;
    }
    try {
      cards.push(await toCard({ module }, access));
    } catch (err) {
      logger.warn('Predictive summary card failed', { module, error: (err as Error).message });
      unavailable.push(module);
    }
  }

  return { generatedAt: new Date().toISOString(), cards, unavailable };
}

// ---------------------------------------------------------------------------
// Nightly refresh + retention (cron)
// ---------------------------------------------------------------------------
/** System access used by the nightly refresh: full scope, no personal bias. */
const CRON_ACCESS: PredictiveAccess = { userId: 1, role: 'Administrator', dataScope: 'all' };

/** Drops expired rows, then everything beyond `prediction.retentionDays` (90). */
export async function purgeExpiredInsights(): Promise<{ expired: number; retained: number }> {
  const expiredResult = await db.request().query(
    `DELETE FROM dbo.PredictiveInsight WHERE ExpiresAt < SYSUTCDATETIME()`
  );
  const days = await configDays('prediction.retentionDays', 90);
  const retainedResult = await db.request().input('Days', sql.Int, days).query(
    `DELETE FROM dbo.PredictiveInsight WHERE GeneratedAt < DATEADD(day, -@Days, SYSUTCDATETIME())`
  );
  return { expired: expiredResult.rowsAffected[0] ?? 0, retained: retainedResult.rowsAffected[0] ?? 0 };
}

/**
 * Nightly refresh: recompute every card as the cron principal so tomorrow's
 * dashboard opens on fresh numbers (and fresh audit rows tagged source=cron).
 * Honours prediction.enabled — the config kill-switch for the whole feature.
 */
export async function refreshPredictions(): Promise<{ refreshed: number; failed: number }> {
  if (!(await predictionsEnabled())) {
    logger.info('Prediction refresh skipped — prediction.enabled=0');
    return { refreshed: 0, failed: 0 };
  }

  let refreshed = 0;
  let failed = 0;
  // The in-memory TTL cache would otherwise serve yesterday's numbers back.
  clearCache();
  for (const module of PREDICTIVE_MODULES) {
    try {
      await getPredictions({ module }, CRON_ACCESS, 'cron');
      refreshed += 1;
    } catch (err) {
      failed += 1;
      logger.warn('Nightly prediction refresh failed', { module, error: (err as Error).message });
    }
  }
  return { refreshed, failed };
}

async function configDays(key: string, fallback: number): Promise<number> {
  try {
    const row = await db.request().input('Key', sql.VarChar(100), key).query(
      `SELECT ConfigValue FROM dbo.SystemConfig WHERE ConfigKey = @Key`
    );
    const n = Number(row.recordset[0]?.ConfigValue);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Model selection: lowest backtest MAE wins, ties go to registration order.
// ---------------------------------------------------------------------------
function selectModel(
  history: number[],
  granularity: Granularity
): { model: ForecastModel; backtest: BacktestResult | null } {
  let best: { model: ForecastModel; backtest: BacktestResult } | null = null;
  for (const model of candidateModels(granularity)) {
    if (history.length < model.minPoints) continue;
    const result = backtest(history, model);
    if (!result) continue;
    if (!best || result.stats.mae < best.backtest.stats.mae) {
      best = { model, backtest: result };
    }
  }
  if (best) return best;
  // Defensive fallback (unreachable while the candidate pool covers short
  // series): naive on whatever history exists.
  const fallback = candidateModels(granularity)[0];
  return { model: fallback, backtest: null };
}

// ---------------------------------------------------------------------------
// Gap policy
//   interior gaps — counts/sums fill with 0 (no events that period is real
//                   data); averages never fill, the missing value is unknown;
//   trailing gaps — never filled, reported as a data-gap note instead, so a
//                   stale feed cannot silently look like a healthy zero.
// ---------------------------------------------------------------------------
function buildSeries(
  observed: SeriesPoint[],
  granularity: Granularity,
  fillZeros: boolean
): { series: SeriesPoint[]; gaps: number; dataGaps: string[] } {
  const sorted = [...observed]
    .filter((p) => p.period)
    .sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0))
    .map((p) => ({ period: p.period, value: round2(p.value) }));

  const dataGaps: string[] = [];
  if (sorted.length === 0) {
    return { series: [], gaps: 0, dataGaps: ['No recorded history for this selection.'] };
  }

  const seen = new Set(sorted.map((p) => p.period));
  const full = enumeratePeriods(sorted[0].period, sorted[sorted.length - 1].period, granularity);
  const missing = full.filter((p) => !seen.has(p));

  let series = sorted;
  if (missing.length > 0 && fillZeros) {
    const byPeriod = new Map(sorted.map((p) => [p.period, p]));
    series = full.map((p) => byPeriod.get(p) ?? { period: p, value: 0 });
  }
  if (missing.length > 0) {
    dataGaps.push(
      `${missing.length} period(s) inside the history window have no recorded value (${missing
        .slice(0, 3)
        .join(', ')}${missing.length > 3 ? ', …' : ''}).`
    );
  }

  // Trailing staleness — note only, never zero-filled.
  const lastObserved = sorted[sorted.length - 1].period;
  const current = currentPeriod(granularity);
  if (lastObserved < current) {
    const lag = enumeratePeriods(lastObserved, current, granularity).length - 1;
    dataGaps.push(`Latest recorded period is ${lastObserved}; ${lag} period(s) behind the current one (${current}).`);
  }

  return { series, gaps: missing.length, dataGaps: dataGaps.slice(0, 10) };
}

/** Period label that contains "now" for the given granularity (UTC). */
function currentPeriod(g: Granularity): string {
  const now = new Date();
  if (g === 'month') return now.toISOString().slice(0, 7);
  const day = new Date(now.getTime() - now.getUTCDay() * 86_400_000 + 86_400_000); // Monday (UTC)
  if (g === 'week') return day.toISOString().slice(0, 10);
  return now.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Persistence (latest row per cache key; best-effort like the audit write)
// ---------------------------------------------------------------------------
async function persistInsight(insight: PredictiveInsight, scopeKey: string, userId: number): Promise<void> {
  try {
    const request = db.request();
    request
      .input('ScopeKey', sql.VarChar(200), scopeKey)
      .input('Module', sql.VarChar(40), insight.module)
      .input('Metric', sql.VarChar(60), insight.metric)
      .input('Granularity', sql.VarChar(10), insight.granularity)
      .input('Horizon', sql.Int, insight.horizon)
      .input('Confidence', sql.VarChar(20), insight.confidence)
      .input('SufficientData', sql.Bit, insight.sufficientData)
      .input('Model', sql.VarChar(80), insight.model)
      .input('ModelVersion', sql.VarChar(40), insight.modelVersion)
      .input('ResultJson', sql.NVarChar(sql.MAX), JSON.stringify(insight))
      .input('UserId', sql.Int, userId);
    await request.query(
      `DELETE FROM dbo.PredictiveInsight WHERE ScopeKey = @ScopeKey
       INSERT INTO dbo.PredictiveInsight
         (ScopeKey, Module, Metric, Granularity, Horizon, Confidence, SufficientData,
          Model, ModelVersion, ResultJson, GeneratedAt, ExpiresAt, CreatedBy)
       VALUES
         (@ScopeKey, @Module, @Metric, @Granularity, @Horizon, @Confidence, @SufficientData,
          @Model, @ModelVersion, @ResultJson, SYSUTCDATETIME(),
          DATEADD(day, 90, SYSUTCDATETIME()), @UserId)`
    );
  } catch (err) {
    logger.error('Predictive insight persist failed', { error: (err as Error).message });
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
