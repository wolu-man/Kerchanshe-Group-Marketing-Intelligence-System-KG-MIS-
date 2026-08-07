import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/http';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { writeAudit } from '../../db/audit';
import { notifyEvent } from '../notifications/notifications.service';
import { ROLES } from '../../types';
import {
  cloneSurvey,
  createSurvey,
  deleteSurvey,
  getSurvey,
  listResponses,
  listSurveys,
  publishSurvey,
  submitResponse,
  updateSurvey,
} from './surveys.service';

const router = Router();

const listQuerySchema = z.object({ status: z.string().optional() });
const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

const logicRuleSchema = z
  .object({
    dependsOnQuestionId: z.coerce.number().int().positive(),
    operator: z.enum(['eq', 'neq', 'gt', 'lt', 'gte', 'lte']),
    value: z.union([z.string(), z.number()]),
  })
  .nullable();

const questionSchema = z.object({
  questionType: z.enum(['SingleChoice', 'MultiChoice', 'Text', 'Numeric', 'Rating']),
  questionText: z.string().min(1).max(1000),
  options: z.array(z.string()).optional(),
  logicRule: logicRuleSchema,
  isRequired: z.boolean().optional(),
  minValue: z.coerce.number().optional(),
  maxValue: z.coerce.number().optional(),
  sortOrder: z.coerce.number().optional(),
});

const createBodySchema = z.object({
  title: z.string().min(1).max(200),
  businessUnit: z.string().min(1).max(100),
  questions: z.array(questionSchema).min(1),
});

const updateBodySchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    businessUnit: z.string().min(1).max(100).optional(),
    questions: z.array(questionSchema).min(1).optional(),
  })
  .refine((v) => v.title || v.businessUnit || v.questions, 'Nothing to update');

const responseBodySchema = z.object({
  outletId: z.coerce.number().int().positive().optional(),
  respondentType: z.string().max(50).optional(),
  answers: z.array(
    z.object({ questionId: z.coerce.number().int().positive(), answerValue: z.string().min(1).max(100000) }),
  ),
});

const BUILDERS = [ROLES.MARKETING_ANALYST, ROLES.MARKETING_MANAGER, ROLES.ADMINISTRATOR];
const PUBLISHERS = [ROLES.MARKETING_MANAGER, ROLES.ADMINISTRATOR];

/** List surveys. */
router.get(
  '/',
  requireAuth,
  validate({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await listSurveys(req.query.status as string | undefined));
  }),
);

/** Create a survey (Draft). */
router.post(
  '/',
  requireAuth,
  requireRole(...BUILDERS),
  validate({ body: createBodySchema }),
  asyncHandler(async (req, res) => {
    const survey = await createSurvey(req.user!.userId, req.body);
    await writeAudit({
      userId: req.user!.userId,
      action: 'CREATE_SURVEY',
      entity: 'Survey',
      entityId: survey.SurveyID,
    });
    res.status(201).json(survey);
  }),
);

/** Get a single survey with its questions. */
router.get(
  '/:id',
  requireAuth,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await getSurvey(Number(req.params.id)));
  }),
);

/** Update a survey (Draft only). */
router.put(
  '/:id',
  requireAuth,
  requireRole(...BUILDERS),
  validate({ params: idParamSchema, body: updateBodySchema }),
  asyncHandler(async (req, res) => {
    const survey = await updateSurvey(Number(req.params.id), req.user!.userId, req.user!.role, req.body);
    await writeAudit({
      userId: req.user!.userId,
      action: 'UPDATE_SURVEY',
      entity: 'Survey',
      entityId: survey.SurveyID,
    });
    res.json(survey);
  }),
);

/** Delete a survey (Draft only). */
router.delete(
  '/:id',
  requireAuth,
  requireRole(...BUILDERS),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await deleteSurvey(Number(req.params.id), req.user!.userId, req.user!.role);
    await writeAudit({
      userId: req.user!.userId,
      action: 'DELETE_SURVEY',
      entity: 'Survey',
      entityId: Number(req.params.id),
    });
    res.status(204).end();
  }),
);

/** Publish a survey (Marketing Manager / Administrator only). */
router.post(
  '/:id/publish',
  requireAuth,
  requireRole(...PUBLISHERS),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const survey = await publishSurvey(Number(req.params.id));
    await writeAudit({
      userId: req.user!.userId,
      action: 'PUBLISH_SURVEY',
      entity: 'Survey',
      entityId: survey.SurveyID,
    });
    await notifyEvent('SurveyPublished', {
      subject: `Survey published: ${survey.Title}`,
      message: `The survey "${survey.Title}" (${survey.BusinessUnit}) is now available to respond to.`,
    });
    res.json(survey);
  }),
);

/** Duplicate an existing survey as a starting template. */
router.post(
  '/:id/clone',
  requireAuth,
  requireRole(...BUILDERS),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const survey = await cloneSurvey(Number(req.params.id), req.user!.userId);
    await writeAudit({
      userId: req.user!.userId,
      action: 'CLONE_SURVEY',
      entity: 'Survey',
      entityId: survey.SurveyID,
    });
    res.status(201).json(survey);
  }),
);

/** Submit a response to a published survey. */
router.post(
  '/:id/responses',
  requireAuth,
  requireRole(ROLES.FIELD_OFFICER, ROLES.MARKETING_MANAGER, ROLES.MARKETING_ANALYST, ROLES.ADMINISTRATOR),
  validate({ params: idParamSchema, body: responseBodySchema }),
  asyncHandler(async (req, res) => {
    const result = await submitResponse(req.user!.userId, { surveyId: Number(req.params.id), ...req.body });
    await writeAudit({
      userId: req.user!.userId,
      action: 'SUBMIT_SURVEY_RESPONSE',
      entity: 'SurveyResponse',
      entityId: result.responseId,
    });
    res.status(201).json(result);
  }),
);

/** List responses to a survey. */
router.get(
  '/:id/responses',
  requireAuth,
  requireRole(ROLES.MARKETING_ANALYST, ROLES.MARKETING_MANAGER, ROLES.ADMINISTRATOR),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await listResponses(Number(req.params.id)));
  }),
);

export default router;
