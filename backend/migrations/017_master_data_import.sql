-- 017_master_data_import.sql
-- Add columns needed for master data import from Excel files

-- Customer table: add address, area, star rating, product interest
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Customer') AND name = 'Address')
  ALTER TABLE dbo.Customer ADD Address NVARCHAR(500) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Customer') AND name = 'Area')
  ALTER TABLE dbo.Customer ADD Area NVARCHAR(200) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Customer') AND name = 'StarRating')
  ALTER TABLE dbo.Customer ADD StarRating VARCHAR(20) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Customer') AND name = 'ProductInterest')
  ALTER TABLE dbo.Customer ADD ProductInterest NVARCHAR(200) NULL;

-- Product table: add color, size, weight, and multiple price tiers
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Product') AND name = 'Color')
  ALTER TABLE dbo.Product ADD Color NVARCHAR(100) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Product') AND name = 'Size')
  ALTER TABLE dbo.Product ADD Size NVARCHAR(50) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Product') AND name = 'WeightKg')
  ALTER TABLE dbo.Product ADD WeightKg DECIMAL(10, 4) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Product') AND name = 'AgentPriceBeforeVat')
  ALTER TABLE dbo.Product ADD AgentPriceBeforeVat DECIMAL(18, 2) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Product') AND name = 'AgentPriceAfterVat')
  ALTER TABLE dbo.Product ADD AgentPriceAfterVat DECIMAL(18, 2) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Product') AND name = 'WholesalePriceBeforeVat')
  ALTER TABLE dbo.Product ADD WholesalePriceBeforeVat DECIMAL(18, 2) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Product') AND name = 'WholesalePriceAfterVat')
  ALTER TABLE dbo.Product ADD WholesalePriceAfterVat DECIMAL(18, 2) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Product') AND name = 'KeyAccountPriceBeforeVat')
  ALTER TABLE dbo.Product ADD KeyAccountPriceBeforeVat DECIMAL(18, 2) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Product') AND name = 'KeyAccountPriceAfterVat')
  ALTER TABLE dbo.Product ADD KeyAccountPriceAfterVat DECIMAL(18, 2) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Product') AND name = 'BidPriceBeforeVat')
  ALTER TABLE dbo.Product ADD BidPriceBeforeVat DECIMAL(18, 2) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Product') AND name = 'BidPriceAfterVat')
  ALTER TABLE dbo.Product ADD BidPriceAfterVat DECIMAL(18, 2) NULL;
