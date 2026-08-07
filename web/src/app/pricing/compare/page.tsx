'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';
import type { PriceComparison, Product, Region } from '@/lib/types';

export default function ComparePage() {
  const [rows, setRows] = useState<PriceComparison[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [productId, setProductId] = useState('');
  const [regionId, setRegionId] = useState('');
  const [competitor, setCompetitor] = useState('');
  const [error, setError] = useState('');

  function load() {
    const params = new URLSearchParams();
    if (productId) params.set('productId', productId);
    if (regionId) params.set('regionId', regionId);
    if (competitor) params.set('competitor', competitor);
    api
      .get<PriceComparison[]>(`/api/v1/competitor-prices/compare?${params.toString()}`)
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load comparison'));
  }

  useEffect(() => {
    api.get<Product[]>('/api/v1/products').then(setProducts).catch(() => undefined);
    api.get<Region[]>('/api/v1/regions').then(setRegions).catch(() => undefined);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Price Comparison</h1>
          <p className="page-sub">Own vs. competitor pricing per product.</p>
        </div>
        <Link className="btn" href="/pricing">
          Record price
        </Link>
      </div>

      {error && <div className="alert-box alert-error">{error}</div>}

      <div className="card">
        <div className="row">
          <div>
            <label>Product</label>
            <select value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">All products</option>
              {products.map((p) => (
                <option key={p.ProductID} value={p.ProductID}>
                  {p.Name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Region</label>
            <select value={regionId} onChange={(e) => setRegionId(e.target.value)}>
              <option value="">All regions</option>
              {regions.map((r) => (
                <option key={r.RegionID} value={r.RegionID}>
                  {r.RegionName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Competitor</label>
            <input type="text" value={competitor} onChange={(e) => setCompetitor(e.target.value)} placeholder="e.g. Gebeya" />
          </div>
          <div style={{ maxWidth: 120, display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-primary" onClick={load}>
              Filter
            </button>
          </div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Category</th>
            <th>Competitor</th>
            <th>Own Price</th>
            <th>Avg Competitor Price</th>
            <th>Avg Gap %</th>
            <th>Observations</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.ProductName}</td>
              <td>{r.Category}</td>
              <td>{r.CompetitorName}</td>
              <td>{r.OwnPrice ?? '—'}</td>
              <td>{r.AvgCompetitorPrice}</td>
              <td>
                <span className={`badge ${r.AvgGapPercent > 0 ? 'badge-amber' : 'badge-gray'}`}>{r.AvgGapPercent}%</span>
              </td>
              <td>{r.Observations}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <div className="empty">No comparison data.</div>}
    </AppShell>
  );
}
