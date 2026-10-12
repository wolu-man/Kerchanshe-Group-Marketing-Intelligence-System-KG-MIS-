const { db } = require('../dist/db/pool');
console.log('Connecting via app pool...');
db.connect().then(() => {
  console.log('OK');
  return db.close();
}).catch(e => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
