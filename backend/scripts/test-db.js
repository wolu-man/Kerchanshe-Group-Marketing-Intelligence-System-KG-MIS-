const { db } = require('../dist/db/pool');
db.connect().then(() => { console.log('DB connected OK'); return db.close(); })
  .catch(e => { console.error('FAIL:', e.message); process.exit(1); });
