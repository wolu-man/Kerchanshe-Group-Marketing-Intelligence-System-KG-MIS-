'use client';

import { Fragment, useMemo, useState } from 'react';
import { Guard, RequireRole } from '@/components/Guard';
import { Button, Card, Badge, Modal, Tabs, Icon, Loading, Empty, Pagination } from '@/components/ui';
import { useFetch } from '@/lib/use-api';
import { api, apiBlob, ApiError, qs, downloadFile } from '@/lib/api';
import { toast } from '@/components/Toast';
import { TourTrigger } from '@/components/tour/TourTrigger';
import type { CorpTask, CorpTaskPage, CorpEvent, CorpSummary } from '@/lib/types';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function statusTone(s: string | null | undefined): 'success' | 'danger' | 'warning' | 'neutral' | 'info' {
  if (s === 'Verified' || s === 'Completed') return 'success';
  if (s === 'Not Verified' || s === 'Planned') return 'warning';
  if (s === 'Rejected' || s === 'Cancelled') return 'danger';
  if (s === 'In Progress') return 'info';
  return 'neutral';
}

function StatCard({ icon, label, value, sub, tone }: { icon: string; label: string; value: string | number; sub?: string; tone: 'blue' | 'green' | 'amber' | 'red' }) {
  return (
    <div className="kpi-oc">
      <div className={`kpi-oc-icon ${tone}`}><Icon name={icon} /></div>
      <div className="kpi-oc-body">
        <div className="kpi-oc-label">{label}</div>
        <div className="kpi-oc-value">{value}</div>
        {sub && <div className="kpi-oc-sub">{sub}</div>}
      </div>
    </div>
  );
}

function numOrNull(s: string): number | null {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/* -------------------------------------------------------------------------- */
/* Dashboard tab                                                               */
/* -------------------------------------------------------------------------- */
function DashboardTab({
  summary, year, month, setYear, setMonth,
}: {
  summary: CorpSummary | null;
  year: string;
  month: string;
  setYear: (y: string) => void;
  setMonth: (m: string) => void;
}) {
  const now = new Date();
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
            {MONTH_NAMES.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
          </select>
        </div>
      </div>
      {!summary ? <Loading /> : (
        <>
          <div className="kpi-overview-grid" style={{ marginBottom: 16 }}>
            <StatCard icon="chart-pie" label="Total tasks" value={summary.tasks.total} tone="blue" />
            <StatCard icon="circle-check" label="Verified" value={summary.tasks.verified} tone="green" />
            <StatCard icon="hourglass-half" label="Not verified" value={summary.tasks.notVerified} tone="amber" />
            <StatCard icon="circle-xmark" label="Rejected" value={summary.tasks.rejected} tone="red" />
          </div>
          <div className="kpi-overview-grid" style={{ marginBottom: 16 }}>
            <StatCard icon="chart-simple" label="Avg completion" value={summary.tasks.avgCompletion != null ? `${summary.tasks.avgCompletion}%` : '—'} tone="blue" />
            <StatCard icon="user-check" label="Assigned" value={summary.tasks.assigned} sub="rows with a responsible person" tone="green" />
            <StatCard icon="calendar-check" label="Events planned" value={summary.events.planned} sub={`${summary.events.total} event shells`} tone="amber" />
            <StatCard icon="flag-checkered" label="Events completed" value={summary.events.completed} tone="blue" />
          </div>
          <Card title="Rollup by responsible role">
            <table className="data-table">
              <thead>
                <tr><th>Responsible role</th><th>Tasks</th><th>Verified</th><th>Avg completion</th></tr>
              </thead>
              <tbody>
                {summary.byRole.map((r) => (
                  <tr key={r.ResponsibleRole ?? '-'}>
                    <td>{r.ResponsibleRole ?? '—'}</td>
                    <td>{r.total}</td>
                    <td>{r.verified}</td>
                    <td>{r.avgCompletion != null ? `${Math.round(r.avgCompletion)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Monthly Plan tab                                                            */
/* -------------------------------------------------------------------------- */
function PlanTab({
  year, month, setYear, setMonth, roles, onRefresh,
}: {
  year: string;
  month: string;
  setYear: (y: string) => void;
  setMonth: (m: string) => void;
  roles: string[];
  onRefresh: () => void;
}) {
  const now = new Date();
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [drafts, setDrafts] = useState<Record<number, { person?: string; completion?: string; remarks?: string; saving?: boolean }>>({});

  const data = useFetch<CorpTaskPage>(
    `/admin/corp-marketing/tasks?${qs({ year, month, role, status, search, page, pageSize })}`,
    [year, month, role, status, search, page, pageSize]
  );
  const items = data.data?.items ?? [];
  const total = data.data?.total ?? 0;

  const parents = useFetch<{ items: { ParentCode: string; MainActivityKpi: string | null }[] }>(
    `/admin/corp-marketing/parents?${qs({ year })}`,
    [year]
  );

  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<Record<string, string>>({});
  const [createSaving, setCreateSaving] = useState(false);
  const [editing, setEditing] = useState<CorpTask | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [editSaving, setEditSaving] = useState(false);
  const [deleting, setDeleting] = useState<CorpTask | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  function openCreate() {
    setCreateForm({
      month: month || String(now.getMonth() + 1),
      parentCode: '',
      newParentCode: '',
      newParentName: '',
      taskName: '',
      responsibleRole: '',
      responsiblePerson: '',
      completionPercent: '',
      evidenceRemarks: '',
    });
    setCreating(true);
  }

  async function saveCreate() {
    const f = createForm;
    const isNewParent = f.parentCode === '__new__';
    const parentCode = isNewParent ? f.newParentCode.trim() : f.parentCode;
    if (!parentCode) { toast.error('Select or enter a parent activity'); return; }
    if (isNewParent && !f.newParentName.trim()) { toast.error('New parent needs a name'); return; }
    if (!f.taskName.trim()) { toast.error('Task name is required'); return; }
    const completion = numOrNull(f.completionPercent ?? '');
    if (completion != null && (completion < 0 || completion > 100)) {
      toast.error('Completion must be between 0 and 100');
      return;
    }
    setCreateSaving(true);
    try {
      const res = await api<{ taskId: string }>('/admin/corp-marketing/tasks', {
        method: 'POST',
        body: {
          planYear: Number(year),
          month: Number(f.month),
          parentCode,
          parentName: isNewParent ? f.newParentName.trim() : undefined,
          taskName: f.taskName.trim(),
          responsibleRole: f.responsibleRole.trim() || null,
          responsiblePerson: f.responsiblePerson.trim() || null,
          completionPercent: completion,
          evidenceRemarks: f.evidenceRemarks.trim() || null,
        },
      });
      toast.success(`Task ${res.taskId} created`);
      setCreating(false);
      await data.reload();
      await parents.reload();
      onRefresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to create task');
    } finally {
      setCreateSaving(false);
    }
  }

  function openEdit(row: CorpTask) {
    setEditing(row);
    setEditForm({
      taskName: row.TaskName,
      responsibleRole: row.ResponsibleRole ?? '',
      responsiblePerson: row.ResponsiblePerson ?? '',
      completionPercent: row.CompletionPercent != null ? String(row.CompletionPercent) : '',
      evidenceRemarks: row.EvidenceRemarks ?? '',
    });
  }

  async function saveEdit() {
    if (!editing) return;
    const completion = numOrNull(editForm.completionPercent ?? '');
    if (completion != null && (completion < 0 || completion > 100)) {
      toast.error('Completion must be between 0 and 100');
      return;
    }
    setEditSaving(true);
    try {
      await api(`/admin/corp-marketing/tasks/${editing.CorpTaskID}`, {
        method: 'PUT',
        body: {
          taskName: editForm.taskName.trim(),
          responsibleRole: editForm.responsibleRole.trim() || null,
          responsiblePerson: editForm.responsiblePerson.trim() || null,
          completionPercent: completion,
          evidenceRemarks: editForm.evidenceRemarks.trim() || null,
        },
      });
      toast.success(`${editing.TaskId} saved`);
      setEditing(null);
      await data.reload();
      onRefresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save task');
    } finally {
      setEditSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteSaving(true);
    try {
      await api(`/admin/corp-marketing/tasks/${deleting.CorpTaskID}`, { method: 'DELETE' });
      toast.success(`${deleting.TaskId} deleted`);
      setDeleting(null);
      await data.reload();
      onRefresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete task');
    } finally {
      setDeleteSaving(false);
    }
  }

  const stats = useMemo(() => {
    const s = { verified: 0, notVerified: 0, rejected: 0 };
    for (const i of items) {
      if (i.Status === 'Verified') s.verified++;
      else if (i.Status === 'Rejected') s.rejected++;
      else s.notVerified++;
    }
    return s;
  }, [items]);

  async function exportTasks(format: 'csv' | 'xlsx') {
    const blob = await apiBlob(`/admin/corp-marketing/tasks/export${qs({
      year, month, role, status, parentCode: undefined, search, format
    })}`);
    const ext = format === 'xlsx' ? 'xlsx' : 'csv';
    downloadFile(blob, `corp-marketing-tasks-${year}${month ? '-' + month.padStart(2, '0') : ''}-${Date.now()}.${ext}`);
    toast.success(`Tasks exported as ${ext.toUpperCase()}`);
  }

  function draftFor(row: CorpTask) {
    return drafts[row.CorpTaskID] ?? {};
  }
  function setDraft(row: CorpTask, patch: Partial<{ person: string; completion: string; remarks: string; saving: boolean }>) {
    setDrafts((d) => ({ ...d, [row.CorpTaskID]: { ...d[row.CorpTaskID], ...patch } }));
  }

  async function saveRow(row: CorpTask) {
    const d = draftFor(row);
    const completion = numOrNull(d.completion ?? (row.CompletionPercent != null ? String(row.CompletionPercent) : ''));
    if (completion != null && (completion < 0 || completion > 100)) {
      toast.error('Completion must be between 0 and 100');
      return;
    }
    setDraft(row, { saving: true });
    try {
      await api(`/admin/corp-marketing/tasks/${row.CorpTaskID}`, {
        method: 'PUT',
        body: {
          responsiblePerson: d.person ?? row.ResponsiblePerson,
          completionPercent: completion,
          evidenceRemarks: d.remarks ?? row.EvidenceRemarks,
        },
      });
      toast.success(`${row.TaskId} saved`);
      await data.reload();
      onRefresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save task');
    } finally {
      setDraft(row, { saving: false });
    }
  }

  async function act(row: CorpTask, decision: 'Verified' | 'Rejected') {
    let note: string | null = '';
    if (decision === 'Rejected') {
      note = prompt('Rejection note (required):');
      if (note === null) return;
      if (!note.trim()) {
        toast.error('A rejection note is required');
        return;
      }
    }
    try {
      const res = await api<{ updated: number }>('/admin/corp-marketing/verify', {
        method: 'POST',
        body: { ids: [row.CorpTaskID], decision, note: note || null },
      });
      if (res.updated === 0) toast.error('Task is no longer pending verification');
      else toast.success(`${row.TaskId} ${decision.toLowerCase()}`);
      await data.reload();
      onRefresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Verification failed');
    }
  }

  let prevParent = '';

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
            {MONTH_NAMES.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <Icon name="filter" />
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All roles</option>
            {roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="Not Verified">Not Verified</option>
            <option value="Verified">Verified</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>
        <div className="filter-group">
          <Icon name="search" />
          <input type="text" placeholder="Search tasks..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="spacer" />
        <span className="sub-text">{data.data?.total ?? items.length} tasks</span>
        <Button variant="ghost" size="sm" onClick={() => exportTasks('csv')}>
          <Icon name="download" /> CSV
        </Button>
        <Button variant="ghost" size="sm" onClick={() => exportTasks('xlsx')}>
          <Icon name="download" /> Excel
        </Button>
        <Button variant="primary" size="sm" onClick={openCreate}>
          <Icon name="plus" /> Add task
        </Button>
      </div>

      <div className="kpi-overview-grid" style={{ marginBottom: 16 }}>
        <StatCard icon="circle-check" label="Verified" value={stats.verified} tone="green" />
        <StatCard icon="hourglass-half" label="Not verified" value={stats.notVerified} tone="amber" />
        <StatCard icon="circle-xmark" label="Rejected" value={stats.rejected} tone="red" />
        <StatCard icon="calendar" label="Month" value={month ? MONTH_NAMES[Number(month) - 1] : 'All'} sub={year} tone="blue" />
      </div>

      {data.loading ? <Loading /> : data.error ? (
        <div className="empty" style={{ color: 'var(--danger)' }}>{data.error}</div>
      ) : items.length === 0 ? <Empty /> : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Role</th>
                <th>Person</th>
                <th>Completion %</th>
                <th>Evidence / Remarks</th>
                <th>Status</th>
                <th>Task ID</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const d = draftFor(row);
                const groupChanged = row.ParentCode !== prevParent;
                prevParent = row.ParentCode;
                return (
                  <Fragment key={row.CorpTaskID}>
                    {groupChanged && (
                      <tr>
                        <td colSpan={8} style={{ background: 'var(--bg-subtle, #f4f6fa)', fontWeight: 600 }}>
                          <code>{row.ParentCode}</code> — {row.MainActivityKpi}
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td title={row.TaskName}>{row.TaskName.length > 70 ? `${row.TaskName.slice(0, 70)}…` : row.TaskName}</td>
                      <td>{row.ResponsibleRole ?? '—'}</td>
                      <td>
                        <input
                          style={{ width: 160 }}
                          value={d.person ?? row.ResponsiblePerson ?? ''}
                          placeholder="Assign..."
                          onChange={(e) => setDraft(row, { person: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          style={{ width: 80 }}
                          value={d.completion ?? (row.CompletionPercent != null ? String(row.CompletionPercent) : '')}
                          placeholder="—"
                          onChange={(e) => setDraft(row, { completion: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          style={{ width: 200 }}
                          value={d.remarks ?? row.EvidenceRemarks ?? ''}
                          placeholder="—"
                          onChange={(e) => setDraft(row, { remarks: e.target.value })}
                        />
                      </td>
                      <td>
                        <Badge tone={statusTone(row.Status)}>{row.Status}</Badge>
                        {row.Status === 'Rejected' && row.VerificationNote ? (
                          <div className="sub-text" title={row.VerificationNote}>{row.VerificationNote.slice(0, 40)}</div>
                        ) : null}
                      </td>
                      <td className="date-cell"><code>{row.TaskId}</code></td>
                      <td>
                        <div className="action-btns">
                          <Button variant="primary" size="sm" disabled={d.saving} onClick={() => void saveRow(row)}>
                            {d.saving ? '...' : 'Save'}
                          </Button>
                          <Button variant="ghost" size="sm" title="Edit details" onClick={() => openEdit(row)}>
                            <Icon name="pen" />
                          </Button>
                          {row.Status === 'Not Verified' ? (
                            <>
                              <Button variant="ghost" size="sm" title="Verify" onClick={() => void act(row, 'Verified')}>
                                <Icon name="check" />
                              </Button>
                              <Button variant="ghost" size="sm" title="Reject" onClick={() => void act(row, 'Rejected')}>
                                <Icon name="xmark" />
                              </Button>
                            </>
                          ) : null}
                          <Button variant="ghost" size="sm" title="Delete task" onClick={() => setDeleting(row)}>
                            <Icon name="trash" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          <Pagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} />
        </>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Add task" wide>
        <div className="form-grid">
          <div className="form-field">
            <label>Month *</label>
            <select value={createForm.month ?? ''} onChange={(e) => setCreateForm((f) => ({ ...f, month: e.target.value }))}>
              {MONTH_NAMES.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label>Parent activity *</label>
            <select value={createForm.parentCode ?? ''} onChange={(e) => setCreateForm((f) => ({ ...f, parentCode: e.target.value }))}>
              <option value="">Select parent…</option>
              {(parents.data?.items ?? []).map((p) => (
                <option key={p.ParentCode} value={p.ParentCode}>{p.ParentCode} — {p.MainActivityKpi ?? ''}</option>
              ))}
              <option value="__new__">+ New parent activity…</option>
            </select>
          </div>
          {createForm.parentCode === '__new__' ? (
            <>
              <div className="form-field">
                <label>New parent code *</label>
                <input type="text" maxLength={20} placeholder="e.g. MK-001" value={createForm.newParentCode ?? ''} onChange={(e) => setCreateForm((f) => ({ ...f, newParentCode: e.target.value }))} />
              </div>
              <div className="form-field">
                <label>New parent name *</label>
                <input type="text" maxLength={500} value={createForm.newParentName ?? ''} onChange={(e) => setCreateForm((f) => ({ ...f, newParentName: e.target.value }))} />
              </div>
            </>
          ) : null}
          <div className="form-field full-width">
            <label>Task name *</label>
            <input type="text" maxLength={500} value={createForm.taskName ?? ''} onChange={(e) => setCreateForm((f) => ({ ...f, taskName: e.target.value }))} />
          </div>
          <div className="form-field">
            <label>Responsible role</label>
            <input type="text" list="corp-roles" value={createForm.responsibleRole ?? ''} onChange={(e) => setCreateForm((f) => ({ ...f, responsibleRole: e.target.value }))} />
            <datalist id="corp-roles">
              {roles.map((r) => <option key={r} value={r} />)}
            </datalist>
          </div>
          <div className="form-field">
            <label>Responsible person</label>
            <input type="text" value={createForm.responsiblePerson ?? ''} onChange={(e) => setCreateForm((f) => ({ ...f, responsiblePerson: e.target.value }))} />
          </div>
          <div className="form-field">
            <label>Completion %</label>
            <input type="number" min={0} max={100} value={createForm.completionPercent ?? ''} onChange={(e) => setCreateForm((f) => ({ ...f, completionPercent: e.target.value }))} />
          </div>
          <div className="form-field full-width">
            <label>Evidence / Remarks</label>
            <textarea rows={2} maxLength={2000} value={createForm.evidenceRemarks ?? ''} onChange={(e) => setCreateForm((f) => ({ ...f, evidenceRemarks: e.target.value }))} />
          </div>
        </div>
        <div className="modal-actions">
          <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => void saveCreate()} disabled={createSaving}>{createSaving ? 'Saving…' : 'Create task'}</Button>
        </div>
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `Edit ${editing.TaskId}` : 'Edit task'} wide>
        <div className="form-grid">
          <div className="form-field full-width">
            <label>Task name *</label>
            <input type="text" maxLength={500} value={editForm.taskName ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, taskName: e.target.value }))} />
          </div>
          <div className="form-field">
            <label>Responsible role</label>
            <input type="text" list="corp-roles" value={editForm.responsibleRole ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, responsibleRole: e.target.value }))} />
          </div>
          <div className="form-field">
            <label>Responsible person</label>
            <input type="text" value={editForm.responsiblePerson ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, responsiblePerson: e.target.value }))} />
          </div>
          <div className="form-field">
            <label>Completion %</label>
            <input type="number" min={0} max={100} value={editForm.completionPercent ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, completionPercent: e.target.value }))} />
          </div>
          <div className="form-field full-width">
            <label>Evidence / Remarks</label>
            <textarea rows={2} maxLength={2000} value={editForm.evidenceRemarks ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, evidenceRemarks: e.target.value }))} />
          </div>
        </div>
        <div className="modal-actions">
          <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="primary" onClick={() => void saveEdit()} disabled={editSaving}>{editSaving ? 'Saving…' : 'Save'}</Button>
        </div>
      </Modal>

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title={deleting ? `Delete ${deleting.TaskId}?` : 'Delete task'}>
        <p>
          Permanently delete task <b>{deleting?.TaskId}</b> ({deleting?.TaskName})? This cannot be undone.
        </p>
        <div className="modal-actions">
          <Button variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button>
          <Button variant="primary" onClick={() => void confirmDelete()} disabled={deleteSaving}>{deleteSaving ? 'Deleting…' : 'Delete'}</Button>
        </div>
      </Modal>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Events & Campaigns tab                                                      */
/* -------------------------------------------------------------------------- */
function EventsTab({ onRefresh }: { onRefresh: () => void }) {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [edit, setEdit] = useState<CorpEvent | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<CorpEvent | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  const data = useFetch<{ items: CorpEvent[]; total: number }>(
    `/admin/corp-marketing/events?${qs({ status, search, page, pageSize })}`,
    [status, search, page, pageSize]
  );
  const items = data.data?.items ?? [];
  const total = data.data?.total ?? 0;

  const EMPTY_FORM = {
    category: '', eventName: '', businessUnit: '', responsiblePerson: '', responsibleRole: '',
    location: '', startDate: '', endDate: '', status: 'Planned',
    plannedParticipants: '', actualParticipants: '', leadsGenerated: '', conversions: '',
    plannedRevenue: '', actualRevenue: '', approvedBudget: '', actualCost: '',
    reachImpressions: '', engagements: '', satisfactionScore: '',
    kpiTarget: '', kpiActual: '', evidenceLink: '', remarks: '',
  };

  function openCreate() {
    setEdit(null);
    setForm({ ...EMPTY_FORM });
    setCreating(true);
  }

  function openEdit(row: CorpEvent) {
    setCreating(false);
    setEdit(row);
    setForm({
      category: row.Category ?? '',
      eventName: row.EventName ?? '',
      businessUnit: row.BusinessUnit ?? '',
      responsiblePerson: row.ResponsiblePerson ?? '',
      responsibleRole: row.ResponsibleRole ?? '',
      location: row.Location ?? '',
      startDate: row.StartDate ?? '',
      endDate: row.EndDate ?? '',
      status: row.Status,
      plannedParticipants: row.PlannedParticipants != null ? String(row.PlannedParticipants) : '',
      actualParticipants: row.ActualParticipants != null ? String(row.ActualParticipants) : '',
      leadsGenerated: row.LeadsGenerated != null ? String(row.LeadsGenerated) : '',
      conversions: row.Conversions != null ? String(row.Conversions) : '',
      plannedRevenue: row.PlannedRevenue != null ? String(row.PlannedRevenue) : '',
      actualRevenue: row.ActualRevenue != null ? String(row.ActualRevenue) : '',
      approvedBudget: row.ApprovedBudget != null ? String(row.ApprovedBudget) : '',
      actualCost: row.ActualCost != null ? String(row.ActualCost) : '',
      reachImpressions: row.ReachImpressions != null ? String(row.ReachImpressions) : '',
      engagements: row.Engagements != null ? String(row.Engagements) : '',
      satisfactionScore: row.SatisfactionScore != null ? String(row.SatisfactionScore) : '',
      kpiTarget: row.KpiTarget ?? '',
      kpiActual: row.KpiActual ?? '',
      evidenceLink: row.EvidenceLink ?? '',
      remarks: row.Remarks ?? '',
    });
  }

  async function saveEvent() {
    if (creating) {
      if (!form.eventName?.trim()) { toast.error('Event name is required'); return; }
      setSaving(true);
      try {
        const created = await api<CorpEvent>('/admin/corp-marketing/events', {
          method: 'POST',
          body: eventBody(),
        });
        toast.success(`${created.EventCode} created`);
        setCreating(false);
        await data.reload();
        onRefresh();
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'Failed to create event');
      } finally {
        setSaving(false);
      }
      return;
    }
    if (!edit) return;
    setSaving(true);
    try {
      await api(`/admin/corp-marketing/events/${edit.CorpEventID}`, {
        method: 'PUT',
        body: eventBody(),
      });
      toast.success(`${edit.EventCode} saved`);
      setEdit(null);
      await data.reload();
      onRefresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save event');
    } finally {
      setSaving(false);
    }
  }

  function eventBody() {
    return {
      category: form.category || null,
      eventName: form.eventName || null,
      businessUnit: form.businessUnit || null,
      responsiblePerson: form.responsiblePerson || null,
      responsibleRole: form.responsibleRole || null,
      location: form.location || null,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      status: form.status,
      plannedParticipants: numOrNull(form.plannedParticipants ?? ''),
      actualParticipants: numOrNull(form.actualParticipants ?? ''),
      leadsGenerated: numOrNull(form.leadsGenerated ?? ''),
      conversions: numOrNull(form.conversions ?? ''),
      plannedRevenue: numOrNull(form.plannedRevenue ?? ''),
      actualRevenue: numOrNull(form.actualRevenue ?? ''),
      approvedBudget: numOrNull(form.approvedBudget ?? ''),
      actualCost: numOrNull(form.actualCost ?? ''),
      reachImpressions: numOrNull(form.reachImpressions ?? ''),
      engagements: numOrNull(form.engagements ?? ''),
      satisfactionScore: numOrNull(form.satisfactionScore ?? ''),
      kpiTarget: form.kpiTarget || null,
      kpiActual: form.kpiActual || null,
      evidenceLink: form.evidenceLink || null,
      remarks: form.remarks || null,
    };
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteSaving(true);
    try {
      await api(`/admin/corp-marketing/events/${deleting.CorpEventID}`, { method: 'DELETE' });
      toast.success(`${deleting.EventCode} deleted`);
      setDeleting(null);
      await data.reload();
      onRefresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete event');
    } finally {
      setDeleteSaving(false);
    }
  }

  async function exportEvents(format: 'csv' | 'xlsx') {
    const blob = await apiBlob(`/admin/corp-marketing/events/export${qs({ status, search, format })}`);
    const ext = format === 'xlsx' ? 'xlsx' : 'csv';
    downloadFile(blob, `corp-marketing-events-${Date.now()}.${ext}`);
    toast.success(`Events exported as ${ext.toUpperCase()}`);
  }

  const F = (key: string, label: string, type: 'text' | 'number' | 'date' = 'text') => (
    <div className="form-field" key={key}>
      <label>{label}</label>
      <input
        type={type}
        value={form[key] ?? ''}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <div>
      <div className="kpi-filters">
        <div className="filter-group">
          <Icon name="filter" />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="Planned">Planned</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>
        <div className="filter-group">
          <Icon name="search" />
          <input type="text" placeholder="Search events..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="spacer" />
        <span className="sub-text">{data.data?.total ?? items.length} events</span>
        <Button variant="ghost" size="sm" onClick={() => exportEvents('csv')}>
          <Icon name="download" /> CSV
        </Button>
        <Button variant="ghost" size="sm" onClick={() => exportEvents('xlsx')}>
          <Icon name="download" /> Excel
        </Button>
        <Button variant="primary" size="sm" onClick={openCreate}>
          <Icon name="plus" /> Add event
        </Button>
      </div>

      {data.loading ? <Loading /> : data.error ? (
        <div className="empty" style={{ color: 'var(--danger)' }}>{data.error}</div>
      ) : items.length === 0 ? <Empty message="No events match the filters" /> : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Event / Campaign</th>
                <th>Category</th>
                <th>BU</th>
                <th>Dates</th>
                <th>Status</th>
                <th>Budget</th>
                <th>Cost</th>
                <th>Variance</th>
                <th>Leads / Conv.</th>
                <th>ROI %</th>
                <th>Reach</th>
                <th>Eng. %</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.CorpEventID}>
                  <td><code>{row.EventCode}</code></td>
                  <td>
                    <div className="plan-title-cell">
                      <strong>{row.EventName ?? <span className="sub-text">Untitled</span>}</strong>
                      <span className="sub-text">{row.ResponsiblePerson ?? ''}{row.Location ? ` · ${row.Location}` : ''}</span>
                    </div>
                  </td>
                  <td>{row.Category ?? '—'}</td>
                  <td>{row.BusinessUnit ?? '—'}</td>
                  <td className="date-cell">
                    {row.StartDate ? `${row.StartDate}${row.EndDate ? ` → ${row.EndDate}` : ''}` : '—'}
                    {row.Month ? <div className="sub-text">{MONTH_NAMES[row.Month - 1]} · W{row.IsoWeek}</div> : null}
                  </td>
                  <td><Badge tone={statusTone(row.Status)}>{row.Status}</Badge></td>
                  <td>{row.ApprovedBudget != null ? row.ApprovedBudget.toLocaleString() : '—'}</td>
                  <td>{row.ActualCost != null ? row.ActualCost.toLocaleString() : '—'}</td>
                  <td>{row.BudgetVariance != null ? row.BudgetVariance.toLocaleString() : '—'}</td>
                  <td>{row.LeadsGenerated ?? '—'} / {row.Conversions ?? '—'}{row.ConversionRate != null ? <span className="sub-text"> ({row.ConversionRate}%)</span> : null}</td>
                  <td>{row.ROIPercent != null ? `${row.ROIPercent}%` : '—'}</td>
                  <td>{row.ReachImpressions != null ? row.ReachImpressions.toLocaleString() : '—'}</td>
                  <td>{row.EngagementRate != null ? `${row.EngagementRate}%` : '—'}</td>
                  <td>
                    <div className="action-btns">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                        <Icon name="pen" /> Edit
                      </Button>
                      <Button variant="ghost" size="sm" title="Delete event" onClick={() => setDeleting(row)}>
                        <Icon name="trash" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} />
        </>
      )}

      <Modal
        open={creating || !!edit}
        onClose={() => { setCreating(false); setEdit(null); }}
        title={creating ? 'Add event' : edit ? `Edit ${edit.EventCode}` : 'Edit event'}
        wide
      >
        <div className="form-grid">
          {F('eventName', 'Event / Campaign / Training')}
          {F('category', 'Category')}
          {F('businessUnit', 'Business Unit')}
          {F('responsiblePerson', 'Responsible Person')}
          {F('responsibleRole', 'Responsible Role')}
          {F('location', 'Location')}
          {F('startDate', 'Start Date', 'date')}
          {F('endDate', 'End Date', 'date')}
          <div className="form-field">
            <label>Status</label>
            <select value={form.status ?? 'Planned'} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              <option value="Planned">Planned</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
          {F('plannedParticipants', 'Planned Participants', 'number')}
          {F('actualParticipants', 'Actual Participants', 'number')}
          {F('leadsGenerated', 'Leads Generated', 'number')}
          {F('conversions', 'Conversions', 'number')}
          {F('plannedRevenue', 'Planned Revenue (ETB)', 'number')}
          {F('actualRevenue', 'Actual Revenue (ETB)', 'number')}
          {F('approvedBudget', 'Approved Budget (ETB)', 'number')}
          {F('actualCost', 'Actual Cost (ETB)', 'number')}
          {F('reachImpressions', 'Reach / Impressions', 'number')}
          {F('engagements', 'Engagements', 'number')}
          {F('satisfactionScore', 'Satisfaction Score %', 'number')}
          {F('kpiTarget', 'KPI Target / Measure')}
          {F('kpiActual', 'KPI Actual / Result')}
          {F('evidenceLink', 'Evidence / Link')}
          <div className="form-field full-width">
            <label>Remarks / Follow-up</label>
            <textarea rows={2} value={form.remarks ?? ''} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} />
          </div>
        </div>
        <div className="modal-actions">
          <Button variant="ghost" onClick={() => { setCreating(false); setEdit(null); }}>Cancel</Button>
          <Button variant="primary" onClick={() => void saveEvent()} disabled={saving}>
            {saving ? 'Saving...' : creating ? 'Create event' : 'Save'}
          </Button>
        </div>
      </Modal>

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title={deleting ? `Delete ${deleting.EventCode}?` : 'Delete event'}>
        <p>
          Permanently delete event <b>{deleting?.EventCode}</b> ({deleting?.EventName ?? 'untitled'})? This cannot be undone.
        </p>
        <div className="modal-actions">
          <Button variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button>
          <Button variant="primary" onClick={() => void confirmDelete()} disabled={deleteSaving}>{deleteSaving ? 'Deleting…' : 'Delete'}</Button>
        </div>
      </Modal>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Guide tab                                                                   */
/* -------------------------------------------------------------------------- */
function GuideTab() {
  return (
    <Card title="Corporate Marketing Activities Plan — User Guide">
      <div className="guide-content">
        <section className="guide-section">
          <h3><Icon name="compass" /> What this module is</h3>
          <p>
            The annual corporate marketing plan from the workbook <b>KG Corporate Marketing_Plan_and_Activities.xlsx</b>:
            49 parent activities, each with 4 sub-tasks, repeated every month (2,352 tasks per year), plus an
            Events &amp; Campaigns register (EVT-001…EVT-100).
          </p>
        </section>
        <section className="guide-section">
          <h3><Icon name="list-check" /> Monthly workflow</h3>
          <ul>
            <li>Pick <b>year + month</b> on the Monthly Plan tab (196 tasks per month).</li>
            <li>Assign a <b>Responsible Person</b>, set <b>Completion %</b> and <b>Evidence / Remarks</b>, then <b>Save</b> the row.</li>
            <li>Verify with ✓ (or reject ✗ with a required note). Status flows <b>Not Verified → Verified / Rejected</b>.</li>
            <li>Editing a <b>Rejected</b> task automatically returns it to <b>Not Verified</b> for re-checking.</li>
            <li>Use the Dashboard tab for rollups by role and month.</li>
          </ul>
        </section>
        <section className="guide-section">
          <h3><Icon name="calendar-check" /> Events &amp; Campaigns</h3>
          <p>
            Edit any event row to record dates, owners, budgets and outcomes. The system derives Month, ISO week,
            Conversion Rate, ROI % (revenue vs cost), Budget Variance, Attendance Rate and Engagement Rate automatically
            (business rules from the workbook notes).
          </p>
        </section>
        <section className="guide-section">
          <h3><Icon name="file-arrow-up" /> Workbook import</h3>
          <p>
            Click <b>Import Workbook</b> in the header to upload the annual <code>KG Corporate Marketing_Plan_and_Activities.xlsx</code>.
            The import upserts parents, tasks (by Task ID) and events (by Event Code) and <b>never overwrites</b>
            the person, completion, status or remarks you have entered. Select the target year, choose the file, and click Import.
            Results show counts per entity and any row-level errors.
          </p>
        </section>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */
function CorpMarketingPage() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [refreshKey, setRefreshKey] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [importYear, setImportYear] = useState(String(now.getFullYear()));
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ parentsUpserted: number; tasksUpserted: number; eventsUpserted: number; errors: string[] } | null>(null);

  const summary = useFetch<CorpSummary>(`/admin/corp-marketing/summary?${qs({ year, month })}`, [year, month, refreshKey]);
  const roles = useFetch<{ items: string[] }>('/admin/corp-marketing/roles', [refreshKey]);

  function refreshAll() {
    setRefreshKey((k) => k + 1);
  }

  async function handleImport() {
    if (!importFile) { toast.error('Select a workbook first'); return; }
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      formData.append('year', importYear);
      const res = await api<{ parentsUpserted: number; tasksUpserted: number; eventsUpserted: number; errors: string[] }>(
        '/admin/corp-marketing/import',
        { method: 'POST', body: formData }
      );
      setImportResult(res);
      toast.success(`Imported: ${res.parentsUpserted} parents, ${res.tasksUpserted} tasks, ${res.eventsUpserted} events`);
      if (res.errors.length) toast.warning(`${res.errors.length} errors — see details below`);
      await refreshAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  function closeImport() {
    setImportOpen(false);
    setImportFile(null);
    setImportResult(null);
  }

  const tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'plan', label: 'Monthly Plan' },
    { id: 'events', label: 'Events & Campaigns' },
    { id: 'guide', label: 'User Guide' },
  ];

  return (
    <Fragment>
      <Guard>
        <RequireRole roles={['Administrator']}>
          <div className="content">
            <div className="kpi-hero">
              <div className="kpi-hero-icon"><Icon name="bullhorn" /></div>
              <div className="kpi-hero-info">
                <h2>Corporate Marketing Activities Plan</h2>
                <p>Monthly activity tasks, verification and events/campaigns register</p>
                <TourTrigger tourId="admin-corp-marketing" />
              </div>
              <div className="kpi-hero-stats">
                <div className="kpi-hero-stat">
                  <div className="lhs">{summary.data?.tasks.total ?? '—'}</div>
                  <div className="lbl">Tasks</div>
                </div>
                <div className="kpi-hero-stat">
                  <div className="lhs">{summary.data?.tasks.verified ?? '—'}</div>
                  <div className="lbl">Verified</div>
                </div>
                <div className="kpi-hero-stat">
                  <div className="lhs">{summary.data?.tasks.avgCompletion != null ? `${summary.data.tasks.avgCompletion}%` : '—'}</div>
                  <div className="lbl">Completion</div>
                </div>
                <div className="kpi-hero-stat">
                  <div className="lhs">{summary.data?.events.total ?? '—'}</div>
                  <div className="lbl">Events</div>
                </div>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <Button variant="primary" onClick={() => { setImportYear(String(now.getFullYear())); setImportOpen(true); }}>
                  <Icon name="upload" /> Import Workbook
                </Button>
              </div>
            </div>

            <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

            {activeTab === 'dashboard' && (
              <DashboardTab summary={summary.data} year={year} month={month} setYear={setYear} setMonth={setMonth} />
            )}
            {activeTab === 'plan' && (
              <PlanTab year={year} month={month} setYear={setYear} setMonth={setMonth} roles={roles.data?.items ?? []} onRefresh={refreshAll} />
            )}
            {activeTab === 'events' && (
              <EventsTab onRefresh={refreshAll} />
            )}
            {activeTab === 'guide' && (
              <GuideTab />
            )}
          </div>
        </RequireRole>
      </Guard>

      <ImportWorkbookModal
        open={importOpen}
        onClose={closeImport}
        year={importYear}
        setYear={setImportYear}
        file={importFile}
        setFile={setImportFile}
        importing={importing}
        result={importResult}
        onImport={handleImport}
      />
    </Fragment>
  );
}

function ImportWorkbookModal({
  open,
  onClose,
  year,
  setYear,
  file,
  setFile,
  importing,
  result,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  year: string;
  setYear: (y: string) => void;
  file: File | null;
  setFile: (f: File | null) => void;
  importing: boolean;
  result: { parentsUpserted: number; tasksUpserted: number; eventsUpserted: number; errors: string[] } | null;
  onImport: () => void;
}) {
  const now = new Date();
  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  return (
    <Modal open={open} onClose={onClose} title="Import Workbook" wide>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="form-field">
          <label>Target Year *</label>
          <select value={year} onChange={(e) => setYear(e.target.value)}>
            {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
          </select>
        </div>

        <div className="form-field">
          <label>Workbook (.xlsx) *</label>
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={importing}
          />
          {file && <div className="sub-text" style={{ marginTop: 4 }}>{file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</div>}
        </div>

        {importing ? (
          <div style={{ textAlign: 'center', padding: 16 }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            <div>Uploading and processing workbook…</div>
            <div className="sub-text" style={{ marginTop: 4 }}>This may take up to 3 minutes</div>
          </div>
        ) : result ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="kpi-overview-grid" style={{ marginBottom: 8 }}>
              <StatCard icon="file-text" label="Parents" value={result.parentsUpserted} tone="blue" />
              <StatCard icon="list-check" label="Tasks" value={result.tasksUpserted.toLocaleString()} tone="green" />
              <StatCard icon="calendar-check" label="Events" value={result.eventsUpserted} tone="amber" />
              <StatCard icon={result.errors.length ? 'circle-xmark' : 'circle-check'} label="Errors" value={result.errors.length} tone={result.errors.length ? 'red' : 'green'} />
            </div>
            {result.errors.length > 0 && (
              <Card title={`Errors (${result.errors.length})`} className="error-card">
                <ul style={{ margin: 0, paddingLeft: 20, maxHeight: 200, overflow: 'auto' }}>
                  {result.errors.map((e, i) => <li key={i} style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 6 }}>{e}</li>)}
                </ul>
              </Card>
            )}
          </div>
        ) : null}

        <div className="modal-actions" style={{ marginTop: 8 }}>
          <Button variant="ghost" onClick={onClose} disabled={importing}>Cancel</Button>
          {!result ? (
            <Button variant="primary" onClick={() => void onImport()} disabled={importing || !file}>
              {importing ? 'Importing…' : 'Import Workbook'}
            </Button>
          ) : (
            <Button variant="primary" onClick={onClose}>Done</Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default CorpMarketingPage;
