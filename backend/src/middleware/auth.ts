import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import sql from 'mssql';
import { env } from '../config/env';
import { db } from '../db/pool';
import { UnauthorizedError } from '../utils/errors';
import { isRole, type Role } from '../security/permissions';

interface TokenPayload {
  sub: number;
  cuasId: string;
  name: string;
  email: string | null;
  role: string;
  iat: number;
  exp: number;
}

// Cache of recently validated user IDs to avoid a DB hit on every request.
// { userId -> { expiresAt, isActive } }
const activeUserCache = new Map<number, { expiresAt: number; isActive: boolean }>();
const CACHE_TTL_MS = 30_000; // 30 seconds

// Authenticates the bearer JWT on every request and re-validates the mapped
// role (Security Matrix 5; FDS FR-04.2/04.4). Roles re-resolved at login.
// Also checks IsActive to enforce deactivation in real-time (Security Matrix 5.1).
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing bearer token'));
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    const decoded = jwt.verify(token, env.app.jwtSecret) as unknown as TokenPayload;
    if (!decoded.sub || !isRole(decoded.role)) {
      return next(new UnauthorizedError('Invalid session'));
    }

    // Fast path: serve from cache if still valid.
    const cached = activeUserCache.get(decoded.sub);
    if (cached && cached.expiresAt > Date.now()) {
      if (!cached.isActive) {
        return next(new UnauthorizedError('Account is deactivated'));
      }
      req.user = {
        userId: decoded.sub,
        cuasId: decoded.cuasId,
        name: decoded.name,
        email: decoded.email,
        role: decoded.role as Role,
      };
      return next();
    }

    // Slow path: validate against DB with a short timeout.
    const validateUser = async () => {
      try {
        const result = await db.request()
          .input('UserId', sql.Int, decoded.sub)
          .query('SELECT IsActive FROM dbo.[User] WHERE UserID = @UserId');
        if (result.recordset.length === 0 || !result.recordset[0].IsActive) {
          activeUserCache.set(decoded.sub, { expiresAt: Date.now() + CACHE_TTL_MS, isActive: false });
          return next(new UnauthorizedError('Account is deactivated'));
        }
        activeUserCache.set(decoded.sub, { expiresAt: Date.now() + CACHE_TTL_MS, isActive: true });
        req.user = {
          userId: decoded.sub,
          cuasId: decoded.cuasId,
          name: decoded.name,
          email: decoded.email,
          role: decoded.role as Role,
        };
        return next();
      } catch {
        // If the DB is temporarily unreachable, allow the request if the JWT is valid
        // and the user was recently validated (within the last 60 seconds).
        const staleCache = activeUserCache.get(decoded.sub);
        if (staleCache && staleCache.isActive && Date.now() - staleCache.expiresAt < 60_000) {
          req.user = {
            userId: decoded.sub,
            cuasId: decoded.cuasId,
            name: decoded.name,
            email: decoded.email,
            role: decoded.role as Role,
          };
          return next();
        }
        return next(new UnauthorizedError('Session validation failed'));
      }
    };

    validateUser();
  } catch {
    return next(new UnauthorizedError('Session expired or invalid'));
  }
}
