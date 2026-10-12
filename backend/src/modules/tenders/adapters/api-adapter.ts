// =============================================================================
// API Adapter — fetches from official JSON API endpoints.
//
// Expects ApiConfig JSON to contain a field mapping that describes how to
// extract RawOpportunity fields from the API response, plus optional
// server-side query features (filter / orderBy) and multi-page collection.
//
// ApiConfig shape:
//   {
//     "itemsPath": "items",                 // dot-path to the response array
//     "params":    { "locale": "en" },      // static query params (NOW + ${VAR})
//     "headers":   { "Authorization": "Bearer ${TENDERMETRO_API_KEY}" },
//                                           // optional request headers (never
//                                           // logged; ${VAR} from process.env)
//     "orderBy":   [ { "field": "invitationDate", "direction": "desc" } ],
//     "filter":    [ [ { "field": "invitationDate", "operator": ">=",
//                        "value": "NOW-7d" } ] ],   // groups of conditions
//     "pagination": { "mode": "skip|page|offset", "pageSize": 50, "maxPages": 20 },
//     "itemFilter": { "path": "Country_ID", "equals": "70" }, // client-side rows
//     "maxAgeDays": 7,                      // rolling-window freshness gate
//     "responseFormat": "inertia-html",   // extract embedded data-page JSON from HTML
//     "fields": {
//       "title":     { "path": "lotName" },
//       "country":   { "default": "Ethiopia" },        // static default, no path
//       "sourceUrl": { "template": "https://host/{id}" } // built from item fields
//     }
//   }
//
// Conventions (verified against the e-GP sourcing API):
//   - serialized as ASP.NET-style query keys: filter[i][j].field / orderBy[i].field;
//   - filter value tokens: NOW, NOW-30d, NOW+30d → ISO-8601 UTC at request time;
//     NOW-7d|dmy → DD-MM-YYYY at request time (tenderinfo.org date params);
//   - pagination advances skip by the number of items actually returned, so a
//     server-side page-size cap can never create gaps; empty pages and the
//     response "total" terminate the loop early;
//   - template expansion is innermost-first with pipes: lower, upper, trim,
//     bool:trueVal,falseVal, eq:compareValue,thenValue,elseValue.
//
// Additional conventions (verified against tender.2merkato.com, Laravel/Inertia):
//   - responseFormat "inertia-html": the response is HTML carrying the page
//     payload in a data-page="…" attribute (HTML-entity-encoded JSON); it is
//     decoded and parsed before itemsPath resolution, so itemsPath then points
//     into the JSON props exactly as with responseFormat "json" (default);
//   - pagination.mode "page": pages are addressed with page=N (1-based) instead
//     of skip/top; termination stays empty-page / total / maxPages. "skip" is
//     the default and keeps legacy sources byte-identical.
//
// Additional conventions (verified against www.tenderinfo.org/api/export):
//   - the response is a top-level ARRAY whose first element is metadata
//     ({ Total: "…" }) followed by items — itemsPath stays empty; metadata is
//     dropped by the sourceUrl guard and/or the Country_ID itemFilter;
//   - pagination "page" mode: the server advances the row offset by only 20
//     per page while returning 100 items, so consecutive pages overlap by ~80
//     rows (documented param, measured behavior); dedup absorbs the repeats
//     and a beyond-last page returns [] (clean termination);
//   - date params are DD-MM-YYYY → use NOW-7d|dmy tokens;
//   - intermittent 0-byte 200 responses are retried by fetchJsonWithTimeout.
// =============================================================================

import {
  type RawOpportunity,
  type TenderSourceConfig,
  type SourceAdapter,
  fetchJsonWithTimeout,
  fetchWithTimeout,
  normalizeDate,
  rateLimitDelay,
} from './adapter';

interface ApiFieldMapping {
  /** Dot-path into each item object for the field. */
  path?: string;
  /** Static default when the path is missing (also used when no path is set). */
  default?: string;
  /** Template built from item fields, e.g. "https://host/{a|lower}/{b}". */
  template?: string;
}

interface ApiOrderBy {
  field: string;
  direction: 'asc' | 'desc';
}

interface ApiFilterCondition {
  field: string;
  value: string;
  operator: string;
}

interface ApiPaginationConfig {
  /**
   * Addressing scheme:
   *   - "skip" (default): skip/top (ASP.NET style, e-GP);
   *   - "page": page=N, 1-based (2merkato, tenderinfo);
   *   - "offset": offset/limit (TenderMetro). The offset advances by the
   *     number of items actually returned, so a server-side limit cap can
   *     never create gaps.
   */
  mode?: 'skip' | 'page' | 'offset';
  pageSize?: number;
  maxPages?: number;
  /** First skip/offset ("skip"/"offset") or first page number ("page"). Defaults 0 / 1. */
  startSkip?: number;
  startPage?: number;
}

interface ApiItemFilter {
  /** Dot-path into each item object to test. */
  path: string;
  /** Keep the item only when the (string-coerced) value equals this. */
  equals: string;
}

interface ApiConfig {
  /** Dot-path to the array of items in the response (e.g. "data.tenders" or "results"). */
  itemsPath?: string;
  /** Field mapping from API item → RawOpportunity field. */
  fields?: Record<string, ApiFieldMapping>;
  /**
   * Optional request headers (never logged). Values may contain `${VAR}`
   * placeholders, interpolated from process.env at request time so secrets
   * stay out of the database (e.g. "Bearer ${TENDERMETRO_API_KEY}").
   */
  headers?: Record<string, string>;
  /**
   * Optional query params to append. Values support NOW tokens and `${VAR}`
   * environment interpolation (same rules as headers).
   */
  params?: Record<string, string>;
  /** Server-side ordering (serialized as orderBy[i].field / orderBy[i].direction). */
  orderBy?: ApiOrderBy[];
  /** Server-side filter groups (serialized as filter[i][j].field / ...). */
  filter?: ApiFilterCondition[][];
  /** Multi-page collection controls. pageSize defaults to 1 page when omitted. */
  pagination?: ApiPaginationConfig;
  /**
   * "json" (default): body parsed with JSON.parse.
   * "inertia-html": body is HTML whose data-page attribute holds the payload.
   */
  responseFormat?: 'json' | 'inertia-html';
  /**
   * Client-side item filter applied before mapping: items whose `path` value
   * does not string-equal `equals` are dropped (including response metadata
   * elements that are not real items). Needed for APIs whose country filter is
   * unavailable in public mode (tenderinfo.org: keep Country_ID == "70").
   */
  itemFilter?: ApiItemFilter;
  /**
   * Rolling-window freshness gate: items whose mapped publicationDate is
   * older than N days are dropped before collection (items without a
   * publication date are kept — they cannot be aged). Lets sources without a
   * server-side date filter (TenderMetro) honor the 7-day no-backfill window.
   */
  maxAgeDays?: number;
}

/** Resolves a dot-path into a nested object, returning the value or undefined. */
function resolvePath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ---------------------------------------------------------------------------
// Filter value tokens (NOW / NOW±Nd → ISO-8601 UTC, optional output format)
// ---------------------------------------------------------------------------

const NOW_TOKEN = /^NOW([+-](\d+)d)?(?:\|([a-z]+))?$/i;

/**
 * Resolves NOW, NOW-7d or NOW+30d tokens to an ISO string; other values pass
 * through. An optional `|format` suffix selects the output format:
 *   - `NOW-7d|dmy` → DD-MM-YYYY in UTC (tenderinfo.org date params);
 *   - no suffix (or an unknown format) → ISO-8601 UTC, as before.
 */
export function resolveFilterValue(value: string): string {
  const match = NOW_TOKEN.exec(value.trim());
  if (!match) return value;
  const days = match[1] ? parseInt(match[1], 10) : 0;
  const date = new Date(Date.now() + days * 86400000);
  const format = (match[3] || '').toLowerCase();
  if (format === 'dmy') {
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${dd}-${mm}-${date.getUTCFullYear()}`;
  }
  return date.toISOString();
}

// ---------------------------------------------------------------------------
// Environment interpolation (${VAR} → process.env[VAR])
// ---------------------------------------------------------------------------

const ENV_PLACEHOLDER = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/**
 * Replaces ${VAR} placeholders with process.env values so secrets never have
 * to be stored in dbo.TenderSource.ApiConfig. Unknown variables resolve to an
 * empty string (the request then fails visibly instead of leaking a literal
 * placeholder). Exposed for unit tests.
 */
export function interpolateEnv(value: string): string {
  return value.replace(ENV_PLACEHOLDER, (_, name: string) => process.env[name] ?? '');
}

// ---------------------------------------------------------------------------
// Query serialization (ASP.NET-style nested index binding)
// ---------------------------------------------------------------------------

/** Serializes filter groups to [key, value] pairs: filter[i][j].field/value/operator. */
export function serializeFilter(filter: unknown): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  if (!Array.isArray(filter)) return entries;
  filter.forEach((group, gi) => {
    if (!Array.isArray(group)) return;
    group.forEach((cond, ci) => {
      if (!cond || typeof cond !== 'object') return;
      const c = cond as Partial<ApiFilterCondition>;
      if (!c.field) return;
      const base = `filter[${gi}][${ci}]`;
      entries.push([`${base}.field`, String(c.field)]);
      entries.push([`${base}.value`, resolveFilterValue(String(c.value ?? ''))]);
      entries.push([`${base}.operator`, String(c.operator ?? '=')]);
    });
  });
  return entries;
}

/** Serializes orderBy entries to [key, value] pairs: orderBy[i].field/direction. */
export function serializeOrderBy(orderBy: unknown): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  if (!Array.isArray(orderBy)) return entries;
  orderBy.forEach((o, i) => {
    if (!o || typeof o !== 'object') return;
    const order = o as Partial<ApiOrderBy>;
    if (!order.field) return;
    entries.push([`orderBy[${i}].field`, String(order.field)]);
    entries.push([`orderBy[${i}].direction`, order.direction === 'asc' ? 'asc' : 'desc']);
  });
  return entries;
}

// ---------------------------------------------------------------------------
// Template expansion
// ---------------------------------------------------------------------------

function fieldToString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  // Source strings carry stray leading/trailing whitespace ("Org Name ").
  return String(value).trim();
}

function evaluateToken(expr: string, item: unknown): string {
  const parts = expr.split('|');
  let value = fieldToString(resolvePath(item, parts[0].trim()));
  for (const pipe of parts.slice(1)) {
    const colon = pipe.indexOf(':');
    const name = (colon === -1 ? pipe : pipe.slice(0, colon)).trim();
    const argString = colon === -1 ? '' : pipe.slice(colon + 1);
    switch (name) {
      case 'lower':
        value = value.toLowerCase();
        break;
      case 'upper':
        value = value.toUpperCase();
        break;
      case 'trim':
        value = value.trim();
        break;
      case 'bool': {
        const [y = 'true', n = 'false'] = argString.split(',');
        value = value === 'true' || value === '1' ? y : n;
        break;
      }
      case 'eq': {
        const [compare = '', thenValue = '', elseValue = ''] = argString.split(',');
        value = value === compare ? thenValue : elseValue;
        break;
      }
      default:
        // Unknown pipe: leave the value untouched (forward compatible).
        break;
    }
  }
  return value;
}

/**
 * Expands {field} / {field|pipe:args} placeholders in a template.
 * Innermost tokens are expanded first, so branches may themselves contain
 * tokens (e.g. {app|eq:Purchasing,{sourceId},{lotId}}).
 */
export function expandTemplate(template: string, item: unknown): string {
  let out = template;
  for (let guard = 0; guard < 25; guard++) {
    const match = /\{([^{}]*)\}/.exec(out);
    if (!match || match[1] === '') break;
    const replacement = evaluateToken(match[1], item);
    out = out.slice(0, match.index) + replacement + out.slice(match.index + match[0].length);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Inertia (Laravel/Inertia) HTML response extraction
// ---------------------------------------------------------------------------

const DATA_PAGE_ATTR = /data-page="([^"]+)"/;

/**
 * Decodes the HTML entities Laravel escapes the data-page attribute with
 * (&quot;, &#039;, &amp;, &lt;/&gt;, &#x2F;, named unicode) back to the
 * original UTF-8 JSON string.
 */
export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&'); // must run last
}

/** Extracts and parses the JSON payload from an Inertia data-page attribute. */
export function parseInertiaHtml(html: string, sourceUrl: string): unknown {
  const match = DATA_PAGE_ATTR.exec(html);
  if (!match) {
    throw new Error(`Inertia data-page attribute not found in response from ${sourceUrl}`);
  }
  try {
    return JSON.parse(decodeHtmlEntities(match[1]));
  } catch {
    throw new Error(`Invalid JSON in data-page attribute from ${sourceUrl}`);
  }
}

// ---------------------------------------------------------------------------
// Item mapping
// ---------------------------------------------------------------------------

/** Builds a RawOpportunity from a single API item using the field mapping. */
function mapItem(item: unknown, mapping: Record<string, ApiFieldMapping>): RawOpportunity {
  function getField(fieldName: string): string | null {
    const config = mapping[fieldName];
    if (!config) return null;
    if (config.template) return expandTemplate(config.template, item);
    if (!config.path) return config.default ?? null;
    const value = resolvePath(item, config.path);
    if (value == null) return config.default ?? null;
    return fieldToString(value);
  }

  return {
    title: getField('title') || '(Untitled)',
    organization: getField('organization'),
    country: getField('country'),
    sector: getField('sector'),
    description: getField('description'),
    sourceUrl: getField('sourceUrl') || '',
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
    region: getField('region'),
    opportunityType: getField('opportunityType'),
  };
}

/** Exposed for unit tests. */
export { mapItem, resolvePath };

/**
 * Tests an item against a client-side itemFilter (string-coerced equality;
 * a missing path yields '' and therefore only matches equals: "").
 * Exposed for unit tests.
 */
export function matchesItemFilter(item: unknown, filter: ApiItemFilter): boolean {
  return fieldToString(resolvePath(item, filter.path)) === filter.equals;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class ApiAdapter implements SourceAdapter {
  readonly type = 'api' as const;

  async fetch(source: TenderSourceConfig): Promise<RawOpportunity[]> {
    const config: ApiConfig = source.ApiConfig
      ? JSON.parse(source.ApiConfig)
      : {};

    const headers: Record<string, string> = Object.fromEntries(
      Object.entries(config.headers ?? {}).map(([key, value]) => [key, interpolateEnv(value)]),
    );
    const mapping = config.fields || {};
    const inertiaHtml = config.responseFormat === 'inertia-html';
    // Paging params are only sent when pagination is configured — sources that
    // predate the feature keep their exact single-request behavior.
    const paging = config.pagination !== undefined;
    const pageMode = config.pagination?.mode === 'page';
    const offsetMode = config.pagination?.mode === 'offset';
    const pageSize = Math.max(1, Math.floor(config.pagination?.pageSize ?? 50));
    const maxPages = Math.max(1, Math.floor(config.pagination?.maxPages ?? 1));
    let skip = Math.max(0, Math.floor(config.pagination?.startSkip ?? 0));
    let page = Math.max(1, Math.floor(config.pagination?.startPage ?? 1));

    const collected: RawOpportunity[] = [];

    for (let iter = 0; iter < maxPages; iter++) {
      const searchParams = new URLSearchParams();
      if (config.params) {
        for (const [key, value] of Object.entries(config.params)) {
          searchParams.set(key, interpolateEnv(resolveFilterValue(value)));
        }
      }
      for (const [key, value] of serializeFilter(config.filter)) searchParams.set(key, value);
      for (const [key, value] of serializeOrderBy(config.orderBy)) searchParams.set(key, value);
      if (paging && pageMode) {
        searchParams.set('page', String(page));
      } else if (paging && offsetMode) {
        searchParams.set('offset', String(skip));
        searchParams.set('limit', String(pageSize));
      } else if (paging) {
        searchParams.set('skip', String(skip));
        searchParams.set('top', String(pageSize));
      }

      const baseUrl = interpolateEnv(source.URL);
      const url = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${searchParams.toString()}`;
      const data = inertiaHtml
        ? parseInertiaHtml(await fetchWithTimeout(url, { headers }), url)
        : await fetchJsonWithTimeout(url, { headers });

      const itemsPath = config.itemsPath || '';
      const itemsRaw = itemsPath ? resolvePath(data, itemsPath) : data;

      if (!Array.isArray(itemsRaw)) {
        throw new Error(`API response items path "${itemsPath}" did not resolve to an array`);
      }

      const maxAgeCutoff =
        config.maxAgeDays !== undefined ? Date.now() - config.maxAgeDays * 86400000 : null;

      for (const item of itemsRaw) {
        if (config.itemFilter && !matchesItemFilter(item, config.itemFilter)) continue;
        const opp = mapItem(item, mapping);
        if (maxAgeCutoff !== null && opp.publicationDate && opp.publicationDate.getTime() < maxAgeCutoff) {
          continue; // outside the rolling window — no historical backfill
        }
        if (opp.title && opp.sourceUrl) collected.push(opp);
      }

      // Termination: empty page, or we have reached the server-reported total.
      if (itemsRaw.length === 0) break;
      if (pageMode) {
        page += 1;
      } else {
        skip += itemsRaw.length;
      }
      const total = (data as { total?: unknown })?.total;
      if (typeof total === 'number' && (pageMode ? (page - 1) * pageSize >= total : skip >= total)) break;
      if (iter < maxPages - 1) await rateLimitDelay(source.RateLimitMs);
    }

    return collected;
  }
}
