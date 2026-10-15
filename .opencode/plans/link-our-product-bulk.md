# Plan: Link our product → competitor product (admin/competitors)

**Status:** Approved for execution.
**Date:** 2026-09-27

## Problem
In `/admin/competitors`, Buna Pen competitor rows show "Our product" empty/null and the
edit-modal "Our product" dropdown appears to have no Buna Pen option.

## Findings (diagnosis done in plan mode)
- Our Buna Pen products exist: `420000-BLU/BLA/RED` (IDs 220–222, active);
  `/reference/products` returns all 83 active products including them → dropdown data is fine.
- Root cause candidates:
  1. Modal silently renders an empty dropdown when the single `/reference/products` fetch
     fails (`useFetch` does not retry network errors; no error surfaced). Stale failed fetch
     from page load persists until reload.
  2. Findability: 83 unfiltered options in a native select, no category grouping, no visual
     cue for unlinked rows.
- **Backend bug:** `computeGapAndAlert` early-returns when `ourProductId` is null without
  deleting an existing `PriceGapAlert` → stale alerts after unlinking
  (`backend/src/modules/competitors/competitors.service.ts:258`).
- Dev login `Password123!` had stopped working mid-session; user reset it — verified working.

## User decisions
- Linking model: **manual per-row edit + bulk link action** (both).
- Dev login: user already reset to `Password123!`.

## Phase 1 — Reproduce
- Temp auth-boot harness (`frontend/public/_*.html`, deleted after) + headless Chrome:
  open edit modal on a Buna Pen row, dump Our-product `<select>` options and fetch status.

## Phase 2 — Fixes

### A. Modal (frontend `app/admin/competitors/page.tsx`)
1. Move `/reference/products` fetch into `ProductModal` → fresh fetch per open; local
   Loading state.
2. Options in two `<optgroup>`s: "Same category (N)" first, then "All products (M)".
3. On fetch error: `alert alert-error` + Retry button (`reload()`).

### B. Bulk link
1. Backend: `PUT /api/v1/competitors/products/link` — **declared before** `PUT /products/:id`.
   - zod: `{ competitorProductIds: number[] (1..100 unique), ourProductId: number|null }`
   - permission `competitors.manage`
   - validate all row ids exist (404) and product exists when set (404)
   - per row: set `OurProductID`, `UpdatedAt`, recompute gap + alert
   - respond `{ updated: n }`; single audit `UPDATE`/CompetitorProduct, detail {bulk, ids, ourProductId}
2. Backend fix: in `computeGapAndAlert`, when unlinking (no ourProduct / product row missing /
   own price ≤ 0) → `DELETE FROM PriceGapAlert WHERE CompetitorProductID = @Id` first.
   (Below-threshold case left as-is: manual resolve/dismiss exists.)
3. Frontend: checkbox column (header = select page), selection `Set<number>` kept across pages,
   cleared on filter change. Toolbar when ≥1 selected: `N selected`, our-product select with
   same category-first `<optgroup>`s, **Link** (confirm → PUT → toast → clear → reload),
   **Unlink** (confirm → PUT with `ourProductId: null`), **Clear**.

### C. Discoverability
- `OurProductID == null` cell renders amber `Not linked` badge (clickable → edit modal) on
  admin/competitors AND pricing records tab.

## Phase 3 — Verification (gates)
1. Backend `npx tsc -p tsconfig.json --noEmit` → 0; frontend `npx tsc --noEmit` → 0.
2. API smoke (127.0.0.1:4000):
   - link 2 pen rows → updated=2, list shows OurProductID + gap fields
   - unlink → rows unmapped; **EV row unlink → its alert deleted; relink → alert recreated**
     (final state must equal initial)
   - unknown ids → 404; unknown product → 404; empty ids → 422
3. Headless DOM:
   - edit modal: "Same category" optgroup contains 420000-BLU/BLA/RED; error UI absent
   - filter category=Buna Pen → select all 13 → bulk link → table linked + gaps →
     bulk unlink → restored
   - "Not linked" badge present when unmapped
4. Data integrity: Buna Pen rows unmapped again (13), mapped counts 24 plate + 8 EV,
   alerts back to 26; temp files deleted; both servers 200.

## Files
| Action | File |
|---|---|
| EDIT | `backend/src/modules/competitors/competitors.service.ts` (bulk link fn, stale-alert fix) |
| EDIT | `backend/src/modules/competitors/competitors.routes.ts` (PUT /products/link) |
| EDIT | `frontend/src/app/admin/competitors/page.tsx` (modal, bulk UI, badge) |
| EDIT | `frontend/src/app/pricing/page.tsx` (Not linked badge) |
| EDIT | `frontend/src/lib/types.ts` (only if bulk response type needed — likely none) |
| NEW (temp, deleted) | headless verify harness under `frontend/public/` |

## Out of scope
Import script, `/competitor-pricing` legacy API, pricing compare/alerts behavior, permissions
matrix, Geely work.
