# KG-MIS — Corporate Marketing Activities Plan
## User Guide for the Monthly Activity Plan, Verification & Events Register

**Version:** 1.0
**Audience:** MIS Administrator (permission `admin.users`)
**System:** KG-MIS — Kerchanshe Group Marketing Information System
**Screen:** Admin sidebar → **Corporate marketing plan** (`/admin/corporate-marketing`)
**Source workbook:** `Docs/Dev-Docs/KG Corporate Marketing_Plan_and_Activities.xlsx`

---

## 1. Purpose

This module digitises the annual **Corporate Marketing Plan & Activities** workbook:

- **Monthly Plan** — 49 parent activities (codes `FP-006 … FP-044`, `DM-059 … DM-069`), each with
  4 sub-tasks, repeated every month → **196 tasks/month, 2,352 tasks/year** (seeded for 2026).
- **Events & Campaigns** — a register of 100 event shells (`EVT-001 … EVT-100`) with budgets,
  leads, revenue and derived performance metrics.
- **Verification workflow** — every task starts as *Not Verified* and is approved (✓) or
  rejected (✗) by the administrator.

Everything on this screen is **admin-only**. Field officers never see it.

---

## 2. Roles and permissions

| Action | Who can do it |
|---|---|
| View dashboard, plan, events | Administrator (`admin.users`) |
| Assign responsible person, set completion %, add remarks | Administrator |
| Verify / reject tasks | Administrator |
| Edit events (budgets, outcomes, status) | Administrator |
| Import the workbook (API) | Administrator / developer |

Every save, verification and import is written to the **audit log** (who, what, when).

---

## 3. Module map (4 tabs)

| Tab | What it is for |
|---|---|
| **Dashboard** | Year/month filter, headline counts (total / verified / not verified / rejected, avg completion, assigned, events planned/completed) and a rollup **by responsible role** |
| **Monthly Plan** | The 196-task grid for the chosen month, grouped by parent activity; inline editing and verify/reject |
| **Events & Campaigns** | The EVT register with derived metrics; full-row edit modal |
| **User Guide** | Short in-app guide |

---

## 4. Monthly Plan workflow

1. Open **Monthly Plan** and pick the **year + month** (defaults to the current month of 2026).
2. Optionally filter by **Responsible Role**, **Status** or free-text **search** (task name, parent code,
   activity, person…). Page size is 500 so a full month fits on one screen.
3. For each row you can fill in:
   - **Responsible Person** — who is executing the task
   - **Completion %** — 0–100 (values outside the range are rejected on save)
   - **Evidence / Remarks** — notes or links supporting the work
4. Click **Save** on the row. The row keeps its current *verification status* (saving never auto-verifies).
5. **Verify** with ✓ or **Reject** with ✗ (a rejection note is required). Only rows in
   *Not Verified* status can be verified — verified rows must be un-done via re-import or
   data fix, never silently re-approved.
6. Editing a **Rejected** task automatically returns it to **Not Verified** so it can be
   re-checked after the correction.
7. The grouped header rows (`FP-006 — Marketing Plan and Activities`, …) show the parent
   activity for the four sub-tasks below it.

---

## 5. Events & Campaigns

1. Open **Events & Campaigns**; filter by status (Planned / In Progress / Completed / Cancelled)
   or search by code, name, person or location.
2. Click **Edit** on any row. The modal exposes every workbook column: name, category, business
   unit, responsible person/role, location, dates, status, planned/actual participants, leads,
   conversions, planned revenue, actual revenue, approved budget, actual cost, reach, engagements,
   satisfaction score, KPI target/actual, evidence link and remarks.
3. The system **derives** these metrics on every save (business rules from the workbook notes):
   - **Month** and **ISO week** from the start date
   - **Conversion rate %** = conversions ÷ leads
   - **ROI %** = (actual revenue − actual cost) ÷ actual cost
   - **Budget variance** = approved budget − actual cost
   - **Attendance rate %** = actual participants ÷ planned participants
   - **Engagement rate %** = engagements ÷ reach
4. Event status vocabulary is `Planned → In Progress → Completed / Cancelled` (free to move
   both ways — the system records what you set).

---

## 6. Workbook import (developer / API)

The API `POST /api/v1/admin/corp-marketing/import` accepts the original `.xlsx`
(multipart field, 20 MB max) and **upserts**:

| Entity | Match key | Rules |
|---|---|---|
| Parent activity | `PlanYear + ParentCode` | Name/KPI text refreshed |
| Monthly task | `TaskId` (e.g. `SEP-FP-006-01`) | **Never overwrites** person, completion, status or remarks you have entered |
| Event | `EventCode` (`EVT-001…`) | Same preservation rule |

Response: `{ parentsUpserted, tasksUpserted, eventsUpserted, errors[] }`. Re-importing the
same file is **idempotent** — use it to add a new year or refresh activity text without
losing operational data.

---

## 7. Data model (for implementers)

| Table | Contents |
|---|---|
| `CorpMarketingPlanItem` | 49 parent activities per plan year (unique `PlanYear + ParentCode`) |
| `CorpMarketingTask` | 2,352 sub-tasks (unique `TaskId`, FK to parent, `Month` 1–12, status CHECK) |
| `CorpMarketingEvent` | 100 event shells (unique `EventCode`, default status `Planned`) |

Status vocabulary for tasks: `Not Verified` (default) / `Verified` / `Rejected`.
Verified rows store `VerifiedByUserID` and `VerifiedAt`.

Key endpoints (all under `/api/v1/admin/corp-marketing`, all guarded by `admin.users`):

| Method | Path | Purpose |
|---|---|---|
| GET | `/tasks` | Filtered, paginated task grid (`year, month, role, status, search`) |
| PUT | `/tasks/:id` | Update person / completion / remarks |
| POST | `/verify` | Bulk verify/reject (pending rows only) |
| GET | `/roles` | Distinct responsible roles for the filter |
| GET | `/summary` | Dashboard counts + rollup by role |
| GET | `/events` | Event register with derived metrics (`status, search`) |
| PUT | `/events/:id` | Update an event |
| POST | `/import` | Idempotent workbook upsert |

---

## 8. Frequently asked questions

**Can I add a task that is not in the workbook?**
Not in v1 — the plan is workbook-driven. Add it to the workbook and re-import, or ask a
developer to insert it via SQL.

**I verified a task by mistake.**
There is no "un-verify" button by design. Reject it with a note explaining the correction,
or ask a developer to reset that row's status.

**Why does my edit not show on the Dashboard?**
The Dashboard refreshes when you change year/month or after a save on another tab. Re-open
the tab or reload the page if in doubt.

**What happens in 2027?**
Import the 2027 sheets (same Task IDs with `JAN-…` prefixes under plan year 2027). Task IDs
include the month, so years never collide.

---

*End of guide — KG-MIS Corporate Marketing Activities Plan v1.0*
