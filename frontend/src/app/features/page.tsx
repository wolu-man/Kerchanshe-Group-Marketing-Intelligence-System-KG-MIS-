'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  ThemeToggle, ModuleTabs, FeatureTag, ComparisonTable, RoleMatrix,
  ScreenshotCarousel, SpecsGrid,
} from '@/components/landing';
import { PILLARS, ROLES, COMPARISON, TECH_SPECS, SCREENSHOTS } from '@/lib/landing-data';
import type { TabDef } from '@/components/landing';

type Theme = 'dark' | 'light';

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const saved = localStorage.getItem('kgmis_landing_theme');
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export default function FeaturesPage() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [activeTab, setActiveTab] = useState<string>(PILLARS[0].id);

  useEffect(() => { setTheme(getInitialTheme()); }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('kgmis_landing_theme', next);
      return next;
    });
  }, []);

  const tabs: TabDef[] = useMemo(
    () => PILLARS.map((p) => ({ id: p.id, label: p.title, icon: p.icon })),
    []
  );

  const activePillar = PILLARS.find((p) => p.id === activeTab) ?? PILLARS[0];

  return (
    <div className="lp-theme-wrapper" data-theme={theme}>
      <ThemeToggle theme={theme} onToggle={toggleTheme} />

      {/* ===== Features Hero ===== */}
      <section className="lp-features-hero">
        <div className="lp-features-hero-content">
          <div className="lp-breadcrumb">
            <Link href="/">Home</Link>
            <i className="fa-solid fa-chevron-right" style={{ fontSize: 10 }} />
            <span>Features</span>
          </div>
          <h1>Every Module, Every Detail</h1>
          <p className="lp-hero-sub">
            Explore the complete KG-MIS capability set — six pillars, 30+ modules,
            and 100+ features across field intelligence, analytics, and governance.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/login" className="lp-btn-primary">
              Access Role-based Modules
              <i className="fa-solid fa-arrow-right" />
            </Link>
            <Link href="/#pillars" className="lp-btn-secondary">
              Overview
            </Link>
          </div>

          <div className="lp-hero-stats-row">
            <div className="lp-hero-stat">
              <div className="lp-hs-val">6</div>
              <div className="lp-hs-label">Core Pillars</div>
            </div>
            <div className="lp-hero-stat">
              <div className="lp-hs-val">30+</div>
              <div className="lp-hs-label">Modules</div>
            </div>
            <div className="lp-hero-stat">
              <div className="lp-hs-val">100+</div>
              <div className="lp-hs-label">Features</div>
            </div>
            <div className="lp-hero-stat">
              <div className="lp-hs-val">5</div>
              <div className="lp-hs-label">User Roles</div>
            </div>
            <div className="lp-hero-stat">
              <div className="lp-hs-val">13</div>
              <div className="lp-hs-label">Report Types</div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Module Tabs (Deep-Dive) ===== */}
      <section className="lp-section">
        <div className="lp-section-inner">
          <div className="lp-section-header">
            <div className="lp-section-overline">Module Explorer</div>
            <h2 className="lp-section-title">Browse by Pillar</h2>
            <p className="lp-section-sub">
              Switch between pillars to explore every module and feature in detail.
            </p>
          </div>

          <ModuleTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

          {/* Active pillar header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32,
            padding: '24px 28px', borderRadius: 16,
            background: 'var(--lp-card-bg)', border: '1px solid var(--lp-card-border)',
          }}>
            <div className="lp-pillar-icon" style={{ margin: 0, flexShrink: 0 }}>
              <i className={activePillar.icon} />
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: 'var(--lp-text)' }}>
                {activePillar.title}
              </h3>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--lp-text-muted)', lineHeight: 1.6 }}>
                {activePillar.desc}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {activePillar.tags.map((t) => (
                <FeatureTag key={t} text={t} accent={activePillar.accent} />
              ))}
            </div>
          </div>

          {/* Feature list (2-col grid) */}
          <div className="lp-feature-list">
            {activePillar.modules.map((mod) => (
              <div key={mod.id} className="lp-feature-item">
                <h4>
                  <i className={mod.icon} style={{ color: 'var(--lp-accent-' + activePillar.accent + ')' }} />
                  {mod.title}
                </h4>
                {mod.features.map((f, i) => (
                  <p key={i} style={{ marginBottom: 8 }}>
                    <strong style={{ color: 'var(--lp-text)' }}>{f.title}.</strong> {f.desc}
                  </p>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Role × Module Matrix ===== */}
      <section className="lp-section lp-section--alt" id="roles">
        <div className="lp-section-inner">
          <div className="lp-section-header">
            <div className="lp-section-overline">Access Control</div>
            <h2 className="lp-section-title">Role × Module Matrix</h2>
            <p className="lp-section-sub">
              See exactly what each role can access across all six pillars.
            </p>
          </div>
          <RoleMatrix roles={ROLES} />
          <div style={{
            display: 'flex', justifyContent: 'center', gap: 24, marginTop: 20,
            fontSize: 13, color: 'var(--lp-text-muted)', flexWrap: 'wrap',
          }}>
            <span><i className="fa-solid fa-circle-check" style={{ color: 'var(--lp-accent-green)' }} /> Full access</span>
            <span><i className="fa-solid fa-circle-half-stroke" style={{ color: 'var(--lp-accent-bronze)' }} /> Limited access</span>
            <span><i className="fa-solid fa-circle-minus" style={{ color: 'var(--lp-text-faint)' }} /> No access</span>
          </div>
        </div>
      </section>

      {/* ===== Screenshot Carousel ===== */}
      <section className="lp-section" id="screenshots">
        <div className="lp-section-inner">
          <div className="lp-section-header">
            <div className="lp-section-overline">Visual Tour</div>
            <h2 className="lp-section-title">See KG-MIS in Action</h2>
            <p className="lp-section-sub">
              Preview key screens across the platform — click any card to expand.
            </p>
          </div>
          <ScreenshotCarousel items={SCREENSHOTS} />
        </div>
      </section>

      {/* ===== Technical Specs ===== */}
      <section className="lp-section lp-section--alt" id="specs">
        <div className="lp-section-inner">
          <div className="lp-section-header">
            <div className="lp-section-overline">Under the Hood</div>
            <h2 className="lp-section-title">Technical Specifications</h2>
            <p className="lp-section-sub">
              Built on a modern, secure, and performant stack — engineered for
              enterprise scale.
            </p>
          </div>
          <SpecsGrid specs={TECH_SPECS} />
        </div>
      </section>

      {/* ===== Comparison ===== */}
      <section className="lp-section" id="comparison">
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
        <h2 className="lp-cta-title">See it for yourself</h2>
        <p className="lp-cta-sub">
          Every feature, every module, every role — access KG-MIS and explore the
          platform built for Kerchanshe Group.
        </p>
        <Link href="/login" className="lp-cta-btn">
          Access Role-based Modules
          <i className="fa-solid fa-arrow-right" />
        </Link>
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
