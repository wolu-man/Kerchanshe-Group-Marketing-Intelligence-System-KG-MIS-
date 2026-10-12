const sql = require('mssql');
const fs = require('fs');

async function main() {
  const pool = await sql.connect({
    server: '127.0.0.1',
    port: 50404,
    database: 'KG_MIS',
    user: 'kgmis_user',
    password: 'KgMis!2026Dev',
    options: { encrypt: false, trustServerCertificate: true }
  });
  const result = await pool.request().query('SELECT TOP 1 SchemaJSON FROM dbo.FormVersion WHERE VersionID = 4386');
  const raw = result.recordset[0].SchemaJSON;
  fs.writeFileSync('temp_schema.json', raw, 'utf8');
  const schema = JSON.parse(raw);
  console.log('Elements:', schema.elements.length);
  console.log('Pages:', schema.pages.length);
  schema.elements.forEach(e => console.log(' ', e.key, '->', e.type));
  await pool.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
