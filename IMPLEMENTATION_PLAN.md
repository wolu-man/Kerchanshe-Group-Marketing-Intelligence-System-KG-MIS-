# KG-MIS Implementation Plan — SRD Scope Alignment & Data Integrity

> Based on complete audit of frontend, backend, database, business logic, reports, and workflows against `MIS/Docs/Master-data` authoritative source.

---

## Current System Status

- **~85% complete** for core MIS functionality
- Backend: Express.js with 14 modules
- Frontend: Next.js 14 with 11 pages
- Database: SQL Server with 3 migrations + seed
- All major workflows functional (market visits, interviews, multimedia, weekly sales, competitor pricing, forms)

---

## Phase 1: Data Alignment (High Priority) ✅ COMPLETE

### 1.1 Seed Data Corrections
- [x] Update `backend/seed/seed.sql` to populate `BusinessGroupID` on **Products** (8 groups: KCC, TRC, GLC, BPN, BPL, BUS, ORM, BPT)
- [x] Update `backend/seed/seed.sql` to populate `BusinessGroupID` + contact fields on **Customers**
- [x] Update `backend/seed/seed.sql` to populate `BusinessGroupID` on **Competitors** (5 seeded)
- [x] Add `Approved` status sample rows for **MarketVisitReport** and **Interview**

### 1.2 Fix Interview Export View
- [x] Add `PhotoVideoRef` column to `vw_Report_Interviews` in migration `004_seed_corrections.sql`

### 1.3 Admin Master Data CRUD UIs
- [x] **BusinessGroup** management page (`/admin/business-groups`) - Full CRUD
- [x] **Customer** management page (`/admin/customers`) - Full CRUD with contact details, BusinessGroup, Region, Outlet
- [x] **Product** BusinessGroup assignment UI (`/admin/products`) - Assign/unassign business groups

---

## Phase 2: Missing Functionality (High Priority) ✅ COMPLETE

### 2.1 Customer-Outlet-Region Validation
- [x] Backend validation for Customer.OutletID → Customer.RegionID consistency
- [x] Frontend hints/validation in Customer form

### 2.2 WeeklySales Reconciliation Workflow
- [x] UI for `Rejected` / `Reconciled` statuses (status field exists, UI shows all statuses)

### 2.3 Approval Notifications
- [x] Email notification on **MarketVisitReport** approve/reject (via dispatchEvent)
- [x] Email notification on **Interview** approve/reject (via dispatchEvent)

### 2.4 Audit Log Viewer
- [x] Admin page (`/admin/audit`) with filtering/search

---

## Phase 3: Enhanced Features (Medium Priority) ⏳ PENDING

### 3.1 Cross-Form Report Builder UI
- [ ] Frontend builder for `FormCrossReport` (template selection, field mappings, layout)

### 3.2 Form Response PDF Export
- [ ] Backend PDF generation service
- [ ] Frontend export button in responses tab

### 3.3 Dashboard Layout Persistence
- [ ] Save/restore `DashboardLayout` per user

### 3.4 PriceGapAlert Auto-Resolve
- [ ] Background job to auto-resolve when gap closes

### 3.5 Report Scheduling
- [ ] CRUD UI for `ReportSchedule`
- [ ] Cron integration

---

## Phase 4: Polish (Low Priority) ⏳ PENDING

- [ ] Multimedia streaming (byte-range support for video/audio)
- [ ] FormBuilder matrix field renderer completion
- [ ] User management UI (`/admin/users`)
- [ ] RoleMapping sync endpoint (dynamic CUAS claims)

---

## Source Data Conflicts (Resolved)

| Conflict | Resolution |
|----------|------------|
| Customer CustomerType | Use seed values: Distributor / Retailer / End User |
| Region list | Use 5 regions: Addis Ababa, Oromia, Amhara, SNNPR, Tigray |
| BusinessGroup codes | Use 8 groups from template: KCC, TRC, GLC, BPN, BPL, BUS, ORM, BPT |
| VisitType enum | Use 6 values: Routine, Follow-up, New Product Launch, Promotion Check, Compliance, Other |

---

## Implementation Order

1. **Seed corrections** (backend/seed/seed.sql + re-run migration)
2. **Interview export view fix** (migration 003)
3. **BusinessGroup admin CRUD** (backend routes + frontend page)
4. **Customer admin CRUD** (backend routes + frontend page)
5. **Product BusinessGroup assignment** (extend product reference)
6. **Approval notifications** (extend dispatchEvent calls)
7. **WeeklySales reconciliation UI** (extend page)
8. **Audit log viewer** (new admin page)

---

## Validation Checklist

After each phase:
- [ ] `npm run typecheck` (backend + frontend)
- [ ] `npm run build` (backend + frontend)
- [ ] `npm run db:migrate` + `npm run db:seed` (backend)
- [ ] Manual smoke test: login → create → submit → review → approve → report → export