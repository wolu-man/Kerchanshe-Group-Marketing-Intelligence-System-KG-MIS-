/**
 * Minimal test to verify dispatchEvent creates notifications and sends emails.
 * Usage: npx tsx scripts/test-dispatch-debug.ts
 */
import nodemailer from 'nodemailer';
import sql from 'mssql';
import { dbConfig } from './dbconfig';

const BASE = 'http://localhost:4000/api/v1';
const DEV_PASSWORD = process.env.DEV_PASSWORD || 'Password123!';

async function main() {
  // 1. Login as admin
  console.log('Logging in as admin...');
  const loginRes = await fetch(`${BASE}/auth/login/local`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: DEV_PASSWORD }),
  });
  const { token } = await loginRes.json() as any;
  console.log(`  Token: ${token.slice(0, 30)}...`);

  // 2. Create a form
  console.log('\nCreating form...');
  const createRes = await fetch(`${BASE}/forms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title: 'Dispatch Debug Test' }),
  });
  const { templateId } = await createRes.json() as any;
  console.log(`  Form ID: ${templateId}`);

  // 3. Save a simple schema
  console.log('Saving schema...');
  const schemaRes = await fetch(`${BASE}/forms/${templateId}/versions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      schema: {
        schemaVersion: 2,
        pages: [{ id: 'p1', title: 'Page 1' }],
        elements: [{ key: 'name', type: 'shorttext', label: 'Name', pageId: 'p1', order: 0 }],
      },
    }),
  });
  console.log(`  Schema status: ${schemaRes.status}`);

  // 4. Publish
  console.log('Publishing...');
  const pubRes = await fetch(`${BASE}/forms/${templateId}/publish`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`  Publish status: ${pubRes.status}`);
  const pubBody = await pubRes.json();
  console.log(`  Publish body: ${JSON.stringify(pubBody)}`);

  // 5. Wait for delivery
  console.log('\nWaiting 3s for async delivery...');
  await new Promise(r => setTimeout(r, 3000));

  // 6. Check notifications
  console.log('\nChecking notifications...');
  const notifRes = await fetch(`${BASE}/notifications/mine?page=1&pageSize=10`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const notifData = await notifRes.json() as any;
  console.log(`  Total: ${notifData.total}`);
  for (const n of notifData.items || []) {
    console.log(`  #${n.NotificationID} | ${n.TriggerEvent} | Status: ${n.Status} | IsRead: ${n.IsRead}`);
  }

  // 7. Direct DB check
  console.log('\nDirect DB check...');
  const pool = await sql.connect(dbConfig());
  const dbResult = await pool.request().query(`
    SELECT TOP 5 NotificationID, TriggerEvent, RecipientUserID, Status, CreatedAt
    FROM dbo.Notification ORDER BY CreatedAt DESC
  `);
  if (dbResult.recordset.length === 0) {
    console.log('  No notifications in DB');
  } else {
    for (const row of dbResult.recordset) {
      console.log(`  #${row.NotificationID} | ${row.TriggerEvent} | User ${row.RecipientUserID} | ${row.Status}`);
    }
  }
  await pool.close();

  console.log('\nDone.');
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
