// Tour content + wiring integrity test.
// Run: npm run test:tours   (npx tsx src/lib/tours/content.test.ts)
// Tour modules use relative imports only so this runs under plain tsx.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_TOURS, getTour, stepsForRole, type TourDefinition } from './index';

const KNOWN_ROLES = ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Field Officer', 'Viewer'];
const PLACEMENTS = ['top', 'bottom', 'left', 'right'];
const SRC = join(__dirname, '..', '..');
const APP = join(SRC, 'app');
const errors: string[] = [];
const fail = (msg: string) => errors.push(msg);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(p);
  }
  return out;
}

/** '/forms/[id]' -> <src>/app/forms/[id]/page.tsx */
function routeExists(route: string): boolean {
  if (!route.startsWith('/')) return false;
  const rel = route.slice(1);
  return existsSync(join(APP, rel, 'page.tsx'));
}

// --- 1. Registry shape: unique ids, required fields -------------------------
const idCounts = new Map<string, number>();
for (const t of ALL_TOURS) idCounts.set(t.id, (idCounts.get(t.id) ?? 0) + 1);
for (const [id, n] of idCounts) {
  if (n > 1) fail(`Duplicate tour id: "${id}" (${n}x)`);
  if (!/^[a-z0-9-]+$/.test(id)) fail(`Tour id not kebab-safe: "${id}"`);
}
if (!getTour('intro')) fail('Intro tour missing (first-run prompt expects id "intro")');

// --- 2. Tour fields, roles, routes ------------------------------------------
for (const t of ALL_TOURS) {
  for (const [field, value] of [
    ['title', t.title], ['subtitle', t.subtitle], ['icon', t.icon], ['section', t.section],
  ] as Array<[string, string]>) {
    if (!value?.trim()) fail(`Tour "${t.id}" missing ${field}`);
  }
  if (!Array.isArray(t.routes) || t.routes.length === 0) fail(`Tour "${t.id}" has no routes`);
  else for (const r of t.routes) if (!routeExists(r)) fail(`Tour "${t.id}" route "${r}" has no page.tsx`);

  if (t.roles !== 'all') {
    if (!Array.isArray(t.roles) || t.roles.length === 0) fail(`Tour "${t.id}" has invalid roles`);
    else for (const role of t.roles) {
      if (!KNOWN_ROLES.includes(role)) fail(`Tour "${t.id}" unknown role "${role}"`);
    }
  }

  if (t.dynamic) {
    if (!t.entry) fail(`Dynamic tour "${t.id}" missing entry`);
    else if (!routeExists(t.entry)) fail(`Dynamic tour "${t.id}" entry "${t.entry}" has no page.tsx`);
    if (!t.startHint?.trim()) fail(`Dynamic tour "${t.id}" missing startHint`);
  }

  if (!Array.isArray(t.steps) || t.steps.length === 0) fail(`Tour "${t.id}" has no steps`);

  // Every role the tour allows must have at least one runnable step.
  const roles = t.roles === 'all' ? KNOWN_ROLES : t.roles;
  for (const role of roles) {
    if (stepsForRole(t, role).length === 0) {
      fail(`Tour "${t.id}" leaves role "${role}" with zero steps`);
    }
  }
}

// --- 3. Step fields, placements, role filters, step routes -------------------
for (const t of ALL_TOURS) {
  t.steps.forEach((s, i) => {
    const at = `Tour "${t.id}" step ${i + 1}`;
    if (!s.selector?.trim()) fail(`${at} missing selector`);
    if (!s.title?.trim()) fail(`${at} missing title`);
    if (!s.body?.trim()) fail(`${at} missing body`);
    if (!PLACEMENTS.includes(s.placement ?? '')) fail(`${at} invalid placement "${s.placement}"`);
    if (s.roles) {
      if (!Array.isArray(s.roles) || s.roles.length === 0) fail(`${at} has invalid roles`);
      else for (const role of s.roles) {
        if (!KNOWN_ROLES.includes(role)) fail(`${at} unknown role "${role}"`);
      }
    }
    for (const r of [s.route, ...(s.routes ?? [])]) {
      if (r && !routeExists(r)) fail(`${at} route "${r}" has no page.tsx`);
    }
  });
}

// --- 4. Sections match the catalog page's SECTION_ORDER ---------------------
const toursPage = readFileSync(join(APP, 'tours', 'page.tsx'), 'utf8');
const orderBlock = toursPage.slice(
  toursPage.indexOf('const SECTION_ORDER = ['),
  toursPage.indexOf('];', toursPage.indexOf('const SECTION_ORDER = ['))
);
const sections = [...orderBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]);
if (sections.length === 0) fail('Could not parse SECTION_ORDER from app/tours/page.tsx');
for (const t of ALL_TOURS) {
  if (!sections.includes(t.section)) fail(`Tour "${t.id}" section "${t.section}" not in SECTION_ORDER`);
}

// --- 5. Sidebar coverage: every NAV_SECTIONS href has a tour ----------------
const sidebarSrc = readFileSync(join(SRC, 'components', 'Sidebar.tsx'), 'utf8');
const navBlock = sidebarSrc.slice(
  sidebarSrc.indexOf('export const NAV_SECTIONS'),
  sidebarSrc.indexOf('export function filteredNav')
);
if (navBlock.length === 0) fail('Could not locate NAV_SECTIONS in Sidebar.tsx');
const sidebarHrefs = [...navBlock.matchAll(/href:\s*'([^']+)'/g)].map((m) => m[1]);
if (sidebarHrefs.length === 0) fail('No hrefs parsed from NAV_SECTIONS');
const covered = new Set(ALL_TOURS.flatMap((t) => t.routes));
for (const href of sidebarHrefs) {
  if (!covered.has(href)) fail(`Sidebar route "${href}" not covered by any tour's routes`);
}

// --- 6. [data-tour] selectors referenced by content exist in the source -----
const srcFiles = walk(SRC);
const selectorAttrs = new Set<string>();
for (const file of srcFiles) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/data-tour="([a-z0-9-]+)"/g)) selectorAttrs.add(m[1]);
}
const wiredAnchors = new Set<string>();
for (const t of ALL_TOURS) {
  for (const s of t.steps) {
    const m = /\[data-tour="([a-z0-9-]+)"/.exec(s.selector);
    if (m) {
      wiredAnchors.add(m[1]);
      if (!selectorAttrs.has(m[1])) {
        fail(`Tour "${t.id}" targets [data-tour="${m[1]}"] but no element carries it`);
      }
    }
  }
}

// --- 7. Every tourId= reference in the app resolves --------------------------
const referenced = new Set<string>();
for (const file of srcFiles) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/tourId="([a-z0-9-]+)"/g)) referenced.add(m[1]);
}
for (const id of referenced) {
  if (!getTour(id)) fail(`Component references tourId="${id}" but no such tour exists`);
}
if (!referenced.has('signin')) fail('Login page should link the signin tour');
const prompt = readFileSync(join(SRC, 'components', 'tour', 'FirstRunPrompt.tsx'), 'utf8');
if (!/start\('intro'\)/.test(prompt)) fail('FirstRunPrompt does not start the intro tour');

// --- 8. Popover must stack above driver.js's overlay (inline z-index 10000) --
const globalsCss = readFileSync(join(APP, 'globals.css'), 'utf8');
const popRule = /\.driver-popover\s*\{[^}]*z-index:\s*(\d+)/.exec(globalsCss);
if (!popRule) {
  fail('globals.css: .driver-popover rule with a z-index not found');
} else if (Number(popRule[1]) <= 10000) {
  fail(
    `globals.css: .driver-popover z-index ${popRule[1]} must exceed ` +
      `driver.js's overlay <svg> z-index (10000) or popover clicks are swallowed`
  );
}
if (!/\.driver-popover-close-btn\s*\{[^}]*display:\s*none/.test(globalsCss)) {
  fail('globals.css: driver\'s native .driver-popover-close-btn should be hidden (custom close exists)');
}

// --- 9. No placeholders or local paths in shipped content --------------------
const toursJson = JSON.stringify(ALL_TOURS);
if (/C:\\\\|2026 Projects|\\\\Users\\\\/.test(toursJson)) fail('Tour content contains a local filesystem path');
if (/TODO|FIXME|Lorem ipsum/i.test(toursJson)) fail('Tour content contains placeholder text');

// --- Report -----------------------------------------------------------------
const stepCount = ALL_TOURS.reduce((n: number, t: TourDefinition) => n + t.steps.length, 0);
if (errors.length > 0) {
  console.error(`Tour content test FAILED (${errors.length} problem${errors.length === 1 ? '' : 's'}):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(
  `Tour content test passed: ${ALL_TOURS.length} tours, ${stepCount} steps, ` +
  `${sidebarHrefs.length} sidebar routes covered, ${wiredAnchors.size} data-tour anchors wired.`
);
