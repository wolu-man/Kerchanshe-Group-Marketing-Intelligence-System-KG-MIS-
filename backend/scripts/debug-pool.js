console.log('Starting...');
const t = setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 10000);
try {
  const mod = require('../dist/db/pool');
  clearTimeout(t);
  console.log('Module loaded');
  console.log('port:', mod.poolConfig.port);
  console.log('server:', mod.poolConfig.server);
  console.log('options:', JSON.stringify(mod.poolConfig.options));
  console.log('auth:', JSON.stringify(mod.poolConfig.authentication));
} catch(e) {
  clearTimeout(t);
  console.error('ERROR:', e.message);
}
