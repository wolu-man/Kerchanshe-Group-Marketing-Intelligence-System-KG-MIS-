const mssql = require('mssql');
const { dbConfig } = require('./scripts/dbconfig');

async function test() {
  const pool = await mssql.connect(dbConfig());
  console.log('Connected');
  
  // Test the weeklySales query WITH the scope clause (as if user had 'region' scope)
  const request = pool.request();
  request.input('RegionId', mssql.Int, 1);
  request.input('UserId', mssql.Int, 4);
  
  const scopeClause = `w.OutletID IN (SELECT o.OutletID FROM dbo.Outlet o JOIN dbo.UserRegionAssignment ura ON ura.RegionID = o.RegionID WHERE ura.UserID = @UserId)`;
  
  const query = `
    SELECT COUNT(*) AS [RowCount], ISNULL(SUM(QuantitySold),0) AS Quantity, ISNULL(SUM(Revenue),0) AS Revenue
     FROM dbo.vw_Report_WeeklySales w WHERE 1=1 AND Status = 'Submitted' AND RegionID = @RegionId AND ${scopeClause}
  `;
  
  console.log('Executing weeklySales query:', query);
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