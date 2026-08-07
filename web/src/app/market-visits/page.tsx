'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';
import type { MarketVisitReport } from '@/lib/types';

const STATUS_BADGE: Record<string, string> = {
  Draft: 'badge-gray',
  Submitted: 'badge-blue',
  Reviewed: 'badge-green',
};

export default function MarketVisitsPage() {
  const [items, setItems] = useState<MarketVisitReport[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<{ items: MarketVisitReport[] }>('/api/v1/market-visits?page=1&pageSize=100')
      .then((res) => setItems(res.items))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load reports'));
  }, []);

  return (
    <AppShell>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Market Visit Reports</h1>
          <p className="page-sub">Field observations and visit reports.</p>
        </div>
        <Link className="btn btn-primary" href="/market-visits/new">
          + New report
        </Link>
      </div>

      {error && <div className="alert-box alert-error">{error}</div>}

      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Outlet</th>
            <th>Region</th>
            <th>Visit date</th>
            <th>Submitted by</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.ReportID}>
              <td>{r.ReportID}</td>
              <td>{r.OutletName}</td>
              <td>{r.RegionName}</td>
              <td>{r.VisitDate}</td>
              <td>{r.SubmittedByName}</td>
              <td>
                <span className={`badge ${STATUS_BADGE[r.Status] ?? 'badge-gray'}`}>{r.Status}</span>
              </td>
              <td>
                <Link className="btn btn-sm" href={`/market-visits/${r.ReportID}`}>
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && <div className="empty">No market visit reports yet.</div>}
    </AppShell>
  );
}
