import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import type { AuthUser } from '../../types';

export function issueSessionToken(user: AuthUser): string {
  const payload = {
    sub: user.userId,
    cuasId: user.cuasId,
    name: user.name,
    email: user.email ?? null,
    role: user.role,
  };
  return jwt.sign(payload, env.app.jwtSecret, {
    expiresIn: env.app.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
}
