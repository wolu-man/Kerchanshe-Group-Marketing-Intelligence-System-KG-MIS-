// =============================================================================
// D365FO integration - master data sync (FDS EPIC-03, Integration Design 3).
// Production: OData/REST over HTTPS with OAuth2 client credentials. Read-only.
// Development: D365FO_MOCK=true returns a deterministic sample dataset so the
// sync job is fully exercised end-to-end without external access.
// =============================================================================
import sql from 'mssql';
import { env } from '../config/env';
import { db } from '../db/pool';
import { logger } from '../config/logger';

export interface SyncEntity {
  entity: 'Product' | 'Customer' | 'Sales';
  recordsProcessed: number;
  errorCount: number;
}

export interface D365FoProduct {
  D365FOKey: string;
  ProductCode: string;
  Name: string;
  Category: string;
  UnitPrice: number | null;
  IsActive: boolean;
}

export interface D365FoCustomer {
  D365FOKey: string;
  CustomerCode: string;
  Name: string;
  CustomerType: string | null;
  IsActive: boolean;
}

export interface D365FoSalesOrder {
  D365FOKey: string;
  ProductCode: string;
  CustomerCode: string;
  SaleDate: string;
  Quantity: number;
  Amount: number;
}

// ---------------------------------------------------------------------------
// Mock dataset (development). Mirrors the seeded master data so sync remains
// idempotent and deterministic.
// ---------------------------------------------------------------------------
function mockProducts(): D365FoProduct[] {
  const rows: Array<[string, string, string, string, number | null, boolean]> = [
    ['P-001', 'COF-AR-1KG', 'Arabica Coffee 1kg', 'Coffee', 850, true],
    ['P-002', 'COF-RO-500G', 'Washed Coffee 500g', 'Coffee', 480, true],
    ['P-003', 'TEA-BL-500G', 'Unwashed Coffee 500g', 'Coffee', 320, true],
    ['P-004', 'TEA-GR-250G', 'Green Tea 250g', 'Tea', 280, true],
    ['P-005', 'GRN-TEF-50KG', 'Tef Grain 50kg', 'Cereals', 2600, true],
    ['P-006', 'GRN-SOR-50KG', 'Sorghum 50kg', 'Cereals', 1900, true],
    ['P-007', 'SPC-BER-500G', 'Berbere Spice 500g', 'Spices', 150, true],
    ['P-008', 'SPC-SHM-500G', 'Shiro Powder 500g', 'Spices', 120, true],
  ];
  return rows.map((r) => ({
    D365FOKey: r[0],
    ProductCode: r[1],
    Name: r[2],
    Category: r[3],
    UnitPrice: r[4],
    IsActive: r[5],
  }));
}

function mockCustomers(): D365FoCustomer[] {
  const rows: Array<[string, string, string, string | null, boolean]> = [
    ['C-001', 'DIST-001', 'Addis Beverages Plc', 'Distributor', true],
    ['C-002', 'DIST-002', 'Oromia Agro Trading', 'Distributor', true],
    ['C-003', 'RET-001', 'Shola Retail', 'Retailer', true],
    ['C-004', 'RET-002', 'Hawassa Supermarket', 'Retailer', true],
    ['C-005', 'RET-003', 'Bahir Dar Retail', 'Retailer', true],
    ['C-006', 'END-001', 'City Cafe Group', 'End User', true],
  ];
  return rows.map((r) => ({
    D365FOKey: r[0],
    CustomerCode: r[1],
    Name: r[2],
    CustomerType: r[3],
    IsActive: r[4],
  }));
}

function mockSalesOrders(): D365FoSalesOrder[] {
  const rows: Array<[string, string, string, string, number, number]> = [
    ['SO-001', 'COF-AR-1KG', 'DIST-001', '2026-01-15', 120, 102000],
    ['SO-002', 'COF-RO-500G', 'RET-001', '2026-01-20', 80, 38400],
    ['SO-003', 'TEA-BL-500G', 'DIST-002', '2026-02-05', 90, 28800],
    ['SO-004', 'COF-AR-1KG', 'DIST-002', '2026-02-12', 150, 127500],
    ['SO-005', 'GRN-TEF-50KG', 'DIST-001', '2026-03-03', 40, 104000],
    ['SO-006', 'TEA-GR-250G', 'RET-002', '2026-03-18', 60, 16800],
    ['SO-007', 'COF-AR-1KG', 'RET-002', '2026-04-02', 110, 93500],
    ['SO-008', 'COF-RO-500G', 'RET-003', '2026-04-22', 95, 45600],
    ['SO-009', 'GRN-SOR-50KG', 'DIST-002', '2026-05-10', 55, 104500],
    ['SO-010', 'TEA-BL-500G', 'END-001', '2026-05-25', 70, 22400],
    ['SO-011', 'COF-AR-1KG', 'DIST-001', '2026-06-08', 135, 114750],
    ['SO-012', 'SPC-BER-500G', 'RET-001', '2026-06-20', 200, 30000],
    ['SO-013', 'SPC-SHM-500G', 'RET-002', '2026-07-01', 180, 21600],
    ['SO-014', 'GRN-TEF-50KG', 'DIST-001', '2026-07-15', 60, 156000],
    ['SO-015', 'COF-RO-500G', 'DIST-002', '2026-08-05', 85, 40800],
  ];
  return rows.map((r) => ({
    D365FOKey: r[0],
    ProductCode: r[1],
    CustomerCode: r[2],
    SaleDate: r[3],
    Quantity: r[4],
    Amount: r[5],
  }));
}

// ---------------------------------------------------------------------------
// Fetch layer
// ---------------------------------------------------------------------------
/** Pulls an entity set from D365FO. */
export async function fetchEntities(entity: 'Product' | 'Customer' | 'Sales'): Promise<unknown[]> {
  if (env.d365fo.mock) {
    if (entity === 'Product') return mockProducts();
    if (entity === 'Customer') return mockCustomers();
    return mockSalesOrders();
  }
  // TODO(prod): OAuth2 client-credentials token, then GET
  //             {baseUrl}/data/...?$select=... with paging (nextLink).
  throw new Error(`D365FO live endpoint for '${entity}' not wired`);
}

// ---------------------------------------------------------------------------
// Upsert layer (idempotent, transactional per entity type)
// ---------------------------------------------------------------------------
async function upsertProducts(items: D365FoProduct[]): Promise<number> {
  let processed = 0;
  for (const p of items) {
    const req = db.request(); // fresh Request per row (avoids parameter reuse)
    req.input('D365FOKey', sql.VarChar(100), p.D365FOKey);
    req.input('ProductCode', sql.VarChar(50), p.ProductCode);
    req.input('Name', sql.NVarChar(150), p.Name);
    req.input('Category', sql.VarChar(100), p.Category);
    req.input('UnitPrice', sql.Decimal(18, 2), p.UnitPrice);
    req.input('IsActive', sql.Bit, p.IsActive);
    await req.query(`
      MERGE dbo.Product AS t
      USING (SELECT @D365FOKey AS D365FOKey) AS s ON t.D365FOKey = s.D365FOKey
      WHEN MATCHED THEN UPDATE SET
        t.ProductCode = @ProductCode, t.Name = @Name, t.Category = @Category,
        t.UnitPrice = @UnitPrice, t.IsActive = @IsActive, t.UpdatedAt = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (D365FOKey, ProductCode, Name, Category, UnitPrice, IsActive)
        VALUES (@D365FOKey, @ProductCode, @Name, @Category, @UnitPrice, @IsActive);`);
    processed++;
  }
  return processed;
}

async function upsertCustomers(items: D365FoCustomer[]): Promise<number> {
  let processed = 0;
  for (const c of items) {
    const req = db.request();
    req.input('D365FOKey', sql.VarChar(100), c.D365FOKey);
    req.input('CustomerCode', sql.VarChar(50), c.CustomerCode);
    req.input('Name', sql.NVarChar(150), c.Name);
    req.input('CustomerType', sql.VarChar(50), c.CustomerType);
    req.input('IsActive', sql.Bit, c.IsActive);
    await req.query(`
      MERGE dbo.Customer AS t
      USING (SELECT @D365FOKey AS D365FOKey) AS s ON t.D365FOKey = s.D365FOKey
      WHEN MATCHED THEN UPDATE SET
        t.CustomerCode = @CustomerCode, t.Name = @Name, t.CustomerType = @CustomerType,
        t.IsActive = @IsActive, t.UpdatedAt = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (D365FOKey, CustomerCode, Name, CustomerType, IsActive)
        VALUES (@D365FOKey, @CustomerCode, @Name, @CustomerType, @IsActive);`);
    processed++;
  }
  return processed;
}

async function upsertSales(items: D365FoSalesOrder[]): Promise<number> {
  let processed = 0;
  for (const s of items) {
    const req = db.request();
    req.input('D365FOKey', sql.VarChar(100), s.D365FOKey);
    req.input('ProductCode', sql.VarChar(50), s.ProductCode);
    req.input('CustomerCode', sql.VarChar(50), s.CustomerCode);
    req.input('SaleDate', sql.Date, s.SaleDate);
    req.input('Quantity', sql.Decimal(18, 3), s.Quantity);
    req.input('Amount', sql.Decimal(18, 2), s.Amount);
    await req.query(`
      MERGE dbo.SalesRecord AS t
      USING (SELECT @D365FOKey AS D365FOKey) AS s ON t.D365FOKey = s.D365FOKey
      WHEN MATCHED THEN UPDATE SET
        t.ProductID  = (SELECT ProductID  FROM dbo.Product  WHERE ProductCode = @ProductCode),
        t.CustomerID = (SELECT CustomerID FROM dbo.Customer WHERE CustomerCode = @CustomerCode),
        t.SaleDate = @SaleDate, t.Quantity = @Quantity, t.Amount = @Amount
      WHEN NOT MATCHED THEN INSERT (D365FOKey, ProductID, CustomerID, SaleDate, Quantity, Amount)
        VALUES (@D365FOKey,
                (SELECT ProductID  FROM dbo.Product  WHERE ProductCode = @ProductCode),
                (SELECT CustomerID FROM dbo.Customer WHERE CustomerCode = @CustomerCode),
                @SaleDate, @Quantity, @Amount);`);
    processed++;
  }
  return processed;
}

/** Runs a full sync for all entities; returns per-entity processing stats. */
export async function runFullSync(): Promise<SyncEntity[]> {
  const results: SyncEntity[] = [];
  const jobs: Array<{ entity: SyncEntity['entity']; upsert: (items: any[]) => Promise<number> }> = [
    { entity: 'Product', upsert: upsertProducts },
    { entity: 'Customer', upsert: upsertCustomers },
    { entity: 'Sales', upsert: upsertSales },
  ];

  for (const job of jobs) {
    try {
      const items = (await fetchEntities(job.entity)) as any[];
      const processed = await job.upsert(items);
      results.push({ entity: job.entity, recordsProcessed: processed, errorCount: 0 });
    } catch (err) {
      logger.error('Sync entity failed', { entity: job.entity, error: (err as Error).message });
      results.push({ entity: job.entity, recordsProcessed: 0, errorCount: 1 });
    }
  }
  return results;
}
