// =============================================================================
// Predictive insights — verification script (no test framework in this repo).
//
//   npx tsx scripts/test-predictive.ts            A+B (pure) + C when DB/HTTP up
//   npx tsx scripts/test-predictive.ts --live     also D: real endpoint calls
//
//   A. Model math                — pure, deterministic numbers
//   B. Backtest + confidence     — folds, grades, gates
//   C. Service + persistence     — DB reachable: insight shape, cache, audit
//   D. HTTP surface (--live)     — 401/403/200 + payload conformance
//
// Sections skip gracefully when the API / database is not reachable.
// =============================================================================

import * as http from 'http';
import {
  candidateModels,
  holtModel,
  movingAverageModel,
  naiveModel,
  seasonalNaiveModel,
  trendModel,
} from '../src/modules/predictive/models';
import { backtest, gradeConfidence } from '../src/modules/predictive/backtest';
import { classifySignals, detectAnomalies, median } from '../src/modules/predictive/anomaly';
import {
  buildCacheKey,
  cacheSize,
  clearCache,
} from '../src/modules/predictive/cache';
import {
  CONFIDENCE_LEVELS,
  INSUFFICIENT_NOTICE,
  MIN_FORECAST_POINTS,
  PREDICTIVE_MODULES,
  predictiveInsightSchema,
  type SeriesPoint,
} from '../src/modules/predictive/predictive.types';
import { enumeratePeriods, historyStart, resolveMetric, shiftPeriod } from '../src/modules/predictive/series';
import { getPredictions } from '../src/modules/predictive/predictive.service';
import { resolveCapability } from '../src/security/permissions';
import { ForbiddenError } from '../src/utils/errors';

// ---------------------------------------------------------------------------
// Tiny test harness (same shape as the other scripts)
// ---------------------------------------------------------------------------
let passed = 0;
const failures: string[] = [];

function check(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failures.push(`${name}: ${message}`);
    console.log(`  FAIL ${name} — ${message}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function equal(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  }
}

async function checkAsync(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failures.push(`${name}: ${message}`);
    console.log(`  FAIL ${name} — ${message}`);
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

// ---------------------------------------------------------------------------
// A. Model math (pure)
// ---------------------------------------------------------------------------
function sectionA(): void {
  console.log('\nA. Model math');

  check('naive repeats the last observed value', () => {
    const out = naiveModel.predict([10, 12, 9], 3);
    equal(out, [9, 9, 9], 'naive forecast');
  });

  check('moving average averages the trailing window', () => {
    const out = movingAverageModel(3).predict([3, 6, 9], 2);
    equal(out, [6, 6], 'ma(3) forecast');
    equal(movingAverageModel(3).predict([1, 2], 1), [1.5], 'ma on short window');
  });

  check('linear trend extrapolates a perfect line exactly', () => {
    const history = [10, 20, 30, 40, 50];
    const out = trendModel.predict(history, 2);
    equal(out.map(round2), [60, 70], 'trend forecast');
  });

  check('trend never emits a negative value', () => {
    const out = trendModel.predict([50, 40, 30, 20], 4);
    assert(out.every((v) => v >= 0), `negative forecast ${JSON.stringify(out)}`);
  });

  check('seasonal naive repeats the value from one season back', () => {
    const m = seasonalNaiveModel(4);
    const out = m.predict([1, 2, 3, 4, 5, 6, 7, 8], 4);
    equal(out, [5, 6, 7, 8], 'season-4 cycle');
  });

  check('holt is deterministic and non-negative', () => {
    const h = holtModel(0.4, 0.2);
    const history = [100, 110, 121, 133, 146];
    const a = h.predict(history, 3);
    const b = h.predict(history, 3);
    equal(a, b, 'same input, same output');
    assert(a.every((v) => Number.isFinite(v) && v >= 0), 'finite non-negative');
  });

  check('candidate pool is stable and registered simplest-first', () => {
    const keys = candidateModels('month').map((m) => m.key);
    equal(keys, ['naive', 'sma-3', 'linear-trend', 'holt-0.4-0.2', 'seasonal-naive-12'], 'month candidates');
    equal(candidateModels('week')[1].key, 'sma-2', 'week moving average window');
    equal(candidateModels('day').length, 5, 'day candidates');
  });

  check('every model declares a version for auditability', () => {
    for (const g of ['day', 'week', 'month'] as const) {
      for (const m of candidateModels(g)) {
        assert(m.version.startsWith('v'), `${m.key} missing version`);
        assert(m.minPoints >= 2, `${m.key} minPoints`);
      }
    }
  });

  check('period helpers walk month/week/day labels', () => {
    equal(shiftPeriod('2026-01', 'month', 1), '2026-02', 'month +1');
    equal(shiftPeriod('2026-01', 'month', -1), '2025-12', 'month -1');
    equal(shiftPeriod('2026-12', 'month', 3), '2027-03', 'month across year');
    equal(shiftPeriod('2026-09-30', 'day', 1), '2026-10-01', 'day +1');
    equal(enumeratePeriods('2026-01', '2026-04', 'month'), ['2026-01', '2026-02', '2026-03', '2026-04'], 'month range');
    assert(historyStart('month') <= new Date().toISOString().slice(0, 7), 'month lookback in the past');
    assert(historyStart('day') <= new Date().toISOString().slice(0, 10), 'day lookback in the past');
  });

  check('cache keys are stable and scoped per scope/user/filters', () => {
    const base = { module: 'sales', metric: 'revenue', granularity: 'month', horizon: 3, dataScope: 'all' as const, userId: 1 };
    equal(buildCacheKey(base), buildCacheKey({ ...base }), 'deterministic key');
    // all-scope results are identical for every all-scope reader → shared key.
    equal(buildCacheKey(base), buildCacheKey({ ...base, userId: 2 }), 'all-scope results are shared');
    const own = { ...base, dataScope: 'own' as const };
    assert(buildCacheKey(own) !== buildCacheKey({ ...own, userId: 2 }), 'own-scope results are per-user');
    assert(buildCacheKey(base) !== buildCacheKey({ ...base, dataScope: 'region' }), 'scope-scoped');
    assert(buildCacheKey(base) !== buildCacheKey({ ...base, regionId: 5 }), 'filter-scoped');
    assert(buildCacheKey(base) !== buildCacheKey({ ...base, horizon: 4 }), 'horizon-scoped');
    assert(buildCacheKey(base) !== buildCacheKey({ ...base, metric: 'quantity' }), 'metric-scoped');
  });

  check('metric resolution: defaults, aliases and unknown-metric guard', () => {
    equal(resolveMetric('sales').metric, 'revenue', 'sales default metric');
    equal(resolveMetric('weeklySales').granularityDefault, 'week', 'weekly default granularity');
    equal(resolveMetric('kpi', 'achievement').metric, 'achievement', 'explicit metric');
    let threw = false;
    try {
      resolveMetric('sales', 'nonsense-metric');
    } catch {
      threw = true;
    }
    assert(threw, 'unknown metric must throw');
    for (const m of PREDICTIVE_MODULES) resolveMetric(m);
  });
}

// ---------------------------------------------------------------------------
// B. Backtest + confidence
// ---------------------------------------------------------------------------
function sectionB(): void {
  console.log('\nB. Backtest & confidence');

  check('backtest is null when the series cannot produce folds', () => {
    equal(backtest([1, 2, 3], naiveModel), null, 'too short');
    equal(backtest([], naiveModel), null, 'empty');
  });

  check('backtest returns stable stats for the same input', () => {
    const history = [100, 102, 98, 104, 101, 99, 103, 100, 102, 101, 99, 100];
    const a = backtest(history, naiveModel);
    const b = backtest(history, naiveModel);
    assert(a && b, 'backtest must run on 12 points');
    equal(a.stats, b.stats, 'identical stats');
    assert(a.stats.folds >= 3, `at least MIN_FOLDS (${a.stats.folds})`);
    assert(a.stats.mae >= 0 && a.stats.rmse >= a.stats.mae, 'rmse >= mae');
    assert(a.stats.mape === null || a.stats.mape >= 0, 'mape non-negative or null');
    assert(a.maeRatio >= 0, 'maeRatio non-negative');
  });

  check('confidence grade honors error, depth and gap thresholds', () => {
    const perfect = backtest(new Array(24).fill(0).map((_, i) => 100 + i), naiveModel);
    assert(perfect, '24-point backtest runs');
    equal(
      gradeConfidence({ points: 24, gaps: 0, backtest: perfect }).level,
      perfect.maeRatio <= 0.1 ? 'High' : 'Moderate',
      'high-capable history grades no worse than Moderate'
    );
    equal(
      gradeConfidence({ points: 4, gaps: 0, backtest: null }).level,
      'Low',
      'no folds → Low'
    );
    equal(gradeConfidence({ points: 0, gaps: 0, backtest: null }).level, 'Low', 'no data → Low');
    const crowded = gradeConfidence({
      points: 12,
      gaps: 6,
      backtest: { stats: { mae: 1, rmse: 1, mape: 1, folds: 3 }, maeRatio: 0.01 },
    });
    assert(crowded.level !== 'High', `gaps above 10% must cap confidence (got ${crowded.level})`);
    assert(crowded.reasons.length > 0, 'grades must explain themselves');
  });

  check('confidence levels stay within the documented set', () => {
    equal([...CONFIDENCE_LEVELS], ['High', 'Moderate', 'Low', 'Insufficient'], 'levels');
    equal(MIN_FORECAST_POINTS, 8, 'insufficiency gate');
    assert(INSUFFICIENT_NOTICE.length > 10, 'notice text');
  });

  check('anomaly detection finds a spike and stays quiet on flat data', () => {
    const flat: SeriesPoint[] = Array.from({ length: 20 }, (_, i) => ({ period: `2026-${String(i + 1).padStart(2, '0')}`, value: 100 }));
    equal(detectAnomalies(flat), [], 'flat series → no anomalies');
    const spiked: SeriesPoint[] = flat.map((p, i) => (i === 15 ? { ...p, value: 900 } : p));
    const anomalies = detectAnomalies(spiked);
    assert(anomalies.length >= 1, 'spike must be flagged');
    assert(anomalies.some((a) => a.period === spiked[15].period), 'flags the spike period');
    assert(anomalies.every((a) => a.zScore >= 2 || a.zScore <= -2), 'z-score beyond 2');
    assert(['high', 'low'].includes(anomalies[0].direction), 'direction');
    assert(['low', 'medium', 'high'].includes(anomalies[0].severity), 'severity');
  });

  check('median helper handles even and odd counts', () => {
    equal(median([3, 1, 2]), 2, 'odd');
    equal(median([4, 1, 3, 2]), 2.5, 'even');
    equal(median([]), 0, 'empty');
  });

  check('signals classify direction of travel for risk/opportunity', () => {
    const rising: SeriesPoint[] = Array.from({ length: 12 }, (_, i) => ({ period: `2026-${String(i + 1).padStart(2, '0')}`, value: 100 + i * 10 }));
    const falling = [...rising].reverse();
    const up = classifySignals({ series: rising, forecast: [], lastActual: 210 });
    const down = classifySignals({ series: falling, forecast: [], lastActual: 100 });
    assert(up.length > 0 && down.length > 0, 'both directions produce signals');
    const codes = [...up, ...down].map((s) => s.code);
    assert(new Set(codes).size === codes.length, `duplicate signal codes: ${codes.join(', ')}`);
    for (const s of [...up, ...down]) {
      assert(['risk', 'opportunity'].includes(s.kind), 'kind');
      assert(['low', 'medium', 'high'].includes(s.severity), 'severity');
      assert(s.message.length > 0, 'message');
    }
  });
}

// ---------------------------------------------------------------------------
// HTTP helper (section D)
// ---------------------------------------------------------------------------
const BASE = 'http://localhost:4000/api/v1';
const DEV_PASSWORD = process.env.DEV_PASSWORD || 'Password123!';

interface HttpResult {
  status: number;
  data: any;
}

function req(method: string, path: string, token?: string, body?: unknown): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const request = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method, headers },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode ?? 0, data: parsed });
        });
      }
    );
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

async function login(username: string): Promise<string> {
  const res = await req('POST', '/auth/login/local', undefined, { username, password: DEV_PASSWORD });
  assert(res.status === 200 && res.data?.token, `login failed for ${username} (status=${res.status})`);
  return res.data.token as string;
}

// ---------------------------------------------------------------------------
// C. Service + persistence (needs the DB)
// ---------------------------------------------------------------------------
const ADMIN = { userId: 1, role: 'Administrator' as const, dataScope: 'all' as const };
const VIEWER = { userId: 3, role: 'Viewer' as const, dataScope: 'all' as const };

async function sectionC(): Promise<boolean> {
  console.log('\nC. Service, cache & persistence');

  let db: typeof import('../src/db/pool').db | null = null;
  try {
    db = (await import('../src/db/pool')).db;
    await db.connect();
  } catch (err) {
    console.log(`  SKIP database not reachable: ${(err as Error).message}`);
    return false;
  }

  clearCache();

  let sales: Awaited<ReturnType<typeof getPredictions>> | null = null;
  await checkAsync('service: sales month forecast satisfies the standard schema', async () => {
    sales = await getPredictions({ module: 'sales', granularity: 'month', horizon: 3 }, ADMIN, 'endpoint');
    const parsed = predictiveInsightSchema.safeParse(sales);
    assert(parsed.success, parsed.success ? '' : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    equal(sales.module, 'sales', 'module');
    equal(sales.granularity, 'month', 'granularity');
    equal(sales.horizon, 3, 'horizon');
    assert(CONFIDENCE_LEVELS.includes(sales.confidence), 'confidence level');
    assert(sales.historyWindow.points >= MIN_FORECAST_POINTS, `history depth ${sales.historyWindow.points}`);
    equal(sales.forecast.length, 3, 'one point per horizon step');
    for (const f of sales.forecast) {
      assert(f.period > sales.historyWindow.to, `${f.period} must be after the last observed period`);
      assert(f.lower <= f.value && f.value <= f.upper, `band ordering violated for ${f.period}`);
      assert(f.lower >= 0, 'band clamped at zero');
    }
    assert(sales.sufficientData, 'seeded sales history must be forecastable');
    equal(sales.notice, null, 'no notice when data is sufficient');
    assert(sales.confidenceReasons.length > 0, 'confidence is explained');
    assert(sales.model !== 'none' && sales.modelVersion.startsWith('v'), 'model provenance');
    console.log(
      `  · ${sales.confidence} · ${sales.model} · ${sales.historyWindow.points} pts (${sales.historyWindow.from}..${sales.historyWindow.to}) · anomalies=${sales.anomalies.length} signals=${sales.signals.length}`
    );
  });

  await checkAsync('service: identical request → identical numbers (no randomness)', async () => {
    assert(sales, 'first run produced an insight');
    clearCache();
    const again = await getPredictions({ module: 'sales', granularity: 'month', horizon: 3 }, ADMIN, 'endpoint');
    equal(again.forecast, sales.forecast, 'forecast points');
    equal(again.backtest, sales.backtest, 'backtest stats');
    equal(again.model, sales.model, 'model choice');
    equal(again.confidence, sales.confidence, 'confidence grade');
  });

  await checkAsync('cache: second call is served from memory without a new audit row', async () => {
    clearCache();
    const first = await getPredictions({ module: 'kpi' }, ADMIN, 'endpoint');
    const sizeAfterFirst = cacheSize();
    assert(sizeAfterFirst >= 1, 'cache holds the key');
    const second = await getPredictions({ module: 'kpi' }, ADMIN, 'endpoint');
    equal(second.forecast, first.forecast, 'cached forecast matches');
    equal(cacheSize(), sizeAfterFirst, 'no extra key for an identical request');
  });

  await checkAsync('service: thin history reports Insufficient instead of inventing a forecast', async () => {
    clearCache();
    const thin = await getPredictions(
      { module: 'customers', granularity: 'day', horizon: 3 },
      ADMIN,
      'endpoint'
    );
    equal(thin.confidence, 'Insufficient', 'confidence');
    equal(thin.sufficientData, false, 'sufficientData');
    equal(thin.forecast, [], 'no forecast emitted');
    equal(thin.model, 'none', 'no model claimed');
    equal(thin.notice, INSUFFICIENT_NOTICE, 'documented notice');
    assert(thin.confidenceReasons.length > 0, 'reason for the refusal');
  });

  await checkAsync('permissions: a metric the role cannot read throws ForbiddenError', async () => {
    assert(!resolveCapability('competitors.view', 'Viewer').allowed, 'viewer must lack competitors.view');
    let thrown: unknown = null;
    try {
      await getPredictions({ module: 'competitorPrice' }, VIEWER, 'endpoint');
    } catch (err) {
      thrown = err;
    }
    assert(thrown instanceof ForbiddenError, `expected ForbiddenError, got ${thrown instanceof Error ? thrown.name : thrown}`);
  });

  await checkAsync('permissions: unrestricted modules stay open to every role', async () => {
    assert(resolveCapability('reports.view', 'Viewer').allowed, 'viewer can read reports');
    const insight = await getPredictions({ module: 'visits' }, VIEWER, 'endpoint');
    assert(CONFIDENCE_LEVELS.includes(insight.confidence), 'confidence');
  });

  await checkAsync('persistence: insight rows exist with a scope key and expiry', async () => {
    assert(db, 'db connected');
    const rows = (
      await db.request().query(
        `SELECT TOP 5 ScopeKey, Module, Metric, Confidence, SufficientData, Model, ResultJson, ExpiresAt
         FROM dbo.PredictiveInsight ORDER BY PredictiveInsightID DESC`
      )
    ).recordset as Array<Record<string, unknown>>;
    assert(rows.length > 0, 'expected at least one persisted insight');
    for (const row of rows) {
      assert(String(row.ScopeKey).length > 0, 'scope key');
      assert(PREDICTIVE_MODULES.includes(row.Module as never), `module ${row.Module}`);
      assert(row.ExpiresAt instanceof Date, 'expiry set');
      const stored = JSON.parse(String(row.ResultJson));
      const parsed = predictiveInsightSchema.safeParse(stored);
      assert(parsed.success, `stored ResultJson must match the standard schema (${String(row.ScopeKey)})`);
    }
    console.log(`  · ${rows.length} newest row(s), e.g. ${String(rows[0].ScopeKey)} = ${String(rows[0].Confidence)}`);
  });

  await checkAsync('audit: prediction computations are recorded with an auditable detail', async () => {
    assert(db, 'db connected');
    const rows = (
      await db.request().query(
        `SELECT TOP 5 Action, Entity, Detail FROM dbo.AuditLog
         WHERE Action IN ('AI_PREDICTION_GENERATED', 'AI_PREDICTION_INSUFFICIENT')
         ORDER BY AuditLogID DESC`
      )
    ).recordset as Array<Record<string, unknown>>;
    assert(rows.length > 0, 'expected prediction audit rows');
    const detail = JSON.parse(String(rows[0].Detail));
    for (const key of ['module', 'metric', 'granularity', 'horizon', 'model', 'confidence', 'sufficientData', 'source', 'points']) {
      assert(key in detail, `audit detail missing ${key}`);
    }
    assert(['endpoint', 'tool', 'cron'].includes(String(detail.source)), 'source recorded');
    console.log(`  · ${String(rows[0].Action)} — module=${String(detail.module)} source=${String(detail.source)}`);
  });

  return true;
}

// ---------------------------------------------------------------------------
// D. HTTP surface (--live)
// ---------------------------------------------------------------------------
async function sectionD(): Promise<void> {
  console.log('\nD. HTTP surface');

  await checkAsync('anonymous: POST /ai/predictive is 401', async () => {
    const res = await req('POST', '/ai/predictive', undefined, { module: 'sales' });
    equal(res.status, 401, 'status');
  });

  await checkAsync('viewer/FO without the AI capability: 403', async () => {
    const viewer = await login('mekdes.tilahun@kerchanshe.com');
    const res = await req('POST', '/ai/predictive', viewer, { module: 'sales' });
    equal(res.status, 403, 'viewer status');
  });

  await checkAsync('admin: forecast returns the standard schema and sane bands', async () => {
    const admin = await login('woluman.urgesa@kerchanshe.net');
    const res = await req('POST', '/ai/predictive', admin, { module: 'sales', granularity: 'month', horizon: 3 });
    equal(res.status, 200, 'status');
    const parsed = predictiveInsightSchema.safeParse(res.data);
    assert(parsed.success, parsed.success ? '' : parsed.error.issues.map((i) => i.message).join('; '));
    console.log(`  · ${res.data.confidence} · ${res.data.model} · points=${res.data.historyWindow.points}`);
  });

  await checkAsync('admin: validation rejects a bad request before any computation', async () => {
    const admin = await login('woluman.urgesa@kerchanshe.net');
    const bad = await req('POST', '/ai/predictive', admin, { module: 'sales', horizon: 99 });
    assert(bad.status === 400 || bad.status === 422, `expected a validation status, got ${bad.status}`);
    const badModule = await req('POST', '/ai/predictive', admin, { module: 'not-a-module' });
    assert(badModule.status === 400 || badModule.status === 422, `expected a validation status, got ${badModule.status}`);
  });

  await checkAsync('admin: summary returns one card per readable module', async () => {
    const admin = await login('woluman.urgesa@kerchanshe.net');
    const res = await req('GET', '/ai/predictive/summary', admin);
    equal(res.status, 200, 'status');
    assert(Array.isArray(res.data?.cards) && res.data.cards.length >= 10, `expected a full grid, got ${res.data?.cards?.length}`);
    equal(res.data.unavailable, [], 'admin reads every module');
    const seen = new Set<string>();
    for (const card of res.data.cards) {
      assert(!seen.has(`${card.module}:${card.metric}`), 'duplicate card');
      seen.add(`${card.module}:${card.metric}`);
      assert(CONFIDENCE_LEVELS.includes(card.confidence), 'confidence level');
      assert(card.label && card.model, 'card provenance');
      assert(card.latest && typeof card.latest.value === 'number', 'latest observation');
      if (card.sufficientData) {
        assert(card.next && card.next.lower <= card.next.value && card.next.value <= card.next.upper, 'next band ordered');
      } else {
        equal(card.next, null, 'no projection without data');
        assert(typeof card.notice === 'string' && card.notice.length > 0, 'insufficient cards explain why');
      }
    }
    console.log(`  · ${res.data.cards.length} cards · e.g. ${res.data.cards[0].module}=${res.data.cards[0].confidence}`);
  });

  await checkAsync('viewer without the AI capability: summary is forbidden', async () => {
    const viewer = await login('mekdes.tilahun@kerchanshe.com');
    const res = await req('GET', '/ai/predictive/summary', viewer);
    equal(res.status, 403, 'status');
  });

  await checkAsync('admin: predict tool runs through the assistant catalogue', async () => {
    const { executeDataTool } = await import('../src/modules/ai/dataTools');
    const result = await executeDataTool(
      { query: { name: 'forecast_kpi', args: { horizon: 2 } } },
      { userId: 1, role: 'Administrator', dataScope: 'all' }
    );
    equal(result.name, 'forecast_kpi', 'tool name');
    const parsed = predictiveInsightSchema.safeParse(result.data);
    assert(parsed.success, 'tool payload matches the standard schema');
    equal((result.data as { horizon: number }).horizon, 2, 'horizon honoured');
  });

  await checkAsync('viewer: predict tool with a restricted metric is forbidden', async () => {
    const { executeDataTool } = await import('../src/modules/ai/dataTools');
    let thrown: unknown = null;
    try {
      await executeDataTool(
        { query: { name: 'forecast_competitor_price', args: {} } },
        { userId: 3, role: 'Viewer', dataScope: 'all' }
      );
    } catch (err) {
      thrown = err;
    }
    assert(thrown instanceof ForbiddenError, `expected ForbiddenError, got ${thrown instanceof Error ? thrown.name : thrown}`);
  });
}

// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const live = process.argv.includes('--live');

  sectionA();
  sectionB();

  const dbUp = await sectionC();

  if (!live) {
    console.log('\n(run with --live to exercise the HTTP surface as well)');
  } else if (dbUp) {
    await sectionD();
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
  process.exit(process.exitCode ?? 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
