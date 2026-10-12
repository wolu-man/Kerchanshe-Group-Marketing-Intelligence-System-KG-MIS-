import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler } from '../../utils/http';
import { db } from '../../db/pool';
import sql from 'mssql';

const router = Router();
router.use(requireAuth);

router.get(
  '/roles',
  asyncHandler(async (_req, res) => {
    const result = await db.request().query(`SELECT RoleID, RoleName FROM dbo.Role ORDER BY RoleName`);
    res.json({ items: result.recordset });
  })
);

router.get(
  '/business-groups',
  asyncHandler(async (_req, res) => {
    const result = await db.request().query(
      `SELECT BusinessGroupID, Code, Name, Description FROM dbo.BusinessGroup ORDER BY Name`
    );
    res.json({ items: result.recordset });
  })
);

router.get(
  '/regions',
  asyncHandler(async (_req, res) => {
    const result = await db.request().query(
      `SELECT RegionID, RegionName, Country FROM dbo.Region ORDER BY RegionName`
    );
    res.json({ items: result.recordset });
  })
);

router.get(
  '/colors',
  asyncHandler(async (_req, res) => {
    const result = await db.request().query(
      `SELECT ColorID, Name, HexCode FROM dbo.Color WHERE IsActive = 1 ORDER BY SortOrder, Name`
    );
    res.json({ items: result.recordset });
  })
);

router.get(
  '/products',
  asyncHandler(async (req, res) => {
    const request = db.request();
    let where = 'p.IsActive = 1';
    if (req.query.businessGroupId) {
      where += ' AND p.BusinessGroupID = @BgId';
      request.input('BgId', sql.Int, Number(req.query.businessGroupId));
    }
    const result = await request.query(
      `SELECT p.ProductID, p.ProductCode, p.Name, p.Category, p.UnitPrice, p.BusinessGroupID,
              pcols.ProductColors AS Color, p.Size, p.WeightKg, p.Specifications,
              bg.Code AS BusinessGroupCode, bg.Name AS BusinessGroupName
       FROM dbo.Product p
       LEFT JOIN dbo.BusinessGroup bg ON bg.BusinessGroupID = p.BusinessGroupID
       OUTER APPLY (
         SELECT STRING_AGG(c.Name, ', ') WITHIN GROUP (ORDER BY c.SortOrder, c.Name) AS ProductColors
         FROM dbo.ProductColor pc
         JOIN dbo.Color c ON c.ColorID = pc.ColorID
         WHERE pc.ProductID = p.ProductID
       ) pcols
       WHERE ${where} ORDER BY p.Name`
    );
    const items = result.recordset.map((r: any) => ({ ...r, colors: r.Color ? String(r.Color).split(', ') : [] }));
    res.json({ items });
  })
);

router.get(
  '/customers',
  asyncHandler(async (_req, res) => {
    const result = await db.request().query(
      `SELECT c.CustomerID, c.CustomerCode, c.Name, c.CustomerType, c.CustomerTypeID, ct.Name AS CustomerTypeName,
              c.ContactPerson, c.ContactPhone, c.Email, c.RegionID, c.OutletID, c.BusinessGroupID,
              r.RegionName, o.OutletName, bg.Name AS BusinessGroupName
       FROM dbo.Customer c
       LEFT JOIN dbo.Region r ON r.RegionID = c.RegionID
       LEFT JOIN dbo.Outlet o ON o.OutletID = c.OutletID
       LEFT JOIN dbo.BusinessGroup bg ON bg.BusinessGroupID = c.BusinessGroupID
       LEFT JOIN dbo.CustomerType ct ON ct.CustomerTypeID = c.CustomerTypeID
       WHERE c.IsActive = 1 ORDER BY c.Name`
    );
    res.json({ items: result.recordset });
  })
);

router.get(
  '/outlets',
  asyncHandler(async (_req, res) => {
    const result = await db.request().query(
      `SELECT o.OutletID, o.OutletName, o.City, o.RegionID, r.RegionName
       FROM dbo.Outlet o JOIN dbo.Region r ON r.RegionID = o.RegionID
       WHERE o.IsActive = 1 ORDER BY o.OutletName`
    );
    res.json({ items: result.recordset });
  })
);

router.get(
  '/customer-types',
  asyncHandler(async (_req, res) => {
    const result = await db.request().query(
      `SELECT CustomerTypeID, Name FROM dbo.CustomerType WHERE IsActive = 1 ORDER BY Name`
    );
    res.json({ items: result.recordset });
  })
);

router.get(
  '/lookups',
  asyncHandler(async (req, res) => {
    const request = db.request();
    let where = 'lo.IsActive = 1';
    if (req.query.category) {
      where += ' AND lo.Category = @Category';
      request.input('Category', sql.VarChar(50), req.query.category as string);
    }
    const result = await request.query(
      `SELECT lo.LookupID, lo.Category, lo.Value, lo.SortOrder
       FROM dbo.LookupOption lo
       WHERE ${where}
       ORDER BY lo.Category, lo.SortOrder`
    );
    res.json({ items: result.recordset });
  })
);

router.get(
  '/product-prices',
  asyncHandler(async (req, res) => {
    const request = db.request();
    let where = '1=1';
    if (req.query.productId) {
      where += ' AND pp.ProductID = @ProductId';
      request.input('ProductId', sql.Int, Number(req.query.productId));
    }
    if (req.query.customerTypeId) {
      where += ' AND pp.CustomerTypeID = @CustomerTypeId';
      request.input('CustomerTypeId', sql.Int, Number(req.query.customerTypeId));
    }
    const result = await request.query(
      `SELECT pp.ProductPriceID, pp.ProductID, pp.CustomerTypeID, pp.UnitPrice,
              ct.Name AS CustomerTypeName
       FROM dbo.ProductPrice pp
       JOIN dbo.CustomerType ct ON ct.CustomerTypeID = pp.CustomerTypeID
       WHERE ${where}
       ORDER BY pp.ProductID, ct.Name`
    );
    res.json({ items: result.recordset });
  })
);

export { router as referenceRouter };
