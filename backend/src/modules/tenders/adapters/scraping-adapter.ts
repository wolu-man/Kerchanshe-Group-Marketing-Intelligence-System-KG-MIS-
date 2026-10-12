// =============================================================================
// Scraping Adapter — fetches HTML and extracts opportunity data via
// configurable CSS-selector-like patterns.
//
// COMPLIANCE:
// - Checks robots.txt before fetching (enforced when RobotsCompliance = true)
// - Respects per-source rate limit
// - Does NOT bypass authentication, paywalls, or CAPTCHAs
// - Uses a simple selector engine (tag-based or attribute-based) — no full
//   browser/headless automation
//
// This adapter is intentionally minimal. For complex JavaScript-rendered
// sources, an API or RSS feed should be used instead. Scraping is a last
// resort for sources that offer no structured feed.
// =============================================================================

import {
  type RawOpportunity,
  type TenderSourceConfig,
  type SourceAdapter,
  fetchWithTimeout,
  isUrlAllowedByRobots,
  rateLimitDelay,
  normalizeDate,
} from './adapter';

interface ScrapingConfig {
  /** Selector for each opportunity listing container (e.g. "div.tender-item"). */
  itemSelector?: string;
  /** Field-to-selector mapping within each item. */
  fields?: Record<string, string>;
  /** Attribute to extract (e.g. "href" for links, null for text). Default: text. */
  attributes?: Record<string, string>;
  /** Max number of items to extract. */
  maxItems?: number;
}

/**
 * Minimal selector engine. Supports:
 *   tag              — e.g. "h2"
 *   .class           — e.g. ".title"
 *   tag.class        — e.g. "div.tender-item"
 *   [attr=value]     — e.g. "[data-type=tender]"
 *   tag[attr=value]  — combination
 */
function parseSelector(selector: string): { tag: string; classes: string[]; attrs: Record<string, string> } {
  let tag = '';
  const classes: string[] = [];
  const attrs: Record<string, string> = {};

  // Extract attribute selectors
  const attrRegex = /\[([^\]=]+)(?:=([^\]]+))?\]/g;
  const cleaned = selector.replace(attrRegex, (_, name: string, value?: string) => {
    attrs[name.trim()] = value ? value.replace(/^["']|["']$/g, '').trim() : '';
    return '';
  });

  // Split tag and classes
  const parts = cleaned.split('.');
  if (parts[0]) tag = parts[0].trim().toLowerCase();
  for (let i = 1; i < parts.length; i++) {
    if (parts[i].trim()) classes.push(parts[i].trim());
  }

  return { tag, classes, attrs };
}

/** Finds all elements matching the selector within the HTML. */
function querySelectorAll(html: string, selector: string): string[] {
  const { tag, classes, attrs } = parseSelector(selector);
  const results: string[] = [];

  // Build regex for opening tags matching tag + classes
  const tagName = tag || '[a-zA-Z]+';
  const tagRegex = new RegExp(`<(${tagName})([^>]*)>`, 'gi');
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(html)) !== null) {
    const fullTag = match[0];
    const tagNameMatched = match[1];

    // Check class match
    const classMatch = new RegExp(`class=["'][^"']*\\b(${classes.join('|')})\\b[^"']*["']`, 'i');
    if (classes.length > 0 && !classMatch.test(fullTag)) continue;

    // Check attribute matches
    let attrMatchOk = true;
    for (const [attrName, attrValue] of Object.entries(attrs)) {
      if (attrValue) {
        const attrRe = new RegExp(`${attrName}=["']${attrValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i');
        if (!attrRe.test(fullTag)) {
          attrMatchOk = false;
          break;
        }
      } else {
        if (!new RegExp(`${attrName}=`, 'i').test(fullTag)) {
          attrMatchOk = false;
          break;
        }
      }
    }
    if (!attrMatchOk) continue;

    // Find the matching closing tag (naive depth tracking)
    const openRegex = new RegExp(`<${tagNameMatched}[\\s>]`, 'gi');
    const closeRegex = new RegExp(`</${tagNameMatched}>`, 'gi');
    let depth = 1;
    let pos = match.index + fullTag.length;
    openRegex.lastIndex = pos;
    closeRegex.lastIndex = pos;

    while (depth > 0 && pos < html.length) {
      const openMatch = openRegex.exec(html);
      const closeMatch = closeRegex.exec(html);
      if (!closeMatch) break;
      if (openMatch && openMatch.index < closeMatch.index) {
        depth++;
        pos = openMatch.index + openMatch[0].length;
      } else {
        depth--;
        if (depth === 0) {
          const innerStart = match.index + fullTag.length;
          const innerEnd = closeMatch.index;
          results.push(html.substring(innerStart, innerEnd));
          break;
        }
        pos = closeMatch.index + closeMatch[0].length;
      }
    }
  }

  return results;
}

/** Extracts text content from HTML (strips tags, decodes entities). */
function extractText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extracts an attribute value from the first element matching the selector. */
function extractAttribute(html: string, selector: string, attr: string): string | null {
  const { tag, classes, attrs: selAttrs } = parseSelector(selector);
  const tagName = tag || '[a-zA-Z]+';
  const tagRegex = new RegExp(`<(${tagName})([^>]*)>`, 'i');
  const match = html.match(tagRegex);
  if (!match) return null;
  const fullTag = match[0];

  // Check classes
  if (classes.length > 0) {
    const classMatch = new RegExp(`class=["'][^"']*\\b(${classes.join('|')})\\b[^"']*["']`, 'i');
    if (!classMatch.test(fullTag)) return null;
  }

  // Check attrs
  for (const [name, value] of Object.entries(selAttrs)) {
    if (value) {
      const attrRe = new RegExp(`${name}=["']${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i');
      if (!attrRe.test(fullTag)) return null;
    }
  }

  // Extract the requested attribute
  const attrRegex = new RegExp(`${attr}=["']([^"']+)["']`, 'i');
  const attrMatch = fullTag.match(attrRegex);
  return attrMatch ? attrMatch[1] : null;
}

function mapScrapedItem(itemHtml: string, config: ScrapingConfig): RawOpportunity {
  const fields = config.fields || {};
  const attrs = config.attributes || {};

  function getField(fieldName: string): string | null {
    const selector = fields[fieldName];
    if (!selector) return null;
    if (attrs[fieldName]) {
      return extractAttribute(itemHtml, selector, attrs[fieldName]);
    }
    const elements = querySelectorAll(itemHtml, selector);
    if (elements.length === 0) return null;
    return extractText(elements[0]);
  }

  const title = getField('title') || '(Untitled)';
  const link = getField('sourceUrl') || getField('link') || '';

  return {
    title,
    organization: getField('organization'),
    country: getField('country'),
    sector: getField('sector'),
    description: getField('description'),
    sourceUrl: link,
    sourceReference: getField('sourceReference'),
    publicationDate: normalizeDate(getField('publicationDate')),
    deadlineDate: normalizeDate(getField('deadlineDate')),
    estimatedValue: (() => {
      const raw = getField('estimatedValue');
      if (!raw) return null;
      const n = Number(raw.replace(/[^0-9.]/g, ''));
      return isNaN(n) ? null : n;
    })(),
    currency: getField('currency'),
  };
}

export class ScrapingAdapter implements SourceAdapter {
  readonly type = 'scraping' as const;

  async fetch(source: TenderSourceConfig): Promise<RawOpportunity[]> {
    // Enforce robots.txt compliance.
    const allowed = await isUrlAllowedByRobots(source.URL, source.RobotsCompliance);
    if (!allowed) {
      throw new Error(`Robots.txt disallows fetching ${source.URL}`);
    }

    // Respect rate limit before fetching.
    await rateLimitDelay(source.RateLimitMs);

    const html = await fetchWithTimeout(source.URL);

    const config: ScrapingConfig = source.ApiConfig
      ? JSON.parse(source.ApiConfig)
      : {};

    if (!config.itemSelector) {
      throw new Error('Scraping source requires "itemSelector" in ApiConfig');
    }

    const itemHtmls = querySelectorAll(html, config.itemSelector);
    const maxItems = config.maxItems || 100;
    const limited = itemHtmls.slice(0, maxItems);

    if (limited.length === 0) {
      return [];
    }

    // Rate limit between subsequent item processing (lighter delay).
    if (itemHtmls.length > 1 && source.RateLimitMs > 0) {
      await rateLimitDelay(Math.min(source.RateLimitMs, 1000));
    }

    return limited
      .map((itemHtml) => mapScrapedItem(itemHtml, config))
      .filter((opp) => opp.title && opp.sourceUrl);
  }
}
