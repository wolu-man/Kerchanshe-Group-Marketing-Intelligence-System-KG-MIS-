// =============================================================================
// Predictive insight cache — in-memory TTL (Map) in front of the persisted
// PredictiveInsight rows. The TTL comes from SystemConfig
// (prediction.cacheTtlMinutes, default 60) and is memoized for 5 minutes so a
// dashboard full of cards costs one config read, not one per card.
// =============================================================================

import sql from 'mssql';
import { db } from '../../db/pool';
import type { PredictiveInsight } from './predictive.types';

const DEFAULT_TTL_MINUTES = 60;
const TTL_MEMO_MS = 5 * 60 * 1000;

interface CacheEntry {
  value: PredictiveInsight;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();

let ttlMinutes = DEFAULT_TTL_MINUTES;
let ttlLoadedAt = 0;

async function ttlMinutesFromConfig(): Promise<number> {
  const now = Date.now();
  if (now - ttlLoadedAt < TTL_MEMO_MS) return ttlMinutes;
  try {
    const row = await db.request().input('Key', sql.VarChar(100), 'prediction.cacheTtlMinutes').query(
      `SELECT ConfigValue FROM dbo.SystemConfig WHERE ConfigKey = @Key`
    );
    const n = Number(row.recordset[0]?.ConfigValue);
    ttlMinutes = Number.isFinite(n) && n > 0 ? n : DEFAULT_TTL_MINUTES;
  } catch {
    ttlMinutes = DEFAULT_TTL_MINUTES;
  }
  ttlLoadedAt = now;
  return ttlMinutes;
}

export function buildCacheKey(parts: {
  module: string;
  metric: string;
  granularity: string;
  horizon: number;
  dataScope: string;
  userId: number;
  regionId?: number;
  productId?: number;
  colorId?: number;
  formId?: number;
}): string {
  const owner = parts.dataScope === 'all' ? 'all' : `u${parts.userId}`;
  return [
    parts.module,
    parts.metric,
    parts.granularity,
    `h${parts.horizon}`,
    owner,
    parts.regionId ? `r${parts.regionId}` : '-',
    parts.productId ? `p${parts.productId}` : '-',
    parts.colorId ? `c${parts.colorId}` : '-',
    parts.formId ? `f${parts.formId}` : '-',
  ].join(':');
}

/** Returns the cached insight when still fresh, otherwise null. */
export async function getCached(key: string): Promise<PredictiveInsight | null> {
  const hit = store.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return hit.value;
}

export async function setCached(key: string, value: PredictiveInsight): Promise<void> {
  const ttl = await ttlMinutesFromConfig();
  store.set(key, { value, expiresAt: Date.now() + ttl * 60_000 });
}

export function clearCache(): void {
  store.clear();
}

export function cacheSize(): number {
  return store.size;
}
