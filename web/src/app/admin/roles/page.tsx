'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';
import type { RoleMappingEntry } from '@/lib/types';

export default function AdminRolesPage() {
  const [mappings, setMappings] = useState<RoleMappingEntry[]>([]);
  const [roles, setRoles] = useState<Array<{ RoleID: number; RoleName: string }>>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  function load() {
    api
      .get<RoleMappingEntry[]>('/api/v1/role-mappings')
      .then(setMappings)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load role mappings'));
  }

  useEffect(() => {
    load();
    api
      .get<Array<{ RoleID: number; RoleName: string }>>('/api/v1/users')
      .then((users) => setRoles(users.map((u) => ({ RoleID: u.RoleID, RoleName: u.RoleName })).filter((r, i, a) => a.findIndex((x) => x.RoleID === r.RoleID) === i)))
      .catch(() => undefined);
  }, []);

  async function update(mapping: RoleMappingEntry, roleId: string) {
    setError('');
    setMessage('');
    try {
      await api.put(`/api/v1/role-mappings/${mapping.MappingID}`, { roleId: Number(roleId) });
      setMessage(`Mapping "${mapping.CUASClaim}" updated. Takes effect on next login.`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update mapping');
    }
  }

  return (
    <AppShell>
      <h1>Administration</h1>
      <p className="page-sub">CUAS role-to-permission mapping.</p>

      <div className="role-list" style={{ marginBottom: 18 }}>
        <Link className="btn" href="/admin/sync">
          D365FO Sync
        </Link>
        <Link className="btn" href="/admin/notifications">
          Notifications
        </Link>
        <Link className="btn btn-primary" href="/admin/roles">
          Role Mapping
        </Link>
      </div>

      {error && <div className="alert-box alert-error">{error}</div>}
      {message && <div className="alert-box alert-success">{message}</div>}

      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Maps CUAS group claims to internal KG-MIS roles. Changes take effect on the user&apos;s next login.
        </p>
        <table>
          <thead>
            <tr>
              <th>CUAS claim / group</th>
              <th>Internal role</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((m) => (
              <MappingRow key={m.MappingID} mapping={m} roles={roles} onUpdate={update} />
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

function MappingRow({
  mapping,
  roles,
  onUpdate,
}: {
  mapping: RoleMappingEntry;
  roles: Array<{ RoleID: number; RoleName: string }>;
  onUpdate: (m: RoleMappingEntry, roleId: string) => Promise<void>;
}) {
  const [value, setValue] = useState(String(mapping.RoleID));

  return (
    <tr>
      <td>
        <code>{mapping.CUASClaim}</code>
      </td>
      <td>
        <select value={value} onChange={(e) => setValue(e.target.value)}>
          {roles.map((r) => (
            <option key={r.RoleID} value={r.RoleID}>
              {r.RoleName}
            </option>
          ))}
        </select>
      </td>
      <td>
        <button className="btn btn-sm" onClick={() => onUpdate(mapping, value)} disabled={value === String(mapping.RoleID)}>
          Save
        </button>
      </td>
    </tr>
  );
}
