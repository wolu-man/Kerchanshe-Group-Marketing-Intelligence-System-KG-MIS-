// =============================================================================
// Reclassify existing opportunities — one-time/backfill helper for migration
// 045 (Opportunity Intelligence).
//
// Classifies every row that has never been classified (ClassifiedAt IS NULL):
// opportunity type from keyword rules, product group from dbo.ProductGroup.
// Existing classifications are NEVER overwritten. Safe to re-run (idempotent).
//
// Run with: npm run db:reclassify:tenders   (or: npx tsx scripts/reclassify-opportunities.ts)
// =============================================================================

import sql from 'mssql';
import { db } from '../src/db/pool';
import { classifyOpportunity, loadProductGroups, type ProductGroupRule } from '../src/modules/tenders/classifier';

const BATCH_LOG_EVERY = 250;

async function main(): Promise<void> {
  await db.connect();

  const groups: ProductGroupRule[] = await loadProductGroups();
  console.log(`Loaded ${groups.length} active product group(s).`);

  const pending = await db.request().query(
    `SELECT TenderOpportunityID, Title, Description, Sector, Organization
     FROM dbo.TenderOpportunity
     WHERE ClassifiedAt IS NULL
     ORDER BY TenderOpportunityID`
  );
  console.log(`Reclassifying ${pending.recordset.length} unclassified opportunity/ies...`);

  let classified = 0;
  let withGroup = 0;
  const byType = new Map<string, number>();

  for (const row of pending.recordset) {
    const cls = classifyOpportunity(
      {
        title: (row.Title as string) || '',
        description: (row.Description as string) || null,
        sector: (row.Sector as string) || null,
        organization: (row.Organization as string) || null,
      },
      groups,
    );

    await db
      .request()
      .input('Id', sql.Int, row.TenderOpportunityID as number)
      .input('OpportunityType', sql.VarChar(30), cls.opportunityType)
      .input('ProductGroupId', sql.Int, cls.productGroupId)
      .query(
        `UPDATE dbo.TenderOpportunity
         SET OpportunityType = @OpportunityType,
             ProductGroupId = @ProductGroupId,
             ClassificationMethod = 'rule',
             ClassifiedAt = SYSUTCDATETIME()
         WHERE TenderOpportunityID = @Id AND ClassifiedAt IS NULL`
      );

    classified++;
    if (cls.productGroupId != null) withGroup++;
    byType.set(cls.opportunityType, (byType.get(cls.opportunityType) ?? 0) + 1);

    if (classified % BATCH_LOG_EVERY === 0) {
      console.log(`  ...${classified}/${pending.recordset.length}`);
    }
  }

  console.log(`Classified ${classified} row(s); ${withGroup} matched a product group.`);
  for (const [type, count] of [...byType.entries()].sort()) {
    console.log(`  ${type}: ${count}`);
  }

  await db.close();
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    console.error('Reclassification failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
);
