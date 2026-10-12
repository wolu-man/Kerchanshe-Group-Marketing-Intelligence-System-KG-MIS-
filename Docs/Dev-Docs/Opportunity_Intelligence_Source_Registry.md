# Opportunity Intelligence — Source Registry & Documentation

Plan reference: `Opurtunities_Plan.md` §10 (source integration strategy), §11 (verified
source registry), §17 (quality), §26 (documentation).

This document covers: source registry, API URLs, authentication, provider status,
API limitations, terms/access restrictions, collection frequency, supported fields,
adapter configuration, environment variables, and testing instructions.

Status legend:

```text
API_STATUS = VERIFIED      integrated adapter, covered by a live test suite
API_STATUS = NOT_VERIFIED  no verified public production API endpoint (plan §10:
                           never invent endpoints; public-source/manual evaluation only)
API_STATUS = CANDIDATE     documented API exists, not integrated yet (phase gating)
```

---

## 1. Integrated sources (dbo.TenderSource)

Seeded idempotently by `npm run db:seed:tenders` (`scripts/seed-tender-sources.ts`).
Rows match on `Name`; re-running refreshes config without duplicating.

| # | Name (DB) | Adapter | URL | Auth | Rate limit | Schedule | API_STATUS |
|---|-----------|---------|-----|------|------------|----------|------------|
| 1 | e-GP Ethiopia — Public Sourcing API | api | `https://production.egp.gov.et/po-gw/cms-v2/api/sourcing/get-sourcing` | none (public JSON) | 1000 ms | 6h | VERIFIED |
| 2 | 2merkato Tenders — Public Free Section | api (inertia-html) | `https://tender.2merkato.com/tenders/free` | none | 2500 ms | 6h | VERIFIED |
| 3 | 2merkato Tenders — Full Public Listing | api (inertia-html) | `https://tender.2merkato.com/tenders` | none | 2500 ms | 6h | VERIFIED |
| 4 | TenderInfo.org — Ethiopia (public API) | api | `https://www.tenderinfo.org/api/export` | none (public mode; custom User-Agent required) | 3000 ms | 6h | VERIFIED |
| 5 | TenderMetro Intelligence — Ethiopia | api | `https://www.tendermetro.com/api/public/v1/opportunities` | Bearer key from `TENDERMETRO_API_KEY` | 4000 ms | 6h | VERIFIED |

All five: `SourceType = 'api'`, `RobotsCompliance = 1`, `QualityScore` default `70`
(migration 047; editable in the sources UI and fed into relevance scoring).
TenderMetro is seeded **inactive** until `TENDERMETRO_API_KEY` is set in `.env`
(key interpolated at request time, never stored in the DB).

### 1.1 e-GP Ethiopia (§11 e-GP)

- Public JSON API behind the `https://production.egp.gov.et/egp/bids/all` portal.
- No authentication. ASP.NET-style `filter`/`orderBy` binding; page size capped at 50.
- Window: `invitationDate >= NOW-7d` (plan guardrail: no historical backfill).
- Pagination: `skip/top`, `maxPages: 20` (≤1000 items per run).
- Fields mapped: `title ← lotName`, `organization ← procuringEntity`, `country = Ethiopia`
  (default), `sector ← procurementCategory`, `description ← lotDescription`,
  `sourceReference ← lotReferenceNo`, `publicationDate ← invitationDate`,
  `deadlineDate ← submissionDeadline`, `sourceUrl` via detail-route template.
- Limitation: no estimated value in the list payload → `EstimatedValue` null.
- Terms: authorized public API of the national e-procurement portal; unrestricted
  host by default (see `TENDERS_RESTRICTED_HOSTS`).

### 1.2–1.3 2merkato (§11 2Merkato)

- Laravel + Inertia SPA; payload extracted from the `data-page="…"` HTML attribute
  (`responseFormat: inertia-html` — avoids X-Inertia version-hash 409s).
- No authentication; robots.txt allows all; `X-RateLimit-Limit: 30/min` → we floor
  at 2.5 s/request (≈24/min).
- Pagination: `page=N` (1-based), 15 items/page, past-the-end page returns 0 items.
- Free section: real `bid_closing_date` on every item; 7-day window ≈ pages 1–7.
- Full listing: subscription tenders redact the deadline key → `deadlineDate` null
  (title/org/publication still collected); `maxPages: 50` ≈ 750 items.
- Fields mapped: `title`, `organization ← company.name_en`, `country = Ethiopia`,
  `sourceReference ← id`, `publicationDate ← created_at`,
  `deadlineDate ← bid_closing_date`, `sourceUrl ← /tenders/{id}`.
- Terms: public listings; detail links are recorded as user-facing URLs and are
  never fetched by the adapter.

### 1.4 TenderInfo.org (§11.3)

- Public mode (no `api_code`). Docs: `https://www.tenderinfo.org/api/docs`.
- Custom User-Agent `KG-MIS-Tender-Intelligence/1.0` is **required** (default UAs
  receive HTTP 403) — sent by `fetchWithTimeout`.
- Params: `kwords=Ethiopia|Ethiopian|Addis` (whole-word OR; phrases with `|` are
  unsafe), `dtype=json`, `date_start=NOW-7d|dmy`, `date_end=NOW|dmy`,
  `sort_by=by_date`, `sort_dest=desc`.
- `c{country_id}` is ignored in public mode → Ethiopia rows filtered client-side
  (`itemFilter: Country_ID == 70`).
- Pagination: `page` mode, 100 items/page with ~80-row overlap → dedup absorbs
  repeats (`maxPages: 3`).
- Limitations: `Price` is `"0"` (undisclosed) → value/currency intentionally
  unmapped; `IsMarketPlace` is 1 on all public rows → type comes from the keyword
  classifier; some weeks legitimately collect 0 rows (status Success).
- Recall: keyword-only — tenders that never mention Ethiopia/Ethiopian/Addis are
  missed. A paid `api_code` would unlock server-side `c{country_id}` (upgrade path:
  add one param in `tenderinfo-source.ts`).

### 1.5 TenderMetro Intelligence (§11.1)

- Docs: `https://app.tendermetro.com/docs`, data model
  `https://app.tendermetro.com/data-model`.
- Auth: `Authorization: Bearer ${TENDERMETRO_API_KEY}` (or `x-api-key`) — the
  placeholder is interpolated from `process.env` at request time.
- Quota 1,000 req/h per key → 4 s pacing (15/min).
- Pagination: `offset/limit`, server cap 100, stable disjoint pages, `maxPages: 5`.
- Filters: `country=Ethiopia` (server-side, ~244 rows). **No publication-date
  filter exists** → recency enforced client-side via `maxAgeDays: 7`.
- Fields mapped: `title`, `organization ← buyers.name`, `country`, `sector`,
  `description ← summary`, `sourceReference ← ref`, `publicationDate ← published_at`,
  `deadlineDate ← closes_at` (~92% present), `sourceUrl ← source_url`,
  `region ← region` (macro-geography, e.g. Africa/Global).
- Limitations: `value_usd` deliberately **not** mapped (USD would corrupt the
  ETB-based `EstimatedValue` and profile budget ranges); `procurement_type/status`
  are not opportunity-type enums → classifier decides type.
- robots.txt: `User-agent: * Allow: /` (permissive).

---

## 2. Not integrated — NOT_VERIFIED / CANDIDATE (plan §11.4–11.10)

No adapter, no DB row, no collection. Documented so evaluation is reproducible.
Per plan §10: mark `API_STATUS = NOT_VERIFIED` and keep the legitimate public URL;
never invent an endpoint.

| Provider | API endpoint(s) | API_STATUS | Public source | Decision |
|----------|-----------------|------------|---------------|----------|
| Tender Impulse (§11.4) | UAT only: `https://tenderimpulse.com/web-api/tender/v2/uat.php?lastid={lastid}` (+ contract-awards, news) | NOT_VERIFIED (UAT ≠ production) | https://tenderimpulse.com/api-documentation | Phase 3 candidate; obtain production endpoints/credentials first |
| EthiopiaRFP (§11.5) | none verified (advertises API/RSS) | NOT_VERIFIED | https://www.ethiopiarfp.com | Evaluate/request official API docs |
| EthiopianTenders (§11.6) | none verified | NOT_VERIFIED | https://www.ethiopiantenders.com | Evaluate/request official API docs |
| Chereta (§11.7) | none verified | NOT_VERIFIED | https://www.chereta.com/tenders | Public-source/manual evaluation first; no API adapter until programmatic access is verified |
| Volza (§11.8) | `GET https://backend.volza.com/api/v1/countries/list`, `POST https://backend.volza.com/api/v1/global-shipments` + families (docs: https://docs.volza.com/) | CANDIDATE | https://docs.volza.com/ | Phase 4 (TRADE_INTELLIGENCE); respect licence/terms, no restricted-data retention |
| Trademo (§11.9) | no verified production endpoint (advertised API families) | NOT_VERIFIED | https://www.trademo.com/apis | Phase 4; request official production docs/credentials |
| Ethiopian Coffee Buyer Leads (§11.10) | source **category**, no single endpoint | NOT_VERIFIED | n/a (providers evaluated individually) | Do not create a fake/common endpoint for the category |

---

## 3. Collection frequency & scheduling

- Per-source `Schedule` label: `1h / 6h / 12h / 24h` (default `6h` for all seeded
  sources).
- Global cron: `TENDERS_COLLECTION_CRON` (default `0 */6 * * *`), overridable at
  runtime via SystemConfig `tenders.collectionCron`.
- Scheduler enabled only when `TENDERS_COLLECTION_ENABLED=true` (default `false`).
- Deadline reminders: `TENDERS_REMINDER_CRON` (default `0 9 * * *`), lead
  `TENDERS_REMINDER_LEAD_DAYS` (default 7).
- Rolling 7-day windows everywhere (e-GP filter, TenderInfo dates, TenderMetro
  `maxAgeDays`) — **no historical backfill** (plan guardrail).
- Manual: `Collect Now` on `/tenders/sources` → `POST /tenders/sources/:id/collect`
  (also `collectAllSources()` / `collectFromSourceById()` in
  `collection.service.ts`).

## 4. Dedup, hashing & quality

- `ContentHash = SHA256(normalized title | organization | deadline)`; unique in
  `dbo.TenderOpportunity`. Region/opportunityType are **excluded** from the hash.
- `insertIfNew` treats an existing hash as a duplicate even when other fields
  differ (cross-provider dedup).
- `QualityScore` (0–100, default 70) per source feeds the relevance `sourceQuality`
  component (4 pts) and is editable in the sources UI.
- `Confidence` (0–100) + `DataQuality` (Complete ≥70 / Partial ≥40 / Sparse) are
  computed on insert (`quality.ts`, mirrored SQL backfill in migration 047).

## 5. Adapter configuration (dbo.TenderSource.ApiConfig JSON)

Adapters: `api` (default), `rss`, `scraping` — chosen by `SourceType`
(`src/modules/tenders/adapters/`). The API adapter understands:

| Key | Type | Purpose |
|-----|------|---------|
| `itemsPath` | string | dotted path to the items array in the response |
| `responseFormat` | `'json' \| 'inertia-html'` | parse body JSON or extract `data-page` JSON from HTML |
| `fields` | map | per-output-field mapping: `{ path }`, `{ default }`, or `{ template }` with `{token}`/`{a\|fn:arg}` substitutions |
| `params` | map | query-string parameters (static or `NOW-7d\|dmy`-style tokens) |
| `headers` | map | request headers; `${ENV_VAR}` placeholders resolved from `process.env` at request time |
| `pagination` | object | `mode: 'skip' \| 'page' \| 'offset'`, `pageSize`, `maxPages`, `startSkip`, `startPage` |
| `filter` | condition[][] | server-side filter groups (`field/operator/value`, e.g. `NOW-7d`) |
| `orderBy` | {field, direction}[] | stable server-side ordering |
| `itemFilter` | {path, equals} | client-side row filter (e.g. TenderInfo `Country_ID = 70`) |
| `maxAgeDays` | number | client-side recency gate when no server-side date filter exists |

Mapped output fields (normalized): `title`, `organization`, `country`, `sector`,
`description`, `sourceUrl`, `sourceReference`, `publicationDate`, `deadlineDate`,
`estimatedValue`, `currency` (+ classifier outputs `opportunityType`,
`productGroup`, and `region` where available). Unmapped fields stay null — the
AI never invents them.

Config source-of-truth modules (seed script and live tests import the same
constants, so seeded and tested config cannot drift):
`egp-source.ts`, `twomerkato-source.ts`, `tenderinfo-source.ts`,
`tendermetro-source.ts`.

## 6. Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `TENDERS_COLLECTION_ENABLED` | `false` | enable the scheduled collector |
| `TENDERS_COLLECTION_CRON` | `0 */6 * * *` | collection cron |
| `TENDERS_REMINDER_CRON` | `0 9 * * *` | daily deadline-reminder cron |
| `TENDERS_REMINDER_LEAD_DAYS` | `7` | remind N days before deadline (also relevance deadline component) |
| `TENDERS_FETCH_TIMEOUT_MS` | `30000` | per-request timeout |
| `TENDERS_DEFAULT_RATE_LIMIT_MS` | `2000` | default pacing between requests |
| `TENDERS_HIGH_RELEVANCE_THRESHOLD` | `70` | “high relevance” threshold |
| `TENDERS_RESTRICTED_HOSTS` | *(empty)* | comma list to (re-)restrict hosts; e-GP/2merkato/TenderInfo are unrestricted by default as authorized public APIs |
| `TENDERMETRO_API_KEY` | *(empty)* | TenderMetro Bearer key — never stored in DB; source stays inactive while empty |
| `GEMINI_API_KEY` / `GEMINI_MODEL` etc. | *(empty)* | AI provider for enrichment/assistant (one of `auto\|ollama\|gemini\|groq`) — key never leaves the server |

## 7. Terms & access restrictions

- Automated collection only where terms allow it (plan rule 16). robots.txt is
  respected whenever `RobotsCompliance = 1`.
- Do not scrape `NOT_VERIFIED` sources; their URLs above are for manual
  evaluation only.
- API keys live only in `.env`; ApiConfig may contain `${VAR}` placeholders but
  never literal secrets (server-side only — `ApiConfig` is not exposed to the
  frontend).
- No historical bulk backfill; every run is a 7-day rolling window.

## 8. Testing instructions

Live suites require DB access and the system CA store:

```powershell
$env:NODE_OPTIONS = '--use-system-ca'
npx tsx src/modules/tenders/egp.live.test.ts
npx tsx src/modules/tenders/2merkato.live.test.ts
npx tsx src/modules/tenders/tenderinfo.live.test.ts
npx tsx src/modules/tenders/tendermetro.live.test.ts
npx tsx src/modules/tenders/collection.live.test.ts
npx tsx src/modules/tenders/filters.live.test.ts
npx tsx src/modules/tenders/import.live.test.ts
```

Unit suites (no DB):

```powershell
npx tsx src/modules/tenders/quality.test.ts
npx tsx src/modules/tenders/relevance.test.ts
npx tsx src/modules/tenders/classification.test.ts
npx tsx src/modules/tenders/ai-enrichment.test.ts
npx tsx src/modules/tenders/adapters.test.ts
npx tsx src/modules/tenders/source-config.test.ts
npx tsx src/modules/tenders/import.test.ts
npx tsx src/modules/tenders/policy.test.ts
npx tsx src/modules/tenders/policy-restricted.test.ts
```

Gates: `npm run lint` (= `tsc --noEmit`), `npm run typecheck`, `npm run build`,
`npm run db:migrate`, `npm run db:seed:tenders`, `npm run db:reclassify:tenders`,
`npm run db:rescore:tenders`. Frontend: `npx tsc --noEmit` and `next build`.

Manual smoke: `/tenders/sources` (Test → Collect Now), `/tenders` explorer filters,
opportunity detail → “Why relevant?”, AI enrichment (roles: Administrator /
Marketing Manager / Marketing Analyst).
