-- 022_delete_non_core_products.sql
-- Permanently remove non-core products: Green Tea, Berbere Spice, Shiro Powder, Sorghum, Unwashed Coffee, Washed Coffee
-- Teff Grain does not exist in the database, so it is skipped.

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;

-- Delete SalesRecord dependencies first
DELETE FROM dbo.SalesRecord WHERE ProductID IN (
  SELECT ProductID FROM dbo.Product
  WHERE Name IN ('Green Tea 250g', 'Berbere Spice 500g', 'Shiro Powder 500g', 'Sorghum 50kg', 'Unwashed Coffee 500g', 'Washed Coffee 500g')
);

-- Delete any ProductPrice dependencies
DELETE FROM dbo.ProductPrice WHERE ProductID IN (
  SELECT ProductID FROM dbo.Product
  WHERE Name IN ('Green Tea 250g', 'Berbere Spice 500g', 'Shiro Powder 500g', 'Sorghum 50kg', 'Unwashed Coffee 500g', 'Washed Coffee 500g')
);

-- Delete the products themselves
DELETE FROM dbo.Product
WHERE Name IN ('Green Tea 250g', 'Berbere Spice 500g', 'Shiro Powder 500g', 'Sorghum 50kg', 'Unwashed Coffee 500g', 'Washed Coffee 500g');
GO
