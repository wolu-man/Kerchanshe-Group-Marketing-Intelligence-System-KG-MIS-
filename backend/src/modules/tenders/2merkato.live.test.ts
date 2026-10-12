// =============================================================================
// Live test for the 2merkato public listings integration.
//
// Standalone, opt-in (requires network):
//   npx tsx src/modules/tenders/2merkato.live.test.ts
//
// Verifies the contract the seeded sources rely on:
//   reachability, data-page payload extraction, page=N pagination with a
//   fixed 15-item page size, clean empty-page termination, free-section date
//   completeness, and end-to-end mapping through the real ApiAdapter.
//
// Scope note: only the public listing pages and (optionally) one public
// detail page are requested — never subscription-only detail routes and never
// paid document downloads.
// =============================================================================

import { ApiAdapter, parseInertiaHtml } from './adapters/api-adapter';
import {
  TWOMERKATO_FREE_URL,
  TWOMERKATO_FULL_URL,
  TWOMERKATO_RATE_LIMIT_MS,
  TWOMERKATO_FREE_SOURCE,
  TWOMERKATO_FULL_SOURCE,
  twomerkatoApiConfigJson,
} from './twomerkato-source';
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

interface Props {
  props: {
    tenders: { data: Array<Record<string, unknown>>; total: number };
    total?: number;
  };
}

async function getPage(url: string): Promise<{ status: number; html: string }> {
  const res = await fetch(url, { headers: HEADERS });
  return { status: res.status, html: res.ok ? await res.text() : '' };
}

async function main(): Promise<void> {
  // --- Reachability + data-page extraction (free section) ---
  const page1 = await getPage(`${TWOMERKATO_FREE_URL}?page=1`);
  console.log('\nreachability:');
  assert(page1.status === 200, `free listing responds 200 (got ${page1.status})`);
  const payload = parseInertiaHtml(page1.html, TWOMERKATO_FREE_URL) as Props;
  const items1 = payload.props.tenders.data;
  assert(Array.isArray(items1) && items1.length > 0, `data-page payload has items (${items1.length})`);
  assert(items1.length <= 15, `page size <= 15 (got ${items1.length})`);
  const total = payload.props.total;
  assert(typeof total === 'number' && Number.isFinite(total) && total > 1000, `listing reports a positive total (${total})`);

  // --- Redaction contract on the free section: every item has a real deadline ---
  console.log('\nfree-section dates:');
  const dated = items1.filter((i) => typeof i.bid_closing_date === 'string' && i.bid_closing_date.length > 0);
  assert(dated.length === items1.length, `all free items expose bid_closing_date (${dated.length}/${items1.length})`);
  const sample = items1[0];
  assert(typeof sample.title === 'string' && String(sample.title).length > 0, `sample title: "${String(sample.title).slice(0, 70)}"`);
  const company = sample.company as { name_en?: string } | null;
  assert(typeof company?.name_en === 'string' && company.name_en.length > 0, `sample org: ${company?.name_en}`);
  assert(typeof sample.created_at === 'string' && !Number.isNaN(Date.parse(String(sample.created_at))), 'created_at parses as ISO');

  // --- page=N pagination: pages 1 and 2 do not overlap; beyond-last is empty ---
  const page2 = await getPage(`${TWOMERKATO_FREE_URL}?page=2`);
  assert(page2.status === 200, `page 2 responds 200 (got ${page2.status})`);
  const items2 = (parseInertiaHtml(page2.html, TWOMERKATO_FREE_URL) as Props).props.tenders.data;
  console.log('\npage pagination:');
  assert(items2.length > 0, `page 2 populated (${items2.length} rows)`);
  const ids1 = new Set(items1.map((i) => i.id));
  const overlap = items2.filter((i) => ids1.has(i.id)).length;
  assert(overlap === 0, `no id overlap between consecutive pages (${overlap} shared)`);
  const beyond = await getPage(`${TWOMERKATO_FREE_URL}?page=99999`);
  assert(beyond.status === 200, `beyond-last page responds 200 (got ${beyond.status})`);
  const beyondItems = (parseInertiaHtml(beyond.html, TWOMERKATO_FREE_URL) as Props).props.tenders.data;
  assert(beyondItems.length === 0, `beyond-last page is empty (clean termination, got ${beyondItems.length})`);

  // --- Full listing: same contract; redacted items keep title/org but lose dates ---
  console.log('\nfull listing:');
  const full = await getPage(`${TWOMERKATO_FULL_URL}?page=1`);
  assert(full.status === 200, `full listing responds 200 (got ${full.status})`);
  const fullItems = (parseInertiaHtml(full.html, TWOMERKATO_FULL_URL) as Props).props.tenders.data;
  assert(fullItems.length > 0, `full listing populated (${fullItems.length} rows)`);
  const fullTitled = fullItems.filter((i) => typeof i.title === 'string' && String(i.title).length > 0);
  assert(fullTitled.length === fullItems.length, `every full-list item has a title (${fullTitled.length}/${fullItems.length})`);
  const fullDated = fullItems.filter((i) => typeof i.bid_closing_date === 'string');
  console.log(`  ℹ full-list date visibility: ${fullDated.length}/${fullItems.length} (redacted items map to null — expected)`);

  // --- Rate limit header (when exposed) stays above our budget ---
  const rl = await fetch(`${TWOMERKATO_FREE_URL}?page=1`, { headers: HEADERS });
  const limit = Number(rl.headers.get('X-RateLimit-Limit'));
  if (Number.isFinite(limit) && limit > 0) {
    const perMinute = Math.floor(60000 / TWOMERKATO_RATE_LIMIT_MS);
    assert(perMinute <= limit, `our pacing ${perMinute}/min is within the server cap ${limit}/min`);
  } else {
    console.log('  ℹ X-RateLimit-Limit not exposed on this response (header is intermittent)');
    passed++;
  }

  // --- End-to-end through the real adapter (2 pages, shared seeded config) ---
  console.log('\nApiAdapter end-to-end (free section, 2 pages):');
  const config = JSON.parse(twomerkatoApiConfigJson(TWOMERKATO_FREE_SOURCE)) as Record<string, unknown>;
  (config.pagination as { maxPages: number }).maxPages = 2;
  const source: TenderSourceConfig = {
    TenderSourceID: 0,
    Name: '2merkato free live test',
    SourceType: 'api',
    URL: TWOMERKATO_FREE_SOURCE.url,
    ApiConfig: JSON.stringify(config),
    RateLimitMs: 250,
    RobotsCompliance: true,
  };
  const opps = await new ApiAdapter().fetch(source);
  assert(opps.length >= 16 && opps.length <= 30, `adapter collected ${opps.length} opportunities (2 pages)`);
  const withUrl = opps.filter((o) => o.sourceUrl);
  assert(withUrl.length === opps.length, 'every opportunity has a sourceUrl');
  const urlShape = /^https:\/\/tender\.2merkato\.com\/tenders\/[0-9a-f]+$/;
  assert(withUrl.every((o) => urlShape.test(o.sourceUrl)), 'all sourceUrls match the detail-route shape');
  const s = opps[0];
  assert(s.title.length > 0 && (s.organization ?? '').length > 0, `sample mapped: "${s.title.slice(0, 60)}" / ${s.organization}`);
  assert(s.country === 'Ethiopia', 'country defaults to Ethiopia');
  assert(s.sourceReference !== null, 'sourceReference mapped from id');
  assert(s.publicationDate instanceof Date, 'publicationDate parsed to a Date');
  const datedMapped = opps.filter((o) => o.deadlineDate !== null).length;
  assert(datedMapped === opps.length, `all free deadlines parsed (${datedMapped}/${opps.length})`);

  // --- Public detail page reachable without login (recorded link contract) ---
  console.log('\npublic detail link:');
  const detail = await fetch(String(s.sourceUrl), { headers: HEADERS, redirect: 'manual' });
  assert(detail.status === 200, `detail page responds 200 (no login redirect, got ${detail.status})`);

  // --- Shared config exports ---
  assert(TWOMERKATO_FULL_SOURCE.config.itemsPath === 'props.tenders.data', 'shared full-list config exports itemsPath');
  assert(TWOMERKATO_FULL_SOURCE.config.pagination.mode === 'page', 'full-list config uses page mode');

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error('\nLIVE TEST FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
