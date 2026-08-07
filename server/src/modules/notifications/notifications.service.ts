import sql from 'mssql';
import { getPool } from '../../db/pool';
import { sendViaCns, type CnsChannel } from '../../integrations/cns';

export type TriggerEvent = 'NewReport' | 'SurveyPublished' | 'PriceGapAlert' | 'SyncFailure';

export interface NotificationPayload {
  subject: string;
  message: string;
}

interface ConfigRow {
  Channel: CnsChannel;
  RoleID: number;
}

interface RecipientRow {
  RecipientUserID: number;
  Email: string | null;
  Phone: string | null;
}

/**
 * Sends a notification to the roles configured for a trigger event via CNS
 * (FDS EPIC-05 / FR-05.1, FR-05.3, FR-05.4). A failed delivery is retried once
 * before being marked failed.
 */
export async function notifyEvent(
  triggerEvent: TriggerEvent,
  payload: NotificationPayload,
): Promise<{ attempted: number; sent: number; failed: number }> {
  const pool = await getPool();

  const configResult = await pool
    .request()
    .input('event', sql.VarChar(100), triggerEvent)
    .query(`
      SELECT Channel, RoleID FROM dbo.NotificationConfig
      WHERE TriggerEvent = @event AND Enabled = 1
    `);
  const configs: ConfigRow[] = configResult.recordset;
  if (configs.length === 0) return { attempted: 0, sent: 0, failed: 0 };

  let attempted = 0;
  let sent = 0;
  let failed = 0;

  for (const config of configs) {
    const recipientsResult = await pool
      .request()
      .input('roleId', sql.Int, config.RoleID)
      .query(`
        SELECT UserID AS RecipientUserID, Email, NULL AS Phone
        FROM dbo.[User] WHERE RoleID = @roleId AND IsActive = 1
      `);
    const recipients: RecipientRow[] = recipientsResult.recordset;

    for (const recipient of recipients) {
      attempted += 1;
      const notificationId = await insertNotification(
        triggerEvent,
        config.Channel,
        recipient.RecipientUserID,
        payload,
      );
      const outcome = await sendWithRetry(notificationId, config.Channel, recipient, payload);
      if (outcome) sent += 1;
      else failed += 1;
    }
  }

  return { attempted, sent, failed };
}

async function insertNotification(
  triggerEvent: TriggerEvent,
  channel: CnsChannel,
  recipientUserId: number,
  payload: NotificationPayload,
): Promise<number> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('event', sql.VarChar(100), triggerEvent)
    .input('channel', sql.VarChar(20), channel)
    .input('recipient', sql.Int, recipientUserId)
    .input('subject', sql.NVarChar(300), payload.subject)
    .input('payload', sql.NVarChar(sql.MAX), payload.message)
    .query(`
      INSERT INTO dbo.Notification (TriggerEvent, Channel, RecipientUserID, Subject, Payload, Status, Attempts)
      VALUES (@event, @channel, @recipient, @subject, @payload, 'Pending', 0);
      SELECT SCOPE_IDENTITY() AS NotificationID;
    `);
  return Number(result.recordset[0].NotificationID);
}

async function sendWithRetry(
  notificationId: number,
  channel: CnsChannel,
  recipient: RecipientRow,
  payload: NotificationPayload,
): Promise<boolean> {
  const address = recipient.Email ?? '';
  let result = await attemptSend(notificationId, channel, address, payload, 1);
  if (!result) {
    result = await attemptSend(notificationId, channel, address, payload, 2);
  }
  return result;
}

async function attemptSend(
  notificationId: number,
  channel: CnsChannel,
  address: string,
  payload: NotificationPayload,
  attemptNumber: number,
): Promise<boolean> {
  const pool = await getPool();
  try {
    const result = await sendViaCns({
      channel,
      recipient: address,
      subject: payload.subject,
      message: payload.message,
    });
    await pool
      .request()
      .input('id', sql.Int, notificationId)
      .input('status', sql.VarChar(20), attemptNumber > 1 ? 'Retried' : 'Sent')
      .input('attempts', sql.Int, attemptNumber)
      .input('providerMsg', sql.NVarChar(sql.MAX), result.providerMessage)
      .input('sentAt', sql.DateTime2, new Date())
      .query(`
        UPDATE dbo.Notification
        SET Status = @status, Attempts = @attempts, ProviderMessage = @providerMsg, SentAt = @sentAt
        WHERE NotificationID = @id
      `);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Delivery failed';
    await pool
      .request()
      .input('id', sql.Int, notificationId)
      .input('status', sql.VarChar(20), 'Failed')
      .input('attempts', sql.Int, attemptNumber)
      .input('providerMsg', sql.NVarChar(sql.MAX), msg)
      .input('sentAt', sql.DateTime2, null)
      .query(`
        UPDATE dbo.Notification
        SET Status = @status, Attempts = @attempts, ProviderMessage = @providerMsg, SentAt = @sentAt
        WHERE NotificationID = @id
      `);
    return false;
  }
}
