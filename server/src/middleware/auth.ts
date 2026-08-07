import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import type { AuthUser, JwtPayload } from '../types';
import { UnauthorizedError } from '../utils/errors';

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

/** Extracts the bearer token from the Authorization header. */
export function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim();
}

/** Verifies the KG-MIS session token and attaches the user to req.user. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) return next(new UnauthorizedError('A valid session token is required'));

  try {
    const payload = jwt.verify(token, env.app.jwtSecret) as unknown as JwtPayload;
    req.user = {
      userId: payload.sub,
      cuasId: payload.cuasId,
      name: payload.name,
      email: payload.email,
      role: payload.role,
    };
    next();
  } catch {
    return next(new UnauthorizedError('Session token is invalid or has expired'));
  }
}

/** Optional auth - attaches the user if a valid token is present, otherwise continues. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, env.app.jwtSecret) as unknown as JwtPayload;
    req.user = {
      userId: payload.sub,
      cuasId: payload.cuasId,
      name: payload.name,
      email: payload.email,
      role: payload.role,
    };
  } catch {
    // Ignore invalid token for optional endpoints.
  }
  next();
}
