// =============================================================================
// AI Form Assistant — Google Gemini provider (generativelanguage.googleapis.com).
// Native fetch (zero SDK dependencies, same pattern as integrations/powerbi.ts).
// API key travels only in the x-goog-api-key header and never leaves the server.
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

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
export const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest';

interface ModelsResponse {
  models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
}

interface GenerateResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; functionCall?: { name?: string; args?: unknown } }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
}

function modelId(model: string): string {
  return model.startsWith('models/') ? model : `models/${model}`;
}

function bareModel(name: string): string {
  return name.replace(/^models\//, '');
}

/**
 * Gemini only accepts a subset of JSON Schema — reject the keys it is known to
 * flag as unknown names, and keep everything else identical to the tool spec.
 */
function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (schema && typeof schema === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
      if (key === 'additionalProperties' || key === 'maxItems' || key === 'minItems') continue;
      out[key] = toGeminiSchema(value);
    }
    return out;
  }
  return schema;
}

function geminiTool(tool: ToolSpec): { functionDeclarations: Array<Record<string, unknown>> } {
  return {
    functionDeclarations: [
      {
        name: tool.name,
        description: tool.description,
        parameters: toGeminiSchema(tool.parameters),
      },
    ],
  };
}

function toContents(messages: ProviderChatRequest['messages']): Array<Record<string, unknown>> {
  return messages.map((m) => {
    const parts: Array<Record<string, unknown>> = [{ text: m.content }];
    for (const image of m.images ?? []) {
      parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
    }
    return {
      role: m.role === 'assistant' ? 'model' : 'user',
      parts,
    };
  });
}

function mapError(status: number, body: string): ProviderError {
  const reason = reasonFromBody(body);
  const lower = reason.toLowerCase();
  if (status === 400 && (lower.includes('api key') || lower.includes('api_key') || lower.includes('permission'))) {
    return new ProviderError('not-configured', 'The Gemini API key was rejected');
  }
  if (status === 401 || status === 403) {
    return new ProviderError('not-configured', 'The Gemini API key was rejected');
  }
  if (status === 404) return new ProviderError('provider-error', 'Gemini model not found — check GEMINI_MODEL');
  if (status === 429) return new ProviderError('rate-limited', 'Gemini rate limit reached — try again shortly');
  if (status >= 500) return new ProviderError('unavailable', 'Gemini is temporarily unavailable');
  return new ProviderError('provider-error', `Gemini request failed (HTTP ${status})${reason ? `: ${reason}` : ''}`);
}

export class GeminiProvider implements AIProvider {
  readonly id = 'gemini' as const;

  async status(options?: { probeKey?: string }): Promise<ProviderStatus> {
    const key = options?.probeKey ?? env.ai.gemini.apiKey;
    const model = env.ai.gemini.model || DEFAULT_GEMINI_MODEL;
    if (!key) {
      return {
        id: this.id,
        label: 'Google Gemini',
        configured: false,
        available: false,
        model,
        detail: 'GEMINI_API_KEY is not set',
      };
    }
    try {
      const res = await requestJson<ModelsResponse>(`${BASE}/models?key=${encodeURIComponent(key)}`, { method: 'GET' }, 5000);
      if (!res.ok) {
        const mapped = mapError(res.status, res.body);
        return {
          id: this.id,
          label: 'Google Gemini',
          configured: true,
          available: false,
          model,
          detail: mapped.category === 'not-configured' ? mapped.message : `Gemini probe failed (HTTP ${res.status})`,
        };
      }
      const known = new Set((res.data.models ?? []).map((m) => bareModel(m.name ?? '')));
      const resolves = known.has(model) || model.includes('latest') || model.includes('experimental');
      if (!resolves) {
        return {
          id: this.id,
          label: 'Google Gemini',
          configured: true,
          available: false,
          model,
          detail: `Model "${model}" is not available for this key`,
        };
      }
      return { id: this.id, label: 'Google Gemini', configured: true, available: true, model };
    } catch (err) {
      const category = err instanceof ProviderError ? err.category : 'unavailable';
      return {
        id: this.id,
        label: 'Google Gemini',
        configured: true,
        available: false,
        model,
        detail: category === 'timeout' ? 'Gemini did not respond in time' : 'Cannot reach Gemini',
      };
    }
  }

  async chat(req: ProviderChatRequest): Promise<ProviderChatResult> {
    const started = Date.now();
    const url = `${BASE}/${modelId(req.model)}:generateContent`;
    const init: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.ai.gemini.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: toContents(req.messages),
        ...(req.strictJson
          ? { generationConfig: { responseMimeType: 'application/json' } }
          : { tools: [geminiTool(req.tool)] }),
      }),
    };

    const res = await requestJson<GenerateResponse>(url, init, req.timeoutMs);
    if (!res.ok) throw mapError(res.status, res.body);

    const candidate = res.data.candidates?.[0];
    if (!candidate) {
      const blocked = res.data.promptFeedback?.blockReason;
      throw new ProviderError('provider-error', blocked ? `Gemini blocked the request: ${blocked}` : 'Gemini returned no candidates');
    }

    const parts = candidate.content?.parts ?? [];
    const toolCalls = parts
      .filter((p) => p.functionCall?.name)
      .map((p) => ({ name: p.functionCall!.name!, args: p.functionCall!.args ?? {} }));
    const text = parts
      .map((p) => p.text ?? '')
      .join('')
      .trim();

    if (toolCalls.length === 0 && !text) {
      throw new ProviderError('malformed-response', 'Gemini returned an empty response');
    }

    return { text, toolCalls, model: req.model, durationMs: elapsed(started) };
  }
}
