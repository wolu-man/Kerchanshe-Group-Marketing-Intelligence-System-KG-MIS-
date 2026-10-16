# KG-MIS — End-to-End User Guide & System Demonstration Manual

**Product:** KG-MIS — Hybrid Market Intelligence System (Kerchanshe Group Marketing)
**Applies to:** The implemented web portal (`frontend/`) + API (`backend/`) as built.
**Status legend**
- ✅ **Implemented** — verified against code; usable end to end.
- 🟡 **Partially implemented / Mock** — works in development via mock adapters; live provider wiring is stubbed.
- ⛔ **Not functional / Pending implementation** — designed but not wired.

> This guide documents only features that actually exist in the codebase. Reference
> documents under `Docs/` (FDS, TDS, SRS, Integration Design) describe intent; where the
> implementation differs, this guide and the code are authoritative.
>
> Companion guides with deeper detail: `Docs/User Guide-Docs/KG-MIS_Corporate_Marketing_Plan_User_Guide_v1_0.md`,
> `Docs/AI_Form_Assistant.md`, `Docs/AI_Renewal_Guide.md`, `Docs/Dev-Docs/Opportunity_Intelligence_Source_Registry.md`.

---

## Table of contents

1. [System overview](#1-system-overview)
2. [Architecture & integration modes](#2-architecture--integration-modes)
3. [Getting started & logins](#3-getting-started--logins)
4. [Navigation & global UI](#4-navigation--global-ui)
5. [Roles & permissions](#5-roles--permissions)
6. [Module: Authentication & session](#6-module-authentication--session)
7. [Module: Landing page](#7-module-landing-page)
8. [Module: Dashboard](#8-module-dashboard)
9. [Module: Notifications](#9-module-notifications)
10. [Module: Market Visits](#10-module-market-visits)
11. [Module: Interviews](#11-module-interviews)
12. [Module: Multimedia (Photos & Videos)](#12-module-multimedia-photos--videos)
13. [Module: Forms & Surveys (NexForm)](#13-module-forms--surveys-nexform)
14. [Module: Competitor Pricing](#14-module-competitor-pricing)
15. [Module: Weekly Sales](#15-module-weekly-sales)
16. [Module: Officer Performance](#16-module-officer-performance)
17. [Module: Reports & Power BI](#17-module-reports--power-bi)
18. [Module: Admin Centre](#18-module-admin-centre)
19. [Module: D365FO Sync](#19-module-d365fo-sync)
20. [Module: Opportunities & Tenders](#20-module-opportunities--tenders)
21. [Module: AI assistant & predictive insights](#21-module-ai-assistant--predictive-insights)
22. [Module: Support & public pages](#22-module-support--public-pages)
23. [Key workflows (step by step)](#23-key-workflows-step-by-step)
24. [Validation, errors & toasts](#24-validation-errors--toasts)
25. [Data reference](#25-data-reference)
26. [End-to-end demo scenario](#26-end-to-end-demo-scenario)
27. [Quick reference](#27-quick-reference)
28. [Appendix: capability-by-feature checklist](#28-appendix-capability-by-feature-checklist)

---

## 1. System overview

KG-MIS is a web platform for the Marketing department to:

- Capture **market visit reports** at retail/wholesale outlets.
- Conduct and record **customer/distributor interviews** with Q&A pairs and sentiment tracking.
- Capture **multimedia evidence** (photos, videos, audio) with validation workflows.
- Build and run **dynamic surveys/forms** (NexForm) and collect responses inline.
- Track **competitor pricing** and auto-flag price gaps vs. own (D365FO) prices.
- Record **weekly sales** entries with revenue computation per product/outlet.
- Dispatch **notifications** (Email) on business events.
- View **reports and Power BI-style dashboards** (sales, pricing, visits, forms, interviews, multimedia, KPIs).
- Track **officer performance** with KPI scoring, plan assignments, and activity logging.
- **Synchronize master data** (products, customers, sales) from D365FO.
- Discover, qualify and track **business opportunities** (tenders, RFQs, buyer leads,
  export and trade intelligence) collected from external data sources.
- Use **AI assistance** across the product: form building, writing help, response
  analysis, natural-language "Ask AI" over MIS data, and deterministic **predictive
  forecasts** on the dashboard.
- Administer **users, roles, business groups, customers, products, competitors, regions, outlets, notification config, schedules, audit trail** via an Admin Centre.
- Run the annual **Corporate Marketing Activities Plan** (monthly tasks, verification,
  events register, workbook import).
- Self-serve **Help Center** (guides + FAQs) and **interactive product tours**.

Users are authenticated with corporate SSO (CUAS) in production and a local
development login in development.

---

## 2. Architecture & integration modes

```
Field / Marketing users → Next.js web portal (:3000) → Express/TypeScript API (:4000) → MS SQL Server (KG_MIS)
                                                      ↕ D365FO  (master data, OData, read-only)
                                                      ↕ CUAS    (SSO login + role claims)
                                                      ↕ SMTP    (email delivery)
                                                      ↕ Power BI (reporting views, embed tokens)
                                                      ↕ AI providers (Ollama / Gemini / Groq — assistant, Ask AI, enrichment)
                                                      ↕ Tender sources (e-GP, 2merkato, TenderInfo, TenderMetro — public APIs)
```

| Layer     | Technology                          | Status                        |
| --------- | ----------------------------------- | ----------------------------- |
| Web       | Next.js 14, TypeScript              | ✅ Built                      |
| API       | Node.js, Express, TypeScript        | ✅ Built (`/api/v1`)          |
| Database  | MS SQL Server (`KG_MIS`)            | ✅ Migrations + seed (50 migrations, 60+ tables) |
| Identity  | CUAS (SSO)                          | 🟡 Mock in dev; live provider partial |
| Notify    | SMTP (Email)                        | 🟡 Mock delivery in dev       |
| Master data | D365FO via OData/REST             | 🟡 Mock sync in dev           |
| Analytics | Power BI                           | 🟡 Seeded catalogue + placeholder embed |
| AI        | Ollama / Gemini / Groq (server-side) | ✅ Live when keys configured; 503 `AI_PROVIDER_UNAVAILABLE` otherwise |
| Opportunity sources | Public tender APIs (OData/REST) | ✅ 5 seeded sources; scheduled collection off by default |

**Integration mode flags** (see `backend/.env.example`):
- `D365FO_MOCK=true` — deterministic sample master-data sync.
- `CUAS_SSO_ENABLED=false` — local login against dev users.
- `POWERBI_MOCK=true` — seeded Power BI catalogue + placeholder embed tokens.
- `AI_PROVIDER=auto|ollama|gemini|groq` with `GEMINI_API_KEY` / `GROQ_API_KEY` /
  `OLLAMA_BASE_URL` — AI assistant, Ask AI, enrichment and renewal. No mock path: with
  no provider configured the API returns `503 AI_PROVIDER_UNAVAILABLE`.
- `TENDERS_COLLECTION_ENABLED=false` — scheduled opportunity collection (default off;
  collect manually from **Data sources**).

Setting a flag to `false` activates the live connector. The connector modules
(`backend/src/integrations/*`) contain `TODO` stubs marking the exact insertion
points for the real API calls; ⛔ live HTTP calls are not yet implemented.

### Repository layout (actual)

```
backend/      Express/TypeScript API + migrations + seed + cron
frontend/     Next.js/TypeScript portal
Docs/         Design documents + this guide
```

---

## 3. Getting started & logins

### Prerequisites
- Node.js 20+ (tested on 26.x), npm 10+
- MS SQL Server (Express is sufficient), database `KG_MIS`

### Setup
```sh
cd backend
npm install
cp .env.example .env        # set DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME
                            # optional: AI_PROVIDER, GEMINI_API_KEY / GROQ_API_KEY, TENDERS_*
npm run db:migrate          # runs backend/migrations/*.sql
npm run db:seed             # backend/seed/seed.sql + scripts/seed.js (sets dev passwords)

# Optional reference/feature seeds (idempotent):
npm run db:seed:tenders     # 5 opportunity data sources (e-GP, 2merkato×2, TenderInfo, TenderMetro)
npm run db:seed:competitors # competitor product master from Excel sources
npm run db:seed:history     # ~1,400 deterministic rows powering predictive forecasts
```

### Run
```sh
cd backend && npm run dev   # API on :4000
cd frontend && npm run dev  # web portal on :3000
```
Open **http://localhost:3000** and sign in. The Next.js app calls
`http://localhost:4000/api/v1` by default (`NEXT_PUBLIC_API_URL`).

### Development accounts

Dev password for **all** accounts: `Password123!`

| Username     | Role                | Assigned regions                  |
| ------------ | ------------------- | --------------------------------- |
| `admin`      | Administrator       | All (no restriction)              |
| `tsegaye.n`  | Marketing Manager   | All                               |
| `analyst1`   | Marketing Analyst   | All                               |
| `field1`     | Field Officer       | Addis Ababa (1), Oromia (2)       |
| `field2`     | Field Officer       | Amhara (3), SNNPR (4)             |
| `viewer1`    | Executive Viewer    | All                               |

Region assignments matter for **row-level data scoping**: list queries for
Field Officers (and, where applicable, `region` scopes) filter rows to the
user's assigned regions. `UserRegionAssignment` holds the mapping.

---

## 4. Navigation & global UI

### Sidebar navigation (by section)

Sections are collapsible; the open/closed state is persisted per user
(`kgmis_sidebar_open_<userId>`), and the current page's section stays open automatically.

| Section          | Item              | Roles visible to                                            |
| ---------------- | ----------------- | ----------------------------------------------------------- |
| **Overview**     | Dashboard         | All five roles                                               |
|                  | Notifications     | All five roles                                               |
| **Field intelligence** | Market visits | Administrator, Marketing Manager, Marketing Analyst, Field Officer |
|                  | Interviews        | All five roles                                               |
|                  | Photos & videos   | All five roles                                               |
|                  | Forms & surveys   | All five roles                                               |
|                  | Competitor pricing| Administrator, Marketing Manager, Marketing Analyst, Field Officer |
|                  | Weekly sales      | All five roles                                               |
|                  | My performance    | Administrator, Marketing Manager, Marketing Analyst, Field Officer |
| **Analytics**    | Reports & Power BI| Administrator, Marketing Manager, Marketing Analyst, Viewer |
| **Opportunities** | Tenders, Buyer Leads, RFQs, Export Opportunities, Trade Intelligence, Saved Opportunities, My Opportunities | All five roles |
|                  | AI Assistant      | Administrator, Marketing Manager, Marketing Analyst          |
|                  | Data sources, Interest profiles, Import data | Administrator, Marketing Manager           |
| **Administration** | Admin centre    | Administrator only                                          |
|                  | Planning & performance | Administrator only                                      |
|                  | Corporate marketing plan | Administrator only                                    |
|                  | Business groups   | Administrator only                                          |
|                  | Customers         | Administrator only                                          |
|                  | Products          | Administrator only                                          |
|                  | Competitors       | Administrator, Marketing Manager                            |
|                  | Product catalogue | Administrator only                                          |
|                  | Regions & outlets | Administrator only                                          |
|                  | AI Renewal        | Administrator only                                           |
| **Support**      | Help Center, Take a Tour | All five roles                                       |

> **Note:** `/admin/relationship-configuration` still exists (Administrator data via API)
> and has its own tour + help article, but it is **no longer linked in the sidebar** —
> reach it by URL directly.

### Global components
- **Shell** — persistent layout with collapsible sidebar + top bar; the current page title and
  breadcrumb context come from the routing tree. Top bar includes a role pill, notification bell
  (30s polling with unread count badge, "99+" overflow), dark mode toggle, and
  user avatar dropdown (Profile, Sign out).
- **Global AI launcher** — floating wand button on every signed-in page (Administrator,
  Marketing Manager, Marketing Analyst) opening an "Ask AI" side sheet with the current
  page pre-attached as context; first use shows a welcome dialog.
- **Guided tours** — most pages carry a "Take a tour" / "Show me how" trigger; first-time
  users get a one-off "New here?" prompt offering the welcome tour. Completion state is
  stored per user (`kgmis_tour_done_<userId>`) and shown as a "Completed" badge in `/tours`.
- **Guard** — wraps every internal page. When unauthenticated it redirects to
  `/login`; when a page declares a restricted role (e.g. Admin Centre two-level
  `Guard` + `RequireRole`) it shows a 403-style message instead of content.
- **Toasts** — non-blocking notifications rendered top-right (`.toast-viewport`).
  Used for action confirmation and errors. Duration: success 3s, error 5s, info 3.5s,
  warning 4s; identical messages are de-duplicated.
- **Inline alerts** — page-level fetch failures show a red `.alert.alert-error`
  banner at the top of the relevant card.
- **Dark mode** — toggle in top bar, persisted to `localStorage` (`kgmis_theme`), inline
  script in layout to prevent FOUC (flash of unstyled content). The public pages
  (`/`, `/features`, `/team`) keep a separate toggle (`kgmis_landing_theme`).
- **User profile** — sidebar bottom shows user avatar/name/role, clickable to `/profile`.
- **Keyboard shortcuts** — form builder: `Ctrl/Cmd+Z` undo, `+Shift`/`+Y` redo, `+D`
  duplicate, `+C`/`+V` copy/paste, `+A` select all, `Delete` remove, `Esc` deselect;
  Help search: `↑`/`↓`/`Enter`/`Esc`; modals and the tour popover close on `Esc`;
  screenshot lightbox: `Esc`/`←`/`→`.

---

## 5. Roles & permissions

### Roles (stable IDs)

| ID | Role                | Description                                  |
| -- | ------------------- | -------------------------------------------- |
| 1  | Administrator       | Full system administration                   |
| 2  | Marketing Manager   | Owns forms/visits/pricing + approval         |
| 3  | Marketing Analyst   | Forms, pricing analysis, reports             |
| 4  | Field Officer       | Field data capture (forms, visits, pricing)  |
| 5  | Viewer              | Read-only dashboards & reports               |

### CUAS claim → role mapping (seed)

| CUAS claim      | Role              |
| --------------- | ----------------- |
| `KG-MIS-Admin`  | Administrator     |
| `KG-MIS-Manager`| Marketing Manager |
| `KG-MIS-Analyst`| Marketing Analyst |
| `KG-MIS-Field`  | Field Officer     |
| `KG-MIS-Viewer` | Viewer            |

### Capability model

Capabilities: `full`, `read`, `write-own`, `read-own`, `region`, `none`.
Row-level scope: `all` | `own` | `region` (region = only rows in the user's
`UserRegionAssignment`). The authoritative matrix lives in
`backend/src/security/permissions.ts`; a summary of the meaningful actions:

| Action                  | Administrator | Marketing Manager | Marketing Analyst | Field Officer | Viewer |
| ----------------------- | ------------- | ----------------- | ----------------- | ------------- | ------ |
| marketVisits.create/update/submit | full | full | — | write-own | — |
| marketVisits.review     | full          | full             | —                 | —             | —     |
| marketVisits.approve/reject | full     | full             | —                 | —             | —     |
| marketVisits.view       | full          | full             | read              | read-own      | —     |
| interviews.create/update/submit | full | full | — | write-own | — |
| interviews.review       | full          | full             | —                 | —             | —     |
| interviews.approve/reject | full       | full             | —                 | —             | —     |
| interviews.view         | full          | full             | read              | read-own      | read  |
| multimedia.upload/update | full        | full             | —                 | write-own     | —     |
| multimedia.validate     | full          | full             | —                 | —             | —     |
| multimedia.view         | full          | full             | read              | read-own      | read  |
| forms.create/update     | full          | full             | full              | —             | —     |
| forms.delete/publish/archive | full    | write-own        | write-own         | —             | —     |
| forms.reassignOwnership | full          | —                | —                 | —             | —     |
| forms.configureAccess   | full          | write-own        | write-own         | —             | —     |
| forms.respond           | —             | —                | —                 | write-own     | —     |
| forms.view              | full          | full             | read-own          | read          | read  |
| forms.viewResponses     | full          | full             | read-own          | read-own      | —     |
| forms.customizeDashboard | full         | full             | write-own         | —             | read  |
| forms.export            | full          | full             | write-own         | —             | read  |
| forms.editResponses     | full          | full             | write-own         | —             | —     |
| forms.share             | full          | full             | write-own         | —             | —     |
| forms.viewAnomalies     | full          | full             | read              | —             | —     |
| forms.manageAnomalies   | full          | full             | —                 | —             | —     |
| forms.crossReports      | full          | full             | full              | —             | —     |
| pricing.record          | full          | full             | —                 | write-own     | —     |
| pricing.view            | full          | full             | read              | region        | —     |
| pricing.configureThresholds | full      | —                | —                 | —             | —     |
| weeklySales.create      | full          | full             | —                 | write-own     | —     |
| weeklySales.delete      | full          | full             | —                 | write-own     | —     |
| weeklySales.view        | full          | full             | read              | read-own      | read  |
| competitors.view        | full          | full             | read              | read          | —     |
| competitors.manage      | full          | full             | —                 | —             | —     |
| tenders.view            | full          | full             | read              | read          | read  |
| tenders.save            | full          | full             | full              | full          | full  |
| tenders.manageSources / manageProfiles / collect / verify | full | full | —         | —             | —     |
| tenders.aiEnrich        | full          | full             | full              | —             | —     |
| forms.aiAssistant (Ask AI, form assistant, predictive) | full | full | full      | —             | —     |
| ai.renewal              | full          | —                | —                 | —             | —     |
| weeklySales.update      | full          | full             | —                 | write-own     | —     |
| sync.trigger / sync.viewLogs | full     | —                | —                 | —             | —     |
| admin.* (all)           | full          | —                | —                 | —             | —     |
| reports.view            | full          | full             | full              | read          | read  |

**Note:** `ALL_ROLES` (a deprecated constant) maps every role to `full`, but the
**action-level `PERMISSIONS` matrix above is the effective authority** enforced by
the `can()` middleware. Scope predicates also apply at the SQL level (e.g. `own`,
`region`) even when a capability says write/read is allowed.

---

## 6. Module: Authentication & session

### Login page (`/login`)
- Local form: **Username** + **Password**, with placeholder `e.g. field1`.
- On success → toast `Welcome, <name>` → redirect to `/dashboard`.
- On failure → toast with the API error message.
- **"Take a tour"** link starts the sign-in tour without authenticating.
- Public pages (`/`, `/features`, `/team`) redirect authenticated users to `/dashboard`.

### Auth endpoints
| Endpoint | Purpose |
| -------- | ------- |
| `POST /auth/login/local` | Dev/local login (validates against `dbo.[User]`; works when `CUAS_SSO_ENABLED=false`) |
| `GET /auth/login` | Starts CUAS SSO redirect (production) |
| `GET /auth/callback` | CUAS callback; exchanges code, resolves role from RoleMapping; 🟡 live `exchangeCode` is stubbed |
| `GET /auth/me` | Returns current user; re-validates token on each page mount |
| `POST /auth/logout` | Ends session |

### Session
- JWT bearer token issued at login; stored in `localStorage` as `kgmis_token`, user as
  `kgmis_user`. Token TTL 8 hours, session idle timeout 120 minutes.
- On mount, the app calls `/auth/me` to re-validate. A 401 clears local storage and
  sends the user to `/login`.

---

## 7. Module: Landing page

Route: `/` (root). Public, no authentication required. Authenticated users are
redirected to `/dashboard`.

A marketing-style page for KG-MIS with:
- Hero: "Enterprise Marketing Intelligence" badge, product name/tagline, two CTAs —
  **Access Role-based Modules** → `/login` and **Explore Intelligence** → `/features`.
- **Six Pillars of Intelligence** section (renders all 8 pillar cards: KPI, tenders, AI,
  competitor, field, forms, reports, admin) with an expand-all/collapse-all deep-dive.
- **Built for Every Role** — five role cards; trust-stats band (customers, products,
  KPIs, report types, forecast modules, roles); comparison table; CTA band; footer
  (Features, Team).
- **Public AI assistant** — floating "KG-MIS site assistant" chat answering questions
  about the product only (no KG-MIS data; 8-turn/800-char history cap, disclaimer shown).
- **Theme toggle** persisted separately as `kgmis_landing_theme`.

---

## 8. Module: Dashboard

Route: `/dashboard`. Shows a comprehensive summary of market intelligence:

### KPI cards (10)
| KPI | Source |
| ----- | ------ |
| Total Sales (ETB) | D365FO `SalesRecord` |
| Weekly Sales | `WeeklySales` entries |
| Customers | `Customer` count |
| Products | `Product` count |
| Market Visits | `MarketVisitReport` count |
| Interviews | `Interview` count |
| Active Price Gaps | `PriceGapAlert` (Active) |
| Product Availability | `vw_Report_ProductAvailability` |
| KPI Achievement | `KpiResult` average |
| Form Responses | `FormResponse` count |

### Charts & visualisations
- **Predictive insights** — forecast cards for 11 modules (sales, weekly sales, KPI,
  competitor price, pricing, products, customers, surveys, interviews, visits,
  multimedia) with confidence badges (High/Moderate/Low/Insufficient), next-period value
  + range, month-over-month change, model name, anomalies and risk/opportunity signals.
  Hidden entirely when the role lacks permission ("Insufficient" confidence is shown
  instead of a forecast when fewer than 8 periods of data exist). See [§21](#21-module-ai-assistant--predictive-insights).
- **Customers by Type** — donut chart.
- **Products by Category** — bar chart; **Products by Color** when colour data exists.
- **Top Officers** — ranked table with gold/silver/bronze rank badges (→ `/admin/kpi`).
- **Generated alerts** — severity-coloured list of system alerts.
- **Recent notifications** — latest 6 notifications with channel icons.
- **AI Insights** — generated from `/reports/ai-insights`: KPI values plus plain-text
  observations (highest-sales region, best product, average gap, review rate,
  published forms/responses, total shops visited). 🟡 This is a rule-based aggregate,
  **not** ML.
- **Insights & Observations** — additional rule-based narrative lines.

### Quick capture grid
- 10 quick-link tiles to all major features (log visit, conduct interview, submit sales, view KPIs, etc.).
- **Quick actions** — four shortcut cards (log a market visit, conduct an interview,
  submit weekly sales, view KPI performance).
- Skeleton loading states for all sections on initial load.

> **Note:** the quick-link tiles to `/admin/customers`, `/admin/products` and
> `/admin/kpi` are not role-filtered on this page — the target screens still enforce
> Administrator-only access.

---

## 9. Module: Notifications

Route: `/notifications`. Lists the current user's **delivery history**.

### Tabs
- **Unread** — filtered to unread notifications only, with count badge.
- **All** — all notifications.

### Features
- **Event filter** — dropdown with exactly 12 options: `NewReport`, `PriceGapAlert`,
  `SyncFailure`, `NewInterview`, `FORM_PUBLISHED`, `OWNERSHIP_TRANSFERRED`,
  `PARENT_FORM_UPDATED`, `SUBMISSION_CONFIRMED`, `NEW_RESPONSE_RECEIVED`,
  `RESPONSE_LIMIT_WARNING`, `FORM_ASSIGNED`, `RESPONSE_EDITED`.
- **Columns**: Event | Subject | Channel | Status | Attempts | Created.
- **Mark read** — individual mark-as-read button per row; "Mark all read" bulk action.
- **Unread count** — polled every 30 seconds in the Shell top bar; badge shows "99+" for large counts.
- **Pagination**: 20 per page.

### Channels supported: `Email` only
- The channel list, the admin config dropdown and the API validation are **Email-only**
  (`SUPPORTED_CHANNELS = ['Email']`). Legacy `SMS` rows may exist from seed data and
  still render channel icons historically, but no SMS/WhatsApp/Push/In-App message is
  ever dispatched by this build.

### Delivery
- Fire-and-forget with up to 2 attempts (initial + one automatic retry).
- Statuses: `Pending`, `Sent`, `Retried`, `Failed`.
- Recipients: either explicit `userIds` (e.g. form owner, respondent) or all active
  users whose role has an enabled `NotificationConfig` row for the trigger event.
- 🟡 In development every send is **mocked** (status logged, no real email).

### Trigger events (24 canonical types)
`NewReport`, `ReportApproved`, `ReportRejected`, `InterviewApproved`, `InterviewRejected`,
`PriceGapAlert`, `SyncFailure`, `FORM_ASSIGNED`, `FORM_REMINDER`, `SUBMISSION_CONFIRMED`,
`NEW_RESPONSE_RECEIVED`, `RESPONSE_LIMIT_WARNING`, `FORM_PUBLISHED`, `FORM_INVITE`,
`OWNERSHIP_TRANSFERRED`, `ACCESS_DENIED`, `PARENT_FORM_UPDATED`, `PARENT_PROPAGATED`,
`FORM_RESUME`, `REPORT_SHARED`, `RESPONSE_EDITED`, `ANOMALY_FLAGGED`,
`CONSENT_VERSION_BUMPED`, `NEW_PLAN_CREATED`.

This set (`backend/src/security/eventTypes.ts`) is what the Admin Centre config
dropdown offers and what `POST/PUT /admin/notification-config` validates against.
Two additional tender events are dispatched by the Opportunities module and seeded by
migration 033: `TENDER_NEW_MATCH` (high-relevance items found) and
`TENDER_DEADLINE_REMINDER` (daily reminder for saved opportunities).

---

## 10. Module: Market Visits

Route: `/visits`. Field Officers capture outlet visits; Managers/Admins review them.

### Fields (visits/new visit form)
| Field              | Type         | Required | Notes                                  |
| ------------------ | ------------ | -------- | -------------------------------------- |
| Outlet             | Select       | Yes      | From reference `/outlets`              |
| Visit date         | Date (yyyy-mm-dd) | Yes |                                      |
| Visit type         | Select       | Yes      | configurable via lookups               |
| Business group     | Select       | No       | Filters products/outlets               |
| Number of shops visited | Number  | No       | Integer ≥ 0; surfaced on dashboard, reports and KPI ranking |
| Stock level observed | Select     | No       |                                        |
| Competitor presence noted | Checkbox | No     |                                        |
| Key findings       | Textarea     | No       | Up to 4000 chars                       |
| Photo/video ref    | File upload  | No       | Image or video with preview            |
| Follow-up required | Checkbox     | No       |                                        |
| Notes              | Textarea     | No       | Up to 4000 chars, rich-text allowed    |

### Lifecycle
`Draft` → `Submit` → `Reviewed` → `Approved` / `Rejected`

| Action        | Who                                   | Notes                                  |
| ------------- | ------------------------------------- | -------------------------------------- |
| Create        | Admin, Manager, Field Officer         | Starts as `Draft`; toast "Draft report created" |
| Edit          | Owner of a Draft                      | Only while `Draft`; field officers can edit their own (write-own). |
| Submit        | Owner of a Draft                      | Only drafts; triggers `NewReport` notification (Email → Marketing Manager). |
| Review        | Administrator, Marketing Manager only | Requires status `Submitted` → `Reviewed`. |
| Approve       | Administrator, Marketing Manager only | `Reviewed` → `Approved`; email notification to author. |
| Reject        | Administrator, Marketing Manager only | `Reviewed` → `Rejected` with required reason; email notification to author. |

### Listing & filters
Filters: outlet, region, status, `fromDate`, `toDate`, business group. Scope:
- Manager/Admin see all; Analyst sees all (read); Field Officer sees only their own
  (`own` scope). Pagination: 20 per page.

---

## 11. Module: Interviews

Route: `/interviews`. Field Officers capture customer/distributor interviews; Managers/Admins review them.

### Fields (interviews/new interview form)
| Field              | Type         | Required | Notes                                  |
| ------------------ | ------------ | -------- | -------------------------------------- |
| Respondent name    | Text         | Yes      |                                        |
| Respondent type    | Select       | Yes      | Customer, Distributor, etc.            |
| Interview date     | Date         | Yes      |                                        |
| Business group     | Select       | No       |                                        |
| Region             | Select       | Yes      |                                        |
| Outlet             | Select       | No       |                                        |
| Satisfaction score | Rating (1–5) | No       | Auto-sentiment: 1-2=Negative, 3=Neutral, 4-5=Positive |
| Q&A pairs          | Dynamic list | No       | Add/remove question-answer pairs       |
| Key feedback       | Textarea     | No       |                                        |
| Address            | Text         | No       |                                        |
| Geolocation        | Auto-capture | No       | Browser GPS lat/lng on new interviews  |
| Photo/video        | File upload  | No       | Image or video with preview            |

### Lifecycle
`Draft` → `Submit` → `Reviewed` → `Approved` / `Rejected`

| Action        | Who                                   | Notes                                  |
| ------------- | ------------------------------------- | -------------------------------------- |
| Create        | Admin, Manager, Field Officer         | Starts as `Draft`                      |
| Edit          | Owner of a Draft                      | Only while `Draft`                     |
| Submit        | Owner of a Draft                      | Triggers `NewInterview` notification   |
| Review        | Administrator, Marketing Manager only | `Submitted` → `Reviewed`               |
| Approve       | Administrator, Marketing Manager only | `Reviewed` → `Approved`; email to author |
| Reject        | Administrator, Marketing Manager only | `Reviewed` → `Rejected` with reason; email to author |

### Listing & filters
Tabs: **List view** and **Detail view**. Filters: status, region, business group, search.
Pagination: 20 per page.

---

## 12. Module: Multimedia (Photos & Videos)

Route: `/multimedia`. Upload and manage field evidence (photos, videos, audio).

### Upload form
| Field              | Type         | Required | Notes                                  |
| ------------------ | ------------ | -------- | -------------------------------------- |
| File               | File picker  | Yes      | Photo, video, or audio                 |
| Media type         | Auto-detected | Yes     | Photo / Video / Audio                  |
| Capture date       | Date         | No       |                                        |
| Business group     | Select       | No       |                                        |
| Region             | Select       | No       |                                        |
| Outlet             | Select       | No       |                                        |
| Linked module      | Select       | No       | Market visit, interview, form, etc.    |
| Linked record ID   | Text         | No       | ID of the linked record                |
| Tag                | Text         | No       |                                        |
| Transcription required | Checkbox | No      |                                        |
| Notes              | Textarea     | No       |                                        |

### Gallery view
- Grid of media tiles with thumbnails, type badges (Photo/Video/Audio), validation status.
- Filtering: by type (Photos, Videos, Audio), by validation status (Pending, Validated, Rejected).
- **Detail modal**: full-size preview (image/video), metadata, GPS coordinates, transcription editor.

### Validation workflow
- Managers/Admins can **Validate** or **Reject** uploaded media.
- **Transcription**: manual text entry modal for audio/video files.

### Listing & filters
Filters: type, validation status, business group, region, search. Pagination: 20 per page.

---

## 13. Module: Forms & Surveys (NexForm)

This is the largest module. Builders, designers, reporters, respondents, admins all
share `/forms`. Support for public respondents (no login) and internal Field Officers.

### 13.1 Forms list (`/forms`)
- **Filter** by status: All / Draft / Published / Archived.
- **Create form** ("New form") — title (required) + optional description. Available to
  Administrator, Marketing Manager, Marketing Analyst.
- **Open forms** panel (Field Officers): published, in-window forms they may fill in.
- Row quick actions depend on role/status.

### 13.2 Form page (`/forms/[id]`) — main tabs: Builder, Settings, Responses, Report

#### Builder tab (FormBuilder)
- **30 field types** across 8 categories (see §25 for the full table).
- **Toolbar**: Undo / Redo; dirty badge shows "Undo RedoX fields · scoring max N ·
  Unsaved changes" when applicable.
- **Rearrange** by dragging; Ctrl+Click to multi-select; **copy/paste** (Ctrl+C/V),
  **duplicate** (Ctrl+D), **Delete** key to remove.
- **Field editor**: label, key, description, placeholder, per-type constraints
  (options, min/max, min/max length, regex, allowed file types, radius, matrix rows/
  columns, scoring points, formula, prefill source, etc.).
- **Logic**:
  - **Branching**: jump to a later field or end the form when a condition matches.
  - **Display conditions**: show/hide fields per conditional group (`and`/`or` with
    rules).
  - **Calculated fields**: compute from other answers without executing arbitrary code.
  - **Scoring**: assign points per option; max points derived from rating/slider.
- **Pages**: split the form into sections; live preview via the form renderer.
- **Per-field styling**: font, colors, borders, padding, responsive breakpoints per field.
- **Global form theming**: field radius, input styles, label styles, etc.
- **Device preview**: desktop / tablet / mobile preview modes.
- **Autosave**: 3-second debounced autosave.
- **Column layout engine**: multi-column field positioning.
- **Save** writes a new schema **version** (`FormVersion`); publish makes it the live
  version.

#### Settings tab (SettingsTab)
- **Form details**: Title, description, max responses, publish date/time, expire
  date/time, linked follow-up form (ID), edit-window hours, auto-reject anomalies
  toggle, allow-save-drafts toggle. Save meta with "Save settings".
- **Access mode** (`AccessConfig`): choose one of:
  - `Public` — anyone.
  - `Domain` — allow list of email domains.
  - `Invite` — only invited emails.
  - `Group` — only named roles.
  - `Password` — shared password (bcrypt-hashed on save).
- **Invitations**: add single email, bulk-add (comma/newline separated), revoke.
- **Consent (GDPR)**: consent text editor; **"Save & bump version"** increases
  `GDPRConsentVersion`, archives the prior text to `FormConsentHistory`, and toasts +
  shows an inline success alert in the consent card. 🟡 Live consent-email out (to
  previously consented respondents) is not implemented — only the version bump.
- **Branding**: logo URL, primary/secondary colours, font family, and a branded
  **thank-you screen** (title, message, redirect URL, show-response-ID toggle).
- **Report access**: grant/revoke other users (`View` / `Export`) on this form's report.
- **Parent/child**: create a child form from this one (copies parent's current schema +
  branding). A child cannot become a parent, and a form with children cannot become a
  child (single-level inheritance). Propagating parent changes to children happens on
  parent publish; child-owned extra fields are preserved; child owners are notified.
- **Versions**: list of schema versions with publish state.

#### Responses tab
- List of responses (submitted). Field Officers see **their own** responses plus all
  responses on forms they own; managers/analysts per matrix.
- **Response detail**: shows answers, consent flag/version, IP, files, score.
- **Edit response** (within `EditWindowHours`, default enforced when set; otherwise
  unrestricted): saves a snapshot revision (`ResponseRevision`), re-validates,
  re-scores, bumps `EditCount`.
- **Revisions**: full history of answer sets per response (originals + snapshots).
- **Request erasure (GDPR)**: inserts `ErasureRequest` (Pending). A scheduled job
  purges data for requests older than 30 days (answers + files deleted, response marked
  `IsErased`, email/IP cleared).
- **Anomalies**: flags auto-detected on submission (see §25); manager/admin can set
  status `Pending → Acknowledged → Resolved` with a note. An "Auto-reject" toggle on
  the form would reject flagged responses only when `AutoRejectAnomalies` is on (the
  detection itself never deletes/rejects).

#### Report tab (ReportTab)
- **Filters**: date `from`/`to` (+ domain filter inside the report view).
- **Per-field summaries**: counting, `optionCounts` (dropdown/multi/yesno), `avg/min/max`
  (number/rating/slider), `byMonth` (date), `withCoordinates` (location).
  Rendered with bar/donut charts.
- **Auto-generated dashboard layout**: KPI, bar, pie, line, numberStat, table widgets.
- **Custom dashboard layout**: save/load per user per form.
- **Share**: create a public read-only share link (`/share/<token>`) — token-guarded, no
  login; can expire or be revoked. Managing role may view/revoke shares.
- **Cross-form reports**: combine two+ forms by mapping matching field keys into one
  report; create, list, edit, delete, share (managers see all; analysts own-created).
- **Export**: ✅ Excel (.xlsx) export and PDF export available via `export.service.ts`.

### 13.3 Respondent flows
- Field Officer routes: `/forms/[id]/respond`.
- Functions in `submitResponse`:
  - **Access gate** (per access mode) — evaluated server-side.
  - **Rate limiting**: max 20 submissions per form per IP per hour (in-memory).
  - **Duplicate prevention**: one submitted response per user/email.
  - **Save & resume**: if enabled, drafts are stored (`InProgress`) with a 7-day
    resume token; submitting later **promotes** the draft into a submitted response.
  - **Consent**: required if the form requires it (checkbox + consent version recorded).
  - **Validation** re-run on server; calculated fields recomputed; rich text sanitized.
  - **Files**: uploaded for file/image/signature fields; stored with `ScanStatus=Pending`
    (🟡 no real virus scanning — the column is written only).
  - **Scoring**: total/max persisted and returned (`totalScore`, `scoreMax`).
  - **Anomaly detection** runs after save.
  - **Notifications**: `SUBMISSION_CONFIRMED` → respondent (logged-in), and
    `NEW_RESPONSE_RECEIVED` → configured roles; 80% `RESPONSE_LIMIT_WARNING`;
    `FORM_ASSIGNED` when a linked follow-up exists.
  - Returns `/share/<token>`-style branded thank-you screen if branding configured.

### 13.4 Public share (`/share/[token]`)
- Computed read-only report rendered from the token — no session required; the token is
  the only credential. Revoked/expired tokens 404.

### 13.5 Three "public" entry points compared
| Route | Auth | Purpose |
| ----- | ---- | ------- |
| `/forms/[id]/public` | None (anonymous) | **Fill in and submit** a Published + `Public` form without signing in. Shows password gate (Password mode), consent panel, publish/expiry/max-response blocks; `?submitted=1` shows the thank-you banner. Reached from the form header button **"Open public form"** or the URL shown in **Settings**. |
| `/forms/[id]/respond` | Signed in (`Guard`) | Respondent entry for Field Officers; supports **Save & resume** via `?resume=<token>`. |
| `/share/[token]` | Token only | **Read-only report** of collected responses (charts), created from the Report tab → Share links. |

---

## 14. Module: Competitor Pricing

Route: `/pricing`.

### 4 tabs

#### Tab 1: Price Records
| Field              | Type     | Notes                                      |
| ------------------ | -------- | ------------------------------------------ |
| Product            | Select   | From reference `/products` (active only)   |
| Competitor name    | Text     | 1–150 chars                                |
| Price              | Number   | Must be > 0 (ETB)                          |
| Region             | Select   | Required                                   |
| Outlet (optional)  | Select   | Optional                                   |
| Customer type      | Select   | Affects own-price lookup for gap calculation |
| Recorded date      | Date     | Defaults to today                          |

- **Gap percent** is computed on-read: `(OwnUnitPrice − competitorPrice) / OwnUnitPrice × 100`.
- **Alert**: if `|gap| ≥ threshold` (per product category, default seed: Coffee 15%,
  Tea 12%, Cereals 10%, Spices 20%) a `PriceGapAlert` is created (`Active`) and a
  `PriceGapAlert` notification fires (Email to Manager & Analyst).
- Field Officers record; their view is scoped to assigned regions (`region` scope).
  Manager/Admin see all; Analyst read.

#### Tab 2: Compare
For a product, compare own price vs its competitors (by region if chosen) showing
`gapPercent` per competitor.

#### Tab 3: Alerts
List filters: status (`Active`, `Resolved`, `Dismissed`). Actions: **Resolve**,
**Dismiss**.

#### Tab 4: Thresholds
Administrator can configure per-category threshold percents (`pricing.configureThresholds`).

---

## 15. Module: Weekly Sales

Route: `/weekly-sales`. Field Officers capture weekly sales data per product/outlet.

### Fields (create/edit modal)
| Field              | Type     | Notes                                      |
| ------------------ | -------- | ------------------------------------------ |
| Week ending        | Date     | Yes                                        |
| Business group     | Select   | Filters products and customers             |
| Customer           | Select   | Yes; shows customer type                   |
| Product            | Select   | Yes; auto-fills unit price from product-prices API |
| Region             | Select   | Yes                                        |
| Outlet             | Select   | Yes                                        |
| Quantity sold      | Number   | Yes, > 0                                   |
| Unit price (ETB)   | Number   | Auto-populated, editable                   |
| Color              | Select/Text | Optional; resolved through the product colour master |
| Size               | Text     | Optional                                   |
| Category           | Text     | Optional                                   |
| Specifications     | Key/value rows | Optional multi-row spec editor         |
| Notes              | Textarea | No                                         |

### Features
- **Revenue** computed column: `QuantitySold × UnitPrice` (stored as computed column).
- **Auto-price lookup**: fetches tier price based on product + customer type via `/reference/product-prices`.
- **Business group filtering**: products and customers filtered by selected business group.
- **Summary stats**: entry count, total quantity, total revenue (ETB).
- **Row actions**: **View** (detail modal incl. product attributes and "Last edited"),
  **Edit** (opens the same modal → `PUT /weekly-sales/:id`), **Delete**
  (`DELETE /weekly-sales/:id`) with a confirm prompt.
- **Filters**: search text, week ending date, region, business group, customer type, status (`Submitted | Reconciled | Rejected`), color.
- **Delete**: only own entries (Field Officer) or all (other roles with write-own+).
- **Unique constraint**: one entry per WeekEnding + ProductID + OutletID combination.

---

## 16. Module: Officer Performance

Route: `/officer/performance`. Self-service performance dashboard for field officers and staff.

### 4 tabs

#### Tab 1: My Performance
- **Score ring**: circular visualisation of overall KPI achievement score.
- **Score breakdown bars**: Productivity, Completion, Quality, Timeliness — each shown as a progress bar.
- **Activity summary grid**: counts across all modules (visits, interviews, sales, multimedia, pricing, forms).
- **Monthly trend chart**: line chart showing performance over time.

#### Tab 2: My Plans
- Assigned plans with frequency, period, status, approval state.
- Progress bars showing completion percentage per plan.

#### Tab 3: My Results
- KPI results with target, actual, achievement percentage, score, rating.
- Sorted by most recent.

#### Tab 4: Activity Log
- Chronological activity history across all modules.
- Module icons and descriptions per entry.

### Features
- **Date range filter**: From/To with reset.
- **Hero section**: Score, Activities count, Completion rate.

---

## 17. Module: Reports & Power BI

Route: `/reports`. Tabs: **14 sub-tabs**.

### Tab 1: AI Insights
Rule-based aggregate + plain-text "observations". KPIs: Total sales (ETB),
Active price gaps, Market visits (incl. total shops visited), Form responses. Generated at request time.
🟡 Not ML — deterministic statistics over the reporting views.

### Tab 2: Ask AI
Natural-language Q&A over MIS data (`POST /ai/ask`) using the shared chat component —
27 read/predict tools chosen by the model, every answer lists the "Data used" sources.
Administrator, Marketing Manager and Marketing Analyst only; attachments (≤10 MB) can be
attached from the paperclip button. See [§21](#21-module-ai-assistant--predictive-insights).

### Tab 3: Sales
Filters: `from`, `to`, region. Output: Total sales (ETB), orders, units sold, products
sold, regions covered; **Sales by region** bar chart; **Top 10 products** table
(quantity + amount). Source: `vw_Report_SalesByOutlet`.

### Tab 4: Customers
Filters: region, business group, customer type. Four bar charts: by type, by region, by business group, by star rating.

### Tab 5: Products
Filters: category, business group. Charts: by category, by business group. Pricing tiers table.

### Tab 6: Market Visits
Filters: `from`, `to`, region. Output: status counts, a **Shops Visited** KPI card,
**Shops visited by region** bar chart, detail table (with a Shops column). Source: `vw_Report_MarketVisits`.

### Tab 7: Price Comparison
Filters: region, category. Table: Product, Competitor, Competitor price, Own price,
Gap (%), Region, Date. Source: `vw_Report_PriceComparison`.

### Tab 8: Competitor Intel
By competitor summary, recent intelligence table.

### Tab 9: Interviews
Sentiment breakdown (positive/neutral/negative bar chart), by region, sentiment donut.

### Tab 10: Weekly Sales
Revenue by region, top products by revenue.

### Tab 11: KPI Performance
By officer ranking, KPI breakdown, frequency filter.

### Tab 12: Forms
Form response answers table.

### Tab 13: Availability
Product availability by outlet with availability rate badges.

### Tab 14: Power BI 🟡
- Reads role-assigned catalogue (`GET /reports/powerbi/views`): Sales Growth,
  Market Share & Price Gaps, Product Availability, Forms & Survey Analytics.
- "Open" returns a placeholder **embed token** (`MOCK_EMBED`); the embed panel renders
  a static placeholder and notes that production wires the Power BI JS SDK. ⛔ Live
  Power BI embedding is not implemented; "External" opens the catalogue `url`.

### Excel Export
8 export types available: Market visits, Interviews, Multimedia, Weekly sales, Competitor intelligence, Customers, Products, KPI results. Each generates a styled `.xlsx` file with logo and formatted headers.

### Other report endpoints (available via API)
`/reports/market-visits`, `/reports/forms/answers`, `/reports/product-availability`,
`/reports/interviews`, `/reports/weekly-sales`, `/reports/customers`, `/reports/products`,
`/reports/competitor-intelligence`, `/reports/kpi-results`.

---

## 18. Module: Admin Centre

Route: `/admin`. **Administrator only** (second-level `RequireRole`). Multiple admin pages:

### 18.1 Admin Centre (`/admin`) — 5 tabs

#### Tab 1: Users & Roles
- List users (Name, CUAS ID, role, regions, status). Paginated 20/page.
- **Create/Edit user modal**: name, email, role dropdown, region assignment.
- **Activate/Deactivate toggle** per user.
- **Inline role change** via dropdown.
- **Region assignment**: add/remove region badges per user (`UserRegionAssignment`).

#### Tab 2: Role Mapping
- Map CUAS claims → internal roles (seed: `KG-MIS-*`).
- Add, delete. `PUT /admin/role-mapping` upserts.

#### Tab 3: Notifications
- Add/remove `NotificationConfig` rows: trigger event × channel × role, enabled flag.
- List event types and channels (Email only in this build).

#### Tab 4: Schedules
- Power BI **report schedules**: `reportId`, `cron` (e.g. `0 8 * * 1`), recipients
  (comma/newline split), enabled. Add/remove. 🟡 No cron executor runs these in this
  build (data persisted only).

#### Tab 5: Audit Log
- Full audit trail with 7 filters: user, action, entity, date range, IP address, search text.
- **Export**: Excel (.xlsx), CSV, or PDF — all with styled headers and optional logo.
- Retained per `audit.retentionDays` (365) and purged by a scheduled job.
- IP address + location tracking per audit entry.

### 18.2 Planning & Performance (`/admin/kpi`) — 5 tabs

#### Tab 1: Dashboard
- 6 metric cards: Active Plans, Completed Activities, Overdue, Active Officers, Top Performer, Needs Attention.
- Activity Trends chart, Plan Status donut, Planned vs Achieved bars, Upcoming Deadlines table.

#### Tab 2: Plans
- Full plan CRUD with hierarchy view (parent-child tree: Annual → Quarterly → Monthly → Weekly).
- Table view toggle, frequency/status/search filters.
- Quick status toggle buttons, progress bars.

#### Tab 3: Activities
- Plan-specific activity CRUD.
- Priority/status/search filters, status toggle, metric cards per plan.

#### Tab 4: KPI Definitions
- KPI code, name, category, unit, target, weight, frequency, direction, thresholds.
- Weight distribution chart, category summary.

#### Tab 5: Ranking
- Officer ranking with search, sort (multi-key), category filter.
- Score breakdown, achievement bars, gold/silver/bronze rank badges. Pagination.

### 18.3 Business Groups (`/admin/business-groups`)
- CRUD with code, name, description.
- Duplicate code check on create.

### 18.4 Customers (`/admin/customers`)
- **Customer CRUD**: code, name, type, category, contact person/phone/email, region, outlet, business group, address, area, star rating, product interest, active/inactive.
- **Customer Type Manager**: inline create/edit/toggle types in a sub-modal.
- **Filters**: search, business group, customer type, region.
- **Pagination**: 25/page.

### 18.5 Products (`/admin/products`)
- **Product CRUD**: code, name, category, base price, color, size, weight, business group.
- **Per-type pricing modal**: set different prices per customer type (`ProductPrice` table).
- **Business group assignment**: inline dropdown per row.
- **Filters**: search, business group, color, size, category.

### 18.6 Product Catalogue (`/admin/product-catalogue`)
- **Visual card grid**: product cards with images, badges, pricing tiers.
- **Photo upload**: per-product image upload with preview.
- **Filters**: search, business group, category.
- **Pagination**: 12 cards/page.

### 18.7 Regions & Outlets (`/admin/regions`)
- **Regions**: name, country, outlet count, CRUD.
- **Outlets**: name, city, region, active status, CRUD.

### 18.8 Relationship Configuration (`/admin/relationship-configuration`)
- Configure parent-child entity relationships (BusinessGroup, Region, Outlet, Product, Customer).
- Relationship types: One-to-Many, One-to-One.
- Required/optional, display order, active/inactive.
- Used by forms to auto-filter dependent dropdowns (cascading filters).
- ⚠️ No sidebar entry (see §4) and **no in-page role gate** — data access is still
  enforced server-side by `can('admin.relationshipConfig')`, so non-administrators see a
  failed-fetch state rather than a 403 screen.

### 18.9 Competitors (`/admin/competitors`)
Master data for competitor products and pricing feeding `/pricing` and the Competitor
Intel reports. Visible in the sidebar to **Administrator + Marketing Manager**; the API
enforces `competitors.view` (Admin/Manager full, Analyst/Field read) and
`competitors.manage` (Admin/Manager). The page itself only requires sign-in — opening
the URL with another role shows the list but every write action returns 403.

- **Filters**: search, competitor, category, status (`All / Active / Inactive / Expired`);
  deep-linkable via `?search=` and `?category=`. Pagination 20/page.
- **Table**: checkbox · Competitor · Product/model · Category · Our product (badge, or amber
  **"Not linked"** — clickable to open the edit modal) · Own price · Competitor price
  (range) · Price difference / Diff % (colour-coded) · Effective · Status · View/Edit/Delete.
- **Add/Edit modal**: competitor select with inline **＋** competitor creation, product\*,
  category\* (datalist), **Our product** (optional, grouped Same category first, fresh fetch
  with Retry), price\*, price max, effective date, status, notes, and a key/value
  **Specifications** editor.
- **Bulk link/unlink**: tick rows → choose "our product" → **Link**/**Unlink** (with confirm).
  Linking recomputes the gap and creates/refreshes a `PriceGapAlert` when
  `|gap| ≥ category threshold`; unlinking removes the stale alert.
- **View modal**: read-only fields, humanized specifications, collapsible raw JSON.
- Delete: native confirm; dependent gap alerts removed server-side. Deleting a competitor
  *entity* is blocked while products reference it (`409 … delete them first`) and is only
  available via the API (no entity edit/delete UI yet).
- **No import/export on this screen** — the catalogue is loaded by
  `npm run db:seed:competitors`. Toasts: `Competitor product created. Gap: 12.34%.`,
  `Gap alert created.`, `Linked N row(s)`.
- Guided tour `admin-competitors` + Help Center guide `admin-competitors` are available;
  `/pricing` links here ("Prices are maintained in Admin › Competitors").

### 18.10 Corporate Marketing Activities Plan (`/admin/corporate-marketing`)
Administrator-only (`Guard` + `RequireRole`; API under `can('admin.users')`). Digitises the
annual **KG Corporate Marketing_Plan_and_Activities.xlsx** workbook: monthly activity tasks
(49 parent activities × 4 sub-tasks × 12 months) with a verify/reject workflow, plus an
**Events & Campaigns** register (`EVT-001…`). A deeper guide lives in
`Docs/User Guide-Docs/KG-MIS_Corporate_Marketing_Plan_User_Guide_v1_0.md` (note: that guide
predates CRUD/import/export and its FAQ is out of date).

- **Hero**: 4 stats (Tasks, Verified, Completion %, Events) + **Import Workbook** button +
  tour trigger. Tabs: **Dashboard · Monthly Plan · Events & Campaigns · User Guide**.
- **Dashboard**: Year + Month filters; 8 stat cards (Total/Verified/Not verified/Rejected,
  Avg completion, Assigned, Events planned/completed) and a "Rollup by responsible role" table.
- **Monthly Plan**: filters (Year, Month, Responsible role, Status, search), 4 stat cards,
  **CSV / Excel** export buttons, **＋ Add task**. Table grouped by parent activity with
  inline **Person / Completion % / Evidence** editing + **Save**, per-row **Edit** modal,
  **Verify ✓** / **Reject ✗** (reject prompts for a required note) and **Delete** with a
  confirm modal. Rows are requeued from `Rejected` to `Not Verified` when edited.
  **Pagination: 50 per page.**
- **Events & Campaigns**: status filter + search, CSV/Excel export, **＋ Add event**,
  edit/delete; columns cover category, BU, dates (derived month/ISO week), status,
  budget/cost/variance, leads/conversions, ROI, reach, engagement. Pagination 50/page.
- **Workbook import**: `.xlsx` only, ≤20 MB, target-year selector; expects month sheets
  `Jan…Dec` (cols: 1 Task name, 3 Main activity/KPI, 5 Responsible role, 10 TaskId,
  11 ParentCode) and an `Events & Campaigns` sheet (`EVT-###` codes in col 1). Upserts are
  idempotent — matched tasks only refresh name/role; blank event cells never clear data.
  Result cards show Parents / Tasks / Events / Errors; a red error list names each failed row.
- **Toasts**: `Task MAR-MK-001-01 created/saved/verified/rejected/deleted`,
  `EVT-007 created/saved/deleted`, `Tasks exported as CSV|XLSX`,
  `Imported: N parents, N tasks, N events`.
- Guided tour `admin-corp-marketing` (no Help Center guide yet).

### 18.11 AI Renewal (`/admin/ai-renewal`)
Administrator-only end to end (`Guard` + `RequireRole`; API under `can('ai.renewal')`).
Manages the Gemini/Groq API keys used by the AI features and the scheduled rotation
reminder. Full operational guide: `Docs/AI_Renewal_Guide.md`.

- **Provider cards (Gemini, Groq)**: status badge `Available` / `Configured — Unavailable` /
  `Not Configured`, model, password-masked **API key** input with reveal toggle, provider
  console link (Google AI Studio / Groq Console), and **Test Connection** (validates without
  saving), **Save / Renew** (validates, then persists and applies at runtime — no restart),
  **Cancel**. Stored keys are never displayed back.
- **Scheduled Key Rotation**: **Enable Rotation Reminders** toggle, **Rotation Interval
  (days)** (1–365, default 90), read-only **Next Rotation Due** (red badge
  "Rotation due — provide new key" when due), **Provider to Rotate**, **Save Rotation
  Settings** (always available — the settings live on their own tab). Rotation is a
  *reminder only* — nothing is
  auto-generated or swapped; the old key keeps serving traffic.
- **Daily cron 02:00 UTC** marks `due` once `nextRun` passes (audit `AI_ROTATION_DUE`).
  Saving rotation settings clears the due flag. No notification/e-mail is sent — the badge
  and the audit log are the only signals ⛔.
- **Audit events**: `AI_KEY_RENEWED`, `AI_ROTATION_CONFIG_UPDATED`, `AI_ROTATION_DUE`
  (key material is never logged). Config lives in `.env`/`SystemConfig` (dev writes
  `backend/.env` atomically; production uses `dbo.SystemConfig`).
- Error codes from Test/Save: `INVALID_CREDENTIALS`, `RATE_LIMITED` (a rate-limited probe
  never overwrites a working key), `TIMEOUT`, `NETWORK_ERROR`, `MODEL_UNAVAILABLE`,
  `PROVIDER_UNAVAILABLE`, `INVALID_PROVIDER`.

---

## 19. Module: D365FO Sync

- `POST /sync` (or `/sync/d365fo`) triggers a master-data sync.
- `GET /sync/logs` lists sync attempts (limit param, default 50).
- 🟡 Dev runs a **mock deterministic dataset** (products, customers, sales, outlets).
  In production the D365FO OData client would refresh products/customers/sales; the
  connector contains TODO stubs (`D365FO_MOCK=false`).
- Failures can dispatch `SyncFailure` → Administrator (Email).

---

## 20. Module: Opportunities & Tenders

Sidebar section **Opportunities**. A pipeline for external business opportunities:
**Discovery → Qualification → Tracking**.

1. **Discovery** — 5 seeded API sources (e-GP Ethiopia, 2merkato ×2, TenderInfo.org,
   TenderMetro) are collected on demand ("Collect Now" / "Collect All") or by scheduled
   cron when `TENDERS_COLLECTION_ENABLED=true` (default **off**). Each run covers a 7-day
   rolling window; items are normalised, hash-deduplicated (cross-provider), classified
   (opportunity type + product group), quality-scored, then relevance-scored. Restricted
   hosts are never fetched. Per-source **AI auto-enrichment** (`AiAutoEnrich`, off by
   default) summarises and structurally extracts newly inserted rows.
2. **Qualification** — every opportunity is scored **0–100** against active **Interest
   Profiles** (11 weighted components: keywords 28, product group 14, sector 12, country 9,
   organisation 8, value 6, deadline 5, type 5, business unit 4, source quality 4,
   historical save-rate 5). The detail page's **"Why?"** button shows the breakdown.
   Field-presence **Confidence** (0–100) and **Data quality** (Complete ≥70 / Partial ≥40 /
   Sparse) are computed at insert.
3. **Tracking** — **Save** an opportunity and move it through 7 pursuit statuses
   (`New → Reviewing → Interested → Applied → Won / Lost / Archived`) with notes.

### 20.1 Routes & roles (sidebar "Opportunities")

| Route | Label | Content | Roles |
| ----- | ----- | ------- | ----- |
| `/tenders` | Tenders | Explorer + dashboard: 9 KPI cards (Total, New This Week, Deadlines Soon, High Relevance, Saved, RFQs, Buyer Leads, Export non-Ethiopia, Trade Intel), Upcoming Deadlines (top 5), 7 breakdown charts (country/sector/type/source/product group, relevance donut, deadlines per week) | All five |
| `/tenders/buyer-leads` | Buyer Leads | Explorer preset `type = BUYER_LEAD` | All five |
| `/tenders/rfqs` | RFQs | Explorer preset `type = RFQ` | All five |
| `/tenders/export` | Export Opportunities | Opportunities outside Ethiopia | All five |
| `/tenders/trade` | Trade Intelligence | `type = TRADE_INTELLIGENCE` (shipment/import-export signals) | All five |
| `/tenders/saved` | Saved Opportunities | Current user's bookmarks | All five |
| `/tenders/my-opportunities` | My Opportunities | **Identical to Saved by design** (both nav items are kept) | All five |
| `/tenders/assistant` | AI Assistant | Natural-language questions over opportunity data (`POST /ai/ask`) | Admin, Manager, Analyst |
| `/tenders/sources` | Data sources | Source CRUD, Test, Collect Now, Collect All | Admin, Manager |
| `/tenders/interest-profiles` | Interest profiles | Scoring target CRUD (changes trigger a background re-score) | Admin, Manager |
| `/tenders/import` | Import data | 5-step Excel/CSV import wizard | Admin, Manager |
| `/tenders/[id]` | (detail) | Single opportunity | All five (view); enrich/verify are manager-level |

### 20.2 Explorer (all preset routes)
- **Columns**: Title, Organization, Country/Region, Sector/Product group, Type badge,
  Deadline (orange when ≤7 days), Value, Relevance badge (High ≥70 / Medium ≥40 / Low),
  Confidence + Data quality, Verified, bookmark toggle.
- **Filters**: search, country, sector, type, product group, verification, relevance,
  "Saved only"; **More filters** adds source, organization, business group, confidence,
  data quality, publication/deadline date ranges, "Export only". Pagination 20/page;
  changing any filter resets to page 1.
- **Actions**: bookmark/unsave (all roles, `tenders.save`); **＋ Add Tender** (managers;
  Title + Source URL required, type has an "Auto-detect" default).
- **No CSV/Excel export of opportunities exists** — "Export Opportunities" is a *filtered
  view*, not a file download. Only import templates are downloadable.

### 20.3 Detail page
- Header badges (Type, Product group, Region, Confidence, Data quality, Verified) and the
  **"Why?"** modal (score total, matched keywords, per-component points table).
- **Opportunity details**, description, and **AI Summary & Extraction** — either the
  enrichment result (summary, value/eligibility/documents/contact/dates, per-field basis
  `confirmed|inferred|uncertain|unavailable`, business-fit note) or the
  **Run AI Enrichment** button (Admin/Manager/Analyst).
- **Save & Track** card: status dropdown + notes → Update / Unsave / Save Opportunity.
- **Verification** card (Admin/Manager): Mark Verified / Unverified.
- Metadata: created date, content hash.

### 20.4 Data sources page
- Table: Name (+ Restricted/Inactive badges), Type (api/rss/scraping), URL, Schedule label,
  Rate limit, Quality badge, Robots, Active toggle, **AI auto-enrich** toggle, Last run
  status/error, Last collected, Total. Actions: **Test** (dry run — shows duration, fetched
  count, 5 samples, "Nothing was saved"), **Collect Now**, **Edit**, **Delete**, **Collect All**.
- Add/Edit modal: name, type, URL, adapter config JSON, schedule (1h/6h/12h/24h label),
  rate limit, quality score, robots, active, AI auto-enrich.
- Status model: `LastCollectionStatus` = Success / Failed / Partial (duplicates count as
  Success). Restricted hosts (via `TENDERS_RESTRICTED_HOSTS`) are stored inactive, can
  never be activated, and are never fetched. Deleting a source preserves its opportunities.
- Seeded sources (from `npm run db:seed:tenders`): e-GP Ethiopia, 2merkato Tenders (free),
  2merkato Tenders (full listing), TenderInfo.org Ethiopia, TenderMetro (seeded **inactive**
  until `TENDERMETRO_API_KEY` is set). The per-source schedule label is informational —
  each cron run collects **all active sources**.

### 20.5 Interest profiles
- Table: Name, Sectors, Keywords, Countries, Budget range, Types & units, Status, Updated.
- Create/Edit: name\*, sectors, keywords, countries, organizations, product-group codes,
  opportunity-type checkboxes, business-unit codes, min/max value, currency, active.
  Create/update/delete kick a background full re-score (toast: "relevance scores
  recalculating in the background"). Delete confirms that existing scores persist until
  the next re-score.

### 20.6 Import wizard (5 steps)
1. **File** — `.csv`/`.xlsx`/`.xls`, ≤5 MB, ≤2000 rows, ≤40 columns, header row required;
   template download (Excel or CSV, 12 canonical columns + 2 examples).
2. **Mapping** — alias-based auto-suggestion, worksheet selector; required **Title\*** and
   **SourceUrl\***; blocks on missing/duplicate mappings.
3. **Preview** — counts (total/ready/invalid/duplicate) + first 200 rows with per-field issues.
4. **Confirm** — imported rows are created **Unverified** and scored against interest profiles.
5. **Summary** — Imported / Duplicates skipped / Invalid skipped / Failed / High relevance
   cards, duration, error table (first 100 issues), links onward.
- Duplicates are never overwritten; staged files are purged after 24 h; history comes from
  the audit log (`TENDER_IMPORT`). High-relevance imports fire `TENDER_NEW_MATCH`.

### 20.7 Notifications & scheduled jobs
| Event | Trigger | Recipients |
| ----- | ------- | ---------- |
| `TENDER_NEW_MATCH` | Collection/import produces items with Relevance ≥ threshold (default 70) | Admin, Manager, Analyst (per seeded NotificationConfig) |
| `TENDER_DEADLINE_REMINDER` | Daily cron (`TENDERS_REMINDER_CRON`, default 09:00 UTC) | The individual user who saved the opportunity; deadlines within `TENDERS_REMINDER_LEAD_DAYS` (default 7); Won/Lost/Archived excluded; one reminder per opportunity per day |

### 20.8 API surface (`/api/v1/tenders`)
`GET /dashboard`, `/countries`, `/sectors`, `/product-groups`, `/business-groups`, `/`
(list with ~17 filters, pageSize ≤100 default 20), `/saved`, `/sources`,
`/interest-profiles`, `/imports`, `/imports/template`, `/:id` ·
`POST /` (manual create), `/:id/save`, `/:id/verify`, `/:id/ai-enrich`,
`/:id/relevance-explanation`, `/sources`, `/sources/test`, `/sources/:id/test`,
`/sources/:id/collect`, `/sources/collect-all`, `/interest-profiles`,
`/imports/parse`, `/imports/commit` ·
`PUT /:id/save`, `/sources/:id`, `/interest-profiles/:id` ·
`DELETE /:id/save`, `/sources/:id`, `/interest-profiles/:id`, `/imports/:token`.
Permissions: `tenders.view` (all roles read), `tenders.save` (all), `tenders.manageSources`
/ `manageProfiles` / `collect` / `verify` (Admin/Manager), `tenders.aiEnrich`
(Admin/Manager/Analyst).

**Status notes:** scheduled collection off by default; RSS/scraping adapters exist but all
seeded sources are API type; estimated value is legitimately null for some sources (e-GP
has no value; TenderInfo price undisclosed); verification is manual; "Export
Opportunities" is a view, not a file export.

---

## 21. Module: AI assistant & predictive insights

KG-MIS ships one server-side AI stack (Ollama / Gemini / Groq, `AI_PROVIDER=auto` routes
with fallback). There is **no mock path** — with no provider configured the API answers
`503 AI_PROVIDER_UNAVAILABLE`. Permissions: `forms.aiAssistant` (Administrator, Marketing
Manager, Marketing Analyst) unless noted; rate limit **30 requests/min/user** (anonymous
public endpoints: 10/min/IP). API keys never reach the browser. Full reference:
`Docs/AI_Form_Assistant.md`.

### 21.1 Surfaces
| Surface | Where | Endpoint(s) | Notes |
| ------- | ----- | ----------- | ----- |
| **Form Builder assistant** | Builder toolbar → drawer (Form / Responses / Data tabs) | `POST /ai/assistant`, `GET /ai/providers` | Proposes schema changes as a **preview → confirm → apply** flow; never writes directly |
| **Writing assistant** | Respondent fields (✨ Improve grammar / Rephrase / Clarify / Shorten / Professional) | `POST /ai/writing` (auth), `POST /ai/public/writing` (anonymous) | Also on public fills |
| **Response analysis** | Form → Report → AI analysis; AI drawer → Responses | `POST /ai/analysis` | Needs response-view rights + ownership |
| **Ask AI (data Q&A)** | AI drawer → Data tab; Reports → **Ask AI** tab; `/tenders/assistant`; global launcher | `POST /ai/ask` | 27-tool read/predict catalogue chosen by the model; answer includes a **Data used** block; the model never writes SQL or data |
| **Global AI launcher** | Floating wand on every signed-in page | `POST /ai/ask` + page `context` | Side sheet with automatic page-context chip; welcome dialog on first use |
| **Chat attachments** | Paperclip in the Ask AI chat | `POST /ai/attachments`, referenced on `/ai/ask` | One file ≤10 MB (`csv, xlsx, xls, txt, md, json, log, pdf, docx`, images `png, jpg, jpeg, gif, webp`); text extracted server-side (20k char cap); **7-day TTL**, purged nightly 04:45 UTC |
| **Public landing assistant** | Floating chat on `/` | `POST /ai/public/ask` | Static site knowledge only; no KG-MIS data |
| **Tender enrichment** | Opportunity detail **Run AI Enrichment** + per-source auto-enrich | `POST /tenders/:id/ai-enrich` | See §20 |

Conversation turns are persisted to `AiConversation` (user, role, provider/model, message,
duration, success/error) for Ask AI, assistant and analysis — not for writing/public turns.
Input extras on the chat: emoji picker, browser voice dictation, per-user voice replies.

### 21.2 Predictive insights (deterministic forecasts — no LLM)
- **11 modules**: sales, weeklySales, kpi, competitorPrice, pricing, products, customers,
  surveys, interviews, visits, multimedia.
- Each card: series → forecast with lower/upper band (RMSE-based) → backtest
  (walk-forward MAE/RMSE/MAPE, naive/MA/trend/Holt/seasonal candidates, best MAE wins) →
  **confidence** (High / Moderate / Low / **Insufficient**) → anomalies (z-score) →
  risk/opportunity signals → data gaps.
- **Insufficiency gate**: fewer than 8 periods ⇒ no forecast, honest "Insufficient" card.
- **Where**: Dashboard "Predictive insights" grid; also reachable through the 12
  `forecast_*` / `predict_*` / `detect_anomalies` Ask AI tools.
- **Endpoints**: `POST /ai/predictive`, `GET /ai/predictive/summary` (both
  `forms.aiAssistant`, plus per-metric rights like `reports.view` inside the service).
- **Cron**: nightly **15 4 * * *** refreshes every module and purges expired rows
  (retention 90 days, cache TTL 60 min, kill switch `prediction.enabled=0`).
- Seed data: `npm run db:seed:history` (~1,400 deterministic rows).

### 21.3 AI Token Renewal
Administered at **/admin/ai-renewal** — see [§18.11](#18-module-admin-centre).

**Status markers:** form/writing/analysis/Ask AI/launcher/attachments/predictive = ✅ live;
Reports "AI Insights" = 🟡 rule-based (not ML, see §17); rotation due → **no notification**
⛔ (badge + audit log only); production secret-manager storage ⛔ (dev writes `.env`,
production writes `dbo.SystemConfig`).

---

## 22. Module: Support & public pages

### 22.1 Help Center (`/help`, `/help/[slug]`)
- **Requires sign-in** (`Guard`). Content is static TypeScript under
  `frontend/src/lib/help/` — not CMS/DB driven.
- **8 categories**, **52 guides**, **51 FAQs**: Getting Started (9), Account & Security (4),
  Field Intelligence (7), Analytics & Reports (4), Forms & Surveys (6),
  Opportunities & Tenders (7), Administration (9), Troubleshooting & FAQ (6).
- **Home**: category cards ("N guides · N FAQs"), 6 popular guides, FAQ list with category
  chips, "Take the Help Center tour" + "Browse all tours" → `/tours`.
- **Article page**: breadcrumb, role badges, **Quick facts** (Access / Inputs / Result),
  **Role restrictions** note, body blocks (paragraphs, steps, bullets, tables, notes,
  links), **Related help**, up to 8 FAQs. Not indexed by search engines
  (`robots: noindex`).
- **Search**: client-side ranked search over guides + FAQs (title > keyword > text),
  max 24 results, `↑`/`↓`/`Enter`/`Esc` keyboard support; FAQ hits anchor to `/help#faq-<id>`.

### 22.2 Guided tours (`/tours`)
- **33 tours / 188 steps** in `frontend/src/lib/tours/` grouped as Getting started,
  Overview, Field intelligence, Analytics, Opportunities, Administration, Support.
- **Catalog `/tours`**: cards show title, steps, estimated minutes, and a **Completed**
  badge (`kgmis_tour_done_<userId>`); **Start tour / Replay** navigates to the tour's
  route. The sign-in tour is excluded (it runs on `/login`); the catalog shows only tours
  the current role may take ("No tours are available for your role yet." otherwise).
- **Launch points**: per-page **Take a tour / Show me how** triggers (~29 pages), a
  one-off first-run **"New here?"** prompt offering the welcome tour, and the login page
  link. Tours cover: sign-in, welcome, dashboard, notifications, profile, help, catalog,
  visits, interviews, multimedia, weekly sales, forms, form builder, responding, pricing,
  reports, officer performance, 6 opportunity tours, and 10 admin tours.
- **Player**: popover footer (Skip · Step X of Y · Previous · Next/Finish), keyboard
  control, dark-theme overlay, mobile selectors ≤900px, multi-route tours (≤6 s per hop),
  completion toast ("replay it any time from Take a Tour").
- No tour exists yet for `/admin/ai-renewal` and `/admin` has no in-page trigger.

### 22.3 Public pages
| Route | Purpose |
| ----- | ------- |
| `/features` | Capability showcase: hero stats, **Module Explorer** (pillar tabs + feature lists), **Role × Module matrix**, screenshot carousel with lightbox (`Esc`/`←`/`→`), technical specs, comparison table. Linked from the landing hero ("Explore Intelligence"). |
| `/team` | "Development Team & Contributors" — contribution overview, six discipline chips, member cards (photo, role, contributions, mailto/LinkedIn/portfolio), CTA to `/features` and `/login`. The only SEO-indexed app surface. |
| `/` | Landing page — see [§7](#7-module-landing-page). |

Both `/features` and `/team` are public with their own theme toggle
(`kgmis_landing_theme`) and footer links to each other and the landing page.

---

## 23. Key workflows (step by step)

### Workflow A — Build and publish a form (Manager/Analyst)
1. Log in as `tsegaye.n` → **Forms & Surveys** → **New form** → title it, create.
2. In **Builder**, add fields: Short text, Dropdown, Rating (score), Section header.
3. Configure a rating with scoring points; add a display condition on a later field.
4. **Save** (creates schema Draft version).
5. **Settings** → choose access mode (`Public` for the demo), enable consent text and
   **Save & bump version**, optionally brand colours.
6. **Publish** → status becomes `Published`; `FORM_PUBLISHED` Email dispatched to
   Analysts; if the form is a child, parent changes propagate to siblings.

### Workflow B — Field Officer submits a response
1. Log in as `field1` → **Forms & Surveys** → open **Open forms** panel.
2. Open the published form → answer all required fields → consent checkbox if required.
3. **Submit** → toast; response counted; `SUBMISSION_CONFIRMED` + `NEW_RESPONSE_RECEIVED`
   dispatched; anomalies scanned.
4. If the form allows drafts, use **Save & resume**; finish and submit later (draft
   promoted).

### Workflow C — Review & analyse responses
1. As manager, open the form → **Responses** tab → open a response.
2. Optionally **Edit** (if within edit window) → note revision created.
3. **Anomalies**: pending flags list; set to Acknowledged/Resolved with a note.
4. **Report** tab → set date range → charts. Create a **share link** → open
   `/share/<token>` in an incognito window → read-only report, no login.

### Workflow D — Market visit capture & review
1. `field1` → **Market Visits** → New visit → outlet, date, notes → Save (Draft).
2. **Submit** → `NewReport` Email to Manager.
3. `tsegaye.n` → open the report → **Review** (status → Reviewed) → **Approve** (→ Approved).

### Workflow E — Conduct an interview
1. `field1` → **Interviews** → New interview → respondent name, type, date, satisfaction score.
2. Add Q&A pairs → key feedback → Save (Draft).
3. **Submit** → `NewInterview` notification to Manager.
4. `tsegaye.n` → open the interview → **Review** → **Approve**.

### Workflow F — Upload multimedia evidence
1. `field1` → **Photos & Videos** → upload a photo → set capture date, region, linked module.
2. **Submit** → media appears in gallery with `Pending` validation.
3. `tsegaye.n` → open the media → **Validate** → status changes to `Validated`.

### Workflow G — Record weekly sales
1. `field1` → **Weekly Sales** → select business group → select customer → select product (auto-fills price).
2. Enter quantity, week ending → Save.
3. Summary stats update with total quantity and revenue.

### Workflow H — Competitor price with alert
1. `field1` → **Competitor Pricing** → record product `Arabica Coffee 1kg` competitor
   price far below 850.00 in an assigned region → save.
2. Gap ≥ 15% → alert created + `PriceGapAlert` notifications (Email to Manager,
   Email to Analyst).
3. Manager/Analyst → open Pricing → **Alerts** → resolve/dismiss.
4. Dashboard "Active price gaps" and Reports AI insights reflect the live count.

### Workflow I — Officer performance review
1. `field1` → **My Performance** → view score ring, breakdown bars, activity summary.
2. Check **My Plans** for assigned plan progress.
3. Check **My Results** for KPI achievement details.

### Workflow J — Admin configuration
1. Log in as `admin` → **Admin Centre**.
2. **Users & roles**: change a user's role; assign `field1` to a region.
3. **Role mapping**: add `KG-MIS-*` claims.
4. **Notifications**: add a config row, e.g. `ANOMALY_FLAGGED` × `Email` × Analyst.
5. **Schedules**: add a Power BI schedule.
6. **Audit log**: review recent actions; export to Excel/CSV/PDF.
7. **Planning & Performance**: create KPI definitions, assign plans, view rankings.
8. **Business Groups**: create/edit business groups.
9. **Customers**: manage customers with type manager.
10. **Products**: manage products with per-type pricing.
11. **Product Catalogue**: upload product photos.
12. **Regions & Outlets**: manage geographic hierarchy.
13. **Relationship Configuration**: set up cascading dropdown rules (URL-only, see §18.8).
14. **Competitors**: add a competitor product, bulk-link it to an own product (§18.9).
15. **Corporate marketing plan**: import the workbook, verify/reject tasks, export CSV (§18.10).
16. **AI Renewal**: check provider status, paste a fresh key, save rotation settings (§18.11).
17. Trigger a **Sync** and check `/sync/logs`.

### Workflow K — Discover & track an opportunity (Manager)
1. `tsegaye.n` → **Opportunities → Tenders** → review the 9 KPI cards and charts.
2. Open **Data sources** → **Test** a source → **Collect Now** (or **Collect All**).
3. Back in the explorer → filter by relevance/country/deadline → open a high-relevance item.
4. Read **"Why?"** (score breakdown) → optionally **Run AI Enrichment**.
5. **Save Opportunity** → set status `Reviewing` → add notes → Update.
6. Let the daily reminder cron notify you about deadlines ≤7 days away.

### Workflow L — Import opportunities from a workbook (Manager)
1. **Opportunities → Import data** → download the Excel/CSV template.
2. Fill the template → **File** step (≤5 MB/2000 rows) → map columns (Title\*, SourceUrl\*).
3. **Preview** (ready/invalid/duplicate counts) → **Confirm** → read the **Summary** cards.
4. High-relevance imported rows raise `TENDER_NEW_MATCH`; duplicates are skipped, never overwritten.

### Workflow M — Maintain the corporate marketing plan (Admin)
1. `admin` → **Corporate marketing plan** → **Import Workbook** → pick target year + `.xlsx`.
2. **Monthly Plan** → filter Year/Month → edit Person/Completion inline → **Save**.
3. **Verify ✓** a finished task; **Reject ✗** another (note required) → edit it later to requeue.
4. **＋ Add task** (optionally create a new parent activity inline) / **＋ Add event**.
5. **CSV / Excel** export respects the active filters and ignores pagination.

### Workflow N — Link competitor products to own products (Admin/Manager)
1. `admin` → **Competitors** → **＋ Add competitor product** (create the competitor inline if new).
2. Pick **Our product** → Create → toast shows the computed gap and any alert.
3. Bulk: tick rows → choose an own product → **Link** (confirm) — alerts are created or cleaned up.
4. Check **Competitor Pricing → Alerts** for any threshold breach.

### Workflow O — Ask AI / check forecasts
1. Any page → floating **AI wand** (or Reports → **Ask AI**) → ask e.g. "How many market
   visits were approved last month?" → read the answer + **Data used** block.
2. Attach a CSV/XLSX via the paperclip (≤10 MB) and ask questions about it.
3. Dashboard → **Predictive insights** → check the next-period forecast and confidence badge.
4. Build a form → Builder → AI assistant → generate/modify → **preview → confirm → apply**.

### Workflow P — Self-serve help
1. Sidebar → **Help Center** → browse categories or search (`↑`/`↓`/`Enter`).
2. Sidebar → **Take a Tour** → Start/Replay any tour your role may take.
3. Use the per-page **Show me how** triggers; completion badges appear in `/tours`.

---

## 24. Validation, errors & toasts

### Error style
- API returns a standard error envelope via the Express error handler:
  `{ error: { message, code?, details? } }` with proper HTTP status
  (`400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`,
  `409 Conflict`, `413 Payload Too Large`, `422 Validation`, `429 Too Many Requests`,
  `503 Service Unavailable`).
- Copycat `ApiError` in the frontend surfaces `message` (or "Request failed"), and
  pages/actions show it in a toast or inline alert.

### Representative error codes
| Code              | HTTP | Trigger                                |
| ----------------- | ---- | -------------------------------------- |
| `INVALID_EMAIL`   | 400  | Bad invite email                       |
| `EMPTY_CONSENT`   | 400  | Consent text blank on bump             |
| `SCHEMA_INVALID`  | 400  | Form schema fails validation           |
| `FORM_NOT_PUBLISHED` | 400 | Submit to unpublished form           |
| `CONSENT_REQUIRED`| 400  | Submit without consent                 |
| `ACCESS_DENIED`   | 400  | Access rule blocks submission          |
| `NO_PUBLISHED_VERSION` | 400 | No published schema               |
| `DRAFTS_DISABLED` | 400  | Save&resume on a form without drafts   |
| `NOT_EDITABLE`    | 400  | Edit a non-submitted response          |
| `NOT_DRAFT`       | 409  | Edit/submit/delete a non-draft visit, publish a non-draft form, delete a published form |
| `NOT_SUBMITTED`   | 400  | Review a draft visit                   |
| `DUPLICATE_SUBMISSION` | 409 | Already submitted (by user or email) |
| `INVALID_PARENT`/`ALREADY_PARENT` | 400 | Parent/child inheritance violations |
| `INVALID_ACCESS_MODE` | 400 | Bad access-mode value               |
| `INVALID_THRESHOLD`   | 400 | Threshold ≤ 0                        |
| `INVALID_FIELD_MAPPING` | 400 | Cross-report maps unknown field     |
| `MIN_TWO_FORMS` / `DUPLICATE_FORMS` | 400 | Cross-report form set invalid  |
| `FORBIDDEN`        | 403  | Report access denied / cross-report not yours |
| `INVALID_STATUS`   | 400  | Anomaly flag status outside enum       |
| Rate limit         | 429  | >20 submissions/form/IP/hour           |
| `AI_PROVIDER_UNAVAILABLE` | 503 | No AI provider configured/reachable |
| AI rate limit      | 429  | >30 AI requests/min/user (10/min/IP anonymous) |
| `UNSUPPORTED_FILE` | 422  | AI attachment type not in allow-list   |
| `FILE_TOO_LARGE`   | 413  | AI attachment > 10 MB                  |
| `ATTACHMENT_NOT_FOUND` | 404 | Expired/missing chat attachment (7-day TTL) |
| `INVALID_PROVIDER` | 400  | AI renewal provider ≠ gemini/groq      |
| Key-probe errors (`INVALID_CREDENTIALS`, `RATE_LIMITED`, `TIMEOUT`, `NETWORK_ERROR`, `MODEL_UNAVAILABLE`) | 400 | AI renewal Test/Save |
| `UPLOAD_ERROR`     | 400  | Corporate-marketing import: not `.xlsx` (20 MB cap) |
| Role check         | 403  | `Role 'X' cannot perform this action` (any `can()`-guarded action) |

### Toast examples (implementation)
- `Welcome, <name>` (login), `Draft report created` (visit),
  `Role updated for <name>` / `Region assigned` (admin),
  `Mapping saved`, `Config saved`, `Schedule added` (admin),
  `Role update failed` / `Save failed` / `Remove failed` (error toasts on failures).
- Corporate marketing: `Task MAR-MK-001-01 created/saved/verified/rejected/deleted`,
  `EVT-007 created/saved/deleted`, `Tasks exported as CSV`, `Imported: N parents, N tasks, N events`.
- Competitors: `Competitor product created. Gap: 12.34%.`, `Gap alert created.`,
  `Linked N row(s)` / `Unlinked N row(s)`.
- Opportunities: `X fetched, N new, D duplicate, F failed`, `relevance scores recalculating in the background`.
- Consent save shows a **toast + inline success alert** inside the consent card.

---

## 25. Data reference

### Form field types (NexForm, 30 types)

| Category  | Types |
| --------- | ----- |
| text      | Short text, Paragraph (longtext), Email, Phone |
| choice    | Dropdown, Multiple choice (multiplechoice), Yes/No, Rating |
| numbers   | Number, Slider, Calculated |
| date-time | Date, Time, Date & time |
| media     | File upload, Image, Signature |
| location  | Location (GPS) |
| advanced  | Prefill, Matrix/grid, Rich text |
| design    | Heading, Image (content-image), Divider, Spacer, Button, Quote, Section header, Instructions, Container |

### Form statuses & access modes
- Statuses: `Draft` → `Published` → `Archived`. Only Draft can be deleted or published;
  Archived cannot be re-published.
- Access modes: `Public`, `Domain`, `Invite`, `Group`, `Password`.

### Notification channels & statuses
- Channels: `Email` only (the sole value the API accepts; legacy seed rows may show other icons).
- Statuses: `Pending`, `Sent`, `Retried`, `Failed`; attempts recorded.

### Anomaly types
`too_fast` (<20 s), `duplicate_burst` (>10/hr from one IP), `outlier` (>3σ on numeric /
text-length, once ≥5 samples exist). Status: `Pending`, `Acknowledged`, `Resolved`.
Flags never delete/reject unless the form's `AutoRejectAnomalies` is enabled.

### Reference master data
- `/reference/roles`, `/reference/business-groups`, `/reference/regions`, `/reference/products` (IsActive=1), `/reference/customers`, `/reference/outlets`, `/reference/customer-types`, `/reference/lookups` (filtered by category), `/reference/product-prices` (filtered by productId, customerTypeId).
- Seeded geography: Addis Ababa, Oromia, Amhara, SNNPR, Tigray; 10 outlets.
- Seeded products (8) across Coffee, Tea, Cereals, Spices with own unit prices.
- Seeded competitors (12).
- Seeded KPI definitions (7): WK_MI_REPORT, MO_MI_REPORT, COMPETITOR_PRICE, MARKET_VISIT, INTERVIEW, WEEKLY_SALES, FORM_RESPONSE, MULTIMEDIA.
- Sample sales (15 rows, Q1–Q3 2026) power the KPI/report views.

### Opportunities reference data
- **Opportunity types**: `TENDER` (default), `RFQ`, `BUYER_LEAD`, `TRADE_INTELLIGENCE`,
  `MARKET_SIGNAL` — assigned by keyword rules (source type-hint wins), gap-filled by AI
  enrichment only when rules are inconclusive.
- **Product-group taxonomy** (seeded): `COFFEE` (KCC), `BEEF_MEAT`, `PENS_STATIONERY` (BPN),
  `PLATES_TABLEWARE` (BPL), `PAINTS` — matched from `ProductGroup.Keywords`.
- **Relevance buckets**: High 75–100, Medium 50–74, Low 25–49, None 0–24, Unscored;
  "High Relevance" KPI uses the threshold `TENDERS_HIGH_RELEVANCE_THRESHOLD` (70).
- **Seeded sources**: e-GP Ethiopia (public sourcing API), 2merkato Tenders — free section,
  2merkato Tenders — full listing, TenderInfo.org Ethiopia, TenderMetro Ethiopia
  (inactive until `TENDERMETRO_API_KEY`). Candidate/not-integrated providers are listed in
  `Docs/Dev-Docs/Opportunity_Intelligence_Source_Registry.md`.
- **Pursuit statuses**: `New`, `Reviewing`, `Interested`, `Applied`, `Won`, `Lost`, `Archived`.

---

## 26. End-to-end demo scenario

> Rehearse with three personas: **demo-admin** (admin), **demo-manager**
> (tsegaye.n), **demo-field** (field1). All passwords `Password123!`.

1. **Environment** — `npm run dev`, open `http://localhost:3000`.
2. **Landing page** — visit `/` to see the marketing hero page.
3. **Login** — demo-field → `field1` → Dashboard with 10 KPI cards + AI insights.
4. **Market visit** — create, save Draft, submit; note the toast; confirm the `NewReport`
   notification in **Notifications**.
5. **Interview** — demo-field → Interviews → new interview → respondent name, type, satisfaction score → add Q&A pairs → save Draft → submit.
6. **Multimedia** — upload a photo → set region, linked module → submit → pending validation.
7. **Weekly sales** — select business group → customer → product (auto-fills price) → enter quantity → save.
8. **Pricing** — record an undercut price on `Arabica Coffee 1kg` → alert + gap shown.
9. **Forms build** — demo-manager → create "Outlet Stock Check"; add fields + scoring;
   save; set Public access + consent; publish.
10. **Respond** — demo-field → Open forms → fill → (optionally Save & resume) → Submit;
    open the branded thank-you.
11. **Review** — demo-manager → Responses tab → open response → edit within window
    (revision created) → anomalies list → resolve. Report tab → filter dates → chart →
    create share link → open `/share/<token>` incognito (read-only, no login).
12. **Reports** — demo-manager → Reports → AI Insights & Sales with a region filter; try all 14 sub-tabs (incl. **Ask AI**).
13. **Excel export** — demo-manager → Reports → any tab → export to Excel.
14. **Officer performance** — demo-field → My Performance → view score, plans, results, activity log.
15. **Admin** — demo-admin → change a user's role, add a role mapping, add a
    notification config + schedule, review Audit log (export to PDF).
16. **Admin: master data** — demo-admin → manage Business Groups, Customers, Products (with per-type pricing), Product Catalogue (upload photo), Regions & Outlets.
17. **Admin: KPI** — demo-admin → Planning & Performance → create KPI definitions, assign plans, view officer ranking.
18. **Sync** — trigger `/sync`, check `/sync/logs`.
19. **Opportunities** — demo-manager → Tenders → **Collect Now** on a source → open a
    high-relevance item → **"Why?"** → **Save** with status `Reviewing`; try the RFQs,
    Export and Saved views; check a `TENDER_NEW_MATCH` notification after a collection.
20. **Opportunities import** — demo-manager → Import data → download template → fill it →
    run the 5-step wizard → read the Summary cards.
21. **AI** — demo-manager → Reports → **Ask AI** ("Which opportunities close in the next
    14 days?") → note the Data used block; Dashboard → **Predictive insights** → check a
    confidence badge; optionally attach a CSV to the chat.
22. **Admin: competitors** — demo-admin → Competitors → add a competitor product linked to
    an own product → observe the gap toast/alert → bulk-link rows.
23. **Admin: corporate marketing** — demo-admin → Corporate marketing plan → (optional)
    Import Workbook → verify/reject tasks → export CSV.
24. **Support** — any persona → **Help Center** (search a guide) → **Take a Tour**
    (start + complete one) → note the Completed badge.
25. **Dashboard revisit** — confirm updated KPIs (sales total, active gaps, visits,
    predictive cards).

---

## 27. Quick reference

### Frontend routes
| Route                     | Purpose                                      |
| ------------------------- | -------------------------------------------- |
| `/`                       | Landing page (public)                        |
| `/login`                  | Sign in                                      |
| `/dashboard`              | KPIs + predictive insights + AI insights + activity |
| `/notifications`          | My delivery history (unread/all tabs)        |
| `/visits`                 | Market visits (CRUD + review/approve/reject) |
| `/interviews`             | Interviews (CRUD + review/approve/reject)    |
| `/multimedia`             | Photos & videos (upload + validate)          |
| `/forms`                  | Forms list + open forms                      |
| `/forms/[id]`             | Form workspace (Builder/Settings/Responses/Report) |
| `/forms/[id]/respond`     | Signed-in respondent entry point (draft resume) |
| `/forms/[id]/public`      | Anonymous public form fill (Published + Public) |
| `/share/[token]`          | Public read-only share                       |
| `/pricing`                | Competitor pricing + alerts + compare + thresholds |
| `/weekly-sales`           | Weekly sales entries (view/edit/delete)      |
| `/officer/performance`    | Self-service officer performance dashboard   |
| `/reports`                | 14 report sub-tabs (incl. Ask AI) + Power BI + Excel export |
| `/profile`                | User profile (photo, name/email, password)   |
| `/tenders`                | Opportunities explorer + dashboard           |
| `/tenders/buyer-leads` `/tenders/rfqs` `/tenders/export` `/tenders/trade` | Opportunity type presets |
| `/tenders/saved` `/tenders/my-opportunities` | Saved opportunities (identical views) |
| `/tenders/[id]`           | Opportunity detail (score, AI enrich, track) |
| `/tenders/assistant`      | AI Assistant for opportunity data            |
| `/tenders/sources`        | Data source management (Admin/Manager)       |
| `/tenders/interest-profiles` | Interest profile scoring targets (Admin/Manager) |
| `/tenders/import`         | 5-step Excel/CSV import wizard (Admin/Manager) |
| `/help`, `/help/[slug]`   | Help Center (52 guides + 51 FAQs) — sign-in  |
| `/tours`                  | Tour catalog (start/replay, completion badges) |
| `/features`               | Public capability showcase                   |
| `/team`                   | Public team/contributors page                |
| `/admin`                  | Admin Centre (5 tabs)                        |
| `/admin/kpi`              | Planning & Performance (5 tabs)              |
| `/admin/corporate-marketing` | Corporate Marketing Plan (4 tabs, import/export) |
| `/admin/business-groups`  | Business group management                    |
| `/admin/customers`        | Customer management + type manager           |
| `/admin/products`         | Product management + per-type pricing        |
| `/admin/competitors`      | Competitor product master + bulk linking     |
| `/admin/product-catalogue`| Visual product catalogue with photos         |
| `/admin/regions`          | Region & outlet management                   |
| `/admin/ai-renewal`       | AI provider keys + rotation reminder         |
| `/admin/relationship-configuration` | Parent-child entity relationships (URL-only) |

### API surface (`/api/v1`)
| Module            | Endpoints |
| ----------------- | --------- |
| Auth              | `POST /auth/login/local`, `GET /auth/login`, `GET /auth/callback`, `GET /auth/me`, `POST /auth/logout` |
| Market visits     | `GET/POST /market-visits`, `GET/PUT /market-visits/:id`, `POST /market-visits/:id/submit`, `POST /market-visits/:id/review`, `POST /market-visits/:id/approve`, `POST /market-visits/:id/reject` |
| Interviews        | `GET/POST /interviews`, `GET/PUT /interviews/:id`, `POST /interviews/:id/submit`, `POST /interviews/:id/review`, `POST /interviews/:id/approve`, `POST /interviews/:id/reject` |
| Multimedia        | `GET/POST /multimedia`, `GET/PUT/DELETE /multimedia/:id`, `POST /multimedia/:id/validate`, `POST /multimedia/:id/reject` |
| Forms (NexForm)   | `GET /forms`, `POST /forms`, `GET/PUT/DELETE /forms/:id`, `POST /forms/:id/publish`, `POST /forms/:id/archive`, `POST /forms/:id/clone`, `GET /forms/accessible`, `POST/GET /forms/:id/versions`, `GET/PUT /forms/:id/meta`, `GET/PUT /forms/:id/access`, `POST /forms/:id/invites` (+ bulk/revoke), consent get/bump + history, branding get/update, dashboard get/save, `GET/POST /forms/:id/responses`, `GET /forms/:id/responses/detail`, `PUT /forms/:id/responses/:rid`, revisions, erasure, anomalies list/update/recompute, report, shares create/list/revoke, report access grant/revoke, cross-reports CRUD + report, drafts save + mine + resume |
| Weekly sales      | `GET/POST /weekly-sales`, `GET/PUT/DELETE /weekly-sales/:id` |
| Competitor pricing| `GET/POST /competitor-pricing/prices`, `GET/PUT/DELETE /competitor-pricing/prices/:id`, `GET /competitor-pricing/compare`, `GET /competitor-pricing/alerts`, `PUT/DELETE …/alerts/:id/resolve\|dismiss`, `GET/PUT /competitor-pricing/thresholds` |
| Competitors       | `GET/POST /competitors`, `GET/PUT/DELETE /competitors/:id`, `GET /competitors/products`, `GET /competitors/products/categories`, `GET/POST /competitors/products`, `GET/PUT/DELETE /competitors/products/:id`, `PUT /competitors/products/link` (bulk) |
| Opportunities     | `GET /tenders/dashboard`, `/countries`, `/sectors`, `/product-groups`, `/business-groups`, `/` (list), `/saved`, `/sources`, `/interest-profiles`, `/imports`, `/imports/template`, `/:id`; `POST /tenders` , `/:id/save`, `/:id/verify`, `/:id/ai-enrich`, `/:id/relevance-explanation`, `/sources`, `/sources/test`, `/sources/:id/test`, `/sources/:id/collect`, `/sources/collect-all`, `/interest-profiles`, `/imports/parse`, `/imports/commit`; `PUT /:id/save`, `/sources/:id`, `/interest-profiles/:id`; `DELETE /:id/save`, `/sources/:id`, `/interest-profiles/:id`, `/imports/:token` |
| AI                 | `GET /ai/providers`, `POST /ai/assistant`, `/ai/writing`, `/ai/analysis`, `/ai/ask`, `/ai/attachments`, `/ai/predictive`, `GET /ai/predictive/summary`, `POST /ai/public/writing`, `POST /ai/public/ask`; renewal: `GET /ai/renewal/providers/status`, `POST /ai/renewal/validate`, `POST /ai/renewal/apply`, `GET/PUT /ai/renewal/rotation` |
| Officer           | `GET /officer/performance`, `GET /officer/summary`, `GET /officer/trends`, `GET /officer/results`, `GET /officer/plans`, `GET /officer/activity-log` |
| Sync              | `POST /sync`, `GET /sync/logs` |
| Notifications     | `GET /notifications/mine`, `GET /notifications`, `PUT /notifications/:id/read`, `PUT /notifications/read-all` |
| Reports           | `GET /reports/sales`, `/price-comparison`, `/market-visits`, `/forms/answers`, `/product-availability`, `/ai-insights`, `/interviews`, `/weekly-sales`, `/customers`, `/products`, `/competitor-intelligence`, `/kpi-results`, `/powerbi/views`, `/powerbi/embed/:id`, `/reports/export/:type` |
| Admin             | `GET/PUT/DELETE /admin/users/…`, `/admin/role-mapping`, `/admin/notification-config`, `/admin/report-schedules`, `GET /admin/audit`, `/admin/export-audit/:format`, `/admin/business-groups`, `/admin/customers`, `/admin/customer-types`, `/admin/products`, `/admin/product-prices`, `/admin/regions`, `/admin/outlets`, `/admin/lookups` |
| Corporate marketing | `GET/POST /admin/corp-marketing/tasks`, `GET/PUT/DELETE /admin/corp-marketing/tasks/:id`, `GET /admin/corp-marketing/roles`, `/parents`, `/summary`, `POST /admin/corp-marketing/verify`, `GET/POST /admin/corp-marketing/events`, `GET/PUT/DELETE /admin/corp-marketing/events/:id`, `GET /admin/corp-marketing/tasks/export`, `GET /admin/corp-marketing/events/export`, `POST /admin/corp-marketing/import` |
| KPI               | `GET/POST /admin/kpi/definitions`, `GET/PUT/DELETE /admin/kpi/definitions/:id`, `GET/POST /admin/kpi/results`, `GET/PUT/DELETE /admin/kpi/results/:id`, `GET /admin/kpi/officer/:id`, `POST /admin/kpi/bulk-results` |
| Planning          | `GET/POST /admin/plans`, `GET/PUT/DELETE /admin/plans/:id`, `POST /admin/plans/:id/submit`, `POST /admin/plans/:id/approve`, `POST /admin/plans/:id/reject`, `GET/POST /admin/plans/:id/activities`, `GET/PUT/DELETE /admin/plans/:id/activities/:aid` |
| Relationships     | `GET/POST /admin/relationships`, `GET/PUT/DELETE /admin/relationships/:id`, `GET/POST /admin/relationships/:id/items`, `GET/PUT/DELETE /admin/relationships/:id/items/:iid`, `GET /admin/relationships/resolve` |
| Reference         | `GET /reference/roles`, `/business-groups`, `/regions`, `/products`, `/customers`, `/outlets`, `/customer-types`, `/lookups`, `/product-prices` |
| Other             | `GET /health` |

### Cron jobs (`backend/src/cron/jobs.ts`)
| Schedule (UTC) | Job | Notes |
| -------------- | --- | ----- |
| `D365FO_SYNC_CRON` (daily default) | `syncD365FO` | Only when `D365FO sync enabled` |
| `0 2 * * *` | AI key rotation check | Marks `ai.rotation.due=true` when due (audit only, no email) |
| `0 3 * * *` | `processErasureRequests` | GDPR erasure of Pending requests >30 days |
| `0 4 * * *` | `purgeAuditLog` (365 days) + `purgeDrafts` (7 days) | Retention |
| `15 4 * * *` | Predictive refresh + insight purge | Recomputes 11 modules; `prediction.enabled=0` disables |
| `30 4 * * *` | `recomputeAnomalies` | Nightly re-scan of published forms |
| `45 4 * * *` | AI attachment purge | Deletes `ai-*` uploads older than 7 days |
| `0 7 * * *` | Price-gap health signal | Logs active `PriceGapAlert` count |
| `0 9 * * *` | Form expiry reminders (`FORM_REMINDER`) | Published forms expiring ≤24 h |
| `0 9 * * *` (`TENDERS_REMINDER_CRON`) | Tender deadline reminders | Saved opportunities ≤ `TENDERS_REMINDER_LEAD_DAYS` (7) |
| `TENDERS_COLLECTION_CRON` (default `0 */6 * * *`) | Tender source collection | **Off unless** `TENDERS_COLLECTION_ENABLED=true` |

---

## 28. Appendix: capability-by-feature checklist

| Capability                         | Status |
| ---------------------------------- | ------ |
| Local login / JWT session          | ✅     |
| CUAS SSO redirect + role mapping   | 🟡 (live exchange stubbed) |
| Landing page                       | ✅     |
| Market visits CRUD + review/approve/reject | ✅ |
| Interviews CRUD + Q&A + sentiment  | ✅     |
| Multimedia upload + validate       | ✅     |
| Weekly sales CRUD + revenue        | ✅     |
| NexusForm builder (30 types, logic, pages, scoring, styling) | ✅ |
| Access modes & invites             | ✅     |
| Consent versioning                 | ✅ (bump + history); 🟡 no consent push-email |
| Save & resume                      | ✅     |
| Response editing + revisions       | ✅     |
| GDPR erasure request & job         | ✅     |
| Anomaly detection & review         | ✅     |
| Cross-form reports & sharing       | ✅     |
| Public share (`/share/:token`)     | ✅     |
| Form dashboards (auto + custom)    | ✅     |
| File upload storage                | 🟡 (key stored; scan status written only; no scan service) |
| Excel/PDF export (reports)         | ✅     |
| Real-time dashboards (10 KPIs)     | ✅     |
| AI insights                        | 🟡 rule-based (not ML) |
| Pricing + gap alerts + thresholds  | ✅     |
| Competitor catalogue               | ✅     |
| Officer performance dashboard      | ✅     |
| KPI definitions + results + ranking| ✅     |
| Marketing plans + activities       | ✅     |
| Notifications (Email)              | 🟡 mock delivery in dev; live provider stubbed |
| Notification config & schedules    | 🟡 config CFUD; schedules persisted (no executor) |
| Audit log + purge + export         | ✅     |
| Admin: Users, Roles, Regions, Outlets | ✅  |
| Admin: Business Groups             | ✅     |
| Admin: Customers + Types           | ✅     |
| Admin: Products + Per-type pricing | ✅     |
| Admin: Product Catalogue (photos)  | ✅     |
| Admin: Relationship Configuration  | ✅     |
| D365FO sync                        | 🟡 deterministic mock in dev; live client TODO |
| Power BI catalogue + embed         | 🟡 seeded catalogue; embed token placeholder/JS-SDK TODO |
| Dark mode                          | ✅     |
| Profile photo upload + crop        | ✅     |
| Password change                    | ✅     |
| Public form fill (`/forms/:id/public`) | ✅  |
| Shops-visited capture + reporting  | ✅     |
| Weekly sales view/edit + product attributes | ✅ |
| Opportunities: source collection + dashboard | ✅ (scheduled collection off by default; TenderMetro inactive until API key set) |
| Opportunity relevance scoring & interest profiles | ✅ |
| Opportunity import wizard (Excel/CSV) | ✅  |
| Opportunity tracking (save + 7 statuses) | ✅  |
| AI enrichment for opportunities    | ✅ (provider-dependent; per-source opt-in) |
| AI form assistant (preview→apply)  | ✅     |
| AI writing assistant + response analysis | ✅ |
| Ask AI (27 tools) + global launcher + attachments | ✅ |
| Public landing AI chat             | ✅     |
| Predictive insights (11 modules)   | ✅ (deterministic engine, no LLM) |
| Reports "Ask AI" tab               | ✅     |
| AI Renewal: status + validate/apply + rotation | ✅ |
| AI rotation due notification/email | ⛔ (badge + audit log only) |
| Corporate marketing plan (tabs, CRUD, import, export, pagination) | ✅ |
| Competitor product master + bulk linking | ✅ |
| Competitor entity edit/delete UI   | ⛔ (API exists; no screen) |
| Help Center (52 guides / 51 FAQs)  | ✅     |
| Guided tours (33 tours / 188 steps) | ✅    |
| Public `/features` & `/team` pages | ✅     |

---

*Prepared as an implementation-accurate guide. Where a feature is marked 🟡/⛔ it refers
to the live-provider wiring only; the in-app UI for those features is present and
functional against the mock adapters in development.*
