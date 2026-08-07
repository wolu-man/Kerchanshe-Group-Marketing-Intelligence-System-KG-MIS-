import { env } from '../config/env';
import { getPool } from '../db/pool';
import sql from 'mssql';
import bcrypt from 'bcryptjs';
import { UnauthorizedError } from '../utils/errors';

export interface CuasIdentity {
  cuasId: string;
  name: string;
  email?: string;
  roleClaim: string;
}

export interface MappedUser {
  userId: number;
  cuasId: string;
  name: string;
  email?: string;
  role: string;
}

/**
 * Resolves the internal role for a CUAS role claim using the RoleMapping table
 * (FDS EPIC-04 / FR-04.3). Returns null when no mapping exists.
 */
export async function resolveRoleForClaim(cuasId: string, roleClaim: string): Promise<MappedUser | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('cuasId', sql.VarChar(100), cuasId)
    .input('claim', sql.VarChar(150), roleClaim)
    .query(`
      SELECT u.UserID, u.CUAS_ID, u.Name, u.Email, r.RoleName
      FROM dbo.[User] u
      JOIN dbo.Role r ON r.RoleID = u.RoleID
      WHERE u.CUAS_ID = @cuasId AND u.IsActive = 1
        AND u.RoleID = (SELECT RoleID FROM dbo.RoleMapping WHERE CUASClaim = @claim)
    `);

  const row = result.recordset[0];
  if (!row) return null;
  return {
    userId: row.UserID,
    cuasId: row.CUAS_ID,
    name: row.Name,
    email: row.Email,
    role: row.RoleName,
  };
}

/**
 * Local development fallback authentication (used only when CUAS_SSO_ENABLED=false).
 * Mirrors the production SSO flow: identity -> role claim -> internal role mapping.
 */
export async function loginWithLocalCredentials(cuasId: string, password: string): Promise<MappedUser> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('cuasId', sql.VarChar(100), cuasId)
    .query(`
      SELECT u.UserID, u.CUAS_ID, u.Name, u.Email, u.PasswordHash, r.RoleName
      FROM dbo.[User] u
      JOIN dbo.Role r ON r.RoleID = u.RoleID
      WHERE u.CUAS_ID = @cuasId AND u.IsActive = 1
    `);

  const row = result.recordset[0];
  if (!row) throw new UnauthorizedError('Invalid username or password');

  const valid = row.PasswordHash && bcrypt.compareSync(password, row.PasswordHash);
  if (!valid) throw new UnauthorizedError('Invalid username or password');

  return {
    userId: row.UserID,
    cuasId: row.CUAS_ID,
    name: row.Name,
    email: row.Email,
    role: row.RoleName,
  };
}

/** Builds the CUAS authorization URL for the SSO redirect (production mode). */
export function buildCuasAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.cuas.clientId,
    redirect_uri: env.cuas.redirectUrl,
    response_type: 'code',
    scope: 'openid profile roles',
    state,
  });
  return `${env.cuas.authorizeUrl}?${params.toString()}`;
}

/**
 * Exchanges an authorization code for a CUAS identity with role claims.
 * Stub: replace with the real CUAS token/userinfo calls once access is confirmed.
 */
export async function exchangeCuasCode(_code: string): Promise<CuasIdentity> {
  throw new UnauthorizedError('CUAS SSO exchange not configured. Enable local dev login or set CUAS_SSO_ENABLED and CUAS endpoints.');
}
