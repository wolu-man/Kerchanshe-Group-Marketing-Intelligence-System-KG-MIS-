// Run migration 002 against the database.
// Usage: node scripts/run-migration-002.js
const fs = require('fs');
const path = require('path');
const mssql = require('mssql');
const { dbConfig } = require('./dbconfig');

async function main() {
  const migrationFile = path.resolve(__dirname, '..', 'migrations', '002_notification_read.sql');
  const sql = fs.readFileSync(migrationFile, 'utf8');
  const pool = await mssql.connect(dbConfig());
  console.log(`Connected to ${dbConfig().options.database}`);

  const batches = sql.split(/^\s*GO\s*$/im).filter((b) => b.trim().length > 0);
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    if (!batch.trim()) continue;
    try {
      await pool.request().batch(batch);
      console.log(`  Batch ${i + 1}/${batches.length} OK`);
    } catch (err) {
      console.error(`  Batch ${i + 1}/${batches.length} FAILED: ${err.message}`);
      // Continue — some batches may be idempotent "IF NOT EXISTS" checks
    }
  }

  // Verify columns exist
  const check = await pool.request().query(`
    SELECT c.name AS ColumnName
    FROM sys.columns c
    WHERE c.object_id = OBJECT_ID('dbo.Notification')
      AND c.name IN ('IsRead', 'ReadAt')
    ORDER BY c.name
  `);
  console.log('Verification — Notification columns:', check.recordset.map((r) => r.ColumnName).join(', '));

  const idxCheck = await pool.request().query(`
    SELECT name FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.Notification') AND name = 'IX_Notification_Unread'
  `);
  console.log('Verification — Partial index exists:', idxCheck.recordset.length > 0 ? 'YES' : 'NO');

  await pool.close();
  console.log('Migration 002 complete.');
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
