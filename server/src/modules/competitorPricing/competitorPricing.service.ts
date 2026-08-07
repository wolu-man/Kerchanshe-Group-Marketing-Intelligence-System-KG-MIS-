import sql from 'mssql';
import { getPool } from '../../db/pool';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { notifyEvent } from '../notifications/notifications.service';

export interface CompetitorPriceInput {
  productId: number;
  competitorName: string;
  price: number;
  regionId: number;
  outletId?: number;
  recordedDate: string;
}

export interface CompareFilters {
  productId?: number;
  regionId?: number;
  competitor?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
}

export interface AlertFilters {
  status?: string;
  productId?: number;
  regionId?: number;
}

/** Retrieves the configurable gap threshold (%) for a product category. */
export async function getGapThreshold(category: string): Promise<number> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('category', sql.VarChar(100), category)
    .query('SELECT ThresholdPercent FROM dbo.PriceGapThreshold WHERE ProductCategory = @category');
  return result.recordset.length > 0 ? Number(result.recordset[0].ThresholdPercent) : 10;
}

export async function createCompetitorPrice(userId: number, input: CompetitorPriceInput) {
  const pool = await getPool();

  const productResult = await pool
    .request()
    .input('productId', sql.Int, input.productId)
    .query('SELECT ProductID, Name, Category, UnitPrice FROM dbo.Product WHERE ProductID = @productId');
  const product = productResult.recordset[0];
  if (!product) throw new NotFoundError('Product not found');

  const regionResult = await pool
    .request()
    .input('regionId', sql.Int, input.regionId)
    .query('SELECT RegionID FROM dbo.Region WHERE RegionID = @regionId');
  if (regionResult.recordset.length === 0) throw new BadRequestError('Invalid region');

  const ownPrice = Number(product.UnitPrice ?? 0);
  const competitorPrice = Number(input.price);
  const gapPercent =
    ownPrice > 0 ? Number((((ownPrice - competitorPrice) / ownPrice) * 100).toFixed(2)) : 0;
  const threshold = await getGapThreshold(product.Category);
  const thresholdBreached = ownPrice > 0 && competitorPrice < ownPrice && gapPercent > threshold;

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const request = new sql.Request(transaction);
    const priceResult = await request
      .input('productId', sql.Int, input.productId)
      .input('competitorName', sql.NVarChar(150), input.competitorName)
      .input('price', sql.Decimal(18, 2), input.price)
      .input('regionId', sql.Int, input.regionId)
      .input('outletId', sql.Int, input.outletId ?? null)
      .input('recordedBy', sql.Int, userId)
      .input('recordedDate', sql.Date, new Date(input.recordedDate))
      .query(`
        INSERT INTO dbo.CompetitorPrice (ProductID, CompetitorName, Price, RegionID, OutletID, RecordedBy, RecordedDate)
        VALUES (@productId, @competitorName, @price, @regionId, @outletId, @recordedBy, @recordedDate);
        SELECT SCOPE_IDENTITY() AS PriceID;
      `);
    const priceId = Number(priceResult.recordset[0].PriceID);

    if (thresholdBreached) {
      await request
        .input('priceId', sql.Int, priceId)
        .input('ownPrice', sql.Decimal(18, 2), ownPrice)
        .input('gapPercent', sql.Decimal(5, 2), gapPercent)
        .input('threshold', sql.Decimal(5, 2), threshold)
        .query(`
          INSERT INTO dbo.PriceGapAlert (PriceID, OwnPrice, GapPercent, ThresholdBreached, Status)
          VALUES (@priceId, @ownPrice, @gapPercent, 1, 'Active');
          SELECT SCOPE_IDENTITY() AS GapAlertID;
        `);
    }

    await transaction.commit();

    if (thresholdBreached) {
      await notifyEvent('PriceGapAlert', {
        subject: `Price gap alert: ${product.Name}`,
        message: `Competitor "${input.competitorName}" priced ${product.Name} at ${competitorPrice} vs own ${ownPrice} (gap ${gapPercent}%, threshold ${threshold}%).`,
      });
    }

    return { priceId, gapPercent, thresholdBreached };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function listCompetitorPrices(filters: CompareFilters) {
  const pool = await getPool();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  const request = pool.request();
  let where = 'WHERE 1=1';
  if (filters.productId) {
    where += ' AND cp.ProductID = @productId';
    request.input('productId', sql.Int, filters.productId);
  }
  if (filters.regionId) {
    where += ' AND cp.RegionID = @regionId';
    request.input('regionId', sql.Int, filters.regionId);
  }
  if (filters.competitor) {
    where += ' AND cp.CompetitorName LIKE @competitor';
    request.input('competitor', sql.NVarChar(150), `%${filters.competitor}%`);
  }
  if (filters.fromDate) {
    where += ' AND cp.RecordedDate >= @fromDate';
    request.input('fromDate', sql.Date, filters.fromDate);
  }
  if (filters.toDate) {
    where += ' AND cp.RecordedDate <= @toDate';
    request.input('toDate', sql.Date, filters.toDate);
  }

  const countResult = await request.query(`SELECT COUNT(*) AS Total FROM dbo.CompetitorPrice cp ${where}`);
  const total = Number(countResult.recordset[0].Total);

  const rows = await pool.request().query(`
    SELECT
      cp.PriceID, cp.ProductID, p.Name AS ProductName, p.Category, p.UnitPrice AS OwnPrice,
      cp.CompetitorName, cp.Price, cp.RegionID, reg.RegionName, cp.OutletID, o.OutletName,
      cp.RecordedBy, u.Name AS RecordedByName, cp.RecordedDate, cp.ObservedAt,
      CASE WHEN p.UnitPrice > 0 THEN ROUND(((p.UnitPrice - cp.Price) / p.UnitPrice) * 100, 2) ELSE 0 END AS GapPercent
    FROM dbo.CompetitorPrice cp
    JOIN dbo.Product p ON p.ProductID = cp.ProductID
    JOIN dbo.Region reg ON reg.RegionID = cp.RegionID
    JOIN dbo.[User] u ON u.UserID = cp.RecordedBy
    LEFT JOIN dbo.Outlet o ON o.OutletID = cp.OutletID
    ${where}
    ORDER BY cp.ObservedAt DESC
    OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY
  `);

  return { total, page, pageSize, items: rows.recordset };
}

/** Own vs. competitor comparison, filterable by product, region, and time period. */
export async function comparePrices(filters: CompareFilters) {
  const pool = await getPool();
  const request = pool.request();
  let where = 'WHERE 1=1';
  if (filters.productId) {
    where += ' AND cp.ProductID = @productId';
    request.input('productId', sql.Int, filters.productId);
  }
  if (filters.regionId) {
    where += ' AND cp.RegionID = @regionId';
    request.input('regionId', sql.Int, filters.regionId);
  }
  if (filters.competitor) {
    where += ' AND cp.CompetitorName LIKE @competitor';
    request.input('competitor', sql.NVarChar(150), `%${filters.competitor}%`);
  }
  if (filters.fromDate) {
    where += ' AND cp.RecordedDate >= @fromDate';
    request.input('fromDate', sql.Date, filters.fromDate);
  }
  if (filters.toDate) {
    where += ' AND cp.RecordedDate <= @toDate';
    request.input('toDate', sql.Date, filters.toDate);
  }

  const result = await request.query(`
    SELECT
      cp.ProductID, p.Name AS ProductName, p.Category, p.UnitPrice AS OwnPrice,
      cp.CompetitorName, AVG(cp.Price) AS AvgCompetitorPrice,
      CASE WHEN p.UnitPrice > 0 THEN ROUND(((p.UnitPrice - AVG(cp.Price)) / p.UnitPrice) * 100, 2) ELSE 0 END AS AvgGapPercent,
      COUNT(*) AS Observations
    FROM dbo.CompetitorPrice cp
    JOIN dbo.Product p ON p.ProductID = cp.ProductID
    ${where}
    GROUP BY cp.ProductID, p.Name, p.Category, p.UnitPrice, cp.CompetitorName
    ORDER BY p.Name, cp.CompetitorName
  `);
  return result.recordset;
}

/** Lists active price-gap alerts. */
export async function listPriceAlerts(filters: AlertFilters) {
  const pool = await getPool();
  const request = pool.request();
  let where = 'WHERE 1=1';
  if (filters.status) {
    where += ' AND ga.Status = @status';
    request.input('status', sql.VarChar(20), filters.status);
  }
  if (filters.productId) {
    where += ' AND cp.ProductID = @productId';
    request.input('productId', sql.Int, filters.productId);
  }
  if (filters.regionId) {
    where += ' AND cp.RegionID = @regionId';
    request.input('regionId', sql.Int, filters.regionId);
  }

  const result = await request.query(`
    SELECT
      ga.GapAlertID, ga.PriceID, cp.ProductID, p.Name AS ProductName, p.Category,
      cp.CompetitorName, cp.Price AS CompetitorPrice, ga.OwnPrice, ga.GapPercent,
      ga.Status, ga.CreatedAt, ga.ResolvedAt, reg.RegionName
    FROM dbo.PriceGapAlert ga
    JOIN dbo.CompetitorPrice cp ON cp.PriceID = ga.PriceID
    JOIN dbo.Product p ON p.ProductID = cp.ProductID
    JOIN dbo.Region reg ON reg.RegionID = cp.RegionID
    ${where}
    ORDER BY ga.CreatedAt DESC
  `);
  return result.recordset;
}
