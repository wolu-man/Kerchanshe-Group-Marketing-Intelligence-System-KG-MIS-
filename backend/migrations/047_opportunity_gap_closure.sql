-- =============================================================================
-- 047: Opportunity gap closure (Phase F of Opurtunities_Plan.md)
--
--   §6/§8/§19  Region + Confidence + DataQuality on TenderOpportunity
--   §8         AiGapFill (fieldBasis / businessFit / classification suggestions)
--   §9/§17     business-unit mapping on ProductGroup (verifiable seeds only)
--   §17        extended interest-profile dimensions (organizations, product
--              groups, types, business units) for relevance scoring v2
--   §17        source quality score for relevance scoring
--
-- Backfill formulas mirror backend/src/modules/tenders/quality.ts.
-- =============================================================================
IF COL_LENGTH('dbo.TenderOpportunity', 'Region') IS NULL
    ALTER TABLE dbo.TenderOpportunity ADD Region NVARCHAR(100) NULL;
IF COL_LENGTH('dbo.TenderOpportunity', 'Confidence') IS NULL
    ALTER TABLE dbo.TenderOpportunity ADD Confidence TINYINT NULL;
IF COL_LENGTH('dbo.TenderOpportunity', 'DataQuality') IS NULL
    ALTER TABLE dbo.TenderOpportunity ADD DataQuality VARCHAR(20) NULL;
IF COL_LENGTH('dbo.TenderOpportunity', 'AiGapFill') IS NULL
    ALTER TABLE dbo.TenderOpportunity ADD AiGapFill NVARCHAR(MAX) NULL;
GO

-- Confidence backfill: field-presence score 0-100 (see quality.ts).
-- org 20 + deadline 20 + publication 15 + country 10 + sector 10 + value 15 + description>=200 10 = 100.
UPDATE t
SET Confidence = x.c,
    DataQuality = CASE WHEN x.c >= 70 THEN 'Complete'
                       WHEN x.c >= 40 THEN 'Partial'
                       ELSE 'Sparse' END
FROM dbo.TenderOpportunity t
CROSS APPLY (
    SELECT CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(Organization, ''))), '') IS NOT NULL THEN 20 ELSE 0 END
         + CASE WHEN DeadlineDate IS NOT NULL THEN 20 ELSE 0 END
         + CASE WHEN PublicationDate IS NOT NULL THEN 15 ELSE 0 END
         + CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(Country, ''))), '') IS NOT NULL THEN 10 ELSE 0 END
         + CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(Sector, ''))), '') IS NOT NULL THEN 10 ELSE 0 END
         + CASE WHEN EstimatedValue IS NOT NULL THEN 15 ELSE 0 END
         + CASE WHEN LEN(ISNULL(Description, '')) >= 200 THEN 10 ELSE 0 END AS c
) x
WHERE t.Confidence IS NULL;
GO

-- ProductGroup -> business unit (§17 business-unit factor).
-- Seeds verified from 003_mi_scope: KCC='Kerchanshe Coffee', BPN='Buna Pen'
-- (writing instruments), BPL='Buna Plate'. BEEF_MEAT / PAINTS stay NULL for
-- admin assignment (no verifiable mapping exists).
IF COL_LENGTH('dbo.ProductGroup', 'BusinessGroupCode') IS NULL
    ALTER TABLE dbo.ProductGroup ADD BusinessGroupCode VARCHAR(20) NULL;
GO
UPDATE dbo.ProductGroup SET BusinessGroupCode = 'KCC' WHERE Code = 'COFFEE'         AND BusinessGroupCode IS NULL;
UPDATE dbo.ProductGroup SET BusinessGroupCode = 'BPN' WHERE Code = 'PENS_STATIONERY' AND BusinessGroupCode IS NULL;
UPDATE dbo.ProductGroup SET BusinessGroupCode = 'BPL' WHERE Code = 'PLATES_TABLEWARE' AND BusinessGroupCode IS NULL;
GO

-- Interest-profile dimensions for relevance scoring v2 (all JSON arrays).
IF COL_LENGTH('dbo.TenderInterestProfile', 'Organizations') IS NULL
    ALTER TABLE dbo.TenderInterestProfile ADD Organizations NVARCHAR(MAX) NULL;
IF COL_LENGTH('dbo.TenderInterestProfile', 'ProductGroupCodes') IS NULL
    ALTER TABLE dbo.TenderInterestProfile ADD ProductGroupCodes NVARCHAR(MAX) NULL;
IF COL_LENGTH('dbo.TenderInterestProfile', 'Types') IS NULL
    ALTER TABLE dbo.TenderInterestProfile ADD Types NVARCHAR(MAX) NULL;
IF COL_LENGTH('dbo.TenderInterestProfile', 'BusinessGroupCodes') IS NULL
    ALTER TABLE dbo.TenderInterestProfile ADD BusinessGroupCodes NVARCHAR(MAX) NULL;
GO

-- Source quality score (0-100) used by relevance scoring (§17).
IF COL_LENGTH('dbo.TenderSource', 'QualityScore') IS NULL
    ALTER TABLE dbo.TenderSource ADD QualityScore INT NOT NULL CONSTRAINT DF_TenderSource_QualityScore DEFAULT(70);
GO
