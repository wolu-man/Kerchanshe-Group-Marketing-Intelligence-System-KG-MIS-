-- 021_fix_sales_region.sql
-- Fix SalesRecord and Customer rows with NULL RegionID

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;

-- Assign regions to customers based on their location
UPDATE dbo.Customer SET RegionID = 1 WHERE CustomerID = 288; -- Addis Beverages -> Addis Ababa
UPDATE dbo.Customer SET RegionID = 2 WHERE CustomerID = 289; -- Oromia Agro -> Oromia
UPDATE dbo.Customer SET RegionID = 1 WHERE CustomerID = 290; -- Shola Retail -> Addis Ababa
UPDATE dbo.Customer SET RegionID = 4 WHERE CustomerID = 291; -- Hawassa Supermarket -> SNNPR
UPDATE dbo.Customer SET RegionID = 3 WHERE CustomerID = 292; -- Bahir Dar Retail -> Amhara
UPDATE dbo.Customer SET RegionID = 1 WHERE CustomerID = 293; -- City Cafe Group -> Addis Ababa;

-- Now assign sales records to their customer's region
UPDATE s SET RegionID = c.RegionID
FROM dbo.SalesRecord s
INNER JOIN dbo.Customer c ON c.CustomerID = s.CustomerID
WHERE s.RegionID IS NULL;

-- Safety net: default any remaining NULL to Addis Ababa
UPDATE dbo.SalesRecord SET RegionID = 1 WHERE RegionID IS NULL;
GO
