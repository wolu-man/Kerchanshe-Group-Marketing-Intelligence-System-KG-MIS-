import sql from 'mssql';
import { db } from '../../db/pool';
import { NotFoundError, BadRequestError } from '../../utils/errors';
import { parseSchema } from './formSchema';
import { getPublishedVersion, getForm } from './forms.service';
import { dispatchEvent } from '../notifications/notifications.service';

// ---------------------------------------------------------------------------
// Rule-based data anomaly detection (DR-13, OP-07). Statistical checks on
// numeric/rating/slider fields and free-text length, plus behavioral flags.
// Flags NEVER delete or reject responses unless FormTemplate.AutoRejectAnomalies
// is enabled (per SRS: "do not automatically delete or reject unless explicitly
// configured").
// ---------------------------------------------------------------------------

const MIN_SECONDS_FAST_SUBMIT = 20;
const BURST_PER_HOUR = 10;

export interface AnomalyInput {
  templateId: number;
  responseId: number;
  ip?: string;
  createdViaDraft?: boolean;
}

async function insertFlag(f: { responseId: number; templateId: number; fieldKey?: string; type: string; score?: number; reason: string }): Promise<void> {
  await db
    .request()
    .input('ResponseId', sql.Int, f.responseId)
    .input('TemplateId', sql.Int, f.templateId)
    .input('FieldKey', sql.VarChar(100), f.fieldKey ?? null)
    .input('Type', sql.VarChar(50), f.type)
    .input('Score', sql.Decimal(8, 3), f.score ?? null)
    .input('Reason', sql.NVarChar(500), f.reason)
    .query(
      `INSERT INTO dbo.FormAnomalyFlag (ResponseID, TemplateID, FieldKey, AnomalyType, Score, Reason)
       VALUES (@ResponseId, @TemplateId, @FieldKey, @Type, @Score, @Reason)`
    );
}

function zScore(value: number, mean: number, stdev: number): number {
  if (!Number.isFinite(stdev) || stdev === 0) return 0;
  return Math.abs((value - mean) / stdev);
}

async function statForNumeric(templateId: number, fieldKey: string): Promise<{ mean: number; stdev: number; count: number }> {
  const rows = await db.request().input('TemplateId', sql.Int, templateId).input('Key', sql.VarChar(100), fieldKey).query(
    `SELECT ValueJSON FROM dbo.ResponseAnswer a
     JOIN dbo.FormResponse r ON r.ResponseID = a.ResponseID
     WHERE r.TemplateID = @TemplateId AND r.Status = 'Submitted' AND r.IsErased = 0 AND a.FieldKey = @Key`
  );
  const nums: number[] = [];
  for (const row of rows.recordset) {
    let v: unknown;
    try { v = JSON.parse(row.ValueJSON); } catch { v = row.ValueJSON; }
    const n = Number(v);
    if (Number.isFinite(n)) nums.push(n);
  }
  if (nums.length < 5) return { mean: 0, stdev: 0, count: nums.length };
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const variance = nums.reduce((a, b) => a + (b - mean) * (b - mean), 0) / nums.length;
  return { mean, stdev: Math.sqrt(variance), count: nums.length };
}

async function statForTextLength(templateId: number, fieldKey: string): Promise<{ mean: number; stdev: number; count: number }> {
  const rows = await db.request().input('TemplateId', sql.Int, templateId).input('Key', sql.VarChar(100), fieldKey).query(
    `SELECT LEN(a.ValueJSON) AS Len FROM dbo.ResponseAnswer a
     JOIN dbo.FormResponse r ON r.ResponseID = a.ResponseID
     WHERE r.TemplateID = @TemplateId AND r.Status = 'Submitted' AND r.IsErased = 0 AND a.FieldKey = @Key`
  );
  const lens = rows.recordset.map((r: any) => Number(r.Len)).filter((n: number) => Number.isFinite(n));
  if (lens.length < 5) return { mean: 0, stdev: 0, count: lens.length };
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  const variance = lens.reduce((a, b) => a + (b - mean) * (b - mean), 0) / lens.length;
  return { mean, stdev: Math.sqrt(variance), count: lens.length };
}

async function answersFor(responseId: number): Promise<Record<string, unknown>> {
  const rows = await db.request().input('ResponseId', sql.Int, responseId).query(
    `SELECT FieldKey, ValueJSON FROM dbo.ResponseAnswer WHERE ResponseID = @ResponseId`
  );
  const out: Record<string, unknown> = {};
  for (const r of rows.recordset) {
    try { out[r.FieldKey] = JSON.parse(r.ValueJSON); } catch { out[r.FieldKey] = r.ValueJSON; }
  }
  return out;
}

export async function detectAnomalies(input: AnomalyInput): Promise<void> {
  const newFlags: Array<{ type: string; fieldKey?: string; score?: number; reason: string }> = [];

  // 1. Too-fast completion.
  const resp = await db.request().input('ResponseId', sql.Int, input.responseId).query(
    `SELECT CreatedAt, SubmittedAt, IPAddress FROM dbo.FormResponse WHERE ResponseID = @ResponseId`
  );
  if (resp.recordset.length === 0) return;
  const row = resp.recordset[0];
  if (row.CreatedAt && row.SubmittedAt) {
    const seconds = (new Date(row.SubmittedAt).getTime() - new Date(row.CreatedAt).getTime()) / 1000;
    if (seconds >= 0 && seconds < MIN_SECONDS_FAST_SUBMIT) {
      const flag = { type: 'too_fast', reason: `Response submitted in ${Math.round(seconds)}s (under ${MIN_SECONDS_FAST_SUBMIT}s).` };
      await insertFlag({ responseId: input.responseId, templateId: input.templateId, ...flag });
      newFlags.push(flag);
    }
  }

  // 2. Duplicate / burst submissions from one IP.
  const ip = input.ip ?? row.IPAddress;
  if (ip) {
    const burst = await db.request().input('Ip', sql.VarChar(45), ip).query(
      `SELECT COUNT(*) AS Cnt FROM dbo.FormResponse
       WHERE IPAddress = @Ip AND Status = 'Submitted' AND SubmittedAt >= DATEADD(hour, -1, SYSUTCDATETIME())`
    );
    if (Number(burst.recordset[0].Cnt) > BURST_PER_HOUR) {
      const flag = { type: 'duplicate_burst', reason: `IP ${ip} submitted ${burst.recordset[0].Cnt} responses in the last hour.` };
      await insertFlag({ responseId: input.responseId, templateId: input.templateId, ...flag });
      newFlags.push(flag);
    }
  }

  // 3. Statistical outliers on numeric / text fields.
  const version = await getPublishedVersion(input.templateId).catch(() => null);
  if (!version) return;
  const schema = parseSchema(version.SchemaJSON);
  const answers = await answersFor(input.responseId);

  for (const el of schema.elements) {
    const value = answers[el.key];
    if (el.type === 'number' || el.type === 'rating' || el.type === 'slider') {
      const n = Number(value);
      if (!Number.isFinite(n)) continue;
      const stat = await statForNumeric(input.templateId, el.key);
      if (stat.count >= 5) {
        const z = zScore(n, stat.mean, stat.stdev);
        if (z > 3) {
          const flag = { type: 'outlier', fieldKey: el.key, score: Math.round(z * 100) / 100, reason: `"${el.label}" value ${n} is ${z.toFixed(2)}σ from the mean (${stat.mean.toFixed(2)}).` };
          await insertFlag({ responseId: input.responseId, templateId: input.templateId, ...flag });
          newFlags.push(flag);
        }
      }
    } else if (el.type === 'shorttext' || el.type === 'longtext') {
      const text = String(value ?? '');
      const stat = await statForTextLength(input.templateId, el.key);
      if (stat.count >= 5) {
        const z = zScore(text.length, stat.mean, stat.stdev);
        if (z > 3) {
          const flag = { type: 'outlier', fieldKey: el.key, score: Math.round(z * 100) / 100, reason: `"${el.label}" answer length (${text.length}) is ${z.toFixed(2)}σ from the mean (${stat.mean.toFixed(0)} chars).` };
          await insertFlag({ responseId: input.responseId, templateId: input.templateId, ...flag });
          newFlags.push(flag);
        }
      }
    }
  }

  if (newFlags.length > 0) {
    const form = await getForm(input.templateId).catch(() => null);
    await dispatchEvent({
      event: 'ANOMALY_FLAGGED',
      subject: `Anomalies detected in form: ${form?.Title ?? input.templateId}`,
      body: `${newFlags.length} anomal${newFlags.length === 1 ? 'y' : 'ies'} detected in response ${input.responseId} for form "${form?.Title ?? input.templateId}".`,
      payload: { templateId: input.templateId, responseId: input.responseId, flagCount: newFlags.length, types: newFlags.map(f => f.type) },
    });
  }
}

export async function listAnomalies(templateId: number): Promise<any[]> {
  const result = await db.request().input('Id', sql.Int, templateId).query(
    `SELECT f.FlagID, f.ResponseID, f.FieldKey, f.AnomalyType, f.Score, f.Reason, f.Status,
            f.AutoRejected, f.Resolution, f.CreatedAt, f.ReviewedAt,
            u.Name AS ReviewedByName,
            r.SubmittedAt, r.RespondentEmail
     FROM dbo.FormAnomalyFlag f
     JOIN dbo.FormResponse r ON r.ResponseID = f.ResponseID
     LEFT JOIN dbo.[User] u ON u.UserID = f.ReviewedBy
     WHERE f.TemplateID = @Id
     ORDER BY f.CreatedAt DESC`
  );
  return result.recordset;
}

export async function updateAnomalyFlag(flagId: number, data: { status: string; resolution?: string; userId: number }): Promise<void> {
  if (!['Pending', 'Acknowledged', 'Resolved'].includes(data.status)) {
    throw new BadRequestError('Invalid anomaly status', 'INVALID_STATUS');
  }
  const result = await db
    .request()
    .input('Id', sql.Int, flagId)
    .input('Status', sql.VarChar(20), data.status)
    .input('Resolution', sql.NVarChar(500), data.resolution ?? null)
    .input('ReviewedBy', sql.Int, data.userId)
    .query(
      `UPDATE dbo.FormAnomalyFlag
       SET Status = @Status, Resolution = @Resolution, ReviewedBy = @ReviewedBy, ReviewedAt = SYSUTCDATETIME()
       WHERE FlagID = @Id`
    );
  if (result.rowsAffected[0] === 0) throw new NotFoundError('Anomaly flag not found');
}

/** Full re-scan of all responses for a form (nightly job / on-demand). */
export async function recomputeAnomalies(templateId: number): Promise<number> {
  // Clear previous Pending flags so only live anomalies remain.
  await db.request().input('Id', sql.Int, templateId).query(
    `DELETE FROM dbo.FormAnomalyFlag WHERE TemplateID = @Id AND Status = 'Pending'`
  );
  const responses = await db.request().input('Id', sql.Int, templateId).query(
    `SELECT ResponseID FROM dbo.FormResponse WHERE TemplateID = @Id AND Status = 'Submitted' AND IsErased = 0`
  );
  for (const r of responses.recordset) {
    await detectAnomalies({ templateId, responseId: r.ResponseID });
  }
  return responses.recordset.length;
}
