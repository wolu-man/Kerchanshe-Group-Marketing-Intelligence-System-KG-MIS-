// =============================================================================
// Power BI integration (FDS EPIC-06, Integration Design 6).
// Power BI reads dedicated reporting views; embed tokens are requested
// server-side and scoped to the user's role. Mock mode returns the seeded
// report catalogue and a placeholder token.
//
// All Power BI API calls and credential handling stay server-side.
// The frontend receives only the embed token + embed URL.
// =============================================================================
import { env } from '../config/env';
import { isRole, type Role } from '../security/permissions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PowerBiReport {
  reportId: string;
  name: string;
  description: string;
  url: string;
}

export interface EmbedToken {
  token: string;
  embedUrl: string;
  expiresAt: string;
  reportId: string;
}

// ---------------------------------------------------------------------------
// Mock catalogue (used when POWERBI_MOCK=true)
// ---------------------------------------------------------------------------

const MOCK_CATALOGUE: PowerBiReport[] = [
  {
    reportId: 'sales-growth',
    name: 'Sales Growth',
    description: 'Monthly sales growth by region, city and outlet.',
    url: 'https://app.powerbi.com/views/sales-growth',
  },
  {
    reportId: 'market-share',
    name: 'Market Share & Price Gaps',
    description: 'Own vs competitor pricing and gap alerts.',
    url: 'https://app.powerbi.com/views/market-share',
  },
  {
    reportId: 'availability',
    name: 'Product Availability',
    description: 'Product availability rate by outlet and region.',
    url: 'https://app.powerbi.com/views/availability',
  },
  {
    reportId: 'forms-analytics',
    name: 'Form & Survey Analytics',
    description: 'Aggregated responses across published forms.',
    url: 'https://app.powerbi.com/views/forms-analytics',
  },
];

const ROLE_REPORTS: Record<string, string[]> = {
  Administrator: MOCK_CATALOGUE.map((r) => r.reportId),
  'Marketing Manager': MOCK_CATALOGUE.map((r) => r.reportId),
  'Marketing Analyst': ['sales-growth', 'market-share', 'forms-analytics'],
  'Field Officer': [],
  Viewer: ['sales-growth', 'market-share'],
};

// ---------------------------------------------------------------------------
// OAuth2 token acquisition (client credentials)
// ---------------------------------------------------------------------------

let cachedToken: { accessToken: string; expiresOn: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresOn - 60_000) {
    return cachedToken.accessToken;
  }

  const { tenantId, clientId, clientSecret } = env.powerbi;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Power BI credentials not configured (POWERBI_TENANT_ID, POWERBI_CLIENT_ID, POWERBI_CLIENT_SECRET)');
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://analysis.windows.net/powerbi/api/.default',
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Power BI OAuth2 failed (${res.status}): ${err}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  cachedToken = {
    accessToken: data.access_token,
    expiresOn: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.accessToken;
}

// ---------------------------------------------------------------------------
// Power BI REST API helpers
// ---------------------------------------------------------------------------

interface PowerBIReportResponse {
  id: string;
  name: string;
  description?: string;
  embedUrl: string;
}

async function getReportFromPowerBI(reportId: string): Promise<PowerBIReportResponse> {
  const accessToken = await getAccessToken();
  const { groupId } = env.powerbi;
  if (!groupId) {
    throw new Error('Power BI GROUP_ID not configured');
  }

  const url = `https://api.powerbi.com/v1.0/myorg/groups/${groupId}/reports/${reportId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Power BI report fetch failed (${res.status}): ${err}`);
  }

  return res.json() as Promise<PowerBIReportResponse>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Reports the given role is allowed to view (Security Matrix 3.8). */
export async function getReportsForRole(role: Role): Promise<PowerBiReport[]> {
  const allowed = ROLE_REPORTS[role] ?? [];

  if (env.powerbi.mock) {
    return MOCK_CATALOGUE.filter((r) => allowed.includes(r.reportId));
  }

  // Live mode: fetch each configured report from Power BI REST API
  const reportIds = env.powerbi.reportIds
    ? env.powerbi.reportIds.split(',').map((id) => id.trim()).filter(Boolean)
    : [];

  const reports: PowerBiReport[] = [];
  for (const reportId of reportIds) {
    if (!allowed.includes(reportId)) continue;
    try {
      const remote = await getReportFromPowerBI(reportId);
      reports.push({
        reportId: remote.id,
        name: remote.name,
        description: remote.description ?? '',
        url: remote.embedUrl,
      });
    } catch {
      // Skip reports the service principal cannot access
    }
  }
  return reports;
}

/** Requests a scoped embed token for a report (server-side, never client). */
export async function getEmbedToken(reportId: string, role: Role): Promise<EmbedToken> {
  if (env.powerbi.mock) {
    return {
      token: `MOCK_EMBED_${reportId}`,
      embedUrl: '',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      reportId,
    };
  }

  const accessToken = await getAccessToken();
  const { groupId, datasetId } = env.powerbi;

  if (!groupId) {
    throw new Error('Power BI GROUP_ID not configured');
  }
  if (!datasetId) {
    throw new Error('Power BI DATASET_ID not configured');
  }

  // 1. Get embed URL from Power BI
  const remote = await getReportFromPowerBI(reportId);

  // 2. Generate embed token with RLS identity
  const tokenUrl = `https://api.powerbi.com/v1.0/myorg/groups/${groupId}/reports/${reportId}/GenerateToken`;
  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      accessLevel: 'View',
      identities: [
        {
          username: `mis-${role}`,
          roles: [role],
          datasets: [datasetId],
        },
      ],
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Power BI embed token failed (${tokenRes.status}): ${err}`);
  }

  const tokenData = await tokenRes.json() as {
    token: string;
    expiration: string;
  };

  return {
    token: tokenData.token,
    embedUrl: remote.embedUrl,
    expiresAt: tokenData.expiration,
    reportId,
  };
}

export function isReportIdKnown(reportId: string): boolean {
  if (env.powerbi.mock) {
    return MOCK_CATALOGUE.some((r) => r.reportId === reportId);
  }
  const reportIds = env.powerbi.reportIds
    ? env.powerbi.reportIds.split(',').map((id) => id.trim()).filter(Boolean)
    : [];
  return reportIds.includes(reportId);
}

// Re-exported for convenience.
export { isRole };
