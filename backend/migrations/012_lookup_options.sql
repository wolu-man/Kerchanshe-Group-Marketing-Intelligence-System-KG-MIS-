-- 012: Create LookupOption table for configurable dropdown menus
-- Centralizes VisitType, StockLevel, RespondentType, Sentiment options

IF OBJECT_ID('dbo.LookupOption', 'U') IS NULL
CREATE TABLE dbo.LookupOption
(
  LookupID    INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_LookupOption PRIMARY KEY,
  Category    VARCHAR(50) NOT NULL,
  Value       VARCHAR(100) NOT NULL,
  SortOrder   INT NOT NULL CONSTRAINT DF_LookupOption_SortOrder DEFAULT 0,
  IsActive    BIT NOT NULL CONSTRAINT DF_LookupOption_IsActive DEFAULT 1,
  CreatedAt   DATETIME2 NOT NULL CONSTRAINT DF_LookupOption_CreatedAt DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_LookupOption_Category_Value UNIQUE (Category, Value)
);
GO

-- Seed: VisitType
IF NOT EXISTS (SELECT 1 FROM dbo.LookupOption WHERE Category = 'VisitType' AND Value = 'Routine')
  INSERT INTO dbo.LookupOption (Category, Value, SortOrder) VALUES
    ('VisitType', 'Routine', 1),
    ('VisitType', 'Follow-up', 2),
    ('VisitType', 'New Product Launch', 3),
    ('VisitType', 'Promotion Check', 4),
    ('VisitType', 'Compliance', 5),
    ('VisitType', 'Other', 6);
GO

-- Seed: StockLevel
IF NOT EXISTS (SELECT 1 FROM dbo.LookupOption WHERE Category = 'StockLevel' AND Value = 'In Stock')
  INSERT INTO dbo.LookupOption (Category, Value, SortOrder) VALUES
    ('StockLevel', 'In Stock', 1),
    ('StockLevel', 'Low', 2),
    ('StockLevel', 'Out of Stock', 3),
    ('StockLevel', 'Overstock', 4);
GO

-- Seed: RespondentType
IF NOT EXISTS (SELECT 1 FROM dbo.LookupOption WHERE Category = 'RespondentType' AND Value = 'Customer')
  INSERT INTO dbo.LookupOption (Category, Value, SortOrder) VALUES
    ('RespondentType', 'Customer', 1),
    ('RespondentType', 'Distributor', 2),
    ('RespondentType', 'Retailer', 3),
    ('RespondentType', 'Agent', 4),
    ('RespondentType', 'Other', 5);
GO

-- Seed: Sentiment
IF NOT EXISTS (SELECT 1 FROM dbo.LookupOption WHERE Category = 'Sentiment' AND Value = 'Positive')
  INSERT INTO dbo.LookupOption (Category, Value, SortOrder) VALUES
    ('Sentiment', 'Positive', 1),
    ('Sentiment', 'Neutral', 2),
    ('Sentiment', 'Negative', 3);
GO
