import type { Role } from '../security/permissions';

export interface AuthUser {
  userId: number;
  cuasId: string;
  name: string;
  email: string | null;
  role: Role;
  profilePhoto?: string | null;
}

// Augmented Express.Request
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      /** Row-level data scope resolved for the current user+action. */
      scope?: { write: boolean; dataScope: 'all' | 'own' | 'region' };
    }
  }
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
