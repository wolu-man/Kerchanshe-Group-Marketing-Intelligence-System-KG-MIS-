# KG-MIS Development Task Tracker

> Project: Hybrid Market Intelligence System (KG-MIS) — Kerchanshe Group
> Stack: Next.js (web) + Express/Node.js/TypeScript (API) + MS SQL Server + Power BI
> Integrations (production only, mock in dev): D365FO (master data), CUAS (SSO), CNS (notifications), Power BI

Status legend: `[x]` completed · `[~]` in progress · `[ ]` pending

## 1. Repository & Scaffolding
- [x] Monorepo setup (root package.json, npm workspaces, .gitignore, README)
- [x] Environment template (.env.example) for DB, API, CUAS, D365FO, CNS, Power BI
- [x] Git repository initialized

## 2. Database (MS SQL Server)
- [x] `database/schema.sql` — full physical schema (Role, User, RoleMapping, Region, Outlet, Product/Customer/SalesRecord cache, MarketVisitReport, Survey/SurveyQuestion, SurveyResponse/SurveyAnswer, CompetitorPrice/PriceGapAlert, Notification/NotificationConfig, SyncLog, AuditLog, PriceGapThreshold)
- [x] `database/seed.sql` — roles, CUAS role mapping, regions, outlets, products, customers, sales, gap thresholds, notification config
- [x] `database/scripts/` — migrate.js + seed.js (bcrypt-hashed dev users) + dbconfig.js
- [ ] Apply migration to a running SQL Server instance (requires local SQL Server or Docker)

## 3. Backend API (Express / TypeScript)
- [x] Config (`config/env.ts`), error classes (`utils/errors.ts`), async wrapper
- [x] DB pool (`db/pool.ts`), audit logging (`db/audit.ts`)
- [x] Auth middleware (JWT session), RBAC guard, Zod validation, central error handler
- [x] Integration connectors: CUAS (local dev login + SSO stub), D365FO (mock + live stub), CNS (mock), Power BI (mock)
- [x] Notifications service (CNS trigger events, one retry, delivery logging)
- [x] Auth module: `/api/v1/auth/*` (login, login/local, me, logout)
- [x] Market visits module: `/api/v1/market-visits/*`
- [x] Surveys module: `/api/v1/surveys/*` (builder, publish, clone, responses, skip logic)
- [x] Competitor pricing module: `/api/v1/competitor-prices/*` (entry, compare, alerts)
- [x] D365FO sync module: `/api/v1/sync/*` (on-demand trigger, sync logs, scheduled job)
- [x] Notifications admin module: `/api/v1/notifications/*` (delivery history, config)
- [x] Reports / Power BI module: `/api/v1/reports/*` (report list, embed token)
- [x] Reference module: `/api/v1/regions`, `/outlets`, `/products`, `/users`, `/role-mappings`
- [x] App assembly (`app.ts`), entry point (`index.ts`), scheduled jobs bootstrap
- [x] Backend verification: `npm run typecheck` and `npm run build`

## 4. Frontend (Next.js / TypeScript)
- [x] Portal scaffold (Next.js app, layout, nav, api client)
- [x] Login screen (local dev login + CUAS SSO mode)
- [x] Dashboard home (KPI summary + alerts)
- [x] Market visits: list + create/edit form
- [x] Surveys: builder + response form + responses list
- [x] Competitor pricing: entry + comparison + alerts
- [x] Admin: D365FO sync + role mapping + notification config
- [x] Reports / Power BI embedded view
- [x] Frontend verification: `npm run build`

## 5. Verification & Wrap-up
- [x] End-to-end smoke test (seed → login → create/submit data → notifications)
- [x] Root README with setup/run instructions
- [x] Task tracker final update
- [x] Local SQL Server Express (2025) connected on dynamic port 50404, `kgmis_user` login created
- [x] `.env` created for local dev (git-ignored)

## Environment Notes
- Node.js v26.1.0, npm 11.13.0, git 2.53.0 — all present on this machine.
- MS SQL Server is **not confirmed installed**; see below for install options.
- CNS / D365FO / CUAS live API credentials: **production only** — dev uses mock adapters (set `*_MOCK=true`).
