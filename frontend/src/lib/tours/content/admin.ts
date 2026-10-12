import type { TourDefinition } from '../types';

const ADMIN_ROLES = ['Administrator'];

export const ADMIN_USERS_TOUR: TourDefinition = {
  id: 'admin-users',
  title: 'Administration centre',
  subtitle: 'Users, roles, notifications, schedules and audit',
  icon: 'gears',
  section: 'Administration',
  roles: ADMIN_ROLES,
  routes: ['/admin'],
  steps: [
    {
      selector: '.page-head',
      title: 'Administration',
      body: 'The control room: accounts, access mapping, notification rules, scheduled reports and the audit trail — all in five tabs.',
      placement: 'bottom',
    },
    {
      selector: '.tabs',
      title: 'Five tabs',
      body: 'Users & roles, Role mapping, Notifications, Schedules and Audit log. Each manages a different layer of the platform.',
      placement: 'bottom',
    },
    {
      selector: '.card-header .actions .btn-sm',
      title: 'Create users',
      body: 'New user opens the account form: name, email, role and region assignments. Deactivate instead of deleting to preserve history.',
      placement: 'bottom',
    },
    {
      selector: '.table-wrap',
      title: 'User table',
      body: 'Change a role inline with the dropdown, manage region badges, and activate/deactivate accounts from the row actions.',
      placement: 'top',
    },
    {
      selector: '.tabs button:nth-of-type(5)',
      title: 'Audit log',
      body: 'Every sensitive action is recorded — filter by user, action, entity or date, and export to Excel, CSV or PDF.',
      placement: 'bottom',
    },
    {
      selector: '.filters',
      title: 'Tab filters',
      body: 'Each tab has its own filter row (trigger, channel, cron, recipients…) with inline add — configuration without leaving the page.',
      placement: 'bottom',
    },
  ],
};

export const ADMIN_KPI_TOUR: TourDefinition = {
  id: 'admin-kpi',
  title: 'Planning & performance',
  subtitle: 'Plans, activities, KPI definitions and rankings',
  icon: 'chart-bar',
  section: 'Administration',
  roles: ADMIN_ROLES,
  routes: ['/admin/kpi'],
  steps: [
    {
      selector: '.kpi-hero',
      title: 'Performance overview',
      body: 'Active plans, completed activities, completion rate and officer counts for the selected period.',
      placement: 'bottom',
    },
    {
      selector: '.kpi-filters',
      title: 'Date controls',
      body: 'Every tab respects this From/To range; Refresh reloads the data, Reset returns to defaults.',
      placement: 'bottom',
    },
    {
      selector: '.tabs',
      title: 'Nine tabs',
      body: 'Dashboard, Plans, Activities, KPI Definitions, Measurement, Verification, Ranking, Results and a built-in User Guide.',
      placement: 'bottom',
    },
    {
      selector: '.tabs button:nth-of-type(2)',
      title: 'Plans tab',
      body: 'Create annual plans per business group with New Plan, then drill into the hierarchy of activities each officer owns.',
      placement: 'bottom',
    },
    {
      selector: '.tabs button:nth-of-type(3)',
      title: 'Activities tab',
      body: 'Define the measurable activities plans contain — targets, cadence and owners — via New Activity.',
      placement: 'bottom',
    },
    {
      selector: '.tabs button:nth-of-type(4)',
      title: 'KPI definitions',
      body: 'The KPI catalogue with weights, thresholds and import — the scoring rules behind every officer scorecard.',
      placement: 'bottom',
    },
    {
      selector: '.tabs button:nth-of-type(6)',
      title: 'Verification tab',
      body: 'Review officer-submitted measurements: verify with evidence attached, or reject with a reason for resubmission.',
      placement: 'bottom',
    },
    {
      selector: '.tabs button:nth-of-type(7)',
      title: 'Ranking tab',
      body: 'Leaderboard of officers with drill-down into monthly trends and recent activity for coaching.',
      placement: 'bottom',
    },
  ],
};

export const ADMIN_CUSTOMERS_TOUR: TourDefinition = {
  id: 'admin-customers',
  title: 'Customers',
  subtitle: 'Customer records and customer types',
  icon: 'users',
  section: 'Administration',
  roles: ADMIN_ROLES,
  routes: ['/admin/customers'],
  steps: [
    {
      selector: '.page-head',
      title: 'Customers',
      body: 'Retail and wholesale customer master data used by visits, sales and reports. Keep names and regions current.',
      placement: 'bottom',
    },
    {
      selector: '.page-head .actions .btn-primary',
      title: 'New customer',
      body: 'Add a customer with type, region and contact details. The Edit (pencil) icon on any row updates it later.',
      placement: 'bottom',
    },
    {
      selector: '.page-head .actions .btn-ghost',
      title: 'Manage types',
      body: 'Open the customer-type manager to add or rename types (e.g. Bar, Hotel, Supermarket) used across forms.',
      placement: 'bottom',
    },
    {
      selector: '.filters',
      title: 'Filters',
      body: 'Search by name, then narrow by type, region and status. Clear resets to the full list.',
      placement: 'bottom',
    },
    {
      selector: '.table-wrap',
      title: 'Customer table',
      body: 'Activate/deactivate rather than delete — historical records keep their customer reference for reporting.',
      placement: 'top',
    },
  ],
};

export const ADMIN_PRODUCTS_TOUR: TourDefinition = {
  id: 'admin-products',
  title: 'Products',
  subtitle: 'Product master data, pricing and specs',
  icon: 'box',
  section: 'Administration',
  roles: ADMIN_ROLES,
  routes: ['/admin/products'],
  steps: [
    {
      selector: '.page-head',
      title: 'Products',
      body: 'The product master behind sales, pricing comparison and reports. Consistent entries here keep every report accurate.',
      placement: 'bottom',
    },
    {
      selector: '.page-head .actions .btn-primary',
      title: 'Add product',
      body: 'Register a product with business group, colour, size/category and optional JSON specifications.',
      placement: 'bottom',
    },
    {
      selector: '.filters',
      title: 'Filters',
      body: 'Search by name plus business group, colour, size and category filters — clear to reset.',
      placement: 'bottom',
    },
    {
      selector: '.table-wrap',
      title: 'Row actions',
      body: 'The money icon opens per-type pricing, the eye shows specifications, the pencil edits and the trash deletes.',
      placement: 'top',
    },
    {
      selector: '.pagination',
      title: 'Large catalogues',
      body: 'Long product lists page automatically; filters are the fastest way to a specific SKU.',
      placement: 'top',
    },
  ],
};

export const ADMIN_CATALOGUE_TOUR: TourDefinition = {
  id: 'admin-catalogue',
  title: 'Product catalogue',
  subtitle: 'Catalogue entries with photos',
  icon: 'images',
  section: 'Administration',
  roles: ADMIN_ROLES,
  routes: ['/admin/product-catalogue'],
  steps: [
    {
      selector: '.page-head',
      title: 'Product catalogue',
      body: 'The visual catalogue — product entries with photos used in field apps and presentations.',
      placement: 'bottom',
    },
    {
      selector: '.page-head .actions .btn-primary',
      title: 'Add product',
      body: 'Create a catalogue entry, then use the camera icon on its row to upload a photo.',
      placement: 'bottom',
    },
    {
      selector: '.filters',
      title: 'Filters',
      body: 'Search and filter the catalogue the same way as the products master.',
      placement: 'bottom',
    },
    {
      selector: '.table-wrap',
      title: 'Row actions',
      body: 'Camera uploads or replaces the photo, eye previews, pencil edits, trash removes the entry.',
      placement: 'top',
    },
  ],
};

export const ADMIN_COMPETITORS_TOUR: TourDefinition = {
  id: 'admin-competitors',
  title: 'Competitors',
  subtitle: 'Competitor products, prices and bulk linking',
  icon: 'chess-knight',
  section: 'Administration',
  roles: ['Administrator', 'Marketing Manager'],
  routes: ['/admin/competitors'],
  steps: [
    {
      selector: '.page-head',
      title: 'Competitor products',
      body: 'The rival-product register that feeds competitor pricing, alerts and comparison reports.',
      placement: 'bottom',
    },
    {
      selector: '.page-head .actions .btn-primary',
      title: 'Add competitor product',
      body: 'Record a rival product with competitor, category and specs — inline add creates missing competitors as you type.',
      placement: 'bottom',
    },
    {
      selector: '.filters',
      title: 'Filters',
      body: 'Search by product or competitor, then narrow by category and status.',
      placement: 'bottom',
    },
    {
      selector: '.table-wrap',
      title: 'Selection and bulk link',
      body: 'Tick rows to select them, then use the bulk-link bar to connect several competitor products to your own product at once.',
      placement: 'top',
    },
    {
      selector: '.pagination',
      title: 'History',
      body: 'Price-linked entries page automatically as the register grows.',
      placement: 'top',
    },
  ],
};

export const ADMIN_BUSINESS_GROUPS_TOUR: TourDefinition = {
  id: 'admin-business-groups',
  title: 'Business groups',
  subtitle: 'Organisational units for reporting',
  icon: 'building',
  section: 'Administration',
  roles: ADMIN_ROLES,
  routes: ['/admin/business-groups'],
  steps: [
    {
      selector: '.page-head',
      title: 'Business groups',
      body: 'The reporting units (e.g. brands/divisions) that segment visits, sales, KPIs and charts across KG-MIS.',
      placement: 'bottom',
    },
    {
      selector: '.page-head .actions .btn-primary',
      title: 'New business group',
      body: 'Add a group with code, name and description. Codes must be unique — they appear in exports.',
      placement: 'bottom',
    },
    {
      selector: '.table-wrap',
      title: 'Groups table',
      body: 'Edit with the pencil, remove with the trash — but only when no records reference the group.',
      placement: 'top',
    },
  ],
};

export const ADMIN_REGIONS_TOUR: TourDefinition = {
  id: 'admin-regions',
  title: 'Regions & outlets',
  subtitle: 'Territory hierarchy for field teams',
  icon: 'map-location-dot',
  section: 'Administration',
  roles: ADMIN_ROLES,
  routes: ['/admin/regions'],
  steps: [
    {
      selector: '.page-head',
      title: 'Regions & outlets',
      body: 'Two connected cards: regions define territories, outlets are the physical points inside them.',
      placement: 'bottom',
    },
    {
      selector: '.card-header .actions .btn-sm',
      title: 'New region / outlet',
      body: 'Each card header has its own add button. An outlet always belongs to a region — create regions first.',
      placement: 'bottom',
    },
    {
      selector: '.table-wrap',
      title: 'Both tables',
      body: 'Manage rows with the pencil and trash icons. Regions feed every filter and report dropdown in the app.',
      placement: 'top',
    },
    {
      selector: '.pagination',
      title: 'Large networks',
      body: 'Outlet lists page automatically — use region assignment to organise coverage.',
      placement: 'top',
    },
  ],
};

export const ADMIN_RELATIONSHIPS_TOUR: TourDefinition = {
  id: 'admin-relationships',
  title: 'Relationship configuration',
  subtitle: 'Link parent and child entities',
  icon: 'diagram-project',
  section: 'Administration',
  roles: ADMIN_ROLES,
  routes: ['/admin/relationship-configuration'],
  steps: [
    {
      selector: '[data-tour="rel-list"]',
      title: 'Existing relationships',
      body: 'All configured parent→child entity links with their type. Edit or delete a row with its buttons.',
      placement: 'bottom',
    },
    {
      selector: '[data-tour="rel-form"]',
      title: 'Create a relationship',
      body: 'Pick the parent entity, child entity and relationship type, mark it required if the link is mandatory, then add it.',
      placement: 'top',
    },
    {
      selector: 'h1',
      title: 'Used by dynamic views',
      body: 'Relationships drive dependent dropdowns and hierarchy views across modules — change them carefully.',
      placement: 'bottom',
    },
  ],
};
