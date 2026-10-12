// =============================================================================
// Rescore relevance for all opportunities — one-time/backfill helper for the
// relevance v2 model (plan §17).
//
// Re-runs scoreOpportunity() on every row (best active profile wins) and prints
// the before/after distribution. Safe to re-run (idempotent).
//
// Run with: npm run db:rescore:tenders   (or: npx tsx scripts/rescore-opportunities.ts)
// =============================================================================

import { db } from '../src/db/pool';
import { rescoreAll, RELEVANCE_WEIGHTS } from '../src/modules/tenders/relevance';

async function distribution(label: string): Promise<void> {
  const result = await db.request().query(
    `SELECT
       SUM(CASE WHEN RelevanceScore >= 75 THEN 1 ELSE 0 END) AS high,
       SUM(CASE WHEN RelevanceScore BETWEEN 50 AND 74 THEN 1 ELSE 0 END) AS medium,
       SUM(CASE WHEN RelevanceScore BETWEEN 25 AND 49 THEN 1 ELSE 0 END) AS low,
       SUM(CASE WHEN RelevanceScore BETWEEN 0 AND 24 THEN 1 ELSE 0 END) AS none,
       SUM(CASE WHEN RelevanceScore IS NULL THEN 1 ELSE 0 END) AS unscored
     FROM dbo.TenderOpportunity`
  );
  const r = result.recordset[0];
  console.log(
    `${label}: high=${r.high} medium=${r.medium} low=${r.low} none=${r.none} unscored=${r.unscored}`
  );
}

async function main(): Promise<void> {
  await db.connect();

  const weightTotal = Object.values(RELEVANCE_WEIGHTS).reduce((a, b) => a + b, 0);
  console.log(
    `Relevance v2 weights: ${Object.entries(RELEVANCE_WEIGHTS)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ')} (total ${weightTotal})`
  );

  const total = await db.request().query(`SELECT COUNT(*) AS c FROM dbo.TenderOpportunity`);
  console.log(`Rescoring ${total.recordset[0].c} opportunity/ies...`);
  await distribution('Before');

  const activeProfiles = await db.request().query(
    `SELECT COUNT(*) AS c FROM dbo.TenderInterestProfile WHERE IsActive = 1`
  );
  const profileCount = Number(activeProfiles.recordset[0].c);
  if (profileCount === 0) {
    console.log(
      '  ! No active interest profiles — scoreOpportunity() is a no-op, rows stay' +
        ' unscored (NULL). Create a profile in /tenders/interest-profiles to score' +
        ' (creation triggers this same rescore automatically).'
    );
  } else {
    console.log(`  ${profileCount} active interest profile(s) drive the scoring.`);
  }

  const updated = await rescoreAll();
  console.log(`Rescored ${updated} row(s).`);
  await distribution('After ');

  const info = await db.request().query(
    `SELECT TOP 3 t.TenderOpportunityID, t.Title, t.RelevanceScore
     FROM dbo.TenderOpportunity t
     ORDER BY t.RelevanceScore DESC`
  );
  console.log('Top scored rows:');
  for (const row of info.recordset) {
    console.log(`  #${row.TenderOpportunityID} score=${row.RelevanceScore} ${String(row.Title).slice(0, 70)}`);
  }

  await db.close();
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    console.error('Rescore failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
);
