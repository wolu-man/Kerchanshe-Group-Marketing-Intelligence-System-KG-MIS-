// =============================================================================
// Tender Intelligence — Manual data upload (Excel/CSV import) service.
//
// Pipeline: read file → header auto-mapping (or client mapping) → per-row
// normalization + validation (createOpportunitySchema limits) → duplicate
// preview (contentHash: in-file + DB) → commit through createOpportunity(),
// which gives imports the exact same dedup / scoring / RBAC semantics as
// manual entries. Existing rows are NEVER updated: duplicates are counted
// and skipped. History is written to dbo.AuditLog (Action = TENDER_IMPORT).
//
// File safety: 5 MB cap, extension allowlist, magic-byte sniffing (upload
// layer), UUID filenames in uploads/imports, row/column caps, per-cell
// truncation, no formula evaluation anywhere.
// =============================================================================

import fs from 'fs';
import path from 'path';
import sql from 'mssql';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { parse as parseCsv } from 'csv-parse/sync';
import { db } from '../../db/pool';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors';
import { dispatchEvent } from '../notifications/notifications.service';
import { contentHash, normalizeDate, type RawOpportunity } from './adapters/adapter';
import { isDuplicateKeyError } from './source-policy';
import { createOpportunity } from './tenders.service';
import { IMPORT_DIR } from './upload';
import {
  IMPORT_CELL_MAX,
  IMPORT_COLUMNS,
  IMPORT_FIELD_SET,
  IMPORT_MAX_COLUMNS,
  IMPORT_MAX_ERRORS,
  IMPORT_MAX_ROWS,
  IMPORT_ORPHAN_TTL_MS,
  IMPORT_REQUIRED_FIELDS,
  TOKEN_REGEX,
  importRowSchema,
  type ImportColumn,
  type ImportDuplicateReason,
  type ImportHistoryItem,
  type ImportParseResult,
  type ImportRowIssue,
  type ImportRowPayload,
  type ImportRowPreview,
  type ImportSummary,
  type ImportSuggestedColumn,
  type MappingEntry,
} from './import.types';

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

// IMPORT_DIR comes from ./upload (line 30) — the same directory multer writes
// to, so uploaded files are always findable here. Created at startup there.

/** Original upload filenames by token — cosmetic only (lost on restart). */
const originalNames = new Map<string, string>();

/** Bytes kept for a value in the preview payload (field maxima still apply). */
const PREVIEW_CELL_CHARS = 120;
/** Upper bound on Excel serials (9999-12-31). */
const EXCEL_SERIAL_MAX = 2958465;
/** Decimal(18,2) ceiling. */
const MAX_DECIMAL = 9.99e15;

// ---------------------------------------------------------------------------
// Grid model
// ---------------------------------------------------------------------------

type RawCell = string | number | boolean | Date | null;

interface RawRecord {
  /** Physical spreadsheet row number (header row is normally 1). */
  row: number;
  cells: RawCell[];
}

interface RawSheet {
  sheets: string[];
  sheet: string;
  records: RawRecord[];
}

export interface SpreadsheetGrid {
  sheets: string[];
  sheet: string;
  headers: string[];
  rows: RawRecord[];
}

export interface EvaluatedRow {
  row: number;
  /** Null when validation found issues — such rows are never inserted. */
  payload: ImportRowPayload | null;
  issues: ImportRowIssue[];
  /** Display values for the preview table (truncated). */
  display: Record<string, string>;
  duplicateReason: ImportDuplicateReason | null;
  hash: string | null;
}

// ---------------------------------------------------------------------------
// Cell helpers
// ---------------------------------------------------------------------------

function truncateCell(value: string, max = IMPORT_CELL_MAX): string {
  return value.length > max ? value.slice(0, max) : value;
}

function rawIsBlank(raw: RawCell): boolean {
  return raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '');
}

function isBlankRow(cells: RawCell[]): boolean {
  return cells.every((c) => rawIsBlank(c));
}

/** Display string for the preview table (bounded). */
function displayCell(raw: RawCell): string {
  if (rawIsBlank(raw)) return '';
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  if (typeof raw === 'boolean') return String(raw);
  return truncateCell(String(raw), PREVIEW_CELL_CHARS).trim();
}

function headerLabel(raw: RawCell): string {
  if (rawIsBlank(raw)) return '';
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  return truncateCell(String(raw), 200).trim();
}

/** Normalizes a header for alias matching (lowercase alphanumerics only). */
function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

/** Magic-byte check for spreadsheet containers (called by the upload layer). */
export function sniffSpreadsheetMagic(buffer: Buffer, ext: string): boolean {
  if (ext === '.xlsx') return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b; // 'PK'
  if (ext === '.xls') {
    return (
      buffer.length >= 8 &&
      buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0 &&
      buffer[4] === 0xa1 && buffer[5] === 0xb1 && buffer[6] === 0x1a && buffer[7] === 0xe1
    );
  }
  return true; // .csv is plain text — no signature to verify
}

/** Parses a CSV buffer into a raw sheet (BOM + quoted fields supported). */
export function readCsvBuffer(buffer: Buffer): RawSheet {
  let matrix: string[][];
  try {
    matrix = parseCsv(buffer, {
      bom: true,
      columns: false,
      skip_empty_lines: false,
      relax_column_count: true,
      relax_quotes: true,
      trim: false,
    }) as string[][];
  } catch (err) {
    throw new BadRequestError(`Could not parse CSV file: ${(err as Error).message}`, 'IMPORT_PARSE_ERROR');
  }
  const records: RawRecord[] = matrix.map((cells, index) => ({
    row: index + 1,
    cells: cells.map((c) => (c === undefined ? null : c)),
  }));
  return { sheets: ['CSV'], sheet: 'CSV', records };
}

/** Extracts a display/value cell from an ExcelJS cell without evaluating formulas. */
function excelCellValue(cell: ExcelJS.Cell): RawCell {
  const v = cell.value as unknown;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'string') return truncateCell(v);
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) {
      return truncateCell((o.richText as Array<{ text?: string }>).map((t) => t.text ?? '').join(''));
    }
    if (typeof o.text === 'string') return truncateCell(o.text); // hyperlink / shared formula
    if ('result' in o) return excelResultValue(o.result);
    if ('error' in o || typeof o.error === 'string') return null;
  }
  return null;
}

/** Cached formula result only — never evaluates formulas. */
function excelResultValue(result: unknown): RawCell {
  if (result === null || result === undefined) return null;
  if (result instanceof Date) return result;
  if (typeof result === 'string') return truncateCell(result);
  if (typeof result === 'number' || typeof result === 'boolean') return result;
  if (typeof result === 'object' && 'error' in (result as Record<string, unknown>)) return null;
  return null;
}

/** Parses a modern .xlsx buffer with ExcelJS (first/selected worksheet). */
export async function readXlsxBuffer(buffer: Buffer, sheet?: string | null): Promise<RawSheet> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as never);
  } catch (err) {
    throw new BadRequestError(`Could not read Excel file: ${(err as Error).message}`, 'IMPORT_PARSE_ERROR');
  }
  const sheets = workbook.worksheets.map((w) => w.name);
  if (sheets.length === 0) throw new BadRequestError('Workbook contains no worksheets', 'IMPORT_EMPTY_FILE');
  const sheetName = pickSheet(sheets, sheet);
  const worksheet = workbook.getWorksheet(sheetName);
  if (!worksheet) throw new BadRequestError(`Worksheet "${sheetName}" not found`, 'IMPORT_SHEET_NOT_FOUND');

  const records: RawRecord[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells: RawCell[] = [];
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      cells[colNumber - 1] = excelCellValue(cell);
    });
    records.push({ row: rowNumber, cells });
  });
  return { sheets, sheet: sheetName, records };
}

/**
 * Parses a legacy .xls buffer with SheetJS.
 * Formulas are disabled (cellFormula:false) and only primitive cell values
 * are read — objects are never merged into application state.
 */
export function readXlsBuffer(buffer: Buffer, sheet?: string | null): RawSheet {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: false,
      cellFormula: false,
      cellHTML: false,
      cellNF: false,
      cellStyles: false,
      sheetStubs: false,
    });
  } catch (err) {
    throw new BadRequestError(`Could not read Excel file: ${(err as Error).message}`, 'IMPORT_PARSE_ERROR');
  }
  const sheets = workbook.SheetNames;
  if (sheets.length === 0) throw new BadRequestError('Workbook contains no worksheets', 'IMPORT_EMPTY_FILE');
  const sheetName = pickSheet(sheets, sheet);
  const matrix = XLSX.utils.sheet_to_json<RawCell[]>(workbook.Sheets[sheetName], {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  });
  const records: RawRecord[] = matrix.map((cells, index) => ({
    row: index + 1,
    cells: Array.isArray(cells) ? cells : [],
  }));
  return { sheets, sheet: sheetName, records };
}

function pickSheet(sheets: string[], requested?: string | null): string {
  if (requested) {
    const hit = sheets.find((s) => s.toLowerCase() === requested.toLowerCase());
    if (!hit) {
      throw new BadRequestError(
        `Worksheet "${requested}" not found. Available: ${sheets.join(', ')}`,
        'IMPORT_SHEET_NOT_FOUND',
      );
    }
    return hit;
  }
  return sheets[0];
}

/** Reads a stored upload and returns the raw sheet for the requested worksheet. */
export async function loadSheet(filePath: string, sheet?: string | null): Promise<RawSheet> {
  const ext = path.extname(filePath).toLowerCase();
  const buffer = await fs.promises.readFile(filePath);
  if (ext === '.csv') return readCsvBuffer(buffer);
  if (ext === '.xlsx') return readXlsxBuffer(buffer, sheet);
  if (ext === '.xls') return readXlsBuffer(buffer, sheet);
  throw new BadRequestError(
    `Unsupported file type "${ext}". Allowed: .csv, .xlsx, .xls`,
    'IMPORT_UNSUPPORTED_FILE',
  );
}

// ---------------------------------------------------------------------------
// Grid building (header detection + limits)
// ---------------------------------------------------------------------------

/** Builds the header/data grid from raw records, enforcing row/column caps. */
export function buildGrid(raw: RawSheet): SpreadsheetGrid {
  const records = raw.records.filter((r) => !isBlankRow(r.cells));
  if (records.length === 0) {
    throw new BadRequestError('File contains no data', 'IMPORT_EMPTY_FILE');
  }

  const headerRecord = records[0];
  let headers = headerRecord.cells.map(headerLabel);
  while (headers.length > 0 && headers[headers.length - 1] === '') headers.pop();

  // Data rows may be wider than the header — expose those columns too.
  let maxCells = headers.length;
  for (const r of records) if (r.cells.length > maxCells) maxCells = r.cells.length;
  if (maxCells > IMPORT_MAX_COLUMNS) {
    throw new BadRequestError(
      `File has ${maxCells} columns; the maximum per import is ${IMPORT_MAX_COLUMNS}.`,
      'IMPORT_TOO_MANY_COLUMNS',
    );
  }
  while (headers.length < maxCells) headers.push(`Column ${headers.length + 1}`);
  if (headers.length === 0) headers.push('Column 1');

  const rows = records.slice(1);
  if (rows.length === 0) {
    throw new BadRequestError('File has a header row but no data rows', 'IMPORT_NO_DATA_ROWS');
  }
  if (rows.length > IMPORT_MAX_ROWS) {
    throw new BadRequestError(
      `File has ${rows.length} data rows; the maximum per import is ${IMPORT_MAX_ROWS} rows. Split the file and import in batches.`,
      'IMPORT_TOO_MANY_ROWS',
    );
  }

  return { sheets: raw.sheets, sheet: raw.sheet, headers, rows };
}

// ---------------------------------------------------------------------------
// Column mapping
// ---------------------------------------------------------------------------

/** Auto-suggests a field for every header column (exact match, then prefix). */
export function suggestMapping(headers: string[]): ImportSuggestedColumn[] {
  const normalized = headers.map(normalizeHeader);
  const result: ImportSuggestedColumn[] = headers.map((header, column) => ({ column, header, field: null }));
  const used = new Set<string>();

  for (const col of IMPORT_COLUMNS) {
    if (used.has(col.field)) continue;
    const aliases = [normalizeHeader(col.label), ...col.aliases.map(normalizeHeader)];
    let idx = normalized.findIndex(
      (h, i) => h !== '' && result[i].field === null && aliases.includes(h),
    );
    if (idx < 0) {
      idx = normalized.findIndex(
        (h, i) =>
          h.length >= 4 &&
          result[i].field === null &&
          aliases.some((a) => a.length >= 4 && (h.startsWith(a) || a.startsWith(h))),
      );
    }
    if (idx >= 0) {
      result[idx].field = col.field;
      used.add(col.field);
    }
  }
  return result;
}

/**
 * Validates a mapping and returns field → column index.
 * Throws 400 on unknown fields, double claims, or missing required fields.
 */
export function buildPlan(mapping: MappingEntry[] | undefined, headers: string[]): Map<string, number> {
  const entries: MappingEntry[] =
    mapping ??
    suggestMapping(headers)
      .filter((s) => s.field !== null)
      .map((s) => ({ column: s.column, field: s.field as string }));

  const plan = new Map<string, number>();
  const claimedColumns = new Set<number>();

  for (const entry of entries) {
    if (!entry.field) continue; // explicitly ignored column
    if (!IMPORT_FIELD_SET.has(entry.field)) {
      throw new BadRequestError(`Unknown import field "${entry.field}"`, 'IMPORT_MAPPING_FIELD');
    }
    if (entry.column >= headers.length) {
      throw new BadRequestError(
        `Column ${entry.column + 1} is out of range for this file (${headers.length} columns)`,
        'IMPORT_MAPPING_RANGE',
      );
    }
    if (plan.has(entry.field)) {
      throw new BadRequestError(`Field "${entry.field}" is mapped more than once`, 'IMPORT_MAPPING_DUPLICATE');
    }
    if (claimedColumns.has(entry.column)) {
      throw new BadRequestError(
        `Column ${entry.column + 1} is mapped to more than one field`,
        'IMPORT_MAPPING_DUPLICATE',
      );
    }
    plan.set(entry.field, entry.column);
    claimedColumns.add(entry.column);
  }

  const missing = IMPORT_REQUIRED_FIELDS.filter((f) => !plan.has(f));
  if (missing.length > 0) {
    throw new BadRequestError(
      `Required field(s) not mapped: ${missing.join(', ')}`,
      'IMPORT_MAPPING_MISSING',
    );
  }
  return plan;
}

// ---------------------------------------------------------------------------
// Coercion + validation
// ---------------------------------------------------------------------------

interface CellOutcome {
  value: unknown;
  issue: string | null;
}

/**
 * Parses a date from a spreadsheet cell.
 * - Date objects (ExcelJS) are anchored at UTC by excelToDate() → UTC parts.
 * - Numbers are Excel serials (epoch 1899-12-30) → UTC.
 * - Strings: ISO, D-MMM-YYYY, D/M/YYYY, then native fallback.
 * Returns null for blank/unparseable values — callers distinguish the two.
 */
export function parseImportDate(raw: unknown): Date | null {
  if (raw === null || raw === undefined) return null;
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return null;
    return new Date(Date.UTC(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate()));
  }
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 1 || raw > EXCEL_SERIAL_MAX) return null;
    return new Date(Math.round((raw - 25569) * 86400000));
  }
  const s = String(raw).trim();
  if (!s) return null;

  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s);
  if (iso) return utcDate(+iso[1], +iso[2], +iso[3]);

  const months: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  };
  const dmy = /^(\d{1,2})[\s-]([A-Za-z]{3,9})[\s-](\d{4})/.exec(s);
  if (dmy) {
    const month = months[dmy[2].slice(0, 3).toLowerCase()];
    if (month) return utcDate(+dmy[3], month, +dmy[1]);
  }

  const slashed = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(s);
  if (slashed) {
    const day = +slashed[1];
    const month = +slashed[2];
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) return utcDate(+slashed[3], month, day);
    // e.g. 01/15/2026 — month first; let the native parser handle it.
  }

  const native = new Date(s);
  if (!isNaN(native.getTime())) {
    return new Date(Date.UTC(native.getFullYear(), native.getMonth(), native.getDate()));
  }
  return null;
}

function utcDate(year: number, month: number, day: number): Date | null {
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  return isNaN(d.getTime()) ? null : d;
}

function coerceText(raw: RawCell, col: ImportColumn): CellOutcome {
  if (rawIsBlank(raw)) return { value: null, issue: null };
  let text: string;
  if (raw instanceof Date) text = raw.toISOString().slice(0, 10);
  else text = truncateCell(String(raw)).trim();
  if (text === '') return { value: null, issue: null };
  if (col.max !== undefined && text.length > col.max) {
    return { value: null, issue: `${col.label} must be at most ${col.max} characters (got ${text.length})` };
  }
  return { value: text, issue: null };
}

function coerceDate(raw: RawCell, col: ImportColumn): CellOutcome {
  if (rawIsBlank(raw)) return { value: null, issue: null };
  const parsed = parseImportDate(raw);
  if (!parsed) {
    const shown = truncateCell(String(raw instanceof Date ? raw.toISOString() : raw), 40);
    return { value: null, issue: `${col.label} value "${shown}" is not a valid date (use YYYY-MM-DD)` };
  }
  return { value: parsed.toISOString().slice(0, 10), issue: null };
}

/** Numbers tolerate thousands separators, currency prefixes, and k/M/B suffixes. */
export function coerceNumberValue(raw: RawCell, col: ImportColumn): CellOutcome {
  if (rawIsBlank(raw)) return { value: null, issue: null };
  if (typeof raw === 'number') return boundedNumber(raw, col);
  if (typeof raw === 'boolean') return notANumber(raw, col);
  if (raw instanceof Date) return notANumber(raw, col);

  let s = truncateCell(String(raw)).trim();
  if (s === '') return { value: null, issue: null };
  s = s.replace(/^[€$£]\s*/u, '');
  s = s.replace(/^(etb|usd|eur|gbp|kes|ugx|tzs|ngn|zar|birr|br)\s+/i, '');

  const compact = s.replace(/\s+/g, '');
  const scaled = /^(-?\d+(?:\.\d+)?)([kmb])$/i.exec(compact);
  if (scaled) {
    const base = Number(scaled[1]);
    const scaleMap: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };
    const factor = scaleMap[scaled[2].toLowerCase()];
    if (factor === undefined) return notANumber(s, col);
    return boundedNumber(base * factor, col, s);
  }
  const plain = compact.replace(/,/g, '');
  if (/^-?\d+(\.\d+)?$/.test(plain)) return boundedNumber(Number(plain), col);
  return notANumber(s, col);
}

function boundedNumber(n: number, col: ImportColumn, shown?: string): CellOutcome {
  if (!Number.isFinite(n)) return notANumber(shown ?? String(n), col);
  if (Math.abs(n) > MAX_DECIMAL) {
    return { value: null, issue: `${col.label} value is out of range` };
  }
  return { value: n, issue: null };
}

function notANumber(shown: unknown, col: ImportColumn): CellOutcome {
  const text = truncateCell(String(shown), 40);
  return { value: null, issue: `${col.label} value "${text}" is not a valid number` };
}

function coerceInt(raw: RawCell, col: ImportColumn): CellOutcome {
  const result = coerceNumberValue(raw, col);
  if (result.issue || result.value === null) return result;
  const n = result.value as number;
  if (!Number.isInteger(n) || n <= 0) {
    return { value: null, issue: `${col.label} must be a positive whole number (got ${n})` };
  }
  return { value: n, issue: null };
}

/**
 * Validates every data row against the mapped columns.
 * Returns payloads ready for createOpportunity() plus row-level issues.
 */
export function evaluateRows(grid: SpreadsheetGrid, plan: Map<string, number>): EvaluatedRow[] {
  const results: EvaluatedRow[] = [];

  for (const record of grid.rows) {
    const issues: ImportRowIssue[] = [];
    const display: Record<string, string> = {};
    const candidate: Record<string, unknown> = {};

    for (const col of IMPORT_COLUMNS) {
      const columnIndex = plan.get(col.field);
      if (columnIndex === undefined) continue;
      const raw = record.cells[columnIndex] ?? null;
      display[col.field] = displayCell(raw);

      let outcome: CellOutcome;
      switch (col.type) {
        case 'text':
          outcome = coerceText(raw, col);
          break;
        case 'date':
          outcome = coerceDate(raw, col);
          break;
        case 'number':
          outcome = coerceNumberValue(raw, col);
          break;
        case 'int':
          outcome = coerceInt(raw, col);
          break;
      }
      candidate[col.field] = outcome.value;
      if (outcome.issue) {
        issues.push({ row: record.row, field: col.field, message: outcome.issue });
      } else if (col.required && outcome.value === null) {
        issues.push({ row: record.row, field: col.field, message: `${col.label} is required` });
      }
      if (issues.length >= 10) break; // bound per-row issue noise
    }

    let payload: ImportRowPayload | null = null;
    if (issues.length === 0) {
      const parsed = importRowSchema.safeParse(candidate);
      if (parsed.success) {
        payload = parsed.data;
      } else {
        for (const issue of parsed.error.issues) {
          issues.push({
            row: record.row,
            field: issue.path.join('.') || null,
            message: issue.message,
          });
          if (issues.length >= 10) break;
        }
      }
    }

    results.push({ row: record.row, payload, issues, display, duplicateReason: null, hash: null });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Duplicate detection (preview only — the DB is authoritative at commit)
// ---------------------------------------------------------------------------

/** Pure in-file dedup. Returns hashes of unique valid rows in row order. */
export function markInFileDuplicates(evaluated: EvaluatedRow[]): string[] {
  const seen = new Set<string>();
  const uniqueHashes: string[] = [];
  for (const ev of evaluated) {
    if (!ev.payload) continue;
    const raw = toRawOpportunity(ev.payload);
    const hash = contentHash(raw);
    ev.hash = hash;
    if (seen.has(hash)) {
      ev.duplicateReason = 'in-file';
      continue;
    }
    seen.add(hash);
    uniqueHashes.push(hash);
  }
  return uniqueHashes;
}

/** Marks rows whose ContentHash already exists in dbo.TenderOpportunity. */
async function markExistingDuplicates(evaluated: EvaluatedRow[], hashes: string[]): Promise<void> {
  const existing = new Set<string>();
  const CHUNK = 200;
  for (let i = 0; i < hashes.length; i += CHUNK) {
    const chunk = hashes.slice(i, i + CHUNK);
    const request = db.request();
    chunk.forEach((h, j) => request.input(`h${j}`, sql.VarChar(64), h));
    const placeholders = chunk.map((_, j) => `@h${j}`).join(',');
    const result = await request.query(
      `SELECT ContentHash FROM dbo.TenderOpportunity WHERE ContentHash IN (${placeholders})`,
    );
    for (const row of result.recordset as Array<{ ContentHash: string }>) existing.add(row.ContentHash);
  }
  for (const ev of evaluated) {
    if (ev.hash && existing.has(ev.hash) && !ev.duplicateReason) ev.duplicateReason = 'existing';
  }
}

function toRawOpportunity(payload: ImportRowPayload): RawOpportunity {
  return {
    title: payload.Title,
    organization: payload.Organization ?? null,
    country: payload.Country ?? null,
    sector: payload.Sector ?? null,
    description: payload.Description ?? null,
    sourceUrl: payload.SourceUrl,
    sourceReference: payload.SourceReference ?? null,
    publicationDate: normalizeDate(payload.PublicationDate),
    deadlineDate: normalizeDate(payload.DeadlineDate),
    estimatedValue: payload.EstimatedValue ?? null,
    currency: payload.Currency ?? null,
  };
}

function statusOf(ev: EvaluatedRow): ImportRowPreview['status'] {
  if (ev.issues.length > 0) return 'invalid';
  if (ev.duplicateReason) return 'duplicate';
  return 'valid';
}

function buildPreview(evaluated: EvaluatedRow[]): ImportRowPreview[] {
  return evaluated.map((ev) => ({
    row: ev.row,
    status: statusOf(ev),
    values: ev.display,
    issues: ev.issues,
    duplicateReason: ev.duplicateReason,
  }));
}

function countPreview(rows: ImportRowPreview[]): ImportParseResult['counts'] {
  const counts = { total: rows.length, valid: 0, invalid: 0, duplicate: 0 };
  for (const r of rows) {
    if (r.status === 'valid') counts.valid++;
    else if (r.status === 'invalid') counts.invalid++;
    else counts.duplicate++;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Upload storage helpers
// ---------------------------------------------------------------------------

function sanitizeFileName(name: string): string {
  const base = path.basename(name || 'upload').replace(/[^\w.\- ()]/g, '_');
  return base.length > 200 ? base.slice(0, 200) : base;
}

/** Resolves a token to its stored upload path. Throws 400/404 as appropriate. */
async function resolveTokenFile(token: string): Promise<string> {
  if (!TOKEN_REGEX.test(token)) {
    throw new BadRequestError('Invalid import token', 'IMPORT_INVALID_TOKEN');
  }
  let entries: string[];
  try {
    entries = await fs.promises.readdir(IMPORT_DIR);
  } catch {
    throw new NotFoundError('Import file not found or already processed');
  }
  const match = entries.find((n) => n.toLowerCase().startsWith(`${token.toLowerCase()}.`));
  if (!match) throw new NotFoundError('Import file not found or already processed');
  return path.join(IMPORT_DIR, match);
}

/** Best-effort removal of a stored upload + its in-memory filename. */
export async function discardImportFile(token: string): Promise<void> {
  originalNames.delete(token);
  if (!TOKEN_REGEX.test(token)) return;
  try {
    const filePath = await resolveTokenFile(token);
    await fs.promises.unlink(filePath);
  } catch {
    /* already gone — idempotent */
  }
}

/** Removes orphaned uploads (no commit/cancel within the TTL). */
async function purgeOrphanUploads(): Promise<void> {
  try {
    const entries = await fs.promises.readdir(IMPORT_DIR);
    const now = Date.now();
    await Promise.all(
      entries.map(async (name) => {
        const token = name.slice(0, name.lastIndexOf('.'));
        if (!TOKEN_REGEX.test(token)) return;
        const full = path.join(IMPORT_DIR, name);
        const stat = await fs.promises.stat(full).catch(() => null);
        if (stat && now - stat.mtimeMs > IMPORT_ORPHAN_TTL_MS) {
          await fs.promises.unlink(full).catch(() => undefined);
          originalNames.delete(token);
        }
      }),
    );
  } catch {
    /* directory unreadable — nothing to purge */
  }
}

/** Verifies magic bytes match the extension; discards the file when they don't. */
async function assertMagicBytes(filePath: string, token: string): Promise<void> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.csv') return;
  const buffer = Buffer.alloc(8);
  let bytesRead = 0;
  const handle = await fs.promises.open(filePath, 'r');
  try {
    ({ bytesRead } = await handle.read(buffer, 0, 8, 0));
  } finally {
    await handle.close();
  }
  if (!sniffSpreadsheetMagic(buffer.subarray(0, bytesRead), ext)) {
    await fs.promises.unlink(filePath).catch(() => undefined);
    originalNames.delete(token);
    throw new BadRequestError('File content does not match its extension', 'IMPORT_INVALID_FILE');
  }
}

// ---------------------------------------------------------------------------
// Parse (upload → mapping → validation preview)
// ---------------------------------------------------------------------------

export interface UploadedFileRef {
  path: string;
  filename: string;
  originalname: string;
}

export interface ParseImportRequest {
  /** New upload — stored under a fresh token. */
  file?: UploadedFileRef;
  /** Existing token — re-parse with a different mapping/sheet (no re-upload). */
  token?: string;
  mapping?: MappingEntry[];
  sheet?: string;
}

export async function parseImport(req: ParseImportRequest): Promise<ImportParseResult> {
  await purgeOrphanUploads();

  let token: string;
  let fileName: string;

  if (req.file) {
    token = path.basename(req.file.filename, path.extname(req.file.filename));
    if (!TOKEN_REGEX.test(token)) {
      throw new BadRequestError('Invalid import token', 'IMPORT_INVALID_TOKEN');
    }
    fileName = sanitizeFileName(req.file.originalname);
    originalNames.set(token, fileName);
  } else if (req.token) {
    if (!TOKEN_REGEX.test(req.token)) {
      throw new BadRequestError('Invalid import token', 'IMPORT_INVALID_TOKEN');
    }
    token = req.token;
    await resolveTokenFile(token); // 404 when missing
    fileName = originalNames.get(token) ?? 'upload';
  } else {
    throw new BadRequestError('Provide a file to import', 'IMPORT_FILE_REQUIRED');
  }

  const filePath = await resolveTokenFile(token);
  await assertMagicBytes(filePath, token);
  const raw = await loadSheet(filePath, req.sheet);
  const grid = buildGrid(raw);
  const plan = buildPlan(req.mapping, grid.headers);
  const evaluated = evaluateRows(grid, plan);
  const uniqueHashes = markInFileDuplicates(evaluated);
  await markExistingDuplicates(evaluated, uniqueHashes);

  const rows = buildPreview(evaluated);
  const activeMapping: ImportSuggestedColumn[] = grid.headers.map((header, column) => {
    let field: string | null = null;
    for (const [f, c] of plan) {
      if (c === column) {
        field = f;
        break;
      }
    }
    return { column, header, field };
  });

  return {
    token,
    fileName,
    sheets: raw.sheets,
    sheet: raw.sheet,
    headers: grid.headers,
    suggestedMapping: activeMapping,
    rows,
    counts: countPreview(rows),
  };
}

// ---------------------------------------------------------------------------
// Commit (validated rows → createOpportunity loop → summary + notification)
// ---------------------------------------------------------------------------

export async function commitImport(
  input: { token: string; mapping: MappingEntry[]; sheet?: string | null },
  userId: number,
): Promise<ImportSummary> {
  const startedAt = Date.now();
  const filePath = await resolveTokenFile(input.token);
  const fileName = originalNames.get(input.token) ?? path.basename(filePath);

  const raw = await loadSheet(filePath, input.sheet);
  const grid = buildGrid(raw);
  const plan = buildPlan(input.mapping, grid.headers);
  const evaluated = evaluateRows(grid, plan);

  const threshold = env.tenders.highRelevanceThreshold;
  let imported = 0;
  let duplicates = 0;
  let skipped = 0;
  let failed = 0;
  const errors: ImportRowIssue[] = [];
  let errorCount = 0;
  const highRelevanceIds: number[] = [];

  const pushError = (issue: ImportRowIssue): void => {
    errorCount++;
    if (errors.length < IMPORT_MAX_ERRORS) errors.push(issue);
  };

  for (const ev of evaluated) {
    if (!ev.payload) {
      skipped++;
      for (const issue of ev.issues) pushError(issue);
      continue;
    }
    const payload = ev.payload;
    try {
      const created = await createOpportunity(payload, userId);
      imported++;
      if ((created.RelevanceScore ?? 0) >= threshold) highRelevanceIds.push(created.TenderOpportunityID);
    } catch (err) {
      // Duplicate = skipped-with-count (never an overwrite). Everything else failed.
      if (err instanceof ConflictError || isDuplicateKeyError(err)) {
        duplicates++;
      } else {
        failed++;
        pushError({
          row: ev.row,
          field: null,
          message: truncateCell((err as Error).message ?? 'Insert failed', 500),
        });
        logger.error('Import row failed', {
          token: input.token,
          row: ev.row,
          title: payload.Title.slice(0, 200),
          error: (err as Error).message,
        });
      }
    }
  }

  if (highRelevanceIds.length > 0) {
    try {
      await dispatchEvent({
        event: 'TENDER_NEW_MATCH',
        subject: `${highRelevanceIds.length} new high-relevance tender(s) from import`,
        body: `Manual import of "${fileName}" added ${imported} opportunities. ${highRelevanceIds.length} scored high relevance (≥${threshold}).`,
        payload: {
          source: 'manual-import',
          fileName,
          imported,
          highRelevanceIds: highRelevanceIds.slice(0, 20),
          threshold,
        },
      });
    } catch (err) {
      logger.error('TENDER_NEW_MATCH notification failed', {
        token: input.token,
        error: (err as Error).message,
      });
    }
  }

  await discardImportFile(input.token);

  return {
    fileName,
    totalRows: evaluated.length,
    imported,
    duplicates,
    skipped,
    failed,
    highRelevanceCount: highRelevanceIds.length,
    durationMs: Date.now() - startedAt,
    errors,
    errorCount,
  };
}

// ---------------------------------------------------------------------------
// Template download
// ---------------------------------------------------------------------------

const TEMPLATE_EXAMPLES: Array<Array<string | number>> = [
  [
    'Supply of Medical Equipment',
    'https://example.gov.et/tenders/123',
    'Example Procuring Agency',
    'Ethiopia',
    'Health',
    'Invitation to supply medical equipment for regional hospitals.',
    'ETH-2026-001',
    '2026-01-15',
    '2026-02-20',
    1500000,
    'ETB',
    '',
  ],
  [
    'Road Construction Feasibility Study',
    'https://example.go.ke/tenders/456',
    'Ministry of Works',
    'Kenya',
    'Infrastructure',
    'Consultancy services for a feasibility study.',
    'KE-2026-778',
    '2026-02-01',
    '2026-03-15',
    250000,
    'USD',
    '',
  ],
];

function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Builds the downloadable import template (xlsx or csv). */
export async function buildTemplate(
  format: 'xlsx' | 'csv',
): Promise<{ fileName: string; contentType: string; data: Buffer }> {
  const headers = IMPORT_COLUMNS.map((c) => c.label);

  if (format === 'csv') {
    const lines = [headers, ...TEMPLATE_EXAMPLES].map((row) => row.map((v) => csvEscape(String(v))).join(','));
    const data = Buffer.from('\uFEFF' + lines.join('\r\n') + '\r\n', 'utf8');
    return {
      fileName: 'tender-import-template.csv',
      contentType: 'text/csv; charset=utf-8',
      data,
    };
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Tenders');
  sheet.addRow(headers);
  for (const example of TEMPLATE_EXAMPLES) sheet.addRow(example);

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
  headerRow.alignment = { vertical: 'middle' };

  const widths = [40, 45, 30, 14, 18, 50, 20, 16, 16, 18, 10, 14];
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    fileName: 'tender-import-template.xlsx',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    data: Buffer.from(buffer),
  };
}

// ---------------------------------------------------------------------------
// Import history (AuditLog — no schema change)
// ---------------------------------------------------------------------------

function parseDetail(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'string' || raw === '') return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export async function listImportHistory(limit = 50): Promise<ImportHistoryItem[]> {
  const result = await db
    .request()
    .input('Action', sql.VarChar(100), 'TENDER_IMPORT')
    .input('Limit', sql.Int, Math.min(200, Math.max(1, Math.trunc(limit))))
    .query(
      `SELECT a.AuditLogID, a.CreatedAt, a.Detail, u.Name AS UserName
       FROM dbo.AuditLog a
       LEFT JOIN dbo.[User] u ON u.UserID = a.UserID
       WHERE a.Action = @Action
       ORDER BY a.CreatedAt DESC
       OFFSET 0 ROWS FETCH NEXT @Limit ROWS ONLY`,
    );

  return (result.recordset as Array<{
    AuditLogID: number;
    CreatedAt: string;
    Detail: string | null;
    UserName: string | null;
  }>).map((row) => {
    const detail = parseDetail(row.Detail);
    return {
      AuditLogID: row.AuditLogID,
      UserName: row.UserName ?? null,
      CreatedAt: row.CreatedAt,
      fileName: typeof detail?.fileName === 'string' ? detail.fileName : null,
      totalRows: num(detail?.totalRows),
      imported: num(detail?.imported),
      duplicates: num(detail?.duplicates),
      skipped: num(detail?.skipped),
      failed: num(detail?.failed),
    };
  });
}
