-- =============================================================================
-- KG-MIS  Migration 002 - Add read tracking to Notification table
-- Adds IsRead (BIT) and ReadAt (DATETIME2) columns for in-app notification
-- center (Phase 2: Email Notification Center with unread/read tracking).
-- =============================================================================

USE KG_MIS;
GO

-- Add IsRead column
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.Notification') AND name = 'IsRead'
)
BEGIN
  ALTER TABLE dbo.Notification
    ADD IsRead BIT NOT NULL CONSTRAINT DF_Notification_IsRead DEFAULT 0;
END
GO

-- Add ReadAt timestamp
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.Notification') AND name = 'ReadAt'
)
BEGIN
  ALTER TABLE dbo.Notification
    ADD ReadAt DATETIME2 NULL;
END
GO

-- Partial index for fast unread count queries (only indexes unread rows)
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_Notification_Unread' AND object_id = OBJECT_ID('dbo.Notification')
)
BEGIN
  CREATE INDEX IX_Notification_Unread
    ON dbo.Notification(RecipientUserID, IsRead)
    WHERE IsRead = 0;
END
GO
