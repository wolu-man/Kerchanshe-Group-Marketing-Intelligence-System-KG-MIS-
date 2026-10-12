// =============================================================================
// AI capabilities — verification script (this repo has no test framework).
//
//   npx tsx scripts/test-ai-capabilities.ts            A+B+C (no model calls)
//   npx tsx scripts/test-ai-capabilities.ts --live     also D: real model calls
//
//   A. Tool contracts & prompts       — pure, no DB, no server
//   B. Guardrails                     — rate limits, error mapping, sandbox
//   C. HTTP security                  — auth/permission/schema matrix (server)
//   D. Live end-to-end (--live only)  — writing (auth + anonymous), analysis, ask
//   E. Persistence checks (--live)    — audit rows written, writing text NOT kept
//
// Section C skips gracefully when the API is not listening on :4000.
// =============================================================================

import * as http from 'http';
import { ANSWER_TOOL, ROUND1_SYSTEM, ROUND2_SYSTEM, buildRound1System } from '../src/modules/ai/ask';
import { ANALYSIS_LIMITS, ANALYSIS_TOOL } from '../src/modules/ai/analysis';
import { AI_INTENTS, AI_SURFACE_CLASSIFICATION } from '../src/modules/ai/ai.types';
import { toAppError } from '../src/modules/ai/errors';
import {
  DATA_LIMITS,
  DATA_TOOL,
  DATA_TOOL_NAMES,
  TOOL_REGISTRY,
  capData,
  dataCatalogueText,
  executeDataTool,
  listDataTools,
  type DataToolContext,
} from '../src/modules/ai/dataTools';
import { ROUTING } from '../src/modules/ai/providers';
import { assertIpRateLimit, assertRateLimit } from '../src/modules/ai/rate-limit';
import { resolveCapability } from '../src/security/permissions';
import { AppError, ForbiddenError, TooManyRequestsError, ValidationError } from '../src/utils/errors';
import {
  WRITING_LIMITS,
  WRITING_OPERATIONS,
  WRITING_TOOL,
} from '../src/modules/ai/writing';

// ---------------------------------------------------------------------------
// Tiny test harness (same shape as scripts/test-ai-assistant.ts)
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

function expectError(fn: () => unknown, name: string): unknown {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error(`${name}: expected an error, none was thrown`);
}

// ---------------------------------------------------------------------------
// HTTP helper
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
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers,
      },
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
// A. Tool contracts & prompts (pure)
// ---------------------------------------------------------------------------
function sectionA(): void {
  console.log('\nA. Tool contracts & prompts');

  check('writing: exactly the five respondent-safe operations', () => {
    equal(
      [...WRITING_OPERATIONS],
      ['improve-grammar', 'rephrase', 'clarify', 'shorten', 'professional'],
      'operation list'
    );
  });

  check('writing: tool asks only for suggestion/note (no form or MIS data)', () => {
    equal(WRITING_TOOL.name, 'improve_response', 'tool name');
    const params = WRITING_TOOL.parameters as { required: string[]; properties: Record<string, unknown> };
    assert(params.required.includes('suggestion'), 'suggestion must be required');
    equal(Object.keys(params.properties).sort(), ['note', 'suggestion'], 'parameter set');
    const blob = JSON.stringify(WRITING_TOOL);
    assert(!/formId|schema|customerId|sales/i.test(blob), 'tool must not reference form/MIS data');
  });

  check('writing: limits match the documented contract', () => {
    equal(WRITING_LIMITS.text, 4000, 'text limit');
    equal(WRITING_LIMITS.questionLabel, 500, 'label limit');
    equal(WRITING_LIMITS.questionHelp, 1000, 'help limit');
    equal(WRITING_LIMITS.publicRatePerMinute, 10, 'anonymous IP rate');
  });

  check('analysis: tool requires a reply and returns structured findings', () => {
    equal(ANALYSIS_TOOL.name, 'summarize_responses', 'tool name');
    const params = analysisToolRequired();
    assert(params.includes('reply'), 'reply must be required');
    const props = analysisToolProperties();
    for (const key of ['keyFindings', 'themes', 'sentiment', 'openTextInsights', 'trends']) {
      assert(props.includes(key), `missing ${key}`);
    }
    const blob = JSON.stringify(ANALYSIS_TOOL);
    assert(!/password|api[_-]?key/i.test(blob), 'no secrets in tool spec');
  });

  check('analysis: sampling budgets match the plan', () => {
    equal(ANALYSIS_LIMITS.samplesPerField, 40, 'samples per field');
    equal(ANALYSIS_LIMITS.sampleChars, 250, 'sample chars');
    equal(ANALYSIS_LIMITS.sampleBudget, 12000, 'sample budget');
    equal(ANALYSIS_LIMITS.promptBudget, 60000, 'prompt budget');
  });

  check('data: single tool named query_kmis_data with reply required', () => {
    equal(DATA_TOOL.name, 'query_kmis_data', 'tool name');
    const params = DATA_TOOL.parameters as { required: string[][] | string[] };
    equal(params.required, ['reply'], 'required keys');
  });

  check('data: catalogue has the 29 planned queries, unique names', () => {
    const expected = [
      'sales_summary',
      'weekly_sales_summary',
      'price_comparison',
      'competitor_intel',
      'customer_overview',
      'product_overview',
      'interview_overview',
      'market_visits',
      'kpi_performance',
      'product_availability',
      'survey_metrics',
      'sales_period_comparison',
      'executive_report_summary',
      'multimedia_overview',
      'interview_themes',
      'forecast_sales',
      'forecast_weekly_sales',
      'forecast_kpi',
      'forecast_competitor_price',
      'forecast_price_gap',
      'forecast_product_demand',
      'forecast_customer_growth',
      'predict_survey_volume',
      'predict_interview_activity',
      'predict_visit_activity',
      'forecast_multimedia_capture',
      'detect_anomalies',
      'opportunity_overview',
      'opportunity_list',
    ];
    equal([...DATA_TOOL_NAMES].sort(), [...expected].sort(), 'catalogue names');
    equal(new Set(DATA_TOOL_NAMES).size, DATA_TOOL_NAMES.length, 'names must be unique');
    equal(listDataTools().length, 29, 'listDataTools length');
    for (const t of listDataTools()) assert(t.label && t.name, 'every tool has name+label');
  });

  check('data: registry is complete, read/predict only and audit-tagged', () => {
    equal(TOOL_REGISTRY.length, DATA_TOOL_NAMES.length, 'registry covers every tool');
    for (const entry of TOOL_REGISTRY) {
      assert(
        entry.classification === 'read' || entry.classification === 'predict',
        `${entry.name} must be read or predict`
      );
      equal(entry.validation, 'zod', `${entry.name} validation`);
      equal(
        entry.audit,
        entry.classification === 'predict' ? 'AI_PREDICTION_GENERATED' : 'AI_DATA_QUERY',
        `${entry.name} audit`
      );
      equal(entry.dataScope, 'caller', `${entry.name} data scope`);
      assert(entry.source.length > 0, `${entry.name} needs a source service`);
      assert(entry.description.length > 0, `${entry.name} needs a description`);
    }
    const withPermission = TOOL_REGISTRY.filter((t) => t.requiredAction !== null).map((t) => t.name);
    for (const name of ['sales_summary', 'price_comparison', 'competitor_intel', 'survey_metrics', 'sales_period_comparison', 'executive_report_summary', 'multimedia_overview', 'interview_themes', 'opportunity_overview', 'opportunity_list']) {
      assert(withPermission.includes(name), `${name} must declare a permission`);
    }
    for (const entry of TOOL_REGISTRY.filter((t) => t.name.startsWith('opportunity_'))) {
      equal(entry.requiredAction, 'tenders.view', `${entry.name} permission`);
    }
  });

  check('classification: only the Form Assistant may write; everything else reads, predicts or suggests', () => {
    equal(
      { ...AI_SURFACE_CLASSIFICATION },
      {
        assistant: 'write',
        analysis: 'suggest',
        writing: 'suggest',
        ask: 'read',
        launcher: 'read',
        predictive: 'predict',
        publicChat: 'read',
      },
      'surface classification matrix'
    );
    const writers = Object.entries(AI_SURFACE_CLASSIFICATION)
      .filter(([, v]) => v === 'write')
      .map(([k]) => k);
    equal(writers, ['assistant'], 'writes stay exclusive to the Form Assistant');
    for (const entry of TOOL_REGISTRY) {
      assert(
        entry.classification === 'read' || entry.classification === 'predict',
        `${entry.name} must be read or predict`
      );
      equal(entry.validation, 'zod', `${entry.name} validation`);
    }
  });

  check('data: tool enum matches the catalogue exactly', () => {
    const params = DATA_TOOL.parameters as {
      properties: { query: { properties: { name: { enum: string[] } } } };
    };
    equal([...params.properties.query.properties.name.enum].sort(), [...DATA_TOOL_NAMES].sort(), 'enum');
  });

  check('data: catalogue text lists every query and its permission', () => {
    const text = dataCatalogueText();
    for (const name of DATA_TOOL_NAMES) assert(text.includes(name), `catalogue missing ${name}`);
    assert(text.includes('Requires: pricing.view'), 'price_comparison permission missing');
    assert(text.includes('Requires: forms.viewResponses'), 'survey_metrics permission missing');
    assert(text.includes('Requires: tenders.view'), 'opportunity tools permission missing');
  });

  check('data: no query, prompt or description contains SQL', () => {
    const blob = `${dataCatalogueText()} ${DATA_TOOL.description} ${ROUND1_SYSTEM} ${ROUND2_SYSTEM}`;
    assert(!/\b(SELECT|INSERT|UPDATE|DELETE|DROP|EXEC|MERGE)\b/i.test(blob), 'SQL verb found');
    assert(!/\bdbo\./i.test(blob), 'raw table name found');
  });

  check('ask: round-1 prompt binds the tool, catalogue and safety rules', () => {
    assert(ROUND1_SYSTEM.includes(DATA_TOOL.name), 'round 1 must reference the data tool');
    assert(ROUND1_SYSTEM.includes('NEVER output SQL'), 'round 1 must forbid SQL');
    assert(ROUND1_SYSTEM.includes('same language'), 'round 1 must require the user language');
    assert(ROUND1_SYSTEM.includes('CATALOGUE'), 'round 1 must embed the catalogue');
    assert(ROUND1_SYSTEM.includes('never invent names'), 'round 1 must forbid invented queries');
    assert(ROUND1_SYSTEM.includes('opportunity_overview'), 'glossary must route opportunity questions to opportunity_overview');
    assert(ROUND1_SYSTEM.includes('opportunity_list'), 'glossary must route opportunity questions to opportunity_list');
  });

  check('ask: page context is advisory-only and never widens access', () => {
    equal(buildRound1System(), ROUND1_SYSTEM, 'no context → identical prompt');
    const withCtx = buildRound1System({
      module: 'pricing',
      recordId: 42,
      label: 'Buna Pen',
      filters: [{ k: 'region', v: 'Addis' }],
    });
    assert(withCtx.includes('PAGE CONTEXT'), 'context line present');
    assert(withCtx.includes('"pricing"'), 'module surfaced');
    assert(withCtx.includes('#42'), 'record surfaced');
    assert(withCtx.includes('Buna Pen'), 'label surfaced');
    assert(withCtx.includes('region=Addis'), 'filter surfaced');
    assert(withCtx.includes('NO extra data access'), 'context must grant nothing');
    assert(withCtx.includes(ROUND1_SYSTEM.split('\n')[0]), 'base prompt preserved');
  });

  check('ask: round-2 prompt forbids invented numbers and demands sources', () => {
    assert(ROUND2_SYSTEM.includes('Never invent'), 'round 2 must forbid invented numbers');
    assert(ROUND2_SYSTEM.includes('source:'), 'round 2 must require sources');
    assert(ROUND2_SYSTEM.includes(ANSWER_TOOL.name), 'round 2 must reference the answer tool');
    assert(!/password|api[_-]?key/i.test(ROUND2_SYSTEM), 'no secrets in prompt');
  });

  check('ask: answer tool requires exactly the answer field', () => {
    equal(ANSWER_TOOL.name, 'answer_question', 'tool name');
    const params = ANSWER_TOOL.parameters as { required: string[][] | string[] };
    equal(params.required, ['answer'], 'required keys');
  });

  check('routing: intents and defaults unchanged by the new features', () => {
    equal([...AI_INTENTS], ['generate', 'modify', 'analyze', 'chat'], 'intent list');
    equal(ROUTING.generate[0], 'gemini', 'generate → gemini first');
    equal(ROUTING.analyze[0], 'gemini', 'analyze → gemini first');
    equal(ROUTING.modify[0], 'groq', 'modify → groq first');
    equal(ROUTING.chat[0], 'groq', 'chat → groq first');
    for (const intent of AI_INTENTS) {
      assert(ROUTING[intent].length >= 3, `routing for ${intent} must fall back through 3 providers`);
    }
  });
}

function analysisToolRequired(): string[] {
  const params = ANALYSIS_TOOL.parameters as { required: string[] };
  return params.required;
}

function analysisToolProperties(): string[] {
  const params = ANALYSIS_TOOL.parameters as { properties: Record<string, unknown> };
  return Object.keys(params.properties);
}

// ---------------------------------------------------------------------------
// B. Guardrails (no server, no model)
// ---------------------------------------------------------------------------
function sectionB(): void {
  console.log('\nB. Guardrails (rate limit, errors, sandbox)');

  check('rate limit: 30/min/user, request 31 is throttled', () => {
    const userId = 900001;
    for (let i = 0; i < 30; i += 1) assertRateLimit(userId);
    const err = expectError(() => assertRateLimit(userId), 'rate limit') as AppError;
    assert(err instanceof TooManyRequestsError, `expected TooManyRequestsError, got ${err?.name}`);
    equal(err.statusCode, 429, 'status');
  });

  check('rate limit: anonymous IP buckets are separate and capped', () => {
    assertIpRateLimit('203.0.113.9', 2, 'slow down');
    assertIpRateLimit('203.0.113.9', 2, 'slow down');
    const err = expectError(() => assertIpRateLimit('203.0.113.9', 2, 'slow down'), 'ip limit') as AppError;
    assert(err instanceof TooManyRequestsError, 'third hit must be throttled');
    assertIpRateLimit('203.0.113.10', 2, 'slow down');
  });

  check('errors: toAppError preserves AppError, wraps the rest', () => {
    const original = new ValidationError('bad input', [{ path: 'text', message: 'required' }]);
    const same = toAppError(original);
    equal(same, original, 'AppError must pass through unchanged');
    const wrapped = toAppError(new Error('boom'));
    assert(wrapped instanceof AppError && wrapped.statusCode >= 500, 'plain errors become 5xx AppError');
    equal(wrapped.code, 'AI_INTERNAL_ERROR', 'wrapped code');
  });
}

async function sectionBAsync(): Promise<void> {
  await checkAsync('sandbox: malformed model payload is rejected (422)', async () => {
    try {
      await executeDataTool({ nonsense: true }, { userId: 1, role: 'Administrator', dataScope: 'all' });
    } catch (err) {
      const e = err as AppError;
      equal(e.statusCode, 422, 'status');
      equal(e.code, 'AI_MALFORMED_RESPONSE', 'code');
      return;
    }
    throw new Error('expected executeDataTool to reject the payload');
  });

  await checkAsync('sandbox: unknown query name is rejected (AI_UNKNOWN_TOOL)', async () => {
    try {
      await executeDataTool(
        { query: { name: 'drop_everything', args: {} } },
        { userId: 1, role: 'Administrator', dataScope: 'all' }
      );
    } catch (err) {
      const e = err as AppError;
      equal(e.statusCode, 422, 'status');
      equal(e.code, 'AI_UNKNOWN_TOOL', 'code');
      return;
    }
    throw new Error('expected an unknown-tool rejection');
  });

  await checkAsync('sandbox: permission gate runs before any data access', async () => {
    equal(resolveCapability('forms.viewResponses', 'Viewer').allowed, false, 'Viewer must not read responses');
    try {
      await executeDataTool(
        { query: { name: 'survey_metrics', args: { formId: 1 } } },
        { userId: 2, role: 'Viewer', dataScope: 'own' }
      );
    } catch (err) {
      assert(err instanceof ForbiddenError, `expected ForbiddenError, got ${(err as Error).name}`);
      return;
    }
    throw new Error('expected the Viewer to be forbidden');
  });

  await checkAsync('sandbox: bad arguments are rejected before execution', async () => {
    try {
      await executeDataTool(
        { query: { name: 'price_comparison', args: { regionId: -5 } } },
        { userId: 1, role: 'Administrator', dataScope: 'all' }
      );
    } catch (err) {
      assert(err instanceof ValidationError, `expected ValidationError, got ${(err as Error).name}`);
      equal((err as AppError).statusCode, 422, 'status');
      return;
    }
    throw new Error('expected argument validation to fail');
  });

  check('sandbox: results are capped in rows and characters', () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ id: i, blob: 'y'.repeat(600) }));
    const cappedRows = capData(rows) as unknown[];
    equal(cappedRows.length, DATA_LIMITS.maxRows, 'row cap');
    const capped = capData('x'.repeat(DATA_LIMITS.resultChars + 500));
    assert(typeof capped === 'string', 'long string must stay a string');
    assert((capped as string).length <= 2100, `string cap exceeded (${(capped as string).length})`);
  });
}

// ---------------------------------------------------------------------------
// C. HTTP security matrix (needs the API on :4000)
// ---------------------------------------------------------------------------
async function sectionC(): Promise<boolean> {
  console.log('\nC. HTTP security matrix');

  let reachable = true;
  try {
    await req('GET', '/ai/providers');
  } catch {
    reachable = false;
  }
  if (!reachable) {
    console.log('  SKIP API not reachable on http://localhost:4000 — start it first');
    return false;
  }

  const VALID_WRITING = {
    provider: 'auto',
    operation: 'improve-grammar',
    text: 'i goes there yesterday',
    question: { label: 'Comments', type: 'longtext' },
  };
  const VALID_ANALYSIS = { provider: 'auto', formId: 424242 };
  const VALID_ASK = { provider: 'auto', question: 'What can you query?' };

  await checkAsync('anonymous: /ai/providers, /writing, /analysis, /ask are 401', async () => {
    const providers = await req('GET', '/ai/providers');
    equal(providers.status, 401, '/ai/providers without a token');
    for (const [path, body] of [
      ['/ai/writing', VALID_WRITING],
      ['/ai/analysis', VALID_ANALYSIS],
      ['/ai/ask', VALID_ASK],
    ] as const) {
      const res = await req('POST', path, undefined, body);
      equal(res.status, 401, `${path} without a token`);
    }
  });

  await checkAsync('anonymous: public writing route is mounted and validates input', async () => {
    const res = await req('POST', '/ai/public/writing', undefined, { provider: 'auto', operation: 'rephrase' });
    equal(res.status, 422, 'missing text must fail validation');
    equal(res.data?.error, 'VALIDATION_ERROR', 'error code');
    const noAuth = await req('POST', '/ai/public/writing', undefined, {
      ...VALID_WRITING,
      operation: 'nope',
    });
    equal(noAuth.status, 422, 'bad operation must fail validation');
  });

  let viewer = '';
  let officer = '';
  let admin = '';
  await checkAsync('logins: admin, field officer and viewer all authenticate', async () => {
    admin = await login('woluman.urgesa@kerchanshe.net');
    officer = await login('shalama.girma@kerchanshegroup.com');
    viewer = await login('mekdes.tilahun@kerchanshe.com');
  });
  if (!admin) return reachable;

  await checkAsync('viewer: 403 on providers, analysis, ask and writing', async () => {
    const providers = await req('GET', '/ai/providers', viewer);
    equal(providers.status, 403, 'viewer → /ai/providers');
    for (const [path, body] of [
      ['/ai/analysis', VALID_ANALYSIS],
      ['/ai/ask', VALID_ASK],
      ['/ai/writing', VALID_WRITING],
    ] as const) {
      const res = await req('POST', path, viewer, body);
      equal(res.status, 403, `viewer → ${path}`);
    }
  });

  await checkAsync('field officer: 403 on analysis/ask (no AI capability)', async () => {
    for (const [path, body] of [
      ['/ai/analysis', VALID_ANALYSIS],
      ['/ai/ask', VALID_ASK],
    ] as const) {
      const res = await req('POST', path, officer, body);
      equal(res.status, 403, `field officer → ${path}`);
    }
  });

  await checkAsync('field officer: writing allowed, schema still enforced (422)', async () => {
    const badOp = await req('POST', '/ai/writing', officer, { ...VALID_WRITING, operation: 'nope' });
    equal(badOp.status, 422, 'invalid operation');
    const tooLong = await req('POST', '/ai/writing', officer, {
      ...VALID_WRITING,
      text: 'x'.repeat(WRITING_LIMITS.text + 1),
    });
    equal(tooLong.status, 422, 'text over the limit');
    const badQuestion = await req('POST', '/ai/writing', officer, {
      ...VALID_WRITING,
      question: { label: '', type: 'longtext' },
    });
    equal(badQuestion.status, 422, 'empty question label');
  });

  await checkAsync('admin: full guard chain reached (404 on unknown form, 422 on bad input)', async () => {
    const missing = await req('POST', '/ai/analysis', admin, { provider: 'auto', formId: 999999 });
    equal(missing.status, 404, 'auth+permission+ownership must pass before getForm');
    const noForm = await req('POST', '/ai/analysis', admin, { provider: 'auto' });
    equal(noForm.status, 422, 'formId is required');
    const badFilter = await req('POST', '/ai/analysis', admin, {
      provider: 'auto',
      formId: 424242,
      filters: { from: '31-12-2026' },
    });
    equal(badFilter.status, 422, 'filters must be ISO dates');
    const emptyQuestion = await req('POST', '/ai/ask', admin, { provider: 'auto', question: '' });
    equal(emptyQuestion.status, 422, 'question is required');
    const longQuestion = await req('POST', '/ai/ask', admin, {
      provider: 'auto',
      question: 'x'.repeat(1001),
    });
    equal(longQuestion.status, 422, 'question capped at 1000 chars');
    const badModule = await req('POST', '/ai/ask', admin, {
      provider: 'auto',
      question: 'hello',
      context: { module: 'x'.repeat(41) },
    });
    equal(badModule.status, 422, 'context module capped at 40 chars');
    const badModuleChars = await req('POST', '/ai/ask', admin, {
      provider: 'auto',
      question: 'hello',
      context: { module: 'has space' },
    });
    equal(badModuleChars.status, 422, 'context module must be a simple id');
    const tooManyFilters = await req('POST', '/ai/ask', admin, {
      provider: 'auto',
      question: 'hello',
      context: { module: 'pricing', filters: Array.from({ length: 5 }, (_, i) => ({ k: `f${i}`, v: 'v' })) },
    });
    equal(tooManyFilters.status, 422, 'context filters capped at 4');
  });

  return reachable;
}

// ---------------------------------------------------------------------------
// D. Live end-to-end (real model calls)
// ---------------------------------------------------------------------------
const WRITING_NONCE = `ai-cap-nonce-${Date.now()}`;

async function sectionD(admin: string): Promise<void> {
  console.log('\nD. Live end-to-end');

  await checkAsync('writing (authenticated): returns a suggestion, nothing else', async () => {
    const res = await req('POST', '/ai/writing', admin, {
      provider: 'auto',
      operation: 'improve-grammar',
      text: `me and him goes to the store yesterday to buys coffe ${WRITING_NONCE}`,
      question: { label: 'Any comments for us?', type: 'longtext', maxLength: 500 },
    });
    equal(res.status, 200, `status=${res.status} ${JSON.stringify(res.data).slice(0, 300)}`);
    assert(typeof res.data?.suggestion === 'string' && res.data.suggestion.length > 0, 'suggestion text');
    equal(res.data.operation, 'improve-grammar', 'operation echo');
    assert(typeof res.data.changed === 'boolean', 'changed flag');
    assert(typeof res.data.durationMs === 'number', 'duration');
    assert(['auto', 'gemini', 'groq', 'ollama'].includes(res.data.provider), `provider=${res.data.provider}`);
    assert(Array.isArray(res.data.warnings), 'warnings array');
    const allowed = ['changed', 'durationMs', 'model', 'note', 'operation', 'provider', 'suggestion', 'warnings'];
    const keys = Object.keys(res.data);
    assert(keys.every((k) => allowed.includes(k)), `unexpected keys: ${keys.join(', ')}`);
    for (const required of ['provider', 'model', 'operation', 'suggestion', 'changed', 'warnings', 'durationMs']) {
      assert(keys.includes(required), `missing ${required}`);
    }
    console.log(`  · provider=${res.data.provider} model=${res.data.model} ${res.data.durationMs}ms`);
    console.log(`  · suggestion: ${String(res.data.suggestion).slice(0, 160)}`);
  });

  await checkAsync('writing (anonymous public fill): works without a session', async () => {
    const res = await req('POST', '/ai/public/writing', undefined, {
      provider: 'auto',
      operation: 'shorten',
      text: 'In my personal opinion and from my own observation the service was quite slow.',
      question: { label: 'Feedback', type: 'longtext', maxLength: 280 },
    });
    equal(res.status, 200, `status=${res.status} ${JSON.stringify(res.data).slice(0, 300)}`);
    assert(typeof res.data?.suggestion === 'string' && res.data.suggestion.length > 0, 'suggestion text');
    console.log(`  · provider=${res.data.provider} ${res.data.durationMs}ms → ${String(res.data.suggestion).slice(0, 140)}`);
  });

  await checkAsync('analysis: metrics from the DB + interpretation from the model', async () => {
    const list = await req('GET', '/forms', admin);
    equal(list.status, 200, 'forms list');
    const items = (list.data?.items ?? []) as Array<Record<string, unknown>>;
    assert(items.length > 0, 'at least one form must exist');
    const target =
      items.find((f) => Number(f.ResponseCount ?? 0) > 0) ?? items[0];
    const formId = Number(target.TemplateID);
    const res = await req('POST', '/ai/analysis', admin, { provider: 'auto', formId });
    equal(res.status, 200, `status=${res.status} ${JSON.stringify(res.data).slice(0, 400)}`);
    assert(res.data?.metrics, 'metrics block');
    assert(typeof res.data.metrics.total === 'number', 'total responses');
    assert(res.data.interpretation, 'interpretation block');
    assert(
      typeof res.data.interpretation.reply === 'string' && res.data.interpretation.reply.length > 0,
      'interpretation reply'
    );
    assert(typeof res.data.report === 'object' && res.data.report !== null, 'report block');
    assert(['auto', 'gemini', 'groq', 'ollama'].includes(res.data.provider), 'provider');
    console.log(
      `  · form=${formId} responses=${res.data.metrics.total} provider=${res.data.provider} ${res.data.durationMs}ms`
    );
    console.log(`  · ${String(res.data.interpretation.reply).slice(0, 200)}`);
  });

  await checkAsync('ask: grounded answer with the data it used', async () => {
    const res = await req('POST', '/ai/ask', admin, {
      provider: 'auto',
      question: 'Summarise our product availability right now.',
      context: { module: 'reports' },
    });
    equal(res.status, 200, `status=${res.status} ${JSON.stringify(res.data).slice(0, 400)}`);
    assert(typeof res.data?.answer === 'string' && res.data.answer.length > 0, 'answer text');
    assert(Array.isArray(res.data.sources), 'sources array');
    for (const s of res.data.sources) {
      assert(s.name && s.label && 'rowCount' in s, 'each source has name/label/rowCount');
    }
    console.log(`  · provider=${res.data.provider} ${res.data.durationMs}ms sources=${res.data.sources.length}`);
    console.log(`  · ${String(res.data.answer).slice(0, 240)}`);
  });

  await checkAsync('ask: opportunity question is answered from opportunity data', async () => {
    const res = await req('POST', '/ai/ask', admin, {
      provider: 'auto',
      question: 'How many opportunities do we have in total, and how many are RFQs?',
      context: { module: 'tenders', label: 'Tender AI Assistant' },
    });
    equal(res.status, 200, `status=${res.status} ${JSON.stringify(res.data).slice(0, 400)}`);
    assert(typeof res.data?.answer === 'string' && res.data.answer.length > 0, 'answer text');
    const names = ((res.data.sources ?? []) as Array<{ name: string }>).map((s) => s.name);
    assert(
      names.includes('opportunity_overview') || names.includes('opportunity_list'),
      `expected an opportunity source, got [${names.join(', ')}]`
    );
    console.log(`  · provider=${res.data.provider} ${res.data.durationMs}ms sources=${names.join(', ')}`);
    console.log(`  · ${String(res.data.answer).slice(0, 240)}`);
  });
}

// ---------------------------------------------------------------------------
// E. Persistence checks (audit written, writing text never stored)
// ---------------------------------------------------------------------------
async function sectionE(): Promise<void> {
  console.log('\nE. Live data tools & persistence');

  let db: typeof import('../src/db/pool').db | null = null;
  try {
    db = (await import('../src/db/pool')).db;
    await db.connect();
  } catch (err) {
    console.log(`  SKIP database not reachable: ${(err as Error).message}`);
    return;
  }

  const adminCtx: DataToolContext = { userId: 1, role: 'Administrator', dataScope: 'all' };

  await checkAsync('new tools: sales_period_comparison computes both windows and deltas', async () => {
    const result = (await executeDataTool({ query: { name: 'sales_period_comparison', args: {} } }, adminCtx)) as any;
    equal(result.name, 'sales_period_comparison', 'tool name');
    assert(result.data?.current?.period?.from && result.data?.current?.period?.to, 'current period');
    assert(result.data?.previous?.period?.from && result.data?.previous?.period?.to, 'previous period');
    assert(result.data.current.totals && 'TotalAmount' in result.data.current.totals, 'current totals');
    const d = result.data.delta;
    for (const key of ['totalAmount', 'totalAmountPct', 'totalQuantity', 'totalQuantityPct', 'orderCount', 'orderCountPct']) {
      assert(d && key in d, `delta.${key} missing`);
    }
    assert(typeof d.totalAmount === 'number', 'delta.totalAmount numeric');
    console.log(
      `  · ${result.data.current.period.from}..${result.data.current.period.to} vs ${result.data.previous.period.from}..${result.data.previous.period.to}`
    );
  });

  await checkAsync('new tools: executive_report_summary returns KPIs and observations', async () => {
    const result = (await executeDataTool({ query: { name: 'executive_report_summary', args: {} } }, adminCtx)) as any;
    assert(result.data?.kpis && typeof result.data.kpis.totalSales === 'number', 'kpis.totalSales');
    assert(Array.isArray(result.data.observations) && result.data.observations.length > 0, 'observations');
    assert(Array.isArray(result.data.generatedAlerts), 'generatedAlerts array');
    console.log(`  · kpis keys=${Object.keys(result.data.kpis).length} observations=${result.data.observations.length}`);
  });

  await checkAsync('new tools: multimedia_overview aggregates counts', async () => {
    const result = (await executeDataTool({ query: { name: 'multimedia_overview', args: {} } }, adminCtx)) as any;
    assert(result.data?.totals && 'TotalAssets' in result.data.totals, 'totals.TotalAssets');
    for (const key of ['byType', 'byStatus', 'byMonth']) assert(Array.isArray(result.data[key]), `${key} array`);
    console.log(`  · assets=${result.data.totals.TotalAssets} types=${result.data.byType.length}`);
  });

  await checkAsync('new tools: interview_themes returns capped feedback snippets', async () => {
    const result = (await executeDataTool({ query: { name: 'interview_themes', args: {} } }, adminCtx)) as any;
    assert(Array.isArray(result.data?.items), 'items array');
    assert(typeof result.data?.total === 'number', 'total');
    assert(result.data.items.length <= 25, 'capped at 25 snippets');
    console.log(`  · ${result.data.items.length} snippets of ${result.data.total} total`);
  });

  await checkAsync('new tools: opportunity_overview returns consistent dashboard KPIs', async () => {
    const result = (await executeDataTool({ query: { name: 'opportunity_overview', args: {} } }, adminCtx)) as any;
    equal(result.name, 'opportunity_overview', 'tool name');
    const d = result.data;
    assert(typeof d?.totalOpportunities === 'number', 'totalOpportunities numeric');
    for (const key of ['rfqCount', 'buyerLeadCount', 'exportCount', 'tradeCount', 'savedCount', 'highRelevance']) {
      assert(typeof d[key] === 'number', `${key} numeric`);
    }
    for (const key of ['byType', 'bySource', 'byProductGroup', 'byCountry', 'relevanceBuckets', 'deadlineTrend', 'upcomingDeadlines']) {
      assert(Array.isArray(d[key]), `${key} array`);
    }
    const typeSum = (d.byType as Array<{ count: number }>).reduce((a, b) => a + Number(b.count), 0);
    equal(typeSum, d.totalOpportunities, 'byType sums to the total');
    const bucketSum = (d.relevanceBuckets as Array<{ count: number }>).reduce((a, b) => a + Number(b.count), 0);
    equal(bucketSum, d.totalOpportunities, 'relevanceBuckets sum to the total');
    console.log(`  · total=${d.totalOpportunities} rfq=${d.rfqCount} export=${d.exportCount} types=${(d.byType as unknown[]).length}`);
  });

  await checkAsync('new tools: opportunity_list filters, totals and caps rows', async () => {
    const rfqs = (await executeDataTool(
      { query: { name: 'opportunity_list', args: { type: 'RFQ' } } },
      adminCtx
    )) as any;
    equal(rfqs.name, 'opportunity_list', 'tool name');
    assert(typeof rfqs.data?.total === 'number', 'total present for counts');
    assert(Array.isArray(rfqs.data?.items), 'items array');
    assert(rfqs.data.items.length <= 25, 'items capped at 25');
    assert(
      (rfqs.data.items as Array<{ OpportunityType: string }>).every((i) => i.OpportunityType === 'RFQ'),
      'every returned row matches the type filter'
    );

    const saved = (await executeDataTool(
      { query: { name: 'opportunity_list', args: { savedOnly: true } } },
      adminCtx
    )) as any;
    assert(typeof saved.data?.total === 'number', 'savedOnly total present');

    const window = (await executeDataTool(
      { query: { name: 'opportunity_list', args: { fromDeadline: '2000-01-01', toDeadline: '2000-01-31' } } },
      adminCtx
    )) as any;
    equal(window.data.total, 0, 'ancient deadline window matches nothing');

    let thrown: unknown = null;
    try {
      await executeDataTool({ query: { name: 'opportunity_list', args: { type: 'NOT_A_TYPE' } } }, adminCtx);
    } catch (err) {
      thrown = err;
    }
    assert(thrown instanceof ValidationError, `bad type arg rejected (got ${thrown instanceof Error ? thrown.name : typeof thrown})`);
    console.log(`  · rfq total=${rfqs.data.total} saved total=${saved.data.total} bad-arg rejected`);
  });

  await checkAsync('gate: pricing.view blocks Viewer on price_comparison before DB access', async () => {
    equal(resolveCapability('pricing.view', 'Viewer').allowed, false, 'Viewer must not read pricing');
    let thrown: unknown = null;
    try {
      await executeDataTool(
        { query: { name: 'price_comparison', args: {} } },
        { userId: 2, role: 'Viewer', dataScope: 'own' }
      );
    } catch (err) {
      thrown = err;
    }
    assert(thrown instanceof ForbiddenError, `expected ForbiddenError, got ${thrown instanceof Error ? thrown.name : thrown}`);
  });

  await checkAsync('audit: the three new AI actions were logged', async () => {
    const res = await db!
      .request()
      .query(
        `SELECT Action, COUNT(*) AS Cnt
         FROM dbo.AuditLog
         WHERE Action IN ('AI_WRITING_SUGGESTED', 'AI_ANALYSIS_GENERATED', 'AI_DATA_QUERY')
           AND CreatedAt >= DATEADD(MINUTE, -15, SYSUTCDATETIME())
         GROUP BY Action`
      );
    const counts = new Map<string, number>(
      res.recordset.map((r: { Action: string; Cnt: number }): [string, number] => [r.Action, r.Cnt])
    );
    for (const action of ['AI_WRITING_SUGGESTED', 'AI_ANALYSIS_GENERATED', 'AI_DATA_QUERY']) {
      assert((counts.get(action) ?? 0) >= 1, `missing audit row for ${action}`);
      console.log(`  · ${action}: ${counts.get(action)}`);
    }
    const ctxAudit = await db!
      .request()
      .query(
        `SELECT COUNT(*) AS Cnt FROM dbo.AuditLog
         WHERE Action = 'AI_DATA_QUERY' AND Detail LIKE '%contextModule%'
           AND CreatedAt >= DATEADD(MINUTE, -15, SYSUTCDATETIME())`
      );
    assert(ctxAudit.recordset[0].Cnt >= 1, 'AI_DATA_QUERY must record the page context module');
    console.log(`  · AI_DATA_QUERY with contextModule: ${ctxAudit.recordset[0].Cnt}`);
  });

  await checkAsync('privacy: writing text is audited as metadata only, never persisted', async () => {
    const conv = await db!
      .request()
      .query(
        `SELECT COUNT(*) AS Cnt FROM dbo.AiConversation
         WHERE Message LIKE '%${WRITING_NONCE}%'`
      );
    equal(conv.recordset[0].Cnt, 0, 'writing text must not reach AiConversation');
    const detail = await db!
      .request()
      .query(
        `SELECT COUNT(*) AS Cnt FROM dbo.AuditLog
         WHERE Action = 'AI_WRITING_SUGGESTED' AND Detail LIKE '%${WRITING_NONCE}%'`
      );
    equal(detail.recordset[0].Cnt, 0, 'audit Detail must not contain the draft text');
  });

  await checkAsync('history: analysis and ask persisted two turns each', async () => {
    const res = await db!
      .request()
      .query(
        `SELECT Surface = CASE WHEN TemplateID IS NULL THEN 'ask' ELSE 'analysis' END,
                Role, COUNT(*) AS Cnt
         FROM dbo.AiConversation
         WHERE CreatedAt >= DATEADD(MINUTE, -15, SYSUTCDATETIME())
         GROUP BY CASE WHEN TemplateID IS NULL THEN 'ask' ELSE 'analysis' END, Role`
      );
    const byKey = new Map<string, number>(
      res.recordset.map(
        (r: { Surface: string; Role: string; Cnt: number }): [string, number] => [`${r.Surface}:${r.Role}`, r.Cnt]
      )
    );
    for (const key of ['ask:user', 'ask:assistant', 'analysis:user', 'analysis:assistant']) {
      assert((byKey.get(key) ?? 0) >= 1, `expected at least one ${key} turn`);
      console.log(`  · ${key}: ${byKey.get(key)}`);
    }
  });

  try {
    await db?.close();
  } catch {
    // closing is best effort
  }
}

// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const live = process.argv.includes('--live');

  sectionA();
  sectionB();
  await sectionBAsync();

  const reachable = await sectionC();

  if (!live) {
    console.log('\n(run with --live to make real model calls and check persistence)');
  } else if (reachable) {
    try {
      const admin = await login('woluman.urgesa@kerchanshe.net');
      await sectionD(admin);
    } catch (err) {
      failures.push(`live section: ${(err as Error).message}`);
      console.log(`  FAIL live section — ${(err as Error).message}`);
    }
    await sectionE();
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
