const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const bcrypt = require('bcryptjs');
const { getDbConfig, splitSqlBatches } = require('./dbconfig');

const DEV_PASSWORD = 'Password123!';

const DEV_USERS = [
  { cuasId: 'admin', name: 'System Administrator', role: 'Administrator', email: 'admin@kerchanshe.com' },
  { cuasId: 'tsegaye.n', name: 'Tsegaye Nigusie', role: 'Marketing Manager', email: 'tsegaye.n@kerchanshe.com' },
  { cuasId: 'analyst1', name: 'Marketing Analyst', role: 'Marketing Analyst', email: 'analyst1@kerchanshe.com' },
  { cuasId: 'field1', name: 'Field Officer One', role: 'Field Officer', email: 'field1@kerchanshe.com' },
  { cuasId: 'field2', name: 'Field Officer Two', role: 'Field Officer', email: 'field2@kerchanshe.com' },
  { cuasId: 'viewer1', name: 'Executive Viewer', role: 'Viewer', email: 'viewer1@kerchanshe.com' },
];

async function seedUsers(pool) {
  const hash = bcrypt.hashSync(DEV_PASSWORD, 10);
  for (const u of DEV_USERS) {
    const existing = await pool
      .request()
      .input('cuasId', sql.VarChar(100), u.cuasId)
      .query('SELECT UserID FROM dbo.[User] WHERE CUAS_ID = @cuasId');
    if (existing.recordset.length > 0) continue;

    await pool
      .request()
      .input('cuasId', sql.VarChar(100), u.cuasId)
      .input('name', sql.NVarChar(150), u.name)
      .input('email', sql.NVarChar(200), u.email)
      .input('role', sql.VarChar(50), u.role)
      .input('hash', sql.NVarChar(255), hash)
      .query(`
        INSERT INTO dbo.[User] (CUAS_ID, Name, Email, RoleID, PasswordHash)
        SELECT @cuasId, @name, @email, RoleID, @hash FROM dbo.Role WHERE RoleName = @role
      `);
    console.log(`Seeded user: ${u.cuasId} (${u.role})`);
  }
}

async function run() {
  const seedFile = path.resolve(process.cwd(), 'database', 'seed.sql');
  const sqlText = fs.readFileSync(seedFile, 'utf8');
  const batches = splitSqlBatches(sqlText);

  const pool = await sql.connect(getDbConfig());
  console.log(`Connected to ${getDbConfig().server}/${getDbConfig().database}`);
  try {
    for (const batch of batches) {
      await pool.request().batch(batch);
    }
    console.log(`Reference data applied: ${batches.length} batches executed.`);
    await seedUsers(pool);
    console.log(`Seed complete. Dev login password for all users: ${DEV_PASSWORD}`);
  } finally {
    await pool.close();
  }
}

run().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
