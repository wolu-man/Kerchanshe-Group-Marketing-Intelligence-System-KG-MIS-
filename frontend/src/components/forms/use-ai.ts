'use client';

// =============================================================================
// Shared AI helpers for every AI surface: provider status (loaded once) and
// the request/body builders used by the drawer, analysis panel and data ask.
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { friendlyAiError } from '@/lib/ai-error';
import type {
  AiAskResponse,
  AiAnalysisResponse,
  AiProviderChoice,
  AiProvidersResponse,
  AiPublicAskRequest,
  AiPublicAskResponse,
  AiWritingRequest,
  AiWritingResponse,
} from '@/lib/ai-types';

/** Provider status for the drawer/panels — one fetch per `enabled` session. */
export function useAiProviders(enabled: boolean) {
  const [providers, setProviders] = useState<AiProvidersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (!enabled || loaded.current) return;
    loaded.current = true;
    api<AiProvidersResponse>('/ai/providers')
      .then((res) => {
        setProviders(res);
        setError(null);
      })
      .catch((err) => setError(friendlyAiError(err)));
  }, [enabled]);

  return {
    providers: providers?.providers ?? null,
    defaultProvider: providers?.default ?? null,
    providersError: error,
  };
}

export type WritingMode = 'auth' | 'public' | 'edit';

export function writingEndpoint(mode: WritingMode): string {
  return mode === 'public' ? '/ai/public/writing' : '/ai/writing';
}

export function askWriting(body: AiWritingRequest, mode: WritingMode): Promise<AiWritingResponse> {
  return api<AiWritingResponse>(writingEndpoint(mode), { method: 'POST', body });
}

export interface AiAnalysisRequest {
  provider: AiProviderChoice;
  formId: number;
  message?: string;
  filters?: { from?: string; to?: string };
}

export function askAnalysis(body: AiAnalysisRequest): Promise<AiAnalysisResponse> {
  return api<AiAnalysisResponse>('/ai/analysis', { method: 'POST', body });
}

export interface AiAskContext {
  module: string;
  label?: string;
  recordId?: number;
  filters?: Array<{ k: string; v: string }>;
}

export interface AiAskRequest {
  provider: AiProviderChoice;
  question: string;
  /** Advisory page context — bounded server-side, never changes permissions. */
  context?: AiAskContext;
  /** One uploaded file (POST /ai/attachments) referenced by its stored id. */
  attachment?: { id: string; name: string; sizeBytes: number; mimeType: string };
}

export function askData(body: AiAskRequest): Promise<AiAskResponse> {
  return api<AiAskResponse>('/ai/ask', { method: 'POST', body });
}

/** Anonymous landing-page chat — no auth token needed, static site knowledge. */
export function askPublicChat(body: AiPublicAskRequest): Promise<AiPublicAskResponse> {
  return api<AiPublicAskResponse>('/ai/public/ask', { method: 'POST', body });
}
