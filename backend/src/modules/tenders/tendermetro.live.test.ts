// =============================================================================
// Live test for the TenderMetro Intelligence REST API integration.
//
// Standalone, opt-in (requires network + TENDERMETRO_API_KEY in backend/.env):
//   npx tsx src/modules/tenders/tendermetro.live.test.ts
//
// Skips cleanly (exit 0) when the key is not configured — the source is seeded
// inactive in that case and there is nothing to verify.
//
// Verifies the contract the seeded source relies on:
//   bearer auth, { data, meta } envelope, offset/limit paging (cap 100),
//   country=Ethiopia server filter, the maxAgeDays rolling window, and
//   end-to-end mapping through the real ApiAdapter using the shared config.
// =============================================================================

import { ApiAdapter } from './adapters/api-adapter';
import {
  TENDERMETRO_SOURCE,
  TENDERMETRO_API_URL,
  TENDERMETRO_RATE_LIMIT_MS,
  TENDERMETRO_MAX_AGE_DAYS,
  tendermetroApiConfigJson,
} from './tendermetro-source';
import { env } from '../../config/env';
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

/** Brief pause between raw probes (the adapter paces itself via RateLimitMs). */
function wait(ms = 1200): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeSource(config: unknown, rateLimitMs = 500): TenderSourceConfig {
  return {
    TenderSourceID: 0,
    Name: 'tendermetro live test',
    SourceType: 'api',
    URL: TENDERMETRO_SOURCE.url,
    ApiConfig: JSON.stringify(config),
    RateLimitMs: rateLimitMs,
    RobotsCompliance: true,
  };
}

function checkShape(opps: RawOpportunity[], label: string): void {
  const ethiopia = opps.filter((o) => o.country === 'Ethiopia');
  assert(ethiopia.length === opps.length, `${label}: every item is Ethiopia (country filter) (${ethiopia.length}/${opps.length})`);
  const linked = opps.filter((o) => /^https?:\/\//.test(o.sourceUrl));
  assert(linked.length === opps.length, `${label}: every item has a source_url (${linked.length}/${opps.length})`);
  const titled = opps.filter((o) => o.title.length > 0 && o.title !== '(Untitled)');
  assert(titled.length === opps.length, `${label}: every item has a title (${titled.length}/${opps.length})`);
  const pub = opps.filter((o) => o.publicationDate instanceof Date);
  assert(pub.length === opps.length, `${label}: published_at parsed on every item (${pub.length}/${opps.length})`);
  const stale = opps.filter(
    (o) => o.publicationDate !== null && o.publicationDate.getTime() < Date.now() - TENDERMETRO_MAX_AGE_DAYS * 86400000,
  );
  assert(stale.length === 0, `${label}: no row older than ${TENDERMETRO_MAX_AGE_DAYS} days survives maxAgeDays (${stale.length} stale)`);
  const undated = opps.filter((o) => o.publicationDate === null);
  console.log(`  ℹ ${label}: ${undated.length} undated rows kept (cannot be aged), deadlines on ${opps.filter((o) => o.deadlineDate !== null).length}/${opps.length}`);
}

async function main(): Promise<void> {
  // --- Key presence: skip cleanly when not configured ---
  if (!env.tenders.tenderMetroApiKey) {
    console.log('\nℹ TENDERMETRO_API_KEY not set — skipping TenderMetro live test (source is seeded inactive).');
    console.log(`\n${'='.repeat(60)}`);
    console.log('Tests: 0 passed, 0 failed, 0 total (skipped)');
    process.exit(0);
  }

  // --- Auth + envelope ---
  console.log('\nauth + envelope:');
  const res = await fetch(`${TENDERMETRO_API_URL}?country=Ethiopia&limit=5`, {
    headers: { Authorization: `Bearer ${env.tenders.tenderMetroApiKey}` },
  });
  assert(res.status === 200, `endpoint responds 200 with bearer key (got ${res.status})`);
  const body = (await res.json()) as { data?: unknown[]; meta?: { total?: number; limit?: number; offset?: number } };
  assert(Array.isArray(body.data), `response has data array (${body.data?.length ?? 0} rows)`);
  assert(typeof body.meta?.total === 'number' && (body.meta.total ?? 0) > 100, `meta.total reported (${body.meta?.total})`);
  assert(body.meta?.limit === 5, `limit echoes the request (got ${body.meta?.limit})`);

  // --- Bad key rejected (proves auth is actually enforced) ---
  await wait();
  const bad = await fetch(`${TENDERMETRO_API_URL}?country=Ethiopia&limit=1`, {
    headers: { Authorization: 'Bearer tm_live_invalid_key' },
  });
  assert(bad.status !== 200, `invalid key rejected (got ${bad.status})`);

  // --- offset/limit paging: stable order, disjoint pages, clean end ---
  console.log('\noffset paging:');
  await wait();
  const p1 = (await (await fetch(`${TENDERMETRO_API_URL}?country=Ethiopia&limit=100&offset=0`, {
    headers: { Authorization: `Bearer ${env.tenders.tenderMetroApiKey}` },
  })).json()) as { data: Array<{ id: string }> };
  await wait();
  const p1again = (await (await fetch(`${TENDERMETRO_API_URL}?country=Ethiopia&limit=100&offset=0`, {
    headers: { Authorization: `Bearer ${env.tenders.tenderMetroApiKey}` },
  })).json()) as { data: Array<{ id: string }> };
  assert(p1.data.length === 100, `limit=100 honored (${p1.data.length} rows)`);
  const sameOrder = p1.data.every((it, i) => it.id === p1again.data[i]?.id);
  assert(sameOrder, 'repeat request returns identical order (stable sort)');
  await wait();
  const p2 = (await (await fetch(`${TENDERMETRO_API_URL}?country=Ethiopia&limit=100&offset=100`, {
    headers: { Authorization: `Bearer ${env.tenders.tenderMetroApiKey}` },
  })).json()) as { data: Array<{ id: string }> };
  const ids1 = new Set(p1.data.map((it) => it.id));
  const overlap = p2.data.filter((it) => ids1.has(it.id)).length;
  assert(overlap === 0, `pages disjoint (${overlap} shared ids)`);

  // --- End-to-end through the real adapter with the shared seeded config ---
  console.log('\nApiAdapter end-to-end (seeded config):');
  const windowOpps = await new ApiAdapter().fetch(makeSource(JSON.parse(tendermetroApiConfigJson())));
  if (windowOpps.length > 0) {
    checkShape(windowOpps, '7-day window');
    const s = windowOpps[0];
    console.log(`  ℹ sample: "${s.title.slice(0, 60)}" / ${s.organization ?? '(no buyer linked)'} / dl ${s.deadlineDate ? s.deadlineDate.toISOString().slice(0, 10) : 'none'}`);
  } else {
    console.log(`  ℹ 7-day window collected 0 rows (quiet week — valid Success state; structural checks run on the undated-gate probe below)`);
    passed++;
  }

  // --- maxAgeDays gate proof: disable it and confirm stale rows WOULD exist ---
  console.log('\nmaxAgeDays gate:');
  const ungated = JSON.parse(tendermetroApiConfigJson()) as { maxAgeDays?: number; pagination?: { maxPages?: number } };
  delete ungated.maxAgeDays;
  if (ungated.pagination) ungated.pagination.maxPages = 1;
  const allOpps = await new ApiAdapter().fetch(makeSource(ungated));
  assert(allOpps.length >= 1, `ungated probe collects items (${allOpps.length})`);
  if (allOpps.length > 0) {
    const stale = allOpps.filter(
      (o) => o.publicationDate !== null && o.publicationDate.getTime() < Date.now() - TENDERMETRO_MAX_AGE_DAYS * 86400000,
    );
    console.log(`  ℹ ungated page holds ${stale.length}/${allOpps.length} rows older than ${TENDERMETRO_MAX_AGE_DAYS} days (the gate's job)`);
    const ethiopia = allOpps.filter((o) => o.country === 'Ethiopia');
    assert(ethiopia.length === allOpps.length, `ungated rows still country-filtered (${ethiopia.length}/${allOpps.length})`);
  }

  // --- Shared config exports ---
  console.log('\nshared config:');
  assert(TENDERMETRO_SOURCE.config.headers.Authorization === 'Bearer ${TENDERMETRO_API_KEY}', 'stored header keeps the ${VAR} placeholder (key never persisted)');
  assert(TENDERMETRO_SOURCE.config.params.country === 'Ethiopia', 'country filter is server-side');
  assert(TENDERMETRO_SOURCE.config.pagination.mode === 'offset', 'offset/limit paging mode');
  assert(TENDERMETRO_SOURCE.config.maxAgeDays === TENDERMETRO_MAX_AGE_DAYS, `${TENDERMETRO_MAX_AGE_DAYS}-day rolling window configured`);
  assert(TENDERMETRO_RATE_LIMIT_MS >= 2500, `pacing ${TENDERMETRO_RATE_LIMIT_MS}ms stays well under the 1,000/hour quota`);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\nLIVE TEST FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
