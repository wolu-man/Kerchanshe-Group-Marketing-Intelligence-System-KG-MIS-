import type { TourDefinition } from '../types';

export const PRICING_TOUR: TourDefinition = {
  id: 'pricing',
  title: 'Competitor pricing',
  subtitle: 'Track prices, compare and set alerts',
  icon: 'money-bill-trend-up',
  section: 'Field intelligence',
  roles: ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Field Officer'],
  routes: ['/pricing'],
  steps: [
    {
      selector: '.page-head',
      title: 'Competitor pricing',
      body: 'Price records captured in the field, organised into four views. Field officers record; analysts and managers act on the data.',
      placement: 'bottom',
    },
    {
      selector: '.tabs',
      title: 'Four views',
      body: 'Prices is the raw list, Compare puts your product side by side with rivals, Alerts flags new changes, Thresholds defines the bands that raise them.',
      placement: 'bottom',
    },
    {
      selector: '.filters',
      title: 'Search and filters',
      body: 'Search by competitor or product, then narrow by category and status. Clear resets everything back to the full list.',
      placement: 'bottom',
    },
    {
      selector: '.table-wrap',
      title: 'Price records',
      body: 'Each row: product, competitor, price, date and source. Add records with the New price button (or from field visits).',
      placement: 'top',
    },
    {
      selector: '.tabs button:nth-of-type(2)',
      title: 'Compare tab',
      body: 'Pick your product and see a table of every competitor’s latest price against yours, with the difference highlighted.',
      placement: 'bottom',
    },
    {
      selector: '.tabs button:nth-of-type(3)',
      title: 'Alerts tab',
      body: 'Raised when a competitor crosses a threshold. Resolve it once you have acted, or dismiss false positives.',
      placement: 'bottom',
    },
    {
      selector: '.tabs button:nth-of-type(4)',
      title: 'Thresholds tab',
      body: 'Define per-category tolerance (± amount or %). Alerts fire automatically when a new record breaches the band.',
      placement: 'bottom',
    },
    {
      selector: '.pagination',
      title: 'History at scale',
      body: 'Price history pages automatically — filter by category or competitor to audit one brand.',
      placement: 'top',
    },
  ],
};

export const REPORTS_TOUR: TourDefinition = {
  id: 'reports',
  title: 'Reports & Power BI',
  subtitle: 'Fourteen report types, filters and exports',
  icon: 'chart-column',
  section: 'Analytics',
  roles: ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Viewer'],
  routes: ['/reports'],
  steps: [
    {
      selector: '.page-head',
      title: 'Reports hub',
      body: 'Every dataset in KG-MIS as charts and tables. Pick a tab, set the filters, and export what you need.',
      placement: 'bottom',
    },
    {
      selector: '.page-head .actions .btn-ghost',
      title: 'Export to Excel',
      body: 'Opens a menu of exportable report kinds — download the currently filtered dataset as a spreadsheet for offline analysis.',
      placement: 'bottom',
    },
    {
      selector: '.tabs',
      title: 'Report tabs',
      body: 'Fourteen reports: AI Insights, Ask AI, Sales, Customers, Products, Visits, Price Comparison, Competitor Intel, Interviews, Weekly Sales, KPI, Forms, Availability and Power BI.',
      placement: 'bottom',
    },
    {
      selector: '.filter-bar',
      title: 'Filter bar',
      body: 'Date range, region, business group and report-specific filters. Charts, KPIs and the table all respond instantly — Clear resets.',
      placement: 'bottom',
    },
    {
      selector: '.stat-grid',
      title: 'Report KPIs',
      body: 'Summary cards above the charts give the headline numbers for the current filter — screenshot these for weekly reviews.',
      placement: 'top',
    },
    {
      selector: '.table-wrap',
      title: 'Detail table',
      body: 'The underlying rows behind the charts. Use it to verify a chart or to export via the Excel menu.',
      placement: 'top',
    },
    {
      selector: '.tabs button:nth-of-type(14)',
      title: 'Power BI tab',
      body: 'Embedded Power BI dashboards for the heaviest analysis — open them externally for full cross-filtering.',
      placement: 'bottom',
    },
    {
      selector: '.tabs button:nth-of-type(2)',
      title: 'Ask AI',
      body: 'Prefer plain questions? The Ask AI tab answers about your data in conversation — covered in the AI Assistant tour.',
      placement: 'bottom',
    },
  ],
};

export const OFFICER_PERFORMANCE_TOUR: TourDefinition = {
  id: 'officer-performance',
  title: 'My performance',
  subtitle: 'KPI scorecard, plans and activity log',
  icon: 'chart-bar',
  section: 'Analytics',
  roles: ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Field Officer'],
  routes: ['/officer/performance'],
  steps: [
    {
      selector: '.kpi-hero',
      title: 'Your scorecard',
      body: 'Headline score, activity count and completion for the selected period — the numbers your manager sees in reviews.',
      placement: 'bottom',
    },
    {
      selector: '.kpi-filters',
      title: 'Date range',
      body: 'Move the From/To dates to recompute the scorecard for any period; Reset returns to the default window.',
      placement: 'bottom',
    },
    {
      selector: '.tabs',
      title: 'Four views',
      body: 'My Performance (score breakdown), My Plans (assigned activities), My Results (achieved vs target) and Activity Log (audit trail).',
      placement: 'bottom',
    },
    {
      selector: '.data-table',
      title: 'Plans and results',
      body: 'Each row shows target, achieved and status with badges. Expand rows to see the score breakdown per KPI.',
      placement: 'top',
    },
    {
      selector: '.module-mini-card',
      title: 'Module contributions',
      body: 'Mini cards show how visits, interviews, sales and forms each contribute to your score — improve the weakest module first.',
      placement: 'top',
    },
    {
      selector: '.kpi-hero-stat',
      title: 'Reading the stats',
      body: 'Score is weighted across modules; Activities counts logged work; Completion is planned vs done. Green means on track.',
      placement: 'right',
    },
  ],
};
