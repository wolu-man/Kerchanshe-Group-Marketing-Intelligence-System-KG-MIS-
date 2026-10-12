// =============================================================================
// AI features — request throttling (in-memory buckets).
// Shared by the form assistant, respondent writing assistant, response analysis
// and data intelligence so every AI endpoint is throttled the same way.
// =============================================================================

import { TooManyRequestsError } from '../../utils/errors';

const WINDOW_MS = 60_000;
/** Existing contract: AI requests per user per minute (unchanged). */
const USER_MAX = 30;

const buckets = new Map<string, { count: number; resetAt: number }>();

function hit(key: string, max: number, message: string): void {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
  if (entry.count > max) throw new TooManyRequestsError(message);
}

/** Authenticated AI surface — 30 requests per user per minute. */
export function assertRateLimit(userId: number): void {
  hit(`u:${userId}`, USER_MAX, 'You are sending AI requests too quickly. Please wait a moment.');
}

/**
 * Anonymous AI surface — keyed by client IP and surface, so the public chat
 * and the public writing assistant throttle independently.
 */
export function assertIpRateLimit(
  ip: string | undefined | null,
  max: number,
  message: string,
  surface = 'writing'
): void {
  hit(`ip:${surface}:${ip || 'unknown'}`, max, message);
}
