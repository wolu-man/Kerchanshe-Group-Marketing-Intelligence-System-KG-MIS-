'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Loading, Empty, Badge, Icon, Tabs, Modal, Field } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useFetch } from '@/lib/use-api';
import { toast } from '@/components/Toast';
import { BarChart, Donut } from '@/components/ui';
import { fmtDateTime, fmtDate } from '@/lib/format';
import { parseSchema } from '@/lib/form-engine';
import type { FormElement, FormReport, ShareRow } from '@/lib/types';
import { AiAnalysisPanel } from './AiAnalysisPanel';

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');

function ReportBody({ report }: { report: FormReport }) {
  return (
    <>
      <div className="stat-grid" style={{ marginTop: 16 }}>
        <Card><div className="stat-card"><div className="label">Total responses</div><div className="value">{report.total}</div><div className="sub">Last updated {new Date(report.lastUpdated).toLocaleTimeString()}</div></div></Card>
      </div>
      <div className="dash-grid">
        {report.fields.map((f) => {
          const s = f.summary;
          if (s.count === 0) return null;
          let body: React.ReactNode = null;
          if (s.optionCounts) {
            const rows = Object.entries(s.optionCounts).sort((a, b) => b[1] - a[1]);
            body = rows.length <= 6 ? <Donut data={rows.map(([label, value]) => ({ label, value }))} /> : <BarChart data={rows.map(([label, value]) => ({ label, value }))} />;
          } else if (s.byMonth) {
            const rows = Object.entries(s.byMonth).sort((a, b) => (a[0] < b[0] ? -1 : 1));
            body = <BarChart data={rows.map(([label, value]) => ({ label, value }))} />;
          } else if (s.avg !== undefined && s.avg !== null) {
            body = (
              <div style={{ display: 'flex', gap: 14 }}>
                <div><div className="label" style={{ fontSize: 12 }}>Average</div><div style={{ fontSize: 24, fontWeight: 700 }}>{s.avg}</div></div>
                <div><div className="label" style={{ fontSize: 12 }}>Min</div><div style={{ fontSize: 18 }}>{s.min}</div></div>
                <div><div className="label" style={{ fontSize: 12 }}>Max</div><div style={{ fontSize: 18 }}>{s.max}</div></div>
                <div><div className="label" style={{ fontSize: 12 }}>Count</div><div style={{ fontSize: 18 }}>{s.count}</div></div>
              </div>
            );
          } else {
            body = <div className="empty">No responses for this field</div>;
          }
          return (
            <Card key={`${f.key}-${f.label}`} title={<span>{f.label} <Badge tone="neutral">{f.type}</Badge></span>}>
              {body}
            </Card>
          );
        })}
      </div>
    </>
  );
}

interface CrossReportRow {
  CrossReportID: number;
  Name: string;
  Description: string | null;
  TemplateIDs: number[];
  FieldMappings: Array<{ displayName: string; fieldKeys: Record<string, string> }>;
  CreatedAt: string;
}

export function ReportTab({ templateId }: { templateId: number }) {
  const [subtab, setSubtab] = useState('report');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const query = useMemo(() => {
    const p: string[] = [];
    if (from) p.push(`from=${encodeURIComponent(from)}`);
    if (to) p.push(`to=${encodeURIComponent(to)}`);
    return p.length ? `?${p.join('&')}` : '';
  }, [from, to]);

  const { data, loading, error, reload } = useFetch<FormReport>(`/forms/${templateId}/report${query}`, [query]);

  // shares (scoped to this form: form shares + cross-report shares including it)
  const shares = useFetch<{ items: ShareRow[] }>(`/forms/shares?templateId=${templateId}`);
  const [shareModal, setShareModal] = useState(false);
  const [shareExpiry, setShareExpiry] = useState('');
  const [newShare, setNewShare] = useState<string | null>(null);

  // cross reports
  const crossReports = useFetch<{ items: CrossReportRow[] }>(`/forms/cross-reports`);
  const [crOpen, setCrOpen] = useState(false);
  const [crEdit, setCrEdit] = useState<CrossReportRow | null>(null);
  const [crName, setCrName] = useState('');
  const [crDesc, setCrDesc] = useState('');
  const [crForms, setCrForms] = useState<number[]>([]);
  const [crMappings, setCrMappings] = useState<Array<{ displayName: string; fieldKeys: Record<string, string> }>>([]);
  const [crReport, setCrReport] = useState<number | null>(null);
  const forms = useFetch<{ items: Array<{ TemplateID: number; Title: string }> }>(`/forms`);
  const [formSchemas, setFormSchemas] = useState<Record<number, FormElement[]>>({});
  const [crReportData, setCrReportData] = useState<FormReport | null>(null);
  const [crReportLoading, setCrReportLoading] = useState(false);

  async function exportAs(format: 'excel' | 'pdf') {
    try {
      const token = localStorage.getItem('kgmis_token');
      const res = await fetch(`${BASE}/forms/${templateId}/export?format=${format}${query}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        toast.error('Export failed');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `form-${templateId}-report.${format === 'excel' ? 'xlsx' : 'pdf'}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Report exported');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    }
  }

  async function createFormShare() {
    setNewShare(null);
    try {
      const res = await api<{ Token: string }>(`/forms/${templateId}/shares`, {
        method: 'POST',
        body: { shareType: 'form', templateId, expiresAt: shareExpiry ? new Date(shareExpiry).toISOString() : null },
      });
      setNewShare(`${BASE}/share/${res.Token}`);
      toast.success('Share link created');
      void shares.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Share failed');
    }
  }

  async function revokeShare(id: number) {
    try {
      await api(`/forms/shares/${id}`, { method: 'DELETE' });
      toast.success('Share link revoked');
      void shares.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Revoke failed');
    }
  }

  // Cross-report builder -----------------------------------------------------
  function openCreate() {
    setCrEdit(null);
    setCrName('');
    setCrDesc('');
    setCrForms([templateId]);
    setCrMappings([{ displayName: '', fieldKeys: { [templateId]: '' } }]);
    setCrOpen(true);
  }

  function openEditImpl(cr: CrossReportRow) {
    setCrEdit(cr);
    setCrName(cr.Name);
    setCrDesc(cr.Description ?? '');
    setCrForms(cr.TemplateIDs);
    setCrMappings(cr.FieldMappings.length ? cr.FieldMappings.map((m) => ({ displayName: m.displayName, fieldKeys: { ...m.fieldKeys } })) : [{ displayName: '', fieldKeys: {} }]);
    setCrOpen(true);
  }

  // Load each selected form's schema fields for the mapping editor.
  useEffect(() => {
    for (const fid of crForms) {
      if (!formSchemas[fid]) {
        api<{ SchemaJSON: string }>(`/forms/${fid}/versions/latest`)
          .then((v) => setFormSchemas((s) => ({ ...s, [fid]: parseSchema(v.SchemaJSON).elements })))
          .catch(() => undefined);
      }
    }
  }, [crForms, formSchemas]);

  function toggleForm(fid: number) {
    const next = crForms.includes(fid) ? crForms.filter((f) => f !== fid) : [...crForms, fid];
    setCrForms(next);
    // reset mapping keys referencing removed forms
    setCrMappings((ms) => ms.map((m) => {
      const fieldKeys: Record<string, string> = {};
      for (const f of next) fieldKeys[f] = m.fieldKeys[f] ?? '';
      return { ...m, fieldKeys };
    }));
  }

  function addMapping() {
    const keys: Record<string, string> = {};
    for (const f of crForms) keys[f] = '';
    setCrMappings((ms) => [...ms, { displayName: '', fieldKeys: keys }]);
  }

  function saveCrossReport() {
    const tidy = crMappings.filter((m) => m.displayName.trim()).map((m) => ({
      displayName: m.displayName.trim(),
      fieldKeys: Object.fromEntries(Object.entries(m.fieldKeys).filter(([, v]) => v)),
    }));
    if (crForms.length < 2) { toast.error('Select at least 2 forms.'); return; }
    if (!tidy.length) { toast.error('Add at least one mapped column (with a display name).'); return; }
    const body = { name: crName.trim(), description: crDesc.trim() || undefined, templateIds: crForms, fieldMappings: tidy };
    const work = crEdit
      ? api(`/forms/cross-reports/${crEdit.CrossReportID}`, { method: 'PUT', body })
      : api<{ crossReportId: number }>(`/forms/cross-reports`, { method: 'POST', body });
    work
      .then(() => {
        setCrOpen(false);
        toast.success(crEdit ? 'Cross report updated' : 'Cross report created');
        void crossReports.reload();
      })
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Save failed'));
  }

  async function deleteCrossReport(id: number) {
    try {
      await api(`/forms/cross-reports/${id}`, { method: 'DELETE' });
      toast.success('Cross report deleted');
      void crossReports.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Delete failed');
    }
  }

  async function viewCrossReport(id: number) {
    setCrReport(id);
    setCrReportData(null);
    setCrReportLoading(true);
    try {
      const r = await api<FormReport>(`/forms/cross-reports/${id}/report`);
      setCrReportData(r);
    } catch {
      setCrReportData(null);
    } finally {
      setCrReportLoading(false);
    }
  }

  async function shareCrossReport(id: number) {
    setNewShare(null);
    try {
      const res = await api<{ Token: string }>(`/forms/${templateId}/shares`, {
        method: 'POST',
        body: { shareType: 'cross-report', crossReportId: id, expiresAt: null },
      });
      setNewShare(`${BASE}/share/${res.Token}`);
      toast.success('Share link created');
      void shares.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Share failed');
    }
  }

  return (
    <div>
      <Tabs
        tabs={[
          { id: 'report', label: 'Report' },
          { id: 'ai', label: 'AI analysis' },
          { id: 'shares', label: 'Share links', badge: shares.data?.items.length ?? 0 },
          { id: 'cross', label: 'Cross reports', badge: crossReports.data?.items.length ?? 0 },
        ]}
        active={subtab}
        onChange={setSubtab}
      />

      {subtab === 'report' ? (
        <>
          <Card title="Real-time report">
            <div className="filters" style={{ marginBottom: 0 }}>
              <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
              <span style={{ color: 'var(--text-muted)' }}><Icon name="arrow-right" /></span>
              <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
              <Button variant="ghost" onClick={() => { setFrom(''); setTo(''); }}>Clear</Button>
              <div style={{ flex: 1 }} />
              <Button variant="ghost" size="sm" onClick={() => void exportAs('excel')}><Icon name="file-excel" /> Excel</Button>
              <Button variant="ghost" size="sm" onClick={() => void exportAs('pdf')}><Icon name="file-pdf" /> PDF</Button>
            </div>
          </Card>
          {loading ? <Loading /> : error ? <div className="alert alert-error">{error}</div> : data ? <ReportBody report={data} /> : null}
        </>
      ) : null}

      {subtab === 'ai' ? <AiAnalysisPanel formId={templateId} /> : null}

      {subtab === 'shares' ? (
        <Card title="Share links" flush
          actions={<Button variant="ghost" size="sm" onClick={() => { setShareModal(true); setNewShare(null); }}><Icon name="link" /> New link for this form</Button>}>
          {shares.loading ? <Loading /> : shares.data?.items.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Target</th><th>Created</th><th>Expires</th><th>Link</th><th></th></tr></thead>
                <tbody>
                  {shares.data.items.map((s) => (
                    <tr key={s.ShareID}>
                      <td>{s.ShareType === 'cross-report' ? s.CrossReportName : s.FormTitle}<Badge tone="info">{s.ShareType}</Badge></td>
                      <td>{fmtDateTime(s.CreatedAt)}</td>
                      <td>{s.ExpiresAt ? fmtDate(s.ExpiresAt) : 'Never'}</td>
                      <td><code style={{ fontSize: 11 }}>{`${BASE}/share/${s.Token.slice(0, 10)}…`}</code></td>
                      <td>
                        <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard?.writeText(`${BASE}/share/${s.Token}`); toast.success('Link copied to clipboard'); }}><Icon name="copy" /></Button>
                        <Button variant="danger-ghost" size="sm" onClick={() => void revokeShare(s.ShareID)}><Icon name="ban" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty icon="link" message="No share links yet — share a read-only report with anyone, without a login" />
          )}

          <Modal open={shareModal} onClose={() => setShareModal(false)} title="Create share link"
            footer={<>
              <Button variant="ghost" onClick={() => setShareModal(false)}>Cancel</Button>
              <Button onClick={() => void createFormShare()}>Create link</Button>
            </>}>
            <Field label="Expires at (optional)">
              <input className="input" type="datetime-local" value={shareExpiry} onChange={(e) => setShareExpiry(e.target.value)} />
            </Field>
            <p className="hint">Anyone with the link can view the report read-only until it is revoked.</p>
            {newShare ? (
              <div className="alert alert-success" style={{ wordBreak: 'break-all' }}>
                <b>Share link created:</b> <a href={newShare} target="_blank" rel="noreferrer">{newShare}</a>
              </div>
            ) : null}
          </Modal>
        </Card>
      ) : null}

      {subtab === 'cross' ? (
        <>
          {crReport !== null ? (
            <Card title={<><Button variant="ghost" size="sm" onClick={() => setCrReport(null)}><Icon name="arrow-left" /></Button> Cross report</>}>
              {crReportLoading ? <Loading /> : crReportData ? <ReportBody report={crReportData} /> : <div className="alert alert-error">Could not load report</div>}
            </Card>
          ) : (
            <Card title="Cross-form reports" flush
              actions={<Button variant="ghost" size="sm" onClick={openCreate}><Icon name="plus" /> New cross report</Button>}>
              {crossReports.loading ? <Loading /> : crossReports.data?.items.length ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>#</th><th>Name</th><th>Forms</th><th>Columns</th><th>Created</th><th></th></tr></thead>
                    <tbody>
                      {crossReports.data.items.map((cr) => (
                        <tr key={cr.CrossReportID}>
                          <td>#{cr.CrossReportID}</td>
                          <td><b>{cr.Name}</b>{cr.Description ? <div className="hint">{cr.Description}</div> : null}</td>
                          <td>{cr.TemplateIDs.length}</td>
                          <td>{cr.FieldMappings.length}</td>
                          <td>{fmtDate(cr.CreatedAt)}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <Button variant="ghost" size="sm" onClick={() => void viewCrossReport(cr.CrossReportID)}><Icon name="eye" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => openEditImpl(cr)}><Icon name="pen" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => void shareCrossReport(cr.CrossReportID)} title="Create share link"><Icon name="link" /></Button>
                            <Button variant="danger-ghost" size="sm" onClick={() => void deleteCrossReport(cr.CrossReportID)}><Icon name="trash" /></Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty icon="table-list" message="No cross reports yet. Combine two or more forms into a single report." />
              )}
            </Card>
          )}

          {newShare && crReport !== null ? (
            <div className="alert alert-success" style={{ marginTop: 10, wordBreak: 'break-all' }}>
              <b>Share link created:</b> <a href={newShare} target="_blank" rel="noreferrer">{newShare}</a>
            </div>
          ) : null}
        </>
      ) : null}

      {/* Cross-report create/edit modal */}
      <Modal open={crOpen} onClose={() => setCrOpen(false)} title={crEdit ? 'Edit cross report' : 'New cross report'} wide
        footer={<>
          <Button variant="ghost" onClick={() => setCrOpen(false)}>Cancel</Button>
          <Button onClick={saveCrossReport}>Save</Button>
        </>}>
        <div className="grid-2">
          <div>
            <Field label="Name" required>
              <input className="input" value={crName} onChange={(e) => setCrName(e.target.value)} />
            </Field>
            <Field label="Description">
              <textarea className="textarea" style={{ minHeight: 54 }} value={crDesc} onChange={(e) => setCrDesc(e.target.value)} />
            </Field>
            <Field label="Forms (select at least 2)">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflow: 'auto' }}>
                {(forms.data?.items ?? []).map((f) => (
                  <label className="checkbox-row" key={f.TemplateID}>
                    <input type="checkbox" checked={crForms.includes(f.TemplateID)} onChange={() => toggleForm(f.TemplateID)} />
                    #{f.TemplateID} {f.Title}
                  </label>
                ))}
              </div>
              {forms.loading ? <Loading /> : null}
            </Field>
          </div>
          <div>
            <div className="label" style={{ fontSize: 12, marginBottom: 6 }}>Column mappings</div>
            {crMappings.map((m, i) => (
              <div key={i} className="card" style={{ padding: 10, marginBottom: 8 }}>
                <div className="form-row" style={{ marginBottom: 6 }}>
                  <Field label="Column name">
                    <input className="input" value={m.displayName} onChange={(e) => setCrMappings((ms) => ms.map((x, j) => (j === i ? { ...x, displayName: e.target.value } : x)))} />
                  </Field>
                  <Button variant="danger-ghost" size="sm" style={{ marginTop: 22 }} onClick={() => setCrMappings((ms) => ms.filter((_, j) => j !== i))}><Icon name="trash" /></Button>
                </div>
                {crForms.map((fid) => (
                  <div key={fid} className="form-row" style={{ marginBottom: 4 }}>
                    <label className="label" style={{ fontSize: 11, minWidth: 70 }}>#{fid}</label>
                    <select
                      className="select"
                      value={m.fieldKeys[fid] ?? ''}
                      onChange={(e) => setCrMappings((ms) => ms.map((x, j) => (j === i ? { ...x, fieldKeys: { ...x.fieldKeys, [fid]: e.target.value } } : x)))}
                    >
                      <option value="">— (skip) —</option>
                      {(formSchemas[fid] ?? []).map((el) => <option key={el.key} value={el.key}>{el.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={addMapping}><Icon name="plus" /> Add column</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}