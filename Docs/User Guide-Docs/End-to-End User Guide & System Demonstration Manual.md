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
20. [Key workflows (step by step)](#20-key-workflows-step-by-step)
21. [Validation, errors & toasts](#21-validation-errors--toasts)
22. [Data reference](#22-data-reference)
23. [End-to-end demo scenario](#23-end-to-end-demo-scenario)
24. [Quick reference](#24-quick-reference)
25. [Appendix: capability-by-feature checklist](#25-appendix-capability-by-feature-checklist)

---

## 1. System overview

KG-MIS is a web platform for the Marketing department to:

- Capture **market visit reports** at retail/wholesale outlets.
- Conduct and record **customer/distributor interviews** with Q&A pairs and sentiment tracking.
- Capture **multimedia evidence** (photos, videos, audio) with validation workflows.
- Build and run **dynamic surveys/forms** (NexForm) and collect responses inline.
- Track **competitor pricing** and auto-flag price gaps vs. own (D365FO) prices.
- Record **weekly sales** entries with revenue computation per product/outlet.
- Dispatch **notifications** (Email/SMS/WhatsApp) on business events.
- View **reports and Power BI-style dashboards** (sales, pricing, visits, forms, interviews, multimedia, KPIs).
- Track **officer performance** with KPI scoring, plan assignments, and activity logging.
- **Synchronize master data** (products, customers, sales) from D365FO.
- Administer **users, roles, business groups, customers, products, regions, outlets, notification config, schedules, audit trail** via an Admin Centre.

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
```

| Layer     | Technology                          | Status                        |
| --------- | ----------------------------------- | ----------------------------- |
| Web       | Next.js 14, TypeScript              | ✅ Built                      |
| API       | Node.js, Express, TypeScript        | ✅ Built (`/api/v1`)          |
| Database  | MS SQL Server (`KG_MIS`)            | ✅ Migrations + seed (27 migrations, 40+ tables) |
| Identity  | CUAS (SSO)                          | 🟡 Mock in dev; live provider partial |
| Notify    | SMTP (Email)                        | 🟡 Mock delivery in dev       |
| Master data | D365FO via OData/REST             | 🟡 Mock sync in dev           |
| Analytics | Power BI                           | 🟡 Seeded catalogue + placeholder embed |

**Integration mode flags** (see `backend/.env.example`):
- `D365FO_MOCK=true` — deterministic sample master-data sync.
- `CUAS_SSO_ENABLED=false` — local login against dev users.
- `POWERBI_MOCK=true` — seeded Power BI catalogue + placeholder embed tokens.

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
npm run db:migrate          # runs backend/migrations/*.sql
npm run db:seed             # backend/seed/seed.sql + scripts/seed.js (sets dev passwords)
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

| Section          | Item              | Roles visible to                                            |
| ---------------- | ----------------- | ----------------------------------------------------------- |
| **Overview**     | Dashboard         | All five roles                                               |
|                  | Notifications     | All five roles                                               |
| **Field Intelligence** | Market Visits | Administrator, Marketing Manager, Marketing Analyst, Field Officer |
|                  | Interviews        | All five roles                                               |
|                  | Photos & Videos   | All five roles                                               |
|                  | Forms & Surveys   | All five roles                                               |
|                  | Competitor Pricing| Administrator, Marketing Manager, Marketing Analyst, Field Officer |
|                  | Weekly Sales      | All five roles                                               |
|                  | My Performance    | Administrator, Marketing Manager, Marketing Analyst, Field Officer |
| **Analytics**    | Reports & Power BI| Administrator, Marketing Manager, Marketing Analyst, Viewer |
| **Administration** | Admin Centre    | Administrator only                                          |
|                  | Planning & Performance | Administrator only                                      |
|                  | Business Groups   | Administrator only                                          |
|                  | Customers         | Administrator only                                          |
|                  | Products          | Administrator only                                          |
|                  | Product Catalogue | Administrator only                                          |
|                  | Regions & Outlets | Administrator only                                          |

### Global components
- **Shell** — persistent layout with collapsible sidebar + top bar; the current page title and
  breadcrumb context come from the routing tree. Top bar includes notification bell
  (30s polling with unread count badge, "99+" overflow), dark mode toggle, and
  user avatar dropdown (Profile, Sign out).
- **Guard** — wraps every internal page. When unauthenticated it redirects to
  `/login`; when a page declares a restricted role (e.g. Admin Centre two-level
  `Guard` + `RequireRole`) it shows a 403-style message instead of content.
- **Toasts** — non-blocking notifications rendered top-right (`.toast-viewport`).
  Used for action confirmation and errors. Duration: success 3s, error 5s, info 3.5s,
  warning 4s; identical messages are de-duplicated.
- **Inline alerts** — page-level fetch failures show a red `.alert.alert-error`
  banner at the top of the relevant card.
- **Dark mode** — toggle in top bar, persisted to `localStorage` (`kgmis_theme`), inline
  script in layout to prevent FOUC (flash of unstyled content).
- **User profile** — sidebar bottom shows user avatar/name/role, clickable to `/profile`.

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
- Footer note: "Development build — CUAS SSO is wired in production."

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

Route: `/` (root). Public, no authentication required.

A marketing-style hero page for KG-MIS with:
- Product branding and tagline.
- Capabilities showcase highlighting the system's core features.
- Call-to-action linking to `/login`.

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
- **Customers by Type** — donut chart.
- **Products by Category** — bar chart.
- **Top Officers** — ranked table with gold/silver/bronze rank badges.
- **Generated alerts** — severity-coloured list of system alerts.
- **Recent notifications** — latest 5 notifications with channel icons.
- **AI Insights** — generated from `/reports/ai-insights`: KPI values plus plain-text
  observations (highest-sales region, best product, average gap, review rate,
  published forms/responses). 🟡 This is a rule-based aggregate, **not** ML.

### Quick capture grid
- 10 quick-link tiles to all major features (log visit, conduct interview, submit sales, view KPIs, etc.).
- Skeleton loading states for all sections on initial load.

---

## 9. Module: Notifications

Route: `/notifications`. Lists the current user's **delivery history**.

### Tabs
- **Unread** — filtered to unread notifications only, with count badge.
- **All** — all notifications.

### Features
- **Event filter** — dropdown with 12+ event types (NewReport, PriceGapAlert, SyncFailure, etc.).
- **Columns**: Event | Subject | Channel | Status | Attempts | Created.
- **Mark read** — individual mark-as-read button per row; "Mark all read" bulk action.
- **Unread count** — polled every 30 seconds in the Shell top bar; badge shows "99+" for large counts.

### Channels supported (sent this release): `Email`
- `SMS`, `WhatsApp`, `Push`, `In-App` exist in the channel dropdown but are **not** dispatched in this build.

### Delivery
- Fire-and-forget with up to 2 attempts (initial + one automatic retry).
- Statuses: `Pending`, `Sent`, `Retried`, `Failed`.
- Recipients: either explicit `userIds` (e.g. form owner, respondent) or all active
  users whose role has an enabled `NotificationConfig` row for the trigger event.
- 🟡 In development every send is **mocked** (status logged, no real email).

### Trigger events (31 types)
`NewReport`, `ReportApproved`, `ReportRejected`, `InterviewApproved`, `InterviewRejected`,
`PriceGapAlert`, `SyncFailure`, `FORM_ASSIGNED`, `FORM_REMINDER`, `SUBMISSION_CONFIRMED`,
`NEW_RESPONSE_RECEIVED`, `RESPONSE_LIMIT_WARNING`, `FORM_PUBLISHED`, `FORM_INVITE`,
`OWNERSHIP_TRANSFERRED`, `ACCESS_DENIED`, `PARENT_FORM_UPDATED`, `PARENT_PROPAGATED`,
`FORM_RESUME`, `REPORT_SHARED`, `RESPONSE_EDITED`, `ANOMALY_FLAGGED`,
`CONSENT_VERSION_BUMPED`, `NEW_PLAN_CREATED`, `NewFormCreated`, `NewWeeklySales`,
`NewCompetitorPricing`, `NewMultimedia`, `NewFormResponse`, `NewMarketVisit`,
`NewCustomerInterview`, `GapAlert`.

---

## 10. Module: Market Visits

Route: `/visits`. Field Officers capture outlet visits; Managers/Admins review them.

### Fields (visits/new visit form)
| Field              | Type         | Required | Notes                                  |
| ------------------ | ------------ | -------- | -------------------------------------- |
| Outlet             | Select       | Yes      | From reference `/outlets`              |
| Visit date         | Date (yyyy-mm-dd) | Yes |                                      |
| Visit type         | Select       | No       | configurable via lookups               |
| Business group     | Select       | No       | Filters products/outlets               |
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
- **30 field types** across 8 categories (see §22 for the full table).
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
- **Anomalies**: flags auto-detected on submission (see §22); manager/admin can set
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

### Fields (create modal)
| Field              | Type     | Notes                                      |
| ------------------ | -------- | ------------------------------------------ |
| Week ending        | Date     | Yes                                        |
| Business group     | Select   | Filters products and customers             |
| Customer           | Select   | Shows customer type                        |
| Product            | Select   | Auto-fills unit price from product-prices API |
| Region             | Select   | Yes                                        |
| Outlet             | Select   | Yes                                        |
| Quantity sold      | Number   | Yes, > 0                                   |
| Unit price (ETB)   | Number   | Auto-populated, editable                   |
| Notes              | Textarea | No                                         |

### Features
- **Revenue** computed column: `QuantitySold × UnitPrice` (stored as computed column).
- **Auto-price lookup**: fetches tier price based on product + customer type via `/reference/product-prices`.
- **Business group filtering**: products and customers filtered by selected business group.
- **Summary stats**: entry count, total quantity, total revenue (ETB).
- **Filters**: search text, date, region, business group, customer type, status.
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

Route: `/reports`. Tabs: **13 sub-tabs**.

### Tab 1: AI Insights
Rule-based aggregate + plain-text "observations". KPIs: Total sales (ETB),
Active price gaps, Market visits, Form responses. Generated at request time.
🟡 Not ML — deterministic statistics over the reporting views.

### Tab 2: Sales
Filters: `from`, `to`, region. Output: Total sales (ETB), orders, units sold, products
sold, regions covered; **Sales by region** bar chart; **Top 10 products** table
(quantity + amount). Source: `vw_Report_SalesByOutlet`.

### Tab 3: Customers
Filters: region, business group, customer type. Four bar charts: by type, by region, by business group, by star rating.

### Tab 4: Products
Filters: category, business group. Charts: by category, by business group. Pricing tiers table.

### Tab 5: Market Visits
Filters: `from`, `to`, region. Output: status counts, detail table. Source: `vw_Report_MarketVisits`.

### Tab 6: Price Comparison
Filters: region, category. Table: Product, Competitor, Competitor price, Own price,
Gap (%), Region, Date. Source: `vw_Report_PriceComparison`.

### Tab 7: Competitor Intel
By competitor summary, recent intelligence table.

### Tab 8: Interviews
Sentiment breakdown (positive/neutral/negative bar chart), by region, sentiment donut.

### Tab 9: Weekly Sales
Revenue by region, top products by revenue.

### Tab 10: KPI Performance
By officer ranking, KPI breakdown, frequency filter.

### Tab 11: Forms
Form response answers table.

### Tab 12: Availability
Product availability by outlet with availability rate badges.

### Tab 13: Power BI 🟡
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

---

## 19. Module: D365FO Sync

- `POST /sync` (or `/sync/d365fo`) triggers a master-data sync.
- `GET /sync/logs` lists sync attempts (limit param, default 50).
- 🟡 Dev runs a **mock deterministic dataset** (products, customers, sales, outlets).
  In production the D365FO OData client would refresh products/customers/sales; the
  connector contains TODO stubs (`D365FO_MOCK=false`).
- Failures can dispatch `SyncFailure` → Administrator (Email).

---

## 20. Key workflows (step by step)

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
13. **Relationship Configuration**: set up cascading dropdown rules.
14. Trigger a **Sync** and check `/sync/logs`.

---

## 21. Validation, errors & toasts

### Error style
- API returns a standard error envelope via the Express error handler:
  `{ error: { message, code?, details? } }` with proper HTTP status
  (`400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`,
  `409 Conflict`, `422 Validation`, `429 Too Many Requests`).
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

### Toast examples (implementation)
- `Welcome, <name>` (login), `Draft report created` (visit),
  `Role updated for <name>` / `Region assigned` (admin),
  `Mapping saved`, `Config saved`, `Schedule added` (admin),
  `Role update failed` / `Save failed` / `Remove failed` (error toasts on failures).
- Consent save shows a **toast + inline success alert** inside the consent card.

---

## 22. Data reference

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
- Channels: `Email` (sent); `SMS`, `WhatsApp`, `Push`, `In-App` listed but not sent.
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

---

## 23. End-to-end demo scenario

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
12. **Reports** — demo-manager → Reports → AI Insights & Sales with a region filter; try all 13 sub-tabs.
13. **Excel export** — demo-manager → Reports → any tab → export to Excel.
14. **Officer performance** — demo-field → My Performance → view score, plans, results, activity log.
15. **Admin** — demo-admin → change a user's role, add a role mapping, add a
    notification config + schedule, review Audit log (export to PDF).
16. **Admin: master data** — demo-admin → manage Business Groups, Customers, Products (with per-type pricing), Product Catalogue (upload photo), Regions & Outlets.
17. **Admin: KPI** — demo-admin → Planning & Performance → create KPI definitions, assign plans, view officer ranking.
18. **Sync** — trigger `/sync`, check `/sync/logs`.
19. **Dashboard revisit** — confirm updated KPIs (sales total, active gaps, visits).

---

## 24. Quick reference

### Frontend routes
| Route                     | Purpose                                      |
| ------------------------- | -------------------------------------------- |
| `/`                       | Landing page (public)                        |
| `/login`                  | Sign in                                      |
| `/dashboard`              | KPIs + AI insights + activity                |
| `/notifications`          | My delivery history (unread/all tabs)        |
| `/visits`                 | Market visits (CRUD + review/approve/reject) |
| `/interviews`             | Interviews (CRUD + review/approve/reject)    |
| `/multimedia`             | Photos & videos (upload + validate)          |
| `/forms`                  | Forms list + open forms                      |
| `/forms/[id]`             | Form workspace (Builder/Settings/Responses/Report) |
| `/forms/[id]/respond`     | Respondent entry point                       |
| `/share/[token]`          | Public read-only share                       |
| `/pricing`                | Competitor pricing + alerts + compare + thresholds |
| `/weekly-sales`           | Weekly sales entries                         |
| `/officer/performance`    | Self-service officer performance dashboard   |
| `/reports`                | 13 report sub-tabs + Power BI + Excel export |
| `/profile`                | User profile (photo, password)               |
| `/admin`                  | Admin Centre (5 tabs)                        |
| `/admin/kpi`              | Planning & Performance (5 tabs)              |
| `/admin/business-groups`  | Business group management                    |
| `/admin/customers`        | Customer management + type manager           |
| `/admin/products`         | Product management + per-type pricing        |
| `/admin/product-catalogue`| Visual product catalogue with photos         |
| `/admin/regions`          | Region & outlet management                   |
| `/admin/relationship-configuration` | Parent-child entity relationships |

### API surface (`/api/v1`)
| Module            | Endpoints |
| ----------------- | --------- |
| Auth              | `POST /auth/login/local`, `GET /auth/login`, `GET /auth/callback`, `GET /auth/me`, `POST /auth/logout` |
| Market visits     | `GET/POST /market-visits`, `GET/PUT /market-visits/:id`, `POST /market-visits/:id/submit`, `POST /market-visits/:id/review`, `POST /market-visits/:id/approve`, `POST /market-visits/:id/reject` |
| Interviews        | `GET/POST /interviews`, `GET/PUT /interviews/:id`, `POST /interviews/:id/submit`, `POST /interviews/:id/review`, `POST /interviews/:id/approve`, `POST /interviews/:id/reject` |
| Multimedia        | `GET/POST /multimedia`, `GET/PUT/DELETE /multimedia/:id`, `POST /multimedia/:id/validate`, `POST /multimedia/:id/reject` |
| Forms (NexForm)   | `GET /forms`, `POST /forms`, `GET/PUT/DELETE /forms/:id`, `POST /forms/:id/publish`, `POST /forms/:id/archive`, `POST /forms/:id/clone`, `GET /forms/accessible`, `POST/GET /forms/:id/versions`, `GET/PUT /forms/:id/meta`, `GET/PUT /forms/:id/access`, `POST /forms/:id/invites` (+ bulk/revoke), consent get/bump + history, branding get/update, dashboard get/save, `GET/POST /forms/:id/responses`, `GET /forms/:id/responses/detail`, `PUT /forms/:id/responses/:rid`, revisions, erasure, anomalies list/update/recompute, report, shares create/list/revoke, report access grant/revoke, cross-reports CRUD + report, drafts save + mine + resume |
| Weekly sales      | `GET/POST /weekly-sales`, `GET/DELETE /weekly-sales/:id` |
| Competitor pricing| `GET/POST /competitor-pricing/prices`, `GET/PUT/DELETE /competitor-pricing/prices/:id`, `GET /competitor-pricing/compare`, `GET /competitor-pricing/alerts`, `PUT/DELETE …/alerts/:id/resolve\|dismiss`, `GET/PUT /competitor-pricing/thresholds` |
| Competitors       | `GET/POST /competitors`, `GET/PUT/DELETE /competitors/:id` |
| Officer           | `GET /officer/performance`, `GET /officer/summary`, `GET /officer/trends`, `GET /officer/results`, `GET /officer/plans`, `GET /officer/activity-log` |
| Sync              | `POST /sync`, `GET /sync/logs` |
| Notifications     | `GET /notifications/mine`, `GET /notifications`, `PUT /notifications/:id/read`, `PUT /notifications/read-all` |
| Reports           | `GET /reports/sales`, `/price-comparison`, `/market-visits`, `/forms/answers`, `/product-availability`, `/ai-insights`, `/interviews`, `/weekly-sales`, `/customers`, `/products`, `/competitor-intelligence`, `/kpi-results`, `/powerbi/views`, `/powerbi/embed/:id`, `/reports/export/:type` |
| Admin             | `GET/PUT/DELETE /admin/users/…`, `/admin/role-mapping`, `/admin/notification-config`, `/admin/report-schedules`, `GET /admin/audit`, `/admin/export-audit/:format`, `/admin/business-groups`, `/admin/customers`, `/admin/customer-types`, `/admin/products`, `/admin/product-prices`, `/admin/regions`, `/admin/outlets`, `/admin/lookups` |
| KPI               | `GET/POST /admin/kpi/definitions`, `GET/PUT/DELETE /admin/kpi/definitions/:id`, `GET/POST /admin/kpi/results`, `GET/PUT/DELETE /admin/kpi/results/:id`, `GET /admin/kpi/officer/:id`, `POST /admin/kpi/bulk-results` |
| Planning          | `GET/POST /admin/plans`, `GET/PUT/DELETE /admin/plans/:id`, `POST /admin/plans/:id/submit`, `POST /admin/plans/:id/approve`, `POST /admin/plans/:id/reject`, `GET/POST /admin/plans/:id/activities`, `GET/PUT/DELETE /admin/plans/:id/activities/:aid` |
| Relationships     | `GET/POST /admin/relationships`, `GET/PUT/DELETE /admin/relationships/:id`, `GET/POST /admin/relationships/:id/items`, `GET/PUT/DELETE /admin/relationships/:id/items/:iid`, `GET /admin/relationships/resolve` |
| Reference         | `GET /reference/roles`, `/business-groups`, `/regions`, `/products`, `/customers`, `/outlets`, `/customer-types`, `/lookups`, `/product-prices` |
| Other             | `GET /health` |

### Cron jobs
`purgeAuditLog` (365 days), `purgeDrafts` (abandoned → 7 days), `processErasureRequests`
(30 days), `recomputeAnomalies` (daily), `syncD365FO` (daily), `checkGapAlerts` (daily).

---

## 25. Appendix: capability-by-feature checklist

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

---

*Prepared as an implementation-accurate guide. Where a feature is marked 🟡/⛔ it refers
to the live-provider wiring only; the in-app UI for those features is present and
functional against the mock adapters in development.*
