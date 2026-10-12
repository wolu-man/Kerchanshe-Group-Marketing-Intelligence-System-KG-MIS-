// Row-level data scope helpers (Security Matrix Section 4). Services compose
// these into their SQL and always bind @UserId with the authenticated user.
export type DataScope = 'all' | 'own' | 'region';

export interface ScopeOptions {
  /** table alias prefix, e.g. 'r' */
  alias: string;
  /** owner column for "own" scope, e.g. 'UserID' / 'RecordedBy' */
  ownerColumn?: string;
  /** region column for "region" scope, e.g. 'RegionID' */
  regionColumn?: string;
}

/**
 * Builds a SQL predicate fragment for the given data scope.
 * Returns an empty string when no filtering is required.
 */
export function scopeClause(scope: DataScope, opts: ScopeOptions): string {
  if (scope === 'all') return '';
  if (scope === 'own') {
    if (!opts.ownerColumn) return '';
    // return a bare predicate fragment (no leading AND/OR)
    return `${opts.alias}.${opts.ownerColumn} = @UserId`;
  }
  if (scope === 'region') {
    if (!opts.regionColumn) return '';
    return `${opts.alias}.${opts.regionColumn} IN (SELECT RegionID FROM dbo.UserRegionAssignment WHERE UserID = @UserId)`;
  }
  return '';
}

/** Predicate for outlet-level region scoping (outlet belongs to a region). */
export function scopeClauseViaOutlet(scope: DataScope, opts: { alias: string }): string {
  if (scope === 'region') {
    // return a bare predicate fragment for outlet -> region scoping
    return `${opts.alias}.OutletID IN (SELECT o.OutletID FROM dbo.Outlet o JOIN dbo.UserRegionAssignment ura ON ura.RegionID = o.RegionID WHERE ura.UserID = @UserId)`;
  }
  return '';
}
