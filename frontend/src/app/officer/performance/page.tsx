'use client';

import { useState, useMemo } from 'react';
import { Guard } from '@/components/Guard';
import { Card, Badge, Button, Tabs, Icon, BarChart, Loading, Empty } from '@/components/ui';
import { TourTrigger } from '@/components/tour/TourTrigger';
import { useAuth } from '@/lib/auth-context';
import { useFetch } from '@/lib/use-api';
import { fmtDate } from '@/lib/format';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */
function scoreClass(s: number) {
  if (s >= 85) return 'excellent';
  if (s >= 70) return 'good';
  if (s >= 50) return 'average';
  return 'needs-attention';
}

function statusTone(s: string): 'success' | 'danger' | 'warning' | 'info' | 'neutral' {
  if (s === 'Completed' || s === 'Approved' || 'Reviewed' === s || s === 'Validated') return 'success';
  if (s === 'In Progress' || s === 'Ongoing' || s === 'Submitted') return 'info';
  if (s === 'Under Review') return 'warning';
  if (s === 'Delayed' || s === 'Rejected' || s === 'Needs Attention') return 'danger';
  return 'neutral';
}

function freqTone(f: string): 'primary' | 'accent' | 'info' | 'success' {
  if (f === 'Annual') return 'primary';
  if (f === 'Quarterly') return 'accent';
  if (f === 'Monthly') return 'info';
  return 'success';
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase();
}

const AVATAR_COLORS = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
function monthsAgo(n: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

/* -------------------------------------------------------------------------- */
/* Shared Components                                                           */
/* -------------------------------------------------------------------------- */
function MetricCard({ icon, label, value, sub, color }: { icon: string; label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="kpi-oc">
      <div className={`kpi-oc-icon ${color}`}><Icon name={icon} /></div>
      <div className="kpi-oc-body">
        <div className="kpi-oc-label">{label}</div>
        <div className="kpi-oc-value">{value}</div>
        {sub && <div className="kpi-oc-sub">{sub}</div>}
      </div>
    </div>
  );
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="score-breakdown-row">
      <span className="sb-label">{label}</span>
      <div className="sb-bar">
        <div className="score-bar">
          <div className={`score-bar-fill ${scoreClass(score)}`} style={{ width: `${score}%` }} />
        </div>
      </div>
      <span className="sb-value" style={{ color: score >= 70 ? 'var(--success)' : score >= 50 ? 'var(--warning)' : 'var(--danger)' }}>
        {score}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* My Performance Tab                                                          */
/* -------------------------------------------------------------------------- */
function MyPerformanceTab({ data, loading, error }: { data: any; loading: boolean; error: string | null }) {
  if (loading) return <Loading />;
  if (error) return <div className="empty" style={{ color: 'var(--danger)' }}>{error}</div>;
  if (!data) return <Empty />;

  return (
    <div>
      <div className="grid-2">
        <Card title="Score Breakdown">
          <div className="score-ring-section">
            <div className={`score-ring ${scoreClass(data.overallScore)}`}>
              <span className="score-ring-value">{data.overallScore}</span>
              <span className="score-ring-label">Overall</span>
            </div>
          </div>
          <div className="score-breakdown">
            <ScoreBar label="Productivity" score={data.productivityScore} />
            <ScoreBar label="Completion" score={data.completionScore} />
            <ScoreBar label="Quality" score={data.qualityScore} />
            <ScoreBar label="Timeliness" score={data.timelinessScore} />
          </div>
        </Card>

        <Card title="Activity Summary">
          <div className="activity-summary-grid">
            <div className="as-item"><span className="as-val">{data.totalActivities}</span><span className="as-lbl">Total</span></div>
            <div className="as-item"><span className="as-val">{data.completed}</span><span className="as-lbl">Completed</span></div>
            <div className="as-item"><span className="as-val">{data.pending}</span><span className="as-lbl">Pending</span></div>
            <div className="as-item"><span className="as-val">{data.rejected}</span><span className="as-lbl">Rejected</span></div>
          </div>

          <div className="module-mini-grid" style={{ marginTop: 16 }}>
            <div className="module-mini-card">
              <div className="mmc-icon blue"><Icon name="location-dot" /></div>
              <div className="mmc-info"><div className="mmc-label">Visits</div><div className="mmc-value">{data.visits}</div><div className="mmc-sub">{(data.shopsVisited ?? 0).toLocaleString()} shops visited</div></div>
            </div>
            <div className="module-mini-card">
              <div className="mmc-icon green"><Icon name="comments" /></div>
              <div className="mmc-info"><div className="mmc-label">Interviews</div><div className="mmc-value">{data.interviews}</div></div>
            </div>
            <div className="module-mini-card">
              <div className="mmc-icon teal"><Icon name="cash-register" /></div>
              <div className="mmc-info"><div className="mmc-label">Weekly Sales</div><div className="mmc-value">{data.weeklySales}</div></div>
            </div>
            <div className="module-mini-card">
              <div className="mmc-icon amber"><Icon name="money-bill-trend-up" /></div>
              <div className="mmc-info"><div className="mmc-label">Pricing</div><div className="mmc-value">{data.pricing}</div></div>
            </div>
            <div className="module-mini-card">
              <div className="mmc-icon purple"><Icon name="clipboard-list" /></div>
              <div className="mmc-info"><div className="mmc-label">Forms</div><div className="mmc-value">{data.forms}</div></div>
            </div>
            <div className="module-mini-card">
              <div className="mmc-icon red"><Icon name="photo-film" /></div>
              <div className="mmc-info"><div className="mmc-label">Multimedia</div><div className="mmc-value">{data.multimedia}</div></div>
            </div>
          </div>
        </Card>
      </div>

      {data.monthlyTrend && data.monthlyTrend.length > 0 && (
        <Card title="Monthly Activity Trend" style={{ marginTop: 16 }}>
          <BarChart
            data={data.monthlyTrend.map((t: any) => ({ label: t.month, value: t.activities }))}
            color="var(--primary)"
          />
        </Card>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* My Plans Tab                                                                */
/* -------------------------------------------------------------------------- */
function MyPlansTab({ data, loading, error }: { data: any; loading: boolean; error: string | null }) {
  if (loading) return <Loading />;
  if (error) return <div className="empty" style={{ color: 'var(--danger)' }}>{error}</div>;
  if (!data || data.length === 0) return <Empty message="No plans assigned to you yet" />;

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Plan</th>
          <th>Frequency</th>
          <th>Period</th>
          <th>Status</th>
          <th>Approval</th>
          <th>Progress</th>
        </tr>
      </thead>
      <tbody>
        {data.map((plan: any) => (
          <tr key={plan.PlanID}>
            <td>
              <div className="plan-title-cell">
                <strong>{plan.Title}</strong>
                {plan.MainFocus && <span className="sub-text">{plan.MainFocus}</span>}
              </div>
            </td>
            <td><Badge tone={freqTone(plan.Frequency)}>{plan.Frequency}</Badge></td>
            <td className="date-cell">{fmtDate(plan.PeriodStart)} – {fmtDate(plan.PeriodEnd)}</td>
            <td><Badge tone={statusTone(plan.Status)}>{plan.Status}</Badge></td>
            <td><Badge tone={statusTone(plan.ApprovalStatus)}>{plan.ApprovalStatus}</Badge></td>
            <td>
              <div className="progress-cell">
                <div className="score-bar" style={{ width: 60 }}>
                  <div className={`score-bar-fill ${scoreClass(plan.progressPercent)}`} style={{ width: `${plan.progressPercent}%` }} />
                </div>
                <span className="sub-text">{plan.completedActivities}/{plan.activityCount}</span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* -------------------------------------------------------------------------- */
/* My Results Tab                                                              */
/* -------------------------------------------------------------------------- */
function MyResultsTab({ data, loading, error }: { data: any; loading: boolean; error: string | null }) {
  if (loading) return <Loading />;
  if (error) return <div className="empty" style={{ color: 'var(--danger)' }}>{error}</div>;
  if (!data || data.length === 0) return <Empty message="No KPI results recorded yet" />;

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>KPI</th>
          <th>Category</th>
          <th>Period</th>
          <th>Target</th>
          <th>Actual</th>
          <th>Achievement</th>
          <th>Score</th>
          <th>Rating</th>
        </tr>
      </thead>
      <tbody>
        {data.map((r: any) => (
          <tr key={r.KpiResultID}>
            <td>
              <div className="plan-title-cell">
                <strong>{r.KpiName}</strong>
                <span className="sub-text">{r.KpiCode}</span>
              </div>
            </td>
            <td>{r.Category ?? '—'}</td>
            <td className="date-cell">{fmtDate(r.PeriodStart)} – {fmtDate(r.PeriodEnd)}</td>
            <td>{r.TargetValue ?? '—'}</td>
            <td>{r.ActualValue ?? '—'}</td>
            <td>{r.AchievementPercent != null ? `${r.AchievementPercent}%` : '—'}</td>
            <td>{r.WeightedScore ?? '—'}</td>
            <td><Badge tone={statusTone(r.Rating ?? '')}>{r.Rating ?? '—'}</Badge></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* -------------------------------------------------------------------------- */
/* Activity Log Tab                                                            */
/* -------------------------------------------------------------------------- */
function ActivityLogTab({ data, loading, error }: { data: any; loading: boolean; error: string | null }) {
  if (loading) return <Loading />;
  if (error) return <div className="empty" style={{ color: 'var(--danger)' }}>{error}</div>;
  if (!data || data.length === 0) return <Empty message="No activity recorded yet" />;

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Module</th>
          <th>Date</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {data.map((a: any, i: number) => (
          <tr key={i}>
            <td>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name={
                  a.module === 'Market Visit' ? 'location-dot' :
                  a.module === 'Interview' ? 'comments' :
                  a.module === 'Weekly Sales' ? 'cash-register' :
                  a.module === 'Multimedia' ? 'photo-film' :
                  'money-bill-trend-up'
                } />
                {a.module}
              </div>
            </td>
            <td>{a.date}</td>
            <td><Badge tone={statusTone(a.status)}>{a.status}</Badge></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* -------------------------------------------------------------------------- */
/* Main Page                                                                   */
/* -------------------------------------------------------------------------- */
function OfficerPerformancePage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('performance');
  const [dateFrom, setDateFrom] = useState(monthsAgo(6));
  const [dateTo, setDateTo] = useState(today());

  const qs = `?from=${dateFrom}&to=${dateTo}`;
  const me = useFetch<any>(`/officer/performance/me${qs}`, [dateFrom, dateTo]);
  const summary = useFetch<any>(`/officer/performance/summary${qs}`, [dateFrom, dateTo]);
  const trends = useFetch<any>(`/officer/performance/trends${qs}`, [dateFrom, dateTo]);
  const results = useFetch<any>('/officer/performance/results', []);
  const plans = useFetch<any>('/officer/performance/plans', []);
  const activity = useFetch<any>(`/officer/performance/activity${qs}`, [dateFrom, dateTo]);

  const tabs = [
    { id: 'performance', label: 'My Performance' },
    { id: 'plans', label: 'My Plans', badge: plans.data?.items?.length },
    { id: 'results', label: 'My Results', badge: results.data?.items?.length },
    { id: 'activity', label: 'Activity Log', badge: activity.data?.items?.length },
  ];

  function resetDates() {
    setDateFrom(monthsAgo(6));
    setDateTo(today());
  }

  return (
    <Guard>
      <div className="content">
        <div className="kpi-hero">
          <div className="kpi-hero-icon"><Icon name="user" /></div>
            <div className="kpi-hero-info">
              <h2>My Performance</h2>
              <p>View your personal KPI performance, plans, and activity history</p>
              <TourTrigger tourId="officer-performance" />
            </div>
          <div className="kpi-hero-stats">
            <div className="kpi-hero-stat">
              <div className="lhs">{me.data?.overallScore ?? '—'}</div>
              <div className="lbl">Score</div>
            </div>
            <div className="kpi-hero-stat">
              <div className="lhs">{summary.data?.totalActivities ?? '—'}</div>
              <div className="lbl">Activities</div>
            </div>
            <div className="kpi-hero-stat">
              <div className="lhs">{summary.data?.completionRate ?? '—'}%</div>
              <div className="lbl">Completion</div>
            </div>
          </div>
        </div>

        <div className="kpi-filters">
          <div className="filter-group">
            <Icon name="calendar" />
            <label>From:</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="filter-group">
            <label>To:</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="spacer" />
          <Button variant="ghost" size="sm" onClick={resetDates}><Icon name="rotate-left" /> Reset</Button>
        </div>

        <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

        <div style={{ marginTop: 16 }}>
          {activeTab === 'performance' && (
            <MyPerformanceTab data={me.data} loading={me.loading} error={me.error} />
          )}
          {activeTab === 'plans' && (
            <MyPlansTab data={plans.data?.items} loading={plans.loading} error={plans.error} />
          )}
          {activeTab === 'results' && (
            <MyResultsTab data={results.data?.items} loading={results.loading} error={results.error} />
          )}
          {activeTab === 'activity' && (
            <ActivityLogTab data={activity.data?.items} loading={activity.loading} error={activity.error} />
          )}
        </div>
      </div>
    </Guard>
  );
}

export default OfficerPerformancePage;
