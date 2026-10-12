'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import {
  ThemeToggle, PillarCard, ModuleCard, RoleCard, StatCounter, ComparisonTable,
} from '@/components/landing';
import { LandingAiChat } from '@/components/landing/LandingAiChat';
import { PILLARS, ROLES, TRUST_STATS, COMPARISON } from '@/lib/landing-data';

type Theme = 'dark' | 'light';

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const saved = localStorage.getItem('kgmis_landing_theme');
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export default function HomePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [theme, setTheme] = useState<Theme>('dark');
  const [openModule, setOpenModule] = useState<string | null>(null);

  useEffect(() => { setTheme(getInitialTheme()); }, []);

  useEffect(() => {
    if (user) router.replace('/dashboard');
  }, [user, router]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('kgmis_landing_theme', next);
      return next;
    });
  }, []);

  const handlePillarOpen = useCallback((id: string) => {
    setOpenModule((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div className="lp-theme-wrapper" data-theme={theme}>
      <ThemeToggle theme={theme} onToggle={toggleTheme} />
      <LandingAiChat />

      {/* ===== Hero ===== */}
      <section className="lp-hero">
        <div className="lp-hero-motifs" aria-hidden="true">
          <div className="lp-motif lp-motif--ring" />
          <div className="lp-motif lp-motif--ring" />
          <div className="lp-motif lp-motif--dot" />
          <div className="lp-motif lp-motif--dot" />
          <div className="lp-motif lp-motif--dot" />
          <div className="lp-motif lp-motif--line" />
          <div className="lp-motif lp-motif--line" />
          <div className="lp-motif lp-motif--bars">
            <span /><span /><span /><span /><span />
          </div>
          <div className="lp-motif lp-motif--diamond" />
          <div className="lp-motif lp-motif--diamond" />
        </div>

        <div className="lp-hero-content">
          <div className="lp-hero-badge">
            <span className="dot" />
            Enterprise Marketing Intelligence
          </div>

          <h1 className="lp-hero-title">
            Kerchanshe Group<br />Marketing Intelligence System
          </h1>

          <p className="lp-hero-tagline">
            Transforming market data into actionable intelligence.
          </p>

          <hr className="lp-hero-sep" />

          <p className="lp-hero-desc">
            Centralize marketing and field data, monitor market activities, analyze
            performance, and empower teams with reliable intelligence for faster,
            data-driven decision making.
          </p>

          <div className="lp-hero-ctas">
            <Link href="/login" className="lp-btn-primary">
              Access Role-based Modules
              <i className="fa-solid fa-arrow-right" />
            </Link>
            <Link href="/features" className="lp-btn-secondary">
              Explore Intelligence
              <i className="fa-solid fa-chevron-down" />
            </Link>
          </div>
        </div>
      </section>

      {/* ===== 6 Pillars ===== */}
      <section className="lp-section" id="pillars">
        <div className="lp-section-inner">
          <div className="lp-section-header">
            <div className="lp-section-overline">Platform Pillars</div>
            <h2 className="lp-section-title">Six Pillars of Intelligence</h2>
            <p className="lp-section-sub">
              Every module in KG-MIS is organized under six core pillars — from field
              data capture to executive governance.
            </p>
          </div>
          <div className="lp-pillar-grid">
            {PILLARS.map((p) => (
              <PillarCard key={p.id} pillar={p} onOpen={handlePillarOpen} />
            ))}
          </div>
        </div>
      </section>

      {/* ===== Module Showcase (expandable) ===== */}
      <section className="lp-section lp-section--alt" id="modules">
        <div className="lp-section-inner">
          <div className="lp-section-header">
            <div className="lp-section-overline">Module Deep-Dive</div>
            <h2 className="lp-section-title">Every Feature, Every Detail</h2>
            <p className="lp-section-sub">
              Click any module below to see exactly what is included. Expand all to
              explore the full capability set.
            </p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 32, flexWrap: 'wrap' }}>
            <button
              className="lp-btn-secondary"
              style={{ color: 'var(--lp-text)', borderColor: 'var(--lp-card-border)', padding: '10px 24px', fontSize: 14 }}
              onClick={() => setOpenModule(openModule === 'all' ? null : 'all')}
            >
              {openModule === 'all' ? (
                <><i className="fa-solid fa-compress" /> Collapse All</>
              ) : (
                <><i className="fa-solid fa-expand" /> Expand All</>
              )}
            </button>
          </div>

          <div className="lp-module-grid">
            {PILLARS.map((pillar) =>
              pillar.modules.map((mod, mi) => (
                <ModuleCard
                  key={mod.id}
                  module={mod}
                  accent={pillar.accent}
                  defaultOpen={openModule === 'all'}
                />
              ))
            )}
          </div>
        </div>
      </section>

      {/* ===== Role Cards ===== */}
      <section className="lp-section" id="roles">
        <div className="lp-section-inner">
          <div className="lp-section-header">
            <div className="lp-section-overline">Role-Based Access</div>
            <h2 className="lp-section-title">Built for Every Role</h2>
            <p className="lp-section-sub">
              Five roles with granular permissions — each user sees exactly what they
              need and nothing more.
            </p>
          </div>
          <div className="lp-role-grid">
            {ROLES.map((r) => <RoleCard key={r.id} role={r} />)}
          </div>
        </div>
      </section>

      {/* ===== Trust Stats ===== */}
      <section className="lp-stats-band">
        <div className="lp-stats-grid">
          {TRUST_STATS.map((s) => <StatCounter key={s.label} stat={s} />)}
        </div>
      </section>

      {/* ===== Comparison ===== */}
      <section className="lp-section lp-section--alt" id="comparison">
        <div className="lp-section-inner">
          <div className="lp-section-header">
            <div className="lp-section-overline">Why KG-MIS</div>
            <h2 className="lp-section-title">How KG-MIS Compares</h2>
            <p className="lp-section-sub">
              Purpose-built for marketing intelligence — not a generic BI tool or
              spreadsheet workaround.
            </p>
          </div>
          <ComparisonTable rows={COMPARISON} />
        </div>
      </section>

      {/* ===== CTA Band ===== */}
      <section className="lp-cta-band">
        <h2 className="lp-cta-title">Ready to see it in action?</h2>
        <p className="lp-cta-sub">
          Access role-based modules tailored to your responsibilities — from field
          data capture to executive dashboards.
        </p>
        <Link href="/login" className="lp-cta-btn">
          Access Role-based Modules
          <i className="fa-solid fa-arrow-right" />
        </Link>
      </section>

      {/* ===== Brand Bar ===== */}
      <section className="lp-brand-bar">
        <div className="lp-brand-bar-inner">
          <h2>KG-MIS</h2>
          <p>
            Kerchanshe Group Marketing Intelligence System — transforming market
            data into actionable intelligence for better business decisions.
          </p>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="lp-footer">
        <p>
          &copy; {new Date().getFullYear()} Kerchanshe Group. All rights reserved.
          &nbsp;·&nbsp; Powered by <Link href="/">KG-MIS</Link>
          &nbsp;·&nbsp; <Link href="/features">Features</Link>
          &nbsp;·&nbsp; <Link href="/team">Team</Link>
        </p>
      </footer>
    </div>
  );
}
