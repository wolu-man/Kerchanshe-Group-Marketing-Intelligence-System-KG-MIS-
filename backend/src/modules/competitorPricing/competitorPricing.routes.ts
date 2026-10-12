import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import sql from 'mssql';
import { requireAuth } from '../../middleware/auth';
import { can } from '../../middleware/permission';
import { validate } from '../../middleware/validate';
import { asyncHandler, parsePagination } from '../../utils/http';
import { audit } from '../../db/audit';
import { db } from '../../db/pool';
import { recordPrice, listPrices, getPrice, comparePrice, getThresholds, configureThreshold, deleteThreshold, listAlerts, resolveAlert, dismissAlert } from './competitorPricing.service';

function logAudit(req: Request, entry: { userId: number | null; action: string; entity: string; entityId?: number | null; detail?: Record<string, unknown> | null }) {
  return audit({ ...entry, ipAddress: req.ip });
}

const router = Router();
router.use(requireAuth);

const recordSchema = z.object({
  productId: z.number().int().positive(),
  competitorName: z.string().min(1).max(150),
  price: z.number().positive(),
  regionId: z.number().int().positive(),
  outletId: z.number().int().positive().optional().nullable(),
  recordedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  competitorId: z.number().int().positive().optional().nullable(),
  availability: z.string().max(50).optional().nullable(),
  promotionObserved: z.string().max(500).optional().nullable(),
  qualityObservation: z.string().max(500).optional().nullable(),
  photoVideoRef: z.string().max(1000).optional().nullable(),
  customerTypeId: z.number().int().positive().optional().nullable(),
});

const thresholdSchema = z.object({
  category: z.string().min(1).max(100),
  thresholdPercent: z.number().positive(),
});

// POST / — record a new price
router.post(
  '/',
  can('pricing.record'),
  validate(recordSchema),
  asyncHandler(async (req, res) => {
    const result = await recordPrice({ recordedBy: req.user!.userId, ...req.body });
    await logAudit(req,{ userId: req.user!.userId, action: 'PRICE_RECORDED', entity: 'CompetitorPrice', entityId: result.priceId, detail: { gapPercent: result.gapPercent, alertCreated: result.alertCreated } });
    res.status(201).json(result);
  })
);

// GET / — list price records
router.get(
  '/',
  can('pricing.view'),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = parsePagination(req);
    const result = await listPrices({
      dataScope: req.scope!.dataScope,
      userId: req.user!.userId,
      productId: req.query.productId ? Number(req.query.productId) : undefined,
      regionId: req.query.regionId ? Number(req.query.regionId) : undefined,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
      page,
      pageSize,
    });
    res.json(result);
  })
);

// GET /compare/:productId — compare prices
router.get(
  '/compare/:productId',
  can('pricing.view'),
  asyncHandler(async (req, res) => {
    const result = await comparePrice(Number(req.params.productId), req.query.regionId ? Number(req.query.regionId) : undefined);
    res.json(result);
  })
);

// GET /thresholds — list thresholds
router.get(
  '/thresholds',
  can('pricing.view'),
  asyncHandler(async (_req, res) => {
    const items = await getThresholds();
    res.json({ items });
  })
);

// PUT /thresholds — upsert threshold
router.put(
  '/thresholds',
  can('pricing.configureThresholds'),
  validate(thresholdSchema),
  asyncHandler(async (req, res) => {
    await configureThreshold(req.body.category, req.body.thresholdPercent);
    await logAudit(req,{ userId: req.user!.userId, action: 'PRICE_THRESHOLD_CONFIGURED', entity: 'PriceGapThreshold', detail: req.body });
    res.json({ ok: true });
  })
);

// DELETE /thresholds/:id — delete threshold
router.delete(
  '/thresholds/:id',
  can('pricing.configureThresholds'),
  asyncHandler(async (req, res) => {
    await deleteThreshold(Number(req.params.id));
    await logAudit(req,{ userId: req.user!.userId, action: 'PRICE_THRESHOLD_DELETED', entity: 'PriceGapThreshold', entityId: Number(req.params.id) });
    res.json({ ok: true });
  })
);

// GET /alerts — list alerts
router.get(
  '/alerts',
  can('pricing.view'),
  asyncHandler(async (req, res) => {
    const items = await listAlerts({ status: req.query.status as string | undefined });
    res.json({ items });
  })
);

// POST /alerts/:alertId/resolve
router.post(
  '/alerts/:alertId/resolve',
  can('pricing.view'),
  asyncHandler(async (req, res) => {
    await resolveAlert(Number(req.params.alertId));
    res.json({ ok: true });
  })
);

// POST /alerts/:alertId/dismiss
router.post(
  '/alerts/:alertId/dismiss',
  can('pricing.view'),
  asyncHandler(async (req, res) => {
    await dismissAlert(Number(req.params.alertId));
    res.json({ ok: true });
  })
);

// GET /:priceId — single price record (MUST be after all static GET routes)
router.get(
  '/:priceId',
  can('pricing.view'),
  asyncHandler(async (req, res) => {
    const result = await getPrice(Number(req.params.priceId));
    res.json(result);
  })
);

// PUT /:priceId — update price
router.put(
  '/:priceId',
  can('pricing.record'),
  validate(recordSchema),
  asyncHandler(async (req, res) => {
    const result = await recordPrice({ recordedBy: req.user!.userId, ...req.body, priceId: Number(req.params.priceId) });
    await logAudit(req,{ userId: req.user!.userId, action: 'PRICE_UPDATED', entity: 'CompetitorPrice', entityId: result.priceId, detail: { gapPercent: result.gapPercent, alertCreated: result.alertCreated } });
    res.status(200).json(result);
  })
);

// DELETE /:priceId — delete price + its alerts
router.delete(
  '/:priceId',
  can('pricing.record'),
  asyncHandler(async (req, res) => {
    const priceId = Number(req.params.priceId);
    await db.request().input('PriceId', sql.Int, priceId).query(
      `DELETE FROM dbo.PriceGapAlert WHERE PriceID = @PriceId`
    );
    await db.request().input('PriceId', sql.Int, priceId).query(
      `DELETE FROM dbo.CompetitorPrice WHERE PriceID = @PriceId`
    );
    await logAudit(req,{ userId: req.user!.userId, action: 'PRICE_DELETED', entity: 'CompetitorPrice', entityId: priceId });
    res.json({ ok: true });
  })
);

export { router as competitorPricingRouter };
