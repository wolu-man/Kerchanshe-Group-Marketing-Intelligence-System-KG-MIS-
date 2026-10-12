/**
 * Master Data Import Script
 * Reads Excel files and imports Customers + Products into KG_MIS database.
 *
 * Usage: npx ts-node --skip-project scripts/import-master-data.ts
 */
import sql from 'mssql';
import * as XLSX from 'xlsx';
import * as path from 'path';

const config: sql.config = {
  user: 'kgmis_user',
  password: 'KgMis!2026Dev',
  server: 'localhost',
  port: 50404,
  database: 'KG_MIS',
  options: { trustServerCertificate: true, encrypt: false },
};

const CUSTOMER_EXCEL = path.resolve(__dirname, '../../Docs/Master-data/Kerchanshe Potential Costumers.xlsx');
const PRODUCT_EXCEL = path.resolve(__dirname, '../../Docs/Master-data/Products and Price List.xlsx');

// ---------------------------------------------------------------------------
// Region / CustomerType / BusinessGroup lookup helpers
// ---------------------------------------------------------------------------
interface IdLookup { [key: string]: number; }

async function getRegionMap(pool: sql.ConnectionPool): Promise<IdLookup> {
  const result = await pool.request().query('SELECT RegionID, RegionName FROM dbo.Region');
  const map: IdLookup = {};
  for (const r of result.recordset) map[r.RegionName.toLowerCase().trim()] = r.RegionID;
  return map;
}

async function getCustomerTypeMap(pool: sql.ConnectionPool): Promise<IdLookup> {
  const result = await pool.request().query('SELECT CustomerTypeID, Name FROM dbo.CustomerType');
  const map: IdLookup = {};
  for (const r of result.recordset) map[r.Name.toLowerCase().trim()] = r.CustomerTypeID;
  return map;
}

async function getBusinessGroupMap(pool: sql.ConnectionPool): Promise<IdLookup> {
  const result = await pool.request().query('SELECT BusinessGroupID, Code FROM dbo.BusinessGroup');
  const map: IdLookup = {};
  for (const r of result.recordset) map[r.Code.toLowerCase().trim()] = r.BusinessGroupID;
  return map;
}

async function getExistingCustomers(pool: sql.ConnectionPool): Promise<Map<string, number>> {
  const result = await pool.request().query('SELECT CustomerID, Name FROM dbo.Customer');
  const map = new Map<string, number>();
  for (const r of result.recordset) map.set(r.Name.toLowerCase().trim(), r.CustomerID);
  return map;
}

async function getExistingProducts(pool: sql.ConnectionPool): Promise<Map<string, number>> {
  const result = await pool.request().query('SELECT ProductID, ProductCode FROM dbo.Product');
  const map = new Map<string, number>();
  for (const r of result.recordset) map.set(r.ProductCode.toLowerCase().trim(), r.ProductID);
  return map;
}

function mapRegionId(regionName: string | null, regionMap: IdLookup): number | null {
  if (!regionName) return null;
  const key = regionName.toLowerCase().trim();
  // Try exact match first
  if (regionMap[key]) return regionMap[key];
  // Try partial match
  for (const [name, id] of Object.entries(regionMap)) {
    if (key.includes(name) || name.includes(key)) return id;
  }
  return null;
}

function mapCustomerTypeId(typeName: string | null, typeMap: IdLookup): number | null {
  if (!typeName) return null;
  const key = typeName.toLowerCase().trim();
  if (typeMap[key]) return typeMap[key];
  // Try partial match
  for (const [name, id] of Object.entries(typeMap)) {
    if (key.includes(name) || name.includes(key)) return id;
  }
  return null;
}

function generateCustomerCode(name: string, idx: number): string {
  const clean = name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8).toUpperCase();
  return `CUST-${clean}-${String(idx).padStart(3, '0')}`;
}

// ---------------------------------------------------------------------------
// Customer Import
// ---------------------------------------------------------------------------
async function importCustomers(pool: sql.ConnectionPool): Promise<{ created: number; skipped: number; errors: string[] }> {
  const wb = XLSX.readFile(CUSTOMER_EXCEL);
  const regionMap = await getRegionMap(pool);
  const typeMap = await getCustomerTypeMap(pool);
  const existingCustomers = await getExistingCustomers(pool);

  // Business group for Pen buyers = Buna Pen (BPN), for others = none
  const bgMap = await getBusinessGroupMap(pool);

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Process each sheet
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });

    // Find header row (first row with "Category" or "Region" or "Business Name")
    let headerIdx = -1;
    for (let i = 0; i < Math.min(5, raw.length); i++) {
      const row = raw[i];
      if (row && (row.includes('Category') || row.includes('Region/City') || row.includes('Business Name'))) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) {
      errors.push(`Sheet "${sheetName}": no header row found`);
      continue;
    }

    const headers = raw[headerIdx].map(h => (h || '').toString().toLowerCase().trim());
    const dataRows = raw.slice(headerIdx + 1).filter(row => row && row.some(cell => cell != null && cell !== ''));

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const get = (field: string): string | null => {
        const idx = headers.findIndex(h => h.includes(field.toLowerCase()));
        if (idx === -1) return null;
        const val = row[idx];
        return val != null ? String(val).trim() : null;
      };

      const name = get('business name') || get('business / institution name');
      if (!name) continue;

      // Skip duplicates
      if (existingCustomers.has(name.toLowerCase().trim())) {
        skipped++;
        continue;
      }

      const category = get('category');
      const starRating = get('star rating');
      const address = get('address');
      const phone = get('phone number');
      const area = get('area / branch');
      const city = get('region/city');
      const custType = get('customer type') || get('product');
      const productInterest = get('product');

      // Map region
      let regionId: number | null = null;
      if (city) regionId = mapRegionId(city, regionMap);
      // Hotels in Addis Ababa -> region 1
      if (!regionId && sheetName === 'All Hotels') regionId = mapRegionId('Addis Ababa', regionMap);

      // Map customer type
      let customerTypeId: number | null = null;
      if (custType) {
        customerTypeId = mapCustomerTypeId(custType, typeMap);
      }
      // Default mapping based on sheet
      if (!customerTypeId) {
        if (sheetName === 'All Hotels') customerTypeId = typeMap['key account'] || null;
        else if (sheetName === 'Restaurants & Guesthouses') customerTypeId = typeMap['retailer'] || null;
        else if (sheetName === 'Potential Pen Buyers') customerTypeId = typeMap['bid'] || null;
        else if (sheetName === 'Supermarkets') customerTypeId = typeMap['key account'] || null;
      }

      // Business group
      let businessGroupId: number | null = null;
      if (sheetName === 'Potential Pen Buyers') businessGroupId = bgMap['bpn'] || null;
      else if (sheetName === 'Supermarkets') businessGroupId = bgMap['bpl'] || null;

      const customerCode = generateCustomerCode(name, i);
      const customerTypeStr = sheetName === 'All Hotels' ? 'Hotel' :
                               sheetName === 'Restaurants & Guesthouses' ? 'Restaurant' :
                               sheetName === 'Potential Pen Buyers' ? 'Institution' :
                               'Retailer';

      try {
        const sr = starRating ? starRating.substring(0, 50) : null;
        await pool.request()
          .input('CustomerCode', sql.VarChar(50), customerCode)
          .input('Name', sql.NVarChar(300), name)
          .input('CustomerType', sql.VarChar(50), customerTypeStr)
          .input('Address', sql.NVarChar(500), address)
          .input('Area', sql.NVarChar(200), area)
          .input('ProductInterest', sql.NVarChar(200), productInterest)
          .input('ContactPhone', sql.VarChar(30), phone)
          .input('RegionId', sql.Int, regionId)
          .input('CustomerTypeId', sql.Int, customerTypeId)
          .input('BusinessGroupId', sql.Int, businessGroupId)
          .query(
            `INSERT INTO dbo.Customer (CustomerCode, Name, CustomerType, Address, Area, ProductInterest, ContactPhone, RegionID, CustomerTypeID, BusinessGroupID)
             VALUES (@CustomerCode, @Name, @CustomerType, @Address, @Area, @ProductInterest, @ContactPhone, @RegionId, @CustomerTypeId, @BusinessGroupId)`
          );
        // Update StarRating separately to avoid TDS metadata issue
        if (sr) {
          const idResult = await pool.request()
            .input('Name', sql.NVarChar(300), name)
            .query('SELECT CustomerID FROM dbo.Customer WHERE Name = @Name');
          if (idResult.recordset.length > 0) {
            await pool.request()
              .input('Id', sql.Int, idResult.recordset[0].CustomerID)
              .input('SR', sql.NVarChar(50), sr)
              .query('UPDATE dbo.Customer SET StarRating = @SR WHERE CustomerID = @Id');
          }
        }
        created++;
        existingCustomers.set(name.toLowerCase().trim(), 0); // mark as processed
      } catch (err: any) {
        errors.push(`Customer "${name}": ${err.message}`);
      }
    }
  }

  return { created, skipped, errors };
}

// ---------------------------------------------------------------------------
// Product Import
// ---------------------------------------------------------------------------
async function importProducts(pool: sql.ConnectionPool): Promise<{ created: number; skipped: number; errors: string[] }> {
  const wb = XLSX.readFile(PRODUCT_EXCEL);
  const bgMap = await getBusinessGroupMap(pool);
  const existingProducts = await getExistingProducts(pool);

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });

    // Find header row
    let headerIdx = -1;
    for (let i = 0; i < Math.min(5, raw.length); i++) {
      const row = raw[i];
      if (row && row.includes('Item Code')) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) {
      errors.push(`Sheet "${sheetName}": no header row found`);
      continue;
    }

    const headers = raw[headerIdx].map(h => (h || '').toString().toLowerCase().trim());
    const dataRows = raw.slice(headerIdx + 1).filter(row => row && row[0] && String(row[0]).trim() !== '');

    // Determine business group based on sheet
    const businessGroupId = sheetName === 'Buna Plate' ? (bgMap['bpl'] || null) :
                            sheetName === 'Buna Pen' ? (bgMap['bpn'] || null) : null;

    // Determine category
    const category = sheetName === 'Buna Plate' ? 'Buna Plate' : 'Buna Pen';

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const get = (field: string): string | null => {
        const idx = headers.findIndex(h => h === field.toLowerCase() || h.includes(field.toLowerCase()));
        if (idx === -1) return null;
        const val = row[idx];
        return val != null ? String(val).trim() : null;
      };

      const getNum = (field: string): number | null => {
        const val = get(field);
        if (!val) return null;
        const n = parseFloat(val);
        return isNaN(n) ? null : n;
      };

      const productCode = get('item code');
      if (!productCode) continue;

      const name = get('name') || productCode;
      const color = get('color');
      const size = get('size');
      const weight = get('weigh in kg') || get('weight in kg');

      // Generate a unique product code incorporating color for variants
      const fullCode = color ? `${productCode}-${color.toUpperCase().substring(0, 3)}` : productCode;

      // Skip duplicates
      if (existingProducts.has(fullCode.toLowerCase().trim())) {
        skipped++;
        continue;
      }

      const agentPriceBeforeVat = getNum('agent price before vat');
      const agentPriceAfterVat = getNum('agent price after vat');
      const wholesalePriceBeforeVat = getNum('whole sale price before vat');
      const wholesalePriceAfterVat = getNum('whole sale price after vat');

      let keyAccountPriceBeforeVat = getNum('key account price before vat');
      let keyAccountPriceAfterVat = getNum('key account price after vat');
      let bidPriceBeforeVat = getNum('bid price before vat');
      let bidPriceAfterVat = getNum('bid price after vat');

      // Unit price = agent price after VAT (default retail price)
      const unitPrice = agentPriceAfterVat;

      try {
        const inserted = await pool.request()
          .input('ProductCode', sql.VarChar(50), fullCode)
          .input('Name', sql.NVarChar(300), name)
          .input('Category', sql.VarChar(100), category)
          .input('Size', sql.NVarChar(50), size)
          .input('WeightKg', sql.Decimal(10, 4), weight ? parseFloat(weight) : null)
          .input('UnitPrice', sql.Decimal(18, 2), unitPrice)
          .input('AgentPriceBeforeVat', sql.Decimal(18, 2), agentPriceBeforeVat)
          .input('AgentPriceAfterVat', sql.Decimal(18, 2), agentPriceAfterVat)
          .input('WholesalePriceBeforeVat', sql.Decimal(18, 2), wholesalePriceBeforeVat)
          .input('WholesalePriceAfterVat', sql.Decimal(18, 2), wholesalePriceAfterVat)
          .input('KeyAccountPriceBeforeVat', sql.Decimal(18, 2), keyAccountPriceBeforeVat)
          .input('KeyAccountPriceAfterVat', sql.Decimal(18, 2), keyAccountPriceAfterVat)
          .input('BidPriceBeforeVat', sql.Decimal(18, 2), bidPriceBeforeVat)
          .input('BidPriceAfterVat', sql.Decimal(18, 2), bidPriceAfterVat)
          .input('BusinessGroupId', sql.Int, businessGroupId)
          .query(
            `INSERT INTO dbo.Product (ProductCode, Name, Category, Size, WeightKg, UnitPrice,
              AgentPriceBeforeVat, AgentPriceAfterVat, WholesalePriceBeforeVat, WholesalePriceAfterVat,
              KeyAccountPriceBeforeVat, KeyAccountPriceAfterVat, BidPriceBeforeVat, BidPriceAfterVat,
              BusinessGroupID)
             OUTPUT INSERTED.ProductID
             VALUES (@ProductCode, @Name, @Category, @Size, @WeightKg, @UnitPrice,
              @AgentPriceBeforeVat, @AgentPriceAfterVat, @WholesalePriceBeforeVat, @WholesalePriceAfterVat,
              @KeyAccountPriceBeforeVat, @KeyAccountPriceAfterVat, @BidPriceBeforeVat, @BidPriceAfterVat,
              @BusinessGroupId)`
          );
        const productId = inserted.recordset[0].ProductID;

        // Link palette colors (canonical dbo.Color / dbo.ProductColor)
        for (const colorName of String(color ?? '').split(',').map((c) => c.trim()).filter(Boolean)) {
          let found = await pool.request()
            .input('Name', sql.NVarChar(50), colorName)
            .query(`SELECT ColorID FROM dbo.Color WHERE LOWER(Name) = LOWER(@Name)`);
          let colorId: number;
          if (found.recordset.length) {
            colorId = found.recordset[0].ColorID;
          } else {
            const created = await pool.request()
              .input('Name', sql.NVarChar(50), colorName)
              .query(`INSERT INTO dbo.Color (Name, HexCode) OUTPUT INSERTED.ColorID VALUES (@Name, NULL)`);
            colorId = created.recordset[0].ColorID;
          }
          await pool.request()
            .input('ProductId', sql.Int, productId)
            .input('ColorId', sql.Int, colorId)
            .query(`INSERT INTO dbo.ProductColor (ProductID, ColorID) VALUES (@ProductId, @ColorId)`);
        }

        created++;
        existingProducts.set(fullCode.toLowerCase().trim(), 0);
      } catch (err: any) {
        errors.push(`Product "${fullCode}": ${err.message}`);
      }
    }
  }

  return { created, skipped, errors };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const pool = await sql.connect(config);
  console.log('Connected to KG_MIS database.\n');

  try {
    console.log('=== Importing Customers ===');
    const custResult = await importCustomers(pool);
    console.log(`Created: ${custResult.created}, Skipped: ${custResult.skipped}`);
    if (custResult.errors.length) {
      console.log(`Errors (${custResult.errors.length}):`);
      custResult.errors.forEach(e => console.log(`  - ${e}`));
    }

    console.log('\n=== Importing Products ===');
    const prodResult = await importProducts(pool);
    console.log(`Created: ${prodResult.created}, Skipped: ${prodResult.skipped}`);
    if (prodResult.errors.length) {
      console.log(`Errors (${prodResult.errors.length}):`);
      prodResult.errors.forEach(e => console.log(`  - ${e}`));
    }

    console.log('\n=== Summary ===');
    console.log(`Customers: ${custResult.created} created, ${custResult.skipped} skipped`);
    console.log(`Products: ${prodResult.created} created, ${prodResult.skipped} skipped`);

  } finally {
    await pool.close();
  }
}

main().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
