const sql = require('mssql');
const { poolConfig } = require('../dist/db/pool');
console.log('Config port:', poolConfig.port);
console.log('Config server:', poolConfig.server);
const pool = new sql.ConnectionPool(poolConfig);
pool.connect().then(() => {
  console.log('Pool connected OK');
  return pool.close();
}).catch(e => {
  console.error('Pool FAIL:', e.message);
  process.exit(1);
});
