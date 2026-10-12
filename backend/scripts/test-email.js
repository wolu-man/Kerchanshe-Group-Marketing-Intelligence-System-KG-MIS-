const sql = require('mssql');
const path = require('path');

// Load .env
const fs = require('fs');
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

const config = {
  server: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '50404', 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'KG_MIS',
  options: { encrypt: false, trustServerCertificate: true }
};

async function main() {
  await sql.connect(config);

  // Insert a test notification for the field officer
  const result = await sql.query`
    INSERT INTO dbo.Notification (TriggerEvent, Channel, RecipientUserID, Subject, Body, Payload, Status)
    OUTPUT INSERTED.NotificationID, INSERTED.Subject, INSERTED.Status
    VALUES ('NEW_PLAN_CREATED', 'Email', 12, 'Test: New Plan Created', 'This is a test notification for a new plan creation. Plan: Q1 2026 Marketing Campaign, Period: 2026-01-01 to 2026-03-31.', '{"planId":999,"planName":"Q1 2026 Marketing Campaign","planType":"Quarterly","startDate":"2026-01-01","endDate":"2026-03-31"}', 'Pending')
  `;

  console.log('Notification inserted:', result.recordset[0]);

  // Get the user info
  const userResult = await sql.query`SELECT UserID, Name, Email, RoleID FROM dbo.[User] WHERE UserID = 12`;
  const user = userResult.recordset[0];
  console.log('User:', user.Name, '-', user.Email);

  // Get the email template (use compiled dist)
  const { renderNotification } = require('../dist/notifications/templates');
  const payload = { planId: 999, planName: 'Q1 2026 Marketing Campaign', planType: 'Quarterly', startDate: '2026-01-01', endDate: '2026-03-31' };
  const rendered = renderNotification('NEW_PLAN_CREATED', payload, user.Name);
  console.log('Email rendered successfully');
  console.log('HTML length:', rendered.html.length, 'bytes');

  // Try to send via email
  const { sendEmail } = require('../dist/integrations/email');
  console.log('Sending email to', user.Email, '...');
  const sendResult = await sendEmail(user.Email, 'Test: New Plan Created', rendered.html, rendered.text);
  console.log('Send result:', sendResult);

  if (sendResult.success) {
    await sql.query`UPDATE dbo.Notification SET Status = 'Sent', SentAt = SYSUTCDATETIME() WHERE NotificationID = ${result.recordset[0].NotificationID}`;
    console.log('Notification marked as Sent');
  } else {
    await sql.query`UPDATE dbo.Notification SET Status = 'Failed', ProviderMessage = ${sendResult.providerMessage} WHERE NotificationID = ${result.recordset[0].NotificationID}`;
    console.log('Notification marked as Failed');
  }

  await sql.close();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
