// =============================================================================
// Opportunity Classification — rule-based classification of opportunity type
// and product group (Opurtunities_Plan.md §5, §9).
//
// Design constraints:
//   - deterministic and testable: no AI dependency, runs on every insert;
//   - product taxonomy is data (dbo.ProductGroup.Keywords JSON), not code —
//     new groups/keywords are added without redesign;
//   - rules never invent information: no match means TENDER / unclassified;
//   - a source-declared type hint (e.g. an RFQ flag mapped by an adapter)
//     always wins over keyword rules.
// =============================================================================

import { db } from '../../db/pool';

/** The five opportunity types from Opurtunities_Plan.md §5. */
export const OPPORTUNITY_TYPES = [
  'TENDER',
  'RFQ',
  'BUYER_LEAD',
  'TRADE_INTELLIGENCE',
  'MARKET_SIGNAL',
] as const;

export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];

/** A product group row loaded from dbo.ProductGroup (active rows only). */
export interface ProductGroupRule {
  ProductGroupID: number;
  Code: string;
  Name: string;
  SortOrder: number;
  keywords: string[];
}

export interface ClassificationInput {
  title: string;
  description?: string | null;
  sector?: string | null;
  organization?: string | null;
}

export interface Classification {
  opportunityType: OpportunityType;
  productGroupId: number | null;
  matchedKeywords: string[];
  /**
   * True when a type keyword rule (or an explicit source hint) produced the
   * type; false when it fell through to the TENDER default. The AI gap fill
   * only suggests a type when this is false (plan §8).
   */
  typeMatched: boolean;
}

// ---------------------------------------------------------------------------
// Opportunity type rules — evaluated in order, first match wins.
// Patterns are deliberately conservative: ambiguous procurement wording stays
// TENDER (the default) instead of being over-classified.
// ---------------------------------------------------------------------------

const TYPE_RULES: Array<{ type: OpportunityType; patterns: RegExp[] }> = [
  {
    type: 'RFQ',
    patterns: [
      /\brfq\b/i,
      /request\s+for\s+quotations?/i,
      /requesting\s+(?:price\s+)?quotations?/i,
      /quotation\s+request/i,
      /request\s+quotes?/i,
    ],
  },
  {
    type: 'BUYER_LEAD',
    patterns: [
      /looking\s+for\s+(?:[a-z-]+\s+){0,3}(?:suppliers?|sellers?|vendors?)/i,
      /seeking\s+(?:a\s+)?(?:[a-z-]+\s+){0,3}(?:suppliers?|sellers?|vendors?)/i,
      /searching\s+for\s+(?:[a-z-]+\s+){0,3}(?:suppliers?|sellers?|vendors?)/i,
      /in\s+need\s+of\s+(?:a\s+)?(?:suppliers?|sellers?|vendors?)/i,
      /supplier\s+(?:is\s+)?required/i,
      /wants?\s+to\s+buy/i,
    ],
  },
  {
    type: 'TRADE_INTELLIGENCE',
    patterns: [
      /import\s+records?/i,
      /bill\s+of\s+lading/i,
      /shipment\s+records?/i,
      /\bhs\s*code/i,
      /imported\s+by/i,
      /consignment/i,
    ],
  },
  {
    type: 'MARKET_SIGNAL',
    patterns: [
      /contract\s+award/i,
      /awards?\s+of\s+contract/i,
      /market\s+price/i,
      /\bprice\s+index\b/i,
      /competitor\s+activity/i,
      /supplier\s+activity/i,
      /import\s*\/\s*export\s+trends?/i,
    ],
  },
];

export function isOpportunityType(value: unknown): value is OpportunityType {
  return typeof value === 'string' && (OPPORTUNITY_TYPES as readonly string[]).includes(value);
}

/**
 * Runs the type keyword rules over the text. `matched` is false when nothing
 * hit and the result is the TENDER fall-through default (used by the AI gap
 * fill to know when the rules were inconclusive).
 */
function matchTypeRule(text: string): { type: OpportunityType; matched: boolean } {
  for (const rule of TYPE_RULES) {
    if (rule.patterns.some((re) => re.test(text))) return { type: rule.type, matched: true };
  }
  return { type: 'TENDER', matched: false };
}

/**
 * Classifies the opportunity type from a source-declared hint (when valid)
 * or from keyword rules over title + description. Falls back to TENDER.
 */
export function classifyOpportunityType(
  title: string,
  description: string | null | undefined,
  typeHint?: string | null,
): OpportunityType {
  if (isOpportunityType(typeHint)) return typeHint;
  return matchTypeRule(`${title || ''}\n${description || ''}`).type;
}

// ---------------------------------------------------------------------------
// Product group matching — word-boundary keyword matching against the
// configurable taxonomy. The group with the most keyword hits wins; ties break
// on the lower SortOrder. Singular/plural forms of each keyword both match.
// ---------------------------------------------------------------------------

/** Builds a regex matching the keyword as a whole word (plus its plural form). */
function keywordRegex(keyword: string): RegExp | null {
  const base = keyword.trim().toLowerCase();
  if (!base) return null;
  const forms = new Set<string>([base]);
  if (base.endsWith('s')) forms.add(base.slice(0, -1));
  const alternatives = [...forms]
    .map((form) => form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  return new RegExp(`\\b(?:${alternatives})\\b`, 'i');
}

export interface ProductGroupMatch {
  group: ProductGroupRule;
  matchedKeywords: string[];
  hits: number;
}

/**
 * Matches free text against every product group's keywords.
 * Returns the best match (most keyword hits) or null when nothing matches.
 */
export function matchProductGroup(
  text: string,
  groups: ProductGroupRule[],
): ProductGroupMatch | null {
  const haystack = text.toLowerCase();
  let best: ProductGroupMatch | null = null;

  for (const group of groups) {
    const matched: string[] = [];
    for (const keyword of group.keywords) {
      const re = keywordRegex(keyword);
      if (re && re.test(haystack)) matched.push(keyword);
    }
    if (matched.length === 0) continue;
    const better =
      best === null ||
      matched.length > best.hits ||
      (matched.length === best.hits && group.ProductGroupID < best.group.ProductGroupID);
    if (better) best = { group, matchedKeywords: matched, hits: matched.length };
  }
  return best;
}

/**
 * Classifies one opportunity: type from hint/rules, product group from the
 * configured taxonomy. Never throws; unmatched product group stays null.
 */
export function classifyOpportunity(
  input: ClassificationInput,
  groups: ProductGroupRule[],
  typeHint?: string | null,
): Classification {
  const typeResult = isOpportunityType(typeHint)
    ? { type: typeHint, matched: true }
    : matchTypeRule(`${input.title || ''}\n${input.description || ''}`);
  const text = [input.title, input.sector, input.organization, input.description]
    .filter((part): part is string => !!part)
    .join(' ');
  const match = matchProductGroup(text, groups);
  return {
    opportunityType: typeResult.type,
    productGroupId: match ? match.group.ProductGroupID : null,
    matchedKeywords: match ? match.matchedKeywords : [],
    typeMatched: typeResult.matched,
  };
}

// ---------------------------------------------------------------------------
// DB access
// ---------------------------------------------------------------------------

function parseKeywords(value: unknown): string[] {
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((v) => String(v)).filter((v) => v.trim().length > 0);
  } catch {
    return [];
  }
}

/** Loads the active product-group taxonomy (ordered by SortOrder). */
export async function loadProductGroups(): Promise<ProductGroupRule[]> {
  const result = await db.request().query(
    `SELECT ProductGroupID, Code, Name, SortOrder, Keywords
     FROM dbo.ProductGroup
     WHERE IsActive = 1
     ORDER BY SortOrder, ProductGroupID`
  );
  return result.recordset.map((row) => ({
    ProductGroupID: row.ProductGroupID as number,
    Code: row.Code as string,
    Name: row.Name as string,
    SortOrder: row.SortOrder as number,
    keywords: parseKeywords(row.Keywords),
  }));
}

/**
 * Loads the taxonomy for classification, tolerating a missing/unavailable
 * table (e.g. migration not yet applied): classification then degrades to
 * type-only instead of failing the insert/collection run.
 */
export async function loadProductGroupsSafe(): Promise<ProductGroupRule[]> {
  try {
    return await loadProductGroups();
  } catch {
    return [];
  }
}

/** Lightweight list for filter UIs (no keyword payloads). */
export interface ProductGroupSummary {
  ProductGroupID: number;
  Code: string;
  Name: string;
  SortOrder: number;
}

export async function listProductGroups(): Promise<ProductGroupSummary[]> {
  const groups = await loadProductGroups();
  return groups.map((g) => ({
    ProductGroupID: g.ProductGroupID,
    Code: g.Code,
    Name: g.Name,
    SortOrder: g.SortOrder,
  }));
}
