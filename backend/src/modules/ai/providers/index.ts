// =============================================================================
// AI Form Assistant — provider registry.
// `auto` routing is deterministic (see ROUTING); an explicit provider chosen by
// the user always wins.
// =============================================================================

import { env } from '../../../config/env';
import { AI_PROVIDERS, type Intent, type ProviderChoice, type ProviderId, type ProviderStatus } from '../ai.types';
import { GeminiProvider, DEFAULT_GEMINI_MODEL } from './gemini';
import { GroqProvider, DEFAULT_GROQ_MODEL } from './groq';
import { OllamaProvider } from './ollama';
import type { AIProvider } from './provider';

export { ProviderError } from './provider';
export type { AIProvider, ProviderChatRequest, ProviderChatResult, ProviderToolCall } from './provider';
export { DEFAULT_GEMINI_MODEL, DEFAULT_GROQ_MODEL };

const ollama = new OllamaProvider();
const gemini = new GeminiProvider();
const groq = new GroqProvider();

export const PROVIDERS: Record<ProviderId, AIProvider> = {
  ollama,
  gemini,
  groq,
};

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  ollama: 'Ollama (local)',
  gemini: 'Google Gemini',
  groq: 'Groq',
};

/** Primary provider per intent, then the fallback chain. */
export const ROUTING: Record<Intent, ProviderId[]> = {
  generate: ['gemini', 'groq', 'ollama'],
  modify: ['groq', 'gemini', 'ollama'],
  analyze: ['gemini', 'groq', 'ollama'],
  chat: ['groq', 'gemini', 'ollama'],
};

/** Ordered candidates for this request: explicit choice first, then auto. */
export function candidateProviders(choice: ProviderChoice, intent: Intent): ProviderId[] {
  if (choice !== 'auto') return [choice];
  return ROUTING[intent] ?? ['gemini', 'groq', 'ollama'];
}

export function isConfigured(id: ProviderId): boolean {
  if (id === 'ollama') return true;
  if (id === 'gemini') return Boolean(env.ai.gemini.apiKey);
  return Boolean(env.ai.groq.apiKey);
}

export function defaultModel(id: ProviderId): string {
  if (id === 'gemini') return env.ai.gemini.model || DEFAULT_GEMINI_MODEL;
  if (id === 'groq') return env.ai.groq.model || DEFAULT_GROQ_MODEL;
  return env.ai.ollama.model;
}

export async function providerStatuses(): Promise<ProviderStatus[]> {
  const statuses = await Promise.all(AI_PROVIDERS.map((id) => PROVIDERS[id].status()));
  if (env.ai.provider !== 'auto') {
    const chosen = statuses.find((s) => s.id === env.ai.provider);
    if (chosen) chosen.detail = `Default provider (AI_PROVIDER=${env.ai.provider})${chosen.detail ? ` · ${chosen.detail}` : ''}`;
  }
  return statuses;
}
