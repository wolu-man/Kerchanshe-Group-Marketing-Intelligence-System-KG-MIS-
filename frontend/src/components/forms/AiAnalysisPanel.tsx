'use client';

// =============================================================================
// Response analysis panel — server-computed metrics + AI interpretation.
// Shared by the Report tab ("AI analysis" sub-tab) and the AI drawer
// ("Responses" tab). Every number shown comes from the API metrics block; the
// model only explains them.
// =============================================================================

import { useState } from 'react';
import { BarChart, Button, Card, Empty, Icon } from '@/components/ui';
import { friendlyAiError } from '@/lib/ai-error';
import {
  AI_PROVIDER_CHOICES,
  type AiAnalysisResponse,
  type AiProviderChoice,
} from '@/lib/ai-types';
import { askAnalysis, useAiProviders } from './use-ai';

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="aianalysis-stat">
      <div className="aianalysis-stat-value">{value}</div>
      <div className="aianalysis-stat-label">{label}</div>
      {hint && <div className="aianalysis-stat-hint">{hint}</div>}
    </div>
  );
}

export function AiAnalysisPanel({
  formId,
  className,
}: {
  formId?: number;
  className?: string;
}) {
  const { providers, providersError } = useAiProviders(true);
  const [provider, setProvider] = useState<AiProviderChoice>('auto');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiAnalysisResponse | null>(null);

  const run = async () => {
    if (!formId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await askAnalysis({
        provider,
        formId,
        ...(note.trim() ? { message: note.trim() } : {}),
        ...(from || to ? { filters: { ...(from ? { from } : {}), ...(to ? { to } : {}) } } : {}),
      });
      setResult(res);
    } catch (err) {
      setError(friendlyAiError(err));
    } finally {
      setBusy(false);
    }
  };

  const m = result?.metrics;
  const interp = result?.interpretation;
  const trend = m?.byMonth ?? [];
  const ratingFields = (m?.fields ?? []).filter((f) => {
    const summary = f.summary as Record<string, unknown> | undefined;
    return (
      (f.type === 'rating' || f.type === 'number' || f.type === 'slider') &&
      summary &&
      summary.avg !== undefined &&
      summary.avg !== null
    );
  });

  return (
    <div className={className ? `aianalysis ${className}` : 'aianalysis'}>
      <div className="aianalysis-controls">
        <label className="aianalysis-filter">
          <span>From</span>
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="aianalysis-filter">
          <span>To</span>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <input
          className="input aianalysis-note"
          value={note}
          placeholder="Focus the analysis (optional)…"
          maxLength={400}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void run();
            }
          }}
        />
        <select
          className="select aianalysis-provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value as AiProviderChoice)}
          title="AI provider"
          aria-label="AI provider"
        >
          {AI_PROVIDER_CHOICES.map((p) => (
            <option key={p} value={p}>
              {p === 'auto' ? 'Auto' : p}
            </option>
          ))}
        </select>
        <Button onClick={() => void run()} busy={busy} disabled={!formId}>
          {result ? 'Run again' : 'Analyse responses'}
        </Button>
      </div>

      {providersError && <div className="aiassist-notice aiassist-warn">{providersError}</div>}
      {providers && (
        <div className="aiassist-providers">
          {providers.map((p) => (
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

      {error && <div className="aiassist-notice aiassist-bad">{error}</div>}

      {!result && !busy && (
        <Empty message="No analysis yet — it collects metrics from the database, then has the AI interpret them. Nothing is written to the form." />
      )}

      {busy && (
        <div className="aiassist-notice">
          <Icon name="wand-magic-sparkles" /> Collecting metrics and asking the model…
        </div>
      )}

      {m && (
        <Card title="Response metrics (computed from the database)">
          <div className="aianalysis-stats">
            <Stat label="Responses" value={m.total} />
            <Stat label="Submitted" value={m.submitted} />
            <Stat label="In progress" value={m.inProgress} />
            <Stat label="Edited" value={m.edited} />
            <Stat label="Sampled texts" value={m.openText.totalSampled} />
          </div>

          {trend.length > 0 && (
            <div className="aianalysis-section">
              <div className="aianalysis-section-title">Responses per month</div>
              <BarChart data={trend.map((t) => ({ label: t.month, value: t.count }))} />
            </div>
          )}

          {ratingFields.length > 0 && (
            <div className="aianalysis-section">
              <div className="aianalysis-section-title">Ratings &amp; numbers</div>
              <table className="table aianalysis-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Avg</th>
                    <th>Min</th>
                    <th>Max</th>
                    <th>Answers</th>
                  </tr>
                </thead>
                <tbody>
                  {ratingFields.map((f) => {
                    const s = f.summary as Record<string, number>;
                    return (
                      <tr key={f.key}>
                        <td>{f.label ?? f.key}</td>
                        <td>{Number(s.avg).toFixed(2)}</td>
                        <td>{s.min}</td>
                        <td>{s.max}</td>
                        <td>{s.count}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="aianalysis-section">
            <div className="aianalysis-section-title">
              Open-text coverage
              {m.openText.truncated ? ' (sample truncated)' : ''}
            </div>
            {m.openText.fields.length === 0 ? (
              <div className="hint">This form has no open-text questions.</div>
            ) : (
              <div className="aianalysis-tags">
                {m.openText.fields.map((f) => (
                  <span key={f.key} className="aiassist-chip">
                    {f.label} · {f.sampled} sampled
                  </span>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {interp && (
        <Card
          title="AI interpretation"
          actions={
            <span className="aiassist-meta">
              {[result?.provider, result?.model, result?.durationMs ? `${result.durationMs}ms` : null]
                .filter(Boolean)
                .join(' · ')}
            </span>
          }
        >
          <p className="aianalysis-reply">{interp.reply}</p>

          {interp.keyFindings.length > 0 && (
            <div className="aianalysis-section">
              <div className="aianalysis-section-title">Key findings</div>
              <ul className="aianalysis-list">
                {interp.keyFindings.map((f, i) => (
                  <li key={i}>
                    {f.statement}
                    {f.source && <span className="aianalysis-source"> — {f.source}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {interp.themes.length > 0 && (
            <div className="aianalysis-section">
              <div className="aianalysis-section-title">Common themes</div>
              <div className="aianalysis-tags">
                {interp.themes.map((t, i) => (
                  <span key={i} className="aiassist-chip">
                    {t.theme}
                    {t.count !== undefined ? ` · ${t.count}` : ''}
                  </span>
                ))}
              </div>
              <ul className="aianalysis-list aianalysis-sub">
                {interp.themes
                  .filter((t) => t.examples && t.examples.length > 0)
                  .map((t, i) => (
                    <li key={i}>
                      <strong>{t.theme}:</strong> {(t.examples ?? []).join(' · ')}
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {interp.sentiment && (
            <div className="aianalysis-section">
              <div className="aianalysis-section-title">Sentiment (AI estimate over the sample)</div>
              <div className="aianalysis-tags">
                <span className="aiassist-chip is-ok">👍 {interp.sentiment.positive ?? 0}</span>
                <span className="aiassist-chip">😐 {interp.sentiment.neutral ?? 0}</span>
                <span className="aiassist-chip is-warn">👎 {interp.sentiment.negative ?? 0}</span>
              </div>
              {interp.sentiment.note && <div className="hint">{interp.sentiment.note}</div>}
            </div>
          )}

          {interp.openTextInsights.length > 0 && (
            <div className="aianalysis-section">
              <div className="aianalysis-section-title">Open-text insights</div>
              <ul className="aianalysis-list">
                {interp.openTextInsights.map((x, i) => (
                  <li key={i}>
                    <strong>{m?.openText.fields.find((f) => f.key === x.fieldKey)?.label ?? x.fieldKey}:</strong>{' '}
                    {x.insight}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {interp.trends.length > 0 && (
            <div className="aianalysis-section">
              <div className="aianalysis-section-title">Trends</div>
              <ul className="aianalysis-list">
                {interp.trends.map((t, i) => (
                  <li key={i}>
                    <strong>{t.label}:</strong> {t.observation}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result && result.warnings.length > 0 && (
            <div className="aiassist-notice aiassist-warn">{result.warnings.join(' · ')}</div>
          )}
        </Card>
      )}
    </div>
  );
}
