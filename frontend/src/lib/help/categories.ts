import type { HelpCategory } from './types';

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: 'rocket',
    desc: 'Sign in, navigate the app, understand the dashboard and notifications.',
  },
  {
    id: 'account-security',
    title: 'Account & Security',
    icon: 'user-shield',
    desc: 'Profile, password, roles & permissions, sessions and access rules.',
  },
  {
    id: 'field',
    title: 'Field Intelligence',
    icon: 'binoculars',
    desc: 'Market visits, interviews, media, pricing, weekly sales and performance.',
  },
  {
    id: 'analytics',
    title: 'Analytics & Reports',
    icon: 'chart-column',
    desc: 'The 14-tab reporting hub, filters, exports and Power BI dashboards.',
  },
  {
    id: 'forms',
    title: 'Forms & Surveys',
    icon: 'clipboard-list',
    desc: 'NexForm builder, settings, responses, respondent and public share links.',
  },
  {
    id: 'opportunities',
    title: 'Opportunities & Tenders',
    icon: 'briefcase',
    desc: 'Tenders, RFQs, buyer leads, trade intel, AI assistant, sources and import.',
  },
  {
    id: 'administration',
    title: 'Administration',
    icon: 'shield-halved',
    desc: 'Users, roles, notifications, schedules, audit and master data.',
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting & FAQ',
    icon: 'screwdriver-wrench',
    desc: 'Errors, permissions, uploads, missing data and common questions.',
  },
];
