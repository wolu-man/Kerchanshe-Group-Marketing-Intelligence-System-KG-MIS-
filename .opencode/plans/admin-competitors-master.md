# Admin/Competitors Master + Price Page Rework — Implementation Plan

## Goal
Make **Admin/Competitors** the single master source for all competitor data (imported from `Docs/Master-data/Competitor Master/*.xlsx`), with full CRUD, dedup, audit, validation; and rework the **Price page** to read prices dynamically from that master (no manual price entry), auto-computing Price Difference and Price Difference %.

## Confirmed decisions (user)
1. **Remove manual price entry entirely** from the Price page (records/compare/alerts/thresholds remain; `/competitor-pricing` write API stays untouched for compatibility).
2. **Gap formula = existing app convention**: `PriceDifference = ownPrice − competitorPrice`; `PriceDifferencePct = (own − competitor) / own × 100`, rounded 2dp (÷ own price, NOT the Excel's ÷ competitor). Computed **on read** (never stored).
3. **Sidebar visibility**: Administration section entry with `roles: ['Administrator','Marketing Manager']` (aligns with existing `competitors.manage` permission).

## Key facts from research
- Tables `dbo.Competitor` (13 rows, no unique on Name) and `dbo.CompetitorPrice` (only 2 legacy rows) already exist; `/api/v1/competitors` CRUD exists (server-only, no frontend consumer, no service layer).
- Permissions `competitors.view` / `competitors.manage` already defined in `src/security/permissions.ts` — reuse, no new keys.
- Alert flow precedent: `competitorPricing.service.ts` — threshold per `PriceGapThreshold.ProductCategory` (default 15), `|gap| ≥ threshold` → upsert `PriceGapAlert` + `dispatchEvent('PriceGapAlert')`.
- `PriceGapAlert.PriceID` is `NOT NULL` FK (`FK_PriceGapAlert_Price`, 001_initial.sql:389) — must be made nullable to link master-driven alerts.
- Excel sources (all read & mapped):
  - `Buna-Plate_competitors_with Price difference.xlsx`: 32 rows; cols: No, Date (15/05/2026), Kerchanshe Product Name, Kerchanshe Item Code, own price w/ VAT, Competitor Brand, Competitor Price w/ VAT, Price Difference, %, Remarks, our weight(g), competitor weight(g). Rows 21–27 are junk (no product/price) → skip. All 10 item codes map to `Product` (normalize: strip spaces/hyphens; exact → prefix → contains match within Category='Buna Plate'; verified: 21105→KB21105A, KB 1107B→KB1107B, BP-5→BP5, KB 21135→KB21135N, KB10055B, BM1, KB 60253 A→KB60253A, KB 1109A→KB1109A, KB 61085→KB61085N, BP 4→BP4). Own prices = DB UnitPrice × 1.07 (VAT note only; gap uses DB UnitPrice per app convention).
  - `Buna-Pen_competitors and their price.xlsx`: 14 rows; item name, distributor buying price, distributor selling price (ranges use en-dash `–`). Skip "Buna (Current)" (our own product). No product mapping → `OurProductID = NULL` (gap "not applicable"; admin can map later via edit). Selling price → `Price`/`PriceMax`, buying price → Specifications.
  - `Geely-product and Competetors.xlsx`: header row 3; Category ∈ {Geely, Competitor}. Skip `Geely` rows (ours). 8 competitor rows: BYD ×5 (E2, Yuan Up, Seagull, Song Plus, Sealion 06), GAC Aion UT, Volkswagen ID.6, Toyota bZ3X → 4 competitors, 8 products. Map `OurProductID` via Market Role text ("competitor to EX2/EX5") → `GL-EX2`/`GL-EX5`. Prices like `3.81M` → 3810000.
- Competitor name dedup (case-insensitive; SQL default CI collation): trim, strip `(...)` and trailing `\s+\d+$` **for match key only** (so `Radius 1`/`Radius 2`→`Radius`, `BIC 1`/`BIC 2`→`BIC`, `Camel (thick)`→`Camel`, but `XK16` unchanged). Existing inactive matches (`Antiline`, `BIC`) get reactivated on import. No duplicate names currently in DB → safe to add filtered unique index.
- Our products for gap: Buna Plate/Pen/EV categories exist; thresholds exist for `Buna Plate` (15), `Buna Pen` (20); EV categories fall back to default 15.
- Frontend conventions: `Guard` + `.page-head`/`.filters`/`Card`/`table`/`Modal`/`Field`/`Pagination`/`window.confirm`/`toast`; `useFetch`/`api` from `lib/use-api.ts` + `lib/api.ts`; existing unused type `CompetitorCatalogueRow` (types.ts:701).

---

## Phase 1 — Database (migration `030_competitor_master.sql`)
Idempotent (`IF OBJECT_ID`/`IF COL_LENGTH`/`IF NOT EXISTS(sys.indexes)` guards), run via `npm run db:migrate` (run twice to prove idempotency).

1. **New table `dbo.CompetitorProduct`**:
   - `CompetitorProductID INT IDENTITY PK`
   - `CompetitorID INT NOT NULL FK → Competitor` (`FK_CompetitorProduct_Competitor`)
   - `OurProductID INT NULL FK → Product` (`FK_CompetitorProduct_Product`) — the "where applicable" link for gap calc
   - `ProductName NVARCHAR(200) NOT NULL` — competitor product/model
   - `Category NVARCHAR(100) NOT NULL` — `Buna Plate` | `Buna Pen` | `Electric Vehicle`
   - `Price DECIMAL(18,2) NOT NULL`, `PriceMax DECIMAL(18,2) NULL` (range upper bound)
   - `EffectiveDate DATE NULL`, `Status VARCHAR(20) NOT NULL DEFAULT 'Active'` (`Active`/`Inactive`/`Expired`)
   - `Notes NVARCHAR(1000) NULL`, `Specifications NVARCHAR(MAX) NULL` (JSON — matches `Product.Specifications` convention)
   - `CreatedAt`/`UpdatedAt DATETIME2` w/ defaults (convention)
   - **Dedup**: `CONSTRAINT UQ_CompetitorProduct_Competitor_Name UNIQUE (CompetitorID, ProductName)`
   - Indexes: `IX_CompetitorProduct_Category`, `IX_CompetitorProduct_Status`, `IX_CompetitorProduct_OurProduct`
2. **Unique competitor names**: `CREATE UNIQUE NONCLUSTERED INDEX UQ_Competitor_Name ON dbo.Competitor(Name) WHERE IsActive = 1` (filtered → soft-deleted names reusable; CI collation enforces case-insensitive uniqueness).
3. **PriceGapAlert link to master**:
   - `ADD CompetitorProductID INT NULL CONSTRAINT FK_PriceGapAlert_CompetitorProduct REFERENCES CompetitorProduct(CompetitorProductID)` + index.
   - Make `PriceID` nullable: drop `FK_PriceGapAlert_Price` → `ALTER COLUMN PriceID INT NULL` → re-add FK (guarded each step).

## Phase 2 — Backend API
### 2.1 New `src/modules/competitors/competitors.service.ts` (SQL layer; routes file currently has inline SQL — move list/create/update/delete there too, same behavior)
- `listCompetitors({search?, includeInactive?})` → `{items}` (keep shape; existing consumers none, Price page will use for dropdowns). Include `ProductCount` (active master rows) for the detail/guard UX.
- `createCompetitor` — trimmed CI name check: active match → `409 ConflictError('Competitor already exists')`; inactive match → **reactivate + update fields** (returns that id). Audit `CREATE`/`REACTIVATE`.
- `updateCompetitor` — same dup check on rename (exclude self) → 409.
- `deactivateCompetitor` — soft delete **guarded**: active `CompetitorProduct` rows exist → 409 `'Delete its products first'`.
- `listProducts({search?, competitorId?, category?, status?, ourProductId?, page?, pageSize?})` → `{items,total,page,pageSize}`; JOIN `Competitor` + LEFT JOIN `Product`; projection computes:
  ```sql
  CASE WHEN p.UnitPrice IS NOT NULL AND p.UnitPrice > 0
       THEN ROUND(p.UnitPrice - cpd.Price, 2) END AS PriceDifference,
  CASE WHEN p.UnitPrice IS NOT NULL AND p.UnitPrice > 0
       THEN ROUND(((p.UnitPrice - cpd.Price) / p.UnitPrice) * 100.0, 2) END AS PriceDifferencePct
  ```
  (`p` = mapped our product; own price = base `Product.UnitPrice` — master rows carry no customer type.)
- `getProduct(id)` — same shape (404 if missing).
- `listCategories()` → distinct `Category` (filter dropdown).
- `createProduct` / `updateProduct` — pre-checks: competitor exists (404), `OurProductID` exists (404), dup `(CompetitorID, ProductName)` excluding self (409). After write: **gap + alert routine** (mirrors `recordPrice`): own>0 → threshold by *our product's* `Category` (`PriceGapThreshold`, default 15) → if `|gap| ≥ threshold` upsert `PriceGapAlert (CompetitorProductID=…)` (update GapPercent/Threshold if exists, else insert) + `dispatchEvent('PriceGapAlert', …)`. Returns `{ competitorProductId, priceDifference, priceDifferencePct, alertCreated }`.
- `deleteProduct` — delete `PriceGapAlert WHERE CompetitorProductID=@Id` first, then hard `DELETE` row (mirrors `DELETE /competitor-pricing/:priceId` precedent). Audit `DELETE`.

### 2.2 Rewrite `competitors.routes.ts` (mounted at `/api/v1/competitors`, already in `app.ts`)
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/` | `competitors.view` | `?search=&includeInactive=1` → `{items}` |
| GET | `/:id` | `competitors.view` | row or `null` (keep) |
| POST | `/` | `competitors.manage` | zod schema + dup/reactivate logic → `201 {competitorId}` |
| PUT | `/:id` | `competitors.manage` | partial zod + rename dup check → `{ok:true}` |
| DELETE | `/:id` | `competitors.manage` | soft delete + product-count guard → `{ok:true}` / 409 |
| GET | `/products` | `competitors.view` | `?search=&competitorId=&category=&status=&ourProductId=&page=&pageSize=` → `{items,total,page,pageSize}` |
| GET | `/products/categories` | `competitors.view` | `{items:[string]}` (route before `/:id`!) |
| GET | `/products/:id` | `competitors.view` | row or 404 |
| POST | `/products` | `competitors.manage` | zod; `201 {competitorProductId, priceDifference, priceDifferencePct, alertCreated}` |
| PUT | `/products/:id` | `competitors.manage` | zod partial-or-full; same response shape |
| DELETE | `/products/:id` | `competitors.manage` | alert cleanup + hard delete → `{ok:true}` |

- Zod product schema: `competitorId` int+, `ourProductId` int+ nullable, `productName` 1–200, `category` 1–100, `price` number>0, `priceMax` number>0 nullable (`superRefine`: ≥ price), `effectiveDate` `YYYY-MM-DD` nullable, `status` enum(`Active|Inactive|Expired`) default `Active`, `notes` ≤1000 nullable, `specifications` `z.record(z.unknown()).optional().nullable()`.
- Audit every mutation: entity `Competitor` / `CompetitorProduct`, actions `CREATE|UPDATE|DELETE` (+ `REACTIVATE`), `detail` includes name/product/price — via existing `logAudit` wrapper (`audit()` from `db/audit.ts`).
- Route ordering: `/products`, `/products/categories`, `/products/:id` **before** `/:id`.

### 2.3 Edit `competitorPricing.service.ts` — only two functions (keeps all other endpoints byte-identical for MI/legacy)
1. **`comparePrice(productId)`** — source switch to master (Price page compare tab is its only consumer):
   ```sql
   SELECT c.Name AS CompetitorName, cpd.ProductName AS Model, cpd.Price, cpd.PriceMax,
          cpd.EffectiveDate, cpd.Status
   FROM CompetitorProduct cpd JOIN Competitor c ON c.CompetitorID = cpd.CompetitorID
   WHERE cpd.OurProductID = @ProductId AND c.IsActive = 1 AND cpd.Status = 'Active'
   ORDER BY cpd.Price
   ```
   Response keeps `{product, ownPrice, competitors[]}` envelope; each competitor = new shape with lowercase `gapPercent` (computed `(own−price)/own×100`) — Region/Outlet fields dropped (master has none) and frontend columns updated to match.
2. **`listAlerts({status?})`** — convert to `LEFT JOIN`s so it returns **legacy + master alerts**:
   - `LEFT JOIN CompetitorPrice cp ON cp.PriceID = a.PriceID` → `LEFT JOIN Product p ON p.ProductID = cp.ProductID` → `LEFT JOIN Region r …`
   - `LEFT JOIN CompetitorProduct cpd ON cpd.CompetitorProductID = a.CompetitorProductID` → `LEFT JOIN Competitor c ON …` → `LEFT JOIN Product p2 ON p2.ProductID = cpd.OurProductID`
   - select `COALESCE(cp.CompetitorName, c.Name) AS CompetitorName`, `COALESCE(cp.Price, cpd.Price) AS CompetitorPrice`, `COALESCE(p.ProductCode,p2.ProductCode)`, `COALESCE(p.Name,p2.Name)`, `COALESCE(p.Category,p2.Category)`, `r.RegionName` (nullable), keep `a.*` + status filter + `ORDER BY a.CreatedAt DESC`. Resolve/dismiss endpoints untouched.
- `recordPrice`/`listPrices`/`getPrice`/PUT/DELETE/thresholds routes: **untouched** (API compatibility; simply no longer driven by the UI).

### 2.4 No changes to `app.ts` (router already mounted), `permissions.ts` (keys exist), or MI reports (views untouched).

## Phase 3 — Import script `backend/scripts/import-competitor-master.ts`
- ExcelJS (same pattern as `seed-geely-products.ts`); hardcoded DB config consistent with existing scripts.
- Per-file parse rules (see research above): row skipping, en-dash range parsing, `M`-suffix prices, formula cells (`cell.value.result`), `dd/mm/yyyy` dates, category assignment, product-code normalization/mapping, Market-Role→GL- mapping, competitor-name match-key cleaning, inactive-competitor reactivation.
- **Skip**: Geely `Category='Geely'` rows, pen `Buna (Current)`, plate rows missing product name or price (kills junk rows 21–27).
- **Upsert** competitor by cleaned CI name; **upsert** `CompetitorProduct` by `(CompetitorID, ProductName)` → update `Price/PriceMax/EffectiveDate/Category/OurProductID/Specifications/Notes/Status='Active'` (idempotent re-runs).
- Specifications JSON per source: plate `{competitorItemWeightG, kerchansheItemWeightG, remarks?}`; pen `{distributorBuyingPrice…}`; Geely `{segment, marketRole, batteryType, batteryCapacity, drivingRange, motorPower, groundClearance, fastCharge, adas360Camera, priceBasis}`.
- Expected: ~24 plate + 13 pen + 8 Geely = **~45 product rows**, ~20+ competitors; print summary; assert counts + 0 unmapped plate codes (fail loudly if a code stops matching).
- `package.json`: `"db:seed:competitors": "tsx scripts/import-competitor-master.ts"`. Run twice (idempotency proof).

## Phase 4 — Frontend

### 4.1 `lib/types.ts`
- New `CompetitorProductRow` (fields per API projection incl. `PriceDifference`, `PriceDifferencePct`, `Specifications: string|null`).
- Update `CompareCompetitor` → `{CompetitorName, Model, Price, PriceMax, EffectiveDate, Status, gapPercent}`.
- `PriceGapAlert.RegionName: string | null`.

### 4.2 New page `app/admin/competitors/page.tsx` (copy products-page pattern; `<Guard>` wrapper)
- **Header**: `.page-head` "Competitors" + sub + "Add competitor product" button.
- **Filters** (`.filters`): search input (debounced not required — matches existing), competitor `<select>`, category `<select>` (from `/competitors/products/categories`), status `<select>` (All/Active/Inactive/Expired), conditional ghost Clear. `?search=` deep-link post-mount (established pattern).
- **Table** (Card flush): Competitor | Product/Model | Category | Our product | Own price | Competitor price (range `price–priceMax`) | Price difference | Diff % | Effective date | Status badge | actions.
  - Gap cells: `fmtMoney`/`fmtPct` + existing `.gap-positive`/`.gap-negative`/`.gap-neutral` coloring (same sign semantics as pricing page). "—" when `OwnPrice` null.
  - Row actions: view (`eye`), edit (`pen`), delete (`trash`) — `.btn .btn-ghost .btn-sm`, delete via `window.confirm` → `toast` → `reload()`.
- **Server-side pagination** with `<Pagination>` (pageSize 20).
- **View modal** (`Modal`): read-only definition list — all fields + gap figures + specs rendered as humanized label/value rows (reuse `humanizeKey`/`formatSpecValue` exports from `components/ProductSpecs` if available, else local helper) + raw JSON `<details>` fallback.
- **Create/Edit modal** (one `Modal`, mode by row presence):
  - Competitor `<select>` + "＋ New competitor" inline toggle (name input → `POST /competitors`, then auto-select).
  - Product/Model (text, required), Category (input + `<datalist>` of existing categories), Our product (optional `<select>` from `/reference/products` — drives gap), Price (number, step 0.01, required), Price max (optional, hint "upper bound for ranges"), Effective date (date), Status (select), Notes (textarea), **Specifications key-value editor** (rows: label + value + remove; "+ Add spec"; assembled to JSON on submit; parsed to rows in edit mode).
  - Client validation via `toast.error` (pattern: products `ProductModal`) + server 409/422 surfaced via `ApiError.message`. Success toast shows gap % and `alertCreated` note. `busy` state on submit button.
- Responsive: rely on `.table-wrap` horizontal scroll + existing 768px media queries; add only a tiny CSS block if the specs editor needs one.

### 4.3 Rework `app/pricing/page.tsx` (keep structure, tabs, classes, thresholds/alerts untouched behavior)
- **Remove**: `RecordPriceModal`, "Record price" button, row edit/delete actions, `editPriceId` fetch + modal orchestration, `canRecord`, region filter (master has no region).
- **Records tab** → `GET /competitors/products?page=&pageSize=20&search=&category=&status=` (default status `Active`); columns: Our product | Competitor | Model | Category | Own price | Competitor price | Price difference | Diff % | Effective | Status. Same `.filters`/`.table`/`Pagination` markup.
- **Compare tab**: same endpoint; drop Region/Outlet columns, add Model / Effective date / Status / price-range display.
- **Alerts tab**: fix the existing no-op status filter (append `?status=` to the URL — backend already supports it) + handle nullable `RegionName`.
- **Thresholds tab**: unchanged.
- Sub-text note: prices sourced from Admin › Competitors (link `/admin/competitors` for Admin/MM).

### 4.4 `components/Sidebar.tsx`
Administration section, after Products: `{ href: '/admin/competitors', label: 'Competitors', icon: 'chess-knight', roles: ['Administrator','Marketing Manager'] }` (verify FA6 free solid renders; fallback `shield-halved`).

### 4.5 `globals.css`
Minimal additions only if needed for specs key-value editor rows (append near form styles); everything else reuses existing classes.

---

## Phase 5 — Verification (each gate must pass before moving on)
1. `npm run db:migrate` twice → table/indexes/alert-column created once, no errors.
2. Backend `npx tsc -p tsconfig.json --noEmit` → 0.
3. `npm run db:seed:competitors` twice → idempotent; asserts ~45 rows, all plate codes mapped, reactivates Antiline/BIC; spot-check rows via SQL (Geely EV gaps vs GL-EX2/EX5: e.g. BYD E2 3.81M vs 4.8M → diff ~990,000 / 20.6%).
4. API smoke (login token, `127.0.0.1:4000`):
   - `GET /competitors/products` filters + paging + gap fields
   - POST dup product → 409; POST dup competitor name → 409; inactive-name create → reactivate
   - PUT gap recompute; DELETE (alerts cleaned); competitor DELETE with products → 409, after → ok
   - `GET /competitor-pricing/compare/:glEx2Id` → master rows; `GET /competitor-pricing` (legacy 2 rows) still OK; POST legacy record still OK (untouched path)
   - `GET /competitor-pricing/alerts?status=Active` shows legacy + master; resolve/dismiss OK
   - `GET /reports/competitor-intel` (MI) → still 200 with data (view untouched)
5. Frontend `npx tsc --noEmit` → 0.
6. Headless DOM checks (auth-boot pattern, temp file deleted after): `/admin/competitors?search=BYD` renders rows/gap columns/CRUD buttons; `/pricing` records tab shows master rows, no "Record price" button, alerts status filter works; compare tab renders.
7. Final sweep: `?search=` deep-links, delete temp artifacts, both servers healthy, summary to user.

## Files touched
| Action | File |
|---|---|
| NEW | `backend/migrations/030_competitor_master.sql` |
| NEW | `backend/src/modules/competitors/competitors.service.ts` |
| EDIT | `backend/src/modules/competitors/competitors.routes.ts` (service wiring + `/products*` endpoints + dup guards) |
| EDIT | `backend/src/modules/competitorPricing/competitorPricing.service.ts` (`comparePrice`, `listAlerts` only) |
| NEW | `backend/scripts/import-competitor-master.ts` |
| EDIT | `backend/package.json` (add `db:seed:competitors`) |
| NEW | `frontend/src/app/admin/competitors/page.tsx` |
| EDIT | `frontend/src/app/pricing/page.tsx` (remove manual entry; source switch; alerts-status fix) |
| EDIT | `frontend/src/components/Sidebar.tsx` (nav entry) |
| EDIT | `frontend/src/lib/types.ts` (add `CompetitorProductRow`, adjust compare/alert types) |
| EDIT | `frontend/src/app/globals.css` (minimal, if needed) |

## Non-goals / explicit non-breaks
- No changes to `/competitor-pricing` record/list/get/PUT/DELETE routes, thresholds routes, MI report endpoints/views, notifications dispatch, permission matrix, Geely seed, or Products/Catalogue pages.
- Legacy `CompetitorPrice` rows (2) and their alerts stay visible in the Alerts tab via the LEFT-JOIN union.
- Gap uses base `Product.UnitPrice` (no VAT adjustment) — same as all existing gap logic; Excel sheets' precomputed % differ by design (user decision #2).
