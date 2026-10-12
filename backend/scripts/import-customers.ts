/**
 * Customer Import Script — replaces all customers from Excel.
 * Handles all 5 sheets with consistent column structure.
 *
 * Usage: npx tsx scripts/import-customers.ts
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

async function main() {
  const pool = await sql.connect(config);
  console.log('Connected to KG_MIS database.\n');

  try {
    // ── Step 1: Clean dependent data ──
    console.log('Step 1: Cleaning dependent tables...');
    await pool.request().query('DELETE FROM dbo.SalesRecord');
    await pool.request().query('DELETE FROM dbo.WeeklySales');
    console.log('  Dependent data cleared.');

    // ── Step 2: Delete all customers ──
    console.log('Step 2: Deleting all customers...');
    await pool.request().query('DELETE FROM dbo.Customer');
    console.log('  All customers deleted.');

    // ── Step 3: Build lookup maps ──
    const regionResult = await pool.request().query('SELECT RegionID, RegionName FROM dbo.Region');
    const regionMap: Record<string, number> = {};
    for (const r of regionResult.recordset) regionMap[r.RegionName.toLowerCase().trim()] = r.RegionID;

    const typeResult = await pool.request().query('SELECT CustomerTypeID, Name FROM dbo.CustomerType');
    const typeMap: Record<string, number> = {};
    for (const t of typeResult.recordset) typeMap[t.Name.toLowerCase().trim()] = t.CustomerTypeID;

    const bgResult = await pool.request().query('SELECT BusinessGroupID, Code FROM dbo.BusinessGroup');
    const bgMap: Record<string, number> = {};
    for (const b of bgResult.recordset) bgMap[b.Code.toLowerCase().trim()] = b.BusinessGroupID;

    // ── Step 4: Read Excel ──
    console.log('\nStep 3: Reading Excel file...');
    const wb = XLSX.readFile(CUSTOMER_EXCEL);

    let totalCreated = 0;
    const errors: string[] = [];

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
      console.log(`\n  Sheet: "${sheetName}" (${raw.length} rows)`);

      // Find header row with "Category" and "Business Name"
      let headerIdx = -1;
      for (let i = 0; i < Math.min(5, raw.length); i++) {
        const row = raw[i];
        if (row && row.some(c => String(c || '').toLowerCase().includes('category'))) {
          headerIdx = i;
          break;
        }
      }
      if (headerIdx === -1) { errors.push(`Sheet "${sheetName}": no header row`); continue; }

      // Parse headers
      const headers = raw[headerIdx].map(h => (h || '').toString().toLowerCase().trim());

      // Column indices (may vary slightly between sheets)
      const colIdx = {
        category: headers.findIndex(h => h === 'category'),
        name: headers.findIndex(h => h.includes('business name') || h.includes('institution name')),
        region: headers.findIndex(h => h.includes('region/city')),
        outlet: headers.findIndex(h => h === 'outlet'),
        contact: headers.findIndex(h => h === 'contact'),
        customerType: headers.findIndex(h => h.includes('customer type')),
        businessGroup: headers.findIndex(h => h.includes('business group')),
      };

      console.log(`  Columns: category=${colIdx.category}, name=${colIdx.name}, region=${colIdx.region}, outlet=${colIdx.outlet}, contact=${colIdx.contact}, customerType=${colIdx.customerType}, businessGroup=${colIdx.businessGroup}`);

      const dataRows = raw.slice(headerIdx + 1).filter(row => row && row.some(c => c != null && String(c).trim() !== ''));
      let sheetCreated = 0;

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const get = (idx: number): string | null => {
          if (idx === -1 || !row[idx]) return null;
          const v = String(row[idx]).trim();
          return v || null;
        };

        const category = get(colIdx.category);
        const businessName = get(colIdx.name);
        const regionCity = get(colIdx.region);
        const outletAddress = get(colIdx.outlet);
        const contact = get(colIdx.contact);
        const customerType = get(colIdx.customerType);
        const businessGroup = get(colIdx.businessGroup);

        if (!businessName) continue;

        // Map region
        let regionId: number | null = null;
        if (regionCity) {
          const rKey = regionCity.toLowerCase().trim();
          if (regionMap[rKey]) regionId = regionMap[rKey];
          else {
            for (const [name, id] of Object.entries(regionMap)) {
              if (rKey.includes(name) || name.includes(rKey)) { regionId = id; break; }
            }
          }
        }

        // Map CustomerTypeID from "Customer Type" column
        let customerTypeId: number | null = null;
        if (customerType) {
          const tKey = customerType.toLowerCase().trim();
          if (typeMap[tKey]) customerTypeId = typeMap[tKey];
          else {
            for (const [name, id] of Object.entries(typeMap)) {
              if (tKey.includes(name) || name.includes(tKey)) { customerTypeId = id; break; }
            }
          }
          // Handle typo "Agent/Distributer" → "Agent/Distributor"
          if (!customerTypeId && tKey.includes('agent')) customerTypeId = typeMap['agent/distributor'] || null;
          if (!customerTypeId && tKey.includes('wholesaler')) customerTypeId = typeMap['shop/wholesaler'] || null;
        }

        // Map BusinessGroupID from "Business Group" column
        let businessGroupId: number | null = null;
        if (businessGroup) {
          const bKey = businessGroup.toLowerCase().trim();
          if (bgMap[bKey]) businessGroupId = bgMap[bKey];
          else {
            for (const [code, id] of Object.entries(bgMap)) {
              if (bKey.includes(code) || code.includes(bKey)) { businessGroupId = id; break; }
            }
            // Handle full names
            if (!businessGroupId && bKey.includes('pen')) businessGroupId = bgMap['bpn'] || null;
            if (!businessGroupId && bKey.includes('plate')) businessGroupId = bgMap['bpl'] || null;
          }
        }

        // Generate customer code
        const cleanName = businessName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8).toUpperCase();
        const customerCode = `CUST-${cleanName}-${String(i).padStart(3, '0')}`;

        try {
          await pool.request()
            .input('CustomerCode', sql.VarChar(50), customerCode)
            .input('Name', sql.NVarChar(300), businessName)
            .input('CustomerType', sql.VarChar(50), category)
            .input('ContactPhone', sql.VarChar(30), contact)
            .input('Address', sql.NVarChar(500), outletAddress)
            .input('RegionId', sql.Int, regionId)
            .input('CustomerTypeId', sql.Int, customerTypeId)
            .input('BusinessGroupId', sql.Int, businessGroupId)
            .query(
              `INSERT INTO dbo.Customer (CustomerCode, Name, CustomerType, ContactPhone, Address, RegionID, CustomerTypeID, BusinessGroupID)
               VALUES (@CustomerCode, @Name, @CustomerType, @ContactPhone, @Address, @RegionId, @CustomerTypeId, @BusinessGroupId)`
            );
          sheetCreated++;
        } catch (err: any) {
          errors.push(`[${sheetName}] "${businessName}": ${err.message}`);
        }
      }

      console.log(`  Created: ${sheetCreated} customers`);
      totalCreated += sheetCreated;
    }

    console.log(`\n=== Summary ===`);
    console.log(`Total customers created: ${totalCreated}`);
    if (errors.length) {
      console.log(`Errors (${errors.length}):`);
      errors.forEach(e => console.log(`  - ${e}`));
    }

    // Final count
    const countResult = await pool.request().query('SELECT COUNT(*) AS Cnt FROM dbo.Customer WHERE IsActive=1');
    console.log(`\nDB total: ${countResult.recordset[0].Cnt} active customers`);

    // Breakdown by type
    const breakdown = await pool.request().query(
      `SELECT ct.Name AS CustomerType, COUNT(*) AS Cnt
       FROM dbo.Customer c
       LEFT JOIN dbo.CustomerType ct ON ct.CustomerTypeID = c.CustomerTypeID
       GROUP BY ct.Name ORDER BY ct.Name`
    );
    console.log('\nBy CustomerType:');
    for (const r of breakdown.recordset) console.log(`  ${r.CustomerType || '(null)'}: ${r.Cnt}`);

    // Breakdown by business group
    const bgBreakdown = await pool.request().query(
      `SELECT bg.Name AS BusinessGroup, COUNT(*) AS Cnt
       FROM dbo.Customer c
       LEFT JOIN dbo.BusinessGroup bg ON bg.BusinessGroupID = c.BusinessGroupID
       GROUP BY bg.Name ORDER BY bg.Name`
    );
    console.log('\nBy BusinessGroup:');
    for (const r of bgBreakdown.recordset) console.log(`  ${r.BusinessGroup || '(null)'}: ${r.Cnt}`);

  } finally {
    await pool.close();
  }
}

main().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
