'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';
import type { MarketVisitReport } from '@/lib/types';

export default function MarketVisitDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [report, setReport] = useState<MarketVisitReport | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    api
      .get<MarketVisitReport>(`/api/v1/market-visits/${params.id}`)
      .then((r) => {
        setReport(r);
        setNotes(r.Notes ?? '');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load report'));
  }, [params.id]);

  async function submit() {
    setError('');
    setMessage('');
    try {
      const updated = await api.post<MarketVisitReport>(`/api/v1/market-visits/${params.id}/submit`);
      setReport(updated);
      setMessage('Report submitted. The Marketing Manager has been notified.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    }
  }

  if (!report) {
    return (
      <AppShell>
        {error && <div className="alert-box alert-error">{error}</div>}
        <div className="empty">Loading report...</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1>Market Visit Report #{report.ReportID}</h1>
      <p className="page-sub">{report.OutletName} · {report.City}</p>

      {error && <div className="alert-box alert-error">{error}</div>}
      {message && <div className="alert-box alert-success">{message}</div>}

      <div className="card">
        <table>
          <tbody>
            <tr>
              <td className="muted">Outlet</td>
              <td>{report.OutletName}</td>
            </tr>
            <tr>
              <td className="muted">Region</td>
              <td>{report.RegionName}</td>
            </tr>
            <tr>
              <td className="muted">Visit date</td>
              <td>{report.VisitDate}</td>
            </tr>
            <tr>
              <td className="muted">Submitted by</td>
              <td>{report.SubmittedByName}</td>
            </tr>
            <tr>
              <td className="muted">Status</td>
              <td>
                <span className={`badge ${report.Status === 'Draft' ? 'badge-gray' : report.Status === 'Submitted' ? 'badge-blue' : 'badge-green'}`}>
                  {report.Status}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {report.Status === 'Draft' && (
        <div className="card">
          <h3>Edit notes</h3>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="actions">
            <button
              className="btn"
              onClick={async () => {
                try {
                  const updated = await api.put<MarketVisitReport>(`/api/v1/market-visits/${params.id}`, { notes });
                  setReport(updated);
                  setMessage('Draft saved.');
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Failed to save');
                }
              }}
            >
              Save draft
            </button>
            <button className="btn btn-primary" onClick={submit}>
              Submit report
            </button>
            <Link className="btn" href="/market-visits">
              Back
            </Link>
          </div>
        </div>
      )}

      {report.Status !== 'Draft' && (
        <div className="actions">
          <Link className="btn" href="/market-visits">
            Back to list
          </Link>
        </div>
      )}
    </AppShell>
  );
}
