// =============================================================================
// CUAS integration - SSO login and role-claim retrieval (FDS EPIC-04,
// Integration Design Section 4).
// Production: OAuth2/SAML redirect flow, token validated on every session,
// fail-secure (no access when CUAS is unreachable).
// Development: CUAS_MOCK=true enables local dev accounts; never used in prod.
// =============================================================================
import { env } from '../config/env';
import { UnauthorizedError } from '../utils/errors';

export interface CuasIdentity {
  cuasId: string;
  name: string;
  email: string | null;
  /** raw claim/group value that maps to an internal role via RoleMapping */
  roleClaim: string;
}

export function isSsoConfigured(): boolean {
  return !env.cuas.mock && Boolean(env.cuas.ssoUrl && env.cuas.clientId);
}

/** URL the web portal redirects unauthenticated users to (CUAS SSO). */
export function buildLoginUrl(returnTo: string): string {
  if (isSsoConfigured()) {
    const params = new URLSearchParams({
      client_id: env.cuas.clientId,
      redirect_uri: env.cuas.callbackUrl,
      response_type: 'code',
      scope: 'openid profile role',
      state: Buffer.from(returnTo).toString('base64'),
    });
    return `${env.cuas.ssoUrl}/authorize?${params.toString()}`;
  }
  // Mock SSO: portal keeps the user on the local login screen.
  return '';
}

/**
 * Exchanges an authorization code for a validated identity + role claim.
 * Production TODO: call CUAS token endpoint, validate the id_token (issuer,
 * audience, signature, expiry), and extract the claim named by
 * CUAS_CLAIMS_ROLE_FIELD. Fail-secure: any validation failure throws.
 */
export async function exchangeCode(code: string): Promise<CuasIdentity> {
  if (!isSsoConfigured()) {
    throw new UnauthorizedError('CUAS SSO is not configured for this environment');
  }
  // TODO(prod): POST {env.cuas.ssoUrl}/oauth/token with grant_type=authorization_code,
  //             client_id/client_secret; verify id_token; decode claims.
  void code;
  throw new UnauthorizedError('CUAS SSO endpoint not yet wired');
}
