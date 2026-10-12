const sql = require('mssql');
const fs = require('fs');
const c = {server:'127.0.0.1',port:50404,options:{instanceName:'SQLEXPRESS',database:'KG_MIS',encrypt:false,trustServerCertificate:true},authentication:{type:'default',options:{userName:'kgmis_user',password:'KgMis!2026Dev'}}};
async function run() {
  const p = await sql.connect(c);
  // Run migration
  const t = fs.readFileSync('C:/2026 Projects/MIS/backend/migrations/028_product_data_update.sql','utf8').replace(/\bGO\b/gi,'');
  const r = await p.request().batch(t);
  console.log('Migration 028 applied. Rows affected:', r.rowsAffected[0]);
  // Verify
  const v = await p.request().query("SELECT TOP 5 ProductCode, Name, Color, Size FROM dbo.Product WHERE Category = 'Buna Plate' AND IsActive = 1");
  v.recordset.forEach(function(row) { console.log(row.ProductCode + ' | ' + row.Name + ' | Color:' + (row.Color ? 'YES' : 'NO') + ' | Size:' + row.Size); });
  const count = await p.request().query("SELECT COUNT(*) as cnt FROM dbo.Product WHERE Color IS NOT NULL AND IsActive = 1");
  console.log('Products with Color:', count.recordset[0].cnt);
  await p.close();
}
run().catch(function(e) { console.error(e.message); process.exit(1); });
setTimeout(function() { process.exit(1); }, 15000);
