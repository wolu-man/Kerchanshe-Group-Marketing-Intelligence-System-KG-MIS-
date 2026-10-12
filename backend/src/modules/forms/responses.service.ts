import sql from 'mssql';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '../../db/pool';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
  ValidationError,
} from '../../utils/errors';
import { getForm, getPublishedVersion } from './forms.service';
import {
  validateResponse,
  parseSchema,
  computeCalculatedValues,
  computeScore,
  sanitizeRichText,
  type Answers,
  type FormElement,
} from './formSchema';
import { dispatchEvent } from '../notifications/notifications.service';
import { audit } from '../../db/audit';
import { detectAnomalies } from './anomaly.service';

export interface FileRef {
  fileKey: string;
  originalName: string;
  sizeBytes: number;
  mimeType?: string;
}

export interface SubmitOptions {
  templateId: number;
  respondentUserId?: number;
  respondentEmail?: string;
  consentGiven?: boolean;
  password?: string;
  answers: Answers;
  files?: Record<string, FileRef[]>;
  ip?: string;
}

export interface AccessCheck {
  allowed: boolean;
  requiresPassword: boolean;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Access-rule enforcement (FR-01.6, FR-01.16): evaluated before display.
// ---------------------------------------------------------------------------
export async function resolveAccess(
  template: any,
  opts: { userId?: number; email?: string; role?: string; password?: string }
): Promise<AccessCheck> {
  if (template.Status !== 'Published') return { allowed: false, requiresPassword: false, reason: 'Form is not published' };
  const now = Date.now();
  if (template.ExpireAt && new Date(template.ExpireAt).getTime() < now) {
    return { allowed: false, requiresPassword: false, reason: 'Form has expired' };
  }
  if (template.PublishAt && new Date(template.PublishAt).getTime() > now) {
    return { allowed: false, requiresPassword: false, reason: 'Form is not yet open' };
  }
  if (template.MaxResponses && template.ResponseCount >= template.MaxResponses) {
    return { allowed: false, requiresPassword: false, reason: 'Form has reached its response limit' };
  }

  const email = (opts.email ?? '').trim().toLowerCase();
  switch (template.AccessMode) {
    case 'Public':
      return { allowed: true, requiresPassword: false };
    case 'Invite': {
      if (!email) return { allowed: false, requiresPassword: false, reason: 'Invite-only form' };
      const invite = await db
        .request()
        .input('TemplateId', sql.Int, template.TemplateID)
        .input('Email', sql.NVarChar(200), email)
        .query(`SELECT Status FROM dbo.FormInvite WHERE TemplateID = @TemplateId AND Email = @Email`);
      const row = invite.recordset[0];
      return row && row.Status !== 'Revoked'
        ? { allowed: true, requiresPassword: false }
        : { allowed: false, requiresPassword: false, reason: 'You are not invited to this form' };
    }
    case 'Domain': {
      const rule = await db
        .request()
        .input('TemplateId', sql.Int, template.TemplateID)
        .query(`SELECT ConfigJSON FROM dbo.FormAccessRule WHERE TemplateID = @TemplateId AND Mode = 'Domain'`);
      if (rule.recordset.length === 0) return { allowed: false, requiresPassword: false, reason: 'Domain restriction not configured' };
      const config = JSON.parse(rule.recordset[0].ConfigJSON ?? '{}');
      const domain = email.split('@')[1];
      return config.domains?.includes(domain)
        ? { allowed: true, requiresPassword: false }
        : { allowed: false, requiresPassword: false, reason: 'Your domain is not allowed' };
    }
    case 'Group': {
      const rule = await db
        .request()
        .input('TemplateId', sql.Int, template.TemplateID)
        .query(`SELECT ConfigJSON FROM dbo.FormAccessRule WHERE TemplateID = @TemplateId AND Mode = 'Group'`);
      const config = JSON.parse(rule.recordset[0]?.ConfigJSON ?? '{}');
      return config.roles?.includes(opts.role)
        ? { allowed: true, requiresPassword: false }
        : { allowed: false, requiresPassword: false, reason: 'Your group is not allowed' };
    }
    case 'Password': {
      const rule = await db
        .request()
        .input('TemplateId', sql.Int, template.TemplateID)
        .query(`SELECT ConfigJSON FROM dbo.FormAccessRule WHERE TemplateID = @TemplateId AND Mode = 'Password'`);
      const config = JSON.parse(rule.recordset[0]?.ConfigJSON ?? '{}');
      if (!opts.password) return { allowed: false, requiresPassword: true, reason: 'This form is password protected' };
      const ok = await bcrypt.compare(opts.password, config.passwordHash ?? '');
      return ok ? { allowed: true, requiresPassword: false } : { allowed: false, requiresPassword: false, reason: 'Incorrect password' };
    }
    default:
      return { allowed: false, requiresPassword: false, reason: 'Access rule not recognized' };
  }
}

// ---------------------------------------------------------------------------
// Rate limiting (FR-01.16): per form, per IP, per hour (in-memory).
// ---------------------------------------------------------------------------
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT = 20;
const buckets = new Map<string, { count: number; resetAt: number }>();

export function isRateLimited(formId: number, ip?: string): boolean {
  const key = `${formId}:${ip ?? 'anon'}`;
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  bucket.count++;
  if (bucket.count > RATE_LIMIT) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Submission (FR-01.2/01.8/01.15/01.16, re-validated server-side per TDS 5)
// ---------------------------------------------------------------------------
/** Writes the answer set for a response (deletes + re-inserts atomically). */
async function writeAnswers(responseId: number, answers: Answers): Promise<void> {
  await db.request().input('ResponseId', sql.Int, responseId).query('DELETE FROM dbo.ResponseAnswer WHERE ResponseID = @ResponseId');
  for (const [key, value] of Object.entries(answers)) {
    await db
      .request()
      .input('ResponseId', sql.Int, responseId)
      .input('FieldKey', sql.VarChar(100), key)
      .input('Value', sql.NVarChar(sql.MAX), JSON.stringify(value))
      .query(
        `INSERT INTO dbo.ResponseAnswer (ResponseID, FieldKey, ValueJSON)
         VALUES (@ResponseId, @FieldKey, @Value)`
      );
  }
}

/** Registers uploaded files (FormFile) for file/image/signature fields. */
async function writeFiles(responseId: number, files: Record<string, FileRef[]>): Promise<void> {
  for (const [fieldKey, refs] of Object.entries(files)) {
    for (const ref of refs) {
      await db
        .request()
        .input('ResponseId', sql.Int, responseId)
        .input('FieldKey', sql.VarChar(100), fieldKey)
        .input('Name', sql.NVarChar(255), ref.originalName)
        .input('StorageUrl', sql.NVarChar(500), `${ref.fileKey}`)
        .input('Size', sql.BigInt, ref.sizeBytes)
        .input('Mime', sql.VarChar(100), ref.mimeType ?? null)
        .query(
          `INSERT INTO dbo.FormFile (ResponseID, FieldKey, OriginalName, StorageURL, SizeBytes, MimeType, ScanStatus)
           VALUES (@ResponseId, @FieldKey, @Name, @StorageUrl, @Size, @Mime, 'Pending')`
        );
    }
  }
}

/** Records the consent acceptance for a response (SC-11). */
async function recordConsent(responseId: number, version: number | null): Promise<void> {
  if (version === null) return;
  await db.request().input('ResponseId', sql.Int, responseId).input('Version', sql.Int, version).query(
    `UPDATE dbo.FormResponse SET ConsentVersion = @Version WHERE ResponseID = @ResponseId`
  );
}

/**
 * Submits a response (FR-01.2/01.8/01.15/01.16, re-validated server-side).
 * Phase 2: envelope-aware, calculates computed fields, sanitizes rich text,
 * records consent version, computes score, detects anomalies, and promotes a
 * save&resume draft into a submitted response when one exists.
 */
export async function submitResponse(opts: SubmitOptions): Promise<{ responseId: number; linkedFormTemplateId: number | null; totalScore?: number | null; scoreMax?: number | null }> {
  const template = await getForm(opts.templateId);
  if (template.Status !== 'Published') {
    throw new BadRequestError('Form is not open for responses', 'FORM_NOT_PUBLISHED');
  }

  if (template.GDPRConsentRequired && !opts.consentGiven) {
    throw new BadRequestError('Consent is required to submit this form', 'CONSENT_REQUIRED');
  }

  const access = await resolveAccess(template, {
    userId: opts.respondentUserId,
    email: opts.respondentEmail,
    password: opts.password,
  });
  // Access gate for logged-in respondents: portal users are Field Officers.
  if (!access.allowed) {
    await dispatchEvent({
      event: 'ACCESS_DENIED',
      subject: `Access denied: ${template.Title}`,
      body: `A user was denied access to "${template.Title}". Reason: ${access.reason}`,
      payload: { templateId: template.TemplateID, reason: access.reason, respondentUserId: opts.respondentUserId },
      userIds: [template.OwnerUserID],
    });
    throw new BadRequestError(access.reason ?? 'Access denied', access.requiresPassword ? 'PASSWORD_REQUIRED' : 'ACCESS_DENIED');
  }

  if (isRateLimited(template.TemplateID, opts.ip)) {
    throw new TooManyRequestsError('Too many submissions from this device. Try again later.');
  }

  const version = await getPublishedVersion(template.TemplateID);
  if (!version) throw new BadRequestError('Form has no published schema', 'NO_PUBLISHED_VERSION');
  const schema = parseSchema(version.SchemaJSON);

  // Duplicate submission prevention (FR-01.16) + draft promotion (CX-04).
  // An InProgress (save&resume) response is promoted to Submitted; a true
  // duplicate Submitted response is rejected.
  let draftResponseId: number | null = null;
  const identityWhere =
    opts.respondentUserId
      ? { clause: 'RespondentUserID = @UserId', inputs: { UserId: { type: sql.Int, v: opts.respondentUserId } } }
      : opts.respondentEmail
        ? { clause: 'RespondentEmail = @Email', inputs: { Email: { type: sql.NVarChar(200), v: opts.respondentEmail.trim().toLowerCase() } } }
        : null;
  if (identityWhere) {
    let req = db.request().input('TemplateId', sql.Int, template.TemplateID);
    for (const [k, p] of Object.entries(identityWhere.inputs)) req = req.input(k, p.type, p.v);
    // Submitted responses are final (FR-01.16): never re-open.
    const submitted = await req.query(
      `SELECT TOP 1 ResponseID FROM dbo.FormResponse WHERE TemplateID = @TemplateId AND ${identityWhere.clause} AND Status = 'Submitted'`
    );
    if (submitted.recordset.length > 0) {
      throw new ConflictError(
        opts.respondentUserId
          ? 'You have already submitted a response to this form'
          : 'A response has already been submitted for this email',
        'DUPLICATE_SUBMISSION'
      );
    }
    // Otherwise promote an existing save&resume draft (CX-04).
    const draft = await db
      .request()
      .input('TemplateId', sql.Int, template.TemplateID)
      .input('UserId', sql.Int, opts.respondentUserId ?? null)
      .input('Email', sql.NVarChar(200), opts.respondentEmail?.trim().toLowerCase() ?? null)
      .query(
        `SELECT TOP 1 ResponseID FROM dbo.FormResponse
         WHERE TemplateID = @TemplateId AND ${identityWhere.clause} AND Status = 'InProgress'`
      );
    if (draft.recordset.length > 0) draftResponseId = draft.recordset[0].ResponseID;
  }

  // Compute calculated fields (server-side, no eval) and sanitize rich text.
  const finalAnswers = computeCalculatedValues(schema.elements, opts.answers);
  for (const el of schema.elements) {
    if (el.type === 'richtext' && typeof finalAnswers[el.key] === 'string') {
      finalAnswers[el.key] = sanitizeRichText(finalAnswers[el.key] as string);
    }
  }

  const issues = validateResponse(schema.elements, finalAnswers);
  if (issues.length > 0) {
    throw new ValidationError('Response validation failed', issues);
  }

  const respondentEmail = opts.respondentEmail?.trim().toLowerCase() ?? null;
  const consentVersion = template.GDPRConsentRequired ? (template.GDPRConsentVersion ?? 0) : null;

  let responseId: number;
  if (draftResponseId) {
    // Promote save&resume draft -> submitted (CX-04).
    await db
      .request()
      .input('ResponseId', sql.Int, draftResponseId)
      .input('VersionId', sql.Int, version.VersionID)
      .input('Consent', sql.Bit, opts.consentGiven ?? null)
      .input('ConsentVersion', sql.Int, consentVersion)
      .input('Ip', sql.VarChar(45), opts.ip ?? null)
      .query(
        `UPDATE dbo.FormResponse
         SET VersionID = @VersionId, Status = 'Submitted', ConsentGiven = @Consent,
             ConsentVersion = @ConsentVersion, IPAddress = @Ip,
             ResumeToken = NULL, ResumeTokenExpiresAt = NULL,
             SubmittedAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME()
         WHERE ResponseID = @ResponseId`
      );
    responseId = draftResponseId;
  } else {
    const insert = await db
      .request()
      .input('TemplateId', sql.Int, template.TemplateID)
      .input('VersionId', sql.Int, version.VersionID)
      .input('UserId', sql.Int, opts.respondentUserId ?? null)
      .input('Email', sql.NVarChar(200), respondentEmail)
      .input('Consent', sql.Bit, opts.consentGiven ?? null)
      .input('ConsentVersion', sql.Int, consentVersion)
      .input('Ip', sql.VarChar(45), opts.ip ?? null)
      .query(
        `INSERT INTO dbo.FormResponse (TemplateID, VersionID, RespondentUserID, RespondentEmail, Status, ConsentGiven, ConsentVersion, IPAddress, SubmittedAt)
         OUTPUT INSERTED.ResponseID
         VALUES (@TemplateId, @VersionId, @UserId, @Email, 'Submitted', @Consent, @ConsentVersion, @Ip, SYSUTCDATETIME())`
      );
    responseId = insert.recordset[0].ResponseID;
  }

  await writeAnswers(responseId, finalAnswers);

  // Register uploaded files (FormFile) for file/image/signature fields.
  if (opts.files) {
    await writeFiles(responseId, opts.files);
  }
  // Scoring (DR-12) when the schema assigns points.
  if (schema.elements.some((e) => e.scoring)) {
    const score = computeScore(schema.elements, finalAnswers);
    if (score.max > 0) {
      await db.request().input('ResponseId', sql.Int, responseId).input('Total', sql.Decimal(10, 2), score.total).input('Max', sql.Decimal(10, 2), score.max).query(
        `UPDATE dbo.FormResponse SET TotalScore = @Total, ScoreMax = @Max WHERE ResponseID = @ResponseId`
      );
    }
  }

  await recordConsent(responseId, consentVersion);

  await db.request().input('TemplateId', sql.Int, template.TemplateID).query(
    `UPDATE dbo.FormTemplate SET ResponseCount = ResponseCount + 1, UpdatedAt = SYSUTCDATETIME() WHERE TemplateID = @TemplateId`
  );

  // Anomaly detection (DR-13, OP-07): flags never reject unless configured.
  await detectAnomalies({ templateId: template.TemplateID, responseId, ip: opts.ip }).catch(() => undefined);

  // Notifications (FR-01.15, Integration Design 5.3).
  if (opts.respondentUserId) {
    await dispatchEvent({
      event: 'SUBMISSION_CONFIRMED',
      subject: `Response received: ${template.Title}`,
      body: `Thank you! Your response to "${template.Title}" was submitted successfully.`,
      payload: { responseId, templateId: template.TemplateID },
      userIds: [opts.respondentUserId],
    });
  } else {
    await dispatchEvent({
      event: 'SUBMISSION_CONFIRMED',
      subject: `Response received: ${template.Title}`,
      body: `Thank you! Your response to "${template.Title}" was submitted successfully.`,
      payload: { responseId, templateId: template.TemplateID },
      userIds: [],
    });
  }
  await dispatchEvent({
    event: 'NEW_RESPONSE_RECEIVED',
    subject: `New response: ${template.Title}`,
    body: `A new response was submitted to "${template.Title}".`,
    payload: { responseId, templateId: template.TemplateID },
  });

  // Response limit warning at 80% (Integration Design 5.3).
  if (template.MaxResponses && template.ResponseCount > 0 && template.ResponseCount === Math.floor(template.MaxResponses * 0.8)) {
    await dispatchEvent({
      event: 'RESPONSE_LIMIT_WARNING',
      subject: `Response limit nearly reached: ${template.Title}`,
      body: `"${template.Title}" has reached 80% of its maximum response limit (${template.ResponseCount}/${template.MaxResponses}).`,
      payload: { templateId: template.TemplateID, count: template.ResponseCount, max: template.MaxResponses },
    });
  }

  // Linked follow-up form (FR-01.11): notify the respondent to complete it.
  if (template.LinkedFormTemplateID) {
    if (opts.respondentUserId) {
      await dispatchEvent({
        event: 'FORM_ASSIGNED',
        subject: `Follow-up form assigned`,
        body: `Please complete the linked follow-up form for "${template.Title}".`,
        payload: { templateId: template.TemplateID, linkedFormTemplateId: template.LinkedFormTemplateID },
        userIds: [opts.respondentUserId],
      });
    } else {
      await dispatchEvent({
        event: 'FORM_ASSIGNED',
        subject: `Follow-up form assigned`,
        body: `Please complete the linked follow-up form for "${template.Title}".`,
        payload: { templateId: template.TemplateID, linkedFormTemplateId: template.LinkedFormTemplateID },
        userIds: [],
      });
    }
  }

  const scored = schema.elements.some((e) => e.scoring) ? computeScore(schema.elements, finalAnswers) : { total: 0, max: 0 };
  return { responseId, linkedFormTemplateId: template.LinkedFormTemplateID ?? null, totalScore: scored.max > 0 ? scored.total : null, scoreMax: scored.max > 0 ? scored.max : null };
}

// ---------------------------------------------------------------------------
// Save & resume (CX-04): partial drafts persisted server-side with a token.
// ---------------------------------------------------------------------------
export async function saveDraft(opts: {
  templateId: number;
  respondentUserId?: number;
  respondentEmail?: string;
  answers: Answers;
  resumeToken?: string;
}): Promise<{ responseId: number; resumeToken: string; savedAt: string }> {
  const template = await getForm(opts.templateId);
  if (template.Status !== 'Published') throw new BadRequestError('Form is not open for responses', 'FORM_NOT_PUBLISHED');
  if (template.AllowDrafts === false) throw new BadRequestError('Draft saving is disabled for this form', 'DRAFTS_DISABLED');

  const version = await getPublishedVersion(template.TemplateID);
  if (!version) throw new BadRequestError('Form has no published schema', 'NO_PUBLISHED_VERSION');
  const schema = parseSchema(version.SchemaJSON);
  const finalAnswers = computeCalculatedValues(schema.elements, opts.answers);

  // Reuse an existing InProgress response (by token, user, or email).
  let responseId: number | null = null;
  if (opts.resumeToken) {
    const byToken = await db.request().input('Token', sql.VarChar(100), opts.resumeToken).query(
      `SELECT ResponseID FROM dbo.FormResponse WHERE ResumeToken = @Token AND Status = 'InProgress'`
    );
    if (byToken.recordset.length > 0) responseId = byToken.recordset[0].ResponseID;
  }
  // A finalized submission cannot be re-opened as a draft (FR-01.16).
  if (!responseId && opts.respondentUserId) {
    const submitted = await db.request().input('TemplateId', sql.Int, template.TemplateID).input('UserId', sql.Int, opts.respondentUserId).query(
      `SELECT TOP 1 ResponseID FROM dbo.FormResponse WHERE TemplateID = @TemplateId AND RespondentUserID = @UserId AND Status = 'Submitted'`
    );
    if (submitted.recordset.length > 0) throw new ConflictError('You have already submitted a response to this form', 'DUPLICATE_SUBMISSION');
  }
  if (!responseId && opts.respondentEmail) {
    const email = opts.respondentEmail.trim().toLowerCase();
    const submitted = await db.request().input('TemplateId', sql.Int, template.TemplateID).input('Email', sql.NVarChar(200), email).query(
      `SELECT TOP 1 ResponseID FROM dbo.FormResponse WHERE TemplateID = @TemplateId AND RespondentEmail = @Email AND Status = 'Submitted'`
    );
    if (submitted.recordset.length > 0) throw new ConflictError('A response has already been submitted for this email', 'DUPLICATE_SUBMISSION');
  }
  if (!responseId && opts.respondentUserId) {
    const byUser = await db.request().input('TemplateId', sql.Int, template.TemplateID).input('UserId', sql.Int, opts.respondentUserId).query(
      `SELECT TOP 1 ResponseID FROM dbo.FormResponse WHERE TemplateID = @TemplateId AND RespondentUserID = @UserId AND Status = 'InProgress'`
    );
    if (byUser.recordset.length > 0) responseId = byUser.recordset[0].ResponseID;
  }
  if (!responseId && opts.respondentEmail) {
    const email = opts.respondentEmail.trim().toLowerCase();
    const byEmail = await db.request().input('TemplateId', sql.Int, template.TemplateID).input('Email', sql.NVarChar(200), email).query(
      `SELECT TOP 1 ResponseID FROM dbo.FormResponse WHERE TemplateID = @TemplateId AND RespondentEmail = @Email AND Status = 'InProgress'`
    );
    if (byEmail.recordset.length > 0) responseId = byEmail.recordset[0].ResponseID;
  }

  if (!responseId) {
    const insert = await db
      .request()
      .input('TemplateId', sql.Int, template.TemplateID)
      .input('VersionId', sql.Int, version.VersionID)
      .input('UserId', sql.Int, opts.respondentUserId ?? null)
      .input('Email', sql.NVarChar(200), opts.respondentEmail?.trim().toLowerCase() ?? null)
      .query(
        `INSERT INTO dbo.FormResponse (TemplateID, VersionID, RespondentUserID, RespondentEmail, Status, DraftSavedAt, UpdatedAt)
         OUTPUT INSERTED.ResponseID
         VALUES (@TemplateId, @VersionId, @UserId, @Email, 'InProgress', SYSUTCDATETIME(), SYSUTCDATETIME())`
      );
    responseId = insert.recordset[0].ResponseID;
  }

  const finalResponseId = responseId as number;

  if (!opts.resumeToken) {
    opts.resumeToken = crypto.randomBytes(16).toString('hex');
    await db.request().input('ResponseId', sql.Int, finalResponseId).input('Token', sql.VarChar(100), opts.resumeToken).query(
      `UPDATE dbo.FormResponse SET ResumeToken = @Token, ResumeTokenExpiresAt = DATEADD(day, 7, SYSUTCDATETIME()) WHERE ResponseID = @ResponseId`
    );
  }

  await writeAnswers(finalResponseId, finalAnswers);
  await db.request().input('ResponseId', sql.Int, finalResponseId).query(
    `UPDATE dbo.FormResponse SET DraftSavedAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME() WHERE ResponseID = @ResponseId`
  );

  return { responseId: finalResponseId, resumeToken: opts.resumeToken, savedAt: new Date().toISOString() };
}

/** Returns the respondent's active partial draft (if any). */
export async function getMyDraft(templateId: number, userId: number): Promise<any | null> {
  const result = await db.request().input('TemplateId', sql.Int, templateId).input('UserId', sql.Int, userId).query(
    `SELECT TOP 1 ResponseID, ResumeToken, DraftSavedAt FROM dbo.FormResponse
     WHERE TemplateID = @TemplateId AND RespondentUserID = @UserId AND Status = 'InProgress'`
  );
  if (result.recordset.length === 0) return null;
  const row = result.recordset[0];
  const answers = await db.request().input('Id', sql.Int, row.ResponseID).query(
    `SELECT FieldKey, ValueJSON FROM dbo.ResponseAnswer WHERE ResponseID = @Id`
  );
  const parsed: Answers = {};
  for (const a of answers.recordset) {
    try { parsed[a.FieldKey] = JSON.parse(a.ValueJSON); } catch { parsed[a.FieldKey] = a.ValueJSON; }
  }
  return { responseId: row.ResponseID, resumeToken: row.ResumeToken, savedAt: row.DraftSavedAt, answers: parsed };
}

/** Issues a fresh resume token for an existing draft response. */
export async function issueResumeToken(responseId: number, days = 7): Promise<string> {
  const token = crypto.randomBytes(16).toString('hex');
  const result = await db.request().input('ResponseId', sql.Int, responseId).input('Token', sql.VarChar(100), token).input('Days', sql.Int, days).query(
    `UPDATE dbo.FormResponse SET ResumeToken = @Token, ResumeTokenExpiresAt = DATEADD(day, @Days, SYSUTCDATETIME()), UpdatedAt = SYSUTCDATETIME()
     WHERE ResponseID = @ResponseId AND Status = 'InProgress'`
  );
  if (result.rowsAffected[0] === 0) throw new NotFoundError('Draft not found or already submitted');
  return token;
}

/** Resolves a resume token back to a draft response + saved answers (CX-04). */
export async function resumeFromToken(token: string): Promise<{ responseId: number; templateId: number; answers: Answers }> {
  const result = await db.request().input('Token', sql.VarChar(100), token).query(
    `SELECT ResponseID, TemplateID FROM dbo.FormResponse
     WHERE ResumeToken = @Token AND Status = 'InProgress' AND (ResumeTokenExpiresAt IS NULL OR ResumeTokenExpiresAt > SYSUTCDATETIME())`
  );
  if (result.recordset.length === 0) throw new NotFoundError('Resume link is invalid or has expired');
  const row = result.recordset[0];
  const answers = await db.request().input('Id', sql.Int, row.ResponseID).query(
    `SELECT FieldKey, ValueJSON FROM dbo.ResponseAnswer WHERE ResponseID = @Id`
  );
  const parsed: Answers = {};
  for (const a of answers.recordset) {
    try { parsed[a.FieldKey] = JSON.parse(a.ValueJSON); } catch { parsed[a.FieldKey] = a.ValueJSON; }
  }
  await dispatchEvent({
    event: 'FORM_RESUME',
    subject: `Form draft resumed`,
    body: `A saved draft for form ${row.TemplateID} was resumed.`,
    payload: { responseId: row.ResponseID, templateId: row.TemplateID },
  });
  return { responseId: row.ResponseID, templateId: row.TemplateID, answers: parsed };
}

// ---------------------------------------------------------------------------
// Response editing (OP-07): window-enforced, revisioned, re-scored.
// ---------------------------------------------------------------------------
export async function editResponse(opts: {
  responseId: number;
  editedBy: number;
  answers: Answers;
  files?: Record<string, FileRef[]>;
}): Promise<{ revisionId: number; totalScore: number | null; scoreMax: number | null }> {
  const response = await db
    .request()
    .input('Id', sql.Int, opts.responseId)
    .query(
      `SELECT r.*, t.EditWindowHours AS WindowHours FROM dbo.FormResponse r
       JOIN dbo.FormTemplate t ON t.TemplateID = r.TemplateID
       WHERE r.ResponseID = @Id`
    );
  if (response.recordset.length === 0) throw new NotFoundError('Response not found');
  const row = response.recordset[0];
  if (row.Status !== 'Submitted') throw new BadRequestError('Only submitted responses can be edited', 'NOT_EDITABLE');

  // Edit window enforcement (default 72h when configured).
  if (row.WindowHours !== null && row.WindowHours !== undefined) {
    const deadline = new Date(row.SubmittedAt);
    deadline.setHours(deadline.getHours() + row.WindowHours);
    if (deadline.getTime() < Date.now()) throw new ForbiddenError('The response editing window has closed');
  }

  const template = await getForm(row.TemplateID);
  const version = await getPublishedVersion(row.TemplateID);
  if (!version) throw new BadRequestError('Form has no published schema', 'NO_PUBLISHED_VERSION');
  const schema = parseSchema(version.SchemaJSON);

  const finalAnswers = computeCalculatedValues(schema.elements, opts.answers);
  const issues = validateResponse(schema.elements, finalAnswers);
  if (issues.length > 0) throw new ValidationError('Response validation failed', issues);

  // Snapshot previous answers into a revision (SC-09).
  const prev = await db.request().input('Id', sql.Int, opts.responseId).query(
    `SELECT FieldKey, ValueJSON FROM dbo.ResponseAnswer WHERE ResponseID = @Id`
  );
  const previousAnswers: Answers = {};
  for (const a of prev.recordset) {
    try { previousAnswers[a.FieldKey] = JSON.parse(a.ValueJSON); } catch { previousAnswers[a.FieldKey] = a.ValueJSON; }
  }

  let totalScore: number | null = null;
  let scoreMax: number | null = null;
  if (schema.elements.some((e) => e.scoring)) {
    const score = computeScore(schema.elements, finalAnswers);
    totalScore = score.max > 0 ? score.total : null;
    scoreMax = score.max > 0 ? score.max : null;
  }

  const revision = await db
    .request()
    .input('ResponseId', sql.Int, opts.responseId)
    .input('VersionId', sql.Int, version.VersionID)
    .input('Answers', sql.NVarChar(sql.MAX), JSON.stringify(finalAnswers))
    .input('Score', sql.NVarChar(sql.MAX), totalScore !== null ? JSON.stringify({ total: totalScore, max: scoreMax }) : null)
    .input('EditedBy', sql.Int, opts.editedBy)
    .input('Reason', sql.NVarChar(500), 'Response edited via response-editing window')
    .query(
      `INSERT INTO dbo.ResponseRevision (ResponseID, VersionID, AnswersJSON, ScoreJSON, EditedBy, Reason)
       OUTPUT INSERTED.RevisionID
       VALUES (@ResponseId, @VersionId, @Answers, @Score, @EditedBy, @Reason)`
    );
  const revisionId = revision.recordset[0].RevisionID;

  await writeAnswers(opts.responseId, finalAnswers);
  if (opts.files) await writeFiles(opts.responseId, opts.files);

  await db
    .request()
    .input('ResponseId', sql.Int, opts.responseId)
    .input('Total', sql.Decimal(10, 2), totalScore)
    .input('Max', sql.Decimal(10, 2), scoreMax)
    .query(
      `UPDATE dbo.FormResponse
       SET EditCount = EditCount + 1, EditedAt = SYSUTCDATETIME(), TotalScore = @Total, ScoreMax = @Max,
           UpdatedAt = SYSUTCDATETIME()
       WHERE ResponseID = @ResponseId`
    );

  await audit({ userId: opts.editedBy, action: 'RESPONSE_EDITED', entity: 'FormResponse', entityId: opts.responseId, detail: { templateId: row.TemplateID, revisionId } });
  await dispatchEvent({
    event: 'RESPONSE_EDITED',
    subject: `Response edited: ${template.Title}`,
    body: `A submitted response to "${template.Title}" was edited.`,
    payload: { responseId: opts.responseId, templateId: row.TemplateID, revisionId },
  });

  return { revisionId, totalScore, scoreMax };
}

export async function listResponseRevisions(responseId: number): Promise<any[]> {
  const result = await db.request().input('Id', sql.Int, responseId).query(
    `SELECT RevisionID, VersionID, AnswersJSON, ScoreJSON, EditedBy, Reason, CreatedAt
     FROM dbo.ResponseRevision WHERE ResponseID = @Id ORDER BY CreatedAt DESC`
  );
  return result.recordset;
}

export async function getResponseScores(responseId: number): Promise<{ totalScore: number | null; scoreMax: number | null }> {
  const result = await db.request().input('Id', sql.Int, responseId).query(
    `SELECT TotalScore, ScoreMax FROM dbo.FormResponse WHERE ResponseID = @Id`
  );
  if (result.recordset.length === 0) throw new NotFoundError('Response not found');
  return { totalScore: result.recordset[0].TotalScore, scoreMax: result.recordset[0].ScoreMax };
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------
export async function listResponses(templateId: number, opts: { dataScope: string; userId: number; page?: number; pageSize?: number }): Promise<{ items: any[]; total: number; page: number; pageSize: number }> {
  const request = db.request().input('TemplateId', sql.Int, templateId);
  const where = ['r.TemplateID = @TemplateId'];
  if (opts.dataScope === 'own') {
    // Field Officers see their own submissions; form owners see every response.
    where.push('(r.RespondentUserID = @UserId OR t.OwnerUserID = @UserId)');
    request.input('UserId', sql.Int, opts.userId);
  }
  const whereSql = where.join(' AND ');
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 20;
  const offset = (page - 1) * pageSize;
  request.input('Offset', sql.Int, offset);
  request.input('Limit', sql.Int, pageSize);
  const countResult = await request.query(
    `SELECT COUNT(*) AS Total FROM dbo.FormResponse r JOIN dbo.FormTemplate t ON t.TemplateID = r.TemplateID WHERE ${whereSql}`
  );
  const result = await request.query(
    `SELECT r.ResponseID, r.VersionID, r.RespondentUserID, r.RespondentEmail, r.Status,
            r.ConsentGiven, r.ConsentVersion, r.SubmittedAt, r.IsErased,
            r.TotalScore, r.ScoreMax, r.EditCount, r.EditedAt,
            u.Name AS RespondentName
     FROM dbo.FormResponse r
     JOIN dbo.FormTemplate t ON t.TemplateID = r.TemplateID
     LEFT JOIN dbo.[User] u ON u.UserID = r.RespondentUserID
     WHERE ${whereSql}
     ORDER BY r.SubmittedAt DESC
     OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY`
  );
  return { items: result.recordset, total: countResult.recordset[0].Total, page, pageSize };
}

// ---------------------------------------------------------------------------
// Real-time report (FR-01.18/01.19)
// ---------------------------------------------------------------------------
export interface ReportFilters {
  from?: string;
  to?: string;
  domain?: string;
  fieldKey?: string;
  fieldValue?: string;
}

export async function getReport(templateId: number, filters: ReportFilters): Promise<any> {
  const template = await getForm(templateId);
  const version = await getPublishedVersion(templateId).catch(() => null);
  const schema = version ? parseSchema(version.SchemaJSON) : { schemaVersion: 1, pages: [], elements: [] as FormElement[] };
  const elements = schema.elements;

  const where: string[] = ["r.TemplateID = @TemplateId", "r.Status = 'Submitted'", 'r.IsErased = 0'];
  const request = db.request().input('TemplateId', sql.Int, templateId);
  if (filters.from) { where.push('r.SubmittedAt >= @From'); request.input('From', sql.DateTime2, filters.from); }
  if (filters.to) { where.push('r.SubmittedAt <= @To'); request.input('To', sql.DateTime2, filters.to); }
  if (filters.domain) { where.push('r.RespondentEmail LIKE @Domain'); request.input('Domain', sql.NVarChar, `%@${filters.domain}%`); }

  const whereSql = where.join(' AND ');

  const base = await request.query(`SELECT COUNT(*) AS Total FROM dbo.FormResponse r WHERE ${whereSql}`);

  const fieldRows = await db
    .request()
    .input('TemplateId', sql.Int, templateId)
    .query(
      `SELECT a.FieldKey, a.ValueJSON, COUNT(*) AS Cnt
       FROM dbo.ResponseAnswer a
       JOIN dbo.FormResponse r ON r.ResponseID = a.ResponseID
       WHERE a.FieldKey IN (SELECT DISTINCT FieldKey FROM dbo.ResponseAnswer)
         AND r.Status = 'Submitted' AND r.IsErased = 0 AND r.TemplateID = @TemplateId
       GROUP BY a.FieldKey, a.ValueJSON`
    );

  // Per-field aggregation for chart widgets.
  const fields: any[] = [];
  for (const el of elements) {
    const rows = fieldRows.recordset.filter((r: any) => r.FieldKey === el.key);
    const values = rows.flatMap((r: any) => {
      const parsed = JSON.parse(r.ValueJSON);
      return Array.isArray(parsed) ? parsed : [parsed];
    });
    let summary: Record<string, unknown> = { count: rows.reduce((s: any, r: any) => s + r.Cnt, 0) };
    if (el.type === 'rating' || el.type === 'number' || el.type === 'slider') {
      const nums = values.map((n: any) => Number(n)).filter((n: any) => Number.isFinite(n));
      summary = {
        count: nums.length,
        avg: nums.length ? Number((nums.reduce((a: any, b: any) => a + b, 0) / nums.length).toFixed(2)) : null,
        min: nums.length ? Math.min(...nums) : null,
        max: nums.length ? Math.max(...nums) : null,
      };
    } else if (el.type === 'dropdown' || el.type === 'multiplechoice' || el.type === 'yesno') {
      const counts: Record<string, number> = {};
      for (const v of values) counts[String(v)] = (counts[String(v)] ?? 0) + 1;
      summary = { count: values.length, optionCounts: counts };
    } else if (el.type === 'date') {
      const byMonth: Record<string, number> = {};
      for (const v of values) {
        const m = String(v).slice(0, 7);
        byMonth[m] = (byMonth[m] ?? 0) + 1;
      }
      summary = { count: values.length, byMonth };
    } else if (el.type === 'matrix') {
      const counts: Record<string, number> = {};
      for (const v of values) {
        if (v && typeof v === 'object') {
          for (const row of Object.keys(v as Record<string, unknown>)) {
            const rv = (v as Record<string, unknown>)[row];
            const arr = Array.isArray(rv) ? rv : [rv];
            for (const c of arr) counts[`${row}: ${c}`] = (counts[`${row}: ${c}`] ?? 0) + 1;
          }
        }
      }
      summary = { count: values.length, optionCounts: counts };
    } else if (el.type === 'location') {
      const withCoords = values.filter((v: any) => Number.isFinite(Number(v?.lat)) && Number.isFinite(Number(v?.lng)));
      summary = { count: values.length, withCoordinates: withCoords.length };
    }
    fields.push({ key: el.key, label: el.label, type: el.type, summary });
  }

  return {
    template: { templateId: template.TemplateID, title: template.Title },
    filters,
    total: base.recordset[0].Total,
    lastUpdated: new Date().toISOString(),
    fields,
  };
}

// ---------------------------------------------------------------------------
// GDPR right-to-erasure (FR-01.25)
// ---------------------------------------------------------------------------
export async function requestErasure(responseId: number, opts: { requestedBy?: number; email?: string }): Promise<void> {
  await db
    .request()
    .input('ResponseId', sql.Int, responseId)
    .input('RequestedBy', sql.Int, opts.requestedBy ?? null)
    .input('Email', sql.NVarChar(200), opts.email ?? null)
    .query(
      `INSERT INTO dbo.ErasureRequest (ResponseID, RequestedBy, RespondentEmail, Status)
       VALUES (@ResponseId, @RequestedBy, @Email, 'Pending')`
    );
}

/** Purges data for erasure requests older than 30 days (scheduled job). */
export async function processErasureRequests(): Promise<number> {
  const requests = await db.request().query(
    `SELECT ErasureRequestID, ResponseID FROM dbo.ErasureRequest
     WHERE Status = 'Pending' AND RequestedAt <= DATEADD(day, -30, SYSUTCDATETIME())`
  );
  for (const req of requests.recordset) {
    if (req.ResponseID) {
      await db.request().input('ResponseId', sql.Int, req.ResponseID).query('DELETE FROM dbo.ResponseAnswer WHERE ResponseID = @ResponseId');
      await db.request().input('ResponseId', sql.Int, req.ResponseID).query('DELETE FROM dbo.FormFile WHERE ResponseID = @ResponseId');
      await db.request().input('ResponseId', sql.Int, req.ResponseID).query(
        `UPDATE dbo.FormResponse SET IsErased = 1, RespondentEmail = NULL, IPAddress = NULL, UpdatedAt = SYSUTCDATETIME() WHERE ResponseID = @ResponseId`
      );
    }
    await db.request().input('Id', sql.Int, req.ErasureRequestID).query(
      `UPDATE dbo.ErasureRequest SET Status = 'Completed', CompletedAt = SYSUTCDATETIME() WHERE ErasureRequestID = @Id`
    );
  }
  return requests.recordset.length;
}

export async function getResponseDetail(responseId: number): Promise<any> {
  const result = await db
    .request()
    .input('Id', sql.Int, responseId)
    .query(
      `SELECT r.*, u.Name AS RespondentName FROM dbo.FormResponse r
       LEFT JOIN dbo.[User] u ON u.UserID = r.RespondentUserID
       WHERE r.ResponseID = @Id`
    );
  if (result.recordset.length === 0) throw new NotFoundError('Response not found');
  const answers = await db.request().input('Id', sql.Int, responseId).query(
    `SELECT FieldKey, ValueJSON FROM dbo.ResponseAnswer WHERE ResponseID = @Id`
  );
  const files = await db.request().input('Id', sql.Int, responseId).query(
    `SELECT FileID, FieldKey, OriginalName, StorageURL, SizeBytes, MimeType, ScanStatus FROM dbo.FormFile WHERE ResponseID = @Id`
  );
  return { ...result.recordset[0], answers: answers.recordset, files: files.recordset };
}
