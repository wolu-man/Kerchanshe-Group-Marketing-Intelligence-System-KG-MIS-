// =============================================================================
// AI Form Assistant — Ollama provider (local, no API key).
// Native fetch against the local Ollama HTTP API (/api/tags, /api/chat).
// =============================================================================

import { env } from '../../../config/env';
import type { ProviderStatus } from '../ai.types';
import {
  elapsed,
  ProviderError,
  reasonFromBody,
  requestJson,
  type AIProvider,
  type ProviderChatRequest,
  type ProviderChatResult,
  type ProviderToolCall,
} from './provider';

const LABEL = 'Ollama (local)';

interface TagsResponse {
  models?: Array<{ name?: string; model?: string }>;
}

interface ChatResponse {
  model?: string;
  message?: { role?: string; content?: string; tool_calls?: unknown[] };
}

/** Pick a usable chat model from `ollama list`, ignoring embedding models. */
function pickModel(names: string[]): string | null {
  const chat = names.filter((n) => !/embed/i.test(n));
  if (chat.length === 0) return null;
  const preferred = env.ai.ollama.model;
  if (preferred) {
    const exact = chat.find((n) => n === preferred || n.split(':')[0] === preferred);
    if (exact) return exact;
  }
  return chat[0];
}

function asToolCalls(raw: unknown[]): ProviderToolCall[] {
  const out: ProviderToolCall[] = [];
  for (const call of raw) {
    const fn = (call as { function?: { name?: string; arguments?: unknown } })?.function;
    if (!fn?.name) continue;
    let args: unknown = fn.arguments ?? {};
    if (typeof args === 'string') {
      try {
        args = JSON.parse(args);
      } catch {
        args = {};
      }
    }
    out.push({ name: fn.name, args });
  }
  return out;
}

export class OllamaProvider implements AIProvider {
  readonly id = 'ollama' as const;

  async status(): Promise<ProviderStatus> {
    const base = env.ai.ollama.baseUrl.replace(/\/+$/, '');
    try {
      const res = await requestJson<TagsResponse>(`${base}/api/tags`, { method: 'GET' }, 3000);
      if (!res.ok) {
        return {
          id: this.id,
          label: LABEL,
          configured: true,
          available: false,
          model: null,
          detail: `Ollama responded with HTTP ${res.status}`,
        };
      }
      const names = (res.data.models ?? [])
        .map((m) => m.name ?? m.model ?? '')
        .filter(Boolean);
      const model = pickModel(names);
      if (!model) {
        return {
          id: this.id,
          label: LABEL,
          configured: true,
          available: false,
          model: null,
          detail: 'Ollama is running but no chat model is installed',
        };
      }
      return { id: this.id, label: LABEL, configured: true, available: true, model };
    } catch (err) {
      const category = err instanceof ProviderError ? err.category : 'unavailable';
      return {
        id: this.id,
        label: LABEL,
        configured: true,
        available: false,
        model: null,
        detail:
          category === 'timeout'
            ? 'Ollama did not respond in time'
            : 'Ollama is not running — start it with "ollama serve"',
      };
    }
  }

  async chat(req: ProviderChatRequest): Promise<ProviderChatResult> {
    const started = Date.now();
    const base = env.ai.ollama.baseUrl.replace(/\/+$/, '');

    const body = {
      model: req.model,
      messages: [
        { role: 'system', content: req.system },
        ...req.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      stream: false,
      ...(req.strictJson
        ? { format: 'json' }
        : {
            tools: [
              {
                type: 'function',
                function: {
                  name: req.tool.name,
                  description: req.tool.description,
                  parameters: req.tool.parameters,
                },
              },
            ],
          }),
    };

    const res = await requestJson<ChatResponse>(
      `${base}/api/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      req.timeoutMs
    );

    if (!res.ok) {
      const reason = reasonFromBody(res.body);
      if (res.status === 404) {
        throw new ProviderError(
          'provider-error',
          `Model "${req.model}" is not installed in Ollama (run: ollama pull ${req.model})`
        );
      }
      throw new ProviderError('provider-error', `Ollama request failed (HTTP ${res.status})${reason ? `: ${reason}` : ''}`);
    }

    const message = res.data.message ?? {};
    const toolCalls = Array.isArray(message.tool_calls) ? asToolCalls(message.tool_calls) : [];
    const text = message.content?.trim() ? message.content : null;

    if (toolCalls.length === 0 && !text) {
      throw new ProviderError('malformed-response', 'Ollama returned an empty response');
    }

    return { text, toolCalls, model: res.data.model ?? req.model, durationMs: elapsed(started) };
  }
}
