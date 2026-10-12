import type { TourDefinition } from '../types';

export const SIGNIN_TOUR: TourDefinition = {
  id: 'signin',
  title: 'Signing in',
  subtitle: 'What you need to access KG-MIS',
  icon: 'right-to-bracket',
  section: 'Getting started',
  roles: 'all',
  routes: ['/login'],
  steps: [
    {
      selector: '.login-card .brand',
      title: 'Welcome to KG-MIS',
      body: 'The Marketing Intelligence System keeps Kerchanshe’s field, pricing, opportunity and performance data in one place. Everything you see after signing in is tailored to your role.',
      placement: 'bottom',
    },
    {
      selector: '.login-card .input',
      title: 'Your credentials',
      body: 'Enter the username and password issued by your administrator. Each account is tied to one role — Administrator, Marketing Manager, Marketing Analyst, Field Officer or Viewer.',
      placement: 'bottom',
    },
    {
      selector: '.login-btn',
      title: 'Sign in',
      body: 'Press Sign in to open the dashboard. Sessions last 8 hours; after that you will be asked to sign in again. Your first tour starts right after login.',
      placement: 'top',
    },
    {
      selector: '.dev-note',
      title: 'Demo environment note',
      body: 'In development you may see a note with shared test credentials. Never share production passwords — contact an administrator if you cannot sign in.',
      placement: 'top',
    },
  ],
};
