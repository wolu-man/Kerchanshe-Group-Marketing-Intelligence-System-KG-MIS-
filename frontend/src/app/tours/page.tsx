'use client';

import Link from 'next/link';
import { Guard } from '@/components/Guard';
import { Icon } from '@/components/ui';
import { useAuth } from '@/lib/auth-context';
import { useTour } from '@/components/tour/TourProvider';
import { useStartTour } from '@/components/tour/TourTrigger';
import { toursForRole, type TourDefinition } from '@/lib/tours';

const SECTION_ORDER = [
  'Getting started',
  'Overview',
  'Field intelligence',
  'Analytics',
  'Opportunities',
  'Administration',
  'Support',
];

function TourCard({ tour }: { tour: TourDefinition }) {
  const { doneIds } = useTour() ?? { doneIds: [] as string[] };
  const startTour = useStartTour();
  const done = doneIds.includes(tour.id);

  return (
    <div className={`tour-card ${done ? 'tour-card-done' : ''}`}>
      <div className="tour-card-icon">
        <Icon name={tour.icon} />
      </div>
      <div className="tour-card-body">
        <div className="tour-card-title">
          {tour.title}
          {done ? (
            <span className="badge badge-success tour-card-badge">
              <Icon name="check" /> Completed
            </span>
          ) : null}
        </div>
        <div className="tour-card-sub">{tour.subtitle}</div>
        <div className="tour-card-meta">
          <span>
            <Icon name="list-ol" /> {tour.steps.length} steps
          </span>
          <span>
            <Icon name="clock" /> ~{Math.max(1, Math.round(tour.steps.length * 0.4))} min
          </span>
          {tour.dynamic && tour.startHint ? (
            <span className="tour-card-hint">
              <Icon name="circle-info" /> {tour.startHint}
            </span>
          ) : null}
        </div>
        <div className="tour-card-actions">
          <button type="button" className={done ? 'btn btn-ghost btn-sm' : 'btn btn-primary btn-sm'} onClick={() => startTour(tour.id)}>
            <Icon name={done ? 'rotate-right' : 'play'} />
            {done ? 'Replay' : 'Start tour'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToursInner() {
  const { user } = useAuth();
  // The sign-in tour runs on the public login screen only (it would bounce
  // authenticated users straight back to the dashboard) — link lives there.
  const tours = toursForRole(user?.role ?? null).filter((t) => t.id !== 'signin');

  const groups = SECTION_ORDER.map((section) => ({
    section,
    tours: tours.filter((t) => t.section === section),
  })).filter((g) => g.tours.length > 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Take a Tour</h1>
          <div className="sub">
            Guided, on-screen walkthroughs of every module — step-by-step highlights on the live
            interface. Prefer written docs? Visit the{' '}
            <Link href="/help">Help Center</Link>.
          </div>
        </div>
        <div className="actions">
          <Link href="/help" className="btn btn-ghost btn-sm">
            <Icon name="book-open" /> Help Center
          </Link>
        </div>
      </div>

      {tours.length === 0 ? (
        <div className="empty">
          <div className="icon">
            <Icon name="person-chalkboard" />
          </div>
          No tours are available for your role yet.
        </div>
      ) : null}

      {groups.map((g) => (
        <section key={g.section} className="tour-group">
          <h2 className="tour-group-title">{g.section}</h2>
          <div className="tour-grid">
            {g.tours.map((t) => (
              <TourCard key={t.id} tour={t} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

export default function ToursPage() {
  return (
    <Guard>
      <ToursInner />
    </Guard>
  );
}
