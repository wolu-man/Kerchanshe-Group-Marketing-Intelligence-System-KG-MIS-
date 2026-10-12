-- =============================================================================
-- KG-MIS  Migration 005 - Remove unassigned products no longer needed
-- ---------------------------------------------------------------------------
-- Idempotent (safe to re-run).
-- ---------------------------------------------------------------------------
USE KG_MIS;
GO

-- ---------------------------------------------------------------------------
-- 1. Delete SalesRecord entries referencing these products (to avoid FK conflict)
-- ---------------------------------------------------------------------------
DELETE FROM dbo.SalesRecord
WHERE ProductID IN (
    SELECT p.ProductID
    FROM dbo.Product p
    WHERE p.ProductCode IN (
        'SPC-SHM-500G',
        'GRN-SOR-50KG',
        'GRN-TEF-50KG',
        'TEA-GR-250G',
        'Black Tea 500g',
        'SPC-BER-500G'
    ) AND p.BusinessGroupID IS NULL
);
GO

-- ---------------------------------------------------------------------------
-- 2. Delete products no longer needed (where BusinessGroupID IS NULL)
-- ---------------------------------------------------------------------------
DELETE FROM dbo.Product
WHERE ProductCode IN (
    'SPC-SHM-500G',
    'GRN-SOR-50KG',
    'GRN-TEF-50KG',
    'TEA-GR-250G',
    'Black Tea 500g',
    'SPC-BER-500G'
) AND BusinessGroupID IS NULL;
GO

-- ---------------------------------------------------------------------------
-- 3. Register migration
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.__Migrations WHERE Name = '005_remove_unassigned_products.sql')
    INSERT INTO dbo.__Migrations (Name) VALUES ('005_remove_unassigned_products.sql');
GO