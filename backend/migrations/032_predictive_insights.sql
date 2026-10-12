-- 032: Predictive Insights — persisted latest prediction per scope key
-- plus SystemConfig knobs for cache TTL, retention and the nightly refresh.

IF OBJECT_ID('dbo.PredictiveInsight', 'U') IS NULL
CREATE TABLE dbo.PredictiveInsight
(
  PredictiveInsightID INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PredictiveInsight PRIMARY KEY,
  ScopeKey            VARCHAR(200) NOT NULL,
  Module              VARCHAR(40) NOT NULL,
  Metric              VARCHAR(60) NOT NULL,
  Granularity         VARCHAR(10) NOT NULL,
  Horizon             INT NOT NULL,
  Confidence          VARCHAR(20) NOT NULL,
  SufficientData      BIT NOT NULL CONSTRAINT DF_PredictiveInsight_SufficientData DEFAULT 1,
  Model               VARCHAR(80) NOT NULL,
  ModelVersion        VARCHAR(40) NOT NULL,
  ResultJson          NVARCHAR(MAX) NOT NULL,
  GeneratedAt         DATETIME2 NOT NULL CONSTRAINT DF_PredictiveInsight_GeneratedAt DEFAULT SYSUTCDATETIME(),
  ExpiresAt           DATETIME2 NULL,
  CreatedBy           INT NULL CONSTRAINT FK_PredictiveInsight_User FOREIGN KEY REFERENCES dbo.[User](UserID),
  CONSTRAINT CK_PredictiveInsight_Confidence CHECK (Confidence IN ('High', 'Moderate', 'Low', 'Insufficient')),
  CONSTRAINT CK_PredictiveInsight_Granularity CHECK (Granularity IN ('day', 'week', 'month'))
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PredictiveInsight_Lookup' AND object_id = OBJECT_ID('dbo.PredictiveInsight'))
  CREATE INDEX IX_PredictiveInsight_Lookup ON dbo.PredictiveInsight(ScopeKey, Module, Metric, Granularity, GeneratedAt);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.SystemConfig WHERE ConfigKey = 'prediction.cacheTtlMinutes')
  INSERT INTO dbo.SystemConfig (ConfigKey, ConfigValue) VALUES ('prediction.cacheTtlMinutes', '60');

IF NOT EXISTS (SELECT 1 FROM dbo.SystemConfig WHERE ConfigKey = 'prediction.retentionDays')
  INSERT INTO dbo.SystemConfig (ConfigKey, ConfigValue) VALUES ('prediction.retentionDays', '90');

IF NOT EXISTS (SELECT 1 FROM dbo.SystemConfig WHERE ConfigKey = 'prediction.enabled')
  INSERT INTO dbo.SystemConfig (ConfigKey, ConfigValue) VALUES ('prediction.enabled', '1');
GO
