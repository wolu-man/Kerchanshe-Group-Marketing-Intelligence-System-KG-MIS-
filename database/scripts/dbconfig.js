const path = require('path');
const dotenv = require('dotenv');

// Load .env from the repo root (where npm run db:* is invoked).
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function getDbConfig() {
  return {
    server: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 1433),
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'KG_MIS',
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true',
      trustServerCertificate: true,
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
  };
}

/** Splits a .sql file into batches on standalone `GO` lines. */
function splitSqlBatches(sql) {
  return sql
    .split(/\r?\n/)
    .reduce((batches, line) => {
      if (/^\s*GO\s*$/i.test(line)) {
        batches.push([]);
      } else {
        batches[batches.length - 1].push(line);
      }
      return batches;
    }, [[]])
    .map((lines) => lines.join('\n'))
    .filter((batch) => batch.trim().length > 0);
}

module.exports = { getDbConfig, splitSqlBatches };
