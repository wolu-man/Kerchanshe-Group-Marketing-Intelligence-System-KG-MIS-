const { dbConfig } = require('./scripts/dbconfig');
const mssql = require('mssql');

async function run() {
  try {
    const pool = await mssql.connect(dbConfig());
    const result = await pool.request().batch(
      "DELETE FROM dbo.Product WHERE ProductCode IN ('SPC-SHM-500G','GRN-SOR-50KG','GRN-TEF-50KG','TEA-GR-250G','Black Tea 500g','SPC-BER-500G') AND BusinessGroupID IS NULL"
    );
    console.log('Deleted rows:', result.rowsAffected[0]);
    
    // Verify
    const verify = await pool.request().query(
      "SELECT ProductCode, Name, BusinessGroupID FROM dbo.Product WHERE ProductCode IN ('SPC-SHM-500G','GRN-SOR-50KG','GRN-TEF-50KG','TEA-GR-250G','Black Tea 500g','SPC-BER-500G')"
    );
    console.log('Remaining products:', JSON.stringify(verify.recordset));
    
    await pool.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

run();