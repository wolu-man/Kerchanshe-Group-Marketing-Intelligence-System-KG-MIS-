import sql from 'mssql';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import { db } from '../../db/pool';
import { NotFoundError, BadRequestError, ConflictError } from '../../utils/errors';
import { EVENT_TYPES } from '../../security/eventTypes';
import { isSupportedChannel } from '../../integrations/email';

// ---------------------------------------------------------------------------
// BusinessGroup management (admin.businessGroups)
// ---------------------------------------------------------------------------
export async function listBusinessGroups(): Promise<any[]> {
  const result = await db.request().query(
    `SELECT BusinessGroupID, Code, Name, Description, CreatedAt, UpdatedAt
     FROM dbo.BusinessGroup ORDER BY Name`
  );
  return result.recordset;
}

export async function getBusinessGroup(id: number): Promise<any> {
  const result = await db.request().input('Id', sql.Int, id).query(
    `SELECT BusinessGroupID, Code, Name, Description, CreatedAt, UpdatedAt
     FROM dbo.BusinessGroup WHERE BusinessGroupID = @Id`
  );
  if (result.recordset.length === 0) throw new NotFoundError('Business group not found');
  return result.recordset[0];
}

export async function createBusinessGroup(data: { code: string; name: string; description?: string | null }): Promise<number> {
  const result = await db
    .request()
    .input('Code', sql.VarChar(20), data.code.trim().toUpperCase())
    .input('Name', sql.NVarChar(150), data.name.trim())
    .input('Description', sql.NVarChar(sql.MAX), data.description ?? null)
    .query(
      `INSERT INTO dbo.BusinessGroup (Code, Name, Description)
       OUTPUT INSERTED.BusinessGroupID
       VALUES (@Code, @Name, @Description)`
    );
  return result.recordset[0].BusinessGroupID;
}

export async function updateBusinessGroup(id: number, data: { code?: string; name?: string; description?: string | null }): Promise<void> {
  const request = db.request().input('Id', sql.Int, id);
  const sets: string[] = ['UpdatedAt = SYSUTCDATETIME()'];
  if (data.code !== undefined) { sets.push('Code = @Code'); request.input('Code', sql.VarChar(20), data.code.trim().toUpperCase()); }
  if (data.name !== undefined) { sets.push('Name = @Name'); request.input('Name', sql.NVarChar(150), data.name.trim()); }
  if (data.description !== undefined) { sets.push('Description = @Description'); request.input('Description', sql.NVarChar(sql.MAX), data.description ?? null); }
  if (sets.length === 1) return;
  await request.query(`UPDATE dbo.BusinessGroup SET ${sets.join(', ')} WHERE BusinessGroupID = @Id`);
}

export async function deleteBusinessGroup(id: number): Promise<void> {
  // Check for dependent records
  const checks = await Promise.all([
    db.request().input('Id', sql.Int, id).query(`SELECT COUNT(*) AS Cnt FROM dbo.Product WHERE BusinessGroupID = @Id`),
    db.request().input('Id', sql.Int, id).query(`SELECT COUNT(*) AS Cnt FROM dbo.Customer WHERE BusinessGroupID = @Id`),
    db.request().input('Id', sql.Int, id).query(`SELECT COUNT(*) AS Cnt FROM dbo.Competitor WHERE BusinessGroupID = @Id`),
    db.request().input('Id', sql.Int, id).query(`SELECT COUNT(*) AS Cnt FROM dbo.MarketVisitReport WHERE BusinessGroupID = @Id`),
    db.request().input('Id', sql.Int, id).query(`SELECT COUNT(*) AS Cnt FROM dbo.Interview WHERE BusinessGroupID = @Id`),
    db.request().input('Id', sql.Int, id).query(`SELECT COUNT(*) AS Cnt FROM dbo.WeeklySales WHERE BusinessGroupID = @Id`),
  ]);
  const totalDeps = checks.reduce((sum, r) => sum + r.recordset[0].Cnt, 0);
  if (totalDeps > 0) throw new BadRequestError(`Cannot delete: ${totalDeps} dependent records exist`, 'HAS_DEPENDENTS');
  
  const result = await db.request().input('Id', sql.Int, id).query(
    `DELETE FROM dbo.BusinessGroup WHERE BusinessGroupID = @Id`
  );
  if (result.rowsAffected[0] === 0) throw new NotFoundError('Business group not found');
}

// ---------------------------------------------------------------------------
// Customer management (admin.customers)
// ---------------------------------------------------------------------------
export async function listCustomers(opts: { search?: string; businessGroupId?: number; customerTypeId?: number; regionId?: number } = {}): Promise<any[]> {
  const where: string[] = ['1=1'];
  const request = db.request();
  if (opts.search) {
    where.push('(c.Name LIKE @Search OR c.CustomerCode LIKE @Search OR c.ContactPhone LIKE @Search OR c.Address LIKE @Search OR ct.Name LIKE @Search)');
    request.input('Search', sql.NVarChar, `%${opts.search}%`);
  }
  if (opts.businessGroupId) { where.push('c.BusinessGroupID = @BgId'); request.input('BgId', sql.Int, opts.businessGroupId); }
  if (opts.customerTypeId) { where.push('c.CustomerTypeID = @CtId'); request.input('CtId', sql.Int, opts.customerTypeId); }
  if (opts.regionId) { where.push('c.RegionID = @RgId'); request.input('RgId', sql.Int, opts.regionId); }
  const result = await request.query(
    `SELECT c.CustomerID, c.CustomerCode, c.Name, c.CustomerType, c.ContactPerson,
            c.ContactPhone, c.Email, c.RegionID, c.OutletID, c.BusinessGroupID, c.IsActive,
            c.Address, c.Area, c.StarRating, c.ProductInterest, c.CustomerTypeID,
            r.RegionName, o.OutletName, bg.Name AS BusinessGroupName,
            ct.Name AS CustomerTypeName
     FROM dbo.Customer c
     LEFT JOIN dbo.Region r ON r.RegionID = c.RegionID
     LEFT JOIN dbo.Outlet o ON o.OutletID = c.OutletID
     LEFT JOIN dbo.BusinessGroup bg ON bg.BusinessGroupID = c.BusinessGroupID
     LEFT JOIN dbo.CustomerType ct ON ct.CustomerTypeID = c.CustomerTypeID
     WHERE ${where.join(' AND ')}
     ORDER BY c.Name`
  );
  return result.recordset;
}

export async function getCustomer(id: number): Promise<any> {
  const result = await db.request().input('Id', sql.Int, id).query(
    `SELECT c.CustomerID, c.CustomerCode, c.Name, c.CustomerType, c.ContactPerson,
            c.ContactPhone, c.Email, c.RegionID, c.OutletID, c.BusinessGroupID, c.IsActive,
            c.Address, c.Area, c.StarRating, c.ProductInterest,
            r.RegionName, o.OutletName, bg.Name AS BusinessGroupName
     FROM dbo.Customer c
     LEFT JOIN dbo.Region r ON r.RegionID = c.RegionID
     LEFT JOIN dbo.Outlet o ON o.OutletID = c.OutletID
     LEFT JOIN dbo.BusinessGroup bg ON bg.BusinessGroupID = c.BusinessGroupID
     WHERE c.CustomerID = @Id`
  );
  if (result.recordset.length === 0) throw new NotFoundError('Customer not found');
  return result.recordset[0];
}

export async function createCustomer(data: {
  customerCode: string; name: string; customerType?: string | null; customerTypeId?: number | null;
  contactPerson?: string | null; contactPhone?: string | null; email?: string | null;
  regionId?: number | null; outletId?: number | null; businessGroupId?: number | null;
  address?: string | null; area?: string | null; starRating?: string | null; productInterest?: string | null;
}): Promise<number> {
  const result = await db
    .request()
    .input('CustomerCode', sql.VarChar(50), data.customerCode.trim())
    .input('Name', sql.NVarChar(150), data.name.trim())
    .input('CustomerType', sql.VarChar(50), data.customerType ?? null)
    .input('CustomerTypeId', sql.Int, data.customerTypeId ?? null)
    .input('ContactPerson', sql.NVarChar(150), data.contactPerson ?? null)
    .input('ContactPhone', sql.VarChar(30), data.contactPhone ?? null)
    .input('Email', sql.NVarChar(200), data.email ?? null)
    .input('RegionId', sql.Int, data.regionId ?? null)
    .input('OutletId', sql.Int, data.outletId ?? null)
    .input('BusinessGroupId', sql.Int, data.businessGroupId ?? null)
    .input('Address', sql.NVarChar(500), data.address ?? null)
    .input('Area', sql.NVarChar(200), data.area ?? null)
    .input('StarRating', sql.VarChar(50), data.starRating ?? null)
    .input('ProductInterest', sql.NVarChar(200), data.productInterest ?? null)
    .query(
      `INSERT INTO dbo.Customer (CustomerCode, Name, CustomerType, CustomerTypeID, ContactPerson, ContactPhone, Email, RegionID, OutletID, BusinessGroupID, Address, Area, StarRating, ProductInterest)
       OUTPUT INSERTED.CustomerID
       VALUES (@CustomerCode, @Name, @CustomerType, @CustomerTypeId, @ContactPerson, @ContactPhone, @Email, @RegionId, @OutletId, @BusinessGroupId, @Address, @Area, @StarRating, @ProductInterest)`
    );
  return result.recordset[0].CustomerID;
}

export async function updateCustomer(id: number, data: {
  customerCode?: string; name?: string; customerType?: string | null; customerTypeId?: number | null;
  contactPerson?: string | null; contactPhone?: string | null; email?: string | null;
  regionId?: number | null; outletId?: number | null; businessGroupId?: number | null; isActive?: boolean;
  address?: string | null; area?: string | null; starRating?: string | null; productInterest?: string | null;
}): Promise<void> {
  const request = db.request().input('Id', sql.Int, id);
  const sets: string[] = ['UpdatedAt = SYSUTCDATETIME()'];
  if (data.customerCode !== undefined) { sets.push('CustomerCode = @CustomerCode'); request.input('CustomerCode', sql.VarChar(50), data.customerCode.trim()); }
  if (data.name !== undefined) { sets.push('Name = @Name'); request.input('Name', sql.NVarChar(150), data.name.trim()); }
  if (data.customerType !== undefined) { sets.push('CustomerType = @CustomerType'); request.input('CustomerType', sql.VarChar(50), data.customerType ?? null); }
  if (data.customerTypeId !== undefined) { sets.push('CustomerTypeID = @CustomerTypeId'); request.input('CustomerTypeId', sql.Int, data.customerTypeId ?? null); }
  if (data.contactPerson !== undefined) { sets.push('ContactPerson = @ContactPerson'); request.input('ContactPerson', sql.NVarChar(150), data.contactPerson ?? null); }
  if (data.contactPhone !== undefined) { sets.push('ContactPhone = @ContactPhone'); request.input('ContactPhone', sql.VarChar(30), data.contactPhone ?? null); }
  if (data.email !== undefined) { sets.push('Email = @Email'); request.input('Email', sql.NVarChar(200), data.email ?? null); }
  if (data.regionId !== undefined) { sets.push('RegionID = @RegionId'); request.input('RegionId', sql.Int, data.regionId ?? null); }
  if (data.outletId !== undefined) { sets.push('OutletID = @OutletId'); request.input('OutletId', sql.Int, data.outletId ?? null); }
  if (data.businessGroupId !== undefined) { sets.push('BusinessGroupID = @BusinessGroupId'); request.input('BusinessGroupId', sql.Int, data.businessGroupId ?? null); }
  if (data.isActive !== undefined) { sets.push('IsActive = @IsActive'); request.input('IsActive', sql.Bit, data.isActive); }
  if (data.address !== undefined) { sets.push('Address = @Address'); request.input('Address', sql.NVarChar(500), data.address ?? null); }
  if (data.area !== undefined) { sets.push('Area = @Area'); request.input('Area', sql.NVarChar(200), data.area ?? null); }
  if (data.starRating !== undefined) { sets.push('StarRating = @StarRating'); request.input('StarRating', sql.VarChar(50), data.starRating ?? null); }
  if (data.productInterest !== undefined) { sets.push('ProductInterest = @ProductInterest'); request.input('ProductInterest', sql.NVarChar(200), data.productInterest ?? null); }
  if (sets.length === 1) return;
  await request.query(`UPDATE dbo.Customer SET ${sets.join(', ')} WHERE CustomerID = @Id`);
}

export async function deleteCustomer(id: number): Promise<void> {
  // Verify customer exists
  const check = await db.request().input('Id', sql.Int, id).query(
    `SELECT CustomerID FROM dbo.Customer WHERE CustomerID = @Id`
  );
  if (check.recordset.length === 0) throw new NotFoundError('Customer not found');

  // Cascade-delete dependent records that have FKs to Customer
  await db.request().input('Id', sql.Int, id).query(`DELETE FROM dbo.SalesRecord WHERE CustomerID = @Id`);
  await db.request().input('Id', sql.Int, id).query(`DELETE FROM dbo.WeeklySales WHERE CustomerID = @Id`);
  const r3 = await db.request().input('Id', sql.Int, id).query(`DELETE FROM dbo.Customer WHERE CustomerID = @Id`);
  if (r3.rowsAffected[0] === 0) throw new NotFoundError('Customer not found');
}

// ---------------------------------------------------------------------------
// Product management (admin.products)
// ---------------------------------------------------------------------------
// Derived palette: comma-joined color names ordered by the canonical SortOrder.
const PALETTE_APPLY = `
     OUTER APPLY (
       SELECT STRING_AGG(c.Name, ', ') WITHIN GROUP (ORDER BY c.SortOrder, c.Name) AS ProductColors
       FROM dbo.ProductColor pc
       JOIN dbo.Color c ON c.ColorID = pc.ColorID
       WHERE pc.ProductID = p.ProductID
     ) pcols`;

function withColors(rows: any[]): any[] {
  return rows.map((r) => ({ ...r, colors: r.Color ? String(r.Color).split(', ') : [] }));
}

// Resolve a comma-separated color string to canonical ColorIDs, registering
// unknown color names on the fly (dedupe case-insensitively, preserve order).
async function resolveColorIds(raw: string | null | undefined): Promise<number[]> {
  const tokens = String(raw ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return [];
  const all = await db.request().query(`SELECT ColorID, Name FROM dbo.Color`);
  const byName = new Map<string, number>(all.recordset.map((r: any) => [String(r.Name).toLowerCase(), r.ColorID as number]));
  const ids: number[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const tok of tokens.slice(0, 50)) {
    const key = tok.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const existing = byName.get(key);
    if (existing !== undefined) ids.push(existing);
    else if (!missing.some((m) => m.toLowerCase() === key)) missing.push(tok.slice(0, 50));
  }
  for (const name of missing) {
    const r = await db
      .request()
      .input('Name', sql.NVarChar(50), name)
      .query(`INSERT INTO dbo.Color (Name, SortOrder) OUTPUT INSERTED.ColorID VALUES (@Name, 90)`);
    const newId = r.recordset[0].ColorID as number;
    ids.push(newId);
    byName.set(name.toLowerCase(), newId);
  }
  return ids;
}

// Replace a product's palette rows in one shot. Silently skips products that
// do not exist (mirrors updateProduct's no-op semantics for missing rows).
async function setProductColors(productId: number, colorIds: number[]): Promise<void> {
  await db
    .request()
    .input('Id', sql.Int, productId)
    .input('Ids', sql.NVarChar(sql.MAX), JSON.stringify(colorIds))
    .query(
      `DELETE FROM dbo.ProductColor WHERE ProductID = @Id;
       INSERT INTO dbo.ProductColor (ProductID, ColorID)
       SELECT @Id, CAST(j.value AS INT)
       FROM OPENJSON(@Ids) j
       WHERE EXISTS (SELECT 1 FROM dbo.Product p WHERE p.ProductID = @Id)
         AND EXISTS (SELECT 1 FROM dbo.Color c WHERE c.ColorID = CAST(j.value AS INT));`
    );
}

export async function listProducts(opts: { search?: string; businessGroupId?: number; color?: string; size?: string; category?: string } = {}): Promise<any[]> {
  const where: string[] = ['p.IsActive = 1'];
  const request = db.request();
  if (opts.search) { where.push('(p.Name LIKE @Search OR p.ProductCode LIKE @Search)'); request.input('Search', sql.NVarChar, `%${opts.search}%`); }
  if (opts.businessGroupId) { where.push('p.BusinessGroupID = @BgId'); request.input('BgId', sql.Int, opts.businessGroupId); }
  if (opts.color) {
    where.push('EXISTS (SELECT 1 FROM dbo.ProductColor pcF JOIN dbo.Color cF ON cF.ColorID = pcF.ColorID WHERE pcF.ProductID = p.ProductID AND LOWER(cF.Name) = LOWER(@Color))');
    request.input('Color', sql.NVarChar(50), opts.color.trim());
  }
  if (opts.size) { where.push('p.Size LIKE @Size'); request.input('Size', sql.NVarChar, `%${opts.size}%`); }
  if (opts.category) { where.push('p.Category LIKE @Category'); request.input('Category', sql.NVarChar, `%${opts.category}%`); }
  const result = await request.query(
    `SELECT p.ProductID, p.ProductCode, p.Name, p.Category, p.UnitPrice, p.BusinessGroupID, p.IsActive,
            pcols.ProductColors AS Color, p.Size, p.WeightKg, p.ImageUrl,
            p.AgentPriceAfterVat, p.WholesalePriceAfterVat, p.KeyAccountPriceAfterVat, p.BidPriceAfterVat,
            p.Specifications,
            bg.Code AS BusinessGroupCode, bg.Name AS BusinessGroupName,
            pp.Prices
     FROM dbo.Product p
     LEFT JOIN dbo.BusinessGroup bg ON bg.BusinessGroupID = p.BusinessGroupID
     ${PALETTE_APPLY}
     LEFT JOIN (
       SELECT ProductID,
              STRING_AGG(ct.Name + ': ' + CAST(CAST(pp.UnitPrice AS DECIMAL(18,2)) AS VARCHAR), ', ')
                WITHIN GROUP (ORDER BY ct.Name) AS Prices
       FROM dbo.ProductPrice pp
       JOIN dbo.CustomerType ct ON ct.CustomerTypeID = pp.CustomerTypeID
       GROUP BY ProductID
     ) pp ON pp.ProductID = p.ProductID
     WHERE ${where.join(' AND ')}
     ORDER BY p.Name`
  );
  return withColors(result.recordset);
}

export async function getProduct(id: number): Promise<any> {
  const result = await db.request().input('Id', sql.Int, id).query(
    `SELECT p.ProductID, p.ProductCode, p.Name, p.Category, p.UnitPrice, p.BusinessGroupID, p.IsActive,
            pcols.ProductColors AS Color, p.Size, p.WeightKg, p.ImageUrl,
            p.AgentPriceBeforeVat, p.AgentPriceAfterVat,
            p.WholesalePriceBeforeVat, p.WholesalePriceAfterVat,
            p.KeyAccountPriceBeforeVat, p.KeyAccountPriceAfterVat,
            p.BidPriceBeforeVat, p.BidPriceAfterVat,
            p.Specifications,
            bg.Code AS BusinessGroupCode, bg.Name AS BusinessGroupName
     FROM dbo.Product p
     LEFT JOIN dbo.BusinessGroup bg ON bg.BusinessGroupID = p.BusinessGroupID
     ${PALETTE_APPLY}
     WHERE p.ProductID = @Id`
  );
  if (result.recordset.length === 0) throw new NotFoundError('Product not found');
  return withColors(result.recordset)[0];
}

export async function createProduct(data: {
  productCode: string; name: string; category?: string | null;
  unitPrice?: number | null; businessGroupId?: number | null;
  color?: string | null; size?: string | null; weightKg?: number | null;
  imageUrl?: string | null; specifications?: Record<string, unknown> | null;
}): Promise<number> {
  const result = await db
    .request()
    .input('ProductCode', sql.VarChar(50), data.productCode.trim())
    .input('Name', sql.NVarChar(200), data.name.trim())
    .input('Category', sql.NVarChar(100), data.category ?? '')
    .input('UnitPrice', sql.Decimal(18, 2), data.unitPrice ?? null)
    .input('BusinessGroupId', sql.Int, data.businessGroupId ?? null)
    .input('Size', sql.NVarChar(50), data.size ?? null)
    .input('WeightKg', sql.Decimal(10, 4), data.weightKg ?? null)
    .input('ImageUrl', sql.NVarChar(500), data.imageUrl ?? null)
    .input('Specifications', sql.NVarChar(sql.MAX), data.specifications ? JSON.stringify(data.specifications) : null)
    .query(
      `INSERT INTO dbo.Product (ProductCode, Name, Category, UnitPrice, BusinessGroupID, Size, WeightKg, ImageUrl, Specifications)
       OUTPUT INSERTED.ProductID
       VALUES (@ProductCode, @Name, @Category, @UnitPrice, @BusinessGroupId, @Size, @WeightKg, @ImageUrl, @Specifications)`
    );
  const productId = result.recordset[0].ProductID as number;
  if (data.color !== undefined) {
    await setProductColors(productId, await resolveColorIds(data.color));
  }
  return productId;
}

export async function updateProduct(id: number, data: {
  productCode?: string; name?: string; category?: string | null;
  unitPrice?: number | null; businessGroupId?: number | null; isActive?: boolean;
  color?: string | null; size?: string | null; weightKg?: number | null;
  imageUrl?: string | null; specifications?: Record<string, unknown> | null;
}): Promise<void> {
  if (data.color !== undefined) {
    await setProductColors(id, await resolveColorIds(data.color));
  }
  const request = db.request().input('Id', sql.Int, id);
  const sets: string[] = ['UpdatedAt = SYSUTCDATETIME()'];
  if (data.productCode !== undefined) { sets.push('ProductCode = @ProductCode'); request.input('ProductCode', sql.VarChar(50), data.productCode.trim()); }
  if (data.name !== undefined) { sets.push('Name = @Name'); request.input('Name', sql.NVarChar(200), data.name.trim()); }
  if (data.category !== undefined) { sets.push('Category = @Category'); request.input('Category', sql.NVarChar(100), data.category ?? ''); }
  if (data.unitPrice !== undefined) { sets.push('UnitPrice = @UnitPrice'); request.input('UnitPrice', sql.Decimal(18, 2), data.unitPrice ?? null); }
  if (data.businessGroupId !== undefined) { sets.push('BusinessGroupID = @BusinessGroupId'); request.input('BusinessGroupId', sql.Int, data.businessGroupId ?? null); }
  if (data.isActive !== undefined) { sets.push('IsActive = @IsActive'); request.input('IsActive', sql.Bit, data.isActive); }
  if (data.size !== undefined) { sets.push('Size = @Size'); request.input('Size', sql.NVarChar(50), data.size ?? null); }
  if (data.weightKg !== undefined) { sets.push('WeightKg = @WeightKg'); request.input('WeightKg', sql.Decimal(10, 4), data.weightKg ?? null); }
  if (data.imageUrl !== undefined) { sets.push('ImageUrl = @ImageUrl'); request.input('ImageUrl', sql.NVarChar(500), data.imageUrl ?? null); }
  if (data.specifications !== undefined) { sets.push('Specifications = @Specifications'); request.input('Specifications', sql.NVarChar(sql.MAX), data.specifications ? JSON.stringify(data.specifications) : null); }
  if (sets.length === 1) return;
  await request.query(`UPDATE dbo.Product SET ${sets.join(', ')} WHERE ProductID = @Id`);
}

export async function updateProductPhoto(id: number, imageUrl: string): Promise<void> {
  const result = await db.request()
    .input('Id', sql.Int, id)
    .input('ImageUrl', sql.NVarChar(500), imageUrl)
    .query(`UPDATE dbo.Product SET ImageUrl = @ImageUrl, UpdatedAt = SYSUTCDATETIME() WHERE ProductID = @Id`);
  if (result.rowsAffected[0] === 0) throw new NotFoundError('Product not found');
}

export async function deleteProduct(id: number): Promise<void> {
  const result = await db.request().input('Id', sql.Int, id).query(
    `UPDATE dbo.Product SET IsActive = 0, UpdatedAt = SYSUTCDATETIME() WHERE ProductID = @Id`
  );
  if (result.rowsAffected[0] === 0) throw new NotFoundError('Product not found');
}

// ---------------------------------------------------------------------------
// Product BusinessGroup assignment (admin.products)
// ---------------------------------------------------------------------------
export async function updateProductBusinessGroup(productId: number, businessGroupId: number | null): Promise<void> {
  const result = await db.request()
    .input('Id', sql.Int, productId)
    .input('BgId', sql.Int, businessGroupId ?? null)
    .query(
      `UPDATE dbo.Product SET BusinessGroupID = @BgId, UpdatedAt = SYSUTCDATETIME() WHERE ProductID = @Id`
    );
  if (result.rowsAffected[0] === 0) throw new NotFoundError('Product not found');
}
// ---------------------------------------------------------------------------
export async function listRoleMappings(): Promise<any[]> {
  const result = await db.request().query(
    `SELECT m.MappingID, m.CUASClaim, m.RoleID, r.RoleName, m.UpdatedAt
     FROM dbo.RoleMapping m
     JOIN dbo.Role r ON r.RoleID = m.RoleID
     ORDER BY m.CUASClaim`
  );
  return result.recordset;
}

export async function upsertRoleMapping(cuasClaim: string, roleId: number): Promise<void> {
  const role = await db.request().input('Id', sql.Int, roleId).query(
    `SELECT RoleID FROM dbo.Role WHERE RoleID = @Id`
  );
  if (role.recordset.length === 0) throw new BadRequestError('Role not found', 'INVALID_ROLE');
  await db
    .request()
    .input('Claim', sql.VarChar(150), cuasClaim.trim())
    .input('RoleId', sql.Int, roleId)
    .query(
      `MERGE dbo.RoleMapping AS t
       USING (SELECT @Claim AS CUASClaim) AS s ON t.CUASClaim = s.CUASClaim
       WHEN MATCHED THEN UPDATE SET t.RoleID = @RoleId, t.UpdatedAt = SYSUTCDATETIME()
       WHEN NOT MATCHED THEN INSERT (CUASClaim, RoleID) VALUES (@Claim, @RoleId);`
    );
}

export async function deleteRoleMapping(mappingId: number): Promise<void> {
  const result = await db.request().input('Id', sql.Int, mappingId).query(
    `DELETE FROM dbo.RoleMapping WHERE MappingID = @Id`
  );
  if (result.rowsAffected[0] === 0) throw new NotFoundError('Mapping not found');
}

// ---------------------------------------------------------------------------
// Notification configuration (admin.notificationConfig, Integration Design 5.3)
// ---------------------------------------------------------------------------
export interface NotificationConfigRow {
  ConfigID?: number;
  TriggerEvent: string;
  Channel: string;
  RoleID: number;
  Enabled: boolean;
}

export async function listNotificationConfig(): Promise<any[]> {
  const result = await db.request().query(
    `SELECT c.ConfigID, c.TriggerEvent, c.Channel, c.RoleID, r.RoleName, c.Enabled, c.UpdatedAt
     FROM dbo.NotificationConfig c
     JOIN dbo.Role r ON r.RoleID = c.RoleID
     ORDER BY c.TriggerEvent, c.Channel`
  );
  return result.recordset;
}

export async function listEventTypes(): Promise<string[]> {
  return [...EVENT_TYPES].sort();
}

export async function listChannels(): Promise<string[]> {
  return ['Email'];
}

export async function upsertNotificationConfig(row: NotificationConfigRow): Promise<void> {
  if (!EVENT_TYPES.has(row.TriggerEvent)) {
    throw new BadRequestError(`Unknown event '${row.TriggerEvent}'`, 'INVALID_EVENT');
  }
  if (!isSupportedChannel(row.Channel)) {
    throw new BadRequestError(`Unsupported channel '${row.Channel}'`, 'INVALID_CHANNEL');
  }
  await db
    .request()
    .input('Event', sql.VarChar(100), row.TriggerEvent)
    .input('Channel', sql.VarChar(20), row.Channel)
    .input('RoleId', sql.Int, row.RoleID)
    .input('Enabled', sql.Bit, row.Enabled ?? true)
    .query(
      `MERGE dbo.NotificationConfig AS t
       USING (SELECT @Event AS TriggerEvent, @Channel AS Channel, @RoleId AS RoleID) AS s
         ON t.TriggerEvent = s.TriggerEvent AND t.Channel = s.Channel AND t.RoleID = s.RoleID
       WHEN MATCHED THEN UPDATE SET t.Enabled = @Enabled, t.UpdatedAt = SYSUTCDATETIME()
       WHEN NOT MATCHED THEN INSERT (TriggerEvent, Channel, RoleID, Enabled) VALUES (@Event, @Channel, @RoleId, @Enabled);`
    );
}

export async function deleteNotificationConfig(configId: number): Promise<void> {
  const result = await db.request().input('Id', sql.Int, configId).query(
    `DELETE FROM dbo.NotificationConfig WHERE ConfigID = @Id`
  );
  if (result.rowsAffected[0] === 0) throw new NotFoundError('Config not found');
}

// ---------------------------------------------------------------------------
// User & region management (admin.users)
// ---------------------------------------------------------------------------
export async function listUsers(): Promise<any[]> {
  const result = await db.request().query(
    `SELECT u.UserID, u.CUAS_ID, u.Name, u.Email, u.RoleID, r.RoleName, u.IsActive, u.CreatedAt,
            STRING_AGG(ur.RegionID, ',') AS RegionIds
     FROM dbo.[User] u
     JOIN dbo.Role r ON r.RoleID = u.RoleID
     LEFT JOIN dbo.UserRegionAssignment ur ON ur.UserID = u.UserID
     GROUP BY u.UserID, u.CUAS_ID, u.Name, u.Email, u.RoleID, r.RoleName, u.IsActive, u.CreatedAt
     ORDER BY u.Name`
  );
  return result.recordset;
}

export async function listRoles(): Promise<any[]> {
  const result = await db.request().query(`SELECT RoleID, RoleName FROM dbo.Role ORDER BY RoleName`);
  return result.recordset;
}

export async function updateUserRole(userId: number, roleId: number): Promise<void> {
  const result = await db.request().input('Id', sql.Int, userId).input('RoleId', sql.Int, roleId).query(
    `UPDATE dbo.[User] SET RoleID = @RoleId, UpdatedAt = SYSUTCDATETIME() WHERE UserID = @Id`
  );
  if (result.rowsAffected[0] === 0) throw new NotFoundError('User not found');
}

export async function assignRegion(userId: number, regionId: number): Promise<void> {
  await db
    .request()
    .input('UserId', sql.Int, userId)
    .input('RegionId', sql.Int, regionId)
    .query(
      `MERGE dbo.UserRegionAssignment AS t
       USING (SELECT @UserId AS UserID, @RegionId AS RegionID) AS s
         ON t.UserID = s.UserID AND t.RegionID = s.RegionID
       WHEN NOT MATCHED THEN INSERT (UserID, RegionID) VALUES (@UserId, @RegionId);`
    );
}

export async function removeRegion(userId: number, regionId: number): Promise<void> {
  await db.request().input('UserId', sql.Int, userId).input('RegionId', sql.Int, regionId).query(
    `DELETE FROM dbo.UserRegionAssignment WHERE UserID = @UserId AND RegionID = @RegionId`
  );
}

export async function createUser(data: {
  cuasId: string;
  name: string;
  email: string;
  roleId: number;
  password: string;
}): Promise<number> {
  const existing = await db
    .request()
    .input('CUAS_ID', sql.VarChar(100), data.cuasId)
    .query(`SELECT 1 FROM dbo.[User] WHERE CUAS_ID = @CUAS_ID`);
  if (existing.recordset.length > 0) {
    throw new ConflictError('A user with this CUAS ID already exists');
  }

  const hash = await bcrypt.hash(data.password, 10);
  const result = await db
    .request()
    .input('CUAS_ID', sql.VarChar(100), data.cuasId)
    .input('Name', sql.NVarChar(150), data.name)
    .input('Email', sql.NVarChar(200), data.email)
    .input('RoleID', sql.Int, data.roleId)
    .input('PasswordHash', sql.NVarChar(255), hash)
    .query(
      `INSERT INTO dbo.[User] (CUAS_ID, Name, Email, RoleID, PasswordHash)
       OUTPUT INSERTED.UserID
       VALUES (@CUAS_ID, @Name, @Email, @RoleID, @PasswordHash)`
    );
  return result.recordset[0].UserID;
}

export async function updateUser(
  userId: number,
  data: { name?: string; email?: string; roleId?: number }
): Promise<void> {
  const sets: string[] = [];
  const request = db.request().input('Id', sql.Int, userId);

  if (data.name !== undefined) {
    sets.push('Name = @Name');
    request.input('Name', sql.NVarChar(150), data.name);
  }
  if (data.email !== undefined) {
    sets.push('Email = @Email');
    request.input('Email', sql.NVarChar(200), data.email);
  }
  if (data.roleId !== undefined) {
    sets.push('RoleID = @RoleId');
    request.input('RoleId', sql.Int, data.roleId);
  }

  if (sets.length === 0) return;

  sets.push('UpdatedAt = SYSUTCDATETIME()');
  const result = await request.query(
    `UPDATE dbo.[User] SET ${sets.join(', ')} WHERE UserID = @Id`
  );
  if (result.rowsAffected[0] === 0) throw new NotFoundError('User not found');
}

export async function toggleUserActive(userId: number): Promise<{ isActive: boolean }> {
  const result = await db
    .request()
    .input('Id', sql.Int, userId)
    .query(
      `UPDATE dbo.[User]
       SET IsActive = CASE WHEN IsActive = 1 THEN 0 ELSE 1 END,
           UpdatedAt = SYSUTCDATETIME()
       OUTPUT INSERTED.IsActive
       WHERE UserID = @Id`
    );
  if (result.recordset.length === 0) throw new NotFoundError('User not found');
  return { isActive: result.recordset[0].IsActive };
}

// ---------------------------------------------------------------------------
// Audit log (admin.audit)
// ---------------------------------------------------------------------------
export async function listAudit(opts: { userId?: number; entity?: string; action?: string; fromDate?: string; toDate?: string; ipAddress?: string; search?: string; limit?: number; offset?: number }): Promise<any[]> {
  const where: string[] = ['1=1'];
  const request = db.request();
  if (opts.userId) { where.push('a.UserID = @UserId'); request.input('UserId', sql.Int, opts.userId); }
  if (opts.entity) { where.push('a.Entity = @Entity'); request.input('Entity', sql.VarChar(50), opts.entity); }
  if (opts.action) { where.push('a.Action LIKE @Action'); request.input('Action', sql.VarChar(100), `%${opts.action}%`); }
  if (opts.fromDate) { where.push('a.CreatedAt >= @FromDate'); request.input('FromDate', sql.DateTime2, opts.fromDate); }
  if (opts.toDate) { where.push('a.CreatedAt <= @ToDate'); request.input('ToDate', sql.DateTime2, opts.toDate + 'T23:59:59'); }
  if (opts.ipAddress) { where.push('a.IPAddress LIKE @IPAddress'); request.input('IPAddress', sql.VarChar(45), `%${opts.ipAddress}%`); }
  if (opts.search) { where.push('(a.Entity LIKE @Search OR a.Detail LIKE @Search OR a.Action LIKE @Search)'); request.input('Search', sql.NVarChar, `%${opts.search}%`); }
  const whereClause = where.join(' AND ');
  const limit = Math.min(200, opts.limit ?? 50);
  const offset = opts.offset ?? 0;
  const result = await request
    .input('Limit', sql.Int, limit)
    .input('Offset', sql.Int, offset)
    .query(
      `SELECT a.AuditLogID, a.UserID, u.Name AS UserName, a.Action, a.Entity, a.EntityID,
       a.IPAddress, a.Location, a.CreatedAt
       FROM dbo.AuditLog a
       LEFT JOIN dbo.[User] u ON u.UserID = a.UserID
       WHERE ${whereClause}
       ORDER BY a.CreatedAt DESC
       OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY`
    );
  return result.recordset;
}

export async function listAuditTotal(opts: { userId?: number; entity?: string; action?: string; fromDate?: string; toDate?: string; ipAddress?: string; search?: string }): Promise<number> {
  const where: string[] = ['1=1'];
  const request = db.request();
  if (opts.userId) { where.push('a.UserID = @UserId'); request.input('UserId', sql.Int, opts.userId); }
  if (opts.entity) { where.push('a.Entity = @Entity'); request.input('Entity', sql.VarChar(50), opts.entity); }
  if (opts.action) { where.push('a.Action LIKE @Action'); request.input('Action', sql.VarChar(100), `%${opts.action}%`); }
  if (opts.fromDate) { where.push('a.CreatedAt >= @FromDate'); request.input('FromDate', sql.DateTime2, opts.fromDate); }
  if (opts.toDate) { where.push('a.CreatedAt <= @ToDate'); request.input('ToDate', sql.DateTime2, opts.toDate + 'T23:59:59'); }
  if (opts.ipAddress) { where.push('a.IPAddress LIKE @IPAddress'); request.input('IPAddress', sql.VarChar(45), `%${opts.ipAddress}%`); }
  if (opts.search) { where.push('(a.Entity LIKE @Search OR a.Detail LIKE @Search OR a.Action LIKE @Search)'); request.input('Search', sql.NVarChar, `%${opts.search}%`); }
  const result = await request.query(
    `SELECT COUNT(*) AS total FROM dbo.AuditLog a WHERE ${where.join(' AND ')}`
  );
  return result.recordset[0]?.total ?? 0;
}

export async function listAuditAll(opts: { userId?: number; entity?: string; action?: string; fromDate?: string; toDate?: string; ipAddress?: string; search?: string }): Promise<any[]> {
  const where: string[] = ['1=1'];
  const request = db.request();
  if (opts.userId) { where.push('a.UserID = @UserId'); request.input('UserId', sql.Int, opts.userId); }
  if (opts.entity) { where.push('a.Entity = @Entity'); request.input('Entity', sql.VarChar(50), opts.entity); }
  if (opts.action) { where.push('a.Action LIKE @Action'); request.input('Action', sql.VarChar(100), `%${opts.action}%`); }
  if (opts.fromDate) { where.push('a.CreatedAt >= @FromDate'); request.input('FromDate', sql.DateTime2, opts.fromDate); }
  if (opts.toDate) { where.push('a.CreatedAt <= @ToDate'); request.input('ToDate', sql.DateTime2, opts.toDate + 'T23:59:59'); }
  if (opts.ipAddress) { where.push('a.IPAddress LIKE @IPAddress'); request.input('IPAddress', sql.VarChar(45), `%${opts.ipAddress}%`); }
  if (opts.search) { where.push('(a.Entity LIKE @Search OR a.Detail LIKE @Search OR a.Action LIKE @Search)'); request.input('Search', sql.NVarChar, `%${opts.search}%`); }
  const result = await request.query(
    `SELECT a.AuditLogID, a.UserID, u.Name AS UserName, a.Action, a.Entity, a.EntityID,
     a.IPAddress, a.Location, a.CreatedAt
     FROM dbo.AuditLog a
     LEFT JOIN dbo.[User] u ON u.UserID = a.UserID
     WHERE ${where.join(' AND ')}
     ORDER BY a.CreatedAt DESC`
  );
  return result.recordset;
}

export async function exportAuditExcel(opts: { userId?: number; entity?: string; action?: string; fromDate?: string; toDate?: string; ipAddress?: string; search?: string }): Promise<{ filename: string; buffer: Buffer }> {
  const items = await listAuditAll(opts);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Audit Log', { views: [{ state: 'frozen', ySplit: 3 }] });

  // Column definitions
  const columns = [
    { header: 'ID', key: 'AuditLogID', width: 8 },
    { header: 'When', key: 'CreatedAt', width: 22 },
    { header: 'User', key: 'UserName', width: 22 },
    { header: 'Action', key: 'Action', width: 24 },
    { header: 'Entity', key: 'Entity', width: 18 },
    { header: 'Entity ID', key: 'EntityID', width: 12 },
    { header: 'IP Address', key: 'IPAddress', width: 16 },
  ];
  sheet.columns = columns;

  // --- Row 1: Logo + centered title ---
  sheet.getRow(1).height = 40;
  const logoPath = path.resolve('public/email/mis-logo.png');
  if (fs.existsSync(logoPath)) {
    const logoId = workbook.addImage({ filename: logoPath, extension: 'png' });
    sheet.addImage(logoId, { tl: { col: 0, row: 0.1 }, ext: { width: 80, height: 32 } });
  }
  // Merge title across all columns
  const lastCol = String.fromCharCode(64 + columns.length); // G for 7 columns
  sheet.mergeCells(`C1:${lastCol}1`);
  const titleCell = sheet.getCell('C1');
  titleCell.value = 'User Activity Audit Log Report';
  titleCell.font = { bold: true, size: 16, color: { argb: 'FF1a1a2e' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // --- Row 2: Generated date with light green background ---
  sheet.getRow(2).height = 22;
  sheet.mergeCells(`A2:${lastCol}2`);
  const dateCell = sheet.getCell('A2');
  dateCell.value = `Generated: ${new Date().toLocaleString()}`;
  dateCell.font = { size: 10, color: { argb: 'FF333333' } };
  dateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
  dateCell.alignment = { vertical: 'middle' };

  // --- Row 3: Header row ---
  sheet.getRow(3).height = 24;
  const headerRow = sheet.getRow(3);
  headerRow.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0047AB' } };
  headerRow.alignment = { vertical: 'middle', wrapText: false };
  headerRow.eachCell((cell: any) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
    };
  });

  // --- Data rows (starting row 4) ---
  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FFDDDDDD' } },
    bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } },
    left: { style: 'thin', color: { argb: 'FFDDDDDD' } },
    right: { style: 'thin', color: { argb: 'FFDDDDDD' } },
  };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const row = sheet.addRow({
      AuditLogID: item.AuditLogID,
      CreatedAt: item.CreatedAt ? new Date(item.CreatedAt).toLocaleString() : '',
      UserName: item.UserName ?? '—',
      Action: item.Action,
      Entity: item.Entity,
      EntityID: item.EntityID ?? '',
      IPAddress: item.IPAddress ?? '',
    });
    row.height = 20;
    row.eachCell((cell: any) => {
      cell.border = thinBorder;
      cell.font = { size: 10, color: { argb: 'FF333333' } };
      cell.alignment = { vertical: 'middle' };
    });
    // Alternate row shading
    if (i % 2 === 0) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } };
    }
  }

  // Auto-filter on header row
  sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: columns.length } };

  const buffer = await workbook.xlsx.writeBuffer();
  return { filename: 'audit-log.xlsx', buffer: Buffer.from(buffer) };
}

export async function exportAuditCsv(opts: { userId?: number; entity?: string; action?: string; fromDate?: string; toDate?: string; ipAddress?: string; search?: string }): Promise<{ filename: string; content: string }> {
  const items = await listAuditAll(opts);
  const headers = ['ID', 'When', 'User', 'Action', 'Entity', 'Entity ID', 'IP Address'];
  const rows = items.map((item: any) => [
    item.AuditLogID,
    item.CreatedAt ? new Date(item.CreatedAt).toLocaleString() : '',
    item.UserName ?? '—',
    item.Action,
    item.Entity,
    item.EntityID ?? '',
    item.IPAddress ?? '',
  ]);
  const titleRows = [
    'Kerchanshe Group',
    'Audit Log Report',
    `Generated: ${new Date().toLocaleString()}`,
    '',
  ];
  const csv = [...titleRows, headers.join(','), ...rows.map((r: any[]) => r.join(','))].join('\n');
  return { filename: 'audit-log.csv', content: csv };
}

export async function exportAuditPdf(opts: { userId?: number; entity?: string; action?: string; fromDate?: string; toDate?: string; ipAddress?: string; search?: string }): Promise<{ filename: string; buffer: Buffer }> {
  const items = await listAuditAll(opts);
  const PDFDocument = (await import('pdfkit')).default;
  const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  const pageWidth = 842; // A4 landscape width in points
  const startX = 40;

  // --- Logo ---
  const logoPath = path.resolve('public/email/mis-logo.png');
  let contentY = 40;
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 40, contentY, { width: 80, height: 32 });
  }

  // --- Title (centered) ---
  doc.fontSize(18).font('Helvetica-Bold').fillColor('#1a1a2e');
  const title = 'User Activity Audit Log Report';
  const titleWidth = doc.widthOfString(title);
  doc.text(title, (pageWidth - titleWidth) / 2, contentY + 4, { width: titleWidth });
  contentY += 40;

  // --- Generated date with green background bar ---
  const dateText = `Generated: ${new Date().toLocaleString()}`;
  doc.save();
  doc.rect(startX, contentY, pageWidth - 80, 22).fill('#E8F5E9');
  doc.restore();
  doc.fontSize(9).font('Helvetica').fillColor('#333333').text(dateText, startX + 8, contentY + 6);
  contentY += 30;

  // --- Table ---
  const colWidths = [45, 130, 130, 120, 100, 60, 100];
  const headers = ['ID', 'When', 'User', 'Action', 'Entity', 'Entity ID', 'IP Address'];

  // Header row (blue background, white text)
  doc.save();
  doc.rect(startX, contentY, colWidths.reduce((a, b) => a + b, 0), 20).fill('#0047AB');
  doc.restore();
  doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF');
  headers.forEach((h, i) => {
    const x = startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
    doc.text(h, x + 4, contentY + 5, { width: colWidths[i] - 8, continued: false });
  });
  contentY += 20;

  // Data rows
  doc.font('Helvetica').fontSize(7.5).fillColor('#333333');
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (contentY > 560) { doc.addPage(); contentY = 40; }

    // Alternate row shading
    if (i % 2 === 0) {
      doc.save();
      doc.rect(startX, contentY, colWidths.reduce((a, b) => a + b, 0), 16).fill('#F8F9FA');
      doc.restore();
    }

    const row = [
      String(item.AuditLogID),
      item.CreatedAt ? new Date(item.CreatedAt).toLocaleString() : '',
      (item.UserName ?? '—').slice(0, 22),
      item.Action.slice(0, 20),
      item.Entity.slice(0, 18),
      String(item.EntityID ?? ''),
      (item.IPAddress ?? '').slice(0, 15),
    ];
    row.forEach((val, i) => {
      const x = startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
      doc.fillColor('#333333').text(val, x + 4, contentY + 2, { width: colWidths[i] - 8, continued: false });
    });
    contentY += 16;
  }

  // Bottom border line
  doc.save();
  doc.moveTo(startX, contentY).lineTo(startX + colWidths.reduce((a, b) => a + b, 0), contentY).lineWidth(0.5).stroke('#CCCCCC');
  doc.restore();

  doc.end();
  const pdfBuffer = await new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });
  return { filename: 'audit-log.pdf', buffer: pdfBuffer };
}

// ---------------------------------------------------------------------------
// Relationship configuration (Relationship & Dropdown Configuration)
// ---------------------------------------------------------------------------
export async function listConfigurations(): Promise<any[]> {
  const result = await db.request().query(
    `SELECT ConfigurationID, Name, Description, ParentEntity, ChildEntity, CreatedAt, UpdatedAt
     FROM dbo.RelationshipConfiguration ORDER BY Name`
  );
  return result.recordset;
}

export async function getConfiguration(id: number): Promise<any> {
  const result = await db.request().input('Id', sql.Int, id).query(
    `SELECT ConfigurationID, Name, Description, ParentEntity, ChildEntity, CreatedAt, UpdatedAt
     FROM dbo.RelationshipConfiguration WHERE ConfigurationID = @Id`
  );
  if (result.recordset.length === 0) throw new NotFoundError('Configuration not found');
  return result.recordset[0];
}

export async function createConfiguration(data: { name: string; description?: string | null; parentEntity: string; childEntity: string }): Promise<any> {
  const result = await db
    .request()
    .input('Name', sql.NVarChar(150), data.name.trim())
    .input('Description', sql.NVarChar(sql.MAX), data.description ?? null)
    .input('ParentEntity', sql.NVarChar(100), data.parentEntity.trim())
    .input('ChildEntity', sql.NVarChar(100), data.childEntity.trim())
    .query(
      `INSERT INTO dbo.RelationshipConfiguration (Name, Description, ParentEntity, ChildEntity)
       OUTPUT INSERTED.ConfigurationID, INSERTED.Name, INSERTED.Description, INSERTED.ParentEntity, INSERTED.ChildEntity, INSERTED.CreatedAt, INSERTED.UpdatedAt
       VALUES (@Name, @Description, @ParentEntity, @ChildEntity)`
    );
  return result.recordset[0];
}

export async function updateConfiguration(id: number, data: { name?: string; description?: string | null; parentEntity?: string; childEntity?: string }): Promise<void> {
  const request = db.request().input('Id', sql.Int, id);
  const sets: string[] = ['UpdatedAt = SYSUTCDATETIME()'];
  if (data.name !== undefined) { sets.push('Name = @Name'); request.input('Name', sql.NVarChar(150), data.name.trim()); }
  if (data.description !== undefined) { sets.push('Description = @Description'); request.input('Description', sql.NVarChar(sql.MAX), data.description ?? null); }
  if (data.parentEntity !== undefined) { sets.push('ParentEntity = @ParentEntity'); request.input('ParentEntity', sql.NVarChar(100), data.parentEntity.trim()); }
  if (data.childEntity !== undefined) { sets.push('ChildEntity = @ChildEntity'); request.input('ChildEntity', sql.NVarChar(100), data.childEntity.trim()); }
  if (sets.length === 1) return;
  await request.query(`UPDATE dbo.RelationshipConfiguration SET ${sets.join(', ')} WHERE ConfigurationID = @Id`);
}

export async function deleteConfiguration(id: number): Promise<void> {
  // Check for dependent items
  const check = await db.request().input('Id', sql.Int, id).query(`SELECT COUNT(*) AS Cnt FROM dbo.RelationshipItem WHERE ConfigurationID = @Id`);
  if (check.recordset[0].Cnt > 0) throw new BadRequestError('Cannot delete: configuration has items', 'HAS_DEPENDENTS');
  
  const result = await db.request().input('Id', sql.Int, id).query(
    `DELETE FROM dbo.RelationshipConfiguration WHERE ConfigurationID = @Id`
  );
  if (result.rowsAffected[0] === 0) throw new NotFoundError('Configuration not found');
}

export async function listItems(configurationId: number): Promise<any[]> {
  const result = await db.request().input('ConfigId', sql.Int, configurationId).query(
    `SELECT ItemID, ConfigurationID, ParentEntityValue, ChildEntity, ChildEntityID, DisplayName, DisplayOrder, CreatedAt, UpdatedAt
     FROM dbo.RelationshipItem WHERE ConfigurationID = @ConfigId ORDER BY DisplayOrder, DisplayName`
  );
  return result.recordset;
}

export async function createItem(data: { configurationId: number; parentEntityValue: string; childEntity: string; childEntityId: number; displayName: string; displayOrder?: number }): Promise<any> {
  const result = await db
    .request()
    .input('ConfigurationId', sql.Int, data.configurationId)
    .input('ParentEntityValue', sql.NVarChar(200), data.parentEntityValue.trim())
    .input('ChildEntity', sql.NVarChar(100), data.childEntity.trim())
    .input('ChildEntityID', sql.Int, data.childEntityId)
    .input('DisplayName', sql.NVarChar(150), data.displayName.trim())
    .input('DisplayOrder', sql.Int, data.displayOrder ?? 0)
    .query(
      `INSERT INTO dbo.RelationshipItem (ConfigurationID, ParentEntityValue, ChildEntity, ChildEntityID, DisplayName, DisplayOrder)
       OUTPUT INSERTED.ItemID, INSERTED.ConfigurationID, INSERTED.ParentEntityValue, INSERTED.ChildEntity, INSERTED.ChildEntityID, INSERTED.DisplayName, INSERTED.DisplayOrder, INSERTED.CreatedAt, INSERTED.UpdatedAt
       VALUES (@ConfigurationId, @ParentEntityValue, @ChildEntity, @ChildEntityID, @DisplayName, @DisplayOrder)`
    );
  return result.recordset[0];
}

// ---------------------------------------------------------------------------
// Power BI report schedules (admin.reportSchedules) - in-memory for this
// release; persistence + the delivery job are wired in a later phase.
// ---------------------------------------------------------------------------
export interface ReportSchedule {
  id: string;
  reportId: string;
  cron: string;
  recipients: string[];
  enabled: boolean;
}

const schedules = new Map<string, ReportSchedule>();

export function listReportSchedules(): ReportSchedule[] {
  return [...schedules.values()];
}

export function upsertReportSchedule(schedule: Omit<ReportSchedule, 'id'> & { id?: string }): ReportSchedule {
  const id = schedule.id ?? `schedule-${Date.now()}`;
  const full: ReportSchedule = { ...schedule, id };
  schedules.set(id, full);
  return full;
}

export function deleteReportSchedule(id: string): void {
  if (!schedules.delete(id)) throw new NotFoundError('Schedule not found');
}

// ---------------------------------------------------------------------------
// CustomerType management (admin.customerTypes)
// ---------------------------------------------------------------------------
export async function listCustomerTypes(): Promise<any[]> {
  const result = await db.request().query(
    `SELECT CustomerTypeID, Name, IsActive, CreatedAt, UpdatedAt
     FROM dbo.CustomerType ORDER BY Name`
  );
  return result.recordset;
}

export async function createCustomerType(data: { name: string }): Promise<number> {
  const existing = await db.request().input('Name', sql.NVarChar(50), data.name).query(
    `SELECT 1 FROM dbo.CustomerType WHERE Name = @Name`
  );
  if (existing.recordset.length > 0) throw new ConflictError('Customer type already exists');
  const result = await db.request().input('Name', sql.NVarChar(50), data.name).query(
    `INSERT INTO dbo.CustomerType (Name) OUTPUT INSERTED.CustomerTypeID VALUES (@Name)`
  );
  return result.recordset[0].CustomerTypeID;
}

export async function updateCustomerType(id: number, data: { name: string }): Promise<void> {
  const result = await db.request().input('Id', sql.Int, id).input('Name', sql.NVarChar(50), data.name).query(
    `UPDATE dbo.CustomerType SET Name = @Name, UpdatedAt = SYSUTCDATETIME() WHERE CustomerTypeID = @Id`
  );
  if (result.rowsAffected[0] === 0) throw new NotFoundError('Customer type not found');
}

export async function toggleCustomerTypeActive(id: number): Promise<{ isActive: boolean }> {
  const result = await db.request().input('Id', sql.Int, id).query(
    `UPDATE dbo.CustomerType SET IsActive = CASE WHEN IsActive = 1 THEN 0 ELSE 1 END, UpdatedAt = SYSUTCDATETIME()
     OUTPUT INSERTED.IsActive WHERE CustomerTypeID = @Id`
  );
  if (result.recordset.length === 0) throw new NotFoundError('Customer type not found');
  return { isActive: result.recordset[0].IsActive };
}

// ---------------------------------------------------------------------------
// Region management (admin.regions)
// ---------------------------------------------------------------------------
export async function listRegions(): Promise<any[]> {
  const result = await db.request().query(
    `SELECT r.RegionID, r.RegionName, r.Country, r.CreatedAt, r.UpdatedAt,
            (SELECT COUNT(*) FROM dbo.Outlet o WHERE o.RegionID = r.RegionID) AS OutletCount
     FROM dbo.Region r ORDER BY r.RegionName`
  );
  return result.recordset;
}

export async function createRegion(data: { name: string; country: string }): Promise<number> {
  const result = await db
    .request()
    .input('Name', sql.NVarChar(100), data.name)
    .input('Country', sql.VarChar(100), data.country)
    .query(`INSERT INTO dbo.Region (RegionName, Country) OUTPUT INSERTED.RegionID VALUES (@Name, @Country)`);
  return result.recordset[0].RegionID;
}

export async function updateRegion(id: number, data: { name?: string; country?: string }): Promise<void> {
  const sets: string[] = [];
  const req = db.request().input('Id', sql.Int, id);
  if (data.name !== undefined) { sets.push('RegionName = @Name'); req.input('Name', sql.NVarChar(100), data.name); }
  if (data.country !== undefined) { sets.push('Country = @Country'); req.input('Country', sql.VarChar(100), data.country); }
  if (sets.length === 0) return;
  sets.push('UpdatedAt = SYSUTCDATETIME()');
  const result = await req.query(`UPDATE dbo.Region SET ${sets.join(', ')} WHERE RegionID = @Id`);
  if (result.rowsAffected[0] === 0) throw new NotFoundError('Region not found');
}

export async function deleteRegion(id: number): Promise<void> {
  const deps = await db.request().input('Id', sql.Int, id).query(
    `SELECT
       (SELECT COUNT(*) FROM dbo.Outlet WHERE RegionID = @Id) AS Outlets,
       (SELECT COUNT(*) FROM dbo.Customer WHERE RegionID = @Id) AS Customers,
       (SELECT COUNT(*) FROM dbo.UserRegionAssignment WHERE RegionID = @Id) AS Users`
  );
  const d = deps.recordset[0];
  if (d.Outlets > 0 || d.Customers > 0 || d.Users > 0) {
    throw new BadRequestError(`Cannot delete region: ${d.Outlets} outlet(s), ${d.Customers} customer(s), ${d.Users} user assignment(s) linked`);
  }
  const result = await db.request().input('Id', sql.Int, id).query(`DELETE FROM dbo.Region WHERE RegionID = @Id`);
  if (result.rowsAffected[0] === 0) throw new NotFoundError('Region not found');
}

// ---------------------------------------------------------------------------
// Outlet management (admin.outlets)
// ---------------------------------------------------------------------------
export async function listOutlets(): Promise<any[]> {
  const result = await db.request().query(
    `SELECT o.OutletID, o.OutletName, o.City, o.RegionID, o.IsActive, o.CreatedAt, o.UpdatedAt,
            r.RegionName
     FROM dbo.Outlet o JOIN dbo.Region r ON r.RegionID = o.RegionID
     ORDER BY o.OutletName`
  );
  return result.recordset;
}

export async function createOutlet(data: { name: string; city: string; regionId: number }): Promise<number> {
  const result = await db
    .request()
    .input('Name', sql.NVarChar(150), data.name)
    .input('City', sql.NVarChar(100), data.city)
    .input('RegionId', sql.Int, data.regionId)
    .query(`INSERT INTO dbo.Outlet (OutletName, City, RegionID) OUTPUT INSERTED.OutletID VALUES (@Name, @City, @RegionId)`);
  return result.recordset[0].OutletID;
}

export async function updateOutlet(id: number, data: { name?: string; city?: string; regionId?: number; isActive?: boolean }): Promise<void> {
  const sets: string[] = [];
  const req = db.request().input('Id', sql.Int, id);
  if (data.name !== undefined) { sets.push('OutletName = @Name'); req.input('Name', sql.NVarChar(150), data.name); }
  if (data.city !== undefined) { sets.push('City = @City'); req.input('City', sql.NVarChar(100), data.city); }
  if (data.regionId !== undefined) { sets.push('RegionID = @RegionId'); req.input('RegionId', sql.Int, data.regionId); }
  if (data.isActive !== undefined) { sets.push('IsActive = @IsActive'); req.input('IsActive', sql.Bit, data.isActive); }
  if (sets.length === 0) return;
  sets.push('UpdatedAt = SYSUTCDATETIME()');
  const result = await req.query(`UPDATE dbo.Outlet SET ${sets.join(', ')} WHERE OutletID = @Id`);
  if (result.rowsAffected[0] === 0) throw new NotFoundError('Outlet not found');
}

export async function deleteOutlet(id: number): Promise<void> {
  const deps = await db.request().input('Id', sql.Int, id).query(
    `SELECT
       (SELECT COUNT(*) FROM dbo.CompetitorPrice WHERE OutletID = @Id) AS Prices,
       (SELECT COUNT(*) FROM dbo.Customer WHERE OutletID = @Id) AS Customers`
  );
  const d = deps.recordset[0];
  if (d.Prices > 0 || d.Customers > 0) {
    throw new BadRequestError(`Cannot delete outlet: ${d.Prices} competitor price(s), ${d.Customers} customer(s) linked`);
  }
  const result = await db.request().input('Id', sql.Int, id).query(`DELETE FROM dbo.Outlet WHERE OutletID = @Id`);
  if (result.rowsAffected[0] === 0) throw new NotFoundError('Outlet not found');
}

// ---------------------------------------------------------------------------
// Product per-type pricing (admin.products)
// ---------------------------------------------------------------------------
export async function listProductPrices(productId: number): Promise<any[]> {
  const result = await db.request().input('ProductId', sql.Int, productId).query(
    `SELECT pp.ProductPriceID, pp.ProductID, pp.CustomerTypeID, pp.UnitPrice, pp.CreatedAt, pp.UpdatedAt,
            ct.Name AS CustomerTypeName
     FROM dbo.ProductPrice pp
     JOIN dbo.CustomerType ct ON ct.CustomerTypeID = pp.CustomerTypeID
     WHERE pp.ProductID = @ProductId ORDER BY ct.Name`
  );
  return result.recordset;
}

export async function saveProductPrices(productId: number, prices: { customerTypeId: number; unitPrice: number }[]): Promise<void> {
  const tx = new sql.Transaction(db.pool);
  await tx.begin();
  try {
    const delReq = new sql.Request(tx);
    await delReq.input('ProductId', sql.Int, productId).query('DELETE FROM dbo.ProductPrice WHERE ProductID = @ProductId');
    for (const p of prices) {
      const insReq = new sql.Request(tx);
      await insReq
        .input('ProductId', sql.Int, productId)
        .input('CustomerTypeId', sql.Int, p.customerTypeId)
        .input('UnitPrice', sql.Decimal(18, 2), p.unitPrice)
        .query(
          `INSERT INTO dbo.ProductPrice (ProductID, CustomerTypeID, UnitPrice)
           VALUES (@ProductId, @CustomerTypeId, @UnitPrice)`
        );
    }
    await tx.commit();
  } catch {
    await tx.rollback();
    throw new BadRequestError('Failed to save product prices');
  }
}

// ---------------------------------------------------------------------------
// LookupOption management (admin.configurations)
// ---------------------------------------------------------------------------
export async function listLookups(category?: string): Promise<any[]> {
  const request = db.request();
  let where = '1=1';
  if (category) {
    where += ' AND lo.Category = @Category';
    request.input('Category', sql.VarChar(50), category);
  }
  const result = await request.query(
    `SELECT lo.LookupID, lo.Category, lo.Value, lo.SortOrder, lo.IsActive, lo.CreatedAt
     FROM dbo.LookupOption lo
     WHERE ${where}
     ORDER BY lo.Category, lo.SortOrder`
  );
  return result.recordset;
}

export async function createLookup(data: { category: string; value: string; sortOrder?: number }): Promise<number> {
  const result = await db.request()
    .input('Category', sql.VarChar(50), data.category)
    .input('Value', sql.VarChar(100), data.value)
    .input('SortOrder', sql.Int, data.sortOrder ?? 0)
    .query(
      `INSERT INTO dbo.LookupOption (Category, Value, SortOrder)
       OUTPUT INSERTED.LookupID
       VALUES (@Category, @Value, @SortOrder)`
    );
  return result.recordset[0].LookupID;
}

export async function updateLookup(id: number, data: { value?: string; sortOrder?: number; isActive?: boolean }): Promise<void> {
  const sets: string[] = [];
  const request = db.request().input('Id', sql.Int, id);
  if (data.value !== undefined) { sets.push('Value = @Value'); request.input('Value', sql.VarChar(100), data.value); }
  if (data.sortOrder !== undefined) { sets.push('SortOrder = @SortOrder'); request.input('SortOrder', sql.Int, data.sortOrder); }
  if (data.isActive !== undefined) { sets.push('IsActive = @IsActive'); request.input('IsActive', sql.Bit, data.isActive); }
  if (sets.length === 0) return;
  const result = await request.query(
    `UPDATE dbo.LookupOption SET ${sets.join(', ')} WHERE LookupID = @Id`
  );
  if (result.rowsAffected[0] === 0) throw new NotFoundError('Lookup option not found');
}

export async function deleteLookup(id: number): Promise<void> {
  const result = await db.request().input('Id', sql.Int, id).query(
    `DELETE FROM dbo.LookupOption WHERE LookupID = @Id`
  );
  if (result.rowsAffected[0] === 0) throw new NotFoundError('Lookup option not found');
}
