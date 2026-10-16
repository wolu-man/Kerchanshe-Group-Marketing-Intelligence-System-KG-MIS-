// =============================================================================
// Configuration Store Abstraction
// Provides a unified interface for reading/writing configuration values.
// Supports .env file (local dev) and SystemConfig table (production).
// =============================================================================

import fs from 'fs';
import path from 'path';
import sql from 'mssql';
import { db } from '../db/pool';
import { env } from './env';
import { logger } from './logger';

export interface ConfigStore {
  /** Get a configuration value by key. Returns null if not set. */
  get(key: string): Promise<string | null>;
  /** Set a configuration value. Validates before persisting. */
  set(key: string, value: string): Promise<void>;
  /** Get all configuration values (for debugging/admin). */
  getAll(): Promise<Record<string, string>>;
}

/** Keys that are considered secrets and should never be logged. */
const SECRET_KEYS = new Set([
  'GEMINI_API_KEY',
  'GROQ_API_KEY',
  'JWT_SECRET',
  'DB_PASSWORD',
  'CUAS_CLIENT_SECRET',
  'D365FO_CLIENT_SECRET',
  'POWERBI_CLIENT_SECRET',
  'SMTP_PASS',
  'TENDERMETRO_API_KEY',
]);

function isSecretKey(key: string): boolean {
  return SECRET_KEYS.has(key.toUpperCase());
}

function redactValue(key: string, value: string): string {
  return isSecretKey(key) ? '***REDACTED***' : value;
}

/**
 * DotEnvConfigStore - reads/writes the backend .env file.
 * Used in local development (NODE_ENV !== 'production').
 * Preserves comments, formatting, and unrelated keys.
 */
export class DotEnvConfigStore implements ConfigStore {
  private envPath: string;

  constructor() {
    // Resolve .env path relative to backend root (dist/config -> backend/.env)
    this.envPath = path.resolve(__dirname, '..', '..', '.env');
  }

  async get(key: string): Promise<string | null> {
    const normalizedKey = key.toUpperCase();
    // First check process.env (includes .env loaded at startup)
    const fromProcess = process.env[normalizedKey];
    if (fromProcess !== undefined) return fromProcess;

    // Fallback: read file directly
    try {
      if (!fs.existsSync(this.envPath)) return null;
      const content = fs.readFileSync(this.envPath, 'utf8');
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq < 1) continue;
        const k = trimmed.slice(0, eq).trim().toUpperCase();
        const v = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
        if (k === normalizedKey) return v;
      }
    } catch (err) {
      logger.warn('config.dotenv.read_failed', { key: normalizedKey, error: (err as Error).message });
    }
    return null;
  }

  async set(key: string, value: string): Promise<void> {
    const normalizedKey = key.toUpperCase();
    const lines: string[] = [];

    // Read existing content
    let content = '';
    if (fs.existsSync(this.envPath)) {
      content = fs.readFileSync(this.envPath, 'utf8');
    }

    let found = false;
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        lines.push(line);
        continue;
      }
      const eq = trimmed.indexOf('=');
      if (eq < 1) {
        lines.push(line);
        continue;
      }
      const k = trimmed.slice(0, eq).trim();
      if (k.toUpperCase() === normalizedKey) {
        // Replace this line, preserving quote style if any
        const originalValue = trimmed.slice(eq + 1).trim();
        const quoted = /^["']/.test(originalValue);
        lines.push(`${k}=${quoted ? `"${value}"` : value}`);
        found = true;
      } else {
        lines.push(line);
      }
    }

    if (!found) {
      // Append new key at the end
      lines.push('');
      lines.push(`${normalizedKey}=${value}`);
    }

    // Atomic write: write to temp file then rename
    const tempPath = `${this.envPath}.tmp`;
    try {
      fs.writeFileSync(tempPath, lines.join('\n'), 'utf8');
      fs.renameSync(tempPath, this.envPath);
    } catch (err) {
      // Cleanup temp file on failure
      try { fs.unlinkSync(tempPath); } catch {}
      throw err;
    }

    // Update process.env so current process sees the change immediately
    process.env[normalizedKey] = value;

    logger.info('config.dotenv.updated', { key: normalizedKey, value: redactValue(normalizedKey, value) });
  }

  async getAll(): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    try {
      if (!fs.existsSync(this.envPath)) return result;
      const content = fs.readFileSync(this.envPath, 'utf8');
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq < 1) continue;
        const k = trimmed.slice(0, eq).trim();
        const v = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
        result[k] = v;
      }
    } catch (err) {
      logger.warn('config.dotenv.getall_failed', { error: (err as Error).message });
    }
    return result;
  }
}

/**
 * SystemConfigStore - reads/writes the dbo.SystemConfig table.
 * Used in production for secure, server-side configuration.
 * Secrets should be stored in a secret manager (Key Vault, etc.) in real production.
 * This implementation uses the database as a fallback.
 */
export class SystemConfigStore implements ConfigStore {
  async get(key: string): Promise<string | null> {
    try {
      const result = await db.request()
        .input('Key', sql.VarChar(100), key)
        .query('SELECT ConfigValue FROM dbo.SystemConfig WHERE ConfigKey = @Key');
      return result.recordset[0]?.ConfigValue ?? null;
    } catch (err) {
      logger.error('config.systemconfig.get_failed', { key, error: (err as Error).message });
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      await db.request()
        .input('Key', sql.VarChar(100), key)
        .input('Value', sql.NVarChar(500), value)
        .input('UpdatedBy', sql.Int, null) // System update, no user context
        .query(`
          MERGE dbo.SystemConfig AS target
          USING (SELECT @Key AS ConfigKey) AS source
          ON target.ConfigKey = source.ConfigKey
          WHEN MATCHED THEN UPDATE SET ConfigValue = @Value, UpdatedAt = SYSUTCDATETIME(), UpdatedBy = @UpdatedBy
          WHEN NOT MATCHED THEN INSERT (ConfigKey, ConfigValue, UpdatedAt, UpdatedBy) VALUES (@Key, @Value, SYSUTCDATETIME(), @UpdatedBy);
        `);
      logger.info('config.systemconfig.updated', { key, value: redactValue(key, value) });
    } catch (err) {
      logger.error('config.systemconfig.set_failed', { key, error: (err as Error).message });
      throw err;
    }
  }

  async getAll(): Promise<Record<string, string>> {
    try {
      const result = await db.request().query('SELECT ConfigKey, ConfigValue FROM dbo.SystemConfig');
      const obj: Record<string, string> = {};
      for (const row of result.recordset) {
        obj[row.ConfigKey] = row.ConfigValue;
      }
      return obj;
    } catch (err) {
      logger.error('config.systemconfig.getall_failed', { error: (err as Error).message });
      return {};
    }
  }
}

/**
 * Factory function to get the appropriate ConfigStore based on environment.
 * In production, you should replace SystemConfigStore with a SecretManagerStore
 * that integrates with Azure Key Vault, AWS Secrets Manager, or HashiCorp Vault.
 */
export function getConfigStore(): ConfigStore {
  if (env.nodeEnv === 'production') {
    logger.info('config.store.selected', { store: 'SystemConfigStore' });
    return new SystemConfigStore();
  }
  logger.info('config.store.selected', { store: 'DotEnvConfigStore' });
  return new DotEnvConfigStore();
}

/**
 * Configuration keys used by AI Renewal feature.
 */
export const AI_CONFIG_KEYS = {
  GEMINI_API_KEY: 'GEMINI_API_KEY',
  GROQ_API_KEY: 'GROQ_API_KEY',
  ROTATION_ENABLED: 'ai.rotation.enabled',
  ROTATION_INTERVAL_DAYS: 'ai.rotation.intervalDays',
  ROTATION_NEXT_RUN: 'ai.rotation.nextRun',
  ROTATION_PROVIDER: 'ai.rotation.provider',
  ROTATION_DUE: 'ai.rotation.due',
} as const;

export type AiConfigKey = (typeof AI_CONFIG_KEYS)[keyof typeof AI_CONFIG_KEYS];