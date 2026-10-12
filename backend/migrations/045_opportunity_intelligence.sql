-- 045: Opportunity Intelligence — opportunity-type abstraction + configurable
-- product-group taxonomy (Opurtunities_Plan.md §5 opportunity types, §9 product
-- intelligence). Idempotent (safe to re-run). Conventions follow 001 / 030 / 033.
-- Tables: dbo.ProductGroup (new)
-- Columns: dbo.TenderOpportunity(OpportunityType, ProductGroupId,
--          ClassificationMethod, ClassifiedAt)

-- ---------------------------------------------------------------------------
-- 1. dbo.ProductGroup — configurable product taxonomy.
--    Keywords is a JSON array of match phrases; groups are extensible without
--    schema/code redesign (insert a row, classification picks it up).
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.ProductGroup', 'U') IS NULL
CREATE TABLE dbo.ProductGroup
(
    ProductGroupID INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ProductGroup PRIMARY KEY,
    Code           VARCHAR(50) NOT NULL CONSTRAINT UQ_ProductGroup_Code UNIQUE,
    Name           NVARCHAR(100) NOT NULL,
    Keywords       NVARCHAR(MAX) NOT NULL, -- JSON array of keyword phrases
    SortOrder      INT NOT NULL CONSTRAINT DF_ProductGroup_SortOrder DEFAULT 0,
    IsActive       BIT NOT NULL CONSTRAINT DF_ProductGroup_IsActive DEFAULT 1,
    CreatedAt      DATETIME2 NOT NULL CONSTRAINT DF_ProductGroup_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt      DATETIME2 NULL
);
GO

-- ---------------------------------------------------------------------------
-- 2. Classification columns on dbo.TenderOpportunity (all additive: defaults
--    keep every existing row valid, no backfill required by this migration).
-- ---------------------------------------------------------------------------
IF COL_LENGTH('dbo.TenderOpportunity', 'OpportunityType') IS NULL
    ALTER TABLE dbo.TenderOpportunity ADD OpportunityType VARCHAR(30) NOT NULL
        CONSTRAINT DF_TenderOpportunity_OpportunityType DEFAULT 'TENDER';
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE name = 'CK_TenderOpportunity_OpportunityType'
                 AND parent_object_id = OBJECT_ID('dbo.TenderOpportunity'))
    ALTER TABLE dbo.TenderOpportunity WITH CHECK
        ADD CONSTRAINT CK_TenderOpportunity_OpportunityType
        CHECK (OpportunityType IN ('TENDER', 'RFQ', 'BUYER_LEAD', 'TRADE_INTELLIGENCE', 'MARKET_SIGNAL'));
GO

IF COL_LENGTH('dbo.TenderOpportunity', 'ProductGroupId') IS NULL
    ALTER TABLE dbo.TenderOpportunity ADD ProductGroupId INT NULL
        CONSTRAINT FK_TenderOpportunity_ProductGroup REFERENCES dbo.ProductGroup(ProductGroupID);
GO

IF COL_LENGTH('dbo.TenderOpportunity', 'ClassificationMethod') IS NULL
    ALTER TABLE dbo.TenderOpportunity ADD ClassificationMethod VARCHAR(20) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE name = 'CK_TenderOpportunity_ClassificationMethod'
                 AND parent_object_id = OBJECT_ID('dbo.TenderOpportunity'))
    ALTER TABLE dbo.TenderOpportunity WITH CHECK
        ADD CONSTRAINT CK_TenderOpportunity_ClassificationMethod
        CHECK (ClassificationMethod IS NULL OR ClassificationMethod IN ('rule', 'ai', 'manual'));
GO

IF COL_LENGTH('dbo.TenderOpportunity', 'ClassifiedAt') IS NULL
    ALTER TABLE dbo.TenderOpportunity ADD ClassifiedAt DATETIME2 NULL;
GO

-- ---------------------------------------------------------------------------
-- 3. Indexes for the new filters
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TenderOpportunity_OpportunityType' AND object_id = OBJECT_ID('dbo.TenderOpportunity'))
    CREATE INDEX IX_TenderOpportunity_OpportunityType ON dbo.TenderOpportunity(OpportunityType);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TenderOpportunity_ProductGroup' AND object_id = OBJECT_ID('dbo.TenderOpportunity'))
    CREATE INDEX IX_TenderOpportunity_ProductGroup ON dbo.TenderOpportunity(ProductGroupId);
GO

-- ---------------------------------------------------------------------------
-- 4. Seed the initial product taxonomy (Opurtunities_Plan.md §9).
--    Idempotent by Code: existing rows are never overwritten.
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.ProductGroup WHERE Code = 'COFFEE')
    INSERT INTO dbo.ProductGroup (Code, Name, Keywords, SortOrder) VALUES
        ('COFFEE', 'Coffee',
         N'["Ethiopian coffee","Arabica","green coffee","specialty coffee","Yirgacheffe","Sidama","Guji","Harrar","Limu","Jimma","coffee importer","coffee buyer","coffee distributor","roaster"]',
         10);
IF NOT EXISTS (SELECT 1 FROM dbo.ProductGroup WHERE Code = 'BEEF_MEAT')
    INSERT INTO dbo.ProductGroup (Code, Name, Keywords, SortOrder) VALUES
        ('BEEF_MEAT', 'Beef / Meat',
         N'["beef","frozen beef","chilled beef","boneless beef","meat","livestock","cattle","sheep","goat","meat importer","meat buyer"]',
         20);
IF NOT EXISTS (SELECT 1 FROM dbo.ProductGroup WHERE Code = 'PENS_STATIONERY')
    INSERT INTO dbo.ProductGroup (Code, Name, Keywords, SortOrder) VALUES
        ('PENS_STATIONERY', 'Pens / Stationery',
         N'["pens","ballpoint pens","markers","stationery","office supplies","school supplies"]',
         30);
IF NOT EXISTS (SELECT 1 FROM dbo.ProductGroup WHERE Code = 'PLATES_TABLEWARE')
    INSERT INTO dbo.ProductGroup (Code, Name, Keywords, SortOrder) VALUES
        ('PLATES_TABLEWARE', 'Plates / Tableware',
         N'["plates","ceramic plates","porcelain","tableware","dinnerware","kitchenware"]',
         40);
IF NOT EXISTS (SELECT 1 FROM dbo.ProductGroup WHERE Code = 'PAINTS')
    INSERT INTO dbo.ProductGroup (Code, Name, Keywords, SortOrder) VALUES
        ('PAINTS', 'Paints',
         N'["paint","emulsion paint","industrial paint","primer","coating","road-marking paint","construction paint","painting materials"]',
         50);
GO
