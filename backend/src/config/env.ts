import fs from 'fs';
import path from 'path';

// Load .env from the backend root, regardless of the process cwd.
function loadEnvFile(): void {
  const candidates = [
    path.resolve(__dirname, '..', '..', '.env'), // dist/config -> backend/.env
    path.resolve(process.cwd(), '.env'),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8');
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq < 1) continue;
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
        if (!(key in process.env)) process.env[key] = value;
      }
      return;
    }
  }
}

loadEnvFile();

function bool(value: string | undefined, fallback = false): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function int(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: int(process.env.PORT, 4000),
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
  app: {
    jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
    jwtExpiresIn: (process.env.JWT_EXPIRES_IN || '8h') as string,
    sessionIdleMinutes: int(process.env.SESSION_IDLE_MINUTES, 120),
  },
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: int(process.env.DB_PORT, 1433),
    instance: process.env.DB_INSTANCE,
    name: process.env.DB_NAME || 'KG_MIS',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    encrypt: bool(process.env.DB_ENCRYPT, false),
    trustServerCertificate: bool(process.env.DB_TRUST_SERVER_CERTIFICATE, true),
  },
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  },
  cuas: {
    mock: bool(process.env.CUAS_MOCK, true),
    ssoUrl: process.env.CUAS_SSO_URL || '',
    clientId: process.env.CUAS_CLIENT_ID || '',
    clientSecret: process.env.CUAS_CLIENT_SECRET || '',
    callbackUrl: process.env.CUAS_CALLBACK_URL || '',
    tokenIssuer: process.env.CUAS_TOKEN_ISSUER || '',
    claimsRoleField: process.env.CUAS_CLAIMS_ROLE_FIELD || 'role',
  },
  d365fo: {
    mock: bool(process.env.D365FO_MOCK, true),
    tenantId: process.env.D365FO_TENANT_ID || '',
    clientId: process.env.D365FO_CLIENT_ID || '',
    clientSecret: process.env.D365FO_CLIENT_SECRET || '',
    resource: process.env.D365FO_RESOURCE || '',
    baseUrl: process.env.D365FO_BASE_URL || '',
    syncCron: process.env.D365FO_SYNC_CRON || '0 6 * * *',
    syncEnabled: bool(process.env.D365FO_SYNC_ENABLED, true),
  },
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: int(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || '',
  },
  powerbi: {
    mock: bool(process.env.POWERBI_MOCK, true),
    tenantId: process.env.POWERBI_TENANT_ID || '',
    clientId: process.env.POWERBI_CLIENT_ID || '',
    clientSecret: process.env.POWERBI_CLIENT_SECRET || '',
    workspaceId: process.env.POWERBI_WORKSPACE_ID || '',
    groupId: process.env.POWERBI_GROUP_ID || '',
    reportIds: process.env.POWERBI_REPORT_IDS || '',
    datasetId: process.env.POWERBI_DATASET_ID || '',
  },
  files: {
    uploadDir: process.env.UPLOAD_DIR || 'uploads',
    maxUploadMb: int(process.env.MAX_UPLOAD_MB, 50),
  },
  ai: {
    /** Default provider used by the Form Assistant when the client asks for "auto". */
    provider: (process.env.AI_PROVIDER || 'auto') as 'auto' | 'ollama' | 'gemini' | 'groq',
    /** Per-request provider timeout (ms). Local models can be slow to warm up. */
    timeoutMs: int(process.env.AI_TIMEOUT_MS, 60000),
    ollama: {
      baseUrl: (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/+$/, ''),
      /** Empty = auto-discover the first installed non-embedding model. */
      model: process.env.OLLAMA_MODEL || '',
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY || '',
      /** Empty = provider default (see providers/gemini.ts). */
      model: process.env.GEMINI_MODEL || '',
    },
    groq: {
      apiKey: process.env.GROQ_API_KEY || '',
      /** Empty = provider default (see providers/groq.ts). */
      model: process.env.GROQ_MODEL || '',
    },
  },
  tenders: {
    /** Scheduled source collection cron expression (overridden by SystemConfig tenders.collectionCron at runtime). */
    collectionCron: process.env.TENDERS_COLLECTION_CRON || '0 */6 * * *',
    /** Daily deadline reminder cron (overridden by SystemConfig tenders.reminderCron). */
    reminderCron: process.env.TENDERS_REMINDER_CRON || '0 9 * * *',
    /** Days before deadline to send reminder (overridden by SystemConfig). */
    reminderLeadDays: int(process.env.TENDERS_REMINDER_LEAD_DAYS, 7),
    /** Per-fetch timeout for source adapters (ms). */
    fetchTimeoutMs: int(process.env.TENDERS_FETCH_TIMEOUT_MS, 30000),
    /** Default per-source rate limit delay (ms). */
    defaultRateLimitMs: int(process.env.TENDERS_DEFAULT_RATE_LIMIT_MS, 2000),
    /** Relevance score threshold for "high relevance" (0-100). */
    highRelevanceThreshold: int(process.env.TENDERS_HIGH_RELEVANCE_THRESHOLD, 70),
    /** Enable scheduled collection (disabled in dev unless explicitly enabled). */
    collectionEnabled: bool(process.env.TENDERS_COLLECTION_ENABLED, false),
    /**
     * TenderMetro REST API key (https://www.tendermetro.com/api/public/v1).
     * Empty = no key configured; the TenderMetro source stays inactive and its
     * ApiConfig header `${TENDERMETRO_API_KEY}` resolves to an unusable value.
     * The key is interpolated at request time and never stored in the database.
     */
    tenderMetroApiKey: process.env.TENDERMETRO_API_KEY?.trim() || '',
    /**
     * Hostnames with no authorized data-access method (JS-only portals behind
     * inspection restrictions, licensed feeds, etc.). Sources on these hosts are
     * always stored inactive and are never fetched. Comma-separated, suffix-matched.
     *
     * Empty by default: the e-GP portal (egp.gov.et / production.egp.gov.et)
     * exposes an authorized public JSON API, which the API adapter consumes.
     * Set TENDERS_RESTRICTED_HOSTS to re-restrict any host.
     */
    restrictedHosts: (process.env.TENDERS_RESTRICTED_HOSTS ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase().replace(/^\.+|\.+$/g, ''))
      .filter((h) => h.length > 0),
  },
} as const;

function validateEnv(): void {
  const isProd = env.nodeEnv === 'production';
  const errors: string[] = [];

  if (isProd) {
    if (env.app.jwtSecret === 'dev-secret-change-me') {
      errors.push('JWT_SECRET must be set to a secure value in production');
    }
    if (env.app.jwtSecret.length < 32) {
      errors.push('JWT_SECRET must be at least 32 characters');
    }
    if (!env.db.user) errors.push('DB_USER is required in production');
    if (!env.db.password) errors.push('DB_PASSWORD is required in production');
    if (!env.db.host || env.db.host === 'localhost') {
      errors.push('DB_HOST should not be localhost in production');
    }
    if (!env.powerbi.mock) {
      if (!env.powerbi.tenantId) errors.push('POWERBI_TENANT_ID is required when POWERBI_MOCK=false');
      if (!env.powerbi.clientId) errors.push('POWERBI_CLIENT_ID is required when POWERBI_MOCK=false');
      if (!env.powerbi.clientSecret) errors.push('POWERBI_CLIENT_SECRET is required when POWERBI_MOCK=false');
      if (!env.powerbi.groupId) errors.push('POWERBI_GROUP_ID is required when POWERBI_MOCK=false');
      if (!env.powerbi.datasetId) errors.push('POWERBI_DATASET_ID is required when POWERBI_MOCK=false');
      if (!env.powerbi.reportIds) errors.push('POWERBI_REPORT_IDS is required when POWERBI_MOCK=false');
    }
  }

  if (errors.length > 0) {
    console.error('\n[env] Configuration errors:');
    for (const e of errors) console.error(`  - ${e}`);
    console.error('');
    if (isProd) process.exit(1);
  }
}

validateEnv();
