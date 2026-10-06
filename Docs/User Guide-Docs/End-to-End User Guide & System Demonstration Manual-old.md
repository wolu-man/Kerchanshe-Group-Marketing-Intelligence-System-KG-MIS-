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
7. [Module: Dashboard](#7-module-dashboard)
8. [Module: Notifications](#8-module-notifications)
9. [Module: Market Visits](#9-module-market-visits)
10. [Module: Forms & Surveys (NexForm)](#10-module-forms--surveys-nexform)
11. [Module: Competitor Pricing](#11-module-competitor-pricing)
12. [Module: Reports & Power BI](#12-module-reports--power-bi)
13. [Module: Admin Centre](#13-module-admin-centre)
14. [Module: D365FO Sync](#14-module-d365fo-sync)
15. [Key workflows (step by step)](#15-key-workflows-step-by-step)
16. [Validation, errors & toasts](#16-validation-errors--toasts)
17. [Data reference](#17-data-reference)
18. [End-to-end demo scenario](#18-end-to-end-demo-scenario)
19. [Quick reference](#19-quick-reference)
20. [Appendix: capability-by-feature checklist](#20-appendix-capability-by-feature-checklist)

---

## 1. System overview

KG-MIS is a web platform for the Marketing department to:

- Capture **market visit reports** at retail/wholesale outlets.
- Build and run **dynamic surveys/forms** (NexForm) and collect responses inline.
- Track **competitor pricing** and auto-flag price gaps vs. own (D365FO) prices.
- Dispatch **notifications** (Email/SMS/WhatsApp) on business events.
- View **reports and Power BI-style dashboards** (sales, pricing, visits, forms).
- **Synchronize master data** (products, customers, sales) from D365FO.
- Administer **users, roles, notification config, schedules, audit trail** via an Admin Centre.

Users are authenticated with corporate SSO (CUAS) in production and a local
development login in development.

---

## 2. Architecture & integration modes

```
Field / Marketing users → Next.js web portal (:3000) → Express/TypeScript API (:4000) → MS SQL Server (KG_MIS)
                                                      ↕ D365FO  (master data, OData, read-only)
                                                      ↕ CUAS    (SSO login + role claims)
                                                      ↕ CNS     (email / SMS / WhatsApp)
                                                      ↕ Power BI (reporting views, embed tokens)
```

| Layer     | Technology                          | Status                        |
| --------- | ----------------------------------- | ----------------------------- |
| Web       | Next.js 15, TypeScript              | ✅ Built                      |
| API       | Node.js, Express, TypeScript        | ✅ Built (`/api/v1`)          |
| Database  | MS SQL Server (`KG_MIS`)            | ✅ Migrations + seed          |
| Identity  | CUAS (SSO)                          | 🟡 Mock in dev; live provider partial |
| Notify    | CNS (Email/SMS/WhatsApp)            | 🟡 Mock delivery in dev       |
| Master data | D365FO via OData/REST             | 🟡 Mock sync in dev           |
| Analytics | Power BI                           | 🟡 Seeded catalogue + placeholder embed |

**Integration mode flags** (see `backend/.env.example`):
- `D365FO_MOCK=true` — deterministic sample master-data sync.
- `CUAS_SSO_ENABLED=false` — local login against dev users.
- `CNS_MOCK=true` — simulated notification delivery (status recorded).
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
npm install
cp .env.example .env        # backend: set DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME
npm run db:migrate          # runs backend/migrations/*.sql
npm run db:seed             # backend/seed/seed.sql + scripts/seed.js (sets dev passwords)
```

### Run
```sh
npm run dev                 # API (:4000) and web (:3000) concurrently
npm run dev:server          # API only
npm run dev:web             # web portal only
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
| **Field Intelligence** | Market Visits | All but Viewer                                              |
|                  | Forms & Surveys   | All but Viewer                                              |
|                  | Competitor Pricing| All but Viewer                                              |
| **Analytics**    | Reports & Power BI| Administrator, Marketing Manager, Marketing Analyst, Viewer |
| **Administration** | Admin Centre    | Administrator only                                          |

### Global components
- **Shell** — persistent layout with sidebar + top bar; the current page title and
  breadcrumb context come from the routing tree.
- **Guard** — wraps every internal page. When unauthenticated it redirects to
  `/login`; when a page declares a restricted role (e.g. Admin Centre two-level
  `Guard` + `RequireRole`) it shows a 403-style message instead of content.
- **Toasts** — non-blocking notifications rendered top-right (`.toast-viewport`).
  Used for action confirmation and errors. Duration: success 3s, error 5s, info 3.5s,
  warning 4s; identical messages are de-duplicated.
- **Inline alerts** — page-level fetch failures show a red `.alert.alert-error`
  banner at the top of the relevant card.

---

## 5. Roles & permissions

### Roles (stable IDs)

| ID | Role                | Description                                  |
| -- | ------------------- | -------------------------------------------- |
| 1  | Administrator       | Full system administration                   |
| 2  | Marketing Manager   | Owns forms/visits/pricing + approval         |
| 3  | Marketing Analyst   | Forms, pricing analysis, reports             |
| 4  | Field Officer       | Field data capture (forms, visits, pricing)  |
| 5  | Viewer              | Read‑only dashboards & reports               |

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
| marketVisits.create/update/submit | full | full | read* | write-own | — |
| marketVisits.review     | full          | full             | —                 | —             | —     |
| marketVisits.view       | full          | full             | read              | read-own      | —     |
| forms.create/update     | full          | full             | full              | —             | —     |
| forms.delete/publish/archive | full    | write-own        | write-own         | —             | —     |
| forms.reassignOwnership | full          | —                | —                 | —             | —     |
| forms.configureAccess   | full          | write-own        | write-own         | —             | —     |
| forms.respond           | —             | —                | —                 | write-own     | —     |
| forms.view              | full          | full             | read-own          | read          | read  |
| forms.viewResponses     | full          | full             | read-own          | read-own      | —     |
| forms.editResponses     | full          | full             | write-own         | —             | —     |
| forms.share             | full          | full             | write-own         | —             | —     |
| forms.viewAnomalies     | full          | full             | read              | —             | —     |
| forms.manageAnomalies   | full          | full             | —                 | —             | —     |
| forms.crossReports      | full          | full             | full              | —             | —     |
| pricing.record          | full          | full             | —                 | write-own      | —     |
| pricing.view            | full          | full             | read              | region        | —     |
| pricing.configureThresholds | full       | —                | —                 | —             | —     |
| sync.trigger / sync.viewLogs | full      | —                | —                 | —             | —     |
| admin.* (all)           | full          | —                | —                 | —             | —     |
| reports.view            | full          | full             | full              | —             | read  |

*Market Analyst has no create/update/submit permission for visits in the matrix; the
sidebar still shows the section but server-side `can()` guard denies write actions.

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

## 7. Module: Dashboard

Route: `/dashboard`. Shows a summary of market intelligence:
- **KPI cards**: Total sales (ETB, from synced D365FO `SalesRecord`), Active price
  gaps, Market visits.
- **AI insights**: generated from `/reports/ai-insights` — KPI values plus plain-text
  observations (highest-sales region, best product, average gap, review rate,
  published forms/responses). 🟡 This is a rule-based aggregate, **not** ML.
- **Recent notifications preview** and latest activity.

---

## 8. Module: Notifications

Route: `/notifications`. Lists the current user's **delivery history** (page size 20,
paged via Prev/Next).

Columns: Event | Subject | Channel | Status | Attempts | Created.

- **Channels supported (sent this release):** `Email`, `SMS`, `WhatsApp`.
  `Push` / `In-App` exist in the channel dropdown but are **not** dispatched.
- **Delivery:** fire-and-forget with up to 2 attempts (initial + one automatic retry).
  Statuses: `Pending`, `Sent`, `Retried`, `Failed`.
- **Recipients:** either explicit `userIds` (e.g. form owner, respondent) or all active
  users whose role has an enabled `NotificationConfig` row for the trigger event.
- 🟡 In development every send is **mocked** (status logged, no real email). SMS/WhatsApp
  phone numbers are placeholders derived from the user ID.

### Trigger events that generate notifications
`NewReport`, `PriceGapAlert`, `SyncFailure`, `FORM_ASSIGNED`, `FORM_REMINDER`,
`SUBMISSION_CONFIRMED`, `NEW_RESPONSE_RECEIVED`, `RESPONSE_LIMIT_WARNING`,
`FORM_PUBLISHED`, `OWNERSHIP_TRANSFERRED`, `ACCESS_DENIED`, `PARENT_FORM_UPDATED`,
`PARENT_PROPAGATED`, `FORM_RESUME`, `REPORT_SHARED`, `RESPONSE_EDITED`,
`ANOMALY_FLAGGED`, `CONSENT_VERSION_BUMPED`.

> The `FormResponse`-related events above (e.g. `FORM_ASSIGNED`) are defined and
> dispatched in code; several Phase‑2 events fire only when the corresponding
> workflow is exercised (see Appendix for which paths dispatch them).

---

## 9. Module: Market Visits

Route: `/visits`. Field Officers capture outlet visits; Managers/Admins review them.

### Fields (visits/new visit form)
| Field       | Type         | Required | Notes                                  |
| ----------- | ------------ | -------- | -------------------------------------- |
| Outlet      | Select       | Yes      | From reference `/outlets`              |
| Visit date  | Date (yyyy-mm-dd) | Yes |                                      |
| Notes       | Textarea     | No       | Up to 4000 chars, rich-text allowed    |

### Lifecycle
`Draft` → `Submit` → `Reviewed`

| Action        | Who                                   | Notes                                  |
| ------------- | ------------------------------------- | -------------------------------------- |
| Create        | Admin, Manager, Field Officer         | Starts as `Draft`; toast "Draft report created" |
| Edit          | Owner of a Draft                      | Only while `Draft`; field officers can edit their own (write-own). |
| Submit        | Owner of a Draft                      | Only drafts; triggers `NewReport` notification (Email → Marketing Manager). |
| Review        | Administrator, Marketing Manager only | Requires status `Submitted` → `Reviewed`. |

### Listing & filters
Filters: outlet, region, status, `fromDate`, `toDate`. Scope:
- Manager/Admin see all; Analyst sees all (read); Field Officer sees only their own
  (`own` scope).

---

## 10. Module: Forms & Surveys (NexForm)

This is the largest module. Builders, designers, reporters, respondents, admins all
share `/forms`. Support for public respondents (no login) and internal Field Officers.

### 10.1 Forms list (`/forms`)
- **Filter** by status: All / Draft / Published / Archived.
- **Create form** ("New form") — title (required) + optional description. Available to
  Administrator, Marketing Manager, Marketing Analyst.
- **Open forms** panel (Field Officers): published, in-window forms they may fill in.
- Row quick actions depend on role/status.

### 10.2 Form page (`/forms/[id]`) — main tabs: Builder, Settings, Responses, Report

#### Builder tab (FormBuilder)
- **23 field types** across 5 categories (see §17 for the full table).
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
- **Anomalies**: flags auto-detected on submission (see §17); manager/admin can set
  status `Pending → Acknowledged → Resolved` with a note. An "Auto-reject" toggle on
  the form would reject flagged responses only when `AutoRejectAnomalies` is on (the
  detection itself never deletes/rejects).

#### Report tab (ReportTab)
- **Filters**: date `from`/`to` (+ domain filter inside the report view).
- **Per-field summaries**: counting, `optionCounts` (dropdown/multi/yesno), `avg/min/max`
  (number/rating/slider), `byMonth` (date), `withCoordinates` (location).
  Rendered with bar/donut charts.
- **Share**: create a public read-only share link (`/share/<token>`) — token-guarded, no
  login; can expire or be revoked. Managing role may view/revoke shares.
- **Cross-form reports**: combine two+ forms by mapping matching field keys into one
  report; create, list, edit, delete, share (managers see all; analysts own-created).
- **Export** 🟡: `forms.export` capability exists in the matrix; report access levels
  include `Export`; a file-export action is not surfaced in this build's UI.

### 10.3 Respondent flows
- Field Officer routes: `/forms/[id]/respond`.
- Functions in `submitResponse`:
  - **Access gate** (per access mode) — evaluated server-side.
  - **Rate limiting**: max 20 submissions per form per IP per hour (in-memory).
  - **Duplicate prevention**: one submitted response per user/email.
  - **Save & resume**: if enabled, drafts are stored (`InProgress`) with a 7‑day
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

### 10.4 Public share (`/share/[token]`)
- Computed read-only report rendered from the token — no session required; the token is
  the only credential. Revoked/expired tokens 404. (DR‑11).

---

## 11. Module: Competitor Pricing

Route: `/pricing`.

### Record a price
| Field              | Type     | Notes                                      |
| ------------------ | -------- | ------------------------------------------ |
| Product            | Select   | From reference `/products` (active only)   |
| Competitor name    | Text     | 1–150 chars                                |
| Price              | Number   | Must be > 0 (ETB)                          |
| Region             | Select   | Required                                   |
| Outlet (optional)  | Select   | Optional                                   |
| Recorded date      | Date     | Defaults to today                          |

- **Gap percent** is computed on-read: `(OwnUnitPrice − competitorPrice) / OwnUnitPrice × 100`.
- **Alert**: if `|gap| ≥ threshold` (per product category, default seed: Coffee 15%,
  Tea 12%, Cereals 10%, Spices 20%) a `PriceGapAlert` is created (`Active`) and a
  `PriceGapAlert` notification fires (Email/SMS to Manager & Analyst).
- Field Officers record; their view is scoped to assigned regions (`region` scope).
  Manager/Admin see all; Analyst read.

### Alerts
List filters: status (`Active`, `Resolved`, `Dismissed`). Actions: **Resolve**,
**Dismiss**.

### Compare
For a product, compare own price vs its competitors (by region if chosen) showing
`gapPercent` per competitor.

### Thresholds
Administrator can configure per-category threshold percents (`pricing.configureThresholds`).

---

## 12. Module: Reports & Power BI

Route: `/reports`. Tabs: **AI Insights**, **Sales**, **Price comparison**, **Power BI**.

### AI Insights
Rule-based aggregate + plain-text "observations". KPIs: Total sales (ETB),
Active price gaps, Market visits, Form responses. Generated at, e.g.,
`2026-…` per request. 🟡 Not ML — deterministic statistics over the reporting views.

### Sales report
Filters: `from`, `to`, region. Output: Total sales (ETB), orders, units sold, products
sold, regions covered; **Sales by region** bar chart; **Top 10 products** table
(quantity + amount). Source: `vw_Report_SalesByOutlet` (seeded sample sales).

### Price comparison report
Filters: region, category. Table: Product, Competitor, Competitor price, Own price,
Gap (%), Region, Date. Source: `vw_Report_PriceComparison`.

### Power BI panel 🟡
- Reads role-assigned catalogue (`GET /reports/powerbi/views`): Sales Growth,
  Market Share & Price Gaps, Product Availability, Forms & Survey Analytics.
- "Open" returns a placeholder **embed token** (`MOCK_EMBED`); the embed panel renders
  a static placeholder and notes that production wires the Power BI JS SDK. ⛔ Live
  Power BI embedding is not implemented; "External" opens the catalogue `url`.

### Other report endpoints (available via API)
`/reports/market-visits`, `/reports/forms/answers`, `/reports/product-availability`.
The Reports page surfaces only the four tabs above.

---

## 13. Module: Admin Centre

Route: `/admin`. **Administrator only** (second-level `RequireRole`). Tabs below.

### Users & roles
- List users (Name, CUAS ID, role, regions). Change role via dropdown; assign/remove
  region badges (per-user `UserRegionAssignment`).

### Role mapping
- Map CUAS claims → internal roles (seed: `KG-MIS-*`). Add, delete. `PUT /admin/role-mapping`
  upserts.

### Notifications
- Add/remove `NotificationConfig` rows: trigger event × channel × role, enabled flag.

### Schedules
- Power BI **report schedules**: `reportId`, `cron` (e.g. `0 8 * * 1`), recipients
  (comma/newline split), enabled. Add/remove. 🟡 No cron executor runs these in this
  build (data persisted only).

### Audit log
- Read-only list (limit 100): When, User, Action, Entity #, Detail. Retained per
  `audit.retentionDays` (365) and purged by a scheduled job.

### Also available (API)
`GET /admin/audit`, `GET/PUT/DELETE /admin/role-mapping…`,
`GET/PUT/DELETE /admin/notification-config…`, `GET/PUT/DELETE /admin/report-schedules`,
`GET/PUT/DELETE /admin/users/…`.

---

## 14. Module: D365FO Sync

- `POST /sync` (or `/sync/d365fo`) triggers a master-data sync.
- `GET /sync/logs` lists sync attempts (limit param, default 50).
- 🟡 Dev runs a **mock deterministic dataset** (products, customers, sales, outlets).
  In production the D365FO OData client would refresh products/customers/sales; the
  connector contains TODO stubs (`D365FO_MOCK=false`).
- Failures can dispatch `SyncFailure` → Administrator (Email).

---

## 15. Key workflows (step by step)

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
3. `tsegaye.n` → open the report → **Review** (status → Reviewed).

### Workflow E — Competitor price with alert
1. `field1` → **Competitor Pricing** → record product `Arabica Coffee 1kg` competitor
   price far below 850.00 in an assigned region → save.
2. Gap ≥ 15% → alert created + `PriceGapAlert` notifications (Email/SMS to Manager,
   SMS Email to Analyst).
3. Manager/Analyst → open Pricing → **Alerts** → resolve/dismiss.
4. Dashboard "Active price gaps" and Reports AI insights reflect the live count.

### Workflow F — Admin configuration
1. Log in as `admin` → **Admin Centre**.
2. **Users & roles**: change a user's role; assign `field1` to a region.
3. **Role mapping**: add `KG-MIS-*` claims.
4. **Notifications**: add a config row, e.g. `ANOMALY_FLAGGED` × `Email` × Analyst.
5. **Schedules**: add a Power BI schedule.
6. **Audit log**: review recent actions.
7. Trigger a **Sync** and check `/sync/logs`.

---

## 16. Validation, errors & toasts

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

## 17. Data reference

### Form field types (NexForm, 23)

| Category  | Types |
| --------- | ----- |
| basic     | Short text, Paragraph (longtext), Number, Email, Phone, Date, Time, Date & time |
| choice    | Dropdown, Multi-select (multiplechoice), Rating, Yes/No, Matrix/grid |
| media     | File upload, Image, Signature |
| advanced  | Location, Slider, Calculated, Prefill, Rich text |
| layout    | Section header, Instructions |

### Form statuses & access modes
- Statuses: `Draft` → `Published` → `Archived`. Only Draft can be deleted or published;
  Archived cannot be re-published.
- Access modes: `Public`, `Domain`, `Invite`, `Group`, `Password`.

### Notification channels & statuses
- Channels: `Email`, `SMS`, `WhatsApp` (sent); `Push`, `In-App` listed but not sent.
- Statuses: `Pending`, `Sent`, `Retried`, `Failed`; attempts recorded.

### Anomaly types
`too_fast` (<20 s), `duplicate_burst` (>10/hr from one IP), `outlier` (>3σ on numeric /
text-length, once ≥5 samples exist). Status: `Pending`, `Acknowledged`, `Resolved`.
Flags never delete/reject unless the form's `AutoRejectAnomalies` is enabled.

### Reference master data
- `/reference/roles`, `/regions`, `/products` (IsActive=1), `/customers`, `/outlets`.
- Seeded geography: Addis Ababa, Oromia, Amhara, SNNPR, Tigray; 10 outlets.
- Seeded products (8) across Coffee, Tea, Cereals, Spices with own unit prices.
- Sample sales (15 rows, Q1–Q3 2026) power the KPI/report views.

---

## 18. End-to-end demo scenario

> Rehearse with three personas: **demo-admin** (admin), **demo-manager**
> (tsegaye.n), **demo-field** (field1). All passwords `Password123!`.

1. **Environment** — `npm run dev`, open `http://localhost:3000`.
2. **Login** — demo-field → `field1` → Dashboard KPIs + AI insights.
3. **Market visit** — create, save Draft, submit; note the toast; confirm the `NewReport`
   notification in **Notifications**.
4. **Pricing** — record an undercut price on `Arabica Coffee 1kg` → alert + gap shown.
5. **Forms build** — demo-manager → create "Outlet Stock Check"; add fields + scoring;
   save; set Public access + consent; publish.
6. **Respond** — demo-field → Open forms → fill → (optionally Save & resume) → Submit;
   open the branded thank-you.
7. **Review** — demo-manager → Responses tab → open response → edit within window
   (revision created) → anomalies list → resolve. Report tab → filter dates → chart →
   create share link → open `/share/<token>` incognito (read-only, no login).
8. **Reports** — demo-manager → Reports → AI Insights & Sales with a region filter.
9. **Admin** — demo-admin → change a user's role, add a role mapping, add a
   notification config + schedule, review Audit log.
10. **Sync** — trigger `/sync`, check `/sync/logs`.
11. **Dashboard revisit** — confirm updated KPIs (sales total, active gaps, visits).

---

## 19. Quick reference

### Frontend routes
| Route                     | Purpose                                      |
| ------------------------- | -------------------------------------------- |
| `/login`                  | Sign in                                      |
| `/dashboard`              | KPIs + AI insights + activity                |
| `/notifications`          | My delivery history                          |
| `/visits`                 | Market visits (CRUD + review)                |
| `/forms`                  | Forms list + open forms                      |
| `/forms/[id]`             | Form workspace (Builder/Settings/Responses/Report) |
| `/forms/[id]/respond`     | Respondent entry point                       |
| `/share/[token]`          | Public read-only share                       |
| `/pricing`                | Competitor pricing + alerts + compare        |
| `/reports`                | AI insights / sales / price comparison / Power BI |
| `/admin`                  | Admin Centre (Administrator)                 |

### API surface (`/api/v1`)
| Module            | Endpoints |
| ----------------- | --------- |
| Auth              | `POST /auth/login/local`, `GET /auth/login`, `GET /auth/callback`, `GET /auth/me`, `POST /auth/logout` |
| Market visits     | `GET/POST /market-visits`, `GET/PUT /market-visits/:id`, `POST /market-visits/:id/submit`, `POST /market-visits/:id/review` |
| Forms (NexForm)   | `GET /forms`, `POST /forms`, `GET/PUT/DELETE /forms/:id`, `POST /forms/:id/publish`, `POST /forms/:id/archive`, `POST /forms/:id/clone`, `GET /forms/accessible`, `POST/GET /forms/:id/versions`, `GET/PUT /forms/:id/meta`, `GET/PUT /forms/:id/access`, `POST /forms/:id/invites` (+ bulk/revoke), consent get/bump + history, branding get/update, `GET/POST /forms/:id/responses`, `GET /forms/:id/responses/detail`, `PUT /forms/:id/responses/:rid`, revisions, erasure, anomalies list/update/recompute, report, shares create/list/revoke, report access grant/revoke, cross-reports CRUD + report, drafts save + mine + resume |
| Competitor pricing| `GET/POST /competitor-pricing/prices`, `GET /competitor-pricing/compare`, `GET /competitor-pricing/alerts`, `PUT/DELETE …/alerts/:id/resolve\|dismiss`, `GET/PUT /competitor-pricing/thresholds` |
| Sync              | `POST /sync`, `GET /sync/logs` |
| Notifications     | `GET /notifications/mine`, `GET /notifications` (admin) |
| Reports           | `GET /reports/sales`, `/price-comparison`, `/market-visits`, `/forms/answers`, `/product-availability`, `/ai-insights`, `/powerbi/views`, `/powerbi/embed/:id` |
| Admin             | `GET/PUT/DELETE /admin/users/…`, `/admin/role-mapping`, `/admin/notification-config`, `/admin/report-schedules`, `GET /admin/audit` |
| Reference         | `GET /reference/roles|regions|products|customers|outlets` |
| Other             | `GET /health` |

### Cron jobs
`purgeAuditLog` (365 days), `purgeDrafts` (abandoned → 7 days), `processErasureRequests`
(30 days), `recomputeAnomalies`.

---

## 20. Appendix: capability-by-feature checklist

| Capability                         | Status |
| ---------------------------------- | ------ |
| Local login / JWT session          | ✅     |
| CUAS SSO redirect + role mapping   | 🟡 (live exchange stubbed) |
| Market visits CRUD + review        | ✅     |
| NexusForm builder (23 types, logic, pages, scoring) | ✅ |
| Access modes & invites             | ✅     |
| Consent versioning                 | ✅ (bump + history); 🟡 no consent push-email |
| Save & resume                      | ✅     |
| Response editing + revisions       | ✅     |
| GDPR erasure request & job         | ✅     |
| Anomaly detection & review         | ✅     |
| Cross-form reports & sharing       | ✅     |
| Public share (`/share/:token`)     | ✅     |
| File upload storage                | 🟡 (key stored; scan status written only; no scan service) |
| Real-time dashboards               | ✅     |
| AI insights                        | 🟡 rule-based (not ML) |
| Pricing + gap alerts + thresholds  | ✅     |
| Notifications (Email/SMS/WhatsApp) | 🟡 mock delivery in dev; live provider stubbed |
| Notification config & schedules    | 🟡 config CFUD; schedules persisted (no executor) |
| Audit log + purge                  | ✅     |
| D365FO sync                        | 🟡 deterministic mock in dev; live client TODO |
| Power BI catalogue + embed         | 🟡 seeded catalogue; embed token placeholder/JS-SDK TODO |
| Reports paging/export              | 🟡 pagination ✅ (visits/notifications); `forms.export` capability defined, no UI export |

---

*Prepared as an implementation-accurate guide. Where a feature is marked 🟡/⛔ it refers
to the live-provider wiring only; the in-app UI for those features is present and
functional against the mock adapters in development.*