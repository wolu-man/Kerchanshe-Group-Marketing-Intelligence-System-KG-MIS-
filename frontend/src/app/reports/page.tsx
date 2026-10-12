'use client';

import { useState, useRef, useEffect } from 'react';
import { Guard } from '@/components/Guard';
import { Button, Card, Loading, Empty, Badge, BarChart, Donut, Tabs, Icon } from '@/components/ui';
import { TourTrigger } from '@/components/tour/TourTrigger';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/use-api';
import { toast } from '@/components/Toast';
import { AiDataAsk } from '@/components/forms/AiDataAsk';
import { fmtMoney, fmtDate, fmtPct } from '@/lib/format';
import type {
  AiInsights, SalesOverview, PriceComparisonRow, PowerBiReport, EmbedToken,
  Region, BusinessGroup, CustomerType, InterviewsOverview, WeeklySalesOverview,
  GeneratedAlert, CustomersReport, ProductsReport, CompetitorIntelReport,
  KpiPerformanceReport, MarketVisitsReport, ColorInfo,
} from '@/lib/types';

function ColorFilterSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const colors = useFetch<{ items: ColorInfo[] }>('/reference/colors');
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">All colors</option>
      {colors.data?.items.map((c) => <option key={c.ColorID} value={c.ColorID}>{c.Name}</option>)}
    </select>
  );
}

const EXPORT_KINDS: Array<{ kind: string; label: string; icon: string }> = [
  { kind: 'market-visits', label: 'Market visits', icon: 'location-dot' },
  { kind: 'interviews', label: 'Interviews', icon: 'comments' },
  { kind: 'multimedia', label: 'Multimedia', icon: 'photo-film' },
  { kind: 'weekly-sales', label: 'Weekly sales', icon: 'cash-register' },
  { kind: 'competitor', label: 'Competitor intelligence', icon: 'building' },
  { kind: 'customers', label: 'Customers', icon: 'users' },
  { kind: 'products', label: 'Products', icon: 'box-open' },
  { kind: 'kpi-results', label: 'KPI results', icon: 'chart-bar' },
];

async function downloadExcel(kind: string, label: string) {
  try {
    const res = await fetch(`${(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '')}/reports/export/${kind}`, {
      headers: localStorage.getItem('kgmis_token') ? { Authorization: `Bearer ${localStorage.getItem('kgmis_token')}` } : undefined,
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.message ?? `Export failed (${res.status})`);
    }
    const buffer = await res.arrayBuffer();
    if (!buffer.byteLength) { toast.info(`${label} has no data to export`); return; }
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${kind}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`${label} exported as Excel`);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Export failed');
  }
}

const ALERT_TONE: Record<string, 'danger' | 'warning' | 'info'> = { high: 'danger', medium: 'warning', low: 'info' };
const ALERT_ICON: Record<string, string> = { high: 'triangle-exclamation', medium: 'circle-exclamation', low: 'circle-info' };

function AlertBadges({ alerts }: { alerts: GeneratedAlert[] }) {
  if (!alerts.length) return <Empty icon="shield-check" message="No generated alerts — all KPIs look healthy" />;
  return (
    <div>
      {alerts.map((a, i) => (
        <div key={i} className={`alert-item alert-${a.severity}`}>
          <div className="alert-icon"><Icon name={ALERT_ICON[a.severity] ?? 'circle-info'} /></div>
          <div className="alert-content">
            <div className="alert-type">{a.type.replace(/([A-Z])/g, ' $1')}</div>
            <div className="alert-msg">{a.message}</div>
          </div>
          <Badge tone={ALERT_TONE[a.severity] ?? 'info'}>{a.severity}</Badge>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Market Visits Report                                                        */
/* -------------------------------------------------------------------------- */
function MarketVisitsReport() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const regions = useFetch<{ items: Region[] }>('/reference/regions');
  const qs = [
    from ? `from=${encodeURIComponent(from)}` : '',
    to ? `to=${encodeURIComponent(to)}` : '',
  ].filter(Boolean).join('&');
  const { data, loading, error } = useFetch<MarketVisitsReport>(`/reports/market-visits${qs ? `?${qs}` : ''}`, [qs]);
  const items = data?.items ?? [];
  const statusCounts = items.reduce((acc, r) => { acc[r.Status] = (acc[r.Status] || 0) + 1; return acc; }, {} as Record<string, number>);
  const totalShops = items.reduce((s, r) => s + (r.ShopsVisited ?? 0), 0);
  const shopsByRegion = Object.values(
    items.reduce((acc, r) => {
      const key = r.RegionName ?? 'Unassigned';
      if (!acc[key]) acc[key] = { label: key, value: 0 };
      acc[key].value += r.ShopsVisited ?? 0;
      return acc;
    }, {} as Record<string, { label: string; value: number }>)
  ).filter((d) => d.value > 0).sort((a, b) => b.value - a.value);

  return (
    <div>
      <div className="filter-bar">
        <span className="filter-label">Filters</span>
        <div className="filter-sep" />
        <div className="filter-group">
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
          <span style={{ color: 'var(--text-muted)' }}><Icon name="arrow-right" /></span>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
        </div>
        <Button variant="ghost" size="sm" onClick={() => { setFrom(''); setTo(''); }}><Icon name="xmark" /> Clear</Button>
      </div>
      {loading ? <Loading /> : error ? <div className="alert alert-error">{error}</div> : (
        <>
          <div className="stat-grid" style={{ marginTop: 4 }}>
            <Card><div className="kpi-card kpi-amber"><div className="kpi-head"><div className="kpi-icon"><Icon name="location-dot" /></div><div className="kpi-label">Total Visits</div></div><div className="kpi-body"><div className="kpi-value">{items.length}</div></div></div></Card>
            <Card><div className="kpi-card kpi-purple"><div className="kpi-head"><div className="kpi-icon"><Icon name="store" /></div><div className="kpi-label">Shops Visited</div></div><div className="kpi-body"><div className="kpi-value">{totalShops.toLocaleString()}</div></div></div></Card>
            {Object.entries(statusCounts).map(([status, count]) => (
              <Card key={status}><div className={`kpi-card ${status === 'Approved' ? 'kpi-green' : status === 'Submitted' ? 'kpi-blue' : status === 'Rejected' ? 'kpi-red' : 'kpi-teal'}`}><div className="kpi-head"><div className="kpi-icon"><Icon name="clipboard-check" /></div><div className="kpi-label">{status}</div></div><div className="kpi-body"><div className="kpi-value">{count}</div></div></div></Card>
            ))}
          </div>
          {items.length > 0 && (
            <Card style={{ marginTop: 16 }}>
              <div className="table-wrap">
                <table className="table table-enhanced">
                  <thead><tr><th>ID</th><th>Date</th><th>Status</th><th>Shops</th><th>Outlet</th><th>Region</th><th>Submitted By</th></tr></thead>
                  <tbody>
                    {items.map((r) => (
                      <tr key={r.ReportID}>
                        <td>#{r.ReportID}</td>
                        <td>{fmtDate(r.VisitDate)}</td>
                        <td><Badge tone={r.Status === 'Approved' ? 'success' : r.Status === 'Submitted' ? 'info' : r.Status === 'Rejected' ? 'danger' : 'neutral'}>{r.Status}</Badge></td>
                        <td>{r.ShopsVisited ?? '—'}</td>
                        <td>{r.OutletName} <span className="sub-text">({r.City})</span></td>
                        <td>{r.RegionName ?? 'Unassigned'}</td>
                        <td>{r.SubmittedByName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          {shopsByRegion.length > 0 && (
            <Card title="Shops visited by region" style={{ marginTop: 16 }}>
              <BarChart data={shopsByRegion} />
            </Card>
          )}
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Customers Report                                                           */
/* -------------------------------------------------------------------------- */
function CustomersReportTab() {
  const [regionId, setRegionId] = useState('');
  const [businessGroupId, setBusinessGroupId] = useState('');
  const regions = useFetch<{ items: Region[] }>('/reference/regions');
  const groups = useFetch<{ items: BusinessGroup[] }>('/reference/business-groups');
  const qs = [
    regionId ? `regionId=${encodeURIComponent(regionId)}` : '',
    businessGroupId ? `businessGroupId=${encodeURIComponent(businessGroupId)}` : '',
  ].filter(Boolean).join('&');
  const { data, loading, error } = useFetch<CustomersReport>(`/reports/customers${qs ? `?${qs}` : ''}`, [qs]);

  return (
    <div>
      <div className="filter-bar">
        <span className="filter-label">Filters</span>
        <div className="filter-sep" />
        <select className="select" value={regionId} onChange={(e) => setRegionId(e.target.value)}>
          <option value="">All regions</option>
          {regions.data?.items.map((r) => <option key={r.RegionID} value={r.RegionID}>{r.RegionName}</option>)}
        </select>
        <select className="select" value={businessGroupId} onChange={(e) => setBusinessGroupId(e.target.value)}>
          <option value="">All business groups</option>
          {groups.data?.items.map((g) => <option key={g.BusinessGroupID} value={g.BusinessGroupID}>{g.Name}</option>)}
        </select>
        <Button variant="ghost" size="sm" onClick={() => { setRegionId(''); setBusinessGroupId(''); }}><Icon name="xmark" /> Clear</Button>
      </div>
      {loading ? <Loading /> : error ? <div className="alert alert-error">{error}</div> : data ? (
        <>
          <div className="stat-grid" style={{ marginTop: 4 }}>
            <Card><div className="kpi-card kpi-blue"><div className="kpi-head"><div className="kpi-icon"><Icon name="users" /></div><div className="kpi-label">Total Customers</div></div><div className="kpi-body"><div className="kpi-value">{data.totals.TotalCustomers}</div></div></div></Card>
            <Card><div className="kpi-card kpi-indigo"><div className="kpi-head"><div className="kpi-icon"><Icon name="globe" /></div><div className="kpi-label">Regions Covered</div></div><div className="kpi-body"><div className="kpi-value">{data.totals.RegionsCovered}</div></div></div></Card>
            <Card><div className="kpi-card kpi-teal"><div className="kpi-head"><div className="kpi-icon"><Icon name="layer-group" /></div><div className="kpi-label">Business Groups</div></div><div className="kpi-body"><div className="kpi-value">{data.totals.BusinessGroups}</div></div></div></Card>
          </div>
          <div className="dash-grid">
            <Card title="By customer type">
              <BarChart data={data.byType.map((r) => ({ label: r.CustomerTypeName ?? 'Unknown', value: r.Count }))} />
            </Card>
            <Card title="By region">
              <BarChart data={data.byRegion.map((r) => ({ label: r.RegionName ?? 'Unassigned', value: r.Count }))} />
            </Card>
          </div>
          <div className="dash-grid" style={{ marginTop: 16 }}>
            <Card title="By business group">
              <BarChart data={data.byBusinessGroup.map((r) => ({ label: r.BusinessGroupName ?? 'Unassigned', value: r.Count }))} />
            </Card>
            <Card title="By star rating">
              <BarChart data={data.byStarRating.map((r) => ({ label: r.StarRating, value: r.Count }))} />
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Products Report                                                            */
/* -------------------------------------------------------------------------- */
function ProductsReportTab() {
  const [businessGroupId, setBusinessGroupId] = useState('');
  const [colorId, setColorId] = useState('');
  const groups = useFetch<{ items: BusinessGroup[] }>('/reference/business-groups');
  const qs = [
    businessGroupId ? `businessGroupId=${encodeURIComponent(businessGroupId)}` : '',
    colorId ? `colorId=${encodeURIComponent(colorId)}` : '',
  ].filter(Boolean).join('&');
  const { data, loading, error } = useFetch<ProductsReport>(`/reports/products${qs ? `?${qs}` : ''}`, [qs]);

  return (
    <div>
      <div className="filter-bar">
        <span className="filter-label">Filters</span>
        <div className="filter-sep" />
        <select className="select" value={businessGroupId} onChange={(e) => setBusinessGroupId(e.target.value)}>
          <option value="">All business groups</option>
          {groups.data?.items.map((g) => <option key={g.BusinessGroupID} value={g.BusinessGroupID}>{g.Name}</option>)}
        </select>
        <ColorFilterSelect value={colorId} onChange={setColorId} />
        <Button variant="ghost" size="sm" onClick={() => { setBusinessGroupId(''); setColorId(''); }}><Icon name="xmark" /> Clear</Button>
      </div>
      {loading ? <Loading /> : error ? <div className="alert alert-error">{error}</div> : data ? (
        <>
          <div className="stat-grid" style={{ marginTop: 4 }}>
            <Card><div className="kpi-card kpi-green"><div className="kpi-head"><div className="kpi-icon"><Icon name="box-open" /></div><div className="kpi-label">Total Products</div></div><div className="kpi-body"><div className="kpi-value">{data.totals.TotalProducts}</div></div></div></Card>
            <Card><div className="kpi-card kpi-blue"><div className="kpi-head"><div className="kpi-icon"><Icon name="tags" /></div><div className="kpi-label">Categories</div></div><div className="kpi-body"><div className="kpi-value">{data.totals.Categories}</div></div></div></Card>
            <Card><div className="kpi-card kpi-amber"><div className="kpi-head"><div className="kpi-icon"><Icon name="money-bill" /></div><div className="kpi-label">Avg Price</div></div><div className="kpi-body"><div className="kpi-value">ETB {fmtMoney(data.totals.AvgPrice)}</div></div></div></Card>
            <Card><div className="kpi-card kpi-purple"><div className="kpi-head"><div className="kpi-icon"><Icon name="layers" /></div><div className="kpi-label">With Tier Pricing</div></div><div className="kpi-body"><div className="kpi-value">{data.productsWithTiers}</div></div></div></Card>
          </div>
          <div className="dash-grid">
            <Card title="By category">
              <BarChart data={data.byCategory.map((r) => ({ label: r.Category, value: r.Count }))} />
            </Card>
            <Card title="By business group">
              <BarChart data={data.byBusinessGroup.map((r) => ({ label: r.BusinessGroupName ?? 'Unassigned', value: r.Count }))} />
            </Card>
          </div>
          {data.byColor.length > 0 && (
            <Card title="By color" style={{ marginTop: 16 }}>
              <BarChart data={data.byColor.map((r) => ({ label: r.Color, value: r.Count }))} />
            </Card>
          )}
          {data.pricingTiers.length > 0 && (
            <Card title="Pricing tiers" style={{ marginTop: 16 }}>
              <div className="table-wrap">
                <table className="table table-enhanced">
                  <thead><tr><th>Customer Type</th><th style={{ textAlign: 'right' }}>Products</th><th style={{ textAlign: 'right' }}>Avg Price</th></tr></thead>
                  <tbody>
                    {data.pricingTiers.map((t, i) => (
                      <tr key={i}><td><Badge tone="info">{t.CustomerTypeName}</Badge></td><td style={{ textAlign: 'right' }}>{t.PriceCount}</td><td style={{ textAlign: 'right' }}>ETB {fmtMoney(t.AvgPrice)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Interviews Report                                                          */
/* -------------------------------------------------------------------------- */
function InterviewsReport() {
  const [regionId, setRegionId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const regions = useFetch<{ items: Region[] }>('/reference/regions');
  const qs = [
    from ? `from=${encodeURIComponent(from)}` : '',
    to ? `to=${encodeURIComponent(to)}` : '',
    regionId ? `regionId=${regionId}` : '',
  ].filter(Boolean).join('&');
  const { data, loading, error } = useFetch<InterviewsOverview>(`/reports/interviews${qs ? `?${qs}` : ''}`, [qs]);
  const totalSentiment = data ? data.summary.PositiveCount + data.summary.NeutralCount + data.summary.NegativeCount : 1;

  return (
    <div>
      <div className="filter-bar">
        <span className="filter-label">Filters</span>
        <div className="filter-sep" />
        <div className="filter-group">
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
          <span style={{ color: 'var(--text-muted)' }}><Icon name="arrow-right" /></span>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
        </div>
        <div className="filter-sep" />
        <select className="select" value={regionId} onChange={(e) => setRegionId(e.target.value)}>
          <option value="">All regions</option>
          {regions.data?.items.map((r) => <option key={r.RegionID} value={r.RegionID}>{r.RegionName}</option>)}
        </select>
        <Button variant="ghost" size="sm" onClick={() => { setFrom(''); setTo(''); setRegionId(''); }}><Icon name="xmark" /> Clear</Button>
      </div>
      {loading ? <Loading /> : error ? <div className="alert alert-error">{error}</div> : data ? (
        <>
          <div className="stat-grid" style={{ marginTop: 4 }}>
            <Card><div className="kpi-card kpi-teal"><div className="kpi-head"><div className="kpi-icon"><Icon name="comments" /></div><div className="kpi-label">Total Interviews</div></div><div className="kpi-body"><div className="kpi-value">{data.summary.Total}</div></div></div></Card>
            <Card><div className="kpi-card kpi-green"><div className="kpi-head"><div className="kpi-icon"><Icon name="face-smile" /></div><div className="kpi-label">Avg Satisfaction</div></div><div className="kpi-body"><div className="kpi-value">{data.summary.AvgSatisfaction != null ? data.summary.AvgSatisfaction.toFixed(1) : 'n/a'}<span className="value-unit">/5</span></div></div></div></Card>
            <Card><div className="kpi-card kpi-blue"><div className="kpi-head"><div className="kpi-icon"><Icon name="chart-pie" /></div><div className="kpi-label">Sentiment</div></div><div className="kpi-body"><div className="sentiment-row" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}><Badge tone="success">+{data.summary.PositiveCount}</Badge><Badge tone="neutral">{data.summary.NeutralCount}</Badge><Badge tone="danger">-{data.summary.NegativeCount}</Badge></div><div className="sentiment-bar" style={{ marginTop: 8 }}>{totalSentiment > 0 && <><div className="seg-pos" style={{ width: `${(data.summary.PositiveCount / totalSentiment) * 100}%` }} /><div className="seg-neu" style={{ width: `${(data.summary.NeutralCount / totalSentiment) * 100}%` }} /><div className="seg-neg" style={{ width: `${(data.summary.NegativeCount / totalSentiment) * 100}%` }} /></>}</div></div></div></Card>
          </div>
          <div className="dash-grid">
            <Card title="Interviews by region"><BarChart data={data.byRegion.map((r) => ({ label: r.RegionName ?? 'Unassigned', value: r.Total }))} /></Card>
            <Card title="Sentiment share"><Donut data={[{ label: 'Positive', value: data.summary.PositiveCount }, { label: 'Neutral', value: data.summary.NeutralCount }, { label: 'Negative', value: data.summary.NegativeCount }]} /></Card>
          </div>
        </>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Weekly Sales Report                                                        */
/* -------------------------------------------------------------------------- */
function WeeklySalesReport() {
  const [regionId, setRegionId] = useState('');
  const [businessGroupId, setBusinessGroupId] = useState('');
  const [colorId, setColorId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const regions = useFetch<{ items: Region[] }>('/reference/regions');
  const groups = useFetch<{ items: BusinessGroup[] }>('/reference/business-groups');
  const qs = [
    from ? `from=${encodeURIComponent(from)}` : '',
    to ? `to=${encodeURIComponent(to)}` : '',
    regionId ? `regionId=${encodeURIComponent(regionId)}` : '',
    businessGroupId ? `businessGroupId=${encodeURIComponent(businessGroupId)}` : '',
    colorId ? `colorId=${encodeURIComponent(colorId)}` : '',
  ].filter(Boolean).join('&');
  const { data, loading, error } = useFetch<WeeklySalesOverview>(`/reports/weekly-sales${qs ? `?${qs}` : ''}`, [qs]);

  return (
    <div>
      <div className="filter-bar">
        <span className="filter-label">Filters</span>
        <div className="filter-sep" />
        <div className="filter-group">
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
          <span style={{ color: 'var(--text-muted)' }}><Icon name="arrow-right" /></span>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
        </div>
        <div className="filter-sep" />
        <select className="select" value={regionId} onChange={(e) => setRegionId(e.target.value)}>
          <option value="">All regions</option>
          {regions.data?.items.map((r) => <option key={r.RegionID} value={r.RegionID}>{r.RegionName}</option>)}
        </select>
        <select className="select" value={businessGroupId} onChange={(e) => setBusinessGroupId(e.target.value)}>
          <option value="">All business groups</option>
          {groups.data?.items.map((g) => <option key={g.BusinessGroupID} value={g.BusinessGroupID}>{g.Name}</option>)}
        </select>
        <ColorFilterSelect value={colorId} onChange={setColorId} />
        <Button variant="ghost" size="sm" onClick={() => { setFrom(''); setTo(''); setRegionId(''); setBusinessGroupId(''); setColorId(''); }}><Icon name="xmark" /> Clear</Button>
      </div>
      {loading ? <Loading /> : error ? <div className="alert alert-error">{error}</div> : data ? (
        <>
          <div className="stat-grid" style={{ marginTop: 4 }}>
            <Card><div className="kpi-card kpi-blue"><div className="kpi-head"><div className="kpi-icon"><Icon name="calendar-check" /></div><div className="kpi-label">Weekly Entries</div></div><div className="kpi-body"><div className="kpi-value">{data.totals.RowCount.toLocaleString()}</div></div></div></Card>
            <Card><div className="kpi-card kpi-green"><div className="kpi-head"><div className="kpi-icon"><Icon name="boxes-stacked" /></div><div className="kpi-label">Total Quantity</div></div><div className="kpi-body"><div className="kpi-value">{data.totals.Quantity.toLocaleString()}</div></div></div></Card>
            <Card><div className="kpi-card kpi-amber"><div className="kpi-head"><div className="kpi-icon"><Icon name="banknote" /></div><div className="kpi-label">Total Revenue</div></div><div className="kpi-body"><div className="kpi-value">ETB {fmtMoney(data.totals.Revenue)}</div></div></div></Card>
          </div>
          <div className="dash-grid">
            <Card title="Revenue by region"><BarChart data={data.byRegion.map((r) => ({ label: r.RegionName ?? 'Unassigned', value: r.Revenue }))} /></Card>
            <Card title="Top products by revenue">
              {data.byProduct.length ? (
                <div className="table-wrap">
                  <table className="table table-enhanced">
                    <thead><tr><th>Product</th><th>Category</th><th style={{ textAlign: 'right' }}>Qty</th><th style={{ textAlign: 'right' }}>Revenue</th></tr></thead>
                    <tbody>
                      {data.byProduct.map((p, i) => (
                        <tr key={i}><td><b>{p.ProductName}</b></td><td><Badge tone="neutral">{p.Category}</Badge></td><td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{p.Quantity.toLocaleString()}</td><td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(p.Revenue)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <Empty icon="chart-column" message="No submitted weekly sales" />}
            </Card>
          </div>
          {data.byColor.length > 0 && (
            <Card title="Revenue by color" style={{ marginTop: 16 }}>
              <BarChart data={data.byColor.map((r) => ({ label: r.Color, value: r.Revenue }))} />
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Price Comparison Report                                                    */
/* -------------------------------------------------------------------------- */
function PriceComparisonReport() {
  const [regionId, setRegionId] = useState('');
  const [category, setCategory] = useState('');
  const [colorId, setColorId] = useState('');
  const regions = useFetch<{ items: Region[] }>('/reference/regions');
  const qs = [
    regionId ? `regionId=${encodeURIComponent(regionId)}` : '',
    category ? `category=${encodeURIComponent(category)}` : '',
    colorId ? `colorId=${encodeURIComponent(colorId)}` : '',
  ].filter(Boolean).join('&');
  const { data, loading, error } = useFetch<{ items: PriceComparisonRow[] }>(`/reports/price-comparison${qs ? `?${qs}` : ''}`, [qs]);

  return (
    <div>
      <div className="filter-bar">
        <span className="filter-label">Filters</span>
        <div className="filter-sep" />
        <select className="select" value={regionId} onChange={(e) => setRegionId(e.target.value)}>
          <option value="">All regions</option>
          {regions.data?.items.map((r) => <option key={r.RegionID} value={r.RegionID}>{r.RegionName}</option>)}
        </select>
        <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category filter" />
        <ColorFilterSelect value={colorId} onChange={setColorId} />
        <Button variant="ghost" size="sm" onClick={() => { setRegionId(''); setCategory(''); setColorId(''); }}><Icon name="xmark" /> Clear</Button>
      </div>
      {loading ? <Loading /> : error ? <div className="alert alert-error">{error}</div> : data?.items.length ? (
        <>
          <div className="stat-grid" style={{ marginTop: 4 }}>
            <Card><div className="kpi-card kpi-red"><div className="kpi-head"><div className="kpi-icon"><Icon name="tags" /></div><div className="kpi-label">Price Comparisons</div></div><div className="kpi-body"><div className="kpi-value">{data.items.length}</div><div className="kpi-sub">Active competitor price points</div></div></div></Card>
          </div>
          <Card style={{ marginTop: 16 }}>
            <div className="table-wrap">
              <table className="table table-enhanced">
                <thead><tr><th>Product</th><th>Colors</th><th>Competitor</th><th style={{ textAlign: 'right' }}>Competitor Price</th><th style={{ textAlign: 'right' }}>Own Price</th><th style={{ textAlign: 'right' }}>Gap</th><th>Region</th><th>Date</th></tr></thead>
                <tbody>
                  {data.items.map((r, i) => (
                    <tr key={i}>
                      <td><b>{r.ProductName}</b></td>
                      <td style={{ whiteSpace: 'nowrap' }}>{r.ProductColors ?? '—'}</td>
                      <td>{r.CompetitorName}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(r.CompetitorPrice)}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(r.OwnPrice)}</td>
                      <td style={{ textAlign: 'right' }}>{r.GapPercent != null ? <span className={Number(r.GapPercent) > 0 ? 'gap-positive' : Number(r.GapPercent) < 0 ? 'gap-negative' : 'gap-neutral'}>{fmtPct(r.GapPercent)}</span> : '—'}</td>
                      <td>{r.RegionName ?? 'Unassigned'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.RecordedDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : <Empty icon="tags" message="No price comparisons found" />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Competitor Intelligence Report                                             */
/* -------------------------------------------------------------------------- */
function CompetitorIntelReportTab() {
  const [regionId, setRegionId] = useState('');
  const [colorId, setColorId] = useState('');
  const regions = useFetch<{ items: Region[] }>('/reference/regions');
  const qs = [
    regionId ? `regionId=${encodeURIComponent(regionId)}` : '',
    colorId ? `colorId=${encodeURIComponent(colorId)}` : '',
  ].filter(Boolean).join('&');
  const { data, loading, error } = useFetch<CompetitorIntelReport>(`/reports/competitor-intel${qs ? `?${qs}` : ''}`, [qs]);

  return (
    <div>
      <div className="filter-bar">
        <span className="filter-label">Filters</span>
        <div className="filter-sep" />
        <select className="select" value={regionId} onChange={(e) => setRegionId(e.target.value)}>
          <option value="">All regions</option>
          {regions.data?.items.map((r) => <option key={r.RegionID} value={r.RegionID}>{r.RegionName}</option>)}
        </select>
        <ColorFilterSelect value={colorId} onChange={setColorId} />
        <Button variant="ghost" size="sm" onClick={() => { setRegionId(''); setColorId(''); }}><Icon name="xmark" /> Clear</Button>
      </div>
      {loading ? <Loading /> : error ? <div className="alert alert-error">{error}</div> : data ? (
        <>
          <div className="stat-grid" style={{ marginTop: 4 }}>
            <Card><div className="kpi-card kpi-red"><div className="kpi-head"><div className="kpi-icon"><Icon name="building" /></div><div className="kpi-label">Competitors Tracked</div></div><div className="kpi-body"><div className="kpi-value">{data.summary.CompetitorsTracked}</div></div></div></Card>
            <Card><div className="kpi-card kpi-blue"><div className="kpi-head"><div className="kpi-icon"><Icon name="clipboard-list" /></div><div className="kpi-label">Total Records</div></div><div className="kpi-body"><div className="kpi-value">{data.summary.TotalRecords}</div></div></div></Card>
            <Card><div className="kpi-card kpi-amber"><div className="kpi-head"><div className="kpi-icon"><Icon name="percent" /></div><div className="kpi-label">Avg Gap</div></div><div className="kpi-body"><div className="kpi-value">{fmtPct(data.summary.AvgGapPercent)}</div></div></div></Card>
          </div>
          {data.byCompetitor.length > 0 && (
            <Card title="By competitor" style={{ marginTop: 16 }}>
              <div className="table-wrap">
                <table className="table table-enhanced">
                  <thead><tr><th>Competitor</th><th style={{ textAlign: 'right' }}>Records</th><th style={{ textAlign: 'right' }}>Avg Price</th><th style={{ textAlign: 'right' }}>Avg Gap</th></tr></thead>
                  <tbody>
                    {data.byCompetitor.map((c, i) => (
                      <tr key={i}><td><b>{c.CompetitorName}</b></td><td style={{ textAlign: 'right' }}>{c.Records}</td><td style={{ textAlign: 'right' }}>ETB {fmtMoney(c.AvgPrice)}</td><td style={{ textAlign: 'right' }}>{fmtPct(c.AvgGap)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          {data.items.length > 0 && (
            <Card title="Recent intelligence" style={{ marginTop: 16 }}>
              <div className="table-wrap">
                <table className="table table-enhanced">
                  <thead><tr><th>Date</th><th>Competitor</th><th>Product</th><th>Colors</th><th style={{ textAlign: 'right' }}>Comp Price</th><th style={{ textAlign: 'right' }}>Own Price</th><th style={{ textAlign: 'right' }}>Gap</th><th>Region</th></tr></thead>
                  <tbody>
                    {data.items.slice(0, 50).map((r, i) => (
                      <tr key={i}>
                        <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.RecordedDate)}</td>
                        <td>{r.CompetitorName}</td>
                        <td><b>{r.ProductName}</b><div className="sub-text">{r.ProductCode}</div></td>
                        <td style={{ whiteSpace: 'nowrap' }}>{r.ProductColors ?? '—'}</td>
                        <td style={{ textAlign: 'right' }}>{fmtMoney(r.CompetitorPrice)}</td>
                        <td style={{ textAlign: 'right' }}>{r.OwnPrice != null ? fmtMoney(r.OwnPrice) : '—'}</td>
                        <td style={{ textAlign: 'right' }}>{r.GapPercent != null ? <span className={Number(r.GapPercent) > 0 ? 'gap-positive' : 'gap-negative'}>{fmtPct(r.GapPercent)}</span> : '—'}</td>
                        <td>{r.RegionName ?? 'Unassigned'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* KPI Performance Report                                                     */
/* -------------------------------------------------------------------------- */
function KpiPerformanceReportTab() {
  const [frequency, setFrequency] = useState('');
  const qs = frequency ? `frequency=${encodeURIComponent(frequency)}` : '';
  const { data, loading, error } = useFetch<KpiPerformanceReport>(`/reports/kpi-performance${qs ? `?${qs}` : ''}`, [qs]);
  const ratingColor = (r: string) => r === 'Excellent' ? 'success' : r === 'Good' ? 'info' : r === 'Average' ? 'warning' : 'danger';

  return (
    <div>
      <div className="filter-bar">
        <span className="filter-label">Filters</span>
        <div className="filter-sep" />
        <select className="select" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
          <option value="">All frequencies</option>
          <option value="Weekly">Weekly</option>
          <option value="Monthly">Monthly</option>
          <option value="Quarterly">Quarterly</option>
          <option value="Annual">Annual</option>
        </select>
        <Button variant="ghost" size="sm" onClick={() => setFrequency('')}><Icon name="xmark" /> Clear</Button>
      </div>
      {loading ? <Loading /> : error ? <div className="alert alert-error">{error}</div> : data ? (
        <>
          <div className="stat-grid" style={{ marginTop: 4 }}>
            <Card><div className="kpi-card kpi-purple"><div className="kpi-head"><div className="kpi-icon"><Icon name="users" /></div><div className="kpi-label">Officers with KPIs</div></div><div className="kpi-body"><div className="kpi-value">{data.summary.OfficersWithResults}</div></div></div></Card>
            <Card><div className="kpi-card kpi-green"><div className="kpi-head"><div className="kpi-icon"><Icon name="chart-line" /></div><div className="kpi-label">Avg Achievement</div></div><div className="kpi-body"><div className="kpi-value">{Number(data.summary.AvgAchievement).toFixed(1)}%</div></div></div></Card>
            <Card><div className="kpi-card kpi-blue"><div className="kpi-head"><div className="kpi-icon"><Icon name="star" /></div><div className="kpi-label">Total Weighted Score</div></div><div className="kpi-body"><div className="kpi-value">{Number(data.summary.TotalWeightedScore).toLocaleString()}</div></div></div></Card>
          </div>
          {data.byKpi.length > 0 && (
            <Card title="KPI Breakdown" style={{ marginTop: 16 }}>
              <div className="table-wrap">
                <table className="table table-enhanced">
                  <thead><tr><th>KPI</th><th>Category</th><th style={{ textAlign: 'right' }}>Weight</th><th style={{ textAlign: 'right' }}>Target</th><th style={{ textAlign: 'right' }}>Actual</th><th style={{ textAlign: 'right' }}>Achievement</th><th style={{ textAlign: 'right' }}>Officers</th></tr></thead>
                  <tbody>
                    {data.byKpi.map((k, i) => (
                      <tr key={i}>
                        <td><b>{k.KpiName}</b><div className="sub-text">{k.KpiCode}</div></td>
                        <td><Badge tone="neutral">{k.Category ?? '—'}</Badge></td>
                        <td style={{ textAlign: 'right' }}>{k.Weight}</td>
                        <td style={{ textAlign: 'right' }}>{Number(k.TotalTarget).toLocaleString()}</td>
                        <td style={{ textAlign: 'right' }}>{Number(k.TotalActual).toLocaleString()}</td>
                        <td style={{ textAlign: 'right' }}><Badge tone={ratingColor(k.AchievementPercent >= 85 ? 'Excellent' : k.AchievementPercent >= 70 ? 'Good' : k.AchievementPercent >= 50 ? 'Average' : 'Needs Attention')}>{k.AchievementPercent}%</Badge></td>
                        <td style={{ textAlign: 'right' }}>{k.OfficerCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          {data.byOfficer.length > 0 && (
            <Card title="Officer Ranking" style={{ marginTop: 16 }}>
              <div className="table-wrap">
                <table className="table table-enhanced">
                  <thead><tr><th>#</th><th>Officer</th><th>Region</th><th style={{ textAlign: 'right' }}>KPIs</th><th style={{ textAlign: 'right' }}>Avg Achievement</th><th style={{ textAlign: 'right' }}>Weighted Score</th><th>Rating</th></tr></thead>
                  <tbody>
                    {data.byOfficer.map((o) => (
                      <tr key={o.UserID}>
                        <td><span className={`rank-badge ${o.Rank <= 3 ? `rank-${o.Rank}` : 'rank-default'}`}>{o.Rank}</span></td>
                        <td><b>{o.UserName}</b></td>
                        <td>{o.RegionNames ?? '—'}</td>
                        <td style={{ textAlign: 'right' }}>{o.KpiCount}</td>
                        <td style={{ textAlign: 'right' }}>{Number(o.AvgAchievement).toFixed(1)}%</td>
                        <td style={{ textAlign: 'right' }}>{Number(o.TotalWeightedScore).toLocaleString()}</td>
                        <td><Badge tone={ratingColor(o.Rating)}>{o.Rating}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Forms Report (placeholder — data from /forms/answers)                       */
/* -------------------------------------------------------------------------- */
function FormsReportTab() {
  const [formId, setFormId] = useState('');
  const qs = formId ? `formId=${encodeURIComponent(formId)}` : '';
  const { data, loading, error } = useFetch<{ items: Array<{ ResponseID: number; SubmittedAt: string; FormTitle: string; FieldKey: string; ValueJSON: string }> }>(`/reports/forms/answers${qs ? `?${qs}` : ''}`, [qs]);

  return (
    <div>
      <div className="filter-bar">
        <span className="filter-label">Filters</span>
        <div className="filter-sep" />
        <input className="input" type="number" placeholder="Form ID" value={formId} onChange={(e) => setFormId(e.target.value)} style={{ width: 120 }} />
        <Button variant="ghost" size="sm" onClick={() => setFormId('')}><Icon name="xmark" /> Clear</Button>
      </div>
      {loading ? <Loading /> : error ? <div className="alert alert-error">{error}</div> : data?.items.length ? (
        <Card>
          <div className="table-wrap">
            <table className="table table-enhanced">
              <thead><tr><th>Response</th><th>Submitted</th><th>Form</th><th>Field</th><th>Value</th></tr></thead>
              <tbody>
                {data.items.slice(0, 100).map((r, i) => (
                  <tr key={i}>
                    <td>#{r.ResponseID}</td>
                    <td>{fmtDate(r.SubmittedAt)}</td>
                    <td><b>{r.FormTitle}</b></td>
                    <td>{r.FieldKey}</td>
                    <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.ValueJSON}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : <Empty icon="clipboard-list" message="No form responses found" />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Product Availability Report                                                */
/* -------------------------------------------------------------------------- */
function AvailabilityReportTab() {
  const { data, loading, error } = useFetch<{ items: Array<{ RegionName: string; OutletName: string; City: string; ProductsAvailable: number; TotalActiveProducts: number; AvailabilityRate: number }> }>('/reports/availability');

  return (
    <div>
      {loading ? <Loading /> : error ? <div className="alert alert-error">{error}</div> : data?.items.length ? (
        <>
          <div className="stat-grid" style={{ marginTop: 4 }}>
            <Card><div className="kpi-card kpi-indigo"><div className="kpi-head"><div className="kpi-icon"><Icon name="box-open" /></div><div className="kpi-label">Avg Availability</div></div><div className="kpi-body"><div className="kpi-value">{data.items.length > 0 ? (data.items.reduce((s, r) => s + r.AvailabilityRate, 0) / data.items.length).toFixed(1) : 0}%</div></div></div></Card>
            <Card><div className="kpi-card kpi-blue"><div className="kpi-head"><div className="kpi-icon"><Icon name="store" /></div><div className="kpi-label">Outlets Tracked</div></div><div className="kpi-body"><div className="kpi-value">{data.items.length}</div></div></div></Card>
          </div>
          <Card style={{ marginTop: 16 }}>
            <div className="table-wrap">
              <table className="table table-enhanced">
                <thead><tr><th>Region</th><th>Outlet</th><th>City</th><th style={{ textAlign: 'right' }}>Available</th><th style={{ textAlign: 'right' }}>Total</th><th style={{ textAlign: 'right' }}>Rate</th></tr></thead>
                <tbody>
                  {data.items.map((r, i) => (
                    <tr key={i}>
                      <td>{r.RegionName ?? 'Unassigned'}</td>
                      <td><b>{r.OutletName}</b></td>
                      <td>{r.City}</td>
                      <td style={{ textAlign: 'right' }}>{r.ProductsAvailable}</td>
                      <td style={{ textAlign: 'right' }}>{r.TotalActiveProducts}</td>
                      <td style={{ textAlign: 'right' }}><Badge tone={r.AvailabilityRate >= 80 ? 'success' : r.AvailabilityRate >= 60 ? 'warning' : 'danger'}>{r.AvailabilityRate.toFixed(1)}%</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : <Empty icon="box-open" message="No availability data found" />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Power BI Panel                                                             */
/* -------------------------------------------------------------------------- */
function PowerBiReportEmbed({ token, report }: { token: EmbedToken; report: PowerBiReport }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<any>(null);
  useEffect(() => {
    if (!containerRef.current || !token.token) return;
    let disposed = false;
    import('powerbi-client').then(({ service, factories }) => {
      if (disposed || !containerRef.current) return;
      const powerbiService = new service.Service(factories.hpmFactory, factories.wpmpFactory, factories.routerFactory);
      reportRef.current = powerbiService.embed(containerRef.current, { type: 'report' as const, tokenType: 0 as const, id: token.reportId, embedUrl: token.embedUrl || 'https://app.powerbi.com/reportEmbed', accessToken: token.token });
    });
    return () => { disposed = true; reportRef.current?.reset(); reportRef.current = null; };
  }, [token]);
  return <div ref={containerRef} style={{ minHeight: 500 }} />;
}

function PowerBiPanel() {
  const views = useFetch<{ items: PowerBiReport[] }>('/reports/powerbi/views');
  const [embed, setEmbed] = useState<{ token: EmbedToken; report: PowerBiReport } | null>(null);
  async function openEmbed(report: PowerBiReport) {
    try { const token = await api<EmbedToken>(`/reports/powerbi/embed/${report.reportId}`); setEmbed({ token, report }); } catch { toast.error('Failed to load Power BI report'); }
  }
  return (
    <div>
      {views.loading ? <Loading /> : views.error ? <div className="alert alert-error">{views.error}</div> : views.data?.items.length ? (
        <div className="card-grid">
          {views.data.items.map((r) => (
            <Card key={r.reportId} title={r.name}>
              <div className="hint">{r.description}</div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <Button size="sm" onClick={() => void openEmbed(r)}><Icon name="play" /> Open</Button>
                <a className="btn btn-ghost btn-sm" href={r.url} target="_blank" rel="noreferrer"><Icon name="arrow-up-right-from-square" /> External</a>
              </div>
            </Card>
          ))}
        </div>
      ) : <Empty icon="chart-column" message="No Power BI views assigned to your role" />}
      {embed ? (
        <Card title={`${embed.report.name}`} actions={<Button variant="ghost" size="sm" onClick={() => setEmbed(null)}>Close</Button>}>
          <div className="hint">{embed.token.expiresAt ? `Token expires ${fmtDate(embed.token.expiresAt)}` : ''}</div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, marginTop: 10, background: 'var(--surface-2)' }}>
            <PowerBiReportEmbed token={embed.token} report={embed.report} />
          </div>
        </Card>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main Page                                                                   */
/* -------------------------------------------------------------------------- */
function ReportsInner() {
  const [tab, setTab] = useState('insights');
  const [exportsOpen, setExportsOpen] = useState(false);
  const insights = useFetch<AiInsights>('/reports/ai-insights');

  const tabs = [
    { id: 'insights', label: 'AI Insights' },
    { id: 'ask', label: 'Ask AI' },
    { id: 'sales', label: 'Sales' },
    { id: 'customers', label: 'Customers' },
    { id: 'products', label: 'Products' },
    { id: 'market-visits', label: 'Market Visits' },
    { id: 'pricing', label: 'Price Comparison' },
    { id: 'competitor-intel', label: 'Competitor Intel' },
    { id: 'interviews', label: 'Interviews' },
    { id: 'weekly-sales', label: 'Weekly Sales' },
    { id: 'kpi', label: 'KPI Performance' },
    { id: 'forms', label: 'Forms' },
    { id: 'availability', label: 'Availability' },
    { id: 'powerbi', label: 'Power BI' },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Reports & Analytics</h1>
          <div className="sub">Cross-domain reporting — insights, sales, customers, products, KPIs, embedded dashboards.</div>
        </div>
        <div className="actions" style={{ position: 'relative' }}>
          <TourTrigger tourId="reports" label="Show me how" />
          <Button variant="ghost" onClick={() => setExportsOpen((v) => !v)}><Icon name="file-excel" /> Export Excel</Button>
          {exportsOpen ? (
            <div className="menu-popover">
              <div style={{ fontWeight: 600, padding: '4px 0 8px' }}>Download report</div>
              {EXPORT_KINDS.map((k) => (
                <button key={k.kind} className="menu-item" onClick={() => { setExportsOpen(false); void downloadExcel(k.kind, k.label); }}>
                  <Icon name={k.icon} /> {k.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      <div style={{ marginTop: 16 }}>
        {tab === 'insights' && (
          <Card title={`AI Insights${insights.data ? ` — ${new Date(insights.data.generatedAt).toLocaleString()}` : ''}`}>
            {insights.loading ? <Loading /> : insights.error ? <div className="alert alert-error">{insights.error}</div> : insights.data ? (
              <div>
                <div className="stat-grid">
                  <Card><div className="kpi-card kpi-green"><div className="kpi-head"><div className="kpi-icon"><Icon name="banknote" /></div><div className="kpi-label">Total Sales</div></div><div className="kpi-body"><div className="kpi-value">ETB {fmtMoney(insights.data.kpis.totalSales)}</div></div></div></Card>
                  <Card><div className="kpi-card kpi-blue"><div className="kpi-head"><div className="kpi-icon"><Icon name="cash-register" /></div><div className="kpi-label">Weekly Sales</div></div><div className="kpi-body"><div className="kpi-value">ETB {fmtMoney(insights.data.kpis.weeklySalesRevenue)}</div></div></div></Card>
                  <Card><div className="kpi-card kpi-red"><div className="kpi-head"><div className="kpi-icon"><Icon name="tag" /></div><div className="kpi-label">Active Price Gaps</div></div><div className="kpi-body"><div className="kpi-value">{insights.data.kpis.activePriceGaps}</div></div></div></Card>
                  <Card><div className="kpi-card kpi-amber"><div className="kpi-head"><div className="kpi-icon"><Icon name="location-dot" /></div><div className="kpi-label">Market Visits</div></div><div className="kpi-body"><div className="kpi-value">{insights.data.kpis.marketVisits}</div><div className="kpi-sub">{(insights.data.kpis.shopsVisited ?? 0).toLocaleString()} shops visited</div></div></div></Card>
                  <Card><div className="kpi-card kpi-teal"><div className="kpi-head"><div className="kpi-icon"><Icon name="comments" /></div><div className="kpi-label">Interviews</div></div><div className="kpi-body"><div className="kpi-value">{insights.data.kpis.totalInterviews}</div></div></div></Card>
                  <Card><div className="kpi-card kpi-purple"><div className="kpi-head"><div className="kpi-icon"><Icon name="face-smile" /></div><div className="kpi-label">Avg Satisfaction</div></div><div className="kpi-body"><div className="kpi-value">{insights.data.kpis.avgSatisfaction != null ? insights.data.kpis.avgSatisfaction.toFixed(1) : '—'}<span className="value-unit">/5</span></div></div></div></Card>
                  <Card><div className="kpi-card kpi-indigo"><div className="kpi-head"><div className="kpi-icon"><Icon name="box-open" /></div><div className="kpi-label">Availability</div></div><div className="kpi-body"><div className="kpi-value">{insights.data.kpis.availabilityRate != null ? fmtPct(insights.data.kpis.availabilityRate) : '—'}</div></div></div></Card>
                  <Card><div className="kpi-card kpi-blue"><div className="kpi-head"><div className="kpi-icon"><Icon name="clipboard-list" /></div><div className="kpi-label">Form Responses</div></div><div className="kpi-body"><div className="kpi-value">{insights.data.kpis.formResponses}</div></div></div></Card>
                </div>
                <div className="section-header" style={{ marginTop: 20 }}><h3>Generated Alerts</h3>{insights.data.generatedAlerts.length > 0 && <span className="section-count">{insights.data.generatedAlerts.length}</span>}</div>
                <AlertBadges alerts={insights.data.generatedAlerts} />
                <div className="section-header" style={{ marginTop: 20 }}><h3>Observations</h3></div>
                {insights.data.observations.length ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {insights.data.observations.map((o, i) => (
                      <div key={i} className="obs-item"><div className="obs-icon"><Icon name="lightbulb" /></div><div>{o}</div></div>
                    ))}
                  </div>
                ) : <Empty icon="lightbulb" message="No observations available" />}
              </div>
            ) : null}
          </Card>
        )}

        {tab === 'sales' && <SalesReport />}
        {tab === 'customers' && <CustomersReportTab />}
        {tab === 'products' && <ProductsReportTab />}
        {tab === 'market-visits' && <MarketVisitsReport />}
        {tab === 'pricing' && <PriceComparisonReport />}
        {tab === 'competitor-intel' && <CompetitorIntelReportTab />}
        {tab === 'interviews' && <InterviewsReport />}
        {tab === 'weekly-sales' && <WeeklySalesReport />}
        {tab === 'kpi' && <KpiPerformanceReportTab />}
        {tab === 'forms' && <FormsReportTab />}
        {tab === 'availability' && <AvailabilityReportTab />}
        {tab === 'powerbi' && <PowerBiPanel />}
        {tab === 'ask' && <AiDataAsk className="aiask-standalone" />}
      </div>
    </>
  );
}

function SalesReport() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [regionId, setRegionId] = useState('');
  const [colorId, setColorId] = useState('');
  const regions = useFetch<{ items: Region[] }>('/reference/regions');
  const qs = [
    from ? `from=${encodeURIComponent(from)}` : '',
    to ? `to=${encodeURIComponent(to)}` : '',
    regionId ? `regionId=${regionId}` : '',
    colorId ? `colorId=${encodeURIComponent(colorId)}` : '',
  ].filter(Boolean).join('&');
  const { data, loading, error } = useFetch<SalesOverview>(`/reports/sales${qs ? `?${qs}` : ''}`, [qs]);

  return (
    <div>
      <div className="filter-bar">
        <span className="filter-label">Filters</span>
        <div className="filter-sep" />
        <div className="filter-group">
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
          <span style={{ color: 'var(--text-muted)' }}><Icon name="arrow-right" /></span>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
        </div>
        <div className="filter-sep" />
        <select className="select" value={regionId} onChange={(e) => setRegionId(e.target.value)}>
          <option value="">All regions</option>
          {regions.data?.items.map((r) => <option key={r.RegionID} value={r.RegionID}>{r.RegionName}</option>)}
        </select>
        <ColorFilterSelect value={colorId} onChange={setColorId} />
        <Button variant="ghost" size="sm" onClick={() => { setFrom(''); setTo(''); setRegionId(''); setColorId(''); }}><Icon name="xmark" /> Clear</Button>
      </div>
      {loading ? <Loading /> : error ? <div className="alert alert-error">{error}</div> : data ? (
        <>
          <div className="stat-grid" style={{ marginTop: 4 }}>
            <Card><div className="kpi-card kpi-green"><div className="kpi-head"><div className="kpi-icon"><Icon name="banknote" /></div><div className="kpi-label">Total Sales</div></div><div className="kpi-body"><div className="kpi-value">ETB {fmtMoney(data.totals.TotalAmount)}</div><div className="kpi-sub">{data.totals.OrderCount.toLocaleString()} orders</div></div></div></Card>
            <Card><div className="kpi-card kpi-blue"><div className="kpi-head"><div className="kpi-icon"><Icon name="boxes-stacked" /></div><div className="kpi-label">Units Sold</div></div><div className="kpi-body"><div className="kpi-value">{data.totals.TotalQuantity.toLocaleString()}</div><div className="kpi-sub">{data.totals.ProductsSold} products</div></div></div></Card>
            <Card><div className="kpi-card kpi-indigo"><div className="kpi-head"><div className="kpi-icon"><Icon name="globe" /></div><div className="kpi-label">Regions Covered</div></div><div className="kpi-body"><div className="kpi-value">{data.totals.RegionsCovered}</div></div></div></Card>
          </div>
          <div className="dash-grid">
            <Card title="Sales by region"><BarChart data={data.byRegion.map((r) => ({ label: r.RegionName, value: r.Amount }))} /></Card>
            <Card title="Top products">
              {data.topProducts.length ? (
                <div className="table-wrap">
                  <table className="table table-enhanced">
                    <thead><tr><th>Product</th><th>Category</th><th>Color</th><th style={{ textAlign: 'right' }}>Qty</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                    <tbody>
                      {data.topProducts.map((p, i) => (
                        <tr key={i}><td><b>{p.ProductName}</b></td><td><Badge tone="neutral">{p.Category}</Badge></td><td>{p.Color || '—'}</td><td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{p.Quantity.toLocaleString()}</td><td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(p.Amount)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <Empty icon="chart-line" message="No sales data for the selected range" />}
            </Card>
          </div>
          {data.byColor.length > 0 && (
            <Card title="Sales by color" style={{ marginTop: 16 }}>
              <BarChart data={data.byColor.map((r) => ({ label: r.Color, value: r.Amount }))} />
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Guard>
      <ReportsInner />
    </Guard>
  );
}
