/*
  Migration 049: Delete all notifications
  Description: Removes all records from dbo.Notification table
  Run: After verification that user wants to clear all notifications
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;

BEGIN TRY
    BEGIN TRANSACTION;

    PRINT '=== Migration 049: Deleting all notifications ===';

    -- Show count before deletion
    DECLARE @CountBefore INT;
    SELECT @CountBefore = COUNT(*) FROM dbo.Notification;
    PRINT 'Notifications before deletion: ' + CAST(@CountBefore AS VARCHAR(20));

    -- Delete all notifications
    DELETE FROM dbo.Notification;

    -- Verify deletion
    DECLARE @CountAfter INT;
    SELECT @CountAfter = COUNT(*) FROM dbo.Notification;
    PRINT 'Notifications after deletion: ' + CAST(@CountAfter AS VARCHAR(20));

    -- Reseed identity
    DBCC CHECKIDENT ('dbo.Notification', RESEED, 0);
    PRINT 'Identity reseeded to 0 (next will be 1)';

    COMMIT TRANSACTION;
    PRINT '=== Migration 049: All notifications deleted successfully ===';

END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    PRINT '=== Migration 049: FAILED - ' + ERROR_MESSAGE() + ' ===';
    THROW;
END CATCH;