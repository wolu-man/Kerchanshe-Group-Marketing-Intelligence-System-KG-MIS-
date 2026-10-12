// =============================================================================
// Relevance Scoring v2 — computes 0-100 score for an opportunity against active
// TenderInterestProfile rows (plan §17).
//
// Weight budget (sums to 100):
//   keywords 28 | productGroup 14 | sector 12 | country 9 | organization 8 |
//   value+currency 6 | deadline feasibility 5 | type match 5 |
//   businessUnit 4 | sourceQuality 4 | historicalInterest 5
//
// historicalInterest = product-group save-rate (SavedTender rows normalized by
// the busiest group) — the user's own saving behavior as a popularity prior.
// All components are pure functions of (opportunity side, profile, extras) so
// explainScore() can show the exact breakdown for any opportunity.
// =============================================================================

import sql from 'mssql';
import { db } from '../../db/pool';
import { logger } from '../../config/logger';
import { env } from '../../config/env';
import type { RawOpportunity } from './adapters/adapter';

export const RELEVANCE_WEIGHTS = {
  keywords: 28,
  productGroup: 14,
  sector: 12,
  country: 9,
  organization: 8,
  value: 6,
  deadline: 5,
  type: 5,
  businessUnit: 4,
  sourceQuality: 4,
  historicalInterest: 5,
} as const;

export type ComponentKey = keyof typeof RELEVANCE_WEIGHTS;

export const COMPONENT_LABELS: Record<ComponentKey, string> = {
  keywords: 'Keyword match',
  productGroup: 'Product group',
  sector: 'Sector',
  country: 'Country',
  organization: 'Organization',
  value: 'Value & currency',
  deadline: 'Deadline feasibility',
  type: 'Opportunity type',
  businessUnit: 'Business unit',
  sourceQuality: 'Source quality',
  historicalInterest: 'Historical interest',
};

export interface ActiveProfile {
  InterestProfileID: number;
  Name: string;
  Sectors: string[];
  Keywords: string[];
  Countries: string[];
  MinValue: number | null;
  MaxValue: number | null;
  Currency: string | null;
  Organizations: string[];
  ProductGroupCodes: string[];
  Types: string[];
  BusinessGroupCodes: string[];
}

/** Normalized opportunity attributes the scorer needs (DB row or RawOpportunity). */
export interface OpportunitySide {
  title: string;
  description: string;
  country: string | null;
  sector: string | null;
  organization: string | null;
  estimatedValue: number | null;
  currency: string | null;
  deadlineDate: Date | null;
  opportunityType: string;
  productGroupId: number | null;
  productGroupCode: string | null;
  businessGroupCode: string | null;
  /** dbo.TenderSource.QualityScore (0-100); null when the row has no source. */
  sourceQuality: number | null;
}

/** Per-run extras that come from aggregates / config, not the row itself. */
export interface ScoreExtras {
  /** Normalized save-rate (0..1) for this row's product group. */
  saveRate: number;
  /** Actionable-within window in days (tenders.reminderLeadDays). */
  leadDays: number;
}

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((v) => String(v).toLowerCase()) : [];
  } catch {
    return [];
  }
}

/** Loads all active interest profiles from the DB. */
async function loadActiveProfiles(): Promise<ActiveProfile[]> {
  const result = await db.request().query(
    `SELECT InterestProfileID, Name, Sectors, Keywords, Countries,
            MinValue, MaxValue, Currency, Organizations, ProductGroupCodes,
            Types, BusinessGroupCodes
     FROM dbo.TenderInterestProfile
     WHERE IsActive = 1`
  );
  return result.recordset.map((row) => ({
    InterestProfileID: row.InterestProfileID,
    Name: row.Name,
    Sectors: parseJsonArray(row.Sectors),
    Keywords: parseJsonArray(row.Keywords),
    Countries: parseJsonArray(row.Countries),
    MinValue: row.MinValue,
    MaxValue: row.MaxValue,
    Currency: row.Currency,
    Organizations: parseJsonArray(row.Organizations),
    ProductGroupCodes: parseJsonArray(row.ProductGroupCodes),
    Types: parseJsonArray(row.Types),
    BusinessGroupCodes: parseJsonArray(row.BusinessGroupCodes),
  }));
}

/**
 * Per-product-group save rate (0..1): SavedTender rows grouped by the
 * opportunity's ProductGroupId, normalized by the busiest group. Groups with
 * no saves map to 0; opportunities without a group get 0 via loadSaveRate().
 */
async function loadSaveRates(): Promise<Map<number, number>> {
  const result = await db.request().query(
    `SELECT t.ProductGroupId, COUNT(s.SavedTenderID) AS saves
     FROM dbo.SavedTender s
     JOIN dbo.TenderOpportunity t ON t.TenderOpportunityID = s.TenderOpportunityID
     WHERE t.ProductGroupId IS NOT NULL
     GROUP BY t.ProductGroupId`
  );
  const rates = new Map<number, number>();
  const maxSaves = Math.max(1, ...result.recordset.map((r) => Number(r.saves)));
  for (const row of result.recordset) {
    rates.set(row.ProductGroupId as number, Number(row.saves) / maxSaves);
  }
  return rates;
}

function hasAny(profList: string[]): boolean {
  return profList.length > 0;
}

/**
 * Computes each weight component for one (opportunity, profile) pair.
 * Pure — no I/O — so tests and explainScore() share exactly this math.
 */
export function scoreComponents(
  side: OpportunitySide,
  profile: ActiveProfile,
  extras: ScoreExtras,
): { total: number; breakdown: Record<ComponentKey, number>; matchedKeywords: string[] } {
  const breakdown: Record<ComponentKey, number> = {
    keywords: 0,
    productGroup: 0,
    sector: 0,
    country: 0,
    organization: 0,
    value: 0,
    deadline: 0,
    type: 0,
    businessUnit: 0,
    sourceQuality: 0,
    historicalInterest: 0,
  };
  const matchedKeywords: string[] = [];

  const titleLower = side.title.toLowerCase();
  const descLower = (side.description || '').toLowerCase();

  // Keywords (28): title hit ×2, description hit ×1, scaled by keyword count.
  if (hasAny(profile.Keywords)) {
    let keywordHits = 0;
    for (const kw of profile.Keywords) {
      if (titleLower.includes(kw)) {
        keywordHits += 2;
        matchedKeywords.push(kw);
      } else if (descLower.includes(kw)) {
        keywordHits += 1;
        matchedKeywords.push(kw);
      }
    }
    breakdown.keywords = Math.min(
      RELEVANCE_WEIGHTS.keywords,
      keywordHits * (RELEVANCE_WEIGHTS.keywords / Math.max(profile.Keywords.length * 2, 1)),
    );
  }

  // Product group (14): exact coded group listed in the profile.
  if (
    hasAny(profile.ProductGroupCodes) &&
    side.productGroupCode &&
    profile.ProductGroupCodes.includes(side.productGroupCode.toLowerCase())
  ) {
    breakdown.productGroup = RELEVANCE_WEIGHTS.productGroup;
  }

  // Sector (12): mutual substring either direction.
  if (hasAny(profile.Sectors) && side.sector) {
    const sectorLower = side.sector.toLowerCase();
    if (profile.Sectors.some((s) => sectorLower.includes(s) || s.includes(sectorLower))) {
      breakdown.sector = RELEVANCE_WEIGHTS.sector;
    }
  }

  // Country (9): mutual substring either direction.
  if (hasAny(profile.Countries) && side.country) {
    const countryLower = side.country.toLowerCase();
    if (profile.Countries.some((c) => countryLower.includes(c) || c.includes(countryLower))) {
      breakdown.country = RELEVANCE_WEIGHTS.country;
    }
  }

  // Organization (8): either-direction substring against profile orgs.
  if (hasAny(profile.Organizations) && side.organization) {
    const orgLower = side.organization.toLowerCase();
    if (profile.Organizations.some((o) => orgLower.includes(o) || o.includes(orgLower))) {
      breakdown.organization = RELEVANCE_WEIGHTS.organization;
    }
  }

  // Value + currency consistency (6): in range AND no currency contradiction.
  if (side.estimatedValue != null && (profile.MinValue != null || profile.MaxValue != null)) {
    const currencyOk =
      !profile.Currency || !side.currency || profile.Currency.toUpperCase() === side.currency.toUpperCase();
    const minOk = profile.MinValue == null || side.estimatedValue >= profile.MinValue;
    const maxOk = profile.MaxValue == null || side.estimatedValue <= profile.MaxValue;
    if (currencyOk && minOk && maxOk) {
      breakdown.value = RELEVANCE_WEIGHTS.value;
    }
  }

  // Deadline feasibility (5): missing/past → 0; inside the reminder window →
  // 2 (actionable but tight); comfortably ahead → 5.
  if (side.deadlineDate) {
    const now = Date.now();
    const deadline = side.deadlineDate.getTime();
    if (deadline >= now) {
      const daysLeft = (deadline - now) / 86400000;
      breakdown.deadline = daysLeft <= extras.leadDays ? 2 : RELEVANCE_WEIGHTS.deadline;
    }
  }

  // Type match (5): profile explicitly lists this type.
  if (hasAny(profile.Types) && profile.Types.includes(side.opportunityType.toLowerCase())) {
    breakdown.type = RELEVANCE_WEIGHTS.type;
  }

  // Business unit (4): mapped BusinessGroupCode listed in the profile.
  if (
    hasAny(profile.BusinessGroupCodes) &&
    side.businessGroupCode &&
    profile.BusinessGroupCodes.includes(side.businessGroupCode.toLowerCase())
  ) {
    breakdown.businessUnit = RELEVANCE_WEIGHTS.businessUnit;
  }

  // Source quality (4): scaled by the source registry score; rows without a
  // source use the TenderSource column default (70) so manual entries are not
  // punished.
  const quality = side.sourceQuality ?? 70;
  breakdown.sourceQuality = (RELEVANCE_WEIGHTS.sourceQuality * quality) / 100;

  // Historical interest (5): save-rate prior for the row's product group.
  breakdown.historicalInterest = RELEVANCE_WEIGHTS.historicalInterest * Math.min(1, extras.saveRate);

  let total = 0;
  for (const key of Object.keys(breakdown) as ComponentKey[]) {
    total += breakdown[key];
  }
  return { total: Math.round(Math.min(100, total)), breakdown, matchedKeywords };
}

/** Loads everything scoreOpportunity needs for one row and scores it. */
async function loadSide(opportunityID: number): Promise<OpportunitySide | null> {
  const result = await db
    .request()
    .input('Id', sql.Int, opportunityID)
    .query(
      `SELECT t.Title, t.Description, t.Country, t.Sector, t.Organization,
              t.EstimatedValue, t.Currency, t.DeadlineDate, t.OpportunityType,
              t.ProductGroupId, pg.Code AS ProductGroupCode, pg.BusinessGroupCode,
              src.QualityScore
       FROM dbo.TenderOpportunity t
       LEFT JOIN dbo.ProductGroup pg ON pg.ProductGroupID = t.ProductGroupId
       LEFT JOIN dbo.TenderSource src ON src.TenderSourceID = t.TenderSourceID
       WHERE t.TenderOpportunityID = @Id`
    );
  if (result.recordset.length === 0) return null;
  const row = result.recordset[0];
  return {
    title: row.Title || '',
    description: row.Description || '',
    country: row.Country,
    sector: row.Sector,
    organization: row.Organization,
    estimatedValue: row.EstimatedValue != null ? Number(row.EstimatedValue) : null,
    currency: row.Currency,
    deadlineDate: row.DeadlineDate ? new Date(row.DeadlineDate as Date) : null,
    opportunityType: (row.OpportunityType as string) || 'TENDER',
    productGroupId: row.ProductGroupId ?? null,
    productGroupCode: row.ProductGroupCode || null,
    businessGroupCode: row.BusinessGroupCode || null,
    sourceQuality: row.QualityScore != null ? Number(row.QualityScore) : null,
  };
}

function saveRateFor(side: OpportunitySide, rates: Map<number, number>): number {
  return side.productGroupId != null ? rates.get(side.productGroupId) ?? 0 : 0;
}

/**
 * Computes and persists the relevance score for a single opportunity.
 * Uses the best (highest) score across all active profiles.
 * Returns the computed score (0-100).
 */
export async function scoreOpportunity(opportunityID: number): Promise<number> {
  const profiles = await loadActiveProfiles();
  if (profiles.length === 0) return 0;

  const side = await loadSide(opportunityID);
  if (!side) return 0;

  const rates = await loadSaveRates();
  const extras: ScoreExtras = {
    saveRate: saveRateFor(side, rates),
    leadDays: env.tenders.reminderLeadDays,
  };

  let bestScore = 0;
  for (const profile of profiles) {
    const { total } = scoreComponents(side, profile, extras);
    if (total > bestScore) bestScore = total;
  }

  await db
    .request()
    .input('Id', sql.Int, opportunityID)
    .input('Score', sql.Int, bestScore)
    .query(
      `UPDATE dbo.TenderOpportunity SET RelevanceScore = @Score, UpdatedAt = SYSUTCDATETIME()
       WHERE TenderOpportunityID = @Id`
    );

  return bestScore;
}

/**
 * Scores a raw opportunity in-memory (collection-time pre-screening before DB
 * insert). Optional sourceQuality feeds the source-quality component; without
 * a source the default (70) applies, same as scoreOpportunity().
 */
export async function scoreRawOpportunity(
  raw: RawOpportunity,
  sourceQuality?: number,
): Promise<number> {
  const profiles = await loadActiveProfiles();
  if (profiles.length === 0) return 0;

  const side: OpportunitySide = {
    title: raw.title,
    description: raw.description || '',
    country: raw.country,
    sector: raw.sector,
    organization: raw.organization,
    estimatedValue: raw.estimatedValue,
    currency: raw.currency,
    deadlineDate: raw.deadlineDate,
    opportunityType: raw.opportunityType && raw.opportunityType !== '' ? raw.opportunityType : 'TENDER',
    productGroupId: null,
    productGroupCode: null,
    businessGroupCode: null,
    sourceQuality: sourceQuality ?? null,
  };
  const extras: ScoreExtras = { saveRate: 0, leadDays: env.tenders.reminderLeadDays };

  let bestScore = 0;
  for (const profile of profiles) {
    const { total } = scoreComponents(side, profile, extras);
    if (total > bestScore) bestScore = total;
  }
  return bestScore;
}

export interface ScoreExplanation {
  total: number;
  profileId: number;
  profileName: string;
  components: Array<{ key: ComponentKey; label: string; points: number; max: number; detail: string }>;
  matchedKeywords: string[];
}

/**
 * Full per-component breakdown of the best profile's score (plan §8
 * "why-relevant"). Read-only — never persists.
 */
export async function explainScore(opportunityID: number): Promise<ScoreExplanation | null> {
  const profiles = await loadActiveProfiles();
  if (profiles.length === 0) return null;
  const side = await loadSide(opportunityID);
  if (!side) return null;

  const rates = await loadSaveRates();
  const extras: ScoreExtras = {
    saveRate: saveRateFor(side, rates),
    leadDays: env.tenders.reminderLeadDays,
  };

  let best: { profile: ActiveProfile; result: ReturnType<typeof scoreComponents> } | null = null;
  for (const profile of profiles) {
    const result = scoreComponents(side, profile, extras);
    if (!best || result.total > best.result.total) best = { profile, result };
  }
  if (!best) return null;

  const { profile, result } = best;
  const details = buildDetailStrings(side, profile, result.breakdown, result.matchedKeywords, extras);

  return {
    total: result.total,
    profileId: profile.InterestProfileID,
    profileName: profile.Name,
    components: (Object.keys(RELEVANCE_WEIGHTS) as ComponentKey[]).map((key) => ({
      key,
      label: COMPONENT_LABELS[key],
      points: Math.round(result.breakdown[key] * 100) / 100,
      max: RELEVANCE_WEIGHTS[key],
      detail: details[key],
    })),
    matchedKeywords: result.matchedKeywords,
  };
}

function buildDetailStrings(
  side: OpportunitySide,
  profile: ActiveProfile,
  breakdown: Record<ComponentKey, number>,
  matchedKeywords: string[],
  extras: ScoreExtras,
): Record<ComponentKey, string> {
  const d = {} as Record<ComponentKey, string>;

  d.keywords = matchedKeywords.length > 0
    ? `matched: ${[...new Set(matchedKeywords)].join(', ')}`
    : profile.Keywords.length > 0 ? 'no keyword matched' : 'profile declares no keywords';
  d.productGroup = breakdown.productGroup > 0
    ? `product group ${side.productGroupCode} is in profile`
    : hasAny(profile.ProductGroupCodes)
      ? `product group ${side.productGroupCode ?? '(none)'} not in profile`
      : 'profile declares no product groups';
  d.sector = breakdown.sector > 0
    ? `sector "${side.sector}" overlaps profile sectors`
    : hasAny(profile.Sectors) ? `sector "${side.sector ?? '(none)'}" not in profile` : 'profile declares no sectors';
  d.country = breakdown.country > 0
    ? `country "${side.country}" matches profile`
    : hasAny(profile.Countries) ? `country "${side.country ?? '(none)'}" not in profile` : 'profile declares no countries';
  d.organization = breakdown.organization > 0
    ? `organization "${side.organization}" overlaps profile organizations`
    : hasAny(profile.Organizations) ? 'organization not in profile' : 'profile declares no organizations';
  d.value = breakdown.value > 0
    ? 'value within profile range with consistent currency'
    : side.estimatedValue == null ? 'no estimated value on this row'
      : (profile.Currency && side.currency && profile.Currency.toUpperCase() !== side.currency.toUpperCase())
        ? `currency mismatch (${side.currency} vs ${profile.Currency})`
        : 'value outside profile range';
  d.deadline = breakdown.deadline === RELEVANCE_WEIGHTS.deadline
    ? `deadline is more than ${extras.leadDays} days out`
    : breakdown.deadline === 2 ? `deadline within ${extras.leadDays}-day reminder window`
      : side.deadlineDate ? 'deadline already passed' : 'no deadline published';
  d.type = breakdown.type > 0
    ? `type ${side.opportunityType} listed in profile`
    : hasAny(profile.Types) ? `type ${side.opportunityType} not in profile` : 'profile declares no types';
  d.businessUnit = breakdown.businessUnit > 0
    ? `business group ${side.businessGroupCode} matches profile`
    : hasAny(profile.BusinessGroupCodes)
      ? `business group ${side.businessGroupCode ?? '(none)'} not in profile`
      : 'profile declares no business groups';
  d.sourceQuality = `source quality ${side.sourceQuality ?? 70}/100`;
  d.historicalInterest = breakdown.historicalInterest > 0
    ? 'this product group has a strong save history'
    : 'no save history for this product group';

  return d;
}

/** Re-scores all opportunities (called when interest profiles change). */
export async function rescoreAll(): Promise<number> {
  const result = await db.request().query(
    `SELECT TenderOpportunityID FROM dbo.TenderOpportunity`
  );
  let count = 0;
  for (const row of result.recordset) {
    try {
      await scoreOpportunity(row.TenderOpportunityID);
      count++;
    } catch (err) {
      logger.error('Failed to rescore opportunity', { id: row.TenderOpportunityID, error: (err as Error).message });
    }
  }
  return count;
}
