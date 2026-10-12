-- 010: Add rejection support to MarketVisitReport
-- Adds RejectedBy, RejectedAt, RejectionReason columns

IF COL_LENGTH('dbo.MarketVisitReport', 'RejectedBy') IS NULL
    ALTER TABLE dbo.MarketVisitReport ADD RejectedBy INT NULL;
GO

IF COL_LENGTH('dbo.MarketVisitReport', 'RejectedAt') IS NULL
    ALTER TABLE dbo.MarketVisitReport ADD RejectedAt DATETIME2 NULL;
GO

IF COL_LENGTH('dbo.MarketVisitReport', 'RejectionReason') IS NULL
    ALTER TABLE dbo.MarketVisitReport ADD RejectionReason NVARCHAR(MAX) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_MarketVisitReport_RejectedBy')
    ALTER TABLE dbo.MarketVisitReport ADD CONSTRAINT FK_MarketVisitReport_RejectedBy
        FOREIGN KEY (RejectedBy) REFERENCES dbo.[User](UserID);
GO
