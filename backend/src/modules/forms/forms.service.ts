import sql from 'mssql';
import bcrypt from 'bcryptjs';
import { db } from '../../db/pool';
import { NotFoundError, ConflictError, BadRequestError } from '../../utils/errors';
import {
  buildEnvelope,
  parseSchema,
  serializeSchema,
  validateSchemaEnvelope,
  type FormElement,
  type FormBranding,
  type FormPage,
} from './formSchema';
import { dispatchEvent } from '../notifications/notifications.service';
import { sendEmail } from '../../integrations/email';
import { audit } from '../../db/audit';
import { DataScope } from '../../utils/scope';

export const FORM_STATUS = ['Draft', 'Published', 'Archived'] as const;
export const ACCESS_MODES = ['Public', 'Domain', 'Invite', 'Group', 'Password'] as const;

export interface AccessConfig {
  domains?: string[];
  roles?: string[];
  password?: string; // plaintext when configuring; stored as bcrypt hash
  groupId?: string;
}

const TEMPLATE_SELECT = `
  SELECT t.TemplateID, t.OwnerUserID, t.Title, t.Description, t.Status, t.AccessMode,
         t.MaxResponses, t.PublishAt, t.ExpireAt, t.GDPRConsentRequired,
         t.GDPRConsentVersion, t.GDPRConsentText, t.EditWindowHours, t.AutoRejectAnomalies,
         t.AllowDrafts, t.ParentTemplateID, t.InheritedFromVersionID,
         t.LinkedFormTemplateID, t.ResponseCount, t.CreatedAt, t.UpdatedAt,
         u.Name AS OwnerName,
         (SELECT MAX(VersionNumber) FROM dbo.FormVersion v WHERE v.TemplateID = t.TemplateID) AS CurrentVersion
  FROM dbo.FormTemplate t
  JOIN dbo.[User] u ON u.UserID = t.OwnerUserID`;

export async function listForms(opts: { dataScope: DataScope; userId: number; status?: string; search?: string }): Promise<any[]> {
  const where: string[] = ['1=1'];
  const request = db.request();
  if (opts.status) {
    where.push('t.Status = @Status');
    request.input('Status', sql.VarChar(20), opts.status);
  }
  if (opts.search) {
    where.push('(t.Title LIKE @Search)');
    request.input('Search', sql.NVarChar, `%${opts.search}%`);
  }
  if (opts.dataScope === 'own') {
    where.push('t.OwnerUserID = @OwnerId');
    request.input('OwnerId', sql.Int, opts.userId);
  }
  const result = await request.query(`${TEMPLATE_SELECT} WHERE ${where.join(' AND ')} ORDER BY t.UpdatedAt DESC`);
  return result.recordset;
}

/** Published forms the caller is allowed to respond to (respondent entry points). */
export async function listAccessibleForms(): Promise<any[]> {
  const result = await db.request().query(
    `${TEMPLATE_SELECT}
     WHERE t.Status = 'Published'
       AND (t.PublishAt IS NULL OR t.PublishAt <= SYSUTCDATETIME())
       AND (t.ExpireAt IS NULL OR t.ExpireAt >= SYSUTCDATETIME())
       AND (t.MaxResponses IS NULL OR t.ResponseCount < t.MaxResponses)
     ORDER BY t.UpdatedAt DESC`
  );
  return result.recordset;
}

export async function getForm(templateId: number): Promise<any> {
  const result = await db.request().input('Id', sql.Int, templateId).query(`${TEMPLATE_SELECT} WHERE t.TemplateID = @Id`);
  if (result.recordset.length === 0) throw new NotFoundError('Form not found');
  return result.recordset[0];
}

export async function createForm(data: { ownerUserId: number; title: string; description?: string; parentTemplateId?: number | null }): Promise<number> {
  // Inheritance (REL-12..14): a child copies the parent's current schema + branding.
  let schema = buildEnvelope([], undefined, [{ id: 'page-1', title: 'Page 1' }]);
  let inheritedFrom: number | null = null;
  if (data.parentTemplateId) {
    const parent = await getForm(data.parentTemplateId);
    if (parent.ParentTemplateID) {
      throw new BadRequestError('A child form cannot itself become a parent form (single-level inheritance)', 'INVALID_PARENT');
    }
    const hasChildren = await db.request().input('Id', sql.Int, data.parentTemplateId).query(
      `SELECT COUNT(*) AS Cnt FROM dbo.FormTemplate WHERE ParentTemplateID = @Id`
    );
    if (hasChildren.recordset[0].Cnt > 0) {
      throw new BadRequestError('This form already has children and cannot become a parent', 'ALREADY_PARENT');
    }
    const parentVersion = await getLatestVersion(data.parentTemplateId);
    schema = parseSchema(parentVersion.SchemaJSON);
    inheritedFrom = parentVersion.VersionID;
  }

  const insert = await db
    .request()
    .input('OwnerId', sql.Int, data.ownerUserId)
    .input('Title', sql.NVarChar(200), data.title)
    .input('Description', sql.NVarChar(sql.MAX), data.description ?? null)
    .input('ParentId', sql.Int, data.parentTemplateId ?? null)
    .query(
      `INSERT INTO dbo.FormTemplate (OwnerUserID, Title, Description, Status, AccessMode, ParentTemplateID)
       OUTPUT INSERTED.TemplateID VALUES (@OwnerId, @Title, @Description, 'Draft', 'Public', @ParentId)`
    );
  const templateId = insert.recordset[0].TemplateID;
  await db
    .request()
    .input('TemplateId', sql.Int, templateId)
    .input('Schema', sql.NVarChar(sql.MAX), serializeSchema(schema))
    .input('VersionNumber', sql.Int, 1)
    .query(
      `INSERT INTO dbo.FormVersion (TemplateID, VersionNumber, SchemaJSON)
       VALUES (@TemplateId, @VersionNumber, @Schema)`
    );
  if (inheritedFrom !== null) {
    await db.request().input('Id', sql.Int, templateId).input('VersionId', sql.Int, inheritedFrom).query(
      `UPDATE dbo.FormTemplate SET InheritedFromVersionID = @VersionId WHERE TemplateID = @Id`
    );
  }
  return templateId;
}

export async function updateFormMeta(templateId: number, data: {
  title?: string;
  description?: string;
  maxResponses?: number | null;
  gdprConsentRequired?: boolean;
  publishAt?: string | null;
  expireAt?: string | null;
  linkedFormTemplateId?: number | null;
  editWindowHours?: number | null;
  autoRejectAnomalies?: boolean;
  allowDrafts?: boolean;
}): Promise<void> {
  const request = db.request().input('Id', sql.Int, templateId);
  const sets: string[] = ['UpdatedAt = SYSUTCDATETIME()'];
  if (data.title !== undefined) { sets.push('Title = @Title'); request.input('Title', sql.NVarChar(200), data.title); }
  if (data.description !== undefined) { sets.push('Description = @Description'); request.input('Description', sql.NVarChar(sql.MAX), data.description); }
  if (data.maxResponses !== undefined) { sets.push('MaxResponses = @MaxResponses'); request.input('MaxResponses', sql.Int, data.maxResponses); }
  if (data.gdprConsentRequired !== undefined) { sets.push('GDPRConsentRequired = @Gdpr'); request.input('Gdpr', sql.Bit, data.gdprConsentRequired); }
  if (data.publishAt !== undefined) { sets.push('PublishAt = @PublishAt'); request.input('PublishAt', sql.DateTime2, data.publishAt); }
  if (data.expireAt !== undefined) { sets.push('ExpireAt = @ExpireAt'); request.input('ExpireAt', sql.DateTime2, data.expireAt); }
  if (data.linkedFormTemplateId !== undefined) { sets.push('LinkedFormTemplateID = @Linked'); request.input('Linked', sql.Int, data.linkedFormTemplateId); }
  if (data.editWindowHours !== undefined) { sets.push('EditWindowHours = @EditWindow'); request.input('EditWindow', sql.Int, data.editWindowHours); }
  if (data.autoRejectAnomalies !== undefined) { sets.push('AutoRejectAnomalies = @AutoReject'); request.input('AutoReject', sql.Bit, data.autoRejectAnomalies); }
  if (data.allowDrafts !== undefined) { sets.push('AllowDrafts = @AllowDrafts'); request.input('AllowDrafts', sql.Bit, data.allowDrafts); }
  if (sets.length === 1) return;
  await request.query(`UPDATE dbo.FormTemplate SET ${sets.join(', ')} WHERE TemplateID = @Id`);
}

/** Saves a new schema version (POST /forms/:id/versions). Accepts a
 *  legacy element array or a full envelope.
 *
 *  Option A: if the form is already Published, the just-saved version is
 *  promoted to live in the same transaction so respondent/public see edits
 *  immediately. Draft forms stay draft until the first explicit Publish. */
export async function saveVersion(templateId: number, schema: FormElement[] | { schemaVersion: number; pages: FormPage[]; elements: FormElement[]; branding?: FormBranding }): Promise<number> {
  const envelope = Array.isArray(schema)
    ? buildEnvelope(schema, undefined, undefined)
    : {
        schemaVersion: schema.schemaVersion ?? 2,
        pages: schema.pages && schema.pages.length > 0 ? schema.pages : [{ id: 'page-1', title: 'Page 1' }],
        elements: schema.elements,
        branding: schema.branding,
      };

  // appearanceConfig is owned by Settings (updateBranding). The builder may post a
  // stale envelope loaded before an appearance save — always carry it forward from
  // the previous version so autosave/save-version cannot wipe it.
  try {
    const prev = parseSchema((await getLatestVersion(templateId)).SchemaJSON);
    if (prev.branding?.appearanceConfig) {
      envelope.branding = { ...envelope.branding, appearanceConfig: prev.branding.appearanceConfig };
    }
  } catch {
    // No previous version (first save) — nothing to carry forward.
  }

  const errors = validateSchemaEnvelope(envelope);
  if (errors.length > 0) {
    throw new BadRequestError('Form schema is invalid', 'SCHEMA_INVALID', errors);
  }

  // Read Status once so the promote decision is consistent with this save.
  const statusResult = await db.request().input('Id', sql.Int, templateId).query(
    `SELECT Status FROM dbo.FormTemplate WHERE TemplateID = @Id`
  );
  if (statusResult.recordset.length === 0) throw new NotFoundError('Form not found');
  const shouldPromote = statusResult.recordset[0].Status === 'Published';

  // Race-safe version allocation: concurrent autosave + manual save both compute
  // MAX(VersionNumber)+1. Use a transaction with UPDLOCK/HOLDLOCK so concurrent
  // callers serialize on the range, and retry once on unique-constraint violation
  // (2627/2601) as a belt-and-suspenders for edge cases.
  const schemaJson = serializeSchema(envelope);
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const tx = new sql.Transaction(db.pool);
    try {
      await tx.begin();
      const req = tx.request();
      const current = await req.input('Id', sql.Int, templateId).query(
        `SELECT ISNULL(MAX(VersionNumber), 0) AS MaxVersion
         FROM dbo.FormVersion WITH (UPDLOCK, HOLDLOCK)
         WHERE TemplateID = @Id`
      );
      const nextVersion = current.recordset[0].MaxVersion + 1;
      const insert = await tx.request()
        .input('TemplateId', sql.Int, templateId)
        .input('VersionNumber', sql.Int, nextVersion)
        .input('Schema', sql.NVarChar(sql.MAX), schemaJson)
        .query(
          `INSERT INTO dbo.FormVersion (TemplateID, VersionNumber, SchemaJSON)
           OUTPUT INSERTED.VersionID VALUES (@TemplateId, @VersionNumber, @Schema)`
        );
      const newVersionId = insert.recordset[0].VersionID as number;

      // Option A: promote immediately when the form is already live.
      // Atomic with the insert so respondent never sees a half-published state.
      if (shouldPromote) {
        await tx.request()
          .input('VersionId', sql.Int, newVersionId)
          .input('TemplateId', sql.Int, templateId)
          .query(
            `UPDATE dbo.FormVersion
             SET IsPublished = CASE WHEN VersionID = @VersionId THEN 1 ELSE 0 END,
                 PublishedAt = CASE WHEN VersionID = @VersionId THEN SYSUTCDATETIME() ELSE PublishedAt END
             WHERE TemplateID = @TemplateId`
          );
      }

      await tx.commit();
      return newVersionId;
    } catch (err) {
      try { await tx.rollback(); } catch { /* ignore rollback race */ }
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isDup = /\b(2627|2601)\b/.test(msg) || /duplicate key/i.test(msg);
      if (!isDup || attempt === 2) break;
      await new Promise((r) => setTimeout(r, 25 * (attempt + 1)));
    }
  }
  if (lastErr instanceof Error && /\b(2627|2601)\b/.test(lastErr.message)) {
    throw new ConflictError('Concurrent save detected — refresh and try again', 'VERSION_CONFLICT');
  }
  throw lastErr;
}

export async function getLatestVersion(templateId: number): Promise<{ VersionID: number; VersionNumber: number; SchemaJSON: string; IsPublished: boolean }> {
  const result = await db.request().input('Id', sql.Int, templateId).query(
    `SELECT TOP 1 VersionID, VersionNumber, SchemaJSON, IsPublished
     FROM dbo.FormVersion WHERE TemplateID = @Id ORDER BY VersionNumber DESC`
  );
  if (result.recordset.length === 0) throw new NotFoundError('Form has no schema version');
  return result.recordset[0];
}

export async function listVersions(templateId: number): Promise<any[]> {
  const result = await db.request().input('Id', sql.Int, templateId).query(
    `SELECT VersionID, VersionNumber, IsPublished, CreatedAt, PublishedAt
     FROM dbo.FormVersion WHERE TemplateID = @Id ORDER BY VersionNumber DESC`
  );
  return result.recordset;
}

/** The published (live) version, if any. */
export async function getPublishedVersion(templateId: number): Promise<{ VersionID: number; VersionNumber: number; SchemaJSON: string; IsPublished?: boolean } | null> {
  const result = await db.request().input('Id', sql.Int, templateId).query(
    `SELECT TOP 1 VersionID, VersionNumber, SchemaJSON, IsPublished
     FROM dbo.FormVersion WHERE TemplateID = @Id AND IsPublished = 1 ORDER BY VersionNumber DESC`
  );
  return result.recordset.length ? result.recordset[0] : null;
}

export async function publishForm(templateId: number, userId: number): Promise<void> {
  const template = await getForm(templateId);
  if (template.Status === 'Archived') {
    throw new ConflictError('Archived forms cannot be published', 'ARCHIVED');
  }
  if (template.Status !== 'Draft' && template.Status !== 'Published') {
    throw new ConflictError('Only draft or published forms can be published', 'NOT_DRAFT');
  }
  const isRepublish = template.Status === 'Published';
  const latest = await getLatestVersion(templateId);

  // Status update (no-op on already-Published, but refreshes UpdatedAt).
  await db.request().input('Id', sql.Int, templateId).query(
    `UPDATE dbo.FormTemplate SET Status = 'Published', UpdatedAt = SYSUTCDATETIME() WHERE TemplateID = @Id`
  );

  // Promote the latest version to live and demote all others in one statement
  // so respondents always load exactly one IsPublished=1 row (the newest).
  await db
    .request()
    .input('VersionId', sql.Int, latest.VersionID)
    .input('TemplateId', sql.Int, templateId)
    .query(
      `UPDATE dbo.FormVersion
       SET IsPublished = CASE WHEN VersionID = @VersionId THEN 1 ELSE 0 END,
           PublishedAt = CASE WHEN VersionID = @VersionId THEN SYSUTCDATETIME() ELSE PublishedAt END
       WHERE TemplateID = @TemplateId`
    );

  await audit({
    userId,
    action: 'FORM_PUBLISHED',
    entity: 'FormTemplate',
    entityId: templateId,
    detail: isRepublish ? { republish: true, version: latest.VersionNumber } : undefined,
  });

  // Notifications / invite emails: only on first publish (Draft → Published).
  // Republishing after edits should not spam Field Officers / invitees again.
  if (!isRepublish) {
    await dispatchEvent({
      event: 'FORM_PUBLISHED',
      subject: `Form published: ${template.Title}`,
      body: `The form "${template.Title}" was published and is now open for responses.`,
      payload: { templateId },
      userIds: [template.OwnerUserID],
    });

    if (template.AccessMode === 'Invite') {
      const invites = await db.request().input('Id', sql.Int, templateId).query(
        `SELECT InviteID, Email FROM dbo.FormInvite WHERE TemplateID = @Id AND Status <> 'Revoked'`
      );
      for (const inv of invites.recordset) {
        const userResult = await db.request().input('Email', sql.NVarChar(200), inv.Email).query(
          `SELECT UserID FROM dbo.[User] WHERE Email = @Email AND IsActive = 1`
        );
        if (userResult.recordset.length > 0) {
          await dispatchEvent({
            event: 'FORM_INVITE',
            subject: `You're invited: ${template.Title}`,
            body: `You've been invited to respond to "${template.Title}".`,
            payload: { templateId, inviteId: inv.InviteID, formTitle: template.Title },
            userIds: [userResult.recordset[0].UserID],
          });
        } else {
          const rendered = (await import('../../notifications/templates')).renderNotification(
            'FORM_INVITE',
            { templateId, inviteId: inv.InviteID, formTitle: template.Title },
            inv.Email,
          );
          await sendEmail(inv.Email, `You're invited: ${template.Title}`, rendered.html, rendered.text);
        }
        await db.request().input('InviteId', sql.Int, inv.InviteID).query(
          `UPDATE dbo.FormInvite SET Status = 'Sent' WHERE InviteID = @InviteId`
        );
      }
    } else {
      await dispatchEvent({
        event: 'FORM_INVITE',
        subject: `New form available: ${template.Title}`,
        body: `A new form "${template.Title}" is now open for responses.`,
        payload: { templateId, formTitle: template.Title },
      });
    }
  }

  // Parent changes propagate to children upon next parent publish (REL-15).
  if (template.ParentTemplateID) {
    await propagateParentChanges(template.ParentTemplateID, userId, 'PARENT_FORM_UPDATED');
  }
}

export async function archiveForm(templateId: number, userId: number): Promise<void> {
  const template = await getForm(templateId);
  if (template.Status === 'Archived') throw new ConflictError('Form is already archived', 'ALREADY_ARCHIVED');
  await db.request().input('Id', sql.Int, templateId).query(
    `UPDATE dbo.FormTemplate SET Status = 'Archived', UpdatedAt = SYSUTCDATETIME() WHERE TemplateID = @Id`
  );
  await audit({ userId, action: 'FORM_ARCHIVED', entity: 'FormTemplate', entityId: templateId });
}

export async function deleteForm(templateId: number, userId: number): Promise<void> {
  const template = await getForm(templateId);
  if (template.Status !== 'Draft') throw new ConflictError('Only draft forms can be deleted', 'NOT_DRAFT');
  const tx = new sql.Transaction(db.pool);
  try {
    await tx.begin();
    const req = tx.request();
    // Delete dependent rows before the template itself (FK-safe order).
    // Erasure/anomaly records reference responses; revisions/answers/files too.
    await req.input('Id', sql.Int, templateId).batch(`
      DELETE r FROM dbo.ErasureRequest r
        JOIN dbo.FormResponse fr ON fr.ResponseID = r.ResponseID
        WHERE fr.TemplateID = @Id;
      DELETE a FROM dbo.FormAnomalyFlag a
        JOIN dbo.FormResponse fr ON fr.ResponseID = a.ResponseID
        WHERE fr.TemplateID = @Id;
      DELETE f FROM dbo.FormFile f
        JOIN dbo.FormResponse fr ON fr.ResponseID = f.ResponseID
        WHERE fr.TemplateID = @Id;
      DELETE rv FROM dbo.ResponseRevision rv
        JOIN dbo.FormResponse fr ON fr.ResponseID = rv.ResponseID
        WHERE fr.TemplateID = @Id;
      DELETE a FROM dbo.ResponseAnswer a
        JOIN dbo.FormResponse fr ON fr.ResponseID = a.ResponseID
        WHERE fr.TemplateID = @Id;
      DELETE FROM dbo.FormResponse WHERE TemplateID = @Id;
      DELETE FROM dbo.FormShare WHERE TemplateID = @Id;
      DELETE FROM dbo.FormReportAccess WHERE TemplateID = @Id;
      DELETE FROM dbo.FormInvite WHERE TemplateID = @Id;
      DELETE FROM dbo.FormConsentHistory WHERE TemplateID = @Id;
      DELETE FROM dbo.FormAccessRule WHERE TemplateID = @Id;
      DELETE FROM dbo.FormAnomalyFlag WHERE TemplateID = @Id;
      DELETE FROM dbo.FormVersion WHERE TemplateID = @Id;
      UPDATE dbo.FormTemplate SET ParentTemplateID = NULL WHERE ParentTemplateID = @Id;
      UPDATE dbo.FormTemplate SET LinkedFormTemplateID = NULL WHERE LinkedFormTemplateID = @Id;
      DELETE FROM dbo.FormTemplate WHERE TemplateID = @Id;
    `);
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
  await audit({ userId, action: 'FORM_DELETED', entity: 'FormTemplate', entityId: templateId });
}

/** Clones a form (fields, validation, access rules) into a new draft (FR-01.14). */
export async function cloneForm(templateId: number, userId: number): Promise<number> {
  const template = await getForm(templateId);
  const latest = await getLatestVersion(templateId);
  const newId = await createForm({
    ownerUserId: userId,
    title: `${template.Title} (Copy)`,
    description: template.Description,
  });
  await db.request().input('Id', sql.Int, newId).input('Schema', sql.NVarChar(sql.MAX), latest.SchemaJSON).query(
    `UPDATE dbo.FormVersion SET SchemaJSON = @Schema WHERE TemplateID = @Id`
  );
  const rule = await getAccessRule(templateId).catch(() => null);
  if (rule) {
    await configureAccess(newId, { mode: rule.Mode, config: rule.ConfigJSON ? (() => { try { return JSON.parse(rule.ConfigJSON); } catch { return {}; } })() : {} });
  }
  await audit({ userId, action: 'FORM_CLONED', entity: 'FormTemplate', entityId: newId, detail: { source: templateId } });
  return newId;
}

export async function reassignOwnership(templateId: number, newOwnerId: number, userId: number): Promise<void> {
  const template = await getForm(templateId);
  await db.request().input('Id', sql.Int, templateId).input('OwnerId', sql.Int, newOwnerId).query(
    `UPDATE dbo.FormTemplate SET OwnerUserID = @OwnerId, UpdatedAt = SYSUTCDATETIME() WHERE TemplateID = @Id`
  );
  await audit({ userId, action: 'FORM_OWNERSHIP_CHANGED', entity: 'FormTemplate', entityId: templateId, detail: { newOwner: newOwnerId } });
  await dispatchEvent({
    event: 'OWNERSHIP_TRANSFERRED',
    subject: `Form ownership transferred: ${template.Title}`,
    body: `Ownership of "${template.Title}" was transferred to you.`,
    payload: { templateId, newOwnerId },
    userIds: [newOwnerId],
  });
}

// ---------------------------------------------------------------------------
// Parent / child inheritance (REL-12..17)
// ---------------------------------------------------------------------------
export async function listChildren(templateId: number): Promise<any[]> {
  const result = await db.request().input('Id', sql.Int, templateId).query(
    `${TEMPLATE_SELECT} WHERE t.ParentTemplateID = @Id ORDER BY t.UpdatedAt DESC`
  );
  return result.recordset;
}

/**
 * Propagates the parent's current schema + branding to all child forms.
 * Child-specific elements (keys not defined by the parent) are preserved after
 * the inherited block (REL-14). Child owners are notified (REL-16).
 */
export async function propagateParentChanges(parentId: number, triggeredBy: number, event: 'PARENT_FORM_UPDATED' | 'PARENT_PROPAGATED'): Promise<void> {
  const parent = await getForm(parentId).catch(() => null);
  if (!parent) return;
  const parentVersion = await getLatestVersion(parentId).catch(() => null);
  if (!parentVersion) return;
  const parentSchema = parseSchema(parentVersion.SchemaJSON);

  const children = await db.request().input('Id', sql.Int, parentId).query(
    `SELECT TemplateID, OwnerUserID FROM dbo.FormTemplate WHERE ParentTemplateID = @Id AND Status <> 'Archived'`
  );

  for (const child of children.recordset) {
    const childVersion = await getLatestVersion(child.TemplateID).catch(() => null);
    if (!childVersion) continue;
    const childSchema = parseSchema(childVersion.SchemaJSON);

    const parentKeys = new Set(parentSchema.elements.map((e) => e.key));
    const ownElements = childSchema.elements.filter((e) => !parentKeys.has(e.key));
    // Inherited = parent's current elements; own additions kept after them.
    const inherited = parentSchema.elements.map((e) => ({
      ...e,
      pageId: e.pageId ?? 'page-1',
      order: -1, // re-ordered below
    }));
    const own = ownElements.map((e) => ({ ...e, pageId: e.pageId ?? 'page-1' }));
    const merged = [...inherited, ...own].map((e, i) => ({ ...e, order: i }));

    const mergedSchema = buildEnvelope(merged, parentSchema.branding, parentSchema.pages);

    await db.request().input('Id', sql.Int, child.TemplateID).input('Schema', sql.NVarChar(sql.MAX), serializeSchema(mergedSchema)).query(
      `UPDATE dbo.FormVersion SET SchemaJSON = @Schema WHERE TemplateID = @Id AND VersionNumber = (SELECT MAX(VersionNumber) FROM dbo.FormVersion WHERE TemplateID = @Id)`
    );
    await db.request().input('Id', sql.Int, child.TemplateID).input('VersionId', sql.Int, parentVersion.VersionID).query(
      `UPDATE dbo.FormTemplate SET InheritedFromVersionID = @VersionId, UpdatedAt = SYSUTCDATETIME() WHERE TemplateID = @Id`
    );

    await audit({ userId: triggeredBy, action: event, entity: 'FormTemplate', entityId: child.TemplateID, detail: { parent: parentId } });
    await dispatchEvent({
      event: event,
      subject: `Parent form updated: ${parent.Title}`,
      body: `The parent form "${parent.Title}" was updated. Your child form has been updated to match.`,
      payload: { parentFormId: parentId, childFormId: child.TemplateID },
      userIds: [child.OwnerUserID],
    });
  }
}

// ---------------------------------------------------------------------------
// Consent versioning (SC-11)
// ---------------------------------------------------------------------------
export async function getConsent(templateId: number): Promise<any> {
  const form = await getForm(templateId);
  return {
    templateId: form.TemplateID,
    consentRequired: form.GDPRConsentRequired,
    consentVersion: form.GDPRConsentVersion,
    consentText: form.GDPRConsentText ?? null,
  };
}

export async function updateConsent(templateId: number, data: { consentText: string; userId: number }): Promise<void> {
  const form = await getForm(templateId);
  const text = data.consentText.trim();
  if (!text) throw new BadRequestError('Consent text cannot be empty', 'EMPTY_CONSENT');
  const newVersion = form.GDPRConsentVersion + 1;
  await db.request().input('Id', sql.Int, templateId).input('Text', sql.NVarChar(sql.MAX), text).input('Version', sql.Int, newVersion).input('ChangedBy', sql.Int, data.userId).query(
    `UPDATE dbo.FormTemplate SET GDPRConsentText = @Text, GDPRConsentVersion = @Version, UpdatedAt = SYSUTCDATETIME() WHERE TemplateID = @Id`
  );
  await db.request().input('Id', sql.Int, templateId).input('Version', sql.Int, newVersion).input('Text', sql.NVarChar(sql.MAX), text).input('ChangedBy', sql.Int, data.userId).query(
    `INSERT INTO dbo.FormConsentHistory (TemplateID, ConsentVersion, ConsentText, ChangedBy)
     VALUES (@Id, @Version, @Text, @ChangedBy)`
  );
  await audit({ userId: data.userId, action: 'CONSENT_VERSION_BUMPED', entity: 'FormTemplate', entityId: templateId, detail: { version: newVersion } });
  await dispatchEvent({
    event: 'CONSENT_VERSION_BUMPED',
    subject: `Consent version updated: ${form.Title}`,
    body: `The GDPR consent for "${form.Title}" has been updated to version ${newVersion}. Respondents may need to re-consent.`,
    payload: { templateId, version: newVersion, changedBy: data.userId },
  });
}

export async function listConsentHistory(templateId: number): Promise<any[]> {
  const result = await db.request().input('Id', sql.Int, templateId).query(
    `SELECT ConsentHistoryID, ConsentVersion, ConsentText, EffectiveAt, ChangedBy FROM dbo.FormConsentHistory
     WHERE TemplateID = @Id ORDER BY ConsentVersion DESC`
  );
  return result.recordset;
}

// ---------------------------------------------------------------------------
// Branding (BR-01..06) - stored inside the schema envelope
// ---------------------------------------------------------------------------
export async function getBranding(templateId: number): Promise<FormBranding> {
  const latest = await getLatestVersion(templateId);
  return parseSchema(latest.SchemaJSON).branding ?? {};
}

export async function updateBranding(templateId: number, branding: FormBranding, userId: number): Promise<void> {
  const latest = await getLatestVersion(templateId);
  const schema = parseSchema(latest.SchemaJSON);

  // appearanceConfig is owned by Settings. A branding-only PUT that omits it
  // must not wipe what's already stored (same rule as saveVersion carry-forward).
  const withAppearance = (incoming: FormBranding, existing?: FormBranding): FormBranding => {
    if (incoming.appearanceConfig !== undefined) return incoming;
    if (existing?.appearanceConfig) return { ...incoming, appearanceConfig: existing.appearanceConfig };
    return incoming;
  };

  const latestBranding = withAppearance(branding, schema.branding);
  schema.branding = latestBranding;
  await db.request().input('Id', sql.Int, templateId).input('Schema', sql.NVarChar(sql.MAX), serializeSchema(schema)).query(
    `UPDATE dbo.FormVersion SET SchemaJSON = @Schema WHERE TemplateID = @Id AND VersionNumber = (SELECT MAX(VersionNumber) FROM dbo.FormVersion WHERE TemplateID = @Id)`
  );

  // Respondents load the published version — keep branding in sync when it is a
  // different row than latest (draft versions saved after publish).
  const published = await getPublishedVersion(templateId);
  if (published && published.VersionID !== latest.VersionID) {
    const pubSchema = parseSchema(published.SchemaJSON);
    pubSchema.branding = withAppearance(branding, pubSchema.branding);
    await db.request().input('VersionId', sql.Int, published.VersionID).input('Schema', sql.NVarChar(sql.MAX), serializeSchema(pubSchema)).query(
      `UPDATE dbo.FormVersion SET SchemaJSON = @Schema WHERE VersionID = @VersionId`
    );
  }

  await audit({ userId, action: 'BRANDING_UPDATED', entity: 'FormTemplate', entityId: templateId });
}

// ---------------------------------------------------------------------------
// Access rules (FR-01.6, TDS 3.5)
// ---------------------------------------------------------------------------
export async function getAccessRule(templateId: number): Promise<{ RuleID: number; Mode: string; ConfigJSON: string | null }> {
  const result = await db.request().input('Id', sql.Int, templateId).query(
    `SELECT RuleID, Mode, ConfigJSON FROM dbo.FormAccessRule WHERE TemplateID = @Id`
  );
  if (result.recordset.length > 0) return result.recordset[0];

  // No rule row yet (form never saved access config) — synthesize a default
  // from the template's AccessMode so GET never 404s the settings UI.
  const form = await db.request().input('Id', sql.Int, templateId).query(
    `SELECT AccessMode FROM dbo.FormTemplate WHERE TemplateID = @Id`
  );
  if (form.recordset.length === 0) throw new NotFoundError('Form not found');
  return { RuleID: 0, Mode: form.recordset[0].AccessMode, ConfigJSON: null };
}

export async function configureAccess(templateId: number, data: { mode: string; config?: AccessConfig }): Promise<void> {
  if (!ACCESS_MODES.includes(data.mode as any)) {
    throw new BadRequestError(`AccessMode must be one of ${ACCESS_MODES.join(', ')}`, 'INVALID_ACCESS_MODE');
  }
  let configJson: string | null = null;
  if (data.config) {
    const cfg: Record<string, unknown> = { ...data.config };
    if (data.mode === 'Password') {
      if (data.config.password) {
        cfg.passwordHash = await bcrypt.hash(data.config.password, 10);
        delete cfg.password;
      } else {
        // Re-save without re-entering the password: preserve the existing hash
        // so an empty password field cannot wipe a working password.
        const existing = await db
          .request()
          .input('TemplateId', sql.Int, templateId)
          .input('Mode', sql.VarChar(20), 'Password')
          .query(`SELECT ConfigJSON FROM dbo.FormAccessRule WHERE TemplateID = @TemplateId AND Mode = @Mode`);
        let preserved = false;
        if (existing.recordset.length > 0) {
          try {
            const prev = JSON.parse(existing.recordset[0].ConfigJSON ?? '{}');
            if (prev.passwordHash) {
              cfg.passwordHash = prev.passwordHash;
              preserved = true;
            }
          } catch { /* ignore malformed prior config */ }
        }
        // First-time enable of Password mode requires an actual password.
        if (!preserved) {
          throw new BadRequestError('A password is required to enable password protection', 'PASSWORD_REQUIRED');
        }
      }
      delete (cfg as any).password;
    }
    configJson = JSON.stringify(cfg);
  }
  await db.request().input('Id', sql.Int, templateId).input('Mode', sql.VarChar(20), data.mode).query(
    `UPDATE dbo.FormTemplate SET AccessMode = @Mode, UpdatedAt = SYSUTCDATETIME() WHERE TemplateID = @Id`
  );
  await db
    .request()
    .input('TemplateId', sql.Int, templateId)
    .input('Mode', sql.VarChar(20), data.mode)
    .input('Config', sql.NVarChar(sql.MAX), configJson)
    .query(
      `MERGE dbo.FormAccessRule AS t
       USING (SELECT @TemplateId AS TemplateID, @Mode AS Mode) AS s
         ON t.TemplateID = s.TemplateID AND t.Mode = s.Mode
       WHEN MATCHED THEN UPDATE SET t.ConfigJSON = @Config, t.UpdatedAt = SYSUTCDATETIME()
       WHEN NOT MATCHED THEN INSERT (TemplateID, Mode, ConfigJSON) VALUES (@TemplateId, @Mode, @Config);`
    );
}

// ---------------------------------------------------------------------------
// Invite list (FR-01.7)
// ---------------------------------------------------------------------------
export async function listInvites(templateId: number): Promise<any[]> {
  const result = await db.request().input('Id', sql.Int, templateId).query(
    `SELECT InviteID, TemplateID, Email, Status, CreatedAt FROM dbo.FormInvite WHERE TemplateID = @Id ORDER BY CreatedAt DESC`
  );
  return result.recordset;
}

export async function addInvite(templateId: number, email: string, invitedBy: number): Promise<void> {
  const emailNorm = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) throw new BadRequestError('Invalid email address', 'INVALID_EMAIL');
  await db
    .request()
    .input('TemplateId', sql.Int, templateId)
    .input('Email', sql.NVarChar(200), emailNorm)
    .input('InvitedBy', sql.Int, invitedBy)
    .query(
      `MERGE dbo.FormInvite AS t
       USING (SELECT @TemplateId AS TemplateID, @Email AS Email) AS s ON t.TemplateID = s.TemplateID AND t.Email = s.Email
       WHEN MATCHED THEN UPDATE SET t.Status = 'Pending'
       WHEN NOT MATCHED THEN INSERT (TemplateID, Email, Status, InvitedBy) VALUES (@TemplateId, @Email, 'Pending', @InvitedBy);`
    );
}

export async function bulkAddInvites(templateId: number, emails: string[], invitedBy: number): Promise<number> {
  const unique = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))];
  for (const email of unique) {
    await addInvite(templateId, email, invitedBy);
  }
  return unique.length;
}

export async function revokeInvite(inviteId: number): Promise<void> {
  await db.request().input('Id', sql.Int, inviteId).query(
    `UPDATE dbo.FormInvite SET Status = 'Revoked' WHERE InviteID = @Id`
  );
}
