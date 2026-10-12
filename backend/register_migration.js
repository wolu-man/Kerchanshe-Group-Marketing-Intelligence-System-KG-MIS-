const mssql = require('mssql');
const { dbConfig } = require('./scripts/dbconfig');

async function run() {
  try {
    const pool = await mssql.connect(dbConfig());
    await pool.request().query("INSERT INTO dbo.__Migrations (Name) VALUES ('005_remove_unassigned_products.sql')");
    console.log('Migration 005 registered as applied');
    await pool.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

run();