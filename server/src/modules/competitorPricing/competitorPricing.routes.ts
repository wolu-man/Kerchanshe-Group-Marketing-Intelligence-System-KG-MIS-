import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/http';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { writeAudit } from '../../db/audit';
import { ROLES } from '../../types';
import {
  comparePrices,
  createCompetitorPrice,
  listCompetitorPrices,
  listPriceAlerts,
} from './competitorPricing.service';

const router = Router();

const listQuerySchema = z.object({
  productId: z.coerce.number().int().positive().optional(),
  regionId: z.coerce.number().int().positive().optional(),
  competitor: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

const createBodySchema = z.object({
  productId: z.coerce.number().int().positive(),
  competitorName: z.string().min(1).max(150),
  price: z.coerce.number().positive(),
  regionId: z.coerce.number().int().positive(),
  outletId: z.coerce.number().int().positive().optional(),
  recordedDate: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date'),
});

const RECORDERS = [ROLES.FIELD_OFFICER, ROLES.MARKETING_MANAGER, ROLES.MARKETING_ANALYST, ROLES.ADMINISTRATOR];

/** List competitor price observations. */
router.get(
  '/',
  requireAuth,
  validate({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await listCompetitorPrices(req.query as never));
  }),
);

/** Record a competitor price observation (auto-calculates gap and flags alerts). */
router.post(
  '/',
  requireAuth,
  requireRole(...RECORDERS),
  validate({ body: createBodySchema }),
  asyncHandler(async (req, res) => {
    const result = await createCompetitorPrice(req.user!.userId, req.body);
    await writeAudit({
      userId: req.user!.userId,
      action: 'CREATE_COMPETITOR_PRICE',
      entity: 'CompetitorPrice',
      entityId: result.priceId,
      detail: `gapPercent=${result.gapPercent}, breached=${result.thresholdBreached}`,
    });
    res.status(201).json(result);
  }),
);

/** Own vs. competitor comparison. */
router.get(
  '/compare',
  requireAuth,
  requireRole(ROLES.MARKETING_ANALYST, ROLES.MARKETING_MANAGER, ROLES.ADMINISTRATOR),
  validate({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await comparePrices(req.query as never));
  }),
);

/** List active price-gap alerts. */
router.get(
  '/alerts',
  requireAuth,
  validate({
    query: z.object({
      status: z.string().optional(),
      productId: z.coerce.number().int().positive().optional(),
      regionId: z.coerce.number().int().positive().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    res.json(await listPriceAlerts(req.query as never));
  }),
);

export default router;
