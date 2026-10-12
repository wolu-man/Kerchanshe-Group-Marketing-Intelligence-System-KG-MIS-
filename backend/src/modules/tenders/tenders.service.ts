// =============================================================================
// Tenders Service — opportunity CRUD, search/filter, save/track, AI enrichment
// trigger, dashboard stats, and interest profile CRUD.
// =============================================================================

import sql from 'mssql';
import { db } from '../../db/pool';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { NotFoundError, ConflictError } from '../../utils/errors';
import type {
  TenderOpportunityDTO,
  SavedTenderDTO,
  TenderInterestProfileDTO,
  TenderDashboard,
  PaginatedResult,
} from './tenders.types';
import type { RawOpportunity } from './adapters/adapter';
import { contentHash, normalizeDate } from './adapters/adapter';
import { isDuplicateKeyError } from './source-policy';
import { scoreOpportunity, rescoreAll } from './relevance';
import {
  classifyOpportunity,
  loadProductGroupsSafe,
  OPPORTUNITY_TYPES,
  type OpportunityType,
} from './classifier';
import { computeConfidence, computeDataQuality } from './quality';

// ---------------------------------------------------------------------------
// Shared column list for opportunity SELECTs (list / detail / dashboard).
// ---------------------------------------------------------------------------

const OPPORTUNITY_COLUMNS = `t.OpportunityType, t.ProductGroupId,
            pg.Code AS ProductGroupCode, pg.Name AS ProductGroupName`;
const OPPORTUNITY_PRODUCT_GROUP_JOIN = `LEFT JOIN dbo.ProductGroup pg ON pg.ProductGroupID = t.ProductGroupId`;

// ---------------------------------------------------------------------------
// Opportunity DTO mapping
// ---------------------------------------------------------------------------

function toOpportunityDTO(row: Record<string, unknown>): TenderOpportunityDTO {
  return {
    TenderOpportunityID: row.TenderOpportunityID as number,
    TenderSourceID: (row.TenderSourceID as number) || null,
    SourceName: (row.SourceName as string) || null,
    Title: row.Title as string,
    Organization: (row.Organization as string) || null,
    Country: (row.Country as string) || null,
    Sector: (row.Sector as string) || null,
    Description: (row.Description as string) || null,
    SourceUrl: row.SourceUrl as string,
    SourceReference: (row.SourceReference as string) || null,
    PublicationDate: row.PublicationDate ? new Date(row.PublicationDate as Date).toISOString() : null,
    DeadlineDate: row.DeadlineDate ? new Date(row.DeadlineDate as Date).toISOString() : null,
    EstimatedValue: row.EstimatedValue != null ? Number(row.EstimatedValue) : null,
    Currency: (row.Currency as string) || null,
    Region: (row.Region as string) || null,
    Confidence: row.Confidence != null ? Number(row.Confidence) : null,
    DataQuality: (row.DataQuality as string) || null,
    ContentHash: row.ContentHash as string,
    VerificationStatus: row.VerificationStatus as string,
    RelevanceScore: row.RelevanceScore != null ? Number(row.RelevanceScore) : null,
    OpportunityType: (row.OpportunityType as string) || 'TENDER',
    ProductGroupId: (row.ProductGroupId as number) || null,
    ProductGroupCode: (row.ProductGroupCode as string) || null,
    ProductGroupName: (row.ProductGroupName as string) || null,
    AiSummary: (row.AiSummary as string) || null,
    AiStructuredData: (row.AiStructuredData as string) || null,
    AiGapFill: (row.AiGapFill as string) || null,
    AiEnrichedAt: row.AiEnrichedAt ? new Date(row.AiEnrichedAt as Date).toISOString() : null,
    IsSaved: !!row.IsSaved,
    SavedStatus: (row.SavedStatus as string) || null,
    SavedTenderID: (row.SavedTenderID as number) || null,
    CreatedAt: new Date(row.CreatedAt as Date).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Search & filter
// ---------------------------------------------------------------------------

type ListOptions = {
  userId: number;
  search?: string;
  country?: string;
  sector?: string;
  sourceId?: number;
  verificationStatus?: string;
  /** Opportunity type (TENDER / RFQ / ...). */
  type?: string;
  /** Product group: numeric = ProductGroupID, otherwise the group Code. */
  productGroup?: string;
  relevanceMin?: number;
  fromDeadline?: string;
  toDeadline?: string;
  /** Publication-date range (plan §19). */
  fromPublication?: string;
  toPublication?: string;
  /** Minimum field-presence confidence 0-100 (plan §19). */
  confidenceMin?: number;
  /** Complete | Partial | Sparse (plan §19). */
  dataQuality?: string;
  /** BusinessGroup.Code — matches opportunities via ProductGroup mapping (plan §19). */
  businessGroup?: string;
  /** Buyer / organization substring match (plan §19). */
  organization?: string;
  /** Opportunities outside Ethiopia (plan §18/§20 "Export Opportunities"). */
  exportOnly?: boolean;
  savedOnly?: boolean;
  page: number;
  pageSize: number;
};

/**
 * Builds the WHERE clause and a parameter applier from the filter options.
 * The applier is used to build two independent mssql Request objects — a
 * single Request must never be used for two queries at the same time.
 */
function buildFilters(opts: ListOptions): { whereClause: string; apply: (req: sql.Request) => void } {
  const clauses: string[] = [];
  const bindings: Array<(req: sql.Request) => void> = [];

  if (opts.search) {
    bindings.push((req) => req.input('Search', sql.NVarChar(500), `%${opts.search}%`));
    clauses.push('(t.Title LIKE @Search OR t.Description LIKE @Search OR t.Organization LIKE @Search)');
  }
  if (opts.country) {
    bindings.push((req) => req.input('Country', sql.NVarChar(100), opts.country!));
    clauses.push('t.Country = @Country');
  }
  if (opts.sector) {
    bindings.push((req) => req.input('Sector', sql.NVarChar(200), opts.sector!));
    clauses.push('t.Sector = @Sector');
  }
  if (opts.sourceId) {
    bindings.push((req) => req.input('SourceId', sql.Int, opts.sourceId!));
    clauses.push('t.TenderSourceID = @SourceId');
  }
  if (opts.verificationStatus) {
    bindings.push((req) => req.input('VerificationStatus', sql.VarChar(20), opts.verificationStatus!));
    clauses.push('t.VerificationStatus = @VerificationStatus');
  }
  if (opts.type) {
    bindings.push((req) => req.input('OpportunityType', sql.VarChar(30), opts.type!));
    clauses.push('t.OpportunityType = @OpportunityType');
  }
  if (opts.productGroup) {
    if (/^\d+$/.test(opts.productGroup)) {
      bindings.push((req) => req.input('ProductGroupId', sql.Int, Number(opts.productGroup)));
      clauses.push('t.ProductGroupId = @ProductGroupId');
    } else {
      bindings.push((req) => req.input('ProductGroupCode', sql.VarChar(50), opts.productGroup!));
      clauses.push('t.ProductGroupId = (SELECT ProductGroupID FROM dbo.ProductGroup WHERE Code = @ProductGroupCode)');
    }
  }
  if (opts.relevanceMin != null) {
    bindings.push((req) => req.input('RelevanceMin', sql.Int, opts.relevanceMin!));
    clauses.push('t.RelevanceScore >= @RelevanceMin');
  }
  if (opts.fromDeadline) {
    bindings.push((req) => req.input('FromDeadline', sql.DateTime2, new Date(opts.fromDeadline!)));
    clauses.push('t.DeadlineDate >= @FromDeadline');
  }
  if (opts.toDeadline) {
    bindings.push((req) => req.input('ToDeadline', sql.DateTime2, new Date(opts.toDeadline!)));
    clauses.push('t.DeadlineDate <= @ToDeadline');
  }
  if (opts.fromPublication) {
    bindings.push((req) => req.input('FromPublication', sql.DateTime2, new Date(opts.fromPublication!)));
    clauses.push('t.PublicationDate >= @FromPublication');
  }
  if (opts.toPublication) {
    bindings.push((req) => req.input('ToPublication', sql.DateTime2, new Date(opts.toPublication!)));
    clauses.push('t.PublicationDate <= @ToPublication');
  }
  if (opts.confidenceMin != null) {
    bindings.push((req) => req.input('ConfidenceMin', sql.TinyInt, opts.confidenceMin!));
    clauses.push('t.Confidence >= @ConfidenceMin');
  }
  if (opts.dataQuality) {
    bindings.push((req) => req.input('DataQuality', sql.VarChar(20), opts.dataQuality!));
    clauses.push('t.DataQuality = @DataQuality');
  }
  if (opts.businessGroup) {
    bindings.push((req) => req.input('BusinessGroupCode', sql.VarChar(20), opts.businessGroup!));
    clauses.push(
      't.ProductGroupId IN (SELECT ProductGroupID FROM dbo.ProductGroup WHERE BusinessGroupCode = @BusinessGroupCode)'
    );
  }
  if (opts.organization) {
    bindings.push((req) => req.input('Organization', sql.NVarChar(300), `%${opts.organization!}%`));
    clauses.push('t.Organization LIKE @Organization');
  }
  if (opts.exportOnly) {
    clauses.push("t.Country IS NOT NULL AND t.Country <> '' AND t.Country <> 'Ethiopia'");
  }
  if (opts.savedOnly) {
    clauses.push('s.SavedTenderID IS NOT NULL');
  }

  return {
    whereClause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    apply: (req) => {
      req.input('UserId', sql.Int, opts.userId);
      for (const bind of bindings) bind(req);
    },
  };
}

export async function listOpportunities(opts: ListOptions): Promise<PaginatedResult<TenderOpportunityDTO>> {
  const { whereClause, apply } = buildFilters(opts);

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM dbo.TenderOpportunity t
    LEFT JOIN dbo.SavedTender s ON s.TenderOpportunityID = t.TenderOpportunityID AND s.UserID = @UserId
    ${whereClause}`;

  const dataQuery = `
    SELECT t.TenderOpportunityID, t.TenderSourceID, src.Name AS SourceName,
           t.Title, t.Organization, t.Country, t.Sector, t.Description,
           t.SourceUrl, t.SourceReference, t.PublicationDate, t.DeadlineDate,
           t.EstimatedValue, t.Currency, t.Region, t.Confidence, t.DataQuality, t.ContentHash, t.VerificationStatus,
           t.RelevanceScore, ${OPPORTUNITY_COLUMNS},
           t.AiSummary, t.AiStructuredData, t.AiGapFill, t.AiEnrichedAt,
           t.CreatedAt,
           CASE WHEN s.SavedTenderID IS NOT NULL THEN 1 ELSE 0 END AS IsSaved,
           s.Status AS SavedStatus, s.SavedTenderID
    FROM dbo.TenderOpportunity t
    LEFT JOIN dbo.TenderSource src ON src.TenderSourceID = t.TenderSourceID
    ${OPPORTUNITY_PRODUCT_GROUP_JOIN}
    LEFT JOIN dbo.SavedTender s ON s.TenderOpportunityID = t.TenderOpportunityID AND s.UserID = @UserId
    ${whereClause}
    ORDER BY t.CreatedAt DESC
    OFFSET ${opts.pageSize} * (${opts.page} - 1) ROWS
    FETCH NEXT ${opts.pageSize} ROWS ONLY`;

  const run = (text: string) => {
    const req = db.request();
    apply(req);
    return req.query(text);
  };

  const [countResult, dataResult] = await Promise.all([run(countQuery), run(dataQuery)]);

  return {
    items: dataResult.recordset.map(toOpportunityDTO),
    total: countResult.recordset[0].total,
    page: opts.page,
    pageSize: opts.pageSize,
  };
}

// ---------------------------------------------------------------------------
// Get single opportunity
// ---------------------------------------------------------------------------

export async function getOpportunity(id: number, userId: number): Promise<TenderOpportunityDTO> {
  const result = await db
    .request()
    .input('Id', sql.Int, id)
    .input('UserId', sql.Int, userId)
    .query(
      `SELECT t.TenderOpportunityID, t.TenderSourceID, src.Name AS SourceName,
              t.Title, t.Organization, t.Country, t.Sector, t.Description,
              t.SourceUrl, t.SourceReference, t.PublicationDate, t.DeadlineDate,
              t.EstimatedValue, t.Currency, t.Region, t.Confidence, t.DataQuality, t.ContentHash, t.VerificationStatus,
              t.RelevanceScore, ${OPPORTUNITY_COLUMNS},
              t.AiSummary, t.AiStructuredData, t.AiGapFill, t.AiEnrichedAt,
              t.CreatedAt,
              CASE WHEN s.SavedTenderID IS NOT NULL THEN 1 ELSE 0 END AS IsSaved,
              s.Status AS SavedStatus, s.SavedTenderID
       FROM dbo.TenderOpportunity t
       LEFT JOIN dbo.TenderSource src ON src.TenderSourceID = t.TenderSourceID
       ${OPPORTUNITY_PRODUCT_GROUP_JOIN}
       LEFT JOIN dbo.SavedTender s ON s.TenderOpportunityID = t.TenderOpportunityID AND s.UserID = @UserId
       WHERE t.TenderOpportunityID = @Id`
    );
  if (result.recordset.length === 0) {
    throw new NotFoundError('Tender opportunity not found');
  }
  return toOpportunityDTO(result.recordset[0]);
}

// ---------------------------------------------------------------------------
// Manual opportunity creation
// ---------------------------------------------------------------------------

export async function createOpportunity(data: {
  Title: string;
  Organization?: string | null;
  Country?: string | null;
  Sector?: string | null;
  Description?: string | null;
  SourceUrl: string;
  SourceReference?: string | null;
  PublicationDate?: string | null;
  DeadlineDate?: string | null;
  EstimatedValue?: number | null;
  Currency?: string | null;
  TenderSourceID?: number | null;
  /** Region/macro-geography (plan §6). */
  Region?: string | null;
  /** Manual type override (import/manual entry); omitted = rule-based. */
  OpportunityType?: OpportunityType;
}, userId: number): Promise<TenderOpportunityDTO> {
  const raw: RawOpportunity = {
    title: data.Title,
    organization: data.Organization ?? null,
    country: data.Country ?? null,
    sector: data.Sector ?? null,
    description: data.Description ?? null,
    sourceUrl: data.SourceUrl,
    sourceReference: data.SourceReference ?? null,
    publicationDate: normalizeDate(data.PublicationDate),
    deadlineDate: normalizeDate(data.DeadlineDate),
    estimatedValue: data.EstimatedValue ?? null,
    currency: data.Currency ?? null,
    region: data.Region ?? null,
  };
  const hash = contentHash(raw);
  const confidence = computeConfidence({
    organization: data.Organization ?? null,
    deadlineDate: raw.deadlineDate,
    publicationDate: raw.publicationDate,
    country: data.Country ?? null,
    sector: data.Sector ?? null,
    estimatedValue: data.EstimatedValue ?? null,
    description: data.Description ?? null,
  });
  const dataQuality = computeDataQuality(confidence);

  // Check for existing by hash.
  const existing = await db
    .request()
    .input('Hash', sql.VarChar(64), hash)
    .query(
      `SELECT TenderOpportunityID FROM dbo.TenderOpportunity WHERE ContentHash = @Hash`
    );
  if (existing.recordset.length > 0) {
    throw new ConflictError('An identical opportunity already exists (duplicate content hash)');
  }

  const groups = await loadProductGroupsSafe();
  const classification = classifyOpportunity(
    { title: data.Title, description: data.Description, sector: data.Sector, organization: data.Organization },
    groups,
    data.OpportunityType,
  );

  let newId: number;
  try {
    const result = await db
      .request()
      .input('Title', sql.NVarChar(500), data.Title)
      .input('Organization', sql.NVarChar(300), data.Organization || null)
      .input('Country', sql.NVarChar(100), data.Country || null)
      .input('Sector', sql.NVarChar(200), data.Sector || null)
      .input('Description', sql.NVarChar(sql.MAX), data.Description || null)
      .input('SourceUrl', sql.NVarChar(1000), data.SourceUrl)
      .input('SourceReference', sql.NVarChar(200), data.SourceReference || null)
      .input('PublicationDate', sql.DateTime2, normalizeDate(data.PublicationDate))
      .input('DeadlineDate', sql.DateTime2, normalizeDate(data.DeadlineDate))
      .input('EstimatedValue', sql.Decimal(18, 2), data.EstimatedValue ?? null)
      .input('Currency', sql.VarChar(10), data.Currency || null)
      .input('Region', sql.NVarChar(100), data.Region || null)
      .input('Confidence', sql.TinyInt, confidence)
      .input('DataQuality', sql.VarChar(20), dataQuality)
      .input('ContentHash', sql.VarChar(64), hash)
      .input('TenderSourceID', sql.Int, data.TenderSourceID ?? null)
      .input('OpportunityType', sql.VarChar(30), classification.opportunityType)
      .input('ProductGroupId', sql.Int, classification.productGroupId)
      .input('ClassificationMethod', sql.VarChar(20), data.OpportunityType ? 'manual' : 'rule')
      .query(
        `INSERT INTO dbo.TenderOpportunity
           (Title, Organization, Country, Sector, Description, SourceUrl, SourceReference,
            PublicationDate, DeadlineDate, EstimatedValue, Currency, Region, Confidence, DataQuality,
            ContentHash, TenderSourceID,
            OpportunityType, ProductGroupId, ClassificationMethod, ClassifiedAt)
         OUTPUT INSERTED.TenderOpportunityID
         VALUES (@Title, @Organization, @Country, @Sector, @Description, @SourceUrl, @SourceReference,
                 @PublicationDate, @DeadlineDate, @EstimatedValue, @Currency, @Region, @Confidence, @DataQuality,
                 @ContentHash, @TenderSourceID,
                 @OpportunityType, @ProductGroupId, @ClassificationMethod, SYSUTCDATETIME())`
      );
    newId = result.recordset[0].TenderOpportunityID;
  } catch (err) {
    // The unique ContentHash constraint is the authoritative duplicate guard —
    // a race between the check above and this insert reports as 2601/2627.
    if (isDuplicateKeyError(err)) {
      throw new ConflictError('An identical opportunity already exists (duplicate content hash)');
    }
    throw err;
  }

  // Score the new opportunity.
  await scoreOpportunity(newId);

  return getOpportunity(newId, userId);
}

// ---------------------------------------------------------------------------
// Save / track
// ---------------------------------------------------------------------------

export async function saveOpportunity(opportunityId: number, userId: number, status: string, notes?: string | null): Promise<SavedTenderDTO> {
  // Verify opportunity exists.
  const opp = await db
    .request()
    .input('Id', sql.Int, opportunityId)
    .query(`SELECT TenderOpportunityID, Title, DeadlineDate FROM dbo.TenderOpportunity WHERE TenderOpportunityID = @Id`);
  if (opp.recordset.length === 0) {
    throw new NotFoundError('Tender opportunity not found');
  }

  // Upsert.
  const result = await db
    .request()
    .input('OppId', sql.Int, opportunityId)
    .input('UserId', sql.Int, userId)
    .input('Status', sql.VarChar(20), status)
    .input('Notes', sql.NVarChar(sql.MAX), notes || null)
    .query(
      `MERGE dbo.SavedTender AS target
       USING (SELECT @OppId AS TenderOpportunityID, @UserId AS UserID) AS source
         ON target.TenderOpportunityID = source.TenderOpportunityID
            AND target.UserID = source.UserID
       WHEN MATCHED THEN
         UPDATE SET Status = @Status, Notes = @Notes, UpdatedAt = SYSUTCDATETIME()
       WHEN NOT MATCHED THEN
         INSERT (TenderOpportunityID, UserID, Status, Notes)
         VALUES (@OppId, @UserId, @Status, @Notes)
       OUTPUT INSERTED.SavedTenderID, INSERTED.TenderOpportunityID, INSERTED.UserID,
              INSERTED.Status, INSERTED.Notes, INSERTED.CreatedAt, INSERTED.UpdatedAt;`
    );

  const row = result.recordset[0];
  return {
    SavedTenderID: row.SavedTenderID,
    TenderOpportunityID: row.TenderOpportunityID,
    UserID: row.UserID,
    Status: row.Status,
    Notes: row.Notes,
    Title: opp.recordset[0].Title,
    DeadlineDate: opp.recordset[0].DeadlineDate ? new Date(opp.recordset[0].DeadlineDate).toISOString() : null,
    CreatedAt: new Date(row.CreatedAt).toISOString(),
    UpdatedAt: row.UpdatedAt ? new Date(row.UpdatedAt).toISOString() : null,
  };
}

export async function unsaveOpportunity(opportunityId: number, userId: number): Promise<void> {
  await db
    .request()
    .input('OppId', sql.Int, opportunityId)
    .input('UserId', sql.Int, userId)
    .query(
      `DELETE FROM dbo.SavedTender WHERE TenderOpportunityID = @OppId AND UserID = @UserId`
    );
}

export async function listSavedTenders(userId: number, page: number, pageSize: number): Promise<PaginatedResult<SavedTenderDTO>> {
  const req = db.request().input('UserId', sql.Int, userId);

  const countResult = await req.query(
    `SELECT COUNT(*) AS total FROM dbo.SavedTender WHERE UserID = @UserId`
  );
  const dataResult = await db
    .request()
    .input('UserId', sql.Int, userId)
    .query(
      `SELECT s.SavedTenderID, s.TenderOpportunityID, s.UserID, s.Status, s.Notes,
              t.Title, t.DeadlineDate, s.CreatedAt, s.UpdatedAt
       FROM dbo.SavedTender s
       JOIN dbo.TenderOpportunity t ON t.TenderOpportunityID = s.TenderOpportunityID
       WHERE s.UserID = @UserId
       ORDER BY s.CreatedAt DESC
       OFFSET ${pageSize} * (${page} - 1) ROWS
       FETCH NEXT ${pageSize} ROWS ONLY`
    );

  return {
    items: dataResult.recordset.map((row) => ({
      SavedTenderID: row.SavedTenderID,
      TenderOpportunityID: row.TenderOpportunityID,
      UserID: row.UserID,
      Status: row.Status,
      Notes: row.Notes,
      Title: row.Title,
      DeadlineDate: row.DeadlineDate ? new Date(row.DeadlineDate).toISOString() : null,
      CreatedAt: new Date(row.CreatedAt).toISOString(),
      UpdatedAt: row.UpdatedAt ? new Date(row.UpdatedAt).toISOString() : null,
    })),
    total: countResult.recordset[0].total,
    page,
    pageSize,
  };
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export async function setVerificationStatus(id: number, status: 'Verified' | 'Unverified'): Promise<void> {
  const result = await db
    .request()
    .input('Id', sql.Int, id)
    .input('Status', sql.VarChar(20), status)
    .query(
      `UPDATE dbo.TenderOpportunity
       SET VerificationStatus = @Status, UpdatedAt = SYSUTCDATETIME()
       WHERE TenderOpportunityID = @Id`
    );
  if (result.rowsAffected[0] === 0) {
    throw new NotFoundError('Tender opportunity not found');
  }
}

// ---------------------------------------------------------------------------
// Dashboard stats
// ---------------------------------------------------------------------------

export async function getDashboard(userId: number): Promise<TenderDashboard> {
  const req = db
    .request()
    .input('UserId', sql.Int, userId)
    .input('LeadDays', sql.Int, env.tenders.reminderLeadDays)
    .input('HighRelevance', sql.Int, env.tenders.highRelevanceThreshold);

  const statsResult = await req.query(`
    SELECT
      (SELECT COUNT(*) FROM dbo.TenderOpportunity) AS totalOpportunities,
      (SELECT COUNT(*) FROM dbo.TenderOpportunity WHERE CreatedAt >= DATEADD(day, -7, SYSUTCDATETIME())) AS newThisWeek,
      (SELECT COUNT(*) FROM dbo.TenderOpportunity
       WHERE DeadlineDate IS NOT NULL
         AND DeadlineDate >= SYSUTCDATETIME()
         AND DeadlineDate <= DATEADD(day, @LeadDays, SYSUTCDATETIME())) AS deadlineSoon,
      (SELECT COUNT(*) FROM dbo.SavedTender WHERE UserID = @UserId) AS savedCount,
      (SELECT COUNT(*) FROM dbo.TenderOpportunity
       WHERE RelevanceScore >= @HighRelevance) AS highRelevance`);

  const stats = statsResult.recordset[0];

  // By country (top 8).
  const countryResult = await db.request().query(
    `SELECT Country AS country, COUNT(*) AS count
     FROM dbo.TenderOpportunity
     WHERE Country IS NOT NULL
     GROUP BY Country
     ORDER BY count DESC
     OFFSET 0 ROWS FETCH NEXT 8 ROWS ONLY`
  );

  // By sector (top 8).
  const sectorResult = await db.request().query(
    `SELECT Sector AS sector, COUNT(*) AS count
     FROM dbo.TenderOpportunity
     WHERE Sector IS NOT NULL
     GROUP BY Sector
     ORDER BY count DESC
     OFFSET 0 ROWS FETCH NEXT 8 ROWS ONLY`
  );

  // Upcoming deadlines (top 5).
  const upcomingResult = await db
    .request()
    .input('UserId', sql.Int, userId)
    .query(
      `SELECT t.TenderOpportunityID, t.TenderSourceID, src.Name AS SourceName,
              t.Title, t.Organization, t.Country, t.Sector, t.Description,
              t.SourceUrl, t.SourceReference, t.PublicationDate, t.DeadlineDate,
              t.EstimatedValue, t.Currency, t.Region, t.Confidence, t.DataQuality, t.ContentHash, t.VerificationStatus,
              t.RelevanceScore, ${OPPORTUNITY_COLUMNS},
              t.AiSummary, t.AiStructuredData, t.AiGapFill, t.AiEnrichedAt,
              t.CreatedAt,
              CASE WHEN s.SavedTenderID IS NOT NULL THEN 1 ELSE 0 END AS IsSaved,
              s.Status AS SavedStatus, s.SavedTenderID
       FROM dbo.TenderOpportunity t
       LEFT JOIN dbo.TenderSource src ON src.TenderSourceID = t.TenderSourceID
       ${OPPORTUNITY_PRODUCT_GROUP_JOIN}
       LEFT JOIN dbo.SavedTender s ON s.TenderOpportunityID = t.TenderOpportunityID AND s.UserID = @UserId
       WHERE t.DeadlineDate IS NOT NULL AND t.DeadlineDate >= SYSUTCDATETIME()
       ORDER BY t.DeadlineDate ASC
       OFFSET 0 ROWS FETCH NEXT 5 ROWS ONLY`
    );

  // By opportunity type (all five types, even when zero).
  const typeResult = await db.request().query(
    `SELECT OpportunityType AS type, COUNT(*) AS count
     FROM dbo.TenderOpportunity
     GROUP BY OpportunityType`
  );
  const typeCounts = new Map<string, number>(
    typeResult.recordset.map((r) => [r.type as string, Number(r.count)])
  );
  const byType = OPPORTUNITY_TYPES.map((type) => ({ type, count: typeCounts.get(type) ?? 0 }));

  // Export opportunities: outside Ethiopia (plan §18/§20).
  const exportResult = await db.request().query(
    `SELECT COUNT(*) AS c FROM dbo.TenderOpportunity
     WHERE Country IS NOT NULL AND Country <> '' AND Country <> 'Ethiopia'`
  );

  // By source (top 8).
  const sourceResult = await db.request().query(
    `SELECT ISNULL(src.Name, '(no source)') AS source, COUNT(*) AS count
     FROM dbo.TenderOpportunity t
     LEFT JOIN dbo.TenderSource src ON src.TenderSourceID = t.TenderSourceID
     GROUP BY src.Name
     ORDER BY count DESC
     OFFSET 0 ROWS FETCH NEXT 8 ROWS ONLY`
  );

  // By product group (top 8, unclassified included).
  const groupResult = await db.request().query(
    `SELECT ISNULL(pg.Name, '(unclassified)') AS "group", COUNT(*) AS count
     FROM dbo.TenderOpportunity t
     LEFT JOIN dbo.ProductGroup pg ON pg.ProductGroupID = t.ProductGroupId
     GROUP BY pg.Name
     ORDER BY count DESC
     OFFSET 0 ROWS FETCH NEXT 8 ROWS ONLY`
  );

  // Relevance distribution (fixed buckets, plan §20).
  const bucketResult = await db.request().query(
    `SELECT
       SUM(CASE WHEN RelevanceScore >= 75 THEN 1 ELSE 0 END) AS b75,
       SUM(CASE WHEN RelevanceScore BETWEEN 50 AND 74 THEN 1 ELSE 0 END) AS b50,
       SUM(CASE WHEN RelevanceScore BETWEEN 25 AND 49 THEN 1 ELSE 0 END) AS b25,
       SUM(CASE WHEN RelevanceScore BETWEEN 0 AND 24 THEN 1 ELSE 0 END) AS b0,
       SUM(CASE WHEN RelevanceScore IS NULL THEN 1 ELSE 0 END) AS bnull
     FROM dbo.TenderOpportunity`
  );
  const b = bucketResult.recordset[0];
  const relevanceBuckets = [
    { label: 'High (75–100)', min: 75, max: 100, count: Number(b.b75) },
    { label: 'Medium (50–74)', min: 50, max: 74, count: Number(b.b50) },
    { label: 'Low (25–49)', min: 25, max: 49, count: Number(b.b25) },
    { label: 'None (0–24)', min: 0, max: 24, count: Number(b.b0) },
    { label: 'Unscored', min: -1, max: -1, count: Number(b.bnull) },
  ];

  // Deadline trend: deadlines per ISO week for the next 8 weeks (plan §20).
  const trendResult = await db
    .request()
    .input('From', sql.DateTime2, new Date())
    .query(
      `SELECT DeadlineDate FROM dbo.TenderOpportunity
       WHERE DeadlineDate >= @From AND DeadlineDate < DATEADD(day, 56, @From)`
    );
  const trendCounts = new Map<string, number>();
  const now = new Date();
  const mondayOfThisWeek = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  mondayOfThisWeek.setUTCDate(mondayOfThisWeek.getUTCDate() - ((mondayOfThisWeek.getUTCDay() + 6) % 7));
  for (let w = 0; w < 8; w++) {
    const start = new Date(mondayOfThisWeek);
    start.setUTCDate(start.getUTCDate() + w * 7);
    trendCounts.set(start.toISOString().slice(0, 10), 0);
  }
  for (const row of trendResult.recordset as Array<{ DeadlineDate: Date }>) {
    const d = new Date(row.DeadlineDate);
    const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const base = mondayOfThisWeek.getTime();
    const diffDays = Math.floor((day - base) / 86400000);
    if (diffDays < 0) continue;
    const weekIdx = Math.floor(diffDays / 7);
    if (weekIdx >= 8) continue;
    const key = new Date(base + weekIdx * 7 * 86400000).toISOString().slice(0, 10);
    trendCounts.set(key, (trendCounts.get(key) ?? 0) + 1);
  }
  const deadlineTrend = [...trendCounts.entries()].map(([weekStart, count]) => ({
    label: weekStart.slice(5),
    weekStart,
    count,
  }));

  return {
    totalOpportunities: stats.totalOpportunities,
    newThisWeek: stats.newThisWeek,
    deadlineSoon: stats.deadlineSoon,
    savedCount: stats.savedCount,
    highRelevance: stats.highRelevance,
    rfqCount: typeCounts.get('RFQ') ?? 0,
    buyerLeadCount: typeCounts.get('BUYER_LEAD') ?? 0,
    exportCount: Number(exportResult.recordset[0].c),
    tradeCount: typeCounts.get('TRADE_INTELLIGENCE') ?? 0,
    byCountry: countryResult.recordset.map((r) => ({ country: r.country, count: Number(r.count) })),
    bySector: sectorResult.recordset.map((r) => ({ sector: r.sector, count: Number(r.count) })),
    byType,
    bySource: sourceResult.recordset.map((r) => ({ source: r.source as string, count: Number(r.count) })),
    byProductGroup: groupResult.recordset.map((r) => ({ group: r.group as string, count: Number(r.count) })),
    relevanceBuckets,
    deadlineTrend,
    upcomingDeadlines: upcomingResult.recordset.map(toOpportunityDTO),
  };
}

// ---------------------------------------------------------------------------
// Interest profiles
// ---------------------------------------------------------------------------

function toProfileDTO(row: Record<string, unknown>): TenderInterestProfileDTO {
  const parseArr = (v: unknown): string[] => {
    if (!v) return [];
    try {
      const parsed = JSON.parse(v as string);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  };
  return {
    InterestProfileID: row.InterestProfileID as number,
    Name: row.Name as string,
    Sectors: parseArr(row.Sectors),
    Keywords: parseArr(row.Keywords),
    Countries: parseArr(row.Countries),
    MinValue: row.MinValue != null ? Number(row.MinValue) : null,
    MaxValue: row.MaxValue != null ? Number(row.MaxValue) : null,
    Currency: (row.Currency as string) || null,
    Organizations: parseArr(row.Organizations),
    ProductGroupCodes: parseArr(row.ProductGroupCodes),
    Types: parseArr(row.Types),
    BusinessGroupCodes: parseArr(row.BusinessGroupCodes),
    IsActive: !!row.IsActive,
    CreatedAt: new Date(row.CreatedAt as Date).toISOString(),
    UpdatedAt: row.UpdatedAt ? new Date(row.UpdatedAt as Date).toISOString() : null,
  };
}

export async function listInterestProfiles(): Promise<TenderInterestProfileDTO[]> {
  const result = await db.request().query(
    `SELECT InterestProfileID, Name, Sectors, Keywords, Countries,
            MinValue, MaxValue, Currency, Organizations, ProductGroupCodes, Types,
            BusinessGroupCodes, IsActive, CreatedAt, UpdatedAt
     FROM dbo.TenderInterestProfile
     ORDER BY CreatedAt DESC`
  );
  return result.recordset.map(toProfileDTO);
}

/**
 * Re-running relevance scoring over every opportunity after a profile change
 * is expensive, so it runs in the background (deduplicated: one pass at a time).
 */
let rescoreRunning = false;
function scheduleRescore(reason: string): void {
  if (rescoreRunning) return;
  rescoreRunning = true;
  setImmediate(() => {
    void rescoreAll()
      .then((scored) => logger.info(`[tenders] rescored ${scored} opportunities (${reason})`))
      .catch((err: unknown) => {
        logger.error(`[tenders] rescoreAll failed (${reason}): ${err instanceof Error ? err.message : String(err)}`);
      })
      .finally(() => {
        rescoreRunning = false;
      });
  });
}

export async function createInterestProfile(data: {
  Name: string;
  Sectors?: string[] | null;
  Keywords?: string[] | null;
  Countries?: string[] | null;
  MinValue?: number | null;
  MaxValue?: number | null;
  Currency?: string | null;
  Organizations?: string[] | null;
  ProductGroupCodes?: string[] | null;
  Types?: string[] | null;
  BusinessGroupCodes?: string[] | null;
  IsActive?: boolean;
}): Promise<TenderInterestProfileDTO> {
  const result = await db
    .request()
    .input('Name', sql.NVarChar(200), data.Name)
    .input('Sectors', sql.NVarChar(sql.MAX), data.Sectors ? JSON.stringify(data.Sectors) : null)
    .input('Keywords', sql.NVarChar(sql.MAX), data.Keywords ? JSON.stringify(data.Keywords) : null)
    .input('Countries', sql.NVarChar(sql.MAX), data.Countries ? JSON.stringify(data.Countries) : null)
    .input('MinValue', sql.Decimal(18, 2), data.MinValue ?? null)
    .input('MaxValue', sql.Decimal(18, 2), data.MaxValue ?? null)
    .input('Currency', sql.VarChar(10), data.Currency || null)
    .input('Organizations', sql.NVarChar(sql.MAX), data.Organizations ? JSON.stringify(data.Organizations) : null)
    .input('ProductGroupCodes', sql.NVarChar(sql.MAX), data.ProductGroupCodes ? JSON.stringify(data.ProductGroupCodes) : null)
    .input('Types', sql.NVarChar(sql.MAX), data.Types ? JSON.stringify(data.Types) : null)
    .input('BusinessGroupCodes', sql.NVarChar(sql.MAX), data.BusinessGroupCodes ? JSON.stringify(data.BusinessGroupCodes) : null)
    .input('IsActive', sql.Bit, data.IsActive !== false)
    .query(
      `INSERT INTO dbo.TenderInterestProfile
         (Name, Sectors, Keywords, Countries, MinValue, MaxValue, Currency,
          Organizations, ProductGroupCodes, Types, BusinessGroupCodes, IsActive)
       OUTPUT INSERTED.InterestProfileID, INSERTED.Name, INSERTED.Sectors, INSERTED.Keywords, INSERTED.Countries,
              INSERTED.MinValue, INSERTED.MaxValue, INSERTED.Currency, INSERTED.Organizations,
              INSERTED.ProductGroupCodes, INSERTED.Types, INSERTED.BusinessGroupCodes,
              INSERTED.IsActive, INSERTED.CreatedAt, INSERTED.UpdatedAt
       VALUES (@Name, @Sectors, @Keywords, @Countries, @MinValue, @MaxValue, @Currency,
               @Organizations, @ProductGroupCodes, @Types, @BusinessGroupCodes, @IsActive)`
    );
  scheduleRescore('interest profile created');
  return toProfileDTO(result.recordset[0]);
}

export async function updateInterestProfile(id: number, data: {
  Name?: string;
  Sectors?: string[] | null;
  Keywords?: string[] | null;
  Countries?: string[] | null;
  MinValue?: number | null;
  MaxValue?: number | null;
  Currency?: string | null;
  Organizations?: string[] | null;
  ProductGroupCodes?: string[] | null;
  Types?: string[] | null;
  BusinessGroupCodes?: string[] | null;
  IsActive?: boolean;
}): Promise<TenderInterestProfileDTO> {
  const sets: string[] = [];
  const req = db.request().input('Id', sql.Int, id);

  if (data.Name !== undefined) { req.input('Name', sql.NVarChar(200), data.Name); sets.push('Name = @Name'); }
  if (data.Sectors !== undefined) { req.input('Sectors', sql.NVarChar(sql.MAX), JSON.stringify(data.Sectors)); sets.push('Sectors = @Sectors'); }
  if (data.Keywords !== undefined) { req.input('Keywords', sql.NVarChar(sql.MAX), JSON.stringify(data.Keywords)); sets.push('Keywords = @Keywords'); }
  if (data.Countries !== undefined) { req.input('Countries', sql.NVarChar(sql.MAX), JSON.stringify(data.Countries)); sets.push('Countries = @Countries'); }
  if (data.MinValue !== undefined) { req.input('MinValue', sql.Decimal(18, 2), data.MinValue); sets.push('MinValue = @MinValue'); }
  if (data.MaxValue !== undefined) { req.input('MaxValue', sql.Decimal(18, 2), data.MaxValue); sets.push('MaxValue = @MaxValue'); }
  if (data.Currency !== undefined) { req.input('Currency', sql.VarChar(10), data.Currency); sets.push('Currency = @Currency'); }
  if (data.Organizations !== undefined) { req.input('Organizations', sql.NVarChar(sql.MAX), JSON.stringify(data.Organizations)); sets.push('Organizations = @Organizations'); }
  if (data.ProductGroupCodes !== undefined) { req.input('ProductGroupCodes', sql.NVarChar(sql.MAX), JSON.stringify(data.ProductGroupCodes)); sets.push('ProductGroupCodes = @ProductGroupCodes'); }
  if (data.Types !== undefined) { req.input('Types', sql.NVarChar(sql.MAX), JSON.stringify(data.Types)); sets.push('Types = @Types'); }
  if (data.BusinessGroupCodes !== undefined) { req.input('BusinessGroupCodes', sql.NVarChar(sql.MAX), JSON.stringify(data.BusinessGroupCodes)); sets.push('BusinessGroupCodes = @BusinessGroupCodes'); }
  if (data.IsActive !== undefined) { req.input('IsActive', sql.Bit, data.IsActive); sets.push('IsActive = @IsActive'); }

  if (sets.length === 0) {
    const result = await req.query(
      `SELECT InterestProfileID, Name, Sectors, Keywords, Countries, MinValue, MaxValue, Currency,
              Organizations, ProductGroupCodes, Types, BusinessGroupCodes, IsActive, CreatedAt, UpdatedAt
       FROM dbo.TenderInterestProfile WHERE InterestProfileID = @Id`
    );
    return toProfileDTO(result.recordset[0]);
  }

  sets.push('UpdatedAt = SYSUTCDATETIME()');
  const result = await req.query(
    `UPDATE dbo.TenderInterestProfile SET ${sets.join(', ')}
     OUTPUT INSERTED.InterestProfileID, INSERTED.Name, INSERTED.Sectors, INSERTED.Keywords, INSERTED.Countries,
            INSERTED.MinValue, INSERTED.MaxValue, INSERTED.Currency, INSERTED.Organizations,
            INSERTED.ProductGroupCodes, INSERTED.Types, INSERTED.BusinessGroupCodes,
            INSERTED.IsActive, INSERTED.CreatedAt, INSERTED.UpdatedAt
     WHERE InterestProfileID = @Id`
  );
  if (result.recordset.length === 0) {
    throw new NotFoundError('Interest profile not found');
  }
  scheduleRescore('interest profile updated');
  return toProfileDTO(result.recordset[0]);
}

export async function deleteInterestProfile(id: number): Promise<void> {
  const result = await db
    .request()
    .input('Id', sql.Int, id)
    .query(
      `DELETE FROM dbo.TenderInterestProfile WHERE InterestProfileID = @Id`
    );
  if (result.rowsAffected[0] === 0) {
    throw new NotFoundError('Interest profile not found');
  }
  scheduleRescore('interest profile deleted');
}

// ---------------------------------------------------------------------------
// Distinct filter values
// ---------------------------------------------------------------------------

export async function getDistinctCountries(): Promise<string[]> {
  const result = await db.request().query(
    `SELECT DISTINCT Country FROM dbo.TenderOpportunity
     WHERE Country IS NOT NULL AND Country <> ''
     ORDER BY Country`
  );
  return result.recordset.map((r) => r.Country);
}

export async function getDistinctSectors(): Promise<string[]> {
  const result = await db.request().query(
    `SELECT DISTINCT Sector FROM dbo.TenderOpportunity
     WHERE Sector IS NOT NULL AND Sector <> ''
     ORDER BY Sector`
  );
  return result.recordset.map((r) => r.Sector);
}

export async function getDistinctBusinessGroups(): Promise<Array<{ Code: string; Name: string; ProductGroupCount: number }>> {
  const result = await db.request().query(
    `SELECT bg.Code, bg.Name, COUNT(pg.ProductGroupID) AS ProductGroupCount
     FROM dbo.BusinessGroup bg
     INNER JOIN dbo.ProductGroup pg ON pg.BusinessGroupCode = bg.Code
     GROUP BY bg.Code, bg.Name
     ORDER BY bg.Code`
  );
  return result.recordset.map((r) => ({
    Code: r.Code as string,
    Name: r.Name as string,
    ProductGroupCount: Number(r.ProductGroupCount),
  }));
}
