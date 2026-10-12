import { Router } from 'express';
import type { Request } from 'express';
import { requireAuth } from '../../middleware/auth';
import { can } from '../../middleware/permission';
import { asyncHandler } from '../../utils/http';
import { audit } from '../../db/audit';
import { executeSync, listSyncLogs } from './sync.service';

function logAudit(req: Request, entry: { userId: number | null; action: string; entity: string; entityId?: number | null; detail?: Record<string, unknown> | null }) {
  return audit({ ...entry, ipAddress: req.ip });
}

const router = Router();
router.use(requireAuth);

router.post(
  '/',
  can('sync.trigger'),
  asyncHandler(async (req, res) => {
    const result = await executeSync(req.user!.userId);
    await logAudit(req,{ userId: req.user!.userId, action: 'SYNC_TRIGGERED', entity: 'SyncLog', detail: result as unknown as Record<string, unknown> });
    res.json(result);
  })
);

router.get(
  '/logs',
  can('sync.viewLogs'),
  asyncHandler(async (req, res) => {
    const items = await listSyncLogs(req.query.limit ? Number(req.query.limit) : 50);
    res.json({ items });
  })
);

export { router as syncRouter };
