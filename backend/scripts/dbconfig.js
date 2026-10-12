// Shared DB configuration for migration/seed scripts.
const path = require('path');
const dotenv = require('dotenv');

// Load .env from the backend root regardless of cwd.
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

function dbConfig() {
  const port = Number(process.env.DB_PORT) || 1433;
  const config = {
    server: process.env.DB_HOST || 'localhost',
    options: {
      encrypt: (process.env.DB_ENCRYPT || 'false') === 'true',
      trustServerCertificate: (process.env.DB_TRUST_SERVER_CERTIFICATE || 'true') === 'true',
      database: process.env.DB_NAME || 'KG_MIS',
    },
    authentication: {
      type: 'default',
      options: {
        userName: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
      },
    },
    pool: { max: 4, min: 0, idleTimeoutMillis: 30000 },
  };
  // Use a dynamic-port instance (e.g. SQLEXPRESS on a random TCP port) when an
  // explicit port is configured; otherwise fall back to SQL Browser resolution.
  if (port !== 1433) {
    config.port = port;
  } else if (process.env.DB_INSTANCE) {
    config.options.instanceName = process.env.DB_INSTANCE;
  }
  return config;
}

module.exports = { dbConfig };
