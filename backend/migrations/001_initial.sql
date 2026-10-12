-- =============================================================================
-- KG-MIS  Migration 001 - Initial schema (v2)
-- Reference: TDS v1.0 Section 2-3 (data model), FDS v1.0 (EPIC-01..06),
--            Integration Design v1.0, Security Matrix v1.0
-- Conventions (TDS Section 6): PascalCase singular tables, <Entity>ID PKs,
--            CreatedAt (DATETIME2 UTC) on all tables, UpdatedAt on mutable.
-- This DDL is idempotent (safe to re-run).
-- =============================================================================

IF DB_ID(N'KG_MIS') IS NULL
BEGIN
    CREATE DATABASE KG_MIS;
END
GO

USE KG_MIS;
GO

-- ---------------------------------------------------------------------------
-- Migration ledger
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.__Migrations', 'U') IS NULL
CREATE TABLE dbo.__Migrations
(
    MigrationID INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Migrations PRIMARY KEY,
    Name        VARCHAR(255) NOT NULL CONSTRAINT UQ_Migrations_Name UNIQUE,
    AppliedAt   DATETIME2 NOT NULL CONSTRAINT DF_Migrations_AppliedAt DEFAULT SYSUTCDATETIME()
);
GO

-- ---------------------------------------------------------------------------
-- 1. Access & Identity (TDS 3.1)
-- ---------------------------------------------------------------------------

IF OBJECT_ID('dbo.Role', 'U') IS NULL
CREATE TABLE dbo.Role
(
    RoleID    INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Role PRIMARY KEY,
    RoleName  VARCHAR(50) NOT NULL CONSTRAINT UQ_Role_RoleName UNIQUE,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Role_CreatedAt DEFAULT SYSUTCDATETIME()
);
GO

-- CUAS claim/group value -> internal application role (FDS EPIC-04 / FR-04.3)
IF OBJECT_ID('dbo.RoleMapping', 'U') IS NULL
CREATE TABLE dbo.RoleMapping
(
    MappingID INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_RoleMapping PRIMARY KEY,
    CUASClaim VARCHAR(150) NOT NULL CONSTRAINT UQ_RoleMapping_CUASClaim UNIQUE,
    RoleID    INT NOT NULL CONSTRAINT FK_RoleMapping_Role FOREIGN KEY REFERENCES dbo.Role(RoleID),
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_RoleMapping_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2 NULL
);
GO

-- Application user linked to a CUAS identity (TDS 3.1). Passwords are NEVER
-- used in production (CUAS SSO). PasswordHash exists solely for the
-- CUAS_MOCK=true development fallback login.
IF OBJECT_ID('dbo.[User]', 'U') IS NULL
CREATE TABLE dbo.[User]
(
    UserID       INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_User PRIMARY KEY,
    CUAS_ID      VARCHAR(100) NOT NULL CONSTRAINT UQ_User_CUAS_ID UNIQUE,
    Name         NVARCHAR(150) NOT NULL,
    Email        NVARCHAR(200) NULL,
    RoleID       INT NOT NULL CONSTRAINT FK_User_Role FOREIGN KEY REFERENCES dbo.Role(RoleID),
    PasswordHash NVARCHAR(255) NULL,
    IsActive     BIT NOT NULL CONSTRAINT DF_User_IsActive DEFAULT 1,
    CreatedAt    DATETIME2 NOT NULL CONSTRAINT DF_User_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt    DATETIME2 NULL
);
GO

CREATE INDEX IX_User_RoleID ON dbo.[User](RoleID);
GO

-- ---------------------------------------------------------------------------
-- 2. Geography (TDS 3.2)
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

-- Row-level data scope (Security Matrix Section 4): a user's assigned regions.
-- Field Officers see only records for their assigned region/outlet.
IF OBJECT_ID('dbo.UserRegionAssignment', 'U') IS NULL
CREATE TABLE dbo.UserRegionAssignment
(
    AssignmentID INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_UserRegionAssignment PRIMARY KEY,
    UserID       INT NOT NULL CONSTRAINT FK_UserRegionAssignment_User FOREIGN KEY REFERENCES dbo.[User](UserID),
    RegionID     INT NOT NULL CONSTRAINT FK_UserRegionAssignment_Region FOREIGN KEY REFERENCES dbo.Region(RegionID),
    CreatedAt    DATETIME2 NOT NULL CONSTRAINT DF_UserRegionAssignment_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_UserRegionAssignment UNIQUE (UserID, RegionID)
);
GO

CREATE INDEX IX_UserRegionAssignment_User   ON dbo.UserRegionAssignment(UserID);
CREATE INDEX IX_UserRegionAssignment_Region ON dbo.UserRegionAssignment(RegionID);
GO

-- ---------------------------------------------------------------------------
-- 3. D365FO cache - read-only master data (TDS 3.3, FDS EPIC-03)
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
CREATE INDEX IX_SalesRecord_SaleDate   ON dbo.SalesRecord(SaleDate);
GO

-- ---------------------------------------------------------------------------
-- 4. Market Visit Report (TDS 3.4, Security Matrix 3.2)
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
    ReviewedBy INT NULL CONSTRAINT FK_MarketVisitReport_ReviewedBy FOREIGN KEY REFERENCES dbo.[User](UserID),
    ReviewedAt DATETIME2 NULL,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_MarketVisitReport_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2 NULL
);
GO

CREATE INDEX IX_MarketVisitReport_UserID   ON dbo.MarketVisitReport(UserID);
CREATE INDEX IX_MarketVisitReport_OutletID ON dbo.MarketVisitReport(OutletID);
GO

-- ---------------------------------------------------------------------------
-- 5. Dynamic Forms / NexForm (TDS 3.5-3.6, FDS EPIC-01)
-- Schema/validation/branching live in FormVersion.SchemaJSON (versioned JSON).
-- ---------------------------------------------------------------------------

IF OBJECT_ID('dbo.FormTemplate', 'U') IS NULL
CREATE TABLE dbo.FormTemplate
(
    TemplateID          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_FormTemplate PRIMARY KEY,
    OwnerUserID         INT NOT NULL CONSTRAINT FK_FormTemplate_Owner FOREIGN KEY REFERENCES dbo.[User](UserID),
    Title               NVARCHAR(200) NOT NULL,
    Description         NVARCHAR(MAX) NULL,
    Status              VARCHAR(20) NOT NULL CONSTRAINT DF_FormTemplate_Status DEFAULT 'Draft', -- Draft / Published / Archived
    AccessMode          VARCHAR(20) NOT NULL CONSTRAINT DF_FormTemplate_AccessMode DEFAULT 'Public', -- Public / Domain / Invite / Group / Password
    MaxResponses        INT NULL,
    PublishAt           DATETIME2 NULL,
    ExpireAt            DATETIME2 NULL,
    GDPRConsentRequired BIT NOT NULL CONSTRAINT DF_FormTemplate_GDPRConsentRequired DEFAULT 0,
    LinkedFormTemplateID INT NULL CONSTRAINT FK_FormTemplate_Linked FOREIGN KEY REFERENCES dbo.FormTemplate(TemplateID),
    ResponseCount       INT NOT NULL CONSTRAINT DF_FormTemplate_ResponseCount DEFAULT 0,
    CreatedAt           DATETIME2 NOT NULL CONSTRAINT DF_FormTemplate_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt           DATETIME2 NULL
);
GO

CREATE INDEX IX_FormTemplate_Owner ON dbo.FormTemplate(OwnerUserID);
GO

IF OBJECT_ID('dbo.FormVersion', 'U') IS NULL
CREATE TABLE dbo.FormVersion
(
    VersionID     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_FormVersion PRIMARY KEY,
    TemplateID    INT NOT NULL CONSTRAINT FK_FormVersion_Template FOREIGN KEY REFERENCES dbo.FormTemplate(TemplateID),
    VersionNumber INT NOT NULL,
    SchemaJSON    NVARCHAR(MAX) NOT NULL,
    IsPublished   BIT NOT NULL CONSTRAINT DF_FormVersion_IsPublished DEFAULT 0,
    PublishedAt   DATETIME2 NULL,
    CreatedAt     DATETIME2 NOT NULL CONSTRAINT DF_FormVersion_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_FormVersion_Template_Number UNIQUE (TemplateID, VersionNumber)
);
GO

CREATE INDEX IX_FormVersion_Template ON dbo.FormVersion(TemplateID);
GO

IF OBJECT_ID('dbo.FormAccessRule', 'U') IS NULL
CREATE TABLE dbo.FormAccessRule
(
    RuleID      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_FormAccessRule PRIMARY KEY,
    TemplateID  INT NOT NULL CONSTRAINT FK_FormAccessRule_Template FOREIGN KEY REFERENCES dbo.FormTemplate(TemplateID),
    Mode        VARCHAR(20) NOT NULL,  -- matches FormTemplate.AccessMode
    ConfigJSON  NVARCHAR(MAX) NULL,    -- domain list | invite list ref | group id | password hash
    CreatedAt   DATETIME2 NOT NULL CONSTRAINT DF_FormAccessRule_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt   DATETIME2 NULL,
    CONSTRAINT UQ_FormAccessRule_Template_Mode UNIQUE (TemplateID, Mode)
);
GO

-- Invite list for Invite Only access mode (FR-01.7, incl. CSV bulk upload)
IF OBJECT_ID('dbo.FormInvite', 'U') IS NULL
CREATE TABLE dbo.FormInvite
(
    InviteID    INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_FormInvite PRIMARY KEY,
    TemplateID  INT NOT NULL CONSTRAINT FK_FormInvite_Template FOREIGN KEY REFERENCES dbo.FormTemplate(TemplateID),
    Email       NVARCHAR(200) NOT NULL,
    Status      VARCHAR(20) NOT NULL CONSTRAINT DF_FormInvite_Status DEFAULT 'Pending', -- Pending / Sent / Accepted / Revoked
    InvitedBy   INT NULL CONSTRAINT FK_FormInvite_InvitedBy FOREIGN KEY REFERENCES dbo.[User](UserID),
    CreatedAt   DATETIME2 NOT NULL CONSTRAINT DF_FormInvite_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_FormInvite_Template_Email UNIQUE (TemplateID, Email)
);
GO

CREATE INDEX IX_FormInvite_Template ON dbo.FormInvite(TemplateID);
GO

IF OBJECT_ID('dbo.FormResponse', 'U') IS NULL
CREATE TABLE dbo.FormResponse
(
    ResponseID       INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_FormResponse PRIMARY KEY,
    TemplateID       INT NOT NULL CONSTRAINT FK_FormResponse_Template FOREIGN KEY REFERENCES dbo.FormTemplate(TemplateID),
    VersionID        INT NOT NULL CONSTRAINT FK_FormResponse_Version FOREIGN KEY REFERENCES dbo.FormVersion(VersionID),
    RespondentUserID INT NULL CONSTRAINT FK_FormResponse_User FOREIGN KEY REFERENCES dbo.[User](UserID), -- NULL = anonymous/external
    RespondentEmail  NVARCHAR(200) NULL,
    Status           VARCHAR(20) NOT NULL CONSTRAINT DF_FormResponse_Status DEFAULT 'InProgress', -- InProgress / Submitted
    ConsentGiven     BIT NULL,
    IPAddress        VARCHAR(45) NULL, -- rate limiting (FR-01.16)
    SubmittedAt      DATETIME2 NULL,
    IsErased         BIT NOT NULL CONSTRAINT DF_FormResponse_IsErased DEFAULT 0, -- GDPR right-to-erasure (FR-01.25)
    CreatedAt        DATETIME2 NOT NULL CONSTRAINT DF_FormResponse_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt        DATETIME2 NULL
);
GO

CREATE INDEX IX_FormResponse_Template        ON dbo.FormResponse(TemplateID);
CREATE INDEX IX_FormResponse_Version         ON dbo.FormResponse(VersionID);
CREATE INDEX IX_FormResponse_RespondentUser  ON dbo.FormResponse(RespondentUserID);
CREATE INDEX IX_FormResponse_SubmittedAt     ON dbo.FormResponse(SubmittedAt);
GO

IF OBJECT_ID('dbo.ResponseAnswer', 'U') IS NULL
CREATE TABLE dbo.ResponseAnswer
(
    AnswerID   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ResponseAnswer PRIMARY KEY,
    ResponseID INT NOT NULL CONSTRAINT FK_ResponseAnswer_Response FOREIGN KEY REFERENCES dbo.FormResponse(ResponseID),
    FieldKey   VARCHAR(100) NOT NULL,
    ValueJSON  NVARCHAR(MAX) NOT NULL,
    CreatedAt  DATETIME2 NOT NULL CONSTRAINT DF_ResponseAnswer_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_ResponseAnswer_Response_Field UNIQUE (ResponseID, FieldKey)
);
GO

CREATE INDEX IX_ResponseAnswer_Response ON dbo.ResponseAnswer(ResponseID);
GO

IF OBJECT_ID('dbo.FormFile', 'U') IS NULL
CREATE TABLE dbo.FormFile
(
    FileID       INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_FormFile PRIMARY KEY,
    ResponseID   INT NOT NULL CONSTRAINT FK_FormFile_Response FOREIGN KEY REFERENCES dbo.FormResponse(ResponseID),
    FieldKey     VARCHAR(100) NOT NULL,
    OriginalName NVARCHAR(255) NOT NULL,
    StorageURL   NVARCHAR(500) NOT NULL,
    SizeBytes    BIGINT NOT NULL,
    MimeType     VARCHAR(100) NULL,
    ScanStatus   VARCHAR(20) NOT NULL CONSTRAINT DF_FormFile_ScanStatus DEFAULT 'Pending', -- Pending / Clean / Rejected
    CreatedAt    DATETIME2 NOT NULL CONSTRAINT DF_FormFile_CreatedAt DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX IX_FormFile_Response ON dbo.FormFile(ResponseID);
GO

-- GDPR right-to-erasure requests (FR-01.25)
IF OBJECT_ID('dbo.ErasureRequest', 'U') IS NULL
CREATE TABLE dbo.ErasureRequest
(
    ErasureRequestID INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ErasureRequest PRIMARY KEY,
    RespondentEmail  NVARCHAR(200) NULL,
    ResponseID       INT NULL CONSTRAINT FK_ErasureRequest_Response FOREIGN KEY REFERENCES dbo.FormResponse(ResponseID),
    RequestedBy      INT NULL CONSTRAINT FK_ErasureRequest_User FOREIGN KEY REFERENCES dbo.[User](UserID),
    Status           VARCHAR(20) NOT NULL CONSTRAINT DF_ErasureRequest_Status DEFAULT 'Pending', -- Pending / Completed
    RequestedAt      DATETIME2 NOT NULL CONSTRAINT DF_ErasureRequest_RequestedAt DEFAULT SYSUTCDATETIME(),
    CompletedAt      DATETIME2 NULL
);
GO

-- ---------------------------------------------------------------------------
-- 6. Competitor Pricing (TDS 3.7, FDS EPIC-02)
-- Gap % is computed on read (TDS Module note); PriceGapAlert stores flagged gaps.
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
    PriceID        INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CompetitorPrice PRIMARY KEY,
    ProductID      INT NOT NULL CONSTRAINT FK_CompetitorPrice_Product FOREIGN KEY REFERENCES dbo.Product(ProductID),
    CompetitorName NVARCHAR(150) NOT NULL,
    Price          DECIMAL(18,2) NOT NULL,
    RegionID       INT NOT NULL CONSTRAINT FK_CompetitorPrice_Region FOREIGN KEY REFERENCES dbo.Region(RegionID),
    OutletID       INT NULL CONSTRAINT FK_CompetitorPrice_Outlet FOREIGN KEY REFERENCES dbo.Outlet(OutletID),
    RecordedBy     INT NOT NULL CONSTRAINT FK_CompetitorPrice_User FOREIGN KEY REFERENCES dbo.[User](UserID),
    RecordedDate   DATE NOT NULL,
    ObservedAt     DATETIME2 NOT NULL CONSTRAINT DF_CompetitorPrice_ObservedAt DEFAULT SYSUTCDATETIME(),
    CreatedAt      DATETIME2 NOT NULL CONSTRAINT DF_CompetitorPrice_CreatedAt DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX IX_CompetitorPrice_ProductID   ON dbo.CompetitorPrice(ProductID);
CREATE INDEX IX_CompetitorPrice_RegionID    ON dbo.CompetitorPrice(RegionID);
CREATE INDEX IX_CompetitorPrice_RecordedDate ON dbo.CompetitorPrice(RecordedDate);
GO

IF OBJECT_ID('dbo.PriceGapAlert', 'U') IS NULL
CREATE TABLE dbo.PriceGapAlert
(
    GapAlertID        INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PriceGapAlert PRIMARY KEY,
    PriceID           INT NOT NULL CONSTRAINT FK_PriceGapAlert_Price FOREIGN KEY REFERENCES dbo.CompetitorPrice(PriceID),
    OwnPrice          DECIMAL(18,2) NOT NULL,
    GapPercent        DECIMAL(5,2) NOT NULL,
    ThresholdPercent  DECIMAL(5,2) NOT NULL,
    ThresholdBreached BIT NOT NULL CONSTRAINT DF_PriceGapAlert_ThresholdBreached DEFAULT 1,
    Status            VARCHAR(20) NOT NULL CONSTRAINT DF_PriceGapAlert_Status DEFAULT 'Active', -- Active / Resolved / Dismissed
    CreatedAt         DATETIME2 NOT NULL CONSTRAINT DF_PriceGapAlert_CreatedAt DEFAULT SYSUTCDATETIME(),
    ResolvedAt        DATETIME2 NULL
);
GO

CREATE INDEX IX_PriceGapAlert_PriceID ON dbo.PriceGapAlert(PriceID);
CREATE INDEX IX_PriceGapAlert_Status  ON dbo.PriceGapAlert(Status);
GO

-- ---------------------------------------------------------------------------
-- 7. Notifications (TDS 3.8, FDS EPIC-05) & Sync (FDS EPIC-03)
-- ---------------------------------------------------------------------------

IF OBJECT_ID('dbo.NotificationConfig', 'U') IS NULL
CREATE TABLE dbo.NotificationConfig
(
    ConfigID     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_NotificationConfig PRIMARY KEY,
    TriggerEvent VARCHAR(100) NOT NULL, -- NewReport / PriceGapAlert / SyncFailure / form lifecycle events
    Channel      VARCHAR(20) NOT NULL,  -- Email / SMS / WhatsApp (Push/In-App not sent this release)
    RoleID       INT NOT NULL CONSTRAINT FK_NotificationConfig_Role FOREIGN KEY REFERENCES dbo.Role(RoleID),
    Enabled      BIT NOT NULL CONSTRAINT DF_NotificationConfig_Enabled DEFAULT 1,
    CreatedAt    DATETIME2 NOT NULL CONSTRAINT DF_NotificationConfig_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt    DATETIME2 NULL,
    CONSTRAINT UQ_NotificationConfig_Event_Channel_Role UNIQUE (TriggerEvent, Channel, RoleID)
);
GO

IF OBJECT_ID('dbo.Notification', 'U') IS NULL
CREATE TABLE dbo.Notification
(
    NotificationID  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Notification PRIMARY KEY,
    TriggerEvent    VARCHAR(100) NOT NULL,
    Channel         VARCHAR(20) NOT NULL,
    RecipientUserID INT NOT NULL CONSTRAINT FK_Notification_User FOREIGN KEY REFERENCES dbo.[User](UserID),
    Subject         NVARCHAR(300) NULL,
    Body            NVARCHAR(MAX) NULL,
    Payload         NVARCHAR(MAX) NULL,
    Status          VARCHAR(20) NOT NULL CONSTRAINT DF_Notification_Status DEFAULT 'Pending', -- Pending / Sent / Retried / Failed
    Attempts        INT NOT NULL CONSTRAINT DF_Notification_Attempts DEFAULT 0,
    ProviderMessage NVARCHAR(MAX) NULL,
    SentAt          DATETIME2 NULL,
    CreatedAt       DATETIME2 NOT NULL CONSTRAINT DF_Notification_CreatedAt DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX IX_Notification_RecipientUserID ON dbo.Notification(RecipientUserID);
CREATE INDEX IX_Notification_Status         ON dbo.Notification(Status);
GO

IF OBJECT_ID('dbo.SyncLog', 'U') IS NULL
CREATE TABLE dbo.SyncLog
(
    SyncLogID        INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SyncLog PRIMARY KEY,
    Entity           VARCHAR(50) NOT NULL, -- Product / Customer / Sales
    Status           VARCHAR(20) NOT NULL, -- Running / Success / Failed
    RecordsProcessed INT NOT NULL CONSTRAINT DF_SyncLog_RecordsProcessed DEFAULT 0,
    ErrorCount       INT NOT NULL CONSTRAINT DF_SyncLog_ErrorCount DEFAULT 0,
    ErrorDetail      NVARCHAR(MAX) NULL,
    TriggeredBy      INT NULL CONSTRAINT FK_SyncLog_User FOREIGN KEY REFERENCES dbo.[User](UserID), -- NULL = scheduled
    StartedAt        DATETIME2 NOT NULL CONSTRAINT DF_SyncLog_StartedAt DEFAULT SYSUTCDATETIME(),
    FinishedAt       DATETIME2 NULL
);
GO

CREATE INDEX IX_SyncLog_Entity    ON dbo.SyncLog(Entity);
CREATE INDEX IX_SyncLog_StartedAt ON dbo.SyncLog(StartedAt);
GO

-- ---------------------------------------------------------------------------
-- 8. Audit (SDD 7.2, Security Matrix Section 7)
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
CREATE INDEX IX_AuditLog_Entity    ON dbo.AuditLog(Entity);
GO

-- =============================================================================
-- Reporting views (Integration Design Section 6 / FDS EPIC-06)
-- Power BI reads ONLY these views, never the raw transactional tables.
-- =============================================================================

-- Sales facts by outlet hierarchy for KPI dashboards (sales growth, drill-down)
IF OBJECT_ID('dbo.vw_Report_SalesByOutlet', 'V') IS NOT NULL DROP VIEW dbo.vw_Report_SalesByOutlet;
GO
CREATE VIEW dbo.vw_Report_SalesByOutlet AS
SELECT
    s.SalesID,
    s.SaleDate,
    YEAR(s.SaleDate)  AS SalesYear,
    MONTH(s.SaleDate) AS SalesMonth,
    s.Quantity,
    s.Amount,
    p.ProductID, p.ProductCode, p.Name AS ProductName, p.Category,
    c.CustomerID, c.Name AS CustomerName, c.CustomerType,
    r.RegionID, r.RegionName, r.Country,
    o.OutletID, o.OutletName, o.City
FROM dbo.SalesRecord s
JOIN dbo.Product  p ON p.ProductID  = s.ProductID
JOIN dbo.Customer c ON c.CustomerID = s.CustomerID
LEFT JOIN dbo.Region r ON r.RegionID = s.RegionID
LEFT JOIN dbo.Outlet o ON o.RegionID = r.RegionID;
GO

-- Own vs competitor price comparison (FR-02.3/02.4)
IF OBJECT_ID('dbo.vw_Report_PriceComparison', 'V') IS NOT NULL DROP VIEW dbo.vw_Report_PriceComparison;
GO
CREATE VIEW dbo.vw_Report_PriceComparison AS
SELECT
    cp.PriceID, cp.RecordedDate, cp.CompetitorName, cp.Price AS CompetitorPrice,
    p.ProductID, p.ProductCode, p.Name AS ProductName, p.Category,
    p.UnitPrice AS OwnPrice,
    CASE WHEN p.UnitPrice IS NOT NULL AND p.UnitPrice > 0
         THEN ROUND(((p.UnitPrice - cp.Price) / p.UnitPrice) * 100.0, 2)
         ELSE NULL END AS GapPercent,
    r.RegionID, r.RegionName, r.Country,
    o.OutletID, o.OutletName,
    u.UserID AS RecordedByUserID, u.Name AS RecordedByName
FROM dbo.CompetitorPrice cp
JOIN dbo.Product  p ON p.ProductID = cp.ProductID
JOIN dbo.Region   r ON r.RegionID  = cp.RegionID
LEFT JOIN dbo.Outlet o ON o.OutletID = cp.OutletID
JOIN dbo.[User]   u ON u.UserID = cp.RecordedBy;
GO

-- Market visit activity
IF OBJECT_ID('dbo.vw_Report_MarketVisits', 'V') IS NOT NULL DROP VIEW dbo.vw_Report_MarketVisits;
GO
CREATE VIEW dbo.vw_Report_MarketVisits AS
SELECT
    m.ReportID, m.VisitDate, m.Status,
    r.RegionID, r.RegionName, r.Country,
    o.OutletID, o.OutletName, o.City,
    u.UserID AS SubmittedByUserID, u.Name AS SubmittedByName
FROM dbo.MarketVisitReport m
JOIN dbo.Outlet o ON o.OutletID = m.OutletID
JOIN dbo.Region r ON r.RegionID = o.RegionID
JOIN dbo.[User] u ON u.UserID = m.UserID;
GO

-- Flattened form responses for Power BI form analytics
IF OBJECT_ID('dbo.vw_Report_FormResponseAnswers', 'V') IS NOT NULL DROP VIEW dbo.vw_Report_FormResponseAnswers;
GO
CREATE VIEW dbo.vw_Report_FormResponseAnswers AS
SELECT
    fr.ResponseID, fr.SubmittedAt,
    t.TemplateID, t.Title AS FormTitle, t.Status AS FormStatus,
    v.VersionNumber,
    a.FieldKey, a.ValueJSON,
    CASE WHEN fr.RespondentUserID IS NULL THEN 'External' ELSE 'Internal' END AS RespondentType
FROM dbo.FormResponse fr
JOIN dbo.FormTemplate t ON t.TemplateID = fr.TemplateID
JOIN dbo.FormVersion  v ON v.VersionID  = fr.VersionID
JOIN dbo.ResponseAnswer a ON a.ResponseID = fr.ResponseID
WHERE fr.Status = 'Submitted' AND fr.IsErased = 0;
GO

-- Product availability proxy: distinct products with sales per outlet vs total active products
IF OBJECT_ID('dbo.vw_Report_ProductAvailability', 'V') IS NOT NULL DROP VIEW dbo.vw_Report_ProductAvailability;
GO
CREATE VIEW dbo.vw_Report_ProductAvailability AS
SELECT
    r.RegionID, r.RegionName, r.Country,
    o.OutletID, o.OutletName, o.City,
    COUNT(DISTINCT s.ProductID) AS ProductsAvailable,
    (SELECT COUNT(*) FROM dbo.Product p WHERE p.IsActive = 1) AS TotalActiveProducts,
    CASE WHEN (SELECT COUNT(*) FROM dbo.Product p WHERE p.IsActive = 1) > 0
         THEN ROUND(CAST(COUNT(DISTINCT s.ProductID) AS FLOAT) / NULLIF((SELECT COUNT(*) FROM dbo.Product p WHERE p.IsActive = 1), 0) * 100.0, 2)
         ELSE 0 END AS AvailabilityRate
FROM dbo.Outlet o
JOIN dbo.Region r ON r.RegionID = o.RegionID
LEFT JOIN dbo.SalesRecord s ON s.RegionID = r.RegionID
GROUP BY r.RegionID, r.RegionName, r.Country, o.OutletID, o.OutletName, o.City;
GO
