-- 018_plan_creation_notification.sql
-- Add notification config for NEW_PLAN_CREATED event
-- Notifies Field Officers, Marketing Managers, and Marketing Analysts when plans are created

IF NOT EXISTS (SELECT 1 FROM dbo.NotificationConfig WHERE TriggerEvent = 'NEW_PLAN_CREATED')
BEGIN
    INSERT INTO dbo.NotificationConfig (TriggerEvent, Channel, RoleID, Enabled) VALUES
        ('NEW_PLAN_CREATED', 'Email', 2, 1),  -- Marketing Manager
        ('NEW_PLAN_CREATED', 'Email', 3, 1),  -- Marketing Analyst
        ('NEW_PLAN_CREATED', 'Email', 4, 1);  -- Field Officer
END
GO
