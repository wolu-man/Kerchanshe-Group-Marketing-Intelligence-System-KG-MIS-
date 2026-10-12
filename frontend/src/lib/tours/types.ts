// Content model for the KG-MIS Interactive Tour feature.
// Framework-agnostic: content modules import only from here (relative imports)
// so the integrity test runs under plain tsx without path aliases.

export type TourRole =
  | 'Administrator'
  | 'Marketing Manager'
  | 'Marketing Analyst'
  | 'Field Officer'
  | 'Viewer';

export type TourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center';

export interface TourStep {
  /** CSS selector for the target. Prefer [data-tour="..."], else stable classes. */
  selector: string;
  /** ≤900px override: alternate target. `null` skips the step on small screens. */
  mobileSelector?: string | null;
  /** Navigate to this route before showing the step (multi-route tours). */
  route?: string;
  /** Show the step only on these routes (defaults to all of the tour's routes). */
  routes?: string[];
  title: string;
  body: string;
  placement?: TourPlacement;
  /** Restrict the step to these roles (default: tour roles). */
  roles?: TourRole[];
}

export interface TourDefinition {
  id: string;
  title: string;
  subtitle: string;
  /** Font Awesome 6 icon name (no fa- prefix). */
  icon: string;
  /** Sidebar/catalog section used to group the tour in the /tours catalog. */
  section: string;
  roles: string[] | 'all';
  /** Primary route (first entry) + alias routes where the tour is offered. */
  routes: string[];
  /** True when the tour only works on a dynamic page (e.g. /forms/[id]). */
  dynamic?: boolean;
  /** Static route to open before starting a dynamic tour (usually the module list). */
  entry?: string;
  /** Catalog hint for dynamic tours ("Open any form first…"). */
  startHint?: string;
  steps: TourStep[];
}
