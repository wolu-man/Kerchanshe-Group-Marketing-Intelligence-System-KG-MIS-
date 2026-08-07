-- ===========================================================================
-- KG-MIS - Hybrid Market Intelligence System
-- MS SQL Server physical schema (DDL)
-- Reference: Technical Design Specification (TDS) v1.0
-- Naming: PascalCase singular tables, <Entity>ID primary keys,
--         CreatedAt (DATETIME2) on all tables, UpdatedAt on mutable entities.
-- ===========================================================================

IF DB_ID(N'KG_MIS') IS NULL
BEGIN
    CREATE DATABASE KG_MIS;
END
GO

USE KG_MIS;
GO

-- ---------------------------------------------------------------------------
-- Access & Identity
-- ---------------------------------------------------------------------------

IF OBJECT_ID('dbo.Role', 'U') IS NULL
CREATE TABLE dbo.Role
(
    RoleID   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Role PRIMARY KEY,
    RoleName VARCHAR(50)  NOT NULL CONSTRAINT UQ_Role_RoleName UNIQUE,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Role_CreatedAt DEFAULT SYSUTCDATETIME()
);
GO

-- Maps a CUAS claim/group value to an internal application role (FDS EPIC-04).
IF OBJECT_ID('dbo.RoleMapping', 'U') IS NULL
CREATE TABLE dbo.RoleMapping
(
    MappingID   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_RoleMapping PRIMARY KEY,
    CUASClaim   VARCHAR(150) NOT NULL CONSTRAINT UQ_RoleMapping_CUASClaim UNIQUE,
    RoleID      INT NOT NULL CONSTRAINT FK_RoleMapping_Role FOREIGN KEY REFERENCES dbo.Role(RoleID),
    CreatedAt   DATETIME2 NOT NULL CONSTRAINT DF_RoleMapping_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt   DATETIME2 NULL
);
GO

IF OBJECT_ID('dbo.[User]', 'U') IS NULL
CREATE TABLE dbo.[User]
(
    UserID    INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_User PRIMARY KEY,
    CUAS_ID   VARCHAR(100) NOT NULL CONSTRAINT UQ_User_CUAS_ID UNIQUE,
    Name      NVARCHAR(150) NOT NULL,
    Email     NVARCHAR(200) NULL,
    RoleID    INT NOT NULL CONSTRAINT FK_User_Role FOREIGN KEY REFERENCES dbo.Role(RoleID),
    -- Local dev fallback credential only. Never used in production (CUAS is SSO).
    PasswordHash NVARCHAR(255) NULL,
    IsActive  BIT NOT NULL CONSTRAINT DF_User_IsActive DEFAULT 1,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_User_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2 NULL
);
GO

CREATE INDEX IX_User_RoleID ON dbo.[User](RoleID);
GO

-- ---------------------------------------------------------------------------
-- Geography & Outlets
-- ---------------------------------------------------------------------------

IF OBJECT_ID('dbo.Region', 'U') IS NULL
CREATE TABLE dbo.Region
(
    RegionID   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Region PRIMARY KEY,
    RegionName NVARCHAR(100) NOT NULL,
    Country    VARCHAR(100) NOT NULL,
    CreatedAt  DATETIME2 NOT NULL CONSTRAINT DF_Region_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt  DATETIME2 NULL
);
GO

IF OBJECT_ID('dbo.Outlet', 'U') IS NULL
CREATE TABLE dbo.Outlet
(
    OutletID   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Outlet PRIMARY KEY,
    RegionID   INT NOT NULL CONSTRAINT FK_Outlet_Region FOREIGN KEY REFERENCES dbo.Region(RegionID),
    OutletName NVARCHAR(150) NOT NULL,
    City       NVARCHAR(100) NOT NULL,
    IsActive   BIT NOT NULL CONSTRAINT DF_Outlet_IsActive DEFAULT 1,
    CreatedAt  DATETIME2 NOT NULL CONSTRAINT DF_Outlet_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt  DATETIME2 NULL
);
GO

CREATE INDEX IX_Outlet_RegionID ON dbo.Outlet(RegionID);
GO

-- ---------------------------------------------------------------------------
-- D365FO cache (read-only, refreshed by EPIC-03 sync job)
-- ---------------------------------------------------------------------------

IF OBJECT_ID('dbo.Product', 'U') IS NULL
CREATE TABLE dbo.Product
(
    ProductID   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Product PRIMARY KEY,
    D365FOKey   VARCHAR(100) NULL CONSTRAINT UQ_Product_D365FOKey UNIQUE,
    ProductCode VARCHAR(50) NOT NULL CONSTRAINT UQ_Product_ProductCode UNIQUE,
    Name        NVARCHAR(150) NOT NULL,
    Category    VARCHAR(100) NOT NULL,
    UnitPrice   DECIMAL(18,2) NULL,
    IsActive    BIT NOT NULL CONSTRAINT DF_Product_IsActive DEFAULT 1,
    CreatedAt   DATETIME2 NOT NULL CONSTRAINT DF_Product_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt   DATETIME2 NULL
);
GO

IF OBJECT_ID('dbo.Customer', 'U') IS NULL
CREATE TABLE dbo.Customer
(
    CustomerID   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Customer PRIMARY KEY,
    D365FOKey    VARCHAR(100) NULL CONSTRAINT UQ_Customer_D365FOKey UNIQUE,
    CustomerCode VARCHAR(50) NOT NULL CONSTRAINT UQ_Customer_CustomerCode UNIQUE,
    Name         NVARCHAR(150) NOT NULL,
    CustomerType VARCHAR(50) NULL, -- Distributor / Retailer / End User
    IsActive     BIT NOT NULL CONSTRAINT DF_Customer_IsActive DEFAULT 1,
    CreatedAt    DATETIME2 NOT NULL CONSTRAINT DF_Customer_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt    DATETIME2 NULL
);
GO

IF OBJECT_ID('dbo.SalesRecord', 'U') IS NULL
CREATE TABLE dbo.SalesRecord
(
    SalesID    INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SalesRecord PRIMARY KEY,
    D365FOKey  VARCHAR(100) NULL CONSTRAINT UQ_SalesRecord_D365FOKey UNIQUE,
    ProductID  INT NOT NULL CONSTRAINT FK_SalesRecord_Product FOREIGN KEY REFERENCES dbo.Product(ProductID),
    CustomerID INT NOT NULL CONSTRAINT FK_SalesRecord_Customer FOREIGN KEY REFERENCES dbo.Customer(CustomerID),
    SaleDate   DATE NOT NULL,
    Quantity   DECIMAL(18,3) NOT NULL,
    Amount     DECIMAL(18,2) NOT NULL,
    RegionID   INT NULL CONSTRAINT FK_SalesRecord_Region FOREIGN KEY REFERENCES dbo.Region(RegionID),
    CreatedAt  DATETIME2 NOT NULL CONSTRAINT DF_SalesRecord_CreatedAt DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX IX_SalesRecord_ProductID ON dbo.SalesRecord(ProductID);
CREATE INDEX IX_SalesRecord_CustomerID ON dbo.SalesRecord(CustomerID);
CREATE INDEX IX_SalesRecord_SaleDate ON dbo.SalesRecord(SaleDate);
GO

-- ---------------------------------------------------------------------------
-- Market Visit Reports (FDS EPIC-01)
-- ---------------------------------------------------------------------------

IF OBJECT_ID('dbo.MarketVisitReport', 'U') IS NULL
CREATE TABLE dbo.MarketVisitReport
(
    ReportID  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_MarketVisitReport PRIMARY KEY,
    UserID    INT NOT NULL CONSTRAINT FK_MarketVisitReport_User FOREIGN KEY REFERENCES dbo.[User](UserID),
    OutletID  INT NOT NULL CONSTRAINT FK_MarketVisitReport_Outlet FOREIGN KEY REFERENCES dbo.Outlet(OutletID),
    VisitDate DATE NOT NULL,
    Notes     NVARCHAR(MAX) NULL,
    Status    VARCHAR(20) NOT NULL CONSTRAINT DF_MarketVisitReport_Status DEFAULT 'Draft', -- Draft / Submitted / Reviewed
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_MarketVisitReport_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2 NULL
);
GO

CREATE INDEX IX_MarketVisitReport_UserID ON dbo.MarketVisitReport(UserID);
CREATE INDEX IX_MarketVisitReport_OutletID ON dbo.MarketVisitReport(OutletID);
GO

-- ---------------------------------------------------------------------------
-- Surveys (FDS EPIC-01)
-- ---------------------------------------------------------------------------

IF OBJECT_ID('dbo.Survey', 'U') IS NULL
CREATE TABLE dbo.Survey
(
    SurveyID     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Survey PRIMARY KEY,
    Title        NVARCHAR(200) NOT NULL,
    BusinessUnit VARCHAR(100) NOT NULL,
    Status       VARCHAR(20) NOT NULL CONSTRAINT DF_Survey_Status DEFAULT 'Draft', -- Draft / Published / Closed
    CreatedBy    INT NOT NULL CONSTRAINT FK_Survey_User FOREIGN KEY REFERENCES dbo.[User](UserID),
    CreatedAt    DATETIME2 NOT NULL CONSTRAINT DF_Survey_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt    DATETIME2 NULL
);
GO

IF OBJECT_ID('dbo.SurveyQuestion', 'U') IS NULL
CREATE TABLE dbo.SurveyQuestion
(
    QuestionID     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SurveyQuestion PRIMARY KEY,
    SurveyID       INT NOT NULL CONSTRAINT FK_SurveyQuestion_Survey FOREIGN KEY REFERENCES dbo.Survey(SurveyID),
    QuestionType   VARCHAR(20) NOT NULL, -- SingleChoice / MultiChoice / Text / Numeric / Rating
    QuestionText   NVARCHAR(1000) NOT NULL,
    OptionsJSON    NVARCHAR(MAX) NULL,   -- JSON array for choice questions
    LogicRuleJSON  NVARCHAR(MAX) NULL,   -- conditional / skip logic
    IsRequired     BIT NOT NULL CONSTRAINT DF_SurveyQuestion_IsRequired DEFAULT 1,
    MinValue       DECIMAL(18,2) NULL,   -- numeric / rating bounds
    MaxValue       DECIMAL(18,2) NULL,
    SortOrder      INT NOT NULL CONSTRAINT DF_SurveyQuestion_SortOrder DEFAULT 0,
    CreatedAt      DATETIME2 NOT NULL CONSTRAINT DF_SurveyQuestion_CreatedAt DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX IX_SurveyQuestion_SurveyID ON dbo.SurveyQuestion(SurveyID);
GO

IF OBJECT_ID('dbo.SurveyResponse', 'U') IS NULL
CREATE TABLE dbo.SurveyResponse
(
    ResponseID     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SurveyResponse PRIMARY KEY,
    SurveyID       INT NOT NULL CONSTRAINT FK_SurveyResponse_Survey FOREIGN KEY REFERENCES dbo.Survey(SurveyID),
    UserID         INT NOT NULL CONSTRAINT FK_SurveyResponse_User FOREIGN KEY REFERENCES dbo.[User](UserID),
    OutletID       INT NULL CONSTRAINT FK_SurveyResponse_Outlet FOREIGN KEY REFERENCES dbo.Outlet(OutletID),
    RespondentType VARCHAR(50) NULL, -- Retailer / Distributor / End User / Other
    Status         VARCHAR(20) NOT NULL CONSTRAINT DF_SurveyResponse_Status DEFAULT 'Submitted', -- Submitted / Reviewed
    CreatedAt      DATETIME2 NOT NULL CONSTRAINT DF_SurveyResponse_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt      DATETIME2 NULL
);
GO

CREATE INDEX IX_SurveyResponse_SurveyID ON dbo.SurveyResponse(SurveyID);
GO

IF OBJECT_ID('dbo.SurveyAnswer', 'U') IS NULL
CREATE TABLE dbo.SurveyAnswer
(
    AnswerID   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SurveyAnswer PRIMARY KEY,
    ResponseID INT NOT NULL CONSTRAINT FK_SurveyAnswer_Response FOREIGN KEY REFERENCES dbo.SurveyResponse(ResponseID),
    QuestionID INT NOT NULL CONSTRAINT FK_SurveyAnswer_Question FOREIGN KEY REFERENCES dbo.SurveyQuestion(QuestionID),
    AnswerValue NVARCHAR(MAX) NOT NULL,
    CreatedAt  DATETIME2 NOT NULL CONSTRAINT DF_SurveyAnswer_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_SurveyAnswer_Response_Question UNIQUE (ResponseID, QuestionID)
);
GO

CREATE INDEX IX_SurveyAnswer_QuestionID ON dbo.SurveyAnswer(QuestionID);
GO

-- ---------------------------------------------------------------------------
-- Competitor Pricing (FDS EPIC-02)
-- ---------------------------------------------------------------------------

IF OBJECT_ID('dbo.PriceGapThreshold', 'U') IS NULL
CREATE TABLE dbo.PriceGapThreshold
(
    ThresholdID      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PriceGapThreshold PRIMARY KEY,
    ProductCategory  VARCHAR(100) NOT NULL CONSTRAINT UQ_PriceGapThreshold_Category UNIQUE,
    ThresholdPercent DECIMAL(5,2) NOT NULL,
    CreatedAt        DATETIME2 NOT NULL CONSTRAINT DF_PriceGapThreshold_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt        DATETIME2 NULL
);
GO

IF OBJECT_ID('dbo.CompetitorPrice', 'U') IS NULL
CREATE TABLE dbo.CompetitorPrice
(
    PriceID       INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CompetitorPrice PRIMARY KEY,
    ProductID     INT NOT NULL CONSTRAINT FK_CompetitorPrice_Product FOREIGN KEY REFERENCES dbo.Product(ProductID),
    CompetitorName NVARCHAR(150) NOT NULL,
    Price         DECIMAL(18,2) NOT NULL,
    RegionID      INT NOT NULL CONSTRAINT FK_CompetitorPrice_Region FOREIGN KEY REFERENCES dbo.Region(RegionID),
    OutletID      INT NULL CONSTRAINT FK_CompetitorPrice_Outlet FOREIGN KEY REFERENCES dbo.Outlet(OutletID),
    RecordedBy    INT NOT NULL CONSTRAINT FK_CompetitorPrice_User FOREIGN KEY REFERENCES dbo.[User](UserID),
    RecordedDate  DATE NOT NULL,
    ObservedAt    DATETIME2 NOT NULL CONSTRAINT DF_CompetitorPrice_ObservedAt DEFAULT SYSUTCDATETIME(),
    CreatedAt     DATETIME2 NOT NULL CONSTRAINT DF_CompetitorPrice_CreatedAt DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX IX_CompetitorPrice_ProductID ON dbo.CompetitorPrice(ProductID);
CREATE INDEX IX_CompetitorPrice_RegionID ON dbo.CompetitorPrice(RegionID);
CREATE INDEX IX_CompetitorPrice_RecordedDate ON dbo.CompetitorPrice(RecordedDate);
GO

IF OBJECT_ID('dbo.PriceGapAlert', 'U') IS NULL
CREATE TABLE dbo.PriceGapAlert
(
    GapAlertID         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PriceGapAlert PRIMARY KEY,
    PriceID            INT NOT NULL CONSTRAINT FK_PriceGapAlert_Price FOREIGN KEY REFERENCES dbo.CompetitorPrice(PriceID),
    OwnPrice           DECIMAL(18,2) NOT NULL,
    GapPercent         DECIMAL(5,2) NOT NULL,
    ThresholdBreached  BIT NOT NULL CONSTRAINT DF_PriceGapAlert_ThresholdBreached DEFAULT 1,
    Status             VARCHAR(20) NOT NULL CONSTRAINT DF_PriceGapAlert_Status DEFAULT 'Active', -- Active / Resolved / Dismissed
    CreatedAt          DATETIME2 NOT NULL CONSTRAINT DF_PriceGapAlert_CreatedAt DEFAULT SYSUTCDATETIME(),
    ResolvedAt         DATETIME2 NULL
);
GO

CREATE INDEX IX_PriceGapAlert_PriceID ON dbo.PriceGapAlert(PriceID);
CREATE INDEX IX_PriceGapAlert_Status ON dbo.PriceGapAlert(Status);
GO

-- ---------------------------------------------------------------------------
-- Notifications (FDS EPIC-05) & Sync (FDS EPIC-03)
-- ---------------------------------------------------------------------------

IF OBJECT_ID('dbo.NotificationConfig', 'U') IS NULL
CREATE TABLE dbo.NotificationConfig
(
    ConfigID    INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_NotificationConfig PRIMARY KEY,
    TriggerEvent VARCHAR(100) NOT NULL, -- NewReport / SurveyPublished / PriceGapAlert / SyncFailure
    Channel     VARCHAR(20) NOT NULL,   -- Email / SMS / WhatsApp
    RoleID      INT NOT NULL CONSTRAINT FK_NotificationConfig_Role FOREIGN KEY REFERENCES dbo.Role(RoleID),
    Enabled     BIT NOT NULL CONSTRAINT DF_NotificationConfig_Enabled DEFAULT 1,
    CreatedAt   DATETIME2 NOT NULL CONSTRAINT DF_NotificationConfig_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt   DATETIME2 NULL,
    CONSTRAINT UQ_NotificationConfig_Event_Channel_Role UNIQUE (TriggerEvent, Channel, RoleID)
);
GO

IF OBJECT_ID('dbo.Notification', 'U') IS NULL
CREATE TABLE dbo.Notification
(
    NotificationID   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Notification PRIMARY KEY,
    TriggerEvent     VARCHAR(100) NOT NULL,
    Channel          VARCHAR(20) NOT NULL,
    RecipientUserID  INT NOT NULL CONSTRAINT FK_Notification_User FOREIGN KEY REFERENCES dbo.[User](UserID),
    Subject          NVARCHAR(300) NULL,
    Payload          NVARCHAR(MAX) NULL,
    Status           VARCHAR(20) NOT NULL CONSTRAINT DF_Notification_Status DEFAULT 'Pending', -- Pending / Sent / Retried / Failed
    Attempts         INT NOT NULL CONSTRAINT DF_Notification_Attempts DEFAULT 0,
    ProviderMessage  NVARCHAR(MAX) NULL,
    SentAt           DATETIME2 NULL,
    CreatedAt        DATETIME2 NOT NULL CONSTRAINT DF_Notification_CreatedAt DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX IX_Notification_RecipientUserID ON dbo.Notification(RecipientUserID);
CREATE INDEX IX_Notification_Status ON dbo.Notification(Status);
GO

IF OBJECT_ID('dbo.SyncLog', 'U') IS NULL
CREATE TABLE dbo.SyncLog
(
    SyncLogID         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SyncLog PRIMARY KEY,
    Entity            VARCHAR(50) NOT NULL, -- Product / Customer / Sales
    Status            VARCHAR(20) NOT NULL, -- Running / Success / Failed
    RecordsProcessed  INT NOT NULL CONSTRAINT DF_SyncLog_RecordsProcessed DEFAULT 0,
    ErrorCount        INT NOT NULL CONSTRAINT DF_SyncLog_ErrorCount DEFAULT 0,
    ErrorDetail       NVARCHAR(MAX) NULL,
    TriggeredBy       INT NULL CONSTRAINT FK_SyncLog_User FOREIGN KEY REFERENCES dbo.[User](UserID), -- NULL = scheduled
    StartedAt         DATETIME2 NOT NULL CONSTRAINT DF_SyncLog_StartedAt DEFAULT SYSUTCDATETIME(),
    FinishedAt        DATETIME2 NULL
);
GO

CREATE INDEX IX_SyncLog_Entity ON dbo.SyncLog(Entity);
CREATE INDEX IX_SyncLog_StartedAt ON dbo.SyncLog(StartedAt);
GO

-- ---------------------------------------------------------------------------
-- Audit (SDD Section 7.3)
-- ---------------------------------------------------------------------------

IF OBJECT_ID('dbo.AuditLog', 'U') IS NULL
CREATE TABLE dbo.AuditLog
(
    AuditLogID INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AuditLog PRIMARY KEY,
    UserID     INT NULL CONSTRAINT FK_AuditLog_User FOREIGN KEY REFERENCES dbo.[User](UserID),
    Action     VARCHAR(100) NOT NULL,
    Entity     VARCHAR(50) NOT NULL,
    EntityID   INT NULL,
    Detail     NVARCHAR(MAX) NULL,
    CreatedAt  DATETIME2 NOT NULL CONSTRAINT DF_AuditLog_CreatedAt DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX IX_AuditLog_CreatedAt ON dbo.AuditLog(CreatedAt);
CREATE INDEX IX_AuditLog_Entity ON dbo.AuditLog(Entity);
GO
