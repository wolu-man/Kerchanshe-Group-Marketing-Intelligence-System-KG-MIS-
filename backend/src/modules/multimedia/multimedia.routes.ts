import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { can } from '../../middleware/permission';
import { asyncHandler } from '../../utils/http';
import { audit } from '../../db/audit';
import { ForbiddenError, BadRequestError } from '../../utils/errors';
import { formUpload } from '../forms/upload';
import {
  deleteMedia,
  getMedia,
  listMedia,
  registerMedia,
  updateTranscription,
  validateMedia,
} from './multimedia.service';

function logAudit(req: Request, entry: { userId: number | null; action: string; entity: string; entityId?: number | null; detail?: Record<string, unknown> | null }) {
  return audit({ ...entry, ipAddress: req.ip });
}

const router = Router();
router.use(requireAuth);

const metadataSchema = z.object({
  captureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'captureDate must be YYYY-MM-DD'),
  capturedAt: z.string().optional().nullable(),
  businessGroupId: z.number().int().positive().optional().nullable(),
  regionId: z.number().int().positive().optional().nullable(),
  outletId: z.number().int().positive().optional().nullable(),
  relatedModule: z.string().max(50).optional().nullable(),
  relatedRecordId: z.number().int().positive().optional().nullable(),
  mediaType: z.enum(['Photo', 'Video', 'Audio']),
  tag: z.string().max(100).optional().nullable(),
  transcriptionRequired: z.boolean().optional(),
  capturedLat: z.number().min(-90).max(90).optional().nullable(),
  capturedLng: z.number().min(-180).max(180).optional().nullable(),
  notes: z.string().max(10000).optional().nullable(),
});

function assertOwnOrFull(req: any, ownerId: number): void {
  if (req.scope?.dataScope === 'own' && ownerId !== req.user.userId) {
    throw new ForbiddenError('You can only modify your own media');
  }
}

router.get(
  '/',
  can('multimedia.view'),
  asyncHandler(async (req, res) => {
    const q = req.query;
    const result = await listMedia({
      relatedModule: q.relatedModule as string | undefined,
      relatedRecordId: q.relatedRecordId ? Number(q.relatedRecordId) : undefined,
      mediaType: q.mediaType as string | undefined,
      validationStatus: q.validationStatus as string | undefined,
      regionId: q.regionId ? Number(q.regionId) : undefined,
      businessGroupId: q.businessGroupId ? Number(q.businessGroupId) : undefined,
      fromDate: q.fromDate as string | undefined,
      toDate: q.toDate as string | undefined,
      dataScope: req.scope!.dataScope,
      userId: req.user!.userId,
    });
    res.json(result);
  })
);

router.get(
  '/:id',
  can('multimedia.view'),
  asyncHandler(async (req, res) => {
    const media = await getMedia(Number(req.params.id));
    assertOwnOrFull(req, media.CapturedBy);
    res.json(media);
  })
);

router.post(
  '/',
  can('multimedia.upload'),
  formUpload.single('file'),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw new BadRequestError('No file uploaded');
    const rawBody = { ...req.body, mediaType: req.body.mediaType };
    const parseBusinessGroupId = rawBody.businessGroupId != null ? Number(rawBody.businessGroupId) : undefined;
    const parseRegionId = rawBody.regionId != null ? Number(rawBody.regionId) : undefined;
    const parseOutletId = rawBody.outletId != null ? Number(rawBody.outletId) : undefined;
    const parseRelatedRecordId = rawBody.relatedRecordId != null ? Number(rawBody.relatedRecordId) : undefined;
    const parseCapturedLat = rawBody.capturedLat != null ? Number(rawBody.capturedLat) : undefined;
    const parseCapturedLng = rawBody.capturedLng != null ? Number(rawBody.capturedLng) : undefined;
    const parsed = metadataSchema.parse({
      ...rawBody,
      businessGroupId: typeof parseBusinessGroupId === 'number' && !isNaN(parseBusinessGroupId) ? parseBusinessGroupId : undefined,
      regionId: typeof parseRegionId === 'number' && !isNaN(parseRegionId) ? parseRegionId : undefined,
      outletId: typeof parseOutletId === 'number' && !isNaN(parseOutletId) ? parseOutletId : undefined,
      relatedRecordId: typeof parseRelatedRecordId === 'number' && !isNaN(parseRelatedRecordId) ? parseRelatedRecordId : undefined,
      transcriptionRequired: rawBody.transcriptionRequired === 'true' || rawBody.transcriptionRequired === true,
      capturedLat: typeof parseCapturedLat === 'number' && !isNaN(parseCapturedLat) ? parseCapturedLat : undefined,
      capturedLng: typeof parseCapturedLng === 'number' && !isNaN(parseCapturedLng) ? parseCapturedLng : undefined,
    });
    const mediaId = await registerMedia({ ...parsed, capturedBy: req.user!.userId }, {
      originalname: file.originalname,
      filename: file.filename,
      size: file.size,
      mimetype: file.mimetype,
    });
    await logAudit(req,{
      userId: req.user!.userId,
      action: 'UPLOAD',
      entity: 'MultimediaAsset',
      entityId: mediaId,
      detail: { mediaType: parsed.mediaType, size: file.size, module: parsed.relatedModule },
    });
    res.status(201).json({ mediaId, storageUrl: `/uploads/${file.filename}` });
  })
);

router.patch(
  '/:id/validate',
  can('multimedia.validate'),
  asyncHandler(async (req, res) => {
    const status = z.enum(['Validated', 'Rejected']).parse(req.body.status);
    await validateMedia(Number(req.params.id), status);
    await logAudit(req,{ userId: req.user!.userId, action: 'VALIDATE_MEDIA', entity: 'MultimediaAsset', entityId: Number(req.params.id), detail: { status } });
    res.json({ ok: true });
  })
);

router.patch(
  '/:id/transcription',
  can('multimedia.update'),
  asyncHandler(async (req, res) => {
    const media = await getMedia(Number(req.params.id));
    assertOwnOrFull(req, media.CapturedBy);
    const { transcription, transcriptionRequired } = z.object({
      transcription: z.string().max(100000).optional(),
      transcriptionRequired: z.boolean().optional(),
    }).parse(req.body);
    await updateTranscription(Number(req.params.id), transcription ?? '', transcriptionRequired ?? false);
    res.json({ ok: true });
  })
);

router.delete(
  '/:id',
  can('multimedia.update'),
  asyncHandler(async (req, res) => {
    const media = await getMedia(Number(req.params.id));
    assertOwnOrFull(req, media.CapturedBy);
    await deleteMedia(Number(req.params.id));
    await logAudit(req,{ userId: req.user!.userId, action: 'DELETE', entity: 'MultimediaAsset', entityId: Number(req.params.id) });
    res.json({ ok: true });
  })
);

export { router as multimediaRouter };
