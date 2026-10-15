/*
  Migration 048a: Backup module data before clearing
  Description: Creates backup tables for 5 MIS modules (Weekly Sales, Market Visits, Interviews, Forms & Responses, Photos & Videos)
  Suffix: 20261015 (fixed)
  Run: Before 048_clear_module_data.sql
  Safety: Uses IF NOT EXISTS to prevent accidental overwrites
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    PRINT '=== Migration 048a: Starting backup of module data (suffix 20261015) ===';

    /* 
       Forms & Responses module tables (8 tables)
       Order: parent tables first for referential integrity of backup
    */

    -- 1. FormTemplate (parent of FormVersion, FormAccessRule, FormInvite, FormResponse)
    IF OBJECT_ID('dbo._bak_FormTemplate_20261015', 'U') IS NULL
    BEGIN
        SELECT * INTO dbo._bak_FormTemplate_20261015 FROM dbo.FormTemplate;
        PRINT 'Backed up FormTemplate: ' + CAST(@@ROWCOUNT AS VARCHAR(20)) + ' rows';
    END
    ELSE
    BEGIN
        PRINT 'SKIP: _bak_FormTemplate_20261015 already exists (prevent overwrite)';
    END

    -- 2. FormVersion (references FormTemplate)
    IF OBJECT_ID('dbo._bak_FormVersion_20261015', 'U') IS NULL
    BEGIN
        SELECT * INTO dbo._bak_FormVersion_20261015 FROM dbo.FormVersion;
        PRINT 'Backed up FormVersion: ' + CAST(@@ROWCOUNT AS VARCHAR(20)) + ' rows';
    END
    ELSE
    BEGIN
        PRINT 'SKIP: _bak_FormVersion_20261015 already exists';
    END

    -- 3. FormAccessRule (references FormTemplate)
    IF OBJECT_ID('dbo._bak_FormAccessRule_20261015', 'U') IS NULL
    BEGIN
        SELECT * INTO dbo._bak_FormAccessRule_20261015 FROM dbo.FormAccessRule;
        PRINT 'Backed up FormAccessRule: ' + CAST(@@ROWCOUNT AS VARCHAR(20)) + ' rows';
    END
    ELSE
    BEGIN
        PRINT 'SKIP: _bak_FormAccessRule_20261015 already exists';
    END

    -- 4. FormInvite (references FormTemplate, User)
    IF OBJECT_ID('dbo._bak_FormInvite_20261015', 'U') IS NULL
    BEGIN
        SELECT * INTO dbo._bak_FormInvite_20261015 FROM dbo.FormInvite;
        PRINT 'Backed up FormInvite: ' + CAST(@@ROWCOUNT AS VARCHAR(20)) + ' rows';
    END
    ELSE
    BEGIN
        PRINT 'SKIP: _bak_FormInvite_20261015 already exists';
    END

    -- 5. FormResponse (references FormTemplate, FormVersion, User, Outlet)
    IF OBJECT_ID('dbo._bak_FormResponse_20261015', 'U') IS NULL
    BEGIN
        SELECT * INTO dbo._bak_FormResponse_20261015 FROM dbo.FormResponse;
        PRINT 'Backed up FormResponse: ' + CAST(@@ROWCOUNT AS VARCHAR(20)) + ' rows';
    END
    ELSE
    BEGIN
        PRINT 'SKIP: _bak_FormResponse_20261015 already exists';
    END

    -- 6. ResponseAnswer (references FormResponse)
    IF OBJECT_ID('dbo._bak_ResponseAnswer_20261015', 'U') IS NULL
    BEGIN
        SELECT * INTO dbo._bak_ResponseAnswer_20261015 FROM dbo.ResponseAnswer;
        PRINT 'Backed up ResponseAnswer: ' + CAST(@@ROWCOUNT AS VARCHAR(20)) + ' rows';
    END
    ELSE
    BEGIN
        PRINT 'SKIP: _bak_ResponseAnswer_20261015 already exists';
    END

    -- 7. FormFile (references FormResponse)
    IF OBJECT_ID('dbo._bak_FormFile_20261015', 'U') IS NULL
    BEGIN
        SELECT * INTO dbo._bak_FormFile_20261015 FROM dbo.FormFile;
        PRINT 'Backed up FormFile: ' + CAST(@@ROWCOUNT AS VARCHAR(20)) + ' rows';
    END
    ELSE
    BEGIN
        PRINT 'SKIP: _bak_FormFile_20261015 already exists';
    END

    -- 8. ErasureRequest (references FormResponse, User)
    IF OBJECT_ID('dbo._bak_ErasureRequest_20261015', 'U') IS NULL
    BEGIN
        SELECT * INTO dbo._bak_ErasureRequest_20261015 FROM dbo.ErasureRequest;
        PRINT 'Backed up ErasureRequest: ' + CAST(@@ROWCOUNT AS VARCHAR(20)) + ' rows';
    END
    ELSE
    BEGIN
        PRINT 'SKIP: _bak_ErasureRequest_20261015 already exists';
    END

    /* 
       Interviews module tables (2 tables)
    */

    -- 9. Interview (parent of InterviewQA)
    IF OBJECT_ID('dbo._bak_Interview_20261015', 'U') IS NULL
    BEGIN
        SELECT * INTO dbo._bak_Interview_20261015 FROM dbo.Interview;
        PRINT 'Backed up Interview: ' + CAST(@@ROWCOUNT AS VARCHAR(20)) + ' rows';
    END
    ELSE
    BEGIN
        PRINT 'SKIP: _bak_Interview_20261015 already exists';
    END

    -- 10. InterviewQA (references Interview with CASCADE DELETE)
    IF OBJECT_ID('dbo._bak_InterviewQA_20261015', 'U') IS NULL
    BEGIN
        SELECT * INTO dbo._bak_InterviewQA_20261015 FROM dbo.InterviewQA;
        PRINT 'Backed up InterviewQA: ' + CAST(@@ROWCOUNT AS VARCHAR(20)) + ' rows';
    END
    ELSE
    BEGIN
        PRINT 'SKIP: _bak_InterviewQA_20261015 already exists';
    END

    /* 
       Market Visits module (1 table)
    */

    -- 11. MarketVisitReport
    IF OBJECT_ID('dbo._bak_MarketVisitReport_20261015', 'U') IS NULL
    BEGIN
        SELECT * INTO dbo._bak_MarketVisitReport_20261015 FROM dbo.MarketVisitReport;
        PRINT 'Backed up MarketVisitReport: ' + CAST(@@ROWCOUNT AS VARCHAR(20)) + ' rows';
    END
    ELSE
    BEGIN
        PRINT 'SKIP: _bak_MarketVisitReport_20261015 already exists';
    END

    /* 
       Weekly Sales module (1 table)
    */

    -- 12. WeeklySales
    IF OBJECT_ID('dbo._bak_WeeklySales_20261015', 'U') IS NULL
    BEGIN
        SELECT * INTO dbo._bak_WeeklySales_20261015 FROM dbo.WeeklySales;
        PRINT 'Backed up WeeklySales: ' + CAST(@@ROWCOUNT AS VARCHAR(20)) + ' rows';
    END
    ELSE
    BEGIN
        PRINT 'SKIP: _bak_WeeklySales_20261015 already exists';
    END

    /* 
       Photos & Videos module (1 table)
    */

    -- 13. MultimediaAsset
    IF OBJECT_ID('dbo._bak_MultimediaAsset_20261015', 'U') IS NULL
    BEGIN
        SELECT * INTO dbo._bak_MultimediaAsset_20261015 FROM dbo.MultimediaAsset;
        PRINT 'Backed up MultimediaAsset: ' + CAST(@@ROWCOUNT AS VARCHAR(20)) + ' rows';
    END
    ELSE
    BEGIN
        PRINT 'SKIP: _bak_MultimediaAsset_20261015 already exists';
    END

    COMMIT TRANSACTION;
    PRINT '=== Migration 048a: Backup completed successfully ===';

END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    PRINT '=== Migration 048a: FAILED - ' + ERROR_MESSAGE() + ' ===';
    THROW;
END CATCH;

-- Verification: Report backup row counts
PRINT '=== Verification: Backup row counts ===';
SELECT '_bak_FormTemplate_20261015' AS TableName, COUNT(*) AS [Row_Count] FROM dbo._bak_FormTemplate_20261015
UNION ALL SELECT '_bak_FormVersion_20261015', COUNT(*) FROM dbo._bak_FormVersion_20261015
UNION ALL SELECT '_bak_FormAccessRule_20261015', COUNT(*) FROM dbo._bak_FormAccessRule_20261015
UNION ALL SELECT '_bak_FormInvite_20261015', COUNT(*) FROM dbo._bak_FormInvite_20261015
UNION ALL SELECT '_bak_FormResponse_20261015', COUNT(*) FROM dbo._bak_FormResponse_20261015
UNION ALL SELECT '_bak_ResponseAnswer_20261015', COUNT(*) FROM dbo._bak_ResponseAnswer_20261015
UNION ALL SELECT '_bak_FormFile_20261015', COUNT(*) FROM dbo._bak_FormFile_20261015
UNION ALL SELECT '_bak_ErasureRequest_20261015', COUNT(*) FROM dbo._bak_ErasureRequest_20261015
UNION ALL SELECT '_bak_Interview_20261015', COUNT(*) FROM dbo._bak_Interview_20261015
UNION ALL SELECT '_bak_InterviewQA_20261015', COUNT(*) FROM dbo._bak_InterviewQA_20261015
UNION ALL SELECT '_bak_MarketVisitReport_20261015', COUNT(*) FROM dbo._bak_MarketVisitReport_20261015
UNION ALL SELECT '_bak_WeeklySales_20261015', COUNT(*) FROM dbo._bak_WeeklySales_20261015
UNION ALL SELECT '_bak_MultimediaAsset_20261015', COUNT(*) FROM dbo._bak_MultimediaAsset_20261015
ORDER BY TableName;