import { env } from '../config/env';

export interface PowerBiReport {
  reportId: string;
  name: string;
  embedUrl: string;
  workspaceId: string;
}

export interface EmbedToken {
  token: string;
  expiry: string;
}

const SEEDED_REPORTS: PowerBiReport[] = [
  { reportId: 'rp-dashboard', name: 'Executive Dashboard', embedUrl: 'https://app.powerbi.com/placeholder/rp-dashboard', workspaceId: 'default' },
  { reportId: 'rp-sales', name: 'Sales Performance', embedUrl: 'https://app.powerbi.com/placeholder/rp-sales', workspaceId: 'default' },
  { reportId: 'rp-pricing', name: 'Competitor Pricing', embedUrl: 'https://app.powerbi.com/placeholder/rp-pricing', workspaceId: 'default' },
  { reportId: 'rp-surveys', name: 'Survey Insights', embedUrl: 'https://app.powerbi.com/placeholder/rp-surveys', workspaceId: 'default' },
];

/**
 * Power BI connector (FDS EPIC-06 / FR-06.5).
 * When POWERBI_MOCK=true a placeholder embed token is returned and the report
 * catalogue is seeded. The real adapter requests a scoped embed token on behalf
 * of the logged-in user via the Power BI REST API.
 */
export async function listReportsForRole(role: string): Promise<PowerBiReport[]> {
  // Viewer/read-only roles get the catalogue; management roles get everything.
  const all = SEEDED_REPORTS;
  if (role === 'Viewer') return all.slice(0, 2);
  return all;
}

export async function requestEmbedToken(reportId: string): Promise<EmbedToken> {
  if (env.powerbi.mock) {
    return {
      token: `mock-token-${reportId}`,
      expiry: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };
  }
  // TODO: implement Power BI REST API embed token request once workspace access confirmed.
  throw new Error('Power BI live embed token not configured');
}
