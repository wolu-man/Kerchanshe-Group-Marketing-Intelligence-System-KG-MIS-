// =============================================================================
// Unit tests for AI enrichment gap-fill policy (plan §8) — ai-enrichment.ts.
//
// Covers the pure helpers: parseFieldBasis(), parseSuggestions() and the
// decideGapFill() policy extracted from enrichOpportunity(). No LLM call and
// no DB connection required.
//
// Run with: npx tsx src/modules/tenders/ai-enrichment.test.ts
// =============================================================================

import { parseFieldBasis, parseSuggestions, decideGapFill } from './ai-enrichment';
import type { GapFillInput } from './ai-enrichment';

// --- Minimal test runner ---
let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(`  ok ${message}`);
  } else {
    failed++;
    console.error(`  FAIL ${message}`);
  }
}

function describe(name: string, fn: () => void): void {
  console.log(`\n${name}:`);
  fn();
}

const GROUPS = [
  { ProductGroupID: 1, Code: 'COFFEE' },
  { ProductGroupID: 2, Code: 'BEEF_MEAT' },
  { ProductGroupID: 3, Code: 'PENS_STATIONERY' },
];

function input(overrides: Partial<GapFillInput>): GapFillInput {
  return {
    method: 'rule',
    typeMatched: false,
    currentType: 'TENDER',
    currentProductGroupId: null,
    configuredGroups: GROUPS,
    suggestions: { opportunityType: null, productGroup: null },
    ...overrides,
  };
}

describe('decideGapFill — type policy', () => {
  const allowed = decideGapFill(input({ suggestions: { opportunityType: 'RFQ', productGroup: null } }));
  assert(allowed.applyType === true, 'rule + inconclusive + TENDER + RFQ suggestion → applied');

  const matched = decideGapFill(input({ typeMatched: true, suggestions: { opportunityType: 'RFQ', productGroup: null } }));
  assert(matched.applyType === false, 'keyword rules already matched → not applied');

  const aiMethod = decideGapFill(input({ method: 'ai', suggestions: { opportunityType: 'RFQ', productGroup: null } }));
  assert(aiMethod.applyType === false, 'method "ai" (already AI-classified) → not applied');

  const notTender = decideGapFill(input({ currentType: 'RFQ', suggestions: { opportunityType: 'BUYER_LEAD', productGroup: null } }));
  assert(notTender.applyType === false, 'current type is not the TENDER default → not applied');

  const noSuggestion = decideGapFill(input({ suggestions: { opportunityType: null, productGroup: null } }));
  assert(noSuggestion.applyType === false, 'no suggestion → not applied');

  const sameType = decideGapFill(input({ suggestions: { opportunityType: 'TENDER', productGroup: null } }));
  assert(sameType.applyType === false, 'suggestion equals the current type → not applied');
});

describe('decideGapFill — product group policy', () => {
  const applied = decideGapFill(input({ suggestions: { opportunityType: null, productGroup: 'COFFEE' } }));
  assert(applied.applyProductGroup?.ProductGroupID === 1, 'unresolved group + configured code → applied');

  const caseInsensitive = decideGapFill(input({ suggestions: { opportunityType: null, productGroup: 'coffee' } }));
  assert(caseInsensitive.applyProductGroup?.ProductGroupID === 1, 'lower-case suggestion code matches (uppercase-normalised)');

  const alreadySet = decideGapFill(input({ currentProductGroupId: 2, suggestions: { opportunityType: null, productGroup: 'COFFEE' } }));
  assert(alreadySet.applyProductGroup === null, 'group already set → not applied');

  const invented = decideGapFill(input({ suggestions: { opportunityType: null, productGroup: 'VEHICLES' } }));
  assert(invented.applyProductGroup === null, 'code not in the configured taxonomy → never applied');

  const noSuggestion = decideGapFill(input({ suggestions: { opportunityType: null, productGroup: null } }));
  assert(noSuggestion.applyProductGroup === null, 'no suggestion → not applied');
});

describe('decideGapFill — combined', () => {
  const both = decideGapFill(input({ suggestions: { opportunityType: 'RFQ', productGroup: 'PENS_STATIONERY' } }));
  assert(both.applyType === true && both.applyProductGroup?.ProductGroupID === 3, 'type and product group can apply together');
});

describe('parseFieldBasis', () => {
  const basis = parseFieldBasis({
    estimatedValue: 'confirmed',
    currency: 'inferred',
    eligibility: 'nonsense',
    requiredDocuments: 42,
    contactInfo: 'unavailable',
    keyDates: 'uncertain',
  });
  assert(basis.estimatedValue === 'confirmed', 'valid basis value kept');
  assert(basis.currency === 'inferred', 'inferred basis kept');
  assert(basis.contactInfo === 'unavailable', 'unavailable basis kept');
  assert(basis.keyDates === 'uncertain', 'uncertain basis kept');
  assert(!('eligibility' in basis), 'invalid basis value dropped');
  assert(!('requiredDocuments' in basis), 'non-string basis dropped');
  assert(Object.keys(parseFieldBasis(null)).length === 0, 'null input → empty record');
  assert(Object.keys(parseFieldBasis('text')).length === 0, 'non-object input → empty record');
  assert(Object.keys(parseFieldBasis({})).length === 0, 'empty object → empty record');
});

describe('parseSuggestions', () => {
  const s1 = parseSuggestions({ suggestedOpportunityType: 'RFQ', suggestedProductGroup: ' coffee ' });
  assert(s1.opportunityType === 'RFQ', 'valid type suggestion kept');
  assert(s1.productGroup === 'COFFEE', 'product group trimmed + upper-cased');

  const s2 = parseSuggestions({ suggestedOpportunityType: 'NOT_A_TYPE', suggestedProductGroup: '' });
  assert(s2.opportunityType === null, 'invalid type suggestion → null');
  assert(s2.productGroup === null, 'empty product group → null');

  const s3 = parseSuggestions({});
  assert(s3.opportunityType === null && s3.productGroup === null, 'missing keys → null/null');
});

// --- Summary ---
console.log('\n' + '='.repeat(60));
console.log(`Tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
