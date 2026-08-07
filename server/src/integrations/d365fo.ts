import { env } from '../config/env';
import { getPool } from '../db/pool';
import sql from 'mssql';

export interface SyncResult {
  entity: 'Product' | 'Customer' | 'Sales';
  recordsProcessed: number;
}

export interface D365foEntity {
  id: string;
  [key: string]: unknown;
}

/**
 * D365FO connector (FDS EPIC-03 / FR-03.1, FR-03.5).
 * When D365FO_MOCK=true a deterministic mock dataset is returned so the app
 * works end-to-end without live API access. The real adapter fetches the
 * same entity shapes from the D365FO OData/REST endpoints.
 */
export async function fetchD365foEntities(entity: 'Product' | 'Customer' | 'Sales'): Promise<D365foEntity[]> {
  if (env.d365fo.mock) {
    return fetchMockEntities(entity);
  }
  // TODO: implement OData/REST fetch against env.d365fo.baseUrl once access confirmed.
  throw new Error(`D365FO live fetch not configured for entity '${entity}'`);
}

function fetchMockEntities(entity: 'Product' | 'Customer' | 'Sales'): D365foEntity[] {
  const today = new Date().toISOString().slice(0, 10);
  switch (entity) {
    case 'Product':
      return [
        { id: 'P-ARABICA-1', productCode: 'BUN-ARABICA-1KG', name: 'Buna Arabica 1kg', category: 'Coffee', unitPrice: 1250.0 },
        { id: 'P-ROBUSTA-1', productCode: 'BUN-ROBUSTA-500G', name: 'Buna Robusta 500g', category: 'Coffee', unitPrice: 480.0 },
        { id: 'P-TEA-1', productCode: 'TEA-BLACK-250G', name: 'Black Tea 250g', category: 'Tea', unitPrice: 320.0 },
        { id: 'P-SUGAR-1', productCode: 'SUGAR-1KG', name: 'Sugar 1kg', category: 'Sugar', unitPrice: 130.0 },
        { id: 'P-BERB-1', productCode: 'SPICE-BERBERE-250G', name: 'Berbere Spice 250g', category: 'Spices', unitPrice: 220.0 },
      ];
    case 'Customer':
      return [
        { id: 'C-0001', customerCode: 'CUS-0001', name: 'Addis Coffee Distributors', customerType: 'Distributor' },
        { id: 'C-0002', customerCode: 'CUS-0002', name: 'Oromia Retail Group', customerType: 'Retailer' },
        { id: 'C-0003', customerCode: 'CUS-0003', name: 'Amhara Wholesale PLC', customerType: 'Wholesale' },
      ];
    case 'Sales':
      return [
        { id: 'SO-2026-0001', productCode: 'BUN-ARABICA-1KG', customerCode: 'CUS-0001', saleDate: '2026-06-01', quantity: 500, amount: 625000, region: 'Addis Ababa' },
        { id: 'SO-2026-0002', productCode: 'BUN-ROBUSTA-500G', customerCode: 'CUS-0001', saleDate: '2026-06-15', quantity: 800, amount: 384000, region: 'Oromia' },
        { id: 'SO-2026-0003', productCode: 'BUN-ARABICA-1KG', customerCode: 'CUS-0002', saleDate: '2026-07-05', quantity: 300, amount: 375000, region: 'Addis Ababa' },
        { id: 'SO-2026-0004', productCode: 'TEA-BLACK-250G', customerCode: 'CUS-0002', saleDate: '2026-07-20', quantity: 1200, amount: 384000, region: 'Amhara' },
        { id: 'SO-2026-0005', productCode: 'SUGAR-1KG', customerCode: 'CUS-0003', saleDate: today, quantity: 2000, amount: 260000, region: 'Amhara' },
      ];
  }
}

/** Upserts cached master data from D365FO (idempotent, transactional per entity). */
export async function upsertFromD365fo(entity: 'Product' | 'Customer' | 'Sales'): Promise<SyncResult> {
  const rows = await fetchD365foEntities(entity);
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  let recordsProcessed = 0;
  await transaction.begin();

  try {
    for (const row of rows) {
      const request = new sql.Request(transaction);
      switch (entity) {
        case 'Product': {
          await request
            .input('key', sql.VarChar(100), row.id as string)
            .input('code', sql.VarChar(50), row.productCode as string)
            .input('name', sql.NVarChar(150), row.name as string)
            .input('category', sql.VarChar(100), row.category as string)
            .input('price', sql.Decimal(18, 2), (row.unitPrice as number) ?? null)
            .query(`
              MERGE dbo.Product AS target
              USING (SELECT @key AS D365FOKey) AS source ON target.D365FOKey = source.D365FOKey
              WHEN MATCHED THEN UPDATE SET
                ProductCode = @code, Name = @name, Category = @category,
                UnitPrice = @price, IsActive = 1, UpdatedAt = SYSUTCDATETIME()
              WHEN NOT MATCHED THEN INSERT (D365FOKey, ProductCode, Name, Category, UnitPrice, IsActive)
                VALUES (@key, @code, @name, @category, @price, 1);
            `);
          break;
        }
        case 'Customer': {
          await request
            .input('key', sql.VarChar(100), row.id as string)
            .input('code', sql.VarChar(50), row.customerCode as string)
            .input('name', sql.NVarChar(150), row.name as string)
            .input('type', sql.VarChar(50), (row.customerType as string) ?? null)
            .query(`
              MERGE dbo.Customer AS target
              USING (SELECT @key AS D365FOKey) AS source ON target.D365FOKey = source.D365FOKey
              WHEN MATCHED THEN UPDATE SET
                CustomerCode = @code, Name = @name, CustomerType = @type,
                IsActive = 1, UpdatedAt = SYSUTCDATETIME()
              WHEN NOT MATCHED THEN INSERT (D365FOKey, CustomerCode, Name, CustomerType, IsActive)
                VALUES (@key, @code, @name, @type, 1);
            `);
          break;
        }
        case 'Sales': {
          await request
            .input('key', sql.VarChar(100), row.id as string)
            .input('productCode', sql.VarChar(50), row.productCode as string)
            .input('customerCode', sql.VarChar(50), row.customerCode as string)
            .input('saleDate', sql.Date, new Date(row.saleDate as string))
            .input('quantity', sql.Decimal(18, 3), row.quantity as number)
            .input('amount', sql.Decimal(18, 2), row.amount as number)
            .input('region', sql.NVarChar(100), (row.region as string) ?? null)
            .query(`
              IF NOT EXISTS (SELECT 1 FROM dbo.SalesRecord WHERE D365FOKey = @key)
              BEGIN
                INSERT INTO dbo.SalesRecord (D365FOKey, ProductID, CustomerID, SaleDate, Quantity, Amount, RegionID)
                SELECT @key, p.ProductID, c.CustomerID, @saleDate, @quantity, @amount, r.RegionID
                FROM (SELECT 1 AS x) dummy
                LEFT JOIN dbo.Product p ON p.ProductCode = @productCode
                LEFT JOIN dbo.Customer c ON c.CustomerCode = @customerCode
                LEFT JOIN dbo.Region r ON r.RegionName = @region;
              END
            `);
          break;
        }
      }
      recordsProcessed += 1;
    }
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }

  return { entity, recordsProcessed };
}
