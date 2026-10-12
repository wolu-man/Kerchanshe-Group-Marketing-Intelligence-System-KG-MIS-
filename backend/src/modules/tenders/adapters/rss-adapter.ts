// =============================================================================
// RSS/Atom Feed Adapter — fetches and parses RSS 2.0 and Atom 1.0 feeds.
//
// Uses a minimal regex-based XML parser to avoid adding a new npm dependency.
// This is intentionally simple — it handles well-formed feeds and maps <item>
// or <entry> elements to RawOpportunity. For complex feeds, the API adapter
// with a custom endpoint is recommended.
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

interface RssConfig {
  /** Optional field mapping overrides (same shape as API adapter, but applied to XML tags). */
  titleTag?: string;
  descriptionTag?: string;
  linkTag?: string;
  pubDateTag?: string;
  deadlineTag?: string;
  orgTag?: string;
  categoryTag?: string;
  countryTag?: string;
}

/** Extracts text content between XML tags (first occurrence, non-greedy). */
function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const match = xml.match(re);
  if (!match) return '';
  return match[1].trim();
}

/** Extracts all instances of a repeating element and returns their inner XML. */
function extractItems(xml: string, tag: string): string[] {
  const items: string[] = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    items.push(match[1]);
  }
  return items;
}

/** Extracts the href attribute from a <link href="..."/> element (Atom). */
function extractLinkHref(itemXml: string): string {
  // Atom: <link href="..." />
  const linkMatch = itemXml.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i);
  if (linkMatch) return linkMatch[1];
  // RSS: <link>text</link>
  return extractTag(itemXml, 'link');
}

/** Decodes basic HTML entities. */
function decodeEntities(text: string): string {
  if (!text) return '';
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .trim();
}

function mapFeedItem(itemXml: string, config: RssConfig): RawOpportunity {
  const getTag = (tag: string | undefined, defaultTag: string): string => {
    const tagToUse = tag || defaultTag;
    return decodeEntities(extractTag(itemXml, tagToUse));
  };

  // Detect Atom vs RSS by element names.
  const isAtom = itemXml.includes('<id') && itemXml.includes('<link');

  const title = getTag(config.titleTag, 'title') || '(Untitled)';
  const description = decodeEntities(
    extractTag(itemXml, config.descriptionTag || 'description') ||
    extractTag(itemXml, 'summary') ||
    extractTag(itemXml, 'content')
  );
  const link = isAtom
    ? decodeEntities(extractLinkHref(itemXml))
    : getTag(config.linkTag, 'link');
  const pubDate = normalizeDate(
    extractTag(itemXml, config.pubDateTag || 'pubDate') ||
    extractTag(itemXml, 'published') ||
    extractTag(itemXml, 'updated')
  );
  const deadline = normalizeDate(
    extractTag(itemXml, config.deadlineTag || 'deadline')
  );
  const org = getTag(config.orgTag, 'dc:creator') || getTag(config.orgTag || '', 'author') || null;
  const category = getTag(config.categoryTag, 'category') || null;
  const country = getTag(config.countryTag, 'country') || null;
  const sourceRef = extractTag(itemXml, 'guid') || extractTag(itemXml, 'id') || link;

  return {
    title,
    organization: org || null,
    country: country || null,
    sector: category || null,
    description: description || null,
    sourceUrl: link,
    sourceReference: sourceRef || null,
    publicationDate: pubDate,
    deadlineDate: deadline,
    estimatedValue: null,
    currency: null,
  };
}

export class RssAdapter implements SourceAdapter {
  readonly type = 'rss' as const;

  async fetch(source: TenderSourceConfig): Promise<RawOpportunity[]> {
    // Check robots.txt before fetching the feed.
    const allowed = await isUrlAllowedByRobots(source.URL, source.RobotsCompliance);
    if (!allowed) {
      throw new Error(`Robots.txt disallows fetching ${source.URL}`);
    }

    // Respect the per-source rate limit before fetching.
    await rateLimitDelay(source.RateLimitMs);

    const xml = await fetchWithTimeout(source.URL);

    const config: RssConfig = source.ApiConfig
      ? JSON.parse(source.ApiConfig)
      : {};

    // Detect feed type and extract items.
    let itemsXml: string[];
    if (xml.includes('<entry')) {
      // Atom feed
      itemsXml = extractItems(xml, 'entry');
    } else {
      // RSS 2.0 feed
      itemsXml = extractItems(xml, 'item');
    }

    if (itemsXml.length === 0) {
      return [];
    }

    return itemsXml
      .map((itemXml) => mapFeedItem(itemXml, config))
      .filter((opp) => opp.title && opp.sourceUrl);
  }
}
