'use client';

import { useState } from 'react';
import { Guard, RequireRole } from '@/components/Guard';
import { Button, Card, Loading, Empty, Badge, Modal, Field, Tabs, Icon, Pagination } from '@/components/ui';
import { api, ApiError, getToken } from '@/lib/api';
import { useFetch } from '@/lib/use-api';
import { toast } from '@/components/Toast';
import { fmtDateTime } from '@/lib/format';
import type {
  AdminUser, RoleRow, RoleMapping, NotificationConfigResponse, UsersResponse,
  AuditRow, ReportSchedule, Region, PowerBiReport,
} from '@/lib/types';

function UsersPanel() {
  const { data, loading, error, reload } = useFetch<UsersResponse>('/admin/users');
  const regions = useFetch<{ items: Region[] }>('/reference/regions');
  const [regionUser, setRegionUser] = useState<AdminUser | null>(null);
  const [regionId, setRegionId] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [form, setForm] = useState({ cuasId: '', name: '', email: '', roleId: 0, password: '' });
  const [saving, setSaving] = useState(false);
  const [usersPage, setUsersPage] = useState(1);
  const USERS_PAGE_SIZE = 20;

  function openCreate() {
    setForm({ cuasId: '', name: '', email: '', roleId: data?.roles[0]?.RoleID ?? 4, password: '' });
    setCreateOpen(true);
  }

  function openEdit(u: AdminUser) {
    setForm({ cuasId: u.CUAS_ID, name: u.Name, email: u.Email ?? '', roleId: u.RoleID, password: '' });
    setEditUser(u);
  }

  function closeForms() {
    setCreateOpen(false);
    setEditUser(null);
    setForm({ cuasId: '', name: '', email: '', roleId: 0, password: '' });
  }

  async function handleCreate() {
    if (!form.cuasId || !form.name || !form.email || !form.password) {
      toast.error('All fields are required'); return;
    }
    if (form.password.length < 6) {
      toast.error('Password must be at least 6 characters'); return;
    }
    setSaving(true);
    try {
      await api('/admin/users', { method: 'POST', body: form });
      toast.success('User created'); closeForms(); void reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to create user');
    } finally { setSaving(false); }
  }

  async function handleUpdate() {
    if (!editUser) return;
    if (!form.name || !form.email) {
      toast.error('Name and email are required'); return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { name: form.name, email: form.email, roleId: form.roleId };
      if (form.password) body.password = form.password;
      await api(`/admin/users/${editUser.UserID}`, { method: 'PUT', body });
      toast.success('User updated'); closeForms(); void reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update user');
    } finally { setSaving(false); }
  }

  async function toggleActive(u: AdminUser) {
    const action = u.IsActive ? 'deactivate' : 'activate';
    if (!window.confirm(`${action === 'deactivate' ? 'Deactivate' : 'Activate'} user "${u.Name}"?`)) return;
    try {
      const res = await api<{ ok: boolean; isActive: boolean }>(`/admin/users/${u.UserID}/active`, { method: 'PUT' });
      toast.success(`User ${res.isActive ? 'activated' : 'deactivated'}`); void reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update user');
    }
  }

  async function setRole(u: AdminUser, roleId: number) {
    try {
      await api(`/admin/users/${u.UserID}/role`, { method: 'PUT', body: { roleId } });
      toast.success(`Role updated for ${u.Name}`);
      void reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Role update failed');
    }
  }

  async function assignRegion() {
    if (!regionUser || !regionId) return;
    try {
      await api(`/admin/users/${regionUser.UserID}/regions`, { method: 'POST', body: { regionId } });
      toast.success('Region assigned');
      setRegionUser(null); setRegionId(0); void reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Region assignment failed');
    }
  }

  async function removeRegion(u: AdminUser, rid: number) {
    try {
      await api(`/admin/users/${u.UserID}/regions/${rid}`, { method: 'DELETE' });
      toast.success('Region removed'); void reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not remove region');
    }
  }

  const userFormModal = (
    <Modal
      open={createOpen || editUser !== null}
      onClose={closeForms}
      title={editUser ? `Edit user — ${editUser.Name}` : 'Create user'}
      footer={
        <>
          <Button variant="ghost" onClick={closeForms} disabled={saving}>Cancel</Button>
          <Button onClick={editUser ? handleUpdate : handleCreate} busy={saving}>
            {editUser ? 'Save changes' : 'Create user'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <Field label="CUAS ID" required>
          <input className="input" value={form.cuasId} disabled={!!editUser}
            onChange={(e) => setForm({ ...form, cuasId: e.target.value })} placeholder="e.g. john.doe@kerchanshe.com" />
        </Field>
        <Field label="Full name" required>
          <input className="input" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. John Doe" />
        </Field>
        <Field label="Email" required>
          <input className="input" type="email" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="e.g. john.doe@kerchanshe.com" />
        </Field>
        <Field label="Role" required>
          <select className="select" value={form.roleId}
            onChange={(e) => setForm({ ...form, roleId: Number(e.target.value) })}>
            {data?.roles.map((r) => <option key={r.RoleID} value={r.RoleID}>{r.RoleName}</option>)}
          </select>
        </Field>
        <Field label={editUser ? 'New password (leave blank to keep current)' : 'Password'} required={!editUser}>
          <input className="input" type="password" value={form.password} minLength={6}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder={editUser ? '••••••••' : 'Min. 6 characters'} />
        </Field>
      </div>
    </Modal>
  );

  return (
    <Card
      title="Users & roles"
      flush
      actions={<Button size="sm" onClick={openCreate}><Icon name="plus" /> New user</Button>}
    >
      {loading ? <Loading /> : error ? <div className="alert alert-error">{error}</div> : data?.items.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>User</th><th>CUAS ID</th><th>Role</th><th>Regions</th><th style={{ width: 120 }}></th></tr></thead>
            <tbody>
              {data.items.slice((usersPage - 1) * USERS_PAGE_SIZE, usersPage * USERS_PAGE_SIZE).map((u) => (
                <tr key={u.UserID}>
                  <td><b>{u.Name}</b><br /><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{u.Email}</span>{u.IsActive ? null : <Badge tone="danger">disabled</Badge>}</td>
                  <td><code>{u.CUAS_ID}</code></td>
                  <td>
                    <select className="select" defaultValue={u.RoleID} onChange={(e) => void setRole(u, Number(e.target.value))}>
                      {data.roles.map((r) => <option key={r.RoleID} value={r.RoleID}>{r.RoleName}</option>)}
                    </select>
                  </td>
                  <td>
                    {u.RegionIds ? (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                        {u.RegionIds.split(',').map((rid) => (
                          <Badge key={rid} tone="info">#{rid} <button className="badge-x" onClick={() => void removeRegion(u, Number(rid))} aria-label="Remove region"><Icon name="xmark" /></button></Badge>
                        ))}
                      </div>
                    ) : <span style={{ color: 'var(--text-muted)' }}>All regions</span>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Button size="sm" variant="ghost" onClick={() => setRegionUser(u)} title="Assign region"><Icon name="globe" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(u)} title="Edit user"><Icon name="pen" /></Button>
                      <Button size="sm" variant={u.IsActive ? 'danger-ghost' : 'success'} onClick={() => void toggleActive(u)} title={u.IsActive ? 'Deactivate' : 'Activate'}>
                        <Icon name={u.IsActive ? 'ban' : 'check'} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty icon="user" message="No users" />}

      <Pagination page={usersPage} total={data?.items.length ?? 0} pageSize={USERS_PAGE_SIZE} onPageChange={setUsersPage} />

      <Modal open={regionUser !== null} onClose={() => setRegionUser(null)} title={`Assign region — ${regionUser?.Name ?? ''}`}>
        <Field label="Region" required>
          <select className="select" value={regionId} onChange={(e) => setRegionId(Number(e.target.value))}>
            <option value={0}>— select —</option>
            {regions.data?.items.map((r) => <option key={r.RegionID} value={r.RegionID}>{r.RegionName}</option>)}
          </select>
        </Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button onClick={() => void assignRegion()}>Assign</Button>
        </div>
      </Modal>

      {userFormModal}
    </Card>
  );
}

function RoleMappingPanel() {
  const { data, loading, error, reload } = useFetch<{ items: RoleMapping[] }>('/admin/role-mapping');
  const roles = useFetch<{ items: RoleRow[] }>('/reference/roles');
  const [cuasClaim, setCuasClaim] = useState('');
  const [roleId, setRoleId] = useState(0);

  async function upsert() {
    if (!cuasClaim.trim() || !roleId) return;
    try {
      await api('/admin/role-mapping', { method: 'PUT', body: { cuasClaim: cuasClaim.trim(), roleId } });
      setCuasClaim(''); setRoleId(0); toast.success('Mapping saved'); void reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Save failed');
    }
  }

  return (
    <Card title="CUAS role mapping" flush>
      {loading ? <Loading /> : error ? <div className="alert alert-error">{error}</div> : data?.items.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>CUAS claim</th><th>Role</th><th></th></tr></thead>
            <tbody>
              {data.items.map((m) => (
                <tr key={m.MappingID}>
                  <td><code>{m.CUASClaim}</code></td>
                  <td>{m.RoleName}</td>
                  <td><Button size="sm" variant="danger-ghost" onClick={async () => {
                    try {
                      await api(`/admin/role-mapping/${m.MappingID}`, { method: 'DELETE' });
                      toast.success('Mapping removed'); void reload();
                    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Remove failed'); }
                  }}>Remove</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty icon="link" message="No role mappings" />}
      <div className="filters" style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12 }}>
        <input className="input" value={cuasClaim} onChange={(e) => setCuasClaim(e.target.value)} placeholder="CUAS claim e.g. department=marketing" />
        <select className="select" value={roleId} onChange={(e) => setRoleId(Number(e.target.value))}>
          <option value={0}>— role —</option>
          {roles.data?.items.map((r) => <option key={r.RoleID} value={r.RoleID}>{r.RoleName}</option>)}
        </select>
        <Button size="sm" onClick={() => void upsert()}>Save mapping</Button>
      </div>
    </Card>
  );
}

function NotificationConfigPanel() {
  const { data, loading, error, reload } = useFetch<NotificationConfigResponse>('/admin/notification-config');
  const roles = useFetch<{ items: RoleRow[] }>('/reference/roles');
  const [triggerEvent, setTriggerEvent] = useState('');
  const [channel, setChannel] = useState('');
  const [roleId, setRoleId] = useState(0);

  async function upsert() {
    if (!triggerEvent || !channel || !roleId) return;
    try {
      await api('/admin/notification-config', { method: 'PUT', body: { triggerEvent, channel, roleId, enabled: true } });
      setTriggerEvent(''); setChannel(''); setRoleId(0); toast.success('Config saved'); void reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Save failed');
    }
  }

  return (
    <Card title="Notification configuration" flush>
      {loading ? <Loading /> : error ? <div className="alert alert-error">{error}</div> : data?.items.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Event</th><th>Channel</th><th>Role</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {data.items.map((c, i) => (
                <tr key={c.ConfigID ?? i}>
                  <td><code>{c.TriggerEvent}</code></td>
                  <td><Badge tone="info">{c.Channel}</Badge></td>
                  <td>{c.RoleName}</td>
                  <td>{c.Enabled ? <Badge tone="success">Enabled</Badge> : <Badge tone="neutral">Disabled</Badge>}</td>
                  <td><Button size="sm" variant="danger-ghost" onClick={async () => {
                    try {
                      await api(`/admin/notification-config/${c.ConfigID}`, { method: 'DELETE' });
                      toast.success('Config removed'); void reload();
                    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Remove failed'); }
                  }}>Remove</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty icon="bell" message="No notification configs" />}
      <div className="filters" style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12 }}>
        <select className="select" value={triggerEvent} onChange={(e) => setTriggerEvent(e.target.value)}>
          <option value="">— event —</option>
          {data?.events.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
        </select>
        <select className="select" value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="">— channel —</option>
          {data?.channels.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
        </select>
        <select className="select" value={roleId} onChange={(e) => setRoleId(Number(e.target.value))}>
          <option value={0}>— role —</option>
          {roles.data?.items.map((r) => <option key={r.RoleID} value={r.RoleID}>{r.RoleName}</option>)}
        </select>
        <Button size="sm" onClick={() => void upsert()}>Add config</Button>
      </div>
    </Card>
  );
}

function AuditPanel() {
  const [auditUserFilter, setAuditUserFilter] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('');
  const [auditEntityFilter, setAuditEntityFilter] = useState('');
  const [auditFromDate, setAuditFromDate] = useState('');
  const [auditToDate, setAuditToDate] = useState('');
  const [auditIpFilter, setAuditIpFilter] = useState('');
  const [auditSearch, setAuditSearch] = useState('');
  const [auditPage, setAuditPage] = useState(1);
  const AUDIT_PAGE_SIZE = 20;

  const auditParams = [
    auditUserFilter ? `userId=${auditUserFilter}` : '',
    auditActionFilter ? `action=${encodeURIComponent(auditActionFilter)}` : '',
    auditEntityFilter ? `entity=${encodeURIComponent(auditEntityFilter)}` : '',
    auditFromDate ? `fromDate=${auditFromDate}` : '',
    auditToDate ? `toDate=${auditToDate}` : '',
    auditIpFilter ? `ipAddress=${encodeURIComponent(auditIpFilter)}` : '',
    auditSearch ? `search=${encodeURIComponent(auditSearch)}` : '',
  ].filter(Boolean).join('&');

  const { data, loading, error, reload } = useFetch<{ items: AuditRow[]; total: number }>(`/admin/audit?limit=${AUDIT_PAGE_SIZE}&offset=${(auditPage - 1) * AUDIT_PAGE_SIZE}${auditParams ? `&${auditParams}` : ''}`,
    [auditUserFilter, auditActionFilter, auditEntityFilter, auditFromDate, auditToDate, auditIpFilter, auditSearch, auditPage]
  );
  const users = useFetch<{ items: Array<{ UserID: number; Name: string }> }>('/admin/users');
  const items = data?.items ?? [];
  const auditTotal = data?.total ?? 0;

  async function exportAudit(format: string) {
    const BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');
    const params = auditParams ? `?${auditParams}` : '';
    const url = `${BASE}/admin/audit/export${params}${params ? '&' : '?'}format=${format}`;
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const ext = format === 'xlsx' ? 'xlsx' : format === 'csv' ? 'csv' : 'pdf';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `audit-log.${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error('Export error:', err);
    }
  }

  const hasFilters = auditUserFilter || auditActionFilter || auditEntityFilter || auditFromDate || auditToDate || auditIpFilter || auditSearch;

  return (
    <Card title="Audit log" flush>
      <div className="filters" style={{ flexWrap: 'wrap', gap: 8 }}>
        <select className="select" value={auditUserFilter} onChange={(e) => { setAuditUserFilter(e.target.value); setAuditPage(1); }} style={{ minWidth: 140 }}>
          <option value="">All users</option>
          {users.data?.items.map((u) => <option key={u.UserID} value={u.UserID}>{u.Name}</option>)}
        </select>
        <input className="input" placeholder="Action..." value={auditActionFilter} onChange={(e) => { setAuditActionFilter(e.target.value); setAuditPage(1); }} style={{ minWidth: 120 }} />
        <input className="input" placeholder="Entity..." value={auditEntityFilter} onChange={(e) => { setAuditEntityFilter(e.target.value); setAuditPage(1); }} style={{ minWidth: 120 }} />
        <input className="input" type="date" value={auditFromDate} onChange={(e) => { setAuditFromDate(e.target.value); setAuditPage(1); }} title="From date" style={{ minWidth: 140 }} />
        <input className="input" type="date" value={auditToDate} onChange={(e) => { setAuditToDate(e.target.value); setAuditPage(1); }} title="To date" style={{ minWidth: 140 }} />
        <input className="input" placeholder="IP address..." value={auditIpFilter} onChange={(e) => { setAuditIpFilter(e.target.value); setAuditPage(1); }} style={{ minWidth: 120 }} />
        <input className="input" placeholder="Search detail..." value={auditSearch} onChange={(e) => { setAuditSearch(e.target.value); setAuditPage(1); }} style={{ minWidth: 150 }} />
        {hasFilters && <Button variant="ghost" onClick={() => { setAuditUserFilter(''); setAuditActionFilter(''); setAuditEntityFilter(''); setAuditFromDate(''); setAuditToDate(''); setAuditIpFilter(''); setAuditSearch(''); setAuditPage(1); }}>Clear</Button>}
      </div>
      <div style={{ display: 'flex', gap: 8, margin: '8px 0', justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={() => exportAudit('xlsx')}><Icon name="download" /> Excel</Button>
        <Button variant="ghost" onClick={() => exportAudit('csv')}><Icon name="download" /> CSV</Button>
        <Button variant="ghost" onClick={() => exportAudit('pdf')}><Icon name="download" /> PDF</Button>
      </div>
      {loading ? <Loading /> : error ? <div className="alert alert-error">{error} <Button variant="ghost" onClick={() => void reload()} style={{ marginLeft: 8 }}>Retry</Button></div> : items.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>When</th><th>User</th><th>Action</th><th>Entity</th><th>IP Address</th></tr></thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.AuditLogID}>
                  <td>{fmtDateTime(a.CreatedAt)}</td>
                  <td>{a.UserName ?? '—'}</td>
                  <td><Badge tone="info">{a.Action}</Badge></td>
                  <td>{a.Entity}{a.EntityID ? ` #${a.EntityID}` : ''}</td>
                  <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{a.IPAddress ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty icon="scroll" message="No audit entries" />}
      <Pagination page={auditPage} total={auditTotal} pageSize={AUDIT_PAGE_SIZE} onPageChange={setAuditPage} />
    </Card>
  );
}

function SchedulesPanel() {
  const { data, loading, error, reload } = useFetch<{ items: ReportSchedule[] }>('/admin/report-schedules');
  const [reportId, setReportId] = useState('');
  const [cron, setCron] = useState('0 8 * * 1');
  const [recipients, setRecipients] = useState('');

  async function add() {
    if (!reportId || !cron) return;
    try {
      await api('/admin/report-schedules', {
        method: 'PUT',
        body: {
          reportId,
          cron,
          recipients: recipients.split(/[\n,;]/).map((s) => s.trim()).filter(Boolean),
          enabled: true,
        },
      });
      toast.success('Schedule added'); setRecipients(''); void reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Save failed');
    }
  }

  return (
    <Card title="Power BI report schedules" flush>
      {loading ? <Loading /> : error ? <div className="alert alert-error">{error}</div> : data?.items.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Report</th><th>Cron</th><th>Recipients</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {data.items.map((s) => (
                <tr key={s.id}>
                  <td><code>{s.reportId}</code></td>
                  <td><code>{s.cron}</code></td>
                  <td>{s.recipients.join(', ') || '—'}</td>
                  <td>{s.enabled ? <Badge tone="success">Enabled</Badge> : <Badge tone="neutral">Disabled</Badge>}</td>
                  <td><Button size="sm" variant="danger-ghost" onClick={async () => {
                    try {
                      await api(`/admin/report-schedules/${s.id}`, { method: 'DELETE' });
                      toast.success('Schedule removed'); void reload();
                    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Remove failed'); }
                  }}>Remove</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty icon="clock" message="No schedules" />}
      <div className="filters" style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12 }}>
        <input className="input" value={reportId} onChange={(e) => setReportId(e.target.value)} placeholder="reportId" />
        <input className="input" value={cron} onChange={(e) => setCron(e.target.value)} placeholder="cron" />
        <input className="input" style={{ flex: 2 }} value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="Recipient emails (comma separated)" />
        <Button size="sm" onClick={() => void add()}>Add schedule</Button>
      </div>
    </Card>
  );
}

function AdminInner() {
  const [tab, setTab] = useState('users');
  const [showPbi, setShowPbi] = useState(false);
  const pbi = useFetch<{ items: PowerBiReport[] }>('/reports/powerbi/views');

  const tabs = [
    { id: 'users', label: 'Users & roles' },
    { id: 'mapping', label: 'Role mapping' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'schedules', label: 'Schedules' },
    { id: 'audit', label: 'Audit log' },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Admin Centre</h1>
          <div className="sub">Role mapping, notification configuration, users, schedules and audit trail.</div>
        </div>
      </div>
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'users' && <UsersPanel />}
      {tab === 'mapping' && <RoleMappingPanel />}
      {tab === 'notifications' && <NotificationConfigPanel />}
      {tab === 'schedules' && <SchedulesPanel />}
      {tab === 'audit' && <AuditPanel />}
      <div style={{ marginTop: 16 }}>
        <Button variant="ghost" onClick={() => setShowPbi((v) => !v)}>{showPbi ? 'Hide' : 'Show'} Power BI catalogue ({pbi.data?.items.length ?? 0})</Button>
        {showPbi ? (
          pbi.loading ? <Loading /> : (
            <div className="card-grid" style={{ marginTop: 10 }}>
              {pbi.data?.items.map((r) => (
                <Card key={r.reportId} title={r.name}>
                  <div className="hint">{r.description}</div>
                  <a className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} href={r.url} target="_blank" rel="noreferrer"><Icon name="arrow-up-right-from-square" /> Open</a>
                </Card>
              ))}
            </div>
          )
        ) : null}
      </div>
    </>
  );
}

export default function AdminPage() {
  return (
    <Guard>
      <RequireRole roles={['Administrator']}>
        <AdminInner />
      </RequireRole>
    </Guard>
  );
}
