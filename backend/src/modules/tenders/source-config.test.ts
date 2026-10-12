// =============================================================================
// Unit tests for source configuration schemas — AI auto-enrichment opt-in.
//
// Standalone test script — no test framework needed, no DB connection required.
//
// Run with: npx tsx src/modules/tenders/source-config.test.ts
// =============================================================================

import { createSourceSchema, updateSourceSchema } from './tenders.types';

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

const BASE_SOURCE = {
  Name: 'Test Source',
  SourceType: 'api' as const,
  URL: 'https://example.org/api',
};

// --- Tests ---

describe('createSourceSchema — AiAutoEnrich default (opt-in only)', () => {
  const parsed = createSourceSchema.parse({ ...BASE_SOURCE });
  assert(parsed.AiAutoEnrich === false, 'omitted AiAutoEnrich defaults to false');

  const enabled = createSourceSchema.parse({ ...BASE_SOURCE, AiAutoEnrich: true });
  assert(enabled.AiAutoEnrich === true, 'explicit AiAutoEnrich: true is preserved');

  const disabled = createSourceSchema.parse({ ...BASE_SOURCE, AiAutoEnrich: false });
  assert(disabled.AiAutoEnrich === false, 'explicit AiAutoEnrich: false is preserved');
});

describe('updateSourceSchema — AiAutoEnrich toggle', () => {
  const parsed = updateSourceSchema.parse({ AiAutoEnrich: true });
  assert(parsed.AiAutoEnrich === true, 'partial update can enable auto-enrichment');

  const disable = updateSourceSchema.parse({ AiAutoEnrich: false });
  assert(disable.AiAutoEnrich === false, 'partial update can disable auto-enrichment');

  const other = updateSourceSchema.parse({ IsActive: true });
  assert(other.AiAutoEnrich === undefined, 'unrelated updates leave AiAutoEnrich untouched');
});

describe('updateSourceSchema — unrelated fields still validate', () => {
  const parsed = updateSourceSchema.parse({ RateLimitMs: 5000, Schedule: '12h' });
  assert(parsed.RateLimitMs === 5000 && parsed.Schedule === '12h', 'rate limit + schedule updates pass');
});

// --- Summary ---
console.log('\n============================================================');
console.log(`Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) {
  console.error('FAILED');
  process.exit(1);
}
console.log('All tests passed! ✓');
process.exit(0);
