-- 044: KPI measurement workbook (MIS-compatible raw data model)
-- Adds annual-plan metadata to KpiDefinition, the monthly measurement
-- workflow columns to KpiResult, and seeds the 49 workbook KPIs with
-- 588 monthly planned rows for 2026.

ALTER TABLE dbo.KpiDefinition ADD
  StrategicObjective    NVARCHAR(200) NULL,
  BusinessUnitID        INT NULL CONSTRAINT FK_KpiDefinition_BusinessGroup REFERENCES dbo.BusinessGroup(BusinessGroupID),
  KpiOwnerName          NVARCHAR(100) NULL,
  KpiOwnerUserID        INT NULL CONSTRAINT FK_KpiDefinition_OwnerUser REFERENCES dbo.[User](UserID),
  DataSource            NVARCHAR(50) NULL,
  CollectionMethod      NVARCHAR(50) NULL,
  AlertThresholdText    NVARCHAR(50) NULL,
  AlertThresholdPercent DECIMAL(5,2) NULL,
  EvidenceRequired      BIT NOT NULL CONSTRAINT DF_KpiDefinition_EvidenceRequired DEFAULT 0,
  VerificationRole      NVARCHAR(100) NULL,
  DashboardGroup        NVARCHAR(100) NULL,
  SystemModule          NVARCHAR(100) NULL,
  IntegrationMethod     NVARCHAR(100) NULL,
  TargetText            NVARCHAR(300) NULL,
  UnitOfMeasure         NVARCHAR(50) NULL,
  SourceRef             NVARCHAR(20) NULL;
GO

ALTER TABLE dbo.KpiResult ADD
  RecordType         NVARCHAR(20) NOT NULL CONSTRAINT DF_KpiResult_RecordType DEFAULT 'Officer',
  PlannedValue       FLOAT NULL,
  PlannedText        NVARCHAR(100) NULL,
  AutoStatus         NVARCHAR(20) NULL,
  FinalStatus        NVARCHAR(20) NULL,
  StatusOverride     NVARCHAR(20) NULL,
  EvidenceReference  NVARCHAR(500) NULL,
  VerificationStatus NVARCHAR(20) NOT NULL CONSTRAINT DF_KpiResult_VerificationStatus DEFAULT 'Pending',
  VerificationNote   NVARCHAR(500) NULL,
  ReviewerUserID     INT NULL CONSTRAINT FK_KpiResult_Reviewer REFERENCES dbo.[User](UserID),
  MisRecordId        NVARCHAR(40) NULL;
GO

-- Org-level measurement rows carry no officer
ALTER TABLE dbo.KpiResult ALTER COLUMN UserID INT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KpiDefinition_SourceRef' AND object_id = OBJECT_ID('dbo.KpiDefinition'))
CREATE INDEX IX_KpiDefinition_SourceRef ON dbo.KpiDefinition(SourceRef);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KpiResult_MisRecordId' AND object_id = OBJECT_ID('dbo.KpiResult'))
CREATE INDEX IX_KpiResult_MisRecordId ON dbo.KpiResult(MisRecordId);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KpiResult_VerificationStatus' AND object_id = OBJECT_ID('dbo.KpiResult'))
CREATE INDEX IX_KpiResult_VerificationStatus ON dbo.KpiResult(VerificationStatus);
GO

-- KPI 001: Total cost reduction vs baseline
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-001')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-001', N'Total cost reduction vs baseline', NULL, N'Financial', N'Percentage', 5, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Cost minimization of up to 25%', N'To assign', N'Finance Report', N'Excel Upload', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Performance Management', N'To confirm', N'5%', N'%', N'1');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-001-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'Finance Report', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 73, NULL, N'KPI-2026-001-JAN'),
  ('2026-02-01', '2026-02-28', 77, NULL, N'KPI-2026-001-FEB'),
  ('2026-03-01', '2026-03-31', 88, NULL, N'KPI-2026-001-MAR'),
  ('2026-04-01', '2026-04-30', 88, NULL, N'KPI-2026-001-APR'),
  ('2026-05-01', '2026-05-31', 80, NULL, N'KPI-2026-001-MAY'),
  ('2026-06-01', '2026-06-30', 70, NULL, N'KPI-2026-001-JUN'),
  ('2026-07-01', '2026-07-31', 90, NULL, N'KPI-2026-001-JUL'),
  ('2026-08-01', '2026-08-31', 89, NULL, N'KPI-2026-001-AUG'),
  ('2026-09-01', '2026-09-30', 92, NULL, N'KPI-2026-001-SEP'),
  ('2026-10-01', '2026-10-31', 96, NULL, N'KPI-2026-001-OCT'),
  ('2026-11-01', '2026-11-30', 70, NULL, N'KPI-2026-001-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-001-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-001';
GO

-- KPI 002: Annual cost savings (ETB or USD)
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-002')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-002', N'Annual cost savings (ETB or USD)', NULL, N'Financial', N'Amount', 7850000, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Cost minimization of up to 25%', N'To assign', N'Finance Report', N'Excel Upload', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Performance Management', N'To confirm', N'7,850,000.00', N'ETB/USD', N'2');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-002-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'Finance Report', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 477541, NULL, N'KPI-2026-002-JAN'),
  ('2026-02-01', '2026-02-28', 503708, NULL, N'KPI-2026-002-FEB'),
  ('2026-03-01', '2026-03-31', 575666, NULL, N'KPI-2026-002-MAR'),
  ('2026-04-01', '2026-04-30', 575666, NULL, N'KPI-2026-002-APR'),
  ('2026-05-01', '2026-05-31', 523333, NULL, N'KPI-2026-002-MAY'),
  ('2026-06-01', '2026-06-30', 45916, NULL, N'KPI-2026-002-JUN'),
  ('2026-07-01', '2026-07-31', 588750, NULL, N'KPI-2026-002-JUL'),
  ('2026-08-01', '2026-08-31', 582208, NULL, N'KPI-2026-002-AUG'),
  ('2026-09-01', '2026-09-30', 601833, NULL, N'KPI-2026-002-SEP'),
  ('2026-10-01', '2026-10-31', 628000, NULL, N'KPI-2026-002-OCT'),
  ('2026-11-01', '2026-11-30', 457916, NULL, N'KPI-2026-002-NOV'),
  ('2026-12-01', '2026-12-31', 575666, NULL, N'KPI-2026-002-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-002';
GO

-- KPI 003: Cost per unit of output
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-003')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-003', N'Cost per unit of output', NULL, N'Financial', N'Amount', 6, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Cost minimization of up to 25%', N'To assign', N'Finance Report', N'Excel Upload', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Performance Management', N'To confirm', N'6%', N'cost/unit', N'3');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-003-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'Finance Report', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 40, NULL, N'KPI-2026-003-JAN'),
  ('2026-02-01', '2026-02-28', 30, NULL, N'KPI-2026-003-FEB'),
  ('2026-03-01', '2026-03-31', 70, NULL, N'KPI-2026-003-MAR'),
  ('2026-04-01', '2026-04-30', 85, NULL, N'KPI-2026-003-APR'),
  ('2026-05-01', '2026-05-31', 75, NULL, N'KPI-2026-003-MAY'),
  ('2026-06-01', '2026-06-30', 89, NULL, N'KPI-2026-003-JUN'),
  ('2026-07-01', '2026-07-31', 78, NULL, N'KPI-2026-003-JUL'),
  ('2026-08-01', '2026-08-31', 90, NULL, N'KPI-2026-003-AUG'),
  ('2026-09-01', '2026-09-30', 93, NULL, N'KPI-2026-003-SEP'),
  ('2026-10-01', '2026-10-31', 98, NULL, N'KPI-2026-003-OCT'),
  ('2026-11-01', '2026-11-30', 97, NULL, N'KPI-2026-003-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-003-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-003';
GO

-- KPI 004: Budget Utilization Rate
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-004')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-004', N'Budget Utilization Rate', NULL, N'Financial', N'Percentage', 95, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Effective budget utilization', N'To assign', N'Finance Report', N'Excel Upload', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Performance Management', N'To confirm', N'95.00%', N'%', N'4');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-004-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'Finance Report', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 30, NULL, N'KPI-2026-004-JAN'),
  ('2026-02-01', '2026-02-28', 50, NULL, N'KPI-2026-004-FEB'),
  ('2026-03-01', '2026-03-31', 40, NULL, N'KPI-2026-004-MAR'),
  ('2026-04-01', '2026-04-30', 75, NULL, N'KPI-2026-004-APR'),
  ('2026-05-01', '2026-05-31', 86, NULL, N'KPI-2026-004-MAY'),
  ('2026-06-01', '2026-06-30', 89, NULL, N'KPI-2026-004-JUN'),
  ('2026-07-01', '2026-07-31', 91, NULL, N'KPI-2026-004-JUL'),
  ('2026-08-01', '2026-08-31', 62, NULL, N'KPI-2026-004-AUG'),
  ('2026-09-01', '2026-09-30', 82, NULL, N'KPI-2026-004-SEP'),
  ('2026-10-01', '2026-10-31', 76, NULL, N'KPI-2026-004-OCT'),
  ('2026-11-01', '2026-11-30', 92, NULL, N'KPI-2026-004-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-004-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-004';
GO

-- KPI 005: Variance from Budget (% over/under)
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-005')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-005', N'Variance from Budget (% over/under)', NULL, N'Financial', N'Percentage', 5, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Effective budget utilization', N'To assign', N'Finance Report', N'Excel Upload', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Performance Management', N'To confirm', N'±5%', N'%', N'5');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-005-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'Finance Report', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 40, NULL, N'KPI-2026-005-JAN'),
  ('2026-02-01', '2026-02-28', 30, NULL, N'KPI-2026-005-FEB'),
  ('2026-03-01', '2026-03-31', 70, NULL, N'KPI-2026-005-MAR'),
  ('2026-04-01', '2026-04-30', 85, NULL, N'KPI-2026-005-APR'),
  ('2026-05-01', '2026-05-31', 75, NULL, N'KPI-2026-005-MAY'),
  ('2026-06-01', '2026-06-30', 89, NULL, N'KPI-2026-005-JUN'),
  ('2026-07-01', '2026-07-31', 78, NULL, N'KPI-2026-005-JUL'),
  ('2026-08-01', '2026-08-31', 90, NULL, N'KPI-2026-005-AUG'),
  ('2026-09-01', '2026-09-30', 93, NULL, N'KPI-2026-005-SEP'),
  ('2026-10-01', '2026-10-31', 98, NULL, N'KPI-2026-005-OCT'),
  ('2026-11-01', '2026-11-30', 97, NULL, N'KPI-2026-005-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-005-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-005';
GO

-- KPI 006: Budget reallocated mid-cycle
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-006')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-006', N'Budget reallocated mid-cycle', NULL, N'Financial', N'Percentage', 14, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Effective budget utilization', N'To assign', N'Finance Report', N'Excel Upload', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Performance Management', N'To confirm', N'14%', N'%', N'6');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-006-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'Finance Report', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 75, NULL, N'KPI-2026-006-JAN'),
  ('2026-02-01', '2026-02-28', 78, NULL, N'KPI-2026-006-FEB'),
  ('2026-03-01', '2026-03-31', 88, NULL, N'KPI-2026-006-MAR'),
  ('2026-04-01', '2026-04-30', 85, NULL, N'KPI-2026-006-APR'),
  ('2026-05-01', '2026-05-31', 76, NULL, N'KPI-2026-006-MAY'),
  ('2026-06-01', '2026-06-30', 76, NULL, N'KPI-2026-006-JUN'),
  ('2026-07-01', '2026-07-31', 89, NULL, N'KPI-2026-006-JUL'),
  ('2026-08-01', '2026-08-31', 92, NULL, N'KPI-2026-006-AUG'),
  ('2026-09-01', '2026-09-30', 93, NULL, N'KPI-2026-006-SEP'),
  ('2026-10-01', '2026-10-31', 98, NULL, N'KPI-2026-006-OCT'),
  ('2026-11-01', '2026-11-30', 97, NULL, N'KPI-2026-006-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-006-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-006';
GO

-- KPI 007: Spending vs Milestone Achievement
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-007')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-007', N'Spending vs Milestone Achievement', NULL, N'Financial', N'Count', 1, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Effective budget utilization', N'To assign', N'Finance Report', N'Excel Upload', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Performance Management', N'To confirm', N'1.0', N'ratio', N'7');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-007-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'Finance Report', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 30, NULL, N'KPI-2026-007-JAN'),
  ('2026-02-01', '2026-02-28', 50, NULL, N'KPI-2026-007-FEB'),
  ('2026-03-01', '2026-03-31', 40, NULL, N'KPI-2026-007-MAR'),
  ('2026-04-01', '2026-04-30', 75, NULL, N'KPI-2026-007-APR'),
  ('2026-05-01', '2026-05-31', 86, NULL, N'KPI-2026-007-MAY'),
  ('2026-06-01', '2026-06-30', 89, NULL, N'KPI-2026-007-JUN'),
  ('2026-07-01', '2026-07-31', 91, NULL, N'KPI-2026-007-JUL'),
  ('2026-08-01', '2026-08-31', 62, NULL, N'KPI-2026-007-AUG'),
  ('2026-09-01', '2026-09-30', 82, NULL, N'KPI-2026-007-SEP'),
  ('2026-10-01', '2026-10-31', 76, NULL, N'KPI-2026-007-OCT'),
  ('2026-11-01', '2026-11-30', 92, NULL, N'KPI-2026-007-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-007-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-007';
GO

-- KPI 008: Annual Revenue Growth (%) (Pen and plate)
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-008')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-008', N'Annual Revenue Growth (%) (Pen and plate)', NULL, N'Financial', N'Percentage', 98, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Increasing the revenue by 30% from all business unit', N'To assign', N'Finance Report', N'Excel Upload', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Performance Management', N'To confirm', N'98%', N'%', N'8');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-008-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'Finance Report', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 20, NULL, N'KPI-2026-008-JAN'),
  ('2026-02-01', '2026-02-28', 30, NULL, N'KPI-2026-008-FEB'),
  ('2026-03-01', '2026-03-31', 40, NULL, N'KPI-2026-008-MAR'),
  ('2026-04-01', '2026-04-30', 50, NULL, N'KPI-2026-008-APR'),
  ('2026-05-01', '2026-05-31', 60, NULL, N'KPI-2026-008-MAY'),
  ('2026-06-01', '2026-06-30', 65, NULL, N'KPI-2026-008-JUN'),
  ('2026-07-01', '2026-07-31', 70, NULL, N'KPI-2026-008-JUL'),
  ('2026-08-01', '2026-08-31', 80, NULL, N'KPI-2026-008-AUG'),
  ('2026-09-01', '2026-09-30', 90, NULL, N'KPI-2026-008-SEP'),
  ('2026-10-01', '2026-10-31', 95, NULL, N'KPI-2026-008-OCT'),
  ('2026-11-01', '2026-11-30', 98, NULL, N'KPI-2026-008-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-008-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-008';
GO

-- KPI 009: Annual Revenue Growth (%) Auto and Tractor
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-009')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-009', N'Annual Revenue Growth (%) Auto and Tractor', NULL, N'Financial', N'Percentage', 98, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Increasing the revenue by 30% from all business unit', N'To assign', N'Finance Report', N'Excel Upload', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Performance Management', N'To confirm', N'98%', N'%', N'9');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-009-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'Finance Report', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 20, NULL, N'KPI-2026-009-JAN'),
  ('2026-02-01', '2026-02-28', 30, NULL, N'KPI-2026-009-FEB'),
  ('2026-03-01', '2026-03-31', 40, NULL, N'KPI-2026-009-MAR'),
  ('2026-04-01', '2026-04-30', 50, NULL, N'KPI-2026-009-APR'),
  ('2026-05-01', '2026-05-31', 60, NULL, N'KPI-2026-009-MAY'),
  ('2026-06-01', '2026-06-30', 65, NULL, N'KPI-2026-009-JUN'),
  ('2026-07-01', '2026-07-31', 70, NULL, N'KPI-2026-009-JUL'),
  ('2026-08-01', '2026-08-31', 80, NULL, N'KPI-2026-009-AUG'),
  ('2026-09-01', '2026-09-30', 90, NULL, N'KPI-2026-009-SEP'),
  ('2026-10-01', '2026-10-31', 95, NULL, N'KPI-2026-009-OCT'),
  ('2026-11-01', '2026-11-30', 98, NULL, N'KPI-2026-009-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-009-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-009';
GO

-- KPI 010: Monthly Revenue Target
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-010')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-010', N'Monthly Revenue Target', NULL, N'Financial', N'Amount', 529166666.67, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Increasing the revenue by 30% from all business unit', N'To assign', N'Finance Report', N'Excel Upload', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Performance Management', N'To confirm', N'529,166,666.67', N'Birr', N'10');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-010-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'Finance Report', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 73, NULL, N'KPI-2026-010-JAN'),
  ('2026-02-01', '2026-02-28', 77, NULL, N'KPI-2026-010-FEB'),
  ('2026-03-01', '2026-03-31', 88, NULL, N'KPI-2026-010-MAR'),
  ('2026-04-01', '2026-04-30', 88, NULL, N'KPI-2026-010-APR'),
  ('2026-05-01', '2026-05-31', 80, NULL, N'KPI-2026-010-MAY'),
  ('2026-06-01', '2026-06-30', 70, NULL, N'KPI-2026-010-JUN'),
  ('2026-07-01', '2026-07-31', 90, NULL, N'KPI-2026-010-JUL'),
  ('2026-08-01', '2026-08-31', 89, NULL, N'KPI-2026-010-AUG'),
  ('2026-09-01', '2026-09-30', 92, NULL, N'KPI-2026-010-SEP'),
  ('2026-10-01', '2026-10-31', 96, NULL, N'KPI-2026-010-OCT'),
  ('2026-11-01', '2026-11-30', 70, NULL, N'KPI-2026-010-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-010-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-010';
GO

-- KPI 011: Customer Satisfaction Score (CSAT)
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-011')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-011', N'Customer Satisfaction Score (CSAT)', NULL, N'Customer', N'Percentage', 85, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Increase customer satisfaction by 100%', N'To assign', N'CRM', N'Web Form', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Customer & Market Intelligence', N'To confirm', N'85%', N'%', N'11');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-011-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'CRM', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 75, NULL, N'KPI-2026-011-JAN'),
  ('2026-02-01', '2026-02-28', 78, NULL, N'KPI-2026-011-FEB'),
  ('2026-03-01', '2026-03-31', 88, NULL, N'KPI-2026-011-MAR'),
  ('2026-04-01', '2026-04-30', 85, NULL, N'KPI-2026-011-APR'),
  ('2026-05-01', '2026-05-31', 76, NULL, N'KPI-2026-011-MAY'),
  ('2026-06-01', '2026-06-30', 76, NULL, N'KPI-2026-011-JUN'),
  ('2026-07-01', '2026-07-31', 89, NULL, N'KPI-2026-011-JUL'),
  ('2026-08-01', '2026-08-31', 92, NULL, N'KPI-2026-011-AUG'),
  ('2026-09-01', '2026-09-30', 93, NULL, N'KPI-2026-011-SEP'),
  ('2026-10-01', '2026-10-31', 98, NULL, N'KPI-2026-011-OCT'),
  ('2026-11-01', '2026-11-30', 97, NULL, N'KPI-2026-011-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-011-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-011';
GO

-- KPI 012: Net Promoter Score (NPS)
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-012')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-012', N'Net Promoter Score (NPS)', NULL, N'Customer', N'Percentage', 89, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Increase customer satisfaction by 100%', N'To assign', N'CRM', N'Web Form', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Customer & Market Intelligence', N'To confirm', N'89%', N'%', N'12');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-012-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'CRM', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 25, NULL, N'KPI-2026-012-JAN'),
  ('2026-02-01', '2026-02-28', 76, NULL, N'KPI-2026-012-FEB'),
  ('2026-03-01', '2026-03-31', 69, NULL, N'KPI-2026-012-MAR'),
  ('2026-04-01', '2026-04-30', 78, NULL, N'KPI-2026-012-APR'),
  ('2026-05-01', '2026-05-31', 89, NULL, N'KPI-2026-012-MAY'),
  ('2026-06-01', '2026-06-30', 97, NULL, N'KPI-2026-012-JUN'),
  ('2026-07-01', '2026-07-31', 92, NULL, N'KPI-2026-012-JUL'),
  ('2026-08-01', '2026-08-31', 98, NULL, N'KPI-2026-012-AUG'),
  ('2026-09-01', '2026-09-30', 89, NULL, N'KPI-2026-012-SEP'),
  ('2026-10-01', '2026-10-31', 98, NULL, N'KPI-2026-012-OCT'),
  ('2026-11-01', '2026-11-30', 96, NULL, N'KPI-2026-012-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-012-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-012';
GO

-- KPI 013: Complaint resolution rate
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-013')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-013', N'Complaint resolution rate', NULL, N'Customer', N'Percentage', 75, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Increase customer satisfaction by 100%', N'To assign', N'CRM', N'Web Form', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Customer & Market Intelligence', N'To confirm', N'75%', N'%', N'13');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-013-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'CRM', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 30, NULL, N'KPI-2026-013-JAN'),
  ('2026-02-01', '2026-02-28', 50, NULL, N'KPI-2026-013-FEB'),
  ('2026-03-01', '2026-03-31', 40, NULL, N'KPI-2026-013-MAR'),
  ('2026-04-01', '2026-04-30', 75, NULL, N'KPI-2026-013-APR'),
  ('2026-05-01', '2026-05-31', 86, NULL, N'KPI-2026-013-MAY'),
  ('2026-06-01', '2026-06-30', 89, NULL, N'KPI-2026-013-JUN'),
  ('2026-07-01', '2026-07-31', 91, NULL, N'KPI-2026-013-JUL'),
  ('2026-08-01', '2026-08-31', 62, NULL, N'KPI-2026-013-AUG'),
  ('2026-09-01', '2026-09-30', 82, NULL, N'KPI-2026-013-SEP'),
  ('2026-10-01', '2026-10-31', 76, NULL, N'KPI-2026-013-OCT'),
  ('2026-11-01', '2026-11-30', 92, NULL, N'KPI-2026-013-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-013-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-013';
GO

-- KPI 014: Number of New Markets Entered
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-014')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-014', N'Number of New Markets Entered', NULL, N'Customer', N'Count', 5, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Global Brand Expansion & Market Growth', N'To assign', N'CRM', N'Web Form', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Customer & Market Intelligence', N'To confirm', N'5', N'no', N'14');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-014-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'CRM', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 73, NULL, N'KPI-2026-014-JAN'),
  ('2026-02-01', '2026-02-28', 77, NULL, N'KPI-2026-014-FEB'),
  ('2026-03-01', '2026-03-31', 88, NULL, N'KPI-2026-014-MAR'),
  ('2026-04-01', '2026-04-30', 88, NULL, N'KPI-2026-014-APR'),
  ('2026-05-01', '2026-05-31', 80, NULL, N'KPI-2026-014-MAY'),
  ('2026-06-01', '2026-06-30', 70, NULL, N'KPI-2026-014-JUN'),
  ('2026-07-01', '2026-07-31', 90, NULL, N'KPI-2026-014-JUL'),
  ('2026-08-01', '2026-08-31', 89, NULL, N'KPI-2026-014-AUG'),
  ('2026-09-01', '2026-09-30', 92, NULL, N'KPI-2026-014-SEP'),
  ('2026-10-01', '2026-10-31', 96, NULL, N'KPI-2026-014-OCT'),
  ('2026-11-01', '2026-11-30', 70, NULL, N'KPI-2026-014-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-014-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-014';
GO

-- KPI 015: Market Coverage (%)
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-015')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-015', N'Market Coverage (%)', NULL, N'Customer', N'Percentage', 85, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Global Brand Expansion & Market Growth', N'To assign', N'CRM', N'Web Form', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Customer & Market Intelligence', N'To confirm', N'85%', N'%', N'15');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-015-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'CRM', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 55, NULL, N'KPI-2026-015-JAN'),
  ('2026-02-01', '2026-02-28', 75, NULL, N'KPI-2026-015-FEB'),
  ('2026-03-01', '2026-03-31', 65, NULL, N'KPI-2026-015-MAR'),
  ('2026-04-01', '2026-04-30', 85, NULL, N'KPI-2026-015-APR'),
  ('2026-05-01', '2026-05-31', 45, NULL, N'KPI-2026-015-MAY'),
  ('2026-06-01', '2026-06-30', 96, NULL, N'KPI-2026-015-JUN'),
  ('2026-07-01', '2026-07-31', 98, NULL, N'KPI-2026-015-JUL'),
  ('2026-08-01', '2026-08-31', 97, NULL, N'KPI-2026-015-AUG'),
  ('2026-09-01', '2026-09-30', 88, NULL, N'KPI-2026-015-SEP'),
  ('2026-10-01', '2026-10-31', 85, NULL, N'KPI-2026-015-OCT'),
  ('2026-11-01', '2026-11-30', 94, NULL, N'KPI-2026-015-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-015-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-015';
GO

-- KPI 016: Revenue from New Markets (%)
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-016')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-016', N'Revenue from New Markets (%)', NULL, N'Customer', N'Percentage', 90, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Global Brand Expansion & Market Growth', N'To assign', N'CRM', N'Web Form', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Customer & Market Intelligence', N'To confirm', N'90%', N'%', N'16');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-016-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'CRM', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 25, NULL, N'KPI-2026-016-JAN'),
  ('2026-02-01', '2026-02-28', 76, NULL, N'KPI-2026-016-FEB'),
  ('2026-03-01', '2026-03-31', 69, NULL, N'KPI-2026-016-MAR'),
  ('2026-04-01', '2026-04-30', 78, NULL, N'KPI-2026-016-APR'),
  ('2026-05-01', '2026-05-31', 89, NULL, N'KPI-2026-016-MAY'),
  ('2026-06-01', '2026-06-30', 97, NULL, N'KPI-2026-016-JUN'),
  ('2026-07-01', '2026-07-31', 92, NULL, N'KPI-2026-016-JUL'),
  ('2026-08-01', '2026-08-31', 98, NULL, N'KPI-2026-016-AUG'),
  ('2026-09-01', '2026-09-30', 89, NULL, N'KPI-2026-016-SEP'),
  ('2026-10-01', '2026-10-31', 98, NULL, N'KPI-2026-016-OCT'),
  ('2026-11-01', '2026-11-30', 96, NULL, N'KPI-2026-016-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-016-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-016';
GO

-- KPI 017: Time to Break-Even in New Markets
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-017')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-017', N'Time to Break-Even in New Markets', NULL, N'Customer', N'Count', 365, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Global Brand Expansion & Market Growth', N'To assign', N'CRM', N'Web Form', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Customer & Market Intelligence', N'To confirm', N'365 days', N'time', N'17');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-017-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'CRM', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 30, NULL, N'KPI-2026-017-JAN'),
  ('2026-02-01', '2026-02-28', 50, NULL, N'KPI-2026-017-FEB'),
  ('2026-03-01', '2026-03-31', 40, NULL, N'KPI-2026-017-MAR'),
  ('2026-04-01', '2026-04-30', 75, NULL, N'KPI-2026-017-APR'),
  ('2026-05-01', '2026-05-31', 86, NULL, N'KPI-2026-017-MAY'),
  ('2026-06-01', '2026-06-30', 89, NULL, N'KPI-2026-017-JUN'),
  ('2026-07-01', '2026-07-31', 91, NULL, N'KPI-2026-017-JUL'),
  ('2026-08-01', '2026-08-31', 62, NULL, N'KPI-2026-017-AUG'),
  ('2026-09-01', '2026-09-30', 82, NULL, N'KPI-2026-017-SEP'),
  ('2026-10-01', '2026-10-31', 76, NULL, N'KPI-2026-017-OCT'),
  ('2026-11-01', '2026-11-30', 92, NULL, N'KPI-2026-017-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-017-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-017';
GO

-- KPI 018: Brand Awareness (%)
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-018')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-018', N'Brand Awareness (%)', NULL, N'Customer', N'Percentage', 55, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Global Brand Expansion & Market Growth', N'To assign', N'CRM', N'Web Form', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Customer & Market Intelligence', N'To confirm', N'55%', N'%', N'18');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-018-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'CRM', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 73, NULL, N'KPI-2026-018-JAN'),
  ('2026-02-01', '2026-02-28', 77, NULL, N'KPI-2026-018-FEB'),
  ('2026-03-01', '2026-03-31', 88, NULL, N'KPI-2026-018-MAR'),
  ('2026-04-01', '2026-04-30', 88, NULL, N'KPI-2026-018-APR'),
  ('2026-05-01', '2026-05-31', 80, NULL, N'KPI-2026-018-MAY'),
  ('2026-06-01', '2026-06-30', 70, NULL, N'KPI-2026-018-JUN'),
  ('2026-07-01', '2026-07-31', 90, NULL, N'KPI-2026-018-JUL'),
  ('2026-08-01', '2026-08-31', 89, NULL, N'KPI-2026-018-AUG'),
  ('2026-09-01', '2026-09-30', 92, NULL, N'KPI-2026-018-SEP'),
  ('2026-10-01', '2026-10-31', 96, NULL, N'KPI-2026-018-OCT'),
  ('2026-11-01', '2026-11-30', 70, NULL, N'KPI-2026-018-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-018-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-018';
GO

-- KPI 019: Brand Preference Ranking
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-019')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-019', N'Brand Preference Ranking', NULL, N'Customer', N'Percentage', 75, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Global Brand Expansion & Market Growth', N'To assign', N'CRM', N'Web Form', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Customer & Market Intelligence', N'To confirm', N'75%', N'%', N'19');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-019-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'CRM', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 78, NULL, N'KPI-2026-019-JAN'),
  ('2026-02-01', '2026-02-28', 88, NULL, N'KPI-2026-019-FEB'),
  ('2026-03-01', '2026-03-31', 87, NULL, N'KPI-2026-019-MAR'),
  ('2026-04-01', '2026-04-30', 93, NULL, N'KPI-2026-019-APR'),
  ('2026-05-01', '2026-05-31', 95, NULL, N'KPI-2026-019-MAY'),
  ('2026-06-01', '2026-06-30', 93, NULL, N'KPI-2026-019-JUN'),
  ('2026-07-01', '2026-07-31', 96, NULL, N'KPI-2026-019-JUL'),
  ('2026-08-01', '2026-08-31', 98, NULL, N'KPI-2026-019-AUG'),
  ('2026-09-01', '2026-09-30', 99, NULL, N'KPI-2026-019-SEP'),
  ('2026-10-01', '2026-10-31', 92, NULL, N'KPI-2026-019-OCT'),
  ('2026-11-01', '2026-11-30', 96, NULL, N'KPI-2026-019-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-019-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-019';
GO

-- KPI 020: Social Media Reach & Engagement Growth (%)
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-020')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-020', N'Social Media Reach & Engagement Growth (%)', NULL, N'Customer', N'Percentage', 89, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Global Brand Expansion & Market Growth', N'To assign', N'CRM', N'Web Form', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Customer & Market Intelligence', N'To confirm', N'89%', N'%', N'20');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-020-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'CRM', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 40, NULL, N'KPI-2026-020-JAN'),
  ('2026-02-01', '2026-02-28', 30, NULL, N'KPI-2026-020-FEB'),
  ('2026-03-01', '2026-03-31', 70, NULL, N'KPI-2026-020-MAR'),
  ('2026-04-01', '2026-04-30', 85, NULL, N'KPI-2026-020-APR'),
  ('2026-05-01', '2026-05-31', 75, NULL, N'KPI-2026-020-MAY'),
  ('2026-06-01', '2026-06-30', 89, NULL, N'KPI-2026-020-JUN'),
  ('2026-07-01', '2026-07-31', 78, NULL, N'KPI-2026-020-JUL'),
  ('2026-08-01', '2026-08-31', 90, NULL, N'KPI-2026-020-AUG'),
  ('2026-09-01', '2026-09-30', 93, NULL, N'KPI-2026-020-SEP'),
  ('2026-10-01', '2026-10-31', 98, NULL, N'KPI-2026-020-OCT'),
  ('2026-11-01', '2026-11-30', 97, NULL, N'KPI-2026-020-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-020-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-020';
GO

-- KPI 021: Share of Voice (%)
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-021')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-021', N'Share of Voice (%)', NULL, N'Customer', N'Percentage', 56, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Global Brand Expansion & Market Growth', N'To assign', N'CRM', N'Web Form', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Customer & Market Intelligence', N'To confirm', N'56%', N'%', N'21');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-021-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'CRM', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 40, NULL, N'KPI-2026-021-JAN'),
  ('2026-02-01', '2026-02-28', 30, NULL, N'KPI-2026-021-FEB'),
  ('2026-03-01', '2026-03-31', 70, NULL, N'KPI-2026-021-MAR'),
  ('2026-04-01', '2026-04-30', 85, NULL, N'KPI-2026-021-APR'),
  ('2026-05-01', '2026-05-31', 75, NULL, N'KPI-2026-021-MAY'),
  ('2026-06-01', '2026-06-30', 89, NULL, N'KPI-2026-021-JUN'),
  ('2026-07-01', '2026-07-31', 78, NULL, N'KPI-2026-021-JUL'),
  ('2026-08-01', '2026-08-31', 90, NULL, N'KPI-2026-021-AUG'),
  ('2026-09-01', '2026-09-30', 93, NULL, N'KPI-2026-021-SEP'),
  ('2026-10-01', '2026-10-31', 98, NULL, N'KPI-2026-021-OCT'),
  ('2026-11-01', '2026-11-30', 97, NULL, N'KPI-2026-021-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-021-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-021';
GO

-- KPI 022: Global Market Share (%)
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-022')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-022', N'Global Market Share (%)', NULL, N'Customer', N'Percentage', 2, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Global Brand Expansion & Market Growth', N'To assign', N'CRM', N'Web Form', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Customer & Market Intelligence', N'To confirm', N'2%', N'%', N'22');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-022-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'CRM', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 75, NULL, N'KPI-2026-022-JAN'),
  ('2026-02-01', '2026-02-28', 78, NULL, N'KPI-2026-022-FEB'),
  ('2026-03-01', '2026-03-31', 88, NULL, N'KPI-2026-022-MAR'),
  ('2026-04-01', '2026-04-30', 85, NULL, N'KPI-2026-022-APR'),
  ('2026-05-01', '2026-05-31', 76, NULL, N'KPI-2026-022-MAY'),
  ('2026-06-01', '2026-06-30', 76, NULL, N'KPI-2026-022-JUN'),
  ('2026-07-01', '2026-07-31', 89, NULL, N'KPI-2026-022-JUL'),
  ('2026-08-01', '2026-08-31', 92, NULL, N'KPI-2026-022-AUG'),
  ('2026-09-01', '2026-09-30', 93, NULL, N'KPI-2026-022-SEP'),
  ('2026-10-01', '2026-10-31', 98, NULL, N'KPI-2026-022-OCT'),
  ('2026-11-01', '2026-11-30', 97, NULL, N'KPI-2026-022-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-022-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-022';
GO

-- KPI 023: Sales Growth in Target Markets (%)
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-023')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-023', N'Sales Growth in Target Markets (%)', NULL, N'Customer', N'Percentage', 85, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Global Brand Expansion & Market Growth', N'To assign', N'CRM', N'Web Form', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Customer & Market Intelligence', N'To confirm', N'85%', N'%', N'23');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-023-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'CRM', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 66, NULL, N'KPI-2026-023-JAN'),
  ('2026-02-01', '2026-02-28', 50, NULL, N'KPI-2026-023-FEB'),
  ('2026-03-01', '2026-03-31', 40, NULL, N'KPI-2026-023-MAR'),
  ('2026-04-01', '2026-04-30', 75, NULL, N'KPI-2026-023-APR'),
  ('2026-05-01', '2026-05-31', 86, NULL, N'KPI-2026-023-MAY'),
  ('2026-06-01', '2026-06-30', 89, NULL, N'KPI-2026-023-JUN'),
  ('2026-07-01', '2026-07-31', 91, NULL, N'KPI-2026-023-JUL'),
  ('2026-08-01', '2026-08-31', 62, NULL, N'KPI-2026-023-AUG'),
  ('2026-09-01', '2026-09-30', 82, NULL, N'KPI-2026-023-SEP'),
  ('2026-10-01', '2026-10-31', 76, NULL, N'KPI-2026-023-OCT'),
  ('2026-11-01', '2026-11-30', 92, NULL, N'KPI-2026-023-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-023-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-023';
GO

-- KPI 024: Number of Local Distribution Agreements Signed
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-024')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-024', N'Number of Local Distribution Agreements Signed', NULL, N'Customer', N'Count', 5, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Global Brand Expansion & Market Growth', N'To assign', N'CRM', N'Web Form', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Customer & Market Intelligence', N'To confirm', N'5', N'no', N'24');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-024-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'CRM', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 78, NULL, N'KPI-2026-024-JAN'),
  ('2026-02-01', '2026-02-28', 80, NULL, N'KPI-2026-024-FEB'),
  ('2026-03-01', '2026-03-31', 70, NULL, N'KPI-2026-024-MAR'),
  ('2026-04-01', '2026-04-30', 85, NULL, N'KPI-2026-024-APR'),
  ('2026-05-01', '2026-05-31', 75, NULL, N'KPI-2026-024-MAY'),
  ('2026-06-01', '2026-06-30', 69, NULL, N'KPI-2026-024-JUN'),
  ('2026-07-01', '2026-07-31', 78, NULL, N'KPI-2026-024-JUL'),
  ('2026-08-01', '2026-08-31', 90, NULL, N'KPI-2026-024-AUG'),
  ('2026-09-01', '2026-09-30', 93, NULL, N'KPI-2026-024-SEP'),
  ('2026-10-01', '2026-10-31', 98, NULL, N'KPI-2026-024-OCT'),
  ('2026-11-01', '2026-11-30', 97, NULL, N'KPI-2026-024-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-024-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-024';
GO

-- KPI 025: Retail/Outlet Coverage (%)
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-025')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-025', N'Retail/Outlet Coverage (%)', NULL, N'Customer', N'Percentage', 75, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Global Brand Expansion & Market Growth', N'To assign', N'CRM', N'Web Form', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Customer & Market Intelligence', N'To confirm', N'75%', N'%', N'25');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-025-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'CRM', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 64, NULL, N'KPI-2026-025-JAN'),
  ('2026-02-01', '2026-02-28', 70, NULL, N'KPI-2026-025-FEB'),
  ('2026-03-01', '2026-03-31', 30, NULL, N'KPI-2026-025-MAR'),
  ('2026-04-01', '2026-04-30', 75, NULL, N'KPI-2026-025-APR'),
  ('2026-05-01', '2026-05-31', 75, NULL, N'KPI-2026-025-MAY'),
  ('2026-06-01', '2026-06-30', 89, NULL, N'KPI-2026-025-JUN'),
  ('2026-07-01', '2026-07-31', 78, NULL, N'KPI-2026-025-JUL'),
  ('2026-08-01', '2026-08-31', 90, NULL, N'KPI-2026-025-AUG'),
  ('2026-09-01', '2026-09-30', 93, NULL, N'KPI-2026-025-SEP'),
  ('2026-10-01', '2026-10-31', 88, NULL, N'KPI-2026-025-OCT'),
  ('2026-11-01', '2026-11-30', 77, NULL, N'KPI-2026-025-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-025-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-025';
GO

-- KPI 026: Net Promoter Score (NPS)
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-026')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-026', N'Net Promoter Score (NPS)', NULL, N'Customer', N'Percentage', 85, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Global Brand Expansion & Market Growth', N'To assign', N'CRM', N'Web Form', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Customer & Market Intelligence', N'To confirm', N'85%', N'%', N'26');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-026-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'CRM', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 40, NULL, N'KPI-2026-026-JAN'),
  ('2026-02-01', '2026-02-28', 30, NULL, N'KPI-2026-026-FEB'),
  ('2026-03-01', '2026-03-31', 50, NULL, N'KPI-2026-026-MAR'),
  ('2026-04-01', '2026-04-30', 85, NULL, N'KPI-2026-026-APR'),
  ('2026-05-01', '2026-05-31', 75, NULL, N'KPI-2026-026-MAY'),
  ('2026-06-01', '2026-06-30', 79, NULL, N'KPI-2026-026-JUN'),
  ('2026-07-01', '2026-07-31', 78, NULL, N'KPI-2026-026-JUL'),
  ('2026-08-01', '2026-08-31', 90, NULL, N'KPI-2026-026-AUG'),
  ('2026-09-01', '2026-09-30', 93, NULL, N'KPI-2026-026-SEP'),
  ('2026-10-01', '2026-10-31', 98, NULL, N'KPI-2026-026-OCT'),
  ('2026-11-01', '2026-11-30', 97, NULL, N'KPI-2026-026-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-026-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-026';
GO

-- KPI 027: Repeat Purchase Rate (%) in new markets
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-027')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-027', N'Repeat Purchase Rate (%) in new markets', NULL, N'Customer', N'Percentage', 85, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Global Brand Expansion & Market Growth', N'To assign', N'CRM', N'Web Form', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Customer & Market Intelligence', N'To confirm', N'85%', N'%', N'27');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-027-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'CRM', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 80, NULL, N'KPI-2026-027-JAN'),
  ('2026-02-01', '2026-02-28', 40, NULL, N'KPI-2026-027-FEB'),
  ('2026-03-01', '2026-03-31', 70, NULL, N'KPI-2026-027-MAR'),
  ('2026-04-01', '2026-04-30', 85, NULL, N'KPI-2026-027-APR'),
  ('2026-05-01', '2026-05-31', 75, NULL, N'KPI-2026-027-MAY'),
  ('2026-06-01', '2026-06-30', 89, NULL, N'KPI-2026-027-JUN'),
  ('2026-07-01', '2026-07-31', 78, NULL, N'KPI-2026-027-JUL'),
  ('2026-08-01', '2026-08-31', 90, NULL, N'KPI-2026-027-AUG'),
  ('2026-09-01', '2026-09-30', 53, NULL, N'KPI-2026-027-SEP'),
  ('2026-10-01', '2026-10-31', 78, NULL, N'KPI-2026-027-OCT'),
  ('2026-11-01', '2026-11-30', 87, NULL, N'KPI-2026-027-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-027-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-027';
GO

-- KPI 028: Number of employees receiving annual training
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-028')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-028', N'Number of employees receiving annual training', NULL, N'Learning & Growth', N'Count', 15, 1.0, N'Quarterly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Learning & Growth (Training & Adoption)', N'To assign', N'HR Report', N'Excel Upload', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Performance Management', N'To confirm', N'15', N'number', N'28');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-028-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Quarterly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'HR Report', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 40, NULL, N'KPI-2026-028-JAN'),
  ('2026-02-01', '2026-02-28', 30, NULL, N'KPI-2026-028-FEB'),
  ('2026-03-01', '2026-03-31', 70, NULL, N'KPI-2026-028-MAR'),
  ('2026-04-01', '2026-04-30', 85, NULL, N'KPI-2026-028-APR'),
  ('2026-05-01', '2026-05-31', 75, NULL, N'KPI-2026-028-MAY'),
  ('2026-06-01', '2026-06-30', 89, NULL, N'KPI-2026-028-JUN'),
  ('2026-07-01', '2026-07-31', 78, NULL, N'KPI-2026-028-JUL'),
  ('2026-08-01', '2026-08-31', 90, NULL, N'KPI-2026-028-AUG'),
  ('2026-09-01', '2026-09-30', 93, NULL, N'KPI-2026-028-SEP'),
  ('2026-10-01', '2026-10-31', 98, NULL, N'KPI-2026-028-OCT'),
  ('2026-11-01', '2026-11-30', 97, NULL, N'KPI-2026-028-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-028-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-028';
GO

-- KPI 029: Employees certified in job-specific skills or standards
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-029')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-029', N'Employees certified in job-specific skills or standards', NULL, N'Learning & Growth', N'Percentage', 15, 1.0, N'Quarterly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Learning & Growth (Training & Adoption)', N'To assign', N'HR Report', N'Excel Upload', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Performance Management', N'To confirm', N'15', N'%', N'29');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-029-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Quarterly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'HR Report', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 75, NULL, N'KPI-2026-029-JAN'),
  ('2026-02-01', '2026-02-28', 78, NULL, N'KPI-2026-029-FEB'),
  ('2026-03-01', '2026-03-31', 88, NULL, N'KPI-2026-029-MAR'),
  ('2026-04-01', '2026-04-30', 85, NULL, N'KPI-2026-029-APR'),
  ('2026-05-01', '2026-05-31', 76, NULL, N'KPI-2026-029-MAY'),
  ('2026-06-01', '2026-06-30', 76, NULL, N'KPI-2026-029-JUN'),
  ('2026-07-01', '2026-07-31', 89, NULL, N'KPI-2026-029-JUL'),
  ('2026-08-01', '2026-08-31', 92, NULL, N'KPI-2026-029-AUG'),
  ('2026-09-01', '2026-09-30', 93, NULL, N'KPI-2026-029-SEP'),
  ('2026-10-01', '2026-10-31', 98, NULL, N'KPI-2026-029-OCT'),
  ('2026-11-01', '2026-11-30', 97, NULL, N'KPI-2026-029-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-029-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-029';
GO

-- KPI 030: Training content aligned with strategic goals (tech, innovation, safety, etc.)
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-030')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-030', N'Training content aligned with strategic goals (tech, innovation, safety, etc.)', NULL, N'Learning & Growth', N'Percentage', 85, 1.0, N'Quarterly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Learning & Growth (Training & Adoption)', N'To assign', N'HR Report', N'Excel Upload', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Performance Management', N'To confirm', N'85%', N'%', N'30');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-030-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Quarterly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'HR Report', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 10, NULL, N'KPI-2026-030-JAN'),
  ('2026-02-01', '2026-02-28', 20, NULL, N'KPI-2026-030-FEB'),
  ('2026-03-01', '2026-03-31', 30, NULL, N'KPI-2026-030-MAR'),
  ('2026-04-01', '2026-04-30', 40, NULL, N'KPI-2026-030-APR'),
  ('2026-05-01', '2026-05-31', 50, NULL, N'KPI-2026-030-MAY'),
  ('2026-06-01', '2026-06-30', 60, NULL, N'KPI-2026-030-JUN'),
  ('2026-07-01', '2026-07-31', 70, NULL, N'KPI-2026-030-JUL'),
  ('2026-08-01', '2026-08-31', 80, NULL, N'KPI-2026-030-AUG'),
  ('2026-09-01', '2026-09-30', 90, NULL, N'KPI-2026-030-SEP'),
  ('2026-10-01', '2026-10-31', 95, NULL, N'KPI-2026-030-OCT'),
  ('2026-11-01', '2026-11-30', 98, NULL, N'KPI-2026-030-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-030-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-030';
GO

-- KPI 031: Number of internal knowledge-sharing sessions conducted
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-031')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-031', N'Number of internal knowledge-sharing sessions conducted', NULL, N'Learning & Growth', N'Count', 35, 1.0, N'Quarterly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Learning & Growth (Training & Adoption)', N'To assign', N'HR Report', N'Excel Upload', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Performance Management', N'To confirm', N'35', N'number', N'31');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-031-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Quarterly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'HR Report', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 10, NULL, N'KPI-2026-031-JAN'),
  ('2026-02-01', '2026-02-28', 20, NULL, N'KPI-2026-031-FEB'),
  ('2026-03-01', '2026-03-31', 30, NULL, N'KPI-2026-031-MAR'),
  ('2026-04-01', '2026-04-30', 40, NULL, N'KPI-2026-031-APR'),
  ('2026-05-01', '2026-05-31', 50, NULL, N'KPI-2026-031-MAY'),
  ('2026-06-01', '2026-06-30', 60, NULL, N'KPI-2026-031-JUN'),
  ('2026-07-01', '2026-07-31', 70, NULL, N'KPI-2026-031-JUL'),
  ('2026-08-01', '2026-08-31', 80, NULL, N'KPI-2026-031-AUG'),
  ('2026-09-01', '2026-09-30', 90, NULL, N'KPI-2026-031-SEP'),
  ('2026-10-01', '2026-10-31', 95, NULL, N'KPI-2026-031-OCT'),
  ('2026-11-01', '2026-11-30', 98, NULL, N'KPI-2026-031-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-031-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-031';
GO

-- KPI 032: Digital literacy improvement score
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-032')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-032', N'Digital literacy improvement score', NULL, N'Learning & Growth', N'Percentage', 70, 1.0, N'Quarterly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Learning & Growth (Training & Adoption)', N'To assign', N'HR Report', N'Excel Upload', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Performance Management', N'To confirm', N'70%', N'%', N'32');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-032-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Quarterly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'HR Report', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 10, NULL, N'KPI-2026-032-JAN'),
  ('2026-02-01', '2026-02-28', 20, NULL, N'KPI-2026-032-FEB'),
  ('2026-03-01', '2026-03-31', 30, NULL, N'KPI-2026-032-MAR'),
  ('2026-04-01', '2026-04-30', 40, NULL, N'KPI-2026-032-APR'),
  ('2026-05-01', '2026-05-31', 50, NULL, N'KPI-2026-032-MAY'),
  ('2026-06-01', '2026-06-30', 60, NULL, N'KPI-2026-032-JUN'),
  ('2026-07-01', '2026-07-31', 70, NULL, N'KPI-2026-032-JUL'),
  ('2026-08-01', '2026-08-31', 80, NULL, N'KPI-2026-032-AUG'),
  ('2026-09-01', '2026-09-30', 90, NULL, N'KPI-2026-032-SEP'),
  ('2026-10-01', '2026-10-31', 95, NULL, N'KPI-2026-032-OCT'),
  ('2026-11-01', '2026-11-30', 98, NULL, N'KPI-2026-032-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-032-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-032';
GO

-- KPI 033: Employee engagement score
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-033')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-033', N'Employee engagement score', NULL, N'Learning & Growth', N'Percentage', 75, 1.0, N'Quarterly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Enhance Company Culture', N'To assign', N'HR Report', N'Excel Upload', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Performance Management', N'To confirm', N'75%', N'%', N'33');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-033-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Quarterly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'HR Report', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 10, NULL, N'KPI-2026-033-JAN'),
  ('2026-02-01', '2026-02-28', 20, NULL, N'KPI-2026-033-FEB'),
  ('2026-03-01', '2026-03-31', 30, NULL, N'KPI-2026-033-MAR'),
  ('2026-04-01', '2026-04-30', 40, NULL, N'KPI-2026-033-APR'),
  ('2026-05-01', '2026-05-31', 50, NULL, N'KPI-2026-033-MAY'),
  ('2026-06-01', '2026-06-30', 60, NULL, N'KPI-2026-033-JUN'),
  ('2026-07-01', '2026-07-31', 70, NULL, N'KPI-2026-033-JUL'),
  ('2026-08-01', '2026-08-31', 80, NULL, N'KPI-2026-033-AUG'),
  ('2026-09-01', '2026-09-30', 90, NULL, N'KPI-2026-033-SEP'),
  ('2026-10-01', '2026-10-31', 95, NULL, N'KPI-2026-033-OCT'),
  ('2026-11-01', '2026-11-30', 98, NULL, N'KPI-2026-033-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-033-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-033';
GO

-- KPI 034: Employee satisfaction with culture (survey-based)
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-034')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-034', N'Employee satisfaction with culture (survey-based)', NULL, N'Learning & Growth', N'Percentage', 60, 1.0, N'Quarterly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Enhance Company Culture', N'To assign', N'HR Report', N'Excel Upload', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Performance Management', N'To confirm', N'60%', N'%', N'34');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-034-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Quarterly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'HR Report', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 10, NULL, N'KPI-2026-034-JAN'),
  ('2026-02-01', '2026-02-28', 20, NULL, N'KPI-2026-034-FEB'),
  ('2026-03-01', '2026-03-31', 30, NULL, N'KPI-2026-034-MAR'),
  ('2026-04-01', '2026-04-30', 40, NULL, N'KPI-2026-034-APR'),
  ('2026-05-01', '2026-05-31', 50, NULL, N'KPI-2026-034-MAY'),
  ('2026-06-01', '2026-06-30', 60, NULL, N'KPI-2026-034-JUN'),
  ('2026-07-01', '2026-07-31', 70, NULL, N'KPI-2026-034-JUL'),
  ('2026-08-01', '2026-08-31', 80, NULL, N'KPI-2026-034-AUG'),
  ('2026-09-01', '2026-09-30', 90, NULL, N'KPI-2026-034-SEP'),
  ('2026-10-01', '2026-10-31', 95, NULL, N'KPI-2026-034-OCT'),
  ('2026-11-01', '2026-11-30', 98, NULL, N'KPI-2026-034-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-034-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-034';
GO

-- KPI 035: Values alignment score (from culture audits)
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-035')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-035', N'Values alignment score (from culture audits)', NULL, N'Learning & Growth', N'Percentage', 85, 1.0, N'Quarterly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Enhance Company Culture', N'To assign', N'HR Report', N'Excel Upload', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Performance Management', N'To confirm', N'85%', N'%', N'35');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-035-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Quarterly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'HR Report', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 10, NULL, N'KPI-2026-035-JAN'),
  ('2026-02-01', '2026-02-28', 20, NULL, N'KPI-2026-035-FEB'),
  ('2026-03-01', '2026-03-31', 30, NULL, N'KPI-2026-035-MAR'),
  ('2026-04-01', '2026-04-30', 40, NULL, N'KPI-2026-035-APR'),
  ('2026-05-01', '2026-05-31', 50, NULL, N'KPI-2026-035-MAY'),
  ('2026-06-01', '2026-06-30', 60, NULL, N'KPI-2026-035-JUN'),
  ('2026-07-01', '2026-07-31', 70, NULL, N'KPI-2026-035-JUL'),
  ('2026-08-01', '2026-08-31', 80, NULL, N'KPI-2026-035-AUG'),
  ('2026-09-01', '2026-09-30', 90, NULL, N'KPI-2026-035-SEP'),
  ('2026-10-01', '2026-10-31', 95, NULL, N'KPI-2026-035-OCT'),
  ('2026-11-01', '2026-11-30', 98, NULL, N'KPI-2026-035-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-035-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-035';
GO

-- KPI 036: Employees who feel recognized and valued
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-036')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-036', N'Employees who feel recognized and valued', NULL, N'Learning & Growth', N'Percentage', 87, 1.0, N'Quarterly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Enhance Company Culture', N'To assign', N'HR Report', N'Excel Upload', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Performance Management', N'To confirm', N'87%', N'%', N'36');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-036-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Quarterly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'HR Report', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 10, NULL, N'KPI-2026-036-JAN'),
  ('2026-02-01', '2026-02-28', 20, NULL, N'KPI-2026-036-FEB'),
  ('2026-03-01', '2026-03-31', 30, NULL, N'KPI-2026-036-MAR'),
  ('2026-04-01', '2026-04-30', 40, NULL, N'KPI-2026-036-APR'),
  ('2026-05-01', '2026-05-31', 50, NULL, N'KPI-2026-036-MAY'),
  ('2026-06-01', '2026-06-30', 60, NULL, N'KPI-2026-036-JUN'),
  ('2026-07-01', '2026-07-31', 70, NULL, N'KPI-2026-036-JUL'),
  ('2026-08-01', '2026-08-31', 80, NULL, N'KPI-2026-036-AUG'),
  ('2026-09-01', '2026-09-30', 90, NULL, N'KPI-2026-036-SEP'),
  ('2026-10-01', '2026-10-31', 95, NULL, N'KPI-2026-036-OCT'),
  ('2026-11-01', '2026-11-30', 98, NULL, N'KPI-2026-036-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-036-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-036';
GO

-- KPI 037: Participation rate in cultural/volunteer initiatives
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-037')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-037', N'Participation rate in cultural/volunteer initiatives', NULL, N'Learning & Growth', N'Percentage', 84, 1.0, N'Quarterly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Enhance Company Culture', N'To assign', N'HR Report', N'Excel Upload', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Performance Management', N'To confirm', N'84%', N'%', N'37');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-037-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Quarterly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'HR Report', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 10, NULL, N'KPI-2026-037-JAN'),
  ('2026-02-01', '2026-02-28', 20, NULL, N'KPI-2026-037-FEB'),
  ('2026-03-01', '2026-03-31', 30, NULL, N'KPI-2026-037-MAR'),
  ('2026-04-01', '2026-04-30', 40, NULL, N'KPI-2026-037-APR'),
  ('2026-05-01', '2026-05-31', 50, NULL, N'KPI-2026-037-MAY'),
  ('2026-06-01', '2026-06-30', 60, NULL, N'KPI-2026-037-JUN'),
  ('2026-07-01', '2026-07-31', 70, NULL, N'KPI-2026-037-JUL'),
  ('2026-08-01', '2026-08-31', 80, NULL, N'KPI-2026-037-AUG'),
  ('2026-09-01', '2026-09-30', 90, NULL, N'KPI-2026-037-SEP'),
  ('2026-10-01', '2026-10-31', 95, NULL, N'KPI-2026-037-OCT'),
  ('2026-11-01', '2026-11-30', 98, NULL, N'KPI-2026-037-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-037-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-037';
GO

-- KPI 038: Managerial behavior score (based on feedback)
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-038')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-038', N'Managerial behavior score (based on feedback)', NULL, N'Learning & Growth', N'Percentage', 95, 1.0, N'Quarterly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Enhance Company Culture', N'To assign', N'HR Report', N'Excel Upload', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Performance Management', N'To confirm', N'95%', N'%', N'38');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-038-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Quarterly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'HR Report', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 10, NULL, N'KPI-2026-038-JAN'),
  ('2026-02-01', '2026-02-28', 20, NULL, N'KPI-2026-038-FEB'),
  ('2026-03-01', '2026-03-31', 30, NULL, N'KPI-2026-038-MAR'),
  ('2026-04-01', '2026-04-30', 40, NULL, N'KPI-2026-038-APR'),
  ('2026-05-01', '2026-05-31', 50, NULL, N'KPI-2026-038-MAY'),
  ('2026-06-01', '2026-06-30', 60, NULL, N'KPI-2026-038-JUN'),
  ('2026-07-01', '2026-07-31', 70, NULL, N'KPI-2026-038-JUL'),
  ('2026-08-01', '2026-08-31', 80, NULL, N'KPI-2026-038-AUG'),
  ('2026-09-01', '2026-09-30', 90, NULL, N'KPI-2026-038-SEP'),
  ('2026-10-01', '2026-10-31', 95, NULL, N'KPI-2026-038-OCT'),
  ('2026-11-01', '2026-11-30', 98, NULL, N'KPI-2026-038-NOV'),
  ('2026-12-01', '2026-12-31', 100, NULL, N'KPI-2026-038-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-038';
GO

-- KPI 039: Campaign Reach, Engagement, ROI
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-039')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-039', N'Campaign Reach, Engagement, ROI', NULL, N'Digital Marketing', N'Count', 12, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Digital Marketing Activity', N'To assign', N'Social Media', N'System Integration', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Digital Marketing', N'To confirm', N'12-14 campaigns, Reach >=50k/campaign', N'Number / % / Ratio', N'39');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-039-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'Social Media', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 1, NULL, N'KPI-2026-039-JAN'),
  ('2026-02-01', '2026-02-28', 1, NULL, N'KPI-2026-039-FEB'),
  ('2026-03-01', '2026-03-31', 1, NULL, N'KPI-2026-039-MAR'),
  ('2026-04-01', '2026-04-30', 1, NULL, N'KPI-2026-039-APR'),
  ('2026-05-01', '2026-05-31', 1, NULL, N'KPI-2026-039-MAY'),
  ('2026-06-01', '2026-06-30', 1, NULL, N'KPI-2026-039-JUN'),
  ('2026-07-01', '2026-07-31', 1, NULL, N'KPI-2026-039-JUL'),
  ('2026-08-01', '2026-08-31', 2, NULL, N'KPI-2026-039-AUG'),
  ('2026-09-01', '2026-09-30', 1, NULL, N'KPI-2026-039-SEP'),
  ('2026-10-01', '2026-10-31', 1, NULL, N'KPI-2026-039-OCT'),
  ('2026-11-01', '2026-11-30', 2, NULL, N'KPI-2026-039-NOV'),
  ('2026-12-01', '2026-12-31', 2, NULL, N'KPI-2026-039-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-039';
GO

-- KPI 040: Content Produced
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-040')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-040', N'Content Produced', NULL, N'Digital Marketing', N'Count', 500, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Digital Marketing Activity', N'To assign', N'Social Media', N'System Integration', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Digital Marketing', N'To confirm', N'500+ photos; 24-36 videos', N'Number', N'40');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-040-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'Social Media', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 40, NULL, N'KPI-2026-040-JAN'),
  ('2026-02-01', '2026-02-28', 40, NULL, N'KPI-2026-040-FEB'),
  ('2026-03-01', '2026-03-31', 40, NULL, N'KPI-2026-040-MAR'),
  ('2026-04-01', '2026-04-30', 40, NULL, N'KPI-2026-040-APR'),
  ('2026-05-01', '2026-05-31', 40, NULL, N'KPI-2026-040-MAY'),
  ('2026-06-01', '2026-06-30', 40, NULL, N'KPI-2026-040-JUN'),
  ('2026-07-01', '2026-07-31', 40, NULL, N'KPI-2026-040-JUL'),
  ('2026-08-01', '2026-08-31', 50, NULL, N'KPI-2026-040-AUG'),
  ('2026-09-01', '2026-09-30', 40, NULL, N'KPI-2026-040-SEP'),
  ('2026-10-01', '2026-10-31', 50, NULL, N'KPI-2026-040-OCT'),
  ('2026-11-01', '2026-11-30', 40, NULL, N'KPI-2026-040-NOV'),
  ('2026-12-01', '2026-12-31', 40, NULL, N'KPI-2026-040-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-040';
GO

-- KPI 041: Sponsored Posts Reach
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-041')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-041', N'Sponsored Posts Reach', NULL, N'Digital Marketing', N'Count', 10, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Digital Marketing Activity', N'To assign', N'Social Media', N'System Integration', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Digital Marketing', N'To confirm', N'10-12 posts', N'Number', N'41');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-041-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'Social Media', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 1, NULL, N'KPI-2026-041-JAN'),
  ('2026-02-01', '2026-02-28', NULL, N'-', N'KPI-2026-041-FEB'),
  ('2026-03-01', '2026-03-31', 1, NULL, N'KPI-2026-041-MAR'),
  ('2026-04-01', '2026-04-30', 1, NULL, N'KPI-2026-041-APR'),
  ('2026-05-01', '2026-05-31', NULL, N'-', N'KPI-2026-041-MAY'),
  ('2026-06-01', '2026-06-30', 1, NULL, N'KPI-2026-041-JUN'),
  ('2026-07-01', '2026-07-31', NULL, N'-', N'KPI-2026-041-JUL'),
  ('2026-08-01', '2026-08-31', 2, NULL, N'KPI-2026-041-AUG'),
  ('2026-09-01', '2026-09-30', 1, NULL, N'KPI-2026-041-SEP'),
  ('2026-10-01', '2026-10-31', 1, NULL, N'KPI-2026-041-OCT'),
  ('2026-11-01', '2026-11-30', 2, NULL, N'KPI-2026-041-NOV'),
  ('2026-12-01', '2026-12-31', 1, NULL, N'KPI-2026-041-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-041';
GO

-- KPI 042: Sales Uplift
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-042')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-042', N'Sales Uplift', NULL, N'Digital Marketing', N'Count', 12, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Digital Marketing Activity', N'To assign', N'Social Media', N'System Integration', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Digital Marketing', N'To confirm', N'12 offers; >=15% uplift', N'% / Number', N'42');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-042-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'Social Media', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 1, NULL, N'KPI-2026-042-JAN'),
  ('2026-02-01', '2026-02-28', 1, NULL, N'KPI-2026-042-FEB'),
  ('2026-03-01', '2026-03-31', 1, NULL, N'KPI-2026-042-MAR'),
  ('2026-04-01', '2026-04-30', 1, NULL, N'KPI-2026-042-APR'),
  ('2026-05-01', '2026-05-31', 1, NULL, N'KPI-2026-042-MAY'),
  ('2026-06-01', '2026-06-30', 1, NULL, N'KPI-2026-042-JUN'),
  ('2026-07-01', '2026-07-31', 1, NULL, N'KPI-2026-042-JUL'),
  ('2026-08-01', '2026-08-31', 2, NULL, N'KPI-2026-042-AUG'),
  ('2026-09-01', '2026-09-30', 1, NULL, N'KPI-2026-042-SEP'),
  ('2026-10-01', '2026-10-31', 1, NULL, N'KPI-2026-042-OCT'),
  ('2026-11-01', '2026-11-30', 2, NULL, N'KPI-2026-042-NOV'),
  ('2026-12-01', '2026-12-31', 2, NULL, N'KPI-2026-042-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-042';
GO

-- KPI 043: Reach, Conversion
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-043')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-043', N'Reach, Conversion', NULL, N'Digital Marketing', N'Count', NULL, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Digital Marketing Activity', N'To assign', N'Social Media', N'System Integration', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Digital Marketing', N'To confirm', N'Reach >=25k; Conv >=10%', N'Number / %', N'43');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-043-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'Social Media', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', NULL, N'-', N'KPI-2026-043-JAN'),
  ('2026-02-01', '2026-02-28', NULL, N'-', N'KPI-2026-043-FEB'),
  ('2026-03-01', '2026-03-31', NULL, N'-', N'KPI-2026-043-MAR'),
  ('2026-04-01', '2026-04-30', NULL, N'-', N'KPI-2026-043-APR'),
  ('2026-05-01', '2026-05-31', NULL, N'Plan', N'KPI-2026-043-MAY'),
  ('2026-06-01', '2026-06-30', NULL, N'Tease', N'KPI-2026-043-JUN'),
  ('2026-07-01', '2026-07-31', NULL, N'Launch', N'KPI-2026-043-JUL'),
  ('2026-08-01', '2026-08-31', NULL, N'Peak', N'KPI-2026-043-AUG'),
  ('2026-09-01', '2026-09-30', NULL, N'Wrap', N'KPI-2026-043-SEP'),
  ('2026-10-01', '2026-10-31', NULL, N'-', N'KPI-2026-043-OCT'),
  ('2026-11-01', '2026-11-30', NULL, N'-', N'KPI-2026-043-NOV'),
  ('2026-12-01', '2026-12-31', NULL, N'-', N'KPI-2026-043-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-043';
GO

-- KPI 044: Traffic Growth, Bounce Rate
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-044')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-044', N'Traffic Growth, Bounce Rate', NULL, N'Digital Marketing', N'Percentage', NULL, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Digital Marketing Activity', N'To assign', N'Social Media', N'System Integration', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Digital Marketing', N'To confirm', N'Monthly updates; Bounce <50%', N'%', N'44');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-044-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'Social Media', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', NULL, N'Y', N'KPI-2026-044-JAN'),
  ('2026-02-01', '2026-02-28', NULL, N'Y', N'KPI-2026-044-FEB'),
  ('2026-03-01', '2026-03-31', NULL, N'Y', N'KPI-2026-044-MAR'),
  ('2026-04-01', '2026-04-30', NULL, N'Y', N'KPI-2026-044-APR'),
  ('2026-05-01', '2026-05-31', NULL, N'Y', N'KPI-2026-044-MAY'),
  ('2026-06-01', '2026-06-30', NULL, N'Y', N'KPI-2026-044-JUN'),
  ('2026-07-01', '2026-07-31', NULL, N'Y', N'KPI-2026-044-JUL'),
  ('2026-08-01', '2026-08-31', NULL, N'Y', N'KPI-2026-044-AUG'),
  ('2026-09-01', '2026-09-30', NULL, N'Y', N'KPI-2026-044-SEP'),
  ('2026-10-01', '2026-10-31', NULL, N'Y', N'KPI-2026-044-OCT'),
  ('2026-11-01', '2026-11-30', NULL, N'Y', N'KPI-2026-044-NOV'),
  ('2026-12-01', '2026-12-31', NULL, N'Y', N'KPI-2026-044-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-044';
GO

-- KPI 045: Organic Traffic, Keywords
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-045')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-045', N'Organic Traffic, Keywords', NULL, N'Digital Marketing', N'Count', NULL, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Digital Marketing Activity', N'To assign', N'Social Media', N'System Integration', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Digital Marketing', N'To confirm', N'Traffic >=10k; 20 keywords', N'Number', N'45');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-045-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'Social Media', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', NULL, N'Tech SEO', N'KPI-2026-045-JAN'),
  ('2026-02-01', '2026-02-28', NULL, N'Content', N'KPI-2026-045-FEB'),
  ('2026-03-01', '2026-03-31', NULL, N'Content', N'KPI-2026-045-MAR'),
  ('2026-04-01', '2026-04-30', NULL, N'Keywords', N'KPI-2026-045-APR'),
  ('2026-05-01', '2026-05-31', NULL, N'Keywords', N'KPI-2026-045-MAY'),
  ('2026-06-01', '2026-06-30', NULL, N'Keywords', N'KPI-2026-045-JUN'),
  ('2026-07-01', '2026-07-31', NULL, N'Backlinks', N'KPI-2026-045-JUL'),
  ('2026-08-01', '2026-08-31', NULL, N'Backlinks', N'KPI-2026-045-AUG'),
  ('2026-09-01', '2026-09-30', NULL, N'Backlinks', N'KPI-2026-045-SEP'),
  ('2026-10-01', '2026-10-31', NULL, N'Ranking', N'KPI-2026-045-OCT'),
  ('2026-11-01', '2026-11-30', NULL, N'Ranking', N'KPI-2026-045-NOV'),
  ('2026-12-01', '2026-12-31', NULL, N'Audit', N'KPI-2026-045-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-045';
GO

-- KPI 046: Followers, Engagement
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-046')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-046', N'Followers, Engagement', NULL, N'Digital Marketing', N'Count', NULL, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Digital Marketing Activity', N'To assign', N'Social Media', N'System Integration', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Digital Marketing', N'To confirm', N'>=15k followers', N'Number / %', N'46');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-046-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'Social Media', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', NULL, N'Setup', N'KPI-2026-046-JAN'),
  ('2026-02-01', '2026-02-28', 1000, NULL, N'KPI-2026-046-FEB'),
  ('2026-03-01', '2026-03-31', 2000, NULL, N'KPI-2026-046-MAR'),
  ('2026-04-01', '2026-04-30', 3000, NULL, N'KPI-2026-046-APR'),
  ('2026-05-01', '2026-05-31', 4000, NULL, N'KPI-2026-046-MAY'),
  ('2026-06-01', '2026-06-30', 5500, NULL, N'KPI-2026-046-JUN'),
  ('2026-07-01', '2026-07-31', 7000, NULL, N'KPI-2026-046-JUL'),
  ('2026-08-01', '2026-08-31', 9000, NULL, N'KPI-2026-046-AUG'),
  ('2026-09-01', '2026-09-30', 11000, NULL, N'KPI-2026-046-SEP'),
  ('2026-10-01', '2026-10-31', 13000, NULL, N'KPI-2026-046-OCT'),
  ('2026-11-01', '2026-11-30', 14500, NULL, N'KPI-2026-046-NOV'),
  ('2026-12-01', '2026-12-31', 15000, NULL, N'KPI-2026-046-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-046';
GO

-- KPI 047: Open Rate, CTR
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-047')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-047', N'Open Rate, CTR', NULL, N'Digital Marketing', N'Percentage', 12, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Digital Marketing Activity', N'To assign', N'Social Media', N'System Integration', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Digital Marketing', N'To confirm', N'12 editions; Open >=35%', N'%', N'47');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-047-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'Social Media', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 1, NULL, N'KPI-2026-047-JAN'),
  ('2026-02-01', '2026-02-28', 1, NULL, N'KPI-2026-047-FEB'),
  ('2026-03-01', '2026-03-31', 1, NULL, N'KPI-2026-047-MAR'),
  ('2026-04-01', '2026-04-30', 1, NULL, N'KPI-2026-047-APR'),
  ('2026-05-01', '2026-05-31', 1, NULL, N'KPI-2026-047-MAY'),
  ('2026-06-01', '2026-06-30', 1, NULL, N'KPI-2026-047-JUN'),
  ('2026-07-01', '2026-07-31', 1, NULL, N'KPI-2026-047-JUL'),
  ('2026-08-01', '2026-08-31', 1, NULL, N'KPI-2026-047-AUG'),
  ('2026-09-01', '2026-09-30', 1, NULL, N'KPI-2026-047-SEP'),
  ('2026-10-01', '2026-10-31', 1, NULL, N'KPI-2026-047-OCT'),
  ('2026-11-01', '2026-11-30', 1, NULL, N'KPI-2026-047-NOV'),
  ('2026-12-01', '2026-12-31', 1, NULL, N'KPI-2026-047-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-047';
GO

-- KPI 048: Reach, Engagement, Conversions
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-048')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-048', N'Reach, Engagement, Conversions', NULL, N'Digital Marketing', N'Count', 10, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Digital Marketing Activity', N'To assign', N'Social Media', N'System Integration', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Digital Marketing', N'To confirm', N'10-15 influencers', N'Number / %', N'48');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-048-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'Social Media', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', 1, NULL, N'KPI-2026-048-JAN'),
  ('2026-02-01', '2026-02-28', 1, NULL, N'KPI-2026-048-FEB'),
  ('2026-03-01', '2026-03-31', 1, NULL, N'KPI-2026-048-MAR'),
  ('2026-04-01', '2026-04-30', 1, NULL, N'KPI-2026-048-APR'),
  ('2026-05-01', '2026-05-31', NULL, N'-', N'KPI-2026-048-MAY'),
  ('2026-06-01', '2026-06-30', 1, NULL, N'KPI-2026-048-JUN'),
  ('2026-07-01', '2026-07-31', NULL, N'-', N'KPI-2026-048-JUL'),
  ('2026-08-01', '2026-08-31', 3, NULL, N'KPI-2026-048-AUG'),
  ('2026-09-01', '2026-09-30', 2, NULL, N'KPI-2026-048-SEP'),
  ('2026-10-01', '2026-10-31', 2, NULL, N'KPI-2026-048-OCT'),
  ('2026-11-01', '2026-11-30', 2, NULL, N'KPI-2026-048-NOV'),
  ('2026-12-01', '2026-12-31', 2, NULL, N'KPI-2026-048-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-048';
GO

-- KPI 049: Reach, Engagement
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'KPI-049')
INSERT INTO dbo.KpiDefinition (
  KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction,
  ThresholdExcellent, ThresholdGood, ThresholdAverage, IsActive,
  StrategicObjective, KpiOwnerName, DataSource, CollectionMethod, AlertThresholdText, AlertThresholdPercent,
  EvidenceRequired, VerificationRole, DashboardGroup, SystemModule, IntegrationMethod, TargetText, UnitOfMeasure, SourceRef
) VALUES (
  N'KPI-049', N'Reach, Engagement', NULL, N'Digital Marketing', N'Count', 4, 1.0, N'Monthly', N'HigherIsBetter',
  100, 90, 75, 1,
  N'Digital Marketing Activity', N'To assign', N'Social Media', N'System Integration', N'90% of target', 90,
  1, N'Department Head / MI', N'Executive KPI Dashboard', N'Digital Marketing', N'To confirm', N'4-5 campaigns', N'Number / %', N'49');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.KpiResult WHERE RecordType = 'Measurement' AND MisRecordId LIKE 'KPI-2026-049-%')
INSERT INTO dbo.KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText, TargetValue, RecordType, DataSource, VerificationStatus, MisRecordId)
SELECT kd.KpiDefID, NULL, v.PeriodStart, v.PeriodEnd,
       N'Monthly', v.PlannedNum, v.PlannedText, v.PlannedNum, 'Measurement', N'Social Media', 'Pending', v.MisId
FROM dbo.KpiDefinition kd
CROSS APPLY (VALUES
  ('2026-01-01', '2026-01-31', NULL, N'New Yr', N'KPI-2026-049-JAN'),
  ('2026-02-01', '2026-02-28', NULL, N'-', N'KPI-2026-049-FEB'),
  ('2026-03-01', '2026-03-31', NULL, N'-', N'KPI-2026-049-MAR'),
  ('2026-04-01', '2026-04-30', NULL, N'Easter', N'KPI-2026-049-APR'),
  ('2026-05-01', '2026-05-31', NULL, N'-', N'KPI-2026-049-MAY'),
  ('2026-06-01', '2026-06-30', NULL, N'-', N'KPI-2026-049-JUN'),
  ('2026-07-01', '2026-07-31', NULL, N'-', N'KPI-2026-049-JUL'),
  ('2026-08-01', '2026-08-31', NULL, N'BTS', N'KPI-2026-049-AUG'),
  ('2026-09-01', '2026-09-30', NULL, N'Meskel', N'KPI-2026-049-SEP'),
  ('2026-10-01', '2026-10-31', NULL, N'-', N'KPI-2026-049-OCT'),
  ('2026-11-01', '2026-11-30', NULL, N'-', N'KPI-2026-049-NOV'),
  ('2026-12-01', '2026-12-31', NULL, N'Xmas', N'KPI-2026-049-DEC')
) AS v(PeriodStart, PeriodEnd, PlannedNum, PlannedText, MisId)
WHERE kd.KpiCode = 'KPI-049';
GO
