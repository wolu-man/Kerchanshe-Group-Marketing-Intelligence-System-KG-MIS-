const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const { getDbConfig, splitSqlBatches } = require('./dbconfig');

async function run() {
  const schemaFile = path.resolve(process.cwd(), 'database', 'schema.sql');
  const sqlText = fs.readFileSync(schemaFile, 'utf8');
  const batches = splitSqlBatches(sqlText);

  const pool = await sql.connect(getDbConfig());
  console.log(`Connected to ${getDbConfig().server}/${getDbConfig().database}`);
  try {
    for (const batch of batches) {
      await pool.request().batch(batch);
    }
    console.log(`Schema applied: ${batches.length} batches executed.`);
  } finally {
    await pool.close();
  }
}

run().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
