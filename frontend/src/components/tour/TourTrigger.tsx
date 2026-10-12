'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui';
import { useTour } from './TourProvider';
import { useAuth } from '@/lib/auth-context';
import { getTour, tourAllowedForRole } from '@/lib/tours';

/**
 * "Take a tour" / "Show me how" button for page headers.
 * Renders nothing when the tour is missing or the role cannot take it.
 * Starting is delegated to the provider, which navigates to the tour's own
 * page when needed (dynamic tours hop to their entry route + show a hint).
 */
export function TourTrigger({
  tourId,
  label = 'Take a tour',
  className = '',
}: {
  tourId: string;
  label?: string;
  className?: string;
}) {
  const tourCtx = useTour();
  const { user } = useAuth();

  const tour = getTour(tourId);
  if (!tour || !tourCtx || !tourAllowedForRole(tour, user?.role)) return null;
  if (tourCtx.isActive) return null;

  const onClick = () => {
    void tourCtx.start(tour.id);
  };

  return (
    <button
      type="button"
      className={`btn btn-ghost btn-sm ${className}`.trim()}
      onClick={onClick}
      data-tour-trigger={tour.id}
    >
      <Icon name="person-chalkboard" />
      {label}
    </button>
  );
}

/** Compact text-link variant for places where a button would clutter (login page). */
export function TourTriggerLink({ tourId, label = 'Take a tour' }: { tourId: string; label?: string }) {
  const tourCtx = useTour();
  const tour = getTour(tourId);
  if (!tour || !tourCtx || tourCtx.isActive) return null;
  return (
    <button type="button" className="tour-link" onClick={() => tourCtx.start(tour.id)}>
      <Icon name="circle-play" /> {label}
    </button>
  );
}

/** Helper for catalog pages: start a tour (provider handles any navigation). */
export function useStartTour() {
  const tourCtx = useTour();
  return (tourId: string) => {
    if (!tourCtx) return;
    void tourCtx.start(tourId);
  };
}

/** Used by the catalog for external-style links (unused elsewhere). */
export function ToursLink() {
  return <Link href="/tours">Take a Tour</Link>;
}
