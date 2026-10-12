// =============================================================================
// Tender Source Policy — pure helpers shared by the source service, the
// collection service, and the route layer.
//
// 1. Restricted hosts: sources whose URL resolves to a host with no authorized
//    data-access method are always stored inactive and are never fetched.
//    No endpoint discovery, no rendering tricks, no bypassing of restrictions.
// 2. Collection status: derived from what actually happened in a run so that
//    "everything was a duplicate" is never reported as a failure.
// 3. Duplicate-key detection: a race between two collection runs surfaces as a
//    SQL unique-violation, which must be counted as a duplicate — not an error.
// =============================================================================

import { env } from '../../config/env';

export type CollectionStatus = 'Success' | 'Failed' | 'Partial';

/** Normalizes a hostname for comparison (lowercase, no leading/trailing dots). */
function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/^\.+|\.+$/g, '');
}

/**
 * Returns true when the URL's hostname matches a configured restricted host
 * (exact match or subdomain). Unparseable URLs are treated as restricted so
 * they can never be collected by accident.
 */
export function isRestrictedSourceUrl(url: string | null | undefined): boolean {
  if (!url) return true;
  return isRestrictedHost(hostOf(url));
}

/** Returns the matching restricted host for a URL, or null when unrestricted. */
export function restrictedHostFor(url: string | null | undefined): string | null {
  if (!url) return null;
  const host = hostOf(url);
  if (!host) return 'invalid-url';
  const match = env.tenders.restrictedHosts.find((entry) => hostMatches(host, entry));
  return match ?? null;
}

/** True when the hostname (or a parent domain) is on the restricted list. */
export function isRestrictedHost(host: string | null | undefined): boolean {
  if (!host) return true;
  const normalized = normalizeHost(host);
  if (!normalized) return true;
  return restrictedHosts().some((entry) => hostMatches(normalized, entry));
}

/** Message shown to operators when a source is held inactive. */
export function restrictedSourceMessage(url: string | null | undefined): string {
  const host = hostOf(url || '') || restrictedHostFor(url) || 'this host';
  return (
    `Source is restricted: no authorized data-access method is available for "${host}". ` +
    'The source is stored inactive and will not be collected until one becomes available.'
  );
}

// ---------------------------------------------------------------------------
// Collection status
// ---------------------------------------------------------------------------

export interface CollectionCounters {
  /** Items returned by the adapter. */
  fetched: number;
  /** Rows actually inserted. */
  inserted: number;
  /** Rows skipped because an identical opportunity already exists. */
  duplicates: number;
  /** Rows that could not be inserted for unexpected reasons. */
  failed: number;
}

/**
 * Derives the persisted/reported status of a collection run.
 *
 * - fetch failed (no items produced at all and nothing succeeded) -> Failed
 * - every fetched item failed to insert                            -> Failed
 * - some items failed to insert                                    -> Partial
 * - otherwise (including "all duplicates")                         -> Success
 */
export function computeCollectionStatus(counters: CollectionCounters, fetchFailed: boolean): CollectionStatus {
  if (fetchFailed) return 'Failed';
  if (counters.fetched === 0) return 'Success';
  if (counters.failed >= counters.fetched) return 'Failed';
  if (counters.failed > 0) return 'Partial';
  return 'Success';
}

// ---------------------------------------------------------------------------
// SQL duplicate detection
// ---------------------------------------------------------------------------

const DUPLICATE_KEY_ERROR_NUMBERS = new Set([2601, 2627]);

/**
 * Detects a SQL Server unique/index violation (error 2601 / 2627).
 * Used to count a concurrent-insert race as a duplicate instead of a failure.
 */
export function isDuplicateKeyError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const number = (err as { number?: unknown }).number;
  if (typeof number === 'number' && DUPLICATE_KEY_ERROR_NUMBERS.has(number)) return true;
  const message = String((err as { message?: unknown }).message ?? '');
  return /duplicate key|unique key|violates unique constraint/i.test(message);
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function restrictedHosts(): string[] {
  return env.tenders.restrictedHosts;
}

function hostMatches(host: string, entry: string): boolean {
  if (!entry) return false;
  return host === entry || host.endsWith(`.${entry}`);
}

function hostOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return normalizeHost(parsed.hostname);
  } catch {
    return null;
  }
}
