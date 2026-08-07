'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';
import type { Outlet } from '@/lib/types';

export default function NewMarketVisitPage() {
  const router = useRouter();
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [outletId, setOutletId] = useState('');
  const [visitDate, setVisitDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get<Outlet[]>('/api/v1/outlets')
      .then(setOutlets)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load outlets'));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const report = await api.post<{ ReportID: number }>('/api/v1/market-visits', {
        outletId: Number(outletId),
        visitDate,
        notes: notes || undefined,
      });
      router.push(`/market-visits/${report.ReportID}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save report');
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <h1>New Market Visit Report</h1>
      <p className="page-sub">Record a field visit observation.</p>

      {error && <div className="alert-box alert-error">{error}</div>}

      <div className="card">
        <form onSubmit={onSubmit}>
          <div className="row">
            <div>
              <label>Outlet</label>
              <select value={outletId} onChange={(e) => setOutletId(e.target.value)} required>
                <option value="">Select outlet...</option>
                {outlets.map((o) => (
                  <option key={o.OutletID} value={o.OutletID}>
                    {o.OutletName} ({o.City})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Visit date</label>
              <input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} required />
            </div>
          </div>
          <label>Notes / observations</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Free-text observations from the visit..." />
          <div className="actions">
            <button className="btn btn-primary" type="submit" disabled={saving || !outletId}>
              {saving ? 'Saving...' : 'Save draft'}
            </button>
            <Link className="btn" href="/market-visits">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
