'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';
import type { NotificationConfigEntry, NotificationEntry } from '@/lib/types';

const EVENTS = ['NewReport', 'SurveyPublished', 'PriceGapAlert', 'SyncFailure'];
const CHANNELS = ['Email', 'SMS', 'WhatsApp'];

const STATUS_BADGE: Record<string, string> = {
  Sent: 'badge-green',
  Retried: 'badge-amber',
  Failed: 'badge-red',
  Pending: 'badge-gray',
};

export default function AdminNotificationsPage() {
  const [history, setHistory] = useState<NotificationEntry[]>([]);
  const [config, setConfig] = useState<NotificationConfigEntry[]>([]);
  const [roles, setRoles] = useState<Array<{ RoleID: number; RoleName: string }>>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [event, setEvent] = useState(EVENTS[0]);
  const [channel, setChannel] = useState(CHANNELS[0]);
  const [roleId, setRoleId] = useState('');

  function load() {
    api
      .get<{ items: NotificationEntry[] }>('/api/v1/notifications?page=1&pageSize=50')
      .then((res) => setHistory(res.items))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load notifications'));
    api
      .get<NotificationConfigEntry[]>('/api/v1/notifications/config')
      .then(setConfig)
      .catch(() => undefined);
  }

  useEffect(() => {
    load();
    api
      .get<Array<{ RoleID: number; RoleName: string }>>('/api/v1/users')
      .then((users) => setRoles(users.map((u) => ({ RoleID: u.RoleID, RoleName: u.RoleName })).filter((r, i, a) => a.findIndex((x) => x.RoleID === r.RoleID) === i)))
      .catch(() => undefined);
  }, []);

  async function addConfig(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await api.post('/api/v1/notifications/config', { triggerEvent: event, channel, roleId: Number(roleId), enabled: true });
      setMessage('Notification rule added.');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add rule');
    }
  }

  async function toggle(entry: NotificationConfigEntry) {
    try {
      await api.post('/api/v1/notifications/config', {
        triggerEvent: entry.TriggerEvent,
        channel: entry.Channel,
        roleId: entry.RoleID,
        enabled: !entry.Enabled,
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update rule');
    }
  }

  return (
    <AppShell>
      <h1>Administration</h1>
      <p className="page-sub">Notification settings and delivery history.</p>

      <div className="role-list" style={{ marginBottom: 18 }}>
        <Link className="btn" href="/admin/sync">
          D365FO Sync
        </Link>
        <Link className="btn btn-primary" href="/admin/notifications">
          Notifications
        </Link>
        <Link className="btn" href="/admin/roles">
          Role Mapping
        </Link>
      </div>

      {error && <div className="alert-box alert-error">{error}</div>}
      {message && <div className="alert-box alert-success">{message}</div>}

      <div className="card">
        <h3>Notification rules (event → channel → role)</h3>
        <form onSubmit={addConfig}>
          <div className="row">
            <div>
              <label>Trigger event</label>
              <select value={event} onChange={(e) => setEvent(e.target.value)}>
                {EVENTS.map((ev) => (
                  <option key={ev} value={ev}>
                    {ev}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Channel</label>
              <select value={channel} onChange={(e) => setChannel(e.target.value)}>
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Role</label>
              <select value={roleId} onChange={(e) => setRoleId(e.target.value)} required>
                <option value="">Select role...</option>
                {roles.map((r) => (
                  <option key={r.RoleID} value={r.RoleID}>
                    {r.RoleName}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ maxWidth: 140, display: 'flex', alignItems: 'flex-end' }}>
              <button className="btn btn-primary" type="submit">
                Add rule
              </button>
            </div>
          </div>
        </form>

        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th>Channel</th>
              <th>Role</th>
              <th>Enabled</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {config.map((c) => (
              <tr key={c.ConfigID}>
                <td>{c.TriggerEvent}</td>
                <td>{c.Channel}</td>
                <td>{c.RoleName}</td>
                <td>
                  <span className={`badge ${c.Enabled ? 'badge-green' : 'badge-gray'}`}>{c.Enabled ? 'Enabled' : 'Disabled'}</span>
                </td>
                <td>
                  <button className="btn btn-sm" onClick={() => toggle(c)}>
                    {c.Enabled ? 'Disable' : 'Enable'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ marginTop: 20 }}>Delivery history</h2>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Event</th>
            <th>Channel</th>
            <th>Recipient</th>
            <th>Subject</th>
            <th>Status</th>
            <th>Attempts</th>
            <th>Sent</th>
          </tr>
        </thead>
        <tbody>
          {history.map((n) => (
            <tr key={n.NotificationID}>
              <td>{n.NotificationID}</td>
              <td>{n.TriggerEvent}</td>
              <td>{n.Channel}</td>
              <td>
                {n.RecipientName}
                <div className="muted">{n.RecipientEmail}</div>
              </td>
              <td>{n.Subject}</td>
              <td>
                <span className={`badge ${STATUS_BADGE[n.Status] ?? 'badge-gray'}`}>{n.Status}</span>
              </td>
              <td>{n.Attempts}</td>
              <td>{n.SentAt ? new Date(n.SentAt).toLocaleString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {history.length === 0 && <div className="empty">No notifications sent yet.</div>}
    </AppShell>
  );
}
