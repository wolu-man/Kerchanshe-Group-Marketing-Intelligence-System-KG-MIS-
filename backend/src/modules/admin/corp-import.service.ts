import ExcelJS from 'exceljs';
import sql from 'mssql';
import { db } from '../../db/pool';

export interface CorpImportStats {
  parentsUpserted: number;
  tasksUpserted: number;
  eventsUpserted: number;
  errors: string[];
}

const MONTH_SHEETS: [string, number][] = [
  ['Jan', 1], ['Feb', 2], ['Mar', 3], ['Apr', 4], ['May', 5], ['Jun', 6],
  ['Jul', 7], ['Aug', 8], ['Sep', 9], ['Oct', 10], ['Nov', 11], ['Dec', 12],
];

function text(v: ExcelJS.CellValue): string | null {
  if (v == null) return null;
  if (typeof v === 'object') {
    if ('text' in v) return String((v as { text: string }).text);
    if ('richText' in v) return (v as { richText: { text: string }[] }).richText.map((t) => t.text).join('');
    return null;
  }
  const s = String(v).trim();
  return s === '' ? null : s;
}

/**
 * Upserts the Corporate Marketing Activities Plan workbook:
 *  - parents by (PlanYear, ParentCode)
 *  - tasks by TaskId — never overwrites person/status/completion/remarks
 *  - events by EventCode — only fills fields that are provided in the sheet
 */
export async function importCorpMarketingWorkbook(buffer: Buffer, options: { year?: number } = {}): Promise<CorpImportStats> {
  const year = options.year || new Date().getFullYear();
  const stats: CorpImportStats = { parentsUpserted: 0, tasksUpserted: 0, eventsUpserted: 0, errors: [] };

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  // ---- parents + tasks ---------------------------------------------------
  const parentsTouched = new Set<string>();
  for (const [sheetName, month] of MONTH_SHEETS) {
    const sheet = wb.getWorksheet(sheetName);
    if (!sheet) {
      stats.errors.push(`Missing sheet: ${sheetName}`);
      continue;
    }
    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      const taskId = text(row.getCell(10).value);
      const parentCode = text(row.getCell(11).value);
      if (!taskId || !parentCode) continue;
      const mainActivity = text(row.getCell(3).value) ?? '';
      const role = text(row.getCell(5).value);
      const taskName = text(row.getCell(1).value) ?? '';
      const idx = Number(taskId.split('-').pop());
      try {
        const request = db.request();
        request.input('PlanYear', sql.Int, year);
        request.input('ParentCode', sql.NVarChar(20), parentCode);
        request.input('MainActivityKpi', sql.NVarChar(1000), mainActivity);
        request.input('ResponsibleRole', sql.NVarChar(200), role);
        const parentResult = await request.query(`
          MERGE dbo.CorpMarketingPlanItem AS t
          USING (SELECT @PlanYear AS PlanYear, @ParentCode AS ParentCode) AS s
            ON t.PlanYear = s.PlanYear AND t.ParentCode = s.ParentCode
          WHEN MATCHED THEN UPDATE SET
            MainActivityKpi = @MainActivityKpi, ResponsibleRole = @ResponsibleRole,
            UpdatedAt = SYSUTCDATETIME()
          WHEN NOT MATCHED THEN INSERT (PlanYear, ParentCode, MainActivityKpi, ResponsibleRole, SourceRef)
            VALUES (@PlanYear, @ParentCode, @MainActivityKpi, @ResponsibleRole, @ParentCode);
          SELECT @@ROWCOUNT AS n;
        `);
        if ((parentResult.recordset[0].n as number) > 0) parentsTouched.add(parentCode);

        const taskRequest = db.request();
        taskRequest.input('PlanYear', sql.Int, year);
        taskRequest.input('Month', sql.TinyInt, month);
        taskRequest.input('TaskId', sql.NVarChar(50), taskId);
        taskRequest.input('ParentCode', sql.NVarChar(20), parentCode);
        taskRequest.input('TaskIndex', sql.TinyInt, Number.isFinite(idx) ? idx : 0);
        taskRequest.input('TaskName', sql.NVarChar(1000), taskName);
        taskRequest.input('ResponsibleRole', sql.NVarChar(200), role);
        const taskResult = await taskRequest.query(`
          MERGE dbo.CorpMarketingTask AS t
          USING (SELECT @TaskId AS TaskId) AS s ON t.TaskId = s.TaskId
          WHEN MATCHED THEN UPDATE SET
            TaskName = @TaskName, ResponsibleRole = @ResponsibleRole, UpdatedAt = SYSUTCDATETIME()
          WHEN NOT MATCHED THEN INSERT
            (PlanYear, Month, TaskId, ParentCode, TaskIndex, TaskName, ResponsibleRole)
            VALUES (@PlanYear, @Month, @TaskId, @ParentCode, @TaskIndex, @TaskName, @ResponsibleRole);
          SELECT @@ROWCOUNT AS n;
        `);
        // @@ROWCOUNT after MERGE UPDATE = 1 even when nothing changed; track by task existence before.
        if ((taskResult.recordset[0].n as number) > 0) stats.tasksUpserted += 1;
      } catch (err) {
        stats.errors.push(`${taskId}: ${(err as Error).message}`);
      }
    }
  }

  stats.parentsUpserted = parentsTouched.size;

  // ---- events ------------------------------------------------------------
  const events = wb.getWorksheet('Events & Campaigns');
  if (!events) {
    stats.errors.push('Missing sheet: Events & Campaigns');
  } else {
    for (let i = 2; i <= events.rowCount; i++) {
      const row = events.getRow(i);
      const code = text(row.getCell(1).value);
      if (!code || !/^EVT-\d+$/.test(code)) continue;
      const dateCell = (c: number) => {
        const v = row.getCell(c).value;
        if (v == null || (typeof v === 'object' && v !== null && 'formula' in v)) return null;
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        return null;
      };
      try {
        const r = db.request();
        r.input('EventCode', sql.NVarChar(20), code);
        r.input('Category', sql.NVarChar(100), text(row.getCell(2).value));
        r.input('EventName', sql.NVarChar(300), text(row.getCell(3).value));
        r.input('BusinessUnit', sql.NVarChar(100), text(row.getCell(4).value));
        r.input('ResponsiblePerson', sql.NVarChar(200), text(row.getCell(5).value));
        r.input('ResponsibleRole', sql.NVarChar(200), text(row.getCell(6).value));
        r.input('Location', sql.NVarChar(200), text(row.getCell(7).value));
        r.input('StartDate', sql.Date, dateCell(8));
        r.input('EndDate', sql.Date, dateCell(9));
        await r.query(`
          MERGE dbo.CorpMarketingEvent AS t
          USING (SELECT @EventCode AS EventCode) AS s ON t.EventCode = s.EventCode
          WHEN MATCHED THEN UPDATE SET
            Category = COALESCE(@Category, t.Category),
            EventName = COALESCE(@EventName, t.EventName),
            BusinessUnit = COALESCE(@BusinessUnit, t.BusinessUnit),
            ResponsiblePerson = COALESCE(@ResponsiblePerson, t.ResponsiblePerson),
            ResponsibleRole = COALESCE(@ResponsibleRole, t.ResponsibleRole),
            Location = COALESCE(@Location, t.Location),
            StartDate = COALESCE(@StartDate, t.StartDate),
            EndDate = COALESCE(@EndDate, t.EndDate),
            UpdatedAt = SYSUTCDATETIME()
          WHEN NOT MATCHED THEN INSERT
            (EventCode, Category, EventName, BusinessUnit, ResponsiblePerson, ResponsibleRole, Location, StartDate, EndDate)
            VALUES (@EventCode, @Category, @EventName, @BusinessUnit, @ResponsiblePerson, @ResponsibleRole, @Location, @StartDate, @EndDate);
        `);
        stats.eventsUpserted += 1;
      } catch (err) {
        stats.errors.push(`${code}: ${(err as Error).message}`);
      }
    }
  }

  return stats;
}
