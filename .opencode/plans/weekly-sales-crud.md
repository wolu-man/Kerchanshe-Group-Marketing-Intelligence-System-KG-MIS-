# Plan: Weekly Sales — Full CRUD + Product-Entity Fields

**Approved decisions:** attributes auto-fill from product & stay **editable (snapshotted to DB)** · **skip "type"** · scope = **Edit + detail view** (Create/Delete already work; no workflow buttons) · surface attributes on **table + form + detail only** (no Excel/reports-tab changes).

## Current state
- **C** ✅ `POST /weekly-sales` + modal · **R** ⚠️ list only (no `GET /:id`, no detail view) · **U** ❌ nothing · **D** ✅ DELETE endpoint + button + ownership
- `WeeklySales` stores no product attributes; `Product` has `Color/Size/WeightKg/Specifications(JSON)/Category` (no Type); `GET /reference/products` omits them

## 1. Migration — `backend/migrations/035_weekly_sales_attrs.sql`
Guarded `ALTER TABLE dbo.WeeklySales ADD`: `ProductColor NVARCHAR(100)`, `ProductSize NVARCHAR(50)`, `ProductCategory VARCHAR(100)`, `ProductSpecs NVARCHAR(MAX)` (JSON, same convention as `Product.Specifications`). No view change (reports out of scope). Apply `npm run db:migrate`.

## 2. Backend
- `permissions.ts:169` — add `'weeklySales.update': { Administrator:'full', 'Marketing Manager':'write-own', 'Field Officer':'write-own' }`
- `weeklySales.routes.ts`:
  - `createSchema` (:22-32) + `productColor/productSize/productCategory/productSpecs` (optional/nullable); `updateSchema = createSchema.partial()`
  - `GET /:id` — `weeklySales.view` + `assertOwnOrFull`
  - `PUT /:id` — `weeklySales.update` + `validate(updateSchema)` + ownership + audit UPDATE (declare before/after DELETE — different methods, no ordering conflict)
- `weeklySales.service.ts`:
  - `BASE_SELECT` + `COALESCE(w.ProductColor, p.Color) AS ProductColor, COALESCE(w.ProductSize, p.Size) AS ProductSize, COALESCE(w.ProductCategory, p.Category) AS ProductCategory, COALESCE(w.ProductSpecs, p.Specifications) AS ProductSpecs` (old rows fall back to live product attrs)
  - `getWeeklySale(id)` (404), `updateWeeklySale(id, data)` dynamic column map (pattern marketVisits.service.ts:135-146), `UpdatedAt = SYSUTCDATETIME()`, unique-violation (2627/2601 on `UQ_WeeklySales_Week_Product_Outlet`) → `ConflictError` 409
  - `createWeeklySale` + 4 inputs/columns
- `reference.routes.ts:48-53` — `/products` SELECT + `p.Color, p.Size, p.WeightKg, p.Specifications`

## 3. Frontend
- `types.ts` `WeeklySalesRow` (:671-701) + `ProductColor/ProductSize/ProductCategory/ProductSpecs: string | null`
- `weekly-sales/page.tsx`:
  - `emptyForm()` + `productColor/productSize/productCategory/specRows: {key,value}[]`
  - `WeeklySalesForm`: `row?: WeeklySalesRow` prop prefill (parse `row.ProductSpecs` → specRows); remount `key={row?.WeeklySalesID ?? 'new'}`; product onChange hydrates attrs from selected `Product`; new "Product attributes" section (Color/Size/Category inputs + local `SpecsEditor` copied from admin/competitors/page.tsx:38-63); submit includes 4 fields (`specRows → JSON.stringify`, empty → null); `row ? PUT : POST`; button label Save changes/Save entry
  - modal state → `{ open, row? }`; actions cell + **View** (all) + **Edit** (same ownership gate as Delete); detail modal via `useFetch(detail ? \`/weekly-sales/${detail}\` : null, [detail])` (use-api.ts:17,26 null-disable confirmed); Product cell sub-line += Color/Size when present

## Out of scope
Workflow transitions, "type" field, Excel export/report-tab columns, multi-product line items (UQ constraint stays).

## Verification
1. `db:migrate` + COL_LENGTH (4)
2. `tsc` both → 0
3. API smoke: POST w/ attrs → list + `GET /:id`; PUT edit reflected; bad payload 422; duplicate week/product/outlet 409; unknown id 404; `/reference/products` carries attrs
4. Headless UI harness: create (auto-fill → override) → table chips → Edit → View detail → Delete cleanup
5. Cleanup: SQL restore baseline, remove harness, servers healthy
