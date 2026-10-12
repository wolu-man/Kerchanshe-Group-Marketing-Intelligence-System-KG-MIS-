// =============================================================================
// Deterministic forecasting models — pure functions over number[].
//
// No dependencies, no randomness, no LLM: given the same series the output is
// always identical. Each model follows a fixed interface so the backtester can
// compare them and the registry can version them.
// =============================================================================

export interface ForecastModel {
  key: string;
  label: string;
  /** Fixed version string embedded in every insight for auditability. */
  version: string;
  /** Minimum points this model needs to run at all. */
  minPoints: number;
  /** Season length (periods) for seasonal models; null = non-seasonal. */
  season: number | null;
  /** Produce `horizon` future values from `history` (oldest → newest). */
  predict: (history: number[], horizon: number) => number[];
}

const clampNonNegative = (v: number): number => (Number.isFinite(v) ? Math.max(0, v) : 0);

/** Persistence / last observed value repeated into the future. */
export const naiveModel: ForecastModel = {
  key: 'naive',
  label: 'Naive (last value)',
  version: 'v1',
  minPoints: 2,
  season: null,
  predict: (history, horizon) => {
    const last = history[history.length - 1] ?? 0;
    return Array.from({ length: horizon }, () => last);
  },
};

/** Mean of the most recent `window` observations, repeated. */
export function movingAverageModel(window: number): ForecastModel {
  return {
    key: `sma-${window}`,
    label: `Moving average (${window})`,
    version: 'v1',
    minPoints: window + 1,
    season: null,
    predict: (history, horizon) => {
      const slice = history.slice(-window);
      const mean = slice.reduce((a, b) => a + b, 0) / Math.max(1, slice.length);
      return Array.from({ length: horizon }, () => mean);
    },
  };
}

/** Linear (least-squares) trend extrapolation. */
export const trendModel: ForecastModel = {
  key: 'linear-trend',
  label: 'Linear trend',
  version: 'v1',
  minPoints: 4,
  season: null,
  predict: (history, horizon) => {
    const n = history.length;
    if (n === 0) return Array.from({ length: horizon }, () => 0);
    if (n === 1) return Array.from({ length: horizon }, () => history[0]);
    // least squares over x = 0..n-1
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += history[i];
      sumXY += i * history[i];
      sumXX += i * i;
    }
    const denom = n * sumXX - sumX * sumX;
    const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    return Array.from({ length: horizon }, (_, k) => clampNonNegative(intercept + slope * (n + k)));
  },
};

/**
 * Seasonal naive: repeats the value from `season` periods ago.
 * Produces a seasonal cycle by copy — no curve fitting, fully auditable.
 */
export function seasonalNaiveModel(season: number): ForecastModel {
  return {
    key: `seasonal-naive-${season}`,
    label: `Seasonal naive (${season})`,
    version: 'v1',
    minPoints: season * 2,
    season,
    predict: (history, horizon) => {
      const out: number[] = [];
      const work = [...history];
      for (let k = 0; k < horizon; k++) {
        const idx = work.length - season;
        const v = idx >= 0 ? work[idx] : (work[work.length - 1] ?? 0);
        out.push(v);
        work.push(v);
      }
      return out;
    },
  };
}

/**
 * Holt's linear exponential smoothing (level + trend) with fixed
 * alpha/beta — deterministic, standard, and explainable in one sentence.
 */
export function holtModel(alpha = 0.4, beta = 0.2): ForecastModel {
  return {
    key: `holt-${alpha}-${beta}`,
    label: `Holt linear (α=${alpha}, β=${beta})`,
    version: 'v1',
    minPoints: 4,
    season: null,
    predict: (history, horizon) => {
      if (history.length === 0) return Array.from({ length: horizon }, () => 0);
      let level = history[0];
      let trend = history.length > 1 ? history[1] - history[0] : 0;
      for (let i = 1; i < history.length; i++) {
        const prevLevel = level;
        level = alpha * history[i] + (1 - alpha) * (level + trend);
        trend = beta * (level - prevLevel) + (1 - beta) * trend;
      }
      return Array.from({ length: horizon }, (_, k) => clampNonNegative(level + (k + 1) * trend));
    },
  };
}

/**
 * Candidate pool offered to the backtester for a given granularity/season.
 * Order matters: ties are resolved in registration order (simpler first).
 */
export function candidateModels(granularity: 'day' | 'week' | 'month'): ForecastModel[] {
  const season = granularity === 'month' ? 12 : granularity === 'week' ? 4 : 7;
  return [
    naiveModel,
    movingAverageModel(granularity === 'month' ? 3 : 2),
    trendModel,
    holtModel(),
    seasonalNaiveModel(season),
  ];
}
