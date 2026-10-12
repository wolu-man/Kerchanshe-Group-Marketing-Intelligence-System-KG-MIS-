// =============================================================================
// Tender Intelligence — Zod schemas for request validation + TS interfaces.
// =============================================================================

import { z } from 'zod';
import { OPPORTUNITY_TYPES } from './classifier';

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const createSourceSchema = z.object({
  Name: z.string().min(1).max(200),
  SourceType: z.enum(['api', 'rss', 'scraping']),
  URL: z.string().min(1).max(1000),
  ApiConfig: z.string().max(10000).optional().nullable(),
  Schedule: z.string().max(20).optional().default('6h'),
  RateLimitMs: z.number().int().min(0).max(60000).optional().default(2000),
  RobotsCompliance: z.boolean().optional().default(true),
  IsActive: z.boolean().optional().default(true),
  /** Opt-in: AI-enrich each newly inserted opportunity from this source (default off). */
  AiAutoEnrich: z.boolean().optional().default(false),
  /** Source quality 0-100 used by relevance scoring (plan §17). */
  QualityScore: z.number().int().min(0).max(100).optional().default(70),
});

export const updateSourceSchema = createSourceSchema.partial();

/** Body for POST /tenders/sources/test — tests an unsaved source configuration. */
export const testSourceSchema = z.object({
  SourceType: z.enum(['api', 'rss', 'scraping']),
  URL: z.string().min(1).max(1000),
  ApiConfig: z.string().max(10000).optional().nullable(),
  RateLimitMs: z.number().int().min(0).max(60000).optional().default(2000),
  RobotsCompliance: z.boolean().optional().default(true),
});


export const createInterestProfileSchema = z.object({
  Name: z.string().min(1).max(200),
  Sectors: z.array(z.string()).optional().nullable(),
  Keywords: z.array(z.string()).optional().nullable(),
  Countries: z.array(z.string()).optional().nullable(),
  MinValue: z.number().nullable().optional(),
  MaxValue: z.number().nullable().optional(),
  Currency: z.string().max(10).optional().nullable(),
  /** Buyer/organization names the profile targets (plan §17). */
  Organizations: z.array(z.string()).optional().nullable(),
  /** ProductGroup.Code values the profile targets (plan §17). */
  ProductGroupCodes: z.array(z.string()).optional().nullable(),
  /** OPPORTUNITY_TYPES values the profile targets (plan §17). */
  Types: z.array(z.enum(OPPORTUNITY_TYPES)).optional().nullable(),
  /** BusinessGroup.Code values the profile targets (plan §17 business unit). */
  BusinessGroupCodes: z.array(z.string()).optional().nullable(),
  IsActive: z.boolean().optional().default(true),
});

export const updateInterestProfileSchema = createInterestProfileSchema.partial();

export const saveTenderSchema = z.object({
  Status: z.enum(['New', 'Reviewing', 'Interested', 'Applied', 'Won', 'Lost', 'Archived']).optional().default('New'),
  Notes: z.string().max(5000).optional().nullable(),
});

export const createOpportunitySchema = z.object({
  Title: z.string().min(1).max(500),
  Organization: z.string().max(300).optional().nullable(),
  Country: z.string().max(100).optional().nullable(),
  Sector: z.string().max(200).optional().nullable(),
  Description: z.string().optional().nullable(),
  SourceUrl: z.string().min(1).max(1000),
  SourceReference: z.string().max(200).optional().nullable(),
  PublicationDate: z.string().optional().nullable(),
  DeadlineDate: z.string().optional().nullable(),
  EstimatedValue: z.number().optional().nullable(),
  Currency: z.string().max(10).optional().nullable(),
  /** Region/macro-geography (plan §6). */
  Region: z.string().max(100).optional().nullable(),
  /** Manual type override; omitted = rule-based classification. */
  OpportunityType: z.enum(OPPORTUNITY_TYPES).optional(),
});

// ---------------------------------------------------------------------------
// Response interfaces
// ---------------------------------------------------------------------------

export interface TenderSourceDTO {
  TenderSourceID: number;
  Name: string;
  SourceType: string;
  URL: string;
  Schedule: string;
  RateLimitMs: number;
  RobotsCompliance: boolean;
  IsActive: boolean;
  /** Opt-in AI enrichment after collection for this source (default false). */
  AiAutoEnrich: boolean;
  /** Source quality 0-100 (relevance scoring, plan §17). */
  QualityScore: number;
  LastCollectedAt: string | null;
  LastCollectionStatus: string | null;
  LastCollectionError: string | null;
  TotalCollected: number;
  /** True when the URL host has no authorized data-access method — always inactive. */
  Restricted: boolean;
  CreatedAt: string;
  UpdatedAt: string | null;
}

export interface TenderSourceAdminDTO extends TenderSourceDTO {
  ApiConfig: string | null;
}

export interface TenderOpportunityDTO {
  TenderOpportunityID: number;
  TenderSourceID: number | null;
  SourceName: string | null;
  Title: string;
  Organization: string | null;
  Country: string | null;
  Sector: string | null;
  Description: string | null;
  SourceUrl: string;
  SourceReference: string | null;
  PublicationDate: string | null;
  DeadlineDate: string | null;
  EstimatedValue: number | null;
  Currency: string | null;
  /** Region/macro-geography when the source provides it (plan §6). */
  Region: string | null;
  /** Field-presence confidence 0-100 (plan §6/§8/§19). */
  Confidence: number | null;
  /** Complete | Partial | Sparse (plan §19 filter). */
  DataQuality: string | null;
  ContentHash: string;
  VerificationStatus: string;
  RelevanceScore: number | null;
  /** Opportunity type: TENDER | RFQ | BUYER_LEAD | TRADE_INTELLIGENCE | MARKET_SIGNAL. */
  OpportunityType: string;
  ProductGroupId: number | null;
  ProductGroupCode: string | null;
  ProductGroupName: string | null;
  AiSummary: string | null;
  AiStructuredData: string | null;
  AiGapFill: string | null;
  AiEnrichedAt: string | null;
  IsSaved: boolean;
  SavedStatus: string | null;
  SavedTenderID: number | null;
  CreatedAt: string;
}

export interface SavedTenderDTO {
  SavedTenderID: number;
  TenderOpportunityID: number;
  UserID: number;
  Status: string;
  Notes: string | null;
  Title: string;
  DeadlineDate: string | null;
  CreatedAt: string;
  UpdatedAt: string | null;
}

export interface TenderInterestProfileDTO {
  InterestProfileID: number;
  Name: string;
  Sectors: string[];
  Keywords: string[];
  Countries: string[];
  MinValue: number | null;
  MaxValue: number | null;
  Currency: string | null;
  /** Buyer/organization names targeted by the profile (plan §17). */
  Organizations: string[];
  /** ProductGroup.Code values targeted by the profile (plan §17). */
  ProductGroupCodes: string[];
  /** OPPORTUNITY_TYPES targeted by the profile (plan §17). */
  Types: string[];
  /** BusinessGroup.Code values targeted by the profile (plan §17). */
  BusinessGroupCodes: string[];
  IsActive: boolean;
  CreatedAt: string;
  UpdatedAt: string | null;
}

export interface TenderDashboard {
  totalOpportunities: number;
  newThisWeek: number;
  deadlineSoon: number;
  savedCount: number;
  highRelevance: number;
  /** KPI cards per opportunity type family (plan §20). */
  rfqCount: number;
  buyerLeadCount: number;
  /** Opportunities outside Ethiopia (plan §18/§20 "Export Opportunities"). */
  exportCount: number;
  tradeCount: number;
  byCountry: Array<{ country: string; count: number }>;
  bySector: Array<{ sector: string; count: number }>;
  byType: Array<{ type: string; count: number }>;
  bySource: Array<{ source: string; count: number }>;
  byProductGroup: Array<{ group: string; count: number }>;
  /** Relevance distribution in fixed buckets (plan §20). */
  relevanceBuckets: Array<{ label: string; min: number; max: number; count: number }>;
  /** Opportunities whose deadline falls in each of the next 8 ISO weeks. */
  deadlineTrend: Array<{ label: string; weekStart: string; count: number }>;
  upcomingDeadlines: TenderOpportunityDTO[];
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Response of a source connection test — never inserts anything. */
export interface SourceTestResult {
  ok: boolean;
  /** Set when the host has no authorized data-access method; nothing was fetched. */
  restricted: boolean;
  /** HTTP/robots/parse error message when ok is false. */
  error: string | null;
  durationMs: number;
  /** Number of opportunities the adapter was able to parse. */
  fetched: number;
  /** First few parsed items (title/url/deadline only — no raw payloads). */
  sample: Array<{ title: string; sourceUrl: string; deadlineDate: string | null }>;
}

