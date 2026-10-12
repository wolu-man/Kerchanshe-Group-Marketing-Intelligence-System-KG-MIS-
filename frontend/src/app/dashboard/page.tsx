'use client';

import Link from 'next/link';
import { Guard } from '@/components/Guard';
import { Card, Loading, Badge, Icon, Donut, BarChart } from '@/components/ui';
import { TourTrigger } from '@/components/tour/TourTrigger';
import { useAuth } from '@/lib/auth-context';
import { useFetch } from '@/lib/use-api';
import { fmtMoney, fmtDateTime, fmtDate } from '@/lib/format';
import type { AiInsights, NotificationRow, GeneratedAlert, CustomersReport, ProductsReport, KpiPerformanceReport, PredictiveSummary, PredictiveCard } from '@/lib/types';

const KPI_CONFIG = [
  { key: 'totalSales' as const, label: 'Total Sales', icon: 'chart-line', color: 'blue' as const, format: (k: AiInsights['kpis']) => `ETB ${fmtMoney(k.totalSales)}`, sub: 'Period total from D365FO' },
  { key: 'weeklySalesRevenue' as const, label: 'Weekly Sales', icon: 'cash-register', color: 'green' as const, format: (k: AiInsights['kpis']) => `ETB ${fmtMoney(k.weeklySalesRevenue)}`, sub: 'Field-reported revenue' },
  { key: 'totalCustomers' as const, label: 'Customers', icon: 'users', color: 'teal' as const, format: (k: AiInsights['kpis']) => String(k.totalCustomers ?? 0), sub: 'Active customer accounts' },
  { key: 'totalProducts' as const, label: 'Products', icon: 'box', color: 'indigo' as const, format: (k: AiInsights['kpis']) => String(k.totalProducts ?? 0), sub: 'Active product catalog' },
  { key: 'marketVisits' as const, label: 'Market Visits', icon: 'location-dot', color: 'amber' as const, format: (k: AiInsights['kpis']) => String(k.marketVisits ?? 0), sub: (k: AiInsights['kpis']) => `${(k.shopsVisited ?? 0).toLocaleString()} shops visited` },
  { key: 'totalInterviews' as const, label: 'Interviews', icon: 'comments', color: 'teal' as const, format: (k: AiInsights['kpis']) => String(k.totalInterviews ?? 0), sub: (k: AiInsights['kpis']) => `Avg satisfaction ${k.avgSatisfaction != null ? `${k.avgSatisfaction.toFixed(1)}/5` : '—'}` },
  { key: 'activePriceGaps' as const, label: 'Price Gaps', icon: 'tag', color: 'red' as const, format: (k: AiInsights['kpis']) => String(k.activePriceGaps ?? 0), sub: 'Competitor alerts above threshold' },
  { key: 'availabilityRate' as const, label: 'Availability', icon: 'box-open', color: 'purple' as const, format: (k: AiInsights['kpis']) => k.availabilityRate != null ? `${k.availabilityRate.toFixed(1)}%` : '—', sub: 'Products found in outlets' },
  { key: 'kpiAchievement' as const, label: 'KPI Achievement', icon: 'bullseye', color: 'green' as const, format: (k: AiInsights['kpis']) => k.kpiAchievement != null ? `${k.kpiAchievement.toFixed(1)}%` : '—', sub: (k: AiInsights['kpis']) => `${k.officerCount ?? 0} officers with KPIs` },
  { key: 'formResponses' as const, label: 'Form Responses', icon: 'clipboard-list', color: 'indigo' as const, format: (k: AiInsights['kpis']) => String(k.formResponses ?? 0), sub: 'Across all published forms' },
];

const ALERT_ICON: Record<string, string> = {
  high: 'triangle-exclamation',
  medium: 'circle-exclamation',
  low: 'circle-info',
};

const QUICK_LINKS = [
  { href: '/visits', label: 'Market Visits', icon: 'location-dot' },
  { href: '/interviews', label: 'Interviews', icon: 'comments' },
  { href: '/weekly-sales', label: 'Weekly Sales', icon: 'cash-register' },
  { href: '/pricing', label: 'Competitor Pricing', icon: 'money-bill-trend-up' },
  { href: '/admin/customers', label: 'Customers', icon: 'users' },
  { href: '/admin/products', label: 'Products', icon: 'box' },
  { href: '/admin/kpi', label: 'KPI & Performance', icon: 'bullseye' },
  { href: '/reports', label: 'Reports & Exports', icon: 'chart-column' },
  { href: '/forms', label: 'Forms & Surveys', icon: 'clipboard-list' },
  { href: '/notifications', label: 'Notifications', icon: 'bell' },
];

function SkeletonKpi() {
  return (
    <div className="skeleton-card">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <div className="skeleton skeleton-icon" />
        <div className="skeleton skeleton-line w-40" style={{ flex: 1, height: 12 }} />
      </div>
      <div className="skeleton skeleton-line h-28 w-60" />
      <div className="skeleton skeleton-line w-80" style={{ marginTop: 8, height: 10 }} />
    </div>
  );
}

function SkeletonChart() {
  return (
    <div className="skeleton-card">
      <div className="skeleton skeleton-line w-40" style={{ height: 14, marginBottom: 16 }} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'end' }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ width: 30, height: 40 + Math.random() * 60, borderRadius: 4 }} />
        ))}
      </div>
    </div>
  );
}

const CONFIDENCE_TONE: Record<PredictiveCard['confidence'], 'success' | 'info' | 'warning' | 'neutral'> = {
  High: 'success',
  Moderate: 'info',
  Low: 'warning',
  Insufficient: 'neutral',
};

function fmtMetric(card: PredictiveCard, value: number): string {
  if (card.unit === 'currency') return `ETB ${fmtMoney(value)}`;
  if (card.unit === 'percent') return `${value.toFixed(1)}%`;
  return fmtMoney(value);
}

/**
 * Forecast tiles. Roles without the AI capability get 403 from the summary
 * endpoint — that is expected, so the section simply stays hidden for them.
 */
function PredictiveSection() {
  const { data, error, loading } = useFetch<PredictiveSummary>('/ai/predictive/summary', []);

  if (loading) {
    return (
      <div className="grid-3 dash-chart-section">
        <SkeletonChart />
        <SkeletonChart />
        <SkeletonChart />
      </div>
    );
  }
  if (error || !data || data.cards.length === 0) return null;

  return (
    <div className="dash-section">
      <div className="page-head" style={{ marginBottom: 10 }}>
        <div>
          <h2 style={{ fontSize: 17 }}>Predictive insights</h2>
          <div className="sub">
            Deterministic forecasts from {fmtDateTime(data.generatedAt)} — estimates with stated confidence, not guarantees.
          </div>
        </div>
      </div>
      <div className="pred-grid">
        {data.cards.map((card) => (
          <Card key={`${card.module}:${card.metric}`}>
            <div className={`pred-card${card.sufficientData ? '' : ' pred-card-thin'}`}>
              <div className="pred-head">
                <div className="pred-label">{card.label}</div>
                <Badge tone={CONFIDENCE_TONE[card.confidence]}>{card.confidence}</Badge>
              </div>

              {card.sufficientData && card.next ? (
                <>
                  <div className="pred-value">
                    {fmtMetric(card, card.next.value)}
                    <span className="pred-period">next {card.next.period}</span>
                  </div>
                  <div className="pred-band">
                    range {fmtMetric(card, card.next.lower)} – {fmtMetric(card, card.next.upper)}
                  </div>
                </>
              ) : (
                <div className="pred-value pred-value-thin">
                  <i className="fa-solid fa-circle-info" /> {card.notice ?? 'Insufficient historical data for reliable prediction.'}
                </div>
              )}

              <div className="pred-foot">
                <span className={`kpi-trend ${card.changePct == null ? 'neutral' : card.changePct > 0 ? 'up' : card.changePct < 0 ? 'down' : 'neutral'}`}>
                  <i className={`fa-solid fa-arrow-${card.changePct == null ? 'right' : card.changePct >= 0 ? 'up' : 'down'}`} />
                  {card.changePct == null ? '—' : `${card.changePct >= 0 ? '+' : ''}${card.changePct.toFixed(1)}%`}
                </span>
                <span className="pred-meta">
                  {card.latest.period}: {fmtMetric(card, card.latest.value)}
                </span>
              </div>

              <div className="pred-meta pred-src">
                {card.model}
                {card.anomalies > 0 ? ` · ${card.anomalies} anomal${card.anomalies === 1 ? 'y' : 'ies'}` : ''}
                {card.signals.some((s) => s.kind === 'risk') ? ' · risk flagged' : ''}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function DashboardInner() {
  const { user } = useAuth();
  const insights = useFetch<AiInsights>('/reports/ai-insights', []);
  const notifs = useFetch<{ items: NotificationRow[] }>('/notifications/mine?page=1&pageSize=6', []);
  const customersData = useFetch<CustomersReport>('/reports/customers', []);
  const productsData = useFetch<ProductsReport>('/reports/products', []);
  const kpiData = useFetch<KpiPerformanceReport>('/reports/kpi-performance', []);

  const { data: insightsData, error: insightsError, loading: insightsLoading } = insights;
  const { data: notifsData, error: notifsError, loading: notifsLoading } = notifs;
  const { data: customersReport } = customersData;
  const { data: productsReport } = productsData;
  const { data: kpiReport } = kpiData;

  if (insightsLoading || notifsLoading) {
    return (
      <>
        <div className="page-head">
          <div>
            <h1>Dashboard</h1>
            <div className="sub">Welcome back... Here is the market intelligence snapshot.</div>
          </div>
        </div>
        <div className="stat-grid">
          {Array.from({ length: 10 }).map((_, i) => <SkeletonKpi key={i} />)}
        </div>
        <div className="grid-3">
          <SkeletonChart />
          <SkeletonChart />
          <SkeletonChart />
        </div>
        <div className="grid-2">
          <Card title="Generated alerts"><div style={{ padding: 20 }}>{Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: i < 2 ? '1px solid var(--border)' : 'none' }}>
              <div className="skeleton skeleton-icon" style={{ width: 32, height: 32, borderRadius: 8 }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton skeleton-line w-40" style={{ height: 12 }} />
                <div className="skeleton skeleton-line w-80" style={{ marginTop: 6, height: 10 }} />
              </div>
            </div>
          ))}</div></Card>
          <Card title="Recent notifications" actions={<Link href="/notifications" style={{ fontSize: 13 }}>View all</Link>}><div style={{ padding: 20 }}>{Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: i < 3 ? '1px solid var(--border)' : 'none' }}>
              <div className="skeleton" style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 6 }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton skeleton-line w-60" style={{ height: 12 }} />
                <div className="skeleton skeleton-line w-40" style={{ marginTop: 4, height: 10 }} />
              </div>
            </div>
          ))}</div></Card>
        </div>
        <Card title="Quick capture" style={{ marginTop: 16 }}>
          <div className="link-grid">
            {QUICK_LINKS.map((q) => (
              <Link key={q.href} href={q.href} className="link-tile">
                <i className={`fa-solid fa-${q.icon} tile-icon`} />
                <span>{q.label}</span>
              </Link>
            ))}
          </div>
        </Card>
      </>
    );
  }

  if (insightsError || notifsError) {
    return <div className="alert alert-error">{insightsError || notifsError}</div>;
  }

  if (!insightsData) {
    return <Loading />;
  }

  const alerts: GeneratedAlert[] = insightsData?.generatedAlerts ?? [];

  const customerTypeData = customersReport?.byType?.map((t) => ({ label: t.CustomerTypeName ?? 'Unknown', value: t.Count })) ?? [];
  const productCategoryData = productsReport?.byCategory?.map((c) => ({ label: c.Category ?? 'Unknown', value: c.Count })) ?? [];
  const productColorData = productsReport?.byColor?.map((c) => ({ label: c.Color ?? 'Unknown', value: c.Count })) ?? [];
  const topOfficers = kpiReport?.byOfficer?.slice(0, 5) ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <div className="sub">Welcome back, {user?.name}. Here is the market intelligence snapshot.</div>
          </div>
          <div className="actions">
            <TourTrigger tourId="dashboard" />
          </div>
        </div>

      <div className="stat-grid">
        {KPI_CONFIG.map((kpi) => (
          <Card key={kpi.key}>
            <div className={`kpi-card kpi-${kpi.color}`}>
              <div className="kpi-head">
                <div className="kpi-icon">
                  <Icon name={kpi.icon} />
                </div>
                <div className="kpi-label">{kpi.label}</div>
              </div>
              <div className="kpi-body">
                <div className="kpi-value">{kpi.format(insightsData.kpis)}</div>
                <div className="kpi-sub">{typeof kpi.sub === 'function' ? kpi.sub(insightsData.kpis) : kpi.sub}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <PredictiveSection />

      <div className="grid-3 dash-chart-section">
        <Card title="Customers by Type">
          {customerTypeData.length > 0 ? (
            <Donut data={customerTypeData} />
          ) : (
            <div className="empty"><div className="icon"><Icon name="users" /></div><div>No customer data yet</div></div>
          )}
        </Card>

        <Card title="Products by Category">
          {productCategoryData.length > 0 ? (
            <BarChart data={productCategoryData.slice(0, 8)} color="var(--primary)" />
          ) : (
            <div className="empty"><div className="icon"><Icon name="box" /></div><div>No product data yet</div></div>
          )}
        </Card>

        <Card title="Top Officers" actions={<Link href="/admin/kpi" style={{ fontSize: 13 }}>View all</Link>}>
          {topOfficers.length > 0 ? (
            <table className="officer-rank-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Officer</th>
                  <th>Achievement</th>
                  <th>Rating</th>
                </tr>
              </thead>
              <tbody>
                {topOfficers.map((o) => (
                  <tr key={o.UserID}>
                    <td><span className="rank-badge">{o.Rank}</span></td>
                    <td>{o.UserName}</td>
                    <td>{o.AvgAchievement.toFixed(1)}%</td>
                    <td><Badge tone={o.Rating === 'Excellent' ? 'success' : o.Rating === 'Good' ? 'info' : o.Rating === 'Average' ? 'warning' : 'danger'}>{o.Rating}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty"><div className="icon"><Icon name="trophy" /></div><div>No KPI data yet</div></div>
          )}
        </Card>
      </div>

      {productColorData.length > 0 && (
        <Card title="Products by Color" style={{ marginTop: 16 }}>
          <BarChart data={productColorData} color="var(--primary)" />
        </Card>
      )}

      <div className="grid-2" style={{ marginTop: 16 }}>
        <Card title={`Generated alerts ${alerts.length > 0 ? `(${alerts.length})` : ''}`}>
          {alerts.length ? (
            <div>
              {alerts.map((a, i) => (
                <div key={i} className={`alert-item alert-${a.severity}`}>
                  <div className="alert-icon">
                    <Icon name={ALERT_ICON[a.severity] ?? 'circle-info'} />
                  </div>
                  <div className="alert-content">
                    <div className="alert-type">{a.type.replace(/([A-Z])/g, ' $1')}</div>
                    <div className="alert-msg">{a.message}</div>
                  </div>
                  <Badge tone={({ high: 'danger', medium: 'warning', low: 'info' })[a.severity] ?? 'info'}>{a.severity}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">
              <div className="icon"><Icon name="shield-check" /></div>
              <div>No alerts — all KPIs look healthy</div>
            </div>
          )}
        </Card>

        <Card
          title="Recent notifications"
          actions={<Link href="/notifications" style={{ fontSize: 13 }}>View all</Link>}
        >
          {notifsLoading ? (
            <Loading />
          ) : notifsData?.items.length ? (
            <div>
              {notifsData.items.map((n) => (
                <div key={n.NotificationID} className="notif-item">
                  <div className={`notif-dot ${n.Status === 'Sent' ? 'sent' : n.Status === 'Failed' ? 'failed' : 'pending'}`} />
                  <div className="notif-body">
                    <div className="notif-subject">{n.Subject ?? n.TriggerEvent}</div>
                    <div className="notif-meta">
                      <span>{fmtDateTime(n.CreatedAt)}</span>
                      <span className="notif-channel">
                        <Icon name={n.Channel === 'Email' ? 'envelope' : n.Channel === 'SMS' ? 'comment-sms' : n.Channel === 'WhatsApp' ? 'whatsapp' : 'bell'} /> {n.Channel}
                      </span>
                    </div>
                  </div>
                  <Badge tone={n.Status === 'Sent' ? 'success' : n.Status === 'Failed' ? 'danger' : 'neutral'}>{n.Status}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">
              <div className="icon"><Icon name="bell-slash" /></div>
              <div>No notifications yet</div>
            </div>
          )}
        </Card>
      </div>

      <Card title="Quick capture" style={{ marginTop: 16 }}>
        <div className="link-grid">
          {QUICK_LINKS.map((q) => (
            <Link key={q.href} href={q.href} className="link-tile">
              <i className={`fa-solid fa-${q.icon} tile-icon`} />
              <span>{q.label}</span>
            </Link>
          ))}
        </div>
      </Card>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <Card title="Insights & Observations">
          {insightsData?.observations.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {insightsData.observations.map((o, i) => (
                <div key={i} className="obs-item">
                  <div className="obs-icon"><Icon name="lightbulb" /></div>
                  <div>{o}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">
              <div className="icon"><Icon name="lightbulb" /></div>
              <div>No observations available yet</div>
            </div>
          )}
        </Card>

        <Card title="Quick actions">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Link href="/visits" className="obs-item" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="obs-icon" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name="location-dot" /></div>
              <div><b>Log a market visit</b><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Record your field visit observations</div></div>
            </Link>
            <Link href="/interviews" className="obs-item" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="obs-icon" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}><Icon name="comments" /></div>
              <div><b>Conduct an interview</b><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Capture customer feedback and satisfaction</div></div>
            </Link>
            <Link href="/weekly-sales" className="obs-item" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="obs-icon" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}><Icon name="cash-register" /></div>
              <div><b>Submit weekly sales</b><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Report this week&apos;s sales figures</div></div>
            </Link>
            <Link href="/admin/kpi" className="obs-item" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="obs-icon" style={{ background: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed' }}><Icon name="bullseye" /></div>
              <div><b>View KPI performance</b><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Check officer achievement and rankings</div></div>
            </Link>
          </div>
        </Card>
      </div>
    </>
  );
}

export default function DashboardPage() {
  return (
    <Guard>
      <DashboardInner />
    </Guard>
  );
}
