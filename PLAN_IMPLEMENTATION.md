# KG-MIS Implementation Plan — SRD Scope Alignment + Frontend Layout Polish

> Source of truth: `Docs/KG-MIS_Seed_Data_Collection_Template_v1_2_SRD_Aligned.xlsx`
> (19 tabs; SRD Scope Matrix with 35 requirements MI-DC/DM/AN/DB/RP/DS/CR/SG).
> Current system covers surveys (NexForm) and base market visits / competitor pricing.
> Gaps: customer & distributor interviews, multimedia evidence, weekly sales capture,
> business-group dimension, enhanced field observation fields, richer digital insights.

## Confirmed scope decisions
1. Implement **all six** required features at full depth:
   - Field observations and market visit reports
   - Customer and distributor interviews
   - Structured questionnaires and surveys
   - Photos and videos with metadata (upload + register)
   - Sales and competitor data
   - Digital market insights
2. "Justified" frontend = **layout alignment / centering polish** (symmetry,
   equidistant cards, centered login, aligned form controls) — NOT text justification.
3. Photos/videos: **real upload** to `backend/uploads` + a metadata register
   capturing GPS/timestamp/user/media-type/transcription-status automatically.
4. Interviews & multimedia: **entry + list + detail + link media + reporting**.

## Phase 0 — Frontend layout polish ✅
- File: `frontend/src/app/globals.css`
- Replace forced `text-align: justify` blocks (card-body p/li, stat sub, obs-list,
  page-head sub) and the login `:after` filler trick with clean, consistent alignment.
- Symmetric/centered layout:
  - `.content` — centred `max-width`, consistent padding.
  - Stat cards — equal width, centred value/label, uniform padding.
  - `.card` — uniform height in grids, centered `h3` header, centered `.empty`.
  - Login — centred wrap/card, symmetric brand/tagline/inputs/dev-note.
  - Topbar / filters / modals — centred modal (`align-items: center`), aligned filters.
- Verify every page renders evenly spaced/centered.

## Phase 1 — Data layer ✅ (migration 003 applied + seeded)
- File: `backend/migrations/003_mi_scope.sql`, `backend/seed/seed.sql`
- **BusinessGroup** (ID, Code, Name, Description, Notes) + seed the 8 groups:
  Kerchanshe Coffee (KCC), Tractor (TRC), Geely Car (GLC), Buna Pen (BPN),
  Buna Plate (BPL), Bus (BUS), Oro Meat (ORM), Buna Paints (BPT).
- **MarketVisitReport** additions: `BusinessGroupID`, `VisitType`,
  `StockLevelObserved`, `CompetitorPresenceNoted`, `KeyFindings`, `PhotoVideoRef`,
  `FollowUpRequired`, `ApprovedBy/ApprovedAt`; status gains `Approved`.
- **Interview** (new): Interviewer(UserID), BusinessGroupID, RegionID, OutletID?,
  InterviewDate, RespondentType, RespondentName, SatisfactionScore, Sentiment,
  KeyFeedback, PhotoVideoRef, Notes, Status (Draft/Submitted/Reviewed/Approved),
  CapturedLat/Lng.
- **Competitor** (new catalogue): Name, ProductsCovered, RegionsActiveIn, Notes,
  BusinessGroupID + sample rows.
- **CompetitorPrice** additions: `CompetitorID`, `Availability`, `PromotionObserved`,
  `QualityObservation`, `PhotoVideoRef`.
- **MultimediaAsset** (new): CaptureDate, CapturedBy, BusinessGroupID?, RegionID?,
  OutletID?, RelatedModule (MarketVisit/Interview/Survey/CompetitorPricing),
  RelatedRecordID, MediaType (Photo/Video/Audio), StorageURL, OriginName, SizeBytes,
  MimeType, CaptureLat/Lng, Tag, TranscriptionRequired, Transcription,
  ValidationStatus, Notes.
- **WeeklySales** (new): WeekEnding, BusinessGroupID, ProductID, RegionID, OutletID,
  CustomerID?, QuantitySold, UnitPrice, Revenue, Notes, Submitter, Status.
- **Product/Customer** additions: `BusinessGroupID`; Customer: ContactPerson,
  ContactPhone, Email, RegionID?, OutletID?.
- Reporting views: extend `vw_Report_MarketVisits`; add `vw_Report_Interviews`,
  `vw_Report_Multimedia`, `vw_Report_WeeklySales`, `vw_Report_CompetitorIntelligence`.
- Seed representative rows matching the template sample rows.

## Phase 2 — Backend ✅ (typecheck clean)
- **Interviews module** (`modules/interviews/*`): CRUD + submit/review/approve,
  scope-aware listing, notifications on submit.
- **Multimedia module** (`modules/multimedia/*`): upload (multer), metadata capture,
  link to module/record, validate/transcribe (PATCH), filters, gallery.
- **Weekly Sales module** (`modules/weeklySales/*`): POST/GET/delete + revenue + notify.
- **Competitors module** (`modules/competitors/*`): reference CRUD; extend
  `competitorPricing` with observation fields + competitor link.
- **Market visits service**: accept new fields, `approve` transition, media links.
- **Reference module**: add `/business-groups`, `/competitors`, `/customers`.
- **Reports / AI insights** (`modules/reports/*`): interview satisfaction avg,
  availability rate, stock-shortage + declining-sales auto-alerts (MI-DS-01),
  sentiment aggregation; CSV/Excel export endpoints.
- **Types**: `backend/src/types/index.ts` + `frontend/src/lib/types.ts`.

## Phase 3 — Frontend ✅ (typecheck + build clean)
- **Market Visits** (`/visits`): all template fields, Approve action, linked media.
- **Interviews** (`/interviews`, new): list + create/edit + detail + link media.
- **Multimedia** (`/multimedia`, new): gallery/register with upload, metadata,
  filters, validation + transcription.
- **Competitor Pricing** (`/pricing`): competitor catalogue select + observation
  fields.
- **Weekly Sales** (`/weekly-sales`, new): entry form + list.
- **Sidebar**: add Interviews, Multimedia, Weekly Sales.
- **Dashboard + Reports**: new KPIs (satisfaction, availability, weekly sales,
  stock-shortage/declining-sales alerts).

## Phase 4 — Verification
- `npm run db:migrate` + `npm run db:seed` (backend).
- `npm run typecheck` + `npm run build` (backend + frontend).
- Manual smoke: login → full market visit → submit/review/approve → interview →
  upload multimedia (GPS/timestamp) → link → competitor observation → weekly sales →
  dashboard KPIs + insights + reports.
- Browser review: login + all pages for centred/symmetric layout.

## Out of scope (flagged in TASKS.md as future)
- Offline capture + auto-sync (MI-DC-05)
- Audio-as-a-service transcription, multi-language UI (MI-DC-07/08)
- Live Power BI SDK embed, real D365FO/CUAS/CNS production wiring