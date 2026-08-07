'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';
import type { PriceGapAlert } from '@/lib/types';

interface DashboardData {
  visits: number;
  surveys: number;
  priceEntries: number;
  activeAlerts: number;
  pendingNotifications: number;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [alerts, setAlerts] = useState<PriceGapAlert[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get<{ total: number }>('/api/v1/market-visits?page=1&pageSize=1'),
      api.get<unknown[]>('/api/v1/surveys'),
      api.get<{ total: number }>('/api/v1/competitor-prices?page=1&pageSize=1'),
      api.get<PriceGapAlert[]>('/api/v1/competitor-prices/alerts?status=Active'),
      api.get<{ total: number }>('/api/v1/notifications?page=1&pageSize=1'),
    ])
      .then(([visits, surveys, prices, alertList, notifications]) => {
        setData({
          visits: visits.total,
          surveys: surveys.length,
          priceEntries: prices.total,
          activeAlerts: alertList.length,
          pendingNotifications: notifications.total,
        });
        setAlerts(alertList.slice(0, 5));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load dashboard'));
  }, []);

  return (
    <AppShell>
      <h1>Dashboard</h1>
      <p className="page-sub">KPI summary and active price-gap alerts.</p>

      {error && <div className="alert-box alert-error">{error}</div>}

      <div className="kpi-grid">
        <div className="kpi">
          <div className="label">Market visit reports</div>
          <div className="value">{data?.visits ?? '—'}</div>
        </div>
        <div className="kpi">
          <div className="label">Surveys</div>
          <div className="value">{data?.surveys ?? '—'}</div>
        </div>
        <div className="kpi">
          <div className="label">Competitor price entries</div>
          <div className="value">{data?.priceEntries ?? '—'}</div>
        </div>
        <div className="kpi">
          <div className="label">Active price-gap alerts</div>
          <div className="value">{data?.activeAlerts ?? '—'}</div>
        </div>
        <div className="kpi">
          <div className="label">Notifications sent</div>
          <div className="value">{data?.pendingNotifications ?? '—'}</div>
        </div>
      </div>

      <div className="card">
        <h3>Active price-gap alerts</h3>
        {alerts.length === 0 ? (
          <div className="empty">No active price-gap alerts.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Competitor</th>
                <th>Competitor Price</th>
                <th>Own Price</th>
                <th>Gap %</th>
                <th>Region</th>
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="actions">
          <Link className="btn btn-primary" href="/pricing/alerts">
            View all alerts
          </Link>
          <Link className="btn" href="/reports">
            Open reports
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
