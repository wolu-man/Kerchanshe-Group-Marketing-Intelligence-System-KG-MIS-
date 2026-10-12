// =============================================================================
// Response Analysis — metrics from the database, interpretation from the model.
//
// Numbers (counts, ratings, trends, distributions) are always computed by SQL
// via the existing `responses.service.getReport` plus two aggregate queries;
// the model only interprets them. Open-text samples are capped and come only
// from submitted, non-erased responses within the caller's data scope.
// =============================================================================

import sql from 'mssql';
import { z } from 'zod';
import { db } from '../../db/pool';
import { audit } from '../../db/audit';
import { logger } from '../../config/logger';
import type { DataScope } from '../../utils/scope';
import { getReport, type ReportFilters } from '../forms/responses.service';
import { persistTurn } from './ai.service';
import { toAppError } from './errors';
import { orchestrate, extractJson } from './orchestrator';
import { assertRateLimit } from './rate-limit';
import type { ChatTurn, ProviderChoice, ProviderId } from './ai.types';
import { ProviderError, type ProviderChatResult } from './providers';
import type { ToolSpec } from './systemPrompt';

export const ANALYSIS_LIMITS = {
  /** Answers sampled per open-text field. */
  samplesPerField: 40,
  /** Characters kept from a single sampled answer. */
  sampleChars: 250,
  /** Total characters of sampled answers handed to the model. */
  sampleBudget: 12000,
  /** Character budget for the whole metrics block in the prompt. */
  promptBudget: 60000,
  historyTurns: 8,
} as const;

// ---------------------------------------------------------------------------
// Tool + prompt
// ---------------------------------------------------------------------------
export const ANALYSIS_TOOL: ToolSpec = {
  name: 'summarize_responses',
  description:
    'Return your analysis of the pre-computed response metrics: summary, findings, themes, sentiment, open-text insights and trends.',
  parameters: {
    type: 'object',
    additionalProperties: true,
    properties: {
      reply: {
        type: 'string',
        description: '2-6 sentence plain-language summary shown as the headline.',
      },
      keyFindings: {
        type: 'array',
        maxItems: 12,
        description: 'The most important facts. Every statement must be backed by the metrics.',
        items: {
          type: 'object',
          properties: {
            statement: { type: 'string' },
            source: { type: 'string', description: 'Which metric/field supports it.' },
          },
          required: ['statement'],
          additionalProperties: true,
        },
      },
      themes: {
        type: 'array',
        maxItems: 12,
        description: 'Recurring topics in open-text answers, with how many sampled answers mention them.',
        items: {
          type: 'object',
          properties: {
            theme: { type: 'string' },
            count: { description: 'Number of sampled answers mentioning it (a number).' },
            examples: { type: 'array', items: { type: 'string' }, maxItems: 2 },
          },
          required: ['theme'],
          additionalProperties: true,
        },
      },
      sentiment: {
        type: 'object',
        description: 'AI estimate over the sampled open-text answers only. Omit when there is no text.',
        properties: {
          positive: { description: 'Estimated positive count (a number).' },
          neutral: { description: 'Estimated neutral count (a number).' },
          negative: { description: 'Estimated negative count (a number).' },
          note: { type: 'string' },
        },
        additionalProperties: true,
      },
      openTextInsights: {
        type: 'array',
        maxItems: 10,
        items: {
          type: 'object',
          properties: {
            fieldKey: { type: 'string' },
            insight: { type: 'string' },
          },
          required: ['fieldKey', 'insight'],
          additionalProperties: true,
        },
      },
      trends: {
        type: 'array',
        maxItems: 10,
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            observation: { type: 'string' },
          },
          required: ['label', 'observation'],
          additionalProperties: true,
        },
      },
    },
    required: ['reply'],
  },
};

const ANALYSIS_SYSTEM = `You are the response analyst inside KG-MIS (Kerchanshe Group Marketing Intelligence System).
You are given METRICS that the system computed directly from the database. A model never computed them.

RULES
- Use ONLY numbers present in METRICS. Never invent, estimate or round to a number that is not there; if something is missing, say so.
- Every keyFinding must be traceable to a metric — put the field or metric name in "source".
- Themes, sentiment and open-text insights are your interpretation of the SAMPLED ANSWERS; label them as based on the sample and never claim they cover answers that are not in the sample.
- Do not identify individual respondents and never quote an answer verbatim longer than a short phrase.
- Do not propose form edits, do not write code or SQL.
- Reply in the same language the form is written in.
- Keep "reply" to 2-6 sentences.`;

function buildUserMessage(question: string | undefined, metricsJson: string): string {
  return [
    'METRICS (computed by the system, authoritative):',
    metricsJson,
    '---',
    `ANALYST REQUEST: ${question?.trim() || 'Summarise the responses, highlight themes, sentiment and trends.'}`,
    'Return your analysis with the summarize_responses tool.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Interpretation contract
// ---------------------------------------------------------------------------
const interpretationSchema = z.object({
  reply: z.string().min(1).max(4000),
  keyFindings: z
    .array(
      z.object({
        statement: z.string().min(1).max(600),
        source: z.string().max(300).optional(),
      })
    )
    .max(12)
    .default([]),
  themes: z
    .array(
      z.object({
        theme: z.string().min(1).max(200),
        count: z.coerce.number().int().min(0).max(100000).optional().catch(undefined),
        examples: z.array(z.string().max(300)).max(2).optional(),
      })
    )
    .max(12)
    .default([]),
  sentiment: z
    .object({
      positive: z.coerce.number().int().min(0).max(100000).optional().catch(undefined),
      neutral: z.coerce.number().int().min(0).max(100000).optional().catch(undefined),
      negative: z.coerce.number().int().min(0).max(100000).optional().catch(undefined),
      note: z.string().max(600).optional().catch(undefined),
    })
    .optional(),
  openTextInsights: z
    .array(z.object({ fieldKey: z.string().min(1).max(100), insight: z.string().min(1).max(700) }))
    .max(10)
    .default([]),
  trends: z
    .array(z.object({ label: z.string().min(1).max(200), observation: z.string().min(1).max(700) }))
    .max(10)
    .default([]),
});

export type Interpretation = z.infer<typeof interpretationSchema>;

function parseInterpretation(result: ProviderChatResult): Interpretation {
  const attempt = (payload: unknown): Interpretation => {
    const parsed = interpretationSchema.safeParse(payload);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ProviderError(
        'malformed-response',
        issue ? `${issue.path.join('.') || '(root)'}: ${issue.message}` : 'Invalid analysis payload'
      );
    }
    if (!parsed.data.reply.trim()) {
      throw new ProviderError('malformed-response', 'The model returned an empty interpretation');
    }
    return parsed.data;
  };

  const call =
    result.toolCalls.find((c) => c.name === ANALYSIS_TOOL.name) ?? result.toolCalls[0] ?? null;
  if (call) {
    try {
      return attempt(call.args);
    } catch (err) {
      if (!result.text) throw err;
    }
  }
  if (result.text) return attempt(extractJson(result.text));
  throw new ProviderError('malformed-response', 'The model returned no analysis');
}

// ---------------------------------------------------------------------------
// Metrics (all numbers come from here)
// ---------------------------------------------------------------------------
export interface AnalysisMetrics {
  total: number;
  submitted: number;
  inProgress: number;
  edited: number;
  firstSubmittedAt: string | null;
  lastSubmittedAt: string | null;
  byMonth: Array<{ month: string; count: number; avgScore: number | null }>;
  fields: unknown[];
  openText: {
    fields: Array<{ key: string; label: string; sampled: number }>;
    samples: Array<{ fieldKey: string; text: string }>;
    totalSampled: number;
    truncated: boolean;
  };
  reportFilters: ReportFilters;
}

function iso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function collectMetrics(
  templateId: number,
  filters: ReportFilters,
  access: { userId: number; dataScope: DataScope }
): Promise<{ metrics: AnalysisMetrics; report: unknown }> {
  const report = await getReport(templateId, filters);

  const scopePredicate =
    access.dataScope === 'own'
      ? 'AND (r.RespondentUserID = @UserId OR t.OwnerUserID = @UserId)'
      : '';

  const summary = await db
    .request()
    .input('TemplateId', sql.Int, templateId)
    .input('UserId', sql.Int, access.userId)
    .input('From', sql.DateTime2, filters.from ?? null)
    .input('To', sql.DateTime2, filters.to ?? null)
    .query(
      `SELECT COUNT(*) AS Total,
              SUM(CASE WHEN r.Status = 'Submitted' THEN 1 ELSE 0 END) AS Submitted,
              SUM(CASE WHEN r.Status = 'InProgress' THEN 1 ELSE 0 END) AS InProgress,
              SUM(CASE WHEN ISNULL(r.EditCount, 0) > 0 THEN 1 ELSE 0 END) AS Edited,
              MIN(r.SubmittedAt) AS FirstSubmittedAt,
              MAX(r.SubmittedAt) AS LastSubmittedAt
         FROM dbo.FormResponse r
         JOIN dbo.FormTemplate t ON t.TemplateID = r.TemplateID
        WHERE r.TemplateID = @TemplateId
          AND r.IsErased = 0
          AND (@From IS NULL OR r.SubmittedAt >= @From)
          AND (@To IS NULL OR r.SubmittedAt <= @To)
          ${scopePredicate}`
    );

  const trend = await db
    .request()
    .input('TemplateId', sql.Int, templateId)
    .input('UserId', sql.Int, access.userId)
    .input('From', sql.DateTime2, filters.from ?? null)
    .input('To', sql.DateTime2, filters.to ?? null)
    .query(
      `SELECT CONVERT(varchar(7), r.SubmittedAt, 120) AS Month,
              COUNT(*) AS Count,
              AVG(CAST(r.TotalScore AS float)) AS AvgScore
         FROM dbo.FormResponse r
         JOIN dbo.FormTemplate t ON t.TemplateID = r.TemplateID
        WHERE r.TemplateID = @TemplateId
          AND r.Status = 'Submitted'
          AND r.IsErased = 0
          AND (@From IS NULL OR r.SubmittedAt >= @From)
          AND (@To IS NULL OR r.SubmittedAt <= @To)
          ${scopePredicate}
        GROUP BY CONVERT(varchar(7), r.SubmittedAt, 120)
        ORDER BY 1`
    );

  const fields = (report?.fields ?? []) as Array<{ key?: string; label?: string; type?: string }>;
  const textFieldKeys = fields
    .filter((f) => f.type === 'shorttext' || f.type === 'longtext')
    .map((f) => String(f.key ?? ''))
    .filter((k) => k.length > 0);

  const sampled: AnalysisMetrics['openText'] = {
    fields: textFieldKeys.map((key) => ({
      key,
      label: String(fields.find((f) => String(f.key) === key)?.label ?? key),
      sampled: 0,
    })),
    samples: [],
    totalSampled: 0,
    truncated: false,
  };

  if (textFieldKeys.length > 0) {
    const request = db
      .request()
      .input('TemplateId', sql.Int, templateId)
      .input('UserId', sql.Int, access.userId)
      .input('From', sql.NVarChar, filters.from ?? null)
      .input('To', sql.NVarChar, filters.to ?? null)
      .input('MaxRows', sql.Int, ANALYSIS_LIMITS.samplesPerField * textFieldKeys.length);
    textFieldKeys.forEach((key, i) => request.input(`Field${i}`, sql.VarChar(100), key));

    const rows = await request.query(
      `SELECT TOP (@MaxRows) a.FieldKey, a.ValueJSON
         FROM dbo.ResponseAnswer a
         JOIN dbo.FormResponse r ON r.ResponseID = a.ResponseID
         JOIN dbo.FormTemplate t ON t.TemplateID = r.TemplateID
        WHERE r.TemplateID = @TemplateId
          AND r.Status = 'Submitted'
          AND r.IsErased = 0
          AND (@From IS NULL OR r.SubmittedAt >= @From)
          AND (@To IS NULL OR r.SubmittedAt <= @To)
          AND (${textFieldKeys.map((_, i) => `a.FieldKey = @Field${i}`).join(' OR ')})
          ${scopePredicate}
        ORDER BY r.SubmittedAt DESC`
    );

    let budget = ANALYSIS_LIMITS.sampleBudget;
    const perField = new Map<string, number>();
    for (const row of rows.recordset as Array<{ FieldKey: string; ValueJSON: string }>) {
      const count = perField.get(row.FieldKey) ?? 0;
      if (count >= ANALYSIS_LIMITS.samplesPerField) continue;
      let text = '';
      try {
        const parsed = JSON.parse(row.ValueJSON) as unknown;
        text = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
      } catch {
        text = String(row.ValueJSON ?? '');
      }
      text = text.trim();
      if (!text) continue;
      if (text.length > ANALYSIS_LIMITS.sampleChars) {
        text = text.slice(0, ANALYSIS_LIMITS.sampleChars);
        sampled.truncated = true;
      }
      if (budget - text.length < 0) {
        sampled.truncated = true;
        break;
      }
      budget -= text.length;
      perField.set(row.FieldKey, count + 1);
      sampled.samples.push({ fieldKey: row.FieldKey, text });
      sampled.totalSampled += 1;
    }
    for (const entry of sampled.fields) entry.sampled = perField.get(entry.key) ?? 0;
  }

  const first = summary.recordset?.[0] ?? {};
  const metrics: AnalysisMetrics = {
    total: Number(first.Total ?? 0),
    submitted: Number(first.Submitted ?? 0),
    inProgress: Number(first.InProgress ?? 0),
    edited: Number(first.Edited ?? 0),
    firstSubmittedAt: iso(first.FirstSubmittedAt),
    lastSubmittedAt: iso(first.LastSubmittedAt),
    byMonth: (trend.recordset ?? []).map((r: { Month: string; Count: number; AvgScore: number | null }) => ({
      month: String(r.Month),
      count: Number(r.Count ?? 0),
      avgScore: r.AvgScore === null || r.AvgScore === undefined ? null : Number(r.AvgScore),
    })),
    fields,
    openText: sampled,
    reportFilters: filters,
  };

  return { metrics, report };
}

function metricsForPrompt(metrics: AnalysisMetrics, report: unknown): { json: string; warnings: string[] } {
  const warnings: string[] = [];
  const payload = {
    responseCounts: {
      total: metrics.total,
      submitted: metrics.submitted,
      inProgress: metrics.inProgress,
      edited: metrics.edited,
      firstSubmittedAt: metrics.firstSubmittedAt,
      lastSubmittedAt: metrics.lastSubmittedAt,
    },
    responseTrend: metrics.byMonth,
    fieldSummaries: (report as { fields?: unknown[] })?.fields ?? [],
    openText: {
      fields: metrics.openText.fields,
      totalSampled: metrics.openText.totalSampled,
      truncated: metrics.openText.truncated,
      samples: metrics.openText.samples,
    },
    filters: metrics.reportFilters,
  };

  let json = JSON.stringify(payload, null, 1);
  if (json.length > ANALYSIS_LIMITS.promptBudget) {
    warnings.push('metrics-truncated-for-prompt');
    const slim = { ...payload, openText: { ...payload.openText, samples: payload.openText.samples.slice(0, 20) } };
    json = JSON.stringify(slim, null, 1).slice(0, ANALYSIS_LIMITS.promptBudget);
    if (!json.endsWith('}')) json += '\n]}';
  }
  return { json, warnings };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
export interface AnalysisRequest {
  provider: ProviderChoice;
  formId: number;
  message?: string;
  filters?: { from?: string; to?: string };
  history?: ChatTurn[];
}

export interface AnalysisResponse {
  provider: ProviderId | null;
  model: string | null;
  reply: string;
  report: unknown;
  metrics: Omit<AnalysisMetrics, 'reportFilters'> & { reportFilters: ReportFilters };
  interpretation: Interpretation;
  warnings: string[];
  durationMs: number;
}

export async function runAnalysis(
  input: AnalysisRequest,
  access: { userId: number; dataScope: DataScope },
  ipAddress?: string | null
): Promise<AnalysisResponse> {
  const started = Date.now();
  assertRateLimit(access.userId);
  const filters: ReportFilters = { ...(input.filters ?? {}) };

  try {
    await persistTurn({
      userId: access.userId,
      formId: input.formId,
      role: 'user',
      message: input.message?.trim() || '(response analysis)',
    });

    const { metrics, report } = await collectMetrics(input.formId, filters, access);
    const { json, warnings } = metricsForPrompt(metrics, report);

    const history = (input.history ?? [])
      .filter((t) => t && typeof t.content === 'string' && t.content.trim())
      .slice(-ANALYSIS_LIMITS.historyTurns)
      .map(
        (t): ChatTurn => ({
          role: t.role === 'assistant' ? 'assistant' : 'user',
          content: t.content.slice(0, 4000),
        })
      );

    const result = await orchestrate({
      provider: input.provider,
      intent: 'analyze',
      messages: [...history, { role: 'user', content: buildUserMessage(input.message, json).slice(0, 120000) }],
      system: ANALYSIS_SYSTEM,
      tool: ANALYSIS_TOOL,
      parse: parseInterpretation,
    });

    const interpretation = result.response;
    const { reportFilters, ...metricOut } = metrics;

    await persistTurn({
      userId: access.userId,
      formId: input.formId,
      role: 'assistant',
      provider: result.provider,
      model: result.model,
      message: interpretation.reply,
      actions: {
        kind: 'analysis',
        findings: interpretation.keyFindings.length,
        themes: interpretation.themes.length,
        totalResponses: metrics.total,
      },
      durationMs: Date.now() - started,
      success: true,
    });

    await audit({
      userId: access.userId,
      action: 'AI_ANALYSIS_GENERATED',
      entity: 'FormTemplate',
      entityId: input.formId,
      detail: {
        provider: result.provider,
        model: result.model,
        total: metrics.total,
        submitted: metrics.submitted,
        sampledAnswers: metrics.openText.totalSampled,
      },
      ipAddress: ipAddress ?? null,
    });

    return {
      provider: result.provider,
      model: result.model,
      reply: interpretation.reply,
      report,
      metrics: { ...metricOut, reportFilters },
      interpretation,
      warnings,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    const appError = toAppError(err);
    logger.warn('ai.analysis.failed', {
      formId: input.formId,
      code: appError.code ?? 'unknown',
      message: appError.message.slice(0, 200),
    });
    throw appError;
  }
}
