const mssql = require('mssql');
const { dbConfig } = require('./scripts/dbconfig');

async function test() {
  const pool = await mssql.connect(dbConfig());
  console.log('Connected');
  
  // Test the query that the salesOverview function builds
  const request = pool.request();
  request.input('RegionId', mssql.Int, 1);
  request.input('UserId', mssql.Int, 4);
  
  const scopeClause = `s.OutletID IN (SELECT o.OutletID FROM dbo.Outlet o JOIN dbo.UserRegionAssignment ura ON ura.RegionID = o.RegionID WHERE ura.UserID = @UserId)`;
  
  const whereSql = `1=1 AND RegionID = @RegionId AND ${scopeClause}`;
  
  const query = `
    SELECT COUNT(DISTINCT SalesID) AS OrderCount,
            ISNULL(SUM(Quantity), 0) AS TotalQuantity,
            ISNULL(SUM(Amount), 0) AS TotalAmount,
            COUNT(DISTINCT ProductID) AS ProductsSold,
            COUNT(DISTINCT RegionID) AS RegionsCovered
     FROM dbo.vw_Report_SalesByOutlet s WHERE ${whereSql}
  `;
  
  console.log('Executing query:', query);
  try {
    const result = await request.query(query);
    console.log('Result:', result.recordset);
  } catch (err) {
    console.error('Error:', err.message);
    console.error('Stack:', err.stack);
  }
  
  await pool.close();
}

test().catch(console.error);