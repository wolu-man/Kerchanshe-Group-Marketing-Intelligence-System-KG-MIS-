// =============================================================================
// Tender Intelligence — HTTP routes.
//
//   GET    /api/v1/tenders                          — list/search opportunities
//   POST   /api/v1/tenders                          — create opportunity (manual)
//   GET    /api/v1/tenders/dashboard                 — dashboard stats
//   GET    /api/v1/tenders/countries                 — distinct countries (filter)
//   GET    /api/v1/tenders/sectors                   — distinct sectors (filter)
//   GET    /api/v1/tenders/product-groups            — product taxonomy (filter)
//   GET    /api/v1/tenders/business-groups           — business groups w/ product groups (filter)
//   GET    /api/v1/tenders/saved                     — saved tenders for current user
//   POST   /api/v1/tenders/:id/save                  — save/bookmark an opportunity
//   PUT    /api/v1/tenders/:id/save                  — update save status
//   DELETE /api/v1/tenders/:id/save                  — unsave
//   POST   /api/v1/tenders/:id/verify                — set verification status
//   POST   /api/v1/tenders/:id/ai-enrich             — AI enrichment
//   POST   /api/v1/tenders/:id/relevance-explanation  — why this score (plan §8)
//   GET    /api/v1/tenders/:id                       — single opportunity
//
//   Source management (admin/manager):
//   GET    /api/v1/tenders/sources                    — list sources
//   POST   /api/v1/tenders/sources                   — create source
//   POST   /api/v1/tenders/sources/test              — test an unsaved configuration
//   GET    /api/v1/tenders/sources/:id               — get source (admin: includes ApiConfig)
//   PUT    /api/v1/tenders/sources/:id               — update source
//   DELETE /api/v1/tenders/sources/:id               — delete source
//   POST   /api/v1/tenders/sources/:id/test          — test a stored source
//   POST   /api/v1/tenders/sources/:id/collect        — manual collection trigger
//   POST   /api/v1/tenders/sources/collect-all        — collect every active source
//
//   Interest profiles (admin/manager):
//   GET    /api/v1/tenders/interest-profiles          — list profiles
//   POST   /api/v1/tenders/interest-profiles          — create profile
//   PUT    /api/v1/tenders/interest-profiles/:id      — update profile
//   DELETE /api/v1/tenders/interest-profiles/:id      — delete profile
//
//   Manual data upload (admin/manager):
//   GET    /api/v1/tenders/imports/template           — download xlsx/csv template
//   POST   /api/v1/tenders/imports/parse              — upload/parse file → mapping + validation preview
//   POST   /api/v1/tenders/imports/commit             — insert validated rows (duplicates skipped)
//   DELETE /api/v1/tenders/imports/:token             — discard a pending upload
//   GET    /api/v1/tenders/imports                    — import history (AuditLog)
//
//   NOTE: static GET routes must be registered before GET /:id, otherwise
//   they are shadowed by the parameterized route.
// =============================================================================

import { Router } from 'express';
import type { Request } from 'express';
import { requireAuth } from '../../middleware/auth';
import { can } from '../../middleware/permission';
import { validate } from '../../middleware/validate';
import { asyncHandler, parsePagination } from '../../utils/http';
import { BadRequestError } from '../../utils/errors';
import { audit } from '../../db/audit';
import {
  listOpportunities,
  getOpportunity,
  createOpportunity,
  saveOpportunity,
  unsaveOpportunity,
  listSavedTenders,
  setVerificationStatus,
  getDashboard,
  getDistinctCountries,
  getDistinctSectors,
  getDistinctBusinessGroups,
} from './tenders.service';
import { listProductGroups } from './classifier';
import { explainScore } from './relevance';
import {
  listSources,
  getSource,
  createSource,
  updateSource,
  deleteSource,
} from './source.service';
import { testSource, testSourceById } from './source-test.service';
import {
  listInterestProfiles,
  createInterestProfile,
  updateInterestProfile,
  deleteInterestProfile,
} from './tenders.service';
import { collectFromSourceById, collectAllSources } from './collection.service';
import { enrichOpportunity } from './ai-enrichment';
import { importUploadSingle } from './upload';
import { parseImport, commitImport, discardImportFile, buildTemplate, listImportHistory } from './import.service';
import {
  createSourceSchema,
  updateSourceSchema,
  testSourceSchema,
  createInterestProfileSchema,
  updateInterestProfileSchema,
  saveTenderSchema,
  createOpportunitySchema,
} from './tenders.types';
import {
  importCommitSchema,
  mappingEntrySchema,
  TOKEN_REGEX,
  type MappingEntry,
} from './import.types';

function logAudit(req: Request, entry: { userId: number | null; action: string; entity: string; entityId?: number | null; detail?: Record<string, unknown> | null }) {
  return audit({ ...entry, ipAddress: req.ip });
}

/** Parses a route :id param, rejecting NaN/floats/negatives with a 400. */
function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError('Invalid id', 'INVALID_ID');
  }
  return id;
}

/** True when the caller may see stored source credentials (ApiConfig). */
function isCredentialAdmin(req: Request): boolean {
  return req.user!.role === 'Administrator';
}

/** Reads an optional non-empty string from a (multipart) body field. */
function bodyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/** Parses the optional JSON `mapping` field of the multipart parse request. */
function parseMappingField(value: unknown): MappingEntry[] | undefined {
  const raw = bodyString(value);
  if (!raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BadRequestError('Mapping must be valid JSON', 'IMPORT_MAPPING_INVALID');
  }
  if (!Array.isArray(parsed)) {
    throw new BadRequestError('Mapping must be an array of { column, field } entries', 'IMPORT_MAPPING_INVALID');
  }
  const entries: MappingEntry[] = [];
  for (const item of parsed) {
    const result = mappingEntrySchema.safeParse(item);
    if (!result.success) {
      throw new BadRequestError('Mapping contains an invalid entry', 'IMPORT_MAPPING_INVALID');
    }
    entries.push(result.data);
  }
  return entries;
}

const router = Router();
router.use(requireAuth);

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

// GET /dashboard — tender dashboard stats
router.get(
  '/dashboard',
  can('tenders.view'),
  asyncHandler(async (req, res) => {
    const result = await getDashboard(req.user!.userId);
    res.json(result);
  })
);

// ---------------------------------------------------------------------------
// Filter values
// ---------------------------------------------------------------------------

router.get(
  '/countries',
  can('tenders.view'),
  asyncHandler(async (_req, res) => {
    const items = await getDistinctCountries();
    res.json({ items });
  })
);

router.get(
  '/sectors',
  can('tenders.view'),
  asyncHandler(async (_req, res) => {
    const items = await getDistinctSectors();
    res.json({ items });
  })
);

router.get(
  '/product-groups',
  can('tenders.view'),
  asyncHandler(async (_req, res) => {
    const items = await listProductGroups();
    res.json({ items });
  })
);

// GET /business-groups — business groups that own at least one product group (filter)
router.get(
  '/business-groups',
  can('tenders.view'),
  asyncHandler(async (_req, res) => {
    const items = await getDistinctBusinessGroups();
    res.json({ items });
  })
);

// ---------------------------------------------------------------------------
// Opportunities — list/search
// ---------------------------------------------------------------------------

// GET / — list/search opportunities
router.get(
  '/',
  can('tenders.view'),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = parsePagination(req);
    const result = await listOpportunities({
      userId: req.user!.userId,
      search: req.query.search as string | undefined,
      country: req.query.country as string | undefined,
      sector: req.query.sector as string | undefined,
      sourceId: req.query.sourceId ? Number(req.query.sourceId) : undefined,
      verificationStatus: req.query.verificationStatus as string | undefined,
      type: req.query.type as string | undefined,
      productGroup: req.query.productGroup as string | undefined,
      relevanceMin: req.query.relevanceMin ? Number(req.query.relevanceMin) : undefined,
      fromDeadline: req.query.fromDeadline as string | undefined,
      toDeadline: req.query.toDeadline as string | undefined,
      fromPublication: req.query.fromPublication as string | undefined,
      toPublication: req.query.toPublication as string | undefined,
      confidenceMin: req.query.confidenceMin ? Number(req.query.confidenceMin) : undefined,
      dataQuality: req.query.dataQuality as string | undefined,
      businessGroup: req.query.businessGroup as string | undefined,
      organization: req.query.organization as string | undefined,
      exportOnly: req.query.exportOnly === 'true',
      savedOnly: req.query.savedOnly === 'true',
      page,
      pageSize,
    });
    res.json(result);
  })
);

// GET /saved — saved tenders for current user
router.get(
  '/saved',
  can('tenders.save'),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = parsePagination(req);
    const result = await listSavedTenders(req.user!.userId, page, pageSize);
    res.json(result);
  })
);

// POST / — create opportunity (manual entry)
router.post(
  '/',
  can('tenders.manageSources'),
  validate(createOpportunitySchema),
  asyncHandler(async (req, res) => {
    const result = await createOpportunity(req.body, req.user!.userId);
    await logAudit(req, {
      userId: req.user!.userId,
      action: 'TENDER_OPPORTUNITY_CREATED',
      entity: 'TenderOpportunity',
      entityId: result.TenderOpportunityID,
      detail: { title: result.Title },
    });
    res.status(201).json(result);
  })
);

// POST /:id/save — save/bookmark
router.post(
  '/:id/save',
  can('tenders.save'),
  validate(saveTenderSchema),
  asyncHandler(async (req, res) => {
    const result = await saveOpportunity(
      parseId(req.params.id),
      req.user!.userId,
      req.body.Status || 'New',
      req.body.Notes,
    );
    await logAudit(req, {
      userId: req.user!.userId,
      action: 'TENDER_SAVED',
      entity: 'SavedTender',
      entityId: result.SavedTenderID,
      detail: { status: result.Status },
    });
    res.status(201).json(result);
  })
);

// PUT /:id/save — update save status
router.put(
  '/:id/save',
  can('tenders.save'),
  validate(saveTenderSchema),
  asyncHandler(async (req, res) => {
    const result = await saveOpportunity(
      parseId(req.params.id),
      req.user!.userId,
      req.body.Status || 'New',
      req.body.Notes,
    );
    await logAudit(req, {
      userId: req.user!.userId,
      action: 'TENDER_SAVED_UPDATED',
      entity: 'SavedTender',
      entityId: result.SavedTenderID,
      detail: { status: result.Status },
    });
    res.json(result);
  })
);

// DELETE /:id/save — unsave
router.delete(
  '/:id/save',
  can('tenders.save'),
  asyncHandler(async (req, res) => {
    await unsaveOpportunity(parseId(req.params.id), req.user!.userId);
    await logAudit(req, {
      userId: req.user!.userId,
      action: 'TENDER_UNSAVED',
      entity: 'SavedTender',
      entityId: parseId(req.params.id),
    });
    res.json({ ok: true });
  })
);

// POST /:id/verify — set verification status
router.post(
  '/:id/verify',
  can('tenders.verify'),
  asyncHandler(async (req, res) => {
    const status = req.body.status === 'Verified' ? 'Verified' : 'Unverified';
    await setVerificationStatus(parseId(req.params.id), status);
    await logAudit(req, {
      userId: req.user!.userId,
      action: 'TENDER_VERIFICATION_SET',
      entity: 'TenderOpportunity',
      entityId: parseId(req.params.id),
      detail: { status },
    });
    res.json({ ok: true, status });
  })
);

// POST /:id/ai-enrich — AI enrichment
router.post(
  '/:id/ai-enrich',
  can('tenders.aiEnrich'),
  asyncHandler(async (req, res) => {
    const provider = (req.query.provider as string) || 'auto';
    const result = await enrichOpportunity(parseId(req.params.id), provider as 'auto' | 'ollama' | 'gemini' | 'groq');
    await logAudit(req, {
      userId: req.user!.userId,
      action: 'TENDER_AI_ENRICHED',
      entity: 'TenderOpportunity',
      entityId: parseId(req.params.id),
      detail: { hasSummary: !!result.summary },
    });
    res.json(result);
  })
);

// POST /:id/relevance-explanation — component breakdown of the relevance score
router.post(
  '/:id/relevance-explanation',
  can('tenders.view'),
  asyncHandler(async (req, res) => {
    const explanation = await explainScore(parseId(req.params.id));
    if (!explanation) {
      res.json({ total: 0, profileId: 0, profileName: null, components: [], matchedKeywords: [] });
      return;
    }
    res.json(explanation);
  })
);

// ---------------------------------------------------------------------------
// Source management
// ---------------------------------------------------------------------------

// GET /sources — list sources (no ApiConfig)
router.get(
  '/sources',
  can('tenders.view'),
  asyncHandler(async (_req, res) => {
    const items = await listSources();
    res.json({ items });
  })
);

// POST /sources — create source (restricted hosts are stored inactive)
router.post(
  '/sources',
  can('tenders.manageSources'),
  validate(createSourceSchema),
  asyncHandler(async (req, res) => {
    const result = await createSource(req.body, isCredentialAdmin(req));
    await logAudit(req, {
      userId: req.user!.userId,
      action: 'TENDER_SOURCE_CREATED',
      entity: 'TenderSource',
      entityId: result.TenderSourceID,
      detail: { name: result.Name, type: result.SourceType, restricted: result.Restricted },
    });
    res.status(201).json(result);
  })
);

// POST /sources/test — test an unsaved configuration (nothing is persisted)
router.post(
  '/sources/test',
  can('tenders.manageSources'),
  validate(testSourceSchema),
  asyncHandler(async (req, res) => {
    const result = await testSource(req.body);
    res.json(result);
  })
);

// GET /sources/:id — get source (Administrator receives ApiConfig)
router.get(
  '/sources/:id',
  can('tenders.manageSources'),
  asyncHandler(async (req, res) => {
    const result = await getSource(parseId(req.params.id), isCredentialAdmin(req));
    res.json(result);
  })
);

// PUT /sources/:id — update source (restricted hosts can never be activated)
router.put(
  '/sources/:id',
  can('tenders.manageSources'),
  validate(updateSourceSchema),
  asyncHandler(async (req, res) => {
    const result = await updateSource(parseId(req.params.id), req.body, isCredentialAdmin(req));
    await logAudit(req, {
      userId: req.user!.userId,
      action: 'TENDER_SOURCE_UPDATED',
      entity: 'TenderSource',
      entityId: result.TenderSourceID,
      detail: { name: result.Name, active: result.IsActive, restricted: result.Restricted },
    });
    res.json(result);
  })
);

// DELETE /sources/:id — delete source
router.delete(
  '/sources/:id',
  can('tenders.manageSources'),
  asyncHandler(async (req, res) => {
    await deleteSource(parseId(req.params.id));
    await logAudit(req, {
      userId: req.user!.userId,
      action: 'TENDER_SOURCE_DELETED',
      entity: 'TenderSource',
      entityId: parseId(req.params.id),
    });
    res.json({ ok: true });
  })
);

// POST /sources/:id/test — test a stored source without inserting anything
router.post(
  '/sources/:id/test',
  can('tenders.manageSources'),
  asyncHandler(async (req, res) => {
    const result = await testSourceById(parseId(req.params.id));
    res.json(result);
  })
);

// POST /sources/:id/collect — manual collection trigger
router.post(
  '/sources/:id/collect',
  can('tenders.collect'),
  asyncHandler(async (req, res) => {
    const result = await collectFromSourceById(parseId(req.params.id));
    await logAudit(req, {
      userId: req.user!.userId,
      action: 'TENDER_SOURCE_COLLECTED',
      entity: 'TenderSource',
      entityId: result.sourceId,
      detail: {
        status: result.status,
        fetched: result.opportunities.length,
        newCount: result.newCount,
        duplicates: result.duplicateCount,
        failed: result.failedCount,
        error: result.error,
      },
    });
    res.json(result);
  })
);

// POST /sources/collect-all — collect from all active sources
router.post(
  '/sources/collect-all',
  can('tenders.collect'),
  asyncHandler(async (req, res) => {
    const results = await collectAllSources();
    const summary = {
      total: results.length,
      success: results.filter((r) => r.status !== 'Failed').length,
      failed: results.filter((r) => r.status === 'Failed').length,
      totalOpportunities: results.reduce((sum, r) => sum + r.newCount, 0),
      totalFetched: results.reduce((sum, r) => sum + r.opportunities.length, 0),
    };
    await logAudit(req, {
      userId: req.user!.userId,
      action: 'TENDER_COLLECTION_ALL',
      entity: 'TenderSource',
      detail: summary,
    });
    res.json({ results, summary });
  })
);

// ---------------------------------------------------------------------------
// Interest profiles
// ---------------------------------------------------------------------------

// GET /interest-profiles — list profiles
router.get(
  '/interest-profiles',
  can('tenders.view'),
  asyncHandler(async (_req, res) => {
    const items = await listInterestProfiles();
    res.json({ items });
  })
);

// POST /interest-profiles — create profile
router.post(
  '/interest-profiles',
  can('tenders.manageProfiles'),
  validate(createInterestProfileSchema),
  asyncHandler(async (req, res) => {
    const result = await createInterestProfile(req.body);
    await logAudit(req, {
      userId: req.user!.userId,
      action: 'TENDER_INTEREST_PROFILE_CREATED',
      entity: 'TenderInterestProfile',
      entityId: result.InterestProfileID,
      detail: { name: result.Name },
    });
    res.status(201).json(result);
  })
);

// PUT /interest-profiles/:id — update profile
router.put(
  '/interest-profiles/:id',
  can('tenders.manageProfiles'),
  validate(updateInterestProfileSchema),
  asyncHandler(async (req, res) => {
    const result = await updateInterestProfile(parseId(req.params.id), req.body);
    await logAudit(req, {
      userId: req.user!.userId,
      action: 'TENDER_INTEREST_PROFILE_UPDATED',
      entity: 'TenderInterestProfile',
      entityId: result.InterestProfileID,
      detail: { name: result.Name },
    });
    res.json(result);
  })
);

// DELETE /interest-profiles/:id — delete profile
router.delete(
  '/interest-profiles/:id',
  can('tenders.manageProfiles'),
  asyncHandler(async (req, res) => {
    await deleteInterestProfile(parseId(req.params.id));
    await logAudit(req, {
      userId: req.user!.userId,
      action: 'TENDER_INTEREST_PROFILE_DELETED',
      entity: 'TenderInterestProfile',
      entityId: parseId(req.params.id),
    });
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Manual data upload (Excel/CSV import)
// ---------------------------------------------------------------------------

// GET /imports/template — downloadable import template (xlsx or csv)
router.get(
  '/imports/template',
  can('tenders.manageSources'),
  asyncHandler(async (req, res) => {
    const format = req.query.format === 'csv' ? 'csv' : 'xlsx';
    const template = await buildTemplate(format);
    res.setHeader('Content-Type', template.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${template.fileName}"`);
    res.send(template.data);
  })
);

// GET /imports — import history from dbo.AuditLog
router.get(
  '/imports',
  can('tenders.view'),
  asyncHandler(async (req, res) => {
    const requested = Number(req.query.limit);
    const items = await listImportHistory(Number.isFinite(requested) ? requested : 50);
    res.json({ items });
  })
);

// POST /imports/parse — upload a file (or re-parse by token) → mapping + row validation preview
router.post(
  '/imports/parse',
  can('tenders.manageSources'),
  importUploadSingle,
  asyncHandler(async (req, res) => {
    const result = await parseImport({
      file: req.file
        ? { path: req.file.path, filename: req.file.filename, originalname: req.file.originalname }
        : undefined,
      token: bodyString(req.body?.token),
      sheet: bodyString(req.body?.sheet),
      mapping: parseMappingField(req.body?.mapping),
    });
    res.json(result);
  })
);

// POST /imports/commit — insert validated rows; duplicates are skipped, never overwritten
router.post(
  '/imports/commit',
  can('tenders.manageSources'),
  validate(importCommitSchema),
  asyncHandler(async (req, res) => {
    const summary = await commitImport(req.body, req.user!.userId);
    await logAudit(req, {
      userId: req.user!.userId,
      action: 'TENDER_IMPORT',
      entity: 'TenderOpportunity',
      detail: {
        fileName: summary.fileName,
        totalRows: summary.totalRows,
        imported: summary.imported,
        duplicates: summary.duplicates,
        skipped: summary.skipped,
        failed: summary.failed,
        highRelevanceCount: summary.highRelevanceCount,
      },
    });
    res.json(summary);
  })
);

// DELETE /imports/:token — discard a pending upload (idempotent)
router.delete(
  '/imports/:token',
  can('tenders.manageSources'),
  asyncHandler(async (req, res) => {
    const token = String(req.params.token ?? '');
    if (!TOKEN_REGEX.test(token)) {
      throw new BadRequestError('Invalid import token', 'IMPORT_INVALID_TOKEN');
    }
    await discardImportFile(token);
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Single opportunity — registered last so static routes are never shadowed
// ---------------------------------------------------------------------------

// GET /:id — single opportunity
router.get(
  '/:id',
  can('tenders.view'),
  asyncHandler(async (req, res) => {
    const result = await getOpportunity(parseId(req.params.id), req.user!.userId);
    res.json(result);
  })
);

export { router as tendersRouter };
