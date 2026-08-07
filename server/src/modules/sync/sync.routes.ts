import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/http';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { writeAudit } from '../../db/audit';
import { ROLES } from '../../types';
import { listSyncLogs, runFullSync, runSyncForEntity } from './sync.service';

const router = Router();

/** Trigger an on-demand D365FO synchronization (Administrator only). */
router.post(
  '/d365fo',
  requireAuth,
  requireRole(ROLES.ADMINISTRATOR),
  validate({
    body: z.object({
      entity: z.enum(['Product', 'Customer', 'Sales', 'All']).default('All'),
    }),
  }),
  asyncHandler(async (req, res) => {
    const entity = req.body.entity as 'Product' | 'Customer' | 'Sales' | 'All';
    await writeAudit({
      userId: req.user!.userId,
      action: 'TRIGGER_SYNC',
      entity: 'SyncLog',
      detail: `entity=${entity}`,
    });

    if (entity === 'All') {
      const results = await runFullSync(req.user!.userId);
      res.json({ message: 'Sync completed', results });
      return;
    }
    await runSyncForEntity(entity, req.user!.userId);
    res.json({ message: `Sync for ${entity} completed` });
  }),
);

/** List sync run history and status. */
router.get(
  '/logs',
  requireAuth,
  requireRole(ROLES.ADMINISTRATOR, ROLES.MARKETING_MANAGER),
  validate({
    query: z.object({
      page: z.coerce.number().int().positive().optional(),
      pageSize: z.coerce.number().int().positive().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    res.json(await listSyncLogs(req.query.page ? Number(req.query.page) : 1, req.query.pageSize ? Number(req.query.pageSize) : 50));
  }),
);

export default router;
