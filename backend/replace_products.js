const mssql = require('mssql');
const { dbConfig } = require('./scripts/dbconfig.js');

const bunaPlateProducts = [
  { productCode: '430023', name: 'BPKB10055BowlPlate', category: 'Buna Plate', unitPrice: 85.00, businessGroupId: 5 },
  { productCode: '430032', name: 'BPKB21105RoundFruitP', category: 'Buna Plate', unitPrice: 75.00, businessGroupId: 5 },
  { productCode: '430053', name: 'BPKB61085FlowerSmall', category: 'Buna Plate', unitPrice: 65.00, businessGroupId: 5 },
  { productCode: '430022', name: 'BPKB10045Bowl', category: 'Buna Plate', unitPrice: 70.00, businessGroupId: 5 },
  { productCode: '430027', name: 'BPKB1107RoundBowl', category: 'Buna Plate', unitPrice: 55.00, businessGroupId: 5 },
  { productCode: '430003', name: 'BPBM1Mug', category: 'Buna Plate', unitPrice: 45.00, businessGroupId: 5 },
  { productCode: '430028', name: 'BPKB1109RoundPlate', category: 'Buna Plate', unitPrice: 60.00, businessGroupId: 5 },
  { productCode: '430029', name: 'BPKB2006RoundPlate', category: 'Buna Plate', unitPrice: 60.00, businessGroupId: 5 },
  { productCode: '430004', name: 'BPBM2Mug', category: 'Buna Plate', unitPrice: 45.00, businessGroupId: 5 },
  { productCode: '430026', name: 'BPKB1020Bowl', category: 'Buna Plate', unitPrice: 50.00, businessGroupId: 5 },
];

const bunaPenProducts = [
  { productCode: 'BPN-BLUE', name: 'Blue Pen', category: 'Buna Pen', unitPrice: 12.00, businessGroupId: 4 },
  { productCode: 'BPN-BLACK', name: 'Black Pen', category: 'Buna Pen', unitPrice: 12.00, businessGroupId: 4 },
  { productCode: 'BPN-RED', name: 'Red Pen', category: 'Buna Pen', unitPrice: 12.00, businessGroupId: 4 },
];

async function main() {
  const p = await mssql.connect(dbConfig());
  console.log('Connected to database');

  // Delete existing weekly sales first (FK constraint)
  console.log('Deleting existing weekly sales...');
  await p.request().query('DELETE FROM dbo.WeeklySales');
  console.log('Existing weekly sales deleted');

  // Delete existing price gap alerts first (FK constraint)
  console.log('Deleting existing price gap alerts...');
  await p.request().query('DELETE FROM dbo.PriceGapAlert');
  console.log('Existing price gap alerts deleted');

  // Delete existing competitor prices (FK constraint)
  console.log('Deleting existing competitor prices...');
  await p.request().query('DELETE FROM dbo.CompetitorPrice');
  console.log('Existing competitor prices deleted');

  // Delete existing sales records first (FK constraint)
  console.log('Deleting existing sales records...');
  await p.request().query('DELETE FROM dbo.SalesRecord');
  console.log('Existing sales records deleted');

  // Delete existing products
  console.log('Deleting existing products...');
  await p.request().query('DELETE FROM dbo.Product');
  console.log('Existing products deleted');

  // Insert Buna Plate products
  console.log('Inserting Buna Plate products...');
  for (const prod of bunaPlateProducts) {
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
    console.log(`Inserted: ${prod.name} (${prod.productCode})`);
  }

  // Insert Buna Pen products
  console.log('Inserting Buna Pen products...');
  for (const prod of bunaPenProducts) {
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
    console.log(`Inserted: ${prod.name} (${prod.productCode})`);
  }

  // Verify
  const verify = await p.request().query('SELECT ProductID, ProductCode, Name, Category, UnitPrice, BusinessGroupID FROM dbo.Product ORDER BY BusinessGroupID, ProductID');
  console.log('\n=== Final Product List ===');
  console.table(verify.recordset);

  await p.close();
  console.log('\nDone!');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });