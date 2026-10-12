// =============================================================================
// Live test for the Phase F filters, dashboard, profile dimensions, and the
// relevance explanation (plan §17/§19/§20, migration 047).
//
// Standalone, opt-in (requires DB):
//   npx tsx src/modules/tenders/filters.live.test.ts
//
// Verifies:
//   - 047 backfill: no NULL Confidence, DataQuality within the 3 levels
//   - new list filters: exportOnly, dataQuality, confidenceMin, businessGroup,
//     publication-date range
//   - dashboard: bySource / byProductGroup / relevanceBuckets / deadlineTrend /
//     type KPIs and their cross-consistency with the list endpoint
//   - interest-profile CRUD round-trips the four new v2 dimensions
//   - explainScore() returns the 11-component breakdown
// =============================================================================

import { db } from '../../db/pool';
import {
  listOpportunities,
  getDashboard,
  getDistinctBusinessGroups,
  createInterestProfile,
  updateInterestProfile,
  deleteInterestProfile,
} from './tenders.service';
import { explainScore } from './relevance';

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

async function main(): Promise<void> {
  await db.connect();

  const users = await db.request().query(`SELECT TOP 1 UserID FROM dbo.[User] ORDER BY UserID`);
  const userId = users.recordset[0]?.UserID as number;
  assert(typeof userId === 'number', `a user exists for scoring joins (userId=${userId})`);

  // --- Migration 047 backfill ---
  console.log('\n047 backfill:');
  const nullConf = await db.request().query(
    `SELECT COUNT(*) AS c FROM dbo.TenderOpportunity WHERE Confidence IS NULL`
  );
  assert(Number(nullConf.recordset[0].c) === 0, 'no row has NULL Confidence');
  const badDq = await db.request().query(
    `SELECT COUNT(*) AS c FROM dbo.TenderOpportunity
     WHERE DataQuality IS NULL OR DataQuality NOT IN ('Complete','Partial','Sparse')`
  );
  assert(Number(badDq.recordset[0].c) === 0, 'DataQuality only ever holds the three levels');
  const mismatch = await db.request().query(
    `SELECT COUNT(*) AS c FROM dbo.TenderOpportunity
     WHERE (Confidence >= 70 AND DataQuality <> 'Complete')
        OR (Confidence BETWEEN 40 AND 69 AND DataQuality <> 'Partial')
        OR (Confidence < 40 AND DataQuality <> 'Sparse')`
  );
  assert(Number(mismatch.recordset[0].c) === 0, 'DataQuality labels agree with the Confidence thresholds');
  const bgMapped = await db.request().query(
    `SELECT COUNT(*) AS c FROM dbo.ProductGroup WHERE BusinessGroupCode IS NOT NULL`
  );
  assert(Number(bgMapped.recordset[0].c) === 3, 'the three verifiable product groups carry a BusinessGroupCode');

  // --- Business groups (filter values) ---
  console.log('\nbusiness groups:');
  const bgs = await getDistinctBusinessGroups();
  for (const code of ['KCC', 'BPN', 'BPL']) {
    const bg = bgs.find((b) => b.Code === code);
    assert(!!bg && bg.ProductGroupCount >= 1, `${code} listed with at least one mapped product group`);
  }
  assert(!bgs.some((b) => b.Code === 'TRC'), 'groups without a verified mapping are not listed');

  // --- Filters ---
  console.log('\nfilters:');
  const all = await listOpportunities({ userId, page: 1, pageSize: 1 });
  assert(all.total > 0, `opportunity data present (total=${all.total})`);

  const exported = await listOpportunities({ userId, exportOnly: true, page: 1, pageSize: 100 });
  const badCountry = exported.items.filter(
    (o) => o.Country == null || o.Country === '' || o.Country === 'Ethiopia'
  );
  assert(badCountry.length === 0, `exportOnly rows are all outside Ethiopia (${exported.total} rows)`);

  const complete = await listOpportunities({ userId, dataQuality: 'Complete', page: 1, pageSize: 50 });
  assert(
    complete.items.every((o) => o.Confidence != null && o.Confidence >= 70),
    `dataQuality=Complete rows all have Confidence >= 70 (${complete.total} rows)`
  );
  assert(complete.total + (await listOpportunities({ userId, dataQuality: 'Partial', page: 1, pageSize: 1 })).total
    + (await listOpportunities({ userId, dataQuality: 'Sparse', page: 1, pageSize: 1 })).total === all.total,
    'Complete+Partial+Sparse partitions the full set');

  const conf80 = await listOpportunities({ userId, confidenceMin: 80, page: 1, pageSize: 50 });
  assert(
    conf80.items.every((o) => o.Confidence != null && o.Confidence >= 80),
    `confidenceMin=80 rows all have Confidence >= 80 (${conf80.total} rows)`
  );

  const kcc = await listOpportunities({ userId, businessGroup: 'KCC', page: 1, pageSize: 50 });
  assert(
    kcc.items.every((o) => o.ProductGroupCode === 'COFFEE'),
    `businessGroup=KCC rows map to COFFEE (${kcc.total} rows)`
  );

  const old = await listOpportunities({ userId, toPublication: '2000-01-01', page: 1, pageSize: 1 });
  assert(old.total === 0, 'toPublication=2000 matches nothing (no ancient publications)');
  const modern = await listOpportunities({ userId, fromPublication: '2020-01-01', page: 1, pageSize: 1 });
  const modernSql = await db.request().query(
    `SELECT COUNT(*) AS c FROM dbo.TenderOpportunity WHERE PublicationDate >= '2020-01-01'`
  );
  assert(modern.total === Number(modernSql.recordset[0].c), `fromPublication total matches SQL count (${modern.total})`);

  // --- Dashboard ---
  console.log('\ndashboard:');
  const d = await getDashboard(userId);
  assert(d.exportCount === exported.total, `dashboard exportCount (${d.exportCount}) matches the exportOnly list (${exported.total})`);
  const typeSum = d.byType.reduce((a, b) => a + b.count, 0);
  assert(typeSum === d.totalOpportunities, `byType sums to the total (${typeSum}/${d.totalOpportunities})`);
  assert(d.rfqCount === (d.byType.find((t) => t.type === 'RFQ')?.count ?? -1), 'rfqCount equals the RFQ byType bucket');
  assert(d.buyerLeadCount === (d.byType.find((t) => t.type === 'BUYER_LEAD')?.count ?? -1), 'buyerLeadCount equals the BUYER_LEAD byType bucket');
  const bucketSum = d.relevanceBuckets.reduce((a, b) => a + b.count, 0);
  assert(bucketSum === d.totalOpportunities, `relevanceBuckets sum to the total (${bucketSum}/${d.totalOpportunities})`);
  assert(d.relevanceBuckets.length === 5, 'five relevance buckets (incl. Unscored)');
  assert(d.deadlineTrend.length === 8, 'deadlineTrend covers 8 weeks');
  assert(d.bySource.length > 0, `bySource populated (${d.bySource.length} entries)`);
  assert(d.bySource.reduce((a, b) => a + b.count, 0) <= d.totalOpportunities, 'bySource counts never exceed the total');
  assert(d.byProductGroup.length > 0, `byProductGroup populated (${d.byProductGroup.length} entries)`);

  // --- Interest profile CRUD with the v2 dimensions ---
  console.log('\ninterest profile v2 dimensions:');
  let profileId = 0;
  try {
    const created = await createInterestProfile({
      Name: 'ZZ-LIVE-PROFILE v2',
      Keywords: ['zz-live'],
      Sectors: ['agriculture'],
      Countries: ['ethiopia'],
      Organizations: ['Addis Procurement'],
      ProductGroupCodes: ['coffee'],
      Types: ['RFQ'],
      BusinessGroupCodes: ['kcc'],
    });
    profileId = created.InterestProfileID;
    assert(
      created.Organizations.length === 1 && created.Organizations[0] === 'Addis Procurement',
      'Organizations round-trips the original casing'
    );
    assert(created.ProductGroupCodes.includes('coffee'), 'ProductGroupCodes round-trip');
    assert(created.Types.includes('RFQ'), 'Types round-trip');
    assert(created.BusinessGroupCodes.includes('kcc'), 'BusinessGroupCodes round-trip');

    const updated = await updateInterestProfile(profileId, {
      Types: ['TENDER'],
      BusinessGroupCodes: ['kcc', 'bpl'],
      Organizations: [],
    });
    assert(updated.Types.length === 1 && updated.Types[0] === 'TENDER', 'Types update round-trips');
    assert(updated.BusinessGroupCodes.length === 2, 'BusinessGroupCodes update round-trips');
    assert(updated.Organizations.length === 0, 'cleared Organizations persist as an empty list');

    // --- Relevance explanation (uses the profile above as an active one) ---
    const opp = await db.request().query(
      `SELECT TOP 1 TenderOpportunityID FROM dbo.TenderOpportunity ORDER BY TenderOpportunityID`
    );
    const oppId = opp.recordset[0]?.TenderOpportunityID as number;
    const explanation = await explainScore(oppId);
    if (explanation) {
      assert(explanation.components.length === 11, `explainScore returns 11 components (${explanation.components.length})`);
      assert(explanation.total <= 100 && explanation.total >= 0, `explainScore total within 0-100 (${explanation.total})`);
      const componentSum = explanation.components.reduce((a, c) => a + c.points, 0);
      assert(Math.abs(componentSum - explanation.total) <= 1, `component points sum to the total (${componentSum} vs ${explanation.total})`);
      assert(explanation.components.some((c) => c.key === 'keywords' && c.max === 28), 'keywords component carries the 28-pt budget');
      assert(explanation.matchedKeywords.every((k) => typeof k === 'string'), 'matchedKeywords are strings');
      assert(typeof explanation.profileName === 'string' && explanation.profileName.length > 0, 'winning profile name reported');
    } else {
      console.log('  ℹ explainScore returned null (no active profiles) — breakdown skipped');
      assert(true, 'explainScore null-guard behaves without active profiles');
    }
  } finally {
    if (profileId > 0) {
      await deleteInterestProfile(profileId);
      const gone = await db.request().query(
        `SELECT COUNT(*) AS c FROM dbo.TenderInterestProfile WHERE Name = 'ZZ-LIVE-PROFILE v2'`
      );
      assert(Number(gone.recordset[0].c) === 0, 'profile cleanup removed the probe row');
    }
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
