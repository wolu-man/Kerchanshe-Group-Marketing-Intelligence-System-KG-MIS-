// Loads reference/seed data from ./seed/seed.sql and sets the shared
// development password for seeded dev users (bcrypt).
const fs = require('fs');
const path = require('path');
const mssql = require('mssql');
const bcrypt = require('bcryptjs');
const { dbConfig } = require('./dbconfig');

const DEV_PASSWORD = process.env.DEV_PASSWORD || 'Password123!';

async function runBatches(pool, sql) {
  const batches = sql.split(/^\s*GO\s*$/im).filter((b) => b.trim().length > 0);
  for (const batch of batches) {
    await pool.request().batch(batch);
  }
  return batches.length;
}

async function main() {
  const seedFile = path.resolve(__dirname, '..', 'seed', 'seed.sql');
  const pool = await mssql.connect(dbConfig());
  console.log(`Connected to ${dbConfig().options.database}`);

  const sql = fs.readFileSync(seedFile, 'utf8');
  const batches = await runBatches(pool, sql);
  console.log(`Reference data applied: ${batches} batches executed.`);

  // Set dev password for seeded users (dev-only; never used in production).
  const hash = await bcrypt.hash(DEV_PASSWORD, 10);
  const result = await pool
    .request()
    .input('Hash', mssql.NVarChar, hash)
    .input('Password', mssql.NVarChar, DEV_PASSWORD)
    .query(
      `UPDATE dbo.[User]
       SET PasswordHash = @Hash
       WHERE IsActive = 1 AND (PasswordHash IS NULL OR PasswordHash <> @Password)`
    );
  console.log(`Dev login password set for ${result.rowsAffected[0]} user(s): ${DEV_PASSWORD}`);
  console.log('Seed complete.');
  await pool.close();
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
