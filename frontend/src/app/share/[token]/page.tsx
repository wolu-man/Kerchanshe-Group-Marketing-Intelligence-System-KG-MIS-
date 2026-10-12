'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, Loading, Icon, Badge } from '@/components/ui';
import { BarChart, Donut } from '@/components/ui';
import type { FormReport } from '@/lib/types';

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');

// Public read-only report (DR-11): the share token is the only credential.
export default function SharedReportPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [report, setReport] = useState<FormReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`${BASE}/share/${token}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('This share link is invalid, expired, or revoked.');
        return res.json() as Promise<FormReport>;
      })
      .then(setReport)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load report'));
  }, [token]);

  if (error) {
    return (
      <div className="empty" style={{ padding: '60px 20px' }}>
        <div className="icon"><Icon name="link-slash" /></div>
        <div>{error}</div>
      </div>
    );
  }
  if (!report) return <Loading label="Loading shared report…" />;

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '20px 0' }}>
      <Card title={<><Icon name="square-share-nodes" /> {report.template.title} <Badge tone="info">shared</Badge></>}>
        <div className="filters" style={{ marginBottom: 0 }}>
          <div className="hint">Read-only view · {report.total} response{report.total === 1 ? '' : 's'}</div>
        </div>
      </Card>
      <div className="dash-grid">
        {report.fields.map((f) => {
          const s = f.summary;
          if (s.count === 0) return null;
          let body: React.ReactNode = null;
          if (s.optionCounts) {
            const rows = Object.entries(s.optionCounts).sort((a, b) => b[1] - a[1]);
            body = rows.length <= 6 ? <Donut data={rows.map(([label, value]) => ({ label, value }))} /> : <BarChart data={rows.map(([label, value]) => ({ label, value }))} />;
          } else if (s.byMonth) {
            const rows = Object.entries(s.byMonth).sort((a, b) => (a[0] < b[0] ? -1 : 1));
            body = <BarChart data={rows.map(([label, value]) => ({ label, value }))} />;
          } else if (s.avg !== undefined && s.avg !== null) {
            body = (
              <div style={{ display: 'flex', gap: 14 }}>
                <div><div className="label" style={{ fontSize: 12 }}>Average</div><div style={{ fontSize: 24, fontWeight: 700 }}>{s.avg}</div></div>
                <div><div className="label" style={{ fontSize: 12 }}>Min</div><div style={{ fontSize: 18 }}>{s.min}</div></div>
                <div><div className="label" style={{ fontSize: 12 }}>Max</div><div style={{ fontSize: 18 }}>{s.max}</div></div>
              </div>
            );
          } else {
            body = <div className="empty">No responses for this field</div>;
          }
          return (
            <Card key={`${f.key}-${f.label}`} title={<span>{f.label} <Badge tone="neutral">{f.type}</Badge></span>}>
              {body}
            </Card>
          );
        })}
      </div>
    </div>
  );
}