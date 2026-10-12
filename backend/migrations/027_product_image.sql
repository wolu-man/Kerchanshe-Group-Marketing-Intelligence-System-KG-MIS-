-- 027: Add ImageUrl column to Product for catalogue photos
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Product') AND name = 'ImageUrl')
  ALTER TABLE dbo.Product ADD ImageUrl NVARCHAR(500) NULL;
GO
