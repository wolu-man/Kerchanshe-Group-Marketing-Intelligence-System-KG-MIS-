const mssql = require('mssql');
const { dbConfig } = require('./scripts/dbconfig');

async function test() {
  const pool = await mssql.connect(dbConfig());
  console.log('Connected');
  
  // Test the interviews query WITH the scope clause
  const request = pool.request();
  request.input('RegionId', mssql.Int, 1);
  request.input('UserId', mssql.Int, 4);
  
  const scopeClause = `i.OutletID IN (SELECT o.OutletID FROM dbo.Outlet o JOIN dbo.UserRegionAssignment ura ON ura.RegionID = o.RegionID WHERE ura.UserID = @UserId)`;
  
  const query = `
    SELECT COUNT(*) AS Total,
            AVG(CAST(SatisfactionScore AS FLOAT)) AS AvgSatisfaction,
            SUM(CASE WHEN Sentiment = 'Positive' THEN 1 ELSE 0 END) AS PositiveCount,
            SUM(CASE WHEN Sentiment = 'Neutral' THEN 1 ELSE 0 END) AS NeutralCount,
            SUM(CASE WHEN Sentiment = 'Negative' THEN 1 ELSE 0 END) AS NegativeCount
     FROM dbo.vw_Report_Interviews i WHERE 1=1 AND RegionID = @RegionId AND ${scopeClause}
  `;
  
  console.log('Executing interviews query:', query);
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