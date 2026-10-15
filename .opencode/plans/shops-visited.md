# Plan: "Number of shops visited" on Market Visits (end-to-end)

**Approved decisions:** field optional (nullable INT >= 0) · show on **all** surfaces (reports tab KPI+table+chart, Excel export, AI insights + reports/dashboard tiles, officer performance) · new **shops-by-region chart** on `/reports` · everything else untouched.

## 1. DB — `backend/migrations/034_shops_visited.sql` (new)
- `IF COL_LENGTH('dbo.MarketVisitReport','ShopsVisited') IS NULL ALTER TABLE dbo.MarketVisitReport ADD ShopsVisited INT NULL` (pattern: `010_visit_reject.sql`)
- **Re-create view** `dbo.vw_Report_MarketVisits` (DROP/CREATE, body from `003_mi_scope.sql:326-341` + `m.ShopsVisited`) — required, reports read the view
- No backfill: existing rows stay `NULL` = unknown; aggregates use `ISNULL(...,0)`
- Apply via `npm run db:migrate` (idempotent, ledger-based)

## 2. Backend — visit CRUD (`backend/src/modules/marketVisits/`)
- `marketVisits.routes.ts:30-41` — `createSchema` + `shopsVisited: z.number().int().min(0).max(10000).optional().nullable()` (update schema is `.partial()` → free)
- `marketVisits.service.ts`:
  - `BASE_SELECT` (:20-32) + `m.ShopsVisited` → feeds list and detail
  - `VisitInput` (:91-102) + field
  - INSERT (:119-124) + `.input('ShopsVisited', sql.Int, ...)` + column
  - update map (:135-146) + `['shopsVisited','ShopsVisited', sql.Int]`

## 3. Backend — reports (`backend/src/modules/reports/reports.service.ts`)
- `marketVisits()` :100 — SELECT + `ShopsVisited` (KPI/chart/table computed client-side from items, same pattern as `statusCounts`)
- `aiInsights()` :142-148 — `ISNULL(SUM(ShopsVisited),0) AS TotalShopsVisited` → kpis :278 + `shopsVisited`, extend observation :190-192 ("... covering N shops")
- `EXPORT_QUERIES['market-visits']` :604-609 — add `ShopsVisited` (export headers auto-derive from `Object.keys(rows[0])` :707)

## 4. Backend — officer performance
- `admin/kpi.service.ts` `fetchRawData` visits CTE (:90-100) + `SUM(ISNULL(m.ShopsVisited,0)) AS TotalShopsVisited`; `RawOfficerRow` interface; `getOfficerRanking` map (:325-348) + `shopsVisited: r.TotalShopsVisited ?? 0` → flows into `/officer/performance/me` via `getOfficerDetail` spread (:410)
- `officer/officer.service.ts` `getOfficerSummary` visits CTE (:28-34) + shops sum → `modules.visits.shops` (API parity)

## 5. Frontend — visits form/detail (`frontend/src/app/visits/page.tsx`)
- `emptyForm` (:15-28) + state init (:44-55) + submit body (:82-93) + `shopsVisited` (string state, `'' → null`, `Number()` on save — interviews `satisfactionScore` precedent)
- UI: new `form-row` pairing **"Number of shops visited"** (`type="number" min=0`) with **"Stock level observed"** (moves from full-width into the row; `.form-row` is 2-col grid — `globals.css:331`)
- Detail modal right column (:368-371) + `Shops visited` display (`—` when null)
- List table: **unchanged**

## 6. Frontend — types (`frontend/src/lib/types.ts`)
- `MarketVisit` (:561-588) + `ShopsVisited: number | null`
- `MarketVisitsReport.items` (:1007-1012) + `ShopsVisited: number | null`
- `AiInsights.kpis` (:777-790) + `shopsVisited: number`

## 7. Frontend — report surfaces
- `/reports` Market Visits tab (`reports/page.tsx:79-136`): KPI card **"Shops Visited"** (sum of `items`) :105-110; new `<Card>` chart **"Shops visited by region"** via `BarChart` (pattern :176) client-side group-by `RegionName`; table + "Shops" column :115-126
- AI Insights tab :765 — `kpi-sub` "N shops visited" on Market Visits tile
- `dashboard/page.tsx:16` — Market Visits tile `sub` → `(k) => \`${k.shopsVisited ?? 0} shops visited\`` (renderer :258 supports function subs)
- Officer performance (`officer/performance/page.tsx:122-125`) — Visits mini-card muted "N shops" sub-line (+ `mmc-sub` CSS rule in `globals.css`)

## Out of scope
Admin KPI officer ranking display, predictive metrics, visits list-table column. (`ai/dataTools.ts` wraps `reports.marketVisits` → picks up new column automatically.)

## Verification
1. `db:migrate` + SQL check (`COL_LENGTH`, view column)
2. `tsc --noEmit` backend + frontend
3. API smoke: create draft w/ shops → detail/list return it; PUT edit; `-1` → 422; `/reports/market-visits` column; `/reports/ai-insights` kpis; export xlsx header; `/officer/performance/me` `shopsVisited`
4. Headless UI harness (`public/_verify.html` pattern): form field → save 3 shops → detail shows → `/reports` KPI = 3, chart bars, table column
5. Cleanup: delete test visit rows (+ test notifications), remove harness files; re-run tsc
