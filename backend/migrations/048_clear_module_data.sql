/*
  Migration 048: Clear module data (DELETE + RESEED)
  Description: Deletes all data from 5 MIS modules in FK-safe order, then reseeds identity columns to 1
  Modules: Weekly Sales, Market Visits, Interviews, Forms & Responses, Photos & Videos
  Tables: 19 tables total (13 from initial + 6 from phase2)
  Run: AFTER 048a_backup_module_data.sql and backup verification
  Safety: SET XACT_ABORT ON, TRY/CATCH with rollback, no FK drops
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;

BEGIN TRY
    BEGIN TRANSACTION;

    PRINT '=== Migration 048: Starting data clearance for 5 modules (19 tables) ===';

    /* 
       Phase 1: Forms & Responses (19 tables) - children first
       Order: ResponseAnswer -> FormFile -> FormAnomalyFlag -> ResponseRevision -> FormResponse -> 
              FormVersion -> FormAccessRule/FormInvite/FormConsentHistory/FormCrossReport/FormShare/FormReportAccess -> 
              FormTemplate -> FormCrossReport -> FormShare -> FormAnomalyFlag
       Note: FormAnomalyFlag references BOTH FormResponse and FormTemplate - delete after FormResponse but before FormTemplate
       Note: ResponseRevision references FormResponse AND FormVersion - delete after both
       Note: FormShare references FormCrossReport - delete FormShare before FormCrossReport
    */

    -- 1. ResponseAnswer (references FormResponse)
    PRINT 'Clearing ResponseAnswer...';
    DELETE FROM dbo.ResponseAnswer;
    PRINT '  Deleted ' + CAST(@@ROWCOUNT AS VARCHAR(20)) + ' rows';

    -- 2. FormFile (references FormResponse)
    PRINT 'Clearing FormFile...';
    DELETE FROM dbo.FormFile;
    PRINT '  Deleted ' + CAST(@@ROWCOUNT AS VARCHAR(20)) + ' rows';

    -- 3. FormAnomalyFlag - first pass (references FormResponse) - must be before FormResponse
    PRINT 'Clearing FormAnomalyFlag (ResponseID references)...';
    DELETE FROM dbo.FormAnomalyFlag;
    PRINT '  Deleted ' + CAST(@@ROWCOUNT AS VARCHAR(20)) + ' rows';

    -- 4. ErasureRequest (references FormResponse) - must be before FormResponse
    PRINT 'Clearing ErasureRequest...';
    DELETE FROM dbo.ErasureRequest;
    PRINT '  Deleted ' + CAST(@@ROWCOUNT AS VARCHAR(20)) + ' rows';

    -- 5. ResponseRevision (references FormResponse, FormVersion)
    PRINT 'Clearing ResponseRevision...';
    DELETE FROM dbo.ResponseRevision;
    PRINT '  Deleted ' + CAST(@@ROWCOUNT AS VARCHAR(20)) + ' rows';

    -- 6. FormResponse (references FormTemplate, FormVersion, User, Outlet)
    PRINT 'Clearing FormResponse...';
    DELETE FROM dbo.FormResponse;
    PRINT '  Deleted ' + CAST(@@ROWCOUNT AS VARCHAR(20)) + ' rows';

    -- 6. FormVersion (references FormTemplate)
    PRINT 'Clearing FormVersion...';
    DELETE FROM dbo.FormVersion;
    PRINT '  Deleted ' + CAST(@@ROWCOUNT AS VARCHAR(20)) + ' rows';

    -- 7. FormAccessRule (references FormTemplate, User, Role)
    PRINT 'Clearing FormAccessRule...';
    DELETE FROM dbo.FormAccessRule;
    PRINT '  Deleted ' + CAST(@@ROWCOUNT AS VARCHAR(20)) + ' rows';

    -- 8. FormInvite (references FormTemplate, User)
    PRINT 'Clearing FormInvite...';
    DELETE FROM dbo.FormInvite;
    PRINT '  Deleted ' + CAST(@@ROWCOUNT AS VARCHAR(20)) + ' rows';

    -- 9. FormConsentHistory (references FormTemplate, User)
    PRINT 'Clearing FormConsentHistory...';
    DELETE FROM dbo.FormConsentHistory;
    PRINT '  Deleted ' + CAST(@@ROWCOUNT AS VARCHAR(20)) + ' rows';

    -- 10. FormCrossReport (references FormTemplate, User)
    PRINT 'Clearing FormCrossReport...';
    DELETE FROM dbo.FormCrossReport;
    PRINT '  Deleted ' + CAST(@@ROWCOUNT AS VARCHAR(20)) + ' rows';

    -- 11. FormShare (references FormTemplate, FormCrossReport, User) - must be before FormCrossReport
    PRINT 'Clearing FormShare...';
    DELETE FROM dbo.FormShare;
    PRINT '  Deleted ' + CAST(@@ROWCOUNT AS VARCHAR(20)) + ' rows';

    -- 12. FormReportAccess (references FormTemplate, User)
    PRINT 'Clearing FormReportAccess...';
    DELETE FROM dbo.FormReportAccess;
    PRINT '  Deleted ' + CAST(@@ROWCOUNT AS VARCHAR(20)) + ' rows';

    -- 13. FormTemplate (references User, self)
    PRINT 'Clearing FormTemplate...';
    DELETE FROM dbo.FormTemplate;
    PRINT '  Deleted ' + CAST(@@ROWCOUNT AS VARCHAR(20)) + ' rows';

    /* 
       Phase 2: Interviews (2 tables) - InterviewQA first (child of Interview)
    */

    -- 13. InterviewQA (references Interview with CASCADE DELETE - but we delete child first for safety)
    PRINT 'Clearing InterviewQA...';
    DELETE FROM dbo.InterviewQA;
    PRINT '  Deleted ' + CAST(@@ROWCOUNT AS VARCHAR(20)) + ' rows';

    -- 14. Interview (references User, BusinessGroup, Region, Outlet)
    PRINT 'Clearing Interview...';
    DELETE FROM dbo.Interview;
    PRINT '  Deleted ' + CAST(@@ROWCOUNT AS VARCHAR(20)) + ' rows';

    /* 
       Phase 3: Market Visits (1 table)
    */

    -- 15. MarketVisitReport (references User, Outlet, User for reviewed)
    PRINT 'Clearing MarketVisitReport...';
    DELETE FROM dbo.MarketVisitReport;
    PRINT '  Deleted ' + CAST(@@ROWCOUNT AS VARCHAR(20)) + ' rows';

    /* 
       Phase 4: Weekly Sales (1 table)
    */

    -- 16. WeeklySales (references BusinessGroup, Product, Region, Outlet, Customer, User)
    PRINT 'Clearing WeeklySales...';
    DELETE FROM dbo.WeeklySales;
    PRINT '  Deleted ' + CAST(@@ROWCOUNT AS VARCHAR(20)) + ' rows';

    /* 
       Phase 5: Photos & Videos (1 table)
    */

    -- 17. MultimediaAsset (references User, BusinessGroup, Region, Outlet)
    PRINT 'Clearing MultimediaAsset...';
    DELETE FROM dbo.MultimediaAsset;
    PRINT '  Deleted ' + CAST(@@ROWCOUNT AS VARCHAR(20)) + ' rows';

    PRINT '=== All data cleared. Reseeding identity columns... ===';

    /* 
       Phase 6: Reseed identity columns to 1
    */

    -- Forms & Responses
    DBCC CHECKIDENT ('dbo.ResponseAnswer', RESEED, 0);
    PRINT 'Reseeded ResponseAnswer';

    DBCC CHECKIDENT ('dbo.FormFile', RESEED, 0);
    PRINT 'Reseeded FormFile';

    DBCC CHECKIDENT ('dbo.FormAnomalyFlag', RESEED, 0);
    PRINT 'Reseeded FormAnomalyFlag';

    DBCC CHECKIDENT ('dbo.ResponseRevision', RESEED, 0);
    PRINT 'Reseeded ResponseRevision';

    DBCC CHECKIDENT ('dbo.FormResponse', RESEED, 0);
    PRINT 'Reseeded FormResponse';

    DBCC CHECKIDENT ('dbo.FormVersion', RESEED, 0);
    PRINT 'Reseeded FormVersion';

    DBCC CHECKIDENT ('dbo.FormAccessRule', RESEED, 0);
    PRINT 'Reseeded FormAccessRule';

    DBCC CHECKIDENT ('dbo.FormInvite', RESEED, 0);
    PRINT 'Reseeded FormInvite';

    DBCC CHECKIDENT ('dbo.FormConsentHistory', RESEED, 0);
    PRINT 'Reseeded FormConsentHistory';

    DBCC CHECKIDENT ('dbo.FormCrossReport', RESEED, 0);
    PRINT 'Reseeded FormCrossReport';

    DBCC CHECKIDENT ('dbo.FormShare', RESEED, 0);
    PRINT 'Reseeded FormShare';

    DBCC CHECKIDENT ('dbo.FormReportAccess', RESEED, 0);
    PRINT 'Reseeded FormReportAccess';

    DBCC CHECKIDENT ('dbo.FormTemplate', RESEED, 0);
    PRINT 'Reseeded FormTemplate';

    -- Interviews
    DBCC CHECKIDENT ('dbo.InterviewQA', RESEED, 0);
    PRINT 'Reseeded InterviewQA';

    DBCC CHECKIDENT ('dbo.Interview', RESEED, 0);
    PRINT 'Reseeded Interview';

    -- Market Visits
    DBCC CHECKIDENT ('dbo.MarketVisitReport', RESEED, 0);
    PRINT 'Reseeded MarketVisitReport';

    -- Weekly Sales
    DBCC CHECKIDENT ('dbo.WeeklySales', RESEED, 0);
    PRINT 'Reseeded WeeklySales';

    -- Photos & Videos
    DBCC CHECKIDENT ('dbo.MultimediaAsset', RESEED, 0);
    PRINT 'Reseeded MultimediaAsset';

    COMMIT TRANSACTION;
    PRINT '=== Migration 048: Data clearance and reseeding completed successfully ===';

END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    PRINT '=== Migration 048: FAILED - ' + ERROR_MESSAGE() + ' ===';
    THROW;
END CATCH;

-- Verification: Confirm all target tables are empty and identities reseeded
PRINT '=== Verification: Post-clearance validation ===';

-- Verify row counts = 0
SELECT 'ResponseAnswer' AS TableName, COUNT(*) AS [Row_Count] FROM dbo.ResponseAnswer
UNION ALL SELECT 'FormFile', COUNT(*) FROM dbo.FormFile
UNION ALL SELECT 'FormAnomalyFlag', COUNT(*) FROM dbo.FormAnomalyFlag
UNION ALL SELECT 'ResponseRevision', COUNT(*) FROM dbo.ResponseRevision
UNION ALL SELECT 'FormResponse', COUNT(*) FROM dbo.FormResponse
UNION ALL SELECT 'FormVersion', COUNT(*) FROM dbo.FormVersion
UNION ALL SELECT 'FormAccessRule', COUNT(*) FROM dbo.FormAccessRule
UNION ALL SELECT 'FormInvite', COUNT(*) FROM dbo.FormInvite
UNION ALL SELECT 'FormConsentHistory', COUNT(*) FROM dbo.FormConsentHistory
UNION ALL SELECT 'FormCrossReport', COUNT(*) FROM dbo.FormCrossReport
UNION ALL SELECT 'FormShare', COUNT(*) FROM dbo.FormShare
UNION ALL SELECT 'FormReportAccess', COUNT(*) FROM dbo.FormReportAccess
UNION ALL SELECT 'FormTemplate', COUNT(*) FROM dbo.FormTemplate
UNION ALL SELECT 'InterviewQA', COUNT(*) FROM dbo.InterviewQA
UNION ALL SELECT 'Interview', COUNT(*) FROM dbo.Interview
UNION ALL SELECT 'MarketVisitReport', COUNT(*) FROM dbo.MarketVisitReport
UNION ALL SELECT 'WeeklySales', COUNT(*) FROM dbo.WeeklySales
UNION ALL SELECT 'MultimediaAsset', COUNT(*) FROM dbo.MultimediaAsset
ORDER BY TableName;

-- Verify identity reseed (next identity value should be 1)
PRINT '=== Identity reseed verification (next identity value should be 1) ===';
DBCC CHECKIDENT ('dbo.ResponseAnswer', NORESEED);
DBCC CHECKIDENT ('dbo.FormFile', NORESEED);
DBCC CHECKIDENT ('dbo.FormAnomalyFlag', NORESEED);
DBCC CHECKIDENT ('dbo.ResponseRevision', NORESEED);
DBCC CHECKIDENT ('dbo.FormResponse', NORESEED);
DBCC CHECKIDENT ('dbo.FormVersion', NORESEED);
DBCC CHECKIDENT ('dbo.FormAccessRule', NORESEED);
DBCC CHECKIDENT ('dbo.FormInvite', NORESEED);
DBCC CHECKIDENT ('dbo.FormConsentHistory', NORESEED);
DBCC CHECKIDENT ('dbo.FormCrossReport', NORESEED);
DBCC CHECKIDENT ('dbo.FormShare', NORESEED);
DBCC CHECKIDENT ('dbo.FormReportAccess', NORESEED);
DBCC CHECKIDENT ('dbo.FormTemplate', NORESEED);
DBCC CHECKIDENT ('dbo.InterviewQA', NORESEED);
DBCC CHECKIDENT ('dbo.Interview', NORESEED);
DBCC CHECKIDENT ('dbo.MarketVisitReport', NORESEED);
DBCC CHECKIDENT ('dbo.WeeklySales', NORESEED);
DBCC CHECKIDENT ('dbo.MultimediaAsset', NORESEED);

-- Verify backup row counts (should match pre-clearance counts)
PRINT '=== Backup verification (row counts in _bak_*_20261015 tables) ===';
SELECT '_bak_FormTemplate_20261015' AS BackupTable, COUNT(*) AS [Row_Count] FROM dbo._bak_FormTemplate_20261015
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
ORDER BY BackupTable;

PRINT '=== Migration 048: All verifications complete ===';