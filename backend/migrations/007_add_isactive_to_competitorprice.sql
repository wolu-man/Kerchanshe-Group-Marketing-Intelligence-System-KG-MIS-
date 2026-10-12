IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = N'IsActive' AND Object_ID = Object_ID(N'dbo.CompetitorPrice'))
ALTER TABLE dbo.CompetitorPrice ADD IsActive BIT NOT NULL DEFAULT 1