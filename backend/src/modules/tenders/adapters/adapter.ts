// =============================================================================
// Tender Intelligence — Source Adapter interface and shared utilities.
//
// Each adapter (API / RSS / Scraping) implements the SourceAdapter interface.
// The collection service resolves the adapter by SourceType at runtime.
// All adapters respect robots.txt, rate limits, and access restrictions.
// =============================================================================

import { createHash } from 'crypto';
import { env } from '../../../config/env';
import { logger } from '../../../config/logger';

/** A raw opportunity extracted from a source before normalization/dedup. */
export interface RawOpportunity {
  title: string;
  organization: string | null;
  country: string | null;
  sector: string | null;
  description: string | null;
  sourceUrl: string;
  sourceReference: string | null;
  publicationDate: Date | null;
  deadlineDate: Date | null;
  estimatedValue: number | null;
  currency: string | null;
  /**
   * Region / macro-geography when the source provides one (plan §6 "preserve
   * where available"). Not part of the content hash — dedup is unchanged.
   */
  region?: string | null;
  /**
   * Source-declared opportunity type (e.g. an RFQ flag mapped from the feed).
   * When it matches OPPORTUNITY_TYPES it overrides keyword-based classification.
   * Not part of the content hash — dedup behavior is unchanged.
   */
  opportunityType?: string | null;
}

/** Source configuration passed from the dbo.TenderSource row. */
export interface TenderSourceConfig {
  TenderSourceID: number;
  Name: string;
  SourceType: 'api' | 'rss' | 'scraping';
  URL: string;
  ApiConfig: string | null;
  RateLimitMs: number;
  RobotsCompliance: boolean;
}

/** Result of a single source collection run. */
export interface CollectionResult {
  sourceId: number;
  sourceName: string;
  status: 'Success' | 'Failed' | 'Partial';
  /** Raw items returned by the adapter (pre-dedup). */
  opportunities: RawOpportunity[];
  /** Items actually inserted during this run. */
  newCount: number;
  /** Items skipped because an identical opportunity already exists. */
  duplicateCount: number;
  /** Items that could not be inserted for unexpected reasons. */
  failedCount: number;
  error: string | null;
}


export interface SourceAdapter {
  readonly type: 'api' | 'rss' | 'scraping';
  /** Fetches raw opportunities from the source. Respects robots.txt and rate limits. */
  fetch(source: TenderSourceConfig): Promise<RawOpportunity[]>;
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

/** Trims, collapses whitespace, and normalizes to title-case-ish for dedup. */
export function normalizeText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s\-]/g, '')
    .toLowerCase();
}

// TenderInfo publishes deadlines as DD-MM-YYYY ("05-11-2026"), which
// `new Date()` cannot parse (it returns Invalid Date, silently → null).
const DMY_PATTERN = /^(\d{2})-(\d{2})-(\d{4})$/;

/** Normalizes a date value that might be a string, Date, or ISO fragment. */
export function normalizeDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const dmy = DMY_PATTERN.exec(trimmed);
    if (dmy) {
      const day = Number(dmy[1]);
      const month = Number(dmy[2]);
      const year = Number(dmy[3]);
      // Date.UTC silently rolls over invalid days (31-02 → 03-03); reject
      // anything that does not round-trip to the same calendar date.
      const d = new Date(Date.UTC(year, month - 1, day));
      const valid =
        !isNaN(d.getTime()) &&
        d.getUTCFullYear() === year &&
        d.getUTCMonth() === month - 1 &&
        d.getUTCDate() === day;
      return valid ? d : null;
    }
    // Try ISO first, then common formats.
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;
  }
  if (typeof value === 'number') {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

/** Formats a date to YYYY-MM-DD for hash stability (ignores time component). */
export function dateToHashable(value: Date | null): string {
  if (!value) return '';
  return value.toISOString().slice(0, 10);
}

/**
 * Computes a deterministic SHA-256 content hash for deduplication.
 * Based on normalized title + organization + deadline date.
 */
export function contentHash(raw: RawOpportunity): string {
  const parts = [
    normalizeText(raw.title),
    normalizeText(raw.organization),
    dateToHashable(raw.deadlineDate),
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

// ---------------------------------------------------------------------------
// HTTP fetch with timeout (Node 20+ native fetch)
// ---------------------------------------------------------------------------

/**
 * Network-level error codes that self-heal on retry (connect throttling,
 * transient DNS hiccups, reset connections). HTTP status errors and
 * client-side timeouts are NOT retried.
 */
const RETRYABLE_CAUSE_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
]);

function isRetryableNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const cause = err.cause as { code?: unknown } | undefined;
  return typeof cause?.code === 'string' && RETRYABLE_CAUSE_CODES.has(cause.code);
}

/** Fetches a URL with a configurable timeout. Returns text content or throws. */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = env.tenders.fetchTimeoutMs,
): Promise<string> {
  const maxAttempts = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      // Backoff before retrying a transient connect failure.
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt - 1)));
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'User-Agent': 'KG-MIS-Tender-Intelligence/1.0',
          ...options.headers,
        },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
      }
      return await res.text();
    } catch (err) {
      lastError = err;
      if (!isRetryableNetworkError(err)) throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

/**
 * Raised for empty or unparseable response bodies. Some hosts (observed on
 * tenderinfo.org) intermittently answer 200 with a zero-byte body; those
 * self-heal on a short retry, so fetchJsonWithTimeout retries this error kind.
 * HTTP status errors and network errors are already handled (and not doubled)
 * inside fetchWithTimeout.
 */
class TransientBodyError extends Error {}

/** Fetches JSON from a URL with timeout. Retries empty/invalid JSON bodies. */
export async function fetchJsonWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = env.tenders.fetchTimeoutMs,
): Promise<unknown> {
  const maxAttempts = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt - 1)));
    }
    try {
      const text = await fetchWithTimeout(url, options, timeoutMs);
      if (text.trim() === '') {
        throw new TransientBodyError(`Empty response body from ${url}`);
      }
      try {
        return JSON.parse(text);
      } catch {
        throw new TransientBodyError(`Invalid JSON response from ${url}`);
      }
    } catch (err) {
      lastError = err;
      if (!(err instanceof TransientBodyError)) throw err;
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// robots.txt compliance
// ---------------------------------------------------------------------------

interface RobotsRule {
  allowed: boolean;
}

/** Minimal robots.txt checker. Only checks User-agent: * rules. */
async function checkRobotsTxt(baseUrl: string, path: string): Promise<RobotsRule> {
  try {
    const robotsUrl = new URL('/robots.txt', baseUrl).href;
    const text = await fetchWithTimeout(robotsUrl, {}, 10000);
    const lines = text.split(/\r?\n/);
    let appliesToAll = false;
    let disallowedPaths: string[] = [];
    let allowedPaths: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [field, ...rest] = trimmed.split(':');
      const value = rest.join(':').trim();
      if (field.toLowerCase() === 'user-agent') {
        if (value === '*') {
          appliesToAll = true;
        } else {
          appliesToAll = false;
        }
      } else if (appliesToAll && field.toLowerCase() === 'disallow') {
        if (value) disallowedPaths.push(value);
      } else if (appliesToAll && field.toLowerCase() === 'allow') {
        if (value) allowedPaths.push(value);
      }
    }

    // Check if the path matches any disallow rule.
    for (const disallowed of disallowedPaths) {
      if (path.startsWith(disallowed)) {
        // Check if there's a more specific allow rule.
        for (const allowed of allowedPaths) {
          if (path.startsWith(allowed) && allowed.length > disallowed.length) {
            return { allowed: true };
          }
        }
        return { allowed: false };
      }
    }
    return { allowed: true };
  } catch (err) {
    // If robots.txt is unreachable, default to allowed (common web convention).
    logger.warn('robots.txt unreachable, defaulting to allowed', { baseUrl, error: (err as Error).message });
    return { allowed: true };
  }
}

/** Checks if a URL is allowed by robots.txt. Returns true if allowed. */
export async function isUrlAllowedByRobots(
  targetUrl: string,
  enforce: boolean,
): Promise<boolean> {
  if (!enforce) return true;
  try {
    const parsed = new URL(targetUrl);
    const { allowed } = await checkRobotsTxt(`${parsed.protocol}//${parsed.host}`, parsed.pathname);
    return allowed;
  } catch {
    // If URL parsing fails, don't fetch.
    return false;
  }
}

/** Enforces a rate-limit delay between requests to the same source. */
export async function rateLimitDelay(ms: number): Promise<void> {
  if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Adapter registry
// ---------------------------------------------------------------------------

import { ApiAdapter } from './api-adapter';
import { RssAdapter } from './rss-adapter';
import { ScrapingAdapter } from './scraping-adapter';

// Adapters import normalization/fetch helpers from this module, creating a
// circular import. Instances must therefore be created lazily — instantiating
// them while this module is still evaluating races the adapter classes' own
// initialization when the entry module imports an adapter file first.
let apiAdapter: ApiAdapter | null = null;
let rssAdapter: RssAdapter | null = null;
let scrapingAdapter: ScrapingAdapter | null = null;

const ADAPTER_FACTORIES: Record<'api' | 'rss' | 'scraping', () => SourceAdapter> = {
  api: () => (apiAdapter = apiAdapter || new ApiAdapter()),
  rss: () => (rssAdapter = rssAdapter || new RssAdapter()),
  scraping: () => (scrapingAdapter = scrapingAdapter || new ScrapingAdapter()),
};

/** Returns the adapter for the given type. */
export function getAdapter(type: 'api' | 'rss' | 'scraping'): SourceAdapter {
  return ADAPTER_FACTORIES[type]();
}
