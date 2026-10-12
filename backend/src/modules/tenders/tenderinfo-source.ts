// =============================================================================
// TenderInfo Source Definition — www.tenderinfo.org/api/export as a configured
// tender source (public mode: no api_code).
//
// Endpoint contract verified against https://www.tenderinfo.org/api/docs
// (official docs) and live probes (see git history for probe transcripts):
//   - response is a top-level JSON array: first element is metadata
//     ({ Total: "…" }), followed by items; empty result sets are [] ;
//   - our User-Agent "KG-MIS-Tender-Intelligence/1.0" is required (the default
//     curl/undici UAs get HTTP 403) — fetchWithTimeout already sends it;
//   - date_start / date_end are DD-MM-YYYY (NOW-7d|dmy tokens in params);
//   - kwords matches whole words only (no stemming): Ethiopia, Ethiopian and
//     Addis are disjoint queries; "|" separates terms with OR semantics
//     (verified: "Ethiopia|Ethiopian" total ≈ union of both);
//     phrases do not survive mixing with "|" ("Addis Ababa|Ethiopia" silently
//     reinterprets as AND) — keep every term a single word;
//   - c{country_id} is IGNORED in public mode (verified: c70=1 returns the
//     unfiltered total) — Ethiopia rows are kept client-side via itemFilter
//     (Country_ID == "70"); e{source_id} works but no Ethiopia-dedicated
//     source exists in the public catalog, and mode=sources returns 0 bytes;
//   - IsMarketPlace ("RFQ/marketplace flag") is 1 on 100% of public-mode rows,
//     so it cannot discriminate RFQs — type comes from the keyword classifier;
//   - Price is "0" with an empty Currency on every sampled Ethiopia row
//     (undisclosed) — estimatedValue/currency are intentionally not mapped;
//   - pagination "page" mode advances the offset by only 20 rows per page
//     while returning 100 items (≈80 overlap); dedup absorbs repeats;
//   - intermittent 0-byte 200 responses occur → retried by fetchJsonWithTimeout.
//
// Recall characteristics (public mode): keyword search only — Ethiopia tenders
// whose text never mentions Ethiopia/Ethiopian/Addis are missed, and some
// weeks legitimately collect 0 rows (computeCollectionStatus → Success).
// Upgrading to a paid api_code would unlock the c{country_id} filter for
// comprehensive coverage — the upgrade path is adding one param here.
//
// Shared by scripts/seed-tender-sources.ts and tenderinfo.live.test.ts so the
// seeded configuration and the tested configuration can never drift apart.
// =============================================================================

export const TENDERINFO_SOURCE_NAME = 'TenderInfo.org — Ethiopia (public API)';
export const TENDERINFO_API_URL = 'https://www.tenderinfo.org/api/export';
export const TENDERINFO_RATE_LIMIT_MS = 3000; // ~20 req/min, polite to a keyless API
/** Rows kept by the client-side filter: TenderInfo country id for Ethiopia. */
export const TENDERINFO_ETHIOPIA_COUNTRY_ID = '70';

export const TENDERINFO_SOURCE = {
  name: TENDERINFO_SOURCE_NAME,
  url: TENDERINFO_API_URL,
  rateLimitMs: TENDERINFO_RATE_LIMIT_MS,
  config: {
    params: {
      // Whole-word OR union of the three highest-precision Ethiopia signals
      // (measured page-1 precision: Ethiopia 29%, Ethiopian 35%, Addis 40%).
      kwords: 'Ethiopia|Ethiopian|Addis',
      dtype: 'json',
      // 7-day rolling window (plan guardrail: no historical backfill).
      date_start: 'NOW-7d|dmy',
      date_end: 'NOW|dmy',
      sort_by: 'by_date',
      sort_dest: 'desc',
    },
    // page=N: the only supported addressing; ~80-row overlap is deduped.
    pagination: { mode: 'page' as const, startPage: 1, pageSize: 100, maxPages: 3 },
    // Public mode ignores c70=1 server-side — filter Ethiopia client-side.
    itemFilter: { path: 'Country_ID', equals: TENDERINFO_ETHIOPIA_COUNTRY_ID },
    fields: {
      title: { path: 'TenderNameOrig' },
      organization: { path: 'Buyer' },
      country: { path: 'Country' },
      // Search exports replace the Description field with searchFragmentXML;
      // the first fragment is the description snippet. Missing → null.
      description: { path: 'searchFragmentXML.fragment.0' },
      sourceReference: { path: 'ID' },
      // Date_publ is ISO-8601; Deadline is DD-MM-YYYY (normalizeDate).
      publicationDate: { path: 'Date_publ' },
      deadlineDate: { path: 'Deadline' },
      // Internal TenderInfo detail page — public, never fetched by the adapter.
      sourceUrl: { path: 'TenderLinkInner' },
      // Intentionally unmapped: estimatedValue/currency (Price is "0" =
      // undisclosed), sector (not in the export), opportunityType
      // (IsMarketPlace is 1 on every public-mode row).
    },
  },
};

export function tenderinfoApiConfigJson(): string {
  return JSON.stringify(TENDERINFO_SOURCE.config, null, 2);
}
