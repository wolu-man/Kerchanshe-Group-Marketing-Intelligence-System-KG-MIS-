-- =============================================================================
-- Migration 050 - AI Renewal Configuration
-- Adds SystemConfig keys for AI provider key rotation and renewal tracking.
-- =============================================================================

USE KG_MIS;
GO

-- AI Rotation Configuration
IF NOT EXISTS (SELECT 1 FROM dbo.SystemConfig WHERE ConfigKey = 'ai.rotation.enabled')
    INSERT INTO dbo.SystemConfig (ConfigKey, ConfigValue) VALUES ('ai.rotation.enabled', '0');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.SystemConfig WHERE ConfigKey = 'ai.rotation.intervalDays')
    INSERT INTO dbo.SystemConfig (ConfigKey, ConfigValue) VALUES ('ai.rotation.intervalDays', '90');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.SystemConfig WHERE ConfigKey = 'ai.rotation.nextRun')
    INSERT INTO dbo.SystemConfig (ConfigKey, ConfigValue) VALUES ('ai.rotation.nextRun', '');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.SystemConfig WHERE ConfigKey = 'ai.rotation.provider')
    INSERT INTO dbo.SystemConfig (ConfigKey, ConfigValue) VALUES ('ai.rotation.provider', '');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.SystemConfig WHERE ConfigKey = 'ai.rotation.due')
    INSERT INTO dbo.SystemConfig (ConfigKey, ConfigValue) VALUES ('ai.rotation.due', '0');
GO

-- Note: Actual API keys (GEMINI_API_KEY, GROQ_API_KEY) are stored in .env file
-- or secret manager in production, NOT in SystemConfig table for security.