// =============================================================================
// Unit tests for tender adapter utilities.
//
// Standalone test script — no test framework needed, no DB connection required.
// Tests pure functions (contentHash, normalize*, template expansion, query
// serialization) and the ApiAdapter pagination loop against a stubbed fetch.
//
// Run with: npx tsx src/modules/tenders/adapters.test.ts
// =============================================================================

import {
  contentHash,
  normalizeText,
  normalizeDate,
  dateToHashable,
  fetchWithTimeout,
  fetchJsonWithTimeout,
  type RawOpportunity,
  type TenderSourceConfig,
} from './adapters/adapter';
import {
  ApiAdapter,
  expandTemplate,
  serializeFilter,
  serializeOrderBy,
  resolveFilterValue,
  mapItem,
  matchesItemFilter,
  interpolateEnv,
  decodeHtmlEntities,
  parseInertiaHtml,
} from './adapters/api-adapter';
import { EGP_API_CONFIG, egpApiConfigJson } from './egp-source';

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

function describe(name: string, fn: () => void): void {
  console.log(`\n${name}:`);
  fn();
}

// --- Tests ---

describe('normalizeText', () => {
  const result = normalizeText('  Hello   World!!  ');
  assert(result === 'hello world', 'collapses whitespace, removes punctuation, lowercases');
  assert(normalizeText(null) === '', 'null returns empty string');
  assert(normalizeText('') === '', 'empty string returns empty string');
  assert(normalizeText('CNN-News') === 'cnn-news', 'preserves hyphens, lowercases');
});

describe('normalizeDate', () => {
  const d = normalizeDate('2025-01-15T10:00:00Z');
  assert(d !== null && d instanceof Date, 'ISO string returns Date');
  assert(normalizeDate(null) === null, 'null returns null');
  assert(normalizeDate('') === null, 'empty string returns null');
  assert(normalizeDate('not-a-date') === null, 'invalid string returns null');
  const dateInput = normalizeDate(new Date('2025-06-01'));
  assert(dateInput !== null, 'Date input returns Date');

  // DD-MM-YYYY (tenderinfo.org deadline format).
  const dmy = normalizeDate('05-11-2026');
  assert(dmy instanceof Date && dmy.toISOString() === '2026-11-05T00:00:00.000Z', 'DD-MM-YYYY parses to UTC midnight');
  assert(dateToHashable(normalizeDate('05-11-2026')) === '2026-11-05', 'DD-MM-YYYY is stable for hashing');
  assert(normalizeDate('31-02-2026') === null, 'impossible day rejected (no silent month rollover)');
  assert(normalizeDate('01-15-2025') === null, 'month > 12 rejected');
  assert(normalizeDate('5-11-2026') instanceof Date, 'single-digit form falls through to the generic parser (pre-existing behavior)');
  assert(normalizeDate(' 05-11-2026 ') instanceof Date, 'surrounding whitespace tolerated');
});

describe('dateToHashable', () => {
  const d = new Date('2025-01-15T10:30:00Z');
  assert(dateToHashable(d) === '2025-01-15', 'returns YYYY-MM-DD');
  assert(dateToHashable(null) === '', 'null returns empty string');
});

describe('contentHash (dedup)', () => {
  const raw1: RawOpportunity = {
    title: 'Supply of Coffee Beans',
    organization: 'Ethiopian Coffee Commission',
    country: 'Ethiopia',
    sector: 'Agriculture',
    description: 'A tender for coffee supply.',
    sourceUrl: 'https://example.com/tender/1',
    sourceReference: 'REF-001',
    publicationDate: new Date('2025-01-01'),
    deadlineDate: new Date('2025-02-15'),
    estimatedValue: 500000,
    currency: 'ETB',
  };

  // Same normalized title + org + deadline → same hash (even with different casing/spacing).
  const raw2: RawOpportunity = {
    ...raw1,
    title: '  SUPPLY OF COFFEE BEANS  ',
    organization: 'ethiopian coffee commission!!',
    description: 'Different description text.',
    sourceUrl: 'https://different.com/tender/99',
    sourceReference: 'REF-999',
  };

  const hash1 = contentHash(raw1);
  const hash2 = contentHash(raw2);

  assert(hash1 === hash2, 'same normalized title + org + deadline → same hash');
  assert(hash1.length === 64, 'SHA-256 hash is 64 chars');

  // Different title → different hash.
  const raw3: RawOpportunity = { ...raw1, title: 'Different Tender Title' };
  assert(contentHash(raw1) !== contentHash(raw3), 'different title → different hash');

  // Different deadline → different hash.
  const raw4: RawOpportunity = { ...raw1, deadlineDate: new Date('2025-03-01') };
  assert(contentHash(raw1) !== contentHash(raw4), 'different deadline → different hash');

  // Null deadline → hash still works.
  const raw5: RawOpportunity = { ...raw1, deadlineDate: null };
  const raw6: RawOpportunity = { ...raw1, deadlineDate: null };
  assert(contentHash(raw5) === contentHash(raw6), 'null deadlines → consistent hash');
});

// ---------------------------------------------------------------------------
// e-GP / API adapter utilities
// ---------------------------------------------------------------------------

/** Runs after the pagination suite (async; restores the original fetch). */
async function runRetryTests(): Promise<void> {
  console.log('\nfetchWithTimeout retries:');
  const realFetch = globalThis.fetch;
  let calls = 0;

  // Transient connect failures twice, then success.
  (globalThis as Record<string, unknown>).fetch = async () => {
    calls++;
    if (calls < 3) {
      const err = new TypeError('fetch failed');
      (err as TypeError & { cause?: unknown }).cause = { code: 'UND_ERR_CONNECT_TIMEOUT' };
      throw err;
    }
    return new Response('{"ok":true}');
  };
  const retried = await fetchWithTimeout('https://example.com/retry', {}, 5000);
  assert(retried === '{"ok":true}', 'retries transient connect failures until success');
  assert(calls === 3, `used exactly 3 attempts (got ${calls})`);

  // HTTP status errors are not retried.
  calls = 0;
  (globalThis as Record<string, unknown>).fetch = async () => {
    calls++;
    return new Response('nope', { status: 500, statusText: 'Server Error' });
  };
  let httpError = '';
  try {
    await fetchWithTimeout('https://example.com/http-error', {}, 5000);
  } catch (err) {
    httpError = (err as Error).message;
  }
  assert(httpError.includes('HTTP 500'), 'HTTP status error surfaces to the caller');
  assert(calls === 1, 'HTTP status errors are not retried');

  console.log('\nfetchJsonWithTimeout body retries:');
  // Zero-byte body, then invalid JSON, then valid JSON (observed on tenderinfo.org).
  calls = 0;
  (globalThis as Record<string, unknown>).fetch = async () => {
    calls++;
    if (calls === 1) return new Response('', { status: 200 });
    if (calls === 2) return new Response('<html>oops</html>', { status: 200 });
    return new Response('{"ok":true}', { status: 200 });
  };
  const body = await fetchJsonWithTimeout('https://example.com/body-retry', {}, 5000);
  assert((body as { ok?: boolean }).ok === true, 'empty and invalid-JSON bodies retried until valid JSON');
  assert(calls === 3, `two body failures then success (got ${calls} attempts)`);

  // Persistent garbage still fails, and HTTP errors are not doubled by the body layer.
  calls = 0;
  (globalThis as Record<string, unknown>).fetch = async () => {
    calls++;
    return new Response('<html>always broken</html>', { status: 200 });
  };
  let bodyError = '';
  try {
    await fetchJsonWithTimeout('https://example.com/body-poison', {}, 5000);
  } catch (err) {
    bodyError = (err as Error).message;
  }
  assert(bodyError.includes('Invalid JSON'), 'persistently invalid body surfaces as Invalid JSON error');
  assert(calls === 3, `body retries exhaust after 3 attempts (got ${calls})`);

  calls = 0;
  (globalThis as Record<string, unknown>).fetch = async () => {
    calls++;
    return new Response('gone', { status: 404, statusText: 'Not Found' });
  };
  let statusError = '';
  try {
    await fetchJsonWithTimeout('https://example.com/status-404', {}, 5000);
  } catch (err) {
    statusError = (err as Error).message;
  }
  assert(statusError.includes('HTTP 404'), 'HTTP status error reaches the caller unchanged');
  assert(calls === 1, 'HTTP status errors are not retried by the body layer');

  globalThis.fetch = realFetch;
}

describe('resolveFilterValue (NOW tokens)', () => {
  assert(resolveFilterValue('plain-value') === 'plain-value', 'non-token values pass through');
  assert(resolveFilterValue('2026-01-01T00:00:00Z') === '2026-01-01T00:00:00Z', 'ISO values pass through');

  const now = Date.now();
  const nowOnly = Date.parse(resolveFilterValue('NOW'));
  assert(Math.abs(nowOnly - now) < 5000, 'NOW resolves to current ISO time');

  const minus7 = Date.parse(resolveFilterValue('NOW-7d'));
  assert(Math.abs(minus7 - (now - 7 * 86400000)) < 5000, 'NOW-7d resolves to 7 days ago');

  const plus30 = Date.parse(resolveFilterValue('NOW+30d'));
  assert(Math.abs(plus30 - (now + 30 * 86400000)) < 5000, 'NOW+30d resolves to 30 days ahead');

  assert(resolveFilterValue('NOW+12h') === 'NOW+12h', 'unsupported token shape passes through');

  // |dmy output format (tenderinfo.org DD-MM-YYYY params).
  const pad = (n: number): string => String(n).padStart(2, '0');
  const dmyFor = (ms: number): string => {
    const d = new Date(ms);
    return `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
  };
  const todayA = dmyFor(Date.now());
  const todayB = dmyFor(Date.now());
  const gotToday = resolveFilterValue('NOW|dmy');
  assert(/^\d{2}-\d{2}-\d{4}$/.test(gotToday), `NOW|dmy yields DD-MM-YYYY (got ${gotToday})`);
  assert(gotToday === todayA || gotToday === todayB, 'NOW|dmy equals today in UTC');
  const weekA = dmyFor(Date.now() - 7 * 86400000);
  const weekB = dmyFor(Date.now() - 7 * 86400000);
  const gotWeek = resolveFilterValue('NOW-7d|dmy');
  assert(gotWeek === weekA || gotWeek === weekB, 'NOW-7d|dmy equals 7 days ago in UTC');
  const future = resolveFilterValue('NOW+30d|dmy');
  assert(/^\d{2}-\d{2}-\d{4}$/.test(future) && !future.includes('T'), 'NOW+30d|dmy stays DD-MM-YYYY');
  assert(resolveFilterValue('NOW|xyz').includes('T'), 'unknown format falls back to ISO');
  assert(resolveFilterValue('NOW-7d|dmy') !== resolveFilterValue('NOW-7d'), 'dmy differs from ISO output');
});

describe('matchesItemFilter', () => {
  const filter = { path: 'Country_ID', equals: '70' };
  assert(matchesItemFilter({ Country_ID: '70' }, filter), 'string equality keeps the item');
  assert(matchesItemFilter({ Country_ID: 70 }, filter), 'numeric value string-coerces to equality');
  assert(!matchesItemFilter({ Country_ID: '45' }, filter), 'different value drops the item');
  assert(!matchesItemFilter({ Total: '297099' }, filter), 'metadata element (missing path) dropped');
  assert(!matchesItemFilter({}, filter), 'absent field dropped when equals is non-empty');
  assert(matchesItemFilter({}, { path: 'x', equals: '' }), 'missing field matches equals ""');
  assert(matchesItemFilter({ Country_ID: '70' }, { path: 'a.b.c', equals: '' }), 'deep missing path resolves to "" and matches');
});

describe('interpolateEnv', () => {
  process.env.ADAPTER_TEST_SECRET = 'sekret-42';
  delete process.env.ADAPTER_TEST_MISSING;
  assert(interpolateEnv('Bearer ${ADAPTER_TEST_SECRET}') === 'Bearer sekret-42', '${VAR} replaced from process.env');
  assert(interpolateEnv('${ADAPTER_TEST_MISSING}') === '', 'unknown variable resolves to empty string');
  assert(interpolateEnv('plain') === 'plain', 'no placeholder passes through');
  assert(interpolateEnv('${A} and ${B}') === ' and ', 'multiple placeholders all replaced');
  assert(interpolateEnv('value with $not(a var)') === 'value with $not(a var)', 'non-placeholder dollar syntax untouched');
  assert(interpolateEnv('') === '', 'empty string stays empty');
  delete process.env.ADAPTER_TEST_SECRET;
});

describe('serializeFilter (nested index binding)', () => {
  const entries = serializeFilter([
    [
      { field: 'invitationDate', operator: '>=', value: 'NOW-7d' },
      { field: 'sourceApplication', operator: '=', value: 'Tendering' },
    ],
  ]);
  const map = new Map(entries);
  assert(map.get('filter[0][0].field') === 'invitationDate', 'first condition field');
  assert(map.get('filter[0][0].operator') === '>=', 'first condition operator');
  assert(map.get('filter[0][0].value') !== 'NOW-7d' && !Number.isNaN(Date.parse(map.get('filter[0][0].value') || '')), 'NOW-7d resolved to an ISO date');
  assert(map.get('filter[0][1].field') === 'sourceApplication', 'second condition in same group');
  assert(map.get('filter[0][1].value') === 'Tendering', 'static value passes through');

  const twoGroups = serializeFilter([[{ field: 'a', value: '1', operator: '=' }], [{ field: 'b', value: '2', operator: '=' }]]);
  assert(twoGroups.some(([k]) => k.startsWith('filter[1][0]')), 'second group indexed independently');

  assert(serializeFilter([]).length === 0, 'empty filter serializes to nothing');
  assert(serializeFilter(undefined).length === 0, 'undefined filter serializes to nothing');
  assert(serializeFilter('bad' as unknown).length === 0, 'non-array filter serializes to nothing');
  assert(serializeFilter([[{ value: 'x' }]]).length === 0, 'condition without a field is skipped');
});

describe('serializeOrderBy', () => {
  const entries = serializeOrderBy([
    { field: 'invitationDate', direction: 'desc' },
    { field: 'id', direction: 'asc' },
  ]);
  const map = new Map(entries);
  assert(map.get('orderBy[0].field') === 'invitationDate' && map.get('orderBy[0].direction') === 'desc', 'first level ordering');
  assert(map.get('orderBy[1].field') === 'id' && map.get('orderBy[1].direction') === 'asc', 'second level tiebreak');
  assert(serializeOrderBy([{ field: 'x', direction: 'sideways' as 'asc' }])[1][1] === 'desc', 'invalid direction normalizes to desc');
  assert(serializeOrderBy(undefined).length === 0, 'undefined orderBy serializes to nothing');
  assert(serializeOrderBy([{ direction: 'asc' }]).length === 0, 'entry without a field is skipped');
});

describe('expandTemplate', () => {
  const item = {
    lotName: 'Supply of Laptops',
    sourceApplication: 'Purchasing',
    sourceId: 'guid-source',
    lotInPackageId: 'guid-lot',
    isSubmittable: false,
    nested: { deep: 'value' },
  };

  assert(expandTemplate('plain text', item) === 'plain text', 'no tokens → unchanged');
  assert(expandTemplate('x-{lotName}', item) === 'x-Supply of Laptops', 'simple field substitution');
  assert(expandTemplate('{missing}', item) === '', 'missing field → empty string');
  assert(expandTemplate('{nested.deep}', item) === 'value', 'dot-path field');
  assert(expandTemplate('{sourceApplication|lower}', item) === 'purchasing', 'lower pipe');
  assert(expandTemplate('{lotName|upper}', item) === 'SUPPLY OF LAPTOPS', 'upper pipe');
  assert(expandTemplate('{lotName|trim}', item) === 'Supply of Laptops', 'trim pipe');
  assert(expandTemplate('{isSubmittable|bool:open,closed}', item) === 'closed', 'bool pipe false → else value');
  assert(expandTemplate('{missing|bool:open,closed}', item) === 'closed', 'bool pipe empty → else value');
  assert(
    expandTemplate('{sourceApplication|eq:Purchasing,{sourceId},{lotInPackageId}}', item) === 'guid-source',
    'eq pipe picks then-branch'
  );
  assert(
    expandTemplate('{sourceApplication|eq:Tendering,{sourceId},{lotInPackageId}}', item) === 'guid-lot',
    'eq pipe picks else-branch'
  );
  assert(expandTemplate('{nope|unknownPipe:x}', item) === '', 'unknown pipe leaves value untouched (empty)');
});

describe('mapItem', () => {
  const mapping = {
    title: { path: 'lotName' },
    organization: { path: 'procuringEntity' },
    country: { default: 'Ethiopia' },
    sector: { path: 'procurementCategory' },
    description: { path: 'lotDescription' },
    sourceReference: { path: 'lotReferenceNo' },
    publicationDate: { path: 'invitationDate' },
    deadlineDate: { path: 'submissionDeadline' },
    sourceUrl: {
      template:
        'https://production.egp.gov.et/egp/bids/all/{sourceApplication|lower}' +
        '/{sourceApplication|eq:Purchasing,{sourceId},{lotInPackageId}}' +
        '/{isSubmittable|bool:open,closed}',
    },
  };
  const item = {
    lotName: 'Supply of Laptops',
    lotDescription: 'Laptops for labs',
    lotReferenceNo: 'ET-NCB-001-2026',
    procurementCategory: 'Goods',
    procuringEntity: 'Sample University',
    invitationDate: '2026-09-30T05:30:00Z',
    submissionDeadline: '2026-10-20T08:00:00Z',
    sourceApplication: 'Purchasing',
    sourceId: 'guid-source',
    lotInPackageId: 'guid-lot',
    isSubmittable: false,
  };

  const opp = mapItem(item, mapping);
  assert(opp.title === 'Supply of Laptops', 'title from lotName');
  assert(opp.organization === 'Sample University', 'organization from procuringEntity');
  assert(opp.country === 'Ethiopia', 'country falls back to static default (no path → default, not [object Object])');
  assert(opp.sector === 'Goods', 'sector from procurementCategory');
  assert(opp.sourceReference === 'ET-NCB-001-2026', 'sourceReference from lotReferenceNo');
  assert(opp.publicationDate instanceof Date && opp.publicationDate.toISOString().startsWith('2026-09-30'), 'publicationDate parsed');
  assert(opp.deadlineDate instanceof Date && opp.deadlineDate.toISOString().startsWith('2026-10-20'), 'deadlineDate parsed');
  assert(
    opp.sourceUrl === 'https://production.egp.gov.et/egp/bids/all/purchasing/guid-source/closed',
    'template builds the Purchasing detail URL (sourceId, closed)'
  );

  const tendering = mapItem({ ...item, sourceApplication: 'Tendering', isSubmittable: true }, mapping);
  assert(
    tendering.sourceUrl === 'https://production.egp.gov.et/egp/bids/all/tendering/guid-lot/open',
    'template builds the Tendering detail URL (lotInPackageId, open)'
  );

  const withValue = mapItem(item, { ...mapping, estimatedValue: { path: 'estimatedValue' } , currency: { path: 'currency' }});
  assert(withValue.estimatedValue === null, 'missing estimatedValue → null');

  const priced = mapItem({ ...item, estimatedValue: 'ETB 1,500,000', currency: 'ETB' }, { ...mapping, estimatedValue: { path: 'estimatedValue' }, currency: { path: 'currency' } });
  assert(priced.estimatedValue === 1500000 && priced.currency === 'ETB', 'estimatedValue parsed from mixed text');
});

describe('decodeHtmlEntities / parseInertiaHtml (Inertia data-page)', () => {
  const encoded = '{&quot;component&quot;:&quot;Front\/Tenders\/Index&quot;,' +
    '&quot;props&quot;:{&quot;tenders&quot;:{&quot;data&quot;:' +
    '[{&quot;id&quot;:1,&quot;title&quot;:&quot;A \u0026 B \u2014 Supply&quot;}]}}}';

  const decoded = decodeHtmlEntities(encoded);
  assert(decoded.includes('"component"'), 'quot entities decoded to double quotes');
  assert(decoded.includes('"A & B \u2014 Supply"'), 'amp entity decoded (single pass, no double-decode)');
  assert(decoded.includes('"Front/Tenders/Index"'), 'escaped slash survives decoding');

  const payload = parseInertiaHtml(`<html><div data-page="${encoded}"></div></html>`, 'https://x.example/free') as {
    props: { tenders: { data: { id: number; title: string }[] } };
  };
  assert(payload.props.tenders.data[0].id === 1, 'data-page JSON parsed to an object');
  assert(payload.props.tenders.data[0].title === 'A & B \u2014 Supply', 'round-trip value intact');

  const numeric = decodeHtmlEntities('&#039;quoted&#039; &#x27;also&#x27; &lt;tag&gt;');
  assert(numeric === "'quoted' 'also' <tag>", 'numeric, hex and lt/gt entities decoded');

  let threw = false;
  try {
    parseInertiaHtml('<html>no payload here</html>', 'https://x.example/free');
  } catch {
    threw = true;
  }
  assert(threw, 'missing data-page attribute throws');

  threw = false;
  try {
    parseInertiaHtml('<div data-page="&quot;not-json"></div>', 'https://x.example/free');
  } catch {
    threw = true;
  }
  assert(threw, 'non-JSON data-page throws');
});

describe('ApiAdapter pagination (stubbed fetch)', () => {
  const capturedUrls: string[] = [];

  function stubFetchBySkip(pages: Record<string, unknown>): void {
    (globalThis as Record<string, unknown>).fetch = async (url: unknown) => {
      const u = new URL(String(url));
      capturedUrls.push(String(url));
      const skip = u.searchParams.get('skip') ?? 'none';
      const body = pages[skip] ?? { total: 0, items: [] };
      return new Response(JSON.stringify(body), { status: 200 });
    };
  }

  function makeSource(apiConfig: unknown): TenderSourceConfig {
    return {
      TenderSourceID: 1,
      Name: 'stub',
      SourceType: 'api',
      URL: 'https://api.example.com/tenders',
      ApiConfig: JSON.stringify(apiConfig),
      RateLimitMs: 0,
      RobotsCompliance: true,
    };
  }

  const item = (n: number) => ({
    id: `item-${n}`,
    name: `Tender ${n}`,
    org: 'Org',
    deadline: '2026-11-01T00:00:00Z',
    url: `https://api.example.com/t/${n}`,
    link: 'https://api.example.com/t/{id}',
  });
  const fields = {
    title: { path: 'name' },
    organization: { path: 'org' },
    sourceUrl: { path: 'url' },
    deadlineDate: { path: 'deadline' },
  };

  // --- skip advances by items actually returned (server page-size cap) ---
  capturedUrls.length = 0;
  stubFetchBySkip({
    '0': { total: 5, items: [item(1), item(2)] }, // asked top=50, got 2 (cap demo)
    '2': { total: 5, items: [item(3), item(4)] },
    '4': { total: 5, items: [item(5)] },
  });
  const adapter = new ApiAdapter();
  adapter
    .fetch(makeSource({
      itemsPath: 'items',
      fields,
      pagination: { pageSize: 50, maxPages: 20 },
    }))
    .then((opps) => {
      const skips = capturedUrls.map((u) => new URL(u).searchParams.get('skip'));
      const tops = capturedUrls.map((u) => new URL(u).searchParams.get('top'));
      assert(opps.length === 5, 'all items across pages collected');
      assert(JSON.stringify(skips) === JSON.stringify(['0', '2', '4']), `skip advances by items.length → no gaps (got ${skips.join(',')})`);
      assert(tops.every((t) => t === '50'), 'top is sent on every page');
      assert(capturedUrls.length === 3, 'loop stops when skip >= total (no 4th request)');
      assert(capturedUrls.every((u) => !u.includes('top=0')), 'never sends top=0 (would dump the whole table)');
      runEmptyPageTest();
    })
    .catch((err) => {
      failed++;
      console.error(`  ✗ pagination test threw: ${err.message}`);
      runEmptyPageTest();
    });

  // --- empty page terminates ---
  function runEmptyPageTest(): void {
    capturedUrls.length = 0;
    stubFetchBySkip({
      '0': { total: 99, items: [item(1)] },
      '1': { total: 99, items: [] },
    });
    adapter
      .fetch(makeSource({ itemsPath: 'items', fields, pagination: { pageSize: 10, maxPages: 5 } }))
      .then((opps) => {
        assert(opps.length === 1, 'items from the non-empty page collected');
        assert(capturedUrls.length === 2, 'empty page stops the loop');
        runStaticQueryTest();
      })
      .catch((err) => {
        failed++;
        console.error(`  ✗ empty-page test threw: ${err.message}`);
        runStaticQueryTest();
      });
  }

  // --- static query + no pagination → legacy single request, no skip/top ---
  function runStaticQueryTest(): void {
    capturedUrls.length = 0;
    stubFetchBySkip({ none: { total: 1, items: [item(1)] } });
    adapter
      .fetch(makeSource({
        itemsPath: 'items',
        fields,
        params: { locale: 'en' },
        filter: [[{ field: 'invitationDate', operator: '>=', value: 'NOW-7d' }]],
        orderBy: [{ field: 'invitationDate', direction: 'desc' }],
      }))
      .then((opps) => {
        const u = new URL(capturedUrls[0]);
        assert(capturedUrls.length === 1, 'without pagination → single request');
        assert(!u.searchParams.has('skip') && !u.searchParams.has('top'), 'without pagination → no skip/top params (legacy behavior preserved)');
        assert(u.searchParams.get('locale') === 'en', 'static params sent');
        assert(u.searchParams.get('filter[0][0].field') === 'invitationDate', 'filter serialized into URL');
        assert(u.searchParams.get('filter[0][0].value') !== 'NOW-7d', 'NOW token resolved in URL');
        assert(u.searchParams.get('orderBy[0].field') === 'invitationDate' && u.searchParams.get('orderBy[0].direction') === 'desc', 'orderBy serialized into URL');
        assert(opps.length === 1, 'single-page items collected');
        runMaxPagesTest();
      })
      .catch((err) => {
        failed++;
        console.error(`  ✗ static query test threw: ${err.message}`);
        runMaxPagesTest();
      });
  }

  // --- maxPages caps the loop ---
  function runMaxPagesTest(): void {
    capturedUrls.length = 0;
    stubFetchBySkip({
      '0': { total: 100, items: [item(1)] },
      '1': { total: 100, items: [item(2)] },
      '2': { total: 100, items: [item(3)] },
    });
    adapter
      .fetch(makeSource({ itemsPath: 'items', fields, pagination: { pageSize: 1, maxPages: 3 } }))
      .then((opps) => {
        assert(opps.length === 3, 'maxPages items collected');
        assert(capturedUrls.length === 3, 'loop stops at maxPages even though more remain');
        runPageModeTest();
      })
      .catch((err) => {
        failed++;
        console.error(`  ✗ maxPages test threw: ${err.message}`);
        runPageModeTest();
      });
  }

  // --- pagination.mode "page": page=N (1-based), empty page stops, no skip/top ---
  function runPageModeTest(): void {
    capturedUrls.length = 0;
    const inertiaHtml = (items: unknown[]) =>
      `<html><div data-page="${JSON.stringify({ props: { tenders: { data: items } } }).replace(/"/g, '&quot;')}"></div></html>`;
    (globalThis as Record<string, unknown>).fetch = async (url: unknown) => {
      const u = new URL(String(url));
      capturedUrls.push(String(url));
      const pageNum = u.searchParams.get('page') ?? 'none';
      const items = pageNum === '1' ? [item(1), item(2)] : pageNum === '2' ? [item(3)] : [];
      return new Response(inertiaHtml(items), { status: 200 });
    };
    adapter
      .fetch(makeSource({
        responseFormat: 'inertia-html',
        itemsPath: 'props.tenders.data',
        fields,
        pagination: { mode: 'page', startPage: 1, pageSize: 15, maxPages: 10 },
      }))
      .then((opps) => {
        const pages = capturedUrls.map((u) => new URL(u).searchParams.get('page'));
        assert(opps.length === 3, 'page-mode items collected across pages');
        assert(JSON.stringify(pages) === JSON.stringify(['1', '2', '3']), `page=N increments from startPage (got ${pages.join(',')})`);
        assert(capturedUrls.every((u) => !new URL(u).searchParams.has('skip') && !new URL(u).searchParams.has('top')), 'page mode never sends skip/top');
        assert(capturedUrls.length === 3, 'page mode stops on empty page (no 4th request)');
        runPageModeTotalTest();
      })
      .catch((err) => {
        failed++;
        console.error(`  ✗ page-mode test threw: ${err.message}`);
        runPageModeTotalTest();
      });
  }

  // --- page mode + top-level total → stop when pages cover total ---
  function runPageModeTotalTest(): void {
    capturedUrls.length = 0;
    const inertiaHtml = (total: number) =>
      `<html><div data-page="${JSON.stringify({ total, props: { tenders: { data: [item(1)] } } }).replace(/"/g, '&quot;')}"></div></html>`;
    (globalThis as Record<string, unknown>).fetch = async (url: unknown) => {
      capturedUrls.push(String(url));
      return new Response(inertiaHtml(2), { status: 200 });
    };
    adapter
      .fetch(makeSource({
        responseFormat: 'inertia-html',
        itemsPath: 'props.tenders.data',
        fields,
        pagination: { mode: 'page', pageSize: 15, maxPages: 10 },
      }))
      .then((opps) => {
        assert(opps.length === 1, 'total-based stop still works in page mode');
        assert(capturedUrls.length === 1, 'loop stops once (page-1)*pageSize >= total');
        finish();
      })
      .catch((err) => {
        failed++;
        console.error(`  ✗ page-mode total test threw: ${err.message}`);
        finish();
      });
  }

  async function finish(): Promise<void> {
    // --- seeded e-GP config end-to-end (mapping only, stubbed page) ---
    capturedUrls.length = 0;
    stubFetchBySkip({
      '0': {
        total: 1,
        items: [{
          lotName: 'Supply of Chemicals',
          lotDescription: 'Lab chemicals',
          lotReferenceNo: 'ET-G-001-2026',
          procurementCategory: 'Goods',
          procuringEntity: 'Addis University',
          invitationDate: '2026-10-01T05:30:00Z',
          submissionDeadline: '2026-10-25T08:00:00Z',
          sourceApplication: 'Tendering',
          sourceId: 'sid-1',
          lotId: 'lid-1',
          lotInPackageId: 'lp-1',
          isSubmittable: true,
        }],
      },
    });
    try {
      const opps = await adapter.fetch(makeSource({ ...JSON.parse(egpApiConfigJson()) }));
      const o = opps[0];
      assert(opps.length === 1, 'seeded e-GP config fetches and maps one item');
      assert(o.title === 'Supply of Chemicals' && o.organization === 'Addis University' && o.country === 'Ethiopia', 'e-GP field mapping applied');
      assert(o.sourceReference === 'ET-G-001-2026', 'e-GP sourceReference mapped');
      assert(o.sourceUrl === 'https://production.egp.gov.et/egp/bids/all/tendering/lp-1/open', `e-GP detail URL built (${o.sourceUrl})`);
      assert(o.publicationDate instanceof Date && o.deadlineDate instanceof Date, 'e-GP dates parsed');
      const u = new URL(capturedUrls[0]);
      assert(u.searchParams.get('orderBy[1].field') === 'id', 'two-level orderBy present in real config');
      assert(new Date(u.searchParams.get('filter[0][0].value') || '').toString() !== 'Invalid Date', 'real config filter value resolved');
      assert(EGP_API_CONFIG.itemsPath === 'items', 'shared e-GP config exports itemsPath');
    } catch (err) {
      failed++;
      console.error(`  ✗ e-GP config test threw: ${(err as Error).message}`);
    }

    try {
      // --- seeded 2merkato config end-to-end (inertia HTML → mapping) ---
      capturedUrls.length = 0;
      const tmItem = {
        id: 555,
        title: 'Supply of Medical Equipment',
        company: { name_en: 'Addis Ababa City Administration' },
        bid_closing_date: '2026-10-09 14:00:00',
        created_at: '2026-10-01T08:30:00Z',
        published_at: '2026-10-01 11:30:00',
      };
      const tmHtml = `<html><div data-page="${JSON.stringify({ component: 'Front/Tenders/Index', props: { tenders: { data: [tmItem], total: 8110 } } }).replace(/"/g, '&quot;').replace(/'/g, '&#039;')}"></div></html>`;
      const tmEmptyHtml = `<html><div data-page="${JSON.stringify({ component: 'Front/Tenders/Index', props: { tenders: { data: [], total: 8110 } } }).replace(/"/g, '&quot;')}"></div></html>`;
      (globalThis as Record<string, unknown>).fetch = async (url: unknown) => {
        const u = new URL(String(url));
        capturedUrls.push(String(url));
        return new Response(u.searchParams.get('page') === '2' ? tmEmptyHtml : tmHtml, { status: 200 });
      };
      const { TWOMERKATO_FREE_SOURCE, twomerkatoApiConfigJson } = await import('./twomerkato-source');
      const opps = await adapter.fetch({
        TenderSourceID: 2,
        Name: TWOMERKATO_FREE_SOURCE.name,
        SourceType: 'api',
        URL: TWOMERKATO_FREE_SOURCE.url,
        ApiConfig: twomerkatoApiConfigJson(TWOMERKATO_FREE_SOURCE),
        RateLimitMs: 0,
        RobotsCompliance: true,
      });
      const t = opps[0];
      assert(opps.length === 1, 'seeded 2merkato config parses inertia HTML into one item');
      assert(t.title === 'Supply of Medical Equipment' && t.organization === 'Addis Ababa City Administration' && t.country === 'Ethiopia', '2merkato field mapping applied');
      assert(t.sourceReference === '555', '2merkato sourceReference mapped from id');
      assert(t.sourceUrl === 'https://tender.2merkato.com/tenders/555', `2merkato detail URL built (${t.sourceUrl})`);
      assert(t.publicationDate instanceof Date && t.deadlineDate instanceof Date, '2merkato dates parsed (created_at + bid_closing_date)');
      const u = new URL(capturedUrls[0]);
      assert(u.searchParams.get('page') === '1', '2merkato first request is page=1');
      assert(capturedUrls.length === 2, `2merkato stops on empty page 2 (got ${capturedUrls.length} requests)`);
      assert(!u.searchParams.has('skip') && !u.searchParams.has('top'), '2merkato never sends skip/top');
      assert(TWOMERKATO_FREE_SOURCE.config.itemsPath === 'props.tenders.data', 'shared 2merkato config exports itemsPath');
    } catch (err) {
      failed++;
      console.error(`  ✗ 2merkato config test threw: ${(err as Error).message}`);
    }

    try {
      // --- seeded TenderInfo config end-to-end (array response + itemFilter) ---
      capturedUrls.length = 0;
      const tiItem = (id: number, country: string) => ({
        ID: String(id),
        Date_publ: '2026-10-01',
        TenderNameOrig: `Tender ${id}`,
        Buyer: `Buyer ${id}`,
        Country: country === '70' ? 'Ethiopia' : 'Germany',
        Country_ID: country,
        Deadline: '05-11-2026',
        TenderLinkInner: `https://www.tenderinfo.org/tender/${id}`,
        searchFragmentXML: { fragment: [`snippet for ${id}`, []] },
        Price: '0',
        Currency: '',
        IsMarketPlace: '1',
      });
      (globalThis as Record<string, unknown>).fetch = async (url: unknown) => {
        const u = new URL(String(url));
        capturedUrls.push(String(url));
        if (u.searchParams.get('page') !== '1') {
          return new Response('[]', { status: 200 }); // beyond-last page → clean stop
        }
        return new Response(
          JSON.stringify([{ Total: '9' }, tiItem(1, '70'), tiItem(2, '45'), tiItem(3, '70')]),
          { status: 200 },
        );
      };
      const { TENDERINFO_SOURCE, tenderinfoApiConfigJson } = await import('./tenderinfo-source');
      const opps = await adapter.fetch({
        TenderSourceID: 3,
        Name: TENDERINFO_SOURCE.name,
        SourceType: 'api',
        URL: TENDERINFO_SOURCE.url,
        ApiConfig: tenderinfoApiConfigJson(),
        RateLimitMs: 0,
        RobotsCompliance: true,
      });
      assert(opps.length === 2, `itemFilter keeps only Country_ID=70 rows, drops foreign + metadata (got ${opps.length})`);
      const t = opps[0];
      assert(t.title === 'Tender 1' && t.organization === 'Buyer 1', 'TenderInfo field mapping applied');
      assert(t.country === 'Ethiopia', 'country mapped from Country field');
      assert(t.description === 'snippet for 1', 'description from searchFragmentXML.fragment.0');
      assert(t.sourceUrl === 'https://www.tenderinfo.org/tender/1', 'sourceUrl from TenderLinkInner');
      assert(t.sourceReference === '1', 'sourceReference from ID');
      assert(t.deadlineDate instanceof Date && t.deadlineDate.toISOString() === '2026-11-05T00:00:00.000Z', 'DD-MM-YYYY deadline parsed');
      assert(t.publicationDate instanceof Date, 'ISO publicationDate parsed');
      assert(t.estimatedValue === null && t.currency === null, 'Price="0"/undisclosed stays unmapped (null)');
      const firstUrl = new URL(capturedUrls[0]);
      assert(firstUrl.searchParams.get('kwords') === 'Ethiopia|Ethiopian|Addis', 'kwords OR-union sent');
      assert(/^\d{2}-\d{2}-\d{4}$/.test(firstUrl.searchParams.get('date_start') || ''), `date_start sent as DD-MM-YYYY (got ${firstUrl.searchParams.get('date_start')})`);
      assert(/^\d{2}-\d{2}-\d{4}$/.test(firstUrl.searchParams.get('date_end') || ''), 'date_end sent as DD-MM-YYYY');
      assert(capturedUrls.length === 2, `page mode stopped on empty page 2 (got ${capturedUrls.length} requests)`);
      assert(new URL(capturedUrls[1]).searchParams.get('page') === '2', 'second request is page=2');
    } catch (err) {
      failed++;
      console.error(`  ✗ TenderInfo config test threw: ${(err as Error).message}`);
    }

    try {
      // --- offset mode + ${VAR} header interpolation + maxAgeDays freshness ---
      capturedUrls.length = 0;
      process.env.ADAPTER_TEST_FETCH_KEY = 'hdr-key-99';
      const day = (ago: number): string => new Date(Date.now() - ago * 86400000).toISOString().slice(0, 10);
      const tmItem = (id: number, published: string | null) => ({
        id: `uuid-${id}`,
        ref: `REF-${id}`,
        title: `TM Tender ${id}`,
        country: 'Ethiopia',
        published_at: published,
        closes_at: '2026-12-01T10:00:00+00:00',
        source_url: `https://example.com/t/${id}`,
        buyers: { name: 'Org', slug: 'org' },
      });
      const capturedHeaders: Array<Record<string, string> | undefined> = [];
      (globalThis as Record<string, unknown>).fetch = async (
        url: unknown,
        init?: { headers?: Record<string, string> },
      ) => {
        capturedUrls.push(String(url));
        capturedHeaders.push(init?.headers);
        const offset = new URL(String(url)).searchParams.get('offset') ?? '0';
        const items =
          offset === '0'
            ? [tmItem(1, day(2)), tmItem(2, day(30))] // fresh + stale
            : offset === '2'
              ? [tmItem(3, day(1)), tmItem(4, null)] // fresh + undated
              : [];
        return new Response(JSON.stringify({ data: items, meta: { total: 4, limit: 2, offset: Number(offset) } }), { status: 200 });
      };
      const tmConfig = {
        itemsPath: 'data',
        headers: { 'X-Test-Key': '${ADAPTER_TEST_FETCH_KEY}' },
        params: { country: 'Ethiopia' },
        pagination: { mode: 'offset' as const, startSkip: 0, pageSize: 2, maxPages: 10 },
        maxAgeDays: 7,
        fields: {
          title: { path: 'title' },
          organization: { path: 'buyers.name' },
          sourceUrl: { path: 'source_url' },
          publicationDate: { path: 'published_at' },
          deadlineDate: { path: 'closes_at' },
        },
      };
      const opps = await adapter.fetch({
        TenderSourceID: 4,
        Name: 'offset-mode test',
        SourceType: 'api',
        URL: 'https://api.example.com/opportunities',
        ApiConfig: JSON.stringify(tmConfig),
        RateLimitMs: 0,
        RobotsCompliance: false,
      });
      const titles = opps.map((o) => o.title).sort();
      assert(opps.length === 3, `maxAgeDays drops stale rows, keeps undated (${opps.length}/4 collected)`);
      assert(JSON.stringify(titles) === JSON.stringify(['TM Tender 1', 'TM Tender 3', 'TM Tender 4']), `stale Tender 2 dropped, 1/3/4 kept (got ${titles.join(', ')})`);
      const offsets = capturedUrls.map((u) => new URL(u).searchParams.get('offset'));
      assert(JSON.stringify(offsets) === JSON.stringify(['0', '2', '4']), `offset advances by items actually returned (got ${offsets.join(',')})`);
      assert(capturedUrls.every((u) => new URL(u).searchParams.get('limit') === '2'), 'limit sent on every page');
      assert(capturedUrls.every((u) => !new URL(u).searchParams.has('skip') && !new URL(u).searchParams.has('top') && !new URL(u).searchParams.has('page')), 'offset mode never sends skip/top/page');
      assert(capturedUrls.length === 3, `empty page stops the loop (got ${capturedUrls.length} requests)`);
      assert(capturedHeaders[0]?.['X-Test-Key'] === 'hdr-key-99', 'header ${VAR} interpolated from process.env at request time');
      assert(JSON.stringify(tmConfig.headers).includes('${ADAPTER_TEST_FETCH_KEY}'), 'stored config keeps the placeholder (secret never persisted)');
      assert(opps[0].deadlineDate instanceof Date, 'closes_at ISO timestamp parsed');
      delete process.env.ADAPTER_TEST_FETCH_KEY;
    } catch (err) {
      failed++;
      console.error(`  ✗ offset/interpolation/maxAgeDays test threw: ${(err as Error).message}`);
    }

    try {
      await runRetryTests();
    } catch (err) {
      failed++;
      console.error(`  ✗ retry tests threw: ${(err as Error).message}`);
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
    if (failed > 0) process.exit(1);
    else console.log('All tests passed! ✓');
  }
});

// --- Results ---
// (summary is printed by the async pagination suite; see finish().)
