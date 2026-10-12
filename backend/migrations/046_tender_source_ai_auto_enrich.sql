-- =============================================================================
-- 046: Per-source AI auto-enrichment opt-in (Phase E of Opportunity Intelligence)
--
-- dbo.TenderSource.AiAutoEnrich — when 1, collection enriches each newly
-- inserted opportunity from this source (AI summary + structured extraction).
-- Default 0 (opt-in only). Collection never depends on AI: enrichment runs
-- after a successful insert inside try/catch and cannot change the run status.
-- =============================================================================
IF COL_LENGTH('dbo.TenderSource', 'AiAutoEnrich') IS NULL
BEGIN
    ALTER TABLE dbo.TenderSource
        ADD AiAutoEnrich BIT NOT NULL CONSTRAINT DF_TenderSource_AiAutoEnrich DEFAULT(0);
END
GO
