// =============================================================================
// Test environment shim — sets TENDERS_RESTRICTED_HOSTS BEFORE config/env loads.
//
// Import this module FIRST (statically, above ./source-policy) in test files
// that need the restricted-host machinery exercised against a known host.
// config/env reads the variable exactly once at module load, so import order
// is what makes this work — statement order is preserved by both ESM and CJS
// evaluation semantics.
// =============================================================================

process.env.TENDERS_RESTRICTED_HOSTS = 'restricted.example.com';
