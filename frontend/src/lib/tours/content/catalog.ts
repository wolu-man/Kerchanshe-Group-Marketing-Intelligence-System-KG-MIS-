import type { TourDefinition } from '../types';

export const TOURS_TOUR: TourDefinition = {
  id: 'tours',
  title: 'Tour catalog',
  subtitle: 'Replay any walkthrough from this page',
  icon: 'person-chalkboard',
  section: 'Support',
  roles: ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Field Officer', 'Viewer'],
  routes: ['/tours'],
  steps: [
    {
      selector: '.page-head',
      title: 'Your tour library',
      body: 'Every guided walkthrough you can take, in one place. The sub-line links to the Help Center if you prefer written docs.',
      placement: 'bottom',
    },
    {
      selector: '.page-head .actions .btn-ghost',
      title: 'Switch to written docs',
      body: 'Opens the Help Center — searchable guides and FAQs for every module.',
      placement: 'bottom',
    },
    {
      selector: '.tour-group',
      title: 'Grouped by area',
      body: 'Tours are organised the same way as the sidebar: Getting started, Overview, Field intelligence, Analytics, Opportunities, Administration and Support.',
      placement: 'bottom',
    },
    {
      selector: '.tour-card',
      title: 'Tour cards',
      body: 'Each card shows the tour length in steps and minutes. Completed tours wear a green badge so you know what you have already seen.',
      placement: 'top',
    },
    {
      selector: '.tour-card-actions',
      title: 'Start or replay',
      body: 'Press Start tour to begin. Once finished the button becomes Replay, so you can watch any walkthrough again at any time.',
      placement: 'top',
    },
  ],
};
