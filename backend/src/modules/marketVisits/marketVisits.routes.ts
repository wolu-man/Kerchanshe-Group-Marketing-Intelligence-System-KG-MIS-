import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { can } from '../../middleware/permission';
import { validate } from '../../middleware/validate';
import { asyncHandler, parsePagination } from '../../utils/http';
import { audit } from '../../db/audit';
import { ForbiddenError } from '../../utils/errors';
import { formUpload } from '../forms/upload';
import {
  approveVisit,
  createVisit,
  getVisit,
  listVisits,
  rejectVisit,
  reviewVisit,
  submitVisit,
  updateVisit,
} from './marketVisits.service';
import { db } from '../../db/pool';

function logAudit(req: Request, entry: { userId: number | null; action: string; entity: string; entityId?: number | null; detail?: Record<string, unknown> | null }) {
  return audit({ ...entry, ipAddress: req.ip });
}

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  outletId: z.number().int().positive(),
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'visitDate must be YYYY-MM-DD'),
  notes: z.string().max(10000).optional().nullable(),
  businessGroupId: z.number().int().positive().optional().nullable(),
  visitType: z.string().max(50).optional().nullable(),
  stockLevelObserved: z.string().max(50).optional().nullable(),
  competitorPresenceNoted: z.string().max(500).optional().nullable(),
  keyFindings: z.string().max(10000).optional().nullable(),
  photoVideoRef: z.string().max(1000).optional().nullable(),
  followUpRequired: z.boolean().optional().nullable(),
  shopsVisited: z.number().int().min(0).max(10000).optional().nullable(),
});

const updateSchema = createSchema.partial();

function assertOwnOrFull(req: any, ownerId: number): void {
  // 'own' scope allows acting on your own records; 'all' scope allows any.
  if (req.scope?.dataScope === 'own' && ownerId !== req.user.userId) {
    throw new ForbiddenError('You can only modify your own records');
  }
}

router.get(
  '/',
  can('marketVisits.view'),
  asyncHandler(async (req, res) => {
    const q = req.query;
    const { page, pageSize } = parsePagination(req);
    const result = await listVisits(
      {
        outletId: q.outletId ? Number(q.outletId) : undefined,
        regionId: q.regionId ? Number(q.regionId) : undefined,
        status: q.status as string | undefined,
        fromDate: q.fromDate as string | undefined,
        toDate: q.toDate as string | undefined,
        businessGroupId: q.businessGroupId ? Number(q.businessGroupId) : undefined,
        dataScope: req.scope!.dataScope,
        page,
        pageSize,
      },
      req.user!.userId
    );
    res.json(result);
  })
);

router.get(
  '/:id',
  can('marketVisits.view'),
  asyncHandler(async (req, res) => {
    const report = await getVisit(Number(req.params.id));
    assertOwnOrFull(req, report.UserID);
    res.json(report);
  })
);

router.post(
  '/',
  can('marketVisits.create'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const reportId = await createVisit({ userId: req.user!.userId, ...req.body });
    await logAudit(req,{ userId: req.user!.userId, action: 'CREATE', entity: 'MarketVisitReport', entityId: reportId });
    res.status(201).json({ reportId });
  })
);

router.put(
  '/:id',
  can('marketVisits.update'),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const report = await getVisit(Number(req.params.id));
    assertOwnOrFull(req, report.UserID);
    await updateVisit(Number(req.params.id), req.body);
    await logAudit(req,{ userId: req.user!.userId, action: 'UPDATE', entity: 'MarketVisitReport', entityId: report.ReportID });
    res.json({ ok: true });
  })
);

router.post(
  '/:id/submit',
  can('marketVisits.submit'),
  asyncHandler(async (req, res) => {
    const report = await getVisit(Number(req.params.id));
    assertOwnOrFull(req, report.UserID);
    await submitVisit(report.ReportID);
    await logAudit(req,{ userId: req.user!.userId, action: 'SUBMIT', entity: 'MarketVisitReport', entityId: report.ReportID });
    res.json({ ok: true });
  })
);

router.post(
  '/:id/review',
  can('marketVisits.review'),
  asyncHandler(async (req, res) => {
    const reportId = Number(req.params.id);
    await reviewVisit(reportId, req.user!.userId);
    await logAudit(req,{ userId: req.user!.userId, action: 'REVIEW', entity: 'MarketVisitReport', entityId: reportId });
    res.json({ ok: true });
  })
);

router.post(
  '/:id/approve',
  can('marketVisits.approve'),
  asyncHandler(async (req, res) => {
    const reportId = Number(req.params.id);
    await approveVisit(reportId, req.user!.userId);
    await logAudit(req,{ userId: req.user!.userId, action: 'APPROVE', entity: 'MarketVisitReport', entityId: reportId });
    res.json({ ok: true });
  })
);

router.post(
  '/:id/reject',
  can('marketVisits.reject'),
  validate(z.object({ reason: z.string().min(1, 'Rejection reason is required') })),
  asyncHandler(async (req, res) => {
    const reportId = Number(req.params.id);
    await rejectVisit(reportId, req.user!.userId, req.body.reason);
    await logAudit(req,{ userId: req.user!.userId, action: 'REJECT', entity: 'MarketVisitReport', entityId: reportId, detail: { reason: req.body.reason } });
    res.json({ ok: true });
  })
);

// Helper reference endpoint: outlets (with region) for form selects.
router.get(
  '/meta/outlets',
  asyncHandler(async (_req, res) => {
    const result = await db.request().query(
      `SELECT o.OutletID, o.OutletName, o.City, o.RegionID, r.RegionName
       FROM dbo.Outlet o JOIN dbo.Region r ON r.RegionID = o.RegionID
       WHERE o.IsActive = 1 ORDER BY o.OutletName`
    );
    res.json({ items: result.recordset });
  })
);

router.post(
  '/:id/photo',
  can('marketVisits.update'),
  formUpload.single('file'),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) { res.status(400).json({ error: 'No file uploaded' }); return; }
    const reportId = Number(req.params.id);
    const report = await getVisit(reportId);
    assertOwnOrFull(req, report.UserID);
    const storageUrl = `/uploads/${file.filename}`;
    await updateVisit(reportId, { photoVideoRef: storageUrl } as any);
    await logAudit(req,{ userId: req.user!.userId, action: 'UPDATE', entity: 'MarketVisitReport', entityId: reportId, detail: { field: 'PhotoVideoRef', value: storageUrl } });
    res.status(201).json({ storageUrl });
  })
);

export { router as marketVisitsRouter };
