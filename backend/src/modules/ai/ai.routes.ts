// =============================================================================
// AI assistant — HTTP routes.
//
//   GET    /api/v1/ai/providers          — Ollama / Gemini / Groq status (no keys)
//   POST   /api/v1/ai/assistant           — Form Builder turn (preview / apply)
//   POST   /api/v1/ai/writing             — respondent writing suggestion (authed)
//   POST   /api/v1/ai/analysis            — response analysis for one form
//   POST   /api/v1/ai/ask                 — natural-language question over MIS data
//   POST   /api/v1/ai/attachments         — upload one chat attachment (≤10 MB)
//   POST   /api/v1/ai/predictive          — deterministic forecast for one module
//   GET    /api/v1/ai/predictive/summary  — one insight card per readable module
//   POST   /api/v1/ai/public/writing      — writing suggestion for anonymous fills
//   POST   /api/v1/ai/public/ask          — anonymous landing-page chat (site info only)
//
// The browser only talks to these endpoints; provider selection, API keys and
// all data access stay server-side.
// =============================================================================

import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import path from 'path';
import { z } from 'zod';
import { can } from '../../middleware/permission';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/http';
import { AppError, ForbiddenError } from '../../utils/errors';
import { resolveCapability } from '../../security/permissions';
import { env } from '../../config/env';
import { getForm } from '../forms/forms.service';
import { runAssistant, toFormRef } from './ai.service';
import { AI_INTENTS, AI_MODES, PROVIDER_CHOICES, type AssistantRequest, type ProviderChoice } from './ai.types';
import { AI_LIMITS, formActionSchema, schemaEnvelopeSchema } from './actions';
import { runAnalysis } from './analysis';
import { runAsk } from './ask';
import { ATTACHMENT_MAX_MB, safeName, uploadAttachment } from './attachments';
import { assertRateLimit } from './rate-limit';
import { PUBLIC_ASK_LIMITS, runPublicAsk } from './publicChat';
import { predictiveRequestSchema } from '../predictive/predictive.types';
import { getPredictions, getPredictiveSummary } from '../predictive/predictive.service';
import { providerStatuses } from './providers';
import { WRITING_LIMITS, WRITING_OPERATIONS, runWritingSuggestion } from './writing';

const router = Router();
router.use(requireAuth);

function assertOwnerOrFull(req: any, ownerUserId: number): void {
  if (req.scope?.dataScope === 'own' && Number(ownerUserId) !== req.user.userId) {
    throw new ForbiddenError('You can only manage your own forms');
  }
}

/** Passes when the role holds ANY of the listed capabilities. */
function canAny(...actions: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new ForbiddenError('Authentication required'));
    for (const action of actions) {
      const cap = resolveCapability(action, req.user.role);
      if (cap.allowed) {
        req.scope = { write: cap.write, dataScope: cap.scope };
        return next();
      }
    }
    return next(new ForbiddenError(`Role '${req.user.role}' cannot perform this action`));
  };
}

const assistantSchema = z.object({
  mode: z.enum(AI_MODES),
  provider: z.enum(PROVIDER_CHOICES),
  intent: z.enum(AI_INTENTS),
  message: z.string().max(4000).optional(),
  formId: z.number().int().positive().optional(),
  form: z
    .object({
      id: z.number().int().optional(),
      title: z.string().max(200).optional(),
      description: z.string().max(4000).optional(),
      status: z.string().max(50).optional(),
    })
    .optional(),
  schema: schemaEnvelopeSchema,
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(8000),
      })
    )
    .max(24)
    .optional(),
  actions: z.array(formActionSchema).max(AI_LIMITS.actions).optional(),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const historySchema = z
  .array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().max(8000),
    })
  )
  .max(12)
  .optional();

/** Anonymous landing-page chat — static site knowledge, never MIS data. */
const publicAskSchema = z.object({
  provider: z.enum(PROVIDER_CHOICES).default('auto'),
  question: z.string().min(1).max(PUBLIC_ASK_LIMITS.question),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(PUBLIC_ASK_LIMITS.historyChars),
      })
    )
    .max(PUBLIC_ASK_LIMITS.historyTurns)
    .optional(),
});

/** Respondent writing assistant — question + draft only, never form or MIS data. */
const writingSchema = z.object({
  provider: z.enum(PROVIDER_CHOICES),
  operation: z.enum(WRITING_OPERATIONS),
  text: z.string().min(1).max(WRITING_LIMITS.text),
  question: z.object({
    label: z.string().min(1).max(WRITING_LIMITS.questionLabel),
    description: z.string().max(WRITING_LIMITS.questionHelp).optional(),
    type: z.string().min(1).max(40),
    maxLength: z.number().int().min(1).max(100000).optional(),
  }),
});

const analysisSchema = z.object({
  provider: z.enum(PROVIDER_CHOICES),
  formId: z.number().int().positive(),
  message: z.string().max(4000).optional(),
  filters: z
    .object({
      from: isoDate.optional(),
      to: isoDate.optional(),
    })
    .optional(),
  history: historySchema,
});

/** Global-launcher page context — validated, bounded, advisory only. */
const askContextSchema = z.object({
  module: z.string().min(1).max(40).regex(/^[A-Za-z][A-Za-z0-9_-]*$/, 'Use a simple module id'),
  label: z.string().max(200).optional(),
  recordId: z.number().int().positive().optional(),
  filters: z
    .array(z.object({ k: z.string().min(1).max(40), v: z.string().max(80) }))
    .max(4)
    .optional(),
});

/** One file uploaded via POST /ai/attachments, referenced by id on /ai/ask. */
const attachmentRefSchema = z.object({
  id: z.string().regex(/^ai-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,8}$/i),
  name: z.string().min(1).max(200),
  sizeBytes: z.number().int().positive(),
  mimeType: z.string().max(100),
});

const askSchema = z.object({
  provider: z.enum(PROVIDER_CHOICES),
  question: z.string().min(1).max(1000),
  history: historySchema,
  context: askContextSchema.optional(),
  attachment: attachmentRefSchema.optional(),
});

router.get(
  '/providers',
  can('forms.aiAssistant'),
  asyncHandler(async (_req, res) => {
    const providers = await providerStatuses();
    const defaultProvider: ProviderChoice = env.ai.provider;
    res.json({ providers, default: defaultProvider });
  })
);

router.post(
  '/assistant',
  can('forms.aiAssistant'),
  validate(assistantSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof assistantSchema>;

    let form = body.form;
    if (body.formId !== undefined) {
      const record = await getForm(body.formId);
      assertOwnerOrFull(req, record.OwnerUserID);
      form = toFormRef(record as unknown as Record<string, unknown>);
    }

    const result = await runAssistant({
      request: { ...body, form, schema: body.schema as AssistantRequest['schema'] } as unknown as AssistantRequest,
      access: { userId: req.user!.userId, dataScope: req.scope!.dataScope },
      ipAddress: req.ip,
    });
    res.json(result);
  })
);

// ---------------------------------------------------------------------------
// 1. Respondent writing assistant (authenticated: can respond OR can edit)
// ---------------------------------------------------------------------------
router.post(
  '/writing',
  canAny('forms.respond', 'forms.editResponses'),
  validate(writingSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof writingSchema>;
    const result = await runWritingSuggestion(body, {
      userId: req.user!.userId,
      ipAddress: req.ip,
    });
    res.json(result);
  })
);

// ---------------------------------------------------------------------------
// 2. Response analysis (AI + view-responses capability, then ownership)
// ---------------------------------------------------------------------------
router.post(
  '/analysis',
  can('forms.aiAssistant'),
  can('forms.viewResponses'),
  validate(analysisSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof analysisSchema>;
    const record = await getForm(body.formId);
    assertOwnerOrFull(req, record.OwnerUserID);

    const result = await runAnalysis(
      {
        provider: body.provider,
        formId: body.formId,
        ...(body.message !== undefined ? { message: body.message } : {}),
        ...(body.filters ? { filters: body.filters } : {}),
        ...(body.history ? { history: body.history } : {}),
      },
      { userId: req.user!.userId, dataScope: req.scope!.dataScope },
      req.ip
    );
    res.json(result);
  })
);

// ---------------------------------------------------------------------------
// 3a. Chat attachment upload (text extraction happens on /ask, not here)
// ---------------------------------------------------------------------------
router.post(
  '/attachments',
  can('forms.aiAssistant'),
  asyncHandler(async (req, res) => {
    assertRateLimit(req.user!.userId);
    await new Promise<void>((resolve, reject) => {
      uploadAttachment(req, res, (err: unknown) => (err ? reject(err) : resolve()));
    });
    const file = req.file;
    if (!file) throw new AppError(422, 'UNSUPPORTED_FILE', 'That file type is not supported');

    const ext = path.extname(file.filename).toLowerCase();
    const kind = ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.gif' || ext === '.webp'
      ? 'image'
      : 'document';
    res.json({
      attachmentId: file.filename,
      filename: safeName(file.originalname),
      sizeBytes: file.size,
      mimeType: file.mimetype,
      kind,
      extractable: true,
      maxMb: ATTACHMENT_MAX_MB,
    });
  })
);

// ---------------------------------------------------------------------------
// 3. Domain data intelligence (admin / manager / analyst)
// ---------------------------------------------------------------------------
router.post(
  '/ask',
  can('forms.aiAssistant'),
  validate(askSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof askSchema>;
    const result = await runAsk(
      {
        provider: body.provider,
        question: body.question,
        ...(body.history ? { history: body.history } : {}),
        ...(body.context ? { context: body.context } : {}),
        ...(body.attachment
          ? {
              attachment: {
                id: body.attachment.id,
                name: safeName(body.attachment.name),
                sizeBytes: body.attachment.sizeBytes,
                mimeType: body.attachment.mimeType,
              },
            }
          : {}),
      },
      { userId: req.user!.userId, role: req.user!.role, dataScope: req.scope!.dataScope },
      req.ip
    );
    res.json(result);
  })
);

// ---------------------------------------------------------------------------
// 4. Predictive insights — deterministic forecast, never an LLM number
// ---------------------------------------------------------------------------
router.get(
  '/predictive/summary',
  can('forms.aiAssistant'),
  asyncHandler(async (req, res) => {
    const summary = await getPredictiveSummary({
      userId: req.user!.userId,
      role: req.user!.role,
      dataScope: req.scope!.dataScope,
    });
    res.json(summary);
  })
);

router.post(
  '/predictive',
  can('forms.aiAssistant'),
  validate(predictiveRequestSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof predictiveRequestSchema>;
    const insight = await getPredictions(
      body,
      { userId: req.user!.userId, role: req.user!.role, dataScope: req.scope!.dataScope },
      'endpoint'
    );
    res.json(insight);
  })
);

export { router as aiRouter };

// =============================================================================
// Anonymous surface — mounted BEFORE aiRouter (which requires auth for
// everything else). Only the public writing assistant lives here.
// =============================================================================
const publicRouter = Router();

publicRouter.post(
  '/public/writing',
  validate(writingSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof writingSchema>;
    const result = await runWritingSuggestion(body, { userId: null, ipAddress: req.ip });
    res.json(result);
  })
);

// ---------------------------------------------------------------------------
// Anonymous landing-page chat — no auth, no data: static site knowledge and
// general conversation only (rate-limited per IP).
// ---------------------------------------------------------------------------
publicRouter.post(
  '/public/ask',
  validate(publicAskSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof publicAskSchema>;
    const result = await runPublicAsk(
      {
        provider: body.provider,
        question: body.question,
        ...(body.history ? { history: body.history } : {}),
      },
      req.ip
    );
    res.json(result);
  })
);

export { publicRouter as aiPublicRouter };
