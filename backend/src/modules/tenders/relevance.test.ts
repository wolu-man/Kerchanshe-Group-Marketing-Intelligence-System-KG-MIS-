// =============================================================================
// Unit tests for relevance scoring v2 — the 100-point weight model (plan §17).
//
// Standalone test script — no test framework needed, no DB connection required.
// Tests the pure scoreComponents() function that both scoreOpportunity(),
// scoreRawOpportunity() and explainScore() share.
//
// Run with: npx tsx src/modules/tenders/relevance.test.ts
// =============================================================================

import {
  RELEVANCE_WEIGHTS,
  scoreComponents,
  type OpportunitySide,
  type ActiveProfile,
  type ScoreExtras,
  type ComponentKey,
} from './relevance';

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

// --- Fixtures ---

const FUTURE = new Date(Date.now() + 30 * 86400000);
const SOON = new Date(Date.now() + 2 * 86400000);
const PAST = new Date(Date.now() - 2 * 86400000);

function emptyProfile(overrides: Partial<ActiveProfile> = {}): ActiveProfile {
  return {
    InterestProfileID: 1,
    Name: 'Test profile',
    Sectors: [],
    Keywords: [],
    Countries: [],
    MinValue: null,
    MaxValue: null,
    Currency: null,
    Organizations: [],
    ProductGroupCodes: [],
    Types: [],
    BusinessGroupCodes: [],
    ...overrides,
  };
}

function side(overrides: Partial<OpportunitySide> = {}): OpportunitySide {
  return {
    title: 'Supply of green coffee',
    description: 'The buyer requests quotations for washed Yirgacheffe coffee.',
    country: 'Ethiopia',
    sector: 'Agriculture',
    organization: 'Addis Procurement Agency',
    estimatedValue: 50000,
    currency: 'ETB',
    deadlineDate: FUTURE,
    opportunityType: 'TENDER',
    productGroupId: 7,
    productGroupCode: 'COFFEE',
    businessGroupCode: 'KCC',
    sourceQuality: 70,
    ...overrides,
  };
}

const EXTRAS: ScoreExtras = { saveRate: 0, leadDays: 7 };

describe('weight budget', () => {
  const total = Object.values(RELEVANCE_WEIGHTS).reduce((a, b) => a + b, 0);
  assert(total === 100, `weights sum to 100 (got ${total})`);
  assert(RELEVANCE_WEIGHTS.keywords === 28, 'keywords weight is 28');
  assert(RELEVANCE_WEIGHTS.value === 6, 'value weight is 6 (unused Currency factor folded in)');
  assert(RELEVANCE_WEIGHTS.historicalInterest === 5, 'historical interest weight is 5');
});

describe('full match', () => {
  const profile = emptyProfile({
    Keywords: ['coffee', 'yirgacheffe'],
    Sectors: ['agriculture'],
    Countries: ['ethiopia'],
    MinValue: 1000,
    MaxValue: 100000,
    Currency: 'ETB',
    Organizations: ['addis procurement'],
    ProductGroupCodes: ['coffee'],
    Types: ['tender'],
    BusinessGroupCodes: ['kcc'],
  });
  const result = scoreComponents(
    side({ title: 'Coffee Yirgacheffe supply', description: 'The buyer requests quotations for washed coffee.', sourceQuality: 100 }),
    profile,
    { saveRate: 1, leadDays: 7 },
  );
  assert(result.total === 100, `all applicable factors match → 100 (got ${result.total})`);
  assert(result.breakdown.keywords === 28, 'both keywords hit in the title → 28');
  assert(result.breakdown.productGroup === 14, 'product group component maxes at 14');
  assert(result.breakdown.deadline === 5, 'deadline 30 days out with 7-day lead → 5');
  assert(result.breakdown.sourceQuality === 4, 'source quality 100 → full 4');
  assert(result.matchedKeywords.includes('coffee'), 'matched keywords reported');
  const sum = Object.values(result.breakdown).reduce((a, b) => a + b, 0);
  assert(Math.abs(sum - result.total) < 1, 'breakdown sums to the rounded total');
});

describe('keywords — title double weight', () => {
  const profile = emptyProfile({ Keywords: ['coffee'] });
  const titleHit = scoreComponents(side({ title: 'Coffee supply', description: 'irrelevant' }), profile, EXTRAS);
  const descHit = scoreComponents(side({ title: ' unrelated ', description: 'coffee here' }), profile, EXTRAS);
  assert(titleHit.breakdown.keywords === 28, 'title hit earns full 28 for a single-keyword profile');
  assert(descHit.breakdown.keywords === 14, 'description hit earns half (14) for a single-keyword profile');
  const noHit = scoreComponents(side({ title: 'x', description: 'y' }), profile, EXTRAS);
  assert(noHit.breakdown.keywords === 0, 'no keyword hit earns 0');
  assert(noHit.matchedKeywords.length === 0, 'no matched keywords reported');
});

describe('product group + business unit', () => {
  const profile = emptyProfile({ ProductGroupCodes: ['coffee'], BusinessGroupCodes: ['kcc'] });
  const hit = scoreComponents(side(), profile, EXTRAS);
  assert(hit.breakdown.productGroup === 14, 'case-insensitive product group match → 14');
  assert(hit.breakdown.businessUnit === 4, 'case-insensitive business group match → 4');
  const miss = scoreComponents(side({ productGroupCode: 'PAINTS', businessGroupCode: 'GLC' }), profile, EXTRAS);
  assert(miss.breakdown.productGroup === 0, 'different product group → 0');
  assert(miss.breakdown.businessUnit === 0, 'different business group → 0');
  const noMap = scoreComponents(side({ productGroupCode: null, businessGroupCode: null }), profile, EXTRAS);
  assert(noMap.breakdown.productGroup === 0, 'unmapped product group → 0');
  assert(noMap.breakdown.businessUnit === 0, 'unmapped business group → 0');
});

describe('value + currency consistency', () => {
  const ranged = emptyProfile({ MinValue: 10000, MaxValue: 100000, Currency: 'ETB' });
  assert(scoreComponents(side(), ranged, EXTRAS).breakdown.value === 6, 'in range + matching currency → 6');
  const wrongCurrency = scoreComponents(side({ currency: 'USD' }), ranged, EXTRAS);
  assert(wrongCurrency.breakdown.value === 0, 'currency mismatch kills the value component');
  const outOfRange = scoreComponents(side({ estimatedValue: 500 }), ranged, EXTRAS);
  assert(outOfRange.breakdown.value === 0, 'value below minimum → 0');
  const noRange = scoreComponents(side(), emptyProfile(), EXTRAS);
  assert(noRange.breakdown.value === 0, 'profile without range → 0');
});

describe('deadline feasibility', () => {
  const far = scoreComponents(side({ deadlineDate: FUTURE }), emptyProfile(), EXTRAS);
  assert(far.breakdown.deadline === 5, '30 days out with 7-day lead → 5');
  const soon = scoreComponents(side({ deadlineDate: SOON }), emptyProfile(), EXTRAS);
  assert(soon.breakdown.deadline === 2, 'inside the reminder window → 2 (actionable but tight)');
  const past = scoreComponents(side({ deadlineDate: PAST }), emptyProfile(), EXTRAS);
  assert(past.breakdown.deadline === 0, 'past deadline → 0');
  const missing = scoreComponents(side({ deadlineDate: null }), emptyProfile(), EXTRAS);
  assert(missing.breakdown.deadline === 0, 'missing deadline → 0');
});

describe('type, source quality, historical interest', () => {
  const typed = emptyProfile({ Types: ['rfq'] });
  assert(scoreComponents(side({ opportunityType: 'RFQ' }), typed, EXTRAS).breakdown.type === 5, 'listed type → 5');
  assert(scoreComponents(side({ opportunityType: 'TENDER' }), typed, EXTRAS).breakdown.type === 0, 'unlisted type → 0');
  assert(scoreComponents(side(), emptyProfile(), EXTRAS).breakdown.type === 0, 'empty profile types → 0');

  assert(scoreComponents(side({ sourceQuality: 100 }), emptyProfile(), EXTRAS).breakdown.sourceQuality === 4, 'source quality 100 → 4');
  assert(scoreComponents(side({ sourceQuality: 0 }), emptyProfile(), EXTRAS).breakdown.sourceQuality === 0, 'source quality 0 → 0');
  assert(scoreComponents(side({ sourceQuality: null }), emptyProfile(), EXTRAS).breakdown.sourceQuality === (4 * 70) / 100, 'missing source uses default 70 → 2.8');

  assert(scoreComponents(side(), emptyProfile(), { saveRate: 1, leadDays: 7 }).breakdown.historicalInterest === 5, 'save-rate 1.0 → 5');
  assert(scoreComponents(side(), emptyProfile(), { saveRate: 0.5, leadDays: 7 }).breakdown.historicalInterest === 2.5, 'save-rate 0.5 → 2.5');
  assert(scoreComponents(side(), emptyProfile(), { saveRate: 0, leadDays: 7 }).breakdown.historicalInterest === 0, 'save-rate 0 → 0');
});

describe('floor and ceiling', () => {
  const empty = scoreComponents(
    side({ title: '', description: '', country: null, sector: null, organization: null, estimatedValue: null, deadlineDate: null, productGroupCode: null, businessGroupCode: null, sourceQuality: 0 }),
    emptyProfile(),
    EXTRAS,
  );
  assert(empty.total === 0, 'fully empty side + empty profile → 0');
  const cap = scoreComponents(side(), emptyProfile(), { saveRate: 5, leadDays: 0 });
  assert(cap.total <= 100, 'save-rate above 1.0 never exceeds the 100 cap');
  const keys = Object.keys(RELEVANCE_WEIGHTS) as ComponentKey[];
  assert(keys.length === 11, 'eleven scoring components defined');
});

// --- Summary ---
console.log('\n' + '='.repeat(60));
console.log(`Tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
