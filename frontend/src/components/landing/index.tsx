'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import type { Pillar, Role, TrustStat, Module, CompareRow, Screenshot } from '@/lib/landing-data';

/* -------------------------------------------------------------------------- */
/* Theme Toggle                                                                */
/* -------------------------------------------------------------------------- */
export function ThemeToggle({ theme, onToggle }: { theme: 'dark' | 'light'; onToggle: () => void }) {
  return (
    <button
      className="lp-theme-toggle"
      onClick={onToggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
    >
      <i className={theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon'} />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Feature Tag                                                                 */
/* -------------------------------------------------------------------------- */
export function FeatureTag({ text, accent }: { text: string; accent: string }) {
  return <span className={`lp-tag lp-tag--${accent}`}>{text}</span>;
}

/* -------------------------------------------------------------------------- */
/* Pillar Card                                                                 */
/* -------------------------------------------------------------------------- */
const ACCENT_COLORS: Record<string, string> = {
  blue: '#0047ab', green: '#00843d', bronze: '#a96a0a',
  purple: '#7c3aed', orange: '#ea580c', teal: '#0d9488',
  rose: '#e11d48', cyan: '#0891b2',
};
const ACCENT_SOFT: Record<string, string> = {
  blue: 'rgba(0,71,171,0.15)', green: 'rgba(0,132,61,0.15)', bronze: 'rgba(169,106,10,0.14)',
  purple: 'rgba(124,58,237,0.15)', orange: 'rgba(234,88,12,0.14)', teal: 'rgba(13,148,136,0.15)',
  rose: 'rgba(225,29,72,0.14)', cyan: 'rgba(8,145,178,0.14)',
};
const ACCENT_GRADIENT: Record<string, string> = {
  blue: 'linear-gradient(90deg, #0047ab, #5b9bf5)',
  green: 'linear-gradient(90deg, #00843d, #34d07b)',
  bronze: 'linear-gradient(90deg, #a96a0a, #d4a843)',
  purple: 'linear-gradient(90deg, #7c3aed, #a78bfa)',
  orange: 'linear-gradient(90deg, #ea580c, #fb923c)',
  teal: 'linear-gradient(90deg, #0d9488, #2dd4bf)',
  rose: 'linear-gradient(90deg, #e11d48, #fb7185)',
  cyan: 'linear-gradient(90deg, #0891b2, #22d3ee)',
};

export function PillarCard({ pillar, onOpen }: { pillar: Pillar; onOpen?: (id: string) => void }) {
  const style = {
    '--pillar-color': ACCENT_COLORS[pillar.accent],
    '--pillar-soft': ACCENT_SOFT[pillar.accent],
    '--pillar-gradient': ACCENT_GRADIENT[pillar.accent],
  } as React.CSSProperties;
  return (
    <button
      className="lp-pillar-card lp-animate-in"
      style={style}
      onClick={() => onOpen?.(pillar.id)}
      aria-label={`Explore ${pillar.title}`}
    >
      <div className="lp-pillar-icon">
        <i className={pillar.icon} />
      </div>
      <h3>{pillar.title}</h3>
      <p className="lp-pillar-desc">{pillar.desc}</p>
      <div className="lp-pillar-tags">
        {pillar.tags.map((t) => <FeatureTag key={t} text={t} accent={pillar.accent} />)}
      </div>
      <span className="lp-pillar-more">
        Explore module <i className="fa-solid fa-arrow-right" />
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Module Card (Accordion)                                                     */
/* -------------------------------------------------------------------------- */
export function ModuleCard({ module, accent, defaultOpen = false }: { module: Module; accent: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const style = {
    '--pillar-color': ACCENT_COLORS[accent],
    '--pillar-soft': ACCENT_SOFT[accent],
  } as React.CSSProperties;
  return (
    <div className={`lp-module-card ${open ? 'open' : ''}`} style={style}>
      <div
        className="lp-module-header"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!open); } }}
      >
        <div className="lp-module-icon"><i className={module.icon} /></div>
        <span className="lp-module-title">{module.title}</span>
        <i className="fa-solid fa-chevron-down lp-module-chev" />
      </div>
      <div className="lp-module-body">
        <div className="lp-module-body-inner">
          {module.features.map((f, i) => (
            <div className="lp-module-feature" key={i}>
              <i className="fa-solid fa-check lp-feature-check" />
              <div>
                <strong style={{ color: 'var(--lp-text)' }}>{f.title}</strong> — {f.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Role Card                                                                   */
/* -------------------------------------------------------------------------- */
export function RoleCard({ role }: { role: Role }) {
  const style = { '--role-accent': ACCENT_COLORS[role.accent] } as React.CSSProperties;
  return (
    <div className="lp-role-card lp-animate-in" style={style}>
      <div className="lp-role-avatar">
        <i className={role.icon} />
      </div>
      <h3>{role.name}</h3>
      <div className="lp-role-tagline">{role.tagline}</div>
      <div className="lp-role-caps">
        {role.capabilities.map((c, i) => (
          <div className="lp-role-cap" key={i}>
            <i className="fa-solid fa-check" />
            <span>{c}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Stat Counter (count-up on scroll)                                           */
/* -------------------------------------------------------------------------- */
export function StatCounter({ stat }: { stat: TrustStat }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setDisplay(stat.value); return; }
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !started.current) {
            started.current = true;
            const dur = 1400;
            const start = performance.now();
            const tick = (now: number) => {
              const p = Math.min((now - start) / dur, 1);
              const eased = 1 - Math.pow(1 - p, 3);
              setDisplay(Math.round(eased * stat.value));
              if (p < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }
        });
      },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [stat.value]);

  return (
    <div className="lp-stat-item" ref={ref}>
      <div className="lp-stat-number">
        {display}{stat.suffix}
      </div>
      <div className="lp-stat-label">{stat.label}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Module Tabs                                                                 */
/* -------------------------------------------------------------------------- */
export interface TabDef { id: string; label: string; icon: string }

export function ModuleTabs({ tabs, active, onChange }: { tabs: TabDef[]; active: string; onChange: (id: string) => void }) {
  const listRef = useRef<HTMLDivElement>(null);

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    const idx = tabs.findIndex((t) => t.id === active);
    if (e.key === 'ArrowRight') { e.preventDefault(); onChange(tabs[(idx + 1) % tabs.length].id); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); onChange(tabs[(idx - 1 + tabs.length) % tabs.length].id); }
  }, [tabs, active, onChange]);

  return (
    <div className="lp-tabs" role="tablist" ref={listRef} onKeyDown={handleKey}>
      {tabs.map((t) => (
        <button
          key={t.id}
          className={`lp-tab ${active === t.id ? 'active' : ''}`}
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
        >
          <i className={t.icon} />
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Role × Module Matrix                                                        */
/* -------------------------------------------------------------------------- */
const PILLAR_LABELS: Record<string, string> = {
  kpi: 'KPI & Performance', tenders: 'Tender Intel', ai: 'AI & Predictive', competitor: 'Competitor Intel',
  field: 'Field Intelligence', forms: 'Forms & Surveys', reports: 'Reports Hub', admin: 'Administration',
};

function Cell({ v }: { v: 'full' | 'partial' | 'none' }) {
  if (v === 'full') return <td className="cell-yes" title="Full access"><i className="fa-solid fa-circle-check" /></td>;
  if (v === 'partial') return <td className="cell-partial" title="Limited access"><i className="fa-solid fa-circle-half-stroke" /></td>;
  return <td className="cell-no" title="No access"><i className="fa-solid fa-circle-minus" /></td>;
}

export function RoleMatrix({ roles }: { roles: Role[] }) {
  const pillarIds = ['kpi', 'tenders', 'ai', 'competitor', 'field', 'forms', 'reports', 'admin'];
  return (
    <div className="lp-matrix-wrap">
      <table className="lp-matrix">
        <thead>
          <tr>
            <th>Role</th>
            {pillarIds.map((p) => <th key={p}>{PILLAR_LABELS[p]}</th>)}
          </tr>
        </thead>
        <tbody>
          {roles.map((r) => (
            <tr key={r.id}>
              <td>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: ACCENT_COLORS[r.accent], display: 'inline-block',
                  }} />
                  {r.name}
                </span>
              </td>
              {pillarIds.map((p) => <Cell key={p} v={r.matrix[p]} />)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Comparison Table                                                            */
/* -------------------------------------------------------------------------- */
function CmpCell({ v }: { v: 'check' | 'partial' | 'cross' | 'text' }) {
  if (v === 'check') return <i className="fa-solid fa-circle-check cell-check" />;
  if (v === 'partial') return <i className="fa-solid fa-circle-half-stroke cell-partial" />;
  if (v === 'cross') return <i className="fa-solid fa-circle-xmark cell-cross" />;
  return <span>{/* text rendered in parent */}</span>;
}

export function ComparisonTable({ rows }: { rows: CompareRow[] }) {
  return (
    <div className="lp-compare-wrap">
      <table className="lp-compare">
        <thead>
          <tr>
            <th>Dimension</th>
            <th>KG-MIS</th>
            <th>Power BI / Tableau</th>
            <th>Spreadsheets</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={{ fontWeight: 600, color: 'var(--lp-text)' }}>{r.dimension}</td>
              <td>
                {r.kgmisCell === 'check' && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="fa-solid fa-circle-check cell-check" />
                    <span>{r.kgmis}</span>
                  </span>
                )}
                {r.kgmisCell === 'text' && <span>{r.kgmis}</span>}
              </td>
              <td>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {r.biCell !== 'text' && <CmpCell v={r.biCell} />}
                  <span>{r.bi}</span>
                </span>
              </td>
              <td>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {r.sheetsCell !== 'text' && <CmpCell v={r.sheetsCell} />}
                  <span>{r.sheets}</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Screenshot Carousel (SVG placeholders)                                      */
/* -------------------------------------------------------------------------- */
function MockupSVG({ variant }: { variant: number }) {
  const colors = ['#0047ab', '#00843d', '#a96a0a', '#7c3aed', '#ea580c', '#0d9488', '#5b9bf5', '#34d07b'];
  const c = colors[variant % colors.length];
  return (
    <svg viewBox="0 0 480 300" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', width: '100%', height: 'auto' }}>
      <rect width="480" height="300" fill="#0f172a" />
      {/* Top bar */}
      <rect x="0" y="0" width="480" height="36" fill="#1e293b" />
      <rect x="12" y="10" width="60" height="16" rx="4" fill={c} />
      <rect x="380" y="12" width="40" height="12" rx="6" fill="#334155" />
      <rect x="428" y="12" width="40" height="12" rx="6" fill="#334155" />
      {/* Sidebar */}
      <rect x="0" y="36" width="90" height="264" fill="#1e293b" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} x="12" y={52 + i * 34} width={i === variant % 6 ? 66 : 58} height="10" rx="3" fill={i === variant % 6 ? c : '#334155'} opacity={i === variant % 6 ? 1 : 0.6} />
      ))}
      {/* KPI cards row */}
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x={102 + i * 94} y={48} width="84" height="58" rx="8" fill="#1e293b" stroke="#334155" strokeWidth="1" />
          <rect x={112 + i * 94} y={58} width="30" height="8" rx="3" fill={i % 2 ? c : '#64748b'} />
          <rect x={112 + i * 94} y={74} width="50" height="14" rx="3" fill="#e2e8f0" opacity="0.8" />
          <rect x={112 + i * 94} y={94} width="40" height="6" rx="3" fill="#475569" />
        </g>
      ))}
      {/* Chart area */}
      <rect x="102" y="118" width="180" height="100" rx="8" fill="#1e293b" stroke="#334155" strokeWidth="1" />
      {/* Bar chart */}
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <rect key={i} x={114 + i * 23} y={198 - (20 + Math.random() * 50)} width="14" height={20 + (i * 7) % 50} rx="3" fill={c} opacity={0.7 + i * 0.04} />
      ))}
      <rect x="114" y="132" width="60" height="8" rx="3" fill="#94a3b8" />
      {/* Right panel */}
      <rect x="294" y="118" width="174" height="100" rx="8" fill="#1e293b" stroke="#334155" strokeWidth="1" />
      <circle cx="330" cy="168" r="28" fill="none" stroke={c} strokeWidth="8" strokeDasharray="130 45" />
      <text x="330" y="173" textAnchor="middle" fill="#e2e8f0" fontSize="14" fontWeight="700">87%</text>
      <rect x="374" y="142" width="80" height="8" rx="3" fill="#94a3b8" />
      <rect x="374" y="158" width="60" height="6" rx="3" fill="#475569" />
      <rect x="374" y="174" width="70" height="6" rx="3" fill="#475569" />
      {/* Bottom table */}
      <rect x="102" y="230" width="366" height="56" rx="8" fill="#1e293b" stroke="#334155" strokeWidth="1" />
      <rect x="112" y="240" width="100" height="7" rx="3" fill="#64748b" />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={112 + i * 90} y={256} width="80" height="6" rx="3" fill={i === variant % 4 ? c : '#334155'} opacity={0.7} />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <rect key={`b${i}`} x={112 + i * 90} y={270} width="80" height="6" rx="3" fill="#334155" opacity="0.5" />
      ))}
    </svg>
  );
}

export function ScreenshotCarousel({ items }: { items: Screenshot[] }) {
  const [lightbox, setLightbox] = useState<number | null>(null);

  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
      if (e.key === 'ArrowRight') setLightbox((p) => (p !== null ? (p + 1) % items.length : p));
      if (e.key === 'ArrowLeft') setLightbox((p) => (p !== null ? (p - 1 + items.length) % items.length : p));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, items.length]);

  const renderShot = (item: Screenshot, idx: number) =>
    item.src ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.src}
        alt={item.label}
        className="lp-carousel-img"
        loading="lazy"
        decoding="async"
        draggable={false}
      />
    ) : (
      <MockupSVG variant={idx} />
    );

  return (
    <div className="lp-carousel">
      <div className="lp-carousel-track" role="list">
        {items.map((s, i) => (
          <div
            key={s.id}
            className="lp-carousel-slide"
            role="listitem"
            tabIndex={0}
            onClick={() => setLightbox(i)}
            onKeyDown={(e) => { if (e.key === 'Enter') setLightbox(i); }}
            aria-label={`View screenshot: ${s.label}`}
          >
            {renderShot(s, i)}
            <div className="lp-carousel-caption">{s.label}</div>
          </div>
        ))}
      </div>

      {lightbox !== null && (
        <div className="lp-lightbox" onClick={() => setLightbox(null)} role="dialog" aria-label="Screenshot preview">
          <button className="lp-lightbox-close" onClick={() => setLightbox(null)} aria-label="Close">
            <i className="fa-solid fa-xmark" />
          </button>
          <div className="lp-lightbox-content" onClick={(e) => e.stopPropagation()}>
            {renderShot(items[lightbox], lightbox)}
          </div>
          <div className="lp-lightbox-caption">{items[lightbox].label}</div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tech Specs Grid                                                             */
/* -------------------------------------------------------------------------- */
export function SpecsGrid({ specs }: { specs: { icon: string; title: string; desc: string }[] }) {
  return (
    <div className="lp-specs-grid">
      {specs.map((s, i) => (
        <div className="lp-spec-card lp-animate-in" key={i}>
          <div className="lp-spec-icon"><i className={s.icon} /></div>
          <h4>{s.title}</h4>
          <p>{s.desc}</p>
        </div>
      ))}
    </div>
  );
}
