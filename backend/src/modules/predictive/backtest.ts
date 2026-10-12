// =============================================================================
// Backtesting + confidence grading.
//
// Walk-forward validation: hold out the tail of the series, fit on the head,
// measure absolute error. MAE / RMSE / MAPE are computed from those folds and
// drive the High / Moderate / Low confidence grade together with data depth
// and gap ratio. Nothing here is probabilistic — same input, same numbers.
// =============================================================================

import type { BacktestStats, ConfidenceLevel } from './predictive.types';
import type { ForecastModel } from './models';

export interface BacktestResult {
  stats: BacktestStats;
  /** Mean absolute error relative to the mean of the actuals (0..1+). */
  maeRatio: number;
}

/** Minimum folds before any non-Insufficient grade can be issued. */
const MIN_FOLDS = 3;

/**
 * Rolling-origin backtest with `folds` hold-outs of `step` periods each.
 * Returns null when the series is too short to produce MIN_FOLDS folds.
 */
export function backtest(
  history: number[],
  model: ForecastModel,
  opts: { folds?: number; step?: number } = {}
): BacktestResult | null {
  const folds = Math.max(1, opts.folds ?? 3);
  const step = Math.max(1, opts.step ?? 1);
  const trainMin = Math.max(model.minPoints, 4);
  const needed = trainMin + folds * step;
  if (history.length < needed) {
    // Try with fewer folds before giving up entirely.
    const affordable = Math.floor((history.length - trainMin) / step);
    if (affordable < 1) return null;
    return backtest(history, model, { folds: affordable, step });
  }

  const absErrors: number[] = [];
  const sqErrors: number[] = [];
  const pctErrors: number[] = [];
  let actualCount = 0;

  for (let f = 0; f < folds; f++) {
    const holdStart = history.length - (folds - f) * step;
    const train = history.slice(0, holdStart);
    if (train.length < trainMin) break;
    const predicted = model.predict(train, step);
    for (let i = 0; i < step; i++) {
      const actual = history[holdStart + i];
      if (actual === undefined) continue;
      const err = predicted[i] - actual;
      absErrors.push(Math.abs(err));
      sqErrors.push(err * err);
      actualCount += 1;
      if (actual !== 0) pctErrors.push(Math.abs(err / actual) * 100);
    }
  }

  if (absErrors.length === 0 || absErrors.length < MIN_FOLDS) return null;

  const mae = absErrors.reduce((a, b) => a + b, 0) / absErrors.length;
  const rmse = Math.sqrt(sqErrors.reduce((a, b) => a + b, 0) / sqErrors.length);
  const mape = pctErrors.length > 0 ? pctErrors.reduce((a, b) => a + b, 0) / pctErrors.length : null;
  const meanActual = history.reduce((a, b) => a + b, 0) / Math.max(1, history.length);

  return {
    stats: { mae: round(mae, 4), rmse: round(rmse, 4), mape: mape === null ? null : round(mape, 2), folds: absErrors.length },
    maeRatio: meanActual > 0 ? round(mae / meanActual, 4) : 1,
  };
}

export interface GradeInput {
  points: number;
  gaps: number;
  backtest: BacktestResult | null;
}

export interface Grade {
  level: Exclude<ConfidenceLevel, 'Insufficient'>;
  reasons: string[];
}

/**
 * Confidence = f(backtest error, data depth, gap ratio).
 *   High     — mae ≤ 10% of mean, ≥ 12 points, ≤ 10% gaps
 *   Moderate — mae ≤ 25% of mean, ≥ 8 points, ≤ 30% gaps
 *   Low      — everything else that is still forecastable
 */
export function gradeConfidence(input: GradeInput): Grade {
  const { points, gaps, backtest } = input;
  const total = points + gaps;
  const gapRatio = total > 0 ? gaps / total : 0;
  const reasons: string[] = [];

  if (!backtest) {
    return { level: 'Low', reasons: ['No backtest folds could be run on this history.'] };
  }

  const { maeRatio } = backtest;
  const mapeTxt = backtest.stats.mape === null ? 'n/a' : `${backtest.stats.mape}%`;

  let level: Grade;
  if (maeRatio <= 0.1 && points >= 12 && gapRatio <= 0.1) {
    level = { level: 'High', reasons: [] };
  } else if (maeRatio <= 0.25 && points >= 8 && gapRatio <= 0.3) {
    level = { level: 'Moderate', reasons: [] };
  } else {
    level = { level: 'Low', reasons: [] };
  }

  reasons.push(
    `Backtest over ${backtest.stats.folds} hold-out fold(s): MAE=${round(backtest.stats.mae, 2)}, RMSE=${round(backtest.stats.rmse, 2)}, MAPE=${mapeTxt}.`
  );
  reasons.push(`${points} observed period(s) with ${gaps} gap(s) (${Math.round(gapRatio * 100)}% missing).`);
  if (maeRatio > 0.1 && level.level !== 'Low') {
    reasons.push('Error is above 10% of the average value, which limits confidence.');
  }
  if (points < 12 && level.level === 'High') reasons.push('History under 12 periods caps confidence at Moderate.');
  if (gapRatio > 0.1 && level.level === 'High') reasons.push('Gaps above 10% cap confidence at Moderate.');

  return { level: level.level, reasons };
}

function round(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}
