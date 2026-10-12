import type { NextFunction, Request, Response } from 'express';
import { resolveCapability } from '../security/permissions';
import { ForbiddenError } from '../utils/errors';

/**
 * Action-level RBAC guard (Security Matrix 3.x). Resolves the capability for
 * the action + the current user's role, then attaches the row-level data scope
 * to the request so services apply it on every query.
 */
export function can(action: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new ForbiddenError('Authentication required'));
    const cap = resolveCapability(action, req.user.role);
    if (!cap.allowed) {
      return next(new ForbiddenError(`Role '${req.user.role}' cannot perform this action`));
    }
    req.scope = { write: cap.write, dataScope: cap.scope };
    return next();
  };
}
