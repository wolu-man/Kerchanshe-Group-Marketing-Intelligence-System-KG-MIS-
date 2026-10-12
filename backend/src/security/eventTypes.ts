// Canonical notification trigger events (FDS EPIC-05 + EPIC-01 lifecycle
// events carried into the Integration Design Section 5.3).
export const EVENT_TYPES = new Set<string>([
  // EPIC-05 trigger events (Integration Design 5.2)
  'NewReport',
  'ReportApproved',
  'ReportRejected',
  'InterviewApproved',
  'InterviewRejected',
  'PriceGapAlert',
  'SyncFailure',
  // Form lifecycle events (Integration Design 5.3)
  'FORM_ASSIGNED',
  'FORM_REMINDER',
  'SUBMISSION_CONFIRMED',
  'NEW_RESPONSE_RECEIVED',
  'RESPONSE_LIMIT_WARNING',
  'FORM_PUBLISHED',
  'FORM_INVITE',
  'OWNERSHIP_TRANSFERRED',
  'ACCESS_DENIED',
  // Phase 2 (depth) events
  'PARENT_FORM_UPDATED',
  'PARENT_PROPAGATED',
  'FORM_RESUME',
  'REPORT_SHARED',
  'RESPONSE_EDITED',
  'ANOMALY_FLAGGED',
  'CONSENT_VERSION_BUMPED',
  // Planning & Performance events
  'NEW_PLAN_CREATED',
]);
