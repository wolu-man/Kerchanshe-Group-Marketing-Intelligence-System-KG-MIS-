// =============================================================================
// EmailService — centralized SMTP transport (Gmail via STARTTLS).
// Replaces the former CNS integration for all notification delivery.
// Configured via SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM env vars.
// =============================================================================
import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../config/logger';

export interface EmailResult {
  success: boolean;
  providerMessage: string | null;
}

export type NotificationChannel = 'Email';

export const SUPPORTED_CHANNELS: NotificationChannel[] = ['Email'];

export function isSupportedChannel(value: string): value is NotificationChannel {
  return (SUPPORTED_CHANNELS as string[]).includes(value);
}

let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: false, // STARTTLS — upgrade on connection
    pool: true,
    maxConnections: 3,
    maxMessages: 50,
    connectionTimeout: 10_000,
    greetingTimeout: 5_000,
    auth: {
      user: env.smtp.user,
      pass: env.smtp.pass,
    },
  });
  return _transporter;
}

export function isEmailConfigured(): boolean {
  return !!(env.smtp.host && env.smtp.user && env.smtp.pass && env.smtp.from);
}

/**
 * Sends an HTML email with a plain-text fallback. Returns success/failure
 * outcome for logging by the caller.
 */
export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  textBody?: string,
): Promise<EmailResult> {
  if (!isEmailConfigured()) {
    logger.warn('SMTP not configured — email skipped', { to, subject });
    return { success: false, providerMessage: 'SMTP not configured' };
  }
  try {
    const info = await getTransporter().sendMail({
      from: env.smtp.from,
      to,
      subject,
      html: body,
      text: textBody ?? body.replace(/<[^>]+>/g, ''),
    });
    logger.info('Email sent', { to, subject, messageId: info.messageId });
    return { success: true, providerMessage: info.messageId };
  } catch (err) {
    logger.error('Email send failed', { to, subject, error: (err as Error).message });
    return { success: false, providerMessage: (err as Error).message };
  }
}
