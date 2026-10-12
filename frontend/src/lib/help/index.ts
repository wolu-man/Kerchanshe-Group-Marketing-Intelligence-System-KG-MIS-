import { HELP_CATEGORIES } from './categories';
import { GETTING_STARTED_GUIDES } from './guides/getting-started';
import { ACCOUNT_SECURITY_GUIDES } from './guides/account-security';
import { FIELD_GUIDES } from './guides/field';
import { ANALYTICS_GUIDES } from './guides/analytics';
import { FORMS_GUIDES } from './guides/forms';
import { OPPORTUNITY_GUIDES } from './guides/opportunities';
import { ADMINISTRATION_GUIDES } from './guides/administration';
import { TROUBLESHOOTING_GUIDES } from './guides/troubleshooting';
import { HELP_FAQS } from './faqs';
import type { HelpCategoryId, HelpGuide, HelpFaq } from './types';

export * from './types';
export { HELP_CATEGORIES } from './categories';
export { HELP_FAQS } from './faqs';
export { searchHelp, type HelpSearchResult } from './search';

export const ALL_GUIDES: HelpGuide[] = [
  ...GETTING_STARTED_GUIDES,
  ...ACCOUNT_SECURITY_GUIDES,
  ...FIELD_GUIDES,
  ...ANALYTICS_GUIDES,
  ...FORMS_GUIDES,
  ...OPPORTUNITY_GUIDES,
  ...ADMINISTRATION_GUIDES,
  ...TROUBLESHOOTING_GUIDES,
];

export function getGuide(slug: string): HelpGuide | undefined {
  return ALL_GUIDES.find((g) => g.slug === slug);
}

export function guidesByCategory(category: HelpCategoryId): HelpGuide[] {
  return ALL_GUIDES.filter((g) => g.category === category);
}

export function faqsByCategory(category: HelpCategoryId): HelpFaq[] {
  return HELP_FAQS.filter((f) => f.category === category);
}

export function faqsForGuide(guide: HelpGuide): HelpFaq[] {
  const linked = new Set(
    HELP_FAQS.filter((f) => f.related?.includes(guide.slug)).map((f) => f.id)
  );
  return HELP_FAQS.filter((f) => f.category === guide.category || linked.has(f.id)).slice(0, 8);
}

export function getCategory(id: HelpCategoryId) {
  return HELP_CATEGORIES.find((c) => c.id === id);
}

export function getGuides(slugs: string[]): HelpGuide[] {
  return slugs.map((s) => getGuide(s)).filter((g): g is HelpGuide => Boolean(g));
}

/** Guides shown first on the Help home page. */
export const POPULAR_SLUGS = [
  'signing-in',
  'navigating-app',
  'roles-permissions',
  'field-workflow',
  'reports-hub',
  'help-home',
];

export const POPULAR_GUIDES = getGuides(POPULAR_SLUGS);
