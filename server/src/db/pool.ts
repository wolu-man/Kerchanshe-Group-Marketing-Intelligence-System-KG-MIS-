import sql from 'mssql';
import { env } from '../config/env';

export interface DbConfig {
  server: string;
  port: number;
  user: string;
  password: string;
  database: string;
  options: {
    encrypt: boolean;
    trustServerCertificate: boolean;
    instanceName?: string;
  };
  pool: { max: number; min: number; idleTimeoutMillis: number };
}

export function buildDbConfig(): DbConfig {
  const options: DbConfig['options'] = {
    encrypt: env.db.encrypt,
    trustServerCertificate: true,
  };
  if (env.db.instance) {
    options.instanceName = env.db.instance;
  }
  return {
    server: env.db.server,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    options,
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  };
}

let pool: sql.ConnectionPool | null = null;

export async function getPool(): Promise<sql.ConnectionPool> {
  if (!pool) {
    pool = await new sql.ConnectionPool(buildDbConfig()).connect();
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
  }
}

export function testDbConnection(): Promise<void> {
  return getPool().then((p) => {
    p.close();
    return undefined;
  });
}
