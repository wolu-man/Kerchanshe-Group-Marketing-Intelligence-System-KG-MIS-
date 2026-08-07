'use client';

import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';
import type { Report } from '@/lib/types';

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [active, setActive] = useState<Report | null>(null);
  const [embed, setEmbed] = useState<{ token: string; expiry: string; embedUrl: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<Report[]>('/api/v1/reports')
      .then(setReports)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load reports'));
  }, []);

  async function open(report: Report) {
    setError('');
    setActive(report);
    setEmbed(null);
    try {
      const result = await api.get<{ token: string; expiry: string; embedUrl: string }>(
        `/api/v1/reports/embed-token?reportId=${encodeURIComponent(report.reportId)}`,
      );
      setEmbed(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get embed token');
    }
  }

  return (
    <AppShell>
      <h1>Reports</h1>
      <p className="page-sub">Power BI dashboards and reports for your role.</p>

      {error && <div className="alert-box alert-error">{error}</div>}

      <div className="role-list" style={{ marginBottom: 18 }}>
        {reports.map((r) => (
          <button key={r.reportId} className={`btn ${active?.reportId === r.reportId ? 'btn-primary' : ''}`} onClick={() => open(r)}>
            {r.name}
          </button>
        ))}
      </div>

      {active && (
        <div className="card">
          <h3>{active.name}</h3>
          {embed ? (
            <>
              <p className="muted">
                Embed token issued for your session — expires {new Date(embed.expiry).toLocaleString()}.
              </p>
              <iframe
                title={active.name}
                src={embed.embedUrl}
                style={{ width: '100%', height: 520, border: '1px solid var(--border)', borderRadius: 8 }}
              />
            </>
          ) : (
            <div className="empty">Requesting embed token...</div>
          )}
        </div>
      )}

      {!active && <div className="empty">Select a report to view it.</div>}
    </AppShell>
  );
}
