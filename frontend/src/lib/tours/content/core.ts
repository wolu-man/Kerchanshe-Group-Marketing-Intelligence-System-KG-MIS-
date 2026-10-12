import type { TourDefinition } from '../types';

export const DASHBOARD_TOUR: TourDefinition = {
  id: 'dashboard',
  title: 'Dashboard',
  subtitle: 'KPIs, forecasts and quick actions at a glance',
  icon: 'gauge-high',
  section: 'Overview',
  roles: ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Field Officer', 'Viewer'],
  routes: ['/dashboard'],
  steps: [
    {
      selector: '.page-head',
      title: 'Your dashboard',
      body: 'This is the app home. Everything on this page is read-only and updates from live data — click any tile or row to drill into the source list.',
      placement: 'bottom',
    },
    {
      selector: '.stat-grid',
      title: 'KPI tiles',
      body: 'Headline numbers for visits, interviews, sales and other metrics relevant to your role. Tiles are clickable and take you to the matching module.',
      placement: 'top',
    },
    {
      selector: '.pred-grid',
      title: 'Predictive forecasts',
      body: 'Forecast cards project the coming periods from your recent activity, so you can see whether you are on track before month end.',
      placement: 'top',
    },
    {
      selector: '.dash-chart-section',
      title: 'Trend charts',
      body: 'Charts visualise volumes over time — activity trends, completion and category breakdowns. Use them in reviews instead of raw spreadsheets.',
      placement: 'top',
    },
    {
      selector: '.link-grid',
      title: 'Quick capture',
      body: 'One-click entry points: market visits, interviews, weekly sales and more. This is the fastest way to log data from the field.',
      placement: 'top',
    },
    {
      selector: '.obs-item',
      title: 'Quick actions',
      body: 'Shortcuts to the most common tasks — log a visit, conduct an interview, submit sales, view KPI performance. Ideal right after a field day.',
      placement: 'top',
    },
    {
      selector: '.officer-rank-table',
      title: 'Officer rankings',
      body: 'A live leaderboard of field officers by activity. Managers use it to spot coaching opportunities; officers see how they are tracking.',
      placement: 'left',
    },
    {
      selector: '.alert-item',
      title: 'Alerts and notifications',
      body: 'Actionable alerts — expiring forms, pending approvals, threshold breaches — appear here, with the full history in the Notification Center.',
      placement: 'left',
    },
  ],
};

export const NOTIFICATIONS_TOUR: TourDefinition = {
  id: 'notifications',
  title: 'Notification Center',
  subtitle: 'Read receipts, filters and delivery history',
  icon: 'bell',
  section: 'Overview',
  roles: ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Field Officer', 'Viewer'],
  routes: ['/notifications'],
  steps: [
    {
      selector: '.page-head',
      title: 'Notification Center',
      body: 'Every approval, comment, system event and scheduled delivery in one list. Unread rows are highlighted.',
      placement: 'bottom',
    },
    {
      selector: '.notif-toolbar',
      title: 'Tabs and event filter',
      body: 'Switch between Unread and All, and narrow the list by event type — approvals, mentions, report deliveries and more.',
      placement: 'bottom',
    },
    {
      selector: '.notif-toolbar .btn-ghost',
      title: 'Mark all read',
      body: 'Clear the unread badge in one click once you have dealt with everything. Individual rows also have a Mark-as-read button.',
      placement: 'bottom',
    },
    {
      selector: '.table-wrap',
      title: 'The list',
      body: 'Each row shows when it arrived, what happened and its status. Click a row’s action to jump to the related record.',
      placement: 'top',
    },
    {
      selector: '.pagination',
      title: 'Pagination',
      body: 'Notifications page 20 at a time. Use the page buttons to reach older history.',
      placement: 'top',
    },
    {
      selector: '.bell',
      title: 'The bell badge',
      body: 'The top-bar bell shows your unread count and refreshes automatically — click it any time to come back here.',
      placement: 'bottom',
    },
  ],
};

export const PROFILE_TOUR: TourDefinition = {
  id: 'profile',
  title: 'Profile & account',
  subtitle: 'Photo, personal details and password',
  icon: 'user-pen',
  section: 'Overview',
  roles: ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Field Officer', 'Viewer'],
  routes: ['/profile'],
  steps: [
    {
      selector: '.page-head',
      title: 'Your profile',
      body: 'Update the three things you own: your photo, your display details, and your password. Administrators manage roles and assignments separately.',
      placement: 'bottom',
    },
    {
      selector: '.card .btn-ghost',
      title: 'Profile photo',
      body: 'Upload a photo — it appears in the sidebar and top bar, which helps teams recognise each other in approvals and rankings.',
      placement: 'right',
    },
    {
      selector: 'input[placeholder="Your full name"]',
      title: 'Personal information',
      body: 'Adjust your name and contact email, then press Save changes. Your role badge (top right) is read-only — ask an administrator if it is wrong.',
      placement: 'left',
    },
    {
      selector: 'input[placeholder="Enter current password"]',
      title: 'Change password',
      body: 'Enter your current password plus a new one (6+ characters) and press Update password. You stay signed in after the change.',
      placement: 'left',
    },
    {
      selector: '.topbar-user-btn',
      title: 'You are in control',
      body: 'Your avatar menu also links here and lets you sign out. Sessions last 8 hours for security.',
      placement: 'bottom',
    },
  ],
};

export const HELP_TOUR: TourDefinition = {
  id: 'help',
  title: 'Help Center',
  subtitle: 'Searchable docs, FAQs and troubleshooting',
  icon: 'book-open',
  section: 'Support',
  roles: ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Field Officer', 'Viewer'],
  routes: ['/help'],
  steps: [
    {
      selector: '.help-toolbar',
      title: 'Help toolbar',
      body: 'Search guides and FAQs from the box at the top, and use Browse topics to show or hide the topic tree on small screens.',
      placement: 'bottom',
    },
    {
      selector: '.help-search-input',
      title: 'Search everything',
      body: 'Type any keyword — module names, error messages, task words. Results rank guides first, then matching FAQs; press Enter to open the top hit.',
      placement: 'bottom',
    },
    {
      selector: '.help-tree',
      title: 'Topic tree',
      body: 'Guides grouped by module: getting started, field intelligence, analytics, forms, opportunities, administration and troubleshooting. Your current article stays highlighted.',
      placement: 'right',
    },
    {
      selector: '.help-cat-grid',
      title: 'Categories',
      body: 'Each card shows how many guides and FAQs a category contains. Click one to filter the home page to that area.',
      placement: 'top',
    },
    {
      selector: '.help-guide-grid',
      title: 'Guides',
      body: 'Step-by-step instructions with access paths, required inputs, expected results and role restrictions — follow them exactly as written.',
      placement: 'top',
    },
    {
      selector: '.help-faq-chips',
      title: 'FAQs',
      body: 'Quick answers to common questions, filterable by category. For visual, on-screen walkthroughs use Take a Tour instead.',
      placement: 'top',
    },
  ],
};
