// =============================================================================
// Live test for collection-time insert + cross-provider dedup (plan §25).
//
// Standalone, opt-in (requires DB):
//   npx tsx src/modules/tenders/collection.live.test.ts
//
// Verifies:
//   - insertIfNew() dedups by content hash ACROSS sources (source B with the
//     same core content is rejected even when non-hash fields differ)
//   - Region / Confidence / DataQuality are persisted on the inserted row
//     and match the quality.ts formulas (mirrored by migration 047)
//   - Region and opportunityType stay OUT of the content hash (§6 guardrail)
// =============================================================================

import { db } from '../../db/pool';
import { insertIfNew } from './collection.service';
import { loadProductGroups, type ProductGroupRule } from './classifier';
import { computeConfidence, computeDataQuality } from './quality';
import { getOpportunity } from './tenders.service';
import type { RawOpportunity } from './adapters/adapter';

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

const TITLE = 'ZZ-LIVE-DUP cross-provider duplicate probe';

function buildRaw(region: string): RawOpportunity {
  return {
    title: TITLE,
    organization: 'ZZ Test Org',
    country: 'Ethiopia',
    sector: 'ZZ-Test',
    description: 'x'.repeat(250),
    sourceUrl: 'https://example.invalid/zz-live-dup',
    sourceReference: null,
    publicationDate: new Date('2026-01-05T00:00:00.000Z'),
    deadlineDate: new Date('2030-06-01T00:00:00.000Z'),
    estimatedValue: 123456,
    currency: 'ETB',
    region,
    // opportunityType differs too — both must stay hash-excluded (§6).
    opportunityType: 'RFQ',
  };
}

async function cleanup(): Promise<void> {
  await db.request().query(
    `DELETE FROM dbo.TenderOpportunity WHERE Title = '${TITLE.replace(/'/g, "''")}'`
  );
}

async function main(): Promise<void> {
  await db.connect();

  // --- Two distinct sources (dedup is meaningless with one) ---
  const sources = await db.request().query(
    `SELECT TOP 2 TenderSourceID FROM dbo.TenderSource ORDER BY TenderSourceID`
  );
  assert(sources.recordset.length === 2, `two sources available (${sources.recordset.length})`);
  const [srcA, srcB] = sources.recordset.map((r) => r.TenderSourceID as number);
  assert(srcA !== srcB, 'source IDs are distinct');

  const groups: ProductGroupRule[] = await loadProductGroups();
  assert(groups.length > 0, `product groups loaded (${groups.length})`);

  await cleanup();

  try {
    // --- First insert succeeds ---
    const first = await insertIfNew(buildRaw('Africa'), srcA, groups);
    assert(first.inserted === true, 'first insert (source A) succeeds');
    assert(first.inserted && typeof first.id === 'number', 'insert returns the new row id');

    // --- Second insert with the same hash from a different source is rejected,
    //     even though non-hash fields (region, source id) differ ---
    const second = await insertIfNew(buildRaw('Global'), srcB, groups);
    assert(second.inserted === false, 'same content from source B dedups to inserted=false');

    const rows = await db.request().query(
      `SELECT TenderOpportunityID, TenderSourceID, Region, Confidence, DataQuality, ContentHash
       FROM dbo.TenderOpportunity WHERE Title = '${TITLE.replace(/'/g, "''")}'`
    );
    assert(rows.recordset.length === 1, `exactly one row exists after cross-provider insert (${rows.recordset.length})`);
    const row = rows.recordset[0];
    assert(row.TenderSourceID === srcA, 'the first source wins (source A stored)');
    assert(row.Region === 'Africa', 'Region from the first insert is preserved');

    // --- Quality columns match quality.ts (and hence migration 047's backfill) ---
    const raw = buildRaw('Africa');
    const expectedConfidence = computeConfidence({ ...raw });
    assert(expectedConfidence === 100, `fixture is complete (confidence=${expectedConfidence})`);
    assert(row.Confidence === expectedConfidence, `Confidence persisted as ${expectedConfidence} (got ${row.Confidence})`);
    assert(
      row.DataQuality === computeDataQuality(expectedConfidence),
      `DataQuality persisted as ${computeDataQuality(expectedConfidence)} (got ${row.DataQuality})`
    );

    // --- DTO carries the new fields ---
    const dto = await getOpportunity(row.TenderOpportunityID as number, 1);
    assert(dto.Region === 'Africa', 'DTO exposes Region');
    assert(dto.Confidence === expectedConfidence, 'DTO exposes Confidence');
    assert(dto.DataQuality === 'Complete', 'DTO exposes DataQuality=Complete');
    assert(typeof dto.AiGapFill === 'string' || dto.AiGapFill === null, 'DTO exposes AiGapFill (null until enriched)');
    assert(dto.OpportunityType === 'RFQ', 'source-declared opportunityType flowed through (hash-excluded)');
  } finally {
    await cleanup();
    const left = await db.request().query(
      `SELECT COUNT(*) AS c FROM dbo.TenderOpportunity WHERE Title = '${TITLE.replace(/'/g, "''")}'`
    );
    assert(Number(left.recordset[0].c) === 0, 'cleanup removed the probe row');
  }

  await db.close();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\nLIVE TEST FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
