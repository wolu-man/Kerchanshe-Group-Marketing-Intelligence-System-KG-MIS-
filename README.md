# KG-MIS — Hybrid Market Intelligence System

Web platform for Kerchanshe Group's Marketing department to capture market visit
reports, surveys, and competitor pricing, and to view Power BI dashboards —
with a built-in **AI Assistant & Predictive Intelligence** layer (form
assistant, response analysis, natural-language data queries, and deterministic
forecasts/anomalies).

Reference documents: `Docs/` (Solution Design, FDS, TDS, Integration Design,
Phase 0 Planning, User Requirement).

## Architecture

```
Field / Marketing users → Next.js web portal → Express/Node.js API → MS SQL Server
                                              ↕ D365FO (master data, OData/REST, read-only)
                                              ↕ CUAS   (SSO login + role claims)
                                              → CNS    (email / SMS / WhatsApp)
                                              → Power BI (reporting views, embed tokens)
```

## Tech stack

| Layer    | Technology                          |
| -------- | ----------------------------------- |
| Web      | Next.js 15, TypeScript              |
| API      | Node.js, Express, TypeScript        |
| Database | MS SQL Server                       |
| Analytics| Power BI                           |
| Identity | CUAS (SSO) — mock login in dev      |
| Notify   | CNS (email/SMS/WhatsApp) — mock in dev |
| Master data | D365FO via OData — mock in dev   |

## Repository layout

```
docs/          Design documents (SDD, FDS, TDS, Integration Design, planning)
database/      MS SQL schema + seed data + migrate/seed scripts
server/        Express/TypeScript REST API (all six epics)
web/           Next.js/TypeScript admin portal
TASKS.md       Development task tracker
```

## Prerequisites

- Node.js 20+ (tested on 26.x)
- npm 10+
- MS SQL Server (any edition; the dev machine uses SQL Server Express)

## Setup

1. Install dependencies:

   ```sh
   npm install
   ```

2. Configure environment — copy `.env.example` to `.env` and set the DB and
   integration values. For a local SQL Server Express instance:

   ```env
   DB_HOST=localhost
   DB_PORT=50404            # find yours: sqlcmd -S .\SQLEXPRESS -E -C -Q "SELECT local_tcp_port FROM sys.dm_exec_connections WHERE session_id=@@SPID"
   DB_USER=<sql login>
   DB_PASSWORD=<password>
   DB_NAME=KG_MIS
   ```

   Create a SQL login and grant `db_owner` on the `KG_MIS` database (or use
   `sa`). Then for the web app:

   ```sh
   copy web/.env.example web/.env.local
   ```

3. Create schema and seed reference data + dev users:

   ```sh
   npm run db:migrate
   npm run db:seed
   ```

## Run (development)

```sh
npm run dev          # starts API (:4000) and web portal (:3000) concurrently
npm run dev:server   # API only
npm run dev:web      # web portal only
```

Open http://localhost:3000 and sign in with a dev account:

| Username    | Role                |
| ----------- | ------------------- |
| `admin`     | Administrator       |
| `tsegaye.n` | Marketing Manager   |
| `analyst1`  | Marketing Analyst   |
| `field1` / `field2` | Field Officer |
| `viewer1`   | Viewer              |

Dev password for all accounts: `Password123!`

## Build & verify

```sh
npm run typecheck
npm run build
```

## Integrations (production only)

D365FO, CUAS, and CNS live APIs are wired for **production**. In development the
app runs fully with mock adapters — see `.env.example`:

- `D365FO_MOCK=true` — mock master-data sync (deterministic sample dataset)
- `CUAS_SSO_ENABLED=false` — local login against the dev users table
- `CNS_MOCK=true` — simulated notification delivery (status logged)
- `POWERBI_MOCK=true` — seeded report catalogue + placeholder embed tokens

To enable a live integration, set the relevant `*_MOCK=false` / `CUAS_SSO_ENABLED=true`
flags and provide the credentials (OAuth/OData URLs, client IDs/secrets). The
connector modules (`server/src/integrations/*`) contain `TODO` stubs marking the
exact places the real API calls are inserted.

## API surface (`/api/v1`)

| Module            | Endpoints |
| ----------------- | --------- |
| Auth              | `POST /auth/login/local`, `GET /auth/login`, `GET /auth/callback`, `GET /auth/me`, `POST /auth/logout` |
| Market visits     | `GET/POST /market-visits`, `GET/PUT /market-visits/:id`, `POST /market-visits/:id/submit` |
| Surveys           | `GET/POST /surveys`, `GET/PUT/DELETE /surveys/:id`, `POST /surveys/:id/publish`, `POST /surveys/:id/clone`, `POST/GET /surveys/:id/responses` |
| Competitor pricing| `GET/POST /competitor-prices`, `GET /competitor-prices/compare`, `GET /competitor-prices/alerts` |
| Sync (D365FO)     | `POST /sync/d365fo`, `GET /sync/logs` |
| Notifications     | `GET /notifications`, `GET/POST /notifications/config` |
| Reports (Power BI)| `GET /reports`, `GET /reports/embed-token` |
| Reference         | `GET /regions`, `/outlets`, `/products`, `/users`, `/role-mappings` (`PUT /role-mappings/:id`) |
| AI surfaces        | `GET /ai/providers`, `POST /ai/assistant`, `POST /ai/writing`, `POST /ai/analysis`, `POST /ai/ask`, `POST /ai/predictive`, `GET /ai/predictive/summary`, `POST /ai/public/writing` |

## AI surfaces

The Form Builder has an optional assistant (✨ in the toolbar) that proposes form
changes in natural language, plus five more AI features that share the same
providers and security model:

- **Respondent writing assistant** — suggest-before-replace help for open-text
  answers while filling (authenticated or public) and when editing responses.
- **Response analysis** — server-computed metrics for one form, explained by the
  model (Reports → *AI analysis*, or the AI drawer → *Responses*).
- **Ask AI** — natural-language questions over MIS data answered from a fixed
  catalogue of 27 queries (15 read + 12 forecast/anomaly), with the data used
  shown next to every answer (AI drawer → *Data*, or Reports → *Ask AI*).
- **Global launcher** — a floating ✨ button on every MIS page (AI roles only)
  opens the same Ask AI chat in a side sheet, automatically carrying the current
  page context (module/record) as an advisory hint.
- **Predictive insights** — deterministic forecasts (sales, weekly sales, KPI,
  competitor price, price gap, product demand, survey/interview/visit/media
  activity) with confidence bands, backtest stats and anomaly flags, shown as
  insight cards on the dashboard and available to Ask AI as `forecast_*`,
  `predict_*` and `detect_anomalies` tools.

The numbers are **never** produced by the model: a server-side engine picks the
statistical model by walk-forward backtest, states a confidence level
(High / Moderate / Low / **Insufficient** when history is too thin), and the
assistant only explains what came back. Cards refresh nightly (04:15) and are
cached in memory + the `PredictiveInsight` table.

Everything runs on **Ollama (local) / Google Gemini / Groq**, selected
automatically or manually — see
[Docs/AI_Form_Assistant.md](Docs/AI_Form_Assistant.md) (*KG-MIS AI Assistant*).

```env
# backend/.env
AI_PROVIDER=auto
OLLAMA_BASE_URL=http://localhost:11434   # or leave Ollama out entirely
GEMINI_API_KEY=                          # either key is enough
GROQ_API_KEY=
```

Form proposals are always previewed and confirmed before anything is saved; the
resulting schema is committed through the normal builder undo/autosave path.
Writing suggestions never touch the draft until you click *Use this*, analysis
only reads pre-computed metrics, and Ask AI — including the global launcher —
can only run validated read-only queries with the caller's permissions. Forecasts
come from the deterministic engine, are permission-checked exactly like the read
tool for the same data, and are labelled with their confidence. Writes
are deliberately exclusive to the Form Assistant's confirmed flow.
