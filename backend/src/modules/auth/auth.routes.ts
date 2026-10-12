import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler } from '../../utils/http';
import { buildLoginUrl, exchangeCode } from '../../integrations/cuas';
import { issueSessionToken, localLogin, upsertUserFromCuas, getProfile, updateProfile, changePassword, uploadPhoto } from './auth.service';
import { formUpload } from '../forms/upload';
import { audit } from '../../db/audit';
import { UnauthorizedError } from '../../utils/errors';
import type { Request } from 'express';

function logAudit(req: Request, entry: { userId: number | null; action: string; entity: string; entityId?: number | null; detail?: Record<string, unknown> | null }) {
  return audit({ ...entry, ipAddress: req.ip });
}

const router = Router();

// GET /api/v1/auth/login - SSO entry point (redirects to CUAS; dev returns info)
router.get(
  '/login',
  asyncHandler(async (_req, res) => {
    const returnTo = '/';
    const ssoUrl = buildLoginUrl(returnTo);
    if (ssoUrl) {
      res.redirect(ssoUrl);
      return;
    }
    res.json({
      ssoConfigured: false,
      mock: env.cuas.mock,
      message: 'CUAS SSO not configured; use local dev login.',
    });
  })
);

const loginSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});

// POST /api/v1/auth/login/local - dev fallback (only when CUAS_MOCK=true)
router.post(
  '/login/local',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const user = await localLogin(req.body.username, req.body.password);
    await logAudit(req,{
      userId: user.userId,
      action: 'LOGIN',
      entity: 'User',
      entityId: user.userId,
    });
    res.json({ token: issueSessionToken(user), user });
  })
);

// GET /api/v1/auth/callback - CUAS OAuth2 redirect handler
router.get(
  '/callback',
  asyncHandler(async (req, res) => {
    const code = req.query.code as string | undefined;
    if (!code) throw new UnauthorizedError('Missing authorization code');
    const identity = await exchangeCode(code);
    const user = await upsertUserFromCuas(identity.cuasId, identity.name, identity.email, identity.roleClaim);
    await logAudit(req,{ userId: user.userId, action: 'LOGIN', entity: 'User', entityId: user.userId });
    const token = issueSessionToken(user);
    res.redirect(`${req.query.state ? Buffer.from(req.query.state as string, 'base64').toString() : '/'}?token=${token}`);
  })
);

// GET /api/v1/auth/me - current profile + mapped role
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getProfile(req.user!.userId);
    res.json({ user });
  })
);

// POST /api/v1/auth/logout - invalidates client session (stateless JWT)
router.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    await logAudit(req,{ userId: req.user!.userId, action: 'LOGOUT', entity: 'User', entityId: req.user!.userId });
    res.json({ ok: true });
  })
);

const profileSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  email: z.string().max(200).optional().nullable(),
});

router.put(
  '/profile',
  requireAuth,
  validate(profileSchema),
  asyncHandler(async (req, res) => {
    const user = await updateProfile(req.user!.userId, req.body);
    const token = issueSessionToken(user);
    await logAudit(req,{ userId: req.user!.userId, action: 'UPDATE', entity: 'User', entityId: req.user!.userId, detail: { field: 'profile' } });
    res.json({ user, token });
  })
);

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6).max(200),
});

router.put(
  '/password',
  requireAuth,
  validate(passwordSchema),
  asyncHandler(async (req, res) => {
    await changePassword(req.user!.userId, req.body.currentPassword, req.body.newPassword);
    await logAudit(req,{ userId: req.user!.userId, action: 'UPDATE', entity: 'User', entityId: req.user!.userId, detail: { field: 'password' } });
    res.json({ ok: true });
  })
);

router.post(
  '/photo',
  requireAuth,
  formUpload.single('file'),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) { res.status(400).json({ error: 'No file uploaded' }); return; }
    const storageUrl = `/uploads/${file.filename}`;
    const user = await uploadPhoto(req.user!.userId, storageUrl);
    const token = issueSessionToken(user);
    await logAudit(req,{ userId: req.user!.userId, action: 'UPDATE', entity: 'User', entityId: req.user!.userId, detail: { field: 'profilePhoto' } });
    res.status(201).json({ profilePhoto: storageUrl, user, token });
  })
);

export { router as authRouter };
