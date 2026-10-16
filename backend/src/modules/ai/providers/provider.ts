// =============================================================================
// AI Form Assistant — provider abstraction.
// A provider only talks to its model; it knows nothing about forms, actions or
// the database. All providers return the same normalized result so the
// orchestrator never has to branch on vendor.
// =============================================================================

import type { AiErrorCategory, ChatImage, ProviderId, ProviderStatus } from '../ai.types';
import type { ToolSpec } from '../systemPrompt';

export interface ProviderChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Vision providers (Gemini) render these; the rest ignore them. */
  images?: ChatImage[];
}

export interface ProviderChatRequest {
  system: string;
  messages: ProviderChatMessage[];
  model: string;
  tool: ToolSpec;
  timeoutMs: number;
  /** Retry pass: force plain JSON output instead of native tool calling. */
  strictJson?: boolean;
}

export interface ProviderToolCall {
  name: string;
  args: unknown;
}

export interface ProviderChatResult {
  text: string | null;
  toolCalls: ProviderToolCall[];
  model: string;
  durationMs: number;
}

export class ProviderError extends Error {
  readonly category: AiErrorCategory;
  constructor(category: AiErrorCategory, message: string) {
    super(message);
    this.name = 'ProviderError';
    this.category = category;
  }
}

export interface AIProvider {
  readonly id: ProviderId;
  /**
   * Never throws — used by the status endpoint. Never exposes secrets.
   * `probeKey` validates a candidate key without touching the configured one
   * (AI Renewal: the submitted key must be what gets probed).
   */
  status(options?: { probeKey?: string }): Promise<ProviderStatus>;
  chat(req: ProviderChatRequest): Promise<ProviderChatResult>;
}

// ---------------------------------------------------------------------------
// Shared HTTP helper (native fetch, same pattern as integrations/powerbi.ts)
// ---------------------------------------------------------------------------
export type Json = Record<string, unknown>;

export interface HttpOk<T> { ok: true; status: number; data: T }
export interface HttpFail { ok: false; status: number; body: string }

export async function requestJson<T = Json>(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<HttpOk<T> | HttpFail> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new ProviderError('timeout', 'The AI provider did not respond in time');
    }
    throw new ProviderError('network', 'Cannot reach the AI provider');
  }
  const body = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, body: body.slice(0, 4000) };
  }
  try {
    return { ok: true, status: res.status, data: JSON.parse(body) as T };
  } catch {
    throw new ProviderError('malformed-response', 'The AI provider returned an unreadable response');
  }
}

/** Best-effort extraction of a safe, user-facing reason from an error body. */
export function reasonFromBody(body: string): string {
  const text = body.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
    const msg =
      typeof parsed.error === 'string' ? parsed.error : parsed.error?.message ?? parsed.message;
    if (msg) return msg.replace(/\s+/g, ' ').slice(0, 300);
  } catch {
    /* not JSON */
  }
  return text.slice(0, 300);
}

export function elapsed(startedAt: number): number {
  return Date.now() - startedAt;
}

/**
 * Display fingerprint for a stored key: first 4 + last 4 characters only.
 * Used by AI Renewal to let admins identify which key is live without ever
 * exposing key material. Returns null for missing or very short values.
 */
export function keyFingerprint(key: string | null | undefined): string | null {
  if (!key || key.length < 9) return null;
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}
