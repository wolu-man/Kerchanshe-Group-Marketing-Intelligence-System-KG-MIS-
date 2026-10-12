/**
 * Geely Products Seed Script
 * Reads Kerchanshe-Geely Products with Details.xlsx (header row 3, data rows 4-7),
 * merges official spec-sheet PDF values (PDF wins for model specs, Excel wins for
 * price/market fields), extracts hero images from the catalogue PDFs, and upserts
 * 4 products under BusinessGroup 3 (GLC / Geely Car).
 *
 * Codes: GL-EX2, GL-EX5, GL-GC200, GL-GC200P
 * Idempotent: safe to re-run (upsert by ProductCode, unique constraint enforced).
 *
 * Usage: npx tsx scripts/seed-geely-products.ts
 */
import ExcelJS from 'exceljs';
import sql from 'mssql';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';

const config: sql.config = {
  user: 'kgmis_user',
  password: 'KgMis!2026Dev',
  server: 'localhost',
  port: 50404,
  database: 'KG_MIS',
  options: { trustServerCertificate: true, encrypt: false },
};

const EXCEL_PATH = path.resolve(__dirname, '../../Docs/Master-data/Kerchanshe-Geely Products with Details.xlsx');
const PDF_DIR = path.resolve(__dirname, '../../Docs/Master-data/Product Catalogue Master');
const UPLOAD_DIR = path.resolve(__dirname, '../uploads/products');

const GEELY_BUSINESS_GROUP_ID = 3;

// Corrupt rows created by a previous bad import (header row + misaligned row).
// Verified: 0 child rows in all 7 FK-referencing tables before deletion.
const CORRUPT_PRODUCT_IDS = [237, 238];

// ---------------------------------------------------------------------------
// Official spec-sheet PDF values (PDF wins over Excel for model specs)
// ---------------------------------------------------------------------------
interface PdfSpecs {
  driveType: string;
  motorPower: string;
  maxTorque: string;
  drivingRange: string;
  energyConsumption?: string;
  batteryType: string;
  batteryCapacity: string;
  topSpeed?: string;
  acceleration0to100?: string;
  dcFastCharge?: string;
  suspension?: string;
  brakes?: string;
  parkBrake?: string;
  wheels?: string;
  dimensions?: string;
  wheelbase?: string;
  seats?: number;
  doors?: number;
  warranty?: string;
  versions?: string;
}

const PDF_SPECS: Record<string, PdfSpecs> = {
  EX2: {
    driveType: '4x2 Rear-Wheel Drive (RWD)',
    motorPower: '85 kW',
    maxTorque: '150 Nm',
    drivingRange: '325 km (WLTP combined)',
    energyConsumption: '15.2 kWh/100 km (WLTP)',
    batteryType: 'Lithium Iron Phosphate (LFP)',
    batteryCapacity: '39.4 kWh',
    topSpeed: '130 km/h',
    acceleration0to100: '11.5 s',
    dcFastCharge: '25 min (30-80% SOC)',
    suspension: 'MacPherson / Multi-Link',
    brakes: 'Ventilated Discs / Solid Discs',
    parkBrake: 'Electronic Parking Brake (EPB)',
    wheels: '15" Steel (205/65 R15) / 16" Alloy (205/60 R16)',
    dimensions: '4135 x 1805 x 1580 mm',
    seats: 5,
    warranty: '6 years or 150,000 km / battery 8 years or 150,000 km',
    versions: 'PRO, MAX',
  },
  EX5: {
    driveType: '4x2 Front-Wheel Drive (FWD)',
    motorPower: '160 kW',
    maxTorque: '320 Nm',
    drivingRange: '430 km (WLTP, PRO) / 425 km (WLTP, MAX)',
    energyConsumption: '15.8 kWh/100 km (PRO) / 16 kWh/100 km (MAX)',
    batteryType: 'Lithium Iron Phosphate (LFP)',
    batteryCapacity: '60.22 kWh',
    topSpeed: '175 km/h',
    acceleration0to100: '6.9 s (PRO) / 7.1 s (MAX)',
    dcFastCharge: '20 min (30-80% SOC)',
    suspension: 'MacPherson / Multi-Link',
    brakes: 'Ventilated Discs / Solid Discs',
    parkBrake: 'Electronic Parking Brake (EPB)',
    wheels: '18" Alloy (225/55 R18)',
    dimensions: '4615 x 1901 x 1670 mm',
    seats: 5,
    warranty: '6 years or 150,000 km / battery 8 years or 150,000 km',
    versions: 'PRO, MAX',
  },
  Geometry: {
    driveType: '4x2 Rear-Wheel Drive (RWD)',
    motorPower: '30 kW',
    maxTorque: '110 Nm',
    drivingRange: '200 km (CLTC)',
    batteryType: 'Lithium Iron Phosphate (LFP)',
    batteryCapacity: '17.03 kWh',
    suspension: 'MacPherson / Multi-Link',
    brakes: 'Discs / Drums',
    parkBrake: 'Hand Parking Brake',
    wheels: '14"',
    dimensions: '3065 x 1522 x 1600 mm',
    wheelbase: '2015 mm',
    seats: 4,
    doors: 3,
    warranty: '3 years or 120,000 km / battery 8 years or 120,000 km',
    versions: '200 GC, 200 GC+',
  },
};

// Model (Excel col C) -> product identity
const MODEL_MAP: Record<string, { code: string; name: string; pdfKey: string; price: number | null }> = {
  EX2: { code: 'GL-EX2', name: 'Geely EX2', pdfKey: 'EX2', price: 4800000 },
  EX5: { code: 'GL-EX5', name: 'Geely EX5', pdfKey: 'EX5', price: 6890000 },
  'Geometry 200 GC': { code: 'GL-GC200', name: 'Geely Geometry 200 GC', pdfKey: 'Geometry', price: null },
  'Geometry 200 GC+': { code: 'GL-GC200P', name: 'Geely Geometry 200 GC+', pdfKey: 'Geometry', price: null },
};

// Per-product extras that differ between GC and GC+ (from SP Geometry PDF equipment table)
const MODEL_EXTRAS: Record<string, Record<string, string>> = {
  'GL-GC200': { upholstery: 'Fabric', touchscreen: '8" MP5 Touch-screen', instrumentCluster: '9.2" Colour Instrument Cluster' },
  'GL-GC200P': { upholstery: 'Fabric + PVC', touchscreen: '8" MP5 Touch-screen', instrumentCluster: '9.2" Colour Instrument Cluster' },
};

const PDF_FILES: Record<string, string> = {
  EX2: 'SP Geely EX2 (Product Catalogue).pdf',
  EX5: 'SP Geely EX5 (Product Catalogue).pdf',
  Geometry: 'SP Geometry (Product Catalogue).pdf',
};

// Excel values that should be ignored (placeholder text from the source file)
function excelValue(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (/^not specified in pdf$/i.test(s)) return null;
  return s;
}

// ---------------------------------------------------------------------------
// JPEG extraction from PDF (raw FFD8..FFD9 scan; PDFs store JPEGs verbatim)
// ---------------------------------------------------------------------------
function extractJpegs(buf: Buffer): Buffer[] {
  const out: Buffer[] = [];
  let idx = 0;
  const soi = Buffer.from([0xff, 0xd8, 0xff]);
  const eoi = Buffer.from([0xff, 0xd9]);
  for (;;) {
    const s = buf.indexOf(soi, idx);
    if (s < 0) break;
    const e = buf.indexOf(eoi, s + 3);
    if (e < 0) break;
    out.push(buf.slice(s, e + 2));
    idx = e + 2;
  }
  return out;
}

function extractHeroImage(pdfModelKey: string): string | null {
  const file = PDF_FILES[pdfModelKey];
  if (!file) return null;
  const pdfPath = path.join(PDF_DIR, file);
  if (!fs.existsSync(pdfPath)) {
    console.warn(`  ! PDF not found: ${pdfPath}`);
    return null;
  }
  const jpegs = extractJpegs(fs.readFileSync(pdfPath));
  if (jpegs.length === 0) {
    console.warn(`  ! No JPEG found in ${file}`);
    return null;
  }
  // Largest JPEG = full-bleed hero image (others are tiny 216x236 chips)
  const hero = jpegs.reduce((a, b) => (b.length > a.length ? b : a));
  if (hero.length < 10000) {
    console.warn(`  ! Largest JPEG in ${file} too small (${hero.length} bytes), skipping`);
    return null;
  }
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const filename = `${randomUUID()}.jpg`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), hero);
  console.log(`  image: ${filename} (${(hero.length / 1024).toFixed(0)} KB) from ${file}`);
  return `/uploads/products/${filename}`;
}

// ---------------------------------------------------------------------------
// Excel parsing (title row 1, blank row 2, header row 3, data rows 4-7,
// columns A..N: Category, Brand, Model, Segment, Market Role, Battery Type,
// Battery Capacity, Driving Range, Motor Power, Ground Clearance,
// Fast Charge (30-80%), ADAS + 360 Camera, Indicative Price (ETB), Price Basis/Note)
// ---------------------------------------------------------------------------
interface ExcelRow {
  model: string;
  segment: string | null;
  marketRole: string | null;
  excelBatteryType: string | null;
  excelGroundClearance: string | null;
  excelFastCharge: string | null;
  adas360: string | null;
  priceIndicative: string | null;
  priceBasis: string | null;
}

async function readExcel(): Promise<ExcelRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(EXCEL_PATH);
  const ws = wb.getWorksheet('Geely Products with Details') ?? wb.worksheets[0];
  if (!ws) throw new Error('No worksheet found in Excel file');

  // Locate header row dynamically (first cell of column A === 'Category')
  let headerRow = -1;
  for (let r = 1; r <= 10; r++) {
    const v = ws.getRow(r).getCell(1).value;
    if (v != null && String(v).trim().toLowerCase() === 'category') { headerRow = r; break; }
  }
  if (headerRow < 0) throw new Error('Header row (Category) not found in Excel file');
  console.log(`Excel header row: ${headerRow}`);

  const rows: ExcelRow[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const model = excelValue(row.getCell(3).value); // C = Model
    if (!model || !MODEL_MAP[model]) continue;
    rows.push({
      model,
      segment: excelValue(row.getCell(4).value), // D = Segment
      marketRole: excelValue(row.getCell(5).value), // E = Market Role
      excelBatteryType: excelValue(row.getCell(6).value), // F = Battery Type
      excelGroundClearance: excelValue(row.getCell(10).value), // J = Ground Clearance
      excelFastCharge: excelValue(row.getCell(11).value), // K = Fast Charge
      adas360: excelValue(row.getCell(12).value), // L = ADAS + 360 Camera
      priceIndicative: excelValue(row.getCell(13).value), // M = Indicative Price
      priceBasis: excelValue(row.getCell(14).value), // N = Price Basis / Note
    });
  }
  return rows;
}

// Build the Specifications JSON object for one product.
// PDF wins for model specs; Excel wins for segment/market/price/notes.
function buildSpecs(x: ExcelRow, identity: { code: string }) {
  const pdf = PDF_SPECS[MODEL_MAP[x.model].pdfKey];
  const specs: Record<string, unknown> = {
    brand: 'Geely',
    model: x.model,
    segment: x.segment,
    marketRole: x.marketRole,
    driveType: pdf.driveType,
    batteryType: pdf.batteryType ?? x.excelBatteryType,
    batteryCapacity: pdf.batteryCapacity,
    drivingRange: pdf.drivingRange,
    motorPower: pdf.motorPower,
    maxTorque: pdf.maxTorque,
  };
  if (pdf.energyConsumption) specs.energyConsumption = pdf.energyConsumption;
  if (pdf.topSpeed) specs.topSpeed = pdf.topSpeed;
  if (pdf.acceleration0to100) specs.acceleration0to100 = pdf.acceleration0to100;
  if (pdf.dcFastCharge) specs.dcFastCharge = pdf.dcFastCharge;
  else if (x.excelFastCharge) specs.dcFastCharge = x.excelFastCharge;
  if (pdf.suspension) specs.suspension = pdf.suspension;
  if (pdf.brakes) specs.brakes = pdf.brakes;
  if (pdf.parkBrake) specs.parkBrake = pdf.parkBrake;
  if (pdf.wheels) specs.wheels = pdf.wheels;
  if (pdf.dimensions) specs.dimensions = pdf.dimensions;
  if (pdf.wheelbase) specs.wheelbase = pdf.wheelbase;
  // Ground clearance: PDF only lists it for Geometry; Excel supplies EX2/EX5
  if (x.excelGroundClearance) specs.groundClearance = x.excelGroundClearance;
  if (pdf.seats != null) specs.seats = pdf.seats;
  if (pdf.doors != null) specs.doors = pdf.doors;
  if (pdf.warranty) specs.warranty = pdf.warranty;
  if (pdf.versions) specs.versions = pdf.versions;
  if (x.adas360) specs.adas360 = x.adas360;
  if (x.priceIndicative) specs.priceIndicative = x.priceIndicative;
  if (x.priceBasis) specs.priceBasis = x.priceBasis;
  Object.assign(specs, MODEL_EXTRAS[identity.code] ?? {});
  return specs;
}

async function main() {
  console.log('Geely products seed');
  console.log('===================');

  // 1. Read Excel
  console.log('\n[1/4] Reading Excel...');
  const excelRows = await readExcel();
  console.log(`  ${excelRows.length} data rows: ${excelRows.map((r) => r.model).join(', ')}`);
  if (excelRows.length !== 4) throw new Error(`Expected 4 data rows, got ${excelRows.length}`);

  // 2. Connect + cleanup corrupt rows
  const pool = await sql.connect(config);
  console.log('\n[2/4] Connected. Cleaning up corrupt rows from previous import...');
  for (const id of CORRUPT_PRODUCT_IDS) {
    const r = await pool.request().input('Id', sql.Int, id).query(
      'SELECT ProductID, ProductCode, Name FROM dbo.Product WHERE ProductID = @Id'
    );
    if (r.recordset.length === 0) { console.log(`  ProductID ${id}: already gone`); continue; }
    // Guard: only delete if it is one of the known junk rows
    const row = r.recordset[0];
    const isJunk = row.ProductCode === 'Category' || row.ProductCode === 'Geely';
    if (!isJunk) { console.log(`  ProductID ${id}: SKIPPED (not a junk row: ${row.ProductCode})`); continue; }
    const del = await pool.request().input('Id', sql.Int, id).query('DELETE FROM dbo.Product WHERE ProductID = @Id');
    console.log(`  Deleted ProductID ${id} (${row.ProductCode} / ${row.Name})`);
  }

  // 3. Determine which products need a hero image, extract only those PDFs
  //    (avoids writing orphan image files on re-runs)
  console.log('\n[3/4] Checking hero images...');
  const existingRows = await pool.request().query(
    "SELECT ProductCode, ImageUrl FROM dbo.Product WHERE ProductCode LIKE 'GL-%'"
  );
  const existingImage: Record<string, string | null> = {};
  for (const r of existingRows.recordset) existingImage[r.ProductCode] = r.ImageUrl ?? null;
  const hasValidImage = (code: string): boolean => {
    const url = existingImage[code];
    if (!url) return false;
    try { return fs.existsSync(path.join(UPLOAD_DIR, path.basename(url))); } catch { return false; }
  };
  const heroCache: Record<string, string | null> = {};
  for (const x of excelRows) {
    const identity = MODEL_MAP[x.model];
    if (hasValidImage(identity.code)) {
      heroCache[identity.pdfKey] = existingImage[identity.code];
      continue;
    }
    if (heroCache[identity.pdfKey] === undefined) {
      console.log(`  ${identity.code} needs an image -> extracting from PDF`);
      heroCache[identity.pdfKey] = extractHeroImage(identity.pdfKey);
    }
  }

  // 4. Upsert products
  console.log('\n[4/4] Upserting products...');
  let inserted = 0, updated = 0, imagesSet = 0;
  for (const x of excelRows) {
    const identity = MODEL_MAP[x.model];
    const specs = buildSpecs(x, identity);
    const specsJson = JSON.stringify(specs);
    const category = (x.segment ?? 'Geely').slice(0, 100);
    const hero = heroCache[identity.pdfKey] ?? null;

    const existing = await pool.request()
      .input('ProductCode', sql.VarChar(50), identity.code)
      .query('SELECT ProductID, ImageUrl FROM dbo.Product WHERE ProductCode = @ProductCode');

    if (existing.recordset.length > 0) {
      const productId: number = existing.recordset[0].ProductID;
      const currentImage: string | null = existing.recordset[0].ImageUrl;
      // Preserve a user-uploaded image if present; otherwise set/restore the hero
      const imageUrl = currentImage && fs.existsSync(path.join(UPLOAD_DIR, path.basename(currentImage)))
        ? currentImage
        : hero;
      if (imageUrl && imageUrl !== currentImage) imagesSet++;
      await pool.request()
        .input('Id', sql.Int, productId)
        .input('Name', sql.NVarChar(300), identity.name)
        .input('Category', sql.VarChar(100), category)
        .input('UnitPrice', sql.Decimal(18, 2), identity.price)
        .input('BusinessGroupId', sql.Int, GEELY_BUSINESS_GROUP_ID)
        .input('ImageUrl', sql.NVarChar(1000), imageUrl)
        .input('Specifications', sql.NVarChar(sql.MAX), specsJson)
        .input('IsActive', sql.Bit, 1)
        .query(`UPDATE dbo.Product
                SET Name = @Name, Category = @Category, UnitPrice = @UnitPrice,
                    BusinessGroupID = @BusinessGroupId, ImageUrl = @ImageUrl,
                    Specifications = @Specifications, IsActive = @IsActive,
                    UpdatedAt = SYSUTCDATETIME()
                WHERE ProductID = @Id`);
      updated++;
      console.log(`  updated: ${identity.code} - ${identity.name} (ID ${productId}, price ${identity.price ?? 'null'})`);
    } else {
      const result = await pool.request()
        .input('ProductCode', sql.VarChar(50), identity.code)
        .input('Name', sql.NVarChar(300), identity.name)
        .input('Category', sql.VarChar(100), category)
        .input('UnitPrice', sql.Decimal(18, 2), identity.price)
        .input('BusinessGroupId', sql.Int, GEELY_BUSINESS_GROUP_ID)
        .input('ImageUrl', sql.NVarChar(1000), hero)
        .input('Specifications', sql.NVarChar(sql.MAX), specsJson)
        .query(`INSERT INTO dbo.Product (ProductCode, Name, Category, UnitPrice, BusinessGroupID, ImageUrl, Specifications, IsActive)
                OUTPUT INSERTED.ProductID
                VALUES (@ProductCode, @Name, @Category, @UnitPrice, @BusinessGroupId, @ImageUrl, @Specifications, 1)`);
      if (hero) imagesSet++;
      inserted++;
      console.log(`  inserted: ${identity.code} - ${identity.name} (ID ${result.recordset[0].ProductID}, price ${identity.price ?? 'null'})`);
    }
  }

  // Summary + assertions
  const check = await pool.request().query(
    "SELECT ProductID, ProductCode, Name, Category, UnitPrice, BusinessGroupID, ImageUrl, LEN(ISNULL(Specifications, '')) AS SpecLen FROM dbo.Product WHERE ProductCode LIKE 'GL-%' ORDER BY ProductCode"
  );
  console.log('\n=== Result ===');
  console.table(check.recordset);
  const total = await pool.request().query('SELECT COUNT(*) AS n FROM dbo.Product');
  const junk = await pool.request().query(
    "SELECT COUNT(*) AS n FROM dbo.Product WHERE ProductID IN (237, 238) OR ProductCode IN ('Category', 'Geely')"
  );
  console.log(`inserted=${inserted} updated=${updated} imagesSet=${imagesSet}`);
  console.log(`total products=${total.recordset[0].n} (expect 77), junk rows remaining=${junk.recordset[0].n} (expect 0)`);
  if (check.recordset.length !== 4) throw new Error(`Expected 4 GL- products, got ${check.recordset.length}`);
  if (Number(total.recordset[0].n) !== 77) throw new Error(`Expected 77 total products, got ${total.recordset[0].n}`);
  if (Number(junk.recordset[0].n) !== 0) throw new Error('Junk rows still present');

  await pool.close();
  console.log('\nGeely products seed completed successfully');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
