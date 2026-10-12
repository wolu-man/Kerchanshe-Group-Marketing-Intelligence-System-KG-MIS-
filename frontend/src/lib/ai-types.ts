// =============================================================================
// AI Form Assistant — client-side types (mirror of the backend AI contract).
// The browser only talks to POST /api/v1/ai/assistant and GET /api/v1/ai/providers.
// =============================================================================

import type { FormSchemaEnvelope } from '@/lib/types';

export const AI_PROVIDER_CHOICES = ['auto', 'ollama', 'gemini', 'groq'] as const;
export type AiProviderChoice = (typeof AI_PROVIDER_CHOICES)[number];

export const AI_PROVIDER_IDS = ['ollama', 'gemini', 'groq'] as const;
export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

export const AI_INTENTS = ['generate', 'modify', 'analyze', 'chat'] as const;
export type AiIntent = (typeof AI_INTENTS)[number];

export interface AiProviderStatus {
  id: AiProviderId;
  label: string;
  configured: boolean;
  available: boolean;
  model: string | null;
  detail?: string;
}

export interface AiProvidersResponse {
  providers: AiProviderStatus[];
  default: AiProviderChoice;
}

/** One proposed change, rendered as a line in the confirmation panel. */
export interface AiPreviewLine {
  kind: 'add' | 'update' | 'delete' | 'move' | 'logic' | 'info' | 'db';
  text: string;
}

export interface AiRejectedAction {
  index: number;
  type: string;
  reason: string;
}

export interface AiDbActionResult {
  type: string;
  summary: string;
  templateId?: number;
}

/** Opaque to the client — it is validated server-side and sent back verbatim. */
export type AiFormAction = { type: string; [key: string]: unknown };

export interface AiChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiAssistantRequest {
  mode: 'preview' | 'apply';
  provider: AiProviderChoice;
  intent: AiIntent;
  message?: string;
  formId?: number;
  schema: FormSchemaEnvelope;
  history?: AiChatTurn[];
  actions?: AiFormAction[];
}

export interface AiAssistantResponse {
  mode: 'preview' | 'apply';
  provider: AiProviderId | null;
  model: string | null;
  reply: string;
  actions: AiFormAction[];
  preview: AiPreviewLine[];
  requiresConfirmation: boolean;
  warnings: string[];
  rejected: AiRejectedAction[];
  dbActions: AiFormAction[];
  executed: AiDbActionResult[];
  resultSchema: FormSchemaEnvelope;
  durationMs: number;
  /** The client only commits resultSchema when this is true. */
  schemaChanged: boolean;
}

// ---------------------------------------------------------------------------
// 1. Respondent writing assistant
// ---------------------------------------------------------------------------
export const AI_WRITING_OPERATIONS = [
  'improve-grammar',
  'rephrase',
  'clarify',
  'shorten',
  'professional',
] as const;
export type AiWritingOperation = (typeof AI_WRITING_OPERATIONS)[number];

export const AI_WRITING_LABELS: Record<AiWritingOperation, string> = {
  'improve-grammar': 'Improve grammar',
  rephrase: 'Rephrase',
  clarify: 'Make clearer',
  shorten: 'Make shorter',
  professional: 'More professional',
};

export interface AiWritingRequest {
  provider: AiProviderChoice;
  operation: AiWritingOperation;
  text: string;
  question: {
    label: string;
    description?: string;
    type: string;
    maxLength?: number;
  };
}

export interface AiWritingResponse {
  provider: AiProviderId | null;
  model: string | null;
  operation: AiWritingOperation;
  suggestion: string;
  changed: boolean;
  warnings: string[];
  note?: string;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// 2. Response analysis
// ---------------------------------------------------------------------------
export interface AiAnalysisField {
  key: string;
  label?: string;
  type?: string;
  summary?: Record<string, unknown>;
}

export interface AiAnalysisReport {
  template?: { templateId: number; title: string };
  total?: number;
  fields?: AiAnalysisField[];
  [key: string]: unknown;
}

export interface AiAnalysisResponse {
  provider: AiProviderId | null;
  model: string | null;
  reply: string;
  report: AiAnalysisReport;
  metrics: {
    total: number;
    submitted: number;
    inProgress: number;
    edited: number;
    firstSubmittedAt: string | null;
    lastSubmittedAt: string | null;
    byMonth: Array<{ month: string; count: number; avgScore: number | null }>;
    fields: AiAnalysisField[];
    openText: {
      fields: Array<{ key: string; label: string; sampled: number }>;
      samples: Array<{ fieldKey: string; text: string }>;
      totalSampled: number;
      truncated: boolean;
    };
    reportFilters: { from?: string; to?: string };
  };
  interpretation: {
    reply: string;
    keyFindings: Array<{ statement: string; source?: string }>;
    themes: Array<{ theme: string; count?: number; examples?: string[] }>;
    sentiment?: { positive?: number; neutral?: number; negative?: number; note?: string };
    openTextInsights: Array<{ fieldKey: string; insight: string }>;
    trends: Array<{ label: string; observation: string }>;
  };
  warnings: string[];
  durationMs: number;
}

// ---------------------------------------------------------------------------
// 3. Domain data intelligence
// ---------------------------------------------------------------------------
export interface AiDataSource {
  name: string;
  label: string;
  args: Record<string, unknown>;
  data: unknown;
  rowCount: number;
}

export interface AiAskResponse {
  provider: AiProviderId | null;
  model: string | null;
  answer: string;
  sources: AiDataSource[];
  durationMs: number;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// 4. Public landing-page assistant (anonymous — site knowledge only)
// ---------------------------------------------------------------------------
export interface AiPublicAskRequest {
  provider: AiProviderChoice;
  question: string;
  /** Prior turns of this on-page session — capped server-side too. */
  history?: AiChatTurn[];
}

export interface AiPublicAskResponse {
  provider: AiProviderId | null;
  model: string | null;
  answer: string;
  durationMs: number;
  warnings: string[];
}
