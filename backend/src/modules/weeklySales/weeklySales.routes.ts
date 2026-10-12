import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import sql from 'mssql';
import { requireAuth } from '../../middleware/auth';
import { can } from '../../middleware/permission';
import { validate } from '../../middleware/validate';
import { asyncHandler, parsePagination } from '../../utils/http';
import { audit } from '../../db/audit';
import { ForbiddenError, NotFoundError } from '../../utils/errors';
import { db } from '../../db/pool';
import { createWeeklySale, deleteWeeklySale, getWeeklySale, listWeeklySales, updateWeeklySale } from './weeklySales.service';
import { logger } from '../../config/logger';

function logAudit(req: Request, entry: { userId: number | null; action: string; entity: string; entityId?: number | null; detail?: Record<string, unknown> | null }) {
  return audit({ ...entry, ipAddress: req.ip });
}

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  weekEnding: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'weekEnding must be YYYY-MM-DD'),
  businessGroupId: z.number().int().positive(),
  productId: z.number().int().positive(),
  regionId: z.number().int().positive(),
  outletId: z.number().int().positive(),
  customerId: z.number().int().positive().optional().nullable(),
  quantitySold: z.number().positive(),
  unitPrice: z.number().positive(),
  notes: z.string().max(10000).optional().nullable(),
  colorId: z.number().int().positive().optional().nullable(),
  productColor: z.string().max(100).optional().nullable(),
  productSize: z.string().max(50).optional().nullable(),
  productCategory: z.string().max(100).optional().nullable(),
  productSpecs: z.string().max(20000).optional().nullable(),
});

const updateSchema = createSchema.partial();

function assertOwnOrFull(req: any, ownerId: number): void {
  if (req.scope?.dataScope === 'own' && ownerId !== req.user.userId) {
    throw new ForbiddenError('You can only modify your own weekly sales entries');
  }
}

router.get(
  '/',
  can('weeklySales.view'),
  asyncHandler(async (req, res) => {
    const q = req.query;
    const { page, pageSize } = parsePagination(req);
    const result = await listWeeklySales({
      weekEnding: q.weekEnding as string | undefined,
      businessGroupId: q.businessGroupId ? Number(q.businessGroupId) : undefined,
      regionId: q.regionId ? Number(q.regionId) : undefined,
      outletId: q.outletId ? Number(q.outletId) : undefined,
      productId: q.productId ? Number(q.productId) : undefined,
      customerTypeId: q.customerTypeId ? Number(q.customerTypeId) : undefined,
      colorId: q.colorId ? Number(q.colorId) : undefined,
      status: q.status as string | undefined,
      dataScope: req.scope!.dataScope,
      userId: req.user!.userId,
      page,
      pageSize,
    });
    res.json(result);
  })
);

router.post(
  '/',
  can('weeklySales.create'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    logger.info('Creating weekly sale', { body: req.body, user: req.user?.userId });
    try {
      const id = await createWeeklySale({ submittedBy: req.user!.userId, ...req.body });
      await logAudit(req,{ userId: req.user!.userId, action: 'CREATE', entity: 'WeeklySales', entityId: id });
      logger.info('Weekly sale created', { id });
      res.status(201).json({ weeklySalesId: id });
    } catch (err) {
      logger.error('Failed to create weekly sale', { error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined, body: req.body });
      throw err;
    }
  })
);

router.get(
  '/:id',
  can('weeklySales.view'),
  asyncHandler(async (req, res) => {
    const row = await getWeeklySale(Number(req.params.id));
    assertOwnOrFull(req, row.SubmittedBy);
    res.json(row);
  })
);

router.put(
  '/:id',
  can('weeklySales.update'),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const row = await getWeeklySale(Number(req.params.id));
    assertOwnOrFull(req, row.SubmittedBy);
    await updateWeeklySale(Number(req.params.id), req.body);
    await logAudit(req,{ userId: req.user!.userId, action: 'UPDATE', entity: 'WeeklySales', entityId: Number(req.params.id) });
    res.json({ ok: true });
  })
);

router.delete(
  '/:id',
  can('weeklySales.delete'),
  asyncHandler(async (req, res) => {
    const rows = await db.request().input('Id', sql.Int, Number(req.params.id)).query('SELECT TOP 1 SubmittedBy FROM dbo.WeeklySales WHERE WeeklySalesID = @Id');
    if (rows.recordset.length) {
      assertOwnOrFull(req, rows.recordset[0].SubmittedBy);
    } else {
      throw new NotFoundError('Weekly sales entry not found');
    }
    await deleteWeeklySale(Number(req.params.id));
    await logAudit(req,{ userId: req.user!.userId, action: 'DELETE', entity: 'WeeklySales', entityId: Number(req.params.id) });
    res.json({ ok: true });
  })
);

export { router as weeklySalesRouter };