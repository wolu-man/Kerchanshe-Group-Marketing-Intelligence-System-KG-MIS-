import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { can } from '../../middleware/permission';
import { validate } from '../../middleware/validate';
import { asyncHandler, parsePagination } from '../../utils/http';
import { audit } from '../../db/audit';
import { ForbiddenError } from '../../utils/errors';
import { formUpload } from '../forms/upload';
import {
  approveInterview,
  createInterview,
  getInterview,
  listInterviews,
  rejectInterview,
  reviewInterview,
  submitInterview,
  updateInterview,
} from './interviews.service';

function logAudit(req: Request, entry: { userId: number | null; action: string; entity: string; entityId?: number | null; detail?: Record<string, unknown> | null }) {
  return audit({ ...entry, ipAddress: req.ip });
}

const router = Router();
router.use(requireAuth);

const respondentTypes = ['Customer', 'Distributor', 'Retailer', 'Agent', 'Other'];

const createSchema = z.object({
  businessGroupId: z.number().int().positive(),
  regionId: z.number().int().positive(),
  outletId: z.number().int().positive().optional().nullable(),
  interviewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'interviewDate must be YYYY-MM-DD'),
  respondentType: z.enum(respondentTypes as [string, ...string[]]),
  respondentName: z.string().min(1).max(150),
  satisfactionScore: z.number().int().min(1).max(5).optional().nullable(),
  sentiment: z.string().max(50).optional().nullable(),
  keyFeedback: z.string().max(10000).optional().nullable(),
  photoVideoRef: z.string().max(1000).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  capturedLat: z.number().min(-90).max(90).optional().nullable(),
  capturedLng: z.number().min(-180).max(180).optional().nullable(),
  qas: z.array(z.object({
    question: z.string().min(1),
    answer: z.string().optional().nullable(),
  })).optional(),
});

const updateSchema = createSchema.partial();

function assertOwnOrFull(req: any, ownerId: number): void {
  if (req.scope?.dataScope === 'own' && ownerId !== req.user.userId) {
    throw new ForbiddenError('You can only modify your own interviews');
  }
}

router.get(
  '/',
  can('interviews.view'),
  asyncHandler(async (req, res) => {
    const q = req.query;
    const { page, pageSize } = parsePagination(req);
    const result = await listInterviews({
      regionId: q.regionId ? Number(q.regionId) : undefined,
      outletId: q.outletId ? Number(q.outletId) : undefined,
      businessGroupId: q.businessGroupId ? Number(q.businessGroupId) : undefined,
      respondentType: q.respondentType as string | undefined,
      status: q.status as string | undefined,
      fromDate: q.fromDate as string | undefined,
      toDate: q.toDate as string | undefined,
      dataScope: req.scope!.dataScope,
      userId: req.user!.userId,
      page,
      pageSize,
    });
    res.json(result);
  })
);

router.get(
  '/:id',
  can('interviews.view'),
  asyncHandler(async (req, res) => {
    const interview = await getInterview(Number(req.params.id));
    assertOwnOrFull(req, interview.UserID);
    res.json(interview);
  })
);

router.post(
  '/',
  can('interviews.create'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const interviewId = await createInterview({ userId: req.user!.userId, ...req.body });
    await logAudit(req,{ userId: req.user!.userId, action: 'CREATE', entity: 'Interview', entityId: interviewId });
    res.status(201).json({ interviewId });
  })
);

router.put(
  '/:id',
  can('interviews.update'),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const interview = await getInterview(Number(req.params.id));
    assertOwnOrFull(req, interview.UserID);
    await updateInterview(Number(req.params.id), req.body);
    await logAudit(req,{ userId: req.user!.userId, action: 'UPDATE', entity: 'Interview', entityId: interview.InterviewID });
    res.json({ ok: true });
  })
);

router.post(
  '/:id/submit',
  can('interviews.submit'),
  asyncHandler(async (req, res) => {
    const interview = await getInterview(Number(req.params.id));
    assertOwnOrFull(req, interview.UserID);
    await submitInterview(interview.InterviewID);
    await logAudit(req,{ userId: req.user!.userId, action: 'SUBMIT', entity: 'Interview', entityId: interview.InterviewID });
    res.json({ ok: true });
  })
);

router.post(
  '/:id/review',
  can('interviews.review'),
  asyncHandler(async (req, res) => {
    const interviewId = Number(req.params.id);
    await reviewInterview(interviewId, req.user!.userId);
    await logAudit(req,{ userId: req.user!.userId, action: 'REVIEW', entity: 'Interview', entityId: interviewId });
    res.json({ ok: true });
  })
);

router.post(
  '/:id/approve',
  can('interviews.approve'),
  asyncHandler(async (req, res) => {
    const interviewId = Number(req.params.id);
    await approveInterview(interviewId, req.user!.userId);
    await logAudit(req,{ userId: req.user!.userId, action: 'APPROVE', entity: 'Interview', entityId: interviewId });
    res.json({ ok: true });
  })
);

router.post(
  '/:id/reject',
  can('interviews.reject'),
  validate(z.object({ reason: z.string().min(1, 'Rejection reason is required') })),
  asyncHandler(async (req, res) => {
    const interviewId = Number(req.params.id);
    await rejectInterview(interviewId, req.user!.userId, req.body.reason);
    await logAudit(req,{ userId: req.user!.userId, action: 'REJECT', entity: 'Interview', entityId: interviewId, detail: { reason: req.body.reason } });
    res.json({ ok: true });
  })
);

router.get(
  '/meta/respondent-types',
  asyncHandler(async (_req, res) => {
    res.json({ items: respondentTypes });
  })
);

router.post(
  '/:id/photo',
  can('interviews.update'),
  formUpload.single('file'),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) { res.status(400).json({ error: 'No file uploaded' }); return; }
    const interviewId = Number(req.params.id);
    const interview = await getInterview(interviewId);
    assertOwnOrFull(req, interview.UserID);
    const storageUrl = `/uploads/${file.filename}`;
    await updateInterview(interviewId, { photoVideoRef: storageUrl } as any);
    await logAudit(req,{ userId: req.user!.userId, action: 'UPDATE', entity: 'Interview', entityId: interviewId, detail: { field: 'PhotoVideoRef', value: storageUrl } });
    res.status(201).json({ storageUrl });
  })
);

export { router as interviewsRouter };
