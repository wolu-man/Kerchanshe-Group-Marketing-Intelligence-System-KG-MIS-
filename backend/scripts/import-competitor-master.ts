/**
 * Competitor Master import
 * Reads the three Competitor Master workbooks and upserts them into
 * dbo.Competitor + dbo.CompetitorProduct (migration 030):
 *
 *  - Buna-Plate_competitors_with Price difference.xlsx  → Category 'Buna Plate' (mapped to our products by item code)
 *  - Buna-Pen_competitors and their price.xlsx         → Category 'Buna Pen'   (selling price; buying price in specs)
 *  - Geely-product and Competetors.xlsx                → Category 'Electric Vehicle' (mapped to GL-EX2/GL-EX5 via Market Role)
 *
 * Dedup: competitors matched case-insensitively on a cleaned name key
 * (strips "(...)" and trailing " N"), products upserted by (CompetitorID, ProductName).
 * Skips: our own rows (Geely category rows, pen "Buna (Current)"), plate rows
 * missing product/price (junk rows). Status is only set on INSERT — admin edits
 * to Status survive re-runs; data fields are always refreshed from the source.
 *
 * Idempotent: safe to re-run. Creates PriceGapAlert rows silently (no dispatch).
 *
 * Usage: npm run db:seed:competitors
 */
import ExcelJS from 'exceljs';
import sql from 'mssql';
import * as path from 'path';

const config: sql.config = {
  user: 'kgmis_user',
  password: 'KgMis!2026Dev',
  server: 'localhost',
  port: 50404,
  database: 'KG_MIS',
  options: { trustServerCertificate: true, encrypt: false },
};

const BASE = path.resolve(__dirname, '../../Docs/Master-data/Competitor Master');
const PLATE_FILE = path.join(BASE, 'Buna-Plate_competitors_with Price difference.xlsx');
const PEN_FILE = path.join(BASE, 'Buna-Pen_competitors and their price.xlsx');
const GEELY_FILE = path.join(BASE, 'Geely-product and Competetors.xlsx');

const CATEGORY_PLATE = 'Buna Plate';
const CATEGORY_PEN = 'Buna Pen';
const CATEGORY_EV = 'Electric Vehicle';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Entry {
  competitorName: string; // display name (existing competitor's name, or cleaned new name)
  productName: string;
  category: string;
  price: number;
  priceMax: number | null;
  effectiveDate: string | null; // YYYY-MM-DD
  ourProductId: number | null;
  notes: string | null;
  specs: Record<string, unknown>;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    if ('text' in value) return String(value.text ?? '').trim();
    if ('result' in value) return value.result == null ? '' : String(value.result).trim();
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return '';
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function cellNumber(value: ExcelJS.CellValue): number | null {
  if (typeof value === 'number') return value;
  if (value != null && typeof value === 'object' && 'result' in value && typeof value.result === 'number') {
    return value.result;
  }
  const t = cellText(value).replace(/,/g, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Scalar price token: '3.81M' → 3810000, '8.80' → 8.8. */
function scalarPrice(token: string): number | null {
  const t = token.trim().replace(/,/g, '');
  if (!t) return null;
  const millions = t.match(/^([0-9]+(?:\.[0-9]+)?)\s*[Mm]$/);
  if (millions) return Number((Number(millions[1]) * 1_000_000).toFixed(2));
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Accepts single values ('7', '3.81M') and ranges ('8.80–9.00', '4.80M-4.85M'). */
function parsePrice(value: ExcelJS.CellValue): { price: number; priceMax: number | null } | null {
  const direct = typeof value === 'number' ? value : null;
  if (direct != null) return direct > 0 ? { price: direct, priceMax: null } : null;
  const t = cellText(value).replace(/,/g, '');
  if (!t) return null;
  const parts = t.split(/\s*[–—-]\s*/).filter(Boolean);
  const parsed = parts.map(scalarPrice).filter((n): n is number => n != null && n > 0);
  if (parsed.length === 0) return null;
  if (parsed.length === 1) return { price: parsed[0], priceMax: null };
  const [lo, hi] = parsed.slice(0, 2).sort((a, b) => a - b);
  return { price: lo, priceMax: hi };
}

/** '15/05/2026' → '2026-05-15'; Date → ISO date; else null. */
function parseDate(value: ExcelJS.CellValue): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const t = cellText(value);
  const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const iso = t.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  return null;
}

/** Competitor match key: trimmed, "(...)" and trailing " N" stripped, lowercased. */
function matchKey(name: string): string {
  return name
    .trim()
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+\d+$/, '')
    .toLowerCase();
}

function normCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, '');
}

function putSpecs(specs: Record<string, unknown>, key: string, value: unknown): void {
  if (value == null || value === '') return;
  specs[key] = value;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface ExistingCompetitor {
  id: number;
  name: string;
  isActive: boolean;
}

async function main(): Promise<void> {
  const pool = await new sql.ConnectionPool(config).connect();
  console.log('Connected to KG_MIS');

  // --- Load reference data -------------------------------------------------
  const competitorRows = (await pool.request().query(
    `SELECT CompetitorID, Name, IsActive FROM dbo.Competitor`
  )).recordset as Array<{ CompetitorID: number; Name: string; IsActive: boolean }>;
  const competitors = new Map<string, ExistingCompetitor>();
  for (const r of competitorRows) {
    competitors.set(matchKey(r.Name), { id: r.CompetitorID, name: r.Name, isActive: r.IsActive });
  }

  const plateProducts = (await pool.request().query(
    `SELECT ProductID, ProductCode FROM dbo.Product WHERE Category = '${CATEGORY_PLATE}' ORDER BY ProductCode`
  )).recordset as Array<{ ProductID: number; ProductCode: string }>;
  const plateByCode = plateProducts.map((p) => ({ id: p.ProductID, norm: normCode(p.ProductCode) }));

  const evRows = (await pool.request().query(
    `SELECT ProductID, ProductCode FROM dbo.Product WHERE ProductCode IN ('GL-EX2', 'GL-EX5')`
  )).recordset as Array<{ ProductID: number; ProductCode: string }>;
  const evByCode = new Map(evRows.map((r) => [r.ProductCode, r.ProductID]));

  const existingMaster = (await pool.request().query(
    `SELECT CompetitorProductID, CompetitorID, ProductName FROM dbo.CompetitorProduct`
  )).recordset as Array<{ CompetitorProductID: number; CompetitorID: number; ProductName: string }>;
  const masterByKey = new Map(existingMaster.map((r) => [`${r.CompetitorID}\u0000${r.ProductName.toLowerCase()}`, r.CompetitorProductID]));

  const stats = { competitorsCreated: 0, competitorsReactivated: 0, rowsCreated: 0, rowsUpdated: 0, skipped: 0 };
  const unmappedPlateCodes: string[] = [];
  const entries: Entry[] = [];

  const resolveCompetitor = (rawName: string): string => {
    // Returns the display name to store; creates/reactivates lazily below.
    const key = matchKey(rawName);
    if (!key) return '';
    const hit = competitors.get(key);
    return hit ? hit.name : rawName.trim().replace(/\s*\([^)]*\)/g, '').replace(/\s+\d+$/, '');
  };

  const mapPlateProduct = (excelCode: string): number | null => {
    const e = normCode(excelCode);
    if (!e) return null;
    const exact = plateByCode.find((p) => p.norm === e);
    if (exact) return exact.id;
    const prefix = plateByCode.find((p) => p.norm.startsWith(e));
    if (prefix) return prefix.id;
    const contains = plateByCode.find((p) => p.norm.includes(e));
    return contains ? contains.id : null;
  };

  // --- File 1: Buna Plate --------------------------------------------------
  {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(PLATE_FILE);
    const ws = wb.worksheets[0];
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const productName = cellText(row.getCell(3).value);
      const itemCode = cellText(row.getCell(4).value);
      const competitorRaw = cellText(row.getCell(6).value);
      const parsed = parsePrice(row.getCell(7).value);
      // Skip junk rows (missing product, competitor, or price).
      if (!productName || !competitorRaw || !parsed) { if (productName || competitorRaw) stats.skipped++; continue; }
      const competitorName = resolveCompetitor(competitorRaw);
      if (!competitorName) { stats.skipped++; continue; }
      const ourProductId = itemCode ? mapPlateProduct(itemCode) : null;
      if (itemCode && !ourProductId) unmappedPlateCodes.push(itemCode);
      const specs: Record<string, unknown> = {};
      putSpecs(specs, 'kerchansheItemCode', itemCode);
      putSpecs(specs, 'kerchanshePriceWithVat', cellNumber(row.getCell(5).value));
      putSpecs(specs, 'kerchansheItemWeightG', cellNumber(row.getCell(11).value));
      putSpecs(specs, 'competitorItemWeightG', cellNumber(row.getCell(12).value));
      const remarks = cellText(row.getCell(10).value);
      entries.push({
        competitorName,
        // Item code disambiguates same-named items (e.g. BY has two "Bowls").
        productName: itemCode ? `${productName} (${itemCode})` : productName,
        category: CATEGORY_PLATE,
        price: parsed.price,
        priceMax: parsed.priceMax,
        effectiveDate: parseDate(row.getCell(2).value),
        ourProductId,
        notes: remarks || null,
        specs,
      });
    }
  }

  // --- File 2: Buna Pen ----------------------------------------------------
  {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(PEN_FILE);
    const ws = wb.worksheets[0];
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const itemName = cellText(row.getCell(1).value);
      if (!itemName) continue;
      if (itemName.toLowerCase() === 'buna (current)') { stats.skipped++; continue; } // our own product
      const parsed = parsePrice(row.getCell(3).value); // distributor selling price
      if (!parsed) { stats.skipped++; continue; }
      const competitorName = resolveCompetitor(itemName);
      if (!competitorName) { stats.skipped++; continue; }
      const buying = cellText(row.getCell(2).value);
      const specs: Record<string, unknown> = {};
      putSpecs(specs, 'distributorBuyingPrice', buying);
      entries.push({
        competitorName,
        productName: itemName,
        category: CATEGORY_PEN,
        price: parsed.price,
        priceMax: parsed.priceMax,
        effectiveDate: null,
        ourProductId: null,
        notes: null,
        specs,
      });
    }
  }

  // --- File 3: Geely EV competitors ---------------------------------------
  {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(GEELY_FILE);
    const ws = wb.worksheets[0];
    for (let r = 4; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const rowCategory = cellText(row.getCell(1).value); // 'Geely' | 'Competitor'
      const brand = cellText(row.getCell(2).value);
      const model = cellText(row.getCell(3).value);
      if (!brand || !model) continue;
      if (rowCategory.toLowerCase() === 'geely') { stats.skipped++; continue; } // our own models
      const parsed = parsePrice(row.getCell(13).value); // Indicative Price (ETB)
      if (!parsed) { stats.skipped++; continue; }
      const marketRole = cellText(row.getCell(5).value);
      const ourProductId =
        /EX2/i.test(marketRole) ? evByCode.get('GL-EX2') ?? null :
        /EX5/i.test(marketRole) ? evByCode.get('GL-EX5') ?? null : null;
      const competitorName = resolveCompetitor(brand);
      if (!competitorName) { stats.skipped++; continue; }
      const specs: Record<string, unknown> = {};
      putSpecs(specs, 'model', model);
      putSpecs(specs, 'segment', cellText(row.getCell(4).value));
      putSpecs(specs, 'marketRole', marketRole);
      putSpecs(specs, 'batteryType', cellText(row.getCell(6).value));
      putSpecs(specs, 'batteryCapacity', cellText(row.getCell(7).value));
      putSpecs(specs, 'drivingRange', cellText(row.getCell(8).value));
      putSpecs(specs, 'motorPower', cellText(row.getCell(9).value));
      putSpecs(specs, 'groundClearance', cellText(row.getCell(10).value));
      putSpecs(specs, 'fastCharge30to80', cellText(row.getCell(11).value));
      putSpecs(specs, 'adas360Camera', cellText(row.getCell(12).value));
      putSpecs(specs, 'priceBasis', cellText(row.getCell(14).value));
      entries.push({
        competitorName,
        productName: model,
        category: CATEGORY_EV,
        price: parsed.price,
        priceMax: parsed.priceMax,
        effectiveDate: null,
        ourProductId,
        notes: null,
        specs,
      });
    }
  }

  if (unmappedPlateCodes.length > 0) {
    throw new Error(`Unmapped Buna Plate item code(s): ${[...new Set(unmappedPlateCodes)].join(', ')}`);
  }
  console.log(`Parsed ${entries.length} master rows (${stats.skipped} skipped)`);

  // --- Upsert competitors + products ---------------------------------------
  for (const e of entries) {
    const key = matchKey(e.competitorName);
    let competitor = competitors.get(key);
    if (!competitor) {
      const inserted = await pool.request()
        .input('Name', sql.NVarChar(150), e.competitorName)
        .query(`INSERT INTO dbo.Competitor (Name) OUTPUT INSERTED.CompetitorID VALUES (@Name)`);
      competitor = { id: inserted.recordset[0].CompetitorID, name: e.competitorName, isActive: true };
      competitors.set(key, competitor);
      stats.competitorsCreated++;
    } else if (!competitor.isActive) {
      await pool.request().input('Id', sql.Int, competitor.id).query(
        `UPDATE dbo.Competitor SET IsActive = 1, UpdatedAt = SYSUTCDATETIME() WHERE CompetitorID = @Id`
      );
      competitor.isActive = true;
      stats.competitorsReactivated++;
    }

    const existingId = masterByKey.get(`${competitor.id}\u0000${e.productName.toLowerCase()}`);
    if (existingId) {
      // Refresh data fields from source; Status is admin-owned and preserved;
      // null source values (ourProductId / effectiveDate) never clear existing data.
      await pool.request()
        .input('Id', sql.Int, existingId)
        .input('OurProductId', sql.Int, e.ourProductId)
        .input('Category', sql.NVarChar(100), e.category)
        .input('Price', sql.Decimal(18, 2), e.price)
        .input('PriceMax', sql.Decimal(18, 2), e.priceMax)
        .input('EffectiveDate', sql.Date, e.effectiveDate)
        .input('Notes', sql.NVarChar(1000), e.notes)
        .input('Specifications', sql.NVarChar(sql.MAX), JSON.stringify(e.specs))
        .query(
          `UPDATE dbo.CompetitorProduct
           SET OurProductID = COALESCE(@OurProductId, OurProductID),
               Category = @Category, Price = @Price, PriceMax = @PriceMax,
               EffectiveDate = COALESCE(@EffectiveDate, EffectiveDate),
               Notes = @Notes, Specifications = @Specifications, UpdatedAt = SYSUTCDATETIME()
           WHERE CompetitorProductID = @Id`
        );
      stats.rowsUpdated++;
    } else {
      const inserted = await pool.request()
        .input('CompetitorId', sql.Int, competitor.id)
        .input('OurProductId', sql.Int, e.ourProductId)
        .input('ProductName', sql.NVarChar(200), e.productName)
        .input('Category', sql.NVarChar(100), e.category)
        .input('Price', sql.Decimal(18, 2), e.price)
        .input('PriceMax', sql.Decimal(18, 2), e.priceMax)
        .input('EffectiveDate', sql.Date, e.effectiveDate)
        .input('Notes', sql.NVarChar(1000), e.notes)
        .input('Specifications', sql.NVarChar(sql.MAX), JSON.stringify(e.specs))
        .query(
          `INSERT INTO dbo.CompetitorProduct
             (CompetitorID, OurProductID, ProductName, Category, Price, PriceMax, EffectiveDate, Status, Notes, Specifications)
           OUTPUT INSERTED.CompetitorProductID
           VALUES (@CompetitorId, @OurProductId, @ProductName, @Category, @Price, @PriceMax, @EffectiveDate, 'Active', @Notes, @Specifications)`
        );
      masterByKey.set(`${competitor.id}\u0000${e.productName.toLowerCase()}`, inserted.recordset[0].CompetitorProductID);
      stats.rowsCreated++;
    }
  }

  // --- Silent gap-alert sync for mapped rows (no notification dispatch) -----
  const thresholds = new Map<string, number>();
  const thresholdRows = (await pool.request().query(
    `SELECT ProductCategory, ThresholdPercent FROM dbo.PriceGapThreshold`
  )).recordset as Array<{ ProductCategory: string; ThresholdPercent: number }>;
  for (const t of thresholdRows) thresholds.set(t.ProductCategory.toLowerCase(), Number(t.ThresholdPercent));

  const mapped = (await pool.request().query(
    `SELECT cpd.CompetitorProductID, cpd.Price, p.UnitPrice, p.Category, p.ProductCode, c.Name AS CompetitorName
     FROM dbo.CompetitorProduct cpd
     JOIN dbo.Competitor c ON c.CompetitorID = cpd.CompetitorID
     JOIN dbo.Product p ON p.ProductID = cpd.OurProductID`
  )).recordset as Array<{
    CompetitorProductID: number; Price: number; UnitPrice: number | null;
    Category: string; ProductCode: string; CompetitorName: string;
  }>;
  const alreadyAlerted = new Set(
    ((await pool.request().query(
      `SELECT CompetitorProductID FROM dbo.PriceGapAlert WHERE CompetitorProductID IS NOT NULL`
    )).recordset as Array<{ CompetitorProductID: number }>).map((r) => r.CompetitorProductID)
  );
  let alertsCreated = 0;
  for (const row of mapped) {
    const own = Number(row.UnitPrice ?? 0);
    if (!(own > 0) || alreadyAlerted.has(row.CompetitorProductID)) continue;
    const gap = Number((((own - row.Price) / own) * 100).toFixed(2));
    const threshold = thresholds.get(row.Category.toLowerCase()) ?? 15;
    if (Math.abs(gap) < threshold) continue;
    await pool.request()
      .input('CompetitorProductId', sql.Int, row.CompetitorProductID)
      .input('OwnPrice', sql.Decimal(18, 2), own)
      .input('GapPercent', sql.Decimal(5, 2), gap)
      .input('ThresholdPercent', sql.Decimal(5, 2), threshold)
      .query(
        `INSERT INTO dbo.PriceGapAlert (CompetitorProductID, OwnPrice, GapPercent, ThresholdPercent, Status)
         VALUES (@CompetitorProductId, @OwnPrice, @GapPercent, @ThresholdPercent, 'Active')`
      );
    alertsCreated++;
  }

  // --- Final counts + assertions --------------------------------------------
  const total = (await pool.request().query(`SELECT COUNT(*) AS Cnt FROM dbo.CompetitorProduct`)).recordset[0].Cnt;
  const compTotal = (await pool.request().query(
    `SELECT COUNT(*) AS Cnt FROM dbo.Competitor WHERE IsActive = 1`
  )).recordset[0].Cnt;
  const byCategory = (await pool.request().query(
    `SELECT Category, COUNT(*) AS Cnt FROM dbo.CompetitorProduct GROUP BY Category`
  )).recordset as Array<{ Category: string; Cnt: number }>;
  const counts = Object.fromEntries(byCategory.map((r) => [r.Category, Number(r.Cnt)]));

  console.log('---');
  console.log(`Competitors: ${stats.competitorsCreated} created, ${stats.competitorsReactivated} reactivated (${compTotal} active total)`);
  console.log(`Master rows: ${stats.rowsCreated} created, ${stats.rowsUpdated} updated (${total} total)`);
  console.log(`By category: ${JSON.stringify(counts)}`);
  console.log(`Gap alerts: ${alertsCreated} created (silent)`);
  if (entries.length < 40) throw new Error(`Assertion failed: expected >= 40 parsed rows, got ${entries.length}`);
  if (Number(total) < entries.length) {
    throw new Error(`Assertion failed: stored rows (${total}) < parsed rows (${entries.length}) — duplicate keys collapsed source rows`);
  }
  if (counts[CATEGORY_PLATE] < 24 || counts[CATEGORY_PEN] < 13 || counts[CATEGORY_EV] < 8) {
    throw new Error(`Assertion failed: unexpected category counts ${JSON.stringify(counts)}`);
  }
  console.log('OK — competitor master import complete.');

  await pool.close();
}

main().catch((err) => {
  console.error('ERROR', err instanceof Error ? err.message : err);
  process.exit(1);
});
