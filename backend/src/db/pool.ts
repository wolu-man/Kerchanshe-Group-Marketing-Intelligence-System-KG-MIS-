import sql from 'mssql';
import { env } from '../config/env';

export const poolConfig: sql.config = {
  server: env.db.host,
  authentication: {
    type: 'default',
    options: {
      userName: env.db.user,
      password: env.db.password,
    },
  },
  options: {
    database: env.db.name,
    encrypt: env.db.encrypt,
    trustServerCertificate: env.db.trustServerCertificate,
  },
  pool: { max: 20, min: 3, idleTimeoutMillis: 30000 },
  connectionTimeout: 25000,
  requestTimeout: 60000,
};

// Use a dynamic-port instance (SQLEXPRESS) when an explicit port is set;
// otherwise fall back to SQL Browser instance resolution.
if (env.db.port !== 1433) {
  poolConfig.port = env.db.port;
} else if (env.db.instance) {
  poolConfig.options = poolConfig.options ?? {};
  poolConfig.options.instanceName = env.db.instance;
}

const pool = new sql.ConnectionPool(poolConfig);

export const db = {
  connect(): Promise<sql.ConnectionPool> {
    return pool.connect();
  },
  request(): sql.Request {
    return pool.request();
  },
  close(): Promise<void> {
    return pool.close();
  },
  pool,
};
