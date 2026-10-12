// =============================================================================
// TenderMetro Source Definition — www.tendermetro.com/api/public/v1 as a
// configured tender source (Ethiopia).
//
// Endpoint contract verified against https://app.tendermetro.com/docs,
// https://app.tendermetro.com/data-model and live probes (key required):
//   - GET /api/public/v1/opportunities with Authorization: Bearer <key>
//     (or x-api-key); quota 1,000 requests/hour per key → 4 s pacing (15/min);
//   - list response is { data: [...], meta: { total, limit, offset } };
//     itemsPath points at "data"; meta.total is nested, so termination relies
//     on the empty page (offset past the end returns data: []) + maxPages;
//   - pagination is offset/limit; limit caps at 100 server-side; page order is
//     stable (repeat requests identical, pages disjoint — verified);
//   - filters: query, sector, region, country, status, type, min_value,
//     limit, offset. country=Ethiopia works server-side (244 rows). There is
//     NO publication-date filter (published_after / date_from / since are all
//     ignored) → recency is enforced client-side via maxAgeDays (7-day
//     rolling window, plan guardrail: no historical backfill);
//   - organization lives on buyers.name (an OBJECT despite the plural name,
//     null on most Ethiopian e-GP rows); published_at is a plain ISO date,
//     closes_at an ISO timestamp (null on ~8% of rows);
//   - value_usd is USD-normalised — deliberately NOT mapped (mixing USD into
//     the ETB EstimatedValue column would corrupt profile relevance ranges);
//     currency/incumbent are mostly empty anyway;
//   - procurement_type/status are not opportunity-type enums → type comes
//     from the keyword classifier, like every other source;
//   - robots.txt: User-agent: * Allow: / (permissive).
//
// The API key lives ONLY in .env (TENDERMETRO_API_KEY) and is interpolated
// into the Authorization header at request time — never stored in
// dbo.TenderSource. When the key is absent, scripts/seed-tender-sources.ts
// keeps this source inactive (IsActive = 0) and it is never collected.
//
// Shared by scripts/seed-tender-sources.ts and tendermetro.live.test.ts so
// the seeded configuration and the tested configuration can never drift apart.
// =============================================================================

export const TENDERMETRO_SOURCE_NAME = 'TenderMetro Intelligence — Ethiopia';
export const TENDERMETRO_API_URL = 'https://www.tendermetro.com/api/public/v1/opportunities';
export const TENDERMETRO_RATE_LIMIT_MS = 4000; // 15 req/min of the 1,000/hour quota
/** Days of publication age kept per run (7-day rolling window). */
export const TENDERMETRO_MAX_AGE_DAYS = 7;
/** Rows per request (server-side cap verified). */
export const TENDERMETRO_PAGE_SIZE = 100;

export const TENDERMETRO_SOURCE = {
  name: TENDERMETRO_SOURCE_NAME,
  url: TENDERMETRO_API_URL,
  rateLimitMs: TENDERMETRO_RATE_LIMIT_MS,
  config: {
    // ${TENDERMETRO_API_KEY} is interpolated from process.env at request time.
    headers: { Authorization: 'Bearer ${TENDERMETRO_API_KEY}' },
    params: {
      country: 'Ethiopia',
      limit: String(TENDERMETRO_PAGE_SIZE),
    },
    // offset/limit paging: Ethiopia has ~244 rows (3 pages); maxPages 5 caps
    // runaway fetches while covering current + incoming rows.
    pagination: {
      mode: 'offset' as const,
      startSkip: 0,
      pageSize: TENDERMETRO_PAGE_SIZE,
      maxPages: 5,
    },
    // No server-side date filter exists — gate recency client-side.
    maxAgeDays: TENDERMETRO_MAX_AGE_DAYS,
    itemsPath: 'data',
    fields: {
      title: { path: 'title' },
      organization: { path: 'buyers.name' },
      country: { path: 'country' },
      sector: { path: 'sector' },
      description: { path: 'summary' },
      sourceReference: { path: 'ref' },
      // published_at: ISO date (100% present); closes_at: ISO timestamp (~92%).
      publicationDate: { path: 'published_at' },
      deadlineDate: { path: 'closes_at' },
      // Publisher's own portal link (deep links vary by source system).
      sourceUrl: { path: 'source_url' },
      // Macro-geography (e.g. "Africa"/"Global") — plan §6 "preserve where
      // available"; the API has no city-level field (city stays unavailable).
      region: { path: 'region' },
      // Intentionally unmapped: estimatedValue/currency (value_usd is USD —
      // would corrupt the ETB-based EstimatedValue column and profile ranges).
    },
  },
};

export function tendermetroApiConfigJson(): string {
  return JSON.stringify(TENDERMETRO_SOURCE.config, null, 2);
}
