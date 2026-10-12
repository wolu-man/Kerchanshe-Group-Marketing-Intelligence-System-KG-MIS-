-- Migration 009: ProductPrice (per customer-type pricing) + CompetitorPrice.CustomerTypeID
-- Supports different unit prices per product per customer type.

-- ProductPrice table: stores per-type pricing for each product
IF OBJECT_ID('dbo.ProductPrice', 'U') IS NULL
CREATE TABLE dbo.ProductPrice
(
    ProductPriceID INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ProductPrice PRIMARY KEY,
    ProductID      INT NOT NULL CONSTRAINT FK_ProductPrice_Product FOREIGN KEY REFERENCES dbo.Product(ProductID),
    CustomerTypeID INT NOT NULL CONSTRAINT FK_ProductPrice_CustomerType FOREIGN KEY REFERENCES dbo.CustomerType(CustomerTypeID),
    UnitPrice      DECIMAL(18,2) NOT NULL,
    CreatedAt      DATETIME2 NOT NULL CONSTRAINT DF_ProductPrice_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt      DATETIME2 NULL,
    CONSTRAINT UQ_ProductPrice_Product_CustomerType UNIQUE (ProductID, CustomerTypeID)
);
GO

-- Add CustomerTypeID to CompetitorPrice so gap calculation knows which type price to compare
IF COL_LENGTH('dbo.CompetitorPrice', 'CustomerTypeID') IS NULL
BEGIN
    ALTER TABLE dbo.CompetitorPrice ADD CustomerTypeID INT NULL
        CONSTRAINT FK_CompetitorPrice_CustomerType FOREIGN KEY REFERENCES dbo.CustomerType(CustomerTypeID);
END
GO
