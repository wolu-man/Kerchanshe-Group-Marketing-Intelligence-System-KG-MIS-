'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';
import type { SyncLogEntry } from '@/lib/types';

export default function AdminSyncPage() {
  const [logs, setLogs] = useState<SyncLogEntry[]>([]);
  const [entity, setEntity] = useState('All');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [running, setRunning] = useState(false);

  function load() {
    api
      .get<{ items: SyncLogEntry[] }>('/api/v1/sync/logs?page=1&pageSize=50')
      .then((res) => setLogs(res.items))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load sync logs'));
  }

  useEffect(() => {
    load();
  }, []);

  async function trigger() {
    setError('');
    setMessage('');
    setRunning(true);
    try {
      const result = await api.post<{ message: string }>('/api/v1/sync/d365fo', { entity });
      setMessage(result.message);
      setTimeout(load, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger sync');
    } finally {
      setRunning(false);
    }
  }

  return (
    <AppShell>
      <h1>Administration</h1>
      <p className="page-sub">D365FO master-data sync, notification settings, and role mapping.</p>

      <div className="role-list" style={{ marginBottom: 18 }}>
        <Link className="btn btn-primary" href="/admin/sync">
          D365FO Sync
        </Link>
        <Link className="btn" href="/admin/notifications">
          Notifications
        </Link>
        <Link className="btn" href="/admin/roles">
          Role Mapping
        </Link>
      </div>

      {error && <div className="alert-box alert-error">{error}</div>}
      {message && <div className="alert-box alert-success">{message}</div>}

      <div className="card">
        <h3>Trigger D365FO synchronization</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Pulls customer, product, and sales master data from D365FO into the local cache.
        </p>
        <div className="row">
          <div>
            <label>Entity</label>
            <select value={entity} onChange={(e) => setEntity(e.target.value)}>
              <option value="All">All entities</option>
              <option value="Product">Product</option>
              <option value="Customer">Customer</option>
              <option value="Sales">Sales</option>
            </select>
          </div>
          <div style={{ maxWidth: 160, display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-primary" onClick={trigger} disabled={running}>
              {running ? 'Running...' : 'Run sync now'}
            </button>
          </div>
        </div>
      </div>

      <h2 style={{ marginTop: 20 }}>Sync history</h2>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Entity</th>
            <th>Status</th>
            <th>Records</th>
            <th>Errors</th>
            <th>Started</th>
            <th>Finished</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.SyncLogID}>
              <td>{l.SyncLogID}</td>
              <td>{l.Entity}</td>
              <td>
                <span className={`badge ${l.Status === 'Success' ? 'badge-green' : l.Status === 'Failed' ? 'badge-red' : 'badge-amber'}`}>
                  {l.Status}
                </span>
              </td>
              <td>{l.RecordsProcessed}</td>
              <td>{l.ErrorCount}</td>
              <td>{new Date(l.StartedAt).toLocaleString()}</td>
              <td>{l.FinishedAt ? new Date(l.FinishedAt).toLocaleString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {logs.length === 0 && <div className="empty">No sync runs yet.</div>}
    </AppShell>
  );
}
