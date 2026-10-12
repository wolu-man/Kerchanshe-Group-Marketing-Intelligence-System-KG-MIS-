-- 023_audit_log_ip_location.sql
-- Add IP address and location columns to AuditLog

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.AuditLog') AND name = 'IPAddress')
  ALTER TABLE dbo.AuditLog ADD IPAddress VARCHAR(45) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.AuditLog') AND name = 'Location')
  ALTER TABLE dbo.AuditLog ADD Location NVARCHAR(200) NULL;
GO
