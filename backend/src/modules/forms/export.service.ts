import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { getReport, type ReportFilters } from './responses.service';
import { db } from '../../db/pool';
import sql from 'mssql';

// ---------------------------------------------------------------------------
// Excel export (FR-01.18): Raw Responses + Summary + Chart Data sheets.
// ---------------------------------------------------------------------------
export async function exportExcel(templateId: number, filters: ReportFilters): Promise<Buffer> {
  const report = await getReport(templateId, filters);
  const workbook = new ExcelJS.Workbook();
  const summary = workbook.addWorksheet('Summary');

  summary.columns = [
    { header: 'Field', key: 'field', width: 30 },
    { header: 'Type', key: 'type', width: 16 },
    { header: 'Responses', key: 'responses', width: 14 },
    { header: 'Avg / Top', key: 'detail', width: 60 },
  ];
  for (const f of report.fields) {
    const s = f.summary as Record<string, unknown>;
    let detail = '';
    if (s.optionCounts) detail = JSON.stringify(s.optionCounts);
    else if (s.avg !== null && s.avg !== undefined) detail = `avg=${s.avg} min=${s.min} max=${s.max}`;
    else if (s.byMonth) detail = JSON.stringify(s.byMonth);
    summary.addRow({ field: f.label, type: f.type, responses: s.count, detail });
  }

  const raw = workbook.addWorksheet('Responses');
  const answers = await db.request().input('TemplateId', sql.Int, templateId).query(
    `SELECT r.ResponseID, r.SubmittedAt, r.RespondentEmail, a.FieldKey, a.ValueJSON
     FROM dbo.FormResponse r
     JOIN dbo.ResponseAnswer a ON a.ResponseID = r.ResponseID
     WHERE r.TemplateID = @TemplateId AND r.Status = 'Submitted' AND r.IsErased = 0
     ORDER BY r.SubmittedAt DESC`
  );
  const groups = new Map<number, { submitted: Date; email: string | null; answers: Record<string, unknown> }>();
  for (const row of answers.recordset) {
    if (!groups.has(row.ResponseID)) {
      groups.set(row.ResponseID, { submitted: row.SubmittedAt, email: row.RespondentEmail, answers: {} });
    }
      try { groups.get(row.ResponseID)!.answers[row.FieldKey] = JSON.parse(row.ValueJSON); } catch { groups.get(row.ResponseID)!.answers[row.FieldKey] = row.ValueJSON; }
  }
  const headers = ['Response ID', 'Submitted At', 'Respondent Email', ...report.fields.map((f: any) => f.label)];
  raw.addRow(headers);
  for (const [id, g] of groups) {
    const values = headers.map((_h: string, i: number) => {
      if (i === 0) return id;
      if (i === 1) return new Date(g.submitted).toISOString();
      if (i === 2) return g.email ?? '';
      const field = report.fields[i - 3];
      const v = g.answers[field.key];
      return v === undefined ? '' : JSON.stringify(v);
    });
    raw.addRow(values);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ---------------------------------------------------------------------------
// PDF export (FR-01.18): printable executive summary.
// ---------------------------------------------------------------------------
export function exportPdf(templateId: number, filters: ReportFilters): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const report = await getReport(templateId, filters);
      const doc = new PDFDocument({ margin: 40 });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(18).text(report.template.title, { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).text(`Response Report  -  Generated ${new Date(report.lastUpdated).toLocaleString()}`, { align: 'center' });
      doc.moveDown();
      doc.fontSize(14).text(`Total responses: ${report.total}`);
      doc.moveDown();

      for (const f of report.fields) {
        doc.fontSize(12).text(`${f.label} (${f.type})`);
        const s = f.summary as Record<string, unknown>;
        if (s.count === 0) {
          doc.fontSize(10).text('  No responses for this field');
        } else if (s.avg !== null && s.avg !== undefined) {
          doc.fontSize(10).text(`  avg=${s.avg}, min=${s.min}, max=${s.max} (${s.count} responses)`);
        } else if (s.optionCounts) {
          const entries = Object.entries(s.optionCounts as Record<string, number>);
          entries.sort((a, b) => b[1] - a[1]);
          for (const [k, v] of entries) doc.fontSize(10).text(`  ${k}: ${v}`);
        } else if (s.byMonth) {
          const entries = Object.entries(s.byMonth as Record<string, number>);
          entries.sort((a, b) => (a[0] < b[0] ? -1 : 1));
          for (const [k, v] of entries) doc.fontSize(10).text(`  ${k}: ${v}`);
        }
        doc.moveDown(0.4);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
