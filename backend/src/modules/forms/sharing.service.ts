import crypto from 'crypto';
import sql from 'mssql';
import { db } from '../../db/pool';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors';
import { getReport } from './responses.service';
import { getForm } from './forms.service';
import { getCrossReportReport } from './crossReports.service';
import { audit } from '../../db/audit';
import { dispatchEvent } from '../notifications/notifications.service';

// ---------------------------------------------------------------------------
// Report sharing (DR-05, DR-11) + report access control (DR-10).
// ---------------------------------------------------------------------------

const REPORT_VIEW_ROLES = ['Administrator', 'Marketing Manager', 'Marketing Analyst'];

/** Effective report access (DR-10): owner OR explicit grant OR manager roles. */
export async function canViewReport(templateId: number, userId: number, role: string): Promise<boolean> {
  if (REPORT_VIEW_ROLES.includes(role)) return true;
  const form = await getForm(templateId).catch(() => null);
  if (form && form.OwnerUserID === userId) return true;
  const grant = await db.request().input('TemplateId', sql.Int, templateId).input('UserId', sql.Int, userId).query(
    `SELECT AccessID FROM dbo.FormReportAccess WHERE TemplateID = @TemplateId AND UserID = @UserId`
  );
  return grant.recordset.length > 0;
}

export async function requireReportAccess(templateId: number, userId: number, role: string): Promise<void> {
  const ok = await canViewReport(templateId, userId, role);
  if (!ok) throw new ForbiddenError('You do not have access to this report');
}

// ---------------------------------------------------------------------------
// Report access grants
// ---------------------------------------------------------------------------
export async function listReportAccess(templateId: number): Promise<any[]> {
  const result = await db.request().input('Id', sql.Int, templateId).query(
    `SELECT a.AccessID, a.TemplateID, a.UserID, a.AccessLevel, a.CreatedAt,
            u.Name AS UserName, u.Email AS UserEmail
     FROM dbo.FormReportAccess a
     LEFT JOIN dbo.[User] u ON u.UserID = a.UserID
     WHERE a.TemplateID = @Id`
  );
  return result.recordset;
}

export async function grantReportAccess(templateId: number, userId: number, accessLevel: string, grantedBy: number): Promise<void> {
  if (!['View', 'Export'].includes(accessLevel)) throw new BadRequestError('Invalid access level', 'INVALID_ACCESS_LEVEL');
  await db.request().input('TemplateId', sql.Int, templateId).input('UserId', sql.Int, userId).input('Level', sql.VarChar(20), accessLevel).input('GrantedBy', sql.Int, grantedBy).query(
    `MERGE dbo.FormReportAccess AS t
     USING (SELECT @TemplateId AS TemplateID, @UserId AS UserID) AS s
       ON t.TemplateID = s.TemplateID AND t.UserID = s.UserID
     WHEN MATCHED THEN UPDATE SET t.AccessLevel = @Level
     WHEN NOT MATCHED THEN INSERT (TemplateID, UserID, AccessLevel, GrantedBy) VALUES (@TemplateId, @UserId, @Level, @GrantedBy);`
  );
  await audit({ userId: grantedBy, action: 'REPORT_ACCESS_GRANTED', entity: 'FormTemplate', entityId: templateId, detail: { userId, accessLevel } });
}

export async function revokeReportAccess(templateId: number, userId: number, revokedBy: number): Promise<void> {
  await db.request().input('TemplateId', sql.Int, templateId).input('UserId', sql.Int, userId).query(
    `DELETE FROM dbo.FormReportAccess WHERE TemplateID = @TemplateId AND UserID = @UserId`
  );
  await audit({ userId: revokedBy, action: 'REPORT_ACCESS_REVOKED', entity: 'FormTemplate', entityId: templateId, detail: { userId } });
}

// ---------------------------------------------------------------------------
// Share links (DR-05, DR-11)
// ---------------------------------------------------------------------------
export interface CreateShareInput {
  shareType: 'form' | 'cross-report';
  templateId?: number;
  crossReportId?: number;
  filters?: { from?: string; to?: string; domain?: string };
  expiresAt?: string | null;
  userId: number;
  role: string;
}

export async function createShare(input: CreateShareInput): Promise<{ ShareID: number; Token: string }> {
  if (input.shareType === 'form') {
    if (!input.templateId) throw new BadRequestError('templateId is required for form shares', 'INVALID_SHARE');
    await requireReportAccess(input.templateId, input.userId, input.role);
  } else if (input.shareType === 'cross-report') {
    if (!input.crossReportId) throw new BadRequestError('crossReportId is required for cross-report shares', 'INVALID_SHARE');
  } else {
    throw new BadRequestError('shareType must be form or cross-report', 'INVALID_SHARE');
  }
  const token = crypto.randomBytes(32).toString('hex');
  const insert = await db
    .request()
    .input('TemplateId', sql.Int, input.templateId ?? null)
    .input('CrossReportId', sql.Int, input.crossReportId ?? null)
    .input('Type', sql.VarChar(20), input.shareType)
    .input('Token', sql.VarChar(64), token)
    .input('CreatedBy', sql.Int, input.userId)
    .input('ExpiresAt', sql.DateTime2, input.expiresAt ?? null)
    .input('Filters', sql.NVarChar(sql.MAX), input.filters ? JSON.stringify(input.filters) : null)
    .query(
      `INSERT INTO dbo.FormShare (TemplateID, CrossReportID, ShareType, Token, CreatedBy, ExpiresAt, FiltersJSON)
       OUTPUT INSERTED.ShareID VALUES (@TemplateId, @CrossReportId, @Type, @Token, @CreatedBy, @ExpiresAt, @Filters)`
    );
  const id = insert.recordset[0].ShareID;
  await audit({ userId: input.userId, action: 'REPORT_SHARED', entity: 'FormShare', entityId: id, detail: { shareType: input.shareType } });
  await dispatchEvent({
    event: 'REPORT_SHARED',
    subject: `Report shared: ${input.shareType === 'form' ? 'Form Report' : 'Cross Report'}`,
    body: `A ${input.shareType} report has been shared.`,
    payload: { shareId: id, shareType: input.shareType, templateId: input.templateId, crossReportId: input.crossReportId },
  });
  return { ShareID: id, Token: token };
}

export async function listShares(userId: number, role: string, templateId?: number): Promise<any[]> {
  const isManager = REPORT_VIEW_ROLES.includes(role);
  const request = db.request();
  const conditions: string[] = ['s.RevokedAt IS NULL'];
  if (isManager) {
    // all shares visible to managers
  } else {
    conditions.push('s.CreatedBy = @UserId');
    request.input('UserId', sql.Int, userId);
  }
  if (templateId !== undefined) {
    // Form shares for this template + cross-report shares that include it
    // (TemplateIDsJSON is a JSON array of template IDs, e.g. "[3,7,9]").
    conditions.push(
      `(s.TemplateID = @TemplateId OR (s.CrossReportID IS NOT NULL AND EXISTS (
         SELECT 1 FROM dbo.FormCrossReport cr2
         WHERE cr2.CrossReportID = s.CrossReportID
           AND EXISTS (SELECT 1 FROM OPENJSON(cr2.TemplateIDsJSON) WHERE CAST([value] AS int) = @TemplateId)
       )))`
    );
    request.input('TemplateId', sql.Int, templateId);
  }
  const result = await request.query(
    `SELECT s.ShareID, s.ShareType, s.Token, s.CreatedAt, s.ExpiresAt, s.RevokedAt,
            t.Title AS FormTitle, cr.Name AS CrossReportName,
            u.Name AS CreatedByName
     FROM dbo.FormShare s
     LEFT JOIN dbo.FormTemplate t ON t.TemplateID = s.TemplateID
     LEFT JOIN dbo.FormCrossReport cr ON cr.CrossReportID = s.CrossReportID
     LEFT JOIN dbo.[User] u ON u.UserID = s.CreatedBy
     WHERE ${conditions.join(' AND ')}
     ORDER BY s.CreatedAt DESC`
  );
  return result.recordset;
}

export async function revokeShare(shareId: number, userId: number): Promise<void> {
  const result = await db.request().input('Id', sql.Int, shareId).input('UserId', sql.Int, userId).query(
    `UPDATE dbo.FormShare SET RevokedAt = SYSUTCDATETIME() WHERE ShareID = @Id AND CreatedBy = @UserId`
  );
  await audit({ userId, action: 'REPORT_SHARE_REVOKED', entity: 'FormShare', entityId: shareId });
  if (result.rowsAffected[0] === 0) throw new NotFoundError('Share not found or not owned by you');
}

/** Resolves a public share token into a read-only report (DR-11). */
export async function resolveShare(token: string): Promise<any> {
  const row = await db.request().input('Token', sql.VarChar(64), token).query(
    `SELECT * FROM dbo.FormShare WHERE Token = @Token`
  );
  if (row.recordset.length === 0) throw new NotFoundError('Share link not found');
  const share = row.recordset[0];
  if (share.RevokedAt) throw new NotFoundError('Share link has been revoked');
  if (share.ExpiresAt && new Date(share.ExpiresAt).getTime() < Date.now()) throw new NotFoundError('Share link has expired');

  const filters = share.FiltersJSON ? (() => { try { return JSON.parse(share.FiltersJSON); } catch { return {}; } })() : {};
  if (share.ShareType === 'cross-report') {
    return getCrossReportReport(share.CrossReportID, filters, share.CreatedBy, 'Administrator');
  }
  return getReport(share.TemplateID, filters);
}
