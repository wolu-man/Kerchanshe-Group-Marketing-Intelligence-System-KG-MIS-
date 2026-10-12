'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Guard } from '@/components/Guard';
import { Button, Card, Loading, Empty, StatusBadge, Badge, Modal, Field, Tabs, Icon, Pagination } from '@/components/ui';
import { TourTrigger } from '@/components/tour/TourTrigger';
import { api, ApiError } from '@/lib/api';
import { useFetch } from '@/lib/use-api';
import { fmtDate, fmtDateTime, fmtMoney, fmtPct } from '@/lib/format';
import { toast } from '@/components/Toast';
import { useAuth } from '@/lib/auth-context';
import type { PriceGapAlert, Threshold, CompareResult, Product, CompetitorProductRow } from '@/lib/types';

function gapClass(v: number | null | undefined): string {
  if (v == null) return 'gap-neutral';
  return v > 0 ? 'gap-positive' : v < 0 ? 'gap-negative' : 'gap-neutral';
}

const STATUS_TONES: Record<string, 'success' | 'warning' | 'neutral'> = {
  Active: 'success',
  Inactive: 'neutral',
  Expired: 'warning',
};

function AlertsPanel() {
  const [status, setStatus] = useState('');
  const { data, loading, error, reload } = useFetch<{ items: PriceGapAlert[] }>(
    `/competitor-pricing/alerts${status ? `?status=${encodeURIComponent(status)}` : ''}`,
    [status]
  );
  return (
    <Card title="Price gap alerts" flush>
      <div className="filters">
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option><option value="Active">Active</option><option value="Resolved">Resolved</option><option value="Dismissed">Dismissed</option>
        </select>
      </div>
      {loading ? <Loading /> : error ? <div className="alert alert-error">{error}</div> : data?.items.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Product</th><th>Competitor</th><th>Own</th><th>Competitor</th><th>Gap</th><th>Region</th><th>Created</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {data.items.map((a) => (
                <tr key={a.GapAlertID}>
                  <td><b>{a.ProductName}</b><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{a.ProductCode}</div></td>
                  <td>{a.CompetitorName}</td>
                  <td>{fmtMoney(a.OwnPrice)}</td>
                  <td>{fmtMoney(a.CompetitorPrice)}</td>
                  <td><b style={{ color: Number(a.GapPercent) >= Number(a.ThresholdPercent) ? 'var(--danger)' : 'var(--text-muted)' }}>{fmtPct(a.GapPercent)}</b></td>
                  <td>{a.RegionName ?? '—'}</td>
                  <td>{fmtDateTime(a.CreatedAt)}</td>
                  <td><StatusBadge status={a.Status} /></td>
                  <td>
                    {a.Status === 'Active' ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Button size="sm" variant="success" onClick={async () => { try { await api(`/competitor-pricing/alerts/${a.GapAlertID}/resolve`, { method: 'POST' }); toast.success('Alert resolved'); void reload(); } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Failed to resolve alert'); } }}>Resolve</Button>
                        <Button size="sm" variant="ghost" onClick={async () => { try { await api(`/competitor-pricing/alerts/${a.GapAlertID}/dismiss`, { method: 'POST' }); toast.success('Alert dismissed'); void reload(); } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Failed to dismiss alert'); } }}>Dismiss</Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty icon="bell" message="No alerts" />}
    </Card>
  );
}

function ThresholdsPanel() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useFetch<{ items: Threshold[] }>('/competitor-pricing/thresholds');
  const products = useFetch<{ items: Product[] }>('/reference/products');
  const [category, setCategory] = useState('');
  const [thresholdPercent, setThresholdPercent] = useState('');
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const isAdmin = user?.role === 'Administrator';

  const allCategories = [...new Set(products.data?.items.map((p) => p.Category).filter(Boolean) ?? [])].sort();

  async function save() {
    if (!category.trim() || !(Number(thresholdPercent) > 0)) return;
    setSaving(true);
    try {
      await api('/competitor-pricing/thresholds', {
        method: 'PUT',
        body: { category: category.trim(), thresholdPercent: Number(thresholdPercent) }
      });
      setCategory(''); setThresholdPercent(''); setEditId(null);
      toast.success(editId ? 'Threshold updated' : 'Threshold created');
      void reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save threshold');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(t: Threshold) {
    setEditId(t.ThresholdID);
    setCategory(t.ProductCategory);
    setThresholdPercent(String(t.ThresholdPercent));
  }

  function cancelEdit() {
    setEditId(null);
    setCategory('');
    setThresholdPercent('');
  }

  async function handleDelete(id: number, name: string) {
    if (!window.confirm(`Delete threshold for "${name}"?`)) return;
    try {
      await api(`/competitor-pricing/thresholds/${id}`, { method: 'DELETE' });
      toast.success('Threshold deleted');
      void reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete threshold');
    }
  }

  return (
    <Card title="Gap thresholds" flush>
      {loading ? <Loading /> : error ? <div className="alert alert-error">{error}</div> : data?.items.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Product category</th><th>Threshold %</th><th>Created</th><th>Updated</th>{isAdmin ? <th style={{ textAlign: 'right' }}>Actions</th> : null}</tr></thead>
            <tbody>
              {data.items.map((t) => (
                <tr key={t.ThresholdID}>
                  <td><b>{t.ProductCategory}</b></td>
                  <td>{t.ThresholdPercent}%</td>
                  <td>{fmtDateTime(t.CreatedAt)}</td>
                  <td>{t.UpdatedAt ? fmtDateTime(t.UpdatedAt) : '—'}</td>
                  {isAdmin ? (
                    <td>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <Button size="sm" variant="ghost" onClick={() => startEdit(t)}><Icon name="pen" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => void handleDelete(t.ThresholdID, t.ProductCategory)}><Icon name="trash" /></Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty icon="scale-balanced" message="No thresholds configured (default 15%)" />}
      {isAdmin ? (
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12, display: 'grid', gap: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{editId ? 'Edit threshold' : 'Add threshold'}</div>
          <div className="form-row">
            <Field label="Product category" required>
              {editId ? (
                <input className="input" value={category} disabled />
              ) : (
                <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">— select category —</option>
                  {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
            </Field>
            <Field label="Threshold %" required>
              <input className="input" type="number" min="0" step="0.5" value={thresholdPercent} onChange={(e) => setThresholdPercent(e.target.value)} placeholder="e.g. 15" />
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            {editId ? <Button variant="ghost" onClick={cancelEdit}>Cancel</Button> : null}
            <Button size="sm" onClick={() => void save()} busy={saving}>{saving ? 'Saving...' : editId ? 'Update' : 'Add'}</Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function PricingInner() {
  const { user } = useAuth();
  const [tab, setTab] = useState('records');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('Active');
  const [page, setPage] = useState(1);
  const [compareProduct, setCompareProduct] = useState<number | ''>('');

  const PAGE_SIZE = 20;

  useEffect(() => { setPage(1); }, [search, category, status]);

  const filterParams = [
    `page=${page}`,
    `pageSize=${PAGE_SIZE}`,
    search ? `search=${encodeURIComponent(search)}` : '',
    category ? `category=${encodeURIComponent(category)}` : '',
    status ? `status=${status}` : '',
  ].filter(Boolean).join('&');

  const list = useFetch<{ items: CompetitorProductRow[]; total: number }>(
    `/competitors/products?${filterParams}`,
    [search, category, status, page]
  );
  const compare = useFetch<CompareResult>(compareProduct ? `/competitor-pricing/compare/${compareProduct}` : null, [compareProduct]);
  const products = useFetch<{ items: Product[] }>('/reference/products');
  const categories = useFetch<{ items: string[] }>('/competitors/products/categories');
  const canManage = !!user && ['Administrator', 'Marketing Manager'].includes(user.role);

  const tabs = [
    { id: 'records', label: 'Prices' },
    { id: 'compare', label: 'Compare' },
    { id: 'alerts', label: 'Alerts' },
    { id: 'thresholds', label: 'Thresholds' },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Competitor Pricing</h1>
          <div className="sub">
            Competitor prices, gaps and alerts.
            {canManage ? <> Prices are maintained in <Link href="/admin/competitors">Admin › Competitors</Link>.</> : null}
          </div>
        </div>
        <div className="actions">
          <TourTrigger tourId="pricing" />
        </div>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'records' && (
        <>
          <Card title={`Competitor prices (${list.data?.total ?? 0})`} flush>
            <div className="filters">
              <input className="input" placeholder="Search competitor or product..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 220 }} />
              <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">All categories</option>
                {(categories.data?.items ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Expired">Expired</option>
                <option value="">All statuses</option>
              </select>
              {(search || category || status !== 'Active') && (
                <Button variant="ghost" onClick={() => { setSearch(''); setCategory(''); setStatus('Active'); }}>Clear</Button>
              )}
            </div>
            {list.loading ? <Loading /> : list.error ? <div className="alert alert-error">{list.error}</div> : list.data?.items.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Our product</th><th>Colors</th><th>Competitor</th><th>Model</th><th>Category</th><th>Own price</th><th>Competitor price</th><th>Price difference</th><th>Diff %</th><th>Effective</th><th>Status</th></tr></thead>
                  <tbody>
                    {list.data.items.map((r) => (
                      <tr key={r.CompetitorProductID}>
                        <td>
                          {r.OurProductName ? (
                            <><Badge tone="primary">{r.ProductCode}</Badge> {r.OurProductName}</>
                          ) : (
                            <Badge tone="warning">Not linked</Badge>
                          )}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{r.ProductColors ?? '—'}</td>
                        <td><b>{r.CompetitorName}</b></td>
                        <td>{r.CompetitorProduct}</td>
                        <td>{r.Category}</td>
                        <td>{fmtMoney(r.OwnPrice)}</td>
                        <td>{r.PriceMax != null ? `${fmtMoney(r.Price)} – ${fmtMoney(r.PriceMax)}` : fmtMoney(r.Price)}</td>
                        <td>{r.PriceDifference != null ? <b className={gapClass(r.PriceDifference)}>{fmtMoney(r.PriceDifference)}</b> : '—'}</td>
                        <td>{r.PriceDifferencePct != null ? <b className={gapClass(r.PriceDifferencePct)}>{fmtPct(r.PriceDifferencePct)}</b> : '—'}</td>
                        <td>{fmtDate(r.EffectiveDate)}</td>
                        <td><Badge tone={STATUS_TONES[r.Status] ?? 'neutral'}>{r.Status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty icon="location-dot" message="No competitor prices found" />}
          </Card>
          <Pagination page={page} total={list.data?.total ?? 0} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </>
      )}

      {tab === 'compare' && (
        <Card title="Own vs competitor comparison" flush>
          <div className="filters">
            <select className="select" value={compareProduct} onChange={(e) => setCompareProduct(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Select product…</option>
              {products.data?.items.map((p) => <option key={p.ProductID} value={p.ProductID}>{p.Name}</option>)}
            </select>
          </div>
          {compareProduct === '' ? <Empty icon="chart-column" message="Choose a product to compare" /> :
            compare.loading ? <Loading /> : compare.error ? <div className="alert alert-error">{compare.error}</div> : compare.data ? (
              <div>
                <div className="stat-grid" style={{ marginBottom: 14 }}>
                  <Card><div className="stat-card"><div className="label">Own price</div><div className="value">{fmtMoney(compare.data.ownPrice)}</div><div className="sub">{compare.data.product.Name}</div></div></Card>
                </div>
                {compare.data.competitors.length ? (
                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr><th>Competitor</th><th>Model</th><th>Price</th><th>Gap vs own</th><th>Effective</th><th>Status</th></tr></thead>
                      <tbody>
                        {compare.data.competitors.map((c, i) => (
                          <tr key={i}>
                            <td><b>{c.CompetitorName}</b></td>
                            <td>{c.Model}</td>
                            <td>{c.PriceMax != null ? `${fmtMoney(c.Price)} – ${fmtMoney(c.PriceMax)}` : fmtMoney(c.Price)}</td>
                            <td>{c.gapPercent != null ? <b className={gapClass(c.gapPercent)}>{fmtPct(c.gapPercent)}</b> : '—'}</td>
                            <td>{fmtDate(c.EffectiveDate)}</td>
                            <td><Badge tone={STATUS_TONES[c.Status] ?? 'neutral'}>{c.Status}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <Empty icon="chart-column" message="No competitor prices for this product" />}
              </div>
            ) : null}
        </Card>
      )}

      {tab === 'alerts' && <AlertsPanel />}
      {tab === 'thresholds' && <ThresholdsPanel />}
    </>
  );
}

export default function PricingPage() {
  return (
    <Guard>
      <PricingInner />
    </Guard>
  );
}
