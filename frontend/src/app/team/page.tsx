'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/landing';
import { TEAM_MEMBERS, CONTRIBUTION_AREAS, TEAM_INTRO } from '@/lib/team-data';
import type { TeamMember } from '@/lib/team-data';

type Theme = 'dark' | 'light';

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const saved = localStorage.getItem('kgmis_landing_theme');
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function TeamCard({ member }: { member: TeamMember }) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <article className="lp-team-card lp-animate-in" aria-labelledby={`team-${member.id}`}>
      <div className="lp-team-photo">
        {imgFailed ? (
          <span className="lp-team-fallback" aria-hidden="true">{initials(member.name)}</span>
        ) : (
          <img
            src={member.photo}
            alt={member.alt}
            width={600}
            height={600}
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
          />
        )}
        <span className="lp-team-order" aria-hidden="true">{member.order}</span>
      </div>

      <div className="lp-team-body">
        <h2 className="lp-team-name" id={`team-${member.id}`}>{member.name}</h2>
        <p className="lp-team-title">{member.title}</p>
        <p className="lp-team-area">{member.area}</p>

        <ul className="lp-team-bullets">
          {member.contributions.map((c) => (
            <li key={c}>
              <i className="fa-solid fa-check" aria-hidden="true" />
              <span>{c}</span>
            </li>
          ))}
        </ul>

        <div className="lp-team-links">
          <a href={`mailto:${member.email}`} className="lp-team-link">
            <i className="fa-solid fa-envelope" aria-hidden="true" />
            <span>{member.email}</span>
          </a>
          <a
            href={member.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            className="lp-team-link"
            aria-label={`${member.name} on LinkedIn (opens in a new tab)`}
          >
            <i className="fa-brands fa-linkedin-in" aria-hidden="true" />
            <span>LinkedIn</span>
          </a>
          {member.portfolio && (
            <a
              href={member.portfolio}
              target="_blank"
              rel="noopener noreferrer"
              className="lp-team-link"
              aria-label={`${member.name}'s portfolio (opens in a new tab)`}
            >
              <i className="fa-solid fa-globe" aria-hidden="true" />
              <span>Portfolio</span>
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

export default function TeamPage() {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => { setTheme(getInitialTheme()); }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('kgmis_landing_theme', next);
      return next;
    });
  }, []);

  const ordered = [...TEAM_MEMBERS].sort((a, b) => a.order - b.order);

  return (
    <div className="lp-theme-wrapper" data-theme={theme}>
      <ThemeToggle theme={theme} onToggle={toggleTheme} />

      {/* ===== Team Hero ===== */}
      <section className="lp-features-hero">
        <div className="lp-features-hero-content">
          <div className="lp-breadcrumb">
            <Link href="/">Home</Link>
            <i className="fa-solid fa-chevron-right" style={{ fontSize: 10 }} />
            <span>Team</span>
          </div>
          <h1>KG-MIS Development Team &amp; Contributors</h1>
          <p className="lp-hero-sub">{TEAM_INTRO}</p>
        </div>
      </section>

      {/* ===== Contribution Overview ===== */}
      <section className="lp-section" aria-labelledby="contrib-areas">
        <div className="lp-section-inner">
          <div className="lp-section-header">
            <div className="lp-section-overline">Contribution Overview</div>
            <h2 className="lp-section-title" id="contrib-areas">Disciplines Behind the Platform</h2>
            <p className="lp-section-sub">
              Six complementary disciplines combined to deliver KG-MIS from strategic
              direction through development, integration, and validation.
            </p>
          </div>
          <div className="lp-team-areas">
            {CONTRIBUTION_AREAS.map((a) => (
              <div className="lp-team-area" key={a.label}>
                <span className="lp-team-area-icon"><i className={a.icon} aria-hidden="true" /></span>
                <span>{a.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Team Grid ===== */}
      <section className="lp-section lp-section--alt" aria-labelledby="team-grid-title">
        <div className="lp-section-inner">
          <div className="lp-section-header">
            <div className="lp-section-overline">Our Team</div>
            <h2 className="lp-section-title" id="team-grid-title">Meet the Contributors</h2>
            <p className="lp-section-sub">
              Leadership, engineering, research, and enterprise integration — in the
              order the platform journey began.
            </p>
          </div>
          <div className="lp-team-grid">
            {ordered.map((m) => <TeamCard key={m.id} member={m} />)}
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="lp-section lp-cta-band">
        <div className="lp-section-inner" style={{ textAlign: 'center' }}>
          <h2 className="lp-section-title">See What the Team Built</h2>
          <p className="lp-section-sub" style={{ margin: '12px auto 28px', maxWidth: 560 }}>
            Explore every module, workflow, and report delivered by the KG-MIS team.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/features" className="lp-btn-primary">
              Explore Features
              <i className="fa-solid fa-arrow-right" aria-hidden="true" />
            </Link>
            <Link href="/login" className="lp-btn-secondary">
              Access Role-based Modules
            </Link>
          </div>
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
