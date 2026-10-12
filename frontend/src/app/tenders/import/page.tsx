'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Guard, RequireRole } from '@/components/Guard';
import { Button, Card, Loading, Empty, Badge, Icon, Field } from '@/components/ui';
import { TourTrigger } from '@/components/tour/TourTrigger';
import { api, ApiError, getToken } from '@/lib/api';
import { useFetch } from '@/lib/use-api';
import { fmtDateTime } from '@/lib/format';
import { toast } from '@/components/Toast';
import type {
  ImportHistoryItem,
  ImportParseResult,
  ImportRowPreview,
  ImportSummary,
  ImportSuggestedColumn,
} from '@/lib/types';

const MANAGE_ROLES = ['Administrator', 'Marketing Manager'];

/** Mirrors backend import.types.ts limits (client-side pre-checks). */
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.csv', '.xlsx', '.xls'];

/** Mirrors backend IMPORT_COLUMNS — the mapping select options. */
const IMPORT_FIELDS: Array<{ field: string; label: string; required: boolean }> = [
  { field: 'Title', label: 'Title', required: true },
  { field: 'SourceUrl', label: 'SourceUrl', required: true },
  { field: 'Organization', label: 'Organization', required: false },
  { field: 'Country', label: 'Country', required: false },
  { field: 'Sector', label: 'Sector', required: false },
  { field: 'Description', label: 'Description', required: false },
  { field: 'SourceReference', label: 'SourceReference', required: false },
  { field: 'PublicationDate', label: 'PublicationDate', required: false },
  { field: 'DeadlineDate', label: 'DeadlineDate', required: false },
  { field: 'EstimatedValue', label: 'EstimatedValue', required: false },
  { field: 'Currency', label: 'Currency', required: false },
  { field: 'TenderSourceID', label: 'TenderSourceID', required: false },
];

const STEP_LABELS = ['File', 'Mapping', 'Preview', 'Confirm', 'Summary'];
const PREVIEW_LIMIT = 200;

type Step = 1 | 2 | 3 | 4 | 5;

function extensionOf(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx).toLowerCase() : '';
}

function StatusBadge({ row }: { row: ImportRowPreview }) {
  if (row.status === 'valid') return <Badge tone="success">Ready</Badge>;
  if (row.status === 'duplicate') {
    return <Badge tone="warning">{row.duplicateReason === 'in-file' ? 'Duplicate in file' : 'Already exists'}</Badge>;
  }
  return <Badge tone="danger">Invalid</Badge>;
}

function rowIssueText(row: ImportRowPreview): string {
  return row.issues.map((i) => `${i.field ?? 'Row'}: ${i.message}`).join(' · ');
}

function ImportWizardInner() {
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportParseResult | null>(null);
  const [mapping, setMapping] = useState<ImportSuggestedColumn[]>([]);
  const [sheet, setSheet] = useState('');
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const history = useFetch<{ items: ImportHistoryItem[] }>('/tenders/imports', [summary]);

  const mappedFields = new Set(mapping.map((m) => m.field).filter((f): f is string => !!f));
  const missingRequired = IMPORT_FIELDS.filter((f) => f.required && !mappedFields.has(f.field));
  const fieldCounts = mapping.reduce<Record<string, number>>((acc, m) => {
    if (m.field) acc[m.field] = (acc[m.field] ?? 0) + 1;
    return acc;
  }, {});
  const duplicateFields = Object.keys(fieldCounts).filter((f) => fieldCounts[f] > 1);
  const mappingBlocked = missingRequired.length > 0 || duplicateFields.length > 0;

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0] ?? null;
    setFileError(null);
    setFile(null);
    if (!chosen) return;
    const ext = extensionOf(chosen.name);
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setFileError('Only .csv, .xlsx and .xls files can be imported.');
      return;
    }
    if (chosen.size > MAX_BYTES) {
      setFileError('File is larger than the 5 MB import limit.');
      return;
    }
    setFile(chosen);
  }

  function resetWizard() {
    setStep(1);
    setFile(null);
    setFileError(null);
    setResult(null);
    setMapping([]);
    setSheet('');
    setSummary(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function uploadFile() {
    if (!file) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await api<ImportParseResult>('/tenders/imports/parse', { method: 'POST', body });
      setResult(res);
      setMapping(res.suggestedMapping);
      setSheet(res.sheet);
      setStep(2);
      toast.success(`Parsed ${res.counts.total} rows from ${res.fileName}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  /** Re-parses the stored file. Pass nextMapping to keep edits; omit it to auto-map (e.g. after a sheet change). */
  async function reparse(nextSheet: string, nextMapping?: ImportSuggestedColumn[]): Promise<void> {
    if (!result) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append('token', result.token);
      if (nextSheet) body.append('sheet', nextSheet);
      if (nextMapping) {
        body.append('mapping', JSON.stringify(nextMapping.map((m) => ({ column: m.column, field: m.field ?? '' }))));
      }
      const res = await api<ImportParseResult>('/tenders/imports/parse', { method: 'POST', body });
      setResult(res);
      setMapping(res.suggestedMapping);
      setSheet(res.sheet);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not re-parse the file');
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function goToPreview() {
    if (!result || mappingBlocked) return;
    try {
      await reparse(sheet, mapping);
      setStep(3);
    } catch {
      /* toast already shown */
    }
  }

  async function commit() {
    if (!result) return;
    setBusy(true);
    try {
      const res = await api<ImportSummary>('/tenders/imports/commit', {
        method: 'POST',
        body: {
          token: result.token,
          mapping: mapping.map((m) => ({ column: m.column, field: m.field ?? '' })),
          sheet: sheet || null,
        },
      });
      setSummary(res);
      setStep(5);
      toast.success(`Imported ${res.imported} of ${res.totalRows} rows`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  async function cancelUpload() {
    if (result) {
      try {
        await api(`/tenders/imports/${result.token}`, { method: 'DELETE' });
      } catch {
        /* idempotent — ignore */
      }
    }
    resetWizard();
  }

  async function downloadTemplate(format: 'xlsx' | 'csv') {
    try {
      const base = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');
      const token = getToken() ?? localStorage.getItem('kgmis_token');
      const res = await fetch(`${base}/tenders/imports/template?format=${format}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error('download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tender-import-template.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Template downloaded (${format.toUpperCase()})`);
    } catch {
      toast.error('Template download failed');
    }
  }

  const previewRows = result ? result.rows.slice(0, PREVIEW_LIMIT) : [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Import Tenders</h1>
          <div className="sub">
            Upload an Excel or CSV file of tender opportunities. Existing opportunities are never overwritten —
            duplicates are skipped and reported.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <TourTrigger tourId="tenders-import" />
          <Button variant="ghost" onClick={() => void downloadTemplate('xlsx')}>
            <Icon name="file-excel" /> Template (Excel)
          </Button>
          <Button variant="ghost" onClick={() => void downloadTemplate('csv')}>
            <Icon name="file-csv" /> Template (CSV)
          </Button>
        </div>
      </div>

      {/* Stepper */}
      <div data-tour="import-stepper" style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        {STEP_LABELS.map((label, i) => {
          const n = (i + 1) as Step;
          const active = step === n;
          const done = step > n;
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 24, height: 24, borderRadius: '50%',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 600,
                  background: active || done ? 'var(--primary)' : 'var(--surface-3)',
                  color: active || done ? '#fff' : 'var(--text-muted)',
                }}
              >
                {done ? <Icon name="check" /> : n}
              </span>
              <span style={{ fontSize: 13, color: active ? 'var(--text)' : 'var(--text-muted)', fontWeight: active ? 600 : 400 }}>
                {label}
              </span>
              {i < STEP_LABELS.length - 1 ? <span style={{ width: 18, height: 1, background: 'var(--border-strong)' }} /> : null}
            </div>
          );
        })}
      </div>

      {/* Step 1 — file */}
      {step === 1 ? (
        <Card title="1. Choose a file">
          <div
            className="drop-zone"
            onClick={() => inputRef.current?.click()}
            style={{ border: '2px dashed var(--border-strong)', borderRadius: 8, padding: '36px 16px', textAlign: 'center', cursor: 'pointer' }}
          >
            <Icon name="cloud-arrow-up" />
            <div style={{ marginTop: 8, fontWeight: 600 }}>{file ? file.name : 'Click to select a file'}</div>
            <div className="hint" style={{ marginTop: 4 }}>
              .xlsx, .xls or .csv — up to 5 MB, 2000 rows, 40 columns. The first row must contain headers.
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              style={{ display: 'none' }}
              onChange={pickFile}
            />
          </div>
          {fileError ? <div className="alert alert-error" style={{ marginTop: 10 }}>{fileError}</div> : null}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <Button onClick={() => void uploadFile()} busy={busy} disabled={!file}>
              <Icon name="arrow-right" /> Upload &amp; Map Columns
            </Button>
            <Link href="/tenders" className="btn btn-ghost">Cancel</Link>
          </div>
        </Card>
      ) : null}

      {/* Step 2 — mapping */}
      {step === 2 && result ? (
        <Card title="2. Map columns">
          <div className="hint" style={{ marginBottom: 10 }}>
            Match each column from <b>{result.fileName}</b> to an opportunity field. Required fields are marked with *.
          </div>
          {result.sheets.length > 1 ? (
            <Field label="Worksheet" containerStyle={{ maxWidth: 320, marginBottom: 10 }}>
              <select
                className="select"
                value={sheet}
                onChange={(e) => {
                  const next = e.target.value;
                  setSheet(next);
                  void reparse(next).catch(() => undefined);
                }}
              >
                {result.sheets.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          ) : null}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th style={{ width: 70 }}>Column</th><th>Header in your file</th><th style={{ minWidth: 220 }}>Import as</th></tr>
              </thead>
              <tbody>
                {mapping.map((m) => (
                  <tr key={m.column}>
                    <td>{m.column + 1}</td>
                    <td>{m.header || <span style={{ color: 'var(--text-muted)' }}>(no header)</span>}</td>
                    <td>
                      <select
                        className="select"
                        value={m.field ?? ''}
                        onChange={(e) => {
                          const value = e.target.value || null;
                          setMapping((prev) => prev.map((x) => (x.column === m.column ? { ...x, field: value } : x)));
                        }}
                      >
                        <option value="">— Ignore —</option>
                        {IMPORT_FIELDS.map((f) => (
                          <option key={f.field} value={f.field}>{f.label}{f.required ? ' *' : ''}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {missingRequired.length > 0 ? (
            <div className="alert alert-error" style={{ marginTop: 10 }}>
              Required field(s) not mapped: {missingRequired.map((f) => f.label).join(', ')}.
            </div>
          ) : null}
          {duplicateFields.length > 0 ? (
            <div className="alert alert-error" style={{ marginTop: 10 }}>
              Field(s) mapped more than once: {duplicateFields.join(', ')}.
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <Button onClick={() => void goToPreview()} busy={busy} disabled={mappingBlocked}>
              <Icon name="arrow-right" /> Validate &amp; Preview
            </Button>
            <Button variant="ghost" onClick={() => void cancelUpload()}>Cancel</Button>
          </div>
        </Card>
      ) : null}

      {/* Step 3 — preview */}
      {step === 3 && result ? (
        <Card title="3. Preview & validation">
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <Badge tone="primary">{result.counts.total} rows</Badge>
            <Badge tone="success">{result.counts.valid} ready</Badge>
            <Badge tone="danger">{result.counts.invalid} invalid</Badge>
            <Badge tone="warning">{result.counts.duplicate} duplicate</Badge>
          </div>
          <div className="hint" style={{ marginBottom: 10 }}>
            Invalid rows are skipped (fix them in the file and re-upload). Duplicates are skipped at import —
            existing opportunities are never overwritten.
            {result.rows.length > PREVIEW_LIMIT ? ` Showing the first ${PREVIEW_LIMIT} of ${result.rows.length} rows.` : ''}
          </div>
          <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Row</th><th style={{ width: 130 }}>Status</th>
                  <th>Title</th><th>Organization</th><th>Deadline</th><th>Issues</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row) => (
                  <tr key={row.row}>
                    <td>{row.row}</td>
                    <td><StatusBadge row={row} /></td>
                    <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.values.Title}>
                      {row.values.Title || '—'}
                    </td>
                    <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.values.Organization || '—'}
                    </td>
                    <td>{row.values.DeadlineDate || '—'}</td>
                    <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: row.issues.length ? 'var(--danger)' : 'var(--text-muted)', fontSize: 12 }}>
                      {row.issues.length
                        ? rowIssueText(row)
                        : row.duplicateReason
                          ? (row.duplicateReason === 'in-file' ? 'Repeated earlier in this file' : 'Matches an existing opportunity')
                          : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <Button onClick={() => setStep(4)} disabled={result.counts.valid === 0}>
              <Icon name="arrow-right" /> Continue to Import
            </Button>
            <Button variant="ghost" onClick={() => setStep(2)}>Back to mapping</Button>
            <Button variant="ghost" onClick={() => void cancelUpload()}>Cancel</Button>
          </div>
          {result.counts.valid === 0 ? (
            <div className="hint" style={{ marginTop: 8 }}>
              No importable rows — every row is invalid or a duplicate.
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* Step 4 — confirm */}
      {step === 4 && result ? (
        <Card title="4. Confirm import">
          <p style={{ marginBottom: 10 }}>
            Ready to import <b>{result.counts.valid}</b> rows from <b>{result.fileName}</b>.
          </p>
          <ul style={{ marginLeft: 18, color: 'var(--text-muted)', lineHeight: 1.8 }}>
            <li><b>{result.counts.valid}</b> rows will be inserted.</li>
            <li><b>{result.counts.duplicate}</b> duplicates will be skipped — existing opportunities are never modified.</li>
            <li><b>{result.counts.invalid}</b> invalid rows will not be imported.</li>
            <li>Imported rows are created as <b>Unverified</b> and scored against your interest profiles.</li>
          </ul>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <Button data-tour="import-commit" onClick={() => void commit()} busy={busy}>
              <Icon name="file-import" /> Import {result.counts.valid} rows
            </Button>
            <Button variant="ghost" onClick={() => setStep(3)}>Back to preview</Button>
            <Button variant="ghost" onClick={() => void cancelUpload()}>Cancel</Button>
          </div>
        </Card>
      ) : null}

      {/* Step 5 — summary */}
      {step === 5 && summary ? (
        <Card title="5. Import summary">
          <div className="stat-grid" style={{ marginBottom: 14 }}>
            <div className="stat-card"><div className="label">Imported</div><div className="value" style={{ color: 'var(--success)' }}>{summary.imported}</div></div>
            <div className="stat-card"><div className="label">Duplicates skipped</div><div className="value" style={{ color: 'var(--warning)' }}>{summary.duplicates}</div></div>
            <div className="stat-card"><div className="label">Invalid skipped</div><div className="value">{summary.skipped}</div></div>
            <div className="stat-card"><div className="label">Failed</div><div className="value" style={{ color: summary.failed ? 'var(--danger)' : 'inherit' }}>{summary.failed}</div></div>
            <div className="stat-card"><div className="label">High relevance</div><div className="value">{summary.highRelevanceCount}</div></div>
          </div>
          <div className="hint" style={{ marginBottom: 10 }}>
            {summary.totalRows} rows read from {summary.fileName} in {(summary.durationMs / 1000).toFixed(1)}s.
          </div>
          {summary.errors.length > 0 ? (
            <div className="table-wrap" style={{ maxHeight: 260, overflowY: 'auto', marginBottom: 12 }}>
              <table className="table">
                <thead><tr><th style={{ width: 70 }}>Row</th><th style={{ width: 160 }}>Field</th><th>Message</th></tr></thead>
                <tbody>
                  {summary.errors.map((e, i) => (
                    <tr key={`${e.row}-${i}`}>
                      <td>{e.row}</td>
                      <td>{e.field ?? '—'}</td>
                      <td>{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {summary.errorCount > summary.errors.length ? (
                <div className="hint" style={{ padding: 8 }}>
                  Showing {summary.errors.length} of {summary.errorCount} issues.
                </div>
              ) : null}
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/tenders" className="btn btn-primary">View opportunities</Link>
            <Button variant="ghost" onClick={resetWizard}><Icon name="rotate" /> Import another file</Button>
          </div>
        </Card>
      ) : null}

      {/* Import history */}
      <Card title={`Import history (${history.data?.items.length ?? 0})`} flush style={{ marginTop: 16 }}>
        {history.loading ? <Loading /> : history.error ? <div className="alert alert-error">{history.error}</div> : history.data?.items.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th><th>User</th><th>File</th><th>Rows</th>
                  <th>Imported</th><th>Duplicates</th><th>Skipped</th><th>Failed</th>
                </tr>
              </thead>
              <tbody>
                {history.data.items.map((h) => (
                  <tr key={h.AuditLogID}>
                    <td style={{ fontSize: 12 }}>{fmtDateTime(h.CreatedAt)}</td>
                    <td>{h.UserName ?? '—'}</td>
                    <td>{h.fileName ?? '—'}</td>
                    <td>{h.totalRows ?? '—'}</td>
                    <td style={{ color: 'var(--success)' }}>{h.imported ?? '—'}</td>
                    <td>{h.duplicates ?? '—'}</td>
                    <td>{h.skipped ?? '—'}</td>
                    <td style={{ color: (h.failed ?? 0) > 0 ? 'var(--danger)' : 'inherit' }}>{h.failed ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty icon="clock-rotate-left" message="No imports yet. Completed imports are recorded here." />}
      </Card>
    </>
  );
}

export default function TendersImportPage() {
  return (
    <Guard>
      <RequireRole roles={MANAGE_ROLES}>
        <ImportWizardInner />
      </RequireRole>
    </Guard>
  );
}
