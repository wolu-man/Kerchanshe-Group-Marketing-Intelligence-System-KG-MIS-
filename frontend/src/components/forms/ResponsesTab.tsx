'use client';

import { useMemo, useState, useEffect } from 'react';
import { Button, Card, Loading, Empty, Modal, Badge, StatusBadge, Icon, Tabs, Pagination } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useFetch } from '@/lib/use-api';
import { toast } from '@/components/Toast';
import { fmtDateTime } from '@/lib/format';
import { parseSchema, computeScore } from '@/lib/form-engine';
import { FormRenderer } from '@/components/forms/FormRenderer';
import type {
  AnomalyFlag, Answers, FormElement, FormResponseRow, FormSchemaEnvelope,
  ResponseDetail, ResponseRevisionRow,
} from '@/lib/types';

function parseAnswerJSON(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}

function renderValue(value: unknown, el?: FormElement): string {
  if (Array.isArray(value)) return value.join(', ');
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object' && el?.type === 'location') {
    const loc = value as { lat?: number; lng?: number; address?: string };
    return loc.address ?? `${loc.lat?.toFixed(5)}, ${loc.lng?.toFixed(5)}`;
  }
  if (typeof value === 'object' && el?.type === 'matrix') {
    const obj = value as Record<string, unknown>;
    return Object.entries(obj)
      .filter(([, v]) => v !== undefined && v !== null && (Array.isArray(v) ? (v as unknown[]).length : v))
      .map(([r, v]) => `${r}: ${Array.isArray(v) ? (v as string[]).join(', ') : String(v)}`)
      .join(' · ') || '—';
  }
  return String(value);
}

export function ResponsesTab({ templateId }: { templateId: number }) {
  const [subtab, setSubtab] = useState('responses');
  const [respPage, setRespPage] = useState(1);
  const PAGE_SIZE = 20;
  useEffect(() => { setRespPage(1); }, [templateId]);

  const { data, loading, error, reload } = useFetch<{ items: FormResponseRow[]; total: number; page: number; pageSize: number }>(`/forms/${templateId}/responses?page=${respPage}&pageSize=${PAGE_SIZE}`, [respPage]);
  const versions = useFetch<{ SchemaJSON: string }>(`/forms/${templateId}/versions/latest`);
  const envelope = useMemo<FormSchemaEnvelope | null>(() => (versions.data ? parseSchema(versions.data.SchemaJSON) : null), [versions.data]);
  const labelMap = useMemo<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const el of envelope?.elements ?? []) m[el.key] = el.label;
    return m;
  }, [envelope]);

  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<ResponseDetail | null>(null);

  // edit state
  const [editOpen, setEditOpen] = useState(false);
  const [editAnswers, setEditAnswers] = useState<Answers | null>(null);
  const [editBusy, setEditBusy] = useState(false);

  // revisions
  const [revisions, setRevisions] = useState<ResponseRevisionRow[] | null>(null);

  // anomalies
  const anomalies = useFetch<{ items: AnomalyFlag[] }>(`/forms/${templateId}/anomalies`);
  const [recomputeBusy, setRecomputeBusy] = useState(false);

  async function open(id: number) {
    setSelected(id);
    setDetail(null);
    setRevisions(null);
    setEditOpen(false);
    try {
      const res = await api<ResponseDetail>(`/forms/${templateId}/responses/${id}`);
      setDetail(res);
    } catch {
      setDetail(null);
    }
  }

  async function loadRevisions() {
    if (!selected) return;
    try {
      const res = await api<{ items: ResponseRevisionRow[] }>(`/forms/${templateId}/responses/${selected}/revisions`);
      setRevisions(res.items);
    } catch {
      setRevisions([]);
    }
  }

  async function requestErasure() {
    if (!selected) return;
    try {
      await api(`/forms/${templateId}/responses/${selected}/erasure`, { method: 'POST' });
      toast.success('Erasure request submitted');
    } catch {
      toast.error('Erasure request failed');
    }
  }

  async function startEdit() {
    if (!detail || !envelope) return;
    const record: Answers = {};
    for (const a of detail.answers) record[a.FieldKey] = parseAnswerJSON(a.ValueJSON);
    setEditAnswers(record);
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!selected || !editAnswers) return;
    setEditBusy(true);
    try {
      await api(`/forms/${templateId}/responses/${selected}`, {
        method: 'PUT',
        body: { answers: editAnswers },
      });
      toast.success('Edit saved');
      setEditOpen(false);
      await open(selected);
      void reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Edit failed');
    } finally {
      setEditBusy(false);
    }
  }

  async function setAnomalyStatus(flag: AnomalyFlag, status: 'Pending' | 'Acknowledged' | 'Resolved') {
    try {
      await api(`/forms/${templateId}/anomalies/${flag.FlagID}`, {
        method: 'PUT',
        body: { status, resolution: flag.Resolution ?? undefined },
      });
      if (status === 'Resolved') toast.success('Anomaly resolved');
      else toast.info(`Anomaly ${status.toLowerCase()}ed`);
      void anomalies.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Update failed');
    }
  }

  async function recompute() {
    setRecomputeBusy(true);
    try {
      const res = await api<{ scanned: number }>(`/forms/${templateId}/anomalies/recompute`, { method: 'POST' });
      toast.success(`Re-scan complete: ${res.scanned} submission(s) checked`);
      void anomalies.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Re-scan failed');
    } finally {
      setRecomputeBusy(false);
    }
  }

  return (
    <div>
      <Tabs
        tabs={[
          { id: 'responses', label: 'Responses', badge: data?.items.length ?? 0 },
          { id: 'anomalies', label: 'Anomalies', badge: anomalies.data?.items.filter((a) => a.Status === 'Pending').length ?? 0 },
        ]}
        active={subtab}
        onChange={setSubtab}
      />

      {subtab === 'anomalies' ? (
        <Card title="Anomaly flags" flush
          actions={<Button variant="ghost" size="sm" disabled={recomputeBusy} onClick={() => void recompute()}><Icon name="magnifying-glass-chart" /> Re-scan submissions</Button>}>
          {anomalies.loading ? <Loading /> : anomalies.error ? <div className="alert alert-error">{anomalies.error}</div> : anomalies.data?.items.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>#</th><th>Response</th><th>Type</th><th>Field</th><th>Score</th><th>Reason</th><th>Status</th><th>Submitted</th><th></th></tr>
                </thead>
                <tbody>
                  {anomalies.data.items.map((a) => (
                    <tr key={a.FlagID}>
                      <td>#{a.FlagID}</td>
                      <td>#{a.ResponseID}</td>
                      <td><Badge tone={a.AnomalyType === 'AutoReject' ? 'danger' : 'warning'}>{a.AnomalyType}</Badge></td>
                      <td>{labelMap[a.FieldKey ?? ''] ?? a.FieldKey ?? '—'}</td>
                      <td>{a.Score !== null ? a.Score : '—'}</td>
                      <td style={{ maxWidth: 260 }}>{a.Reason}</td>
                      <td><StatusBadge status={a.Status} /></td>
                      <td>{fmtDateTime(a.SubmittedAt)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {a.Status === 'Pending' ? (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => void setAnomalyStatus(a, 'Acknowledged')}>Ack</Button>
                            <Button variant="ghost" size="sm" onClick={() => void setAnomalyStatus(a, 'Resolved')}>Resolve</Button>
                          </>
                        ) : a.Status === 'Acknowledged' ? (
                          <Button variant="ghost" size="sm" onClick={() => void setAnomalyStatus(a, 'Resolved')}>Resolve</Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty icon="shield-check" message="No anomaly flags" />
          )}
        </Card>
      ) : (
        <Card title="Responses" flush
          actions={envelope ? <span className="hint">Scoring: max {computeScore(envelope.elements, {}).max} pts</span> : null}>
          {loading ? <Loading /> : error ? <div className="alert alert-error">{error}</div> : data?.items.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>ID</th><th>Respondent</th><th>Status</th><th>Score</th><th>Edits</th><th>Submitted</th><th></th></tr>
                </thead>
                <tbody>
                  {data.items.map((r) => (
                    <tr key={r.ResponseID}>
                      <td>#{r.ResponseID}</td>
                      <td>{r.RespondentName ?? r.RespondentEmail ?? 'Anonymous'}</td>
                      <td><StatusBadge status={r.Status} /></td>
                      <td>{r.TotalScore !== null ? `${r.TotalScore} / ${r.ScoreMax ?? '—'}` : '—'}</td>
                      <td>{r.EditCount ? <span title={`Last edited ${fmtDateTime(r.EditedAt)}`}>{r.EditCount}×</span> : '—'}</td>
                      <td>{fmtDateTime(r.SubmittedAt)}</td>
                      <td><Button variant="ghost" size="sm" onClick={() => void open(r.ResponseID)}>View <Icon name="arrow-right" /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty icon="clipboard-list" message="No responses submitted yet" />
          )}
        </Card>
      )}

      {subtab === 'responses' && <Pagination page={respPage} total={data?.total ?? 0} pageSize={PAGE_SIZE} onPageChange={setRespPage} />}

      {/* Detail modal */}
      <Modal open={selected !== null} onClose={() => setSelected(null)} title={`Response #${selected ?? ''}`} wide
        footer={<>
          <Button variant="ghost" onClick={loadRevisions}><Icon name="clock-rotate-left" /> Revisions {revisions ? `(${revisions.length})` : ''}</Button>
          <Button variant="ghost" onClick={startEdit} disabled={!detail || !envelope}><Icon name="pen" /> Edit response</Button>
          <Button variant="danger-ghost" onClick={requestErasure}>Request erasure</Button>
          <Button variant="primary" onClick={() => setSelected(null)}>Close</Button>
        </>}>
        {detail ? (
          <div>
            <div className="hint" style={{ marginBottom: 12 }}>
              Submitted {fmtDateTime(detail.SubmittedAt)} by {detail.RespondentName ?? detail.RespondentEmail ?? 'anonymous'}
              {detail.ConsentGiven !== null ? ` · Consent v${detail.ConsentVersion} ${detail.ConsentGiven ? 'given' : 'not given'}` : ''}
              {detail.TotalScore !== null ? <span style={{ fontWeight: 600 }}> · Score {detail.TotalScore} / {detail.ScoreMax ?? '—'}</span> : null}
              {detail.EditCount ? ` · Edited ${detail.EditCount}×` : ''}
            </div>

            {revisions ? (
              <div style={{ marginBottom: 14 }}>
                <h4 style={{ margin: '0 0 6px', fontSize: 14 }}>Revisions</h4>
                {revisions.length ? (
                  <table className="table">
                    <thead><tr><th>Rev</th><th>Edited by</th><th>Reason</th><th>When</th></tr></thead>
                    <tbody>
                      {revisions.map((rv) => (
                        <tr key={rv.RevisionID}>
                          <td>#{rv.RevisionID}</td>
                          <td>User #{rv.EditedBy ?? '—'}</td>
                          <td>{rv.Reason ?? '—'}</td>
                          <td>{fmtDateTime(rv.CreatedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="hint">No revisions recorded.</div>
                )}
              </div>
            ) : null}

            <table className="table">
              <tbody>
                {detail.answers.map((a) => {
                  const el = envelope?.elements.find((e) => e.key === a.FieldKey);
                  return (
                    <tr key={a.FieldKey}>
                      <td style={{ width: '38%', fontWeight: 600 }}>{el?.label ?? a.FieldKey}</td>
                      <td>{renderValue(parseAnswerJSON(a.ValueJSON), el)}</td>
                    </tr>
                  );
                })}
                {detail.files.length ? (
                  <tr>
                    <td style={{ fontWeight: 600 }}>Files</td>
                    <td>
                      {detail.files.map((f) => (
                        <div key={f.FileID}>
                          {f.OriginalName} <Badge tone={f.ScanStatus === 'Clean' ? 'success' : f.ScanStatus === 'Rejected' ? 'danger' : 'warning'}>{f.ScanStatus}</Badge>
                        </div>
                      ))}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : (
          <Loading />
        )}
      </Modal>

      {/* Edit modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Edit response #${selected ?? ''}`} wide
        footer={<>
          <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button busy={editBusy} onClick={() => void saveEdit()}>Save edits</Button>
        </>}>
        {envelope && detail && editAnswers !== null ? (
          <div style={{ maxWidth: 620, margin: '0 auto' }}>
            <p className="hint" style={{ marginBottom: 10 }}>
              Edit the answers below. Changes are snapshotted as a revision for audit.
            </p>
            <FormRenderer
              envelope={envelope}
              answers={editAnswers}
              setAnswers={setEditAnswers}
              editable
              allowDrafts={false}
              templateId={templateId}
              aiAssist={{ mode: 'edit' }}
            />
          </div>
        ) : (
          <Loading />
        )}
      </Modal>
    </div>
  );
}