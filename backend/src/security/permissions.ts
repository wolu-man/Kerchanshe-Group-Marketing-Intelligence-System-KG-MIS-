// =============================================================================
// Authorization capability map - authoritative implementation of the
// Security Matrix v1.0. Action-level permissions + row-level data scope.
// =============================================================================

export const ROLES = [
  'Administrator',
  'Marketing Manager',
  'Marketing Analyst',
  'Field Officer',
  'Viewer',
] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/**
 * Capability values (Security Matrix 3.1 legend, extended for data scope):
 *  full     - create/read/update/delete without restriction, all data
 *  read     - view only, all data
 *  write-own- create/update only records the user created (own)
 *  read-own - view only records the user created / submitted
 *  region   - view only within the user's assigned regions (Security Matrix 4)
 *  none     - no access
 */
export type Capability = 'full' | 'read' | 'write-own' | 'read-own' | 'region' | 'none';

export interface ResolvedCapability {
  allowed: boolean;
  write: boolean;
  scope: 'all' | 'own' | 'region';
}

const ALL_ROLES: Record<Role, Capability> = {
  Administrator: 'full',
  'Marketing Manager': 'full',
  'Marketing Analyst': 'full',
  'Field Officer': 'full',
  Viewer: 'full',
};

// ---------------------------------------------------------------------------
// Action -> per-role capability (Security Matrix Sections 3.2 - 3.8)
// ---------------------------------------------------------------------------
const PERMISSIONS: Record<string, Partial<Record<Role, Capability>>> = {
  // 3.2 Market Visit Reports
  'marketVisits.create': { Administrator: 'full', 'Marketing Manager': 'full', 'Field Officer': 'write-own' },
  'marketVisits.update': { Administrator: 'full', 'Marketing Manager': 'full', 'Field Officer': 'write-own' },
  'marketVisits.submit': { Administrator: 'full', 'Marketing Manager': 'full', 'Field Officer': 'write-own' },
  'marketVisits.review': { Administrator: 'full', 'Marketing Manager': 'full' },
  'marketVisits.approve': { Administrator: 'full', 'Marketing Manager': 'full' },
  'marketVisits.reject': { Administrator: 'full', 'Marketing Manager': 'full' },
  'marketVisits.view': {
    Administrator: 'full',
    'Marketing Manager': 'full',
    'Marketing Analyst': 'read',
    'Field Officer': 'read-own',
  },

  // 3.3 Dynamic Forms (NexForm)
  'forms.create': { Administrator: 'full', 'Marketing Manager': 'full', 'Marketing Analyst': 'full' },
  'forms.update': { Administrator: 'full', 'Marketing Manager': 'full', 'Marketing Analyst': 'full' },
  'forms.delete': { Administrator: 'full', 'Marketing Manager': 'write-own', 'Marketing Analyst': 'write-own' },
  'forms.publish': { Administrator: 'full', 'Marketing Manager': 'write-own', 'Marketing Analyst': 'write-own' },
  'forms.archive': { Administrator: 'full', 'Marketing Manager': 'write-own', 'Marketing Analyst': 'write-own' },
  'forms.reassignOwnership': { Administrator: 'full' },
  'forms.configureAccess': { Administrator: 'full', 'Marketing Manager': 'write-own', 'Marketing Analyst': 'write-own' },
  'forms.respond': { 'Field Officer': 'write-own' },
  'forms.view': {
    Administrator: 'full',
    'Marketing Manager': 'full',
    'Marketing Analyst': 'read-own',
    'Field Officer': 'read',
    Viewer: 'read',
  },
  'forms.viewResponses': {
    Administrator: 'full',
    'Marketing Manager': 'full',
    'Marketing Analyst': 'read-own',
    'Field Officer': 'read-own',
  },
  'forms.customizeDashboard': {
    Administrator: 'full',
    'Marketing Manager': 'full',
    'Marketing Analyst': 'write-own',
    Viewer: 'read',
  },
  'forms.export': {
    Administrator: 'full',
    'Marketing Manager': 'full',
    'Marketing Analyst': 'write-own',
    Viewer: 'read',
  },
  // Phase 2 (depth): response editing, sharing + report access control,
  // anomaly review, cross-form reporting.
  'forms.editResponses': {
    Administrator: 'full',
    'Marketing Manager': 'full',
    'Marketing Analyst': 'write-own',
  },
  'forms.share': {
    Administrator: 'full',
    'Marketing Manager': 'full',
    'Marketing Analyst': 'write-own',
  },
  'forms.viewAnomalies': {
    Administrator: 'full',
    'Marketing Manager': 'full',
    'Marketing Analyst': 'read',
  },
  'forms.manageAnomalies': {
    Administrator: 'full',
    'Marketing Manager': 'full',
  },
  'forms.crossReports': {
    Administrator: 'full',
    'Marketing Manager': 'full',
    'Marketing Analyst': 'full',
  },
  // AI Form Assistant (authoring tool — same roles as forms.create/update).
  'forms.aiAssistant': {
    Administrator: 'full',
    'Marketing Manager': 'full',
    'Marketing Analyst': 'full',
  },

  // 3.4 Competitor & Pricing
  'pricing.record': { Administrator: 'full', 'Marketing Manager': 'full', 'Field Officer': 'write-own' },
  'pricing.view': {
    Administrator: 'full',
    'Marketing Manager': 'full',
    'Marketing Analyst': 'read',
    'Field Officer': 'region',
  },
  'pricing.configureThresholds': { Administrator: 'full' },

  // 3.9 Customer & Distributor Interviews (SRD MI-DC-03)
  'interviews.create': { Administrator: 'full', 'Marketing Manager': 'full', 'Field Officer': 'write-own' },
  'interviews.update': { Administrator: 'full', 'Marketing Manager': 'full', 'Field Officer': 'write-own' },
  'interviews.submit': { Administrator: 'full', 'Marketing Manager': 'full', 'Field Officer': 'write-own' },
  'interviews.review': { Administrator: 'full', 'Marketing Manager': 'full' },
  'interviews.approve': { Administrator: 'full', 'Marketing Manager': 'full' },
  'interviews.reject': { Administrator: 'full', 'Marketing Manager': 'full' },
  'interviews.view': {
    Administrator: 'full',
    'Marketing Manager': 'full',
    'Marketing Analyst': 'read',
    'Field Officer': 'read-own',
    Viewer: 'read',
  },

  // 3.10 Multimedia Evidence Register (SRD MI-DC-06)
  'multimedia.upload': { Administrator: 'full', 'Marketing Manager': 'full', 'Field Officer': 'write-own' },
  'multimedia.update': { Administrator: 'full', 'Marketing Manager': 'full', 'Field Officer': 'write-own' },
  'multimedia.validate': { Administrator: 'full', 'Marketing Manager': 'full' },
  'multimedia.view': {
    Administrator: 'full',
    'Marketing Manager': 'full',
    'Marketing Analyst': 'read',
    'Field Officer': 'read-own',
    Viewer: 'read',
  },

  // 3.11 Weekly Sales (SRD MI-DM-05, Weekly Sales tab)
  'weeklySales.create': { Administrator: 'full', 'Marketing Manager': 'full', 'Field Officer': 'write-own' },
  'weeklySales.update': { Administrator: 'full', 'Marketing Manager': 'write-own', 'Field Officer': 'write-own' },
  'weeklySales.delete': { Administrator: 'full', 'Marketing Manager': 'write-own', 'Field Officer': 'write-own' },
  'weeklySales.view': {
    Administrator: 'full',
    'Marketing Manager': 'full',
    'Marketing Analyst': 'read',
    'Field Officer': 'read-own',
    Viewer: 'read',
  },

  // 3.12 Competitor reference catalogue (SRD MI-AN-03)
  'competitors.view': {
    Administrator: 'full',
    'Marketing Manager': 'full',
    'Marketing Analyst': 'read',
    'Field Officer': 'read',
  },
  'competitors.manage': { Administrator: 'full', 'Marketing Manager': 'full' },

  // 3.5 D365FO Sync
  'sync.trigger': { Administrator: 'full' },
  'sync.viewLogs': { Administrator: 'full' },

  // 3.6 CUAS Role Mapping / 3.7 Notifications / 3.8 Reports (admin-only)
  'admin.roleMapping': { Administrator: 'full' },
  'admin.notificationConfig': { Administrator: 'full' },
  'admin.viewNotifications': { Administrator: 'full' },
  'admin.reportSchedules': { Administrator: 'full' },
  'admin.audit': { Administrator: 'full' },
  'admin.users': { Administrator: 'full' },
  'admin.businessGroups': { Administrator: 'full' },
  'admin.customers': { Administrator: 'full' },
  'admin.products': { Administrator: 'full' },
  'admin.regions': { Administrator: 'full' },
  'admin.relationshipConfig': { Administrator: 'full' },

  'reports.view': {
    Administrator: 'full',
    'Marketing Manager': 'full',
    'Marketing Analyst': 'full',
    'Field Officer': 'read',
    Viewer: 'read',
  },

  // 3.13 Tender & Opportunity Intelligence
  'tenders.view': {
    Administrator: 'full',
    'Marketing Manager': 'full',
    'Marketing Analyst': 'read',
    'Field Officer': 'read',
    Viewer: 'read',
  },
  'tenders.manageSources': { Administrator: 'full', 'Marketing Manager': 'full' },
  'tenders.manageProfiles': { Administrator: 'full', 'Marketing Manager': 'full' },
  'tenders.collect': { Administrator: 'full', 'Marketing Manager': 'full' },
  'tenders.verify': { Administrator: 'full', 'Marketing Manager': 'full' },
  'tenders.save': {
    Administrator: 'full',
    'Marketing Manager': 'full',
    'Marketing Analyst': 'full',
    'Field Officer': 'full',
    Viewer: 'full',
  },
  'tenders.aiEnrich': {
    Administrator: 'full',
    'Marketing Manager': 'full',
    'Marketing Analyst': 'full',
  },

  // AI Renewal (admin-only)
  'ai.renewal': { Administrator: 'full' },
};

const CAPABILITY_RESOLUTION: Record<Exclude<Capability, 'none'>, ResolvedCapability> = {
  full: { allowed: true, write: true, scope: 'all' },
  read: { allowed: true, write: false, scope: 'all' },
  'write-own': { allowed: true, write: true, scope: 'own' },
  'read-own': { allowed: true, write: false, scope: 'own' },
  region: { allowed: true, write: false, scope: 'region' },
};

/** All action keys defined in the matrix (useful for route registration checks). */
export const ACTION_KEYS = Object.keys(PERMISSIONS);

/** Raw matrix lookup - used by the admin permission viewer. */
export function capabilityMatrix(): Record<string, Partial<Record<Role, Capability>>> {
  return PERMISSIONS;
}

export function resolveCapability(action: string, role: Role): ResolvedCapability {
  const cap = PERMISSIONS[action]?.[role];
  if (!cap || cap === 'none') return { allowed: false, write: false, scope: 'all' };
  return CAPABILITY_RESOLUTION[cap];
}

// Convenience alias kept for symmetry with `ALL_ROLES` (used only by tooling).
void ALL_ROLES;
