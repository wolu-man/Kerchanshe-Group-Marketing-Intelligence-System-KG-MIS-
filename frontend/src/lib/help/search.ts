import { ALL_GUIDES, HELP_FAQS, HELP_CATEGORIES } from './index';
import type { HelpGuide, HelpFaq } from './types';

export interface HelpSearchResult {
  kind: 'guide' | 'faq';
  slug: string;
  /** Present for FAQ results — anchors to /help#faq-<id> */
  faqId?: string;
  title: string;
  subtitle: string;
  categoryTitle: string;
  score: number;
}

function categoryTitle(id: string): string {
  return HELP_CATEGORIES.find((c) => c.id === id)?.title ?? id;
}

function guideText(g: HelpGuide): string {
  const parts: string[] = [g.title, g.summary, g.access, ...g.keywords];
  for (const b of g.body) {
    if (b.kind === 'p' || b.kind === 'note') parts.push(b.text);
    else if (b.kind === 'steps' || b.kind === 'bullets') parts.push(...b.items);
    else if (b.kind === 'table') {
      parts.push(...b.head, ...b.rows.flat());
    } else if (b.kind === 'links') parts.push(...b.items.map((i) => i.label));
  }
  if (g.inputs) parts.push(...g.inputs);
  if (g.result) parts.push(g.result);
  if (g.restrictions) parts.push(g.restrictions);
  return parts.join(' \n ');
}

function score(text: string, q: string): number {
  const lower = text.toLowerCase();
  let s = 0;
  let idx = lower.indexOf(q);
  while (idx !== -1) {
    s += 1;
    idx = lower.indexOf(q, idx + q.length);
  }
  return s;
}

/** Ranked client-side search across guides and FAQs. Empty query → []. */
export function searchHelp(query: string): HelpSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: HelpSearchResult[] = [];

  for (const g of ALL_GUIDES) {
    const titleHit = g.title.toLowerCase().includes(q);
    const keywordHit = g.keywords.some((k) => k.toLowerCase().includes(q));
    const s = (titleHit ? 12 : 0) + (keywordHit ? 6 : 0) + score(guideText(g), q);
    if (s > 0) {
      results.push({
        kind: 'guide',
        slug: g.slug,
        title: g.title,
        subtitle: g.summary,
        categoryTitle: categoryTitle(g.category),
        score: s,
      });
    }
  }

  for (const f of HELP_FAQS) {
    const titleHit = f.question.toLowerCase().includes(q);
    const s = (titleHit ? 8 : 0) + score(f.question + ' \n ' + f.answer, q);
    if (s > 0) {
      results.push({
        kind: 'faq',
        slug: f.related?.[0] ?? f.category,
        faqId: f.id,
        title: f.question,
        subtitle: f.answer,
        categoryTitle: categoryTitle(f.category),
        score: s,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 24);
}
