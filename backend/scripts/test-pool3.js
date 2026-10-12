// Exact same config as pool.ts produces, no module import
const sql = require('mssql');
const poolConfig = {
  server: '127.0.0.1',
  authentication: {
    type: 'default',
    options: {
      userName: 'kgmis_user',
      password: 'KgMis!2026Dev',
    },
  },
  options: {
    database: 'KG_MIS',
    encrypt: false,
    trustServerCertificate: true,
  },
  pool: { max: 10, min: 2, idleTimeoutMillis: 30000 },
  port: 50404,
};

console.log('Creating pool...');
const pool = new sql.ConnectionPool(poolConfig);
console.log('Connecting...');
pool.connect().then(() => {
  console.log('Connected!');
  return pool.close();
}).catch(e => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
