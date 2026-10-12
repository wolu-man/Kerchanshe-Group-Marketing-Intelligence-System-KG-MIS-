/**
 * End-to-end notification test — sends a branded HTML email for every
 * notification event type to verify template rendering and SMTP delivery.
 *
 * Usage:  npx tsx scripts/test-notifications.ts
 *         npx tsx scripts/test-notifications.ts someone@example.com
 */
import nodemailer from 'nodemailer';
import { renderNotification } from '../src/notifications/templates';

const TO = process.argv[2] || 'wolumanurgesafeyisa@gmail.com';
const FROM = process.env.SMTP_FROM || 'wolumaan@gmail.com';

const EVENTS: Array<{
  event: string;
  recipientName: string;
  payload: Record<string, unknown>;
  subject: string;
}> = [
  {
    event: 'NewReport',
    recipientName: 'Test User',
    subject: 'New market visit report: Test Outlet',
    payload: { reportId: 42, outlet: 'Test Outlet', status: 'Submitted' },
  },
  {
    event: 'SyncFailure',
    recipientName: 'Test User',
    subject: 'D365FO sync failed',
    payload: {
      entities: [
        { entity: 'Product', recordsProcessed: 120, errorCount: 3 },
        { entity: 'Customer', recordsProcessed: 85, errorCount: 0 },
      ],
    },
  },
  {
    event: 'PriceGapAlert',
    recipientName: 'Test User',
    subject: 'Price gap alert: PROD-001',
    payload: { priceId: 101, productId: 55, gapPercent: -22.5, competitorName: 'Competitor A' },
  },
  {
    event: 'NewInterview',
    recipientName: 'Test User',
    subject: 'New customer interview: John Doe',
    payload: { interviewId: 7, respondent: 'John Doe', status: 'Submitted' },
  },
  {
    event: 'FORM_PUBLISHED',
    recipientName: 'Test User',
    subject: 'Form published: Customer Satisfaction Survey',
    payload: { templateId: 10 },
  },
  {
    event: 'OWNERSHIP_TRANSFERRED',
    recipientName: 'Test User',
    subject: 'Form ownership transferred: Product Feedback',
    payload: { templateId: 12, newOwnerId: 3 },
  },
  {
    event: 'PARENT_FORM_UPDATED',
    recipientName: 'Test User',
    subject: 'Parent form updated: Regional Survey',
    payload: { parentFormId: 8, childFormId: 15 },
  },
  {
    event: 'SUBMISSION_CONFIRMED',
    recipientName: 'Test User',
    subject: 'Response received: Customer Satisfaction Survey',
    payload: { responseId: 201, templateId: 10 },
  },
  {
    event: 'NEW_RESPONSE_RECEIVED',
    recipientName: 'Test User',
    subject: 'New response: Customer Satisfaction Survey',
    payload: { responseId: 202, templateId: 10 },
  },
  {
    event: 'RESPONSE_LIMIT_WARNING',
    recipientName: 'Test User',
    subject: 'Response limit nearly reached: Product Feedback',
    payload: { templateId: 12, count: 80, max: 100 },
  },
  {
    event: 'FORM_ASSIGNED',
    recipientName: 'Test User',
    subject: 'Follow-up form assigned',
    payload: { templateId: 14, linkedFormTemplateId: 16 },
  },
  {
    event: 'RESPONSE_EDITED',
    recipientName: 'Test User',
    subject: 'Response edited: Customer Satisfaction Survey',
    payload: { responseId: 201, templateId: 10, revisionId: 3 },
  },
];

async function main() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.error('ERROR: SMTP env vars missing. Check .env');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: false,
    auth: { user, pass },
  });

  console.log(`Sending ${EVENTS.length} test emails to: ${TO}`);
  console.log('---');

  let passed = 0;
  let failed = 0;

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (const { event, recipientName, payload, subject } of EVENTS) {
    const rendered = renderNotification(event, payload, recipientName);
    try {
      const info = await transporter.sendMail({
        from: FROM,
        to: TO,
        subject: `[KG-MIS Test] ${subject}`,
        html: rendered.html,
        text: rendered.text,
      });
      console.log(`  [PASS] ${event} — Message ID: ${info.messageId}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${event} — ${(err as Error).message}`);
      failed++;
    }
    // Throttle to avoid Gmail rate-limiting (1.5s between sends)
    if (EVENTS.indexOf(EVENTS.find((e) => e.event === event)!) < EVENTS.length - 1) {
      await delay(1500);
    }
  }

  console.log('---');
  console.log(`Done. ${passed} passed, ${failed} failed out of ${EVENTS.length}.`);
  if (failed > 0) process.exit(1);
}

main();
