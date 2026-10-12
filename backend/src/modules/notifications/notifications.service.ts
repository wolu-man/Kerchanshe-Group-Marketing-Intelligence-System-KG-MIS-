import sql from 'mssql';
import { db } from '../../db/pool';
import { sendEmail } from '../../integrations/email';
import { renderNotification } from '../../notifications/templates';
import { logger } from '../../config/logger';

export interface DispatchOptions {
  event: string;
  subject: string;
  body: string;
  payload?: unknown;
  /** Direct recipients (e.g. a specific respondent). If omitted, recipients are
   *  all users whose role has an enabled config row for this event. */
  userIds?: number[];
}

interface ConfigRow {
  Channel: string;
  RoleID: number;
}

interface Recipient {
  userId: number;
  name: string;
  email: string | null;
  roleId: number;
}

const MAX_ATTEMPTS = 2; // initial + one retry (Integration Design 7)

async function getConfigRows(event: string): Promise<ConfigRow[]> {
  const result = await db
    .request()
    .input('Event', sql.VarChar(100), event)
    .query(
      `SELECT DISTINCT Channel, RoleID FROM dbo.NotificationConfig
       WHERE TriggerEvent = @Event AND Enabled = 1`
    );
  return result.recordset;
}

async function resolveRecipients(event: string, userIds?: number[]): Promise<Recipient[]> {
  if (userIds && userIds.length > 0) {
    const request = db.request();
    userIds.forEach((id, i) => request.input(`u${i}`, sql.Int, id));
    const placeholders = userIds.map((_, i) => `@u${i}`).join(',');
    const result = await request.query(
      `SELECT UserID AS userId, Name AS name, Email AS email, RoleID AS roleId FROM dbo.[User]
       WHERE IsActive = 1 AND UserID IN (${placeholders})`
    );
    return result.recordset;
  }

  const config = await getConfigRows(event);
  if (config.length === 0) return [];
  const roleIds = [...new Set(config.map((c) => c.RoleID))];
  const request = db.request();
  roleIds.forEach((id, i) => request.input(`r${i}`, sql.Int, id));
  const placeholders = roleIds.map((_, i) => `@r${i}`).join(',');
  const result = await request.query(
    `SELECT UserID AS userId, Name AS name, Email AS email, RoleID AS roleId FROM dbo.[User]
     WHERE IsActive = 1 AND RoleID IN (${placeholders})`
  );
  return result.recordset;
}

function recipientEmail(user: Recipient): string {
  return user.email ?? `${user.name} <no-email>`;
}

async function deliver(
  notificationId: number,
  user: Recipient,
  event: string,
  subject: string | null,
  _body: string,
  payload: Record<string, unknown> | null,
): Promise<void> {
  const to = recipientEmail(user);
  const rendered = renderNotification(event, payload ?? {}, user.name);
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await sendEmail(to, subject ?? '', rendered.html, rendered.text);
    if (result.success) {
      await db
        .request()
        .input('Id', sql.Int, notificationId)
        .input('Status', sql.VarChar(20), attempt > 1 ? 'Retried' : 'Sent')
        .input('Msg', sql.NVarChar(sql.MAX), result.providerMessage)
        .input('SentAt', sql.DateTime2, new Date())
        .query(
          `UPDATE dbo.Notification SET Status = @Status, ProviderMessage = @Msg,
                  SentAt = @SentAt, Attempts = Attempts + 1
           WHERE NotificationID = @Id`
        );
      return;
    }
    if (attempt === MAX_ATTEMPTS) {
      await db
        .request()
        .input('Id', sql.Int, notificationId)
        .input('Msg', sql.NVarChar(sql.MAX), result.providerMessage)
        .query(
          `UPDATE dbo.Notification SET Status = 'Failed', ProviderMessage = @Msg,
                  Attempts = Attempts + 1
           WHERE NotificationID = @Id`
        );
    } else {
      await db
        .request()
        .input('Id', sql.Int, notificationId)
        .input('Msg', sql.NVarChar(sql.MAX), result.providerMessage)
        .query(
          `UPDATE dbo.Notification SET Status = 'Retried', ProviderMessage = @Msg,
                  Attempts = Attempts + 1
           WHERE NotificationID = @Id`
        );
    }
  }
}

/**
 * Builds and dispatches a notification for a trigger event (FDS EPIC-05).
 * Returns the number of notification records created.
 */
export async function dispatchEvent(opts: DispatchOptions): Promise<number> {
  const config = await getConfigRows(opts.event);
  if (config.length === 0) {
    logger.info('No notification recipients configured', { event: opts.event });
    return 0;
  }

  const recipients = await resolveRecipients(opts.event, opts.userIds);
  const payloadJson = opts.payload ? JSON.stringify(opts.payload) : null;
  const payloadObj = (opts.payload && typeof opts.payload === 'object' && opts.payload !== null)
    ? opts.payload as Record<string, unknown>
    : null;
  let created = 0;

  for (const user of recipients) {
    if (!user.userId) {
      logger.info('Skipping recipient — no userId', { event: opts.event });
      continue;
    }
    const hasEnabledConfig = config.some((c) => Number(c.RoleID) === Number(user.roleId));
    if (!hasEnabledConfig) {
      continue;
    }

    // Dedup: skip if the same event + recipient + payload was created in the last 5 minutes.
    const dupCheck = await db
      .request()
      .input('Event', sql.VarChar(100), opts.event)
      .input('UserId', sql.Int, user.userId)
      .input('Payload', sql.NVarChar(sql.MAX), payloadJson)
      .input('Cutoff', sql.DateTime2, new Date(Date.now() - 5 * 60 * 1000))
      .query(
        `SELECT TOP 1 NotificationID FROM dbo.Notification
         WHERE TriggerEvent = @Event AND RecipientUserID = @UserId
           AND Payload = @Payload AND CreatedAt > @Cutoff`
      );
    if (dupCheck.recordset.length > 0) {
      logger.info('Duplicate notification skipped', { event: opts.event, userId: user.userId });
      continue;
    }

    const insert = await db
      .request()
      .input('Event', sql.VarChar(100), opts.event)
      .input('Channel', sql.VarChar(20), 'Email')
      .input('UserId', sql.Int, user.userId)
      .input('Subject', sql.NVarChar(300), opts.subject)
      .input('Body', sql.NVarChar(sql.MAX), opts.body)
      .input('Payload', sql.NVarChar(sql.MAX), payloadJson)
      .query(
        `INSERT INTO dbo.Notification (TriggerEvent, Channel, RecipientUserID, Subject, Body, Payload, Status)
         OUTPUT INSERTED.NotificationID
         VALUES (@Event, @Channel, @UserId, @Subject, @Body, @Payload, 'Pending')`
      );
    const notificationId = insert.recordset[0].NotificationID;
    created++;
    logger.info('Notification created', { event: opts.event, notificationId, userId: user.userId });
    // Fire-and-forget delivery with retry; do not block the caller.
    deliver(notificationId, user, opts.event, opts.subject, opts.body, payloadObj).catch((err) =>
      logger.error('Notification delivery failed', { notificationId, error: (err as Error).message })
    );
  }
  return created;
}
