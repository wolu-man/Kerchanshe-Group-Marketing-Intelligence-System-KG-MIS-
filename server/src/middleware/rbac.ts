import type { NextFunction, Response } from 'express';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';
import type { Request } from 'express';

/**
 * Role-based access control guard (FDS EPIC-04 / FR-04.2).
 * A user whose role lacks permission for an endpoint receives 403.
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new UnauthorizedError('Authentication required'));
    if (allowedRoles.length === 0 || allowedRoles.includes(req.user.role)) return next();
    return next(new ForbiddenError(`Role '${req.user.role}' cannot perform this action`));
  };
}
