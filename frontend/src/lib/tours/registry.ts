// Tour registry: aggregates all tour definitions and provides lookup helpers.
// Framework-agnostic (relative imports only) so the integrity test runs under tsx.

import type { TourDefinition, TourStep } from './types';
import { SIGNIN_TOUR } from './content/signin';
import { INTRO_TOUR } from './content/intro';
import {
  DASHBOARD_TOUR,
  NOTIFICATIONS_TOUR,
  PROFILE_TOUR,
  HELP_TOUR,
} from './content/core';
import { TOURS_TOUR } from './content/catalog';
import {
  VISITS_TOUR,
  INTERVIEWS_TOUR,
  MULTIMEDIA_TOUR,
  WEEKLY_SALES_TOUR,
} from './content/field';
import { FORMS_TOUR, FORM_BUILDER_TOUR, FORM_RESPOND_TOUR } from './content/forms';
import { PRICING_TOUR, REPORTS_TOUR, OFFICER_PERFORMANCE_TOUR } from './content/analytics';
import {
  TENDERS_TOUR,
  TENDERS_DETAIL_TOUR,
  TENDERS_IMPORT_TOUR,
  TENDERS_SOURCES_TOUR,
  TENDERS_INTEREST_TOUR,
  TENDERS_ASSISTANT_TOUR,
} from './content/tenders';
import {
  ADMIN_USERS_TOUR,
  ADMIN_KPI_TOUR,
  ADMIN_CUSTOMERS_TOUR,
  ADMIN_PRODUCTS_TOUR,
  ADMIN_CATALOGUE_TOUR,
  ADMIN_COMPETITORS_TOUR,
  ADMIN_BUSINESS_GROUPS_TOUR,
  ADMIN_REGIONS_TOUR,
  ADMIN_RELATIONSHIPS_TOUR,
} from './content/admin';

export const ALL_TOURS: TourDefinition[] = [
  SIGNIN_TOUR,
  INTRO_TOUR,
  DASHBOARD_TOUR,
  NOTIFICATIONS_TOUR,
  PROFILE_TOUR,
  HELP_TOUR,
  TOURS_TOUR,
  VISITS_TOUR,
  INTERVIEWS_TOUR,
  MULTIMEDIA_TOUR,
  WEEKLY_SALES_TOUR,
  FORMS_TOUR,
  FORM_BUILDER_TOUR,
  FORM_RESPOND_TOUR,
  PRICING_TOUR,
  REPORTS_TOUR,
  OFFICER_PERFORMANCE_TOUR,
  TENDERS_TOUR,
  TENDERS_DETAIL_TOUR,
  TENDERS_IMPORT_TOUR,
  TENDERS_SOURCES_TOUR,
  TENDERS_INTEREST_TOUR,
  TENDERS_ASSISTANT_TOUR,
  ADMIN_USERS_TOUR,
  ADMIN_KPI_TOUR,
  ADMIN_CUSTOMERS_TOUR,
  ADMIN_PRODUCTS_TOUR,
  ADMIN_CATALOGUE_TOUR,
  ADMIN_COMPETITORS_TOUR,
  ADMIN_BUSINESS_GROUPS_TOUR,
  ADMIN_REGIONS_TOUR,
  ADMIN_RELATIONSHIPS_TOUR,
];

export function getTour(id: string): TourDefinition | undefined {
  return ALL_TOURS.find((t) => t.id === id);
}

export function tourAllowedForRole(tour: TourDefinition, role: string | null | undefined): boolean {
  if (!role) return false;
  return tour.roles === 'all' || tour.roles.includes(role);
}

/** Tours the given role may take, in catalog order. */
export function toursForRole(role: string | null | undefined): TourDefinition[] {
  if (!role) return [];
  return ALL_TOURS.filter((t) => tourAllowedForRole(t, role));
}

function routeToRegExp(route: string): RegExp {
  // '/forms/[id]' -> /^\/forms\/[^/]+$/ ; static routes match exactly.
  const pattern = route
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\[([a-zA-Z]+)\\\]/g, '[^/]+');
  return new RegExp(`^${pattern}$`);
}

/** True when the pathname matches one of the tour's routes (patterns supported). */
export function tourMatchesRoute(tour: TourDefinition, pathname: string): boolean {
  return tour.routes.some((r) => (r.includes('[') ? routeToRegExp(r).test(pathname) : r === pathname));
}

/**
 * Best tour for the current pathname + role (dynamic patterns win over static,
 * longer patterns win over shorter ones). Used for contextual triggers and the
 * multi-route engine's route bookkeeping.
 */
export function tourForRoute(
  pathname: string,
  role: string | null | undefined
): TourDefinition | undefined {
  const candidates = toursForRole(role).filter((t) => tourMatchesRoute(t, pathname));
  if (candidates.length === 0) return undefined;
  return candidates.sort((a, b) => {
    const aDyn = a.routes.some((r) => r.includes('[')) ? 1 : 0;
    const bDyn = b.routes.some((r) => r.includes('[')) ? 1 : 0;
    if (aDyn !== bDyn) return bDyn - aDyn;
    return Math.max(...b.routes.map((r) => r.split('/').length)) -
      Math.max(...a.routes.map((r) => r.split('/').length));
  })[0];
}

/**
 * Effective route of a step: explicit step.route wins; otherwise it inherits
 * from the previous step, defaulting to the pathname where the tour started.
 * (Engine only navigates when a step carries an explicit route.)
 */
export function effectiveRoute(
  _tour: TourDefinition,
  steps: TourStep[],
  index: number,
  startPath: string
): string {
  for (let i = index; i >= 0; i--) {
    if (steps[i].route) return steps[i].route as string;
  }
  return startPath;
}

/** Steps visible for the given role (step.roles filter). */
export function stepsForRole(tour: TourDefinition, role: string | null | undefined): TourStep[] {
  if (!role) return [];
  return tour.steps.filter((s) => {
    if (!s.roles) return true;
    if (tour.roles !== 'all' && !tour.roles.includes(role)) return false;
    return s.roles.includes(role as never);
  });
}

/**
 * The runnable step list for a tour started on `startPath`: role filter plus
 * route restrictions (`step.routes` = only on those pages — decided by the
 * start pathname since tours do not navigate into restricted-route steps).
 */
export function activeSteps(
  tour: TourDefinition,
  role: string | null | undefined,
  startPath: string
): TourStep[] {
  return stepsForRole(tour, role).filter((s) =>
    s.routes ? s.routes.includes(startPath) : true
  );
}
