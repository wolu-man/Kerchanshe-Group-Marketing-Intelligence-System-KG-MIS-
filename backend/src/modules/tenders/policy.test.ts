// =============================================================================
// Unit tests for tender source policy helpers.
//
// Standalone test script — no test framework needed, no DB connection required.
// Tests pure functions: restricted-host detection (default config: no restricted
// hosts), collection status mapping, and SQL duplicate-key detection.
// Configured-host matching is covered in policy-restricted.test.ts.
//
// Run with: npx tsx src/modules/tenders/policy.test.ts
// =============================================================================

import {
  isRestrictedSourceUrl,
  isRestrictedHost,
  restrictedHostFor,
  restrictedSourceMessage,
  computeCollectionStatus,
  isDuplicateKeyError,
  type CollectionCounters,
} from './source-policy';

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

// --- Tests ---

describe('isRestrictedSourceUrl (default config: no restricted hosts)', () => {
  assert(isRestrictedSourceUrl('https://production.egp.gov.et/egp/bids/all') === false, 'egp production portal is unrestricted (authorized public JSON API)');
  assert(isRestrictedSourceUrl('https://egp.gov.et/portal') === false, 'bare egp.gov.et is unrestricted');
  assert(isRestrictedSourceUrl('https://tenders.egp.gov.et/x') === false, 'subdomain of egp.gov.et is unrestricted');
  assert(isRestrictedSourceUrl('https://EGP.GOV.ET/x') === false, 'e-GP URL is unrestricted regardless of case');
  assert(isRestrictedSourceUrl('https://egp.gov.et.attacker.example/x') === false, 'suffix trick (host that merely ends with the text) is not restricted');
  assert(isRestrictedSourceUrl('https://example.com/tenders') === false, 'ordinary host is unrestricted');
  assert(isRestrictedSourceUrl('https://www.undp.org/procurement') === false, 'another ordinary host is unrestricted');
  assert(isRestrictedSourceUrl('') === true, 'empty URL is treated as restricted');
  assert(isRestrictedSourceUrl(null) === true, 'null URL is treated as restricted');
  assert(isRestrictedSourceUrl(undefined) === true, 'undefined URL is treated as restricted');
  assert(isRestrictedSourceUrl('not a url') === true, 'unparseable URL is treated as restricted');
});

describe('isRestrictedHost (default config: no restricted hosts)', () => {
  assert(isRestrictedHost('egp.gov.et') === false, 'egp.gov.et is not on the default restricted list');
  assert(isRestrictedHost('production.egp.gov.et') === false, 'production.egp.gov.et is not on the default restricted list');
  assert(isRestrictedHost('egp.gov.et.evil.com') === false, 'look-alike host does not match');
  assert(isRestrictedHost('example.com') === false, 'unrelated host does not match');
  assert(isRestrictedHost(null) === true, 'null host is restricted');
  assert(isRestrictedHost('') === true, 'empty host is restricted');
});

describe('restrictedHostFor (default config: no restricted hosts)', () => {
  assert(restrictedHostFor('https://production.egp.gov.et/egp/bids/all') === null, 'returns null for the e-GP portal (unrestricted)');
  assert(restrictedHostFor('https://example.com/x') === null, 'returns null for an unrestricted URL');
  assert(restrictedHostFor('nonsense') === null || restrictedHostFor('nonsense') === 'invalid-url', 'handles unparseable URLs');
});

describe('restrictedSourceMessage', () => {
  const message = restrictedSourceMessage('');
  assert(message.toLowerCase().includes('inactive'), 'message explains the source stays inactive');
  assert(message.includes('this host'), 'message falls back to a generic host label when the URL has no host');
});

describe('computeCollectionStatus', () => {
  const base: CollectionCounters = { fetched: 0, inserted: 0, duplicates: 0, failed: 0 };

  assert(computeCollectionStatus(base, true) === 'Failed', 'fetch failure reports Failed');
  assert(computeCollectionStatus({ ...base, fetched: 0 }, false) === 'Success', 'nothing to fetch reports Success');
  assert(
    computeCollectionStatus({ ...base, fetched: 5, inserted: 5 }, false) === 'Success',
    'all inserts succeed -> Success'
  );
  assert(
    computeCollectionStatus({ ...base, fetched: 5, inserted: 2, duplicates: 3 }, false) === 'Success',
    'all duplicates still report Success'
  );
  assert(
    computeCollectionStatus({ ...base, fetched: 5, inserted: 4, failed: 1 }, false) === 'Partial',
    'some insert failures report Partial'
  );
  assert(
    computeCollectionStatus({ ...base, fetched: 5, failed: 5 }, false) === 'Failed',
    'every insert failing reports Failed'
  );
  assert(
    computeCollectionStatus({ ...base, fetched: 5, failed: 5 }, true) === 'Failed',
    'fetch failure dominates even with counters'
  );
});

describe('isDuplicateKeyError', () => {
  assert(isDuplicateKeyError({ number: 2601 }) === true, 'SQL 2601 (duplicate index row) detected');
  assert(isDuplicateKeyError({ number: 2627 }) === true, 'SQL 2627 (unique constraint) detected');
  assert(isDuplicateKeyError({ number: 547 }) === false, 'FK violation is not a duplicate');
  assert(isDuplicateKeyError({ number: 208 }) === false, 'invalid object name is not a duplicate');
  assert(
    isDuplicateKeyError(new Error('Cannot insert duplicate key row in object')) === true,
    'message-only duplicate errors detected'
  );
  assert(
    isDuplicateKeyError(new Error('Violation of UNIQUE KEY constraint')) === true,
    'unique-key message detected'
  );
  assert(isDuplicateKeyError(new Error('Connection refused')) === false, 'unrelated message is not a duplicate');
  assert(isDuplicateKeyError(null) === false, 'null is not an error');
  assert(isDuplicateKeyError('boom') === false, 'string is not an error');
});

// --- Summary ---
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
