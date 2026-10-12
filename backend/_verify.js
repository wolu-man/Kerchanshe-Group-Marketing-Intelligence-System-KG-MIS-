const sql = require('mssql');
const c = {server:'127.0.0.1',port:50404,options:{instanceName:'SQLEXPRESS',database:'KG_MIS',encrypt:false,trustServerCertificate:true},authentication:{type:'default',options:{userName:'kgmis_user',password:'KgMis!2026Dev'}}};
async function run() {
  const p = await sql.connect(c);
  const r = await p.request().query("SELECT ProductCode, Name, Color, Size FROM dbo.Product WHERE Category = 'Buna Plate' AND IsActive = 1 ORDER BY ProductCode");
  console.log('Total:', r.recordset.length);
  r.recordset.forEach(function(row) { console.log(row.ProductCode + ' | ' + row.Name + ' | ' + row.Size); });
  await p.close();
}
run().catch(function(e) { console.error(e.message); process.exit(1); });
setTimeout(function() { process.exit(1); }, 10000);
