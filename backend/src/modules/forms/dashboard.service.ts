import sql from 'mssql';
import { db } from '../../db/pool';
import { getPublishedVersion } from './forms.service';
import { computeFieldStates, type FormElement } from './formSchema';

// Dashboard widget kinds supported by the front-end renderer.
export type WidgetKind =
  | 'kpi'
  | 'bar'
  | 'pie'
  | 'line'
  | 'numberStat'
  | 'table';

export interface DashboardWidget {
  id: string;
  kind: WidgetKind;
  fieldKey?: string;
  title: string;
  size: { w: number; h: number };
}

export interface DashboardLayout {
  widgets: DashboardWidget[];
}

// Auto-generated default layout based on the published schema (FR-01.18/01.19).
function defaultLayout(schema: FormElement[]): DashboardLayout {
  const widgets: DashboardWidget[] = [];
  widgets.push({ id: 'kpi-total', kind: 'kpi', title: 'Total Responses', size: { w: 2, h: 1 } });
  const analyticTypes = new Set(['rating', 'number', 'slider', 'dropdown', 'multiplechoice', 'yesno', 'date']);
  for (const el of schema) {
    if (!analyticTypes.has(el.type)) continue;
    const kind: WidgetKind =
      el.type === 'rating' || el.type === 'number' || el.type === 'slider' ? 'numberStat'
      : el.type === 'yesno' || el.type === 'dropdown' ? 'pie'
      : el.type === 'date' ? 'line' : 'bar';
    widgets.push({ id: `field-${el.key}`, kind, fieldKey: el.key, title: el.label, size: { w: 2, h: 2 } });
  }
  return { widgets };
}

export async function getDashboard(templateId: number, userId: number): Promise<DashboardLayout> {
  const row = await db
    .request()
    .input('TemplateId', sql.Int, templateId)
    .input('UserId', sql.Int, userId)
    .query(
      `SELECT LayoutJSON FROM dbo.FormDashboard
       WHERE TemplateID = @TemplateId AND UserID = @UserId`
    );
  if (row.recordset.length > 0) {
    try { return JSON.parse(row.recordset[0].LayoutJSON); } catch { return defaultLayout([]); }
  }
  const version = await getPublishedVersion(templateId).catch(() => null);
  const schema = version ? (() => { try { return JSON.parse(version.SchemaJSON) as FormElement[]; } catch { return [] as FormElement[]; } })() : [];
  return defaultLayout(schema);
}

export async function saveDashboard(templateId: number, userId: number, layout: DashboardLayout): Promise<void> {
  await db
    .request()
    .input('TemplateId', sql.Int, templateId)
    .input('UserId', sql.Int, userId)
    .input('Layout', sql.NVarChar(sql.MAX), JSON.stringify(layout))
    .query(
      `MERGE dbo.FormDashboard AS t
       USING (SELECT @TemplateId AS TemplateID, @UserId AS UserID) AS s
         ON t.TemplateID = s.TemplateID AND t.UserID = s.UserID
       WHEN MATCHED THEN UPDATE SET t.LayoutJSON = @Layout, t.UpdatedAt = SYSUTCDATETIME()
       WHEN NOT MATCHED THEN INSERT (TemplateID, UserID, LayoutJSON)
            VALUES (@TemplateId, @UserId, @Layout);`
    );
}

/** Exports the field states model for a schema (used by front-end rendering). */
export function exportFieldStates(schema: FormElement[]): ReturnType<typeof computeFieldStates> {
  return computeFieldStates(schema, {});
}
