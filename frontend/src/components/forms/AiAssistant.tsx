'use client';

// =============================================================================
// AI Form Assistant — slide-over drawer inside the Form Builder.
// Talks only to /api/v1/ai/* ; proposed changes are previewed here and applied
// through the builder's existing commit/undo/autosave pipeline.
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import { Button, Icon, Tabs } from '@/components/ui';
import { AiWaves } from '@/components/AiWaves';
import type { FormSchemaEnvelope } from '@/lib/types';
import { AI_PROVIDER_CHOICES, type AiProviderChoice, type AiPreviewLine } from '@/lib/ai-types';
import { useAiAssistant, type AiDrawerMessage } from './useAiAssistant';
import { AiAnalysisPanel } from './AiAnalysisPanel';
import { AiDataAsk } from './AiDataAsk';

type DrawerTab = 'form' | 'responses' | 'data';

const PREVIEW_ICON: Record<AiPreviewLine['kind'], string> = {
  add: 'plus',
  update: 'pen',
  delete: 'trash',
  move: 'shuffle',
  logic: 'code-branch',
  info: 'circle-info',
  db: 'database',
};

const SUGGESTIONS = [
  'Add a required phone number after the email field',
  'Suggest improvements for this survey',
  'Make the satisfaction question required',
  'Add a section for open feedback',
];

function PreviewList({ lines }: { lines: AiPreviewLine[] }) {
  if (lines.length === 0) return null;
  return (
    <ul className="aiassist-preview">
      {lines.map((line, i) => (
        <li key={`${line.kind}-${i}`} className={`aiassist-line aiassist-line-${line.kind}`}>
          <Icon name={PREVIEW_ICON[line.kind] ?? 'circle-info'} />
          <span>{line.text}</span>
        </li>
      ))}
    </ul>
  );
}

function AssistantBubble({
  message,
  onApply,
  onDismiss,
  busy,
}: {
  message: AiDrawerMessage;
  onApply: (id: string) => void;
  onDismiss: (id: string) => void;
  busy: boolean;
}) {
  const showProposal =
    message.role === 'assistant' &&
    message.status === 'done' &&
    (message.requiresConfirmation ?? false) &&
    (message.actions?.length ?? 0) > 0;

  return (
    <div className={`aiassist-msg aiassist-assistant ${message.status === 'error' ? 'is-error' : ''}`}>
      <div className="aiassist-avatar" aria-hidden="true">
        <Icon name="wand-magic-sparkles" />
      </div>
      <div className="aiassist-bubble">
        <p className="aiassist-reply">{message.content}</p>

        {message.preview && message.preview.length > 0 && <PreviewList lines={message.preview} />}

        {message.warnings && message.warnings.length > 0 && (
          <div className="aiassist-notice aiassist-warn">
            {message.warnings.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </div>
        )}

        {message.rejected && message.rejected.length > 0 && (
          <div className="aiassist-notice aiassist-bad">
            {message.rejected.map((r) => (
              <div key={r.index}>
                {r.type}: {r.reason}
              </div>
            ))}
          </div>
        )}

        {showProposal && (
          <div className="aiassist-actions">
            <Button size="sm" onClick={() => onApply(message.id)} disabled={busy}>
              <Icon name="circle-check" /> Apply changes
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onDismiss(message.id)} disabled={busy}>
              Discard
            </Button>
          </div>
        )}

        {message.status === 'applied' && (
          <div className="aiassist-applied">
            <Icon name="circle-check" /> Applied
            {message.executed && message.executed.length > 0 && (
              <span> · {message.executed.map((e) => e.summary).join(' · ')}</span>
            )}
          </div>
        )}
        {message.status === 'dismissed' && (
          <div className="aiassist-dismissed">Discarded — no changes were made.</div>
        )}

        {message.provider && message.status !== 'error' && (
          <div className="aiassist-meta">
            {message.provider}
            {message.model ? ` · ${message.model}` : ''}
            {message.durationMs ? ` · ${message.durationMs}ms` : ''}
          </div>
        )}
      </div>
    </div>
  );
}

export function AiAssistant({
  open,
  onClose,
  formId,
  envelope,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  formId?: number;
  envelope: FormSchemaEnvelope;
  onApply: (envelope: FormSchemaEnvelope) => void;
}) {
  const ai = useAiAssistant({ open, formId, envelope, onApply });
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState<DrawerTab>('form');

  const drawerTabs = [
    { id: 'form' as const, label: 'Form' },
    ...(formId ? [{ id: 'responses' as const, label: 'Responses' }] : []),
    { id: 'data' as const, label: 'Data' },
  ];
  const activeTab: DrawerTab = tab === 'responses' && !formId ? 'form' : tab;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [ai.messages, ai.busy]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const empty = ai.messages.length === 0;

  const submit = () => {
    void ai.send(ai.input);
  };

  return (
    <>
      <div className="aiassist-scrim" onClick={onClose} aria-hidden="true" />
      <aside className="aiassist" role="dialog" aria-label="AI Form Assistant">
        <header className="aiassist-header">
          <span className="aiassist-title">
            <span className="ai-orb"><AiWaves /><Icon name="wand-magic-sparkles" /></span> AI Assistant
          </span>
          {activeTab === 'form' && (
            <select
              className="select aiassist-provider"
              value={ai.provider}
              onChange={(e) => ai.setProvider(e.target.value as AiProviderChoice)}
              title="AI provider"
              aria-label="AI provider"
            >
              {AI_PROVIDER_CHOICES.map((p) => (
                <option key={p} value={p}>
                  {p === 'auto' ? 'Auto (recommended)' : p}
                </option>
              ))}
            </select>
          )}
          <button className="aiassist-close" onClick={onClose} title="Close" aria-label="Close AI assistant">
            <Icon name="xmark" />
          </button>
        </header>

        <div className="aiassist-tabs">
          <Tabs tabs={drawerTabs} active={activeTab} onChange={(id) => setTab(id as DrawerTab)} />
        </div>

        {activeTab === 'form' && ai.providers && (
          <div className="aiassist-providers">
            {ai.providers.map((p) => (
              <span
                key={p.id}
                className={`aiassist-chip ${p.available ? 'is-ok' : p.configured ? 'is-warn' : 'is-off'}`}
                title={p.detail ?? p.label}
              >
                <i className="aiassist-dot" aria-hidden="true" />
                {p.label}
                {p.model ? ` · ${p.model}` : ''}
              </span>
            ))}
          </div>
        )}
        {activeTab === 'form' && ai.providersError && (
          <div className="aiassist-notice aiassist-warn">{ai.providersError}</div>
        )}

        {activeTab === 'form' && (
          <>
            <div className="aiassist-body" ref={scrollRef}>
          {empty ? (
            <div className="aiassist-empty">
              <div className="aiassist-empty-icon">
                <Icon name="wand-magic-sparkles" />
              </div>
              <p>
                Ask me to add fields, restructure pages, add logic or review this form. I propose changes
                first — nothing is saved until you apply them.
              </p>
              <div className="aiassist-suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => void ai.send(s)} disabled={ai.busy}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            ai.messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="aiassist-msg aiassist-user">
                  <div className="aiassist-bubble">{m.content}</div>
                </div>
              ) : (
                <AssistantBubble key={m.id} message={m} onApply={(id) => void ai.applyProposal(id)} onDismiss={ai.dismissProposal} busy={ai.busy} />
              )
            )
          )}

          {ai.busy && (
            <div className="aiassist-msg aiassist-assistant">
              <div className="aiassist-avatar" aria-hidden="true">
                <Icon name="wand-magic-sparkles" />
              </div>
              <div className="aiassist-bubble aiassist-thinking">
                <span className="aiassist-typing" aria-hidden="true">
                  <i /><i /><i />
                </span>
                Thinking…
              </div>
            </div>
          )}
        </div>

        <footer className="aiassist-footer">
          {ai.lastError && <div className="aiassist-notice aiassist-bad">{ai.lastError}</div>}
          <div className="aiassist-composer">
            <textarea
              ref={inputRef}
              className="aiassist-input"
              rows={2}
              value={ai.input}
              placeholder="Describe the change you want…"
              onChange={(e) => ai.setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <button
              className="aiassist-send"
              onClick={submit}
              disabled={ai.busy || ai.input.trim().length === 0}
              title="Send"
              aria-label="Send"
            >
              <Icon name="paper-plane" />
            </button>
          </div>
          <div className="aiassist-hint">Enter to send · Shift+Enter for a new line</div>
          </footer>
          </>
        )}

        {activeTab === 'responses' &&
          (formId ? (
            <AiAnalysisPanel formId={formId} className="aiassist-panel" />
          ) : (
            <div className="aiassist-body">
              <div className="aiassist-empty">
                <p>Open a saved form to analyse its responses.</p>
              </div>
            </div>
          ))}

        {activeTab === 'data' && <AiDataAsk className="aiassist-panel" />}
      </aside>
    </>
  );
}
