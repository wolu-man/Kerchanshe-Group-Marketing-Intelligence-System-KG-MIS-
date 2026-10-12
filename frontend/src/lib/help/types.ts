// Content model for the KG-MIS Help Center.
// Keep this file framework-agnostic: content modules import only from here.

export type HelpCategoryId =
  | 'getting-started'
  | 'account-security'
  | 'field'
  | 'analytics'
  | 'forms'
  | 'opportunities'
  | 'administration'
  | 'troubleshooting';

export type HelpBlock =
  | { kind: 'p'; text: string }
  | { kind: 'steps'; items: string[] }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'note'; tone?: 'info' | 'warning'; text: string }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'links'; items: Array<{ label: string; slug: string }> };

export interface HelpGuide {
  slug: string;
  category: HelpCategoryId;
  title: string;
  summary: string;
  /** How to reach the screen (sidebar path / URL). */
  access: string;
  /** Roles that can open the screen ('all' = every role). Mirrors NAV_SECTIONS/RequireRole. */
  roles: string[] | 'all';
  /** Primary routes this guide documents (used by the coverage test). */
  routes: string[];
  /** Required inputs, when the screen collects data. */
  inputs?: string[];
  /** What the user should see after following the steps. */
  result?: string;
  /** Role-specific access restrictions beyond the badge list. */
  restrictions?: string;
  keywords: string[];
  related: string[];
  body: HelpBlock[];
}

export interface HelpFaq {
  id: string;
  category: HelpCategoryId;
  question: string;
  answer: string;
  related?: string[];
}

export interface HelpCategory {
  id: HelpCategoryId;
  title: string;
  icon: string;
  desc: string;
}
