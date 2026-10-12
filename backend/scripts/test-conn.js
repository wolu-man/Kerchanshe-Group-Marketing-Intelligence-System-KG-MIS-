const sql = require('mssql');
const config = {
  server: '127.0.0.1',
  port: 50404,
  options: { database: 'KG_MIS', encrypt: false, trustServerCertificate: true },
  authentication: { type: 'default', options: { userName: 'kgmis_user', password: 'KgMis!2026Dev' } },
  pool: { max: 1, min: 0 },
};
console.log('Connecting...');
sql.connect(config).then(() => {
  console.log('OK');
  return sql.close();
}).catch(e => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
