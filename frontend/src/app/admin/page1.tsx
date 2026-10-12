'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import RelationshipConfigurationAdmin from '@/app/admin/relationship-configuration/page';

export default function AdminCentre() {
  const { user } = useAuth();
  const [tab, setTab] = useState('relationships');

  const navTabs = [
    { id: 'users', label: 'Users & roles' },
    { id: 'mapping', label: 'Role mapping' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'schedules', label: 'Schedules' },
    { id: 'audit', label: 'Audit log' },
    { id: 'relationships', label: 'Relationship Configuration' },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h1>Admin Centre</h1>

      <div style={{ marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 16 }}>
        {navTabs.map((t) => (
          <div
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              cursor: 'pointer',
              padding: '8px 16px',
              borderRadius: 4,
              marginRight: 4,
              background: tab === t.id ? 'var(--primary)' : 'transparent',
              color: tab === t.id ? 'white' : 'var(--text-muted)',
              fontWeight: tab === t.id ? '600' : '400',
            }}
          >
            {t.label}
          </div>
        ))}
      </div>

      {tab === 'relationships' && <RelationshipConfigurationAdmin />}
    </div>
  );
}