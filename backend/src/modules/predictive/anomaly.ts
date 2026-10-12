// =============================================================================
// Anomaly detection + risk/opportunity signals.
//
// Deterministic statistics only:
//   anomalies — modified z-score on median absolute deviation (MAD), the same
//               family of test already used by forms/anomaly.service.ts;
//   signals   — rule-based trend/risk/opportunity classification written as
//               explicit, auditable thresholds (no model in the loop).
// =============================================================================

import type { AnomalyPoint, RiskOpportunity, SeriesPoint } from './predictive.types';

const Z_HIGH = 3.5; // modified z-score "outlier" convention
const Z_MEDIUM = 2.5;

/** Median of a numeric sample (does not mutate the input). */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Modified z-score per point: 0.6745 * (x - median) / MAD.
 * Falls back to the mean/absolute-deviation formula when MAD is 0
 * (many identical values), and returns [] when fewer than 5 points exist.
 */
export function detectAnomalies(series: SeriesPoint[]): AnomalyPoint[] {
  if (series.length < 5) return [];
  const values = series.map((p) => p.value);
  const med = median(values);
  const absDevs = values.map((v) => Math.abs(v - med));
  const mad = median(absDevs);

  const out: AnomalyPoint[] = [];
  for (const point of series) {
    let z: number;
    if (mad > 0) {
      z = (0.6745 * (point.value - med)) / mad;
    } else {
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
      if (sd === 0) continue;
      z = (point.value - mean) / sd;
    }
    if (Math.abs(z) >= Z_HIGH) {
      out.push({
        period: point.period,
        value: point.value,
        zScore: Math.round(z * 100) / 100,
        direction: z >= 0 ? 'high' : 'low',
        severity: Math.abs(z) >= 5 ? 'high' : Math.abs(z) >= Z_MEDIUM ? 'medium' : 'low',
      });
    }
  }
  return out;
}

export interface SignalInput {
  series: SeriesPoint[];
  /** May be empty when data was insufficient — rules then use the series only. */
  forecast: Array<{ period: string; value: number }>;
  /** Last observed value of the full series. */
  lastActual: number;
}

/**
 * Rule-based risk/opportunity classification. Thresholds are deliberate and
 * stable: 10% period-over-period moves, 3-period streaks, anomaly severity.
 */
export function classifySignals(input: SignalInput): RiskOpportunity[] {
  const { series, forecast, lastActual } = input;
  const signals: RiskOpportunity[] = [];
  if (series.length >= 2) {
    const prev = series[series.length - 2].value;
    const changePct = prev > 0 ? ((lastActual - prev) / prev) * 100 : 0;

    if (changePct <= -10) {
      signals.push({
        kind: 'risk',
        code: 'RecentDecline',
        message: `Latest period is down ${Math.abs(round1(changePct))}% versus the previous period.`,
        severity: changePct <= -25 ? 'high' : 'medium',
      });
    } else if (changePct >= 10) {
      signals.push({
        kind: 'opportunity',
        code: 'RecentGrowth',
        message: `Latest period is up ${round1(changePct)}% versus the previous period.`,
        severity: changePct >= 25 ? 'high' : 'medium',
      });
    }

    // 3-period streaks
    const last3 = series.slice(-3);
    if (last3.length === 3) {
      const [a, b, c] = last3.map((p) => p.value);
      if (c < b && b < a && a > 0 && (a - c) / a >= 0.1) {
        signals.push({
          kind: 'risk',
          code: 'DeclineStreak',
          message: `Three consecutive periods of decline (−${round1(((a - c) / a) * 100)}% overall).`,
          severity: 'high',
        });
      } else if (c > b && b > a && a > 0 && (c - a) / a >= 0.1) {
        signals.push({
          kind: 'opportunity',
          code: 'GrowthStreak',
          message: `Three consecutive periods of growth (+${round1(((c - a) / a) * 100)}% overall).`,
          severity: 'medium',
        });
      }
    }
  }

  // Forecast-driven outlook vs the last actual
  if (forecast.length > 0 && lastActual > 0) {
    const peak = Math.max(...forecast.map((f) => f.value));
    const trough = Math.min(...forecast.map((f) => f.value));
    const upside = ((peak - lastActual) / lastActual) * 100;
    const downside = ((trough - lastActual) / lastActual) * 100;
    if (upside >= 10) {
      signals.push({
        kind: 'opportunity',
        code: 'ForecastUpside',
        message: `Forecast peak is +${round1(upside)}% above the latest observed value.`,
        severity: upside >= 25 ? 'high' : 'medium',
      });
    }
    if (downside <= -10) {
      signals.push({
        kind: 'risk',
        code: 'ForecastDownside',
        message: `Forecast trough is ${round1(downside)}% below the latest observed value.`,
        severity: downside <= -25 ? 'high' : 'medium',
      });
    }
  }

  return signals;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
