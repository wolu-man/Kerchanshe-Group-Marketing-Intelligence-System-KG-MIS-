'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';
import type { PriceGapAlert } from '@/lib/types';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<PriceGapAlert[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<PriceGapAlert[]>('/api/v1/competitor-prices/alerts?status=Active')
      .then(setAlerts)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load alerts'));
  }, []);

  return (
    <AppShell>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Price Gap Alerts</h1>
          <p className="page-sub">Flagged pricing gaps that exceed the configured threshold.</p>
        </div>
        <Link className="btn" href="/pricing">
          Record price
        </Link>
      </div>

      {error && <div className="alert-box alert-error">{error}</div>}

      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Competitor</th>
            <th>Competitor Price</th>
            <th>Own Price</th>
            <th>Gap %</th>
            <th>Region</th>
            <th>Raised</th>
          </tr>
        </thead>
        <tbody>
          {alerts.map((a) => (
            <tr key={a.GapAlertID}>
              <td>{a.ProductName}</td>
              <td>{a.CompetitorName}</td>
              <td>{a.CompetitorPrice}</td>
              <td>{a.OwnPrice}</td>
              <td>
                <span className="badge badge-red">{a.GapPercent}%</span>
              </td>
              <td>{a.RegionName}</td>
              <td>{new Date(a.CreatedAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {alerts.length === 0 && <div className="empty">No active price-gap alerts.</div>}
    </AppShell>
  );
}
