// =============================================================================
// Unit tests for the manual data upload (Excel/CSV import) pipeline.
//
// Standalone test script — no test framework, no DB connection required.
// Tests pure functions: date/number coercion, header auto-mapping, mapping
// validation, CSV/XLSX reading, row validation, in-file dedup, templates,
// and upload file-type/magic-byte checks.
//
// Run with: npx tsx src/modules/tenders/import.test.ts
// =============================================================================

import ExcelJS from 'exceljs';
import { BadRequestError } from '../../utils/errors';
import {
  parseImportDate,
  suggestMapping,
  buildPlan,
  buildGrid,
  evaluateRows,
  markInFileDuplicates,
  readCsvBuffer,
  readXlsxBuffer,
  buildTemplate,
  sniffSpreadsheetMagic,
  coerceNumberValue,
} from './import.service';
import { isAllowedImportFile } from './upload';
import { IMPORT_COLUMNS, IMPORT_MAX_ROWS, importColumnFor } from './import.types';

// --- Minimal test runner ---
let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

function describe(name: string, fn: () => void | Promise<void>): Promise<void> {
  console.log(`\n${name}:`);
  return Promise.resolve(fn());
}

function expectBadRequest(fn: () => unknown, code: string, message: string): void {
  try {
    fn();
    assert(false, `${message} (no error thrown)`);
  } catch (err) {
    assert(err instanceof BadRequestError && err.code === code, `${message} (got ${err instanceof BadRequestError ? err.code : String(err)})`);
  }
}

async function main(): Promise<void> {
  // -------------------------------------------------------------------------
  await describe('parseImportDate', () => {
    assert(parseImportDate('2026-01-15')?.toISOString() === '2026-01-15T00:00:00.000Z', 'ISO string → UTC midnight');
    assert(parseImportDate(46037)?.toISOString() === '2026-01-15T00:00:00.000Z', 'Excel serial 46037 → 2026-01-15');
    assert(parseImportDate(new Date(Date.UTC(2026, 1, 20)))?.toISOString() === '2026-02-20T00:00:00.000Z', 'Date object → date-only UTC');
    assert(parseImportDate('15-Jan-2026')?.toISOString() === '2026-01-15T00:00:00.000Z', 'D-MMM-YYYY parsed');
    assert(parseImportDate('15/01/2026')?.toISOString() === '2026-01-15T00:00:00.000Z', 'D/M/YYYY parsed (day first)');
    assert(parseImportDate('01/15/2026')?.toISOString() === '2026-01-15T00:00:00.000Z', 'M/D/YYYY parsed (month first)');
    assert(parseImportDate('2026-03-01')?.toISOString() === '2026-03-01T00:00:00.000Z', 'another ISO date');
    assert(parseImportDate('') === null, 'empty string → null');
    assert(parseImportDate(null) === null, 'null → null');
    assert(parseImportDate('not-a-date') === null, 'garbage → null');
    assert(parseImportDate(99999999) === null, 'out-of-range serial → null');
    assert(parseImportDate(0) === null, 'serial 0 → null');
  });

  // -------------------------------------------------------------------------
  await describe('coerceNumberValue', () => {
    const col = importColumnFor('EstimatedValue');
    assert(!!col, 'EstimatedValue column metadata exists');
    if (!col) return;
    assert(coerceNumberValue(1500000, col).value === 1500000, 'plain number passes through');
    assert(coerceNumberValue('1,250,000', col).value === 1250000, 'thousands separators stripped');
    assert(coerceNumberValue('ETB 12,500', col).value === 12500, 'currency prefix stripped');
    assert(coerceNumberValue('1.5M', col).value === 1500000, 'M suffix scaled');
    assert(coerceNumberValue('250k', col).value === 250000, 'k suffix scaled');
    assert(coerceNumberValue('', col).value === null && !coerceNumberValue('', col).issue, 'empty → null without issue');
    assert(coerceNumberValue('abc', col).issue !== null, 'non-numeric → issue');
    assert(coerceNumberValue(1e17, col).issue !== null, 'out of Decimal(18,2) range → issue');
    assert(coerceNumberValue(true, col).issue !== null, 'boolean → issue');
  });

  // -------------------------------------------------------------------------
  await describe('suggestMapping (header auto-map)', () => {
    const mapped = suggestMapping(['Tender Title', 'Deadline Date', 'URL', 'Procuring Entity', 'Estimated Value']);
    const byHeader: Record<string, string | null> = {};
    for (const m of mapped) byHeader[m.header] = m.field;
    assert(byHeader['Tender Title'] === 'Title', '"Tender Title" → Title');
    assert(byHeader['Deadline Date'] === 'DeadlineDate', '"Deadline Date" → DeadlineDate');
    assert(byHeader['URL'] === 'SourceUrl', '"URL" → SourceUrl');
    assert(byHeader['Procuring Entity'] === 'Organization', '"Procuring Entity" → Organization');
    assert(byHeader['Estimated Value'] === 'EstimatedValue', '"Estimated Value" → EstimatedValue');

    const canonical = suggestMapping(['Title', 'SourceUrl', 'Country']);
    assert(canonical[0].field === 'Title' && canonical[1].field === 'SourceUrl' && canonical[2].field === 'Country',
      'canonical headers map exactly');

    const unknown = suggestMapping(['Completely Unknown Header', 'Notes']);
    assert(unknown.every((m) => m.field === null), 'unknown headers stay unmapped');

    const once = suggestMapping(['Title', 'Tender Title']);
    assert(once.filter((m) => m.field === 'Title').length === 1, 'a field is claimed only once');
  });

  // -------------------------------------------------------------------------
  await describe('buildPlan (mapping validation)', () => {
    const headers = ['Title', 'SourceUrl', 'Organization', 'DeadlineDate'];
    const plan = buildPlan(undefined, headers);
    assert(plan.get('Title') === 0 && plan.get('SourceUrl') === 1, 'default plan auto-maps required fields');

    expectBadRequest(
      () => buildPlan([{ column: 0, field: 'Organization' }], headers),
      'IMPORT_MAPPING_MISSING',
      'missing required field rejected',
    );
    expectBadRequest(
      () => buildPlan([{ column: 0, field: 'Title' }, { column: 1, field: 'SourceUrl' }, { column: 2, field: 'NotAField' }], headers),
      'IMPORT_MAPPING_FIELD',
      'unknown field rejected',
    );
    expectBadRequest(
      () => buildPlan([{ column: 0, field: 'Title' }, { column: 1, field: 'SourceUrl' }, { column: 2, field: 'Title' }], headers),
      'IMPORT_MAPPING_DUPLICATE',
      'duplicate field claim rejected',
    );
    expectBadRequest(
      () => buildPlan([{ column: 0, field: 'Title' }, { column: 1, field: 'SourceUrl' }, { column: 9, field: 'Country' }], headers),
      'IMPORT_MAPPING_RANGE',
      'out-of-range column rejected',
    );
    const partial = buildPlan([{ column: 0, field: 'Title' }, { column: 1, field: 'SourceUrl' }, { column: 2, field: '' }], headers);
    assert(partial.size === 2, "field:'' entries are ignored");
  });

  // -------------------------------------------------------------------------
  await describe('readCsvBuffer + buildGrid', () => {
    const csv = '\uFEFFTitle,Organization,DeadlineDate\r\n"Supply, equipment",OrgX,2026-05-01\r\n\r\nSecond Row,OrgY,2026-06-01\r\n';
    const raw = readCsvBuffer(Buffer.from(csv, 'utf8'));
    const grid = buildGrid(raw);
    assert(grid.headers[0] === 'Title', 'BOM stripped from first header');
    assert(grid.headers.length === 3, 'three headers detected');
    assert(grid.rows.length === 2, 'blank line excluded from data rows');
    assert(grid.rows[0].row === 2, 'first data row is physical row 2');
    assert(grid.rows[1].row === 4, 'row numbering preserved across blank lines');
    assert(grid.rows[0].cells[0] === 'Supply, equipment', 'quoted comma stays in one cell');

    expectBadRequest(() => buildGrid(readCsvBuffer(Buffer.from('Title,URL\n', 'utf8'))), 'IMPORT_NO_DATA_ROWS', 'header-only file rejected');
    expectBadRequest(() => buildGrid(readCsvBuffer(Buffer.from('   \n', 'utf8'))), 'IMPORT_EMPTY_FILE', 'blank file rejected');

    const wide = [
      Array.from({ length: 41 }, (_, i) => `C${i}`).join(','),
      Array.from({ length: 41 }, (_, i) => `v${i}`).join(','),
    ].join('\n');
    expectBadRequest(() => buildGrid(readCsvBuffer(Buffer.from(wide, 'utf8'))), 'IMPORT_TOO_MANY_COLUMNS', '41 columns rejected');

    const header = 'Title,SourceUrl\n';
    const manyRows = header + Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, i) => `T${i},https://x/${i}`).join('\n');
    expectBadRequest(() => buildGrid(readCsvBuffer(Buffer.from(manyRows, 'utf8'))), 'IMPORT_TOO_MANY_ROWS', '2001 rows rejected');
  });

  // -------------------------------------------------------------------------
  await describe('evaluateRows (validation + payloads)', () => {
    const csv = [
      'Title,SourceUrl,Organization,Country,Sector,SourceReference,PublicationDate,DeadlineDate,EstimatedValue,Currency',
      'Valid Tender A,https://example.com/a,Org A,Ethiopia,Health,SMOKE-IMP-1,2026-01-10,2026-03-01,"1,250,000",ETB',
      ',https://example.com/b,Org B,Ethiopia,Health,SMOKE-IMP-2,,2026-03-02,,',
      'Bad Date Tender,https://example.com/c,Org C,Ethiopia,Health,SMOKE-IMP-3,,not-a-date,,',
      `Title ${'x'.repeat(520)},https://example.com/d,Org D,Ethiopia,Health,SMOKE-IMP-4,,2026-03-04,,`,
      'Valid Tender E,https://example.com/e,Org E,Kenya,Infrastructure,SMOKE-IMP-5,,2026-03-05,75000,USD',
    ].join('\n');

    const grid = buildGrid(readCsvBuffer(Buffer.from(csv, 'utf8')));
    const plan = buildPlan(undefined, grid.headers);
    const rows = evaluateRows(grid, plan);
    assert(rows.length === 5, 'five data rows evaluated');

    const a = rows[0];
    assert(a.payload !== null, 'row 2 valid → payload produced');
    assert(a.payload?.Title === 'Valid Tender A', 'Title extracted');
    assert(a.payload?.EstimatedValue === 1250000, 'comma-formatted value parsed');
    assert(a.payload?.DeadlineDate === '2026-03-01', 'deadline kept as ISO date');
    assert(a.issues.length === 0, 'row 2 has no issues');

    const b = rows[1];
    assert(b.payload === null, 'missing Title → no payload');
    assert(b.issues.some((i) => i.field === 'Title' && i.row === 2 + 1), 'required Title issue reported with row number');

    const c = rows[2];
    assert(c.payload === null, 'invalid date → no payload');
    assert(c.issues.some((i) => i.field === 'DeadlineDate'), 'invalid DeadlineDate issue reported');

    const d = rows[3];
    assert(d.payload === null, 'over-length title → no payload');
    assert(d.issues.some((i) => i.field === 'Title' && i.message.includes('500')), 'title max-length issue reported');

    const e = rows[4];
    assert(e.payload !== null && e.payload.EstimatedValue === 75000, 'second valid row payload correct');
    assert(e.payload?.Country === 'Kenya', 'Country extracted');
  });

  // -------------------------------------------------------------------------
  await describe('markInFileDuplicates (content hash)', () => {
    const csv = [
      'Title,SourceUrl,Organization,DeadlineDate',
      'Twin Tender,https://example.com/1,Org Z,2026-07-01',
      'Twin Tender,https://example.com/2,Org Z,2026-07-01',
      'Unique Tender,https://example.com/3,Org Z,2026-07-02',
      ',https://example.com/4,,',
    ].join('\n');
    const grid = buildGrid(readCsvBuffer(Buffer.from(csv, 'utf8')));
    const rows = evaluateRows(grid, buildPlan(undefined, grid.headers));
    const hashes = markInFileDuplicates(rows);

    assert(rows[0].hash !== null, 'hash computed for valid row');
    assert(rows[1].duplicateReason === 'in-file', 'identical second row marked in-file duplicate');
    assert(rows[0].duplicateReason === null, 'first occurrence stays importable');
    assert(rows[2].duplicateReason === null, 'unique row not marked duplicate');
    assert(rows[3].hash === null, 'invalid row has no hash');
    assert(hashes.length === 2, 'unique valid hashes returned');
  });

  // -------------------------------------------------------------------------
  await describe('readXlsxBuffer (ExcelJS roundtrip)', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Data');
    ws.addRow(['Title', 'SourceUrl', 'DeadlineDate', 'EstimatedValue', 'Organization']);
    const row = ws.addRow(['XLSX Tender', 'https://example.com/x', new Date(Date.UTC(2026, 4, 10)), 42000, 'Org X']);
    row.getCell(3).numFmt = 'yyyy-mm-dd';

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    assert(buffer[0] === 0x50 && buffer[1] === 0x4b, 'generated workbook starts with PK');

    const raw = await readXlsxBuffer(buffer);
    assert(raw.sheets.length === 1 && raw.sheets[0] === 'Data', 'worksheet name read');
    const grid = buildGrid(raw);
    assert(grid.headers[0] === 'Title', 'xlsx headers read');
    assert(grid.rows.length === 1, 'xlsx data row read');

    const rows = evaluateRows(grid, buildPlan(undefined, grid.headers));
    assert(rows[0].payload !== null, 'xlsx row validates');
    assert(rows[0].payload?.DeadlineDate === '2026-05-10', 'xlsx date cell → correct calendar date');
    assert(rows[0].payload?.EstimatedValue === 42000, 'xlsx numeric cell → number');

    const otherSheet = await readXlsxBuffer(buffer, 'Nope').catch((err: unknown) => err);
    assert(otherSheet instanceof BadRequestError && otherSheet.code === 'IMPORT_SHEET_NOT_FOUND', 'unknown worksheet rejected');

    const roundtrip = buildGrid(readCsvBuffer(Buffer.from('Title,SourceUrl\nT,https://x\n', 'utf8')));
    assert(roundtrip.rows.length === 1, 'sanity: csv grid still works');
  });

  // -------------------------------------------------------------------------
  await describe('buildTemplate (download)', async () => {
    const csv = await buildTemplate('csv');
    assert(csv.contentType.includes('text/csv'), 'csv content type');
    const text = csv.data.toString('utf8');
    assert(text.startsWith('\uFEFF'), 'csv template starts with BOM');
    assert(text.includes('Title,SourceUrl'), 'csv template contains canonical headers');
    assert(text.includes('Supply of Medical Equipment'), 'csv template contains example rows');
    assert(csv.fileName.endsWith('.csv'), 'csv file name');

    const xlsx = await buildTemplate('xlsx');
    assert(xlsx.data[0] === 0x50 && xlsx.data[1] === 0x4b, 'xlsx template is a zip (PK)');
    assert(xlsx.contentType.includes('spreadsheetml'), 'xlsx content type');
    const parsed = buildGrid(await readXlsxBuffer(xlsx.data));
    assert(parsed.headers[0] === 'Title' && parsed.headers.length === IMPORT_COLUMNS.length,
      'xlsx template headers match the column contract');
    assert(parsed.rows.length >= 1, 'xlsx template includes example rows');
  });

  // -------------------------------------------------------------------------
  await describe('file type + magic-byte checks', () => {
    assert(isAllowedImportFile('data.csv') === true, '.csv allowed');
    assert(isAllowedImportFile('DATA.CSV') === true, 'uppercase extension allowed');
    assert(isAllowedImportFile('tenders.xlsx') === true, '.xlsx allowed');
    assert(isAllowedImportFile('legacy.xls') === true, '.xls allowed');
    assert(isAllowedImportFile('malware.exe') === false, '.exe rejected');
    assert(isAllowedImportFile('noextension') === false, 'extensionless rejected');
    assert(isAllowedImportFile('archive.csv.exe') === false, 'double extension rejected');

    assert(sniffSpreadsheetMagic(Buffer.from([0x50, 0x4b, 0x03, 0x04]), '.xlsx') === true, 'PK magic accepted for .xlsx');
    assert(sniffSpreadsheetMagic(Buffer.from([0x00, 0x01, 0x02, 0x03]), '.xlsx') === false, 'wrong magic rejected for .xlsx');
    assert(sniffSpreadsheetMagic(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), '.xls') === true, 'OLE2 magic accepted for .xls');
    assert(sniffSpreadsheetMagic(Buffer.from('anything at all', 'utf8'), '.csv') === true, 'csv has no signature requirement');
  });

  // -------------------------------------------------------------------------
  console.log(`\n${'-'.repeat(50)}\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main().catch((err: unknown) => {
  console.error('Test run crashed:', err);
  process.exit(1);
});
