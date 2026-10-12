// =============================================================================
// AI Form Assistant — application service.
//
// Orchestrates: rate limit → prompt assembly → provider call → action
// application (per-action validation) → preview → conversation persistence.
// The database schema is never written here: `resultSchema` is returned to the
// client, which commits it through the existing Form Builder undo/autosave
// pipeline (POST /forms/:id/versions). Only DB-level actions (child forms) are
// executed, and only in apply mode after explicit confirmation.
// =============================================================================

import sql from 'mssql';
import { db } from '../../db/pool';
import { audit } from '../../db/audit';
import { logger } from '../../config/logger';
import { AppError, BadRequestError, ValidationError } from '../../utils/errors';
import type { DataScope } from '../../utils/scope';
import { getForm, createForm, updateFormMeta } from '../forms/forms.service';
import type {
  AssistantRequest,
  AssistantResponse,
  ChatTurn,
  DbActionResult,
  FormRef,
} from './ai.types';
import {
  applyFormActions,
  buildPreview,
  isDbAction,
  requiresConfirmation,
  type SchemaEnvelope,
} from './actions';
import { toAppError } from './errors';
import { orchestrate } from './orchestrator';
import { assertRateLimit } from './rate-limit';
import { ProviderError } from './providers';
import { buildFormContext } from './systemPrompt';

const HISTORY_TURNS = 12;
const HISTORY_MAX_CHARS = 4000;
const MESSAGE_MAX_CHARS = 8000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function normalizeSchema(input: SchemaEnvelope): SchemaEnvelope {
  return {
    schemaVersion: input.schemaVersion ?? 2,
    pages: input.pages && input.pages.length > 0 ? input.pages : [{ id: 'page-1', title: 'Page 1' }],
    elements: input.elements ?? [],
    ...(input.branding ? { branding: input.branding } : {}),
  };
}

function sameSchema(a: SchemaEnvelope, b: SchemaEnvelope): boolean {
  return (
    JSON.stringify([a.pages, a.elements, a.branding ?? null]) ===
    JSON.stringify([b.pages, b.elements, b.branding ?? null])
  );
}

function buildMessages(request: AssistantRequest, schema: SchemaEnvelope): ChatTurn[] {
  const history = (request.history ?? [])
    .filter((t) => t && typeof t.content === 'string' && t.content.trim().length > 0)
    .slice(-HISTORY_TURNS)
    .map((t) => ({
      role: t.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: t.content.slice(0, HISTORY_MAX_CHARS),
    }));

  const context = buildFormContext({ form: request.form, schema, intent: request.intent });
  const prompt = [
    context,
    '---',
    `USER REQUEST (mode: ${request.mode}):\n${(request.message ?? '').trim()}`,
  ].join('\n');

  return [...history, { role: 'user', content: prompt.slice(0, 60000) }];
}

/** Best-effort chat history row — never fails the request (see catch below). */
export async function persistTurn(entry: {
  userId: number;
  formId?: number;
  role: 'user' | 'assistant';
  provider?: string | null;
  model?: string | null;
  message: string;
  actions?: unknown;
  durationMs?: number;
  success?: boolean;
  errorCategory?: string | null;
}): Promise<void> {
  try {
    await db
      .request()
      .input('UserID', sql.Int, entry.userId)
      .input('TemplateID', sql.Int, entry.formId ?? null)
      .input('Role', sql.VarChar(10), entry.role)
      .input('Provider', sql.VarChar(20), entry.provider ?? null)
      .input('Model', sql.VarChar(100), entry.model ?? null)
      .input('Message', sql.NVarChar(sql.MAX), entry.message.slice(0, MESSAGE_MAX_CHARS))
      .input('ActionsJSON', sql.NVarChar(sql.MAX), entry.actions ? JSON.stringify(entry.actions).slice(0, 20000) : null)
      .input('DurationMs', sql.Int, entry.durationMs ?? null)
      .input('Success', sql.Bit, entry.success ?? true)
      .input('ErrorCategory', sql.VarChar(40), entry.errorCategory ?? null)
      .query(
        `INSERT INTO dbo.AiConversation
           (UserID, TemplateID, Role, Provider, Model, Message, ActionsJSON, DurationMs, Success, ErrorCategory)
         VALUES (@UserID, @TemplateID, @Role, @Provider, @Model, @Message, @ActionsJSON, @DurationMs, @Success, @ErrorCategory)`
      );
  } catch (err) {
    // Conversation history is best-effort — never fail the request because of it.
    logger.warn('ai.conversation.persist_failed', { role: entry.role, error: (err as Error).message });
  }
}

function assertOwnerOrFull(dataScope: DataScope, ownerUserId: number, userId: number): void {
  if (dataScope === 'own' && ownerUserId !== userId) {
    throw new AppError(403, 'FORBIDDEN', 'You can only manage your own forms');
  }
}

/** Runs the DB-level actions (child form creation / linking). */
async function executeDbActions(
  dbActions: ReturnType<typeof applyFormActions>['dbActions'],
  access: { userId: number; dataScope: DataScope },
  formId?: number
): Promise<DbActionResult[]> {
  const executed: DbActionResult[] = [];
  if (dbActions.length === 0) return executed;
  if (!formId) {
    throw new BadRequestError('Save the form first, then try this change again', 'FORM_REQUIRED');
  }

  const parent = await getForm(formId);
  assertOwnerOrFull(access.dataScope, parent.OwnerUserID, access.userId);

  for (const action of dbActions) {
    if (action.type === 'CREATE_CHILD_FORM') {
      const templateId = await createForm({
        ownerUserId: access.userId,
        title: action.title,
        description: action.description,
        parentTemplateId: formId,
      });
      executed.push({ type: action.type, summary: `Created child form "${action.title}"`, templateId });
    } else if (action.type === 'LINK_CHILD_FORM') {
      const target = await getForm(action.templateId);
      await updateFormMeta(formId, { linkedFormTemplateId: target.TemplateID });
      executed.push({ type: action.type, summary: `Linked follow-up form "${target.Title}"`, templateId: target.TemplateID });
    }
  }

  await audit({
    userId: access.userId,
    action: 'AI_ASSISTANT_APPLIED',
    entity: 'FormTemplate',
    entityId: formId,
    detail: { executed: executed.map((e) => e.type) },
  });

  return executed;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export interface RunInput {
  request: AssistantRequest;
  access: { userId: number; dataScope: DataScope };
  ipAddress?: string | null;
}

export async function runAssistant({ request, access, ipAddress }: RunInput): Promise<AssistantResponse> {
  const started = Date.now();
  assertRateLimit(access.userId);

  const before = normalizeSchema(request.schema);

  try {
    if (request.mode === 'apply') return await applyConfirmed(request, access, before, started, ipAddress);
    return await previewChanges(request, access, before, started, ipAddress);
  } catch (err) {
    const appError = toAppError(err);
    await persistTurn({
      userId: access.userId,
      formId: request.formId,
      role: 'assistant',
      message: request.message ?? '',
      success: false,
      errorCategory:
        err instanceof ProviderError
          ? err.category
          : appError.statusCode >= 500
            ? 'internal'
            : 'invalid-action',
    });
    throw appError;
  }
}

async function previewChanges(
  request: AssistantRequest,
  access: { userId: number; dataScope: DataScope },
  before: SchemaEnvelope,
  started: number,
  ipAddress?: string | null
): Promise<AssistantResponse> {
  await persistTurn({
    userId: access.userId,
    formId: request.formId,
    role: 'user',
    message: request.message ?? '(form context)',
  });

  const result = await orchestrate({
    provider: request.provider,
    intent: request.intent,
    messages: buildMessages(request, before),
  });

  const applied = applyFormActions(before, result.response.actions);
  const preview = buildPreview(before, applied.schema, result.response.actions, applied.rejected);
  const warnings = [...applied.warnings];
  const schemaChanged =
    applied.applied.some((a) => !isDbAction(a.type) && a.type !== 'ANALYZE_FORM') &&
    !sameSchema(before, applied.schema);

  await persistTurn({
    userId: access.userId,
    formId: request.formId,
    role: 'assistant',
    provider: result.provider,
    model: result.model,
    message: result.response.reply,
    actions: result.response.actions,
    durationMs: Date.now() - started,
    success: true,
  });

  await audit({
    userId: access.userId,
    action: 'AI_ASSISTANT_PREVIEWED',
    entity: 'FormTemplate',
    entityId: request.formId ?? null,
    detail: { provider: result.provider, model: result.model, actions: result.response.actions.length },
    ipAddress: ipAddress ?? null,
  });

  return {
    mode: 'preview',
    provider: result.provider,
    model: result.model,
    reply: result.response.reply,
    actions: result.response.actions,
    preview,
    requiresConfirmation: requiresConfirmation(result.response.actions, applied.rejected, warnings),
    warnings,
    rejected: applied.rejected,
    dbActions: applied.dbActions,
    executed: [],
    resultSchema: applied.schema,
    durationMs: Date.now() - started,
    schemaChanged,
  };
}

async function applyConfirmed(
  request: AssistantRequest,
  access: { userId: number; dataScope: DataScope },
  before: SchemaEnvelope,
  started: number,
  ipAddress?: string | null
): Promise<AssistantResponse> {
  const actions = request.actions ?? [];
  if (actions.length === 0) {
    throw new BadRequestError('No confirmed actions were sent for apply mode', 'NO_ACTIONS');
  }

  const applied = applyFormActions(before, actions);
  if (applied.rejected.length > 0) {
    throw new ValidationError(
      'Some confirmed actions could no longer be applied to this form',
      applied.rejected
    );
  }

  const executed = await executeDbActions(applied.dbActions, access, request.formId);
  const preview = buildPreview(before, applied.schema, actions, []);
  const schemaChanged =
    applied.applied.some((a) => !isDbAction(a.type) && a.type !== 'ANALYZE_FORM') &&
    !sameSchema(before, applied.schema);

  if (schemaChanged) {
    await audit({
      userId: access.userId,
      action: 'AI_ASSISTANT_APPLIED',
      entity: 'FormTemplate',
      entityId: request.formId ?? null,
      detail: { actions: applied.applied.map((a) => a.type) },
      ipAddress: ipAddress ?? null,
    });
  }

  return {
    mode: 'apply',
    provider: null,
    model: null,
    reply: '',
    actions,
    preview,
    requiresConfirmation: false,
    warnings: applied.warnings,
    rejected: [],
    dbActions: applied.dbActions,
    executed,
    resultSchema: applied.schema,
    durationMs: Date.now() - started,
    schemaChanged,
  };
}

/** Form identity for the prompt/status payload — never exposes other columns. */
export function toFormRef(form: Record<string, unknown>): FormRef {
  return {
    id: Number(form.TemplateID),
    title: String(form.Title ?? ''),
    ...(form.Description ? { description: String(form.Description) } : {}),
    ...(form.Status ? { status: String(form.Status) } : {}),
  };
}
