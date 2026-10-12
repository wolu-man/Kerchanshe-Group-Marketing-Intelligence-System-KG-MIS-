import sql from 'mssql';
import { db } from '../../db/pool';
import { NotFoundError, ConflictError, BadRequestError } from '../../utils/errors';
import { scopeClause, type DataScope } from '../../utils/scope';

export interface WeeklySalesFilters {
  weekEnding?: string;
  businessGroupId?: number;
  regionId?: number;
  outletId?: number;
  productId?: number;
  customerTypeId?: number;
  colorId?: number;
  status?: string;
  dataScope: DataScope;
  userId: number;
  page?: number;
  pageSize?: number;
}

const BASE_SELECT = `
  SELECT w.WeeklySalesID, w.WeekEnding, w.QuantitySold, w.UnitPrice, w.Revenue, w.Status, w.Notes,
         w.SubmittedBy, w.CreatedAt, w.UpdatedAt,
         w.ColorID,
         bg.BusinessGroupID, bg.Code AS BusinessGroupCode, bg.Name AS BusinessGroupName,
         p.ProductID, p.ProductCode, p.Name AS ProductName, p.Category,
         COALESCE(wc.Name, pcols.ProductColors) AS ProductColor,
         COALESCE(w.ProductSize, p.Size) AS ProductSize,
         COALESCE(w.ProductCategory, p.Category) AS ProductCategory,
         COALESCE(w.ProductSpecs, p.Specifications) AS ProductSpecs,
         r.RegionID, r.RegionName, r.Country,
         o.OutletID, o.OutletName, o.City,
         c.CustomerID, c.Name AS CustomerName, c.CustomerType,
         ct.CustomerTypeID, ct.Name AS CustomerTypeName,
         u.Name AS SubmittedByName
  FROM dbo.WeeklySales w
  JOIN dbo.BusinessGroup bg ON bg.BusinessGroupID = w.BusinessGroupID
  JOIN dbo.Product p ON p.ProductID = w.ProductID
  JOIN dbo.Region r ON r.RegionID = w.RegionID
  JOIN dbo.Outlet o ON o.OutletID = w.OutletID
  LEFT JOIN dbo.Color wc ON wc.ColorID = w.ColorID
  OUTER APPLY (
    SELECT STRING_AGG(c.Name, ', ') WITHIN GROUP (ORDER BY c.SortOrder, c.Name) AS ProductColors
    FROM dbo.ProductColor pc
    JOIN dbo.Color c ON c.ColorID = pc.ColorID
    WHERE pc.ProductID = p.ProductID
  ) pcols
  LEFT JOIN dbo.Customer c ON c.CustomerID = w.CustomerID
  LEFT JOIN dbo.CustomerType ct ON ct.CustomerTypeID = c.CustomerTypeID
  JOIN dbo.[User] u ON u.UserID = w.SubmittedBy`;

// A sale's color must be one of the product's linked colors (single source of
// truth) or NULL (always allowed). The explicit colorId path is strict (400 on
// out-of-palette values); the legacy productColor string path tolerates unknown
// free text (stores NULL) but still rejects canonical colors that contradict
// the product's palette.
async function resolveSaleColor(
  productId: number,
  colorId?: number | null,
  legacyColor?: string | null
): Promise<number | null> {
  const assertInPalette = async (candidateId: number): Promise<number> => {
    const m = await db
      .request()
      .input('ProductId', sql.Int, productId)
      .input('ColorId', sql.Int, candidateId)
      .query(`SELECT 1 AS Ok FROM dbo.ProductColor WHERE ProductID = @ProductId AND ColorID = @ColorId`);
    if (m.recordset.length === 0) {
      throw new BadRequestError("Selected color is not one of this product's colors");
    }
    return candidateId;
  };
  if (colorId !== undefined) {
    if (colorId == null) return null;
    return assertInPalette(colorId);
  }
  const raw = (legacyColor ?? '').trim();
  if (!raw || raw.includes(',')) return null; // empty or a full palette string -> no single color
  const lookup = await db
    .request()
    .input('Name', sql.NVarChar(50), raw)
    .query(`SELECT TOP 1 ColorID FROM dbo.Color WHERE LOWER(Name) = LOWER(@Name)`);
  if (lookup.recordset.length === 0) return null; // unknown free text -> no color
  return assertInPalette(lookup.recordset[0].ColorID as number);
}

export async function listWeeklySales(filters: WeeklySalesFilters): Promise<{ items: any[]; total: number; page: number; pageSize: number }> {
  const where: string[] = ['1=1'];
  const request = db.request();
  if (filters.weekEnding) { where.push('w.WeekEnding = @WeekEnding'); request.input('WeekEnding', sql.Date, filters.weekEnding); }
  if (filters.businessGroupId) { where.push('w.BusinessGroupID = @BgId'); request.input('BgId', sql.Int, filters.businessGroupId); }
  if (filters.regionId) { where.push('w.RegionID = @RegionId'); request.input('RegionId', sql.Int, filters.regionId); }
  if (filters.outletId) { where.push('w.OutletID = @OutletId'); request.input('OutletId', sql.Int, filters.outletId); }
  if (filters.productId) { where.push('w.ProductID = @ProductId'); request.input('ProductId', sql.Int, filters.productId); }
  if (filters.customerTypeId) { where.push('c.CustomerTypeID = @CustomerTypeId'); request.input('CustomerTypeId', sql.Int, filters.customerTypeId); }
  if (filters.colorId) { where.push('w.ColorID = @ColorId'); request.input('ColorId', sql.Int, filters.colorId); }
  if (filters.status) { where.push('w.Status = @Status'); request.input('Status', sql.VarChar(20), filters.status); }
  request.input('UserId', sql.Int, filters.userId);
  const scope = scopeClause(filters.dataScope, { alias: 'w', ownerColumn: 'SubmittedBy', regionColumn: 'RegionID' });
  if (scope) where.push(scope);

  const whereSql = where.join(' AND ');
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const offset = (page - 1) * pageSize;
  request.input('Offset', sql.Int, offset);
  request.input('Limit', sql.Int, pageSize);
  const count = await request.query(`SELECT COUNT(*) AS Total FROM (${BASE_SELECT} WHERE ${whereSql}) t`);
  const result = await request.query(`${BASE_SELECT} WHERE ${whereSql} ORDER BY w.WeekEnding DESC, w.CreatedAt DESC OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY`);
  return { items: result.recordset, total: count.recordset[0].Total, page, pageSize };
}

export async function createWeeklySale(data: {
  submittedBy: number;
  weekEnding: string;
  businessGroupId: number;
  productId: number;
  regionId: number;
  outletId: number;
  customerId?: number | null;
  quantitySold: number;
  unitPrice: number;
  notes?: string | null;
  colorId?: number | null;
  productColor?: string | null;
  productSize?: string | null;
  productCategory?: string | null;
  productSpecs?: string | null;
}): Promise<number> {
  const colorId = await resolveSaleColor(data.productId, data.colorId, data.productColor);
  const result = await db
    .request()
    .input('WeekEnding', sql.Date, data.weekEnding)
    .input('BusinessGroupId', sql.Int, data.businessGroupId)
    .input('ProductId', sql.Int, data.productId)
    .input('RegionId', sql.Int, data.regionId)
    .input('OutletId', sql.Int, data.outletId)
    .input('CustomerId', sql.Int, data.customerId ?? null)
    .input('QuantitySold', sql.Decimal(18, 3), data.quantitySold)
    .input('UnitPrice', sql.Decimal(18, 2), data.unitPrice)
    .input('Notes', sql.NVarChar(sql.MAX), data.notes ?? null)
    .input('ColorId', sql.Int, colorId)
    .input('ProductSize', sql.NVarChar(50), data.productSize ?? null)
    .input('ProductCategory', sql.VarChar(100), data.productCategory ?? null)
    .input('ProductSpecs', sql.NVarChar(sql.MAX), data.productSpecs ?? null)
    .input('SubmittedBy', sql.Int, data.submittedBy)
    .query(
      `INSERT INTO dbo.WeeklySales (WeekEnding, BusinessGroupID, ProductID, RegionID, OutletID,
              CustomerID, QuantitySold, UnitPrice, Notes, ColorID, ProductSize, ProductCategory, ProductSpecs, SubmittedBy, Status)
       OUTPUT INSERTED.WeeklySalesID
       VALUES (@WeekEnding, @BusinessGroupId, @ProductId, @RegionId, @OutletId,
              @CustomerId, @QuantitySold, @UnitPrice, @Notes, @ColorId, @ProductSize, @ProductCategory, @ProductSpecs, @SubmittedBy, 'Submitted')`
    );
  return result.recordset[0].WeeklySalesID;
}

export async function getWeeklySale(id: number): Promise<any> {
  const result = await db
    .request()
    .input('Id', sql.Int, id)
    .query(`${BASE_SELECT} WHERE w.WeeklySalesID = @Id`);
  if (result.recordset.length === 0) throw new NotFoundError('Weekly sales entry not found');
  return result.recordset[0];
}

export async function updateWeeklySale(
  id: number,
  data: Partial<{
    weekEnding: string;
    businessGroupId: number;
    productId: number;
    regionId: number;
    outletId: number;
    customerId: number | null;
    quantitySold: number;
    unitPrice: number;
    notes: string | null;
    colorId: number | null;
    productColor: string | null;
    productSize: string | null;
    productCategory: string | null;
    productSpecs: string | null;
  }>
): Promise<void> {
  const request = db.request().input('Id', sql.Int, id);
  const sets: string[] = ['UpdatedAt = SYSUTCDATETIME()'];

  const colorProvided = data.colorId !== undefined || data.productColor !== undefined;
  if (colorProvided || data.productId !== undefined) {
    const current = await db
      .request()
      .input('Id', sql.Int, id)
      .query(`SELECT ProductID, ColorID FROM dbo.WeeklySales WHERE WeeklySalesID = @Id`);
    const row = current.recordset[0];
    if (row) {
      const finalProductId = data.productId ?? (row.ProductID as number);
      if (colorProvided) {
        const resolved = await resolveSaleColor(finalProductId, data.colorId, data.productColor);
        sets.push('ColorID = @ColorId');
        request.input('ColorId', sql.Int, resolved);
      } else if (data.productId !== undefined && data.productId !== row.ProductID && row.ColorID != null) {
        // Product changed: keep the existing color only if it still belongs
        // to the new product's palette, otherwise clear it (never contradict).
        const m = await db
          .request()
          .input('ProductId', sql.Int, finalProductId)
          .input('ColorId', sql.Int, row.ColorID as number)
          .query(`SELECT 1 AS Ok FROM dbo.ProductColor WHERE ProductID = @ProductId AND ColorID = @ColorId`);
        if (m.recordset.length === 0) {
          sets.push('ColorID = NULL');
        }
      }
    }
  }

  const map: Array<[keyof typeof data, string, any]> = [
    ['weekEnding', 'WeekEnding', sql.Date],
    ['businessGroupId', 'BusinessGroupID', sql.Int],
    ['productId', 'ProductID', sql.Int],
    ['regionId', 'RegionID', sql.Int],
    ['outletId', 'OutletID', sql.Int],
    ['customerId', 'CustomerID', sql.Int],
    ['quantitySold', 'QuantitySold', sql.Decimal(18, 3)],
    ['unitPrice', 'UnitPrice', sql.Decimal(18, 2)],
    ['notes', 'Notes', sql.NVarChar(sql.MAX)],
    ['productSize', 'ProductSize', sql.NVarChar(50)],
    ['productCategory', 'ProductCategory', sql.VarChar(100)],
    ['productSpecs', 'ProductSpecs', sql.NVarChar(sql.MAX)],
  ];
  for (const [key, column, type] of map) {
    const value = data[key];
    if (value !== undefined) {
      sets.push(`${column} = @${column}`);
      request.input(column, type, value ?? null);
    }
  }
  try {
    await request.query(`UPDATE dbo.WeeklySales SET ${sets.join(', ')} WHERE WeeklySalesID = @Id`);
  } catch (err: any) {
    // UQ_WeeklySales_Week_Product_Outlet — 2627 (constraint) / 2601 (unique index)
    if (err?.number === 2627 || err?.number === 2601) {
      throw new ConflictError('Another entry already exists for this product, outlet and week');
    }
    throw err;
  }
}

export async function deleteWeeklySale(id: number): Promise<void> {
  const result = await db.request().input('Id', sql.Int, id).query(`DELETE FROM dbo.WeeklySales WHERE WeeklySalesID = @Id`);
  if (result.rowsAffected[0] === 0) throw new NotFoundError('Weekly sales entry not found');
}
