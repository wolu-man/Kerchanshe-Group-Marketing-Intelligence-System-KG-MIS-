import ExcelJS from 'exceljs';
import { db } from '../../db/pool';
import { createKpiDef, updateKpiDef, upsertMeasurement, getKpiDef } from './kpi-config.service';

// ---------------------------------------------------------------------------
// Import of the MIS-compatible KPI workbook (xlsx).
// Sheet "MIS Annual Plan" upserts KPI definitions (KPI-001..KPI-049).
// Sheet "Measurement Entry" upserts monthly planned/actual measurement rows.
// ---------------------------------------------------------------------------

export interface ImportStats {
  definitionsCreated: number;
  definitionsUpdated: number;
  measurementsUpserted: number;
  measurementsSkipped: number;
  rows: number;
  errors: string[];
}

function decodeCell(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return String(v.text);
    if ('result' in v) return v.result == null ? '' : String(v.result);
    return '';
  }
  return String(v);
}

function headerMap(row: ExcelJS.Row): Map<string, number> {
  const map = new Map<string, number>();
  const values = row.values as ExcelJS.CellValue[];
  values.forEach((v, i) => {
    const key = decodeCell(v).trim().toLowerCase();
    if (key) map.set(key, i); // row.values is 1-based
  });
  return map;
}

function cell(row: ExcelJS.Row, map: Map<string, number>, key: string): string {
  const idx = map.get(key);
  if (idx == null) return '';
  return decodeCell(row.getCell(idx).value).trim();
}

function findHeader(sheet: ExcelJS.Worksheet, required: string[]): { rowNumber: number; map: Map<string, number> } | null {
  let found: { rowNumber: number; map: Map<string, number> } | null = null;
  sheet.eachRow((row, rowNumber) => {
    if (found) return;
    const map = headerMap(row);
    if (required.every((k) => map.has(k))) found = { rowNumber, map };
  });
  return found;
}

function parseLeadingNumber(text: string): number | null {
  const s = text.replace(/,/g, '').trim();
  const m = s.match(/^±?\s*(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

function parsePercent(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? Number(m[1]) : null;
}

function parsePlannedNumber(v: string): number | null {
  const s = v.trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  const k = s.match(/^(\d+(?:\.\d+)?)k\+?$/i);
  if (k) return Number(k[1]) * 1000;
  return null;
}

function measurementUnitFor(uom: string): string {
  if (uom === '%') return 'Percentage';
  if (uom === 'ETB/USD' || uom === 'Birr' || uom === 'cost/unit') return 'Amount';
  return 'Count';
}

function directionFor(d: string): 'HigherIsBetter' | 'LowerIsBetter' {
  return /lower/i.test(d) ? 'LowerIsBetter' : 'HigherIsBetter';
}

function pad3(n: number | string): string {
  return String(n).padStart(3, '0');
}

export async function importKpiWorkbook(buffer: Buffer, year?: number): Promise<ImportStats> {
  const stats: ImportStats = {
    definitionsCreated: 0,
    definitionsUpdated: 0,
    measurementsUpserted: 0,
    measurementsSkipped: 0,
    rows: 0,
    errors: [],
  };

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const importYear = year || new Date().getUTCFullYear();

  const existingDefs = await db.request().query<{ KpiDefID: number; KpiCode: string; SourceRef: string | null }>(
    `SELECT KpiDefID, KpiCode, SourceRef FROM dbo.KpiDefinition
     WHERE SourceRef IS NOT NULL OR KpiCode LIKE 'KPI-%'`
  );
  const defIdBySourceRef = new Map<string, number>();
  for (const d of existingDefs.recordset) {
    if (d.SourceRef) defIdBySourceRef.set(d.SourceRef, d.KpiDefID);
  }

  // --- Sheet: MIS Annual Plan (definitions) --------------------------------
  const planSheet = wb.getWorksheet('MIS Annual Plan');
  if (!planSheet) {
    stats.errors.push('MIS Annual Plan sheet not found');
  } else {
    const header = findHeader(planSheet, ['kpi_id', 'kpi_name']);
    if (!header) {
      stats.errors.push('MIS Annual Plan sheet: header row with kpi_id/kpi_name not found');
    } else {
      for (let r = header.rowNumber + 1; r <= planSheet.rowCount; r++) {
        const row = planSheet.getRow(r);
        const id = cell(row, header.map, 'kpi_id');
        if (!/^\d+$/.test(id)) continue;
        stats.rows++;
        try {
          const kpiCode = `KPI-${pad3(id)}`;
          const targetText = cell(row, header.map, 'annual_target');
          const alertText = cell(row, header.map, 'alert_threshold');
          const payload = {
            kpiCode,
            kpiName: cell(row, header.map, 'kpi_name'),
            description: cell(row, header.map, 'remarks') || undefined,
            category: cell(row, header.map, 'category') || undefined,
            measurementUnit: measurementUnitFor(cell(row, header.map, 'uom')),
            targetValue: parseLeadingNumber(targetText) ?? undefined,
            frequency: cell(row, header.map, 'reporting_frequency') || 'Monthly',
            direction: directionFor(cell(row, header.map, 'target_direction')),
            strategicObjective: cell(row, header.map, 'strategic_objective') || undefined,
            kpiOwnerName: cell(row, header.map, 'kpi_owner') || undefined,
            dataSource: cell(row, header.map, 'data_source') || undefined,
            collectionMethod: cell(row, header.map, 'collection_method') || undefined,
            alertThresholdText: alertText || undefined,
            alertThresholdPercent: parsePercent(alertText) ?? undefined,
            evidenceRequired: /^y/i.test(cell(row, header.map, 'evidence_required')),
            verificationRole: cell(row, header.map, 'verification_role') || undefined,
            dashboardGroup: cell(row, header.map, 'dashboard_group') || undefined,
            systemModule: cell(row, header.map, 'system_module') || undefined,
            integrationMethod: cell(row, header.map, 'integration_method') || undefined,
            targetText: targetText || undefined,
            unitOfMeasure: cell(row, header.map, 'uom') || undefined,
            sourceRef: id,
          };
          const existingId = defIdBySourceRef.get(id);
          if (existingId) {
            await updateKpiDef(existingId, payload);
            stats.definitionsUpdated++;
          } else {
            const created = await createKpiDef(payload);
            defIdBySourceRef.set(id, Number(created.kpiDefId));
            stats.definitionsCreated++;
          }
        } catch (err: any) {
          stats.errors.push(`Plan row ${r}: ${err.message}`);
        }
      }
    }
  }

  // --- Sheet: Measurement Entry (monthly rows) -----------------------------
  const measSheet = wb.getWorksheet('Measurement Entry');
  if (!measSheet) {
    stats.errors.push('Measurement Entry sheet not found');
  } else {
    const header = findHeader(measSheet, ['kpi_id', 'month_number']);
    if (!header) {
      stats.errors.push('Measurement Entry sheet: header row with kpi_id/month_number not found');
    } else {
      const unresolvable = new Set<string>();
      for (let r = header.rowNumber + 1; r <= measSheet.rowCount; r++) {
        const row = measSheet.getRow(r);
        const id = cell(row, header.map, 'kpi_id');
        if (!/^\d+$/.test(id)) continue;
        stats.rows++;
        const month = Number(cell(row, header.map, 'month_number'));
        if (!month || month < 1 || month > 12) {
          stats.errors.push(`Measurement row ${r}: invalid month_number`);
          continue;
        }
        const defId = defIdBySourceRef.get(id);
        if (!defId) {
          if (!unresolvable.has(id)) {
            unresolvable.add(id);
            stats.errors.push(`kpi_id ${id}: no KPI definition found (import the plan sheet first)`);
          }
          stats.measurementsSkipped++;
          continue;
        }
        try {
          const def = await getKpiDef(defId);
          if (!def) throw new Error('definition disappeared');
          const plannedRaw = cell(row, header.map, 'planned_value');
          const plannedNum = plannedRaw ? parsePlannedNumber(plannedRaw) : null;
          const actualRaw = cell(row, header.map, 'actual_value');
          const actualNum = actualRaw ? parsePlannedNumber(actualRaw) : null;
          const override = cell(row, header.map, 'status_override');
          const periodStart = `${importYear}-${String(month).padStart(2, '0')}-01`;
          await upsertMeasurement({
            kpiDefId: defId,
            periodStart,
            plannedValue: plannedRaw ? plannedNum : null,
            plannedText: plannedRaw && plannedNum == null ? plannedRaw : null,
            actualValue: actualRaw ? actualNum : undefined,
            statusOverride: override || undefined,
            notes: cell(row, header.map, 'notes') || undefined,
            evidenceReference: cell(row, header.map, 'evidence_reference') || undefined,
            misRecordId: cell(row, header.map, 'mis_record_id') || undefined,
          });
          stats.measurementsUpserted++;
        } catch (err: any) {
          stats.errors.push(`Measurement row ${r}: ${err.message}`);
        }
      }
    }
  }

  return stats;
}
