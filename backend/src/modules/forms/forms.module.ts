import { Router } from 'express';
import { formsRouter } from './forms.routes';
import { responsesRouter } from './responses.routes';
import { resolveShare } from './sharing.service';
import { asyncHandler } from '../../utils/http';
import { getForm, getPublishedVersion } from './forms.service';
import { submitResponse, isRateLimited } from './responses.service';
import { audit } from '../../db/audit';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import { randomUUID } from 'crypto';
import { env } from '../../config/env';

// Aggregated NexForm endpoints (TDS §4: /api/v1/forms/*).
const router = Router();

function logAudit(req: any, entry: { userId: number | null; action: string; entity: string; entityId?: number | null; detail?: Record<string, unknown> | null }) {
  return audit({ ...entry, ipAddress: req.ip });
}

// Public endpoints (no auth required) - must come before authenticated routers
router.get(
  '/forms/:id/public',
  asyncHandler(async (req, res) => {
    const form = await getForm(Number(req.params.id));
    if (form.Status !== 'Published' || !['Public', 'Password'].includes(form.AccessMode)) {
      return res.status(404).json({ message: 'Form not available' });
    }
    res.json({
      TemplateID: form.TemplateID,
      Title: form.Title,
      Description: form.Description,
      AccessMode: form.AccessMode,
      GDPRConsentRequired: form.GDPRConsentRequired,
      GDPRConsentText: form.GDPRConsentText,
      GDPRConsentVersion: form.GDPRConsentVersion,
      MaxResponses: form.MaxResponses,
      ExpireAt: form.ExpireAt,
      PublishAt: form.PublishAt,
      Status: form.Status,
      ResponseCount: form.ResponseCount,
    });
  })
);

router.get(
  '/forms/:id/public/versions/published',
  asyncHandler(async (req, res) => {
    const form = await getForm(Number(req.params.id));
    if (form.Status !== 'Published' || !['Public', 'Password'].includes(form.AccessMode)) {
      return res.status(404).json({ message: 'Form not available' });
    }
    const version = await getPublishedVersion(Number(req.params.id));
    if (!version) return res.status(404).json({ message: 'No published version' });
    res.json(version);
  })
);

// Public form submission (no auth required)
const publicSubmitSchema = z.object({
  answers: z.record(z.unknown()),
  consentGiven: z.boolean().optional(),
  email: z.string().email().optional(),
  password: z.string().optional(),
});

router.post(
  '/forms/:id/public/responses',
  asyncHandler(async (req, res) => {
    const parseResult = publicSubmitSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ message: 'Invalid request body', errors: parseResult.error.errors });
    }
    const { answers, consentGiven, email, password } = parseResult.data;

    const template = await getForm(Number(req.params.id));
    if (template.Status !== 'Published') {
      return res.status(400).json({ message: 'Form is not open for responses', code: 'FORM_NOT_PUBLISHED' });
    }
    if (!['Public', 'Password'].includes(template.AccessMode)) {
      return res.status(403).json({ message: 'This form does not accept public submissions', code: 'FORBIDDEN' });
    }

    if (isRateLimited(template.TemplateID, req.ip)) {
      return res.status(429).json({ message: 'Too many submissions from this device. Try again later.', code: 'TOO_MANY_REQUESTS' });
    }

    const submitResult = await submitResponse({
      templateId: template.TemplateID,
      respondentUserId: undefined,
      respondentEmail: email?.trim().toLowerCase() || undefined,
      consentGiven,
      password,
      answers,
      files: undefined,
      ip: req.ip,
    });

    await logAudit(req, {
      userId: null,
      action: 'PUBLIC_FORM_RESPONSE_SUBMITTED',
      entity: 'FormResponse',
      entityId: submitResult.responseId,
      detail: { templateId: template.TemplateID, email }
    });

    res.status(201).json(submitResult);
  })
);

// Public appearance image upload (no auth required, form must be public)
const appearanceUpload = multer({
  storage: multer.diskStorage({
    destination: env.files.uploadDir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 10);
      cb(null, `appearance-${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files allowed'));
    }
    cb(null, true);
  },
});

router.post(
  '/forms/:id/public/appearance/upload',
  asyncHandler(async (req, res) => {
    const form = await getForm(Number(req.params.id));
    if (form.Status !== 'Published' || form.AccessMode !== 'Public') {
      return res.status(403).json({ message: 'Form not available for public upload' });
    }

    appearanceUpload.single('image')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ message: err.message });
      }
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
      res.json({ url: fileUrl, filename: req.file.filename });
    });
  })
);

router.use('/forms', responsesRouter); // fixed/nested routes before param routes
router.use('/forms', formsRouter);

// Public share-link resolution (DR-11): token is the only credential.
router.get(
  '/share/:token',
  asyncHandler(async (req, res) => {
    const report = await resolveShare(req.params.token);
    res.json(report);
  })
);

export { router as formsModule };