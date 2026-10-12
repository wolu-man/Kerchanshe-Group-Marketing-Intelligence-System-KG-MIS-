const mssql = require('mssql');
const { dbConfig } = require('./scripts/dbconfig');

async function run() {
  try {
    const pool = await mssql.connect(dbConfig());
    
    // Step 1: Delete SalesRecord entries referencing these products
    const delSales = await pool.request().batch(
      "DELETE FROM dbo.SalesRecord WHERE ProductID IN (SELECT p.ProductID FROM dbo.Product p WHERE p.ProductCode IN ('SPC-SHM-500G','GRN-SOR-50KG','GRN-TEF-50KG','TEA-GR-250G','Black Tea 500g','SPC-BER-500G') AND p.BusinessGroupID IS NULL)"
    );
    console.log('SalesRecord deleted rows:', delSales.rowsAffected[0]);
    
    // Step 2: Delete the products
    const delProd = await pool.request().batch(
      "DELETE FROM dbo.Product WHERE ProductCode IN ('SPC-SHM-500G','GRN-SOR-50KG','GRN-TEF-50KG','TEA-GR-250G','Black Tea 500g','SPC-BER-500G') AND BusinessGroupID IS NULL"
    );
    console.log('Product deleted rows:', delProd.rowsAffected[0]);
    
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