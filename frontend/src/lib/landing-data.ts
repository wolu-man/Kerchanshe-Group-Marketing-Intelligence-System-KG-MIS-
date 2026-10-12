// Centralized data for the KG-MIS landing and features pages.
export type Accent = 'blue' | 'green' | 'bronze' | 'purple' | 'orange' | 'teal' | 'rose' | 'cyan';

export interface Feature {
  title: string;
  desc: string;
}

export interface Module {
  id: string;
  title: string;
  icon: string;
  features: Feature[];
}

export interface Pillar {
  id: string;
  title: string;
  desc: string;
  icon: string;
  accent: Accent;
  tags: string[];
  modules: Module[];
}

export interface Role {
  id: string;
  name: string;
  short: string;
  tagline: string;
  accent: Accent;
  icon: string;
  capabilities: string[];
  matrix: Record<string, 'full' | 'partial' | 'none'>;
}

export interface TrustStat {
  label: string;
  value: number;
  suffix: string;
}

export interface CompareRow {
  dimension: string;
  kgmis: string;
  kgmisCell: 'check' | 'text';
  bi: string;
  biCell: 'check' | 'partial' | 'cross' | 'text';
  sheets: string;
  sheetsCell: 'check' | 'partial' | 'cross' | 'text';
}

/* -------------------------------------------------------------------------- */
/* Pillars                                                                     */
/* -------------------------------------------------------------------------- */
export const PILLARS: Pillar[] = [
  {
    id: 'kpi',
    title: 'KPI & Performance',
    desc: 'A 9-tab command center with an annual measurement workbook — plan, measure, verify, and rank officer performance.',
    icon: 'fa-solid fa-bullseye',
    accent: 'blue',
    tags: ['9 Tabs', 'Measurement Workbook', 'Officer Ranking'],
    modules: [
      {
        id: 'kpi-dashboard',
        title: 'Performance Dashboard',
        icon: 'fa-solid fa-gauge-high',
        features: [
          { title: 'Score Ring & Charts', desc: 'Visual gauges showing overall achievement with color-coded score bands.' },
          { title: 'Officer Leaderboard', desc: 'Live ranking of all officers by weighted score and average achievement.' },
          { title: 'Trend Analysis', desc: 'Monthly KPI trend lines to spot momentum and gaps early.' },
        ],
      },
      {
        id: 'kpi-plans',
        title: 'Plans & Activities',
        icon: 'fa-solid fa-list-check',
        features: [
          { title: 'Plan CRUD', desc: 'Create annual, quarterly, or monthly plans per officer with status tracking.' },
          { title: 'Activity Builder', desc: 'Define planned activities with priorities, frequencies, and due dates.' },
          { title: 'Plan Notifications', desc: 'Automatic notifications to assigned officers when a plan is created.' },
        ],
      },
      {
        id: 'kpi-measurement',
        title: 'Measurement Workbook',
        icon: 'fa-solid fa-table-cells',
        features: [
          { title: 'Import Annual Workbook', desc: 'Import the MIS-compatible annual workbook — 49 KPI definitions with 588 pre-seeded monthly planned rows for 2026.' },
          { title: 'Monthly Entry', desc: 'Actual-only monthly measurement entry — planned, target, and achievement computed automatically.' },
          { title: 'Strategic Metadata', desc: 'Strategic objective, business unit, KPI owner, data source, collection method, and alert thresholds per KPI.' },
        ],
      },
      {
        id: 'kpi-verification',
        title: 'Verification Workflow',
        icon: 'fa-solid fa-clipboard-check',
        features: [
          { title: 'Evidence Required', desc: 'Toggle evidence requirements and assign a verification role per KPI.' },
          { title: 'Verification Status', desc: 'Track submitted, verified, and rejected measurements with reviewer attribution.' },
          { title: 'Audit Trail', desc: 'Every measurement change is audited with user, timestamp, and IP address.' },
        ],
      },
      {
        id: 'kpi-definitions',
        title: 'KPI Definitions',
        icon: 'fa-solid fa-sliders',
        features: [
          { title: 'Custom KPIs', desc: 'Define KPIs with categories, weights, targets, units of measure, and dashboard groups.' },
          { title: 'Annual Targets', desc: 'Text and numeric annual targets with source references (workbook kpi_id).' },
          { title: 'Weighted Scoring', desc: 'Weighted score aggregation across all KPIs per officer.' },
        ],
      },
      {
        id: 'kpi-ranking',
        title: 'Ranking & Results',
        icon: 'fa-solid fa-trophy',
        features: [
          { title: 'Officer Ranking', desc: 'Automatic ranking by weighted score with Excellent/Good/Average/Needs Attention ratings.' },
          { title: 'KPI-by-KPI Breakdown', desc: 'Per-KPI achievement across all officers with charts.' },
          { title: 'Export Results', desc: 'Download KPI results as professional Excel reports.' },
        ],
      },
      {
        id: 'kpi-officer',
        title: 'Officer Self-Performance',
        icon: 'fa-solid fa-user-check',
        features: [
          { title: 'My Performance', desc: 'Personal score ring, breakdown bars, and achievement history.' },
          { title: 'My Plans', desc: 'View assigned plans with status quick-toggle and activity tracking.' },
          { title: 'Activity Log', desc: 'Chronological log of all KPI-related activities and submissions.' },
        ],
      },
    ],
  },
  {
    id: 'tenders',
    title: 'Tender & Opportunity Intelligence',
    desc: 'Discover tenders, RFQs, buyer leads, and trade signals from automated sources — with AI enrichment and a full pursuit pipeline.',
    icon: 'fa-solid fa-file-contract',
    accent: 'rose',
    tags: ['5 Opportunity Types', 'AI Enrichment', 'Auto Collection'],
    modules: [
      {
        id: 'tender-explorer',
        title: 'Opportunity Explorer',
        icon: 'fa-solid fa-magnifying-glass',
        features: [
          { title: 'Dashboard & Filters', desc: 'Stat cards plus filters for country, sector, verification, relevance score, and saved status.' },
          { title: '5 Opportunity Types', desc: 'Tenders, RFQs, Buyer Leads, Trade Intelligence, and Market Signals in one unified explorer.' },
          { title: 'Dedicated Views', desc: 'Preset pages for RFQs, Buyer Leads, Export Opportunities, Trade Intelligence, Saved, and My Opportunities.' },
        ],
      },
      {
        id: 'tender-pipeline',
        title: 'Pursuit Pipeline',
        icon: 'fa-solid fa-filter-circle-dollar',
        features: [
          { title: '7-Stage Tracking', desc: 'New → Reviewing → Interested → Applied → Won / Lost / Archived pipeline per opportunity.' },
          { title: 'Save & Bookmark', desc: 'One-click save with status — everything you bookmark appears in Saved Opportunities.' },
          { title: 'Verification Workflow', desc: 'Verify or unverify opportunities to build a trusted shortlist.' },
        ],
      },
      {
        id: 'tender-sources',
        title: 'Automated Data Sources',
        icon: 'fa-solid fa-satellite-dish',
        features: [
          { title: '4 Source Adapters', desc: 'API, RSS, and scraping adapters powering Ethiopian e-GP, 2Merkato, TenderInfo, and TenderMetro feeds.' },
          { title: 'Test & Collect', desc: 'Live-test any source, collect now, or collect all — with per-source status, errors, and totals.' },
          { title: 'Scheduled Collection', desc: 'Cron-driven collection every 6 hours with deadline reminders at 09:00 daily.' },
        ],
      },
      {
        id: 'tender-relevance',
        title: 'Interest Profiles & Relevance',
        icon: 'fa-solid fa-bullseye',
        features: [
          { title: 'Relevance Scoring', desc: '0–100 RelevanceScore from sectors, keywords, countries, organizations, product groups, and budget range.' },
          { title: 'Product Group Taxonomy', desc: 'Configurable ProductGroup classification with JSON keyword matching — add a row, classification picks it up.' },
          { title: 'Quality & Confidence', desc: 'Field-presence confidence scoring (0–100) and DataQuality grades on every opportunity.' },
        ],
      },
      {
        id: 'tender-ai',
        title: 'AI Enrichment & Assistant',
        icon: 'fa-solid fa-wand-magic-sparkles',
        features: [
          { title: 'AI Enrichment', desc: 'One-click or per-source auto AI enrichment: summaries, structured extraction, and gap-fill suggestions.' },
          { title: 'AI Assistant', desc: 'Ask questions about tenders, sources, and saved items — every answer cites the data it was drawn from.' },
          { title: 'Gap Closure', desc: 'AI GapFill proposes missing field basis, business fit, and classification suggestions.' },
        ],
      },
      {
        id: 'tender-import',
        title: 'Import & Export',
        icon: 'fa-solid fa-file-import',
        features: [
          { title: 'Excel/CSV Import', desc: 'Column auto-mapping, row-level validation (valid/invalid/duplicate), staged parse → commit workflow.' },
          { title: 'Downloadable Template', desc: 'One-click template download plus full import history with status per run.' },
          { title: 'Manual Creation', desc: 'Create tenders manually with tender number, source reference, and full metadata.' },
        ],
      },
    ],
  },
  {
    id: 'ai',
    title: 'AI & Predictive Intelligence',
    desc: 'Deterministic forecasting across 11 modules, anomaly detection, and a multi-provider AI engine embedded throughout the platform.',
    icon: 'fa-solid fa-brain',
    accent: 'purple',
    tags: ['11 Forecast Modules', 'Multi-Provider', 'Anomaly Detection'],
    modules: [
      {
        id: 'predictive-forecast',
        title: 'Predictive Forecasting',
        icon: 'fa-solid fa-chart-line',
        features: [
          { title: '11 Forecast Modules', desc: 'Sales, weekly sales, KPI achievement, competitor price, pricing gaps, product demand, customer growth, surveys, interviews, visits, and multimedia.' },
          { title: 'Confidence Grading', desc: 'High / Moderate / Low / Insufficient confidence with stated reasons — never fake certainty.' },
          { title: 'Prediction Intervals', desc: 'Lower/upper bands on every forecast point from walk-forward backtesting with classic statistical models.' },
        ],
      },
      {
        id: 'predictive-anomaly',
        title: 'Anomaly & Risk Detection',
        icon: 'fa-solid fa-triangle-exclamation',
        features: [
          { title: 'MAD / Z-Score Detection', desc: 'Statistical anomaly detection on every series — flags spikes and drops automatically.' },
          { title: 'Risk & Opportunity Signals', desc: 'Directional signals highlight where to act: rising demand, widening gaps, slipping KPIs.' },
          { title: 'Dashboard Tiles', desc: 'Predictive insight cards on the main dashboard with anomaly counts and risk flags.' },
        ],
      },
      {
        id: 'ai-engine',
        title: 'Multi-Provider AI Engine',
        icon: 'fa-solid fa-microchip',
        features: [
          { title: '3 Providers', desc: 'Ollama (local), Gemini, and Groq with automatic failover routing by intent.' },
          { title: 'Global AI Launcher', desc: 'AI assistant on every page with automatic page-context awareness.' },
          { title: 'Conversation Audit', desc: 'Every AI call logged with provider, model, duration, and success status.' },
        ],
      },
      {
        id: 'ai-surfaces',
        title: 'AI Surfaces',
        icon: 'fa-solid fa-wand-magic-sparkles',
        features: [
          { title: 'Ask AI (Data Queries)', desc: 'Natural-language queries against form and operational data — now a dedicated Reports tab.' },
          { title: 'AI Writing Assistant', desc: 'Writing help for form content, reports, and analysis — including anonymous public access for form fills.' },
          { title: 'AI Analysis Panels', desc: 'Sentiment, trend, and content analysis panels embedded in workflows across the app.' },
        ],
      },
    ],
  },
  {
    id: 'competitor',
    title: 'Competitor Intelligence',
    desc: 'Track competitor pricing, products, and market movements with threshold-based gap alerts, color-level comparison, and product specs.',
    icon: 'fa-solid fa-magnifying-glass-chart',
    accent: 'green',
    tags: ['Gap Alerts', 'Color Dimension', 'Product Specs'],
    modules: [
      {
        id: 'gap-alerts',
        title: 'Price Gap Alerts',
        icon: 'fa-solid fa-triangle-exclamation',
        features: [
          { title: 'Auto-Generated Alerts', desc: 'System detects when competitor price gaps exceed configured thresholds.' },
          { title: 'Resolve / Dismiss Workflow', desc: 'Mark alerts as resolved or dismissed with full audit trail.' },
          { title: 'Health Signals', desc: 'Daily cron job evaluates price-gap health and raises signals for attention.' },
        ],
      },
      {
        id: 'thresholds',
        title: 'Configurable Thresholds',
        icon: 'fa-solid fa-sliders',
        features: [
          { title: 'Per-Category Thresholds', desc: 'Set different gap thresholds per product category.' },
          { title: 'Admin Configuration', desc: 'Administrator-only threshold management with CRUD.' },
          { title: 'Real-Time Evaluation', desc: 'New competitor prices are evaluated against thresholds immediately.' },
        ],
      },
      {
        id: 'catalogue',
        title: 'Competitor Master Catalogue',
        icon: 'fa-solid fa-building',
        features: [
          { title: 'Competitor Profiles', desc: 'Maintain competitor directory with regions, products, and notes.' },
          { title: 'Product Linking', desc: 'Link competitor products to ours with categories — direct product-to-product mapping.' },
          { title: 'Availability Tracking', desc: 'Record competitor availability, promotions, and quality observations.' },
        ],
      },
      {
        id: 'comparison',
        title: 'Price Comparison',
        icon: 'fa-solid fa-scale-balanced',
        features: [
          { title: 'Color-Level Comparison', desc: 'Compare prices per product color with a dedicated Colors column in the comparison table.' },
          { title: 'Gap Percentage', desc: 'Automatic gap percentage calculation with color coding.' },
          { title: 'Regional Breakdown', desc: 'Compare prices across regions and outlets.' },
        ],
      },
    ],
  },
  {
    id: 'field',
    title: 'Field Intelligence',
    desc: 'Digitize field operations: market visits with shop counts, interviews, weekly sales with color snapshots, and multimedia capture.',
    icon: 'fa-solid fa-location-dot',
    accent: 'bronze',
    tags: ['Shops Visited', 'Color Snapshots', 'Approve/Reject'],
    modules: [
      {
        id: 'visits',
        title: 'Market Visits',
        icon: 'fa-solid fa-map-location-dot',
        features: [
          { title: 'Full CRUD + Approve/Reject', desc: 'Create, review, approve, or reject visits with rejection reasons.' },
          { title: 'Shops Visited Metric', desc: 'Track number of shops visited per trip — surfaced on dashboard, reports, and officer performance.' },
          { title: 'Photo & Video Upload', desc: 'Attach multimedia evidence directly to each visit report.' },
          { title: 'Stock & Competitor Observations', desc: 'Record stock levels, competitor presence, and key findings.' },
        ],
      },
      {
        id: 'interviews',
        title: 'Customer Interviews',
        icon: 'fa-solid fa-comments',
        features: [
          { title: 'Q&A Pairs', desc: 'Custom question-answer pairs alongside satisfaction scoring.' },
          { title: 'Auto-Sentiment', desc: 'Sentiment (Positive/Neutral/Negative) derived from satisfaction score.' },
          { title: 'Geolocation Capture', desc: 'Automatic GPS coordinates for each interview.' },
          { title: 'Photo/Video Evidence', desc: 'Attach multimedia directly from the interview form.' },
        ],
      },
      {
        id: 'weekly-sales',
        title: 'Weekly Sales',
        icon: 'fa-solid fa-cash-register',
        features: [
          { title: 'Per-Line Color Selection', desc: 'Select the exact product color per sales line, constrained to the product palette.' },
          { title: 'Attribute Snapshots', desc: 'Color, size, category, and specs snapshotted at entry time for historical accuracy.' },
          { title: 'Auto-Price Population', desc: 'Unit price auto-fills based on product and customer type tier.' },
          { title: '6-Filter Search', desc: 'Filter by date, region, product, business group, status, and customer type.' },
        ],
      },
      {
        id: 'multimedia',
        title: 'Multimedia Hub',
        icon: 'fa-solid fa-photo-film',
        features: [
          { title: 'Photo / Video / Audio', desc: 'Upload any media type with automatic type detection.' },
          { title: 'Geotagging', desc: 'Capture latitude and longitude for each asset.' },
          { title: 'Validation Workflow', desc: 'Pending / Validated / Rejected status for media quality control.' },
          { title: 'Module Linking', desc: 'Link media to specific visits, interviews, or other records.' },
        ],
      },
    ],
  },
  {
    id: 'forms',
    title: 'Forms & Surveys',
    desc: 'NexForm dynamic builder with cross-form reports, anomaly detection, report sharing, save & resume, and full GDPR consent versioning.',
    icon: 'fa-solid fa-clipboard-list',
    accent: 'orange',
    tags: ['Cross-Form Reports', 'Anomaly Detection', 'Report Sharing'],
    modules: [
      {
        id: 'builder',
        title: 'Dynamic Form Builder',
        icon: 'fa-solid fa-pen-ruler',
        features: [
          { title: 'Drag & Drop Canvas', desc: 'Visual builder with rulers, grid snapping, alignment guides, and a new toolbar with device preview.' },
          { title: 'Multi-Page Forms', desc: 'Organize fields into pages with navigation and progress indicators.' },
          { title: 'Calculated & Matrix Fields', desc: 'Computed fields, display conditions, and matrix question types.' },
          { title: 'Conditional Logic', desc: 'Show/hide fields based on answers with branching rules.' },
        ],
      },
      {
        id: 'access',
        title: 'Access & Sharing',
        icon: 'fa-solid fa-key',
        features: [
          { title: '5 Access Modes', desc: 'Public, Domain, Invite, Group, and Password protection.' },
          { title: 'Report Share Links', desc: 'Public read-only share links for form reports — anyone with the token sees the data.' },
          { title: 'Invite Management', desc: 'Email invitations with tracking and revocation.' },
          { title: 'Response Limits', desc: 'Set maximum responses and expiration dates with automatic reminders.' },
        ],
      },
      {
        id: 'depth',
        title: 'Response Intelligence',
        icon: 'fa-solid fa-magnifying-glass-chart',
        features: [
          { title: 'Anomaly Detection', desc: 'Automatic anomaly flags on responses with recompute — visible in the Responses Anomalies tab.' },
          { title: 'Response Editing & Revisions', desc: 'Edit responses with full revision history and scoring.' },
          { title: 'Cross-Form Reports', desc: 'Combine data across parent and child forms with shared report mappings.' },
          { title: 'Parent/Child Forms', desc: 'Link child forms to a parent with propagation of settings.' },
        ],
      },
      {
        id: 'gdpr',
        title: 'GDPR & Compliance',
        icon: 'fa-solid fa-shield-halved',
        features: [
          { title: 'Consent Versioning', desc: 'Versioned consent text with full change history.' },
          { title: 'Data Erasure', desc: 'Right-to-be-forgotten with response erasure workflow.' },
          { title: 'Save & Resume', desc: 'Draft saving, resume links, and automatic draft purge via cron.' },
          { title: 'Audit Retention', desc: 'Configurable audit retention with nightly purge job.' },
        ],
      },
      {
        id: 'branding',
        title: 'Branding & Appearance',
        icon: 'fa-solid fa-palette',
        features: [
          { title: 'Logo & Colors', desc: 'Custom logo, primary/secondary colors, fonts, and white-label branding.' },
          { title: 'Per-Field Styling', desc: 'Font, color, size, position, and border customization per field.' },
          { title: 'Watermark & Header', desc: 'Image or text watermark, custom header banner, and body backgrounds.' },
          { title: 'Thank You Screen', desc: 'Configurable post-submission message with redirect.' },
        ],
      },
    ],
  },
  {
    id: 'reports',
    title: 'Reports & Analytics Hub',
    desc: '14 report tabs including a dedicated Ask AI tab, color-dimension analytics, and Power BI integration.',
    icon: 'fa-solid fa-chart-column',
    accent: 'teal',
    tags: ['14 Reports', 'Ask AI Tab', 'Color Analytics'],
    modules: [
      {
        id: 'report-types',
        title: '14 Report Types',
        icon: 'fa-solid fa-table-list',
        features: [
          { title: 'Core Reports', desc: 'Sales, Customers, Products, Market Visits, Weekly Sales, Interviews, and Forms.' },
          { title: 'Intelligence Reports', desc: 'Ask AI, Price Comparison, Competitor Intel, KPI Performance, Availability, and Power BI.' },
          { title: 'AI Insights', desc: 'Auto-generated observations and alerts from cross-module data patterns.' },
        ],
      },
      {
        id: 'color-analytics',
        title: 'Color-Dimension Analytics',
        icon: 'fa-solid fa-palette',
        features: [
          { title: 'By-Color Charts', desc: 'New "By color" bar chart on the Sales report tab.' },
          { title: 'Color Filters', desc: 'Color filter on Sales, Price Comparison, and Availability report tabs.' },
          { title: 'Shops Visited Analytics', desc: 'Shops-visited KPI and by-region chart on the Market Visits report.' },
        ],
      },
      {
        id: 'exports',
        title: 'Professional Exports',
        icon: 'fa-solid fa-file-export',
        features: [
          { title: 'Excel Export', desc: '8 export types with formatted headers and data.' },
          { title: 'Audit Log Export', desc: 'Branded Excel/PDF/CSV with logo, title, and metadata banner.' },
          { title: 'One-Click Download', desc: 'Authenticated blob downloads — no token issues.' },
        ],
      },
    ],
  },
  {
    id: 'admin',
    title: 'Administration & Governance',
    desc: 'Complete admin suite with cron scheduler, user management, audit logging with retention, notifications, and master data.',
    icon: 'fa-solid fa-gears',
    accent: 'cyan',
    tags: ['Cron Scheduler', 'Audit Retention', '5 Roles'],
    modules: [
      {
        id: 'user-mgmt',
        title: 'User & Role Management',
        icon: 'fa-solid fa-users-gear',
        features: [
          { title: 'Full User CRUD', desc: 'Create, edit, activate/deactivate users with role assignment.' },
          { title: '5 Roles', desc: 'Administrator, Marketing Manager, Marketing Analyst, Field Officer, Viewer.' },
          { title: 'Region Scoping', desc: 'Assign users to regions for data visibility control.' },
          { title: 'Deactivation', desc: 'Deactivated users are blocked at authentication and profile level.' },
        ],
      },
      {
        id: 'audit',
        title: 'Audit Logging',
        icon: 'fa-solid fa-clipboard-check',
        features: [
          { title: 'IP Address Capture', desc: 'Every action recorded with source IP and location.' },
          { title: 'Retention Purge', desc: 'Nightly cron job purges audit logs beyond the configured retention window.' },
          { title: 'Professional Export', desc: 'Branded Excel/PDF with logo, title, metadata banner, and page numbers.' },
        ],
      },
      {
        id: 'scheduler',
        title: 'Cron Scheduler',
        icon: 'fa-solid fa-clock-rotate-left',
        features: [
          { title: '7+ Automated Jobs', desc: 'D365FO sync, GDPR erasure purge, price-gap health, audit retention, predictive refresh, form anomaly re-scan, and tender collection.' },
          { title: 'Deadline Reminders', desc: 'Daily tender deadline reminders and form expiry notifications at 09:00.' },
          { title: 'Nightly Refresh', desc: 'Predictive insights refresh at 04:15 and anomaly re-scan at 04:30 automatically.' },
        ],
      },
      {
        id: 'notifications',
        title: 'Notification Engine',
        icon: 'fa-solid fa-bell',
        features: [
          { title: '4 Channels', desc: 'Email, SMS, WhatsApp, and In-app notifications.' },
          { title: 'Template System', desc: '27+ event-driven templates including tender deadline and new-match alerts.' },
          { title: 'Role-Based Config', desc: 'Configure which roles receive which notifications per event.' },
          { title: 'Retry & Status', desc: 'Automatic retry with Sent/Failed/Pending status tracking.' },
        ],
      },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Roles                                                                       */
/* -------------------------------------------------------------------------- */
export const ROLES: Role[] = [
  {
    id: 'field-officer',
    name: 'Field Officer',
    short: 'FO',
    tagline: 'Capture intelligence from the field',
    accent: 'blue',
    icon: 'fa-solid fa-person-hiking',
    capabilities: ['Log market visits with shop counts', 'Conduct interviews with Q&A', 'Submit weekly sales with colors', 'Save & track opportunities', 'Respond to forms', 'View my performance'],
    matrix: {
      kpi: 'partial', tenders: 'partial', ai: 'none', competitor: 'none', field: 'full', forms: 'partial', reports: 'partial', admin: 'none',
    },
  },
  {
    id: 'marketing-manager',
    name: 'Marketing Manager',
    short: 'MM',
    tagline: 'Approve, plan, and pursue',
    accent: 'green',
    icon: 'fa-solid fa-user-tie',
    capabilities: ['Approve/reject visits & interviews', 'Manage tender sources & profiles', 'Create KPI plans & activities', 'Verify & enrich opportunities', 'Configure notifications', 'View all reports'],
    matrix: {
      kpi: 'full', tenders: 'full', ai: 'partial', competitor: 'full', field: 'full', forms: 'partial', reports: 'full', admin: 'partial',
    },
  },
  {
    id: 'marketing-analyst',
    name: 'Marketing Analyst',
    short: 'MA',
    tagline: 'Analyze, forecast, and report',
    accent: 'purple',
    icon: 'fa-solid fa-chart-line',
    capabilities: ['Access all 14 reports + Ask AI', 'Run AI enrichment on tenders', 'Build & publish forms', 'Query predictive forecasts', 'Define KPI definitions', 'Export professional reports'],
    matrix: {
      kpi: 'full', tenders: 'full', ai: 'full', competitor: 'full', field: 'partial', forms: 'full', reports: 'full', admin: 'partial',
    },
  },
  {
    id: 'administrator',
    name: 'Administrator',
    short: 'AD',
    tagline: 'Govern, configure, and secure',
    accent: 'orange',
    icon: 'fa-solid fa-user-shield',
    capabilities: ['Full user & role CRUD', 'Cron scheduler & retention', 'Audit log & exports', 'Import workbook KPIs', 'Tender source configuration', 'System configuration'],
    matrix: {
      kpi: 'full', tenders: 'full', ai: 'full', competitor: 'full', field: 'full', forms: 'full', reports: 'full', admin: 'full',
    },
  },
  {
    id: 'viewer',
    name: 'Viewer',
    short: 'VW',
    tagline: 'Consume dashboards and exports',
    accent: 'cyan',
    icon: 'fa-solid fa-eye',
    capabilities: ['View dashboards & forecasts', 'Read reports', 'Browse opportunities', 'Save opportunities', 'Download exports', 'No edit access'],
    matrix: {
      kpi: 'partial', tenders: 'partial', ai: 'partial', competitor: 'partial', field: 'none', forms: 'none', reports: 'partial', admin: 'none',
    },
  },
];

/* -------------------------------------------------------------------------- */
/* Trust Stats                                                                 */
/* -------------------------------------------------------------------------- */
export const TRUST_STATS: TrustStat[] = [
  { label: 'Customers Loaded', value: 153, suffix: '+' },
  { label: 'Products Catalogued', value: 71, suffix: '+' },
  { label: 'KPIs in Workbook', value: 49, suffix: '' },
  { label: 'Report Types', value: 14, suffix: '' },
  { label: 'Forecast Modules', value: 11, suffix: '' },
  { label: 'User Roles', value: 5, suffix: '' },
];

/* -------------------------------------------------------------------------- */
/* Comparison Table                                                            */
/* -------------------------------------------------------------------------- */
export const COMPARISON: CompareRow[] = [
  { dimension: 'Field Data Capture', kgmis: 'Native (Visits, Interviews, Forms)', kgmisCell: 'check', bi: 'Requires custom app', biCell: 'cross', sheets: 'Manual entry', sheetsCell: 'cross' },
  { dimension: 'Role-Based Access', kgmis: '5 roles, region scoping', kgmisCell: 'check', bi: 'Workspace-level only', biCell: 'partial', sheets: 'No access control', sheetsCell: 'cross' },
  { dimension: 'Competitor Gap Alerts', kgmis: 'Threshold-based, automatic', kgmisCell: 'check', bi: 'Manual DAX formulas', biCell: 'partial', sheets: 'None', sheetsCell: 'cross' },
  { dimension: 'KPI Planning & Measurement', kgmis: 'Workbook import, 9-tab workflow', kgmisCell: 'check', bi: 'Separate tool required', biCell: 'cross', sheets: 'Spreadsheet tracking', sheetsCell: 'partial' },
  { dimension: 'Predictive Forecasting', kgmis: '11 modules, backtested confidence', kgmisCell: 'check', bi: 'Requires premium add-ons', biCell: 'partial', sheets: 'None', sheetsCell: 'cross' },
  { dimension: 'Tender & Opportunity Sourcing', kgmis: 'Automated sources, AI enrichment', kgmisCell: 'check', bi: 'Not included', biCell: 'cross', sheets: 'Manual monitoring', sheetsCell: 'cross' },
  { dimension: 'Forms & Surveys Builder', kgmis: 'NexForm: cross-reports, anomalies, sharing', kgmisCell: 'check', bi: 'Not included', biCell: 'cross', sheets: 'Basic manual forms', sheetsCell: 'partial' },
  { dimension: 'Audit Trail + Retention', kgmis: 'IP capture, nightly retention purge', kgmisCell: 'check', bi: 'Limited activity log', biCell: 'partial', sheets: 'None', sheetsCell: 'cross' },
  { dimension: 'Scheduled Jobs', kgmis: '7+ cron jobs (sync, purge, refresh)', kgmisCell: 'check', bi: 'Premium refresh schedules', biCell: 'partial', sheets: 'None', sheetsCell: 'cross' },
  { dimension: 'Total Cost of Ownership', kgmis: 'Low (self-hosted)', kgmisCell: 'text', bi: 'High (per-user licenses)', biCell: 'text', sheets: 'Hidden (time cost)', sheetsCell: 'text' },
];

/* -------------------------------------------------------------------------- */
/* Technical Specs                                                             */
/* -------------------------------------------------------------------------- */
export const TECH_SPECS = [
  {
    icon: 'fa-solid fa-server',
    title: 'Backend',
    desc: 'Node.js + Express + SQL Server with connection pooling, request timeouts, 30-second auth caching, and 47 idempotent migrations.',
  },
  {
    icon: 'fa-solid fa-desktop',
    title: 'Frontend',
    desc: 'Next.js 14 App Router with server components, standalone output, and plain CSS design system — no framework lock-in.',
  },
  {
    icon: 'fa-solid fa-lock',
    title: 'Security',
    desc: 'JWT authentication, role-based access (5 roles), IP-address audit logging, nightly retention purge, and GDPR consent versioning.',
  },
  {
    icon: 'fa-solid fa-microchip',
    title: 'AI Engine',
    desc: 'Multi-provider orchestration (Ollama, Gemini, Groq) with intent-based routing, conversation auditing, and deterministic forecasting — no LLM in the prediction path.',
  },
  {
    icon: 'fa-solid fa-clock-rotate-left',
    title: 'Scheduler',
    desc: 'node-cron job registry: D365FO sync, GDPR erasure, price-gap health, audit retention, predictive refresh, anomaly re-scan, form reminders, and tender collection.',
  },
  {
    icon: 'fa-solid fa-satellite-dish',
    title: 'Data Sources',
    desc: 'Ethiopian e-GP public sourcing API, 2Merkato, TenderInfo, TenderMetro, RSS, and scraping adapters with live-test and scheduled collection.',
  },
];

/* -------------------------------------------------------------------------- */
/* Visual Tour screenshots                                                     */
/* -------------------------------------------------------------------------- */
export interface Screenshot {
  id: string;
  label: string;
  /** Path under /public — omit to fall back to the SVG mockup */
  src?: string;
}

export const SCREENSHOTS: Screenshot[] = [
  { id: 'dashboard', label: 'Dashboard — KPIs, forecasts & alerts', src: '/visual-tour/dashboard.png' },
  { id: 'tenders', label: 'Opportunity Explorer — 5 types, filters', src: '/visual-tour/opportunity-explorer.png' },
  { id: 'kpi', label: 'KPI Workbook — measurement & verification', src: '/visual-tour/kpi-workbook.png' },
  { id: 'reports', label: 'Reports Hub — 14 tabs with Ask AI', src: '/visual-tour/reports-hub.png' },
  { id: 'predictive', label: 'Predictive Insights — 11 forecast modules', src: '/visual-tour/predictive-insights.png' },
  { id: 'forms', label: 'NexForm Builder — cross-reports & anomalies', src: '/visual-tour/nexform-builder.png' },
  { id: 'sources', label: 'Data Sources — test, collect & monitor', src: '/visual-tour/data-sources.png' },
];
