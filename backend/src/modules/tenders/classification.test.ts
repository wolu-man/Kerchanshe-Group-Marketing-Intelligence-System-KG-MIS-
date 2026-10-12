// =============================================================================
// Unit tests for opportunity classification — type rules + product taxonomy.
//
// Standalone test script — no test framework needed, no DB connection required.
//
// Run with: npx tsx src/modules/tenders/classification.test.ts
// =============================================================================

import {
  OPPORTUNITY_TYPES,
  isOpportunityType,
  classifyOpportunityType,
  matchProductGroup,
  classifyOpportunity,
  type ProductGroupRule,
} from './classifier';

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

// --- Fixtures (shapes mirror the dbo.ProductGroup seeds in migration 045) ---

const GROUPS: ProductGroupRule[] = [
  {
    ProductGroupID: 1,
    Code: 'COFFEE',
    Name: 'Coffee',
    SortOrder: 10,
    keywords: ['Ethiopian coffee', 'Arabica', 'green coffee', 'Yirgacheffe', 'coffee buyer', 'roaster'],
  },
  {
    ProductGroupID: 2,
    Code: 'BEEF_MEAT',
    Name: 'Beef / Meat',
    SortOrder: 20,
    keywords: ['beef', 'frozen beef', 'meat', 'livestock', 'cattle', 'goat'],
  },
  {
    ProductGroupID: 3,
    Code: 'PENS_STATIONERY',
    Name: 'Pens / Stationery',
    SortOrder: 30,
    keywords: ['pens', 'ballpoint pens', 'stationery', 'office supplies'],
  },
  {
    ProductGroupID: 4,
    Code: 'PAINTS',
    Name: 'Paints',
    SortOrder: 40,
    keywords: ['paint', 'emulsion paint', 'primer', 'painting materials'],
  },
];

// --- Tests ---

describe('OPORTUNITY_TYPES contract', () => {
  assert(OPPORTUNITY_TYPES.length === 5, 'five opportunity types defined');
  assert(OPPORTUNITY_TYPES[0] === 'TENDER', 'TENDER is the default type');
  assert(OPPORTUNITY_TYPES.includes('RFQ'), 'RFQ present');
  assert(OPPORTUNITY_TYPES.includes('BUYER_LEAD'), 'BUYER_LEAD present');
  assert(OPPORTUNITY_TYPES.includes('TRADE_INTELLIGENCE'), 'TRADE_INTELLIGENCE present');
  assert(OPPORTUNITY_TYPES.includes('MARKET_SIGNAL'), 'MARKET_SIGNAL present');
});

describe('isOpportunityType', () => {
  assert(isOpportunityType('TENDER') === true, 'valid type accepted');
  assert(isOpportunityType('RFQ') === true, 'RFQ accepted');
  assert(isOpportunityType('tender') === false, 'lowercase value rejected');
  assert(isOpportunityType('AUCTION') === false, 'unknown value rejected');
  assert(isOpportunityType(null) === false, 'null rejected');
  assert(isOpportunityType(undefined) === false, 'undefined rejected');
  assert(isOpportunityType(42) === false, 'number rejected');
});

describe('classifyOpportunityType — default', () => {
  assert(
    classifyOpportunityType('Supply of Medical Equipment', 'Invitation to bid for medical supplies') === 'TENDER',
    'ordinary tender text stays TENDER',
  );
  assert(classifyOpportunityType('', '') === 'TENDER', 'empty text stays TENDER');
  assert(classifyOpportunityType('School renovation works', null) === 'TENDER', 'null description tolerated');
});

describe('classifyOpportunityType — RFQ rules', () => {
  assert(
    classifyOpportunityType('RFQ: Printing of Annual Report', '') === 'RFQ',
    'rfq acronym in title → RFQ',
  );
  assert(
    classifyOpportunityType('Request for Quotation — Office Chairs', '') === 'RFQ',
    'request for quotation → RFQ',
  );
  assert(
    classifyOpportunityType('Supply notice', 'The agency is requesting quotations for generators') === 'RFQ',
    'requesting quotations in description → RFQ',
  );
});

describe('classifyOpportunityType — BUYER_LEAD rules', () => {
  assert(
    classifyOpportunityType('Buyer looking for sesame suppliers', '') === 'BUYER_LEAD',
    'buyer looking for suppliers → BUYER_LEAD',
  );
  assert(
    classifyOpportunityType('Importer seeking vendor of spices', '') === 'BUYER_LEAD',
    'seeking vendor → BUYER_LEAD',
  );
  assert(
    classifyOpportunityType('Company wants to buy industrial gloves', '') === 'BUYER_LEAD',
    'wants to buy → BUYER_LEAD',
  );
});

describe('classifyOpportunityType — TRADE_INTELLIGENCE rules', () => {
  assert(
    classifyOpportunityType('Shipment record: coffee to Jeddah', 'Import records for week 40') === 'TRADE_INTELLIGENCE',
    'import records → TRADE_INTELLIGENCE',
  );
  assert(
    classifyOpportunityType('Bill of lading update', '') === 'TRADE_INTELLIGENCE',
    'bill of lading → TRADE_INTELLIGENCE',
  );
  assert(
    classifyOpportunityType('Consignment of steel arrives', '') === 'TRADE_INTELLIGENCE',
    'consignment → TRADE_INTELLIGENCE',
  );
});

describe('classifyOpportunityType — MARKET_SIGNAL rules', () => {
  assert(
    classifyOpportunityType('Contract Award Notice — Road Works', '') === 'MARKET_SIGNAL',
    'contract award → MARKET_SIGNAL',
  );
  assert(
    classifyOpportunityType('Weekly coffee market price index', '') === 'MARKET_SIGNAL',
    'market price index → MARKET_SIGNAL',
  );
  assert(
    classifyOpportunityType('Competitor activity in region', '') === 'MARKET_SIGNAL',
    'competitor activity → MARKET_SIGNAL',
  );
});

describe('classifyOpportunityType — source hint wins', () => {
  assert(
    classifyOpportunityType('Supply of desks', 'ordinary tender text', 'RFQ') === 'RFQ',
    'valid hint overrides rule outcome',
  );
  assert(
    classifyOpportunityType('RFQ: something', '', 'TENDER') === 'TENDER',
    'explicit TENDER hint overrides RFQ keyword',
  );
  assert(
    classifyOpportunityType('Request for Quotation', '', 'NOT_A_TYPE') === 'RFQ',
    'invalid hint ignored, rules still apply',
  );
  assert(
    classifyOpportunityType('Supply notice', '', null) === 'TENDER',
    'null hint tolerated',
  );
});

describe('matchProductGroup — keyword matching', () => {
  assert(
    matchProductGroup('Ethiopian coffee export tender', GROUPS)?.group.Code === 'COFFEE',
    'multiword coffee keyword matches',
  );
  assert(
    matchProductGroup('Purchase of green coffee beans', GROUPS)?.group.Code === 'COFFEE',
    'green coffee keyword matches',
  );
  assert(
    matchProductGroup('Supply of frozen beef to schools', GROUPS)?.group.Code === 'BEEF_MEAT',
    'beef keyword matches',
  );
  assert(
    matchProductGroup('Ballpoint pens for regional offices', GROUPS)?.group.Code === 'PENS_STATIONERY',
    'pens keyword matches',
  );
  assert(
    matchProductGroup('Supply of primer paint', GROUPS)?.group.Code === 'PAINTS',
    'primer keyword matches',
  );
  assert(matchProductGroup('IT equipment procurement', GROUPS) === null, 'no match → null');
});

describe('matchProductGroup — word boundaries and plurals', () => {
  assert(
    matchProductGroup('Stationery and pen sets', GROUPS)?.group.Code === 'PENS_STATIONERY',
    'singular "pen" matches plural keyword "pens"',
  );
  assert(
    matchProductGroup('The vendor opens the tender', GROUPS) === null,
    'no match for "pen" inside "opens" (word boundary)',
  );
  assert(
    matchProductGroup('Wall painting works', GROUPS) === null,
    'no match for "paint" inside "painting" without the phrase keyword',
  );
  assert(
    matchProductGroup('Purchase of painting materials', GROUPS)?.group.Code === 'PAINTS',
    'multiword painting-materials keyword still matches',
  );
  assert(
    matchProductGroup('Wholesale consulting services', GROUPS) === null,
    'text without any group keywords stays unmatched',
  );
});

describe('matchProductGroup — best match wins', () => {
  const mixed = matchProductGroup(
    'Supply of green coffee and Arabica grades to the cattle shed',
    GROUPS,
  );
  assert(mixed?.group.Code === 'COFFEE', 'group with more keyword hits wins over a single-hit group');
  assert((mixed?.hits ?? 0) >= 2, 'winning match reports its keyword hits');
  assert(
    (mixed?.matchedKeywords ?? []).includes('green coffee'),
    'matched keywords are reported',
  );
});

describe('classifyOpportunity — combined', () => {
  const result = classifyOpportunity(
    {
      title: 'RFQ: Supply of green coffee for roastery',
      description: 'The buyer requests quotations for Ethiopian coffee.',
      sector: null,
      organization: null,
    },
    GROUPS,
  );
  assert(result.opportunityType === 'RFQ', 'type classified as RFQ');
  assert(result.productGroupId === 1, 'product group resolved to COFFEE');
  assert(result.matchedKeywords.length > 0, 'matched keywords returned');

  const untouched = classifyOpportunity({ title: 'Consulting services' }, GROUPS);
  assert(untouched.opportunityType === 'TENDER', 'unmatched type defaults to TENDER');
  assert(untouched.productGroupId === null, 'unmatched product group stays null');

  const hint = classifyOpportunity({ title: 'Bulk supply notice' }, GROUPS, 'MARKET_SIGNAL');
  assert(hint.opportunityType === 'MARKET_SIGNAL', 'source hint flows into combined classification');

  const empty = classifyOpportunity({ title: '' }, []);
  assert(empty.opportunityType === 'TENDER', 'no groups + empty title → safe defaults');
  assert(empty.productGroupId === null, 'no groups → null product group');
});

// --- Summary ---

console.log(`\n${'='.repeat(50)}`);
console.log(`Passed: ${passed}  Failed: ${failed}`);
// Hard exit: the classifier pulls in db/pool (mssql), whose pool handle would
// otherwise keep the event loop alive after the assertions finish.
process.exit(failed > 0 ? 1 : 0);
