import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/http';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { writeAudit } from '../../db/audit';
import { notifyEvent } from '../notifications/notifications.service';
import { ROLES } from '../../types';
import {
  createMarketVisit,
  getMarketVisit,
  listMarketVisits,
  submitMarketVisit,
  updateMarketVisit,
} from './marketVisits.service';

const router = Router();

const listQuerySchema = z.object({
  outletId: z.coerce.number().int().positive().optional(),
  regionId: z.coerce.number().int().positive().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

const createBodySchema = z.object({
  outletId: z.coerce.number().int().positive(),
  visitDate: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date'),
  notes: z.string().max(100000).optional(),
});

const updateBodySchema = createBodySchema.partial();

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

const WRITERS = [ROLES.FIELD_OFFICER, ROLES.MARKETING_MANAGER, ROLES.ADMINISTRATOR];

/** List market visit reports (filterable by outlet, region, date, status). */
router.get(
  '/',
  requireAuth,
  validate({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    const items = await listMarketVisits({ ...req.query } as never);
    res.json(items);
  }),
);

/** Create a new market visit report. */
router.post(
  '/',
  requireAuth,
  requireRole(...WRITERS),
  validate({ body: createBodySchema }),
  asyncHandler(async (req, res) => {
    const report = await createMarketVisit(req.user!.userId, req.body);
    await writeAudit({
      userId: req.user!.userId,
      action: 'CREATE_MARKET_VISIT',
      entity: 'MarketVisitReport',
      entityId: report.ReportID,
    });
    res.status(201).json(report);
  }),
);

/** Get a single report. */
router.get(
  '/:id',
  requireAuth,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await getMarketVisit(Number(req.params.id)));
  }),
);

/** Update a report (Draft status only). */
router.put(
  '/:id',
  requireAuth,
  requireRole(...WRITERS),
  validate({ params: idParamSchema, body: updateBodySchema }),
  asyncHandler(async (req, res) => {
    const report = await updateMarketVisit(Number(req.params.id), req.user!.userId, req.user!.role, req.body);
    await writeAudit({
      userId: req.user!.userId,
      action: 'UPDATE_MARKET_VISIT',
      entity: 'MarketVisitReport',
      entityId: report.ReportID,
    });
    res.json(report);
  }),
);

/** Change status from Draft to Submitted, notifying the Marketing Manager via CNS. */
router.post(
  '/:id/submit',
  requireAuth,
  requireRole(...WRITERS),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const report = await submitMarketVisit(Number(req.params.id), req.user!.userId, req.user!.role);
    await writeAudit({
      userId: req.user!.userId,
      action: 'SUBMIT_MARKET_VISIT',
      entity: 'MarketVisitReport',
      entityId: report.ReportID,
    });
    await notifyEvent('NewReport', {
      subject: `New market visit report submitted: ${report.OutletName}`,
      message: `A market visit report for ${report.OutletName} (${report.City}) was submitted on ${report.VisitDate}.`,
    });
    res.json(report);
  }),
);

export default router;
