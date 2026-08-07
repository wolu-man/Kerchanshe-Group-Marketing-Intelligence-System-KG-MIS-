# KG-MIS — Hybrid Market Intelligence System

Web platform for Kerchanshe Group's Marketing department to capture market visit
reports, surveys, and competitor pricing, and to view Power BI dashboards.

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
