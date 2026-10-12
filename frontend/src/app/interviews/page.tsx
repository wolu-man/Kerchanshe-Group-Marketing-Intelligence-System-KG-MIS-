'use client';

import { useState, useEffect, useRef } from 'react';
import { Guard } from '@/components/Guard';
import { Button, Card, Loading, Empty, StatusBadge, Modal, Field, Badge, Icon, Tabs, Pagination } from '@/components/ui';
import { TourTrigger } from '@/components/tour/TourTrigger';
import { api, ApiError } from '@/lib/api';
import { useFetch } from '@/lib/use-api';
import { toast } from '@/components/Toast';
import { useAuth } from '@/lib/auth-context';
import { fmtDate } from '@/lib/format';
import type { Interview, BusinessGroup, Region, Outlet, LookupOption, CustomerType } from '@/lib/types';

const REVIEW_ROLES = ['Administrator', 'Marketing Manager'];

const SENTIMENT_TONE: Record<string, 'success' | 'neutral' | 'danger'> = {
  Positive: 'success',
  Neutral: 'neutral',
  Negative: 'danger',
};

function autoSentiment(score: number | null | string): string {
  const n = typeof score === 'string' ? parseInt(score, 10) : score;
  if (n == null || isNaN(n)) return '';
  if (n <= 2) return 'Negative';
  if (n === 3) return 'Neutral';
  return 'Positive';
}

function emptyForm() {
  return {
    businessGroupId: 0,
    regionId: 0,
    outletId: 0,
    interviewDate: new Date().toISOString().slice(0, 10),
    respondentType: 'Customer',
    respondentName: '',
    satisfactionScore: '',
    sentiment: '',
    keyFeedback: '',
    address: '',
    capturedLat: '',
    capturedLng: '',
    qas: [] as Array<{ question: string; answer: string }>,
  };
}

function useGeolocation() {
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  useEffect(() => {
    if (!navigator.geolocation) { setGeoErr('Geolocation not supported'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
      (err) => { setGeoErr(err.message); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);
  return { loc, geoErr };
}

function InterviewForm({ groups, regions, outlets, respondentTypes, sentiments, initial, onDone }: {
  groups: BusinessGroup[];
  regions: Region[];
  outlets: Outlet[];
  respondentTypes: CustomerType[];
  sentiments: LookupOption[];
  initial?: Interview;
  onDone: (msg: string) => void;
}) {
  const { loc: geoLoc } = useGeolocation();
  const [form, setForm] = useState(() => ({
    businessGroupId: initial?.BusinessGroupID ?? 0,
    regionId: initial?.RegionID ?? 0,
    outletId: initial?.OutletID ?? 0,
    interviewDate: initial?.InterviewDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    respondentType: initial?.RespondentType ?? 'Customer',
    respondentName: initial?.RespondentName ?? '',
    satisfactionScore: initial?.SatisfactionScore != null ? String(initial.SatisfactionScore) : '',
    sentiment: initial?.Sentiment ?? '',
    keyFeedback: initial?.KeyFeedback ?? '',
    address: initial?.Address ?? '',
    capturedLat: initial?.CapturedLat != null ? String(initial.CapturedLat) : '',
    capturedLng: initial?.CapturedLng != null ? String(initial.CapturedLng) : '',
  }));
  const [qas, setQas] = useState<Array<{ question: string; answer: string }>>(
    initial?.QAs?.map((qa) => ({ question: qa.Question, answer: qa.Answer ?? '' })) ?? []
  );
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const sentimentValue = form.satisfactionScore ? autoSentiment(form.satisfactionScore) : '';

  useEffect(() => {
    if (form.satisfactionScore) {
      const auto = autoSentiment(form.satisfactionScore);
      setForm((f) => ({ ...f, sentiment: auto }));
    }
  }, [form.satisfactionScore]);

  useEffect(() => {
    if (!initial && geoLoc && !form.capturedLat) {
      setForm((f) => ({
        ...f,
        capturedLat: String(geoLoc.lat),
        capturedLng: String(geoLoc.lng),
      }));
    }
  }, [geoLoc, initial]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    if (f.size > 50 * 1024 * 1024) { toast.error('File too large (max 50 MB)'); return; }
    setFile(f);
    if (f.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
  }

  function addQa() {
    setQas((prev) => [...prev, { question: '', answer: '' }]);
  }

  function updateQa(index: number, field: 'question' | 'answer', value: string) {
    setQas((prev) => prev.map((qa, i) => (i === index ? { ...qa, [field]: value } : qa)));
  }

  function removeQa(index: number) {
    setQas((prev) => prev.filter((_, i) => i !== index));
  }

  async function submit() {
    if (!form.businessGroupId) { toast.error('Select a business group'); return; }
    if (!form.regionId) { toast.error('Select a region'); return; }
    if (!form.respondentName.trim()) { toast.error('Respondent name is required'); return; }
    if (!form.interviewDate) { toast.error('Select an interview date'); return; }
    const validQas = qas.filter((qa) => qa.question.trim());
    setBusy(true);
    try {
      const body = {
        businessGroupId: Number(form.businessGroupId),
        regionId: Number(form.regionId),
        outletId: form.outletId ? Number(form.outletId) : null,
        interviewDate: form.interviewDate,
        respondentType: form.respondentType,
        respondentName: form.respondentName.trim(),
        satisfactionScore: form.satisfactionScore === '' ? null : Number(form.satisfactionScore),
        sentiment: sentimentValue || null,
        keyFeedback: form.keyFeedback || null,
        photoVideoRef: null,
        address: form.address || null,
        capturedLat: form.capturedLat === '' ? null : Number(form.capturedLat),
        capturedLng: form.capturedLng === '' ? null : Number(form.capturedLng),
        qas: validQas.length > 0 ? validQas : undefined,
      };
      let interviewId: number;
      if (initial) {
        await api(`/interviews/${initial.InterviewID}`, { method: 'PUT', body });
        interviewId = initial.InterviewID;
      } else {
        const res = await api<{ interviewId: number }>('/interviews', { method: 'POST', body });
        interviewId = res.interviewId;
      }
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        await api(`/interviews/${interviewId}/photo`, { method: 'POST', body: fd, json: false });
      }
      onDone(initial ? 'Interview updated' : 'Draft interview created');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  const starLabels = ['', '1 - Very Unsatisfied', '2 - Unsatisfied', '3 - Neutral', '4 - Satisfied', '5 - Very Satisfied'];

  return (
    <div>
      <Field label="Respondent name" required>
        <input className="input" value={form.respondentName} onChange={set('respondentName')} placeholder="e.g. Meron Alemu" />
      </Field>
      <div className="form-row">
        <Field label="Respondent type" required>
          <select className="select" value={form.respondentType} onChange={set('respondentType')}>
            {respondentTypes.map((t) => <option key={t.CustomerTypeID} value={t.Name}>{t.Name}</option>)}
          </select>
        </Field>
        <Field label="Interview date" required>
          <input className="input" type="date" value={form.interviewDate} onChange={set('interviewDate')} />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Business group" required>
          <select className="select" value={form.businessGroupId} onChange={set('businessGroupId')}>
            <option value={0}>— select —</option>
            {groups.map((g) => <option key={g.BusinessGroupID} value={g.BusinessGroupID}>{g.Name}</option>)}
          </select>
        </Field>
        <Field label="Region" required>
          <select className="select" value={form.regionId} onChange={set('regionId')}>
            <option value={0}>— select —</option>
            {regions.map((r) => <option key={r.RegionID} value={r.RegionID}>{r.RegionName}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Outlet (optional)">
        <select className="select" value={form.outletId} onChange={set('outletId')}>
          <option value={0}>— none —</option>
          {outlets.map((o) => <option key={o.OutletID} value={o.OutletID}>{o.OutletName} ({o.City})</option>)}
        </select>
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        <div>
          <Field label="Satisfaction score (1-5)" required>
            <select className="select" value={form.satisfactionScore} onChange={set('satisfactionScore')}>
              <option value="">— select score —</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{starLabels[n]}</option>)}
            </select>
          </Field>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Sentiment:</span>
            {sentimentValue ? (
              <Badge tone={SENTIMENT_TONE[sentimentValue] ?? 'neutral'}>{sentimentValue}</Badge>
            ) : (
              <span style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>auto from score</span>
            )}
          </div>
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Questions & Answers</span>
            <Button size="sm" variant="ghost" onClick={addQa}><Icon name="plus" /> Add</Button>
          </div>
          {qas.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0' }}>No questions yet.</p>
          )}
          {qas.map((qa, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <input className="input" value={qa.question} onChange={(e) => updateQa(idx, 'question', e.target.value)} placeholder={`Q${idx + 1}`} />
              </div>
              <div style={{ flex: 1 }}>
                <input className="input" value={qa.answer} onChange={(e) => updateQa(idx, 'answer', e.target.value)} placeholder={`A${idx + 1}`} />
              </div>
              <button type="button" onClick={() => removeQa(idx)} style={{ background: 'none', border: 'none', color: 'var(--color-danger, #dc2626)', cursor: 'pointer', padding: 4 }} title="Remove">
                <Icon name="trash" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <Field label="Key feedback / themes">
        <textarea className="textarea" value={form.keyFeedback} onChange={set('keyFeedback')} placeholder="What did the respondent say? Key themes, requests, issues…" rows={3} />
      </Field>

      <Field label="Address (optional)">
        <input className="input" value={form.address} onChange={set('address')} placeholder="Street address, city, area..." />
      </Field>

      <div className="form-row">
        <Field label="Photo / Video">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input ref={fileRef} type="file" accept="image/*,video/*" onChange={onFileChange} style={{ display: 'none' }} />
            <Button size="sm" variant="ghost" type="button" onClick={() => fileRef.current?.click()}>
              <Icon name="image" /> Choose file
            </Button>
            {(file || initial?.PhotoVideoRef) && (
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {file?.name ?? initial?.PhotoVideoRef?.split('/').pop()}
              </span>
            )}
          </div>
          {preview && (
            <div style={{ marginTop: 8 }}>
              <img src={preview} alt="Preview" style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 8, border: '1px solid var(--border)' }} />
            </div>
          )}
        </Field>
        <Field label="Location">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input className="input" value={form.capturedLat} onChange={set('capturedLat')} placeholder="Lat" />
            <input className="input" value={form.capturedLng} onChange={set('capturedLng')} placeholder="Lng" />
            <Button size="sm" variant="ghost" type="button" onClick={() => {
              if (!navigator.geolocation) { toast.error('Geolocation not supported'); return; }
              navigator.geolocation.getCurrentPosition(
                (pos) => setForm((f) => ({ ...f, capturedLat: String(pos.coords.latitude), capturedLng: String(pos.coords.longitude) })),
                (err) => toast.error(err.message),
                { enableHighAccuracy: true, timeout: 10000 }
              );
            }} title="Get current location"><Icon name="crosshairs" /></Button>
          </div>
        </Field>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <Button onClick={() => void submit()} busy={busy}>{initial ? 'Save changes' : 'Create draft'}</Button>
      </div>
    </div>
  );
}

function InterviewsInner() {
  const { user } = useAuth();
  const [status, setStatus] = useState('');
  const [regionId, setRegionId] = useState('');
  const [businessGroupId, setBusinessGroupId] = useState('');
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState('list');
  const [modal, setModal] = useState<{ open: boolean; initial?: Interview }>({ open: false });
  const [detail, setDetail] = useState<number | null>(null);
  const [rejectModal, setRejectModal] = useState<{ open: boolean; interviewId: number | null }>({ open: false, interviewId: null });

  const PAGE_SIZE = 20;

  useEffect(() => { setPage(1); }, [status, regionId, businessGroupId]);

  const filters = [
    status ? `status=${status}` : '',
    regionId ? `regionId=${regionId}` : '',
    businessGroupId ? `businessGroupId=${businessGroupId}` : '',
    `page=${page}`,
    `pageSize=${PAGE_SIZE}`,
  ].filter(Boolean).join('&');

  const { data, loading, error, reload } = useFetch<{ items: Interview[]; total: number }>(
    `/interviews?${filters}`,
    [status, regionId, businessGroupId, page]
  );
  const groups = useFetch<{ items: BusinessGroup[] }>('/reference/business-groups');
  const regions = useFetch<{ items: Region[] }>('/reference/regions');
  const outlets = useFetch<{ items: Outlet[] }>('/reference/outlets');
  const respondentTypes = useFetch<{ items: CustomerType[] }>('/reference/customer-types');
  const sentiments = useFetch<{ items: LookupOption[] }>('/reference/lookups?category=Sentiment');
  const detailRow = useFetch<Interview>(detail ? `/interviews/${detail}` : null, [detail]);

  const canReview = user ? REVIEW_ROLES.includes(user.role) : false;
  const isFieldOfficer = user?.role === 'Field Officer';

  async function action(id: number, kind: 'submit' | 'review' | 'approve', ok: string) {
    try {
      await api(`/interviews/${id}/${kind}`, { method: 'POST' });
      toast.success(ok);
      void reload();
      if (detail) { setDetail(null); }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Action failed');
    }
  }

  async function reject(id: number, reason: string) {
    try {
      await api(`/interviews/${id}/reject`, { method: 'POST', body: { reason } });
      toast.success('Interview rejected');
      setRejectModal({ open: false, interviewId: null });
      void reload();
      if (detail) { setDetail(null); }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Reject failed');
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Customer &amp; Distributor Interviews</h1>
          <div className="sub">Structured interviews — capture, review and approve respondent feedback.</div>
        </div>
        <div className="actions">
          <TourTrigger tourId="interviews" />
          <Button onClick={() => setModal({ open: true })}><Icon name="plus" /> New interview</Button>
        </div>
      </div>

      <Tabs tabs={[{ id: 'list', label: 'Interviews' }, { id: 'detail', label: 'Detail' }]} active={tab} onChange={(t) => setTab(t)} />

      {tab === 'list' && (
        <Card title={`Interviews (${data?.total ?? 0})`} flush>
          <div className="filters">
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="Draft">Draft</option>
              <option value="Submitted">Submitted</option>
              <option value="Reviewed">Reviewed</option>
              <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
            </select>
            <select className="select" value={regionId} onChange={(e) => setRegionId(e.target.value)}>
              <option value="">All regions</option>
              {regions.data?.items.map((r) => <option key={r.RegionID} value={r.RegionID}>{r.RegionName}</option>)}
            </select>
            <select className="select" value={businessGroupId} onChange={(e) => setBusinessGroupId(e.target.value)}>
              <option value="">All business groups</option>
              {groups.data?.items.map((g) => <option key={g.BusinessGroupID} value={g.BusinessGroupID}>{g.Name}</option>)}
            </select>
          </div>
          {loading ? <Loading /> : error ? <div className="alert alert-error">{error}</div> : data?.items.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Respondent</th><th>Type</th><th>Date</th><th>Group</th><th>Region</th>
                    <th>Satisfaction</th><th>Sentiment</th><th>Status</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((i) => (
                    <tr key={i.InterviewID}>
                      <td>
                        <b>{i.RespondentName}</b>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{i.InterviewerName}</div>
                      </td>
                      <td><Badge tone="info">{i.RespondentType}</Badge></td>
                      <td>{fmtDate(i.InterviewDate)}</td>
                      <td>{i.BusinessGroupName}</td>
                      <td>{i.RegionName}</td>
                      <td>{i.SatisfactionScore ?? '—'}</td>
                      <td>{i.Sentiment ? <Badge tone={SENTIMENT_TONE[i.Sentiment] ?? 'neutral'}>{i.Sentiment}</Badge> : '—'}</td>
                      <td><StatusBadge status={i.Status} /></td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <Button size="sm" variant="ghost" onClick={() => { setDetail(i.InterviewID); setTab('detail'); }}>View</Button>
                          {i.Status === 'Draft' && i.UserID === user?.userId ? (
                            <Button size="sm" onClick={() => setModal({ open: true, initial: i })}>Edit</Button>
                          ) : null}
                          {i.Status === 'Draft' && i.UserID === user?.userId ? (
                            <Button size="sm" variant="success" onClick={() => void action(i.InterviewID, 'submit', 'Submitted for review')}>Submit</Button>
                          ) : null}
                          {i.Status === 'Submitted' && canReview ? (
                            <Button size="sm" onClick={() => void action(i.InterviewID, 'review', 'Interview reviewed')}>Review</Button>
                          ) : null}
                          {i.Status === 'Reviewed' && canReview ? (
                            <>
                              <Button size="sm" variant="success" onClick={() => void action(i.InterviewID, 'approve', 'Interview approved')}>Approve</Button>
                              <Button size="sm" variant="danger" onClick={() => setRejectModal({ open: true, interviewId: i.InterviewID })}>Reject</Button>
                            </>
                          ) : null}
                          {i.Status === 'Draft' && isFieldOfficer && i.UserID !== user?.userId ? (
                            <Badge tone="neutral">Not yours</Badge>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty icon="comments" message="No interviews yet"
              action={<Button onClick={() => setModal({ open: true })}><Icon name="plus" /> New interview</Button>} />
          )}
        </Card>
      )}

      {tab === 'list' && <Pagination page={page} total={data?.total ?? 0} pageSize={PAGE_SIZE} onPageChange={setPage} />}

      {tab === 'detail' && (
        <Card title="Interview detail" actions={<Button variant="ghost" size="sm" onClick={() => setTab('list')}>Back</Button>}>
          {detailRow.loading ? <Loading /> : detailRow.error ? <div className="alert alert-error">{detailRow.error}</div> : detailRow.data ? (
            <div>
              <div className="grid-2">
                <div>
                  <h3 style={{ marginTop: 0 }}>{detailRow.data.RespondentName}</h3>
                  <p style={{ margin: 0 }}><Badge tone="info">{detailRow.data.RespondentType}</Badge> · {fmtDate(detailRow.data.InterviewDate)}</p>
                  <p style={{ marginTop: 10 }}><b>Business group:</b> {detailRow.data.BusinessGroupName}</p>
                  <p style={{ margin: 0 }}><b>Region:</b> {detailRow.data.RegionName}{detailRow.data.OutletName ? ` · ${detailRow.data.OutletName}` : ''}</p>
                  {detailRow.data.CapturedLat ? <p style={{ margin: 0 }}><b>Location:</b> {detailRow.data.CapturedLat}, {detailRow.data.CapturedLng}</p> : null}
                  <p style={{ margin: 0 }}><b>Interviewer:</b> {detailRow.data.InterviewerName}</p>
                </div>
                <div>
                  <div className="stat-grid" style={{ marginTop: 0 }}>
                    <div className="card"><div className="stat-card"><div className="label">Satisfaction</div><div className="value">{detailRow.data.SatisfactionScore ?? '—'}<span style={{ fontSize: 14 }}>/5</span></div></div></div>
                    <div className="card"><div className="stat-card"><div className="label">Sentiment</div>{detailRow.data.Sentiment ? <div className="value" style={{ fontSize: 18 }}><Badge tone={SENTIMENT_TONE[detailRow.data.Sentiment] ?? 'neutral'}>{detailRow.data.Sentiment}</Badge></div> : <div className="value">—</div>}</div></div>
                  </div>
                  <p><b>Status:</b> <StatusBadge status={detailRow.data.Status} /></p>
                </div>
              </div>
              <h3 style={{ marginTop: 18 }}>Key feedback / themes</h3>
              <p style={{ margin: 0, lineHeight: 1.7 }}>{detailRow.data.KeyFeedback || 'No feedback recorded.'}</p>
              {detailRow.data.QAs && detailRow.data.QAs.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <h3 style={{ marginTop: 0 }}>Questions & Answers</h3>
                  <div className="qa-list">
                    {detailRow.data.QAs.map((qa) => (
                      <div key={qa.QuestionID} className="qa-item" style={{ marginBottom: 12, padding: 12, background: 'var(--bg-secondary, #f9fafb)', borderRadius: 8, borderLeft: '3px solid var(--color-primary, #0047ab)' }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary, #111827)', marginBottom: 4 }}>
                          Q: {qa.Question}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary, #6b7280)', lineHeight: 1.5 }}>
                          {qa.Answer || <em style={{ color: 'var(--text-muted, #9ca3af)' }}>No answer provided</em>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {detailRow.data.Address ? <p style={{ marginTop: 12 }}><b>Address:</b> {detailRow.data.Address}</p> : null}
              {detailRow.data.PhotoVideoRef ? (
                <div style={{ marginTop: 12 }}>
                  <b>Photo/Video:</b>
                  {/\.(jpg|jpeg|png|gif|webp)$/i.test(detailRow.data.PhotoVideoRef) ? (
                    <div style={{ marginTop: 4 }}>
                      <img src={`${process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ?? 'http://localhost:4000'}${detailRow.data.PhotoVideoRef}`} alt="Interview media" style={{ maxWidth: 320, maxHeight: 240, borderRadius: 8, border: '1px solid var(--border)' }} />
                    </div>
                  ) : /\.(mp4|webm|mov)$/i.test(detailRow.data.PhotoVideoRef) ? (
                    <div style={{ marginTop: 4 }}>
                      <video src={`${process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ?? 'http://localhost:4000'}${detailRow.data.PhotoVideoRef}`} controls style={{ maxWidth: 320, maxHeight: 240, borderRadius: 8 }} />
                    </div>
                  ) : (
                    <span> {detailRow.data.PhotoVideoRef}</span>
                  )}
                </div>
              ) : null}
              {detailRow.data.Status === 'Rejected' && detailRow.data.RejectionReason ? (
                <div style={{ marginTop: 16, padding: 12, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8 }}>
                  <p style={{ margin: 0, fontWeight: 600, color: '#991b1b' }}>Rejection reason</p>
                  <p style={{ margin: '4px 0 0', color: '#991b1b' }}>{detailRow.data.RejectionReason}</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </Card>
      )}

      <Modal open={modal.open} onClose={() => setModal({ open: false })} title={modal.initial ? 'Edit interview' : 'New interview'}
        footer={<Button variant="ghost" onClick={() => setModal({ open: false })}>Close</Button>} wide>
        {groups.loading || regions.loading ? <Loading /> : (
          <InterviewForm
            groups={groups.data?.items ?? []}
            regions={regions.data?.items ?? []}
            outlets={outlets.data?.items ?? []}
            respondentTypes={respondentTypes.data?.items ?? []}
            sentiments={sentiments.data?.items ?? []}
            initial={modal.initial}
            onDone={(m) => { setModal({ open: false }); toast.success(m); void reload(); }}
          />
        )}
      </Modal>

      {rejectModal.open && rejectModal.interviewId ? (
        <RejectModal
          interviewId={rejectModal.interviewId}
          interviews={data?.items ?? []}
          onReject={(reason) => void reject(rejectModal.interviewId!, reason)}
          onClose={() => setRejectModal({ open: false, interviewId: null })}
        />
      ) : null}
    </>
  );
}

function RejectModal({ interviewId, interviews, onReject, onClose }: {
  interviewId: number;
  interviews: Interview[];
  onReject: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const interview = interviews.find((i) => i.InterviewID === interviewId);

  async function submit() {
    if (!reason.trim()) { toast.error('Rejection reason is required'); return; }
    setBusy(true);
    onReject(reason.trim());
    setBusy(false);
  }

  return (
    <Modal open onClose={onClose} title={`Reject interview — ${interview?.RespondentName ?? ''}`} wide
      footer={<Button variant="ghost" onClick={onClose}>Cancel</Button>}>
      <Field label="Rejection reason" required>
        <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this interview being rejected?" rows={4} />
      </Field>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="danger" onClick={() => void submit()} busy={busy}>{busy ? 'Rejecting...' : 'Reject interview'}</Button>
      </div>
    </Modal>
  );
}

export default function InterviewsPage() {
  return (
    <Guard>
      <InterviewsInner />
    </Guard>
  );
}