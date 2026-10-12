// =============================================================================
// Unit tests for field-presence confidence + data-quality labels (quality.ts).
//
// Standalone test script — no test framework needed, no DB connection required.
//
// Run with: npx tsx src/modules/tenders/quality.test.ts
// =============================================================================

import { computeConfidence, computeDataQuality, isDataQuality, DATA_QUALITY_LEVELS } from './quality';

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

const FUTURE = '2030-01-15T00:00:00.000Z';
const PUBLISHED = '2026-01-01T00:00:00.000Z';
const LONG_DESC = 'x'.repeat(200);

describe('computeConfidence — component weights', () => {
  assert(computeConfidence({}) === 0, 'empty input scores 0');
  assert(computeConfidence({ organization: 'Addis Procurement' }) === 20, 'organization contributes 20');
  assert(computeConfidence({ deadlineDate: FUTURE }) === 20, 'deadline contributes 20');
  assert(computeConfidence({ publicationDate: PUBLISHED }) === 15, 'publication date contributes 15');
  assert(computeConfidence({ country: 'Ethiopia' }) === 10, 'country contributes 10');
  assert(computeConfidence({ sector: 'Agriculture' }) === 10, 'sector contributes 10');
  assert(computeConfidence({ estimatedValue: 1000 }) === 15, 'estimated value contributes 15');
  assert(computeConfidence({ description: LONG_DESC }) === 10, 'description >= 200 chars contributes 10');
});

describe('computeConfidence — edge cases', () => {
  assert(computeConfidence({ description: 'x'.repeat(199) }) === 0, 'description of 199 chars contributes 0');
  assert(computeConfidence({ description: LONG_DESC }) === 10, 'description of exactly 200 chars contributes 10');
  assert(computeConfidence({ organization: '   ' }) === 0, 'whitespace-only organization is absent');
  assert(computeConfidence({ estimatedValue: 0 }) === 15, 'zero value still counts as present');
  assert(computeConfidence({ estimatedValue: '' }) === 0, 'empty-string value counts as absent');
  const full = computeConfidence({
    organization: 'Org',
    deadlineDate: FUTURE,
    publicationDate: PUBLISHED,
    country: 'Ethiopia',
    sector: 'Agriculture',
    estimatedValue: 500,
    description: LONG_DESC,
  });
  assert(full === 100, 'all fields present scores 100 (20+20+15+10+10+15+10)');
});

describe('computeDataQuality — thresholds', () => {
  assert(computeDataQuality(100) === 'Complete', '100 → Complete');
  assert(computeDataQuality(70) === 'Complete', '70 → Complete (lower bound)');
  assert(computeDataQuality(69) === 'Partial', '69 → Partial');
  assert(computeDataQuality(40) === 'Partial', '40 → Partial (lower bound)');
  assert(computeDataQuality(39) === 'Sparse', '39 → Sparse');
  assert(computeDataQuality(0) === 'Sparse', '0 → Sparse');
});

describe('isDataQuality guard', () => {
  assert(isDataQuality('Complete'), 'Complete accepted');
  assert(isDataQuality('Partial'), 'Partial accepted');
  assert(isDataQuality('Sparse'), 'Sparse accepted');
  assert(!isDataQuality('Good'), 'unknown label rejected');
  assert(!isDataQuality(null), 'null rejected');
  assert(DATA_QUALITY_LEVELS.length === 3, 'three quality levels defined');
});

// --- Summary ---
console.log('\n' + '='.repeat(60));
console.log(`Tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
