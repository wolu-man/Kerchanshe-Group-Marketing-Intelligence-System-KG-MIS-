import sql from 'mssql';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { env } from '../../config/env';
import { db } from '../../db/pool';
import { UnauthorizedError, ForbiddenError, BadRequestError } from '../../utils/errors';
import { isRole, type Role } from '../../security/permissions';
import type { AuthUser } from '../../types';

interface UserRow {
  UserID: number;
  CUAS_ID: string;
  Name: string;
  Email: string | null;
  RoleID: number;
  RoleName: string;
  ProfilePhoto: string | null;
}

export function issueSessionToken(user: AuthUser): string {
  const payload = {
    sub: user.userId,
    cuasId: user.cuasId,
    name: user.name,
    email: user.email,
    role: user.role,
    profilePhoto: user.profilePhoto ?? null,
  };
  return jwt.sign(payload, env.app.jwtSecret, {
    expiresIn: env.app.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

function toAuthUser(row: UserRow): AuthUser {
  if (!isRole(row.RoleName)) {
    throw new ForbiddenError('No role mapped for your account. Contact the administrator.');
  }
  return {
    userId: row.UserID,
    cuasId: row.CUAS_ID,
    name: row.Name,
    email: row.Email,
    role: row.RoleName as Role,
    profilePhoto: row.ProfilePhoto ?? null,
  };
}

/**
 * CUAS SSO: maps the validated CUAS identity to an internal user/role
 * (FR-04.3). Role mapping changes take effect on next login (FDS business rule).
 * A user without a mapped claim is denied (FR-04.5) - no default access.
 */
export async function upsertUserFromCuas(cuasId: string, name: string, email: string | null, roleClaim: string): Promise<AuthUser> {
  const mapping = await db
    .request()
    .input('Claim', sql.VarChar(150), roleClaim)
    .query(
      `SELECT rm.RoleID, r.RoleName
       FROM dbo.RoleMapping rm JOIN dbo.Role r ON r.RoleID = rm.RoleID
       WHERE rm.CUASClaim = @Claim`
    );
  if (mapping.recordset.length === 0) {
    throw new ForbiddenError('No role mapped for your account. Contact the administrator.');
  }
  const roleId = mapping.recordset[0].RoleID;
  const roleName = mapping.recordset[0].RoleName;

  const existing = await db
    .request()
    .input('CuasId', sql.VarChar(100), cuasId)
    .query('SELECT * FROM dbo.[User] WHERE CUAS_ID = @CuasId');
  if (existing.recordset.length === 0) {
    const insert = await db
      .request()
      .input('CuasId', sql.VarChar(100), cuasId)
      .input('Name', sql.NVarChar(150), name)
      .input('Email', sql.NVarChar(200), email)
      .input('RoleId', sql.Int, roleId)
      .query(
        `INSERT INTO dbo.[User] (CUAS_ID, Name, Email, RoleID)
         OUTPUT INSERTED.UserID VALUES (@CuasId, @Name, @Email, @RoleId)`
      );
    const userId = insert.recordset[0].UserID;
    return { userId, cuasId, name, email, role: roleName as Role };
  }

  const row = existing.recordset[0] as UserRow;
  if (row.RoleID !== roleId) {
    await db
      .request()
      .input('UserId', sql.Int, row.UserID)
      .input('RoleId', sql.Int, roleId)
      .query('UPDATE dbo.[User] SET RoleID = @RoleId, UpdatedAt = SYSUTCDATETIME() WHERE UserID = @UserId');
    row.RoleName = roleName;
  }
  return toAuthUser(row);
}

/**
 * Dev-only fallback login (CUAS_MOCK=true). Never available in production.
 * Authenticates against the local dev user table.
 */
export async function localLogin(username: string, password: string): Promise<AuthUser> {
  if (!env.cuas.mock) {
    throw new UnauthorizedError('Local login is disabled. Use CUAS SSO.');
  }
  const result = await db
    .request()
    .input('Username', sql.VarChar(100), username)
    .query(
      `SELECT u.UserID, u.CUAS_ID, u.Name, u.Email, u.RoleID, u.PasswordHash, u.IsActive, r.RoleName
       FROM dbo.[User] u JOIN dbo.Role r ON r.RoleID = u.RoleID
       WHERE u.CUAS_ID = @Username`
    );
  const row = result.recordset[0];
  if (!row || !row.PasswordHash) {
    throw new UnauthorizedError('Invalid username or password');
  }
  if (!row.IsActive) {
    throw new UnauthorizedError('Account is deactivated');
  }
  const valid = await bcrypt.compare(password, row.PasswordHash);
  if (!valid) {
    throw new UnauthorizedError('Invalid username or password');
  }
  return toAuthUser(row as UserRow);
}

export async function getProfile(userId: number): Promise<AuthUser> {
  const result = await db
    .request()
    .input('UserId', sql.Int, userId)
    .query(
      `SELECT u.UserID, u.CUAS_ID, u.Name, u.Email, u.RoleID, u.IsActive, u.ProfilePhoto, r.RoleName
       FROM dbo.[User] u JOIN dbo.Role r ON r.RoleID = u.RoleID
       WHERE u.UserID = @UserId`
    );
  if (result.recordset.length === 0) {
    throw new UnauthorizedError('Account not found');
  }
  const row = result.recordset[0];
  if (!row.IsActive) {
    throw new UnauthorizedError('Account is deactivated');
  }
  return toAuthUser(row as UserRow);
}

export async function updateProfile(userId: number, data: { name?: string; email?: string }): Promise<AuthUser> {
  const sets: string[] = ['UpdatedAt = SYSUTCDATETIME()'];
  const request = db.request().input('UserId', sql.Int, userId);
  if (data.name !== undefined) {
    sets.push('Name = @Name');
    request.input('Name', sql.NVarChar(150), data.name);
  }
  if (data.email !== undefined) {
    sets.push('Email = @Email');
    request.input('Email', sql.NVarChar(200), data.email);
  }
  await request.query(`UPDATE dbo.[User] SET ${sets.join(', ')} WHERE UserID = @UserId`);
  return getProfile(userId);
}

export async function changePassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
  const result = await db
    .request()
    .input('UserId', sql.Int, userId)
    .query('SELECT PasswordHash FROM dbo.[User] WHERE UserID = @UserId');
  const row = result.recordset[0];
  if (!row || !row.PasswordHash) {
    throw new BadRequestError('No password set for this account. Contact the administrator.', 'NO_PASSWORD');
  }
  const valid = await bcrypt.compare(currentPassword, row.PasswordHash);
  if (!valid) {
    throw new BadRequestError('Current password is incorrect', 'INVALID_PASSWORD');
  }
  const hash = await bcrypt.hash(newPassword, 10);
  await db
    .request()
    .input('UserId', sql.Int, userId)
    .input('Hash', sql.NVarChar(255), hash)
    .query('UPDATE dbo.[User] SET PasswordHash = @Hash, UpdatedAt = SYSUTCDATETIME() WHERE UserID = @UserId');
}

export async function uploadPhoto(userId: number, profilePhoto: string): Promise<AuthUser> {
  await db
    .request()
    .input('UserId', sql.Int, userId)
    .input('Photo', sql.NVarChar(500), profilePhoto)
    .query('UPDATE dbo.[User] SET ProfilePhoto = @Photo, UpdatedAt = SYSUTCDATETIME() WHERE UserID = @UserId');
  return getProfile(userId);
}
