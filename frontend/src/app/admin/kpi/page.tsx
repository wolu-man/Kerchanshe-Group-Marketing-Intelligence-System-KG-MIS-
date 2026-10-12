'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Guard, RequireRole } from '@/components/Guard';
import { Button, Card, Badge, Modal, Tabs, Icon, BarChart, Donut, Loading, Empty, Pagination } from '@/components/ui';
import { TourTrigger } from '@/components/tour/TourTrigger';
import { useFetch } from '@/lib/use-api';
import { api, ApiError, qs } from '@/lib/api';
import { toast } from '@/components/Toast';
import type {
  KpiSummary, OfficerKpi, OfficerDetail, KpiTrend,
  Plan, PlanActivity, KpiDefinition, KpiResult,
  OfficerKpiScore, PlannedVsAchieved, PlanningSummary,
  MeasurementRow, VerificationRow, KpiImportStats,
} from '@/lib/types';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */
function scoreClass(s: number) {
  if (s >= 85) return 'excellent';
  if (s >= 70) return 'good';
  if (s >= 50) return 'average';
  return 'needs-attention';
}

function statusTone(s: string): 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'primary' {
  if (s === 'Completed' || s === 'Approved' || s === 'Reviewed') return 'success';
  if (s === 'In Progress' || s === 'Ongoing') return 'info';
  if (s === 'Under Review' || s === 'Submitted') return 'warning';
  if (s === 'Delayed' || s === 'Rejected' || s === 'Needs Attention') return 'danger';
  if (s === 'Planned' || s === 'Draft' || s === 'Not Started') return 'neutral';
  return 'neutral';
}

function priorityTone(p: string): 'success' | 'danger' | 'warning' | 'info' | 'neutral' {
  if (p === 'Critical') return 'danger';
  if (p === 'High') return 'warning';
  if (p === 'Medium') return 'info';
  return 'success';
}

function freqTone(f: string): 'primary' | 'accent' | 'info' | 'success' {
  if (f === 'Annual') return 'primary';
  if (f === 'Quarterly') return 'accent';
  if (f === 'Monthly') return 'info';
  return 'success';
}

function perfTone(c: string): 'success' | 'danger' | 'warning' | 'info' | 'neutral' {
  if (c === 'Excellent') return 'success';
  if (c === 'Good') return 'info';
  if (c === 'Average') return 'warning';
  return 'danger';
}

const AVATAR_COLORS = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
function monthsAgo(n: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtDateShort(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}

function rankBadgeClass(r: number) {
  if (r === 1) return 'rank-1';
  if (r === 2) return 'rank-2';
  if (r === 3) return 'rank-3';
  return 'rank-default';
}

/* -------------------------------------------------------------------------- */
/* Shared small components                                                     */
/* -------------------------------------------------------------------------- */
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

function AchievementBar({ target, actual, label }: { target: number; actual: number; label?: string }) {
  const pct = target > 0 ? Math.round((actual / target) * 100) : 0;
  return (
    <div className="achieve-bar-wrap">
      {label && <span className="achieve-label">{label}</span>}
      <div className="achieve-bar">
        <div className={`achieve-fill ${scoreClass(pct)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
        <div className="achieve-target-line" style={{ left: '100%' }} />
      </div>
      <span className="achieve-pct">{pct}%</span>
    </div>
  );
}

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

/* -------------------------------------------------------------------------- */
/* Status Quick Toggle                                                         */
/* -------------------------------------------------------------------------- */
const ALL_STATUSES = ['Not Started', 'In Progress', 'Under Review', 'Completed', 'Delayed', 'Ongoing', 'Planned'];
function StatusToggle({ current, onToggle }: { current: string; onToggle: (s: string) => void }) {
  return (
    <div className="status-toggle">
      {ALL_STATUSES.map((s) => (
        <button
          key={s}
          className={`status-toggle-btn ${current === s ? 'active' : ''} tone-${statusTone(s)}`}
          onClick={() => onToggle(s)}
          title={s}
        >
          {s === 'Completed' && <Icon name="check" />}
          {s === 'In Progress' && <Icon name="spinner" />}
          {s === 'Delayed' && <Icon name="clock" />}
          {s === 'Not Started' && <Icon name="circle" />}
          {s === 'Under Review' && <Icon name="eye" />}
          {s === 'Ongoing' && <Icon name="rotate" />}
          {s === 'Planned' && <Icon name="calendar" />}
          <span>{s}</span>
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Dashboard Tab                                                               */
/* -------------------------------------------------------------------------- */
function DashboardTab({
  summary, planningSummary, pva, trends, loading, error,
}: {
  summary: KpiSummary | null;
  planningSummary: PlanningSummary | null;
  pva: PlannedVsAchieved[];
  trends: KpiTrend[];
  loading: boolean;
  error: string | null;
}) {
  if (loading) return <Loading />;
  if (error) return <div className="empty" style={{ color: 'var(--danger)' }}>{error}</div>;

  const planStatusData = planningSummary ? [
    { label: 'Completed', value: planningSummary.completedPlans },
    { label: 'Active', value: planningSummary.activePlans },
    { label: 'Delayed', value: planningSummary.delayedPlans },
  ] : [];

  const trendData = trends.map((t) => ({
    label: t.period,
    value: t.totalActivities,
  }));

  return (
    <div>
      <div className="kpi-overview-grid">
        <MetricCard icon="clipboard-list" label="Active Plans" value={planningSummary?.activePlans ?? '—'} sub={`${planningSummary?.delayedPlans ?? 0} delayed`} color="blue" />
        <MetricCard icon="check-circle" label="Completed Activities" value={planningSummary?.completedActivities ?? '—'} sub={`of ${planningSummary?.totalActivities ?? 0} total`} color="green" />
        <MetricCard icon="clock" label="Overdue Activities" value={planningSummary?.overdueActivities ?? '—'} sub="need attention" color="amber" />
        <MetricCard icon="chart-bar" label="Active Officers" value={summary?.activeOfficers ?? '—'} sub={`${summary?.completionRate ?? 0}% completion`} color="purple" />
        <MetricCard icon="trophy" label="Top Performer" value={summary?.topPerformer?.name ?? '—'} sub={summary?.topPerformer ? `Score: ${summary.topPerformer.score}` : 'No data'} color="teal" />
        <MetricCard icon="exclamation-triangle" label="Needs Attention" value={summary?.needsAttention ?? '—'} sub="Officers below threshold" color="red" />
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <Card title="Activity Trends">
          {trendData.length > 0 ? (
            <BarChart data={trendData} color="var(--primary)" />
          ) : (
            <div className="empty"><div className="icon"><Icon name="chart-line" /></div><div>No trend data yet</div></div>
          )}
        </Card>

        <Card title="Plan Status">
          {planStatusData.some((d) => d.value > 0) ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
              <Donut data={planStatusData} />
            </div>
          ) : (
            <div className="empty"><div className="icon"><Icon name="clipboard-list" /></div><div>No plans yet</div></div>
          )}
        </Card>
      </div>

      {/* Planned vs Achieved */}
      {pva.length > 0 && (
        <Card title="Planned vs Achieved" style={{ marginTop: 16 }}>
          <div className="pva-grid">
            {pva.map((item) => (
              <div key={item.kpiCode} className="pva-item">
                <div className="pva-header">
                  <span className="pva-name">{item.kpiName}</span>
                  <Badge tone={perfTone(item.status)}>{item.status}</Badge>
                </div>
                <AchievementBar target={item.totalTarget} actual={item.totalActual} />
                <div className="pva-detail">
                  Target: {item.totalTarget} · Actual: {item.totalActual} · {item.officerCount} officers
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Upcoming Deadlines */}
      {planningSummary && planningSummary.upcomingDeadlines.length > 0 && (
        <Card title="Upcoming Deadlines" style={{ marginTop: 16 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Plan</th>
                <th>Frequency</th>
                <th>Deadline</th>
                <th>Status</th>
                <th>Team</th>
              </tr>
            </thead>
            <tbody>
              {planningSummary.upcomingDeadlines.map((plan: any) => (
                <tr key={plan.PlanID}>
                  <td>{plan.Title}</td>
                  <td><Badge tone={freqTone(plan.Frequency)}>{plan.Frequency}</Badge></td>
                  <td>{fmtDate(plan.PeriodEnd)}</td>
                  <td><Badge tone={statusTone(plan.Status)}>{plan.Status}</Badge></td>
                  <td>{plan.ResponsibleTeam ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Plans Tab                                                                   */
/* -------------------------------------------------------------------------- */
function PlansTab({
  plans, loading, error, onRefresh,
}: {
  plans: { items: Plan[]; total: number } | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [editPlan, setEditPlan] = useState<Plan | null>(null);
  const [form, setForm] = useState<Partial<Plan>>({});
  const [saving, setSaving] = useState(false);
  const [filterFreq, setFilterFreq] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'hierarchy'>('table');

  const handleCreate = async () => {
    setSaving(true);
    try {
      await api('/admin/plans', {
        method: 'POST',
        body: {
          title: form.Title,
          description: form.Description,
          frequency: form.Frequency ?? 'Monthly',
          periodStart: form.PeriodStart,
          periodEnd: form.PeriodEnd,
          plannedSubmissionDate: form.PlannedSubmissionDate,
          responsibleTeam: form.ResponsibleTeam,
          mainFocus: form.MainFocus,
          keyDeliverable: form.KeyDeliverable,
          remarks: form.Remarks,
        },
      });
      setShowCreate(false);
      setForm({});
      onRefresh();
      toast.success('Plan created');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to create plan');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editPlan) return;
    setSaving(true);
    try {
      await api(`/admin/plans/${editPlan.PlanID}`, {
        method: 'PUT',
        body: form,
      });
      setEditPlan(null);
      setForm({});
      onRefresh();
      toast.success('Plan updated');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update plan');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickStatus = async (plan: Plan, newStatus: string) => {
    try {
      await api(`/admin/plans/${plan.PlanID}`, {
        method: 'PUT',
        body: { status: newStatus },
      });
      onRefresh();
      toast.success(`Plan marked as ${newStatus}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update status');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this plan and all its children?')) return;
    try {
      await api(`/admin/plans/${id}`, { method: 'DELETE' });
      onRefresh();
      toast.success('Plan deleted');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete plan');
    }
  };

  const filtered = useMemo(() => {
    if (!plans?.items) return [];
    return plans.items.filter((p) => {
      if (filterFreq && p.Frequency !== filterFreq) return false;
      if (filterStatus && p.Status !== filterStatus) return false;
      if (search && !p.Title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [plans, filterFreq, filterStatus, search]);

  const hierarchy = useMemo(() => {
    if (!plans?.items) return [];
    const roots = plans.items.filter((p) => !p.ParentPlanID);
    const children = plans.items.filter((p) => p.ParentPlanID);
    return roots.map((r) => ({
      ...r,
      children: children.filter((c) => c.ParentPlanID === r.PlanID),
    }));
  }, [plans]);

  if (loading) return <Loading />;
  if (error) return <div className="empty" style={{ color: 'var(--danger)' }}>{error}</div>;

  return (
    <div>
      <div className="kpi-filters">
        <div className="filter-group">
          <Icon name="filter" />
          <select value={filterFreq} onChange={(e) => setFilterFreq(e.target.value)}>
            <option value="">All Frequencies</option>
            <option value="Annual">Annual</option>
            <option value="Quarterly">Quarterly</option>
            <option value="Monthly">Monthly</option>
            <option value="Weekly">Weekly</option>
          </select>
        </div>
        <div className="filter-group">
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <Icon name="search" />
          <input type="text" placeholder="Search plans..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="spacer" />
        <div className="filter-group">
          <Button variant={viewMode === 'table' ? 'primary' : 'ghost'} size="sm" onClick={() => setViewMode('table')}>
            <Icon name="table-list" /> Table
          </Button>
          <Button variant={viewMode === 'hierarchy' ? 'primary' : 'ghost'} size="sm" onClick={() => setViewMode('hierarchy')}>
            <Icon name="sitemap" /> Hierarchy
          </Button>
        </div>
        <Button variant="primary" size="sm" onClick={() => { setForm({ Frequency: 'Monthly' }); setShowCreate(true); }}>
          <Icon name="plus" /> New Plan
        </Button>
      </div>

      {viewMode === 'table' ? (
        filtered.length === 0 ? <Empty /> : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Frequency</th>
                <th>Period</th>
                <th>Status</th>
                <th>Approval</th>
                <th>Progress</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((plan) => (
                <tr key={plan.PlanID}>
                  <td>
                    <div className="plan-title-cell">
                      <strong>{plan.Title}</strong>
                      {plan.MainFocus && <span className="sub-text">{plan.MainFocus}</span>}
                    </div>
                  </td>
                  <td><Badge tone={freqTone(plan.Frequency)}>{plan.Frequency}</Badge></td>
                  <td className="date-cell">{fmtDateShort(plan.PeriodStart)} – {fmtDateShort(plan.PeriodEnd)}</td>
                  <td>
                    <StatusToggle
                      current={plan.Status}
                      onToggle={(s) => handleQuickStatus(plan, s)}
                    />
                  </td>
                  <td><Badge tone={statusTone(plan.ApprovalStatus)}>{plan.ApprovalStatus}</Badge></td>
                  <td>
                    <div className="progress-cell">
                      <div className="score-bar" style={{ width: 60 }}>
                        <div className={`score-bar-fill ${scoreClass(plan.ActivityCount > 0 ? (plan.CompletedActivities / plan.ActivityCount) * 100 : 0)}`} style={{ width: `${plan.ActivityCount > 0 ? (plan.CompletedActivities / plan.ActivityCount) * 100 : 0}%` }} />
                      </div>
                      <span className="sub-text">{plan.CompletedActivities}/{plan.ActivityCount}</span>
                    </div>
                  </td>
                  <td>
                    <div className="action-btns">
                      <Button variant="ghost" size="sm" onClick={() => { setEditPlan(plan); setForm(plan); }}>
                        <Icon name="pencil" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(plan.PlanID)}>
                        <Icon name="trash" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : (
        <div className="plan-hierarchy">
          {hierarchy.length === 0 ? <Empty /> : hierarchy.map((plan) => (
            <div key={plan.PlanID} className="plan-tree-node">
              <div className="plan-tree-row">
                <div className="plan-tree-main">
                  <Icon name="folder-open" />
                  <strong>{plan.Title}</strong>
                  <Badge tone={freqTone(plan.Frequency)}>{plan.Frequency}</Badge>
                  <Badge tone={statusTone(plan.Status)}>{plan.Status}</Badge>
                  {plan.ActivityCount > 0 && (
                    <span className="sub-text">{plan.CompletedActivities}/{plan.ActivityCount} activities</span>
                  )}
                </div>
                <div className="action-btns">
                  <Button variant="ghost" size="sm" onClick={() => { setEditPlan(plan); setForm(plan); }}><Icon name="pencil" /></Button>
                </div>
              </div>
              {plan.children && plan.children.length > 0 && (
                <div className="plan-tree-children">
                  {plan.children.map((child) => (
                    <div key={child.PlanID} className="plan-tree-row child">
                      <Icon name="file" />
                      <span>{child.Title}</span>
                      <Badge tone={freqTone(child.Frequency)}>{child.Frequency}</Badge>
                      <Badge tone={statusTone(child.Status)}>{child.Status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Plan">
        <PlanForm form={form} setForm={setForm} />
        <div className="modal-actions">
          <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleCreate} disabled={saving}>{saving ? 'Saving...' : 'Create'}</Button>
        </div>
      </Modal>

      <Modal open={!!editPlan} onClose={() => { setEditPlan(null); setForm({}); }} title="Edit Plan">
        <PlanForm form={form} setForm={setForm} />
        <div className="modal-actions">
          <Button variant="ghost" onClick={() => { setEditPlan(null); setForm({}); }}>Cancel</Button>
          <Button variant="primary" onClick={handleUpdate} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
        </div>
      </Modal>
    </div>
  );
}

function PlanForm({ form, setForm }: { form: Partial<Plan>; setForm: (f: Partial<Plan>) => void }) {
  return (
    <div className="form-grid">
      <div className="form-field">
        <label>Title *</label>
        <input value={form.Title ?? ''} onChange={(e) => setForm({ ...form, Title: e.target.value })} />
      </div>
      <div className="form-field">
        <label>Frequency *</label>
        <select value={form.Frequency ?? 'Monthly'} onChange={(e) => setForm({ ...form, Frequency: e.target.value as any })}>
          <option value="Annual">Annual</option>
          <option value="Quarterly">Quarterly</option>
          <option value="Monthly">Monthly</option>
          <option value="Weekly">Weekly</option>
        </select>
      </div>
      <div className="form-field">
        <label>Period Start *</label>
        <input type="date" value={form.PeriodStart?.slice(0, 10) ?? ''} onChange={(e) => setForm({ ...form, PeriodStart: e.target.value })} />
      </div>
      <div className="form-field">
        <label>Period End *</label>
        <input type="date" value={form.PeriodEnd?.slice(0, 10) ?? ''} onChange={(e) => setForm({ ...form, PeriodEnd: e.target.value })} />
      </div>
      <div className="form-field">
        <label>Planned Submission</label>
        <input type="date" value={form.PlannedSubmissionDate?.slice(0, 10) ?? ''} onChange={(e) => setForm({ ...form, PlannedSubmissionDate: e.target.value })} />
      </div>
      <div className="form-field">
        <label>Responsible Team</label>
        <input value={form.ResponsibleTeam ?? ''} onChange={(e) => setForm({ ...form, ResponsibleTeam: e.target.value })} />
      </div>
      <div className="form-field full-width">
        <label>Description</label>
        <textarea rows={3} value={form.Description ?? ''} onChange={(e) => setForm({ ...form, Description: e.target.value })} />
      </div>
      <div className="form-field full-width">
        <label>Main Focus</label>
        <input value={form.MainFocus ?? ''} onChange={(e) => setForm({ ...form, MainFocus: e.target.value })} />
      </div>
      <div className="form-field full-width">
        <label>Key Deliverable</label>
        <textarea rows={2} value={form.KeyDeliverable ?? ''} onChange={(e) => setForm({ ...form, KeyDeliverable: e.target.value })} />
      </div>
      <div className="form-field full-width">
        <label>Remarks</label>
        <textarea rows={2} value={form.Remarks ?? ''} onChange={(e) => setForm({ ...form, Remarks: e.target.value })} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Activities Tab                                                              */
/* -------------------------------------------------------------------------- */
function ActivitiesTab({ onRefresh }: { onRefresh: () => void }) {
  const [planId, setPlanId] = useState<number | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [activities, setActivities] = useState<PlanActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editActivity, setEditActivity] = useState<PlanActivity | null>(null);
  const [form, setForm] = useState<Partial<PlanActivity>>({});
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [search, setSearch] = useState('');

  const loadPlans = useCallback(async () => {
    try {
      const res = await api<{ items: Plan[] }>('/admin/plans?pageSize=100');
      setPlans(res.items);
    } catch {}
  }, []);

  const loadActivities = useCallback(async (pid: number) => {
    setLoading(true);
    try {
      const res = await api<{ items: PlanActivity[] }>(`/admin/plans/${pid}/activities?pageSize=100`);
      setActivities(res.items);
    } catch {
      setActivities([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPlans(); }, []);

  const handleCreate = async () => {
    if (!planId) return;
    setSaving(true);
    try {
      await api(`/admin/plans/${planId}/activities`, {
        method: 'POST',
        body: {
          title: form.Title,
          description: form.Description,
          detailedActivity: form.DetailedActivity,
          frequency: form.Frequency,
          startDate: form.StartDate,
          endDate: form.EndDate,
          plannedSubmissionDate: form.PlannedSubmissionDate,
          status: form.Status ?? 'Not Started',
          priority: form.Priority ?? 'Medium',
          responsibleTeam: form.ResponsibleTeam,
          mainFocus: form.MainFocus,
          activityType: form.ActivityType,
          expectedDeliverable: form.ExpectedDeliverable,
          target: form.Target,
          unit: form.Unit,
          remarks: form.Remarks,
        },
      });
      setShowCreate(false);
      setForm({});
      loadActivities(planId);
      toast.success('Activity created');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to create activity');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editActivity) return;
    setSaving(true);
    try {
      await api(`/admin/activities/${editActivity.ActivityID}`, {
        method: 'PUT',
        body: form,
      });
      setEditActivity(null);
      setForm({});
      if (planId) loadActivities(planId);
      toast.success('Activity updated');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update activity');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickStatus = async (act: PlanActivity, newStatus: string) => {
    try {
      await api(`/admin/activities/${act.ActivityID}`, {
        method: 'PUT',
        body: { status: newStatus },
      });
      if (planId) loadActivities(planId);
      toast.success(`Activity marked as ${newStatus}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update status');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this activity?')) return;
    try {
      await api(`/admin/activities/${id}`, { method: 'DELETE' });
      if (planId) loadActivities(planId);
      toast.success('Activity deleted');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete activity');
    }
  };

  const filtered = useMemo(() => {
    return activities.filter((a) => {
      if (filterStatus && a.Status !== filterStatus) return false;
      if (filterPriority && a.Priority !== filterPriority) return false;
      if (search && !a.Title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [activities, filterStatus, filterPriority, search]);

  const actStats = useMemo(() => {
    const total = activities.length;
    const completed = activities.filter((a) => a.Status === 'Completed').length;
    const inProgress = activities.filter((a) => a.Status === 'In Progress').length;
    const delayed = activities.filter((a) => a.Status === 'Delayed').length;
    return { total, completed, inProgress, delayed };
  }, [activities]);

  return (
    <div>
      <div className="kpi-filters">
        <div className="filter-group">
          <Icon name="clipboard-list" />
          <select value={planId ?? ''} onChange={(e) => {
            const pid = Number(e.target.value);
            setPlanId(pid);
            if (pid) loadActivities(pid);
          }}>
            <option value="">Select a Plan</option>
            {plans.map((p) => (
              <option key={p.PlanID} value={p.PlanID}>[{p.Frequency}] {p.Title}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
            <option value="">All Priorities</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>
        <div className="filter-group">
          <Icon name="search" />
          <input type="text" placeholder="Search activities..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="spacer" />
        {planId && (
          <Button variant="primary" size="sm" onClick={() => { setForm({ Status: 'Not Started', Priority: 'Medium', StartDate: today(), EndDate: today() }); setShowCreate(true); }}>
            <Icon name="plus" /> New Activity
          </Button>
        )}
      </div>

      {planId && activities.length > 0 && (
        <div className="kpi-overview-grid" style={{ marginBottom: 16 }}>
          <MetricCard icon="list-check" label="Total Activities" value={actStats.total} color="blue" />
          <MetricCard icon="check-circle" label="Completed" value={actStats.completed} sub={`${actStats.total > 0 ? Math.round((actStats.completed / actStats.total) * 100) : 0}%`} color="green" />
          <MetricCard icon="spinner" label="In Progress" value={actStats.inProgress} color="teal" />
          <MetricCard icon="clock" label="Delayed" value={actStats.delayed} color="amber" />
        </div>
      )}

      {!planId ? (
        <Empty />
      ) : loading ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <Empty />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Activity</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Dates</th>
              <th>Target</th>
              <th>Deliverable</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((act) => (
              <tr key={act.ActivityID}>
                <td>
                  <div className="plan-title-cell">
                    <strong>{act.Title}</strong>
                    {act.MainFocus && <span className="sub-text">{act.MainFocus}</span>}
                  </div>
                </td>
                <td><Badge tone={priorityTone(act.Priority)}>{act.Priority}</Badge></td>
                <td>
                  <StatusToggle
                    current={act.Status}
                    onToggle={(s) => handleQuickStatus(act, s)}
                  />
                </td>
                <td className="date-cell">{fmtDateShort(act.StartDate)} – {fmtDateShort(act.EndDate)}</td>
                <td>{act.Target ? `${act.Target} ${act.Unit ?? ''}` : '—'}</td>
                <td className="truncate-cell">{act.ExpectedDeliverable ?? '—'}</td>
                <td>
                  <div className="action-btns">
                    <Button variant="ghost" size="sm" onClick={() => { setEditActivity(act); setForm(act); }}>
                      <Icon name="pencil" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(act.ActivityID)}>
                      <Icon name="trash" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Activity">
        <ActivityForm form={form} setForm={setForm} />
        <div className="modal-actions">
          <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleCreate} disabled={saving}>{saving ? 'Saving...' : 'Create'}</Button>
        </div>
      </Modal>

      <Modal open={!!editActivity} onClose={() => { setEditActivity(null); setForm({}); }} title="Edit Activity">
        <ActivityForm form={form} setForm={setForm} />
        <div className="modal-actions">
          <Button variant="ghost" onClick={() => { setEditActivity(null); setForm({}); }}>Cancel</Button>
          <Button variant="primary" onClick={handleUpdate} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
        </div>
      </Modal>
    </div>
  );
}

function ActivityForm({ form, setForm }: { form: Partial<PlanActivity>; setForm: (f: Partial<PlanActivity>) => void }) {
  return (
    <div className="form-grid">
      <div className="form-field">
        <label>Title *</label>
        <input value={form.Title ?? ''} onChange={(e) => setForm({ ...form, Title: e.target.value })} />
      </div>
      <div className="form-field">
        <label>Priority</label>
        <select value={form.Priority ?? 'Medium'} onChange={(e) => setForm({ ...form, Priority: e.target.value as any })}>
          <option value="Low">Low</option>
          <option value="Medium">Medium</option>
          <option value="High">High</option>
          <option value="Critical">Critical</option>
        </select>
      </div>
      <div className="form-field">
        <label>Start Date *</label>
        <input type="date" value={form.StartDate?.slice(0, 10) ?? ''} onChange={(e) => setForm({ ...form, StartDate: e.target.value })} />
      </div>
      <div className="form-field">
        <label>End Date *</label>
        <input type="date" value={form.EndDate?.slice(0, 10) ?? ''} onChange={(e) => setForm({ ...form, EndDate: e.target.value })} />
      </div>
      <div className="form-field">
        <label>Planned Submission</label>
        <input type="date" value={form.PlannedSubmissionDate?.slice(0, 10) ?? ''} onChange={(e) => setForm({ ...form, PlannedSubmissionDate: e.target.value })} />
      </div>
      <div className="form-field">
        <label>Status</label>
        <select value={form.Status ?? 'Not Started'} onChange={(e) => setForm({ ...form, Status: e.target.value as any })}>
          {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="form-field">
        <label>Target</label>
        <input value={form.Target ?? ''} onChange={(e) => setForm({ ...form, Target: e.target.value })} />
      </div>
      <div className="form-field">
        <label>Unit</label>
        <input value={form.Unit ?? ''} onChange={(e) => setForm({ ...form, Unit: e.target.value })} />
      </div>
      <div className="form-field full-width">
        <label>Description</label>
        <textarea rows={2} value={form.Description ?? ''} onChange={(e) => setForm({ ...form, Description: e.target.value })} />
      </div>
      <div className="form-field full-width">
        <label>Detailed Activity</label>
        <textarea rows={3} value={form.DetailedActivity ?? ''} onChange={(e) => setForm({ ...form, DetailedActivity: e.target.value })} />
      </div>
      <div className="form-field full-width">
        <label>Expected Deliverable</label>
        <textarea rows={2} value={form.ExpectedDeliverable ?? ''} onChange={(e) => setForm({ ...form, ExpectedDeliverable: e.target.value })} />
      </div>
      <div className="form-field full-width">
        <label>Remarks</label>
        <textarea rows={2} value={form.Remarks ?? ''} onChange={(e) => setForm({ ...form, Remarks: e.target.value })} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* KPI Definitions Tab                                                         */
/* -------------------------------------------------------------------------- */
function KpiDefsTab({
  defs, loading, error, onRefresh,
}: {
  defs: { items: KpiDefinition[]; total: number } | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [editDef, setEditDef] = useState<KpiDefinition | null>(null);
  const [form, setForm] = useState<Partial<KpiDefinition>>({});
  const [saving, setSaving] = useState(false);
  const [filterCat, setFilterCat] = useState('');
  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const businessGroups = useFetch<{ items: { BusinessGroupID: number; Name: string }[] }>(
    '/admin/business-groups?pageSize=100',
    []
  );

  const categories = useMemo(() => {
    if (!defs?.items) return [];
    const cats = new Set(defs.items.map((d) => d.Category).filter(Boolean));
    return Array.from(cats);
  }, [defs]);

  function defBody(f: Partial<KpiDefinition>) {
    return {
      kpiCode: f.KpiCode,
      kpiName: f.KpiName,
      description: f.Description,
      category: f.Category,
      measurementUnit: f.MeasurementUnit ?? 'Count',
      targetValue: f.TargetValue,
      weight: f.Weight ?? 1.0,
      frequency: f.Frequency ?? 'Monthly',
      direction: f.Direction ?? 'HigherIsBetter',
      thresholdExcellent: f.ThresholdExcellent,
      thresholdGood: f.ThresholdGood,
      thresholdAverage: f.ThresholdAverage,
      applicableRole: f.ApplicableRole,
      strategicObjective: f.StrategicObjective,
      businessUnitId: f.BusinessUnitID,
      kpiOwnerName: f.KpiOwnerName,
      dataSource: f.DataSource,
      collectionMethod: f.CollectionMethod,
      alertThresholdText: f.AlertThresholdText,
      alertThresholdPercent: f.AlertThresholdPercent,
      evidenceRequired: f.EvidenceRequired ?? false,
      verificationRole: f.VerificationRole,
      dashboardGroup: f.DashboardGroup,
      systemModule: f.SystemModule,
      integrationMethod: f.IntegrationMethod,
      targetText: f.TargetText,
      unitOfMeasure: f.UnitOfMeasure,
      sourceRef: f.SourceRef,
    };
  }

  const handleCreate = async () => {
    setSaving(true);
    try {
      await api('/admin/kpi/definitions', {
        method: 'POST',
        body: defBody(form),
      });
      setShowCreate(false);
      setForm({});
      onRefresh();
      toast.success('KPI definition created');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to create KPI definition');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editDef) return;
    setSaving(true);
    try {
      await api(`/admin/kpi/definitions/${editDef.KpiDefID}`, {
        method: 'PUT',
        body: defBody(form),
      });
      setEditDef(null);
      setForm({});
      onRefresh();
      toast.success('KPI definition updated');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update KPI definition');
    } finally {
      setSaving(false);
    }
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('year', String(new Date().getFullYear()));
      const stats = await api<KpiImportStats>('/admin/kpi/import', { method: 'POST', body: fd });
      if (stats.errors.length > 0) {
        toast.error(`Import finished with issues: ${stats.errors[0]}`);
      } else {
        toast.success(`Import: ${stats.definitionsUpdated} KPIs, ${stats.measurementsUpserted} measurement rows updated`);
      }
      onRefresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Import failed');
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this KPI definition?')) return;
    try {
      await api(`/admin/kpi/definitions/${id}`, { method: 'DELETE' });
      onRefresh();
      toast.success('KPI definition deleted');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete KPI definition');
    }
  };

  const filtered = useMemo(() => {
    if (!defs?.items) return [];
    return defs.items.filter((d) => {
      if (filterCat && d.Category !== filterCat) return false;
      if (search && !d.KpiName.toLowerCase().includes(search.toLowerCase()) && !d.KpiCode.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [defs, filterCat, search]);

  const weightData = useMemo(() => {
    if (!filtered.length) return [];
    const catWeights: Record<string, number> = {};
    filtered.forEach((d) => {
      const cat = d.Category ?? 'Uncategorized';
      catWeights[cat] = (catWeights[cat] ?? 0) + d.Weight;
    });
    return Object.entries(catWeights).map(([label, value]) => ({ label, value }));
  }, [filtered]);

  if (loading) return <Loading />;
  if (error) return <div className="empty" style={{ color: 'var(--danger)' }}>{error}</div>;

  return (
    <div>
      <div className="kpi-filters">
        <div className="filter-group">
          <Icon name="filter" />
          <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
            <option value="">All Categories</option>
            {categories.filter(Boolean).map((c) => <option key={c} value={c!}>{c}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <Icon name="search" />
          <input type="text" placeholder="Search KPIs..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="spacer" />
        <span className="sub-text">{filtered.length} definitions</span>
        <input
          ref={importInputRef}
          type="file"
          accept=".xlsx"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImport(file);
          }}
        />
        <Button variant="ghost" size="sm" onClick={() => importInputRef.current?.click()} disabled={importing}>
          <Icon name="file-arrow-up" /> {importing ? 'Importing...' : 'Import Workbook'}
        </Button>
        <Button variant="primary" size="sm" onClick={() => { setForm({ MeasurementUnit: 'Count', Weight: 1.0, Frequency: 'Monthly', Direction: 'HigherIsBetter' }); setShowCreate(true); }}>
          <Icon name="plus" /> New KPI
        </Button>
      </div>

      {weightData.length > 0 && (
        <div className="grid-2" style={{ marginBottom: 16 }}>
          <Card title="Weight Distribution by Category">
            <BarChart data={weightData} color="var(--primary)" />
          </Card>
          <Card title="Category Summary">
            <table className="data-table compact">
              <thead>
                <tr><th>Category</th><th>KPIs</th><th>Total Weight</th></tr>
              </thead>
              <tbody>
                {weightData.map((w) => (
                  <tr key={w.label}>
                    <td>{w.label}</td>
                    <td>{filtered.filter((d) => (d.Category ?? 'Uncategorized') === w.label).length}</td>
                    <td>{w.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {filtered.length === 0 ? (
        <Empty />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Category</th>
              <th>Unit</th>
              <th>Target</th>
              <th>Weight</th>
              <th>Frequency</th>
              <th>Direction</th>
              <th>Thresholds</th>
              <th>Active</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((def) => (
              <tr key={def.KpiDefID}>
                <td><code>{def.KpiCode}</code></td>
                <td>{def.KpiName}</td>
                <td>{def.Category ?? '—'}</td>
                <td>{def.MeasurementUnit}</td>
                <td>{def.TargetValue ?? '—'}</td>
                <td>{def.Weight}</td>
                <td><Badge tone={freqTone(def.Frequency)}>{def.Frequency}</Badge></td>
                <td>{def.Direction === 'HigherIsBetter' ? '↑ Higher' : '↓ Lower'}</td>
                <td>
                  <div className="threshold-mini">
                    {def.ThresholdExcellent != null && <span className="thm excellent" title="Excellent">{def.ThresholdExcellent}</span>}
                    {def.ThresholdGood != null && <span className="thm good" title="Good">{def.ThresholdGood}</span>}
                    {def.ThresholdAverage != null && <span className="thm average" title="Average">{def.ThresholdAverage}</span>}
                  </div>
                </td>
                <td>{def.IsActive ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Inactive</Badge>}</td>
                <td>
                  <div className="action-btns">
                    <Button variant="ghost" size="sm" onClick={() => { setEditDef(def); setForm(def); }}>
                      <Icon name="pencil" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(def.KpiDefID)}>
                      <Icon name="trash" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create KPI Definition">
        <KpiDefForm form={form} setForm={setForm} businessGroups={businessGroups.data?.items} />
        <div className="modal-actions">
          <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleCreate} disabled={saving}>{saving ? 'Saving...' : 'Create'}</Button>
        </div>
      </Modal>

      <Modal open={!!editDef} onClose={() => { setEditDef(null); setForm({}); }} title="Edit KPI Definition">
        <KpiDefForm form={form} setForm={setForm} businessGroups={businessGroups.data?.items} />
        <div className="modal-actions">
          <Button variant="ghost" onClick={() => { setEditDef(null); setForm({}); }}>Cancel</Button>
          <Button variant="primary" onClick={handleUpdate} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
        </div>
      </Modal>
    </div>
  );
}

function KpiDefForm({ form, setForm, businessGroups }: {
  form: Partial<KpiDefinition>;
  setForm: (f: Partial<KpiDefinition>) => void;
  businessGroups?: { BusinessGroupID: number; Name: string }[];
}) {
  const dataSources = ['Finance Report', 'CRM', 'HR Report', 'Social Media', 'ERP', 'Manual'];
  const collectionMethods = ['Excel Upload', 'Web Form', 'System Integration', 'Manual'];
  const systemModules = ['Performance Management', 'Customer & Market Intelligence', 'Digital Marketing'];
  return (
    <div className="form-grid">
      <div className="form-field">
        <label>KPI Code *</label>
        <input value={form.KpiCode ?? ''} onChange={(e) => setForm({ ...form, KpiCode: e.target.value })} />
      </div>
      <div className="form-field">
        <label>KPI Name *</label>
        <input value={form.KpiName ?? ''} onChange={(e) => setForm({ ...form, KpiName: e.target.value })} />
      </div>
      <div className="form-field full-width">
        <label>Strategic Objective</label>
        <input value={form.StrategicObjective ?? ''} onChange={(e) => setForm({ ...form, StrategicObjective: e.target.value })} />
      </div>
      <div className="form-field">
        <label>Category</label>
        <input value={form.Category ?? ''} onChange={(e) => setForm({ ...form, Category: e.target.value })} />
      </div>
      <div className="form-field">
        <label>Measurement Unit</label>
        <select value={form.MeasurementUnit ?? 'Count'} onChange={(e) => setForm({ ...form, MeasurementUnit: e.target.value })}>
          <option value="Count">Count</option>
          <option value="Percentage">Percentage</option>
          <option value="Amount">Amount</option>
          <option value="Completion">Completion</option>
        </select>
      </div>
      <div className="form-field">
        <label>Unit of Measure (raw)</label>
        <input value={form.UnitOfMeasure ?? ''} placeholder="%, Birr, ratio..." onChange={(e) => setForm({ ...form, UnitOfMeasure: e.target.value })} />
      </div>
      <div className="form-field">
        <label>Target Value (numeric)</label>
        <input type="number" value={form.TargetValue ?? ''} onChange={(e) => setForm({ ...form, TargetValue: Number(e.target.value) })} />
      </div>
      <div className="form-field full-width">
        <label>Annual Target (text, as in workbook)</label>
        <input value={form.TargetText ?? ''} placeholder="e.g. 12-14 campaigns, Reach >=50k" onChange={(e) => setForm({ ...form, TargetText: e.target.value })} />
      </div>
      <div className="form-field">
        <label>Weight</label>
        <input type="number" step="0.1" value={form.Weight ?? 1.0} onChange={(e) => setForm({ ...form, Weight: Number(e.target.value) })} />
      </div>
      <div className="form-field">
        <label>Frequency</label>
        <select value={form.Frequency ?? 'Monthly'} onChange={(e) => setForm({ ...form, Frequency: e.target.value })}>
          <option value="Weekly">Weekly</option>
          <option value="Monthly">Monthly</option>
          <option value="Quarterly">Quarterly</option>
          <option value="Annual">Annual</option>
        </select>
      </div>
      <div className="form-field">
        <label>Direction</label>
        <select value={form.Direction ?? 'HigherIsBetter'} onChange={(e) => setForm({ ...form, Direction: e.target.value })}>
          <option value="HigherIsBetter">Higher is Better</option>
          <option value="LowerIsBetter">Lower is Better</option>
        </select>
      </div>
      <div className="form-field">
        <label>Business Unit</label>
        <select
          value={form.BusinessUnitID ?? ''}
          onChange={(e) => setForm({ ...form, BusinessUnitID: e.target.value ? Number(e.target.value) : undefined })}
        >
          <option value="">Group / BU (all)</option>
          {(businessGroups ?? []).map((bg) => (
            <option key={bg.BusinessGroupID} value={bg.BusinessGroupID}>{bg.Name}</option>
          ))}
        </select>
      </div>
      <div className="form-field">
        <label>KPI Owner</label>
        <input value={form.KpiOwnerName ?? ''} placeholder="e.g. Demand Generation Manager" onChange={(e) => setForm({ ...form, KpiOwnerName: e.target.value })} />
      </div>
      <div className="form-field">
        <label>Data Source</label>
        <select value={form.DataSource ?? ''} onChange={(e) => setForm({ ...form, DataSource: e.target.value || undefined })}>
          <option value="">—</option>
          {dataSources.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      <div className="form-field">
        <label>Collection Method</label>
        <select value={form.CollectionMethod ?? ''} onChange={(e) => setForm({ ...form, CollectionMethod: e.target.value || undefined })}>
          <option value="">—</option>
          {collectionMethods.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="form-field">
        <label>Alert Threshold (%)</label>
        <input type="number" value={form.AlertThresholdPercent ?? ''} onChange={(e) => setForm({ ...form, AlertThresholdPercent: e.target.value === '' ? undefined : Number(e.target.value) })} />
      </div>
      <div className="form-field">
        <label>Alert Threshold (text)</label>
        <input value={form.AlertThresholdText ?? ''} placeholder="90% of target" onChange={(e) => setForm({ ...form, AlertThresholdText: e.target.value })} />
      </div>
      <div className="form-field">
        <label>Evidence Required</label>
        <select
          value={form.EvidenceRequired ? 'Yes' : 'No'}
          onChange={(e) => setForm({ ...form, EvidenceRequired: e.target.value === 'Yes' })}
        >
          <option value="No">No</option>
          <option value="Yes">Yes</option>
        </select>
      </div>
      <div className="form-field">
        <label>Verification Role</label>
        <input value={form.VerificationRole ?? ''} placeholder="Department Head / MI" onChange={(e) => setForm({ ...form, VerificationRole: e.target.value })} />
      </div>
      <div className="form-field">
        <label>Dashboard Group</label>
        <input value={form.DashboardGroup ?? ''} placeholder="Executive KPI Dashboard" onChange={(e) => setForm({ ...form, DashboardGroup: e.target.value })} />
      </div>
      <div className="form-field">
        <label>System Module</label>
        <select value={form.SystemModule ?? ''} onChange={(e) => setForm({ ...form, SystemModule: e.target.value || undefined })}>
          <option value="">—</option>
          {systemModules.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="form-field">
        <label>Integration Method</label>
        <input value={form.IntegrationMethod ?? ''} placeholder="To confirm" onChange={(e) => setForm({ ...form, IntegrationMethod: e.target.value })} />
      </div>
      <div className="form-field">
        <label>Source Ref (workbook kpi_id)</label>
        <input value={form.SourceRef ?? ''} onChange={(e) => setForm({ ...form, SourceRef: e.target.value })} />
      </div>
      <div className="form-field">
        <label>Threshold: Excellent</label>
        <input type="number" value={form.ThresholdExcellent ?? ''} onChange={(e) => setForm({ ...form, ThresholdExcellent: Number(e.target.value) })} />
      </div>
      <div className="form-field">
        <label>Threshold: Good</label>
        <input type="number" value={form.ThresholdGood ?? ''} onChange={(e) => setForm({ ...form, ThresholdGood: Number(e.target.value) })} />
      </div>
      <div className="form-field">
        <label>Threshold: Average</label>
        <input type="number" value={form.ThresholdAverage ?? ''} onChange={(e) => setForm({ ...form, ThresholdAverage: Number(e.target.value) })} />
      </div>
      <div className="form-field full-width">
        <label>Description</label>
        <textarea rows={2} value={form.Description ?? ''} onChange={(e) => setForm({ ...form, Description: e.target.value })} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Ranking Tab                                                                 */
/* -------------------------------------------------------------------------- */
function RankingTab({
  officers, loading, error, onSelect,
}: {
  officers: OfficerKpi[] | null;
  loading: boolean;
  error: string | null;
  onSelect: (o: OfficerKpi) => void;
}) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('overallScore');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [catFilter, setCatFilter] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const filtered = useMemo(() => {
    if (!officers) return [];
    let list = [...officers];
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((o) => o.name.toLowerCase().includes(s) || o.regionNames.toLowerCase().includes(s));
    }
    if (catFilter) list = list.filter((o) => o.category === catFilter);
    list.sort((a: any, b: any) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      return sortDir === 'desc' ? bv - av : av - bv;
    });
    return list;
  }, [officers, search, sortKey, sortDir, catFilter]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page]);

  const catStats = useMemo(() => {
    if (!officers) return { excellent: 0, good: 0, average: 0, needsAttention: 0 };
    return {
      excellent: officers.filter((o) => o.category === 'Excellent').length,
      good: officers.filter((o) => o.category === 'Good').length,
      average: officers.filter((o) => o.category === 'Average').length,
      needsAttention: officers.filter((o) => o.category === 'Needs Attention').length,
    };
  }, [officers]);

  if (loading) return <Loading />;
  if (error) return <div className="empty" style={{ color: 'var(--danger)' }}>{error}</div>;

  return (
    <div>
      <div className="kpi-overview-grid" style={{ marginBottom: 16 }}>
        <MetricCard icon="trophy" label="Excellent" value={catStats.excellent} color="green" />
        <MetricCard icon="thumbs-up" label="Good" value={catStats.good} color="teal" />
        <MetricCard icon="minus-circle" label="Average" value={catStats.average} color="amber" />
        <MetricCard icon="exclamation-triangle" label="Needs Attention" value={catStats.needsAttention} color="red" />
      </div>

      <div className="kpi-filters">
        <div className="filter-group">
          <Icon name="search" />
          <input type="text" placeholder="Search officers..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="filter-group">
          <select value={catFilter} onChange={(e) => { setCatFilter(e.target.value); setPage(1); }}>
            <option value="">All Categories</option>
            <option value="Excellent">Excellent</option>
            <option value="Good">Good</option>
            <option value="Average">Average</option>
            <option value="Needs Attention">Needs Attention</option>
          </select>
        </div>
        <div className="filter-group">
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
            <option value="overallScore">Overall Score</option>
            <option value="productivityScore">Productivity</option>
            <option value="completionScore">Completion</option>
            <option value="qualityScore">Quality</option>
            <option value="timelinessScore">Timeliness</option>
            <option value="completionRate">Completion Rate</option>
          </select>
          <Button variant="ghost" size="sm" onClick={() => setSortDir(sortDir === 'desc' ? 'asc' : 'desc')}>
            <Icon name={sortDir === 'desc' ? 'sort-down' : 'sort-up'} />
          </Button>
        </div>
        <div className="spacer" />
        <span className="sub-text">{filtered.length} officers</span>
      </div>

      {paged.length === 0 ? (
        <Empty />
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 50 }}>#</th>
                <th>Officer</th>
                <th>Region</th>
                <th>Activities</th>
                <th>Completion</th>
                <th>Score</th>
                <th>Category</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {paged.map((o) => (
                <tr key={o.userId} onClick={() => onSelect(o)} style={{ cursor: 'pointer' }}>
                  <td><span className={`rank-badge ${rankBadgeClass(o.rank)}`}>{o.rank}</span></td>
                  <td>
                    <div className="officer-cell">
                      <span className={`avatar ${avatarColor(o.name)}`}>{initials(o.name)}</span>
                      <div>
                        <div className="officer-name">{o.name}</div>
                        <div className="officer-email">{o.email ?? ''}</div>
                      </div>
                    </div>
                  </td>
                  <td>{o.regionNames}</td>
                  <td>{o.totalActivities}</td>
                  <td>{o.completionRate}%</td>
                  <td>
                    <div className="score-cell">
                      <div className="score-bar" style={{ width: 80 }}>
                        <div className={`score-bar-fill ${scoreClass(o.overallScore)}`} style={{ width: `${o.overallScore}%` }} />
                      </div>
                      <span className="score-num">{o.overallScore}</span>
                    </div>
                  </td>
                  <td><Badge tone={perfTone(o.category)}>{o.category}</Badge></td>
                  <td><Icon name="chevron-right" /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} total={filtered.length} pageSize={pageSize} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Results Tab                                                                 */
/* -------------------------------------------------------------------------- */
function ResultsTab({
  pva, refreshKey, pvaLoading, pvaError,
}: {
  pva: PlannedVsAchieved[];
  refreshKey: number;
  pvaLoading: boolean;
  pvaError: string | null;
}) {
  const [view, setView] = useState<'results' | 'pva'>('pva');
  const [filterKpi, setFilterKpi] = useState('');
  const [filterRating, setFilterRating] = useState('');
  const [filterType, setFilterType] = useState('Officer');

  const results = useFetch<{ items: KpiResult[] }>(
    `/admin/kpi/results?pageSize=100${filterType ? `&recordType=${filterType}` : ''}`,
    [filterType, refreshKey]
  );

  const kpiNames = useMemo(() => {
    if (!results.data?.items) return [];
    const names = new Set(results.data.items.map((r) => r.KpiName));
    return Array.from(names);
  }, [results.data]);

  const filteredResults = useMemo(() => {
    if (!results.data?.items) return [];
    return results.data.items.filter((r) => {
      if (filterKpi && r.KpiName !== filterKpi) return false;
      if (filterRating && r.Rating !== filterRating) return false;
      return true;
    });
  }, [results.data, filterKpi, filterRating]);

  const filteredPva = useMemo(() => {
    if (filterKpi) return pva.filter((p) => p.kpiName === filterKpi);
    return pva;
  }, [pva, filterKpi]);

  const loading = view === 'results' ? results.loading : pvaLoading;
  const error = view === 'results' ? results.error : pvaError;
  if (loading) return <Loading />;
  if (error) return <div className="empty" style={{ color: 'var(--danger)' }}>{error}</div>;

  return (
    <div>
      <div className="kpi-filters">
        <div className="filter-group">
          <Button variant={view === 'pva' ? 'primary' : 'ghost'} size="sm" onClick={() => setView('pva')}>Planned vs Achieved</Button>
          <Button variant={view === 'results' ? 'primary' : 'ghost'} size="sm" onClick={() => setView('results')}>KPI Results</Button>
        </div>
        <div className="filter-group">
          <Icon name="filter" />
          <select value={filterKpi} onChange={(e) => setFilterKpi(e.target.value)}>
            <option value="">All KPIs</option>
            {kpiNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        {view === 'results' && (
          <>
            <div className="filter-group">
              <select value={filterRating} onChange={(e) => setFilterRating(e.target.value)}>
                <option value="">All Ratings</option>
                <option value="Excellent">Excellent</option>
                <option value="Good">Good</option>
                <option value="Average">Average</option>
                <option value="Needs Attention">Needs Attention</option>
              </select>
            </div>
            <div className="filter-group">
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                <option value="">All Types</option>
                <option value="Officer">Officer</option>
                <option value="Measurement">Measurement</option>
              </select>
            </div>
          </>
        )}
        <div className="spacer" />
        <span className="sub-text">{view === 'pva' ? filteredPva.length : filteredResults.length} records</span>
      </div>

      {view === 'pva' && (
        filteredPva.length === 0 ? <Empty /> : (
          <table className="data-table">
            <thead>
              <tr>
                <th>KPI</th>
                <th>Category</th>
                <th>Unit</th>
                <th>Target</th>
                <th>Actual</th>
                <th>Achievement</th>
                <th>Officers</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredPva.map((item) => (
                <tr key={item.kpiCode}>
                  <td>
                    <div className="plan-title-cell">
                      <strong>{item.kpiName}</strong>
                      <span className="sub-text">{item.kpiCode}</span>
                    </div>
                  </td>
                  <td>{item.category ?? '—'}</td>
                  <td>{item.measurementUnit}</td>
                  <td>{item.totalTarget}</td>
                  <td>{item.totalActual}</td>
                  <td>
                    <AchievementBar target={item.totalTarget} actual={item.totalActual} />
                  </td>
                  <td>{item.officerCount}</td>
                  <td><Badge tone={perfTone(item.status)}>{item.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      {view === 'results' && (
        filteredResults.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>KPI</th>
                <th>Type</th>
                <th>Officer</th>
                <th>Period</th>
                <th>Target</th>
                <th>Actual</th>
                <th>Achievement</th>
                <th>Score</th>
                <th>Rating</th>
                <th>Final Status</th>
                <th>Verification</th>
              </tr>
            </thead>
            <tbody>
              {filteredResults.map((r) => (
                <tr key={r.KpiResultID}>
                  <td>{r.KpiName}</td>
                  <td><Badge tone={r.RecordType === 'Measurement' ? 'info' : 'neutral'}>{r.RecordType ?? 'Officer'}</Badge></td>
                  <td>{r.UserName ?? <span className="sub-text">Org / Group</span>}</td>
                  <td className="date-cell">{fmtDateShort(r.PeriodStart)} – {fmtDateShort(r.PeriodEnd)}</td>
                  <td>{r.TargetValue ?? r.PlannedValue ?? r.PlannedText ?? '—'}</td>
                  <td>{r.ActualValue ?? '—'}</td>
                  <td>{r.AchievementPercent != null ? `${r.AchievementPercent}%` : '—'}</td>
                  <td>{r.WeightedScore ?? '—'}</td>
                  <td><Badge tone={perfTone(r.Rating ?? '')}>{r.Rating ?? '—'}</Badge></td>
                  <td>{r.FinalStatus ? <Badge tone={statusToneBadge(r.FinalStatus)}>{r.FinalStatus}</Badge> : '—'}</td>
                  <td>{r.VerificationStatus ? <Badge tone={statusToneBadge(r.VerificationStatus)}>{r.VerificationStatus}</Badge> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Officer Detail Modal                                                        */
/* -------------------------------------------------------------------------- */
function OfficerDetailModal({ officer, onClose }: { officer: OfficerKpi | null; onClose: () => void }) {
  const detail = useFetch<OfficerDetail>(
    officer ? `/admin/kpi/officers/${officer.userId}` : null,
    [officer?.userId]
  );

  return (
    <Modal open={!!officer} onClose={onClose} title="Officer Detail" wide>
      {detail.loading ? <Loading /> : detail.error ? (
        <div className="empty" style={{ color: 'var(--danger)' }}>{detail.error}</div>
      ) : detail.data ? (
        <div>
          <div className="officer-profile">
            <span className={`avatar lg ${avatarColor(detail.data.name)}`}>{initials(detail.data.name)}</span>
            <div>
              <h3>{detail.data.name}</h3>
              <div className="sub-text">{detail.data.email}</div>
              <div className="sub-text">{detail.data.regionNames}</div>
            </div>
          </div>

          <div className="grid-2" style={{ marginTop: 16 }}>
            <div>
              <div className="score-ring-section">
                <div className={`score-ring ${scoreClass(detail.data.overallScore)}`}>
                  <span className="score-ring-value">{detail.data.overallScore}</span>
                  <span className="score-ring-label">Overall</span>
                </div>
              </div>
              <div className="score-breakdown">
                <ScoreBar label="Productivity" score={detail.data.productivityScore} />
                <ScoreBar label="Completion" score={detail.data.completionScore} />
                <ScoreBar label="Quality" score={detail.data.qualityScore} />
                <ScoreBar label="Timeliness" score={detail.data.timelinessScore} />
              </div>
            </div>

            <div>
              <div className="activity-summary-grid">
                <div className="as-item"><span className="as-val">{detail.data.totalActivities}</span><span className="as-lbl">Total</span></div>
                <div className="as-item"><span className="as-val">{detail.data.completed}</span><span className="as-lbl">Completed</span></div>
                <div className="as-item"><span className="as-val">{detail.data.pending}</span><span className="as-lbl">Pending</span></div>
                <div className="as-item"><span className="as-val">{detail.data.rejected}</span><span className="as-lbl">Rejected</span></div>
              </div>

              <div className="module-mini-grid" style={{ marginTop: 16 }}>
                <div className="module-mini-card">
                  <div className="mmc-icon blue"><Icon name="location-dot" /></div>
                  <div className="mmc-info"><div className="mmc-label">Visits</div><div className="mmc-value">{detail.data.visits}</div></div>
                </div>
                <div className="module-mini-card">
                  <div className="mmc-icon green"><Icon name="comments" /></div>
                  <div className="mmc-info"><div className="mmc-label">Interviews</div><div className="mmc-value">{detail.data.interviews}</div></div>
                </div>
                <div className="module-mini-card">
                  <div className="mmc-icon teal"><Icon name="cash-register" /></div>
                  <div className="mmc-info"><div className="mmc-label">Weekly Sales</div><div className="mmc-value">{detail.data.weeklySales}</div></div>
                </div>
                <div className="module-mini-card">
                  <div className="mmc-icon amber"><Icon name="money-bill-trend-up" /></div>
                  <div className="mmc-info"><div className="mmc-label">Pricing</div><div className="mmc-value">{detail.data.pricing}</div></div>
                </div>
                <div className="module-mini-card">
                  <div className="mmc-icon purple"><Icon name="clipboard-list" /></div>
                  <div className="mmc-info"><div className="mmc-label">Forms</div><div className="mmc-value">{detail.data.forms}</div></div>
                </div>
                <div className="module-mini-card">
                  <div className="mmc-icon red"><Icon name="photo-film" /></div>
                  <div className="mmc-info"><div className="mmc-label">Multimedia</div><div className="mmc-value">{detail.data.multimedia}</div></div>
                </div>
              </div>
            </div>
          </div>

          {detail.data.monthlyTrend && detail.data.monthlyTrend.length > 0 && (
            <Card title="Monthly Trend" style={{ marginTop: 16 }}>
              <BarChart
                data={detail.data.monthlyTrend.map((t) => ({ label: t.month, value: t.activities }))}
                color="var(--primary)"
              />
            </Card>
          )}

          {detail.data.recentActivity && detail.data.recentActivity.length > 0 && (
            <Card title="Recent Activity" style={{ marginTop: 16 }}>
              <table className="data-table compact">
                <thead>
                  <tr><th>Module</th><th>Date</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {detail.data.recentActivity.slice(0, 10).map((a, i) => (
                    <tr key={i}>
                      <td>{a.module}</td>
                      <td>{a.date}</td>
                      <td><Badge tone={statusTone(a.status)}>{a.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      ) : <Empty />}
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Measurement Tab (monthly workbook entry: actual only, rest computed)        */
/* -------------------------------------------------------------------------- */
function statusToneBadge(s: string | null | undefined): 'success' | 'danger' | 'warning' | 'neutral' | 'info' {
  if (s === 'On Track' || s === 'Verified') return 'success';
  if (s === 'At Risk' || s === 'Pending') return 'warning';
  if (s === 'Off Track' || s === 'Rejected') return 'danger';
  if (s === 'No Data') return 'neutral';
  return 'info';
}

function MeasurementTab({ onRefresh }: { onRefresh: () => void }) {
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [cat, setCat] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<number, { actual?: string; override?: string; saving?: boolean; notes?: string }>>({});
  const evInputRef = useRef<HTMLInputElement | null>(null);
  const evTargetRef = useRef<MeasurementRow | null>(null);

  const query = qs({ year, month, category: cat, status, search });
  const data = useFetch<{ year: number; month: number | null; items: MeasurementRow[] }>(
    `/admin/kpi/measurement${query}`,
    [year, month, cat, status, search]
  );
  const items = data.data?.items ?? [];

  const categories = useMemo(() => Array.from(new Set(items.map((i) => i.Category).filter(Boolean))), [items]);

  const stats = useMemo(() => {
    const s = { onTrack: 0, atRisk: 0, offTrack: 0, noData: 0, pending: 0 };
    for (const i of items) {
      const fs = i.FinalStatus ?? 'No Data';
      if (fs === 'On Track') s.onTrack++;
      else if (fs === 'At Risk') s.atRisk++;
      else if (fs === 'Off Track') s.offTrack++;
      else s.noData++;
      if (i.VerificationStatus === 'Pending' && (i.ActualValue != null || i.FinalStatus != null)) s.pending++;
    }
    return s;
  }, [items]);

  function draftFor(row: MeasurementRow) {
    return drafts[row.KpiDefID] ?? {};
  }

  function setDraft(row: MeasurementRow, patch: Partial<{ actual: string; override: string; saving: boolean; notes: string }>) {
    setDrafts((d) => ({ ...d, [row.KpiDefID]: { ...d[row.KpiDefID], ...patch } }));
  }

  async function saveRow(row: MeasurementRow, evidenceReference?: string) {
    const d = draftFor(row);
    const actualStr = (d.actual ?? (row.ActualValue != null ? String(row.ActualValue) : '')).trim();
    let actualValue: number | null = null;
    if (actualStr !== '') {
      actualValue = Number(actualStr);
      if (!Number.isFinite(actualValue)) {
        toast.error('Actual value must be a number');
        return;
      }
    }
    const override = (d.override !== undefined ? d.override : row.StatusOverride ?? '') || null;
    const periodStart = row.PeriodStart ?? `${year}-${String(month).padStart(2, '0')}-01`;
    setDraft(row, { saving: true });
    try {
      await api('/admin/kpi/measurement', {
        method: 'POST',
        body: {
          kpiDefId: row.KpiDefID,
          periodStart,
          actualValue,
          statusOverride: override,
          notes: d.notes ?? row.Notes ?? null,
          evidenceReference: evidenceReference !== undefined ? evidenceReference : row.EvidenceReference,
        },
      });
      toast.success(`${row.KpiCode} saved`);
      await data.reload();
      onRefresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save measurement');
    } finally {
      setDraft(row, { saving: false });
    }
  }

  async function pickEvidence(row: MeasurementRow, file: File) {
    try {
      const fd = new FormData();
      fd.append('file', file);
      const uploaded = await api<{ url: string }>('/admin/kpi/evidence', { method: 'POST', body: fd });
      await saveRow(row, uploaded.url);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Evidence upload failed');
    } finally {
      if (evInputRef.current) evInputRef.current.value = '';
      evTargetRef.current = null;
    }
  }

  if (data.loading) return <Loading />;
  if (data.error) return <div className="empty" style={{ color: 'var(--danger)' }}>{data.error}</div>;

  return (
    <div>
      <div className="kpi-filters">
        <div className="filter-group">
          <Icon name="calendar" />
          <select value={year} onChange={(e) => setYear(e.target.value)}>
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">All months</option>
            {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => (
              <option key={m} value={String(i + 1)}>{m}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <Icon name="filter" />
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">All Categories</option>
            {categories.filter(Boolean).map((c) => <option key={c} value={c!}>{c}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="On Track">On Track</option>
            <option value="At Risk">At Risk</option>
            <option value="Off Track">Off Track</option>
            <option value="No Data">No Data</option>
          </select>
        </div>
        <div className="filter-group">
          <Icon name="search" />
          <input type="text" placeholder="Search KPIs..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="spacer" />
        <span className="sub-text">{items.length} rows</span>
        <input
          ref={evInputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && evTargetRef.current) void pickEvidence(evTargetRef.current, file);
          }}
        />
      </div>

      <div className="grid-4" style={{ marginBottom: 16 }}>
        <MetricCard icon="circle-check" label="On Track" value={stats.onTrack} color="var(--success, #00843D)" />
        <MetricCard icon="triangle-exclamation" label="At Risk" value={stats.atRisk} color="var(--warning, #A96A0A)" />
        <MetricCard icon="circle-xmark" label="Off Track" value={stats.offTrack} color="var(--danger)" />
        <MetricCard icon="hourglass-half" label="Pending Verification" value={stats.pending} color="var(--primary)" />
      </div>

      {items.length === 0 ? (
        <Empty />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>KPI</th>
              <th>Business Unit</th>
              <th>Owner</th>
              <th>Planned</th>
              <th>Actual</th>
              <th>Efficiency</th>
              <th>Auto</th>
              <th>Override</th>
              <th>Final</th>
              <th>Evidence</th>
              <th>Verification</th>
              <th>MIS Record</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => {
              const d = draftFor(row);
              const actualStr = d.actual ?? (row.ActualValue != null ? String(row.ActualValue) : '');
              const overrideStr = d.override !== undefined ? d.override : row.StatusOverride ?? '';
              return (
                <tr key={`${row.KpiDefID}-${row.PeriodStart ?? 'x'}`}>
                  <td><code>{row.KpiCode}</code></td>
                  <td>
                    <div className="plan-title-cell">
                      <strong>{row.KpiName}</strong>
                      <span className="sub-text" title={row.StrategicObjective ?? ''}>
                        {row.Category}{row.UnitOfMeasure ? ` · ${row.UnitOfMeasure}` : ''}
                      </span>
                    </div>
                  </td>
                  <td>{row.BusinessUnitName ?? '—'}</td>
                  <td>{row.KpiOwnerName ?? '—'}</td>
                  <td title={row.TargetText ?? ''}>
                    {row.PlannedValue != null ? row.PlannedValue : (row.PlannedText ?? '—')}
                  </td>
                  <td>
                    <input
                      type="number"
                      style={{ width: 90 }}
                      value={actualStr}
                      placeholder="—"
                      onChange={(e) => setDraft(row, { actual: e.target.value })}
                    />
                  </td>
                  <td>{row.EfficiencyPercent != null ? `${row.EfficiencyPercent}%` : '—'}</td>
                  <td>{row.AutoStatus ? <Badge tone={statusToneBadge(row.AutoStatus)}>{row.AutoStatus}</Badge> : '—'}</td>
                  <td>
                    <select
                      value={overrideStr}
                      style={{ width: 110 }}
                      onChange={(e) => setDraft(row, { override: e.target.value })}
                    >
                      <option value="">None</option>
                      <option value="On Track">On Track</option>
                      <option value="At Risk">At Risk</option>
                      <option value="Off Track">Off Track</option>
                    </select>
                  </td>
                  <td>
                    {row.FinalStatus
                      ? <Badge tone={statusToneBadge(row.FinalStatus)}>{row.FinalStatus}</Badge>
                      : <Badge tone="neutral">No Data</Badge>}
                  </td>
                  <td>
                    {row.EvidenceReference ? (
                      <a href={row.EvidenceReference} target="_blank" rel="noreferrer" title={row.EvidenceReference}>
                        <Icon name="paperclip" />
                      </a>
                    ) : (
                      <Button variant="ghost" size="sm" title="Attach evidence" onClick={() => { evTargetRef.current = row; evInputRef.current?.click(); }}>
                        <Icon name="plus" />
                      </Button>
                    )}
                  </td>
                  <td>
                    <Badge tone={statusToneBadge(row.VerificationStatus)}>{row.VerificationStatus ?? 'Pending'}</Badge>
                  </td>
                  <td className="date-cell">{row.MisRecordId ?? '—'}</td>
                  <td>
                    <Button variant="primary" size="sm" disabled={d.saving} onClick={() => void saveRow(row)}>
                      {d.saving ? '...' : 'Save'}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Verification Tab (Pending -> Verified / Rejected)                           */
/* -------------------------------------------------------------------------- */
function VerificationTab({ onRefresh }: { onRefresh: () => void }) {
  const [status, setStatus] = useState('Pending');
  const [busyId, setBusyId] = useState<number | null>(null);
  const data = useFetch<{ items: VerificationRow[]; total: number; status: string }>(
    `/admin/kpi/verification?status=${status}&pageSize=200`,
    [status]
  );

  async function act(row: VerificationRow, decision: 'Verified' | 'Rejected') {
    let note: string | null = '';
    if (decision === 'Rejected') {
      note = prompt('Rejection note (required):');
      if (note === null) return;
      if (!note.trim()) {
        toast.error('A rejection note is required');
        return;
      }
    }
    setBusyId(row.KpiResultID);
    try {
      const res = await api<{ updated: number }>('/admin/kpi/verify', {
        method: 'POST',
        body: { ids: [row.KpiResultID], decision, note: note || null },
      });
      if (res.updated === 0) toast.error('Row is no longer pending verification');
      else toast.success(`${row.KpiCode} ${decision.toLowerCase()}`);
      await data.reload();
      onRefresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Verification failed');
    } finally {
      setBusyId(null);
    }
  }

  if (data.loading) return <Loading />;
  if (data.error) return <div className="empty" style={{ color: 'var(--danger)' }}>{data.error}</div>;
  const items = data.data?.items ?? [];

  return (
    <div>
      <div className="kpi-filters">
        <div className="filter-group">
          <Icon name="filter" />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="Pending">Pending</option>
            <option value="Verified">Verified</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>
        <div className="spacer" />
        <span className="sub-text">{data.data?.total ?? items.length} records</span>
      </div>

      {items.length === 0 ? (
        <Empty message={status === 'Pending' ? 'Nothing pending verification' : undefined} />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>KPI</th>
              <th>Period</th>
              <th>Planned</th>
              <th>Actual</th>
              <th>Efficiency</th>
              <th>Final</th>
              <th>Notes</th>
              <th>Evidence</th>
              <th>MIS Record</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.KpiResultID}>
                <td><code>{row.KpiCode}</code></td>
                <td>
                  <div className="plan-title-cell">
                    <strong>{row.KpiName}</strong>
                    <span className="sub-text">{row.Category ?? ''}{row.BusinessUnitName ? ` · ${row.BusinessUnitName}` : ''}</span>
                  </div>
                </td>
                <td className="date-cell">{fmtDateShort(row.PeriodStart)}</td>
                <td>{row.PlannedValue != null ? row.PlannedValue : (row.PlannedText ?? '—')}</td>
                <td>{row.ActualValue ?? '—'}</td>
                <td>{row.EfficiencyPercent != null ? `${row.EfficiencyPercent}%` : '—'}</td>
                <td>{row.FinalStatus ? <Badge tone={statusToneBadge(row.FinalStatus)}>{row.FinalStatus}</Badge> : '—'}</td>
                <td title={row.VerificationNote ?? ''}>{row.Notes ?? '—'}</td>
                <td>
                  {row.EvidenceReference
                    ? <a href={row.EvidenceReference} target="_blank" rel="noreferrer"><Icon name="paperclip" /></a>
                    : '—'}
                </td>
                <td className="date-cell">{row.MisRecordId ?? '—'}</td>
                <td>
                  <Badge tone={statusToneBadge(row.VerificationStatus)}>{row.VerificationStatus}</Badge>
                  {row.ReviewerName ? <div className="sub-text">{row.ReviewerName}</div> : null}
                </td>
                <td>
                  {row.VerificationStatus === 'Pending' ? (
                    <div className="action-btns">
                      <Button variant="ghost" size="sm" disabled={busyId === row.KpiResultID} onClick={() => void act(row, 'Verified')} title="Verify">
                        <Icon name="check" />
                      </Button>
                      <Button variant="ghost" size="sm" disabled={busyId === row.KpiResultID} onClick={() => void act(row, 'Rejected')} title="Reject">
                        <Icon name="xmark" />
                      </Button>
                    </div>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* User Guide Tab                                                              */
/* -------------------------------------------------------------------------- */
function UserGuideTab() {
  return (
    <div className="user-guide">
      <Card title="Planning & Performance — User Guide">
        <div className="guide-content">
          <section className="guide-section">
            <h3><Icon name="compass" /> Overview</h3>
            <p>The Planning & Performance module helps you create strategic plans, define KPIs, track activities, and measure officer performance. It is organized into 9 tabs:</p>
            <div className="guide-tabs-overview">
              <div className="guide-tab-item"><Icon name="chart-pie" /> <b>Dashboard</b> — Overview metrics, trends, and planned vs achieved</div>
              <div className="guide-tab-item"><Icon name="clipboard-list" /> <b>Plans</b> — Create and manage strategic plans (Annual, Quarterly, Monthly, Weekly)</div>
              <div className="guide-tab-item"><Icon name="list-check" /> <b>Activities</b> — Track activities linked to each plan</div>
              <div className="guide-tab-item"><Icon name="bullseye" /> <b>KPI Definitions</b> — Define measurable KPIs with thresholds and weights; import the annual workbook</div>
              <div className="guide-tab-item"><Icon name="gauge-high" /> <b>Measurement</b> — Monthly planned vs actual entry, evidence upload, status and MIS record IDs</div>
              <div className="guide-tab-item"><Icon name="check-double" /> <b>Verification</b> — Approve or reject measured KPIs (Pending → Verified / Rejected)</div>
              <div className="guide-tab-item"><Icon name="ranking-star" /> <b>Ranking</b> — See officer performance rankings and details</div>
              <div className="guide-tab-item"><Icon name="chart-column" /> <b>Results</b> — View KPI results and planned vs achieved (Officer or Measurement records)</div>
              <div className="guide-tab-item"><Icon name="book" /> <b>User Guide</b> — This guide</div>
            </div>
          </section>

          <section className="guide-section">
            <h3><Icon name="clipboard-list" /> Plans</h3>
            <p>Plans are the top-level strategic documents. Each plan has a frequency, period, and can contain child plans.</p>
            <ul>
              <li><b>Create:</b> Click "New Plan" and fill in the required fields (Title, Frequency, Period Start/End).</li>
              <li><b>Hierarchy:</b> Switch to "Hierarchy" view to see parent-child relationships.</li>
              <li><b>Status Quick Toggle:</b> Click on the status badge in the table to quickly change a plan's status.</li>
              <li><b>Approval Workflow:</b> Plans go through Draft → Submitted → Reviewed → Approved/Rejected.</li>
            </ul>
          </section>

          <section className="guide-section">
            <h3><Icon name="list-check" /> Activities</h3>
            <p>Activities are the specific tasks under each plan. Select a plan from the dropdown to see its activities.</p>
            <ul>
              <li><b>Create:</b> Select a plan first, then click "New Activity".</li>
              <li><b>Priority:</b> Set priority levels (Low, Medium, High, Critical) for each activity.</li>
              <li><b>Status Quick Toggle:</b> Click on the status badge to quickly update progress.</li>
              <li><b>Targets:</b> Set measurable targets with units for each activity.</li>
            </ul>
          </section>

          <section className="guide-section">
            <h3><Icon name="bullseye" /> KPI Definitions</h3>
            <p>KPIs define what you measure. Each KPI has a code, name, category, target, weight, and thresholds.</p>
            <ul>
              <li><b>Categories:</b> Group KPIs by category (e.g., Sales, Field, Quality).</li>
              <li><b>Weight:</b> Higher weight = more impact on overall score. Total weight across categories is shown in the bar chart.</li>
              <li><b>Thresholds:</b> Define Excellent, Good, and Average thresholds for automatic rating.</li>
              <li><b>Direction:</b> "Higher is Better" (e.g., sales) or "Lower is Better" (e.g., complaints).</li>
            </ul>
          </section>

          <section className="guide-section">
            <h3><Icon name="ranking-star" /> Officer Ranking</h3>
            <p>Officers are ranked based on a composite score from 4 dimensions:</p>
            <div className="guide-scores">
              <div className="guide-score-item"><span className="guide-score-label">Productivity</span> — Total activities completed relative to assigned workload</div>
              <div className="guide-score-item"><span className="guide-score-label">Completion</span> — Percentage of activities marked as completed</div>
              <div className="guide-score-item"><span className="guide-score-label">Quality</span> — Average satisfaction scores and approval rates</div>
              <div className="guide-score-item"><span className="guide-score-label">Timeliness</span> — Activities completed before or on deadline</div>
            </div>
            <p>Click on any officer row to see their detailed profile, score breakdown, module activity, and monthly trend.</p>
          </section>

          <section className="guide-section">
            <h3><Icon name="chart-column" /> Results</h3>
            <p>The Results tab shows two views:</p>
            <ul>
              <li><b>Planned vs Achieved:</b> Aggregated achievement across all officers for each KPI.</li>
              <li><b>KPI Results:</b> Individual officer KPI results with target, actual, achievement %, and rating.</li>
            </ul>
            <p>Use the KPI filter to focus on a specific KPI across both views.</p>
          </section>

          <section className="guide-section">
            <h3><Icon name="lightbulb" /> Tips</h3>
            <ul>
              <li>Use the <b>date range filter</b> at the top to focus on a specific period.</li>
              <li>The <b>Dashboard</b> tab gives you a quick overview — check it daily.</li>
              <li>Click <b>Reset</b> to restore the default 6-month date range.</li>
              <li>All changes are saved immediately via the API — no separate "Save" button on the main page.</li>
              <li>Use the <b>status quick toggle</b> on any plan or activity row to update status without opening the edit modal.</li>
            </ul>
          </section>
        </div>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main Page                                                                   */
/* -------------------------------------------------------------------------- */
function KpiPage() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dateFrom, setDateFrom] = useState(monthsAgo(6));
  const [dateTo, setDateTo] = useState(today());
  const [selectedOfficer, setSelectedOfficer] = useState<OfficerKpi | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const qs = `?from=${dateFrom}&to=${dateTo}`;
  const summary = useFetch<KpiSummary>(`/admin/kpi/summary${qs}`, [dateFrom, dateTo, refreshKey]);
  const planningSummary = useFetch<PlanningSummary>(`/admin/planning/summary${qs}`, [dateFrom, dateTo, refreshKey]);
  const officers = useFetch<{ items: OfficerKpi[] }>(`/admin/kpi/officers${qs}`, [dateFrom, dateTo, refreshKey]);
  const trends = useFetch<{ items: KpiTrend[] }>(`/admin/kpi/trends${qs}`, [dateFrom, dateTo, refreshKey]);
  const plans = useFetch<{ items: Plan[]; total: number }>(`/admin/plans?pageSize=100`, [refreshKey]);
  const kpiDefs = useFetch<{ items: KpiDefinition[]; total: number }>(`/admin/kpi/definitions?pageSize=100`, [refreshKey]);
  const pva = useFetch<{ items: PlannedVsAchieved[] }>(`/admin/kpi/planned-vs-achieved`, [refreshKey]);

  const tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'plans', label: 'Plans', badge: plans.data?.total },
    { id: 'activities', label: 'Activities' },
    { id: 'kpi-defs', label: 'KPI Definitions', badge: kpiDefs.data?.total },
    { id: 'measurement', label: 'Measurement' },
    { id: 'verification', label: 'Verification' },
    { id: 'ranking', label: 'Ranking', badge: officers.data?.items.length },
    { id: 'results', label: 'Results' },
    { id: 'guide', label: 'User Guide' },
  ];

  function resetDates() {
    setDateFrom(monthsAgo(6));
    setDateTo(today());
  }

  function refreshAll() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <Guard>
      <RequireRole roles={['Administrator']}>
        <div className="content">
          <div className="kpi-hero">
            <div className="kpi-hero-icon"><Icon name="chart-bar" /></div>
              <div className="kpi-hero-info">
                <h2>Planning & Performance</h2>
                <p>Strategic planning, KPI management, and performance tracking</p>
                <TourTrigger tourId="admin-kpi" />
              </div>
            <div className="kpi-hero-stats">
              <div className="kpi-hero-stat">
                <div className="lhs">{planningSummary.data?.activePlans ?? '—'}</div>
                <div className="lbl">Active Plans</div>
              </div>
              <div className="kpi-hero-stat">
                <div className="lhs">{planningSummary.data?.completedActivities ?? '—'}</div>
                <div className="lbl">Completed</div>
              </div>
              <div className="kpi-hero-stat">
                <div className="lhs">{summary.data?.completionRate ?? '—'}%</div>
                <div className="lbl">Completion</div>
              </div>
              <div className="kpi-hero-stat">
                <div className="lhs">{officers.data?.items.length ?? '—'}</div>
                <div className="lbl">Officers</div>
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
            <Button variant="ghost" size="sm" onClick={refreshAll}><Icon name="arrows-rotate" /> Refresh</Button>
          </div>

          <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

          <div style={{ marginTop: 16 }}>
            {activeTab === 'dashboard' && (
              <DashboardTab
                summary={summary.data}
                planningSummary={planningSummary.data}
                pva={pva.data?.items ?? []}
                trends={trends.data?.items ?? []}
                loading={summary.loading || planningSummary.loading || trends.loading}
                error={summary.error || planningSummary.error}
              />
            )}
            {activeTab === 'plans' && (
              <PlansTab plans={plans.data} loading={plans.loading} error={plans.error} onRefresh={refreshAll} />
            )}
            {activeTab === 'activities' && (
              <ActivitiesTab onRefresh={refreshAll} />
            )}
            {activeTab === 'kpi-defs' && (
              <KpiDefsTab defs={kpiDefs.data} loading={kpiDefs.loading} error={kpiDefs.error} onRefresh={refreshAll} />
            )}
            {activeTab === 'measurement' && (
              <MeasurementTab onRefresh={refreshAll} />
            )}
            {activeTab === 'verification' && (
              <VerificationTab onRefresh={refreshAll} />
            )}
            {activeTab === 'ranking' && (
              <RankingTab
                officers={officers.data?.items ?? null}
                loading={officers.loading}
                error={officers.error}
                onSelect={setSelectedOfficer}
              />
            )}
            {activeTab === 'results' && (
              <ResultsTab
                pva={pva.data?.items ?? []}
                refreshKey={refreshKey}
                pvaLoading={pva.loading}
                pvaError={pva.error}
              />
            )}
            {activeTab === 'guide' && (
              <UserGuideTab />
            )}
          </div>

          <OfficerDetailModal officer={selectedOfficer} onClose={() => setSelectedOfficer(null)} />
        </div>
      </RequireRole>
    </Guard>
  );
}

export default KpiPage;
