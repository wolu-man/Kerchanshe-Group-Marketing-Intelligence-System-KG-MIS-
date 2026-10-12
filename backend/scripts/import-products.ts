/**
 * Product Import Script — replaces all products from Excel.
 * Handles merged header rows and populates ProductPrice per customer type.
 *
 * Usage: npx tsx scripts/import-products.ts
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

const PRODUCT_EXCEL = path.resolve(__dirname, '../../Docs/Master-data/Products and Price List.xlsx');

// CustomerType IDs (from seed data):
// 1 = Key Account, 2 = Bid, 3 = Shop/Wholesaler, 4 = Agent/Distributor

async function main() {
  const pool = await sql.connect(config);
  console.log('Connected to KG_MIS database.\n');

  try {
    // ── Step 1: Delete dependent data (respect FK order) ──
    console.log('Step 1: Cleaning dependent tables...');
    await pool.request().query('DELETE FROM dbo.PriceGapAlert');
    await pool.request().query('DELETE FROM dbo.KpiResult');
    await pool.request().query('DELETE FROM dbo.ProductPrice');
    await pool.request().query('DELETE FROM dbo.CompetitorPrice');
    await pool.request().query('DELETE FROM dbo.SalesRecord');
    await pool.request().query('DELETE FROM dbo.WeeklySales');
    await pool.request().query('DELETE FROM dbo.KpiDefinition');
    await pool.request().query('DELETE FROM dbo.PlanActivity');
    console.log('  Dependent data cleared.');

    // ── Step 2: Delete all products ──
    console.log('Step 2: Deleting all products...');
    await pool.request().query('DELETE FROM dbo.Product');
    console.log('  All products deleted.');

    // ── Step 3: Get BusinessGroup IDs ──
    const bgResult = await pool.request().query('SELECT BusinessGroupID, Code FROM dbo.BusinessGroup');
    const bgMap: Record<string, number> = {};
    for (const r of bgResult.recordset) bgMap[r.Code.toLowerCase().trim()] = r.BusinessGroupID;

    // ── Step 4: Read Excel ──
    console.log('\nStep 3: Reading Excel file...');
    const wb = XLSX.readFile(PRODUCT_EXCEL);

    let totalCreated = 0;
    let totalPrices = 0;
    const errors: string[] = [];

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
      console.log(`\n  Sheet: "${sheetName}" (${raw.length} rows)`);

      // The Excel has merged headers:
      // Row 0: Title (e.g. "Buna Plate and its Price")
      // Row 1: Column headers: Item Code, Name, Color, Size, Weight in Kg, <price section title>
      // Row 2: Price sub-headers: Agent/Distributor, Wholesale/Shop, Key Account (or Bid)
      // Row 3+: Data rows

      // Find the row with "Item Code" header
      let headerRow1 = -1;
      for (let i = 0; i < Math.min(5, raw.length); i++) {
        if (raw[i] && raw[i][0] && String(raw[i][0]).toLowerCase().includes('item code')) {
          headerRow1 = i;
          break;
        }
      }
      if (headerRow1 === -1) { errors.push(`Sheet "${sheetName}": no "Item Code" header found`); continue; }

      // Row after header has price sub-headers
      const priceSubHeaders = raw[headerRow1 + 1] || [];
      const priceColHeaders = priceSubHeaders.map(h => (h || '').toString().trim().toLowerCase());
      console.log(`  Price sub-headers: ${JSON.stringify(priceColHeaders)}`);

      // Determine which price columns map to which CustomerType IDs
      const priceColumns: { colIdx: number; customerTypeId: number; label: string }[] = [];
      for (let c = 5; c < priceColHeaders.length; c++) {
        const h = priceColHeaders[c];
        if (h.includes('agent') || h.includes('distributor')) {
          priceColumns.push({ colIdx: c, customerTypeId: 4, label: 'Agent/Distributor' });
        } else if (h.includes('wholesale') || h.includes('shop')) {
          priceColumns.push({ colIdx: c, customerTypeId: 3, label: 'Wholesale/Shop' });
        } else if (h.includes('key account')) {
          priceColumns.push({ colIdx: c, customerTypeId: 1, label: 'Key Account' });
        } else if (h.includes('bid')) {
          priceColumns.push({ colIdx: c, customerTypeId: 2, label: 'Bid' });
        }
      }
      console.log(`  Mapped price columns: ${priceColumns.map(p => `${p.label}→col${p.colIdx}`).join(', ')}`);

      // Data rows start after the price sub-header row
      const dataStart = headerRow1 + 2;
      const category = sheetName.trim();
      const businessGroupId = bgMap['bpl'] || bgMap['bpn'] || null;

      let sheetCreated = 0;
      let sheetPrices = 0;

      for (let r = dataStart; r < raw.length; r++) {
        const row = raw[r];
        if (!row || !row[0] || String(row[0]).trim() === '') continue;

        const productCode = String(row[0] || '').trim();
        const name = String(row[1] || productCode).trim();
        const color = row[2] != null ? String(row[2]).trim() : null;
        const size = row[3] != null ? String(row[3]).trim() : null;
        const weightStr = row[4] != null ? String(row[4]).trim() : null;
        const weightKg = weightStr ? parseFloat(weightStr) : null;

        // Build unique product code (append color code for color variants)
        const colorSuffix = color ? `-${color.toUpperCase().substring(0, 3)}` : '';
        const fullCode = `${productCode}${colorSuffix}`;

        // Prices from columns 5+
        const agentPrice = row[5] != null ? Number(row[5]) : null;
        const wholesalePrice = row[6] != null ? Number(row[6]) : null;
        const keyAccountOrBid = row[7] != null ? Number(row[7]) : null;

        // Determine which price goes where based on sheet type
        const isPenSheet = sheetName.toLowerCase().includes('pen');
        const keyAccountPrice = isPenSheet ? null : keyAccountOrBid;
        const bidPrice = isPenSheet ? keyAccountOrBid : null;

        // UnitPrice = Agent price (the base/retail price)
        const unitPrice = agentPrice;

        try {
          const req = pool.request()
            .input('ProductCode', sql.VarChar(50), fullCode)
            .input('Name', sql.NVarChar(300), name)
            .input('Category', sql.VarChar(100), category)
            .input('Size', sql.NVarChar(50), size)
            .input('WeightKg', sql.Decimal(10, 4), isNaN(weightKg!) ? null : weightKg)
            .input('UnitPrice', sql.Decimal(18, 2), unitPrice)
            .input('AgentPriceAfterVat', sql.Decimal(18, 2), agentPrice)
            .input('WholesalePriceAfterVat', sql.Decimal(18, 2), wholesalePrice)
            .input('KeyAccountPriceAfterVat', sql.Decimal(18, 2), keyAccountPrice)
            .input('BidPriceAfterVat', sql.Decimal(18, 2), bidPrice)
            .input('BusinessGroupId', sql.Int, businessGroupId);

          const result = await req.query(
            `INSERT INTO dbo.Product (ProductCode, Name, Category, Size, WeightKg, UnitPrice,
              AgentPriceAfterVat, WholesalePriceAfterVat, KeyAccountPriceAfterVat, BidPriceAfterVat,
              BusinessGroupID)
             OUTPUT INSERTED.ProductID
             VALUES (@ProductCode, @Name, @Category, @Size, @WeightKg, @UnitPrice,
              @AgentPriceAfterVat, @WholesalePriceAfterVat, @KeyAccountPriceAfterVat, @BidPriceAfterVat,
              @BusinessGroupId)`
          );

          const productId = result.recordset[0].ProductID;
          sheetCreated++;

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

          // Insert per-type pricing into ProductPrice
          if (agentPrice != null && !isNaN(agentPrice)) {
            await pool.request()
              .input('ProductId', sql.Int, productId)
              .input('CustomerTypeId', sql.Int, 4) // Agent/Distributor
              .input('UnitPrice', sql.Decimal(18, 2), agentPrice)
              .query('INSERT INTO dbo.ProductPrice (ProductID, CustomerTypeID, UnitPrice) VALUES (@ProductId, @CustomerTypeId, @UnitPrice)');
            sheetPrices++;
          }
          if (wholesalePrice != null && !isNaN(wholesalePrice)) {
            await pool.request()
              .input('ProductId', sql.Int, productId)
              .input('CustomerTypeId', sql.Int, 3) // Shop/Wholesaler
              .input('UnitPrice', sql.Decimal(18, 2), wholesalePrice)
              .query('INSERT INTO dbo.ProductPrice (ProductID, CustomerTypeID, UnitPrice) VALUES (@ProductId, @CustomerTypeId, @UnitPrice)');
            sheetPrices++;
          }
          if (keyAccountPrice != null && !isNaN(keyAccountPrice)) {
            await pool.request()
              .input('ProductId', sql.Int, productId)
              .input('CustomerTypeId', sql.Int, 1) // Key Account
              .input('UnitPrice', sql.Decimal(18, 2), keyAccountPrice)
              .query('INSERT INTO dbo.ProductPrice (ProductID, CustomerTypeID, UnitPrice) VALUES (@ProductId, @CustomerTypeId, @UnitPrice)');
            sheetPrices++;
          }
          if (bidPrice != null && !isNaN(bidPrice)) {
            await pool.request()
              .input('ProductId', sql.Int, productId)
              .input('CustomerTypeId', sql.Int, 2) // Bid
              .input('UnitPrice', sql.Decimal(18, 2), bidPrice)
              .query('INSERT INTO dbo.ProductPrice (ProductID, CustomerTypeID, UnitPrice) VALUES (@ProductId, @CustomerTypeId, @UnitPrice)');
            sheetPrices++;
          }
        } catch (err: any) {
          errors.push(`Product "${fullCode}": ${err.message}`);
        }
      }

      console.log(`  Created: ${sheetCreated} products, ${sheetPrices} price entries`);
      totalCreated += sheetCreated;
      totalPrices += sheetPrices;
    }

    console.log(`\n=== Summary ===`);
    console.log(`Products created: ${totalCreated}`);
    console.log(`ProductPrice entries: ${totalPrices}`);
    if (errors.length) {
      console.log(`Errors (${errors.length}):`);
      errors.forEach(e => console.log(`  - ${e}`));
    }

    // Final count
    const countResult = await pool.request().query('SELECT COUNT(*) AS Cnt FROM dbo.Product WHERE IsActive=1');
    const priceCount = await pool.request().query('SELECT COUNT(*) AS Cnt FROM dbo.ProductPrice');
    console.log(`\nDB totals: ${countResult.recordset[0].Cnt} active products, ${priceCount.recordset[0].Cnt} price entries`);

  } finally {
    await pool.close();
  }
}

main().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
