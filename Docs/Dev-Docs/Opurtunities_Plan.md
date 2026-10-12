Below is the consolidated **OpenCode Build Mode prompt**, combining the original Opportunity Intelligence requirements with the verified source/API information and the strict implementation workflow.

# MIS — OPPORTUNITY INTELLIGENCE EXPANSION

Expand the existing MIS **Tender Intelligence** module into a richer, standalone **Opportunity Intelligence** system.

The goal is to evolve MIS from a tender-only system into a broader intelligence platform covering procurement, buyer/RFQ opportunities, trade intelligence, and future market intelligence.

---

# 1. CRITICAL IMPLEMENTATION RULES

Before changing anything:

1. **Inspect the existing MIS codebase completely.**
2. Inspect:
   - architecture
   - database/schema
   - `TenderOpportunity` / opportunity models
   - source models/configuration
   - source adapters
   - APIs
   - authentication/authorization
   - scheduled collection jobs
   - relevance/scoring
   - AI enrichment
   - deduplication
   - frontend routes/pages/components
   - existing e-GP implementation
   - existing 2Merkato implementation
   - existing tests
3. **Do NOT replace, duplicate, or break existing functionality.**
4. **e-GP and 2Merkato are already working and MUST remain working.**
5. Preserve their current behavior, APIs, collection logic, and tests unless an extension is strictly required.
6. Keep the existing **7-day rolling collection window**.
7. Keep the existing scheduled collection mechanism.
8. **DO NOT perform a historical 6-month backfill.**
9. Reuse the existing `TenderOpportunity` / opportunity architecture wherever practical.
10. Do not create CNS and do not depend on any external notification system.
11. Keep Opportunity Intelligence **standalone inside MIS**.
12. Follow existing MIS:
   - coding conventions
   - database patterns
   - API patterns
   - authentication/permissions
   - UI/design system
   - testing patterns
13. Do not modify unrelated MIS modules.
14. Do not invent APIs, endpoints, credentials, source capabilities, or data.
15. Do not bypass:
   - authentication
   - CAPTCHA
   - paywalls
   - robots restrictions
   - access controls
16. Do not scrape a source when its terms prohibit automated collection.
17. Prefer official APIs, RSS, feeds, webhooks, or public structured endpoints.

---

# 2. FIRST ACTION — INSPECT, DO NOT IMPLEMENT

Start by inspecting the current MIS implementation.

Do NOT make major changes yet.

Identify:

### Backend
- existing opportunity/tender models
- database tables
- migrations
- source configuration
- adapter architecture
- normalization
- deduplication
- classification
- relevance scoring
- AI services
- scheduled jobs
- collection windows
- API endpoints
- authentication
- authorization
- audit logging

### Existing Sources
- e-GP
- 2Merkato

Determine exactly how they currently work and what must remain unchanged.

### Frontend
Inspect:
- Tender pages
- source pages
- opportunity details
- filters
- dashboard
- saved opportunities
- authentication/permissions
- reusable components
- design system

### Tests
Identify:
- unit tests
- integration tests
- adapter tests
- collection tests
- API tests
- relevance/scoring tests
- e-GP tests
- 2Merkato tests

---

# 3. INSPECTION DELIVERABLE

Before making major changes, return a concise report containing:

## A. Current Architecture

Explain the existing Tender Intelligence architecture.

## B. Reusable Components

Identify existing:
- models
- tables
- services
- adapters
- APIs
- jobs
- UI components
- utilities
- tests

that can be reused.

## C. Required Extensions

Clearly separate:

**Extend**
from

**Create**

Avoid creating duplicate systems.

## D. Exact File Plan

List the exact files that would be:

- modified
- created
- migrated
- deprecated, if any

## E. Source Evaluation

For each proposed source provide:

`Source | API/feed | Authentication | Coverage | Access status | Integration decision`

## F. Implementation Phases

Provide a short ordered implementation plan.

**STOP after the inspection/plan. Do not begin major implementation until the plan is complete.**

---

# 4. OPPORTUNITY INTELLIGENCE OBJECTIVE

Evolve MIS from:

`Tender Intelligence`

into:

`Opportunity Intelligence`

The system should eventually cover:

1. Procurement / Tenders
2. Buyer / RFQ Opportunities
3. Trade / Buyer Intelligence
4. Market Intelligence

---

# 5. OPPORTUNITY TYPES

Treat these as distinct opportunity types:

### TENDER
An organization is requesting bids.

### RFQ
An organization is requesting quotations.

### BUYER_LEAD
A buyer is actively looking for suppliers.

### TRADE_INTELLIGENCE
Evidence that a company is actually buying/importing a product.

### MARKET_SIGNAL
Relevant market information such as:
- market movements
- prices
- contract awards
- supplier activity
- competitor activity
- import/export trends
- relevant news/signals

Do not force all intelligence into the existing `TENDER` type if the architecture can support a proper opportunity-type abstraction.

---

# 6. DATA MODEL

Preserve existing fields and add/extend only where required.

Where available, preserve:

- opportunity ID
- opportunity type
- original source
- source ID
- original URL
- title
- description
- publication date
- deadline
- organization
- buyer
- procuring entity
- country
- region
- city
- product
- category
- subcategory
- estimated value
- currency
- procurement method
- documents
- source attribution
- access restrictions
- confidence
- data quality
- relevance score
- status
- timestamps

The architecture must support additional opportunity types and providers without requiring provider-specific duplicate tables.

---

# 7. INTELLIGENCE PIPELINE

Implement/reuse this architecture:

```text
SOURCE
  ↓
FETCH / IMPORT
  ↓
NORMALIZE
  ↓
DEDUPLICATE
  ↓
CLASSIFY OPPORTUNITY TYPE
  ↓
PRODUCT / CATEGORY CLASSIFICATION
  ↓
COUNTRY / MARKET CLASSIFICATION
  ↓
RELEVANCE SCORING
  ↓
AI-ASSISTED ENRICHMENT
  ↓
STORE IN MIS OPPORTUNITY ARCHITECTURE
  ↓
PERSONALIZED FEED
  ↓
DASHBOARD
  ↓
OPTIONAL MIS-INTERNAL ALERTS
```

Do not create an external notification dependency.

---

# 8. AI ENRICHMENT

AI may assist with:

- opportunity classification
- product identification
- category identification
- buyer/procuring organization identification
- country/market classification
- relevance scoring
- opportunity summarization
- business-fit analysis
- explanation of why an opportunity is relevant
- extraction of structured information from descriptions/documents

AI must **never invent missing information**.

Clearly distinguish:

- confirmed
- inferred
- uncertain
- unavailable

If information is unavailable, store/display it as unavailable rather than generating a value.

---

# 9. PRODUCT INTELLIGENCE

Build product/category classification around configurable taxonomy rather than hard-coded provider-specific logic.

## COFFEE

Keywords/categories include:

- Ethiopian coffee
- Arabica
- green coffee
- specialty coffee
- Yirgacheffe
- Sidama
- Guji
- Harrar
- Limu
- Jimma
- coffee importer
- coffee buyer
- roaster
- distributor

## BEEF / MEAT

- beef
- frozen beef
- chilled beef
- boneless beef
- meat
- livestock
- cattle
- sheep
- goat
- meat importer
- meat buyer

## PENS / STATIONERY

- pens
- ballpoint pens
- markers
- stationery
- office supplies
- school supplies

## PLATES / TABLEWARE

- plates
- ceramic plates
- porcelain
- tableware
- dinnerware
- kitchenware

## PAINTS

- paint
- emulsion paint
- industrial paint
- primer
- coating
- road-marking paint
- construction paint
- painting materials

The taxonomy must be extensible so additional products can be added without redesigning the system.

---

# 10. SOURCE INTEGRATION STRATEGY

Do NOT integrate every provider blindly.

For every provider:

1. Verify API/RSS/feed availability.
2. Verify authentication.
3. Verify pricing/free tier where applicable.
4. Verify terms of use.
5. Verify permitted automated access.
6. Verify Ethiopia/global coverage.
7. Verify available fields.
8. Verify update frequency.
9. Verify rate limits.
10. Prefer official structured access.
11. Isolate provider-specific logic inside adapters.
12. Add provider health/error handling.

If API access is not publicly documented:

- do not invent an endpoint
- record the legitimate public URL
- mark API as `NOT_VERIFIED`
- request/await official API documentation before building an API adapter

---

# 11. VERIFIED SOURCE REGISTRY

Use the following information as the initial source registry.

## 11.1 TenderMetro

### API base

```text
https://www.tendermetro.com/api/public/v1
```

### Documented endpoints

```text
GET https://www.tendermetro.com/api/public/v1/opportunities
GET https://www.tendermetro.com/api/public/v1/opportunities/{ref}

GET https://www.tendermetro.com/api/public/v1/buyers
GET https://www.tendermetro.com/api/public/v1/buyers/{slug}

GET https://www.tendermetro.com/api/public/v1/companies
GET https://www.tendermetro.com/api/public/v1/companies/{slug}

GET https://www.tendermetro.com/api/public/v1/awards
GET https://www.tendermetro.com/api/public/v1/activity
GET https://www.tendermetro.com/api/public/v1/market/stats
GET https://www.tendermetro.com/api/public/v1/me/pipeline
```

### Webhook events

```text
opportunity.published
opportunity.closing_soon
award.published
```

### Documentation

```text
https://www.tendermetro.com/docs
```

### Decision

**Strong Phase 2 candidate.**

Verify current credentials/access before implementation.

---

# 11.2 BidsInfo

### API

No verified public production API endpoint.

BidsInfo advertises API / JSON / XML feed access, but do not invent a production endpoint.

### Public source

```text
https://www.bidsinfo.com
```

### Decision

Request official API documentation and credentials.

Do not implement an API adapter until access is verified.

---

# 11.3 TenderInfo

### API

```text
https://www.tenderinfo.org/api/export
```

Examples:

```text
https://www.tenderinfo.org/api/export?kwords={keyword}

https://www.tenderinfo.org/api/export?kwords={keyword}&dtype=json

https://www.tenderinfo.org/api/export?id={id}&dtype=json

https://www.tenderinfo.org/api/export?mode=countries&dtype=json

https://www.tenderinfo.org/api/export?mode=sources&dtype=json
```

Supported output includes:

- XML
- JSON
- JSON2
- CSV

Potential parameters include:

```text
kwords
kwords_minus
api_code
page
price1
price2
date_start
date_end
sort_by
sort_dest
nm
c{country_id}
e{source_id}
```

### Documentation

```text
https://www.tenderinfo.org/api/docs
```

### Decision

Strong Phase 2/3 candidate.

Verify API credentials and commercial restrictions before production integration.

---

# 11.4 Tender Impulse

### UAT Tender API

```text
https://tenderimpulse.com/web-api/tender/v2/uat.php?lastid={lastid}
```

### UAT Contract Award API

```text
https://tenderimpulse.com/web-api/contract-awards/v2/uat.php?lastid={lastid}
```

### UAT News API

```text
https://tenderimpulse.com/web-api/news/v2/uat.php?lastid={lastid}
```

### Documentation

```text
https://tenderimpulse.com/api-documentation
```

IMPORTANT:

These are **UAT endpoints**.

Do not assume they are production endpoints.

Production endpoints and credentials must be obtained from Tender Impulse.

Potential intelligence uses:

- tenders
- contract awards
- supplier intelligence
- market signals
- procurement activity

### Decision

Phase 3 candidate.

---

# 11.5 EthiopiaRFP

### API

No verified public production API endpoint.

The provider advertises API/RSS capabilities.

### Public source

```text
https://www.ethiopiarfp.com
```

### Decision

Evaluate/request official API documentation.

Do not invent an API endpoint.

---

# 11.6 EthiopianTenders

### API

No verified public production API endpoint.

### Public source

```text
https://www.ethiopiantenders.com
```

### Decision

Evaluate/request official API documentation.

Do not invent an API endpoint.

---

# 11.7 Chereta

### API

No verified official public API endpoint.

### Public source

```text
https://www.chereta.com/tenders
```

### Decision

Public-source/manual evaluation first.

Do not build an API adapter until legitimate programmatic access is verified.

---

# 11.8 Volza

Volza is intended primarily for the later **TRADE_INTELLIGENCE** phase.

### Verified APIs

```text
GET https://backend.volza.com/api/v1/countries/list

POST https://backend.volza.com/api/v1/global-shipments
```

### Additional API families to evaluate

- Company Search
- Company Lookup
- Company Transaction Summary
- Buyer/Supplier Insights
- Trade Shipments
- Bulk Export
- Country Data
- Company Contacts

### Documentation

```text
https://docs.volza.com/
```

### Decision

Strong Phase 4 candidate.

Use it to answer questions such as:

- who imports Ethiopian coffee?
- who imports beef/meat?
- which countries are active buyers?
- which companies repeatedly import?
- how frequently do they import?
- what products/HS codes are involved?

Do not expose or store restricted data beyond the provider's license/terms.

---

# 11.9 Trademo

### API

No verified public production endpoint documented.

Trademo advertises APIs covering areas such as:

- Buyer/Supplier
- Profile
- Shipments
- Commodity
- trade intelligence

### Public API page

```text
https://www.trademo.com/apis
```

### Decision

Phase 4.

Request official production API documentation and credentials before implementation.

Do not invent endpoints.

---

# 11.10 Ethiopian Coffee Buyer Leads

This is a **source category**, not a single provider.

There is no single verified API endpoint.

Potential providers must individually be evaluated for:

- API
- RSS/feed
- authentication
- Ethiopia coverage
- coffee buyer coverage
- terms of use
- automated access permission
- available fields

Do not create a fake/common API endpoint for this category.

---

# 12. SOURCE PRIORITY

## Phase 1 — Preserve Existing

### e-GP Ethiopia
Already integrated.

### 2Merkato
Already integrated.

Requirements:

- do not rewrite unnecessarily
- preserve current behavior
- preserve 7-day collection
- preserve scheduled collection
- preserve tests
- verify regression behavior

---

## Phase 2 — Ethiopian + Strong Procurement Sources

Evaluate:

1. TenderMetro
2. TenderInfo
3. EthiopiaRFP
4. EthiopianTenders
5. Chereta
6. other legitimate Ethiopian procurement sources

Only integrate when programmatic access is legitimate and verified.

---

## Phase 3 — Global Procurement Intelligence

Evaluate:

1. BidsInfo
2. TenderMetro
3. TenderInfo
4. Tender Impulse
5. other legitimate global procurement sources

---

## Phase 4 — Buyer / Trade Intelligence

Evaluate:

1. Ethiopian coffee buyer sources
2. Global buyer/RFQ platforms
3. Volza
4. Trademo
5. other legitimate trade-data providers

---

# 13. BUYER / RFQ INTELLIGENCE

Support:

- RFQs
- buyer requests
- buying leads
- commercial purchase requirements
- supplier requests
- importer requirements

These must be represented using:

```text
RFQ
BUYER_LEAD
```

rather than incorrectly treating everything as `TENDER`.

---

# 14. TRADE INTELLIGENCE

The future Trade Intelligence layer should identify actual buying/import activity.

Examples:

```text
Company A → imports Ethiopian coffee
Company B → imports beef
Company C → repeatedly imports pens
Country X → growing demand for Ethiopian coffee
```

Store where legally permitted:

- buyer
- supplier
- origin
- destination
- product
- HS code
- shipment date
- frequency
- quantity/value when available
- country
- source
- confidence
- data quality

Do not invent missing trade data.

---

# 15. MARKET INTELLIGENCE PREPARATION

Prepare the architecture for future:

- import/export trends
- buyer activity
- market prices
- contract awards
- supplier activity
- competitor activity
- market/news signals

Do not overbuild this phase.

Create extensible architecture rather than implementing every future feature immediately.

---

# 16. DEDUPLICATION

Deduplicate across:

- same provider
- different providers
- repeated collection runs
- updated records
- mirrored opportunities

Use stable identifiers where available.

Where no stable ID exists, use a controlled fingerprint based on appropriate fields such as:

```text
source
source reference
title
organization/buyer
publication date
deadline
location
product
```

Do not create false duplicates or merge unrelated opportunities.

---

# 17. RELEVANCE SCORING

Reuse the existing MIS relevance/scoring architecture where possible.

Extend it to consider:

- opportunity type
- product relevance
- business unit
- country
- organization/buyer
- deadline
- value
- source quality
- confidence
- historical user interest
- keyword/category matching

Preserve the existing scoring behavior for existing opportunities unless a backward-compatible extension is required.

---

# 18. UI EVOLUTION

Keep the existing MIS enterprise design system.

Do not redesign the entire application.

Gradually evolve the Tender section into:

```text
Opportunities
├── Tenders
├── Buyer Leads
├── RFQs
├── Export Opportunities
├── Trade Intelligence
├── Saved Opportunities
├── My Opportunities
└── AI Assistant
```

Existing tender routes/pages must remain functional.

Do not remove existing routes.

---

# 19. FILTERS

Support:

- opportunity type
- product/category
- country
- source
- buyer/organization
- deadline
- relevance score
- status
- publication date
- business unit
- confidence/data quality

Use existing filter components where possible.

---

# 20. OPPORTUNITY DASHBOARD

Eventually support:

### KPI cards

- New Opportunities
- Highly Relevant
- Closing Soon
- Buyer Leads
- RFQs
- Export Opportunities
- Trade Intelligence

### Analytics

- Opportunities by source
- Opportunities by product
- Opportunities by country
- Opportunities by opportunity type
- Buyer activity
- Trade activity
- Relevance distribution
- Closing/deadline trends

Use the existing MIS dashboard design patterns.

---

# 21. SOURCE ADAPTER ARCHITECTURE

Provider-specific logic must remain isolated.

Prefer an architecture similar to:

```text
sources/
  egp/
  2merkato/
  tendermetro/
  tenderinfo/
  tenderimpulse/
  bidsinfo/
  ethiopiarfp/
  ethiopiantenders/
  chereta/
  volza/
  trademo/
```

Adapt this to the actual existing MIS structure rather than blindly creating this exact folder structure.

Each adapter should handle:

```text
fetch
validate
normalize
map
classify
deduplicate
error handling
rate limits
source metadata
```

Do not put provider-specific logic into generic opportunity services.

---

# 22. FAILURE HANDLING

One source must never break the entire collection pipeline.

Implement/reuse:

- timeout handling
- retry policy
- rate-limit handling
- authentication failure handling
- malformed response handling
- partial collection
- source health status
- logging
- audit information

A failed provider should be marked failed and allow other providers to continue.

---

# 23. SCHEDULED COLLECTION

Preserve the existing scheduling system.

Maintain:

```text
7-day rolling collection window
```

Do not add:

```text
6-month historical backfill
```

Do not silently change the existing schedule.

New providers should plug into the existing collection mechanism.

---

# 24. SECURITY

Follow existing MIS security architecture.

Ensure:

- authentication
- role-based authorization
- API-key protection
- provider credential protection
- environment variables/secrets
- no credentials committed to source control
- audit logging
- source access restrictions

Never hard-code commercial API credentials.

---

# 25. TESTING

After implementation run:

```text
typecheck
lint
build
all existing tests
```

Add tests for:

### Source adapters
- successful fetch
- authentication failure
- timeout
- rate limit
- malformed response
- empty response
- partial response

### Normalization
- valid records
- missing fields
- invalid fields
- dates
- currencies
- countries
- organizations

### Deduplication
- same source ID
- same opportunity across collection runs
- duplicate across providers
- similar but different opportunities

### Classification
- TENDER
- RFQ
- BUYER_LEAD
- TRADE_INTELLIGENCE
- MARKET_SIGNAL

### Product classification
- coffee
- beef/meat
- pens/stationery
- plates/tableware
- paints

### Relevance
- relevant opportunity
- irrelevant opportunity
- missing data
- confidence handling

### Regression
Specifically verify:

- e-GP continues working
- 2Merkato continues working
- existing scheduled collection continues working
- existing 7-day collection remains unchanged
- existing Tender Intelligence APIs continue working
- existing UI routes continue working
- existing permissions continue working

---

# 26. DOCUMENTATION

Document:

- source registry
- API URLs
- authentication requirements
- provider status
- API limitations
- terms/access restrictions
- collection frequency
- supported fields
- adapter configuration
- environment variables
- testing instructions

For sources without verified APIs, explicitly document:

```text
API_STATUS = NOT_VERIFIED
```

and their legitimate public URL.

---

# 27. IMPLEMENTATION ORDER

Follow this exact sequence:

### Step 1
Inspect existing MIS.

### Step 2
Produce architecture/implementation plan and exact file list.

### Step 3
Wait for approval before major changes.

### Step 4
Extend shared opportunity/source architecture.

### Step 5
Preserve/regression-test e-GP and 2Merkato.

### Step 6
Implement source registry/provider configuration.

### Step 7
Implement verified procurement adapters incrementally.

Recommended order:

```text
TenderMetro
↓
TenderInfo
↓
EthiopianRFP / EthiopianTenders
↓
other verified Ethiopian sources
↓
Tender Impulse
↓
BidsInfo
```

### Step 8
Extend classification/product taxonomy.

### Step 9
Extend relevance/scoring.

### Step 10
Extend Opportunity UI.

### Step 11
Add buyer/RFQ architecture.

### Step 12
Implement Trade Intelligence only after legitimate provider access is obtained.

### Step 13
Prepare Market Intelligence architecture.

### Step 14
Run full regression/testing.

### Step 15
Run:

```text
typecheck
lint
build
all tests
```

---

# 28. FINAL ACCEPTANCE CRITERIA

The implementation is successful only if:

- Existing MIS functionality still works.
- e-GP still works.
- 2Merkato still works.
- Existing Tender APIs remain compatible.
- Existing Tender pages/routes remain accessible.
- Existing authentication/permissions remain intact.
- Existing scheduled collection remains intact.
- 7-day rolling collection remains intact.
- No 6-month backfill is introduced.
- Opportunity types are extensible.
- Sources are adapter-based.
- Duplicate opportunities are prevented.
- Product classification works.
- Country classification works.
- Relevance scoring works.
- AI enrichment does not invent information.
- Source failures do not stop other sources.
- Provider credentials are secure.
- No external CNS dependency is introduced.
- New functionality follows existing MIS architecture/design patterns.
- All existing tests pass.
- New functionality has appropriate automated tests.

---

# START NOW

**Do not implement major changes yet.**

First inspect the existing MIS codebase and return only:

1. **Current architecture**
2. **Existing reusable components**
3. **Required extensions**
4. **Verified source/API status**
5. **Exact files/components to modify**
6. **Exact files/components to create**
7. **Implementation phases**
8. **Potential compatibility risks**

Do not guess about the codebase.

Do not invent APIs.

Do not modify unrelated modules.

After producing the inspection report and implementation plan, **STOP and wait for approval before major implementation.**