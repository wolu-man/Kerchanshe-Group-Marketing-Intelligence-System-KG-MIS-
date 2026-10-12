// =============================================================================
// Source Test Service — connection/configuration diagnostics.
//
// Runs a source's adapter against its URL exactly once and reports what came
// back. Nothing is written to dbo.TenderOpportunity, no credentials or raw
// payloads are returned, and restricted hosts are never contacted.
// =============================================================================

import sql from 'mssql';
import { db } from '../../db/pool';
import { NotFoundError } from '../../utils/errors';
import { getAdapter } from './adapters/adapter';
import { isRestrictedSourceUrl, restrictedSourceMessage } from './source-policy';
import type { SourceTestResult } from './tenders.types';

export interface SourceTestInput {
  SourceType: 'api' | 'rss' | 'scraping';
  URL: string;
  ApiConfig?: string | null;
  RateLimitMs?: number;
  RobotsCompliance?: boolean;
}

const SAMPLE_SIZE = 5;

function emptyResult(): SourceTestResult {
  return {
    ok: false,
    restricted: false,
    error: null,
    durationMs: 0,
    fetched: 0,
    sample: [],
  };
}

/** Tests an in-memory (possibly unsaved) source configuration. */
export async function testSource(input: SourceTestInput): Promise<SourceTestResult> {
  const startedAt = Date.now();

  if (isRestrictedSourceUrl(input.URL)) {
    return {
      ...emptyResult(),
      restricted: true,
      error: restrictedSourceMessage(input.URL),
    };
  }

  // Surface a malformed adapter config as a clear diagnostic, not a JSON crash.
  if (input.ApiConfig) {
    try {
      JSON.parse(input.ApiConfig);
    } catch (err) {
      return {
        ...emptyResult(),
        error: `Adapter config is not valid JSON: ${(err as Error).message}`,
        durationMs: Date.now() - startedAt,
      };
    }
  }

  try {
    const adapter = getAdapter(input.SourceType);
    const raw = await adapter.fetch({
      TenderSourceID: 0,
      Name: 'test',
      SourceType: input.SourceType,
      URL: input.URL,
      ApiConfig: input.ApiConfig || null,
      RateLimitMs: input.RateLimitMs ?? 2000,
      RobotsCompliance: input.RobotsCompliance !== false,
    });

    return {
      ok: true,
      restricted: false,
      error: null,
      durationMs: Date.now() - startedAt,
      fetched: raw.length,
      sample: raw.slice(0, SAMPLE_SIZE).map((r) => ({
        title: r.title,
        sourceUrl: r.sourceUrl,
        deadlineDate: r.deadlineDate ? r.deadlineDate.toISOString() : null,
      })),
    };
  } catch (err) {
    return {
      ...emptyResult(),
      error: (err as Error).message || 'Source test failed',
      durationMs: Date.now() - startedAt,
    };
  }
}

/** Tests a source already stored in dbo.TenderSource (active or not). */
export async function testSourceById(id: number): Promise<SourceTestResult> {
  const result = await db
    .request()
    .input('Id', sql.Int, id)
    .query(
      `SELECT SourceType, URL, ApiConfig, RateLimitMs, RobotsCompliance
       FROM dbo.TenderSource
       WHERE TenderSourceID = @Id`
    );
  if (result.recordset.length === 0) {
    throw new NotFoundError('Tender source not found');
  }
  const row = result.recordset[0];
  return testSource({
    SourceType: row.SourceType,
    URL: row.URL,
    ApiConfig: (row.ApiConfig as string) || null,
    RateLimitMs: row.RateLimitMs as number,
    RobotsCompliance: !!row.RobotsCompliance,
  });
}
