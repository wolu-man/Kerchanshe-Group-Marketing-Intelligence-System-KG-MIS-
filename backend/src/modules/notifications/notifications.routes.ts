import { Router } from 'express';
import type { Request } from 'express';
import sql from 'mssql';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { can } from '../../middleware/permission';
import { validate } from '../../middleware/validate';
import { asyncHandler, parsePagination } from '../../utils/http';
import { db } from '../../db/pool';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { isSupportedChannel } from '../../integrations/email';
import { audit } from '../../db/audit';
import { EVENT_TYPES } from '../../security/eventTypes';

function logAudit(req: Request, entry: { userId: number | null; action: string; entity: string; entityId?: number | null; detail?: Record<string, unknown> | null }) {
  return audit({ ...entry, ipAddress: req.ip });
}

const router = Router();
router.use(requireAuth);

// ---------------------------------------------------------------------------
// Named routes (MUST come before /:id to avoid param capture)
// ---------------------------------------------------------------------------

// GET /api/v1/notifications/unread-count - lightweight count for bell badge
router.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const result = await db
      .request()
      .input('UserId', sql.Int, req.user!.userId)
      .query(
        `SELECT COUNT(*) AS Count FROM dbo.Notification
         WHERE RecipientUserID = @UserId AND IsRead = 0`
      );
    res.json({ count: result.recordset[0].Count });
  })
);

// GET /api/v1/notifications/mine - current user's notifications
// Supports ?unread=1 to filter unread only, and ?event= to filter by event type.
router.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const { page, pageSize } = parsePagination(req);
    const where = ['n.RecipientUserID = @UserId'];
    const request = db.request().input('UserId', sql.Int, req.user!.userId);

    if (req.query.unread === '1') {
      where.push('n.IsRead = 0');
    }
    if (req.query.event && typeof req.query.event === 'string') {
      where.push('n.TriggerEvent = @Event');
      request.input('Event', sql.VarChar(100), req.query.event);
    }

    const whereClause = `WHERE ${where.join(' AND ')}`;

    const countResult = await request.query(
      `SELECT COUNT(*) AS Total FROM dbo.Notification n ${whereClause}`
    );

    const result = await db
      .request()
      .input('UserId', sql.Int, req.user!.userId)
      .input('Offset', sql.Int, (page - 1) * pageSize)
      .input('Limit', sql.Int, pageSize)
      .query(
        `SELECT n.NotificationID, n.TriggerEvent, n.Channel, n.Subject, n.Status,
                n.Attempts, n.SentAt, n.CreatedAt, n.IsRead, n.ReadAt
         FROM dbo.Notification n
         ${whereClause}
         ORDER BY n.CreatedAt DESC
         OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY`
      );
    res.json({
      items: result.recordset,
      total: countResult.recordset[0].Total,
      page,
      pageSize,
    });
  })
);

// PATCH /api/v1/notifications/read-all - mark all current user's as read
router.patch(
  '/read-all',
  asyncHandler(async (req, res) => {
    const result = await db
      .request()
      .input('UserId', sql.Int, req.user!.userId)
      .query(
        `UPDATE dbo.Notification
         SET IsRead = 1, ReadAt = SYSUTCDATETIME()
         WHERE RecipientUserID = @UserId AND IsRead = 0`
      );
    res.json({ ok: true, updated: result.rowsAffected[0] });
  })
);

// GET /api/v1/notifications - admin delivery history (Security Matrix 3.7)
// Must come before /:id.
router.get(
  '/',
  can('admin.viewNotifications'),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = parsePagination(req);
    const where: string[] = [];
    const request = db.request();

    if (req.scope?.dataScope === 'own') {
      where.push('n.RecipientUserID = @UserId');
      request.input('UserId', sql.Int, req.user!.userId);
    } else if (req.scope?.dataScope === 'region') {
      where.push(
        `(n.RecipientUserID IN (
           SELECT ura.UserID FROM dbo.UserRegionAssignment ura
           WHERE ura.RegionID IN (
             SELECT RegionID FROM dbo.UserRegionAssignment WHERE UserID = @UserId
           )
         ) OR n.RecipientUserID = @UserId)`
      );
      request.input('UserId', sql.Int, req.user!.userId);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await request.query(
      `SELECT COUNT(*) AS Total FROM dbo.Notification n ${whereClause}`
    );

    const result = await db
      .request()
      .input('Offset', sql.Int, (page - 1) * pageSize)
      .input('Limit', sql.Int, pageSize)
      .query(
        `SELECT n.NotificationID, n.TriggerEvent, n.Channel, n.Subject, n.Status,
                n.Attempts, n.SentAt, n.CreatedAt, n.IsRead, n.ReadAt,
                u.Name AS RecipientName
         FROM dbo.Notification n
         JOIN dbo.[User] u ON u.UserID = n.RecipientUserID
         ${whereClause}
         ORDER BY n.CreatedAt DESC
         OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY`
      );
    res.json({ items: result.recordset, total: countResult.recordset[0].Total, page, pageSize });
  })
);

const configSchema = z.object({
  triggerEvent: z.string().min(1).max(100),
  channel: z.string().refine(isSupportedChannel, { message: 'Channel must be Email' }),
  roleId: z.number().int().positive(),
  enabled: z.boolean(),
});

// POST /api/v1/notifications/config - configure role/event/channel rules (Admin)
router.post(
  '/config',
  can('admin.notificationConfig'),
  validate(configSchema),
  asyncHandler(async (req, res) => {
    const { triggerEvent, channel, roleId, enabled } = req.body;
    if (!EVENT_TYPES.has(triggerEvent)) {
      throw new BadRequestError('Unknown trigger event', 'UNKNOWN_EVENT');
    }
    await db
      .request()
      .input('Event', sql.VarChar(100), triggerEvent)
      .input('Channel', sql.VarChar(20), channel)
      .input('RoleId', sql.Int, roleId)
      .input('Enabled', sql.Bit, enabled)
      .query(
        `MERGE dbo.NotificationConfig AS t
         USING (SELECT @Event AS TriggerEvent, @Channel AS Channel, @RoleId AS RoleID) AS s
           ON t.TriggerEvent = s.TriggerEvent AND t.Channel = s.Channel AND t.RoleID = s.RoleID
         WHEN MATCHED THEN UPDATE SET t.Enabled = @Enabled, t.UpdatedAt = SYSUTCDATETIME()
         WHEN NOT MATCHED THEN INSERT (TriggerEvent, Channel, RoleID, Enabled)
           VALUES (@Event, @Channel, @RoleId, @Enabled);`
      );
    await logAudit(req,{
      userId: req.user!.userId,
      action: 'NOTIFICATION_CONFIG_CHANGED',
      entity: 'NotificationConfig',
      detail: { triggerEvent, channel, roleId, enabled },
    });
    res.status(201).json({ ok: true });
  })
);

// GET /api/v1/notifications/config - list current rules (Admin)
// MUST come before /:id.
router.get(
  '/config',
  can('admin.notificationConfig'),
  asyncHandler(async (_req, res) => {
    const result = await db.request().query(
      `SELECT c.ConfigID, c.TriggerEvent, c.Channel, c.Enabled, c.RoleID, r.RoleName
       FROM dbo.NotificationConfig c
       JOIN dbo.Role r ON r.RoleID = c.RoleID
       ORDER BY c.TriggerEvent, c.Channel`
    );
    res.json({ items: result.recordset });
  })
);

// ---------------------------------------------------------------------------
// Parameterized routes (AFTER all named routes)
// ---------------------------------------------------------------------------

// GET /api/v1/notifications/:id - single notification detail (owner only)
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) {
      throw new BadRequestError('Invalid notification ID', 'INVALID_ID');
    }
    const result = await db
      .request()
      .input('Id', sql.Int, id)
      .input('UserId', sql.Int, req.user!.userId)
      .query(
        `SELECT n.NotificationID, n.TriggerEvent, n.Channel, n.Subject, n.Body,
                n.Payload, n.Status, n.Attempts, n.SentAt, n.CreatedAt,
                n.IsRead, n.ReadAt
         FROM dbo.Notification n
         WHERE n.NotificationID = @Id AND n.RecipientUserID = @UserId`
      );
    if (result.recordset.length === 0) {
      throw new NotFoundError('Notification not found');
    }
    res.json(result.recordset[0]);
  })
);

// PATCH /api/v1/notifications/:id/read - mark a single notification as read
// Returns 404 if notification doesn't exist or isn't owned by the user.
router.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) {
      throw new BadRequestError('Invalid notification ID', 'INVALID_ID');
    }
    const result = await db
      .request()
      .input('Id', sql.Int, id)
      .input('UserId', sql.Int, req.user!.userId)
      .query(
        `UPDATE dbo.Notification
         SET IsRead = 1, ReadAt = SYSUTCDATETIME()
         WHERE NotificationID = @Id AND RecipientUserID = @UserId`
      );
    if (result.rowsAffected[0] === 0) {
      throw new NotFoundError('Notification not found');
    }
    res.json({ ok: true });
  })
);

export { router as notificationsRouter };
