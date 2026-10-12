require('../dist/config/env');
const sql = require('mssql');
const { poolConfig } = require('../dist/db/pool');

const missingConfigs = [
  // Report approval/rejection → notify reporter (Field Officer=4), Admin(1), Manager(2)
  { event: 'ReportApproved', roleId: 1 },
  { event: 'ReportApproved', roleId: 2 },
  { event: 'ReportApproved', roleId: 4 },
  { event: 'ReportRejected', roleId: 1 },
  { event: 'ReportRejected', roleId: 2 },
  { event: 'ReportRejected', roleId: 4 },
  // Interview events → notify Admin(1), Manager(2), Analyst(3), Field Officer(4)
  { event: 'NewInterview', roleId: 1 },
  { event: 'NewInterview', roleId: 2 },
  { event: 'NewInterview', roleId: 3 },
  { event: 'InterviewApproved', roleId: 1 },
  { event: 'InterviewApproved', roleId: 2 },
  { event: 'InterviewApproved', roleId: 4 },
  { event: 'InterviewRejected', roleId: 1 },
  { event: 'InterviewRejected', roleId: 2 },
  { event: 'InterviewRejected', roleId: 4 },
];

async function main() {
  await sql.connect(poolConfig);
  let added = 0;
  for (const { event, roleId } of missingConfigs) {
    const existing = await sql.query`SELECT ConfigID FROM dbo.NotificationConfig WHERE TriggerEvent = ${event} AND RoleID = ${roleId} AND Channel = 'Email'`;
    if (existing.recordset.length === 0) {
      await sql.query`INSERT INTO dbo.NotificationConfig (TriggerEvent, Channel, RoleID, Enabled, CreatedAt) VALUES (${event}, 'Email', ${roleId}, 1, GETDATE())`;
      added++;
      console.log(`+ ${event} → RoleID ${roleId}`);
    } else {
      console.log(`  ${event} → RoleID ${roleId} already exists`);
    }
  }
  console.log(`\nInserted ${added} config(s)`);
  await sql.close();
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
