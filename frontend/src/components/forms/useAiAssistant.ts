'use client';

// =============================================================================
// AI Form Assistant — client state for the slide-over drawer.
// One request per turn: the server returns a reply + proposed actions + a
// preview; confirmed actions are sent back in "apply" mode, whose resultSchema
// is committed through the normal Form Builder undo/autosave pipeline.
// =============================================================================

import { useCallback, useRef, useState } from 'react';
import type { FormSchemaEnvelope } from '@/lib/types';
import { api } from '@/lib/api';
import { friendlyAiError } from '@/lib/ai-error';
import {
  type AiAssistantRequest,
  type AiAssistantResponse,
  type AiChatTurn,
  type AiDbActionResult,
  type AiFormAction,
  type AiIntent,
  type AiPreviewLine,
  type AiProviderChoice,
  type AiRejectedAction,
} from '@/lib/ai-types';
import { useAiProviders } from './use-ai';

export interface AiDrawerMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: 'done' | 'applied' | 'dismissed' | 'error';
  provider?: string | null;
  model?: string | null;
  durationMs?: number;
  preview?: AiPreviewLine[];
  warnings?: string[];
  rejected?: AiRejectedAction[];
  actions?: AiFormAction[];
  resultSchema?: FormSchemaEnvelope;
  schemaChanged?: boolean;
  requiresConfirmation?: boolean;
  executed?: AiDbActionResult[];
  error?: string;
}

const HISTORY_TURNS = 10;
const ANALYZE_HINT = /analy[sz]|suggest|improv|review|audit|critique|what do you think/i;
const GENERATE_HINT = /\b(new form|build .* form|design .* (form|survey|questionnaire)|generate|questionnaire|question list)\b/i;
const MODIFY_HINT = /\b(add|create|delete|remove|change|update|rename|move|require|edit|set|make|insert|reorder|split|merge|rename)\w*/i;

let messageSeq = 0;
function nextId(): string {
  messageSeq += 1;
  return `ai-${Date.now()}-${messageSeq}`;
}

/** Deterministic intent guess so the user does not have to pick one. */
export function detectIntent(text: string, elementCount: number): AiIntent {
  if (elementCount === 0) return 'generate';
  if (ANALYZE_HINT.test(text)) return 'analyze';
  if (GENERATE_HINT.test(text)) return 'generate';
  if (MODIFY_HINT.test(text)) return 'modify';
  return 'chat';
}

export function useAiAssistant(opts: {
  open: boolean;
  formId?: number;
  envelope: FormSchemaEnvelope;
  onApply: (envelope: FormSchemaEnvelope) => void;
}) {
  const { open, formId, envelope, onApply } = opts;

  const [messages, setMessages] = useState<AiDrawerMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [provider, setProvider] = useState<AiProviderChoice>('auto');
  const [lastError, setLastError] = useState<string | null>(null);

  const { providers, providersError } = useAiProviders(open);

  const envelopeRef = useRef(envelope);
  envelopeRef.current = envelope;

  const push = useCallback((message: AiDrawerMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const patch = useCallback((id: string, next: Partial<AiDrawerMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...next } : m)));
  }, []);

  /** Sends a turn in preview mode and renders the proposal. */
  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || busy) return;

      const current = envelopeRef.current;
      const history: AiChatTurn[] = messages
        .filter((m) => m.status !== 'error')
        .slice(-HISTORY_TURNS)
        .map((m): AiChatTurn => ({ role: m.role, content: m.content }));

      push({ id: nextId(), role: 'user', content: message, status: 'done' });
      setInput('');
      setBusy(true);
      setLastError(null);

      const body: AiAssistantRequest = {
        mode: 'preview',
        provider,
        intent: detectIntent(message, current.elements?.length ?? 0),
        message,
        ...(formId !== undefined ? { formId } : {}),
        schema: current,
        history,
      };

      try {
        const res = await api<AiAssistantResponse>('/ai/assistant', { method: 'POST', body });
        const id = nextId();

        // Safe, single-step changes are applied without a confirmation step.
        if (!res.requiresConfirmation && res.schemaChanged && res.resultSchema) {
          onApply(res.resultSchema);
          push({
            id,
            role: 'assistant',
            content: res.reply || 'Done.',
            status: 'applied',
            provider: res.provider,
            model: res.model,
            durationMs: res.durationMs,
            preview: res.preview,
            warnings: res.warnings,
            rejected: res.rejected,
            actions: res.actions,
            resultSchema: res.resultSchema,
            schemaChanged: true,
            requiresConfirmation: false,
          });
          return;
        }

        push({
          id,
          role: 'assistant',
          content: res.reply || (res.preview.length > 0 ? 'Here is what I propose:' : 'No changes needed.'),
          status: 'done',
          provider: res.provider,
          model: res.model,
          durationMs: res.durationMs,
          preview: res.preview,
          warnings: res.warnings,
          rejected: res.rejected,
          actions: res.actions,
          resultSchema: res.resultSchema,
          schemaChanged: res.schemaChanged,
          requiresConfirmation: res.requiresConfirmation,
        });
      } catch (err) {
        setLastError(friendlyAiError(err));
        push({
          id: nextId(),
          role: 'assistant',
          content: friendlyAiError(err),
          status: 'error',
          error: friendlyAiError(err),
        });
      } finally {
        setBusy(false);
      }
    },
    [busy, envelopeRef, formId, messages, onApply, provider, push]
  );

  /** Confirms a proposal: runs it server-side, then commits the new schema. */
  const applyProposal = useCallback(
    async (id: string) => {
      const target = messages.find((m) => m.id === id);
      if (!target || !target.actions || target.actions.length === 0 || busy) return;

      setBusy(true);
      setLastError(null);
      const body: AiAssistantRequest = {
        mode: 'apply',
        provider,
        intent: 'modify',
        ...(formId !== undefined ? { formId } : {}),
        schema: envelopeRef.current,
        actions: target.actions,
      };

      try {
        const res = await api<AiAssistantResponse>('/ai/assistant', { method: 'POST', body });
        if (res.schemaChanged && res.resultSchema) onApply(res.resultSchema);
        patch(id, {
          status: 'applied',
          resultSchema: res.resultSchema,
          schemaChanged: res.schemaChanged,
          executed: res.executed,
          warnings: res.warnings.length > 0 ? res.warnings : target.warnings,
          requiresConfirmation: false,
        });
      } catch (err) {
        setLastError(friendlyAiError(err));
        patch(id, { status: 'error', error: friendlyAiError(err) });
      } finally {
        setBusy(false);
      }
    },
    [busy, formId, messages, onApply, patch, provider]
  );

  const dismissProposal = useCallback(
    (id: string) => {
      patch(id, { status: 'dismissed', requiresConfirmation: false });
    },
    [patch]
  );

  const clear = useCallback(() => setMessages([]), []);

  return {
    messages,
    input,
    setInput,
    busy,
    provider,
    setProvider,
    providers,
    providersError,
    lastError,
    send,
    applyProposal,
    dismissProposal,
    clear,
  };
}
