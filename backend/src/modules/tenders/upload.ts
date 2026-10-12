// =============================================================================
// Tender Intelligence — Manual data upload (Excel/CSV) multer configuration.
//
// Mirrors forms/upload.ts: disk storage, UUID filenames, size limit. Errors
// are surfaced as structured AppErrors (400/413) instead of leaking through
// errorHandler as 500s. Content sniffing happens in import.service.ts.
// =============================================================================

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { env } from '../../config/env';
import { BadRequestError } from '../../utils/errors';
import { IMPORT_ALLOWED_EXTENSIONS, IMPORT_MAX_BYTES } from './import.types';

export const IMPORT_DIR = path.resolve(env.files.uploadDir, '..', 'import-staging');

// Created at startup — import uploads never share the form upload directory.
fs.mkdirSync(IMPORT_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: IMPORT_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').slice(0, 10).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

/** True when the original filename carries an allowed import extension. */
export function isAllowedImportFile(originalname: string): boolean {
  const ext = path.extname(originalname || '').toLowerCase();
  return (IMPORT_ALLOWED_EXTENSIONS as readonly string[]).includes(ext);
}

export const importUpload = multer({
  storage,
  limits: { fileSize: IMPORT_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedImportFile(file.originalname)) {
      const ext = path.extname(file.originalname || '').toLowerCase() || '(none)';
      cb(
        new BadRequestError(
          `Unsupported file type "${ext}". Allowed types: .csv, .xlsx, .xls`,
          'IMPORT_UNSUPPORTED_FILE',
        ),
      );
      return;
    }
    cb(null, true);
  },
});

/** multer.single('file') with structured error mapping (size/type → 400/413). */
export const importUploadSingle: RequestHandler = (req: Request, res: Response, next: NextFunction): void => {
  importUpload.single('file')(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(new BadRequestError('File exceeds the 5 MB import size limit', 'IMPORT_FILE_TOO_LARGE'));
        return;
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        next(new BadRequestError('Unexpected file field — send the file as "file"', 'IMPORT_UPLOAD_ERROR'));
        return;
      }
      next(new BadRequestError(err.message, 'IMPORT_UPLOAD_ERROR'));
      return;
    }
    // AppError from fileFilter (400) or anything unexpected.
    next(err);
  });
};
