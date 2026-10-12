// =============================================================================
// Unit tests for tender source policy helpers — restricted-host machinery.
//
// Standalone test script — no test framework needed, no DB connection required.
// Runs with TENDERS_RESTRICTED_HOSTS=restricted.example.com (via ./test-env,
// which must be imported before anything that loads config/env) so the
// configured-host matching logic stays covered while the default configuration
// (no restricted hosts) is asserted in policy.test.ts.
//
// Run with: npx tsx src/modules/tenders/policy-restricted.test.ts
// =============================================================================

import './test-env';
import {
  isRestrictedSourceUrl,
  isRestrictedHost,
  restrictedHostFor,
  restrictedSourceMessage,
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

describe('isRestrictedSourceUrl (configured host)', () => {
  assert(isRestrictedSourceUrl('https://restricted.example.com/data') === true, 'exact configured host is restricted');
  assert(isRestrictedSourceUrl('https://api.restricted.example.com/x') === true, 'subdomain of a configured host is restricted');
  assert(isRestrictedSourceUrl('https://RESTRICTED.EXAMPLE.COM/x') === true, 'host comparison is case-insensitive');
  assert(isRestrictedSourceUrl('https://restricted.example.com.attacker.example/x') === false, 'suffix trick (host that merely ends with the text) is not restricted');
  assert(isRestrictedSourceUrl('https://example.com/tenders') === false, 'ordinary host is unrestricted');
  assert(isRestrictedSourceUrl('https://www.undp.org/procurement') === false, 'another ordinary host is unrestricted');
  assert(isRestrictedSourceUrl('') === true, 'empty URL is treated as restricted');
  assert(isRestrictedSourceUrl(null) === true, 'null URL is treated as restricted');
  assert(isRestrictedSourceUrl(undefined) === true, 'undefined URL is treated as restricted');
  assert(isRestrictedSourceUrl('not a url') === true, 'unparseable URL is treated as restricted');
});

describe('isRestrictedHost (configured host)', () => {
  assert(isRestrictedHost('restricted.example.com') === true, 'exact host matches');
  assert(isRestrictedHost('sub.restricted.example.com') === true, 'subdomain host matches');
  assert(isRestrictedHost('restricted.example.com.evil.com') === false, 'look-alike host does not match');
  assert(isRestrictedHost('RESTRICTED.EXAMPLE.COM') === true, 'uppercase host matches');
  assert(isRestrictedHost('example.com') === false, 'unrelated host does not match');
  assert(isRestrictedHost(null) === true, 'null host is restricted');
  assert(isRestrictedHost('') === true, 'empty host is restricted');
  assert(isRestrictedHost('  restricted.example.com.  ') === true, 'host normalization strips dots and spaces');
});

describe('restrictedHostFor (configured host)', () => {
  assert(restrictedHostFor('https://restricted.example.com/x') === 'restricted.example.com', 'returns the configured host for a restricted URL');
  assert(restrictedHostFor('https://example.com/x') === null, 'returns null for an unrestricted URL');
  assert(restrictedHostFor('nonsense') === null || restrictedHostFor('nonsense') === 'invalid-url', 'handles unparseable URLs');
});

describe('restrictedSourceMessage (configured host)', () => {
  const message = restrictedSourceMessage('https://restricted.example.com/x');
  assert(message.includes('restricted.example.com'), 'message names the restricted host');
  assert(message.toLowerCase().includes('inactive'), 'message explains the source stays inactive');
});

// --- Summary ---
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
