const path = require('path');
const root = process.cwd();
const mssql = require(path.join(root, 'node_modules', 'mssql'));
const { dbConfig } = require(path.join(root, 'scripts', 'dbconfig.js'));
const { scopeClauseViaOutlet } = require(path.join(root, 'dist', 'utils', 'scope.js'));
(async () => {
  const p = await mssql.connect(dbConfig());
  
  // Simulate what the service does
  const opts = { 
    dataScope: 'all', 
    userId: 3,
    from: undefined,
    to: undefined,
    regionId: undefined,
    businessGroupId: undefined,
  };
  
  const request = p.request();
  const where = ['1=1'];
  if (opts.from) { where.push('WeekEnding >= @From'); request.input('From', mssql.Date, opts.from); }
  if (opts.to) { where.push('WeekEnding <= @To'); request.input('To', mssql.Date, opts.to); }
  if (opts.regionId) { where.push('RegionID = @RegionId'); request.input('RegionId', mssql.Int, opts.regionId); }
  if (opts.businessGroupId) { where.push('BusinessGroupID = @BgId'); request.input('BgId', mssql.Int, opts.businessGroupId); }
  request.input('UserId', mssql.Int, opts.userId);
  
  const scope = scopeClauseViaOutlet(opts.dataScope, { alias: 'w' });
  console.log('scope clause:', scope);
  if (scope) where.push(scope);
  
  const whereSql = where.join(' AND ');
  console.log('whereSql:', whereSql);
  
  const totals = await request.query(
    `SELECT COUNT(*) AS [RowCount], ISNULL(SUM(QuantitySold),0) AS Quantity, ISNULL(SUM(Revenue),0) AS Revenue
     FROM dbo.vw_Report_WeeklySales WHERE ${whereSql} AND Status = 'Submitted'`
  );
  console.log('totals:', totals.recordset[0]);
  
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });