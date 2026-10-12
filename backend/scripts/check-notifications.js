const mssql = require('mssql');
const { dbConfig } = require('./dbconfig');

async function main() {
  const pool = await mssql.connect(dbConfig());

  console.log('=== Recent Notifications ===');
  const notifs = await pool.request().query(`
    SELECT TOP 20 NotificationID, TriggerEvent, RecipientUserID, Channel, Subject, Status, Attempts, CreatedAt
    FROM dbo.Notification ORDER BY CreatedAt DESC
  `);
  if (notifs.recordset.length === 0) {
    console.log('  (no notifications found)');
  } else {
    for (const n of notifs.recordset) {
      console.log(`  #${n.NotificationID} | ${n.TriggerEvent} | User ${n.RecipientUserID} | ${n.Channel} | ${n.Status} | ${n.CreatedAt}`);
    }
  }

  console.log('\n=== SMTP Config Check ===');
  const smtp = await pool.request().query(`SELECT TOP 5 ConfigID, TriggerEvent, Channel, RoleID, Enabled FROM dbo.NotificationConfig WHERE TriggerEvent = 'FORM_PUBLISHED'`);
  for (const c of smtp.recordset) {
    console.log(`  ${c.TriggerEvent} | ${c.Channel} | RoleID ${c.RoleID} | Enabled ${c.Enabled}`);
  }

  await pool.close();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
