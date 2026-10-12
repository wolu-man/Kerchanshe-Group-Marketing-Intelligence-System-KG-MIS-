'use client';

import { useState, useRef, useEffect } from 'react';
import { Guard } from '@/components/Guard';
import { Button, Card, Loading, Empty, StatusBadge, Modal, Field, Badge, Icon, Pagination } from '@/components/ui';
import { TourTrigger } from '@/components/tour/TourTrigger';
import { api, ApiError } from '@/lib/api';
import { useFetch } from '@/lib/use-api';
import { toast } from '@/components/Toast';
import { useAuth } from '@/lib/auth-context';
import { fmtDate } from '@/lib/format';
import type { MarketVisit, Outlet, Region, BusinessGroup, LookupOption } from '@/lib/types';

const REVIEW_ROLES = ['Administrator', 'Marketing Manager'];

function emptyForm() {
  return {
    outletId: 0,
    visitDate: new Date().toISOString().slice(0, 10),
    businessGroupId: 0,
    visitType: 'Routine',
    stockLevelObserved: '',
    competitorPresenceNoted: '',
    keyFindings: '',
    photoVideoRef: '',
    followUpRequired: false,
    notes: '',
    shopsVisited: '',
  };
}

function mediaUrl(path: string | null): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ?? 'http://localhost:4000'}${path}`;
}

function VisitForm({ outlets, groups, visitTypes, stockLevels, initial, onDone }: {
  outlets: Outlet[];
  groups: BusinessGroup[];
  visitTypes: LookupOption[];
  stockLevels: LookupOption[];
  initial?: MarketVisit;
  onDone: (msg: string) => void;
}) {
  const [form, setForm] = useState(() => ({
    outletId: initial?.OutletID ?? 0,
    visitDate: initial?.VisitDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    businessGroupId: initial?.BusinessGroupID ?? 0,
    visitType: initial?.VisitType ?? 'Routine',
    stockLevelObserved: initial?.StockLevelObserved ?? '',
    competitorPresenceNoted: initial?.CompetitorPresenceNoted ?? '',
    keyFindings: initial?.KeyFindings ?? '',
    photoVideoRef: initial?.PhotoVideoRef ?? '',
    followUpRequired: initial?.FollowUpRequired ?? false,
    notes: initial?.Notes ?? '',
    shopsVisited: initial?.ShopsVisited != null ? String(initial.ShopsVisited) : '',
  }));
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

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

  async function submit() {
    if (!form.outletId) { toast.error('Select an outlet'); return; }
    if (!form.visitDate) { toast.error('Select a visit date'); return; }
    setBusy(true);
    try {
      const body = {
        outletId: Number(form.outletId),
        visitDate: form.visitDate,
        businessGroupId: form.businessGroupId ? Number(form.businessGroupId) : null,
        visitType: form.visitType,
        stockLevelObserved: form.stockLevelObserved || null,
        competitorPresenceNoted: form.competitorPresenceNoted || null,
        keyFindings: form.keyFindings || null,
        photoVideoRef: null,
        followUpRequired: form.followUpRequired,
        notes: form.notes || null,
        shopsVisited: form.shopsVisited === '' ? null : Math.max(0, Number(form.shopsVisited)),
      };
      let reportId: number;
      if (initial) {
        await api(`/market-visits/${initial.ReportID}`, { method: 'PUT', body });
        reportId = initial.ReportID;
      } else {
        const res = await api<{ reportId: number }>('/market-visits', { method: 'POST', body });
        reportId = res.reportId;
      }
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        await api(`/market-visits/${reportId}/photo`, { method: 'POST', body: fd, json: false });
      }
      onDone(initial ? 'Report updated' : 'Draft report created');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Field label="Outlet" required>
        <select className="select" value={form.outletId} onChange={set('outletId')}>
          <option value={0}>— select —</option>
          {outlets.map((o) => <option key={o.OutletID} value={o.OutletID}>{o.OutletName} ({o.City})</option>)}
        </select>
      </Field>
      <div className="form-row">
        <Field label="Visit date" required>
          <input className="input" type="date" value={form.visitDate} onChange={set('visitDate')} />
        </Field>
        <Field label="Visit type" required>
          <select className="select" value={form.visitType} onChange={set('visitType')}>
            {visitTypes.map((t) => <option key={t.LookupID} value={t.Value}>{t.Value}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Business group">
        <select className="select" value={form.businessGroupId} onChange={set('businessGroupId')}>
          <option value={0}>— select —</option>
          {groups.map((g) => <option key={g.BusinessGroupID} value={g.BusinessGroupID}>{g.Name}</option>)}
        </select>
      </Field>
      <div className="form-row">
        <Field label="Number of shops visited">
          <input className="input" type="number" min={0} step={1} value={form.shopsVisited} onChange={set('shopsVisited')} placeholder="e.g. 5" />
        </Field>
        <Field label="Stock level observed">
          <select className="select" value={form.stockLevelObserved} onChange={set('stockLevelObserved')}>
            <option value="">— select —</option>
            {stockLevels.map((s) => <option key={s.LookupID} value={s.Value}>{s.Value}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Competitor presence noted">
        <input className="input" value={form.competitorPresenceNoted} onChange={set('competitorPresenceNoted')} placeholder="Which competitor brands/products were present?" />
      </Field>
      <Field label="Key findings">
        <textarea className="textarea" value={form.keyFindings} onChange={set('keyFindings')} placeholder="Shelf visibility, pricing, promotion, stock issues…" rows={3} />
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
        <Field label="Follow-up">
          <label className="checkbox-check" style={{ marginTop: 28 }}>
            <input type="checkbox" checked={form.followUpRequired} onChange={(e) => setForm((f) => ({ ...f, followUpRequired: e.target.checked }))} />
            <span>Follow-up required</span>
          </label>
        </Field>
      </div>
      <Field label="Notes">
        <textarea className="textarea" value={form.notes} onChange={set('notes')} />
      </Field>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button onClick={() => void submit()} busy={busy}>{initial ? 'Save changes' : 'Create draft'}</Button>
      </div>
    </div>
  );
}

function VisitsInner() {
  const { user } = useAuth();
  const [status, setStatus] = useState('');
  const [regionId, setRegionId] = useState('');
  const [businessGroupId, setBusinessGroupId] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<{ open: boolean; initial?: MarketVisit }>({ open: false });
  const [detail, setDetail] = useState<number | null>(null);
  const [rejectModal, setRejectModal] = useState<{ open: boolean; visitId: number | null }>({ open: false, visitId: null });

  const PAGE_SIZE = 20;

  useEffect(() => { setPage(1); }, [status, regionId, businessGroupId]);

  const filters = [
    status ? `status=${encodeURIComponent(status)}` : '',
    regionId ? `regionId=${encodeURIComponent(regionId)}` : '',
    businessGroupId ? `businessGroupId=${encodeURIComponent(businessGroupId)}` : '',
    `page=${page}`,
    `pageSize=${PAGE_SIZE}`,
  ].filter(Boolean).join('&');

  const { data, loading, error, reload } = useFetch<{ items: MarketVisit[]; total: number }>(`/market-visits?${filters}`, [status, regionId, businessGroupId, page]);
  const outlets = useFetch<{ items: Outlet[] }>('/market-visits/meta/outlets');
  const regions = useFetch<{ items: Region[] }>('/reference/regions');
  const groups = useFetch<{ items: BusinessGroup[] }>('/reference/business-groups');
  const visitTypes = useFetch<{ items: LookupOption[] }>('/reference/lookups?category=VisitType');
  const stockLevels = useFetch<{ items: LookupOption[] }>('/reference/lookups?category=StockLevel');
  const detailRow = useFetch<MarketVisit>(detail ? `/market-visits/${detail}` : null, [detail]);

  const canReview = user ? REVIEW_ROLES.includes(user.role) : false;
  const isFieldOfficer = user?.role === 'Field Officer';

  async function submitVisit(v: MarketVisit) {
    try {
      await api(`/market-visits/${v.ReportID}/submit`, { method: 'POST' });
      toast.success('Report submitted for review');
      void reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Submit failed');
    }
  }

  async function review(v: MarketVisit) {
    try {
      await api(`/market-visits/${v.ReportID}/review`, { method: 'POST' });
      toast.success('Report reviewed');
      void reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Review failed');
    }
  }

  async function approve(v: MarketVisit) {
    try {
      await api(`/market-visits/${v.ReportID}/approve`, { method: 'POST' });
      toast.success('Report approved');
      void reload();
      if (detail) setDetail(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Approve failed');
    }
  }

  async function reject(v: MarketVisit, reason: string) {
    try {
      await api(`/market-visits/${v.ReportID}/reject`, { method: 'POST', body: { reason } });
      toast.success('Report rejected');
      setRejectModal({ open: false, visitId: null });
      void reload();
      if (detail) setDetail(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Reject failed');
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Market Visits</h1>
          <div className="sub">Field visit reports — capture, submit, review and approve.</div>
        </div>
        <div className="actions">
          <TourTrigger tourId="visits" />
          <Button onClick={() => setModal({ open: true })}><Icon name="plus" /> New visit report</Button>
        </div>
      </div>

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

      <Card title={`Reports (${data?.total ?? 0})`} flush>
        {loading ? <Loading /> : error ? <div className="alert alert-error">{error}</div> : data?.items.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Outlet</th><th>Region</th><th>Visit date</th><th>Type</th><th>Reported by</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((v) => (
                  <tr key={v.ReportID}>
                    <td><b>{v.OutletName}</b><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{v.City}{v.BusinessGroupName ? ` · ${v.BusinessGroupName}` : ''}</div></td>
                    <td>{v.RegionName}</td>
                    <td>{fmtDate(v.VisitDate)}</td>
                    <td><Badge tone="info">{v.VisitType ?? 'Routine'}</Badge></td>
                    <td>{v.SubmittedByName}</td>
                    <td><StatusBadge status={v.Status} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <Button size="sm" variant="ghost" onClick={() => setDetail(v.ReportID)}>View</Button>
                        {v.Status === 'Draft' && v.UserID === user?.userId ? (
                          <>
                            <Button size="sm" onClick={() => setModal({ open: true, initial: v })}>Edit</Button>
                            <Button size="sm" variant="success" onClick={() => void submitVisit(v)}>Submit</Button>
                          </>
                        ) : null}
                        {v.Status === 'Submitted' && canReview ? (
                          <Button size="sm" onClick={() => void review(v)}>Review</Button>
                        ) : null}
                        {v.Status === 'Reviewed' && canReview ? (
                          <>
                            <Button size="sm" variant="success" onClick={() => void approve(v)}>Approve</Button>
                            <Button size="sm" variant="danger" onClick={() => setRejectModal({ open: true, visitId: v.ReportID })}>Reject</Button>
                          </>
                        ) : null}
                        {v.Status === 'Draft' && isFieldOfficer && v.UserID !== user?.userId ? (
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
          <Empty icon="location-dot" message="No visit reports yet"
            action={<Button onClick={() => setModal({ open: true })}><Icon name="plus" /> New visit report</Button>} />
        )}
      </Card>

      <Pagination page={page} total={data?.total ?? 0} pageSize={PAGE_SIZE} onPageChange={setPage} />

      {detail ? (
        <Modal open onClose={() => setDetail(null)} title={`Visit report #${detail}`} wide
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <Badge tone="neutral">Status: <StatusBadge status={detailRow.data?.Status ?? ''} /></Badge>
              <Button variant="ghost" onClick={() => setDetail(null)}>Close</Button>
            </div>
          }>
          {detailRow.loading ? <Loading /> : detailRow.error ? <div className="alert alert-error">{detailRow.error}</div> : detailRow.data ? (
            <div>
              <div className="grid-2">
                <div>
                  <p style={{ marginTop: 0 }}><b>Outlet:</b> {detailRow.data.OutletName} ({detailRow.data.City})</p>
                  <p style={{ margin: 0 }}><b>Region:</b> {detailRow.data.RegionName}</p>
                  <p style={{ margin: 0 }}><b>Visit date:</b> {fmtDate(detailRow.data.VisitDate)}</p>
                  <p style={{ margin: 0 }}><b>Type:</b> <Badge tone="info">{detailRow.data.VisitType ?? 'Routine'}</Badge></p>
                  <p style={{ margin: 0 }}><b>Business group:</b> {detailRow.data.BusinessGroupName ?? '—'}</p>
                  <p style={{ margin: 0 }}><b>Reported by:</b> {detailRow.data.SubmittedByName}</p>
                  {detailRow.data.FollowUpRequired ? <p style={{ margin: 0 }}><Badge tone="warning">Follow-up required</Badge></p> : null}
                </div>
                <div>
                  <p style={{ marginTop: 0 }}><b>Stock level:</b> {detailRow.data.StockLevelObserved ?? '—'}</p>
                  <p style={{ margin: 0 }}><b>Shops visited:</b> {detailRow.data.ShopsVisited ?? '—'}</p>
                  <p style={{ margin: 0 }}><b>Competitor presence:</b> {detailRow.data.CompetitorPresenceNoted ?? '—'}</p>
                </div>
              </div>
              <h3 style={{ marginTop: 18 }}>Key findings</h3>
              <p style={{ margin: 0, lineHeight: 1.7 }}>{detailRow.data.KeyFindings || detailRow.data.Notes || 'No findings recorded.'}</p>
              {detailRow.data.PhotoVideoRef ? (
                <div style={{ marginTop: 12 }}>
                  <b>Photo/video:</b>
                  {/\.(jpg|jpeg|png|gif|webp)$/i.test(detailRow.data.PhotoVideoRef) ? (
                    <div style={{ marginTop: 4 }}>
                      <img src={mediaUrl(detailRow.data.PhotoVideoRef)} alt="Visit media" style={{ maxWidth: 320, maxHeight: 240, borderRadius: 8, border: '1px solid var(--border)' }} />
                    </div>
                  ) : /\.(mp4|webm|mov)$/i.test(detailRow.data.PhotoVideoRef) ? (
                    <div style={{ marginTop: 4 }}>
                      <video src={mediaUrl(detailRow.data.PhotoVideoRef)} controls style={{ maxWidth: 320, maxHeight: 240, borderRadius: 8 }} />
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
        </Modal>
      ) : null}

      <Modal open={modal.open} onClose={() => setModal({ open: false })} title={modal.initial ? 'Edit visit report' : 'New visit report'} wide
        footer={<Button variant="ghost" onClick={() => setModal({ open: false })}>Close</Button>}>
        {outlets.loading ? <Loading /> : outlets.data ? (
          <VisitForm
            outlets={outlets.data.items}
            groups={groups.data?.items ?? []}
            visitTypes={visitTypes.data?.items ?? []}
            stockLevels={stockLevels.data?.items ?? []}
            initial={modal.initial}
            onDone={(m) => { setModal({ open: false }); toast.success(m); void reload(); }}
          />
        ) : null}
      </Modal>

      {rejectModal.open && rejectModal.visitId ? (
        <RejectModal
          visitId={rejectModal.visitId}
          visits={data?.items ?? []}
          onReject={(reason) => {
            const v = data?.items.find((x) => x.ReportID === rejectModal.visitId);
            if (v) void reject(v, reason);
          }}
          onClose={() => setRejectModal({ open: false, visitId: null })}
        />
      ) : null}
    </>
  );
}

function RejectModal({ visitId, visits, onReject, onClose }: {
  visitId: number;
  visits: MarketVisit[];
  onReject: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const visit = visits.find((v) => v.ReportID === visitId);

  async function submit() {
    if (!reason.trim()) { toast.error('Rejection reason is required'); return; }
    setBusy(true);
    onReject(reason.trim());
    setBusy(false);
  }

  return (
    <Modal open onClose={onClose} title={`Reject report — ${visit?.OutletName ?? ''}`} wide
      footer={<Button variant="ghost" onClick={onClose}>Cancel</Button>}>
      <Field label="Rejection reason" required>
        <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this report being rejected?" rows={4} />
      </Field>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="danger" onClick={() => void submit()} busy={busy}>{busy ? 'Rejecting...' : 'Reject report'}</Button>
      </div>
    </Modal>
  );
}

export default function VisitsPage() {
  return (
    <Guard>
      <VisitsInner />
    </Guard>
  );
}