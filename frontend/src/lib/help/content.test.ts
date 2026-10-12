// Help Center content integrity test.
// Run: npm run test:help   (npx tsx src/lib/help/content.test.ts)
// Content modules use relative imports only so this runs under plain tsx.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ALL_GUIDES,
  HELP_CATEGORIES,
  HELP_FAQS,
  POPULAR_SLUGS,
  POPULAR_GUIDES,
  getGuide,
  guidesByCategory,
  faqsByCategory,
} from './index';
import { searchHelp } from './search';

const KNOWN_ROLES = ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Field Officer', 'Viewer'];
const errors: string[] = [];
const fail = (msg: string) => errors.push(msg);

// --- 1. Guide slugs: unique and URL-safe -----------------------------------
const slugCounts = new Map<string, number>();
for (const g of ALL_GUIDES) slugCounts.set(g.slug, (slugCounts.get(g.slug) ?? 0) + 1);
for (const [slug, n] of slugCounts) {
  if (n > 1) fail(`Duplicate guide slug: "${slug}" (${n}x)`);
  if (!/^[a-z0-9-]+$/.test(slug)) fail(`Slug not URL-safe: "${slug}"`);
}

// --- 2. FAQ ids: unique and anchor-safe ------------------------------------
const idCounts = new Map<string, number>();
for (const f of HELP_FAQS) idCounts.set(f.id, (idCounts.get(f.id) ?? 0) + 1);
for (const [id, n] of idCounts) {
  if (n > 1) fail(`Duplicate FAQ id: "${id}" (${n}x)`);
  if (!/^[a-z0-9-]+$/.test(id)) fail(`FAQ id not anchor-safe: "${id}"`);
}

// --- 3. Category refs -------------------------------------------------------
const categoryIds = new Set(HELP_CATEGORIES.map((c) => c.id));
for (const g of ALL_GUIDES) {
  if (!categoryIds.has(g.category)) fail(`Guide "${g.slug}" has unknown category "${g.category}"`);
}
for (const f of HELP_FAQS) {
  if (!categoryIds.has(f.category)) fail(`FAQ "${f.id}" has unknown category "${f.category}"`);
}

// --- 4. Required guide fields ----------------------------------------------
for (const g of ALL_GUIDES) {
  const need: Array<[string, unknown]> = [
    ['title', g.title], ['summary', g.summary], ['access', g.access],
    ['keywords', g.keywords], ['routes', g.routes], ['body', g.body],
  ];
  for (const [field, value] of need) {
    if (value == null || (Array.isArray(value) && value.length === 0) || value === '') {
      fail(`Guide "${g.slug}" missing ${field}`);
    }
  }
  if (!g.body.some((b) => b.kind !== 'p') && g.body.length < 2) {
    fail(`Guide "${g.slug}" body too thin`);
  }
  for (const r of g.routes) {
    if (!r.startsWith('/')) fail(`Guide "${g.slug}" route "${r}" must start with "/"`);
  }
  if (g.roles !== 'all' && !Array.isArray(g.roles)) {
    fail(`Guide "${g.slug}" has invalid roles`);
  } else if (g.roles !== 'all') {
    for (const role of g.roles) {
      if (!KNOWN_ROLES.includes(role)) fail(`Guide "${g.slug}" unknown role "${role}"`);
    }
  }
  if (g.keywords.length < 3) fail(`Guide "${g.slug}" needs at least 3 keywords`);
  if (g.keywords.some((k) => !k.trim() || k.trim() !== k)) {
    fail(`Guide "${g.slug}" has an empty/untrimmed keyword`);
  }
}

// --- 5. Required FAQ fields -------------------------------------------------
for (const f of HELP_FAQS) {
  if (!f.question?.trim()) fail(`FAQ "${f.id}" missing question`);
  if (!f.answer?.trim()) fail(`FAQ "${f.id}" missing answer`);
}

// --- 6. Reference integrity: related + links blocks -------------------------
for (const g of ALL_GUIDES) {
  for (const slug of g.related) {
    if (!getGuide(slug)) fail(`Guide "${g.slug}" related → missing "${slug}"`);
  }
  for (const block of g.body) {
    if (block.kind === 'links') {
      for (const l of block.items) {
        if (!getGuide(l.slug)) fail(`Guide "${g.slug}" links block → missing "${l.slug}"`);
      }
    }
  }
}
for (const f of HELP_FAQS) {
  for (const slug of f.related ?? []) {
    if (!getGuide(slug)) fail(`FAQ "${f.id}" related → missing "${slug}"`);
  }
}
for (const c of HELP_CATEGORIES) {
  if (guidesByCategory(c.id).length === 0) fail(`Category "${c.id}" has no guides`);
}

// --- 7. Popular guides resolve ---------------------------------------------
if (POPULAR_GUIDES.length !== POPULAR_SLUGS.length) {
  const missing = POPULAR_SLUGS.filter((s) => !getGuide(s));
  fail(`POPULAR_SLUGS unresolved: ${missing.join(', ')}`);
}

// --- 8. Sidebar coverage: every NAV_SECTIONS href is documented -------------
const sidebarPath = join(__dirname, '..', '..', 'components', 'Sidebar.tsx');
const sidebarSrc = readFileSync(sidebarPath, 'utf8');
const navBlock = sidebarSrc.slice(
  sidebarSrc.indexOf('export const NAV_SECTIONS'),
  sidebarSrc.indexOf('export function filteredNav')
);
if (navBlock.length === 0) fail('Could not locate NAV_SECTIONS in Sidebar.tsx');
const sidebarHrefs = [...navBlock.matchAll(/href:\s*'([^']+)'/g)].map((m) => m[1]);
if (sidebarHrefs.length === 0) fail('No hrefs parsed from NAV_SECTIONS');
const covered = new Set(ALL_GUIDES.flatMap((g) => g.routes));
for (const href of sidebarHrefs) {
  if (!covered.has(href)) fail(`Sidebar route "${href}" not covered by any guide's routes`);
}

// --- 9. FAQ density: at least one FAQ per category --------------------------
for (const c of HELP_CATEGORIES) {
  if (faqsByCategory(c.id).length === 0) fail(`Category "${c.id}" has no FAQs`);
}

// --- 10. No machine-local paths or placeholders in shipped content ----------
const contentJson = JSON.stringify({ guides: ALL_GUIDES, faqs: HELP_FAQS, categories: HELP_CATEGORIES });
if (/C:\\\\\\|2026 Projects|\\\\Users\\\\/.test(contentJson)) fail('Content contains a local filesystem path');
if (/TODO|FIXME|Lorem ipsum/i.test(contentJson)) fail('Content contains placeholder text');

// --- 11. Search smoke: returns ranked, well-formed results ------------------
const results = searchHelp('tender');
if (results.length === 0) fail('searchHelp("tender") returned no results');
for (const r of results) {
  if (!r.title || !r.categoryTitle) fail('search result missing title/categoryTitle');
  if (r.kind === 'guide' && !getGuide(r.slug)) fail(`search guide result → missing "${r.slug}"`);
  if (r.kind === 'faq' && !r.faqId) fail('search faq result missing faqId');
}
if (searchHelp('zzzzzz-no-such-term').length !== 0) fail('search matched a nonsense query');

// --- Report -----------------------------------------------------------------
const guideCount = ALL_GUIDES.length;
if (errors.length > 0) {
  console.error(`Help content test FAILED (${errors.length} problem${errors.length === 1 ? '' : 's'}):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(
  `Help content test passed: ${guideCount} guides, ${HELP_FAQS.length} FAQs, ` +
  `${HELP_CATEGORIES.length} categories, ${sidebarHrefs.length} sidebar routes covered.`
);
