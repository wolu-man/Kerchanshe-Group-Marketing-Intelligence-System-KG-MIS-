const sql = require('mssql');
async function main() {
  const pool = await sql.connect({
    server: '127.0.0.1', port: 50404, database: 'KG_MIS',
    user: 'kgmis_user', password: 'KgMis!2026Dev',
    options: { encrypt: false, trustServerCertificate: true }
  });
  const result = await pool.request().query('SELECT TOP 5 UserID, CUAS_ID, Name, Email, IsActive FROM dbo.[User]');
  console.log(result.recordset);
  await pool.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
