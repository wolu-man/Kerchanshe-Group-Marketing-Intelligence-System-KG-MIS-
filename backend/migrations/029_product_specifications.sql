-- 029: Add Specifications JSON column to Product table
-- For storing product-specific attributes/specifications as JSON

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Product') AND name = 'Specifications')
  ALTER TABLE dbo.Product ADD Specifications NVARCHAR(MAX) NULL;
GO

-- Add comment for documentation
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'JSON object storing product-specific specifications (e.g., vehicle specs for Geely cars)', 
    @level0type = N'SCHEMA', @level0name = N'dbo', 
    @level1type = N'TABLE', @level1name = N'Product', 
    @level2type = N'COLUMN', @level2name = N'Specifications';
GO