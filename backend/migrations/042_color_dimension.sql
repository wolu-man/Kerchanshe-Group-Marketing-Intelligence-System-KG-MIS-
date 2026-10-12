-- 042_color_dimension.sql
-- Global Product Color (palette model) - Phase 1 (ADDITIVE ONLY).
-- Creates canonical Color lookup, ProductColor palette join, WeeklySales.ColorID,
-- and exposes color columns on report views. Legacy string columns are NOT touched
-- here (dropped later by 043 after code switch-over).

-- 1) Canonical color lookup --------------------------------------------------
IF OBJECT_ID('dbo.Color', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Color (
        ColorID   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Color PRIMARY KEY,
        Name      NVARCHAR(50) NOT NULL CONSTRAINT UQ_Color_Name UNIQUE,
        HexCode   NVARCHAR(7)  NULL,
        SortOrder INT NOT NULL CONSTRAINT DF_Color_SortOrder DEFAULT (0),
        IsActive  BIT NOT NULL CONSTRAINT DF_Color_IsActive DEFAULT (1),
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Color_CreatedAt DEFAULT (SYSUTCDATETIME())
    );
END;

-- 2) Seed known colors (hex used for UI swatches) ----------------------------
INSERT INTO dbo.Color (Name, HexCode, SortOrder)
SELECT v.Name, v.HexCode, v.SortOrder
FROM (VALUES
    ('Black',       '#000000',  1),
    ('Blue',        '#2563EB',  2),
    ('Beige',       '#F5F5DC',  3),
    ('Gray',        '#6B7280',  4),
    ('Green',       '#16A34A',  5),
    ('Ivory',       '#FFFFF0',  6),
    ('Lime Green',  '#84CC16',  7),
    ('Lime Yellow', '#D4E157',  8),
    ('Orange',      '#F97316',  9),
    ('Red',         '#DC2626', 10),
    ('White',       '#FFFFFF', 11),
    ('Yellow',      '#FACC15', 12)
) AS v(Name, HexCode, SortOrder)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Color c WHERE c.Name = v.Name);

-- 3) Product <-> Color palette -----------------------------------------------
IF OBJECT_ID('dbo.ProductColor', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ProductColor (
        ProductID INT NOT NULL CONSTRAINT FK_ProductColor_Product
            REFERENCES dbo.Product (ProductID) ON DELETE CASCADE,
        ColorID   INT NOT NULL CONSTRAINT FK_ProductColor_Color
            REFERENCES dbo.Color (ColorID),
        CONSTRAINT PK_ProductColor PRIMARY KEY (ProductID, ColorID)
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'IX_ProductColor_ColorID'
                 AND object_id = OBJECT_ID('dbo.ProductColor'))
    CREATE NONCLUSTERED INDEX IX_ProductColor_ColorID
        ON dbo.ProductColor (ColorID) INCLUDE (ProductID);

-- 4) Backfill palette from legacy Product.Color (comma-separated) ------------
;WITH src AS (
    SELECT ProductID, Color AS List
    FROM dbo.Product
    WHERE Color IS NOT NULL AND LTRIM(RTRIM(Color)) <> ''
),
tokens AS (
    SELECT DISTINCT p.ProductID,
           LTRIM(RTRIM(t.n.value('.', 'NVARCHAR(50)'))) AS Token
    FROM src p
    CROSS APPLY (
        SELECT CAST(('<i>' + REPLACE(p.List, ',', '</i><i>') + '</i>') AS XML) AS x
    ) s
    CROSS APPLY s.x.nodes('/i') AS t(n)
)
-- Insert any color value we have not seen before (guards unknown tokens)
INSERT INTO dbo.Color (Name, SortOrder)
SELECT DISTINCT t.Token, 90
FROM tokens t
WHERE LEN(t.Token) > 0
  AND NOT EXISTS (SELECT 1 FROM dbo.Color c WHERE LOWER(c.Name) = LOWER(t.Token));

;WITH src AS (
    SELECT ProductID, Color AS List
    FROM dbo.Product
    WHERE Color IS NOT NULL AND LTRIM(RTRIM(Color)) <> ''
),
tokens AS (
    SELECT DISTINCT p.ProductID,
           LTRIM(RTRIM(t.n.value('.', 'NVARCHAR(50)'))) AS Token
    FROM src p
    CROSS APPLY (
        SELECT CAST(('<i>' + REPLACE(p.List, ',', '</i><i>') + '</i>') AS XML) AS x
    ) s
    CROSS APPLY s.x.nodes('/i') AS t(n)
)
INSERT INTO dbo.ProductColor (ProductID, ColorID)
SELECT DISTINCT t.ProductID, c.ColorID
FROM tokens t
JOIN dbo.Color c ON LOWER(c.Name) = LOWER(t.Token)
WHERE LEN(t.Token) > 0
  AND NOT EXISTS (
      SELECT 1 FROM dbo.ProductColor pc
      WHERE pc.ProductID = t.ProductID AND pc.ColorID = c.ColorID
  );

-- Also register any legacy weekly-sales color strings not yet in the lookup
;WITH w AS (
    SELECT ProductColor AS List
    FROM dbo.WeeklySales
    WHERE ProductColor IS NOT NULL AND LTRIM(RTRIM(ProductColor)) <> ''
),
tokens AS (
    SELECT DISTINCT LTRIM(RTRIM(t.n.value('.', 'NVARCHAR(50)'))) AS Token
    FROM w
    CROSS APPLY (
        SELECT CAST(('<i>' + REPLACE(w.List, ',', '</i><i>') + '</i>') AS XML) AS x
    ) s
    CROSS APPLY s.x.nodes('/i') AS t(n)
)
INSERT INTO dbo.Color (Name, SortOrder)
SELECT DISTINCT t.Token, 90
FROM tokens t
WHERE LEN(t.Token) > 0
  AND NOT EXISTS (SELECT 1 FROM dbo.Color c WHERE LOWER(c.Name) = LOWER(t.Token));

-- 5) WeeklySales.ColorID (sale-level snapshot, constrained to product palette)
IF COL_LENGTH('dbo.WeeklySales', 'ColorID') IS NULL
    ALTER TABLE dbo.WeeklySales ADD ColorID INT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys
               WHERE name = 'FK_WeeklySales_Color')
    ALTER TABLE dbo.WeeklySales
        ADD CONSTRAINT FK_WeeklySales_Color
            FOREIGN KEY (ColorID) REFERENCES dbo.Color (ColorID);

IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'IX_WeeklySales_ColorID'
                 AND object_id = OBJECT_ID('dbo.WeeklySales'))
    CREATE NONCLUSTERED INDEX IX_WeeklySales_ColorID
        ON dbo.WeeklySales (ColorID);

-- Backfill sale color only where the stored string matches the product palette
-- (single source of truth: a sale's color must belong to its product).
UPDATE w
SET w.ColorID = c.ColorID
FROM dbo.WeeklySales w
JOIN dbo.Color c ON LOWER(c.Name) = LOWER(LTRIM(RTRIM(w.ProductColor)))
WHERE w.ProductColor IS NOT NULL
  AND EXISTS (
      SELECT 1 FROM dbo.ProductColor pc
      WHERE pc.ProductID = w.ProductID AND pc.ColorID = c.ColorID
  );
GO

-- 6a) Sales (D365) view: effective color = product's single linked color, else NULL
ALTER VIEW dbo.vw_Report_SalesByOutlet AS
SELECT
    s.SalesID,
    s.SaleDate,
    YEAR(s.SaleDate)  AS SalesYear,
    MONTH(s.SaleDate) AS SalesMonth,
    s.Quantity,
    s.Amount,
    p.ProductID, p.ProductCode, p.Name AS ProductName, p.Category,
    pc1.ColorID   AS ProductColorID,
    pc1.ColorName AS ProductColorName,
    c.CustomerID, c.Name AS CustomerName, c.CustomerType,
    r.RegionID, r.RegionName, r.Country,
    o.OutletID, o.OutletName, o.City
FROM dbo.SalesRecord s
JOIN dbo.Product  p ON p.ProductID  = s.ProductID
JOIN dbo.Customer c ON c.CustomerID = s.CustomerID
LEFT JOIN dbo.Region r ON r.RegionID = s.RegionID
LEFT JOIN dbo.Outlet o ON o.RegionID = r.RegionID
OUTER APPLY (
    SELECT TOP 1 col.ColorID, col.Name AS ColorName
    FROM dbo.ProductColor pc
    JOIN dbo.Color col ON col.ColorID = pc.ColorID
    WHERE pc.ProductID = p.ProductID
      AND (SELECT COUNT(*) FROM dbo.ProductColor pc2 WHERE pc2.ProductID = p.ProductID) = 1
) pc1;
GO

-- 6b) Weekly sales view: sale's captured color
ALTER VIEW dbo.vw_Report_WeeklySales AS
SELECT
    w.WeeklySalesID, w.WeekEnding, w.QuantitySold, w.UnitPrice, w.Revenue, w.Status,
    w.ColorID AS ColorID,
    wc.Name AS ProductColorName,
    bg.BusinessGroupID, bg.Code AS BusinessGroupCode, bg.Name AS BusinessGroupName,
    p.ProductID, p.ProductCode, p.Name AS ProductName, p.Category,
    r.RegionID, r.RegionName, r.Country,
    o.OutletID, o.OutletName, o.City,
    c.CustomerID, c.Name AS CustomerName, c.CustomerType,
    u.UserID AS SubmittedByUserID, u.Name AS SubmittedByName
FROM dbo.WeeklySales w
JOIN dbo.BusinessGroup bg ON bg.BusinessGroupID = w.BusinessGroupID
JOIN dbo.Product  p ON p.ProductID = w.ProductID
JOIN dbo.Region   r ON r.RegionID = w.RegionID
JOIN dbo.Outlet   o ON o.OutletID = w.OutletID
LEFT JOIN dbo.Color wc ON wc.ColorID = w.ColorID
LEFT JOIN dbo.Customer c ON c.CustomerID = w.CustomerID
JOIN dbo.[User]   u ON u.UserID = w.SubmittedBy;
GO

-- 6c) Price comparison view: product palette string
ALTER VIEW dbo.vw_Report_PriceComparison AS
SELECT
    cp.PriceID, cp.RecordedDate, cp.CompetitorName, cp.Price AS CompetitorPrice,
    p.ProductID, p.ProductCode, p.Name AS ProductName, p.Category,
    pcols.ProductColors,
    p.UnitPrice AS OwnPrice,
    CASE WHEN p.UnitPrice IS NOT NULL AND p.UnitPrice > 0
         THEN ROUND(((p.UnitPrice - cp.Price) / p.UnitPrice) * 100.0, 2)
         ELSE NULL END AS GapPercent,
    r.RegionID, r.RegionName, r.Country,
    o.OutletID, o.OutletName,
    u.UserID AS RecordedByUserID, u.Name AS RecordedByName
FROM dbo.CompetitorPrice cp
JOIN dbo.Product  p ON p.ProductID = cp.ProductID
JOIN dbo.Region   r ON r.RegionID  = cp.RegionID
LEFT JOIN dbo.Outlet o ON o.OutletID = cp.OutletID
JOIN dbo.[User]   u ON u.UserID = cp.RecordedBy
OUTER APPLY (
    SELECT STRING_AGG(col.Name, ', ') WITHIN GROUP (ORDER BY col.SortOrder, col.Name) AS ProductColors
    FROM dbo.ProductColor pc
    JOIN dbo.Color col ON col.ColorID = pc.ColorID
    WHERE pc.ProductID = p.ProductID
) pcols;
GO

-- 6d) Competitor intelligence view: product palette string
ALTER VIEW dbo.vw_Report_CompetitorIntelligence AS
SELECT
    cp.PriceID, cp.RecordedDate, cp.Price AS CompetitorPrice, cp.Availability,
    cp.PromotionObserved, cp.QualityObservation, cp.PhotoVideoRef,
    comp.CompetitorID, comp.Name AS CompetitorName,
    p.ProductID, p.ProductCode, p.Name AS ProductName, p.Category,
    pcols.ProductColors,
    p.UnitPrice AS OwnPrice,
    CASE WHEN p.UnitPrice IS NOT NULL AND p.UnitPrice > 0
         THEN ROUND(((p.UnitPrice - cp.Price) / p.UnitPrice) * 100.0, 2)
         ELSE NULL END AS GapPercent,
    bg.BusinessGroupID, bg.Name AS BusinessGroupName,
    r.RegionID, r.RegionName, r.Country,
    o.OutletID, o.OutletName,
    u.UserID AS RecordedByUserID, u.Name AS RecordedByName
FROM dbo.CompetitorPrice cp
JOIN dbo.Product  p ON p.ProductID = cp.ProductID
JOIN dbo.Region   r ON r.RegionID  = cp.RegionID
LEFT JOIN dbo.Outlet o ON o.OutletID = cp.OutletID
LEFT JOIN dbo.Competitor comp ON comp.CompetitorID = cp.CompetitorID
LEFT JOIN dbo.BusinessGroup bg ON bg.BusinessGroupID = p.BusinessGroupID
JOIN dbo.[User]   u ON u.UserID = cp.RecordedBy
OUTER APPLY (
    SELECT STRING_AGG(col.Name, ', ') WITHIN GROUP (ORDER BY col.SortOrder, col.Name) AS ProductColors
    FROM dbo.ProductColor pc
    JOIN dbo.Color col ON col.ColorID = pc.ColorID
    WHERE pc.ProductID = p.ProductID
) pcols;
GO
