import sql from 'mssql';
import { db } from '../../db/pool';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors';
import { parseSchema, type FormElement } from './formSchema';
import { getForm, getPublishedVersion } from './forms.service';
import { audit } from '../../db/audit';

// ---------------------------------------------------------------------------
// Cross-form reporting (REL-18..21). Maps matching fields across two or more
// forms and aggregates responses in the same `fields[]` shape as getReport so
// the existing flexible dashboard / ReportTab renders it unchanged.
// ---------------------------------------------------------------------------

export interface FieldMapping {
  displayName: string;
  fieldKeys: Record<string, string>; // templateId -> fieldKey
}

export interface CrossReport {
  CrossReportID: number;
  Name: string;
  Description: string | null;
  TemplateIDs: number[];
  FieldMappings: FieldMapping[];
  LayoutJSON: string | null;
  CreatedBy: number;
  CreatedAt: string;
  UpdatedAt: string | null;
}

interface ReportFilters {
  from?: string;
  to?: string;
}

async function getRow(id: number): Promise<any> {
  const result = await db.request().input('Id', sql.Int, id).query(
    `SELECT cr.*, u.Name AS CreatedByName FROM dbo.FormCrossReport cr
     LEFT JOIN dbo.[User] u ON u.UserID = cr.CreatedBy
     WHERE cr.CrossReportID = @Id`
  );
  if (result.recordset.length === 0) throw new NotFoundError('Cross report not found');
  return result.recordset[0];
}

function decode(row: any): CrossReport {
  return {
    CrossReportID: row.CrossReportID,
    Name: row.Name,
    Description: row.Description,
    TemplateIDs: JSON.parse(row.TemplateIDsJSON ?? '[]'),
    FieldMappings: JSON.parse(row.FieldMappingsJSON ?? '[]'),
    LayoutJSON: row.LayoutJSON,
    CreatedBy: row.CreatedBy,
    CreatedAt: row.CreatedAt,
    UpdatedAt: row.UpdatedAt,
  };
}

export async function listCrossReports(userId: number, role: string): Promise<CrossReport[]> {
  const isManager = ['Administrator', 'Marketing Manager', 'Marketing Analyst'].includes(role);
  const request = db.request();
  let where = '1=1';
  if (!isManager) {
    where = 'cr.CreatedBy = @UserId';
    request.input('UserId', sql.Int, userId);
  }
  const result = await request.query(
    `SELECT * FROM dbo.FormCrossReport cr WHERE ${where} ORDER BY cr.UpdatedAt DESC, cr.CreatedAt DESC`
  );
  return result.recordset.map(decode);
}

export async function getCrossReport(id: number, userId: number, role: string): Promise<CrossReport> {
  const row = await getRow(id);
  const isManager = ['Administrator', 'Marketing Manager', 'Marketing Analyst'].includes(role);
  if (!isManager && row.CreatedBy !== userId) throw new ForbiddenError('You can only view your own cross reports');
  return decode(row);
}

export async function createCrossReport(data: {
  name: string;
  description?: string;
  templateIds: number[];
  fieldMappings: FieldMapping[];
  userId: number;
}): Promise<number> {
  if (data.templateIds.length < 2) throw new BadRequestError('A cross report requires at least two forms', 'MIN_TWO_FORMS');
  if (data.templateIds.length !== new Set(data.templateIds).size) throw new BadRequestError('Duplicate forms selected', 'DUPLICATE_FORMS');

  // Validate every mapping references a real field on its form.
  for (const mapping of data.fieldMappings) {
    for (const [tid, key] of Object.entries(mapping.fieldKeys)) {
      const version = await getPublishedVersion(Number(tid)).catch(() => null);
      const elements = version ? parseSchema(version.SchemaJSON).elements : [];
      if (!elements.some((e) => e.key === key)) {
        throw new BadRequestError(`Mapping "${mapping.displayName}" references unknown field "${key}" on form ${tid}`, 'INVALID_FIELD_MAPPING');
      }
    }
  }

  const insert = await db
    .request()
    .input('Name', sql.NVarChar(200), data.name)
    .input('Description', sql.NVarChar(sql.MAX), data.description ?? null)
    .input('TemplateIds', sql.NVarChar(sql.MAX), JSON.stringify(data.templateIds))
    .input('Mappings', sql.NVarChar(sql.MAX), JSON.stringify(data.fieldMappings))
    .input('CreatedBy', sql.Int, data.userId)
    .query(
      `INSERT INTO dbo.FormCrossReport (Name, Description, TemplateIDsJSON, FieldMappingsJSON, CreatedBy)
       OUTPUT INSERTED.CrossReportID VALUES (@Name, @Description, @TemplateIds, @Mappings, @CreatedBy)`
    );
  const id = insert.recordset[0].CrossReportID;
  await audit({ userId: data.userId, action: 'CROSS_REPORT_CREATED', entity: 'FormCrossReport', entityId: id });
  return id;
}

export async function updateCrossReport(id: number, data: {
  name?: string;
  description?: string | null;
  templateIds?: number[];
  fieldMappings?: FieldMapping[];
  layout?: string | null;
  userId: number;
}): Promise<void> {
  const row = await getRow(id);
  if (row.CreatedBy !== data.userId && data.userId !== 1) throw new ForbiddenError('Only the creator can edit this cross report');
  const request = db.request().input('Id', sql.Int, id);
  const sets: string[] = ['UpdatedAt = SYSUTCDATETIME()'];
  if (data.name !== undefined) { sets.push('Name = @Name'); request.input('Name', sql.NVarChar(200), data.name); }
  if (data.description !== undefined) { sets.push('Description = @Description'); request.input('Description', sql.NVarChar(sql.MAX), data.description); }
  if (data.templateIds !== undefined) { sets.push('TemplateIDsJSON = @TemplateIds'); request.input('TemplateIds', sql.NVarChar(sql.MAX), JSON.stringify(data.templateIds)); }
  if (data.fieldMappings !== undefined) { sets.push('FieldMappingsJSON = @Mappings'); request.input('Mappings', sql.NVarChar(sql.MAX), JSON.stringify(data.fieldMappings)); }
  if (data.layout !== undefined) { sets.push('LayoutJSON = @Layout'); request.input('Layout', sql.NVarChar(sql.MAX), data.layout); }
  if (sets.length === 1) return;
  await request.query(`UPDATE dbo.FormCrossReport SET ${sets.join(', ')} WHERE CrossReportID = @Id`);
  await audit({ userId: data.userId, action: 'CROSS_REPORT_UPDATED', entity: 'FormCrossReport', entityId: id });
}

export async function deleteCrossReport(id: number, userId: number): Promise<void> {
  const row = await getRow(id);
  if (row.CreatedBy !== userId && userId !== 1) throw new ForbiddenError('Only the creator can delete this cross report');
  await db.request().input('Id', sql.Int, id).query('DELETE FROM dbo.FormCrossReport WHERE CrossReportID = @Id');
  await audit({ userId, action: 'CROSS_REPORT_DELETED', entity: 'FormCrossReport', entityId: id });
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------
async function rawAnswers(templateId: number, fieldKey: string, filters: ReportFilters): Promise<{ values: unknown[]; count: number }> {
  const request = db.request().input('TemplateId', sql.Int, templateId).input('Key', sql.VarChar(100), fieldKey);
  const where = ["r.TemplateID = @TemplateId", "r.Status = 'Submitted'", 'r.IsErased = 0', 'a.FieldKey = @Key'];
  if (filters.from) { where.push('r.SubmittedAt >= @From'); request.input('From', sql.DateTime2, filters.from); }
  if (filters.to) { where.push('r.SubmittedAt <= @To'); request.input('To', sql.DateTime2, filters.to); }
  const result = await request.query(
    `SELECT a.ValueJSON, COUNT(*) AS Cnt FROM dbo.ResponseAnswer a
     JOIN dbo.FormResponse r ON r.ResponseID = a.ResponseID
     WHERE ${where.join(' AND ')}
     GROUP BY a.ValueJSON`
  );
  const values: unknown[] = [];
  let count = 0;
  for (const row of result.recordset) {
    let v: unknown;
    try { v = JSON.parse(row.ValueJSON); } catch { v = row.ValueJSON; }
    count += Number(row.Cnt);
    const flat = Array.isArray(v) ? v : [v];
    for (const item of flat) values.push(item);
  }
  return { values, count };
}

function summarize(type: string, values: unknown[], count: number): Record<string, unknown> {
  const out: Record<string, unknown> = { count };
  if (type === 'rating' || type === 'number' || type === 'slider') {
    const nums = values.map((n) => Number(n)).filter((n) => Number.isFinite(n));
    out.count = nums.length;
    out.avg = nums.length ? Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2)) : null;
    out.min = nums.length ? Math.min(...nums) : null;
    out.max = nums.length ? Math.max(...nums) : null;
  } else if (type === 'dropdown' || type === 'multiplechoice' || type === 'yesno') {
    const counts: Record<string, number> = {};
    for (const v of values) counts[String(v)] = (counts[String(v)] ?? 0) + 1;
    out.count = values.length;
    out.optionCounts = counts;
  } else if (type === 'date' || type === 'datetime') {
    const byMonth: Record<string, number> = {};
    for (const v of values) {
      const m = String(v).slice(0, 7);
      byMonth[m] = (byMonth[m] ?? 0) + 1;
    }
    out.count = values.length;
    out.byMonth = byMonth;
  }
  return out;
}

export async function getCrossReportReport(id: number, filters: ReportFilters, userId: number, role: string): Promise<any> {
  const report = await getCrossReport(id, userId, role);
  const templates: any[] = [];
  const schemaByTemplate: Record<number, FormElement[]> = {};
  for (const tid of report.TemplateIDs) {
    const form = await getForm(tid).catch(() => null);
    const version = await getPublishedVersion(tid).catch(() => null);
    const elements = version ? parseSchema(version.SchemaJSON).elements : [];
    if (form) {
      templates.push({ templateId: tid, title: form.Title });
      schemaByTemplate[tid] = elements;
    }
  }

  const fields: any[] = [];
  for (const mapping of report.FieldMappings) {
    // Determine type from the first form that has this mapping key.
    let type = 'shorttext';
    for (const [tid, key] of Object.entries(mapping.fieldKeys)) {
      const el = (schemaByTemplate[Number(tid)] ?? []).find((e) => e.key === key);
      if (el) { type = el.type; break; }
    }
    const allValues: unknown[] = [];
    let total = 0;
    for (const [tid, key] of Object.entries(mapping.fieldKeys)) {
      const { values, count } = await rawAnswers(Number(tid), key, filters);
      allValues.push(...values);
      total += count;
    }
    fields.push({ key: mapping.displayName, label: mapping.displayName, type, summary: summarize(type, allValues, total) });
  }

  return {
    crossReport: { id: report.CrossReportID, name: report.Name },
    templates,
    filters,
    total: fields.reduce((s, f) => s + (f.summary.count ?? 0), 0),
    lastUpdated: new Date().toISOString(),
    fields,
  };
}
