'use client';

// =============================================================================
// Respondent writing assistant — inline suggestion for open-text answers.
//
// The original answer is NEVER touched automatically: the suggestion is shown
// below the field and only replaces the draft when the respondent clicks
// "Use this" (and even then the normal Save / Submit flow still applies).
// The request carries only the question and the current draft — no form
// schema, no other answers, no MIS data.
// =============================================================================

import { useState } from 'react';
import { Icon } from '@/components/ui';
import { friendlyAiError } from '@/lib/ai-error';
import {
  AI_WRITING_LABELS,
  AI_WRITING_OPERATIONS,
  type AiWritingOperation,
} from '@/lib/ai-types';
import { askWriting } from './use-ai';

interface Suggestion {
  operation: AiWritingOperation;
  text: string;
  note?: string;
  provider?: string | null;
  model?: string | null;
  durationMs?: number;
  warnings: string[];
}

export function AiWritingAssist({
  label,
  description,
  type,
  maxLength,
  value,
  onChange,
  mode,
}: {
  label: string;
  description?: string;
  type: string;
  maxLength?: number;
  value: string;
  onChange: (value: string) => void;
  mode: 'auth' | 'public' | 'edit';
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState<AiWritingOperation | 'apply' | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (operation: AiWritingOperation) => {
    if (busy) return;
    setMenuOpen(false);
    setError(null);
    setApplied(false);
    setBusy(operation);
    try {
      const res = await askWriting(
        {
          provider: 'auto',
          operation,
          text: value,
          question: {
            label,
            ...(description ? { description } : {}),
            type,
            ...(maxLength ? { maxLength } : {}),
          },
        },
        mode
      );
      setSuggestion({
        operation,
        text: res.suggestion,
        ...(res.note ? { note: res.note } : {}),
        provider: res.provider,
        model: res.model,
        durationMs: res.durationMs,
        warnings: res.warnings,
      });
      if (!res.changed) setError('The answer already looks good — no change was needed.');
    } catch (err) {
      setSuggestion(null);
      setError(friendlyAiError(err));
    } finally {
      setBusy(null);
    }
  };

  const useIt = async () => {
    if (!suggestion) return;
    setBusy('apply');
    onChange(suggestion.text);
    setApplied(true);
    setBusy(null);
  };

  const dismiss = () => {
    setSuggestion(null);
    setApplied(false);
    setError(null);
  };

  return (
    <div className="aiwriting">
      <div className="aiwriting-bar">
        <button
          type="button"
          className="aiwriting-btn"
          onClick={() => setMenuOpen((v) => !v)}
          disabled={busy !== null || value.trim().length === 0}
          title="Improve this answer with AI"
        >
          <Icon name="wand-magic-sparkles" />
          {busy && busy !== 'apply' ? 'Working…' : 'AI assist'}
        </button>

        {menuOpen && (
          <div className="aiwriting-menu" role="menu">
            {AI_WRITING_OPERATIONS.map((op) => (
              <button
                key={op}
                type="button"
                role="menuitem"
                onClick={() => void run(op)}
                disabled={busy !== null}
              >
                {AI_WRITING_LABELS[op]}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <div className="aiwriting-error">{error}</div>}

      {suggestion && (
        <div className="aiwriting-suggestion" role="status">
          <div className="aiwriting-suggestion-head">
            <Icon name="wand-magic-sparkles" />
            <span>{AI_WRITING_LABELS[suggestion.operation]} — suggestion</span>
          </div>
          <div className="aiwriting-suggestion-text">{suggestion.text}</div>
          {suggestion.note && <div className="aiwriting-note">{suggestion.note}</div>}
          <div className="aiwriting-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void useIt()} disabled={busy !== null}>
              {applied ? 'Used ✓' : 'Use this'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void run(suggestion.operation)}
              disabled={busy !== null}
            >
              Try again
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={dismiss} disabled={busy !== null}>
              Dismiss
            </button>
          </div>
          <div className="aiwriting-meta">
            {[suggestion.provider, suggestion.model, suggestion.durationMs ? `${suggestion.durationMs}ms` : null]
              .filter(Boolean)
              .join(' · ')}
            {suggestion.warnings.includes('trimmed-to-field-limit') ? ' · trimmed to fit this field' : ''}
          </div>
          {applied && (
            <div className="aiwriting-applied">
              Suggestion applied to your draft — your original answer was replaced only because you
              clicked “Use this”. Remember to save or submit.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
