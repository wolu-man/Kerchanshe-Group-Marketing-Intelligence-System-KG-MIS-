'use client';

import { useState, useEffect } from 'react';
import { Guard } from '@/components/Guard';
import { Button, Card, Loading, Empty, Modal, Field, Icon, Badge } from '@/components/ui';
import { TourTrigger } from '@/components/tour/TourTrigger';
import { api, ApiError } from '@/lib/api';
import { useFetch } from '@/lib/use-api';
import { toast } from '@/components/Toast';
import { useAuth } from '@/lib/auth-context';
import type { BusinessGroup } from '@/lib/types';

function BusinessGroupModal({ group, groups, onClose, onDone }: {
  group: BusinessGroup | null;
  groups: BusinessGroup[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [code, setCode] = useState(group?.Code ?? '');
  const [name, setName] = useState(group?.Name ?? '');
  const [description, setDescription] = useState(group?.Description ?? '');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!code.trim() || !name.trim()) { toast.error('Code and Name are required'); return; }
    setBusy(true);
    try {
      const body = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        description: description.trim() || null,
      };
      if (group) {
        await api(`/admin/business-groups/${group.BusinessGroupID}`, { method: 'PUT', body });
        toast.success('Business group updated');
      } else {
        // Check for duplicate code
        const existing = groups.find(g => g.Code === code.trim().toUpperCase());
        if (existing) { toast.error('Business group code already exists'); setBusy(false); return; }
        await api('/admin/business-groups', { method: 'POST', body });
        toast.success('Business group created');
      }
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Field label="Code (e.g. KCC)" required>
        <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="KCC" disabled={!!group} />
        {group && <span className="hint">Code cannot be changed after creation</span>}
      </Field>
      <Field label="Name" required>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Kerchanshe Coffee" />
      </Field>
      <Field label="Description">
        <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description of the business group" />
      </Field>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={() => void submit()} busy={busy}>{group ? 'Save changes' : 'Create'}</Button>
      </div>
    </div>
  );
}

function BusinessGroupsInner() {
  const { user } = useAuth();
  const [modal, setModal] = useState<{ open: boolean; group?: BusinessGroup }>({ open: false });
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const { data, loading, error, reload } = useFetch<{ items: BusinessGroup[] }>('/admin/business-groups');

  async function remove(id: number) {
    if (!window.confirm('Delete this business group? This cannot be undone.')) return;
    try {
      await api(`/admin/business-groups/${id}`, { method: 'DELETE' });
      toast.success('Business group deleted');
      void reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Delete failed');
    }
  }

  const items = data?.items ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Business Groups</h1>
          <div className="sub">Manage corporate business groups and their codes.</div>
        </div>
        <div className="actions">
          <TourTrigger tourId="admin-business-groups" />
          <Button onClick={() => setModal({ open: true })}><Icon name="plus" /> New business group</Button>
        </div>
      </div>

      <Card title={`Business Groups (${items.length})`} flush>
        {loading ? <Loading /> : error ? <div className="alert alert-error">{error}</div> : items.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Code</th><th>Name</th><th>Description</th><th></th></tr>
              </thead>
              <tbody>
                {items.map((g) => (
                  <tr key={g.BusinessGroupID}>
                    <td><Badge tone="primary">{g.Code}</Badge></td>
                    <td><b>{g.Name}</b></td>
                    <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.Description ?? '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <Button size="sm" variant="ghost" onClick={() => setModal({ open: true, group: g })}><Icon name="pen" /></Button>
                        <Button size="sm" variant="danger-ghost" onClick={() => void remove(g.BusinessGroupID)}><Icon name="trash" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="building" message="No business groups yet" action={<Button onClick={() => setModal({ open: true })}><Icon name="plus" /> New business group</Button>} />
        )}
      </Card>

      {modal.open ? (
        <Modal open onClose={() => setModal({ open: false })} title={modal.group ? `Edit: ${modal.group.Name}` : 'New business group'} footer={<Button variant="ghost" onClick={() => setModal({ open: false })}>Cancel</Button>}>
          {loading ? <Loading /> : (
            <BusinessGroupModal group={modal.group ?? null} groups={items} onClose={() => setModal({ open: false })} onDone={() => { setModal({ open: false }); void reload(); }} />
          )}
        </Modal>
      ) : null}
    </>
  );
}

export default function BusinessGroupsPage() {
  return (
    <Guard>
      <BusinessGroupsInner />
    </Guard>
  );
}