// =============================================================================
// AI chat attachments — verification script (no test framework in this repo).
//
//   npx tsx scripts/test-ai-attachments.ts            A (extraction) + B (HTTP,
//                                                      skips the live ask)
//   npx tsx scripts/test-ai-attachments.ts --live     also C: real /ai/ask with
//                                                     an attachment (needs a
//                                                     working AI provider)
//
//   A. Extraction (in-process, no server) — csv/xlsx/txt/image, caps, names
//   B. HTTP surface (server up)          — 401/403/200/413/422/404
//   C. Grounded ask (--live)             — attachment cited in the answer
// =============================================================================

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as XLSX from 'xlsx';
import { env } from '../src/config/env';
import {
  ATTACHMENT_TEXT_CAP,
  attachmentBlock,
  isAttachmentId,
  loadAttachment,
  purgeOldAttachments,
  safeName,
} from '../src/modules/ai/attachments';

// ---------------------------------------------------------------------------
// Tiny test harness (same shape as the other scripts)
// ---------------------------------------------------------------------------
let passed = 0;
const failures: string[] = [];

function check(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failures.push(`${name}: ${message}`);
    console.log(`  FAIL ${name} — ${message}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function equal(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  }
}

async function checkAsync(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failures.push(`${name}: ${message}`);
    console.log(`  FAIL ${name} — ${message}`);
  }
}

// ---------------------------------------------------------------------------
// A. Extraction (in-process)
// ---------------------------------------------------------------------------
const FIXTURE_CSV = 'Region,Units\nAddis Ababa,42\nBahir Dar,17\n';
const MARKER_CSV = 'KG-MIS-ATTACH-CSV-MARKER';

function newId(ext: string): string {
  return `ai-${crypto.randomUUID()}${ext}`;
}

function writeFixture(name: string, content: string | Buffer): string {
  fs.mkdirSync(env.files.uploadDir, { recursive: true });
  const full = path.join(env.files.uploadDir, name);
  fs.writeFileSync(full, content);
  return full;
}

async function sectionA(): Promise<void> {
  console.log('\nA. Extraction (in-process)');

  await checkAsync('csv: uploaded CSV extracts to readable text', async () => {
    const id = newId('.csv');
    writeFixture(id, `${MARKER_CSV}\n${FIXTURE_CSV}`);
    try {
      const loaded = await loadAttachment(id, 'regions.csv');
      equal(loaded.kind, 'document', 'kind');
      assert(loaded.extractable, 'extractable');
      assert(loaded.text?.includes(MARKER_CSV), 'marker present');
      assert(loaded.text?.includes('Addis Ababa,42'), 'row content present');
      equal(loaded.filename, 'regions.csv', 'client filename preserved');
    } finally {
      fs.rmSync(path.join(env.files.uploadDir, id), { force: true });
    }
  });

  await checkAsync('xlsx: workbook extracts every sheet as csv text', async () => {
    const id = newId('.xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Product', 'Price'], ['Buna', 240]]), 'Prices');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    writeFixture(id, buf);
    try {
      const loaded = await loadAttachment(id, 'prices.xlsx');
      assert(loaded.extractable, 'extractable');
      assert(loaded.text?.includes('Sheet: Prices'), 'sheet name present');
      assert(loaded.text?.includes('Buna,240'), 'cell values present');
    } finally {
      fs.rmSync(path.join(env.files.uploadDir, id), { force: true });
    }
  });

  await checkAsync('txt: large text is capped at the prompt limit', async () => {
    const id = newId('.txt');
    writeFixture(id, 'A'.repeat(ATTACHMENT_TEXT_CAP + 5000));
    try {
      const loaded = await loadAttachment(id, 'long.txt');
      assert((loaded.text?.length ?? 0) <= ATTACHMENT_TEXT_CAP + 64, `capped length ${loaded.text?.length}`);
      assert(loaded.text?.includes('[truncated]'), 'truncation marker present');
    } finally {
      fs.rmSync(path.join(env.files.uploadDir, id), { force: true });
    }
  });

  await checkAsync('image: loads as base64 payload, never as text', async () => {
    const id = newId('.png');
    writeFixture(id, Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'));
    try {
      const loaded = await loadAttachment(id, 'shot.png');
      equal(loaded.kind, 'image', 'kind');
      assert(loaded.image, 'image payload present');
      equal(loaded.image!.mimeType, 'image/png', 'mime type');
      assert(loaded.text === undefined, 'no text field');
      equal(attachmentBlock(loaded), '', 'images produce no prompt block');
    } finally {
      fs.rmSync(path.join(env.files.uploadDir, id), { force: true });
    }
  });

  check('block: document block carries name, type and content', () => {
    const block = attachmentBlock({
      id: newId('.csv'),
      filename: 'regions.csv',
      sizeBytes: 10,
      mimeType: 'text/csv',
      kind: 'document',
      extractable: true,
      text: 'Addis Ababa,42',
    });
    assert(block.includes('ATTACHMENT (file: regions.csv, type: text/csv)'), 'header');
    assert(block.includes('Addis Ababa,42'), 'content');
  });

  check('block: unreadable file says so instead of hiding it', () => {
    const block = attachmentBlock({
      id: newId('.csv'),
      filename: 'broken.csv',
      sizeBytes: 10,
      mimeType: 'text/csv',
      kind: 'document',
      extractable: false,
    });
    assert(block.includes('could not be read'), 'honest notice');
  });

  check('ids: strict pattern accepts stored ids and rejects path tricks', () => {
    assert(isAttachmentId(newId('.csv')), 'uuid id accepted');
    assert(!isAttachmentId('ai-../../etc/passwd'), 'traversal rejected');
    assert(!isAttachmentId('form-1.csv'), 'non-ai id rejected');
    assert(!isAttachmentId(''), 'empty rejected');
  });

  check('names: path separators and control characters are stripped', () => {
    equal(safeName('C:\\Users\\x\\evil\nname.csv'), 'evil_name.csv', 'windows path');
    equal(safeName('../../secrets.txt'), 'secrets.txt', 'posix traversal');
    assert(safeName('x'.repeat(500)).length <= 120, 'length cap');
  });

  await checkAsync('purge: only aged ai-* uploads are removed', async () => {
    fs.mkdirSync(env.files.uploadDir, { recursive: true });
    const oldFile = newId('.csv');
    const freshFile = newId('.csv');
    const otherFile = `keep-${crypto.randomUUID()}.csv`;
    const oldPath = writeFixture(oldFile, 'old');
    writeFixture(freshFile, 'fresh');
    writeFixture(otherFile, 'not-ours');
    const past = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    fs.utimesSync(oldPath, past, past);
    try {
      const removed = await purgeOldAttachments();
      assert(removed >= 1, `removed ${removed}`);
      assert(!fs.existsSync(oldPath), 'aged ai- file removed');
      assert(fs.existsSync(path.join(env.files.uploadDir, freshFile)), 'fresh ai- file kept');
      assert(fs.existsSync(path.join(env.files.uploadDir, otherFile)), 'non-ai file kept');
    } finally {
      for (const f of [oldFile, freshFile, otherFile]) {
        fs.rmSync(path.join(env.files.uploadDir, f), { force: true });
      }
    }
  });
}

// ---------------------------------------------------------------------------
// B/C. HTTP surface
// ---------------------------------------------------------------------------
const BASE = 'http://localhost:4000/api/v1';
const DEV_PASSWORD = process.env.DEV_PASSWORD || 'Password123!';
const ADMIN = 'woluman.urgesa@kerchanshe.net';
const VIEWER = 'mekdes.tilahun@kerchanshe.com';

interface HttpResult {
  status: number;
  data: any;
}

function req(method: string, path: string, token?: string, body?: unknown, timeoutMs = 30_000): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const request = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method, headers, timeout: timeoutMs },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode ?? 0, data: parsed });
        });
      }
    );
    request.on('timeout', () => request.destroy(new Error(`timeout after ${timeoutMs}ms`)));
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

async function login(username: string): Promise<string> {
  const res = await req('POST', '/auth/login/local', undefined, { username, password: DEV_PASSWORD });
  assert(res.status === 200 && res.data?.token, `login failed for ${username} (status=${res.status})`);
  return res.data.token as string;
}

async function upload(
  token: string,
  filename: string,
  content: string | Buffer
): Promise<HttpResult> {
  const form = new FormData();
  const bytes = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
  form.append('file', new Blob([new Uint8Array(bytes)]), filename);
  const res = await fetch(`${BASE}/ai/attachments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  return { status: res.status, data: parsed };
}

async function serverUp(): Promise<boolean> {
  try {
    const res = await req('GET', '/ai/providers', undefined, undefined, 5000);
    return res.status !== 0;
  } catch {
    return false;
  }
}

async function sectionB(): Promise<boolean> {
  console.log('\nB. HTTP surface (upload endpoint)');

  if (!(await serverUp())) {
    console.log('  SKIP API server not reachable on :4000');
    return false;
  }

  const admin = await login(ADMIN);
  const viewer = await login(VIEWER);

  await checkAsync('auth: anonymous upload is rejected', async () => {
    const res = await upload('', 'x.csv', 'a,b\n1,2\n');
    equal(res.status, 401, 'status');
  });

  await checkAsync('rbac: viewer cannot upload attachments', async () => {
    const res = await upload(viewer, 'x.csv', 'a,b\n1,2\n');
    equal(res.status, 403, 'status');
  });

  await checkAsync('upload: csv returns id, kind and preserved filename', async () => {
    const res = await upload(admin, 'regions 2026.csv', FIXTURE_CSV);
    equal(res.status, 200, 'status');
    const body = res.data;
    assert(isAttachmentId(body.attachmentId), `id ${body.attachmentId}`);
    equal(body.kind, 'document', 'kind');
    equal(body.filename, 'regions 2026.csv', 'filename');
    assert(body.sizeBytes > 0, 'sizeBytes');
    fs.rmSync(path.join(env.files.uploadDir, body.attachmentId), { force: true });
  });

  await checkAsync('upload: image is classified as kind=image', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100' + '05fe02fe', 'hex');
    const res = await upload(admin, 'shot.png', png);
    equal(res.status, 200, 'status');
    equal(res.data.kind, 'image', 'kind');
    fs.rmSync(path.join(env.files.uploadDir, res.data.attachmentId), { force: true });
  });

  await checkAsync('upload: unsupported extension is 422', async () => {
    const res = await upload(admin, 'run.exe', 'MZ');
    equal(res.status, 422, 'status');
  });

  await checkAsync('upload: oversize file is 413', async () => {
    const res = await upload(admin, 'huge.txt', Buffer.alloc(11 * 1024 * 1024, 0x41));
    equal(res.status, 413, 'status');
  });

  await checkAsync('ask: unknown attachment id fails honestly (404) before any AI call', async () => {
    const id = newId('.csv');
    const res = await req('POST', '/ai/ask', admin, {
      provider: 'auto',
      question: 'What is in my file?',
      attachment: { id, name: 'missing.csv', sizeBytes: 10, mimeType: 'text/csv' },
    });
    equal(res.status, 404, 'status');
    assert(String(res.data?.error?.code ?? res.data?.code ?? '').includes('ATTACHMENT')
      || /attachment|expired|available/i.test(String(res.data?.error?.message ?? res.data?.message ?? '')),
      `message: ${JSON.stringify(res.data)}`);
  });

  await checkAsync('ask: malformed attachment id is a validation error', async () => {
    const res = await req('POST', '/ai/ask', admin, {
      provider: 'auto',
      question: 'What is in my file?',
      attachment: { id: '../../etc/passwd', name: 'x.csv', sizeBytes: 10, mimeType: 'text/csv' },
    });
    assert(res.status === 400 || res.status === 422, `status ${res.status}`);
  });

  return true;
}

async function sectionC(live: boolean): Promise<void> {
  console.log('\nC. Grounded ask with an attachment');

  if (!live) {
    console.log('  SKIP run with --live to exercise /ai/ask (needs a working AI provider)');
    return;
  }

  const admin = await login(ADMIN);

  // Provider health first — a dead provider is an environment problem, not a
  // feature failure, so report it as a skip instead of a red test.
  const providers = await req('GET', '/ai/providers', admin);
  const available = (providers.data?.providers ?? []).filter((p: any) => p.available);
  if (available.length === 0) {
    console.log(`  SKIP no AI provider is available right now (${JSON.stringify((providers.data?.providers ?? []).map((p: any) => p.id))})`);
    return;
  }

  await checkAsync('upload: csv fixture for the live ask', async () => {
    const res = await upload(admin, 'attach-fixture.csv', `${MARKER_CSV}\n${FIXTURE_CSV}`);
    equal(res.status, 200, 'status');
    liveId = res.data.attachmentId;
    assert(isAttachmentId(liveId), 'id');
  });

  await checkAsync('ask: answer references the attachment and returns sources shape', async () => {
    const res = await req(
      'POST',
      '/ai/ask',
      admin,
      {
        provider: 'auto',
        question: `What is the total Units in the attached file? Cite the file.`,
        attachment: { id: liveId, name: 'attach-fixture.csv', sizeBytes: FIXTURE_CSV.length, mimeType: 'text/csv' },
      },
      120_000
    );
    equal(res.status, 200, `status ${JSON.stringify(res.data)?.slice(0, 200)}`);
    assert(typeof res.data.answer === 'string' && res.data.answer.length > 0, 'answer present');
    assert(Array.isArray(res.data.warnings), 'warnings array');
    assert(/59|attachment/i.test(res.data.answer), `answer cites total/file: ${res.data.answer.slice(0, 300)}`);
    assert(Array.isArray(res.data.sources), 'sources array');
  });
}

let liveId = '';

// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const live = process.argv.includes('--live');

  await sectionA();
  const up = await sectionB();
  if (up) await sectionC(live);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
  process.exit(process.exitCode ?? 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
