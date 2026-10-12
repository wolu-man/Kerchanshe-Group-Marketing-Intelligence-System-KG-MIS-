// =============================================================================
// Collection Service — orchestrates scheduled source collection.
//
// Iterates active sources, resolves the adapter by type, fetches raw
// opportunities, normalizes/dedup-checks via content hash, inserts new
// opportunities, triggers relevance scoring, and optionally dispatches
// notifications for high-relevance matches.
//
// Reliability guarantees:
//   - one failing source never aborts the batch (each source is isolated);
//   - a concurrent-insert race is counted as a duplicate, never a failure;
//   - restricted hosts are never fetched, even if a row is active out-of-band;
//   - opt-in per-source AI auto-enrichment (AiAutoEnrich, default off) runs
//     inside try/catch and can never change the run status or counters;
//   - every run records a status + error message on dbo.TenderSource and emits
//     a structured log line (no credentials, no raw page payloads).
// =============================================================================

import sql from 'mssql';
import { db } from '../../db/pool';
import { logger } from '../../config/logger';
import { env } from '../../config/env';
import { NotFoundError } from '../../utils/errors';
import { dispatchEvent } from '../notifications/notifications.service';
import { getAdapter, type RawOpportunity, type TenderSourceConfig, type CollectionResult, contentHash } from './adapters/adapter';
import { scoreOpportunity } from './relevance';
import { classifyOpportunity, loadProductGroupsSafe, type ProductGroupRule } from './classifier';
import { computeConfidence, computeDataQuality } from './quality';
import { updateCollectionStatus, listActiveSourcesForCollection } from './source.service';
import { enrichOpportunity } from './ai-enrichment';
import {
  computeCollectionStatus,
  isDuplicateKeyError,
  isRestrictedSourceUrl,
  restrictedSourceMessage,
} from './source-policy';

const MAX_STORED_ERROR = 4000;

type InsertOutcome = { inserted: true; id: number } | { inserted: false };

/**
 * Inserts a raw opportunity into the DB if it doesn't already exist.
 *
 * The unique ContentHash constraint is the authoritative duplicate guard: a
 * check-then-insert race is resolved by the DB and reported here as
 * `inserted: false` rather than as an error.
 *
 * Opportunity type + product group are classified at insert time from the
 * configured taxonomy (`groups`); a classification miss stays TENDER/null.
 *
 * Exported for the cross-provider dedup test (collection.live.test.ts).
 */
export async function insertIfNew(
  raw: RawOpportunity,
  sourceId: number,
  groups: ProductGroupRule[],
): Promise<InsertOutcome> {
  const hash = contentHash(raw);
  const classification = classifyOpportunity(
    {
      title: raw.title,
      description: raw.description,
      sector: raw.sector,
      organization: raw.organization,
    },
    groups,
    raw.opportunityType,
  );
  const confidence = computeConfidence({ ...raw });
  const dataQuality = computeDataQuality(confidence);

  const existing = await db
    .request()
    .input('Hash', sql.VarChar(64), hash)
    .query(`SELECT TenderOpportunityID FROM dbo.TenderOpportunity WHERE ContentHash = @Hash`);
  if (existing.recordset.length > 0) {
    return { inserted: false };
  }

  try {
    const result = await db
      .request()
      .input('TenderSourceID', sql.Int, sourceId)
      .input('Title', sql.NVarChar(500), raw.title)
      .input('Organization', sql.NVarChar(300), raw.organization)
      .input('Country', sql.NVarChar(100), raw.country)
      .input('Sector', sql.NVarChar(200), raw.sector)
      .input('Description', sql.NVarChar(sql.MAX), raw.description)
      .input('SourceUrl', sql.NVarChar(1000), raw.sourceUrl)
      .input('SourceReference', sql.NVarChar(200), raw.sourceReference)
      .input('PublicationDate', sql.DateTime2, raw.publicationDate)
      .input('DeadlineDate', sql.DateTime2, raw.deadlineDate)
      .input('EstimatedValue', sql.Decimal(18, 2), raw.estimatedValue)
      .input('Currency', sql.VarChar(10), raw.currency)
      .input('Region', sql.NVarChar(100), raw.region ?? null)
      .input('Confidence', sql.TinyInt, confidence)
      .input('DataQuality', sql.VarChar(20), dataQuality)
      .input('ContentHash', sql.VarChar(64), hash)
      .input('OpportunityType', sql.VarChar(30), classification.opportunityType)
      .input('ProductGroupId', sql.Int, classification.productGroupId)
      .query(
        `INSERT INTO dbo.TenderOpportunity
           (TenderSourceID, Title, Organization, Country, Sector, Description,
            SourceUrl, SourceReference, PublicationDate, DeadlineDate,
            EstimatedValue, Currency, Region, Confidence, DataQuality, ContentHash,
            OpportunityType, ProductGroupId, ClassificationMethod, ClassifiedAt)
         OUTPUT INSERTED.TenderOpportunityID
         VALUES (@TenderSourceID, @Title, @Organization, @Country, @Sector, @Description,
                 @SourceUrl, @SourceReference, @PublicationDate, @DeadlineDate,
                 @EstimatedValue, @Currency, @Region, @Confidence, @DataQuality, @ContentHash,
                 @OpportunityType, @ProductGroupId, 'rule', SYSUTCDATETIME())`
      );
    return { inserted: true, id: result.recordset[0].TenderOpportunityID as number };
  } catch (err) {
    // Another run inserted the same content between our check and this insert.
    if (isDuplicateKeyError(err)) return { inserted: false };
    throw err;
  }
}

/** Persists the outcome of a run without ever throwing into the caller. */
async function persistStatus(
  sourceId: number,
  status: 'Success' | 'Failed' | 'Partial',
  newCount: number,
  error: string | null,
): Promise<void> {
  try {
    await updateCollectionStatus(sourceId, status, newCount, error);
  } catch (err) {
    logger.error('Failed to persist tender source collection status', {
      sourceId,
      status,
      error: (err as Error).message,
    });
  }
}

/** Collects from a single source. Never throws — always resolves to a result. */
export async function collectFromSource(sourceRow: Record<string, unknown>): Promise<CollectionResult> {
  const startedAt = Date.now();
  const sourceConfig: TenderSourceConfig = {
    TenderSourceID: sourceRow.TenderSourceID as number,
    Name: sourceRow.Name as string,
    SourceType: sourceRow.SourceType as 'api' | 'rss' | 'scraping',
    URL: sourceRow.URL as string,
    ApiConfig: (sourceRow.ApiConfig as string) || null,
    RateLimitMs: sourceRow.RateLimitMs as number,
    RobotsCompliance: !!sourceRow.RobotsCompliance,
  };

  const base = {
    sourceId: sourceConfig.TenderSourceID,
    sourceName: sourceConfig.Name,
  };

  // Defense in depth: never fetch a restricted host, whatever IsActive says.
  if (isRestrictedSourceUrl(sourceConfig.URL)) {
    const message = restrictedSourceMessage(sourceConfig.URL);
    logger.warn('Skipping restricted tender source', {
      ...base,
      url: sourceConfig.URL,
    });
    await persistStatus(sourceConfig.TenderSourceID, 'Failed', 0, message);
    return { ...base, status: 'Failed', opportunities: [], newCount: 0, duplicateCount: 0, failedCount: 0, error: message };
  }

  try {
    const adapter = getAdapter(sourceConfig.SourceType);
    const rawOpportunities = await adapter.fetch(sourceConfig);

    let newCount = 0;
    let dupCount = 0;
    let failedCount = 0;
    const insertErrors: string[] = [];
    const highRelevanceIds: number[] = [];
    const highThreshold = env.tenders.highRelevanceThreshold;
    // Per-source opt-in (default off): AI-enrich each newly inserted row.
    const autoEnrich = !!sourceRow.AiAutoEnrich;

    // Load the product taxonomy once per run (empty on failure → type-only
    // classification; the run itself never fails because of taxonomy lookup).
    const productGroups = await loadProductGroupsSafe();

    for (const raw of rawOpportunities) {
      let outcome: InsertOutcome;
      try {
        outcome = await insertIfNew(raw, sourceConfig.TenderSourceID, productGroups);
      } catch (err) {
        failedCount++;
        const message = (err as Error).message;
        insertErrors.push(message);
        logger.error('Failed to insert opportunity from source', {
          ...base,
          title: raw.title.slice(0, 200),
          error: message,
        });
        continue;
      }

      if (!outcome.inserted) {
        dupCount++;
        continue;
      }
      newCount++;

      // Relevance scoring failures must not be reported as insert failures.
      try {
        const score = await scoreOpportunity(outcome.id);
        if (score >= highThreshold) highRelevanceIds.push(outcome.id);
      } catch (err) {
        logger.error('Failed to score new opportunity', {
          ...base,
          opportunityId: outcome.id,
          error: (err as Error).message,
        });
      }

      // Opt-in AI auto-enrichment (AiAutoEnrich on the source). Runs after the
      // insert is already durable; every failure is swallowed so an AI outage
      // can never change the collection status, counters, or error field.
      if (autoEnrich) {
        try {
          await enrichOpportunity(outcome.id, env.ai.provider);
        } catch (err) {
          logger.warn('AI auto-enrichment failed for new opportunity (collection unaffected)', {
            ...base,
            opportunityId: outcome.id,
            error: (err as Error).message,
          });
        }
      }
    }

    // Dispatch notification for high-relevance matches.
    if (highRelevanceIds.length > 0) {
      try {
        await dispatchEvent({
          event: 'TENDER_NEW_MATCH',
          subject: `${highRelevanceIds.length} new high-relevance tender(s) found`,
          body: `Source "${sourceConfig.Name}" collected ${newCount} new opportunities. ${highRelevanceIds.length} scored high relevance (≥${highThreshold}).`,
          payload: {
            sourceId: sourceConfig.TenderSourceID,
            sourceName: sourceConfig.Name,
            newCount,
            highRelevanceIds: highRelevanceIds.slice(0, 20),
            threshold: highThreshold,
          },
        });
      } catch (err) {
        logger.error('TENDER_NEW_MATCH notification failed', { ...base, error: (err as Error).message });
      }
    }

    const status = computeCollectionStatus(
      { fetched: rawOpportunities.length, inserted: newCount, duplicates: dupCount, failed: failedCount },
      false,
    );
    const error = insertErrors.length > 0 ? insertErrors.join(' | ').slice(0, MAX_STORED_ERROR) : null;

    logger.info('Source collection completed', {
      ...base,
      status,
      fetched: rawOpportunities.length,
      newCount,
      dupCount,
      failedCount,
      durationMs: Date.now() - startedAt,
    });

    await persistStatus(sourceConfig.TenderSourceID, status, newCount, error);

    return {
      ...base,
      status,
      opportunities: rawOpportunities,
      newCount,
      duplicateCount: dupCount,
      failedCount,
      error,
    };
  } catch (err) {
    const errorMessage = ((err as Error).message || 'Unknown collection error').slice(0, MAX_STORED_ERROR);
    logger.error('Source collection failed', {
      ...base,
      url: sourceConfig.URL,
      durationMs: Date.now() - startedAt,
      error: errorMessage,
    });
    await persistStatus(sourceConfig.TenderSourceID, 'Failed', 0, errorMessage);
    return {
      ...base,
      status: 'Failed',
      opportunities: [],
      newCount: 0,
      duplicateCount: 0,
      failedCount: 0,
      error: errorMessage,
    };
  }
}

/** Collects from all active sources (called by cron job or manual trigger). */
export async function collectAllSources(): Promise<CollectionResult[]> {
  const sources = await listActiveSourcesForCollection();
  if (sources.length === 0) {
    logger.info('No active tender sources to collect from');
    return [];
  }

  logger.info('Starting tender source collection', { sourceCount: sources.length });
  const results: CollectionResult[] = [];

  for (const source of sources) {
    try {
      results.push(await collectFromSource(source));
    } catch (err) {
      // collectFromSource is non-throwing; this guards against future regressions
      // so a single source can never abort the batch.
      const sourceId = (source.TenderSourceID as number) ?? 0;
      const message = (err as Error).message;
      logger.error('Unexpected error while collecting tender source', { sourceId, error: message });
      await persistStatus(sourceId, 'Failed', 0, message);
      results.push({
        sourceId,
        sourceName: (source.Name as string) || `source ${sourceId}`,
        status: 'Failed',
        opportunities: [],
        newCount: 0,
        duplicateCount: 0,
        failedCount: 0,
        error: message,
      });
    }
  }

  const failedCount = results.filter((r) => r.status === 'Failed').length;
  const totalNew = results.reduce((sum, r) => sum + r.newCount, 0);
  const totalFetched = results.reduce((sum, r) => sum + r.opportunities.length, 0);

  logger.info('Tender source collection batch completed', {
    total: results.length,
    success: results.length - failedCount,
    failed: failedCount,
    totalNew,
    totalFetched,
  });

  return results;
}

/** Collects from a single source by ID (manual trigger). */
export async function collectFromSourceById(sourceId: number): Promise<CollectionResult> {
  const source = await getSourceForCollectionInternal(sourceId);
  if (!source) {
    throw new NotFoundError('Tender source not found');
  }
  // A restricted source is never active, but it still deserves the explicit
  // "restricted" explanation from collectFromSource instead of a generic 404.
  if (!source.IsActive && !isRestrictedSourceUrl(source.URL as string)) {
    throw new NotFoundError('Tender source is inactive');
  }
  return collectFromSource(source);
}

/** Internal helper to fetch a single source row for collection. */
async function getSourceForCollectionInternal(id: number): Promise<Record<string, unknown> | null> {
  const result = await db
    .request()
    .input('Id', sql.Int, id)
    .query(
      `SELECT TenderSourceID, Name, SourceType, URL, ApiConfig, RateLimitMs, RobotsCompliance, AiAutoEnrich, IsActive
       FROM dbo.TenderSource
       WHERE TenderSourceID = @Id`
    );
  return result.recordset.length > 0 ? result.recordset[0] : null;
}

/** Finds opportunities with upcoming deadlines and dispatches reminder notifications. */
export async function sendDeadlineReminders(): Promise<number> {
  const leadDays = await configInt('tenders.reminderLeadDays', env.tenders.reminderLeadDays);

  // Find saved opportunities with deadlines within the lead time window
  // that haven't been reminded yet today.
  const result = await db
    .request()
    .input('LeadDays', sql.Int, leadDays)
    .query(
      `SELECT s.SavedTenderID, s.UserID, s.Status, t.Title, t.DeadlineDate,
              t.TenderOpportunityID, t.Organization
       FROM dbo.SavedTender s
       JOIN dbo.TenderOpportunity t ON t.TenderOpportunityID = s.TenderOpportunityID
       WHERE t.DeadlineDate IS NOT NULL
         AND t.DeadlineDate >= SYSUTCDATETIME()
         AND t.DeadlineDate <= DATEADD(day, @LeadDays, SYSUTCDATETIME())
         AND s.Status NOT IN ('Won', 'Lost', 'Archived')`
    );

  let sent = 0;

  for (const row of result.recordset) {
    // Dedup: skip if we already sent a reminder for this opportunity today.
    const dedupCheck = await db
      .request()
      .input('Event', sql.VarChar(100), 'TENDER_DEADLINE_REMINDER')
      .input('UserId', sql.Int, row.UserID)
      .input('OppId', sql.Int, row.TenderOpportunityID)
      .input('Cutoff', sql.DateTime2, new Date(new Date().setHours(0, 0, 0, 0)))
      .query(
        `SELECT TOP 1 n.NotificationID FROM dbo.Notification n
         WHERE n.TriggerEvent = @Event
           AND n.RecipientUserID = @UserId
           AND JSON_VALUE(n.Payload, '$.tenderOpportunityId') = CAST(@OppId AS NVARCHAR(20))
           AND n.CreatedAt >= @Cutoff`
      );

    if (dedupCheck.recordset.length > 0) continue;

    const deadline = new Date(row.DeadlineDate);
    const daysUntil = Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    try {
      await dispatchEvent({
        event: 'TENDER_DEADLINE_REMINDER',
        subject: `Tender deadline approaching: ${row.Title}`,
        body: `The tender "${row.Title}" from ${row.Organization || 'unknown organization'} has a deadline in ${daysUntil} day(s) (${deadline.toUTCString()}). Current status: ${row.Status}.`,
        payload: {
          tenderOpportunityId: row.TenderOpportunityID,
          title: row.Title,
          deadlineDate: row.DeadlineDate.toISOString(),
          daysUntil,
          savedStatus: row.Status,
          savedTenderId: row.SavedTenderID,
        },
        userIds: [row.UserID],
      });
      sent++;
    } catch (err) {
      logger.error('TENDER_DEADLINE_REMINDER dispatch failed', {
        opportunityId: row.TenderOpportunityID,
        error: (err as Error).message,
      });
    }
  }

  logger.info('Tender deadline reminders sent', { sent, leadDays });
  return sent;
}

/** Reads an integer SystemConfig value. */
async function configInt(key: string, fallback: number): Promise<number> {
  try {
    const row = await db.request().input('Key', sql.VarChar(100), key).query(
      `SELECT ConfigValue FROM dbo.SystemConfig WHERE ConfigKey = @Key`
    );
    const n = Number(row.recordset[0]?.ConfigValue);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}
