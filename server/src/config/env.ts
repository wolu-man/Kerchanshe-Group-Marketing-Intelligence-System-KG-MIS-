import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

function loadEnvFile(): void {
  let dir = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    const candidate = path.resolve(dir, '.env');
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate });
      return;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  dotenv.config();
}

loadEnvFile();

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true';
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',

  db: {
    server: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 1433),
    instance: process.env.DB_INSTANCE || '',
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'KG_MIS',
    encrypt: bool(process.env.DB_ENCRYPT, false),
  },

  app: {
    port: Number(process.env.API_PORT || 4000),
    origin: process.env.APP_ORIGIN || 'http://localhost:3000',
    apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:4000',
    jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
    sessionIdleTimeoutMinutes: Number(process.env.SESSION_IDLE_TIMEOUT_MINUTES || 30),
  },

  cuas: {
    enabled: bool(process.env.CUAS_SSO_ENABLED, false),
    authorizeUrl: process.env.CUAS_AUTHORIZE_URL || '',
    tokenUrl: process.env.CUAS_TOKEN_URL || '',
    clientId: process.env.CUAS_CLIENT_ID || '',
    clientSecret: process.env.CUAS_CLIENT_SECRET || '',
    redirectUrl: process.env.CUAS_REDIRECT_URL || '',
  },

  d365fo: {
    mock: bool(process.env.D365FO_MOCK, true),
    baseUrl: process.env.D365FO_BASE_URL || '',
    tenantId: process.env.D365FO_TENANT_ID || '',
    clientId: process.env.D365FO_CLIENT_ID || '',
    clientSecret: process.env.D365FO_CLIENT_SECRET || '',
    resource: process.env.D365FO_RESOURCE || '',
    syncCron: process.env.D365FO_SYNC_CRON || '0 6 * * *',
  },

  cns: {
    mock: bool(process.env.CNS_MOCK, true),
    baseUrl: process.env.CNS_BASE_URL || '',
    apiKey: process.env.CNS_API_KEY || '',
  },

  powerbi: {
    mock: bool(process.env.POWERBI_MOCK, true),
    tenantId: process.env.POWERBI_TENANT_ID || '',
    clientId: process.env.POWERBI_CLIENT_ID || '',
    clientSecret: process.env.POWERBI_CLIENT_SECRET || '',
    workspaceId: process.env.POWERBI_WORKSPACE_ID || '',
  },
};
