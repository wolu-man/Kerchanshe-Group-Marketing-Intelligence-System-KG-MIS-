import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { can } from '../../middleware/permission';
import { validate } from '../../middleware/validate';
import { asyncHandler, parsePagination } from '../../utils/http';
import { audit } from '../../db/audit';
import {
  listCompetitors,
  getCompetitor,
  createCompetitor,
  updateCompetitor,
  deactivateCompetitor,
  listCompetitorProducts,
  getCompetitorProduct,
  listCompetitorProductCategories,
  createCompetitorProduct,
  updateCompetitorProduct,
  deleteCompetitorProduct,
  linkCompetitorProducts,
} from './competitors.service';

function logAudit(req: Request, entry: { userId: number | null; action: string; entity: string; entityId?: number | null; detail?: Record<string, unknown> | null }) {
  return audit({ ...entry, ipAddress: req.ip });
}

const router = Router();
router.use(requireAuth);

const schema = z.object({
  name: z.string().trim().min(1).max(150),
  productsCovered: z.string().max(10000).optional().nullable(),
  regionsActiveIn: z.string().max(10000).optional().nullable(),
  notes: z.string().max(10000).optional().nullable(),
  businessGroupId: z.number().int().positive().optional().nullable(),
});

const productSchema = z.object({
  competitorId: z.number().int().positive(),
  ourProductId: z.number().int().positive().optional().nullable(),
  productName: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(100),
  price: z.number().positive(),
  priceMax: z.number().positive().optional().nullable(),
  effectiveDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
    .optional()
    .nullable(),
  status: z.enum(['Active', 'Inactive', 'Expired']).optional(),
  notes: z.string().max(1000).optional().nullable(),
  specifications: z.record(z.unknown()).optional().nullable(),
});

const productSchemaFull = productSchema.superRefine((val, ctx) => {
  if (val.priceMax != null && val.priceMax < val.price) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['priceMax'],
      message: 'Price max must be greater than or equal to price',
    });
  }
});

// ---------------------------------------------------------------------------
// Competitor product master rows — routes must precede the /:id entity routes
// ---------------------------------------------------------------------------

router.get(
  '/products/categories',
  can('competitors.view'),
  asyncHandler(async (_req, res) => {
    res.json({ items: await listCompetitorProductCategories() });
  })
);

router.get(
  '/products',
  can('competitors.view'),
  asyncHandler(async (req, res) => {
    const pagination = parsePagination(req);
    const competitorId = req.query.competitorId ? Number(req.query.competitorId) : undefined;
    const ourProductId = req.query.ourProductId ? Number(req.query.ourProductId) : undefined;
    const result = await listCompetitorProducts({
      search: typeof req.query.search === 'string' && req.query.search.trim() ? req.query.search.trim() : undefined,
      competitorId: competitorId && competitorId > 0 ? competitorId : undefined,
      category: typeof req.query.category === 'string' && req.query.category ? req.query.category : undefined,
      status: typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined,
      ourProductId: ourProductId && ourProductId > 0 ? ourProductId : undefined,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });
    res.json(result);
  })
);

router.get(
  '/products/:id',
  can('competitors.view'),
  asyncHandler(async (req, res) => {
    res.json(await getCompetitorProduct(Number(req.params.id)));
  })
);

router.post(
  '/products',
  can('competitors.manage'),
  validate(productSchemaFull),
  asyncHandler(async (req, res) => {
    const result = await createCompetitorProduct(req.body);
    await logAudit(req, {
      userId: req.user!.userId,
      action: 'CREATE',
      entity: 'CompetitorProduct',
      entityId: result.competitorProductId,
      detail: { productName: req.body.productName, competitorId: req.body.competitorId, price: req.body.price, status: req.body.status ?? 'Active' },
    });
    res.status(201).json(result);
  })
);

const linkSchema = z.object({
  competitorProductIds: z.array(z.number().int().positive()).min(1).max(100),
  ourProductId: z.number().int().positive().nullable(),
});

// Bulk link/unlink — must precede the /products/:id routes (literal beats :id).
router.put(
  '/products/link',
  can('competitors.manage'),
  validate(linkSchema),
  asyncHandler(async (req, res) => {
    const { competitorProductIds, ourProductId } = req.body as z.infer<typeof linkSchema>;
    const result = await linkCompetitorProducts(competitorProductIds, ourProductId ?? null);
    await logAudit(req, {
      userId: req.user!.userId,
      action: 'UPDATE',
      entity: 'CompetitorProduct',
      detail: { bulk: true, count: result.updated, ourProductId: ourProductId ?? null, ids: competitorProductIds },
    });
    res.json(result);
  })
);

router.put(
  '/products/:id',
  can('competitors.manage'),
  validate(productSchemaFull),
  asyncHandler(async (req, res) => {
    const result = await updateCompetitorProduct(Number(req.params.id), req.body);
    await logAudit(req, {
      userId: req.user!.userId,
      action: 'UPDATE',
      entity: 'CompetitorProduct',
      entityId: result.competitorProductId,
      detail: { productName: req.body.productName, competitorId: req.body.competitorId, price: req.body.price, status: req.body.status ?? 'Active' },
    });
    res.json(result);
  })
);

router.delete(
  '/products/:id',
  can('competitors.manage'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await deleteCompetitorProduct(id);
    await logAudit(req, { userId: req.user!.userId, action: 'DELETE', entity: 'CompetitorProduct', entityId: id });
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Competitor entity
// ---------------------------------------------------------------------------

router.get(
  '/',
  can('competitors.view'),
  asyncHandler(async (req, res) => {
    const items = await listCompetitors({
      search: typeof req.query.search === 'string' && req.query.search.trim() ? req.query.search.trim() : undefined,
      includeInactive: req.query.includeInactive === '1' || req.query.includeInactive === 'true',
    });
    res.json({ items });
  })
);

router.post(
  '/',
  can('competitors.manage'),
  validate(schema),
  asyncHandler(async (req, res) => {
    const { competitorId, reactivated } = await createCompetitor(req.body);
    await logAudit(req, {
      userId: req.user!.userId,
      action: reactivated ? 'REACTIVATE' : 'CREATE',
      entity: 'Competitor',
      entityId: competitorId,
      detail: { name: req.body.name },
    });
    res.status(201).json({ competitorId });
  })
);

router.get(
  '/:id',
  can('competitors.view'),
  asyncHandler(async (req, res) => {
    res.json((await getCompetitor(Number(req.params.id))) ?? null);
  })
);

router.put(
  '/:id',
  can('competitors.manage'),
  validate(schema.partial()),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await updateCompetitor(id, req.body);
    await logAudit(req, { userId: req.user!.userId, action: 'UPDATE', entity: 'Competitor', entityId: id, detail: { name: req.body.name } });
    res.json({ ok: true });
  })
);

router.delete(
  '/:id',
  can('competitors.manage'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await deactivateCompetitor(id);
    await logAudit(req, { userId: req.user!.userId, action: 'DELETE', entity: 'Competitor', entityId: id });
    res.json({ ok: true });
  })
);

export { router as competitorsRouter };
