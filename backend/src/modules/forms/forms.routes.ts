import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { requireAuth } from '../../middleware/auth';
import { can } from '../../middleware/permission';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/http';
import { audit } from '../../db/audit';
import { ForbiddenError, BadRequestError } from '../../utils/errors';
import { env } from '../../config/env';
import {
  addInvite,
  archiveForm,
  bulkAddInvites,
  cloneForm,
  configureAccess,
  createForm,
  deleteForm,
  getAccessRule,
  getBranding,
  getConsent,
  getForm,
  getLatestVersion,
  getPublishedVersion,
  listChildren,
  listConsentHistory,
  listForms,
  listInvites,
  listVersions,
  listAccessibleForms,
  propagateParentChanges,
  publishForm,
  reassignOwnership,
  revokeInvite,
  saveVersion,
  updateBranding,
  updateConsent,
  updateFormMeta,
} from './forms.service';

function logAudit(req: Request, entry: { userId: number | null; action: string; entity: string; entityId?: number | null; detail?: Record<string, unknown> | null }) {
  return audit({ ...entry, ipAddress: req.ip });
}

const router = Router();
router.use(requireAuth);

function assertOwnerOrFull(req: any, ownerUserId: number): void {
  if (req.scope?.dataScope === 'own' && ownerUserId !== req.user.userId) {
    throw new ForbiddenError('You can only manage your own forms');
  }
}

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  parentTemplateId: z.number().int().positive().nullable().optional(),
});

const updateMetaSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).nullable().optional(),
  maxResponses: z.number().int().positive().nullable().optional(),
  gdprConsentRequired: z.boolean().optional(),
  publishAt: z.string().nullable().optional(),
  expireAt: z.string().nullable().optional(),
  linkedFormTemplateId: z.number().int().positive().nullable().optional(),
  editWindowHours: z.number().int().positive().nullable().optional(),
  autoRejectAnomalies: z.boolean().optional(),
  allowDrafts: z.boolean().optional(),
});

const elementSchema = z
  .object({
    key: z.string().min(1),
    type: z.string().min(1),
    label: z.string().min(1),
    order: z.number().int(),
  })
  .passthrough();

const pageSchema = z.object({ id: z.string().min(1), title: z.string().min(1) }).passthrough();

const brandingSchema = z
  .object({
    logoUrl: z.string().nullable().optional(),
    primaryColor: z.string().nullable().optional(),
    secondaryColor: z.string().nullable().optional(),
    fontFamily: z.string().nullable().optional(),
    thankYou: z
      .object({
        title: z.string().nullable().optional(),
        message: z.string().nullable().optional(),
        showResponseId: z.boolean().optional(),
        redirectUrl: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
  })
  .passthrough()
  .optional();

const envelopeSchema = z
  .object({
    schemaVersion: z.number().optional(),
    pages: z.array(pageSchema).optional(),
    elements: z.array(elementSchema),
    branding: brandingSchema,
  })
  .passthrough();

// Accepts either a legacy bare element array or a full envelope.
const versionSchema = z.object({ schema: z.union([z.array(elementSchema), envelopeSchema]) });

const accessSchema = z.object({
  mode: z.enum(['Public', 'Domain', 'Invite', 'Group', 'Password']),
  config: z
    .object({
      domains: z.array(z.string()).optional(),
      roles: z.array(z.string()).optional(),
      password: z.string().min(1).optional(),
      groupId: z.string().optional(),
    })
    .optional(),
});

router.get(
  '/',
  can('forms.view'),
  asyncHandler(async (req, res) => {
    const items = await listForms({
      dataScope: req.scope!.dataScope,
      userId: req.user!.userId,
      status: req.query.status as string | undefined,
      search: req.query.search as string | undefined,
    });
    res.json({ items });
  })
);

// Published forms the current user may respond to.
router.get(
  '/accessible',
  can('forms.respond'),
  asyncHandler(async (_req, res) => {
    const items = await listAccessibleForms();
    res.json({ items });
  })
);

router.post(
  '/',
  can('forms.create'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const templateId = await createForm({ ownerUserId: req.user!.userId, ...req.body });
    await logAudit(req,{ userId: req.user!.userId, action: 'FORM_CREATED', entity: 'FormTemplate', entityId: templateId });
    res.status(201).json({ templateId });
  })
);

router.get(
  '/:id',
  can('forms.view'),
  asyncHandler(async (req, res) => {
    const form = await getForm(Number(req.params.id));
    assertOwnerOrFull(req, form.OwnerUserID);
    res.json(form);
  })
);

router.put(
  '/:id',
  can('forms.update'),
  validate(updateMetaSchema),
  asyncHandler(async (req, res) => {
    const form = await getForm(Number(req.params.id));
    assertOwnerOrFull(req, form.OwnerUserID);
    await updateFormMeta(form.TemplateID, req.body);
    await logAudit(req,{ userId: req.user!.userId, action: 'FORM_UPDATED', entity: 'FormTemplate', entityId: form.TemplateID });
    res.json({ ok: true });
  })
);

router.get(
  '/:id/versions',
  can('forms.view'),
  asyncHandler(async (req, res) => {
    const form = await getForm(Number(req.params.id));
    assertOwnerOrFull(req, form.OwnerUserID);
    const items = await listVersions(form.TemplateID);
    res.json({ items });
  })
);

router.post(
  '/:id/versions',
  can('forms.update'),
  validate(versionSchema),
  asyncHandler(async (req, res) => {
    const form = await getForm(Number(req.params.id));
    assertOwnerOrFull(req, form.OwnerUserID);
    const versionId = await saveVersion(form.TemplateID, req.body.schema);
    await logAudit(req,{ userId: req.user!.userId, action: 'FORM_VERSION_SAVED', entity: 'FormVersion', entityId: versionId });
    res.status(201).json({ versionId });
  })
);

router.get(
  '/:id/versions/latest',
  can('forms.view'),
  asyncHandler(async (req, res) => {
    const version = await getLatestVersion(Number(req.params.id));
    res.json(version);
  })
);

router.get(
  '/:id/versions/published',
  can('forms.view'),
  asyncHandler(async (req, res) => {
    const version = await getPublishedVersion(Number(req.params.id));
    if (!version) return res.status(404).json({ message: 'No published version' });
    res.json(version);
  })
);

// Lightweight comparison used by the UI to show "Publish changes" when the
// latest saved version differs from the live (published) version.
router.get(
  '/:id/publish-state',
  can('forms.view'),
  asyncHandler(async (req, res) => {
    const form = await getForm(Number(req.params.id));
    assertOwnerOrFull(req, form.OwnerUserID);
    const latest = await getLatestVersion(form.TemplateID);
    const published = await getPublishedVersion(form.TemplateID);
    res.json({
      status: form.Status,
      latestVersion: latest.VersionNumber,
      latestVersionId: latest.VersionID,
      publishedVersion: published?.VersionNumber ?? null,
      publishedVersionId: published?.VersionID ?? null,
      hasUnpublishedChanges:
        form.Status === 'Published' && (!published || latest.VersionID !== published.VersionID),
      canPublish: form.Status === 'Draft' || form.Status === 'Published',
    });
  })
);

router.post(
  '/:id/publish',
  can('forms.publish'),
  asyncHandler(async (req, res) => {
    const form = await getForm(Number(req.params.id));
    assertOwnerOrFull(req, form.OwnerUserID);
    await publishForm(form.TemplateID, req.user!.userId);
    res.json({ ok: true });
  })
);

router.post(
  '/:id/archive',
  can('forms.archive'),
  asyncHandler(async (req, res) => {
    const form = await getForm(Number(req.params.id));
    assertOwnerOrFull(req, form.OwnerUserID);
    await archiveForm(form.TemplateID, req.user!.userId);
    res.json({ ok: true });
  })
);

router.delete(
  '/:id',
  can('forms.delete'),
  asyncHandler(async (req, res) => {
    const form = await getForm(Number(req.params.id));
    assertOwnerOrFull(req, form.OwnerUserID);
    await deleteForm(form.TemplateID, req.user!.userId);
    res.json({ ok: true });
  })
);

router.post(
  '/:id/clone',
  can('forms.create'),
  asyncHandler(async (req, res) => {
    const templateId = await cloneForm(Number(req.params.id), req.user!.userId);
    await logAudit(req,{ userId: req.user!.userId, action: 'FORM_CLONED', entity: 'FormTemplate', entityId: templateId });
    res.status(201).json({ templateId });
  })
);

router.post(
  '/:id/ownership',
  can('forms.reassignOwnership'),
  validate(z.object({ newOwnerUserId: z.number().int().positive() })),
  asyncHandler(async (req, res) => {
    const form = await getForm(Number(req.params.id));
    assertOwnerOrFull(req, form.OwnerUserID);
    await reassignOwnership(form.TemplateID, req.body.newOwnerUserId, req.user!.userId);
    res.json({ ok: true });
  })
);

router.get(
  '/:id/access',
  can('forms.configureAccess'),
  asyncHandler(async (req, res) => {
    const rule = await getAccessRule(Number(req.params.id));
    res.json(rule);
  })
);

router.put(
  '/:id/access',
  can('forms.configureAccess'),
  validate(accessSchema),
  asyncHandler(async (req, res) => {
    const form = await getForm(Number(req.params.id));
    assertOwnerOrFull(req, form.OwnerUserID);
    await configureAccess(form.TemplateID, req.body);
    await logAudit(req,{ userId: req.user!.userId, action: 'FORM_ACCESS_CONFIGURED', entity: 'FormTemplate', entityId: form.TemplateID, detail: { mode: req.body.mode } });
    res.json({ ok: true });
  })
);

router.get(
  '/:id/invites',
  can('forms.configureAccess'),
  asyncHandler(async (req, res) => {
    const invites = await listInvites(Number(req.params.id));
    res.json({ items: invites });
  })
);

router.post(
  '/:id/invites',
  can('forms.configureAccess'),
  validate(z.object({ email: z.string().email() })),
  asyncHandler(async (req, res) => {
    const form = await getForm(Number(req.params.id));
    assertOwnerOrFull(req, form.OwnerUserID);
    await addInvite(form.TemplateID, req.body.email, req.user!.userId);
    res.status(201).json({ ok: true });
  })
);

router.post(
  '/:id/invites/bulk',
  can('forms.configureAccess'),
  validate(z.object({ emails: z.array(z.string().email()).min(1) })),
  asyncHandler(async (req, res) => {
    const form = await getForm(Number(req.params.id));
    assertOwnerOrFull(req, form.OwnerUserID);
    const added = await bulkAddInvites(form.TemplateID, req.body.emails, req.user!.userId);
    res.status(201).json({ added });
  })
);

router.delete(
  '/invites/:inviteId',
  can('forms.configureAccess'),
  asyncHandler(async (req, res) => {
    await revokeInvite(Number(req.params.inviteId));
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Parent / child inheritance (REL-12..17)
// ---------------------------------------------------------------------------
router.post(
  '/:id/children',
  can('forms.create'),
  validate(createSchema.pick({ title: true, description: true })),
  asyncHandler(async (req, res) => {
    const parent = await getForm(Number(req.params.id));
    assertOwnerOrFull(req, parent.OwnerUserID);
    const childId = await createForm({
      ownerUserId: req.user!.userId,
      title: req.body.title,
      description: req.body.description,
      parentTemplateId: parent.TemplateID,
    });
    await logAudit(req,{ userId: req.user!.userId, action: 'CHILD_FORM_CREATED', entity: 'FormTemplate', entityId: childId, detail: { parent: parent.TemplateID } });
    // createForm already copies the parent's schema — no immediate propagate needed.
    res.status(201).json({ templateId: childId });
  })
);

router.get(
  '/:id/children',
  can('forms.view'),
  asyncHandler(async (req, res) => {
    const children = await listChildren(Number(req.params.id));
    res.json({ items: children });
  })
);

router.post(
  '/:id/propagate',
  can('forms.update'),
  asyncHandler(async (req, res) => {
    const form = await getForm(Number(req.params.id));
    assertOwnerOrFull(req, form.OwnerUserID);
    await propagateParentChanges(form.TemplateID, req.user!.userId, 'PARENT_PROPAGATED');
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Consent versioning (SC-11)
// ---------------------------------------------------------------------------
router.get(
  '/:id/consent',
  can('forms.view'),
  asyncHandler(async (req, res) => {
    const consent = await getConsent(Number(req.params.id));
    res.json(consent);
  })
);

router.put(
  '/:id/consent',
  can('forms.update'),
  validate(z.object({ consentText: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const form = await getForm(Number(req.params.id));
    assertOwnerOrFull(req, form.OwnerUserID);
    await updateConsent(form.TemplateID, { consentText: req.body.consentText, userId: req.user!.userId });
    res.json({ ok: true });
  })
);

router.get(
  '/:id/consent/history',
  can('forms.view'),
  asyncHandler(async (req, res) => {
    const history = await listConsentHistory(Number(req.params.id));
    res.json({ items: history });
  })
);

// ---------------------------------------------------------------------------
// Branding (BR-01..06)
// ---------------------------------------------------------------------------
router.get(
  '/:id/branding',
  can('forms.view'),
  asyncHandler(async (req, res) => {
    const branding = await getBranding(Number(req.params.id));
    res.json(branding);
  })
);

router.put(
  '/:id/branding',
  can('forms.update'),
  validate(z.object({ branding: brandingSchema.unwrap() })),
  asyncHandler(async (req, res) => {
    const form = await getForm(Number(req.params.id));
    assertOwnerOrFull(req, form.OwnerUserID);
    await updateBranding(form.TemplateID, req.body.branding, req.user!.userId);
    res.json({ ok: true });
  })
);

// Authenticated appearance image upload (works on draft forms — settings UI).
const appearanceUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(env.files.uploadDir, { recursive: true });
      cb(null, env.files.uploadDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 10);
      cb(null, `appearance-${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new BadRequestError('Only image files allowed', 'INVALID_FILE_TYPE'));
    }
    cb(null, true);
  },
});

router.post(
  '/:id/appearance/upload',
  can('forms.update'),
  asyncHandler(async (req, res) => {
    const form = await getForm(Number(req.params.id));
    assertOwnerOrFull(req, form.OwnerUserID);

    await new Promise<void>((resolve, reject) => {
      appearanceUpload.single('image')(req, res, (err) => {
        if (err) reject(err instanceof Error ? err : new Error(String(err)));
        else resolve();
      });
    });

    if (!req.file) throw new BadRequestError('No file uploaded', 'NO_FILE');
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    res.status(201).json({ url: fileUrl, filename: req.file.filename });
  })
);

export { router as formsRouter };
