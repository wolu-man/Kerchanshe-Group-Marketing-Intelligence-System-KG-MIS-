import type { TourDefinition } from '../types';

export const INTRO_TOUR: TourDefinition = {
  id: 'intro',
  title: 'Welcome tour',
  subtitle: 'Your 60-second orientation to KG-MIS',
  icon: 'hand-sparkles',
  section: 'Getting started',
  roles: 'all',
  routes: ['/dashboard'],
  steps: [
    {
      selector: '.content',
      route: '/dashboard',
      title: 'Welcome to KG-MIS!',
      body: 'This short tour shows the building blocks of the app: navigation, the top bar, your dashboard, and how to log field data. Use Previous and Next to move around — you can replay this tour any time from Take a Tour.',
      placement: 'bottom',
    },
    {
      selector: '.sidebar-nav',
      mobileSelector: '.menu-btn',
      title: 'Your navigation',
      body: 'The sidebar groups every module into sections. Only sections your role can access are listed — expand or collapse them freely, your choice is remembered.',
      placement: 'right',
    },
    {
      selector: '.topbar',
      title: 'The top bar',
      body: 'Your role badge sits on the right, next to the light/dark theme switch. The bar stays visible while you scroll.',
      placement: 'bottom',
    },
    {
      selector: '.bell',
      title: 'Notifications',
      body: 'The bell shows how many unread notifications you have and opens the Notification Center — approvals, comments and scheduled report deliveries land here.',
      placement: 'bottom',
    },
    {
      selector: '.stat-grid',
      title: 'KPI snapshot',
      body: 'The dashboard opens with live KPI tiles for your region or role: visits, interviews, sales and more. Tiles link straight to the underlying lists.',
      placement: 'top',
    },
    {
      selector: '.link-grid',
      title: 'Quick capture',
      body: 'These tiles jump directly to data entry: log a market visit, record an interview or submit weekly sales without hunting through the sidebar.',
      placement: 'top',
    },
    {
      selector: '.dash-chart-section',
      title: 'Charts and alerts',
      body: 'Below the tiles you will find trend charts, officer rankings and alerts, so you can spot what needs attention before digging into reports.',
      placement: 'top',
    },
    {
      selector: '.page-head .actions .btn-primary',
      route: '/visits',
      roles: ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Field Officer'],
      title: 'Field workflows start here',
      body: 'On module pages the primary button in the header creates new records — for example a market visit report. Fill it in, submit it, and your manager approves it from the same table.',
      placement: 'bottom',
    },
    {
      selector: '.sidebar-signout',
      title: 'Signing out',
      body: 'When you are done, use Sign out at the bottom of the sidebar (or your avatar menu in the top bar). That wraps up the tour — enjoy exploring KG-MIS!',
      placement: 'right',
    },
  ],
};
