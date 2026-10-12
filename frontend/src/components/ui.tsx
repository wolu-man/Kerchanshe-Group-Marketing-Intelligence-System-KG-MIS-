'use client';

import { useEffect } from 'react';

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------
export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger' | 'danger-ghost' | 'success' | 'accent';
  size?: 'sm' | 'md' | 'lg';
  busy?: boolean;
}) {
  const { variant = 'primary', size = 'md', busy = false, className = '', disabled, children, ...rest } = props;
  const cls = ['btn', `btn-${variant}`, size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '', busy ? 'is-loading' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button className={cls} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {busy ? <span className="btn-spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
export function Card(props: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; flush?: boolean; style?: React.CSSProperties }) {
  const { title, actions, children, className = '', flush, style } = props;
  return (
    <div className={`card ${className}`} style={style}>
      {title ? (
        <div className="card-header">
          <h3>{title}</h3>
          {actions ? <div className="actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className={flush ? 'card-body flush' : 'card-body'}>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------
const BADGE_TONES: Record<string, string> = {
  success: 'badge-success',
  danger: 'badge-danger',
  warning: 'badge-warning',
  info: 'badge-info',
  neutral: 'badge-neutral',
  primary: 'badge-primary',
  accent: 'badge-accent',
};

export function Badge({ tone = 'neutral', children }: { tone?: keyof typeof BADGE_TONES; children: React.ReactNode }) {
  return <span className={`badge ${BADGE_TONES[tone] ?? BADGE_TONES.neutral}`}>{children}</span>;
}

// ---------------------------------------------------------------------------
// Status badge (map backend statuses to tones)
// ---------------------------------------------------------------------------
const STATUS_TONE: Record<string, string> = {
  Draft: 'neutral',
  Published: 'success',
  Archived: 'warning',
  InProgress: 'neutral',
  Submitted: 'info',
  Reviewed: 'success',
  Approved: 'success',
  Active: 'danger',
  Resolved: 'success',
  Dismissed: 'neutral',
  Pending: 'warning',
  Sent: 'success',
  Retried: 'warning',
  Failed: 'danger',
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={(STATUS_TONE[status] ?? 'neutral') as keyof typeof BADGE_TONES}>{status}</Badge>;
}

// ---------------------------------------------------------------------------
// Field primitives
// ---------------------------------------------------------------------------
export function Field({ label, required, error, hint, labelStyle, hintStyle, containerStyle, children }: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  labelStyle?: React.CSSProperties;
  hintStyle?: React.CSSProperties;
  containerStyle?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div className="field" style={containerStyle}>
      <label className="label" style={labelStyle}>
        {label} {required ? <span className="req">*</span> : null}
      </label>
      {children}
      {error ? <div className="form-error">{error}</div> : hint ? <div className="hint" style={hintStyle}>{hint}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icon (Font Awesome 6 free)
// ---------------------------------------------------------------------------
export function Icon({ name, type = 'solid', className = '' }: {
  name: string;
  type?: 'solid' | 'regular' | 'brands';
  className?: string;
}) {
  return <i className={`fa-${type} fa-${name} ${className}`.trim()} aria-hidden="true" />;
}

// ---------------------------------------------------------------------------
// Spinner / empty state
// ---------------------------------------------------------------------------
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="empty">
      <div className="spinner" style={{ margin: '0 auto 12px' }} />
      {label}
    </div>
  );
}

export function Empty({ icon = 'folder-open', message = 'Nothing here yet', action }: { icon?: string; message?: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <div className="icon"><Icon name={icon} /></div>
      <div>{message}</div>
      {action ? <div style={{ marginTop: 14 }}>{action}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
export function Modal({ open, onClose, title, children, footer, wide }: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'modal-lg' : ''}`}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="close" onClick={onClose} aria-label="Close"><Icon name="xmark" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
export function Tabs({ tabs, active, onChange }: {
  tabs: Array<{ id: string; label: string; badge?: string | number }>;
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.id} className={t.id === active ? 'active' : ''} onClick={() => onChange(t.id)}>
          {t.label}
          {t.badge !== undefined ? <span className="badge badge-neutral" style={{ marginLeft: 6 }}>{t.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart helpers (SVG, dependency-free)
// ---------------------------------------------------------------------------
export function BarChart({ data, color = 'var(--primary)' }: {
  data: Array<{ label: string; value: number }>;
  color?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (data.length === 0) return <div className="empty">No data</div>;
  return (
    <div>
      {data.map((d) => (
        <div className="chart-bar-row" key={d.label}>
          <div className="lbl" title={d.label}>{d.label}</div>
          <div className="chart-bar-track">
            <div className="chart-bar-fill" style={{ width: `${Math.max(2, (d.value / max) * 100)}%`, background: color }} />
          </div>
          <div className="chart-bar-val">{d.value}</div>
        </div>
      ))}
    </div>
  );
}

export function Donut({ data }: { data: Array<{ label: string; value: number }> }) {
  const total = Math.max(1, data.reduce((s, d) => s + d.value, 0));
  const COLORS = ['#0047ab', '#00843d', '#a96a0a', '#3b82f6', '#12b259', '#003a8c', '#15803d', '#8a5508'];
  let offset = 0;
  const R = 40;
  const C = 2 * Math.PI * R;
  if (data.length === 0) return <div className="empty">No data</div>;
  return (
    <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
      <svg width="110" height="110" viewBox="0 0 110 110">
        <circle cx="55" cy="55" r={R} fill="none" stroke="var(--surface-3)" strokeWidth="14" />
        {data.map((d, i) => {
          const frac = d.value / total;
          const dash = frac * C;
          const el = (
            <circle
              key={i}
              cx="55" cy="55" r={R} fill="none"
              stroke={COLORS[i % COLORS.length]} strokeWidth="14"
              strokeDasharray={`${dash} ${C - dash}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 55 55)"
            />
          );
          offset += dash;
          return el;
        })}
      </svg>
      <div style={{ fontSize: 12.5 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: COLORS[i % COLORS.length], display: 'inline-block' }} />
            <span style={{ color: 'var(--text-muted)' }}>{d.label}</span>
            <b>{Math.round((d.value / total) * 100)}%</b>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------
export function Pagination({ page, total, pageSize, onPageChange }: {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const from = Math.min((page - 1) * pageSize + 1, total);
  const to = Math.min(page * pageSize, total);

  function pages(): (number | '...')[] {
    const ps: (number | '...')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) ps.push(i);
      return ps;
    }
    ps.push(1);
    if (page > 3) ps.push('...');
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    for (let i = start; i <= end; i++) ps.push(i);
    if (page < totalPages - 2) ps.push('...');
    ps.push(totalPages);
    return ps;
  }

  return (
    <div className="pagination">
      <span className="pagination-info">Showing {from}–{to} of {total}</span>
      <div className="pagination-pages">
        <button className="pagination-btn" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <Icon name="chevron-left" /> Prev
        </button>
        {pages().map((p, i) =>
          p === '...' ? (
            <span key={`e${i}`} className="pagination-ellipsis">…</span>
          ) : (
            <button
              key={p}
              className={`pagination-page ${p === page ? 'active' : ''}`}
              onClick={() => onPageChange(p)}
            >
              {p}
            </button>
          )
        )}
        <button className="pagination-btn" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next <Icon name="chevron-right" />
        </button>
      </div>
    </div>
  );
}
