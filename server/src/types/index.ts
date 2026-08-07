import type { Request } from 'express';

export const ROLES = {
  ADMINISTRATOR: 'Administrator',
  MARKETING_MANAGER: 'Marketing Manager',
  MARKETING_ANALYST: 'Marketing Analyst',
  FIELD_OFFICER: 'Field Officer',
  VIEWER: 'Viewer',
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

export interface AuthUser {
  userId: number;
  cuasId: string;
  name: string;
  email?: string | null;
  role: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export interface JwtPayload {
  sub: number;
  cuasId: string;
  name: string;
  email?: string | null;
  role: string;
  iat?: number;
  exp?: number;
}
