// =============================================================================
// 2merkato Source Definitions — the tender.2merkato.com public listings as
// configured tender sources.
//
// Endpoint contract verified against https://tender.2merkato.com (Laravel +
// Inertia SPA; no authentication for listings, robots.txt allows all,
// X-RateLimit-Limit: 30/min — we floor at 2.5 s per request):
//   - response is HTML carrying the payload in a data-page="…" attribute
//     (JSON, HTML-entity-encoded); responseFormat "inertia-html" extracts it
//     without the X-Inertia version-hash dance (409 on frontend deploys);
//   - pagination is page=N (1-based), fixed 15 items/page, page past the end
//     returns items=0 (clean termination);
//   - ordering is stable newest-first (published_at desc) — verified identical
//     across repeat fetches;
//   - the FREE section (/tenders/free) exposes real bid closing dates for
//     every item; the FULL listing (/tenders) redacts dates for subscription
//     tenders (the raw bid_closing_date key is absent → deadlineDate null)
//     but still exposes title, organization and publication date.
//
// Shared by scripts/seed-tender-sources.ts and 2merkato.live.test.ts so the
// seeded configuration and the tested configuration can never drift apart.
// =============================================================================

export const TWOMERKATO_HOST = 'https://tender.2merkato.com';
export const TWOMERKATO_FREE_URL = `${TWOMERKATO_HOST}/tenders/free`;
export const TWOMERKATO_FULL_URL = `${TWOMERKATO_HOST}/tenders`;
export const TWOMERKATO_RATE_LIMIT_MS = 2500; // ≤24 req/min under the 30/min cap

/** Field mapping shared by the free and full listing sources. */
const TWOMERKATO_FIELDS = {
  title: { path: 'title' },
  organization: { path: 'company.name_en' },
  country: { default: 'Ethiopia' },
  sourceReference: { path: 'id' },
  // created_at is ISO-8601 UTC; published_at is wall-clock without a timezone.
  publicationDate: { path: 'created_at' },
  // Absent for subscription-redacted items in the full listing → null.
  deadlineDate: { path: 'bid_closing_date' },
  // Public detail route; redirects to login only for subscription tenders —
  // recorded as the canonical user-facing link, never fetched by the adapter.
  sourceUrl: { template: `${TWOMERKATO_HOST}/tenders/{id}` },
} as const;

/** Free section: every item has a real deadline; 7-day window ≈ pages 1–7. */
export const TWOMERKATO_FREE_SOURCE = {
  name: '2merkato Tenders — Public Free Section',
  url: TWOMERKATO_FREE_URL,
  rateLimitMs: TWOMERKATO_RATE_LIMIT_MS,
  config: {
    responseFormat: 'inertia-html' as const,
    itemsPath: 'props.tenders.data',
    pagination: { mode: 'page' as const, startPage: 1, pageSize: 15, maxPages: 8 },
    fields: TWOMERKATO_FIELDS,
  },
};

/** Full listing: ~10 pages/day → 50 pages ≈ 7-day window (~750 items). */
export const TWOMERKATO_FULL_SOURCE = {
  name: '2merkato Tenders — Full Public Listing',
  url: TWOMERKATO_FULL_URL,
  rateLimitMs: TWOMERKATO_RATE_LIMIT_MS,
  config: {
    responseFormat: 'inertia-html' as const,
    itemsPath: 'props.tenders.data',
    pagination: { mode: 'page' as const, startPage: 1, pageSize: 15, maxPages: 50 },
    fields: TWOMERKATO_FIELDS,
  },
};

export function twomerkatoApiConfigJson(
  source: typeof TWOMERKATO_FREE_SOURCE | typeof TWOMERKATO_FULL_SOURCE,
): string {
  return JSON.stringify(source.config, null, 2);
}
