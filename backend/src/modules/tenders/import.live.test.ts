// =============================================================================
// End-to-end live tests for the manual data upload (Excel/CSV import) feature.
//
// Runs against the real Express app + real database (in-process, ephemeral
// port). Authenticated tokens are minted for seeded users via
// issueSessionToken(), so no credentials are modified.
//
// Coverage:
//   - 401 (no token) / 403 (Viewer lacks tenders.manageSources)
//   - template download (csv BOM, xlsx PK)
//   - multipart parse -> commit (3 valid rows imported)
//   - token re-parse without re-upload
//   - dashboard + list visibility of imported rows
//   - re-import of identical file => all duplicates, existing row NOT overwritten
//   - mixed file => imported / duplicates / skipped / failed each > 0
//   - AuditLog TENDER_IMPORT history entries
//   - DELETE /imports/:token discard + subsequent commit 404
//   - full cleanup of test rows, audit entries, notifications, staged files
//
// Run with: npx tsx src/modules/tenders/import.live.test.ts
// =============================================================================

import { once } from 'events';
import fs from 'fs';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { app } from '../../app';
import { db } from '../../db/pool';
import { issueSessionToken } from '../auth/auth.service';
import type { AuthUser } from '../../types';
import type { Role } from '../../security/permissions';
import { IMPORT_DIR } from './upload';
import type { ImportParseResult, ImportSummary, ImportHistoryItem } from './import.types';

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

function section(name: string): void {
  console.log(`\n${name}:`);
}

// --- HTTP helper -----------------------------------------------------------
interface HttpResult {
  status: number;
  json: any;
  text: string;
  bytes: Buffer;
}

async function call(
  method: string,
  url: string,
  opts: { token?: string; body?: unknown; form?: FormData } = {},
): Promise<HttpResult> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const body =
    opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined);
  const res = await fetch(url, { method, headers, body });
  const bytes = Buffer.from(await res.arrayBuffer());
  let json: any = null;
  try {
    json = JSON.parse(bytes.toString('utf8'));
  } catch {
    /* binary or non-JSON body */
  }
  return { status: res.status, json, text: bytes.toString('utf8'), bytes };
}

/** Null-safe JSON body so assertion failures report instead of crashing. */
function data(res: HttpResult): any {
  return res.json ?? {};
}

function csv(...rows: string[][]): Buffer {
  return Buffer.from(rows.map((r) => r.join(',')).join('\r\n') + '\r\n', 'utf8');
}

function multipart(fileName: string, data: Buffer, mime = 'text/csv'): FormData {
  const fd = new FormData();
  fd.append('file', new Blob([new Uint8Array(data)], { type: mime }), fileName);
  return fd;
}

const FILE_1 = 'smoke-import-basic.csv';
const FILE_MIXED = 'smoke-import-mixed.csv';
const FILE_ORPHAN = 'smoke-import-orphan.csv';

const CSV_HEADERS = [
  'Title', 'SourceUrl', 'Organization', 'Country', 'Sector',
  'SourceReference', 'PublicationDate', 'DeadlineDate', 'EstimatedValue', 'Currency',
];

const FILE_1_ROWS: string[][] = [
  ['SMOKE IMPORT Alpha', 'https://smoke.example/a', 'Org Smoke A', 'Ethiopia', 'Health',
    'SMOKE-IMPORT-1', '2026-01-10', '2026-12-01', '1500000', 'ETB'],
  ['SMOKE IMPORT Beta', 'https://smoke.example/b', 'Org Smoke B', 'Ethiopia', 'Agriculture',
    'SMOKE-IMPORT-2', '2026-01-11', '2026-12-02', '250000', 'USD'],
  ['SMOKE IMPORT Gamma', 'https://smoke.example/c', 'Org Smoke C', 'Kenya', 'Infrastructure',
    'SMOKE-IMPORT-3', '2026-01-12', '2026-12-03', '75000', 'USD'],
];

const MIXED_HEADERS = ['Title', 'SourceUrl', 'Organization', 'DeadlineDate', 'TenderSourceID'];

async function cleanupDb(): Promise<void> {
  await db.request().query(
    `DELETE FROM dbo.SavedTender
     WHERE TenderOpportunityID IN (
       SELECT TenderOpportunityID FROM dbo.TenderOpportunity
       WHERE Title LIKE 'SMOKE IMPORT%' OR SourceReference LIKE 'SMOKE-IMPORT-%')`,
  );
  await db.request().query(
    `DELETE FROM dbo.TenderOpportunity
     WHERE Title LIKE 'SMOKE IMPORT%' OR SourceReference LIKE 'SMOKE-IMPORT-%'`,
  );
  await db.request().query(
    `DELETE FROM dbo.AuditLog WHERE Action = 'TENDER_IMPORT' AND Detail LIKE '%smoke-import%'`,
  );
  await db.request().query(
    `DELETE FROM dbo.Notification WHERE Payload LIKE '%smoke-import%'`,
  );
  await db.request().query(
    `DELETE FROM dbo.TenderInterestProfile WHERE Name = 'SMOKE TEST PROFILE'`,
  );
}

async function main(): Promise<void> {
  await db.connect();

  // Locate active users for the two roles under test.
  const adminRes = await db.request().query(
    `SELECT TOP 1 u.UserID, u.CUAS_ID, u.Name, u.Email, r.RoleName
     FROM dbo.[User] u JOIN dbo.Role r ON r.RoleID = u.RoleID
     WHERE r.RoleName = 'Administrator' AND u.IsActive = 1 ORDER BY u.UserID`,
  );
  const viewerRes = await db.request().query(
    `SELECT TOP 1 u.UserID, u.CUAS_ID, u.Name, u.Email, r.RoleName
     FROM dbo.[User] u JOIN dbo.Role r ON r.RoleID = u.RoleID
     WHERE r.RoleName = 'Viewer' AND u.IsActive = 1 ORDER BY u.UserID`,
  );

  const toAuthUser = (row: any): AuthUser => ({
    userId: row.UserID,
    cuasId: row.CUAS_ID,
    name: row.Name,
    email: row.Email ?? null,
    role: row.RoleName as Role,
  });

  const adminRow = adminRes.recordset[0];
  const viewerRow = viewerRes.recordset[0];
  if (!adminRow) {
    console.error('No active Administrator user found — cannot run live tests.');
    process.exit(1);
  }
  const adminToken = issueSessionToken(toAuthUser(adminRow));
  const viewerToken = viewerRow ? issueSessionToken(toAuthUser(viewerRow)) : null;

  // Ensure a clean slate even if a previous run was interrupted.
  await cleanupDb();

  // scoreOpportunity() persists RelevanceScore only when an active interest
  // profile exists (identical for manual/collected rows). Create a temp profile
  // so the scoring path is observable end-to-end.
  await db.request().query(
    `INSERT INTO dbo.TenderInterestProfile (Name, Sectors, Keywords, Countries, IsActive)
     VALUES ('SMOKE TEST PROFILE', '["Health"]', '["medical equipment"]', '["Ethiopia"]', 1)`,
  );

  const server: Server = app.listen(0);
  await once(server, 'listening');
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}/api/v1/tenders`;
  const usedTokens: string[] = [];

  try {
    // -----------------------------------------------------------------------
    section('Authentication (401) and authorization (403)');
    assert((await call('GET', `${base}/imports`)).status === 401, 'GET /imports without token → 401');
    assert((await call('POST', `${base}/imports/parse`)).status === 401, 'POST /imports/parse without token → 401');
    assert((await call('POST', `${base}/imports/commit`, { body: {} })).status === 401, 'POST /imports/commit without token → 401');
    assert((await call('GET', `${base}/imports/template`)).status === 401, 'GET template without token → 401');
    assert(
      (await call('DELETE', `${base}/imports/00000000-0000-4000-8000-000000000000`)).status === 401,
      'DELETE /imports/:token without token → 401',
    );

    if (viewerToken) {
      assert((await call('GET', `${base}/imports`, { token: viewerToken })).status === 200, 'Viewer can view import history (tenders.view)');
      assert((await call('GET', `${base}/imports/template`, { token: viewerToken })).status === 403, 'Viewer template download → 403');
      assert((await call('POST', `${base}/imports/parse`, { token: viewerToken })).status === 403, 'Viewer parse → 403');
      assert(
        (await call('POST', `${base}/imports/commit`, { token: viewerToken, body: {} })).status === 403,
        'Viewer commit → 403',
      );
      assert(
        (await call('DELETE', `${base}/imports/00000000-0000-4000-8000-000000000000`, { token: viewerToken })).status === 403,
        'Viewer discard → 403',
      );
    } else {
      assert(false, 'Active Viewer user found (required for 403 tests)');
    }

    // -----------------------------------------------------------------------
    section('Template download');
    const tplCsv = await call('GET', `${base}/imports/template?format=csv`, { token: adminToken });
    assert(tplCsv.status === 200, 'csv template → 200');
    assert(tplCsv.bytes[0] === 0xef && tplCsv.bytes[1] === 0xbb && tplCsv.bytes[2] === 0xbf, 'csv template starts with UTF-8 BOM');
    assert(tplCsv.text.includes('Title,SourceUrl'), 'csv template contains canonical headers');

    const tplXlsx = await call('GET', `${base}/imports/template?format=xlsx`, { token: adminToken });
    assert(tplXlsx.status === 200, 'xlsx template → 200');
    assert(tplXlsx.bytes[0] === 0x50 && tplXlsx.bytes[1] === 0x4b, 'xlsx template is a zip (PK)');
    assert(
      (await call('GET', `${base}/imports/template?format=exe`, { token: adminToken })).status === 200,
      'unknown format falls back to xlsx',
    );

    // -----------------------------------------------------------------------
    section('Parse valid CSV (multipart)');
    const parse1 = await call('POST', `${base}/imports/parse`, {
      token: adminToken,
      form: multipart(FILE_1, csv(CSV_HEADERS, ...FILE_1_ROWS)),
    });
    assert(parse1.status === 200, 'parse → 200');
    const p1: ImportParseResult = data(parse1);
    assert(/^[0-9a-f-]{36}$/.test(String(p1.token ?? '')), 'token is a UUID');
    usedTokens.push(String(p1.token ?? ''));
    assert(p1.fileName === FILE_1, 'original file name preserved');
    assert((p1.headers ?? []).length === CSV_HEADERS.length, 'headers returned');
    assert(p1.counts?.total === 3 && p1.counts?.valid === 3, 'all 3 rows valid in preview');
    assert(p1.counts?.duplicate === 0 && p1.counts?.invalid === 0, 'no duplicates/invalid in fresh preview');
    const titleCol = (p1.suggestedMapping ?? []).find((m) => m.header === 'Title');
    assert(titleCol?.field === 'Title', 'Title header auto-mapped');

    // Re-parse with token (no re-upload) + explicit mapping.
    const mapping = (p1.suggestedMapping ?? [])
      .filter((m) => m.field !== null)
      .map((m) => ({ column: m.column, field: m.field as string }));
    const reparse = await call('POST', `${base}/imports/parse`, {
      token: adminToken,
      body: { token: p1.token, mapping },
    });
    assert(reparse.status === 200 && data(reparse).counts?.valid === 3, 'token re-parse without upload works');

    // -----------------------------------------------------------------------
    section('Commit valid CSV');
    const before = await call('GET', `${base}/dashboard`, { token: adminToken });
    const beforeTotal = data(before).stats?.totalOpportunities ?? data(before).totalOpportunities;
    assert(typeof beforeTotal === 'number', `dashboard baseline read (${beforeTotal})`);

    const commit1 = await call('POST', `${base}/imports/commit`, {
      token: adminToken,
      body: { token: p1.token, mapping },
    });
    assert(commit1.status === 200, 'commit → 200');
    const c1: ImportSummary = data(commit1);
    assert(
      c1.totalRows === 3 && c1.imported === 3 && c1.duplicates === 0 && c1.skipped === 0 && c1.failed === 0,
      `commit imported 3 rows (got imported=${c1.imported}, dup=${c1.duplicates}, skip=${c1.skipped}, fail=${c1.failed})`,
    );
    assert(typeof c1.highRelevanceCount === 'number' && c1.highRelevanceCount >= 0, 'highRelevanceCount reported');

    // -----------------------------------------------------------------------
    section('Imported rows visible (list + dashboard)');
    const list = await call('GET', `${base}?search=${encodeURIComponent('SMOKE IMPORT')}&pageSize=50`, { token: adminToken });
    assert(list.status === 200, 'list → 200');
    assert(data(list).total === 3, `list finds 3 imported rows (got ${data(list).total})`);
    assert(
      Array.isArray(data(list).items) && data(list).items.every((i: any) => typeof i.RelevanceScore === 'number'),
      'imported rows carry a RelevanceScore (scoring ran)',
    );

    const after = await call('GET', `${base}/dashboard`, { token: adminToken });
    const afterTotal = data(after).stats?.totalOpportunities ?? data(after).totalOpportunities;
    assert(afterTotal === beforeTotal + 3, `dashboard totalOpportunities +3 (${beforeTotal} → ${afterTotal})`);

    // -----------------------------------------------------------------------
    section('Re-import same file → duplicates only, never overwritten');
    await db.request().query(
      `UPDATE dbo.TenderOpportunity SET Organization = 'CHANGED-BY-TEST' WHERE SourceReference = 'SMOKE-IMPORT-1'`,
    );

    const parseAgain = await call('POST', `${base}/imports/parse`, {
      token: adminToken,
      form: multipart(FILE_1, csv(CSV_HEADERS, ...FILE_1_ROWS)),
    });
    const p2: ImportParseResult = data(parseAgain);
    usedTokens.push(p2.token ?? '');
    assert(parseAgain.status === 200 && p2.counts?.duplicate === 3, 're-parse marks all 3 rows as existing duplicates');

    const commitAgain = await call('POST', `${base}/imports/commit`, {
      token: adminToken,
      body: { token: p2.token, mapping },
    });
    const c2: ImportSummary = data(commitAgain);
    assert(commitAgain.status === 200, 're-commit → 200');
    assert(
      c2.imported === 0 && c2.duplicates === 3 && c2.skipped === 0 && c2.failed === 0,
      `re-commit inserted nothing (imported=${c2.imported}, duplicates=${c2.duplicates})`,
    );

    const orgCheck = await db
      .request()
      .query(`SELECT Organization FROM dbo.TenderOpportunity WHERE SourceReference = 'SMOKE-IMPORT-1'`);
    assert(
      orgCheck.recordset[0]?.Organization === 'CHANGED-BY-TEST',
      'existing row Organization untouched by re-import',
    );

    // -----------------------------------------------------------------------
    section('Mixed file → imported / duplicates / skipped / failed');
    const mixedRows: string[][] = [
      ['SMOKE IMPORT Mix One', 'https://smoke.example/m1', 'Org Smoke M', '2026-12-10', ''],
      ['SMOKE IMPORT Mix One', 'https://smoke.example/m2', 'Org Smoke M', '2026-12-10', ''],
      ['SMOKE IMPORT Bad Date', 'https://smoke.example/bad', 'Org Smoke D', 'not-a-date', ''],
      ['SMOKE IMPORT Bad FK', 'https://smoke.example/fk', 'Org Smoke E', '2026-12-11', '987654321'],
    ];
    const parseMixed = await call('POST', `${base}/imports/parse`, {
      token: adminToken,
      form: multipart(FILE_MIXED, csv(MIXED_HEADERS, ...mixedRows)),
    });
    const pm: ImportParseResult = data(parseMixed);
    usedTokens.push(pm.token ?? '');
    assert(parseMixed.status === 200, 'mixed parse → 200');
    assert(
      pm.counts?.total === 4 && pm.counts?.valid === 2 && pm.counts?.invalid === 1 && pm.counts?.duplicate === 1,
      `mixed preview counts (total=${pm.counts.total}, valid=${pm.counts.valid}, invalid=${pm.counts.invalid}, dup=${pm.counts.duplicate})`,
    );
    assert(pm.rows?.[1]?.duplicateReason === 'in-file', 'second identical row flagged in-file duplicate');
    assert(pm.rows?.[2]?.issues?.some((i) => i.field === 'DeadlineDate'), 'bad date row carries a field issue');

    const commitMixed = await call('POST', `${base}/imports/commit`, {
      token: adminToken,
      body: { token: pm.token, mapping: (pm.suggestedMapping ?? []).filter((m) => m.field).map((m) => ({ column: m.column, field: m.field as string })) },
    });
    const cm: ImportSummary = data(commitMixed);
    assert(commitMixed.status === 200, 'mixed commit → 200');
    assert(cm.totalRows === 4, 'mixed totalRows = 4');
    assert(cm.imported === 1, `mixed imported = 1 (got ${cm.imported})`);
    assert(cm.duplicates === 1, `mixed duplicates = 1 (got ${cm.duplicates})`);
    assert(cm.skipped === 1, `mixed skipped = 1 (got ${cm.skipped})`);
    assert(cm.failed === 1, `mixed failed = 1 (got ${cm.failed})`);
    assert(cm.errorCount >= 1 && cm.errors.length >= 1, 'error details returned');

    // -----------------------------------------------------------------------
    section('Import history (AuditLog)');
    const history = await call('GET', `${base}/imports?limit=50`, { token: adminToken });
    assert(history.status === 200, 'history → 200');
    const items: ImportHistoryItem[] = data(history).items ?? [];
    const entry3 = items.find((i) => i.imported === 3 && (i.fileName ?? '').includes(FILE_1));
    const entryMixed = items.find((i) => i.failed === 1 && (i.fileName ?? '').includes(FILE_MIXED));
    assert(!!entry3, 'history contains the 3-row import entry');
    assert(!!entryMixed, 'history contains the mixed import entry');
    assert(entry3?.duplicates === 0 && entry3?.skipped === 0, 'history entry counts match summary');
    assert(typeof items[0]?.UserName === 'string', 'history includes the acting user');

    // -----------------------------------------------------------------------
    section('Discard pending upload (DELETE)');
    const parseOrphan = await call('POST', `${base}/imports/parse`, {
      token: adminToken,
      form: multipart(FILE_ORPHAN, csv(CSV_HEADERS, ...FILE_1_ROWS)),
    });
    const po: ImportParseResult = data(parseOrphan);
    usedTokens.push(po.token ?? '');
    assert(parseOrphan.status === 200, 'orphan upload parse → 200');

    const del = await call('DELETE', `${base}/imports/${po.token}`, { token: adminToken });
    assert(del.status === 200 && data(del).ok === true, 'DELETE → { ok: true }');

    const commitDeleted = await call('POST', `${base}/imports/commit`, {
      token: adminToken,
      body: { token: po.token, mapping },
    });
    assert(commitDeleted.status === 404, `commit after discard → 404 (got ${commitDeleted.status})`);
    assert(
      (await call('DELETE', `${base}/imports/${po.token}`, { token: adminToken })).status === 200,
      'DELETE is idempotent',
    );
    assert(
      (await call('DELETE', `${base}/imports/not-a-uuid`, { token: adminToken })).status === 400,
      'DELETE with malformed token → 400',
    );

    // Staging directory must be empty once every token is consumed.
    const staged = await fs.promises.readdir(IMPORT_DIR).catch(() => [] as string[]);
    assert(staged.length === 0, `staging directory empty after commits/discards (found ${staged.length})`);
  } finally {
    // -----------------------------------------------------------------------
    section('Cleanup');
    // Consume any token that a failed assertion may have left behind.
    for (const token of usedTokens) {
      await call('DELETE', `${base}/imports/${token}`, { token: adminToken }).catch(() => undefined);
    }
    await cleanupDb();

    const remaining = await db
      .request()
      .query(
        `SELECT COUNT(*) AS n FROM dbo.TenderOpportunity WHERE Title LIKE 'SMOKE IMPORT%' OR SourceReference LIKE 'SMOKE-IMPORT-%'`,
      );
    assert(remaining.recordset[0].n === 0, 'test opportunities removed');

    const audits = await db
      .request()
      .query(`SELECT COUNT(*) AS n FROM dbo.AuditLog WHERE Action = 'TENDER_IMPORT' AND Detail LIKE '%smoke-import%'`);
    assert(audits.recordset[0].n === 0, 'test audit entries removed');

    await db.request().query(`DELETE FROM dbo.TenderInterestProfile WHERE Name = 'SMOKE TEST PROFILE'`);

    const stagedLeft = await fs.promises.readdir(IMPORT_DIR).catch(() => [] as string[]);
    for (const name of stagedLeft) {
      if (/^smoke-import/.test(name)) {
        await fs.promises.unlink(`${IMPORT_DIR}/${name}`).catch(() => undefined);
      }
    }

    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.close();
  }

  console.log(`\n${'-'.repeat(50)}\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main().catch((err: unknown) => {
  console.error('Live test run crashed:', err);
  process.exit(1);
});
