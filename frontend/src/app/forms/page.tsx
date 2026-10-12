'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Guard } from '@/components/Guard';
import { Button, Card, Loading, Empty, StatusBadge, Badge, Modal, Field, Icon } from '@/components/ui';
import { TourTrigger } from '@/components/tour/TourTrigger';
import { api, ApiError } from '@/lib/api';
import { useFetch } from '@/lib/use-api';
import { useAuth } from '@/lib/auth-context';
import { toast } from '@/components/Toast';
import { fmtDate } from '@/lib/format';
import type { FormTemplate } from '@/lib/types';

const CAN_CREATE = ['Administrator', 'Marketing Manager', 'Marketing Analyst'];
const CAN_RESPOND = ['Field Officer'];

function CreateFormModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!title.trim()) { toast.error('Title is required'); return; }
    setBusy(true);
    try {
      const res = await api<{ templateId: number }>('/forms', { method: 'POST', body: { title: title.trim(), description: description.trim() || undefined } });
      onCreated(res.templateId);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Create failed');
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Create a new form"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={() => void create()} busy={busy}>Create</Button>
      </>}>
      <Field label="Title" required>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Outlet Stock Check" autoFocus />
      </Field>
      <Field label="Description">
        <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional context for respondents" />
      </Field>
    </Modal>
  );
}

function FormsInner() {
  const { user } = useAuth();
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [status, setStatus] = useState('');
  const canCreate = user ? CAN_CREATE.includes(user.role) : false;
  const canRespond = user ? CAN_RESPOND.includes(user.role) : false;

  const { data, loading, error, reload } = useFetch<{ items: FormTemplate[] }>(
    `/forms${status ? `?status=${status}` : ''}`,
    [status]
  );
  const accessible = useFetch<{ items: FormTemplate[] }>(canRespond ? '/forms/accessible' : null, [canRespond]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Forms &amp; Surveys</h1>
          <div className="sub">Build dynamic forms (NexForm), configure access, and monitor responses in real time.</div>
        </div>
        <div className="actions">
          <TourTrigger tourId="forms" />
          {canCreate ? <Button onClick={() => setShowCreate(true)}><Icon name="plus" /> New form</Button> : null}
        </div>
      </div>

      <div className="filters">
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="Draft">Draft</option>
          <option value="Published">Published</option>
          <option value="Archived">Archived</option>
        </select>
      </div>

      {canRespond ? (
        <Card title="Open forms — submit a response" flush style={{ marginBottom: 20 }}>
          {accessible.loading ? <Loading /> : accessible.data?.items.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Form</th><th>Access</th><th>Responses</th><th>Closes</th><th></th></tr></thead>
                <tbody>
                  {accessible.data.items.map((f) => (
                    <tr key={f.TemplateID}>
                      <td>
                        <Link href={`/forms/${f.TemplateID}/respond`}><b>{f.Title}</b></Link>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{f.Description}</div>
                      </td>
                      <td><Badge tone="info">{f.AccessMode}</Badge></td>
                      <td>{f.ResponseCount}{f.MaxResponses ? ` / ${f.MaxResponses}` : ''}</td>
                      <td>{f.ExpireAt ? fmtDate(f.ExpireAt) : '—'}</td>
                      <td><Button size="sm" onClick={() => router.push(`/forms/${f.TemplateID}/respond`)}>Fill in <Icon name="arrow-right" /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty icon="clipboard-list" message="No open forms right now" />
          )}
        </Card>
      ) : null}

      <Card title="All forms" flush>
        {loading ? <Loading /> : error ? <div className="alert alert-error">{error}</div> : data?.items.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Form</th>
                  <th>Status</th>
                  <th>Access</th>
                  <th>Responses</th>
                  <th>Owner</th>
                  <th>Updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((f) => (
                  <tr key={f.TemplateID}>
                    <td>
                      <Link href={`/forms/${f.TemplateID}`}><b>{f.Title}</b></Link>
                      {f.LinkedFormTemplateID ? <Badge tone="accent" >linked</Badge> : null}
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>v{f.CurrentVersion ?? 0}</div>
                    </td>
                    <td><StatusBadge status={f.Status} /></td>
                    <td><Badge tone="info">{f.AccessMode}</Badge></td>
                    <td>{f.ResponseCount}</td>
                    <td>{f.OwnerName}</td>
                    <td>{fmtDate(f.UpdatedAt ?? f.CreatedAt)}</td>
                    <td><Button variant="ghost" size="sm" onClick={() => router.push(`/forms/${f.TemplateID}`)}>Open <Icon name="arrow-right" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="clipboard-list" message="No forms yet. Create your first dynamic form to get started."
            action={canCreate ? <Button onClick={() => setShowCreate(true)}><Icon name="plus" /> New form</Button> : undefined} />
        )}
      </Card>

      {showCreate ? (
        <CreateFormModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => { setShowCreate(false); toast.success('Form created'); void reload(); router.push(`/forms/${id}`); }}
        />
      ) : null}
    </>
  );
}

export default function FormsPage() {
  return (
    <Guard>
      <FormsInner />
    </Guard>
  );
}
