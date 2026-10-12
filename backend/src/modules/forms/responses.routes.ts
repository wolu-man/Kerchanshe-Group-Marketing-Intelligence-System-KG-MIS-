import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { can } from '../../middleware/permission';
import { validate } from '../../middleware/validate';
import { asyncHandler, parsePagination } from '../../utils/http';
import { audit } from '../../db/audit';
import { BadRequestError, ForbiddenError } from '../../utils/errors';
import { getForm } from './forms.service';
import { formUpload } from './upload';
import {
  editResponse,
  getMyDraft,
  getResponseDetail,
  getResponseScores,
  getReport,
  issueResumeToken,
  listResponseRevisions,
  listResponses,
  requestErasure,
  resumeFromToken,
  saveDraft,
  submitResponse,
  type ReportFilters,
} from './responses.service';
import { listAnomalies, updateAnomalyFlag, recomputeAnomalies } from './anomaly.service';
import {
  createShare,
  grantReportAccess,
  listReportAccess,
  listShares,
  requireReportAccess,
  revokeReportAccess,
  revokeShare,
} from './sharing.service';
import { getDashboard, saveDashboard } from './dashboard.service';
import { exportExcel, exportPdf } from './export.service';
import { createCrossReport, deleteCrossReport, getCrossReport, getCrossReportReport, listCrossReports, updateCrossReport } from './crossReports.service';

function logAudit(req: Request, entry: { userId: number | null; action: string; entity: string; entityId?: number | null; detail?: Record<string, unknown> | null }) {
  return audit({ ...entry, ipAddress: req.ip });
}

const router = Router();
router.use(requireAuth);

const fileRefSchema = z.object({
  fileKey: z.string().min(1),
  originalName: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  mimeType: z.string().optional(),
});

const submitSchema = z.object({
  answers: z.record(z.unknown()),
  consentGiven: z.boolean().optional(),
  password: z.string().optional(),
  files: z.record(z.array(fileRefSchema)).optional(),
});

function assertOwnerOrFull(req: any, ownerUserId: number): void {
  if (req.scope?.dataScope === 'own' && ownerUserId !== req.user.userId) {
    throw new ForbiddenError('You can only access your own forms');
  }
}

// Submit a response to a published form (FR-01.2, re-validated server-side).
router.post(
  '/:id/responses',
  can('forms.respond'),
  validate(submitSchema),
  asyncHandler(async (req, res) => {
    const result = await submitResponse({
      templateId: Number(req.params.id),
      respondentUserId: req.user!.userId,
      respondentEmail: req.user!.email ?? undefined,
      consentGiven: req.body.consentGiven,
      password: req.body.password,
      answers: req.body.answers,
      files: req.body.files,
      ip: req.ip,
    });
    await logAudit(req,{ userId: req.user!.userId, action: 'FORM_RESPONSE_SUBMITTED', entity: 'FormResponse', entityId: result.responseId });
    res.status(201).json(result);
  })
);

// Upload a file for a form field; returns the file key to attach on submit.
router.post(
  '/:id/files',
  can('forms.respond'),
  formUpload.single('file'),
  (req, res) => {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) throw new BadRequestError('No file uploaded', 'NO_FILE');
    res.status(201).json({
      fileKey: file.filename,
      originalName: file.originalname,
      sizeBytes: file.size,
      mimeType: file.mimetype,
    });
  }
);

router.get(
  '/:id/responses',
  can('forms.viewResponses'),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = parsePagination(req);
    const result = await listResponses(Number(req.params.id), {
      dataScope: req.scope!.dataScope,
      userId: req.user!.userId,
      page,
      pageSize,
    });
    res.json(result);
  })
);

router.get(
  '/:id/responses/:responseId',
  can('forms.viewResponses'),
  asyncHandler(async (req, res) => {
    const response = await getResponseDetail(Number(req.params.responseId));
    if (req.scope?.dataScope === 'own') {
      const form = await getForm(Number(req.params.id));
      const isOwner = form.OwnerUserID === req.user!.userId;
      if (!isOwner && response.RespondentUserID !== req.user!.userId) {
        throw new ForbiddenError('You can only view your own responses');
      }
    }
    res.json(response);
  })
);

// GDPR right-to-erasure request (FR-01.25).
router.post(
  '/:id/responses/:responseId/erasure',
  can('forms.viewResponses'),
  asyncHandler(async (req, res) => {
    const response = await getResponseDetail(Number(req.params.responseId));
    if (req.scope?.dataScope === 'own' && response.RespondentUserID !== req.user!.userId) {
      throw new ForbiddenError('You can only request erasure for your own responses');
    }
    await requestErasure(response.ResponseID, {
      requestedBy: req.user!.userId,
      email: req.user!.email ?? undefined,
    });
    await logAudit(req,{ userId: req.user!.userId, action: 'ERASURE_REQUESTED', entity: 'FormResponse', entityId: response.ResponseID });
    res.status(201).json({ ok: true });
  })
);

// Real-time report with filters (FR-01.18).
router.get(
  '/:id/report',
  can('forms.view'),
  asyncHandler(async (req, res) => {
    const form = await getForm(Number(req.params.id));
    await requireReportAccess(form.TemplateID, req.user!.userId, req.user!.role);
    const filters: ReportFilters = {
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      domain: req.query.domain as string | undefined,
      fieldKey: req.query.fieldKey as string | undefined,
      fieldValue: req.query.fieldValue as string | undefined,
    };
    const report = await getReport(form.TemplateID, filters);
    res.json(report);
  })
);

router.get(
  '/:id/dashboard',
  can('forms.customizeDashboard'),
  asyncHandler(async (req, res) => {
    const layout = await getDashboard(Number(req.params.id), req.user!.userId);
    res.json(layout);
  })
);

router.put(
  '/:id/dashboard',
  can('forms.customizeDashboard'),
  validate(z.object({ widgets: z.array(z.any()) })),
  asyncHandler(async (req, res) => {
    await saveDashboard(Number(req.params.id), req.user!.userId, req.body);
    res.json({ ok: true });
  })
);

router.get(
  '/:id/export',
  can('forms.export'),
  asyncHandler(async (req, res) => {
    const form = await getForm(Number(req.params.id));
    await requireReportAccess(form.TemplateID, req.user!.userId, req.user!.role);
    const format = (req.query.format as string) || 'excel';
    const filters: ReportFilters = {
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    };
    if (format === 'pdf') {
      const buf = await exportPdf(form.TemplateID, filters);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="form-${req.params.id}-report.pdf"`);
      return res.send(buf);
    }
    const buf = await exportExcel(form.TemplateID, filters);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="form-${req.params.id}-report.xlsx"`);
    return res.send(buf);
  })
);

// ---------------------------------------------------------------------------
// Save & resume (CX-04)
// ---------------------------------------------------------------------------
const draftSchema = z.object({
  answers: z.record(z.unknown()),
  resumeToken: z.string().min(1).optional(),
});

router.post(
  '/:id/drafts',
  can('forms.respond'),
  validate(draftSchema),
  asyncHandler(async (req, res) => {
    const result = await saveDraft({
      templateId: Number(req.params.id),
      respondentUserId: req.user!.userId,
      respondentEmail: req.user!.email ?? undefined,
      answers: req.body.answers,
      resumeToken: req.body.resumeToken,
    });
    await logAudit(req,{ userId: req.user!.userId, action: 'DRAFT_SAVED', entity: 'FormResponse', entityId: result.responseId });
    res.status(201).json(result);
  })
);

router.get(
  '/:id/my-draft',
  can('forms.respond'),
  asyncHandler(async (req, res) => {
    const draft = await getMyDraft(Number(req.params.id), req.user!.userId);
    res.json(draft);
  })
);

router.post(
  '/:id/resume-link',
  can('forms.respond'),
  validate(z.object({ responseId: z.number().int().positive() })),
  asyncHandler(async (req, res) => {
    const token = await issueResumeToken(req.body.responseId);
    res.status(201).json({ token });
  })
);

// Resume a partial draft from a saved token (public link / email resume).
router.get(
  '/resume/:token',
  can('forms.respond'),
  asyncHandler(async (req, res) => {
    const draft = await resumeFromToken(req.params.token);
    res.json(draft);
  })
);

// ---------------------------------------------------------------------------
// Response editing (OP-07) + revisions + scores
// ---------------------------------------------------------------------------
router.put(
  '/:id/responses/:responseId',
  can('forms.editResponses'),
  asyncHandler(async (req, res) => {
    const form = await getForm(Number(req.params.id));
    assertOwnerOrFull(req, form.OwnerUserID);
    const result = await editResponse({
      responseId: Number(req.params.responseId),
      editedBy: req.user!.userId,
      answers: req.body.answers,
      files: req.body.files,
    });
    res.json(result);
  })
);

router.get(
  '/:id/responses/:responseId/revisions',
  can('forms.viewResponses'),
  asyncHandler(async (req, res) => {
    const revisions = await listResponseRevisions(Number(req.params.responseId));
    res.json({ items: revisions });
  })
);

router.get(
  '/:id/responses/:responseId/scores',
  can('forms.viewResponses'),
  asyncHandler(async (req, res) => {
    const scores = await getResponseScores(Number(req.params.responseId));
    res.json(scores);
  })
);

// ---------------------------------------------------------------------------
// Anomaly detection (DR-13, OP-07)
// ---------------------------------------------------------------------------
router.get(
  '/:id/anomalies',
  can('forms.viewAnomalies'),
  asyncHandler(async (req, res) => {
    const items = await listAnomalies(Number(req.params.id));
    res.json({ items });
  })
);

router.put(
  '/:id/anomalies/:flagId',
  can('forms.manageAnomalies'),
  validate(z.object({ status: z.enum(['Pending', 'Acknowledged', 'Resolved']), resolution: z.string().max(500).optional() })),
  asyncHandler(async (req, res) => {
    await updateAnomalyFlag(Number(req.params.flagId), { ...req.body, userId: req.user!.userId });
    res.json({ ok: true });
  })
);

router.post(
  '/:id/anomalies/recompute',
  can('forms.manageAnomalies'),
  asyncHandler(async (req, res) => {
    const scanned = await recomputeAnomalies(Number(req.params.id));
    res.json({ ok: true, scanned });
  })
);

// ---------------------------------------------------------------------------
// Report access control (DR-10)
// ---------------------------------------------------------------------------
router.get(
  '/:id/report-access',
  can('forms.view'),
  asyncHandler(async (req, res) => {
    await requireReportAccess(Number(req.params.id), req.user!.userId, req.user!.role);
    const items = await listReportAccess(Number(req.params.id));
    res.json({ items });
  })
);

router.post(
  '/:id/report-access',
  can('forms.share'),
  validate(z.object({ userId: z.number().int().positive(), accessLevel: z.enum(['View', 'Export']) })),
  asyncHandler(async (req, res) => {
    const form = await getForm(Number(req.params.id));
    assertOwnerOrFull(req, form.OwnerUserID);
    await grantReportAccess(form.TemplateID, req.body.userId, req.body.accessLevel, req.user!.userId);
    res.status(201).json({ ok: true });
  })
);

router.delete(
  '/:id/report-access/:userId',
  can('forms.share'),
  asyncHandler(async (req, res) => {
    const form = await getForm(Number(req.params.id));
    assertOwnerOrFull(req, form.OwnerUserID);
    await revokeReportAccess(form.TemplateID, Number(req.params.userId), req.user!.userId);
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Report sharing (DR-05, DR-11)
// ---------------------------------------------------------------------------
const shareSchema = z.object({
  shareType: z.enum(['form', 'cross-report']),
  templateId: z.number().int().positive().optional(),
  crossReportId: z.number().int().positive().optional(),
  expiresAt: z.string().nullable().optional(),
  filters: z.object({ from: z.string().optional(), to: z.string().optional(), domain: z.string().optional() }).optional(),
});

router.post(
  '/:id/shares',
  can('forms.share'),
  validate(shareSchema),
  asyncHandler(async (req, res) => {
    const share = await createShare({ ...req.body, userId: req.user!.userId, role: req.user!.role });
    res.status(201).json(share);
  })
);

router.get(
  '/shares',
  can('forms.share'),
  asyncHandler(async (req, res) => {
    const templateId = req.query.templateId ? Number(req.query.templateId) : undefined;
    const items = await listShares(req.user!.userId, req.user!.role, Number.isFinite(templateId as number) ? templateId : undefined);
    res.json({ items });
  })
);

router.delete(
  '/shares/:shareId',
  can('forms.share'),
  asyncHandler(async (req, res) => {
    await revokeShare(Number(req.params.shareId), req.user!.userId);
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Cross-form reporting (REL-18..21)
// ---------------------------------------------------------------------------
const fieldMappingSchema = z.object({
  displayName: z.string().min(1),
  fieldKeys: z.record(z.string().min(1)),
});

const crossReportSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  templateIds: z.array(z.number().int().positive()).min(2),
  fieldMappings: z.array(fieldMappingSchema).min(1),
});

router.get(
  '/cross-reports',
  can('forms.crossReports'),
  asyncHandler(async (req, res) => {
    const items = await listCrossReports(req.user!.userId, req.user!.role);
    res.json({ items });
  })
);

router.post(
  '/cross-reports',
  can('forms.crossReports'),
  validate(crossReportSchema),
  asyncHandler(async (req, res) => {
    const id = await createCrossReport({ ...req.body, userId: req.user!.userId });
    res.status(201).json({ crossReportId: id });
  })
);

router.get(
  '/cross-reports/:crossReportId',
  can('forms.crossReports'),
  asyncHandler(async (req, res) => {
    const report = await getCrossReport(Number(req.params.crossReportId), req.user!.userId, req.user!.role);
    res.json(report);
  })
);

router.get(
  '/cross-reports/:crossReportId/report',
  can('forms.crossReports'),
  asyncHandler(async (req, res) => {
    const filters: ReportFilters = {
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    };
    const report = await getCrossReportReport(Number(req.params.crossReportId), filters, req.user!.userId, req.user!.role);
    res.json(report);
  })
);

router.put(
  '/cross-reports/:crossReportId',
  can('forms.crossReports'),
  validate(crossReportSchema.partial()),
  asyncHandler(async (req, res) => {
    await updateCrossReport(Number(req.params.crossReportId), { ...req.body, userId: req.user!.userId });
    res.json({ ok: true });
  })
);

router.delete(
  '/cross-reports/:crossReportId',
  can('forms.crossReports'),
  asyncHandler(async (req, res) => {
    await deleteCrossReport(Number(req.params.crossReportId), req.user!.userId);
    res.json({ ok: true });
  })
);

// Public share-link resolution (DR-11) is served from forms.module.ts
// (unauthenticated): DELETE path below to avoid auth guard.
export { router as responsesRouter };
