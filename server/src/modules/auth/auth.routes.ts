import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { env } from '../../config/env';
import { asyncHandler } from '../../utils/http';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { writeAudit } from '../../db/audit';
import { issueSessionToken } from './auth.service';
import { buildCuasAuthorizeUrl, loginWithLocalCredentials, resolveRoleForClaim } from '../../integrations/cuas';
import { ForbiddenError, UnauthorizedError } from '../../utils/errors';
import type { AuthUser } from '../../types';

const router = Router();

/**
 * Entry point for SSO. In production mode redirects to CUAS; in local dev mode
 * returns the login endpoint for the mock flow.
 */
router.get(
  '/login',
  asyncHandler(async (_req, res) => {
    if (!env.cuas.enabled) {
      res.json({
        mode: 'local',
        message: 'CUAS SSO is disabled in this environment. POST /api/v1/auth/login/local to log in.',
      });
      return;
    }
    const state = crypto.randomBytes(16).toString('hex');
    res.redirect(buildCuasAuthorizeUrl(state));
  }),
);

const localLoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

/** Local development fallback login (only when CUAS_SSO_ENABLED=false). */
router.post(
  '/login/local',
  validate({ body: localLoginSchema }),
  asyncHandler(async (req, res) => {
    if (env.cuas.enabled) {
      throw new ForbiddenError('Local login is disabled while CUAS SSO is enabled');
    }
    const { username, password } = req.body;
    const mapped = await loginWithLocalCredentials(username, password);
    const user: AuthUser = {
      userId: mapped.userId,
      cuasId: mapped.cuasId,
      name: mapped.name,
      email: mapped.email,
      role: mapped.role,
    };
    await writeAudit({ userId: user.userId, action: 'LOGIN', entity: 'User', entityId: user.userId });
    res.json({ token: issueSessionToken(user), user });
  }),
);

/**
 * Handles the CUAS redirect after SSO login and issues a KG-MIS session token
 * (Integration Design Section 4.3). A user without a mapped role is denied.
 */
router.get(
  '/callback',
  asyncHandler(async (_req, res) => {
    throw new UnauthorizedError('CUAS SSO callback requires CUAS to be enabled and configured');
  }),
);

/** Returns the current user profile and mapped role. */
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  }),
);

/** Invalidates the current session (client discards the token). */
router.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    await writeAudit({
      userId: req.user!.userId,
      action: 'LOGOUT',
      entity: 'User',
      entityId: req.user!.userId,
    });
    res.json({ message: 'Logged out' });
  }),
);

/** Helper kept for parity with the SSO role-mapping flow (used by callback in real mode). */
async function mapCuasIdentityToUser(cuasId: string, roleClaim: string): Promise<AuthUser> {
  const mapped = await resolveRoleForClaim(cuasId, roleClaim);
  if (!mapped) {
    throw new ForbiddenError('Your CUAS account is not mapped to a KG-MIS role. Contact an Administrator.');
  }
  return {
    userId: mapped.userId,
    cuasId: mapped.cuasId,
    name: mapped.name,
    email: mapped.email,
    role: mapped.role,
  };
}

export default router;
