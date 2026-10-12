-- 011: Add rejection support to Interview
-- Adds RejectedBy, RejectedAt, RejectionReason columns

IF COL_LENGTH('dbo.Interview', 'RejectedBy') IS NULL
    ALTER TABLE dbo.Interview ADD RejectedBy INT NULL;
GO

IF COL_LENGTH('dbo.Interview', 'RejectedAt') IS NULL
    ALTER TABLE dbo.Interview ADD RejectedAt DATETIME2 NULL;
GO

IF COL_LENGTH('dbo.Interview', 'RejectionReason') IS NULL
    ALTER TABLE dbo.Interview ADD RejectionReason NVARCHAR(MAX) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Interview_RejectedBy')
    ALTER TABLE dbo.Interview ADD CONSTRAINT FK_Interview_RejectedBy
        FOREIGN KEY (RejectedBy) REFERENCES dbo.[User](UserID);
GO
