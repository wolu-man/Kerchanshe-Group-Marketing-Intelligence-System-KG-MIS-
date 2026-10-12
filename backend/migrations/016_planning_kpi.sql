-- 016: Planning & KPI tables
-- Adds: [Plan], PlanActivity, KpiDefinition, KpiResult

-- ---------------------------------------------------------------------------
-- [Plan] (hierarchical: Annual -> Quarterly -> Monthly -> Weekly)
-- Plan is a SQL Server reserved word, so always bracketed.
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.[Plan]', 'U') IS NULL
CREATE TABLE dbo.[Plan]
(
    PlanID                 INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Plan PRIMARY KEY,
    ParentPlanID           INT NULL CONSTRAINT FK_Plan_Parent FOREIGN KEY REFERENCES dbo.[Plan](PlanID),
    Title                  NVARCHAR(200) NOT NULL,
    Description            NVARCHAR(MAX) NULL,
    Frequency              NVARCHAR(20) NOT NULL CONSTRAINT DF_Plan_Frequency DEFAULT 'Monthly',
    PeriodStart            DATE NOT NULL,
    PeriodEnd              DATE NOT NULL,
    PlannedSubmissionDate  DATE NULL,
    ActualSubmissionDate   DATE NULL,
    Status                 NVARCHAR(30) NOT NULL CONSTRAINT DF_Plan_Status DEFAULT 'Not Started',
    ResponsibleUserID      INT NULL CONSTRAINT FK_Plan_Responsible FOREIGN KEY REFERENCES dbo.[User](UserID),
    ResponsibleTeam        NVARCHAR(100) NULL,
    RegionID               INT NULL CONSTRAINT FK_Plan_Region FOREIGN KEY REFERENCES dbo.Region(RegionID),
    MainFocus              NVARCHAR(200) NULL,
    KeyDeliverable         NVARCHAR(MAX) NULL,
    ApprovalStatus         NVARCHAR(30) NULL CONSTRAINT DF_Plan_ApprovalStatus DEFAULT 'Draft',
    ApprovedBy             INT NULL CONSTRAINT FK_Plan_ApprovedBy FOREIGN KEY REFERENCES dbo.[User](UserID),
    ApprovedAt             DATETIME2 NULL,
    Remarks                NVARCHAR(MAX) NULL,
    CreatedBy              INT NULL CONSTRAINT FK_Plan_CreatedBy FOREIGN KEY REFERENCES dbo.[User](UserID),
    CreatedAt              DATETIME2 NOT NULL CONSTRAINT DF_Plan_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt              DATETIME2 NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Plan_ParentPlanID' AND object_id = OBJECT_ID('dbo.[Plan]'))
CREATE INDEX IX_Plan_ParentPlanID ON dbo.[Plan](ParentPlanID);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Plan_Frequency' AND object_id = OBJECT_ID('dbo.[Plan]'))
CREATE INDEX IX_Plan_Frequency ON dbo.[Plan](Frequency);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Plan_Status' AND object_id = OBJECT_ID('dbo.[Plan]'))
CREATE INDEX IX_Plan_Status ON dbo.[Plan](Status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Plan_ResponsibleUserID' AND object_id = OBJECT_ID('dbo.[Plan]'))
CREATE INDEX IX_Plan_ResponsibleUserID ON dbo.[Plan](ResponsibleUserID);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Plan_RegionID' AND object_id = OBJECT_ID('dbo.[Plan]'))
CREATE INDEX IX_Plan_RegionID ON dbo.[Plan](RegionID);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Plan_PeriodStart' AND object_id = OBJECT_ID('dbo.[Plan]'))
CREATE INDEX IX_Plan_PeriodStart ON dbo.[Plan](PeriodStart);
GO

-- ---------------------------------------------------------------------------
-- PlanActivity (activities within plans)
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.PlanActivity', 'U') IS NULL
CREATE TABLE dbo.PlanActivity
(
    ActivityID             INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PlanActivity PRIMARY KEY,
    PlanID                 INT NOT NULL CONSTRAINT FK_PlanActivity_Plan FOREIGN KEY REFERENCES dbo.[Plan](PlanID) ON DELETE CASCADE,
    Title                  NVARCHAR(200) NOT NULL,
    Description            NVARCHAR(MAX) NULL,
    DetailedActivity       NVARCHAR(MAX) NULL,
    Frequency              NVARCHAR(20) NULL,
    StartDate              DATE NOT NULL,
    EndDate                DATE NOT NULL,
    PlannedSubmissionDate  DATE NULL,
    ActualSubmissionDate   DATE NULL,
    Status                 NVARCHAR(30) NOT NULL CONSTRAINT DF_PlanActivity_Status DEFAULT 'Not Started',
    Priority               NVARCHAR(20) NULL CONSTRAINT DF_PlanActivity_Priority DEFAULT 'Medium',
    ResponsibleUserID      INT NULL CONSTRAINT FK_PlanActivity_Responsible FOREIGN KEY REFERENCES dbo.[User](UserID),
    ResponsibleTeam        NVARCHAR(100) NULL,
    RegionID               INT NULL CONSTRAINT FK_PlanActivity_Region FOREIGN KEY REFERENCES dbo.Region(RegionID),
    ProductID              INT NULL CONSTRAINT FK_PlanActivity_Product FOREIGN KEY REFERENCES dbo.Product(ProductID),
    MainFocus              NVARCHAR(200) NULL,
    ActivityType           NVARCHAR(100) NULL,
    ExpectedDeliverable    NVARCHAR(MAX) NULL,
    Target                 NVARCHAR(100) NULL,
    Unit                   NVARCHAR(50) NULL,
    ApprovalStatus         NVARCHAR(30) NULL CONSTRAINT DF_PlanActivity_ApprovalStatus DEFAULT 'Draft',
    ApprovedBy             INT NULL CONSTRAINT FK_PlanActivity_ApprovedBy FOREIGN KEY REFERENCES dbo.[User](UserID),
    ApprovedAt             DATETIME2 NULL,
    Remarks                NVARCHAR(MAX) NULL,
    CreatedBy              INT NULL CONSTRAINT FK_PlanActivity_CreatedBy FOREIGN KEY REFERENCES dbo.[User](UserID),
    CreatedAt              DATETIME2 NOT NULL CONSTRAINT DF_PlanActivity_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt              DATETIME2 NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PlanActivity_PlanID' AND object_id = OBJECT_ID('dbo.PlanActivity'))
CREATE INDEX IX_PlanActivity_PlanID ON dbo.PlanActivity(PlanID);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PlanActivity_Status' AND object_id = OBJECT_ID('dbo.PlanActivity'))
CREATE INDEX IX_PlanActivity_Status ON dbo.PlanActivity(Status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PlanActivity_ResponsibleUserID' AND object_id = OBJECT_ID('dbo.PlanActivity'))
CREATE INDEX IX_PlanActivity_ResponsibleUserID ON dbo.PlanActivity(ResponsibleUserID);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PlanActivity_RegionID' AND object_id = OBJECT_ID('dbo.PlanActivity'))
CREATE INDEX IX_PlanActivity_RegionID ON dbo.PlanActivity(RegionID);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PlanActivity_ProductID' AND object_id = OBJECT_ID('dbo.PlanActivity'))
CREATE INDEX IX_PlanActivity_ProductID ON dbo.PlanActivity(ProductID);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PlanActivity_StartDate' AND object_id = OBJECT_ID('dbo.PlanActivity'))
CREATE INDEX IX_PlanActivity_StartDate ON dbo.PlanActivity(StartDate);
GO

-- ---------------------------------------------------------------------------
-- KpiDefinition (configurable KPI targets)
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.KpiDefinition', 'U') IS NULL
CREATE TABLE dbo.KpiDefinition
(
    KpiDefID              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_KpiDefinition PRIMARY KEY,
    KpiCode               NVARCHAR(50) NOT NULL CONSTRAINT UQ_KpiDefinition_KpiCode UNIQUE,
    KpiName               NVARCHAR(200) NOT NULL,
    Description           NVARCHAR(MAX) NULL,
    Category              NVARCHAR(100) NULL,
    MeasurementUnit       NVARCHAR(50) NULL CONSTRAINT DF_KpiDefinition_MeasurementUnit DEFAULT 'Count',
    TargetValue           FLOAT NULL,
    Weight                FLOAT NULL CONSTRAINT DF_KpiDefinition_Weight DEFAULT 1.0,
    Frequency             NVARCHAR(20) NULL CONSTRAINT DF_KpiDefinition_Frequency DEFAULT 'Monthly',
    Direction             NVARCHAR(20) NULL CONSTRAINT DF_KpiDefinition_Direction DEFAULT 'HigherIsBetter',
    ThresholdExcellent    FLOAT NULL,
    ThresholdGood         FLOAT NULL,
    ThresholdAverage      FLOAT NULL,
    ApplicableRole        NVARCHAR(50) NULL,
    ApplicableRegionID    INT NULL CONSTRAINT FK_KpiDefinition_Region FOREIGN KEY REFERENCES dbo.Region(RegionID),
    ApplicableProductID   INT NULL CONSTRAINT FK_KpiDefinition_Product FOREIGN KEY REFERENCES dbo.Product(ProductID),
    IsActive              BIT NOT NULL CONSTRAINT DF_KpiDefinition_IsActive DEFAULT 1,
    CreatedAt             DATETIME2 NOT NULL CONSTRAINT DF_KpiDefinition_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt             DATETIME2 NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KpiDefinition_KpiCode' AND object_id = OBJECT_ID('dbo.KpiDefinition'))
CREATE INDEX IX_KpiDefinition_KpiCode ON dbo.KpiDefinition(KpiCode);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KpiDefinition_Category' AND object_id = OBJECT_ID('dbo.KpiDefinition'))
CREATE INDEX IX_KpiDefinition_Category ON dbo.KpiDefinition(Category);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KpiDefinition_IsActive' AND object_id = OBJECT_ID('dbo.KpiDefinition'))
CREATE INDEX IX_KpiDefinition_IsActive ON dbo.KpiDefinition(IsActive);
GO

-- ---------------------------------------------------------------------------
-- KpiResult (actual KPI results)
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.KpiResult', 'U') IS NULL
CREATE TABLE dbo.KpiResult
(
    KpiResultID          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_KpiResult PRIMARY KEY,
    KpiDefID             INT NOT NULL CONSTRAINT FK_KpiResult_KpiDef FOREIGN KEY REFERENCES dbo.KpiDefinition(KpiDefID),
    UserID               INT NOT NULL CONSTRAINT FK_KpiResult_User FOREIGN KEY REFERENCES dbo.[User](UserID),
    PeriodStart          DATE NOT NULL,
    PeriodEnd            DATE NOT NULL,
    Frequency            NVARCHAR(20) NOT NULL,
    ActualValue          FLOAT NULL,
    TargetValue          FLOAT NULL,
    AchievementPercent   FLOAT NULL,
    WeightedScore        FLOAT NULL,
    Rating               NVARCHAR(30) NULL,
    DataSource           NVARCHAR(50) NULL CONSTRAINT DF_KpiResult_DataSource DEFAULT 'Manual',
    RegionID             INT NULL CONSTRAINT FK_KpiResult_Region FOREIGN KEY REFERENCES dbo.Region(RegionID),
    ProductID            INT NULL CONSTRAINT FK_KpiResult_Product FOREIGN KEY REFERENCES dbo.Product(ProductID),
    Remarks              NVARCHAR(MAX) NULL,
    CreatedAt            DATETIME2 NOT NULL CONSTRAINT DF_KpiResult_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt            DATETIME2 NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KpiResult_KpiDefID' AND object_id = OBJECT_ID('dbo.KpiResult'))
CREATE INDEX IX_KpiResult_KpiDefID ON dbo.KpiResult(KpiDefID);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KpiResult_UserID' AND object_id = OBJECT_ID('dbo.KpiResult'))
CREATE INDEX IX_KpiResult_UserID ON dbo.KpiResult(UserID);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KpiResult_PeriodStart' AND object_id = OBJECT_ID('dbo.KpiResult'))
CREATE INDEX IX_KpiResult_PeriodStart ON dbo.KpiResult(PeriodStart);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KpiResult_Frequency' AND object_id = OBJECT_ID('dbo.KpiResult'))
CREATE INDEX IX_KpiResult_Frequency ON dbo.KpiResult(Frequency);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KpiResult_RegionID' AND object_id = OBJECT_ID('dbo.KpiResult'))
CREATE INDEX IX_KpiResult_RegionID ON dbo.KpiResult(RegionID);
GO

-- ---------------------------------------------------------------------------
-- Seed: Initial KPI definitions based on KG-MIS reporting model
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'WK_MI_REPORT')
INSERT INTO dbo.KpiDefinition (KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction, ThresholdExcellent, ThresholdGood, ThresholdAverage)
VALUES ('WK_MI_REPORT', 'Weekly MI Report Completion', 'Weekly market intelligence report submitted on time', 'Reporting', 'Count', 4, 1.5, 'Weekly', 'HigherIsBetter', 100, 80, 60);

IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'MO_MI_REPORT')
INSERT INTO dbo.KpiDefinition (KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction, ThresholdExcellent, ThresholdGood, ThresholdAverage)
VALUES ('MO_MI_REPORT', 'Monthly MI Report Completion', 'Monthly market intelligence report submitted on time', 'Reporting', 'Count', 1, 2.0, 'Monthly', 'HigherIsBetter', 100, 80, 60);

IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'COMPETITOR_PRICE')
INSERT INTO dbo.KpiDefinition (KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction, ThresholdExcellent, ThresholdGood, ThresholdAverage)
VALUES ('COMPETITOR_PRICE', 'Competitor Price Updates', 'Competitor pricing data collected and recorded', 'Data Collection', 'Count', 20, 1.0, 'Weekly', 'HigherIsBetter', 100, 80, 60);

IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'MARKET_VISIT')
INSERT INTO dbo.KpiDefinition (KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction, ThresholdExcellent, ThresholdGood, ThresholdAverage)
VALUES ('MARKET_VISIT', 'Market Visit Completion', 'Market visits completed and approved', 'Field Activity', 'Count', 10, 1.5, 'Weekly', 'HigherIsBetter', 100, 80, 60);

IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'INTERVIEW')
INSERT INTO dbo.KpiDefinition (KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction, ThresholdExcellent, ThresholdGood, ThresholdAverage)
VALUES ('INTERVIEW', 'Customer Interview Completion', 'Customer interviews conducted and submitted', 'Field Activity', 'Count', 8, 1.0, 'Weekly', 'HigherIsBetter', 100, 80, 60);

IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'WEEKLY_SALES')
INSERT INTO dbo.KpiDefinition (KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction, ThresholdExcellent, ThresholdGood, ThresholdAverage)
VALUES ('WEEKLY_SALES', 'Weekly Sales Submission', 'Weekly sales data submitted accurately', 'Sales', 'Count', 1, 1.5, 'Weekly', 'HigherIsBetter', 100, 80, 60);

IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'FORM_RESPONSE')
INSERT INTO dbo.KpiDefinition (KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction, ThresholdExcellent, ThresholdGood, ThresholdAverage)
VALUES ('FORM_RESPONSE', 'Form Response Completion', 'Assigned form responses completed', 'Data Collection', 'Count', 5, 1.0, 'Weekly', 'HigherIsBetter', 100, 80, 60);

IF NOT EXISTS (SELECT 1 FROM dbo.KpiDefinition WHERE KpiCode = 'MULTIMEDIA')
INSERT INTO dbo.KpiDefinition (KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction, ThresholdExcellent, ThresholdGood, ThresholdAverage)
VALUES ('MULTIMEDIA', 'Multimedia Capture & Validation', 'Field multimedia captured and validated', 'Data Collection', 'Count', 10, 0.5, 'Weekly', 'HigherIsBetter', 100, 80, 60);
GO
