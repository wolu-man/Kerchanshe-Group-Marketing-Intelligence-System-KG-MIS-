// =============================================================================
// Tender Intelligence — Manual data upload (Excel/CSV import) types + schemas.
//
// Column contract mirrors createOpportunitySchema / dbo.TenderOpportunity so
// imported rows flow through the exact same createOpportunity() path as manual
// entries and collected opportunities (validation, dedup, scoring, audit).
// No schema changes: history lives in dbo.AuditLog (Action = 'TENDER_IMPORT').
// =============================================================================

import { z } from 'zod';
import { createOpportunitySchema } from './tenders.types';

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/** Hard upload size cap for import files (multer + re-check). */
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
/** Maximum number of data rows (excluding the header) per import file. */
export const IMPORT_MAX_ROWS = 2000;
/** Maximum number of columns read from an import file. */
export const IMPORT_MAX_COLUMNS = 40;
/** Per-cell truncation before validation (bounds memory; field maxima still apply). */
export const IMPORT_CELL_MAX = 20000;
/** Maximum row-level issues returned in a commit summary. */
export const IMPORT_MAX_ERRORS = 100;
/** Allowed upload extensions (lowercase, leading dot). */
export const IMPORT_ALLOWED_EXTENSIONS = ['.csv', '.xlsx', '.xls'] as const;
/** Orphan uploads older than this are purged opportunistically. */
export const IMPORT_ORPHAN_TTL_MS = 24 * 60 * 60 * 1000;

/** Filename token: UUID stored on disk as `<token>.<ext>` (no path chars). */
export const TOKEN_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Column metadata (template = canonical headers)
// ---------------------------------------------------------------------------

export type ImportFieldType = 'text' | 'date' | 'number' | 'int';

export interface ImportColumn {
  /** Field name accepted by createOpportunity(). */
  field: string;
  /** Canonical template header. */
  label: string;
  required: boolean;
  type: ImportFieldType;
  /** Max length enforced by validation (mirrors createOpportunitySchema). */
  max?: number;
  /** Normalized header aliases for auto-mapping (lowercase alphanumerics only). */
  aliases: string[];
}

export const IMPORT_COLUMNS: ImportColumn[] = [
  { field: 'Title', label: 'Title', required: true, type: 'text', max: 500,
    aliases: ['title', 'tendertitle', 'opportunitytitle', 'name', 'subject', 'tendername'] },
  { field: 'SourceUrl', label: 'SourceUrl', required: true, type: 'text', max: 1000,
    aliases: ['sourceurl', 'url', 'link', 'referencelink', 'sourcelink', 'tenderurl', 'websitelink'] },
  { field: 'Organization', label: 'Organization', required: false, type: 'text', max: 300,
    aliases: ['organization', 'organisation', 'org', 'procuringentity', 'buyer', 'entity', 'agency', 'customer'] },
  { field: 'Country', label: 'Country', required: false, type: 'text', max: 100,
    aliases: ['country', 'nation', 'location'] },
  { field: 'Sector', label: 'Sector', required: false, type: 'text', max: 200,
    aliases: ['sector', 'category', 'industry', 'categoryname'] },
  { field: 'Description', label: 'Description', required: false, type: 'text',
    aliases: ['description', 'summary', 'details', 'scope', 'tenderdescription'] },
  { field: 'SourceReference', label: 'SourceReference', required: false, type: 'text', max: 200,
    aliases: ['sourcereference', 'reference', 'referencenumber', 'ref', 'tendernumber', 'bidnumber', 'number'] },
  { field: 'PublicationDate', label: 'PublicationDate', required: false, type: 'date',
    aliases: ['publicationdate', 'publisheddate', 'published', 'publishdate', 'issue date', 'issuedate', 'datepublished'] },
  { field: 'DeadlineDate', label: 'DeadlineDate', required: false, type: 'date',
    aliases: ['deadlinedate', 'deadline', 'duedate', 'closingdate', 'submissiondeadline', 'bidduedate', 'expirationdate', 'dateofdeadline'] },
  { field: 'EstimatedValue', label: 'EstimatedValue', required: false, type: 'number',
    aliases: ['estimatedvalue', 'value', 'estimatedcost', 'budget', 'amount', 'estimatedamount', 'contractvalue'] },
  { field: 'Currency', label: 'Currency', required: false, type: 'text', max: 10,
    aliases: ['currency', 'curr', 'currencycode'] },
  { field: 'TenderSourceID', label: 'TenderSourceID', required: false, type: 'int',
    aliases: ['tendersourceid', 'sourceid', 'datasourceid'] },
];

export const IMPORT_FIELD_NAMES: string[] = IMPORT_COLUMNS.map((c) => c.field);
export const IMPORT_FIELD_SET: ReadonlySet<string> = new Set(IMPORT_FIELD_NAMES);
/** Required subset that must be mapped before a parse/commit can proceed. */
export const IMPORT_REQUIRED_FIELDS: string[] = IMPORT_COLUMNS.filter((c) => c.required).map((c) => c.field);

export function importColumnFor(field: string): ImportColumn | undefined {
  return IMPORT_COLUMNS.find((c) => c.field === field);
}

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

/** One mapping decision: spreadsheet column index → target field ('' = ignore). */
export const mappingEntrySchema = z.object({
  column: z.number().int().min(0).max(IMPORT_MAX_COLUMNS - 1),
  field: z.string().max(50),
});

export type MappingEntry = z.infer<typeof mappingEntrySchema>;

/** Body for POST /tenders/imports/commit. */
export const importCommitSchema = z.object({
  token: z.string().regex(TOKEN_REGEX, 'Invalid import token'),
  mapping: z.array(mappingEntrySchema).min(1, 'Mapping is required').max(IMPORT_MAX_COLUMNS),
  sheet: z.string().max(128).optional().nullable(),
});

export type ImportCommitInput = z.infer<typeof importCommitSchema>;

/** Row-level validation: reuses createOpportunitySchema + optional FK column. */
export const importRowSchema = createOpportunitySchema.extend({
  TenderSourceID: z.number().int().positive().nullable().optional(),
});

export type ImportRowPayload = z.infer<typeof importRowSchema>;

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export type ImportRowStatus = 'valid' | 'invalid' | 'duplicate';

/** Why a row is a duplicate (rows are never overwritten). */
export type ImportDuplicateReason = 'existing' | 'in-file';

export interface ImportRowIssue {
  /** Spreadsheet row number (header = row 1, first data row = 2). */
  row: number;
  /** Target field the issue relates to, or null for row-level errors. */
  field: string | null;
  message: string;
}

export interface ImportRowPreview {
  row: number;
  status: ImportRowStatus;
  /** Display values keyed by target field (unmapped columns are not included). */
  values: Record<string, string>;
  issues: ImportRowIssue[];
  duplicateReason: ImportDuplicateReason | null;
}

export interface ImportSuggestedColumn {
  column: number;
  header: string;
  /** Auto-detected target field, or null when no match was found. */
  field: string | null;
}

export interface ImportParseResult {
  token: string;
  fileName: string;
  sheets: string[];
  sheet: string;
  headers: string[];
  suggestedMapping: ImportSuggestedColumn[];
  rows: ImportRowPreview[];
  counts: { total: number; valid: number; invalid: number; duplicate: number };
}

export interface ImportSummary {
  fileName: string;
  totalRows: number;
  imported: number;
  duplicates: number;
  /** Rows excluded because validation found issues (never partially inserted). */
  skipped: number;
  failed: number;
  /** Imported rows scoring >= env.tenders.highRelevanceThreshold. */
  highRelevanceCount: number;
  durationMs: number;
  /** Capped at IMPORT_MAX_ERRORS; see errorCount for the true total. */
  errors: ImportRowIssue[];
  errorCount: number;
}

export interface ImportHistoryItem {
  AuditLogID: number;
  UserName: string | null;
  CreatedAt: string;
  /** Parsed from AuditLog.Detail. */
  fileName: string | null;
  totalRows: number | null;
  imported: number | null;
  duplicates: number | null;
  skipped: number | null;
  failed: number | null;
}
