// =============================================================================
// Domain-aware data intelligence — natural language → safe data answers.
//
// Two bounded rounds, both through the shared orchestrator (same providers,
// routing, fallback and rate limits as the form assistant):
//   1. the model picks ONE query from the read-only catalogue (or answers);
//   2. the server validates + executes it and the model answers with the
//      actual numbers, which the response carries back as `sources`.
// The model never writes SQL, never sees credentials and cannot mutate data.
// =============================================================================

import { z } from 'zod';
import { audit } from '../../db/audit';
import { logger } from '../../config/logger';
import { AppError } from '../../utils/errors';
import type { DataScope } from '../../utils/scope';
import { persistTurn } from './ai.service';
import {
  DATA_TOOL,
  dataCatalogueText,
  executeDataTool,
  type DataToolContext,
  type DataToolResult,
} from './dataTools';
import { toAppError } from './errors';
import { extractJson, orchestrate } from './orchestrator';
import { assertRateLimit } from './rate-limit';
import { attachmentBlock, loadAttachment, type LoadedAttachment } from './attachments';
import type { ChatTurn, ProviderChoice, ProviderId } from './ai.types';
import { ProviderError, type ProviderChatResult } from './providers';
import type { ToolSpec } from './systemPrompt';

export const ANSWER_TOOL: ToolSpec = {
  name: 'answer_question',
  description: 'Return your final answer to the user, grounded in the data you were given.',
  parameters: {
    type: 'object',
    additionalProperties: true,
    properties: {
      answer: { type: 'string', description: 'The complete answer. Plain text, may use short lists.' },
    },
    required: ['answer'],
  },
};

const GLOSSARY = `KG-MIS ENTITIES (what exists, and which query to use):
- products: catalogue, categories, price tiers → product_overview; availability → product_availability
- product colors: palettes and "by color" splits → product_overview; to slice sales, weekly sales, pricing, availability or forecasts by one color, pass colorId (the numeric color id) on the queries that list it; rows without a captured color are reported as "Unspecified"
- pricing: our prices vs competitor prices, gaps → price_comparison
- competitors: observed competitor prices/promotions → competitor_intel
- customers: counts by type/region/rating → customer_overview
- regions & outlets: appear as regionId filters on the queries that support them
- surveys / form responses: counts, ratings, trends for one form → survey_metrics (needs formId)
- interviews: satisfaction and sentiment → interview_overview; recurring feedback themes, praise, complaints → interview_themes
- sales: ERP monthly sales → sales_summary; field weekly sales → weekly_sales_summary; "vs last month/period", decline or growth between two windows → sales_period_comparison
- executive / overall business summary, KPI snapshot, alerts → executive_report_summary
- multimedia (photos/videos/audio): counts by type or validation status → multimedia_overview
- market visits → market_visits; KPIs → kpi_performance
- opportunities / tenders / RFQs / buyer leads / trade intelligence: totals, KPI cards, saved, high-relevance, export (outside Ethiopia), breakdowns by source/country/sector/product group, relevance distribution, deadline trend → opportunity_overview; searching, filtering, counting or listing them (by type, buyer, sector, product group, business unit, relevance, publication or deadline dates, confidence, data quality, "closing soon", my saved) → opportunity_list (its total is the count and its items carry title, organization, deadline, relevance and score)

FORECASTS & ANOMALIES (the system computes the numbers — you only explain them):
- future sales, weekly sales, KPI, competitor price, price gap, product demand, customer growth, survey volume, interview/visit activity, media capture → forecast_*, predict_* queries (they return a forecast with a band, the model used and a confidence level)
- "is this normal?", unusual spike or dip in a series → detect_anomalies (needs module, e.g. sales or kpi)
- forecasts are estimates with stated confidence — always quote the confidence level and never present a forecast as a certainty.`;

export const ROUND1_SYSTEM = `You are the KG-MIS data assistant (Kerchanshe Group Marketing Intelligence System).
You answer questions about marketing intelligence data using ONLY the read-only and forecast queries below.

OUTPUT CONTRACT
- Call the tool "${DATA_TOOL.name}" exactly once with { reply, query }.
- If you can answer without data (definitions, capabilities, how-to), set query to null and put the answer in reply.
- Otherwise set query = { name, args } using EXACTLY one catalogue entry.

RULES
- You must NEVER output SQL, code, shell commands or file paths, and you can never modify data — only read.
- Only use query names from the catalogue; never invent names or arguments.
- An ATTACHMENT block may follow the question (user file content): answer from it directly (query: null) when it answers the question, or combine it with a catalogue query; cite it in reply as "source: attachment:<filename>".
- Ask a short clarifying question (in reply, query: null) when the request is genuinely ambiguous.
- Reply in the same language the user wrote in.

${GLOSSARY}

CATALOGUE:
${dataCatalogueText()}`;

export const ROUND2_SYSTEM = `You are the KG-MIS data assistant. The DATA below was computed by the system from the live database — it is authoritative and you did not compute it.

RULES
- Use ONLY numbers that appear in the DATA. Never invent, extrapolate or restate a number that is not there; if the data does not answer the question, say exactly what is missing.
- Forecast rows are estimates produced by the system: quote them as "projected", state the confidence level (High/Medium/Low/Insufficient) and never present them as guaranteed outcomes.
- Cite the sources by their query name when a conclusion depends on them (e.g. "source: sales_summary").
- An ATTACHMENT block (if present) is user-provided file content: you may rely on it and cite it as "source: attachment:<filename>". If the question refers to an image you cannot see, say so plainly instead of guessing.
- Never output SQL or code, never propose changes to data.
- Keep the answer focused: direct answer first, then 2-5 supporting points. Short lists are fine.
- Reply in the same language the user wrote in.

Return the answer with the ${ANSWER_TOOL.name} tool.`;

// ---------------------------------------------------------------------------
// Page context (global launcher) — minimum-necessary, advisory only.
// It never widens permissions: guards and catalogue rules apply unchanged.
// ---------------------------------------------------------------------------
export interface AskContext {
  module: string;
  label?: string;
  recordId?: number;
  filters?: Array<{ k: string; v: string }>;
}

function contextLine(context: AskContext): string {
  const parts = [`the user is on the "${context.module}" surface`];
  if (context.recordId) parts.push(`working with record #${context.recordId}`);
  if (context.label) parts.push(`viewing "${context.label}"`);
  if (context.filters?.length) {
    parts.push(`with filters ${context.filters.map((f) => `${f.k}=${f.v}`).join(', ')}`);
  }
  return `${parts.join(' ')}. Use it only to interpret the question — it grants NO extra data access; permissions, scope and catalogue rules above are unchanged.`;
}

/** Round-1 prompt, optionally suffixed with the advisory page-context line. */
export function buildRound1System(context?: AskContext): string {
  if (!context) return ROUND1_SYSTEM;
  return `${ROUND1_SYSTEM}\n\nPAGE CONTEXT (minimum necessary, advisory): ${contextLine(context)}`;
}

// ---------------------------------------------------------------------------
// Round 1 parsing
// ---------------------------------------------------------------------------
const selectionSchema = z.object({
  reply: z.string().max(3000).default(''),
  query: z
    .object({
      name: z.string().min(1).max(60),
      args: z.record(z.unknown()).optional(),
    })
    .nullable()
    .optional(),
});

type Selection = z.infer<typeof selectionSchema>;

function parseSelection(result: ProviderChatResult): Selection {
  const attempt = (payload: unknown): Selection => {
    const parsed = selectionSchema.safeParse(payload);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ProviderError(
        'malformed-response',
        issue ? `${issue.path.join('.') || '(root)'}: ${issue.message}` : 'Invalid selection'
      );
    }
    if (!parsed.data.query && !parsed.data.reply.trim()) {
      throw new ProviderError('malformed-response', 'The model returned neither a query nor a reply');
    }
    return parsed.data;
  };

  const call = result.toolCalls.find((c) => c.name === DATA_TOOL.name) ?? result.toolCalls[0] ?? null;
  if (call) {
    try {
      return attempt(call.args);
    } catch (err) {
      if (!result.text) throw err;
    }
  }
  if (result.text) return attempt(extractJson(result.text));
  throw new ProviderError('malformed-response', 'The model returned no response');
}

const answerSchema = z.object({ answer: z.string().min(1).max(8000) });

function parseAnswer(result: ProviderChatResult): { answer: string } {
  const attempt = (payload: unknown): { answer: string } => {
    const obj = (payload ?? {}) as Record<string, unknown>;
    const candidate =
      typeof obj.answer === 'string'
        ? { answer: obj.answer }
        : typeof obj.reply === 'string'
          ? { answer: obj.reply }
          : typeof obj.text === 'string'
            ? { answer: obj.text }
            : null;
    const parsed = answerSchema.safeParse(candidate);
    if (!parsed.success) throw new ProviderError('malformed-response', 'The model returned no answer');
    if (!parsed.data.answer.trim()) throw new ProviderError('malformed-response', 'The model returned an empty answer');
    return parsed.data;
  };

  const call = result.toolCalls.find((c) => c.name === ANSWER_TOOL.name) ?? result.toolCalls[0] ?? null;
  if (call) {
    try {
      return attempt(call.args);
    } catch (err) {
      if (!result.text) throw err;
    }
  }
  if (result.text) return attempt(extractJson(result.text));
  throw new ProviderError('malformed-response', 'The model returned no answer');
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
export interface AskAttachment {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
}

export interface AskRequest {
  provider: ProviderChoice;
  question: string;
  history?: ChatTurn[];
  context?: AskContext;
  /** One uploaded file (POST /ai/attachments) referenced by its stored id. */
  attachment?: AskAttachment;
}

export interface AskResponse {
  provider: ProviderId | null;
  model: string | null;
  answer: string;
  /** Tool outputs behind the answer — shown as "Data used". */
  sources: DataToolResult[];
  durationMs: number;
  warnings: string[];
}

/** True when the retry picked the exact same query+args that already failed. */
function selectionMatches(prev: Selection, next: NonNullable<Selection['query']>): boolean {
  if (prev.query?.name !== next.name) return false;
  return JSON.stringify(prev.query?.args ?? {}) === JSON.stringify(next.args ?? {});
}

function historyTurns(history: ChatTurn[] | undefined): ChatTurn[] {
  return (history ?? [])
    .filter((t) => t && typeof t.content === 'string' && t.content.trim())
    .slice(-8)
    .map((t) => ({ role: t.role === 'assistant' ? ('assistant' as const) : ('user' as const), content: t.content.slice(0, 4000) }));
}

export async function runAsk(
  input: AskRequest,
  access: { userId: number; role: string; dataScope: DataScope },
  ipAddress?: string | null
): Promise<AskResponse> {
  const started = Date.now();
  assertRateLimit(access.userId);
  const ctx: DataToolContext = {
    userId: access.userId,
    role: access.role,
    dataScope: access.dataScope,
  };

  try {
    await persistTurn({ userId: access.userId, role: 'user', message: input.question });

    // --- Attachment: load once, reuse for both rounds (missing file → honest 404) ---
    const warnings: string[] = [];
    let attachment: LoadedAttachment | null = null;
    if (input.attachment) {
      attachment = await loadAttachment(input.attachment.id, input.attachment.name);
      if (attachment.kind === 'document' && !attachment.extractable) {
        warnings.push(`The file "${attachment.filename}" could not be read — it was not included.`);
      } else if (attachment.kind === 'document' && !attachment.text) {
        warnings.push(`The file "${attachment.filename}" was empty.`);
      }
    }
    const attText = attachment ? attachmentBlock(attachment) : '';
    const round1Content = `${input.question.slice(0, 2000)}${attText}`;

    // Images are only rendered by Gemini; other providers get the text alone.
    let images = attachment?.image ? [attachment.image] : [];
    let providerChoice = input.provider;
    if (images.length > 0) {
      if (input.provider === 'groq' || input.provider === 'ollama') {
        warnings.push(`The "${input.provider}" provider cannot view images — it answered from your text question only.`);
        images = [];
      } else {
        providerChoice = 'gemini';
      }
    }

    // --- Round 1: pick a query (or answer directly) ---
    const first = await orchestrate({
      provider: providerChoice,
      intent: 'chat',
      messages: [
        ...historyTurns(input.history),
        { role: 'user', content: round1Content, ...(images.length ? { images } : {}) },
      ],
      system: buildRound1System(input.context),
      tool: DATA_TOOL,
      parse: parseSelection,
    });
    if (images.length > 0 && first.provider !== 'gemini') {
      warnings.push('The image could not be viewed by the active provider — the answer used your text question only.');
    }

    const sources: DataToolResult[] = [];
    let answer = first.response.reply.trim();
    let selection = first.response;

    if (selection.query) {
      try {
        sources.push(await executeDataTool({ query: selection.query }, ctx));
      } catch (err) {
        // The model picked a valid catalogue entry but bad arguments (an alias
        // we could not resolve, a horizon out of range, …). One corrective
        // retry with the exact reason, then surface the error honestly.
        const appError = toAppError(err);
        if (appError.code !== 'VALIDATION_ERROR' && appError.code !== 'AI_UNKNOWN_TOOL') throw appError;

        const retry = await orchestrate({
          provider: providerChoice,
          intent: 'chat',
          messages: [
            ...historyTurns(input.history),
            { role: 'user', content: round1Content, ...(images.length ? { images } : {}) },
            {
              role: 'assistant',
              content: `My previous query was rejected: ${appError.message}. Pick a different query or correct the arguments and try again.`,
            },
          ],
          system: buildRound1System(input.context),
          tool: DATA_TOOL,
          parse: parseSelection,
        });

        if (retry.response.query && selectionMatches(selection, retry.response.query)) {
          // Same broken call again — surface the honest failure instead of a hollow acknowledgement.
          throw appError;
        }
        if (retry.response.query) {
          selection = retry.response;
          sources.push(await executeDataTool({ query: selection.query }, ctx));
        } else {
          answer = retry.response.reply.trim() || answer;
        }
      }
    }

    const result = sources[sources.length - 1];
    if (result) {
      // --- Round 2: answer grounded in the actual data ---
      const dataJson = JSON.stringify(
        { source: result.name, label: result.label, args: result.args, rows: result.rowCount, data: result.data },
        null,
        1
      );
      const second = await orchestrate({
        provider: providerChoice,
        intent: 'chat',
        messages: [
          {
            role: 'user',
            content: [
              `DATA (${result.label} · ${result.name}):`,
              dataJson.slice(0, 40000),
              '---',
              `QUESTION: ${input.question.slice(0, 2000)}`,
              ...(input.context
                ? [`PAGE CONTEXT (advisory only): ${contextLine(input.context)}`]
                : []),
              ...(attText ? [attText.trimStart()] : []),
            ].join('\n'),
            ...(images.length ? { images } : {}),
          },
        ],
        system: ROUND2_SYSTEM,
        tool: ANSWER_TOOL,
        parse: parseAnswer,
      });
      if (images.length > 0 && second.provider !== 'gemini' && !warnings.some((w) => w.startsWith('The image'))) {
        warnings.push('The image could not be viewed by the active provider — the answer used your text question only.');
      }
      answer = second.response.answer.trim();
    }

    if (!answer) throw new AppError(422, 'AI_MALFORMED_RESPONSE', 'The model returned an empty answer');

    await persistTurn({
      userId: access.userId,
      role: 'assistant',
      provider: first.provider,
      model: first.model,
      message: answer,
      actions: { kind: 'ask', queries: sources.map((s) => s.name), rows: sources.map((s) => s.rowCount) },
      durationMs: Date.now() - started,
      success: true,
    });

    await audit({
      userId: access.userId,
      action: 'AI_DATA_QUERY',
      entity: 'MISData',
      entityId: null,
      detail: {
        provider: first.provider,
        model: first.model,
        tools: sources.map((s) => s.name),
        rows: sources.map((s) => s.rowCount),
        questionChars: input.question.length,
        contextModule: input.context?.module ?? null,
        ...(attachment
          ? {
              attachment: {
                name: attachment.filename,
                kind: attachment.kind,
                sizeBytes: attachment.sizeBytes,
                readable: attachment.kind === 'image' ? true : Boolean(attachment.extractable),
              },
            }
          : {}),
      },
      ipAddress: ipAddress ?? null,
    });

    return {
      provider: first.provider,
      model: first.model,
      answer,
      sources,
      durationMs: Date.now() - started,
      warnings,
    };
  } catch (err) {
    const appError = toAppError(err);
    logger.warn('ai.ask.failed', {
      userId: access.userId,
      code: appError.code ?? 'unknown',
      message: appError.message.slice(0, 200),
    });
    throw appError;
  }
}
