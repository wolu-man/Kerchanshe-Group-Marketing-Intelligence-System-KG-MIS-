// =============================================================================
// e-GP Source Definition — the Ethiopian e-Procurement Portal public sourcing
// API as a configured tender source.
//
// Endpoint and query contract verified against
// https://production.egp.gov.et (Angular SPA exposes this JSON API under
// /po-gw; no authentication, ASP.NET-style filter/orderBy binding, page size
// capped at 50, stable ordering with a two-level orderBy).
//
// Shared by scripts/seed-tender-sources.ts and egp.live.test.ts so the seeded
// configuration and the tested configuration can never drift apart.
// =============================================================================

/** Public JSON API behind the /egp/bids/all portal. */
export const EGP_SOURCE_NAME = 'e-GP Ethiopia — Public Sourcing API';
export const EGP_API_URL = 'https://production.egp.gov.et/po-gw/cms-v2/api/sourcing/get-sourcing';

export const EGP_API_CONFIG = {
  itemsPath: 'items',
  params: { locale: 'en' },
  pagination: { pageSize: 50, maxPages: 20, startSkip: 0 },
  // Recent publications only: ~1k items per 7-day window (fits the 1000-item
  // page cap, so every run covers the whole window).
  filter: [[{ field: 'invitationDate', operator: '>=', value: 'NOW-7d' }]],
  // Newest first with a unique tiebreak — keeps skip/top paging stable.
  orderBy: [
    { field: 'invitationDate', direction: 'desc' },
    { field: 'id', direction: 'asc' },
  ],
  fields: {
    title: { path: 'lotName' },
    organization: { path: 'procuringEntity' },
    country: { default: 'Ethiopia' },
    sector: { path: 'procurementCategory' },
    description: { path: 'lotDescription' },
    sourceReference: { path: 'lotReferenceNo' },
    publicationDate: { path: 'invitationDate' },
    deadlineDate: { path: 'submissionDeadline' },
    // Portal detail route: /bids/all/{type}/{id}/{open|closed} where the id is
    // the sourceId for Purchasing and the lotInPackageId otherwise.
    sourceUrl: {
      template:
        'https://production.egp.gov.et/egp/bids/all/{sourceApplication|lower}' +
        '/{sourceApplication|eq:Purchasing,{sourceId},{lotInPackageId}}' +
        '/{isSubmittable|bool:open,closed}',
    },
  },
} as const;

export function egpApiConfigJson(): string {
  return JSON.stringify(EGP_API_CONFIG, null, 2);
}
