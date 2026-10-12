import type { TourDefinition } from '../types';

const FIELD_ROLES = ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Field Officer'];

export const VISITS_TOUR: TourDefinition = {
  id: 'visits',
  title: 'Market visits',
  subtitle: 'Create, submit and approve visit reports',
  icon: 'location-dot',
  section: 'Field intelligence',
  roles: FIELD_ROLES,
  routes: ['/visits'],
  steps: [
    {
      selector: '.page-head',
      title: 'Market visit reports',
      body: 'Every field visit is logged here as a report that moves through Draft → Submitted → Approved. Use this page to create reports and track their status.',
      placement: 'bottom',
    },
    {
      selector: '.page-head .actions .btn-primary',
      title: 'New visit report',
      body: 'Opens the visit form: outlet, region, date, products observed, notes and photos. Save as draft to finish later, or submit straight away.',
      placement: 'bottom',
    },
    {
      selector: '.filters',
      title: 'Filter the list',
      body: 'Narrow by status (Draft, Submitted, Approved…), region or business group. Managers use status=Submitted to find what needs review.',
      placement: 'bottom',
    },
    {
      selector: '.table-wrap',
      title: 'The report table',
      body: 'Each row shows outlet, date, officer and status. Click View to open the full report; row actions also offer Submit, Review, Approve or Reject depending on status and role — officers submit, managers approve.',
      placement: 'top',
    },
    {
      selector: '.pagination',
      title: 'Pagination',
      body: 'Reports page 10 at a time. Combine paging with the status filter to work through approvals efficiently.',
      placement: 'top',
    },
  ],
};

export const INTERVIEWS_TOUR: TourDefinition = {
  id: 'interviews',
  title: 'Interviews',
  subtitle: 'Structured interviews list and detail view',
  icon: 'comments',
  section: 'Field intelligence',
  roles: ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Field Officer', 'Viewer'],
  routes: ['/interviews'],
  steps: [
    {
      selector: '.page-head',
      title: 'Interviews',
      body: 'Structured conversations with retailers and customers, stored with questions, answers and follow-ups. Same draft/submit/approve flow as visits.',
      placement: 'bottom',
    },
    {
      selector: '.page-head .actions .btn-primary',
      title: 'New interview',
      body: 'Opens the interview form — respondent details, structured Q&A and notes. Save a draft if you need to continue later.',
      placement: 'bottom',
    },
    {
      selector: '.tabs',
      title: 'List vs detail',
      body: 'The Interviews tab shows the table; the Detail tab opens one interview in depth with its answers, stats and activity — reached via the View button.',
      placement: 'bottom',
    },
    {
      selector: '.filters',
      title: 'Filters',
      body: 'Status, region and business group filters slice the list — the same filter pattern used across field modules.',
      placement: 'bottom',
    },
    {
      selector: '.table-wrap',
      title: 'Row actions',
      body: 'View, Edit, Submit, Review, Approve or Reject appear per row depending on status and your role.',
      placement: 'top',
    },
    {
      selector: '.pagination',
      title: 'Pagination',
      body: 'Results page 10 at a time; use the page buttons or tighten the filters to find older interviews faster.',
      placement: 'top',
    },
  ],
};

export const MULTIMEDIA_TOUR: TourDefinition = {
  id: 'multimedia',
  title: 'Photos & videos',
  subtitle: 'Upload, validate and transcribe field media',
  icon: 'photo-film',
  section: 'Field intelligence',
  roles: ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Field Officer', 'Viewer'],
  routes: ['/multimedia'],
  steps: [
    {
      selector: '.page-head',
      title: 'Media library',
      body: 'Photos and videos captured in the field land here with location, tags and validation status. Evidence attached to visits and interviews is searchable here.',
      placement: 'bottom',
    },
    {
      selector: '.page-head .actions .btn-primary',
      title: 'Upload media',
      body: 'Drag files into the drop zone, set type, date and tags, then upload. Videos can be transcribed after upload.',
      placement: 'bottom',
    },
    {
      selector: '.filters',
      title: 'Filter by type or status',
      body: 'Show only photos, only videos, or only items awaiting validation — reviewers live in the Pending view.',
      placement: 'bottom',
    },
    {
      selector: '.media-grid',
      title: 'The media grid',
      body: 'Thumbnails show validation state at a glance; rejected items are marked in red. Click any tile to open its detail.',
      placement: 'top',
    },
    {
      selector: '.drop-zone',
      title: 'Drag and drop',
      body: 'Inside the upload dialog you can drag files straight onto the drop zone or click to browse — JPG/PNG for photos, MP4 for video.',
      placement: 'top',
    },
  ],
};

export const WEEKLY_SALES_TOUR: TourDefinition = {
  id: 'weekly-sales',
  title: 'Weekly sales',
  subtitle: 'Record and track POS sales entries',
  icon: 'cash-register',
  section: 'Field intelligence',
  roles: ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Field Officer', 'Viewer'],
  routes: ['/weekly-sales'],
  steps: [
    {
      selector: '.page-head',
      title: 'Weekly sales',
      body: 'Point-of-sale numbers submitted each week by outlets — quantity, revenue and product specs. Data here feeds the Sales reports and KPIs.',
      placement: 'bottom',
    },
    {
      selector: '.page-head .actions .btn-primary',
      title: 'Record weekly sale',
      body: 'Open the entry form: week-ending date, outlet, product, quantity, revenue and optional spec lines. One entry per outlet per week.',
      placement: 'bottom',
    },
    {
      selector: '.stat-grid',
      title: 'Summary cards',
      body: 'Totals for entries, quantity sold and revenue for the current filter — your quick health check before drilling down.',
      placement: 'bottom',
    },
    {
      selector: '.filters',
      title: 'Powerful filters',
      body: 'Search by outlet, pick a week, and slice by region, business group, customer type, status or colour to audit one slice of the network.',
      placement: 'bottom',
    },
    {
      selector: '.table-wrap',
      title: 'Entries table',
      body: 'Each row can be viewed, edited or deleted. Edited entries keep their history — managers see who changed what.',
      placement: 'top',
    },
    {
      selector: '.pagination',
      title: 'Finding older weeks',
      body: 'Page through history here or set the week-ending filter to jump to a specific week.',
      placement: 'top',
    },
  ],
};
