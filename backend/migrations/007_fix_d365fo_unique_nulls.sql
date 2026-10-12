-- Fix: UNIQUE constraints on D365FOKey columns reject multiple NULLs.
-- SQL Server treats all NULLs as duplicates in a UNIQUE index.
-- Fix: drop the constraint, create a filtered unique index (WHERE D365FOKey IS NOT NULL).

-- Product
IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ_Product_D365FOKey')
  ALTER TABLE dbo.Product DROP CONSTRAINT UQ_Product_D365FOKey;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_Product_D365FOKey_Filtered')
  CREATE UNIQUE INDEX UQ_Product_D365FOKey_Filtered ON dbo.Product(D365FOKey) WHERE D365FOKey IS NOT NULL;
GO

-- Customer
IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ_Customer_D365FOKey')
  ALTER TABLE dbo.Customer DROP CONSTRAINT UQ_Customer_D365FOKey;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_Customer_D365FOKey_Filtered')
  CREATE UNIQUE INDEX UQ_Customer_D365FOKey_Filtered ON dbo.Customer(D365FOKey) WHERE D365FOKey IS NOT NULL;
GO

-- SalesRecord
IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ_SalesRecord_D365FOKey')
  ALTER TABLE dbo.SalesRecord DROP CONSTRAINT UQ_SalesRecord_D365FOKey;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_SalesRecord_D365FOKey_Filtered')
  CREATE UNIQUE INDEX UQ_SalesRecord_D365FOKey_Filtered ON dbo.SalesRecord(D365FOKey) WHERE D365FOKey IS NOT NULL;
GO
