const sql = require('mssql');
const config = {
  server: '127.0.0.1',
  port: 50404,
  options: { database: 'KG_MIS', encrypt: false, trustServerCertificate: true },
  authentication: { type: 'default', options: { userName: 'kgmis_user', password: 'KgMis!2026Dev' } },
  pool: { max: 10, min: 2, idleTimeoutMillis: 30000 },
};
console.log('sql.connect...');
sql.connect(config).then(() => {
  console.log('sql.connect OK');
  return sql.close();
}).catch(e => {
  console.error('sql.connect FAIL:', e.message);
  process.exit(1);
});
