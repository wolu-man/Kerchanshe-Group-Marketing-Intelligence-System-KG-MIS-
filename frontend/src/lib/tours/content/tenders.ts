import type { TourDefinition, TourRole } from '../types';

const TENDER_ROLES: TourRole[] = ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Field Officer', 'Viewer'];
const MANAGER_ROLES: TourRole[] = ['Administrator', 'Marketing Manager'];

export const TENDERS_TOUR: TourDefinition = {
  id: 'tenders',
  title: 'Opportunities explorer',
  subtitle: 'Tenders, leads, RFQs and trade intelligence',
  icon: 'briefcase',
  section: 'Opportunities',
  roles: TENDER_ROLES,
  routes: [
    '/tenders',
    '/tenders/buyer-leads',
    '/tenders/rfqs',
    '/tenders/export',
    '/tenders/trade',
    '/tenders/saved',
    '/tenders/my-opportunities',
  ],
  steps: [
    {
      selector: '.page-head',
      title: 'Opportunities',
      body: 'The explorer unifies tenders, buyer leads, RFQs, export and trade intelligence. Sidebar presets pre-filter it — this tour covers all of them.',
      placement: 'bottom',
    },
    {
      selector: '.page-head .actions .btn-primary',
      title: 'Add tender',
      body: 'Log an opportunity found outside the feeds — title, organisation, value, deadline. It joins the same table and workflow.',
      placement: 'bottom',
    },
    {
      selector: '.page-head .actions .btn-ghost',
      title: 'Import',
      body: 'Bring opportunities in bulk from Excel/CSV with the guided five-step import wizard.',
      placement: 'bottom',
    },
    {
      selector: '.stat-grid',
      title: 'Opportunity KPIs',
      body: 'Counts by relevance, verification, source and deadline pressure — your triage starting point (dashboard preset only).',
      placement: 'top',
      routes: ['/tenders'],
    },
    {
      selector: '.filters',
      title: 'Search and filters',
      body: 'Free-text search plus country, sector, type, product group, verification and relevance filters — saved-only checkbox keeps your shortlist.',
      placement: 'bottom',
    },
    {
      selector: '.filters .btn-ghost',
      title: 'More filters',
      body: 'Expands advanced filters: source, organisation, dates, confidence and data-quality — for deep narrowing.',
      placement: 'bottom',
    },
    {
      selector: '.table-wrap',
      title: 'The results table',
      body: 'One row per opportunity with deadline, value and relevance. The bookmark button on each row saves it to your shortlist.',
      placement: 'top',
    },
    {
      selector: '.pagination',
      title: 'Paging through feeds',
      body: 'Feeds can hold thousands of records — page through or tighten filters; counts in the card header show the result size.',
      placement: 'top',
    },
  ],
};

export const TENDERS_DETAIL_TOUR: TourDefinition = {
  id: 'tenders-detail',
  title: 'Opportunity detail',
  subtitle: 'Evaluate, explain and track one opportunity',
  icon: 'file-contract',
  section: 'Opportunities',
  roles: TENDER_ROLES,
  routes: ['/tenders/[id]'],
  dynamic: true,
  entry: '/tenders',
  startHint: 'Open any opportunity from the explorer to take this tour.',
  steps: [
    {
      selector: '.page-head',
      title: 'Opportunity header',
      body: 'Title, badges for type/status/verification, and a Back link. Everything below is specific to this record.',
      placement: 'bottom',
    },
    {
      selector: '.page-head .btn-ghost',
      title: 'Why this matters',
      body: 'The Why button opens the AI explanation: why the opportunity matches your profile, with source confidence.',
      placement: 'bottom',
    },
    {
      selector: '.card-header',
      title: 'Opportunity details',
      body: 'Full description, organisation, deadlines, keywords and source data — read this before committing effort.',
      placement: 'bottom',
    },
    {
      selector: '[data-tour="td-status"]',
      title: 'Status and notes',
      body: 'Set your personal status (e.g. Prospecting, Bidding) and add notes for the team, then press Update.',
      placement: 'left',
    },
    {
      selector: '[data-tour="td-save"]',
      title: 'Save / unsave',
      body: 'Bookmark the opportunity to keep it in Saved Opportunities — the sidebar preset lists everything you saved.',
      placement: 'left',
    },
    {
      selector: '[data-tour="td-verify"]',
      title: 'Verify',
      body: 'Managers and administrators verify opportunities as genuine — verified records rank higher for everyone.',
      placement: 'left',
      roles: MANAGER_ROLES,
    },
  ],
};

export const TENDERS_IMPORT_TOUR: TourDefinition = {
  id: 'tenders-import',
  title: 'Import opportunities',
  subtitle: 'Five-step Excel/CSV import wizard',
  icon: 'file-import',
  section: 'Opportunities',
  roles: MANAGER_ROLES,
  routes: ['/tenders/import'],
  steps: [
    {
      selector: '.page-head',
      title: 'Import wizard',
      body: 'Bulk-load opportunities from a spreadsheet. Download a template first — correct columns prevent mapping headaches.',
      placement: 'bottom',
    },
    {
      selector: '.page-head .actions .btn-ghost',
      title: 'Templates',
      body: 'Download the Excel or CSV template, fill it in with your records, and come back to upload it.',
      placement: 'bottom',
    },
    {
      selector: '[data-tour="import-stepper"]',
      title: 'The five steps',
      body: 'File → Mapping → Preview → Confirm → Summary. The stepper shows where you are; you can step back to fix mistakes.',
      placement: 'bottom',
    },
    {
      selector: '.drop-zone',
      title: 'Step 1: choose a file',
      body: 'Drop the spreadsheet onto the zone or click to browse, then press Upload & Map Columns.',
      placement: 'bottom',
    },
    {
      selector: '.table-wrap',
      title: 'Step 2-3: map and preview',
      body: 'Match your columns to KG-MIS fields with the dropdowns, then preview exactly what will be imported before committing.',
      placement: 'top',
    },
    {
      selector: '[data-tour="import-commit"]',
      title: 'Step 4: commit',
      body: 'Press Import to commit — duplicates and invalid rows are separated instead of failing the whole batch.',
      placement: 'top',
    },
    {
      selector: '.stat-grid',
      title: 'Step 5: summary',
      body: 'Imported, duplicate, invalid and failed counts with relevance breakdown. Jump straight to the new opportunities or import another file.',
      placement: 'top',
    },
    {
      selector: '.table-wrap',
      title: 'Import history',
      body: 'Past imports with file name, counts and timestamps are listed at the bottom for audit and re-runs.',
      placement: 'top',
    },
  ],
};

export const TENDERS_SOURCES_TOUR: TourDefinition = {
  id: 'tenders-sources',
  title: 'Data sources',
  subtitle: 'Configure and run opportunity collectors',
  icon: 'satellite-dish',
  section: 'Opportunities',
  roles: MANAGER_ROLES,
  routes: ['/tenders/sources'],
  steps: [
    {
      selector: '.page-head',
      title: 'Data sources',
      body: 'Where opportunities come from: RSS feeds, APIs and portals. Each source can be tested and collected manually or on a schedule.',
      placement: 'bottom',
    },
    {
      selector: '.page-head .actions .btn-ghost',
      title: 'Collect all',
      body: 'Runs every enabled source immediately — use it after configuring a new one instead of waiting for the schedule.',
      placement: 'bottom',
    },
    {
      selector: '.page-head .actions .btn-primary',
      title: 'Add source',
      body: 'Register a new feed: name, URL, type and mapping rules that tell KG-MIS how to read titles, links and dates.',
      placement: 'bottom',
    },
    {
      selector: '.table-wrap',
      title: 'Source table',
      body: 'Test verifies connectivity, Collect runs one source, and the pen edits mapping. Last-run and result counts are shown per row.',
      placement: 'top',
    },
    {
      selector: '.pagination',
      title: 'Many sources',
      body: 'Sources page automatically as your feed library grows.',
      placement: 'top',
    },
  ],
};

export const TENDERS_INTEREST_TOUR: TourDefinition = {
  id: 'tenders-interest-profiles',
  title: 'Interest profiles',
  subtitle: 'Teach the system what to look for',
  icon: 'bullseye',
  section: 'Opportunities',
  roles: MANAGER_ROLES,
  routes: ['/tenders/interest-profiles'],
  steps: [
    {
      selector: '.page-head',
      title: 'Interest profiles',
      body: 'Keywords, sectors, countries and product groups that define what the business cares about — they drive relevance scoring.',
      placement: 'bottom',
    },
    {
      selector: '.page-head .actions .btn-primary',
      title: 'New profile',
      body: 'Create a profile per business line (e.g. “Coffee exports – EU”). Multiple profiles combine to score every opportunity.',
      placement: 'bottom',
    },
    {
      selector: '.table-wrap',
      title: 'Profiles table',
      body: 'Edit or delete profiles with the row icons. Keep them current — stale keywords lower relevance scores.',
      placement: 'top',
    },
  ],
};

export const TENDERS_ASSISTANT_TOUR: TourDefinition = {
  id: 'tenders-assistant',
  title: 'AI Assistant',
  subtitle: 'Ask questions about your opportunity data',
  icon: 'wand-magic-sparkles',
  section: 'Opportunities',
  roles: ['Administrator', 'Marketing Manager', 'Marketing Analyst'],
  routes: ['/tenders/assistant'],
  steps: [
    {
      selector: '.page-head',
      title: 'AI Assistant',
      body: 'A conversational analyst over your opportunity data — deadlines, high-relevance tenders, source coverage — in plain language.',
      placement: 'bottom',
    },
    {
      selector: '.aiask-topbar',
      title: 'Session controls',
      body: 'Pick the AI provider and manage voice input here. The conversation is scoped to data your role can already see.',
      placement: 'bottom',
    },
    {
      selector: '.aiask-body',
      title: 'Answers with sources',
      body: 'Answers cite the underlying records — expand source chips to verify any number the assistant quotes.',
      placement: 'top',
    },
    {
      selector: '.aiassist-composer',
      title: 'Ask anything',
      body: 'Type a question and press send. Try: “Which tenders expire this week?” or “Show high-relevance buyer leads from Kenya”.',
      placement: 'top',
    },
  ],
};
