// Applies versioned migrations from ./migrations in filename order.
// Applied migration names are recorded in dbo.__Migrations (created by 001).
const fs = require('fs');
const path = require('path');
const mssql = require('mssql');
const { dbConfig } = require('./dbconfig');

async function runBatches(pool, sql) {
  // SQL Server `GO` batch separator
  const batches = sql.split(/^\s*GO\s*$/im).filter((b) => b.trim().length > 0);
  for (const batch of batches) {
    await pool.request().batch(batch);
  }
  return batches.length;
}

async function main() {
  const migrationsDir = path.resolve(__dirname, '..', 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('No migrations found.');
    return;
  }

  const pool = await mssql.connect(dbConfig());
  console.log(`Connected to ${dbConfig().options.database}`);

  // Ensure the migration ledger exists (001 creates it if absent).
  await pool.request().batch(`
    IF OBJECT_ID('dbo.__Migrations','U') IS NULL
    CREATE TABLE dbo.__Migrations (
      MigrationID INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Migrations PRIMARY KEY,
      Name VARCHAR(255) NOT NULL CONSTRAINT UQ_Migrations_Name UNIQUE,
      AppliedAt DATETIME2 NOT NULL CONSTRAINT DF_Migrations_AppliedAt DEFAULT SYSUTCDATETIME()
    );
  `);

  const applied = new Set(
    (await pool.request().query('SELECT Name FROM dbo.__Migrations')).recordset.map((r) => r.Name)
  );

  let totalBatches = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`Skip (already applied): ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const batches = await runBatches(pool, sql);
    await pool
      .request()
      .input('Name', mssql.VarChar, file)
      .query('INSERT INTO dbo.__Migrations (Name) VALUES (@Name)');
    totalBatches += batches;
    console.log(`Applied: ${file} (${batches} batches)`);
  }

  console.log(`Migration complete: ${totalBatches} batches executed.`);
  await pool.close();
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
