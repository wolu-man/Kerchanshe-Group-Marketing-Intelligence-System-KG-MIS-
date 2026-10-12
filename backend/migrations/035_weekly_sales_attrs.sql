-- 035: Snapshot product-entity attributes on each weekly sales line.
-- Attributes are auto-filled from dbo.Product on the form (editable before save),
-- so later product-master edits do not rewrite history. Reads COALESCE back to
-- live Product values for pre-existing rows (NULL snapshot).

IF COL_LENGTH('dbo.WeeklySales', 'ProductColor') IS NULL
    ALTER TABLE dbo.WeeklySales ADD ProductColor NVARCHAR(100) NULL;
GO

IF COL_LENGTH('dbo.WeeklySales', 'ProductSize') IS NULL
    ALTER TABLE dbo.WeeklySales ADD ProductSize NVARCHAR(50) NULL;
GO

IF COL_LENGTH('dbo.WeeklySales', 'ProductCategory') IS NULL
    ALTER TABLE dbo.WeeklySales ADD ProductCategory VARCHAR(100) NULL;
GO

IF COL_LENGTH('dbo.WeeklySales', 'ProductSpecs') IS NULL
    ALTER TABLE dbo.WeeklySales ADD ProductSpecs NVARCHAR(MAX) NULL;
GO
