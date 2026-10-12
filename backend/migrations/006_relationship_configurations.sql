-- =============================================================================
-- KG-MIS  Migration 006 - Relationship & Dropdown Configuration
-- ---------------------------------------------------------------------------
-- Purpose: Create generic relationship configuration system that allows
-- administrators to define parent→child relationships between master data
-- entities (BusinessGroup, Region, Outlet, Product, Customer, etc.)
-- without hardcoding database tables for each combination.
-- Idempotent (safe to re-run).
-- ---------------------------------------------------------------------------
USE KG_MIS;
GO

-- ============================================================================
-- 1. Relationship configurations table
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM dbo.__Migrations WHERE Name = '006_relationship_configurations.sql')
BEGIN

    CREATE TABLE dbo.RelationshipConfiguration (
        ConfigurationID INT IDENTITY(1,1) PRIMARY KEY,
        ParentEntity VARCHAR(100) NOT NULL,
        ChildEntity VARCHAR(100) NOT NULL,
        RelationshipType VARCHAR(20) NOT NULL,
        IsActive BIT DEFAULT 1,
        Required BIT DEFAULT 1,
        DisplayOrder INT DEFAULT 0,
        CreatedAt DATETIME2 DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2 DEFAULT SYSUTCDATETIME()
    );

    -- Register migration name first (idempotent guard)
    INSERT INTO dbo.__Migrations (Name) VALUES ('006_relationship_configurations.sql');

    -- Insert default pre-configured relationships (optional; admins can modify/extend)
    INSERT INTO dbo.RelationshipConfiguration (ParentEntity, ChildEntity, RelationshipType, Required, DisplayOrder) VALUES
    ('BusinessGroup', 'Region', 'One-to-Many', 1, 1),
    ('BusinessGroup', 'Outlet', 'One-to-Many', 1, 2),
    ('BusinessGroup', 'Product', 'One-to-Many', 1, 3),
    ('Region',       'Outlet', 'One-to-Many', 1, 1),
    ('Region',       'Customer', 'One-to-Many', 1, 2),
    ('Outlet',       'Customer', 'One-to-Many', 1, 1),
    ('BusinessGroup', 'Customer', 'One-to-Many', 1, 4);

END
GO

-- ============================================================================
-- 2. Relationship items table
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM dbo.__Migrations WHERE Name = '006_relationship_configurations.sql')
BEGIN

    -- Note: The tables were already created in the first block above.
    -- This block populates initial RelationshipItem rows for the default configs.
    -- Admins can add/remove items via the admin UI later.

    INSERT INTO dbo.RelationshipItem (ConfigurationID, ParentEntityValue, ChildEntity, ChildEntityID, DisplayName, DisplayOrder, IsActive)
    SELECT rc.ConfigurationID,
           CAST(bg.Code + ':' + CAST(bg.BusinessGroupID AS VARCHAR) AS VARCHAR(100)),  -- ParentEntityValue format: 'Code:ID'
           rc.ChildEntity,
           NULL, -- ChildEntityID will be populated by admin UI or raw SQL; kept nullable initially
           rc.ChildEntity + ' # ' + CAST(bg.BusinessGroupID AS VARCHAR), -- DisplayName placeholder
           0,
           1
    FROM dbo.RelationshipConfiguration rc
    CROSS JOIN dbo.BusinessGroup bg
    WHERE rc.IsActive = 1;

    -- Register migration name (already inserted above; idempotent)
    INSERT INTO dbo.__Migrations (Name) VALUES ('006_relationship_configurations.sql');
END
GO