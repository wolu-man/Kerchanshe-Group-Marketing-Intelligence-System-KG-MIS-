// =============================================================================
// AI Form Assistant — orchestration.
// Chooses a provider (explicit choice > AI_PROVIDER default > auto routing),
// calls it, retries once with strict-JSON output if the model ignored the tool,
// and validates the result against the same schema the tool advertises.
//
// Provider selection and fallback are shared by every AI feature: the form
// assistant, respondent writing assistant, response analysis and data
// intelligence only override `system`, `tool` and `parse` — never the routing.
// =============================================================================

import { env } from '../../config/env';
import { logger } from '../../config/logger';
import type { ChatTurn, Intent, ProviderChoice, ProviderId } from './ai.types';
import { modelResponseSchema, type ModelResponse } from './actions';
import {
  candidateProviders,
  defaultModel,
  isConfigured,
  PROVIDERS,
  ProviderError,
  type ProviderChatResult,
} from './providers';
import { FORM_TOOL, buildSystemPrompt, type ToolSpec } from './systemPrompt';

export interface OrchestrateInput<T = ModelResponse> {
  provider: ProviderChoice;
  intent: Intent;
  messages: ChatTurn[];
  timeoutMs?: number;
  /** Defaults to the Form Builder system prompt. */
  system?: string;
  /** Defaults to the propose_form_changes tool. */
  tool?: ToolSpec;
  /** Validates/parses the provider result. Defaults to the form tool schema. */
  parse?: (result: ProviderChatResult) => T;
}

export interface OrchestrateResult<T = ModelResponse> {
  provider: ProviderId;
  model: string;
  response: T;
  durationMs: number;
}

/** Requested choice + env default (if any) + auto chain, de-duplicated. */
function resolveCandidates(choice: ProviderChoice, intent: Intent): ProviderId[] {
  const auto = candidateProviders('auto', intent);
  const envDefault = env.ai.provider;
  const ordered: ProviderId[] = [];

  if (choice !== 'auto' && choice !== envDefault) ordered.push(choice);
  if (envDefault !== 'auto') ordered.push(envDefault as ProviderId);
  if (choice === 'auto' || envDefault === 'auto') ordered.push(...auto);

  const seen = new Set<ProviderId>();
  return ordered.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** Pull the JSON object out of a model reply (handles code fences and prose). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new ProviderError('malformed-response', 'The model did not return a JSON object');
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    throw new ProviderError('malformed-response', 'The model returned invalid JSON');
  }
}

function firstIssue(error: { issues: Array<{ path: (string | number)[]; message: string }> }): string {
  const issue = error.issues[0];
  if (!issue) return 'invalid payload';
  const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
  return `${path}: ${issue.message}`;
}

function parseModelOutput(result: ProviderChatResult, tool: ToolSpec): ModelResponse {
  const attempt = (payload: unknown): ModelResponse => {
    const parsed = modelResponseSchema.safeParse(payload);
    if (!parsed.success) throw new ProviderError('malformed-response', firstIssue(parsed.error));
    return parsed.data;
  };

  const call = result.toolCalls.find((c) => c.name === tool.name) ?? result.toolCalls[0];
  if (call) {
    try {
      return attempt(call.args);
    } catch (err) {
      if (!result.text) throw err;
    }
  }

  if (result.text) return attempt(extractJson(result.text));
  throw new ProviderError('malformed-response', 'The model returned no tool call and no JSON');
}

export async function orchestrate<T = ModelResponse>(
  input: OrchestrateInput<T>
): Promise<OrchestrateResult<T>> {
  const candidates = resolveCandidates(input.provider, input.intent);
  const configured = candidates.filter((id) => isConfigured(id));

  if (configured.length === 0) {
    throw new ProviderError(
      'not-configured',
      'No AI provider is configured. Set GEMINI_API_KEY or GROQ_API_KEY, or start Ollama with "ollama serve".'
    );
  }

  const system = input.system ?? buildSystemPrompt();
  const tool = input.tool ?? FORM_TOOL;
  const parse: (result: ProviderChatResult) => T =
    input.parse ?? ((result: ProviderChatResult) => parseModelOutput(result, tool) as unknown as T);
  const timeoutMs = input.timeoutMs ?? env.ai.timeoutMs;
  let lastError: ProviderError | null = null;

  for (const id of configured) {
    const provider = PROVIDERS[id];
    let model = defaultModel(id);

    try {
      if (id === 'ollama' && !model) {
        const status = await provider.status();
        if (!status.available || !status.model) {
          lastError = new ProviderError('unavailable', status.detail ?? 'Ollama is not available');
          continue;
        }
        model = status.model;
      }

      let result: ProviderChatResult;
      let response: T;
      try {
        result = await provider.chat({
          system,
          messages: input.messages,
          model,
          tool,
          timeoutMs,
        });
        response = parse(result);
      } catch (err) {
        if (!(err instanceof ProviderError) || err.category !== 'malformed-response') throw err;
        // The model ignored the tool contract (bad tool args or plain prose) —
        // retry once with plain JSON, then parse again.
        result = await provider.chat({
          system,
          messages: input.messages,
          model,
          tool,
          timeoutMs,
          strictJson: true,
        });
        response = parse(result);
      }

      logger.info('ai.assistant.completed', {
        provider: id,
        model: result.model,
        durationMs: result.durationMs,
        tool: tool.name,
      });

      return { provider: id, model: result.model, response, durationMs: result.durationMs };
    } catch (err) {
      if (err instanceof ProviderError) {
        lastError = err;
      } else {
        lastError = new ProviderError('internal', 'Unexpected error while calling the AI provider');
      }
      logger.warn('ai.assistant.provider_failed', {
        provider: id,
        category: lastError.category,
        message: lastError.message.slice(0, 200),
      });
      // A timeout on the last candidate would only add another long wait.
      if (lastError.category === 'timeout' && id === configured[configured.length - 1]) throw lastError;
    }
  }

  if (lastError) throw lastError;
  throw new ProviderError(
    'unavailable',
    'Ollama is currently unavailable. You can switch to Gemini or Groq.'
  );
}
