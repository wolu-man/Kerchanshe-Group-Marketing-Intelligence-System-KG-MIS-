process.env.DB_PORT = '50404';
const { env } = require('../dist/config/env');
console.log('DB config:', JSON.stringify(env.db));
