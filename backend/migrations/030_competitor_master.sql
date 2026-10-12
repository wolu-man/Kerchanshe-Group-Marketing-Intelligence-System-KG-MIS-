-- 030: Competitor Master — CompetitorProduct table, unique competitor names,
-- and PriceGapAlert linkage to master price rows.
-- Admin/Competitors is the single master source for competitor product/price data;
-- Price Difference and Price Difference % are computed on read (never stored).

-- ---------------------------------------------------------------------------
-- 1. dbo.CompetitorProduct (competitor product/model master with price)
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.CompetitorProduct', 'U') IS NULL
CREATE TABLE dbo.CompetitorProduct
(
    CompetitorProductID INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CompetitorProduct PRIMARY KEY,
    CompetitorID        INT NOT NULL CONSTRAINT FK_CompetitorProduct_Competitor FOREIGN KEY REFERENCES dbo.Competitor(CompetitorID),
    OurProductID        INT NULL     CONSTRAINT FK_CompetitorProduct_Product FOREIGN KEY REFERENCES dbo.Product(ProductID),
    ProductName         NVARCHAR(200) NOT NULL,          -- competitor product/model name
    Category            NVARCHAR(100) NOT NULL,
    Price               DECIMAL(18,2) NOT NULL,          -- competitor price (ETB)
    PriceMax            DECIMAL(18,2) NULL,              -- upper bound when source reports a range
    EffectiveDate       DATE NULL,
    Status              VARCHAR(20) NOT NULL CONSTRAINT DF_CompetitorProduct_Status DEFAULT 'Active', -- Active / Inactive / Expired
    Notes               NVARCHAR(1000) NULL,
    Specifications      NVARCHAR(MAX) NULL,              -- JSON (same convention as Product.Specifications)
    CreatedAt           DATETIME2 NOT NULL CONSTRAINT DF_CompetitorProduct_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt           DATETIME2 NULL,
    CONSTRAINT UQ_CompetitorProduct_Competitor_Name UNIQUE (CompetitorID, ProductName)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CompetitorProduct_Category' AND object_id = OBJECT_ID('dbo.CompetitorProduct'))
    CREATE INDEX IX_CompetitorProduct_Category ON dbo.CompetitorProduct(Category);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CompetitorProduct_Status' AND object_id = OBJECT_ID('dbo.CompetitorProduct'))
    CREATE INDEX IX_CompetitorProduct_Status ON dbo.CompetitorProduct(Status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CompetitorProduct_OurProduct' AND object_id = OBJECT_ID('dbo.CompetitorProduct'))
    CREATE INDEX IX_CompetitorProduct_OurProduct ON dbo.CompetitorProduct(OurProductID);
GO

-- ---------------------------------------------------------------------------
-- 2. Unique competitor names (case-insensitive via DB collation; filtered so
--    soft-deleted names can be reused). Verified: no duplicate names exist.
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_Competitor_Name' AND object_id = OBJECT_ID('dbo.Competitor'))
    CREATE UNIQUE NONCLUSTERED INDEX UQ_Competitor_Name ON dbo.Competitor(Name) WHERE IsActive = 1;
GO

-- ---------------------------------------------------------------------------
-- 3. PriceGapAlert: link alerts to master price rows (CompetitorProduct)
-- ---------------------------------------------------------------------------
IF COL_LENGTH('dbo.PriceGapAlert', 'CompetitorProductID') IS NULL
    ALTER TABLE dbo.PriceGapAlert ADD CompetitorProductID INT NULL
        CONSTRAINT FK_PriceGapAlert_CompetitorProduct FOREIGN KEY REFERENCES dbo.CompetitorProduct(CompetitorProductID);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PriceGapAlert_CompetitorProduct' AND object_id = OBJECT_ID('dbo.PriceGapAlert'))
    CREATE INDEX IX_PriceGapAlert_CompetitorProduct ON dbo.PriceGapAlert(CompetitorProductID);
GO

-- PriceID becomes nullable (master alerts reference CompetitorProductID instead).
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PriceGapAlert') AND name = 'PriceID' AND is_nullable = 0)
BEGIN
    IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_PriceGapAlert_Price' AND parent_object_id = OBJECT_ID('dbo.PriceGapAlert'))
        ALTER TABLE dbo.PriceGapAlert DROP CONSTRAINT FK_PriceGapAlert_Price;
    ALTER TABLE dbo.PriceGapAlert ALTER COLUMN PriceID INT NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_PriceGapAlert_Price' AND parent_object_id = OBJECT_ID('dbo.PriceGapAlert'))
        ALTER TABLE dbo.PriceGapAlert ADD CONSTRAINT FK_PriceGapAlert_Price
            FOREIGN KEY (PriceID) REFERENCES dbo.CompetitorPrice(PriceID);
END
GO
