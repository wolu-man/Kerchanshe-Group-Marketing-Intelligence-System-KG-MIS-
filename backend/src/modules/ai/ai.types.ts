// =============================================================================
// AI Form Assistant — shared transport types.
// The Form Builder talks to ONE internal endpoint; providers are chosen and
// called server-side only, so no secret ever reaches the browser.
// =============================================================================

import type { FormAction } from './actions';

export const AI_PROVIDERS = ['ollama', 'gemini', 'groq'] as const;
export type ProviderId = (typeof AI_PROVIDERS)[number];

export const PROVIDER_CHOICES = ['auto', ...AI_PROVIDERS] as const;
export type ProviderChoice = (typeof PROVIDER_CHOICES)[number];

export const AI_INTENTS = ['generate', 'modify', 'analyze', 'chat'] as const;
export type Intent = (typeof AI_INTENTS)[number];

export const AI_MODES = ['preview', 'apply'] as const;
export type AiMode = (typeof AI_MODES)[number];

// -----------------------------------------------------------------------------
// Read / Predict / Suggest / Write classification of every AI surface
// (docs §12 + tests).
//
//   read     — returns data only; can never change anything.
//   predict  — returns server-computed statistics (forecasts, anomalies).
//              Deterministic: numbers come from the forecasting engine, never
//              from an LLM; the model may only explain them.
//   suggest  — interprets or drafts text; nothing is persisted server-side
//              (applying a suggestion only edits the caller's own textarea).
//   write    — may modify stored data, and only via the Form Assistant's
//              preview → confirm → apply flow. Writes are deliberately
//              exclusive to form schemas; non-form write tools are deferred.
// -----------------------------------------------------------------------------
export const AI_SURFACE_CLASSIFICATION = {
  assistant: 'write',
  analysis: 'suggest',
  writing: 'suggest',
  ask: 'read',
  launcher: 'read',
  predictive: 'predict',
  /** Anonymous landing-page chat: static site knowledge only, never data. */
  publicChat: 'read',
} as const;

export type AiSurface = keyof typeof AI_SURFACE_CLASSIFICATION;
export type AiClassification = (typeof AI_SURFACE_CLASSIFICATION)[AiSurface];

/** Machine-readable failure categories — mapped to friendly HTTP errors. */
export type AiErrorCategory =
  | 'not-configured'
  | 'unavailable'
  | 'rate-limited'
  | 'timeout'
  | 'network'
  | 'malformed-response'
  | 'invalid-action'
  | 'provider-error'
  | 'internal';

/** One image a provider may receive alongside text (chat attachments). */
export interface ChatImage {
  mimeType: string;
  /** Base64 payload (no data: prefix). */
  data: string;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  /** Optional image parts — only rendered by providers with vision support. */
  images?: ChatImage[];
}

export interface ProviderStatus {
  id: ProviderId;
  label: string;
  /** Secrets are configured (key/base URL present). */
  configured: boolean;
  /** Probe succeeded (reachable / key accepted / model available). */
  available: boolean;
  /** Model that would be used, if known. Never contains a secret. */
  model: string | null;
  /** User-facing note — never contains keys, URLs with credentials or stacks. */
  detail?: string;
}

export interface FormRef {
  id?: number;
  title?: string;
  description?: string;
  status?: string;
}

/** One human-readable line of the "Proposed Changes" preview. */
export interface PreviewLine {
  kind: 'add' | 'update' | 'delete' | 'move' | 'logic' | 'info' | 'db';
  text: string;
}

export interface RejectedAction {
  index: number;
  type: string;
  reason: string;
}

export interface DbActionResult {
  type: FormAction['type'];
  summary: string;
  templateId?: number;
}

export interface AssistantRequest {
  mode: AiMode;
  provider: ProviderChoice;
  intent: Intent;
  message?: string;
  formId?: number;
  form?: FormRef;
  schema: import('./actions').SchemaEnvelope;
  history?: ChatTurn[];
  /** Required for mode='apply' — previously validated assistant actions. */
  actions?: FormAction[];
}

export interface AssistantResponse {
  mode: AiMode;
  provider: ProviderId | null;
  model: string | null;
  reply: string;
  actions: FormAction[];
  preview: PreviewLine[];
  requiresConfirmation: boolean;
  warnings: string[];
  rejected: RejectedAction[];
  dbActions: FormAction[];
  executed: DbActionResult[];
  resultSchema: import('./actions').SchemaEnvelope;
  durationMs: number;
  /** True only when the returned schema actually differs — the client commits
   *  `resultSchema` through the normal undo/autosave pipeline only in that case. */
  schemaChanged: boolean;
}
