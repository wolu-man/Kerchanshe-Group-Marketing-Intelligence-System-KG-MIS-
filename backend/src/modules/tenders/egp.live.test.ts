// =============================================================================
// Live test for the e-GP public sourcing API integration.
//
// Standalone, opt-in (requires network + the system CA store):
//   npx tsx --use-system-ca src/modules/tenders/egp.live.test.ts
//
// Verifies the full contract the seeded source relies on:
//   reachability, server-side filter/orderBy, page-size cap, stable paging,
//   and end-to-end mapping through the real ApiAdapter.
// =============================================================================

import { ApiAdapter, serializeFilter, serializeOrderBy } from './adapters/api-adapter';
import { EGP_API_URL, EGP_API_CONFIG, egpApiConfigJson } from './egp-source';
import type { TenderSourceConfig } from './adapters/adapter';

// --- Minimal test runner ---
let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

const HEADERS = { 'User-Agent': 'KG-MIS-Tender-Intelligence/1.0' };

async function getJson(params: Record<string, string>): Promise<{ total: number; items: Array<Record<string, unknown>> }> {
  const search = new URLSearchParams({ locale: 'en', ...params });
  const res = await fetch(`${EGP_API_URL}?${search.toString()}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${search.toString().slice(0, 120)}`);
  return (await res.json()) as { total: number; items: Array<Record<string, unknown>> };
}

/** Builds query params exactly the way ApiAdapter does for the seeded config. */
function seededParams(skip: number, top: number): Record<string, string> {
  const params: Record<string, string> = { ...EGP_API_CONFIG.params, skip: String(skip), top: String(top) };
  for (const [k, v] of serializeFilter(EGP_API_CONFIG.filter)) params[k] = v;
  for (const [k, v] of serializeOrderBy(EGP_API_CONFIG.orderBy)) params[k] = v;
  return params;
}

async function main(): Promise<void> {
  let baselineTotal = 0;

  // Reachability
  const plain = await getJson({ skip: '0', top: '2' });
  baselineTotal = plain.total;
  console.log('\nreachability:');
  assert(Number.isFinite(plain.total) && plain.total > 0, `endpoint responds with a positive total (${plain.total})`);
  assert(Array.isArray(plain.items) && plain.items.length > 0, `items array populated (${plain.items.length} rows)`);
  assert(typeof plain.items[0].lotName === 'string', 'items expose lotName');

  // Server-side filter (invitationDate >= NOW-7d) narrows the total.
  const filtered = await getJson(seededParams(0, 5));
  console.log('\nserver-side filter:');
  assert(filtered.total < baselineTotal, `filter narrows total (${filtered.total} < ${baselineTotal})`);
  assert(filtered.total > 0, `7-day window has rows (${filtered.total})`);
  const cutoff = Date.now() - 8 * 86400000; // 8-day slack for clock skew
  const allRecent = filtered.items.every((i) => Date.parse(String(i.invitationDate)) >= cutoff);
  assert(allRecent, 'every returned invitationDate is within the window');

  // Page-size cap: top=60 is clamped server-side.
  const clamped = await getJson({ skip: '0', top: '60' });
  console.log('\npage-size cap:');
  assert(clamped.items.length <= 50, `top=60 clamped to <=50 rows (got ${clamped.items.length})`);

  // Stable two-level ordering: two consecutive pages do not overlap.
  const page1 = await getJson(seededParams(0, 50));
  const page2 = await getJson(seededParams(50, 50));
  console.log('\nstable paging:');
  const ids1 = new Set(page1.items.map((i) => String(i.id)));
  const overlap = page2.items.filter((i) => ids1.has(String(i.id))).length;
  assert(page1.items.length > 0 && page2.items.length > 0, `both pages returned rows (${page1.items.length}, ${page2.items.length})`);
  assert(overlap === 0, `no id overlap between consecutive pages (${overlap} shared)`);

  // End-to-end through the real adapter (2 pages, fast rate limit).
  console.log('\nApiAdapter end-to-end:');
  const config = JSON.parse(egpApiConfigJson()) as Record<string, unknown>;
  (config.pagination as { maxPages: number }).maxPages = 2;
  const source: TenderSourceConfig = {
    TenderSourceID: 0,
    Name: 'e-GP live test',
    SourceType: 'api',
    URL: EGP_API_URL,
    ApiConfig: JSON.stringify(config),
    RateLimitMs: 250,
    RobotsCompliance: true,
  };
  const opps = await new ApiAdapter().fetch(source);
  assert(opps.length > 0, `adapter collected ${opps.length} opportunities (2 pages)`);

  const withUrl = opps.filter((o) => o.sourceUrl);
  assert(withUrl.length === opps.length, 'every opportunity has a sourceUrl');
  const urlShape = /^https:\/\/production\.egp\.gov\.et\/egp\/bids\/all\/(tendering|purchasing|auctioning|prequalification)\/[^/]+\/(open|closed)$/;
  assert(withUrl.every((o) => urlShape.test(o.sourceUrl)), 'all sourceUrls match the portal detail-route shape');
  const sample = opps[0];
  assert(sample.title.length > 0 && (sample.organization ?? '').length > 0, `sample mapped: "${sample.title.slice(0, 60)}" / ${sample.organization}`);
  assert(sample.country === 'Ethiopia', 'country defaults to Ethiopia');
  assert(sample.deadlineDate instanceof Date, 'deadlineDate parsed to a Date');
  assert(sample.publicationDate instanceof Date, 'publicationDate parsed to a Date');
  const dated = opps.filter((o) => o.deadlineDate !== null).length;
  assert(dated === opps.length, `all deadlines parsed (${dated}/${opps.length})`);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error('\nLIVE TEST FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
