'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';
import type { CompetitorPrice, Outlet, Product, Region } from '@/lib/types';

export default function PricingPage() {
  const [items, setItems] = useState<CompetitorPrice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [productId, setProductId] = useState('');
  const [competitorName, setCompetitorName] = useState('');
  const [price, setPrice] = useState('');
  const [regionId, setRegionId] = useState('');
  const [outletId, setOutletId] = useState('');
  const [recordedDate, setRecordedDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  function load() {
    api
      .get<{ items: CompetitorPrice[] }>('/api/v1/competitor-prices?page=1&pageSize=100')
      .then((res) => setItems(res.items))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load prices'));
  }

  useEffect(() => {
    load();
    api.get<Product[]>('/api/v1/products').then(setProducts).catch(() => undefined);
    api.get<Region[]>('/api/v1/regions').then(setRegions).catch(() => undefined);
    api.get<Outlet[]>('/api/v1/outlets').then(setOutlets).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!regionId) return;
    api
      .get<Outlet[]>(`/api/v1/outlets?regionId=${regionId}`)
      .then(setOutlets)
      .catch(() => undefined);
  }, [regionId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const result = await api.post<{ priceId: number; gapPercent: number; thresholdBreached: boolean }>(
        '/api/v1/competitor-prices',
        {
          productId: Number(productId),
          competitorName,
          price: Number(price),
          regionId: Number(regionId),
          outletId: outletId ? Number(outletId) : undefined,
          recordedDate,
        },
      );
      setMessage(
        result.thresholdBreached
          ? `Price recorded. Gap of ${result.gapPercent}% exceeded threshold — alert raised and notifications sent.`
          : `Price recorded. Gap: ${result.gapPercent}% (within threshold).`,
      );
      setCompetitorName('');
      setPrice('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record price');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Competitor Pricing</h1>
          <p className="page-sub">Record competitor prices and compare against Kerchanshe pricing.</p>
        </div>
        <div className="role-list" style={{ marginBottom: 0 }}>
          <Link className="btn" href="/pricing/compare">
            Comparison
          </Link>
          <Link className="btn" href="/pricing/alerts">
            Alerts
          </Link>
        </div>
      </div>

      {error && <div className="alert-box alert-error">{error}</div>}
      {message && <div className="alert-box alert-success">{message}</div>}

      <div className="card">
        <h3>Record competitor price</h3>
        <form onSubmit={onSubmit}>
          <div className="row">
            <div>
              <label>Product</label>
              <select value={productId} onChange={(e) => setProductId(e.target.value)} required>
                <option value="">Select product...</option>
                {products.map((p) => (
                  <option key={p.ProductID} value={p.ProductID}>
                    {p.Name} ({p.Category})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Competitor name</label>
              <input type="text" value={competitorName} onChange={(e) => setCompetitorName(e.target.value)} required />
            </div>
            <div>
              <label>Competitor price</label>
              <input type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} required />
            </div>
          </div>
          <div className="row">
            <div>
              <label>Region</label>
              <select value={regionId} onChange={(e) => setRegionId(e.target.value)} required>
                <option value="">Select region...</option>
                {regions.map((r) => (
                  <option key={r.RegionID} value={r.RegionID}>
                    {r.RegionName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Outlet</label>
              <select value={outletId} onChange={(e) => setOutletId(e.target.value)}>
                <option value="">Select outlet (optional)...</option>
                {outlets.map((o) => (
                  <option key={o.OutletID} value={o.OutletID}>
                    {o.OutletName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Recorded date</label>
              <input type="date" value={recordedDate} onChange={(e) => setRecordedDate(e.target.value)} required />
            </div>
          </div>
          <div className="actions">
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Recording...' : 'Record price'}
            </button>
          </div>
        </form>
      </div>

      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Competitor</th>
            <th>Competitor Price</th>
            <th>Own Price</th>
            <th>Gap %</th>
            <th>Region</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.PriceID}>
              <td>{p.ProductName}</td>
              <td>{p.CompetitorName}</td>
              <td>{p.Price}</td>
              <td>{p.OwnPrice ?? '—'}</td>
              <td>
                <span className={`badge ${p.GapPercent > 0 ? 'badge-amber' : 'badge-gray'}`}>{p.GapPercent}%</span>
              </td>
              <td>{p.RegionName}</td>
              <td>{p.RecordedDate}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && <div className="empty">No competitor prices recorded yet.</div>}
    </AppShell>
  );
}
