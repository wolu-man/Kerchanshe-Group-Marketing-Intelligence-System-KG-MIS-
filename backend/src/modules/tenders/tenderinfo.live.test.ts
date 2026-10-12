// =============================================================================
// Live test for the TenderInfo public export API integration.
//
// Standalone, opt-in (requires network):
//   npx tsx src/modules/tenders/tenderinfo.live.test.ts
//
// Verifies the contract the seeded source relies on:
//   reachability with our User-Agent, array response with metadata element,
//   DD-MM-YYYY date params, client-side Ethiopia filter (Country_ID=70),
//   page=N pagination with clean beyond-last termination, and end-to-end
//   mapping through the real ApiAdapter using the shared seeded config.
//
// Scope note: only the public /api/export endpoint is requested — never the
// paywalled TenderLink routes, and never with an api_code (public mode only).
// A 7-day window can legitimately contain 0 Ethiopia-keyword hits; structural
// assertions therefore also run against a dateless probe (same params/fields,
// wider window) so the suite stays meaningful on quiet weeks.
// =============================================================================

import { ApiAdapter, resolveFilterValue } from './adapters/api-adapter';
import {
  TENDERINFO_SOURCE,
  TENDERINFO_API_URL,
  TENDERINFO_RATE_LIMIT_MS,
  tenderinfoApiConfigJson,
} from './tenderinfo-source';
import type { RawOpportunity, TenderSourceConfig } from './adapters/adapter';

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

/** Brief pause between raw probes (the adapter paces itself via RateLimitMs). */
function wait(ms = 1500): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ApiConfigShape {
  params?: Record<string, string>;
  pagination?: { maxPages?: number };
  itemFilter?: { path: string; equals: string };
  fields?: Record<string, { path?: string; default?: string }>;
}

function makeSource(config: ApiConfigShape): TenderSourceConfig {
  return {
    TenderSourceID: 0,
    Name: 'tenderinfo live test',
    SourceType: 'api',
    URL: TENDERINFO_SOURCE.url,
    ApiConfig: JSON.stringify(config),
    RateLimitMs: 500, // faster than the seeded 3000 for test runtime
    RobotsCompliance: true,
  };
}

/** Structural checks shared by the window run and the dateless probe. */
function checkOpportunityShape(opps: RawOpportunity[], label: string): void {
  const ethiopia = opps.filter((o) => o.country === 'Ethiopia');
  assert(ethiopia.length === opps.length, `${label}: every item is Ethiopia (Country_ID filter) (${ethiopia.length}/${opps.length})`);
  const withUrl = opps.filter((o) => o.sourceUrl.startsWith('https://www.tenderinfo.org/'));
  assert(withUrl.length === opps.length, `${label}: every sourceUrl is a TenderInfo detail link (${withUrl.length}/${opps.length})`);
  const titled = opps.filter((o) => o.title.length > 0 && o.title !== '(Untitled)');
  assert(titled.length === opps.length, `${label}: every item has a real title (${titled.length}/${opps.length})`);
  const pubDated = opps.filter((o) => o.publicationDate instanceof Date);
  assert(pubDated.length === opps.length, `${label}: publicationDate parsed on every item (${pubDated.length}/${opps.length})`);
  const withDeadline = opps.filter((o) => o.deadlineDate !== null);
  console.log(`  ℹ ${label}: deadlines present on ${withDeadline.length}/${opps.length} items (blank Deadline → null — expected)`);
  const invalidDeadline = opps.filter((o) => {
    if (!o.deadlineDate) return false;
    return Number.isNaN(o.deadlineDate.getTime());
  });
  assert(invalidDeadline.length === 0, `${label}: no Invalid Date deadlines leak through`);
  const undisclosed = opps.filter((o) => o.estimatedValue === null);
  assert(undisclosed.length === opps.length, `${label}: Price="0" stays unmapped/undisclosed (${undisclosed.length}/${opps.length})`);
}

async function main(): Promise<void> {
  // --- Reachability: raw export call with our User-Agent ---
  console.log('\nreachability:');
  const rawUrl =
    `${TENDERINFO_API_URL}?kwords=Ethiopia%7CEthiopian%7CAddis&dtype=json&page=1`;
  const res = await fetch(rawUrl, { headers: HEADERS });
  assert(res.status === 200, `export endpoint responds 200 (got ${res.status})`);
  const body = (await res.text()).trim();
  assert(body.startsWith('['), `response is a JSON array (got ${body.slice(0, 40)}…)`);
  const arr = JSON.parse(body) as Array<Record<string, unknown>>;
  assert(arr.length > 0, `array populated (${arr.length} elements)`);
  const meta = arr[0] as { Total?: string };
  assert(typeof meta.Total === 'string' && Number(meta.Total) > 1000, `metadata element carries Total=${meta.Total}`);

  // --- Date params: DD-MM-YYYY window is accepted and filters ---
  console.log('\ndate window:');
  const dmy = resolveFilterValue('NOW-90d|dmy');
  assert(/^\d{2}-\d{2}-\d{4}$/.test(dmy), `NOW-90d|dmy resolves to DD-MM-YYYY (${dmy})`);
  await wait();
  const windowUrl =
    `${TENDERINFO_API_URL}?kwords=Ethiopia%7CEthiopian%7CAddis&dtype=json&page=1` +
    `&date_start=${encodeURIComponent(dmy)}&date_end=${encodeURIComponent(resolveFilterValue('NOW|dmy'))}`;
  const winRes = await fetch(windowUrl, { headers: HEADERS });
  const winArr = JSON.parse(await winRes.text()) as Array<Record<string, unknown>>;
  assert(winArr.length > 0, `90-day window returns rows (${winArr.length - 1} items, Total=${String((winArr[0] as { Total?: string }).Total)})`);
  const winMeta = winArr[0] as { Total?: string };
  const windowTotal = Number(winMeta.Total);
  const allTotal = Number(meta.Total);
  assert(Number.isFinite(windowTotal) && windowTotal < allTotal, `window narrows the result set (${windowTotal} < ${allTotal}) — date filter effective`);

  // --- Pagination: page=2 advances; beyond-last page returns [] ---
  console.log('\npage pagination:');
  await wait();
  const page2Res = await fetch(`${rawUrl.replace('page=1', 'page=2')}`, { headers: HEADERS });
  const page2 = JSON.parse(await page2Res.text()) as Array<Record<string, unknown>>;
  assert(page2.length > 0, `page 2 populated (${page2.length - 1} items)`);
  const ids1 = new Set(arr.slice(1).map((i) => String(i.ID)));
  const ids2 = new Set(page2.slice(1).map((i) => String(i.ID)));
  const overlap = [...ids2].filter((id) => ids1.has(id)).length;
  console.log(`  ℹ consecutive-page overlap: ${overlap}/${ids2.size} rows (server steps offset by 20 while returning 100 — dedup absorbs this)`);
  await wait();
  const beyondRes = await fetch(`${rawUrl.replace('page=1', 'page=99999')}`, { headers: HEADERS });
  const beyond = (await beyondRes.text()).trim();
  assert(beyond === '[]', `beyond-last page is [] (clean termination, got ${beyond.slice(0, 40)})`);

  // --- End-to-end through the real adapter with the shared seeded config ---
  console.log('\nApiAdapter end-to-end (seeded 7-day window config):');
  const windowOpps = await new ApiAdapter().fetch(makeSource(JSON.parse(tenderinfoApiConfigJson()) as ApiConfigShape));
  if (windowOpps.length > 0) {
    checkOpportunityShape(windowOpps, '7-day window');
    const s = windowOpps[0];
    console.log(`  ℹ sample: "${s.title.slice(0, 60)}" / ${s.organization ?? '(no org)'} / deadline ${s.deadlineDate ? s.deadlineDate.toISOString().slice(0, 10) : 'none'}`);
  } else {
    console.log('  ℹ 7-day window collected 0 rows (quiet week — valid Success state; structural checks run on the dateless probe below)');
    passed++;
  }

  // --- Dateless structural probe: same mapping, wider net ---
  console.log('\nApiAdapter end-to-end (dateless structural probe):');
  const wideConfig = JSON.parse(tenderinfoApiConfigJson()) as ApiConfigShape;
  delete wideConfig.params?.date_start;
  delete wideConfig.params?.date_end;
  if (wideConfig.pagination) wideConfig.pagination.maxPages = 1;
  const wideOpps = await new ApiAdapter().fetch(makeSource(wideConfig));
  assert(wideOpps.length >= 1, `dateless probe collects items (${wideOpps.length})`);
  if (wideOpps.length > 0) checkOpportunityShape(wideOpps, 'dateless probe');

  // --- Shared config exports + pacing sanity ---
  console.log('\nshared config:');
  assert(TENDERINFO_SOURCE.config.itemFilter?.equals === '70', 'shared config filters Country_ID=70');
  assert(TENDERINFO_SOURCE.config.params?.kwords === 'Ethiopia|Ethiopian|Addis', 'shared config carries the OR keyword union');
  assert((TENDERINFO_SOURCE.config.params?.date_start ?? '').includes('|dmy'), 'shared config uses DD-MM-YYYY tokens');
  assert(TENDERINFO_RATE_LIMIT_MS >= 1000, `seeded pacing ${TENDERINFO_RATE_LIMIT_MS}ms ≥ 1000ms (polite to a keyless API)`);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\nLIVE TEST FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
