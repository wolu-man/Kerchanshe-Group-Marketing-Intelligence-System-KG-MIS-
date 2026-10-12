'use client';

import { useState, useRef } from 'react';
import { Guard } from '@/components/Guard';
import { Button, Card, Loading, Empty, StatusBadge, Modal, Field, Badge, Icon } from '@/components/ui';
import { TourTrigger } from '@/components/tour/TourTrigger';
import { api, ApiError } from '@/lib/api';
import { useFetch } from '@/lib/use-api';
import { toast } from '@/components/Toast';
import { useAuth } from '@/lib/auth-context';
import { fmtDate } from '@/lib/format';
import type { MultimediaAsset, BusinessGroup, Region, Outlet } from '@/lib/types';

const VALIDATE_ROLES = ['Administrator', 'Marketing Manager'];
const MEDIA_ROOT = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/api\/v1\/?$/, '');

function mediaHref(row: MultimediaAsset): string {
  const url = row.StorageURL ?? '';
  return url.startsWith('http') ? url : `${MEDIA_ROOT}${url}`;
}

function MediaThumb({ row, big = false }: { row: MultimediaAsset; big?: boolean }) {
  const href = mediaHref(row);
  const style: React.CSSProperties = big ? { width: '100%', maxHeight: 420, objectFit: 'contain', borderRadius: 8, background: '#000' } : { width: '100%', height: 180, objectFit: 'cover', borderRadius: 8 };
  if (row.MediaType === 'Photo') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={href} alt={row.OriginName ?? 'photo'} style={style} />;
  }
  if (row.MediaType === 'Video') {
    return big
      ? <video src={href} controls style={style} />
      : (
        <div style={{ position: 'relative' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={href} alt={row.OriginName ?? 'video'} style={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 8, opacity: 0.6 }} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="circle-play" type="regular" />
          </div>
        </div>
      );
  }
  return (
    <div style={{ width: '100%', height: big ? 320 : 180, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-3)', borderRadius: 8 }}>
      <Icon name="file-audio" type="regular" className="big-icon" />
    </div>
  );
}

function UploadForm({ groups, regions, outlets, onDone }: {
  groups: BusinessGroup[];
  regions: Region[];
  outlets: Outlet[];
  onDone: (msg: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [mediaType, setMediaType] = useState<'Photo' | 'Video' | 'Audio'>('Photo');
  const [captureDate, setCaptureDate] = useState(new Date().toISOString().slice(0, 10));
  const [businessGroupId, setBusinessGroupId] = useState(0);
  const [regionId, setRegionId] = useState(0);
  const [outletId, setOutletId] = useState(0);
  const [relatedModule, setRelatedModule] = useState('');
  const [relatedRecordId, setRelatedRecordId] = useState('');
  const [tag, setTag] = useState('');
  const [transcribe, setTranscribe] = useState(false);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit() {
    if (!file) { toast.error('Choose a file to upload'); return; }
    if (!captureDate) { toast.error('Select capture date'); return; }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('mediaType', mediaType);
    fd.append('captureDate', captureDate);
    if (businessGroupId) fd.append('businessGroupId', String(businessGroupId));
    if (regionId) fd.append('regionId', String(regionId));
    if (outletId) fd.append('outletId', String(outletId));
    if (relatedModule) fd.append('relatedModule', relatedModule);
    if (relatedRecordId && relatedRecordId !== '') fd.append('relatedRecordId', relatedRecordId);
    if (tag) fd.append('tag', tag);
    fd.append('transcriptionRequired', String(transcribe));
    if (notes) fd.append('notes', notes);

    setBusy(true);
    try {
      const token = localStorage.getItem('kgmis_token');
      const res = await fetch(`${(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '')}/multimedia`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(res.status, json.error ?? 'ERROR', json.message ?? 'Upload failed');
      toast.success('Media uploaded and registered');
      onDone('Media uploaded');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (f.type.startsWith('video/')) setMediaType('Video');
    else if (f.type.startsWith('audio/')) setMediaType('Audio');
    else if (f.type.startsWith('image/')) setMediaType('Photo');
  }

  return (
    <div>
      <div className="drop-zone" onClick={() => inputRef.current?.click()}>
        <input ref={inputRef} type="file" style={{ display: 'none' }} onChange={onPick} />
        {file ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <Icon name="file-circle-check" /> <b>{file.name}</b> <span style={{ color: 'var(--text-muted)' }}>({(file.size / 1024).toFixed(0)} KB)</span>
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)' }}><Icon name="cloud-arrow-up" /> Click to choose a photo, video or audio file</div>
        )}
      </div>
      <div className="form-row">
        <Field label="Media type" required>
          <select className="select" value={mediaType} onChange={(e) => setMediaType(e.target.value as 'Photo' | 'Video' | 'Audio')}>
            <option value="Photo">Photo</option>
            <option value="Video">Video</option>
            <option value="Audio">Audio</option>
          </select>
        </Field>
        <Field label="Capture date" required>
          <input className="input" type="date" value={captureDate} onChange={(e) => setCaptureDate(e.target.value)} />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Business group">
          <select className="select" value={businessGroupId} onChange={(e) => setBusinessGroupId(Number(e.target.value))}>
            <option value={0}>— select —</option>
            {groups.map((g) => <option key={g.BusinessGroupID} value={g.BusinessGroupID}>{g.Name}</option>)}
          </select>
        </Field>
        <Field label="Region">
          <select className="select" value={regionId} onChange={(e) => setRegionId(Number(e.target.value))}>
            <option value={0}>— select —</option>
            {regions.map((r) => <option key={r.RegionID} value={r.RegionID}>{r.RegionName}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Outlet">
        <select className="select" value={outletId} onChange={(e) => setOutletId(Number(e.target.value))}>
          <option value={0}>— none —</option>
          {outlets.map((o) => <option key={o.OutletID} value={o.OutletID}>{o.OutletName} ({o.City})</option>)}
        </select>
      </Field>
      <div className="form-row">
        <Field label="Linked record module">
          <select className="select" value={relatedModule} onChange={(e) => setRelatedModule(e.target.value)}>
            <option value="">— none —</option>
            <option value="MarketVisit">Market Visit</option>
            <option value="Interview">Interview</option>
            <option value="CompetitorPrice">Competitor Observation</option>
            <option value="Outlet">Outlet</option>
          </select>
        </Field>
        <Field label="Record ID">
          <input className="input" value={relatedRecordId} onChange={(e) => setRelatedRecordId(e.target.value)} placeholder="e.g. 12" />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Tag">
          <input className="input" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="e.g. shelf branding" />
        </Field>
        <Field label="Transcription">
          <label className="checkbox-check" style={{ marginTop: 28 }}>
            <input type="checkbox" checked={transcribe} onChange={(e) => setTranscribe(e.target.checked)} />
            <span>Require transcription</span>
          </label>
        </Field>
      </div>
      <Field label="Notes">
        <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button onClick={() => void submit()} busy={busy}><Icon name="cloud-arrow-up" /> Upload</Button>
      </div>
    </div>
  );
}

function MultimediaInner() {
  const { user } = useAuth();
  const [mediaType, setMediaType] = useState('');
  const [validationStatus, setValidationStatus] = useState('');
  const [modal, setModal] = useState(false);
  const [detail, setDetail] = useState<MultimediaAsset | null>(null);
  const [transcribeOpen, setTranscribeOpen] = useState(false);
  const [transcription, setTranscription] = useState('');

  const { data, loading, error, reload } = useFetch<{ items: MultimediaAsset[]; total: number }>(
    `/multimedia${mediaType ? `?mediaType=${mediaType}` : ''}${validationStatus ? `${mediaType ? '&' : '?'}validationStatus=${validationStatus}` : ''}`,
    [mediaType, validationStatus]
  );
  const groups = useFetch<{ items: BusinessGroup[] }>('/reference/business-groups');
  const regions = useFetch<{ items: Region[] }>('/reference/regions');
  const outlets = useFetch<{ items: Outlet[] }>('/reference/outlets');

  const canValidate = user ? VALIDATE_ROLES.includes(user.role) : false;

  async function validate(id: number, status: 'Validated' | 'Rejected') {
    try {
      await api(`/multimedia/${id}/validate`, { method: 'PATCH', body: { status } });
      toast.success(`Marked ${status.toLowerCase()}`);
      void reload();
      if (detail?.MediaID === id) setDetail((d) => (d ? { ...d, ValidationStatus: status } : d));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Action failed');
    }
  }

  async function saveTranscription(id: number) {
    try {
      await api(`/multimedia/${id}/transcription`, { method: 'PATCH', body: { transcription, transcriptionRequired: false } });
      toast.success('Transcription saved');
      setTranscribeOpen(false);
      void reload();
      if (detail?.MediaID === id) setDetail((d) => (d ? { ...d, Transcription: transcription } : d));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Action failed');
    }
  }

  async function remove(id: number) {
    if (!window.confirm('Delete this media asset permanently?')) return;
    try {
      await api(`/multimedia/${id}`, { method: 'DELETE' });
      toast.success('Media deleted');
      setDetail(null);
      void reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Action failed');
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Photos, Videos &amp; Audio</h1>
          <div className="sub">Multimedia evidence with GPS, timestamp and transcription metadata.</div>
        </div>
        <div className="actions">
          <TourTrigger tourId="multimedia" />
          <Button onClick={() => setModal(true)}><Icon name="cloud-arrow-up" /> Upload media</Button>
        </div>
      </div>

      <Card title={`Gallery (${data?.total ?? 0})`} flush>
        <div className="filters">
          <select className="select" value={mediaType} onChange={(e) => setMediaType(e.target.value)}>
            <option value="">All types</option>
            <option value="Photo">Photos</option>
            <option value="Video">Videos</option>
            <option value="Audio">Audio</option>
          </select>
          <select className="select" value={validationStatus} onChange={(e) => setValidationStatus(e.target.value)}>
            <option value="">All validation</option>
            <option value="Pending">Pending</option>
            <option value="Validated">Validated</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>
        {loading ? <Loading /> : error ? <div className="alert alert-error">{error}</div> : data?.items.length ? (
          <div className="media-grid">
            {data.items.map((m) => (
              <div className={`media-tile ${m.ValidationStatus === 'Rejected' ? 'is-rejected' : ''}`} key={m.MediaID} onClick={() => setDetail(m)}>
                <MediaThumb row={m} />
                <div style={{ position: 'absolute', top: 8, left: 8, right: 8, display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                  <Badge tone={m.MediaType === 'Photo' ? 'info' : m.MediaType === 'Video' ? 'accent' : 'warning'}>{m.MediaType}</Badge>
                  {m.ValidationStatus !== 'Pending' ? <StatusBadge status={m.ValidationStatus} /> : null}
                </div>
                <div className="media-meta">
                  <b>{m.OriginName ?? 'untitled'}</b>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {m.CapturedByName} · {fmtDate(m.CaptureDate)}
                    {m.TranscriptionRequired ? ' · 📝' : ''}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {m.BusinessGroupName ?? '—'} {m.RegionName ? `· ${m.RegionName}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty icon="photo-film" message="No media yet"
            action={<Button onClick={() => setModal(true)}><Icon name="cloud-arrow-up" /> Upload media</Button>} />
        )}
      </Card>

      {detail ? (
        <Modal open onClose={() => setDetail(null)}
          title={detail.OriginName ?? 'Media detail'}
          wide
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {canValidate && detail.ValidationStatus !== 'Validated' ? (
                  <Button variant="success" size="sm" onClick={() => void validate(detail.MediaID, 'Validated')}>Validate</Button>
                ) : null}
                {canValidate && detail.ValidationStatus !== 'Rejected' ? (
                  <Button variant="danger" size="sm" onClick={() => void validate(detail.MediaID, 'Rejected')}>Reject</Button>
                ) : null}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="ghost" size="sm" onClick={() => void remove(detail.MediaID)}>Delete</Button>
                {detail.MediaType !== 'Photo' && !detail.Transcription ? (
                  <Button size="sm" onClick={() => { setTranscription(detail.Transcription ?? ''); setTranscribeOpen(true); }}>Add transcription</Button>
                ) : null}
                <Button variant="ghost" size="sm" onClick={() => setDetail(null)}>Close</Button>
              </div>
            </div>
          }>
          <div className="grid-2">
            <div><MediaThumb row={detail} big /></div>
            <div>
              <p style={{ marginTop: 0 }}><StatusBadge status={detail.ValidationStatus} /> {detail.TranscriptionRequired ? <Badge tone="warning">Transcription required</Badge> : null}</p>
              <p style={{ margin: 0 }}><b>Captured by:</b> {detail.CapturedByName}</p>
              <p style={{ margin: 0 }}><b>Date:</b> {fmtDate(detail.CaptureDate)}</p>
              <p style={{ margin: 0 }}><b>Type:</b> {detail.MediaType} {detail.MimeType ? `(${detail.MimeType})` : ''}</p>
              {detail.SizeBytes ? <p style={{ margin: 0 }}><b>Size:</b> {(detail.SizeBytes / 1024).toFixed(0)} KB</p> : null}
              {detail.CaptureLat ? <p style={{ margin: 0 }}><b>GPS:</b> {detail.CaptureLat}, {detail.CaptureLng}</p> : null}
              {detail.BusinessGroupName ? <p style={{ margin: 0 }}><b>Business group:</b> {detail.BusinessGroupName}</p> : null}
              {detail.RegionName ? <p style={{ margin: 0 }}><b>Region:</b> {detail.RegionName}</p> : null}
              {detail.OutletName ? <p style={{ margin: 0 }}><b>Outlet:</b> {detail.OutletName}</p> : null}
              {detail.Tag ? <p style={{ margin: 0 }}><b>Tag:</b> <Badge tone="info">{detail.Tag}</Badge></p> : null}
              {detail.RelatedModule ? <p style={{ margin: 0 }}><b>Linked to:</b> {detail.RelatedModule} #{detail.RelatedRecordID ?? ''}</p> : null}
              {detail.Transcription ? (
                <div style={{ marginTop: 10, padding: 10, background: 'var(--surface-3)', borderRadius: 8 }}>
                  <b>Transcription</b>
                  <p style={{ margin: 6, lineHeight: 1.6 }}>{detail.Transcription}</p>
                </div>
              ) : null}
              {detail.Notes ? <p style={{ marginTop: 10 }}><b>Notes:</b> {detail.Notes}</p> : null}
            </div>
          </div>
        </Modal>
      ) : null}

      {transcribeOpen && detail ? (
        <Modal open onClose={() => setTranscribeOpen(false)} title="Transcription"
          footer={<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, width: '100%' }}>
            <Button variant="ghost" onClick={() => setTranscribeOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveTranscription(detail.MediaID)}>Save transcription</Button>
          </div>}>
          <Field label="Transcription text">
            <textarea className="textarea" rows={6} value={transcription} onChange={(e) => setTranscription(e.target.value)} placeholder="Paste or type the transcription…" />
          </Field>
          <div className="hint">Transcription is manual for now; automated speech-to-text is planned in a later phase.</div>
        </Modal>
      ) : null}

      <Modal open={modal} onClose={() => setModal(false)} title="Upload media" wide
        footer={<Button variant="ghost" onClick={() => setModal(false)}>Cancel</Button>}>
        {groups.loading ? <Loading /> : (
          <UploadForm groups={groups.data?.items ?? []} regions={regions.data?.items ?? []} outlets={outlets.data?.items ?? []}
            onDone={() => { setModal(false); void reload(); }} />
        )}
      </Modal>
    </>
  );
}

export default function MultimediaPage() {
  return (
    <Guard>
      <MultimediaInner />
    </Guard>
  );
}