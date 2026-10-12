# NexForm Phase 2 Implementation Plan

> Project: KG-MIS (Hybrid Market Intelligence System) — Kerchanshe Group
> Feature area: NexForm dynamic questionnaire platform — Phase 2 "Depth" features (NexForm SRS v1.1)
> Excluded by explicit scope decision: multi-language support, translation management, RTL (no existing RTL to preserve).
> Phase 3 features: only those already existing are preserved; no new Phase 3 work.

## 0. Existing-state audit

### Already working (Phase 1)
- Runtime schema stored in `FormVersion.SchemaJSON` (versioned JSON) — RT-01.
- 18 of 19 field types (missing `location`, `matrix`, `richtext`).
- Conditional-required + skip-logic branching engine: `computeFieldStates`, `evaluateCondition` (backend `formSchema.ts`, mirrored in frontend `FormViewer.tsx`).
- Server-side re-validation `validateResponse`; circular-branch rejection `validateSchema`; versioning + publish; access modes (Public/Domain/Invite/Group/Password); invites (single + CSV bulk); duplicate detection; rate limiting; GDPR consent flag; right-to-erasure; real-time report + dashboard layouts + Excel/PDF export; linked forms; CNS events; audit log writes.
- `FormResponse.Status='InProgress'` column already reserved for save & resume.

### Confirmed live bugs (fixed first)
1. `utils/scope.ts` `scopeClause()`/`scopeClauseViaOutlet()` return fragments with a **leading ` AND `**; callers push into `where[]` then `.join(' AND ')` → `1=1 AND  AND …` SQL syntax error for any non-`all` scope (Field Officer `/market-visits` 500).
2. `competitorPricing.service.ts` `listPrices()` never binds `@UserId` → Field Officer `/competitor-pricing` 500 ("Must declare the scalar variable @UserId"). Same missing binding in `reports.service.ts` `salesOverview` + `priceComparison`.
3. `marketVisits.service.ts` binds `@UserId` correctly; works after the `scope.ts` fix.

### Nothing exists yet (greenfield Phase 2)
Parent/child forms, cross-form reporting, calculated fields, display conditions, response editing, response scoring, report access control, report sharing, branding/white-label, save & resume, data anomaly detection, consent versioning, audit log retention policy, branching flow visualization, pages/progress bar, undo/redo, drag-and-drop. `@dnd-kit` not installed.

## Workstream 0 — Scope-layer bug fix (backend)
- `utils/scope.ts`: return bare predicates (strip leading ` AND `) in both helpers.
- `competitorPricing.service.ts` `listPrices`: add `request.input('UserId', sql.Int, opts.userId)`.
- `reports.service.ts` `salesOverview` + `priceComparison`: add `request.input('UserId', sql.Int, …)`.

## Workstream 1 — Migration `002_phase2.sql`

| Feature | Schema change |
|---|---|
| Parent/Child | `FormTemplate.ParentTemplateID` (self-FK, single-level), `InheritedFromVersionID` |
| Consent versioning | `FormTemplate.GDPRConsentText`, `GDPRConsentVersion INT DEFAULT 0`; `FormConsentHistory(ConsentHistoryID, TemplateID, ConsentVersion, ConsentText, EffectiveAt)`; `FormResponse.ConsentVersion INT` |
| Response editing | `FormTemplate.EditWindowHours INT NULL` (NULL=disabled); `FormResponse.EditedAt, EditCount`; `ResponseRevision(RevisionID, ResponseID, VersionID, AnswersJSON, EditedBy, EditedAt, Reason)` |
| Scoring | `FormResponse.TotalScore DECIMAL(10,2) NULL, ScoreMax DECIMAL(10,2) NULL` |
| Cross-form reporting | `FormCrossReport(CrossReportID, Name, TemplateIDsJSON, FieldMappingsJSON, LayoutJSON, CreatedBy, CreatedAt, UpdatedAt)` |
| Report sharing | `FormShare(ShareID, TemplateID NULL, CrossReportID NULL, Token UNIQUE, CreatedBy, CreatedAt, ExpiresAt, FiltersJSON, RevokedAt, Type)` |
| Report access control | `FormReportAccess(AccessID, TemplateID, UserID, AccessLevel, GrantedBy, CreatedAt, UNIQUE(TemplateID,UserID))` |
| Save & Resume | reuses `FormResponse.Status='InProgress'` + `VersionID` |
| Anomaly detection | `FormAnomalyFlag(FlagID, ResponseID, TemplateID, FieldKey NULL, AnomalyType, Score, Reason, Status, AutoRejected BIT, ReviewedBy, ReviewedAt, Resolution, CreatedAt)`; `FormTemplate.AutoRejectAnomalies BIT DEFAULT 0` |
| Audit retention | `SystemConfig(ConfigKey UNIQUE, ConfigValue, UpdatedBy, UpdatedAt)` |

## Workstream 2 — Schema envelope + 23 field types + engine extensions

- Envelope: `{ schemaVersion:2, pages:FormPage[], elements:FormElement[], branding:FormBranding }`; `parseSchema(json)` auto-detects legacy bare arrays → normalizes to v2.
- New field types: `location`, `matrix`, `richtext`, `calculated`, `prefill`.
- New element props: `pageId`, `scoring`, `displayWhen` (conditional group), `formula`, matrix/location/richtext/prefill config, `isReadOnly`.
- `ConditionalGroup { operator:'and'|'or', rules:ConditionalRule[] }` unified for `conditional`/`displayWhen`/`branching.condition`.
- Safe expression parser for `calculated` (no `eval`): `+ - * / ( )`, field refs, `MIN/MAX/ROUND/AVG/IF`; `validateSchema` rejects unknown refs, self/circular refs, malformed formulas.
- `validateResponse` extended for matrix/location/richtext (sanitize)/scoring.
- Analytics (`getReport`, `dashboard.defaultLayout`, `export`) extended for new types; all consumers switch to `parseSchema`.

## Workstream 3 — Feature-by-feature (backend service + routes + frontend)

1. **Parent/Child Forms** (REL-12..17): `POST /forms/:id/child`, `GET /forms/:id/children`, `PUT /forms/:id/parent`, auto-propagate on parent publish, `PARENT_FORM_UPDATED` CNS event.
2. **Cross-Form Reporting** (REL-18..21): `crossReports.service.ts`, CRUD + `GET /cross-reports/:id/report` (same `fields[]` shape as `getReport`), named view layouts.
3. **Calculated Fields**: builder formula editor with live field-ref picker; server computes at submit.
4. **Display Conditions** (FV-01/02): per-field "Show when" AND/OR editor; hidden fields excluded from validation/submission.
5. **Response Editing**: `PATCH /forms/:id/responses/:responseId` `{answers, reason}`; configurable `EditWindowHours` (default 72h); `ResponseRevision` audit trail; re-validate against stored `VersionID` schema.
6. **Response Scoring** (DR-12): per-field points config; `TotalScore`/`ScoreMax` computed on submit/edit/backfill.
7. **Report Access Control** (DR-10): `FormReportAccess` grants; effective access = owner OR grant OR Admin/Manager; enforced on report/export/dashboard/cross-report.
8. **Report Sharing** (DR-05/DR-11): `POST /forms/:id/report/shares` → token; `GET /share/:token` read-only live report preserving filters; revoke; optional CNS email.
9. **Branding / White-Label** (BR-01..06): envelope `branding`; logo upload; CSS vars; curated fonts; branded thank-you; desktop/mobile preview.
10. **Save & Resume** (CX-04, OP-08): draft save/load; signed resume token; submit upgrades draft; 7-day partial retention purge.
11. **Data Anomaly Detection** (DR-13, OP-07): rule-based z-score detection at submit + nightly recompute; `FormAnomalyFlag`; auto-reject only when configured (default off).
12. **Consent Versioning** (SC-11): consent text + version bump; re-consent for returning users on version change; history.
13. **Audit Log Retention** (SC-09/10): `AUDIT_RETENTION_DAYS` (default 365) + `SystemConfig` override; nightly purge; `listAudit` date-range + pagination; new audit actions for all new operations.

## Workstream 4 — Frontend builder & viewer overhaul

- Deps: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `@dnd-kit/modifiers`.
- Builder (`components/forms/builder/`): 3-panel layout — Toolbar, FieldLibrary, BuilderCanvas, PropertiesPanel, BrandingPanel, PagesBar, BranchFlow (SVG node graph), PreviewMode (375px mobile / desktop), `useHistory` undo/redo.
- Shared `FormRenderer.tsx` extracted from `FormViewer` (pages + progress bar, display conditions, calculated, prefill, matrix, location, richtext, branding, save&resume).
- Pages wired: `forms/[id]`, `respond`, reports (Cross Reports + Share), ResponsesTab (edit/anomalies/score/revisions), SettingsTab (inheritance/consent/edit-window/report-access).

## Workstream 5 — Permissions, CNS events, cron
- Permissions: `forms.viewReport`, `forms.editResponses`, `forms.share`, `forms.manageAnomalies`, `forms.crossReports`, `forms.manageChildren`, `admin.auditRetention`, `admin.consent`.
- CNS events: add `PARENT_FORM_UPDATED`, `FORM_RESUME`, `REPORT_SHARED` to `eventTypes.ts` + seed `NotificationConfig`.
- Cron: audit retention purge, anomaly recompute, partial-response purge (7 days).

## Verification
- Per feature: backend `typecheck` + `build` + migrate + restart; API tests with `admin` + `field1` JWTs.
- Frontend: `tsc --noEmit` + `npm run build`; Playwright (headless Chrome) flow per feature.
- Full Phase 1 regression: dashboard, notifications, market visits (fixed 500s), competitor pricing, reports/Power BI, forms CRUD/version/publish/clone/access/invites, respond + consent + duplicate + rate-limit, exports, erasure, admin.
- Backward compatibility: old bare-array schemas load and respond unchanged.

## Scope guards
- No multi-language, no translation, no RTL. No new Phase 3 items. Reuse existing schema/validation/reporting/IAM/CNS/audit architecture. Dynamic-schema representation used wherever applicable.
- Key defaults (configurable): edit window 72h; anomaly auto-reject off; audit retention 365 days; partial-response retention 7 days.
