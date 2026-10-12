const mssql = require('mssql');
const { dbConfig } = require('./scripts/dbconfig.js');

const additionalProducts = [
  // Kerchanshe Coffee (KCC) - BusinessGroupID: 1
  { productCode: 'KCC-AR-1KG', name: 'Arabica Coffee 1kg', category: 'Coffee', unitPrice: 850.00, businessGroupId: 1 },
  { productCode: 'KCC-RO-500G', name: 'Roasted Coffee 500g', category: 'Coffee', unitPrice: 480.00, businessGroupId: 1 },
  { productCode: 'KCC-GR-1KG', name: 'Green Coffee Beans 1kg', category: 'Coffee', unitPrice: 620.00, businessGroupId: 1 },
  { productCode: 'KCC-IN-200G', name: 'Instant Coffee 200g', category: 'Coffee', unitPrice: 350.00, businessGroupId: 1 },
  { productCode: 'KCC-ESP-250G', name: 'Espresso Blend 250g', category: 'Coffee', unitPrice: 420.00, businessGroupId: 1 },
  { productCode: 'KCC-DEC-200G', name: 'Decaf Coffee 200g', category: 'Coffee', unitPrice: 380.00, businessGroupId: 1 },

  // Tractor (TRC) - BusinessGroupID: 2
  { productCode: 'TRC-TR50', name: 'TR-50 Agricultural Tractor', category: 'Tractor', unitPrice: 850000.00, businessGroupId: 2 },
  { productCode: 'TRC-TR65', name: 'TR-65 Utility Tractor', category: 'Tractor', unitPrice: 1100000.00, businessGroupId: 2 },
  { productCode: 'TRC-TR75', name: 'TR-75 Heavy Duty Tractor', category: 'Tractor', unitPrice: 1350000.00, businessGroupId: 2 },
  { productCode: 'TRC-PLOW', name: 'Disc Plow 3-Furrow', category: 'Implement', unitPrice: 85000.00, businessGroupId: 2 },
  { productCode: 'TRC-HARROW', name: 'Disc Harrow 24-Disc', category: 'Implement', unitPrice: 65000.00, businessGroupId: 2 },
  { productCode: 'TRC-TRAILER', name: 'Farm Trailer 5-Ton', category: 'Trailer', unitPrice: 120000.00, businessGroupId: 2 },

  // Geely Car (GLC) - BusinessGroupID: 3
  { productCode: 'GLC-COOLRAY', name: 'Geely Coolray', category: 'SUV', unitPrice: 1850000.00, businessGroupId: 3 },
  { productCode: 'GLC-EMGRAND', name: 'Geely Emgrand', category: 'Sedan', unitPrice: 1200000.00, businessGroupId: 3 },
  { productCode: 'GLC-AZKARRA', name: 'Geely Azkarra', category: 'SUV', unitPrice: 2100000.00, businessGroupId: 3 },
  { productCode: 'GLC-GC6', name: 'Geely GC6', category: 'Sedan', unitPrice: 950000.00, businessGroupId: 3 },
  { productCode: 'GLC-OKAVANGO', name: 'Geely Okavango', category: 'SUV', unitPrice: 2300000.00, businessGroupId: 3 },

  // Bus (BUS) - BusinessGroupID: 6
  { productCode: 'BUS-CITY12', name: 'City Bus 12m', category: 'Bus', unitPrice: 4500000.00, businessGroupId: 6 },
  { productCode: 'BUS-INTER13', name: 'Intercity Bus 13m', category: 'Bus', unitPrice: 5200000.00, businessGroupId: 6 },
  { productCode: 'BUS-MINI', name: 'Minibus 30-Seater', category: 'Bus', unitPrice: 2800000.00, businessGroupId: 6 },
  { productCode: 'BUS-SCHOOL', name: 'School Bus 45-Seater', category: 'Bus', unitPrice: 3500000.00, businessGroupId: 6 },
  { productCode: 'BUS-LUXURY', name: 'Luxury Coach 55-Seater', category: 'Bus', unitPrice: 6800000.00, businessGroupId: 6 },

  // Oro Meat (ORM) - BusinessGroupID: 7
  { productCode: 'ORM-BEEF-1KG', name: 'Premium Beef 1kg', category: 'Meat', unitPrice: 850.00, businessGroupId: 7 },
  { productCode: 'ORM-LAMB-1KG', name: 'Premium Lamb 1kg', category: 'Meat', unitPrice: 950.00, businessGroupId: 7 },
  { productCode: 'ORM-GOAT-1KG', name: 'Goat Meat 1kg', category: 'Meat', unitPrice: 780.00, businessGroupId: 7 },
  { productCode: 'ORM-CHIKN-1KG', name: 'Whole Chicken 1kg', category: 'Poultry', unitPrice: 320.00, businessGroupId: 7 },
  { productCode: 'ORM-SAUSAGE', name: 'Beef Sausage 500g', category: 'Processed Meat', unitPrice: 180.00, businessGroupId: 7 },
  { productCode: 'ORM-BURGER', name: 'Beef Burger Patties 1kg', category: 'Processed Meat', unitPrice: 280.00, businessGroupId: 7 },

  // Buna Paints (BPT) - BusinessGroupID: 8
  { productCode: 'BPT-WHT-20L', name: 'White Emulsion Paint 20L', category: 'Paint', unitPrice: 1850.00, businessGroupId: 8 },
  { productCode: 'BPT-WHT-4L', name: 'White Emulsion Paint 4L', category: 'Paint', unitPrice: 420.00, businessGroupId: 8 },
  { productCode: 'BPT-PRIMER-20L', name: 'Primer Paint 20L', category: 'Paint', unitPrice: 1650.00, businessGroupId: 8 },
  { productCode: 'BPT-ROOF-20L', name: 'Roof Paint 20L', category: 'Paint', unitPrice: 2200.00, businessGroupId: 8 },
  { productCode: 'BPT-WEATHER-20L', name: 'Weather Shield 20L', category: 'Paint', unitPrice: 2400.00, businessGroupId: 8 },
  { productCode: 'BPT-ENAMEL-4L', name: 'Enamel Paint 4L', category: 'Paint', unitPrice: 580.00, businessGroupId: 8 },
  { productCode: 'BPT-THINNER-5L', name: 'Paint Thinner 5L', category: 'Solvent', unitPrice: 320.00, businessGroupId: 8 },
];

async function main() {
  const p = await mssql.connect(dbConfig());
  console.log('Connected to database');

  console.log(`Inserting ${additionalProducts.length} additional products...`);
  for (const prod of additionalProducts) {
    const result = await p.request()
      .input('D365FOKey', mssql.VarChar(100), prod.productCode)
      .input('ProductCode', mssql.VarChar(50), prod.productCode)
      .input('Name', mssql.NVarChar(150), prod.name)
      .input('Category', mssql.VarChar(100), prod.category)
      .input('UnitPrice', mssql.Decimal(18, 2), prod.unitPrice)
      .input('BusinessGroupID', mssql.Int, prod.businessGroupId)
      .query(
        `INSERT INTO dbo.Product (D365FOKey, ProductCode, Name, Category, UnitPrice, BusinessGroupID, IsActive)
         VALUES (@D365FOKey, @ProductCode, @Name, @Category, @UnitPrice, @BusinessGroupID, 1)`
      );
    console.log(`Inserted: ${prod.name} (${prod.productCode}) -> BG${prod.businessGroupId}`);
  }

  // Verify
  const verify = await p.request().query('SELECT ProductID, ProductCode, Name, Category, UnitPrice, BusinessGroupID FROM dbo.Product ORDER BY BusinessGroupID, ProductID');
  console.log('\n=== Final Product List ===');
  console.table(verify.recordset);

  // PriceGapThreshold updates
  console.log('\nUpdating PriceGapThreshold...');
  await p.request().query("DELETE FROM dbo.PriceGapThreshold");
  const thresholds = [
    { category: 'Buna Plate', percent: 15.00 },
    { category: 'Buna Pen', percent: 20.00 },
    { category: 'Coffee', percent: 15.00 },
    { category: 'Tractor', percent: 10.00 },
    { category: 'Implement', percent: 10.00 },
    { category: 'Trailer', percent: 10.00 },
    { category: 'SUV', percent: 12.00 },
    { category: 'Sedan', percent: 12.00 },
    { category: 'Bus', percent: 8.00 },
    { category: 'Meat', percent: 15.00 },
    { category: 'Poultry', percent: 15.00 },
    { category: 'Processed Meat', percent: 15.00 },
    { category: 'Paint', percent: 12.00 },
    { category: 'Solvent', percent: 15.00 },
  ];
  for (const t of thresholds) {
    await p.request()
      .input('Category', mssql.VarChar(100), t.category)
      .input('Percent', mssql.Decimal(5, 2), t.percent)
      .query(`INSERT INTO dbo.PriceGapThreshold (ProductCategory, ThresholdPercent) VALUES (@Category, @Percent)`);
  }
  console.log('PriceGapThreshold updated');

  const thresh = await p.request().query('SELECT * FROM dbo.PriceGapThreshold ORDER BY ProductCategory');
  console.table(thresh.recordset);

  await p.close();
  console.log('\nDone!');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });