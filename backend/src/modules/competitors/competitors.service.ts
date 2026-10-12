import sql from 'mssql';
import { db } from '../../db/pool';
import { NotFoundError, ConflictError, BadRequestError } from '../../utils/errors';
import { dispatchEvent } from '../notifications/notifications.service';

// ---------------------------------------------------------------------------
// Competitor entity (master catalogue)
// ---------------------------------------------------------------------------

const COMPETITOR_SELECT = `
  SELECT c.CompetitorID, c.Name, c.ProductsCovered, c.RegionsActiveIn, c.Notes,
         c.BusinessGroupID, c.IsActive, c.CreatedAt, c.UpdatedAt,
         bg.Code AS BusinessGroupCode, bg.Name AS BusinessGroupName,
         (SELECT COUNT(*) FROM dbo.CompetitorProduct cp WHERE cp.CompetitorID = c.CompetitorID) AS ProductCount
  FROM dbo.Competitor c
  LEFT JOIN dbo.BusinessGroup bg ON bg.BusinessGroupID = c.BusinessGroupID`;

export interface CompetitorInput {
  name: string;
  productsCovered?: string | null;
  regionsActiveIn?: string | null;
  notes?: string | null;
  businessGroupId?: number | null;
}

/** Case-insensitive trimmed name lookup (DB collation is CI). */
async function findCompetitorByName(name: string, excludeId?: number): Promise<any | null> {
  const request = db.request().input('Name', sql.NVarChar(150), name.trim());
  let where = 'LTRIM(RTRIM(c.Name)) = @Name';
  if (excludeId) {
    where += ' AND c.CompetitorID <> @ExcludeId';
    request.input('ExcludeId', sql.Int, excludeId);
  }
  const result = await request.query(`${COMPETITOR_SELECT} WHERE ${where}`);
  return result.recordset[0] ?? null;
}

export async function listCompetitors(opts: { search?: string; includeInactive?: boolean } = {}): Promise<any[]> {
  const where: string[] = [];
  const request = db.request();
  if (!opts.includeInactive) where.push('c.IsActive = 1');
  if (opts.search) {
    where.push('(c.Name LIKE @Search OR c.ProductsCovered LIKE @Search)');
    request.input('Search', sql.NVarChar(400), `%${opts.search}%`);
  }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const result = await request.query(`${COMPETITOR_SELECT}${whereSql} ORDER BY c.Name`);
  return result.recordset;
}

export async function getCompetitor(id: number): Promise<any | null> {
  const result = await db.request().input('Id', sql.Int, id).query(`${COMPETITOR_SELECT} WHERE c.CompetitorID = @Id`);
  return result.recordset[0] ?? null;
}

/**
 * Create a competitor. Dedup: an active name match is a 409; a soft-deleted
 * match is reactivated (with its fields refreshed) instead of creating a twin.
 */
export async function createCompetitor(data: CompetitorInput): Promise<{ competitorId: number; reactivated: boolean }> {
  const existing = await findCompetitorByName(data.name);
  if (existing && existing.IsActive) {
    throw new ConflictError('A competitor with this name already exists');
  }
  if (existing) {
    await db
      .request()
      .input('Id', sql.Int, existing.CompetitorID)
      .input('Name', sql.NVarChar(150), data.name.trim())
      .input('ProductsCovered', sql.NVarChar(sql.MAX), data.productsCovered ?? existing.ProductsCovered ?? null)
      .input('RegionsActiveIn', sql.NVarChar(sql.MAX), data.regionsActiveIn ?? existing.RegionsActiveIn ?? null)
      .input('Notes', sql.NVarChar(sql.MAX), data.notes ?? existing.Notes ?? null)
      .input('BusinessGroupId', sql.Int, data.businessGroupId ?? existing.BusinessGroupID ?? null)
      .query(
        `UPDATE dbo.Competitor
         SET Name = @Name, ProductsCovered = @ProductsCovered, RegionsActiveIn = @RegionsActiveIn,
             Notes = @Notes, BusinessGroupID = @BusinessGroupId, IsActive = 1, UpdatedAt = SYSUTCDATETIME()
         WHERE CompetitorID = @Id`
      );
    return { competitorId: existing.CompetitorID, reactivated: true };
  }
  const result = await db
    .request()
    .input('Name', sql.NVarChar(150), data.name.trim())
    .input('ProductsCovered', sql.NVarChar(sql.MAX), data.productsCovered ?? null)
    .input('RegionsActiveIn', sql.NVarChar(sql.MAX), data.regionsActiveIn ?? null)
    .input('Notes', sql.NVarChar(sql.MAX), data.notes ?? null)
    .input('BusinessGroupId', sql.Int, data.businessGroupId ?? null)
    .query(
      `INSERT INTO dbo.Competitor (Name, ProductsCovered, RegionsActiveIn, Notes, BusinessGroupID)
       OUTPUT INSERTED.CompetitorID
       VALUES (@Name, @ProductsCovered, @RegionsActiveIn, @Notes, @BusinessGroupId)`
    );
  return { competitorId: result.recordset[0].CompetitorID, reactivated: false };
}

export async function updateCompetitor(id: number, patch: Partial<CompetitorInput>): Promise<void> {
  const current = await getCompetitor(id);
  if (!current) throw new NotFoundError('Competitor not found');
  if (patch.name !== undefined) {
    const clash = await findCompetitorByName(patch.name, id);
    if (clash) throw new ConflictError('A competitor with this name already exists');
  }
  const request = db.request().input('Id', sql.Int, id);
  const sets: string[] = ['UpdatedAt = SYSUTCDATETIME()'];
  const map: Array<[keyof CompetitorInput, string, any]> = [
    ['name', 'Name', sql.NVarChar(150)],
    ['productsCovered', 'ProductsCovered', sql.NVarChar(sql.MAX)],
    ['regionsActiveIn', 'RegionsActiveIn', sql.NVarChar(sql.MAX)],
    ['notes', 'Notes', sql.NVarChar(sql.MAX)],
    ['businessGroupId', 'BusinessGroupID', sql.Int],
  ];
  for (const [key, column, type] of map) {
    const value = patch[key];
    if (value !== undefined) {
      sets.push(`${column} = @${column}`);
      request.input(column, type, key === 'name' ? String(value).trim() : (value as any) ?? null);
    }
  }
  await request.query(`UPDATE dbo.Competitor SET ${sets.join(', ')} WHERE CompetitorID = @Id`);
}

/** Soft delete, blocked while product records reference the competitor. */
export async function deactivateCompetitor(id: number): Promise<void> {
  const current = await getCompetitor(id);
  if (!current) throw new NotFoundError('Competitor not found');
  if (Number(current.ProductCount) > 0) {
    throw new ConflictError(
      `Competitor has ${current.ProductCount} product record(s); delete them first`
    );
  }
  await db
    .request()
    .input('Id', sql.Int, id)
    .query(`UPDATE dbo.Competitor SET IsActive = 0, UpdatedAt = SYSUTCDATETIME() WHERE CompetitorID = @Id`);
}

// ---------------------------------------------------------------------------
// CompetitorProduct (the master price/product rows)
// ---------------------------------------------------------------------------

const PRODUCT_SELECT = `
  SELECT cpd.CompetitorProductID, cpd.CompetitorID, c.Name AS CompetitorName,
         cpd.OurProductID, p.ProductCode, p.Name AS OurProductName, p.UnitPrice AS OwnPrice,
         pcols.ProductColors,
         cpd.ProductName AS CompetitorProduct, cpd.Category, cpd.Price, cpd.PriceMax,
         cpd.EffectiveDate, cpd.Status, cpd.Notes, cpd.Specifications,
         cpd.CreatedAt, cpd.UpdatedAt,
         CASE WHEN p.UnitPrice IS NOT NULL AND p.UnitPrice > 0
              THEN ROUND(p.UnitPrice - cpd.Price, 2) END AS PriceDifference,
         CASE WHEN p.UnitPrice IS NOT NULL AND p.UnitPrice > 0
              THEN ROUND(((p.UnitPrice - cpd.Price) / p.UnitPrice) * 100.0, 2) END AS PriceDifferencePct
  FROM dbo.CompetitorProduct cpd
  JOIN dbo.Competitor c ON c.CompetitorID = cpd.CompetitorID
  LEFT JOIN dbo.Product p ON p.ProductID = cpd.OurProductID
  OUTER APPLY (
    SELECT STRING_AGG(c2.Name, ', ') WITHIN GROUP (ORDER BY c2.SortOrder, c2.Name) AS ProductColors
    FROM dbo.ProductColor pc
    JOIN dbo.Color c2 ON c2.ColorID = pc.ColorID
    WHERE pc.ProductID = p.ProductID
  ) pcols`;

export interface CompetitorProductInput {
  competitorId: number;
  ourProductId?: number | null;
  productName: string;
  category: string;
  price: number;
  priceMax?: number | null;
  effectiveDate?: string | null;
  status?: 'Active' | 'Inactive' | 'Expired';
  notes?: string | null;
  specifications?: Record<string, unknown> | null;
}

export async function listCompetitorProducts(opts: {
  search?: string;
  competitorId?: number;
  category?: string;
  status?: string;
  ourProductId?: number;
  page?: number;
  pageSize?: number;
}): Promise<{ items: any[]; total: number; page: number; pageSize: number }> {
  const where: string[] = [];
  const request = db.request();
  if (opts.search) {
    where.push('(cpd.ProductName LIKE @Search OR c.Name LIKE @Search OR cpd.Category LIKE @Search)');
    request.input('Search', sql.NVarChar(400), `%${opts.search}%`);
  }
  if (opts.competitorId) { where.push('cpd.CompetitorID = @CompetitorId'); request.input('CompetitorId', sql.Int, opts.competitorId); }
  if (opts.category) { where.push('cpd.Category = @Category'); request.input('Category', sql.NVarChar(100), opts.category); }
  if (opts.status) { where.push('cpd.Status = @Status'); request.input('Status', sql.VarChar(20), opts.status); }
  if (opts.ourProductId) { where.push('cpd.OurProductID = @OurProductId'); request.input('OurProductId', sql.Int, opts.ourProductId); }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';

  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 20;
  request.input('Offset', sql.Int, (page - 1) * pageSize);
  request.input('Limit', sql.Int, pageSize);
  const count = await request.query(`SELECT COUNT(*) AS Total FROM dbo.CompetitorProduct cpd JOIN dbo.Competitor c ON c.CompetitorID = cpd.CompetitorID${whereSql}`);
  const result = await request.query(
    `${PRODUCT_SELECT}${whereSql} ORDER BY c.Name, cpd.ProductName OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY`
  );
  return { items: result.recordset, total: count.recordset[0].Total, page, pageSize };
}

export async function getCompetitorProduct(id: number): Promise<any> {
  const result = await db.request().input('Id', sql.Int, id).query(`${PRODUCT_SELECT} WHERE cpd.CompetitorProductID = @Id`);
  if (result.recordset.length === 0) throw new NotFoundError('Competitor product not found');
  return result.recordset[0];
}

export async function listCompetitorProductCategories(): Promise<string[]> {
  const result = await db.request().query(
    `SELECT DISTINCT Category FROM dbo.CompetitorProduct ORDER BY Category`
  );
  return result.recordset.map((r: any) => r.Category);
}

async function assertProductRefs(data: { competitorId: number; ourProductId?: number | null }): Promise<{ competitorName: string }> {
  const competitor = await db
    .request()
    .input('Id', sql.Int, data.competitorId)
    .query(`SELECT Name FROM dbo.Competitor WHERE CompetitorID = @Id AND IsActive = 1`);
  if (competitor.recordset.length === 0) throw new NotFoundError('Competitor not found');
  if (data.ourProductId) {
    const product = await db.request().input('Id', sql.Int, data.ourProductId).query(`SELECT 1 FROM dbo.Product WHERE ProductID = @Id`);
    if (product.recordset.length === 0) throw new NotFoundError('Product not found');
  }
  return { competitorName: competitor.recordset[0].Name };
}

async function assertNoDuplicateProduct(competitorId: number, productName: string, excludeId?: number): Promise<void> {
  const request = db
    .request()
    .input('CompetitorId', sql.Int, competitorId)
    .input('Name', sql.NVarChar(200), productName.trim());
  let where = 'CompetitorID = @CompetitorId AND ProductName = @Name';
  if (excludeId) {
    where += ' AND CompetitorProductID <> @ExcludeId';
    request.input('ExcludeId', sql.Int, excludeId);
  }
  const dup = await request.query(`SELECT CompetitorProductID FROM dbo.CompetitorProduct WHERE ${where}`);
  if (dup.recordset.length > 0) {
    const competitor = await db.request().input('Id', sql.Int, competitorId).query(`SELECT Name FROM dbo.Competitor WHERE CompetitorID = @Id`);
    throw new ConflictError(
      `"${productName.trim()}" already exists for competitor ${competitor.recordset[0]?.Name ?? competitorId}`
    );
  }
}

/**
 * Price Difference and Price Difference % (app convention: ÷ own price),
 * plus threshold-driven PriceGapAlert upsert — mirrors recordPrice().
 */
/** Remove any gap alert tied to a competitor product row (used when the link is gone). */
async function removeGapAlert(competitorProductId: number): Promise<void> {
  await db
    .request()
    .input('Id', sql.Int, competitorProductId)
    .query(`DELETE FROM dbo.PriceGapAlert WHERE CompetitorProductID = @Id`);
}

async function computeGapAndAlert(args: {
  competitorProductId: number;
  ourProductId: number | null;
  price: number;
  competitorName: string;
  productCode?: string | null;
}): Promise<{ priceDifference: number | null; priceDifferencePct: number | null; alertCreated: boolean }> {
  const { competitorProductId, ourProductId, price, competitorName, productCode } = args;
  if (!ourProductId) {
    await removeGapAlert(competitorProductId);
    return { priceDifference: null, priceDifferencePct: null, alertCreated: false };
  }
  const product = await db.request().input('Id', sql.Int, ourProductId).query(
    `SELECT ProductID, ProductCode, Category, UnitPrice FROM dbo.Product WHERE ProductID = @Id`
  );
  if (product.recordset.length === 0) {
    await removeGapAlert(competitorProductId);
    return { priceDifference: null, priceDifferencePct: null, alertCreated: false };
  }
  const own = Number(product.recordset[0].UnitPrice ?? 0);
  if (!(own > 0)) {
    await removeGapAlert(competitorProductId);
    return { priceDifference: null, priceDifferencePct: null, alertCreated: false };
  }

  const priceDifference = Number((own - price).toFixed(2));
  const priceDifferencePct = Number((((own - price) / own) * 100).toFixed(2));

  const category = product.recordset[0].Category as string;
  const code = productCode ?? product.recordset[0].ProductCode;
  const threshold = await db.request().input('Category', sql.VarChar(100), category).query(
    `SELECT TOP 1 ThresholdPercent FROM dbo.PriceGapThreshold WHERE ProductCategory = @Category`
  );
  const thresholdPercent = Number(threshold.recordset[0]?.ThresholdPercent ?? 15);
  if (Math.abs(priceDifferencePct) < thresholdPercent) {
    return { priceDifference, priceDifferencePct, alertCreated: false };
  }

  const existing = await db.request().input('Id', sql.Int, competitorProductId).query(
    `SELECT GapAlertID FROM dbo.PriceGapAlert WHERE CompetitorProductID = @Id`
  );
  let alertCreated = false;
  if (existing.recordset.length === 0) {
    await db
      .request()
      .input('CompetitorProductId', sql.Int, competitorProductId)
      .input('OwnPrice', sql.Decimal(18, 2), own)
      .input('GapPercent', sql.Decimal(5, 2), priceDifferencePct)
      .input('ThresholdPercent', sql.Decimal(5, 2), thresholdPercent)
      .query(
        `INSERT INTO dbo.PriceGapAlert (CompetitorProductID, OwnPrice, GapPercent, ThresholdPercent, Status)
         VALUES (@CompetitorProductId, @OwnPrice, @GapPercent, @ThresholdPercent, 'Active')`
      );
    alertCreated = true;
    await dispatchEvent({
      event: 'PriceGapAlert',
      subject: `Price gap alert: ${code ?? ''}`,
      body: `Competitor price gap of ${priceDifferencePct.toFixed(2)}% detected for ${competitorName} (threshold ${thresholdPercent}%).`,
      payload: { competitorProductId, productId: ourProductId, gapPercent: priceDifferencePct, competitorName },
    });
  } else {
    await db
      .request()
      .input('GapAlertID', sql.Int, existing.recordset[0].GapAlertID)
      .input('GapPercent', sql.Decimal(5, 2), priceDifferencePct)
      .input('ThresholdPercent', sql.Decimal(5, 2), thresholdPercent)
      .query(`UPDATE dbo.PriceGapAlert SET GapPercent = @GapPercent, ThresholdPercent = @ThresholdPercent WHERE GapAlertID = @GapAlertID`);
  }
  return { priceDifference, priceDifferencePct, alertCreated };
}

export async function createCompetitorProduct(data: CompetitorProductInput): Promise<{
  competitorProductId: number;
  priceDifference: number | null;
  priceDifferencePct: number | null;
  alertCreated: boolean;
}> {
  await assertProductRefs(data);
  await assertNoDuplicateProduct(data.competitorId, data.productName);
  const insert = await db
    .request()
    .input('CompetitorId', sql.Int, data.competitorId)
    .input('OurProductId', sql.Int, data.ourProductId ?? null)
    .input('ProductName', sql.NVarChar(200), data.productName.trim())
    .input('Category', sql.NVarChar(100), data.category)
    .input('Price', sql.Decimal(18, 2), data.price)
    .input('PriceMax', sql.Decimal(18, 2), data.priceMax ?? null)
    .input('EffectiveDate', sql.Date, data.effectiveDate ?? null)
    .input('Status', sql.VarChar(20), data.status ?? 'Active')
    .input('Notes', sql.NVarChar(1000), data.notes ?? null)
    .input('Specifications', sql.NVarChar(sql.MAX), data.specifications ? JSON.stringify(data.specifications) : null)
    .query(
      `INSERT INTO dbo.CompetitorProduct (CompetitorID, OurProductID, ProductName, Category, Price, PriceMax, EffectiveDate, Status, Notes, Specifications)
       OUTPUT INSERTED.CompetitorProductID
       VALUES (@CompetitorId, @OurProductId, @ProductName, @Category, @Price, @PriceMax, @EffectiveDate, @Status, @Notes, @Specifications)`
    );
  const competitorProductId = insert.recordset[0].CompetitorProductID;
  const competitor = await db.request().input('Id', sql.Int, data.competitorId).query(`SELECT Name FROM dbo.Competitor WHERE CompetitorID = @Id`);
  const gap = await computeGapAndAlert({
    competitorProductId,
    ourProductId: data.ourProductId ?? null,
    price: data.price,
    competitorName: competitor.recordset[0]?.Name ?? '',
  });
  return { competitorProductId, ...gap };
}

export async function updateCompetitorProduct(id: number, data: CompetitorProductInput): Promise<{
  competitorProductId: number;
  priceDifference: number | null;
  priceDifferencePct: number | null;
  alertCreated: boolean;
}> {
  await getCompetitorProduct(id); // 404 when missing
  const { competitorName } = await assertProductRefs(data);
  await assertNoDuplicateProduct(data.competitorId, data.productName, id);
  await db
    .request()
    .input('Id', sql.Int, id)
    .input('CompetitorId', sql.Int, data.competitorId)
    .input('OurProductId', sql.Int, data.ourProductId ?? null)
    .input('ProductName', sql.NVarChar(200), data.productName.trim())
    .input('Category', sql.NVarChar(100), data.category)
    .input('Price', sql.Decimal(18, 2), data.price)
    .input('PriceMax', sql.Decimal(18, 2), data.priceMax ?? null)
    .input('EffectiveDate', sql.Date, data.effectiveDate ?? null)
    .input('Status', sql.VarChar(20), data.status ?? 'Active')
    .input('Notes', sql.NVarChar(1000), data.notes ?? null)
    .input('Specifications', sql.NVarChar(sql.MAX), data.specifications ? JSON.stringify(data.specifications) : null)
    .query(
      `UPDATE dbo.CompetitorProduct
       SET CompetitorID = @CompetitorId, OurProductID = @OurProductId, ProductName = @ProductName,
           Category = @Category, Price = @Price, PriceMax = @PriceMax, EffectiveDate = @EffectiveDate,
           Status = @Status, Notes = @Notes, Specifications = @Specifications, UpdatedAt = SYSUTCDATETIME()
       WHERE CompetitorProductID = @Id`
    );
  const gap = await computeGapAndAlert({
    competitorProductId: id,
    ourProductId: data.ourProductId ?? null,
    price: data.price,
    competitorName,
  });
  return { competitorProductId: id, ...gap };
}

/**
 * Bulk set (or clear, via null) the our-product link on competitor product rows.
 * Recomputes gap + alert per row; clearing the link removes stale alerts.
 */
export async function linkCompetitorProducts(
  ids: number[],
  ourProductId: number | null
): Promise<{ updated: number }> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) throw new BadRequestError('Select at least one row', 'EMPTY_SELECTION');

  if (ourProductId != null) {
    const product = await db.request().input('Id', sql.Int, ourProductId).query(
      `SELECT ProductID FROM dbo.Product WHERE ProductID = @Id`
    );
    if (product.recordset.length === 0) throw new NotFoundError('Product not found');
  }

  const request = db.request();
  const idParams = unique
    .map((id, i) => {
      request.input(`I${i}`, sql.Int, id);
      return `@I${i}`;
    })
    .join(', ');
  const rows = await request.query(
    `SELECT cpd.CompetitorProductID, cpd.Price, c.Name AS CompetitorName
     FROM dbo.CompetitorProduct cpd
     JOIN dbo.Competitor c ON c.CompetitorID = cpd.CompetitorID
     WHERE cpd.CompetitorProductID IN (${idParams})`
  );
  const found = new Set<number>(rows.recordset.map((r: { CompetitorProductID: number }) => r.CompetitorProductID));
  const missing = unique.filter((id) => !found.has(id));
  if (missing.length) throw new NotFoundError(`Competitor product not found: ${missing.join(', ')}`);

  for (const row of rows.recordset as Array<{ CompetitorProductID: number; Price: unknown; CompetitorName: string }>) {
    await db
      .request()
      .input('Id', sql.Int, row.CompetitorProductID)
      .input('OurProductId', sql.Int, ourProductId)
      .query(
        `UPDATE dbo.CompetitorProduct
         SET OurProductID = @OurProductId, UpdatedAt = SYSUTCDATETIME()
         WHERE CompetitorProductID = @Id`
      );
    await computeGapAndAlert({
      competitorProductId: row.CompetitorProductID,
      ourProductId,
      price: Number(row.Price),
      competitorName: row.CompetitorName,
    });
  }
  return { updated: rows.recordset.length };
}

/** Hard delete (precedent: competitor-pricing delete removes dependent alerts first). */
export async function deleteCompetitorProduct(id: number): Promise<void> {
  await getCompetitorProduct(id); // 404 when missing
  await db.request().input('Id', sql.Int, id).query(`DELETE FROM dbo.PriceGapAlert WHERE CompetitorProductID = @Id`);
  await db.request().input('Id', sql.Int, id).query(`DELETE FROM dbo.CompetitorProduct WHERE CompetitorProductID = @Id`);
}
