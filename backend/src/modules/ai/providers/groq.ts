// =============================================================================
// AI Form Assistant — Groq provider (OpenAI-compatible Chat Completions API).
// Native fetch; the key is sent only in the Authorization header.
// =============================================================================

import { env } from '../../../config/env';
import type { ProviderStatus } from '../ai.types';
import type { ToolSpec } from '../systemPrompt';
import {
  elapsed,
  ProviderError,
  reasonFromBody,
  requestJson,
  type AIProvider,
  type ProviderChatRequest,
  type ProviderChatResult,
} from './provider';

const BASE = 'https://api.groq.com/openai/v1';
export const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';

interface ModelsResponse {
  data?: Array<{ id?: string }>;
}

interface CompletionsResponse {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{ function?: { name?: string; arguments?: string } }>;
    };
    finish_reason?: string;
  }>;
  error?: { message?: string };
}

function toMessages(req: ProviderChatRequest): Array<Record<string, string>> {
  // Groq rejects response_format json_object unless the word "json" appears
  // somewhere in the messages — strict-JSON retries must mention it.
  const system = req.strictJson
    ? `${req.system}\n\nReply with a single JSON object only — json output is required.`
    : req.system;
  return [
    { role: 'system', content: system },
    ...req.messages.map((m) => ({ role: m.role, content: m.content })),
  ];
}

function openAiTool(tool: ToolSpec): Array<Record<string, unknown>> {
  return [
    {
      type: 'function',
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    },
  ];
}

function parseToolCalls(raw: Array<{ function?: { name?: string; arguments?: string } }> | undefined) {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ name: string; args: unknown }> = [];
  for (const call of raw) {
    const fn = call.function;
    if (!fn?.name) continue;
    let args: unknown = {};
    if (typeof fn.arguments === 'string') {
      try {
        args = JSON.parse(fn.arguments);
      } catch {
        args = {};
      }
    }
    out.push({ name: fn.name, args });
  }
  return out;
}

function mapError(status: number, body: string): ProviderError {
  const reason = reasonFromBody(body);
  if (status === 401 || status === 403) {
    return new ProviderError('not-configured', 'The Groq API key was rejected');
  }
  if (status === 404) return new ProviderError('provider-error', 'Groq model not found — check GROQ_MODEL');
  if (status === 429) return new ProviderError('rate-limited', 'Groq rate limit reached — try again shortly');
  if (status >= 500) return new ProviderError('unavailable', 'Groq is temporarily unavailable');
  if (status === 400 && reason && /tool call validation|did not match schema/i.test(reason)) {
    // The model produced arguments that violate the tool schema — this is a
    // model contract failure, so the orchestrator may retry with strict JSON.
    return new ProviderError('malformed-response', `Groq rejected the model's tool call: ${reason.slice(0, 300)}`);
  }
  return new ProviderError('provider-error', `Groq request failed (HTTP ${status})${reason ? `: ${reason}` : ''}`);
}

export class GroqProvider implements AIProvider {
  readonly id = 'groq' as const;

  async status(): Promise<ProviderStatus> {
    const key = env.ai.groq.apiKey;
    const model = env.ai.groq.model || DEFAULT_GROQ_MODEL;
    if (!key) {
      return {
        id: this.id,
        label: 'Groq',
        configured: false,
        available: false,
        model,
        detail: 'GROQ_API_KEY is not set',
      };
    }
    try {
      const res = await requestJson<ModelsResponse>(
        `${BASE}/models`,
        { method: 'GET', headers: { Authorization: `Bearer ${key}` } },
        5000
      );
      if (!res.ok) {
        const mapped = mapError(res.status, res.body);
        return {
          id: this.id,
          label: 'Groq',
          configured: true,
          available: false,
          model,
          detail: mapped.category === 'not-configured' ? mapped.message : `Groq probe failed (HTTP ${res.status})`,
        };
      }
      const known = new Set((res.data.data ?? []).map((m) => m.id ?? ''));
      if (!known.has(model)) {
        return {
          id: this.id,
          label: 'Groq',
          configured: true,
          available: false,
          model,
          detail: `Model "${model}" is not available for this key`,
        };
      }
      return { id: this.id, label: 'Groq', configured: true, available: true, model };
    } catch (err) {
      const category = err instanceof ProviderError ? err.category : 'unavailable';
      return {
        id: this.id,
        label: 'Groq',
        configured: true,
        available: false,
        model,
        detail: category === 'timeout' ? 'Groq did not respond in time' : 'Cannot reach Groq',
      };
    }
  }

  async chat(req: ProviderChatRequest): Promise<ProviderChatResult> {
    const started = Date.now();
    const body: Record<string, unknown> = {
      model: req.model,
      messages: toMessages(req),
      ...(req.strictJson
        ? { response_format: { type: 'json_object' } }
        : { tools: openAiTool(req.tool), tool_choice: 'auto' }),
    };

    const res = await requestJson<CompletionsResponse>(
      `${BASE}/chat/completions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.ai.groq.apiKey}` },
        body: JSON.stringify(body),
      },
      req.timeoutMs
    );

    if (!res.ok) throw mapError(res.status, res.body);

    const choice = res.data.choices?.[0];
    const message = choice?.message;
    if (!message) throw new ProviderError('malformed-response', 'Groq returned no message');

    const toolCalls = parseToolCalls(message.tool_calls);
    const text = typeof message.content === 'string' && message.content.trim() ? message.content : null;

    if (toolCalls.length === 0 && !text) {
      throw new ProviderError('malformed-response', 'Groq returned an empty response');
    }

    return { text, toolCalls, model: res.data.model ?? req.model, durationMs: elapsed(started) };
  }
}
