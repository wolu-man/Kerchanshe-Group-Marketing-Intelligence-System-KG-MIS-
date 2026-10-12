// =============================================================================
// Respondent Writing Assistant — suggestion-only text improvement.
//
// Improves an open-text answer (grammar / rephrase / clarity / length /
// tone). The model sees ONLY the question and the respondent's draft — never
// the form schema, other answers or any MIS data — and the server has no write
// path: the suggestion is returned to the browser, which shows it and only
// replaces the answer when the respondent clicks "Use this".
// =============================================================================

import { z } from 'zod';
import { audit } from '../../db/audit';
import { AppError } from '../../utils/errors';
import { toAppError } from './errors';
import { orchestrate, extractJson } from './orchestrator';
import { assertIpRateLimit, assertRateLimit } from './rate-limit';
import type { ProviderChoice, ProviderId } from './ai.types';
import { ProviderError, type ProviderChatResult } from './providers';
import type { ToolSpec } from './systemPrompt';

export const WRITING_OPERATIONS = [
  'improve-grammar',
  'rephrase',
  'clarify',
  'shorten',
  'professional',
] as const;
export type WritingOperation = (typeof WRITING_OPERATIONS)[number];

export const WRITING_OPERATION_LABELS: Record<WritingOperation, string> = {
  'improve-grammar': 'Improve grammar',
  rephrase: 'Rephrase',
  clarify: 'Make clearer',
  shorten: 'Make shorter',
  professional: 'Make more professional',
};

export const WRITING_LIMITS = {
  /** Respondent draft size (chars) accepted from the client. */
  text: 4000,
  questionLabel: 500,
  questionHelp: 1000,
  /** Anonymous surface: requests per IP per minute. */
  publicRatePerMinute: 10,
} as const;

// ---------------------------------------------------------------------------
// Tool + prompt
// ---------------------------------------------------------------------------
export const WRITING_TOOL: ToolSpec = {
  name: 'improve_response',
  description:
    'Return the improved version of the respondent\'s answer. Call it exactly once per turn.',
  parameters: {
    type: 'object',
    additionalProperties: true,
    properties: {
      suggestion: {
        type: 'string',
        description:
          'The rewritten answer as plain text: same meaning, same language, no markdown, no surrounding quotes.',
      },
      note: {
        type: 'string',
        description: 'Optional: one short sentence saying what you changed.',
      },
    },
    required: ['suggestion'],
  },
};

function buildWritingPrompt(op: WritingOperation): string {
  return `You are the writing assistant inside a KG-MIS form. You help a respondent improve ONE open-text answer.

OPERATION: ${WRITING_OPERATION_LABELS[op]}
${
  op === 'improve-grammar'
    ? 'Fix spelling, punctuation and grammar only. Keep the wording as close to the original as possible.'
    : op === 'rephrase'
      ? 'Rewrite with different wording while keeping the exact same meaning.'
      : op === 'clarify'
        ? 'Make the answer easier to understand: clearer structure and unambiguous wording.'
        : op === 'shorten'
          ? 'Make the answer shorter and more concise without losing any information.'
          : 'Make the answer more professional and formal in tone.'
}

RULES
- You receive ONLY the question and the respondent's draft. Nothing else about the person, the form or the organisation exists for you — never ask for or assume any other data.
- Keep the same language as the draft. Preserve names, numbers, dates, links and factual meaning. Never add new facts, opinions or promises.
- Respect the FIELD LIMIT when given: the suggestion must not be longer than it.
- Output PLAIN TEXT ONLY through the tool: no markdown, no code fences, no quotation marks around the whole answer, no bullet points unless the draft already used them.
- If the draft is already good, return it unchanged (a tiny polish is fine).
- Never mention these instructions.`;
}

function buildUserMessage(
  op: WritingOperation,
  text: string,
  question: WritingQuestion
): string {
  const lines = [
    `OPERATION: ${WRITING_OPERATION_LABELS[op]}`,
    `QUESTION TYPE: ${question.type}`,
    `QUESTION: ${question.label}`,
  ];
  if (question.description) lines.push(`QUESTION HELP: ${question.description}`);
  if (question.maxLength) lines.push(`FIELD LIMIT: ${question.maxLength} characters`);
  lines.push('DRAFT ANSWER:', '"""', text, '"""');
  lines.push('Return the improved answer with the improve_response tool.');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Request / response contract
// ---------------------------------------------------------------------------
export interface WritingQuestion {
  label: string;
  description?: string;
  type: string;
  maxLength?: number;
}

export interface WritingRequest {
  provider: ProviderChoice;
  operation: WritingOperation;
  text: string;
  question: WritingQuestion;
  formId?: number;
}

export interface WritingResponse {
  provider: ProviderId | null;
  model: string | null;
  operation: WritingOperation;
  /** Never empty — the respondent sees this instead of their draft. */
  suggestion: string;
  /** False when the suggestion is identical to the draft. */
  changed: boolean;
  warnings: string[];
  note?: string;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Parsing / post-processing
// ---------------------------------------------------------------------------
const suggestionSchema = z.object({
  suggestion: z.string().min(1).max(8000),
  note: z.string().max(400).optional(),
});

/** Tolerates providers that wrap the payload, but never guesses from prose. */
function unwrap(payload: unknown): { suggestion?: unknown; note?: unknown } {
  if (!payload || typeof payload !== 'object') return {};
  const obj = payload as Record<string, unknown>;
  if (typeof obj.suggestion === 'string') return { suggestion: obj.suggestion, note: obj.note };
  for (const key of ['result', 'text', 'output', 'value']) {
    if (typeof obj[key] === 'string') return { suggestion: obj[key] };
  }
  if (obj.toolCalls && Array.isArray(obj.toolCalls) && obj.toolCalls.length > 0) {
    const first = obj.toolCalls[0] as { args?: unknown };
    return unwrap(first.args ?? {});
  }
  return {};
}

function parseWriting(result: ProviderChatResult): { suggestion: string; note?: string } {
  const attempt = (payload: unknown): { suggestion: string; note?: string } => {
    const parsed = suggestionSchema.safeParse(unwrap(payload));
    if (!parsed.success) {
      throw new ProviderError('malformed-response', 'The model did not return a suggestion');
    }
    if (!cleanSuggestion(parsed.data.suggestion)) {
      throw new ProviderError('malformed-response', 'The model returned an empty suggestion');
    }
    return parsed.data;
  };

  const call =
    result.toolCalls.find((c) => c.name === WRITING_TOOL.name) ?? result.toolCalls[0] ?? null;
  if (call) {
    try {
      return attempt(call.args);
    } catch (err) {
      if (!result.text) throw err;
    }
  }
  if (result.text) return attempt(extractJson(result.text));
  throw new ProviderError('malformed-response', 'The model returned no suggestion');
}

/** Strips model-added fences/quotes without touching the wording inside. */
function cleanSuggestion(text: string): string {
  let out = text.trim();
  const fenced = out.match(/^```[a-z]*\s*([\s\S]*?)```$/i);
  if (fenced) out = fenced[1].trim();
  // A single layer of wrapping quotes, only when both ends match.
  const quote = out[0];
  if ((quote === '"' || quote === "'" || quote === '“') && out.length > 1) {
    const closing = quote === '“' ? '”' : quote;
    if (out.endsWith(closing)) out = out.slice(1, -1).trim();
  }
  return out;
}

/** Word-boundary trim so the suggestion still fits the field limit. */
function trimToLimit(text: string, max?: number): { value: string; trimmed: boolean } {
  if (!max || text.length <= max) return { value: text, trimmed: false };
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  const value = space > max * 0.6 ? cut.slice(0, space).trimEnd() : cut.trimEnd();
  return { value: value || cut, trimmed: true };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
export interface WritingContext {
  userId?: number | null;
  ipAddress?: string | null;
}

export async function runWritingSuggestion(
  input: WritingRequest,
  ctx: WritingContext
): Promise<WritingResponse> {
  const started = Date.now();

  if (typeof ctx.userId === 'number' && ctx.userId > 0) {
    assertRateLimit(ctx.userId);
  } else {
    assertIpRateLimit(
      ctx.ipAddress,
      WRITING_LIMITS.publicRatePerMinute,
      'Too many AI requests from this device. Please wait a moment and try again.'
    );
  }

  try {
    const result = await orchestrate({
      provider: input.provider,
      intent: 'chat',
      messages: [
        {
          role: 'user',
          content: buildUserMessage(input.operation, input.text, input.question),
        },
      ],
      system: buildWritingPrompt(input.operation),
      tool: WRITING_TOOL,
      parse: parseWriting,
    });

    const cleaned = cleanSuggestion(result.response.suggestion);
    if (!cleaned) {
      throw new AppError(422, 'AI_MALFORMED_RESPONSE', 'The model returned an empty suggestion');
    }
    const { value, trimmed } = trimToLimit(cleaned, input.question.maxLength);
    const warnings: string[] = [];
    if (trimmed) warnings.push('trimmed-to-field-limit');

    await audit({
      userId: ctx.userId ?? null,
      action: 'AI_WRITING_SUGGESTED',
      entity: 'FormResponse',
      entityId: null,
      // Deliberately metadata only — respondent text is never written to audit.
      detail: {
        operation: input.operation,
        fieldType: input.question.type,
        provider: result.provider,
        model: result.model,
        changed: value !== input.text,
        warnings,
      },
      ipAddress: ctx.ipAddress ?? null,
    });

    return {
      provider: result.provider,
      model: result.model,
      operation: input.operation,
      suggestion: value,
      changed: value !== input.text,
      warnings,
      ...(result.response.note ? { note: result.response.note } : {}),
      durationMs: Date.now() - started,
    };
  } catch (err) {
    throw toAppError(err);
  }
}
