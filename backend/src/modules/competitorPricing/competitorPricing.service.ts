import sql from 'mssql';
import { db } from '../../db/pool';
import { NotFoundError, BadRequestError } from '../../utils/errors';
import { scopeClause, type DataScope } from '../../utils/scope';
import { dispatchEvent } from '../notifications/notifications.service';

export interface RecordPriceInput {
  productId: number;
  competitorName: string;
  price: number;
  regionId: number;
  outletId?: number | null;
  recordedBy: number;
  recordedDate?: string;
  competitorId?: number | null;
  availability?: string | null;
  promotionObserved?: string | null;
  qualityObservation?: string | null;
  photoVideoRef?: string | null;
  customerTypeId?: number | null;
}

const PRICE_SELECT = `
  SELECT cp.PriceID, cp.ProductID, cp.CompetitorName, cp.Price, cp.RegionID, cp.OutletID,
         cp.RecordedBy, cp.RecordedDate, cp.ObservedAt, cp.CompetitorID, cp.Availability,
         cp.PromotionObserved, cp.QualityObservation, cp.PhotoVideoRef, cp.CustomerTypeID,
         comp.Name AS CompetitorCatalogueName,
         p.ProductCode, p.Name AS ProductName, p.Category,
         pcols.ProductColors AS ProductColors,
         COALESCE(pp.UnitPrice, p.UnitPrice) AS OwnPrice,
         ct.Name AS CustomerTypeName,
         r.RegionName, r.Country, o.OutletName,
         u.Name AS RecordedByName,
         CASE WHEN COALESCE(pp.UnitPrice, p.UnitPrice) IS NOT NULL AND COALESCE(pp.UnitPrice, p.UnitPrice) > 0
              THEN ROUND(((COALESCE(pp.UnitPrice, p.UnitPrice) - cp.Price) / COALESCE(pp.UnitPrice, p.UnitPrice)) * 100.0, 2)
              ELSE NULL END AS GapPercent
  FROM dbo.CompetitorPrice cp
  JOIN dbo.Product p ON p.ProductID = cp.ProductID
  JOIN dbo.Region r ON r.RegionID = cp.RegionID
  LEFT JOIN dbo.Outlet o ON o.OutletID = cp.OutletID
  LEFT JOIN dbo.Competitor comp ON comp.CompetitorID = cp.CompetitorID
  LEFT JOIN dbo.CustomerType ct ON ct.CustomerTypeID = cp.CustomerTypeID
  LEFT JOIN dbo.ProductPrice pp ON pp.ProductID = cp.ProductID AND pp.CustomerTypeID = cp.CustomerTypeID
  JOIN dbo.[User] u ON u.UserID = cp.RecordedBy
  OUTER APPLY (
    SELECT STRING_AGG(c.Name, ', ') WITHIN GROUP (ORDER BY c.SortOrder, c.Name) AS ProductColors
    FROM dbo.ProductColor pc
    JOIN dbo.Color c ON c.ColorID = pc.ColorID
    WHERE pc.ProductID = p.ProductID
  ) pcols`;

export async function recordPrice(data: RecordPriceInput & { priceId?: number }): Promise<{ priceId: number; gapPercent: number | null; alertCreated: boolean }> {
  // Look up per-type price if customerTypeId is provided, otherwise fall back to base UnitPrice
  let own = 0;
  if (data.customerTypeId) {
    const typePrice = await db.request().input('ProductId', sql.Int, data.productId).input('CustomerTypeId', sql.Int, data.customerTypeId).query(
      `SELECT TOP 1 pp.UnitPrice FROM dbo.ProductPrice pp WHERE pp.ProductID = @ProductId AND pp.CustomerTypeID = @CustomerTypeId`
    );
    if (typePrice.recordset.length > 0) {
      own = Number(typePrice.recordset[0].UnitPrice);
    }
  }
  if (own === 0) {
    const product = await db.request().input('Id', sql.Int, data.productId).query(
      `SELECT ProductID, Category, UnitPrice FROM dbo.Product WHERE ProductID = @Id AND IsActive = 1`
    );
    if (product.recordset.length === 0) throw new NotFoundError('Product not found');
    own = Number(product.recordset[0].UnitPrice);
  }

  const isUpdate = data.priceId !== undefined;

  if (isUpdate) {
    // Update existing price record
    await db.request()
      .input('PriceId', sql.Int, data.priceId!)
      .input('CompetitorName', sql.NVarChar(150), data.competitorName)
      .input('Price', sql.Decimal(18, 2), data.price)
      .input('RegionId', sql.Int, data.regionId)
      .input('OutletId', sql.Int, data.outletId ?? null)
      .input('RecordedBy', sql.Int, data.recordedBy)
      .input('RecordedDate', sql.Date, data.recordedDate ?? new Date().toISOString().slice(0, 10))
      .input('CompetitorId', sql.Int, data.competitorId ?? null)
      .input('Availability', sql.VarChar(50), data.availability ?? null)
      .input('PromotionObserved', sql.NVarChar(500), data.promotionObserved ?? null)
      .input('QualityObservation', sql.NVarChar(500), data.qualityObservation ?? null)
      .input('PhotoVideoRef', sql.NVarChar(1000), data.photoVideoRef ?? null)
      .input('CustomerTypeId', sql.Int, data.customerTypeId ?? null)
      .query(
        `UPDATE dbo.CompetitorPrice SET CompetitorName = @CompetitorName, Price = @Price, RegionID = @RegionId, OutletID = @OutletId, RecordedBy = @RecordedBy, RecordedDate = @RecordedDate, CompetitorId = @CompetitorId, Availability = @Availability, PromotionObserved = @PromotionObserved, QualityObservation = @QualityObservation, PhotoVideoRef = @PhotoVideoRef, CustomerTypeID = @CustomerTypeId WHERE PriceID = @PriceId`
      );
    
    // Check if gap alert needs to be created/updated
    const gap = own > 0 ? Number(((own - data.price) / own) * 100) : null;

    let alertCreated = false;
    if (gap !== null) {
      const category = (await db.request().input('Id', sql.Int, data.productId).query(
        `SELECT Category FROM dbo.Product WHERE ProductID = @Id`
      )).recordset[0]?.Category;
      const threshold = await db.request().input('Category', sql.VarChar(100), category).query(
        `SELECT TOP 1 ThresholdPercent FROM dbo.PriceGapThreshold WHERE ProductCategory = @Category`
      );
      const thresholdPercent = Number(threshold.recordset[0]?.ThresholdPercent ?? 15);
      if (Math.abs(gap) >= thresholdPercent) {
        // Check if alert already exists for this price
        const existingAlert = await db.request().input('PriceId', sql.Int, data.priceId).query(
          `SELECT GapAlertID FROM dbo.PriceGapAlert WHERE PriceID = @PriceId`
        );
        if (existingAlert.recordset.length === 0) {
          // Create new alert
          await db.request().input('PriceId', sql.Int, data.priceId).input('OwnPrice', sql.Decimal(18, 2), own).input('GapPercent', sql.Decimal(5, 2), gap).input('ThresholdPercent', sql.Decimal(5, 2), thresholdPercent).query(
            `INSERT INTO dbo.PriceGapAlert (PriceID, OwnPrice, GapPercent, ThresholdPercent, Status) VALUES (@PriceId, @OwnPrice, @GapPercent, @ThresholdPercent, 'Active')`
          );
        } else {
          // Update existing alert
          await db.request().input('GapAlertID', sql.Int, existingAlert.recordset[0].GapAlertID).input('GapPercent', sql.Decimal(5, 2), gap).input('ThresholdPercent', sql.Decimal(5, 2), thresholdPercent).query(
            `UPDATE dbo.PriceGapAlert SET GapPercent = @GapPercent, ThresholdPercent = @ThresholdPercent WHERE GapAlertID = @GapAlertID`
          );
        }
        alertCreated = existingAlert.recordset.length === 0;
      }
      
      const updatePriceId = data.priceId!;
      
      return { priceId: updatePriceId, gapPercent: gap, alertCreated };
    }
  }

  // Original INSERT logic for new records
  const insert = await db
    .request()
    .input('ProductId', sql.Int, data.productId)
    .input('CompetitorName', sql.NVarChar(150), data.competitorName)
    .input('Price', sql.Decimal(18, 2), data.price)
    .input('RegionId', sql.Int, data.regionId)
    .input('OutletId', sql.Int, data.outletId ?? null)
    .input('RecordedBy', sql.Int, data.recordedBy)
    .input('RecordedDate', sql.Date, data.recordedDate ?? new Date().toISOString().slice(0, 10))
    .input('CompetitorId', sql.Int, data.competitorId ?? null)
    .input('Availability', sql.VarChar(50), data.availability ?? null)
    .input('PromotionObserved', sql.NVarChar(500), data.promotionObserved ?? null)
    .input('QualityObservation', sql.NVarChar(500), data.qualityObservation ?? null)
    .input('PhotoVideoRef', sql.NVarChar(1000), data.photoVideoRef ?? null)
    .input('CustomerTypeId', sql.Int, data.customerTypeId ?? null)
    .query(
      `INSERT INTO dbo.CompetitorPrice (ProductID, CompetitorName, Price, RegionID, OutletID, RecordedBy,
               RecordedDate, CompetitorID, Availability, PromotionObserved, QualityObservation, PhotoVideoRef, CustomerTypeID)
        OUTPUT INSERTED.PriceID
        VALUES (@ProductId, @CompetitorName, @Price, @RegionId, @OutletId, @RecordedBy,
               @RecordedDate, @CompetitorId, @Availability, @PromotionObserved, @QualityObservation, @PhotoVideoRef, @CustomerTypeId)`
    );
  const priceId = insert.recordset[0].PriceID;

  const gap = own > 0 ? Number(((own - data.price) / own) * 100) : null;

  let alertCreated = false;
  if (gap !== null) {
    const category = (await db.request().input('Id', sql.Int, data.productId).query(
      `SELECT Category FROM dbo.Product WHERE ProductID = @Id`
    )).recordset[0]?.Category;
    const threshold = await db.request().input('Category', sql.VarChar(100), category).query(
      `SELECT TOP 1 ThresholdPercent FROM dbo.PriceGapThreshold WHERE ProductCategory = @Category`
    );
    const thresholdPercent = Number(threshold.recordset[0]?.ThresholdPercent ?? 15);
    if (Math.abs(gap) >= thresholdPercent) {
      await db
        .request()
        .input('PriceId', sql.Int, priceId)
        .input('OwnPrice', sql.Decimal(18, 2), own)
        .input('GapPercent', sql.Decimal(5, 2), gap)
        .input('ThresholdPercent', sql.Decimal(5, 2), thresholdPercent)
        .query(
          `INSERT INTO dbo.PriceGapAlert (PriceID, OwnPrice, GapPercent, ThresholdPercent, Status)
           VALUES (@PriceId, @OwnPrice, @GapPercent, @ThresholdPercent, 'Active')`
        );
      alertCreated = true;

      // Email notification: PriceGapAlert (FDS EPIC-02, Integration Design 5.2).
      const productInfo = (await db.request().input('Id', sql.Int, data.productId).query(
        `SELECT ProductCode FROM dbo.Product WHERE ProductID = @Id`
      )).recordset[0];
      await dispatchEvent({
        event: 'PriceGapAlert',
        subject: `Price gap alert: ${productInfo?.ProductCode ?? ''}`,
        body: `Competitor price gap of ${gap.toFixed(2)}% recorded for ${data.competitorName} (threshold ${thresholdPercent}%).`,
        payload: { priceId, productId: data.productId, gapPercent: gap, competitorName: data.competitorName },
      });
    }
  }

  return { priceId, gapPercent: gap, alertCreated };
}

export async function getPrice(priceId: number): Promise<any> {
  const result = await db.request()
    .input('PriceId', sql.Int, priceId)
    .query(`${PRICE_SELECT} WHERE cp.PriceID = @PriceId`);
  if (result.recordset.length === 0) throw new NotFoundError('Price record not found');
  return result.recordset[0];
}

export async function listPrices(opts: {
  dataScope: DataScope;
  userId: number;
  productId?: number;
  regionId?: number;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ items: any[]; total: number; page: number; pageSize: number }> {
  const where: string[] = ['1=1'];
  const request = db.request();
  if (opts.productId) { where.push('cp.ProductID = @ProductId'); request.input('ProductId', sql.Int, opts.productId); }
  if (opts.regionId) { where.push('cp.RegionID = @RegionId'); request.input('RegionId', sql.Int, opts.regionId); }
  if (opts.fromDate) { where.push('cp.RecordedDate >= @From'); request.input('From', sql.Date, opts.fromDate); }
  if (opts.toDate) { where.push('cp.RecordedDate <= @To'); request.input('To', sql.Date, opts.toDate); }
  // Always bind @UserId: the scope clause references it for 'own'/'region'.
  request.input('UserId', sql.Int, opts.userId);
  const scope = scopeClause(opts.dataScope, { alias: 'cp', ownerColumn: 'RecordedBy', regionColumn: 'RegionID' });
  if (scope) where.push(scope);

  const whereSql = where.join(' AND ');
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 20;
  const offset = (page - 1) * pageSize;
  request.input('Offset', sql.Int, offset);
  request.input('Limit', sql.Int, pageSize);
  const count = await request.query(`SELECT COUNT(*) AS Total FROM dbo.CompetitorPrice cp WHERE ${whereSql}`);
  const result = await request.query(`${PRICE_SELECT} WHERE ${whereSql} ORDER BY cp.RecordedDate DESC, cp.ObservedAt DESC OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY`);
  return { items: result.recordset, total: count.recordset[0].Total, page, pageSize };
}

/** Own vs competitor comparison for a product (FR-02.3/02.4).
 *  Sourced from the Competitor Master (dbo.CompetitorProduct) as of 030 —
 *  the Price page's single source for competitor prices. */
export async function comparePrice(productId: number, _regionId?: number): Promise<any> {
  const product = await db.request().input('Id', sql.Int, productId).query(
    `SELECT ProductID, ProductCode, Name, Category, UnitPrice FROM dbo.Product WHERE ProductID = @Id`
  );
  if (product.recordset.length === 0) throw new NotFoundError('Product not found');
  const result = await db.request().input('ProductId', sql.Int, productId).query(
    `SELECT c.Name AS CompetitorName, cpd.ProductName AS Model, cpd.Price, cpd.PriceMax,
            cpd.EffectiveDate, cpd.Status
     FROM dbo.CompetitorProduct cpd
     JOIN dbo.Competitor c ON c.CompetitorID = cpd.CompetitorID
     WHERE cpd.OurProductID = @ProductId AND c.IsActive = 1 AND cpd.Status = 'Active'
     ORDER BY cpd.Price`
  );
  const own = Number(product.recordset[0].UnitPrice);
  const competitors = result.recordset.map((c: any) => ({
    ...c,
    price: Number(c.Price),
    priceMax: c.PriceMax != null ? Number(c.PriceMax) : null,
    gapPercent: own > 0 ? Number((((own - Number(c.Price)) / own) * 100).toFixed(2)) : null,
  }));
  return { product: product.recordset[0], ownPrice: own, competitors };
}

// ---------------------------------------------------------------------------
// Thresholds (admin-only: pricing.configureThreshold)
// ---------------------------------------------------------------------------
export async function getThresholds(): Promise<any[]> {
  const result = await db.request().query(
    `SELECT ThresholdID, ProductCategory, ThresholdPercent, UpdatedAt FROM dbo.PriceGapThreshold ORDER BY ProductCategory`
  );
  return result.recordset;
}

export async function configureThreshold(category: string, thresholdPercent: number): Promise<void> {
  if (thresholdPercent <= 0) throw new BadRequestError('Threshold must be positive', 'INVALID_THRESHOLD');
  await db
    .request()
    .input('Category', sql.VarChar(100), category)
    .input('Percent', sql.Decimal(5, 2), thresholdPercent)
    .query(
      `MERGE dbo.PriceGapThreshold AS t
       USING (SELECT @Category AS ProductCategory) AS s ON t.ProductCategory = s.ProductCategory
       WHEN MATCHED THEN UPDATE SET t.ThresholdPercent = @Percent, t.UpdatedAt = SYSUTCDATETIME()
       WHEN NOT MATCHED THEN INSERT (ProductCategory, ThresholdPercent, UpdatedAt) VALUES (@Category, @Percent, SYSUTCDATETIME());`
    );
}

export async function deleteThreshold(thresholdId: number): Promise<void> {
  const result = await db.request().input('Id', sql.Int, thresholdId).query(
    `DELETE FROM dbo.PriceGapThreshold WHERE ThresholdID = @Id`
  );
  if (result.rowsAffected[0] === 0) throw new NotFoundError('Threshold not found');
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------
export async function listAlerts(opts: { status?: string }): Promise<any[]> {
  const request = db.request();
  let where = '1=1';
  if (opts.status) { where = 'a.Status = @Status'; request.input('Status', sql.VarChar(20), opts.status); }
  const result = await request.query(
    `SELECT a.GapAlertID, a.PriceID, a.CompetitorProductID, a.OwnPrice, a.GapPercent, a.ThresholdPercent, a.Status, a.CreatedAt, a.ResolvedAt,
            COALESCE(p.ProductCode, p2.ProductCode) AS ProductCode,
            COALESCE(p.Name, p2.Name) AS ProductName,
            COALESCE(p.Category, p2.Category) AS Category,
            COALESCE(cp.CompetitorName, c.Name) AS CompetitorName,
            COALESCE(cp.Price, cpd.Price) AS CompetitorPrice,
            r.RegionName
     FROM dbo.PriceGapAlert a
     LEFT JOIN dbo.CompetitorPrice cp ON cp.PriceID = a.PriceID
     LEFT JOIN dbo.Product p ON p.ProductID = cp.ProductID
     LEFT JOIN dbo.Region r ON r.RegionID = cp.RegionID
     LEFT JOIN dbo.CompetitorProduct cpd ON cpd.CompetitorProductID = a.CompetitorProductID
     LEFT JOIN dbo.Competitor c ON c.CompetitorID = cpd.CompetitorID
     LEFT JOIN dbo.Product p2 ON p2.ProductID = cpd.OurProductID
     WHERE ${where}
     ORDER BY a.CreatedAt DESC`
  );
  return result.recordset;
}

export async function resolveAlert(alertId: number): Promise<void> {
  const result = await db.request().input('Id', sql.Int, alertId).query(
    `UPDATE dbo.PriceGapAlert SET Status = 'Resolved', ResolvedAt = SYSUTCDATETIME() WHERE GapAlertID = @Id`
  );
  if (result.rowsAffected[0] === 0) throw new NotFoundError('Alert not found');
}

export async function dismissAlert(alertId: number): Promise<void> {
  const result = await db.request().input('Id', sql.Int, alertId).query(
    `UPDATE dbo.PriceGapAlert SET Status = 'Dismissed' WHERE GapAlertID = @Id`
  );
  if (result.rowsAffected[0] === 0) throw new NotFoundError('Alert not found');
}

// Used by reports: top competitor gaps currently above threshold.
export async function activeGapCount(): Promise<number> {
  const result = await db.request().query(
    `SELECT COUNT(*) AS Cnt FROM dbo.PriceGapAlert WHERE Status = 'Active'`
  );
  return result.recordset[0].Cnt;
}