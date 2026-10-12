import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { env } from '../../config/env';

// Creates the upload dir once at startup (SDD 3.x file storage).
fs.mkdirSync(env.files.uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: env.files.uploadDir,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 10);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

// Multer middleware for form file/image/signature fields (FR-01.2/01.8).
// Files are scanned by the AV integration before being linked to a response.
export const formUpload = multer({
  storage,
  limits: { fileSize: env.files.maxUploadMb * 1024 * 1024 },
});
