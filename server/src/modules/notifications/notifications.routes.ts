import { Router } from 'express';
import { z } from 'zod';
import sql from 'mssql';
import { asyncHandler } from '../../utils/http';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { writeAudit } from '../../db/audit';
import { getPool } from '../../db/pool';
import { ROLES } from '../../types';

const router = Router();

const configSchema = z.object({
  triggerEvent: z.enum(['NewReport', 'SurveyPublished', 'PriceGapAlert', 'SyncFailure']),
  channel: z.enum(['Email', 'SMS', 'WhatsApp']),
  roleId: z.coerce.number().int().positive(),
  enabled: z.boolean().optional(),
});

/** List notification delivery history (Administrator). */
router.get(
  '/',
  requireAuth,
  requireRole(ROLES.ADMINISTRATOR, ROLES.MARKETING_MANAGER),
  validate({
    query: z.object({
      status: z.string().optional(),
      page: z.coerce.number().int().positive().optional(),
      pageSize: z.coerce.number().int().positive().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const pool = await getPool();
    const page = Number(req.query.page ?? 1);
    const pageSize = Math.min(100, Number(req.query.pageSize ?? 50));
    const offset = (page - 1) * pageSize;
    const request = pool.request();
    let where = 'WHERE 1=1';
    if (req.query.status) {
      where += ' AND n.Status = @status';
      request.input('status', sql.VarChar(20), String(req.query.status));
    }
    const countResult = await request.query(`SELECT COUNT(*) AS Total FROM dbo.Notification n ${where}`);
    const rows = await pool.request().query(`
      SELECT n.NotificationID, n.TriggerEvent, n.Channel, n.RecipientUserID, u.Name AS RecipientName,
             u.Email AS RecipientEmail, n.Subject, n.Payload, n.Status, n.Attempts,
             n.ProviderMessage, n.SentAt, n.CreatedAt
      FROM dbo.Notification n
      JOIN dbo.[User] u ON u.UserID = n.RecipientUserID
      ${where}
      ORDER BY n.CreatedAt DESC
      OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY
    `);
    res.json({ total: Number(countResult.recordset[0].Total), page, pageSize, items: rows.recordset });
  }),
);

/** Configure which roles receive which notification event types and on which channel. */
router.post(
  '/config',
  requireAuth,
  requireRole(ROLES.ADMINISTRATOR),
  validate({ body: configSchema }),
  asyncHandler(async (req, res) => {
    const pool = await getPool();
    await pool
      .request()
      .input('event', sql.VarChar(100), req.body.triggerEvent)
      .input('channel', sql.VarChar(20), req.body.channel)
      .input('roleId', sql.Int, req.body.roleId)
      .input('enabled', sql.Bit, req.body.enabled ?? true)
      .query(`
        IF EXISTS (SELECT 1 FROM dbo.NotificationConfig WHERE TriggerEvent = @event AND Channel = @channel AND RoleID = @roleId)
          UPDATE dbo.NotificationConfig SET Enabled = @enabled, UpdatedAt = SYSUTCDATETIME()
            WHERE TriggerEvent = @event AND Channel = @channel AND RoleID = @roleId
        ELSE
          INSERT INTO dbo.NotificationConfig (TriggerEvent, Channel, RoleID, Enabled)
          VALUES (@event, @channel, @roleId, @enabled)
      `);
    await writeAudit({
      userId: req.user!.userId,
      action: 'UPDATE_NOTIFICATION_CONFIG',
      entity: 'NotificationConfig',
      detail: `${req.body.triggerEvent}/${req.body.channel}/role=${req.body.roleId}`,
    });
    res.json({ message: 'Notification configuration updated' });
  }),
);

/** List current notification configuration. */
router.get(
  '/config',
  requireAuth,
  requireRole(ROLES.ADMINISTRATOR, ROLES.MARKETING_MANAGER),
  asyncHandler(async (_req, res) => {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT c.ConfigID, c.TriggerEvent, c.Channel, c.Enabled, c.RoleID, r.RoleName
      FROM dbo.NotificationConfig c
      JOIN dbo.Role r ON r.RoleID = c.RoleID
      ORDER BY c.TriggerEvent, c.Channel
    `);
    res.json(result.recordset);
  }),
);

export default router;
