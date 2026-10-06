# KG-MIS — Planning & Performance Module
## User Guide for Managing the Annual KPI Plan, Monthly Measurement & Verification

**Version:** 1.0
**Audience:** MIS Administrator / Department Head (KPI admin)
**System:** KG-MIS — Kerchanshe Group Marketing Information System
**Screen:** Admin sidebar → **Planning & performance** (`/admin/kpi`)

---

## 1. Purpose

This guide explains how to run the KPI measurement and reporting cycle in KG-MIS, based on
the workbook *KPI_Measurement_Reporting_System_MIS_Compatible.xlsx*. It covers:

- Setting up the annual KPI plan (49 seeded KPIs + any custom KPIs)
- Entering **planned vs actual** figures each month
- Attaching **evidence** for actuals
- **Verifying** measurements (approve / reject)
- Understanding automatic **status** (On Track / At Risk / Off Track) and **ratings**
- Importing or refreshing the plan from the Excel workbook
- Reading dashboards, rankings and results

Everything is admin-only: only users with the **Administrator** role (permission
`admin.users`) can see and use this module. Field officers enter their own KPI activity
from their own **Performance** page and do not see this screen.

---

## 2. Module map (the 9 tabs)

| Tab | What it is for |
|---|---|
| **Dashboard** | Headline KPI metrics, trends, planned-vs-achieved overview |
| **Plans** | Strategic plans (Annual / Quarterly / Monthly / Weekly) and their status |
| **Activities** | Activities linked to plans (owner, dates, completion) |
| **KPI Definitions** | The KPI catalogue: codes, targets, thresholds, weights, workbook metadata |
| **Measurement** | Monthly grid: planned vs actual entry, evidence, status, MIS record IDs |
| **Verification** | Queue of measured KPIs waiting for approval (Pending → Verified / Rejected) |
| **Ranking** | Officer performance ranking with drill-down detail |
| **Results** | Full results list (Officer or Measurement records) and Planned vs Achieved |
| **User Guide** | Short in-app guide |

---

## 3. Roles and permissions

| Action | Who can do it |
|---|---|
| View/manage KPI definitions, plans, activities | Administrator |
| Enter monthly actual values (**Measurement** tab) | Administrator (admin-only entry, by design) |
| Upload evidence | Administrator |
| Verify / reject measurements (**Verification** tab) | Administrator (permission `admin.users`; route also allows any role granted `admin.users`) |
| Import the workbook | Administrator |
| Enter own KPI activity (visits, campaigns…) | Field officer — own **Performance** page only |

Every verification, import and measurement save is written to the **audit log**
(who, what, when).

---

## 4. Managing KPI definitions (KPI Definitions tab)

### 4.1 The catalogue
The system is seeded with the **49 workbook KPIs**, coded `KPI-001 … KPI-049`, each with:

- **Code / Name / Category / Description**
- **Annual target** — numeric (`Target Value`) and text form (`Annual Target (text)`), e.g. `12–14 campaigns`, `Reach >=50k`
- **Unit of Measure** — `%, Birr, ratio, count…` and a select-able **Measurement Unit**
- **Weight** and **Frequency** (Monthly by default)
- **Direction** — *Higher is Better* / *Lower is Better* (affects how efficiency is computed)
- **Thresholds** — Excellent / Good / Average (defaults 100 / 90 / 75) → drive the **Rating**
- **Strategic Objective**, **Business Unit** (Group / BU), **KPI Owner**, **Data Source**,
  **Collection Method**, **Alert Threshold (%)**, **Evidence Required**, **Verification Role**,
  **Dashboard Group**, **System Module**, **Integration Method**, **Source Ref**

`Source Ref` is the workbook's `kpi_id` (1–49). It is how the import matches rows, so
leave it set for seeded KPIs.

### 4.2 Create / edit / delete
- **New KPI** → fill the form → **Create**.
- **Edit** (pencil icon) → change fields → **Update**. Updates are saved to the exact
  fields shown (field values persist reliably as of this release).
- Deactivating/removal is done through data administration, not from this screen.

### 4.3 Importing the workbook (Import Workbook button)
1. Prepare an `.xlsx` file with sheets **MIS Annual Plan** and **Measurement Entry**
   (the shipped workbook is compatible).
2. KPI Definitions tab → **Import Workbook** → choose the file.
3. The result toast reports `definitions updated`, `measurements upserted` and any errors.

What the import does:
- **Upserts KPI definitions** by `Source Ref` (existing KPIs are updated, not duplicated)
- **Adds/updates monthly measurement rows** for the selected year
- **Never overwrites actual values you have already typed in** — re-importing is safe
- Rejects non-`.xlsx` files (max 20 MB)

---

## 5. Monthly measurement workflow (Measurement tab)

This is the core monthly cycle. One screen = one KPI × month grid (49 rows by default).

### Step 1 — Choose the period
Use the toolbar: **Year** (e.g. 2026), **Month** (Jan–Dec, or *All months*), plus optional
**Category**, **Status** and **search** filters. The summary cards show counts of
On Track / At Risk / Off Track / Pending Verification.

### Step 2 — Enter actual values
- Type the month's **Actual** for each KPI (numeric). Clear the cell to reset it to empty.
- **Planned** is the plan figure from the annual plan (numeric or text like
  `Plan/Tease/Launch`, `1k`, `-`).
- **Efficiency %** = Actual ÷ Planned (inverted automatically when the KPI is
  *Lower is Better*).

### Step 3 — Review automatic status
- **Auto** column: computed from the actual vs the alert threshold
  (default 90% of plan):
  - **On Track** ≥ alert threshold
  - **At Risk** ≥ threshold − 15 points
  - **Off Track** below that
- **Override** column: optionally force a status (On Track / At Risk / Off Track).
  An override **wins** over the automatic one.
- **Final** column: `Override if set, otherwise Auto`. Empty (`No Data`) until an
  actual exists.

### Step 4 — Attach evidence
- Click the **+** button in the *Evidence* column and pick a file
  (PDF, Office, CSV or images — max 10 MB). The file is stored and linked to the row;
  the paperclip icon opens it in a new tab.
- If the KPI has **Evidence Required = Yes**, always attach a file before verification.

### Step 5 — Save
- Click **Save** on the row. Saving an actual **resets verification to Pending**
  (a verified row that changes must be re-verified) and records the MIS record ID.
- Rows show their **MIS Record ID**, e.g. `KPI-2026-001-SEP` (year-KPI-SEP), which is
  the reference to quote in reports or when reconciling with Excel.

> Tip: month selections are "All months" for overview only — enter data with a specific
> month selected so the period is unambiguous.

---

## 6. Verification (Verification tab)

Verification is the quality gate between measurement and reporting.

1. Open **Verification**. Default filter = **Pending** (only rows that have an actual
   or a final status ever reach the queue).
2. Check planned vs actual, efficiency, final status, notes and the evidence link.
3. Decide:
   - **✓ Verify** — approves the row; it becomes **Verified** and counts in reporting.
   - **✗ Reject** — a **rejection note is required** (prompt). The row stays visible in
     the *Rejected* filter for correction, then resubmission by re-saving in Measurement.
4. Verified rows show the **reviewer name** and timestamp context in the audit log.

Notes:
- Only *Pending* rows can be verified; verifying an already-decided row reports
  "no longer pending".
- Changing the actual later automatically returns the row to **Pending**.

Status vocabulary: `Pending → Verified | Rejected` (per row), independent of the
performance status (On Track / At Risk / Off Track).

---

## 7. How status, rating and alerts are computed

| Concept | Rule |
|---|---|
| **Efficiency %** | Actual ÷ Planned × 100 (reciprocal when direction = Lower is Better) |
| **Auto status** | ≥ Alert % → On Track; ≥ Alert % − 15 → At Risk; else Off Track (default Alert = 90) |
| **Final status** | Status override if present, else auto status; blank when no actual |
| **Rating** | Excellent ≥ threshold (100), Good ≥ 90, Average ≥ 75, else Needs Attention |
| **Evidence** | Shown as paperclip; required per KPI when Evidence Required = Yes |
| **Alert threshold (%)** | Per-KPI override of the default 90 (settable in KPI Definitions) |

Changing thresholds or weights affects future calculations; recompute by refreshing the
relevant tabs (scores are stored per row at save time).

---

## 8. Reading Results, PVA and Ranking

- **Results tab** — two views:
  - *Planned vs Achieved* — per-KPI totals with achievement bars and officer counts.
  - *KPI Results* — row-by-row list with a **Type** filter:
    - `Officer` — individual officer KPI results (default view)
    - `Measurement` — the org-level monthly measurement rows you enter in the Measurement tab
    Columns include Target, Actual, Achievement, Score, Rating, **Final Status** and
    **Verification**.
- **Ranking tab** — officer leaderboard; click a row for the officer detail modal
  (per-KPI scores, trend, activity evidence).
- **Dashboard** — summary cards, trend chart and PVA overview for management reporting.

---

## 9. Data and file handling reference

| Item | Detail |
|---|---|
| Measurement grid | 49 KPI rows per month (plus any custom KPIs) |
| Seeded year | 2026 measurement rows, `RecordType = Measurement`, no individual owner |
| MIS record ID | `KPI-<year>-<3-digit kpi number>-<MON>` |
| Evidence files | `uploads/kpi-evidence/` — PDF, Office, CSV, images; 10 MB max |
| Import file | `.xlsx` only; 20 MB max; parsed in memory |
| Workbook source | `Docs/Master-data/KPI_Measurement_Reporting_System_MIS_Compatible.xlsx` |
| API routes | `/api/v1/admin/kpi/*` (definitions, results, measurement, verification, verify, import, evidence) — all require `admin.users` |

---

## 10. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Save does nothing / values revert | Ensure a **month** is selected and the row's actual is numeric; check for a validation toast |
| Row missing from the verification queue | It has no actual and no final status yet — enter an actual first |
| "no longer pending" on verify | The row was already decided or changed; reload the queue |
| Actual typed but status blank | Efficiency/status only compute when both planned and actual are numeric |
| Import rejected | File must be `.xlsx` (max 20 MB) with the expected sheet names |
| Import did not update a KPI | Its `Source Ref` does not match the workbook `kpi_id` |
| Evidence upload rejected | Extension not in allowed list or over 10 MB |
| Verification tab is empty | Filter is probably **Verified/Rejected**; switch back to **Pending** |
| Officer results missing measurement rows | Measurement rows are org-level (no officer) — see Results → Type = Measurement |

---

## 11. Monthly checklist (summary)

1. Set period (year + month) in **Measurement**.
2. Enter actuals for all 49 KPIs; fix any *At Risk / Off Track* explanations.
3. Attach evidence (mandatory where required).
4. Save rows (verification resets to Pending automatically).
5. Open **Verification** → Verify or Reject with a note.
6. Review **Results** (Measurement type) and **Dashboard** before the management report.
7. Re-import the workbook only if definitions/targets changed upstream — actuals are safe.

---

*Companion documents: `End-to-End User Guide & System Demonstration Manual.md`,
`KG-MIS_Quick_User_Guide_UAT.md` (same folder).*
