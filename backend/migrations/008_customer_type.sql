-- Migration 008: CustomerType reference table + FK on Customer
-- Adds a manageable customer type dropdown (replaces hardcoded values).

-- CustomerType master table
IF OBJECT_ID('dbo.CustomerType', 'U') IS NULL
CREATE TABLE dbo.CustomerType
(
    CustomerTypeID INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CustomerType PRIMARY KEY,
    Name           NVARCHAR(50) NOT NULL CONSTRAINT UQ_CustomerType_Name UNIQUE,
    IsActive       BIT NOT NULL CONSTRAINT DF_CustomerType_IsActive DEFAULT 1,
    CreatedAt      DATETIME2 NOT NULL CONSTRAINT DF_CustomerType_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt      DATETIME2 NULL
);
GO

-- Seed default customer types
IF NOT EXISTS (SELECT 1 FROM dbo.CustomerType)
BEGIN
    SET IDENTITY_INSERT dbo.CustomerType ON;
    INSERT INTO dbo.CustomerType (CustomerTypeID, Name) VALUES
        (1, 'Key Account'),
        (2, 'Bid'),
        (3, 'Shop'),
        (4, 'Agent'),
        (5, 'Distributor'),
        (6, 'Retailer'),
        (7, 'End User');
    SET IDENTITY_INSERT dbo.CustomerType OFF;
END
GO

-- Add CustomerTypeID FK column to Customer table
IF COL_LENGTH('dbo.Customer', 'CustomerTypeID') IS NULL
BEGIN
    ALTER TABLE dbo.Customer ADD CustomerTypeID INT NULL
        CONSTRAINT FK_Customer_CustomerType FOREIGN KEY REFERENCES dbo.CustomerType(CustomerTypeID);
    CREATE INDEX IX_Customer_CustomerType ON dbo.Customer(CustomerTypeID) WHERE CustomerTypeID IS NOT NULL;
END
GO

-- Migrate existing free-text CustomerType values to FK references
UPDATE c SET c.CustomerTypeID = ct.CustomerTypeID
FROM dbo.Customer c
JOIN dbo.CustomerType ct ON ct.Name = c.CustomerType
WHERE c.CustomerTypeID IS NULL AND c.CustomerType IS NOT NULL;
GO
