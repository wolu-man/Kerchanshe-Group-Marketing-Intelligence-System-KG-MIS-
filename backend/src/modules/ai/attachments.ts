// =============================================================================
// AI chat attachments — upload + text extraction for the assistant.
//
// One file per question: the browser uploads it to POST /ai/attachments, then
// references the returned id on POST /ai/ask. Documents are text-extracted
// server-side (CSV/XLSX/XLS/TXT/MD/JSON/PDF/DOCX) and injected into the model
// prompts as an ATTACHMENT block; images are passed to Gemini as inline data.
// Nothing else changes: same RBAC, same read-only classification, and the
// file content is never persisted anywhere except the upload directory.
//
// Retention: files are named ai-<uuid>.<ext> and swept after ATTACHMENT_TTL_DAYS.
// =============================================================================

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { parse as parseCsv } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { AppError } from '../../utils/errors';

export const ATTACHMENT_MAX_MB = 10;
export const ATTACHMENT_TTL_DAYS = 7;
/** Hard cap on extracted text handed to the model. */
export const ATTACHMENT_TEXT_CAP = 20_000;

const ID_PATTERN = /^ai-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,8}$/i;

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
const DOC_EXTS = new Set(['.csv', '.xlsx', '.xls', '.txt', '.md', '.json', '.log', '.pdf', '.docx']);
const ALLOWED_EXTS = new Set([...IMAGE_EXTS, ...DOC_EXTS]);

export type AttachmentKind = 'document' | 'image';

export interface UploadedAttachment {
  id: string;
  /** Original filename, sanitised (basename only, no path separators). */
  filename: string;
  sizeBytes: number;
  mimeType: string;
  kind: AttachmentKind;
  extractable: boolean;
}

export interface LoadedAttachment extends UploadedAttachment {
  /** Extracted text (documents, capped) — absent for images. */
  text?: string;
  /** Base64 payload for images (Gemini inline data). */
  image?: { mimeType: string; data: string };
}

fs.mkdirSync(env.files.uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: env.files.uploadDir,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
    cb(null, `ai-${crypto.randomUUID()}${ext}`);
  },
});

const uploader = multer({
  storage,
  limits: { fileSize: ATTACHMENT_MAX_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, ALLOWED_EXTS.has(ext));
  },
});

/** Filename as it may appear in prompts — basename only, inert characters. */
export function safeName(original: string): string {
  const base = path.basename(original).replace(/[^\w.\- ()]/g, '_');
  return (base || 'attachment').slice(0, 120);
}

export function kindFor(name: string): AttachmentKind {
  return IMAGE_EXTS.has(path.extname(name).toLowerCase()) ? 'image' : 'document';
}

/**
 * Multer middleware with friendly error mapping: unsupported type → 422,
 * oversize → 413, anything else → 400. Never throws raw MulterError.
 */
export function uploadAttachment(req: any, res: any, next: any): void {
  uploader.single('file')(req, res, (err: unknown) => {
    if (!err) return next();
    const e = err as { code?: string; message?: string };
    if (e.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError(413, 'FILE_TOO_LARGE', `Attachments are limited to ${ATTACHMENT_MAX_MB} MB`));
    }
    if (e.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(new AppError(422, 'UNSUPPORTED_FILE', 'Send exactly one file in the "file" field'));
    }
    if (e.code === 'LIMIT_FILE_COUNT') {
      return next(new AppError(422, 'UNSUPPORTED_FILE', 'Only one attachment per question'));
    }
    // fileFilter rejection (multer passes no code for that) or generic failure.
    if (!req.file) {
      return next(new AppError(422, 'UNSUPPORTED_FILE', 'That file type is not supported'));
    }
    return next(new AppError(400, 'UPLOAD_FAILED', e.message ?? 'Upload failed'));
  });
}

/** Validates an id from the client (shape only — existence checked on load). */
export function isAttachmentId(id: string): boolean {
  return ID_PATTERN.test(id);
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------
interface CacheEntry {
  value: LoadedAttachment;
  at: number;
}
/** Follow-up questions reuse the parse instead of re-reading the file. */
const extractCache = new Map<string, CacheEntry>();
const CACHE_MAX = 50;
const CACHE_TTL_MS = 10 * 60 * 1000;

function cachePut(id: string, value: LoadedAttachment): void {
  if (extractCache.size >= CACHE_MAX) {
    const oldest = extractCache.keys().next().value;
    if (oldest) extractCache.delete(oldest);
  }
  extractCache.set(id, { value, at: Date.now() });
}

function cacheGet(id: string): LoadedAttachment | null {
  const hit = extractCache.get(id);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    extractCache.delete(id);
    return null;
  }
  return hit.value;
}

function cap(text: string): string {
  const clean = text.replace(/\r\n/g, '\n').trim();
  return clean.length > ATTACHMENT_TEXT_CAP ? `${clean.slice(0, ATTACHMENT_TEXT_CAP)}\n…[truncated]` : clean;
}

async function extractText(filePath: string, ext: string): Promise<string> {
  if (ext === '.csv') {
    const raw = await fs.promises.readFile(filePath, 'utf8');
    const rows = parseCsv(raw, { relax_column_count: true, skip_empty_lines: true }) as string[][];
    return cap(rows.map((r) => r.join(',')).join('\n'));
  }
  if (ext === '.xlsx' || ext === '.xls') {
    const workbook = XLSX.readFile(filePath, { sheetRows: 2000 });
    const out: string[] = [];
    for (const name of workbook.SheetNames) {
      out.push(`# Sheet: ${name}`, XLSX.utils.sheet_to_csv(workbook.Sheets[name]));
    }
    return cap(out.join('\n'));
  }
  if (ext === '.pdf') {
    const buffer = await fs.promises.readFile(filePath);
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return cap(result.text ?? '');
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  }
  if (ext === '.docx') {
    const buffer = await fs.promises.readFile(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return cap(result.value ?? '');
  }
  // .txt / .md / .json / .log
  const raw = await fs.promises.readFile(filePath, 'utf8');
  return cap(raw);
}

/**
 * Validates + loads an attachment for an ask. `displayName` is the original
 * filename the client saw (sanitised here). Throws AppError when the file is
 * missing or unusable; callers turn that into an honest warning.
 */
export async function loadAttachment(id: string, displayName?: string): Promise<LoadedAttachment> {
  if (!isAttachmentId(id)) {
    throw new AppError(422, 'ATTACHMENT_INVALID', 'Unknown attachment');
  }
  const cacheKey = `${id}::${displayName ?? ''}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const filePath = path.join(env.files.uploadDir, id);
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(filePath);
  } catch {
    throw new AppError(404, 'ATTACHMENT_NOT_FOUND', 'The attachment has expired or is no longer available');
  }
  if (!stat.isFile() || stat.size === 0) {
    throw new AppError(404, 'ATTACHMENT_NOT_FOUND', 'The attachment is empty or unavailable');
  }

  const ext = path.extname(id).toLowerCase();
  const base: UploadedAttachment = {
    id,
    filename: safeName(displayName || id),
    sizeBytes: stat.size,
    mimeType: mimeFor(ext),
    kind: kindFor(id),
    extractable: IMAGE_EXTS.has(ext) || DOC_EXTS.has(ext),
  };

  if (base.kind === 'image') {
    const buffer = await fs.promises.readFile(filePath);
    const loaded: LoadedAttachment = {
      ...base,
      image: { mimeType: base.mimeType, data: buffer.toString('base64') },
    };
    cachePut(cacheKey, loaded);
    return loaded;
  }

  try {
    const text = await extractText(filePath, ext);
    const loaded: LoadedAttachment = { ...base, text };
    cachePut(cacheKey, loaded);
    return loaded;
  } catch (err) {
    logger.warn('ai.attachment.extract_failed', { id, ext, error: (err as Error).message.slice(0, 200) });
    const loaded: LoadedAttachment = { ...base, extractable: false };
    cachePut(cacheKey, loaded);
    return loaded;
  }
}

function mimeFor(ext: string): string {
  switch (ext) {
    case '.png': return 'image/png';
    case '.jpg': case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.webp': return 'image/webp';
    case '.csv': return 'text/csv';
    case '.txt': case '.md': case '.log': return 'text/plain';
    case '.json': return 'application/json';
    case '.xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case '.xls': return 'application/vnd.ms-excel';
    case '.pdf': return 'application/pdf';
    case '.docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    default: return 'application/octet-stream';
  }
}

/** Builds the prompt block for a document attachment ("" when not usable). */
export function attachmentBlock(loaded: LoadedAttachment): string {
  if (loaded.kind !== 'document') return '';
  const label = loaded.filename;
  if (!loaded.extractable) {
    return `\n\nATTACHMENT (file: ${label}, type: ${loaded.mimeType}):\n[This file could not be read — its contents are not available. Say so honestly if the question depends on it.]`;
  }
  if (!loaded.text) {
    return `\n\nATTACHMENT (file: ${label}, type: ${loaded.mimeType}):\n[The file was empty.]`;
  }
  return `\n\nATTACHMENT (file: ${label}, type: ${loaded.mimeType}):\n${loaded.text}`;
}

/** Daily sweep: drop ai-* uploads older than the TTL (cron entry point). */
export async function purgeOldAttachments(): Promise<number> {
  let removed = 0;
  try {
    const entries = await fs.promises.readdir(env.files.uploadDir);
    const cutoff = Date.now() - ATTACHMENT_TTL_DAYS * 24 * 60 * 60 * 1000;
    for (const name of entries) {
      if (!name.startsWith('ai-')) continue;
      const full = path.join(env.files.uploadDir, name);
      try {
        const stat = await fs.promises.stat(full);
        if (stat.isFile() && stat.mtimeMs < cutoff) {
          await fs.promises.unlink(full);
          for (const key of extractCache.keys()) {
            if (key.startsWith(`${name}::`)) extractCache.delete(key);
          }
          removed += 1;
        }
      } catch {
        /* race with another sweep — ignore */
      }
    }
  } catch (err) {
    logger.warn('ai.attachment.purge_failed', { error: (err as Error).message });
  }
  return removed;
}
