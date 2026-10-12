-- =============================================================================
-- KG-MIS  Migration 003 - SRD scope alignment (v1.2 template finalization)
-- Reference: KG-MIS_Seed_Data_Collection_Template_v1_2_SRD_Aligned.xlsx
--   SRD Scope Matrix MI-DC-02/03/05/06/07, MI-DM-02/03/05, MI-AN-01..07,
--   MI-RP-01..04, MI-DS-01/02, Business Groups, Market Visit Reports,
--   Customer Interviews, Weekly Sales, Surveys & Questionnaires, Competitors,
--   Competitor Intelligence, Alerts & Risks, Multimedia Register.
-- Idempotent (safe to re-run).
-- =============================================================================
USE KG_MIS;
GO

-- ---------------------------------------------------------------------------
-- 1. BusinessGroup (fixed corporate reference list - 8 groups from the template)
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.BusinessGroup', 'U') IS NULL
CREATE TABLE dbo.BusinessGroup
(
    BusinessGroupID INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_BusinessGroup PRIMARY KEY,
    Code            VARCHAR(20)  NOT NULL CONSTRAINT UQ_BusinessGroup_Code UNIQUE,
    Name            NVARCHAR(150) NOT NULL,
    Description     NVARCHAR(MAX) NULL,
    Notes           NVARCHAR(MAX) NULL,
    CreatedAt       DATETIME2 NOT NULL CONSTRAINT DF_BusinessGroup_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt       DATETIME2 NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.BusinessGroup)
BEGIN
    SET IDENTITY_INSERT dbo.BusinessGroup ON;
    INSERT INTO dbo.BusinessGroup (BusinessGroupID, Code, Name, Description) VALUES
        (1, 'KCC', 'Kerchanshe Coffee', 'Coffee growing, processing, and export'),
        (2, 'TRC', 'Tractor',          'Agricultural tractors and equipment'),
        (3, 'GLC', 'Geely Car',        'Geely passenger and electric vehicles'),
        (4, 'BPN', 'Buna Pen',         'Writing instruments'),
        (5, 'BPL', 'Buna Plate',       'Melamine tableware'),
        (6, 'BUS', 'Bus',              'Bus / passenger transport vehicles'),
        (7, 'ORM', 'Oro Meat',         'Meat processing and distribution'),
        (8, 'BPT', 'Buna Paints',      'Paints and coatings');
    SET IDENTITY_INSERT dbo.BusinessGroup OFF;
END
GO

-- ---------------------------------------------------------------------------
-- 2. Product / Customer - add the Business Group dimension + richer fields
-- ---------------------------------------------------------------------------
IF COL_LENGTH('dbo.Product', 'BusinessGroupID') IS NULL
    ALTER TABLE dbo.Product ADD BusinessGroupID INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Product_BusinessGroup')
    ALTER TABLE dbo.Product ADD CONSTRAINT FK_Product_BusinessGroup
        FOREIGN KEY (BusinessGroupID) REFERENCES dbo.BusinessGroup(BusinessGroupID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Product_BusinessGroup' AND object_id = OBJECT_ID('dbo.Product'))
    CREATE INDEX IX_Product_BusinessGroup ON dbo.Product(BusinessGroupID) WHERE BusinessGroupID IS NOT NULL;
GO

IF COL_LENGTH('dbo.Customer', 'BusinessGroupID') IS NULL
    ALTER TABLE dbo.Customer ADD BusinessGroupID INT NULL;
GO
IF COL_LENGTH('dbo.Customer', 'ContactPerson') IS NULL
    ALTER TABLE dbo.Customer ADD ContactPerson NVARCHAR(150) NULL;
GO
IF COL_LENGTH('dbo.Customer', 'ContactPhone') IS NULL
    ALTER TABLE dbo.Customer ADD ContactPhone VARCHAR(30) NULL;
GO
IF COL_LENGTH('dbo.Customer', 'Email') IS NULL
    ALTER TABLE dbo.Customer ADD Email NVARCHAR(200) NULL;
GO
IF COL_LENGTH('dbo.Customer', 'RegionID') IS NULL
    ALTER TABLE dbo.Customer ADD RegionID INT NULL;
GO
IF COL_LENGTH('dbo.Customer', 'OutletID') IS NULL
    ALTER TABLE dbo.Customer ADD OutletID INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Customer_BusinessGroup')
    ALTER TABLE dbo.Customer ADD CONSTRAINT FK_Customer_BusinessGroup
        FOREIGN KEY (BusinessGroupID) REFERENCES dbo.BusinessGroup(BusinessGroupID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Customer_Region')
    ALTER TABLE dbo.Customer ADD CONSTRAINT FK_Customer_Region
        FOREIGN KEY (RegionID) REFERENCES dbo.Region(RegionID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Customer_Outlet')
    ALTER TABLE dbo.Customer ADD CONSTRAINT FK_Customer_Outlet
        FOREIGN KEY (OutletID) REFERENCES dbo.Outlet(OutletID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Customer_Region' AND object_id = OBJECT_ID('dbo.Customer'))
    CREATE INDEX IX_Customer_Region ON dbo.Customer(RegionID) WHERE RegionID IS NOT NULL;
GO

-- ---------------------------------------------------------------------------
-- 3. MarketVisitReport - SRD-aligned field observations (MI-DC-02)
--    Status lifecycle: Draft -> Submitted -> Reviewed -> Approved
-- ---------------------------------------------------------------------------
IF COL_LENGTH('dbo.MarketVisitReport', 'BusinessGroupID') IS NULL
    ALTER TABLE dbo.MarketVisitReport ADD BusinessGroupID INT NULL;
GO
IF COL_LENGTH('dbo.MarketVisitReport', 'VisitType') IS NULL
    ALTER TABLE dbo.MarketVisitReport ADD VisitType VARCHAR(50) NULL;
GO
IF COL_LENGTH('dbo.MarketVisitReport', 'StockLevelObserved') IS NULL
    ALTER TABLE dbo.MarketVisitReport ADD StockLevelObserved VARCHAR(50) NULL;
GO
IF COL_LENGTH('dbo.MarketVisitReport', 'CompetitorPresenceNoted') IS NULL
    ALTER TABLE dbo.MarketVisitReport ADD CompetitorPresenceNoted NVARCHAR(500) NULL;
GO
IF COL_LENGTH('dbo.MarketVisitReport', 'KeyFindings') IS NULL
    ALTER TABLE dbo.MarketVisitReport ADD KeyFindings NVARCHAR(MAX) NULL;
GO
IF COL_LENGTH('dbo.MarketVisitReport', 'PhotoVideoRef') IS NULL
    ALTER TABLE dbo.MarketVisitReport ADD PhotoVideoRef NVARCHAR(1000) NULL;
GO
IF COL_LENGTH('dbo.MarketVisitReport', 'FollowUpRequired') IS NULL
    ALTER TABLE dbo.MarketVisitReport ADD FollowUpRequired BIT NULL;
GO
IF COL_LENGTH('dbo.MarketVisitReport', 'ApprovedBy') IS NULL
    ALTER TABLE dbo.MarketVisitReport ADD ApprovedBy INT NULL;
GO
IF COL_LENGTH('dbo.MarketVisitReport', 'ApprovedAt') IS NULL
    ALTER TABLE dbo.MarketVisitReport ADD ApprovedAt DATETIME2 NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_MarketVisitReport_BusinessGroup')
    ALTER TABLE dbo.MarketVisitReport ADD CONSTRAINT FK_MarketVisitReport_BusinessGroup
        FOREIGN KEY (BusinessGroupID) REFERENCES dbo.BusinessGroup(BusinessGroupID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_MarketVisitReport_ApprovedBy')
    ALTER TABLE dbo.MarketVisitReport ADD CONSTRAINT FK_MarketVisitReport_ApprovedBy
        FOREIGN KEY (ApprovedBy) REFERENCES dbo.[User](UserID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MarketVisitReport_BusinessGroup' AND object_id = OBJECT_ID('dbo.MarketVisitReport'))
    CREATE INDEX IX_MarketVisitReport_BusinessGroup ON dbo.MarketVisitReport(BusinessGroupID) WHERE BusinessGroupID IS NOT NULL;
GO

-- ---------------------------------------------------------------------------
-- 4. Interview - customer / distributor / retailer / agent interviews (MI-DC-03)
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.Interview', 'U') IS NULL
CREATE TABLE dbo.Interview
(
    InterviewID      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Interview PRIMARY KEY,
    UserID           INT NOT NULL CONSTRAINT FK_Interview_User FOREIGN KEY REFERENCES dbo.[User](UserID),
    BusinessGroupID  INT NOT NULL CONSTRAINT FK_Interview_BusinessGroup FOREIGN KEY REFERENCES dbo.BusinessGroup(BusinessGroupID),
    RegionID         INT NOT NULL CONSTRAINT FK_Interview_Region FOREIGN KEY REFERENCES dbo.Region(RegionID),
    OutletID         INT NULL CONSTRAINT FK_Interview_Outlet FOREIGN KEY REFERENCES dbo.Outlet(OutletID),
    InterviewDate    DATE NOT NULL,
    RespondentType   VARCHAR(50) NOT NULL, -- Customer / Distributor / Retailer / Agent / Other
    RespondentName   NVARCHAR(150) NOT NULL,
    SatisfactionScore INT NULL CONSTRAINT CK_Interview_Satisfaction CHECK (SatisfactionScore BETWEEN 1 AND 5),
    Sentiment        VARCHAR(50) NULL,    -- Positive / Neutral / Negative
    KeyFeedback      NVARCHAR(MAX) NULL,
    PhotoVideoRef    NVARCHAR(1000) NULL,
    Notes            NVARCHAR(MAX) NULL,
    CapturedLat      DECIMAL(10,6) NULL,
    CapturedLng      DECIMAL(10,6) NULL,
    Status           VARCHAR(20) NOT NULL CONSTRAINT DF_Interview_Status DEFAULT 'Draft',
    ReviewedBy       INT NULL CONSTRAINT FK_Interview_ReviewedBy FOREIGN KEY REFERENCES dbo.[User](UserID),
    ReviewedAt       DATETIME2 NULL,
    ApprovedBy       INT NULL CONSTRAINT FK_Interview_ApprovedBy FOREIGN KEY REFERENCES dbo.[User](UserID),
    ApprovedAt       DATETIME2 NULL,
    CreatedAt        DATETIME2 NOT NULL CONSTRAINT DF_Interview_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt        DATETIME2 NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Interview_User' AND object_id = OBJECT_ID('dbo.Interview'))
    CREATE INDEX IX_Interview_User ON dbo.Interview(UserID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Interview_BusinessGroup' AND object_id = OBJECT_ID('dbo.Interview'))
    CREATE INDEX IX_Interview_BusinessGroup ON dbo.Interview(BusinessGroupID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Interview_Region' AND object_id = OBJECT_ID('dbo.Interview'))
    CREATE INDEX IX_Interview_Region ON dbo.Interview(RegionID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Interview_Status' AND object_id = OBJECT_ID('dbo.Interview'))
    CREATE INDEX IX_Interview_Status ON dbo.Interview(Status);
GO

-- ---------------------------------------------------------------------------
-- 5. Competitor catalogue (MI-AN-03) - reference list of known competitors
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.Competitor', 'U') IS NULL
CREATE TABLE dbo.Competitor
(
    CompetitorID     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Competitor PRIMARY KEY,
    Name             NVARCHAR(150) NOT NULL,
    ProductsCovered  NVARCHAR(MAX) NULL,
    RegionsActiveIn  NVARCHAR(MAX) NULL,
    Notes            NVARCHAR(MAX) NULL,
    BusinessGroupID  INT NULL CONSTRAINT FK_Competitor_BusinessGroup FOREIGN KEY REFERENCES dbo.BusinessGroup(BusinessGroupID),
    IsActive         BIT NOT NULL CONSTRAINT DF_Competitor_IsActive DEFAULT 1,
    CreatedAt        DATETIME2 NOT NULL CONSTRAINT DF_Competitor_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt        DATETIME2 NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Competitor)
BEGIN
    INSERT INTO dbo.Competitor (Name, ProductsCovered, RegionsActiveIn, Notes, BusinessGroupID) VALUES
        ('Tracon Trading', 'Washed Coffee, Natural Coffee', 'Oromia, SNNPR', 'Main regional coffee competitor', 1),
        ('Des', 'Dining Plate', 'All Regions', 'Dining plate competitor', 5),
        ('Antiline', 'Dining Plate', 'All Regions', 'Dining plate competitor', 5),
        ('BY', 'Dining Plate', 'All Regions', 'Dining plate competitor', 5),
        ('STAR', 'Dining Plate', 'All Regions', 'Dining plate competitor', 5),
        ('HUADA', 'Dining Plate', 'All Regions', 'Dining plate competitor', 5),
        ('Camel', 'Dining Plate', 'All Regions', 'Dining plate competitor', 5),
        ('ITAI', 'Dining Plate', 'All Regions', 'Dining plate competitor', 5),
        ('BIC', 'Writing Instruments', 'All Regions', 'Writing instruments competitor', 4),
        ('Lexi', 'Writing Instruments', 'All Regions', 'Writing instruments competitor', 4),
        ('Radius', 'Writing Instruments', 'All Regions', 'Writing instruments competitor', 4),
        ('Nano', 'Writing Instruments', 'All Regions', 'Writing instruments competitor', 4);
END
GO

-- ---------------------------------------------------------------------------
-- 6. CompetitorPrice - richer observation fields (Competitor Intelligence tab)
-- ---------------------------------------------------------------------------
IF COL_LENGTH('dbo.CompetitorPrice', 'CompetitorID') IS NULL
    ALTER TABLE dbo.CompetitorPrice ADD CompetitorID INT NULL;
GO
IF COL_LENGTH('dbo.CompetitorPrice', 'Availability') IS NULL
    ALTER TABLE dbo.CompetitorPrice ADD Availability VARCHAR(50) NULL;
GO
IF COL_LENGTH('dbo.CompetitorPrice', 'PromotionObserved') IS NULL
    ALTER TABLE dbo.CompetitorPrice ADD PromotionObserved NVARCHAR(500) NULL;
GO
IF COL_LENGTH('dbo.CompetitorPrice', 'QualityObservation') IS NULL
    ALTER TABLE dbo.CompetitorPrice ADD QualityObservation NVARCHAR(500) NULL;
GO
IF COL_LENGTH('dbo.CompetitorPrice', 'PhotoVideoRef') IS NULL
    ALTER TABLE dbo.CompetitorPrice ADD PhotoVideoRef NVARCHAR(1000) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_CompetitorPrice_Competitor')
    ALTER TABLE dbo.CompetitorPrice ADD CONSTRAINT FK_CompetitorPrice_Competitor
        FOREIGN KEY (CompetitorID) REFERENCES dbo.Competitor(CompetitorID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CompetitorPrice_Competitor' AND object_id = OBJECT_ID('dbo.CompetitorPrice'))
    CREATE INDEX IX_CompetitorPrice_Competitor ON dbo.CompetitorPrice(CompetitorID) WHERE CompetitorID IS NOT NULL;
GO

-- ---------------------------------------------------------------------------
-- 7. WeeklySales - recurring weekly sales entries (Weekly Sales tab, MI-DM-05)
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.WeeklySales', 'U') IS NULL
CREATE TABLE dbo.WeeklySales
(
    WeeklySalesID    INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_WeeklySales PRIMARY KEY,
    WeekEnding       DATE NOT NULL,
    BusinessGroupID  INT NOT NULL CONSTRAINT FK_WeeklySales_BusinessGroup FOREIGN KEY REFERENCES dbo.BusinessGroup(BusinessGroupID),
    ProductID        INT NOT NULL CONSTRAINT FK_WeeklySales_Product FOREIGN KEY REFERENCES dbo.Product(ProductID),
    RegionID         INT NOT NULL CONSTRAINT FK_WeeklySales_Region FOREIGN KEY REFERENCES dbo.Region(RegionID),
    OutletID         INT NOT NULL CONSTRAINT FK_WeeklySales_Outlet FOREIGN KEY REFERENCES dbo.Outlet(OutletID),
    CustomerID       INT NULL CONSTRAINT FK_WeeklySales_Customer FOREIGN KEY REFERENCES dbo.Customer(CustomerID),
    QuantitySold     DECIMAL(18,3) NOT NULL,
    UnitPrice        DECIMAL(18,2) NOT NULL,
    Revenue          AS (QuantitySold * UnitPrice),
    Notes            NVARCHAR(MAX) NULL,
    SubmittedBy      INT NOT NULL CONSTRAINT FK_WeeklySales_SubmittedBy FOREIGN KEY REFERENCES dbo.[User](UserID),
    Status           VARCHAR(20) NOT NULL CONSTRAINT DF_WeeklySales_Status DEFAULT 'Submitted', -- Submitted / Rejected / Reconciled
    CreatedAt        DATETIME2 NOT NULL CONSTRAINT DF_WeeklySales_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt        DATETIME2 NULL,
    CONSTRAINT UQ_WeeklySales_Week_Product_Outlet UNIQUE (WeekEnding, ProductID, OutletID)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_WeeklySales_WeekEnding' AND object_id = OBJECT_ID('dbo.WeeklySales'))
    CREATE INDEX IX_WeeklySales_WeekEnding ON dbo.WeeklySales(WeekEnding);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_WeeklySales_BusinessGroup' AND object_id = OBJECT_ID('dbo.WeeklySales'))
    CREATE INDEX IX_WeeklySales_BusinessGroup ON dbo.WeeklySales(BusinessGroupID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_WeeklySales_Outlet' AND object_id = OBJECT_ID('dbo.WeeklySales'))
    CREATE INDEX IX_WeeklySales_Outlet ON dbo.WeeklySales(OutletID);
GO

-- ---------------------------------------------------------------------------
-- 8. MultimediaAsset - photos/videos/audio with capture metadata (MI-DC-06)
--    Links to any related module record via RelatedModule + RelatedRecordID.
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.MultimediaAsset', 'U') IS NULL
CREATE TABLE dbo.MultimediaAsset
(
    MediaID             INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_MultimediaAsset PRIMARY KEY,
    CaptureDate         DATE NOT NULL,
    CapturedAt          DATETIME2 NULL,
    CapturedBy          INT NOT NULL CONSTRAINT FK_MultimediaAsset_CapturedBy FOREIGN KEY REFERENCES dbo.[User](UserID),
    BusinessGroupID     INT NULL CONSTRAINT FK_MultimediaAsset_BusinessGroup FOREIGN KEY REFERENCES dbo.BusinessGroup(BusinessGroupID),
    RegionID            INT NULL CONSTRAINT FK_MultimediaAsset_Region FOREIGN KEY REFERENCES dbo.Region(RegionID),
    OutletID            INT NULL CONSTRAINT FK_MultimediaAsset_Outlet FOREIGN KEY REFERENCES dbo.Outlet(OutletID),
    RelatedModule       VARCHAR(50) NULL, -- MarketVisit / Interview / Survey / CompetitorPricing
    RelatedRecordID     INT NULL,
    MediaType           VARCHAR(20) NOT NULL, -- Photo / Video / Audio
    StorageURL          NVARCHAR(500) NOT NULL,
    OriginName          NVARCHAR(255) NULL,
    SizeBytes           BIGINT NULL,
    MimeType            VARCHAR(100) NULL,
    CaptureLat          DECIMAL(10,6) NULL,
    CaptureLng          DECIMAL(10,6) NULL,
    Tag                 NVARCHAR(100) NULL,
    TranscriptionRequired BIT NOT NULL CONSTRAINT DF_MultimediaAsset_TranscriptionRequired DEFAULT 0,
    Transcription       NVARCHAR(MAX) NULL,
    ValidationStatus    VARCHAR(20) NOT NULL CONSTRAINT DF_MultimediaAsset_ValidationStatus DEFAULT 'Pending', -- Pending / Validated / Rejected
    Notes               NVARCHAR(MAX) NULL,
    CreatedAt           DATETIME2 NOT NULL CONSTRAINT DF_MultimediaAsset_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt           DATETIME2 NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MultimediaAsset_CapturedBy' AND object_id = OBJECT_ID('dbo.MultimediaAsset'))
    CREATE INDEX IX_MultimediaAsset_CapturedBy ON dbo.MultimediaAsset(CapturedBy);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MultimediaAsset_Related' AND object_id = OBJECT_ID('dbo.MultimediaAsset'))
    CREATE INDEX IX_MultimediaAsset_Related ON dbo.MultimediaAsset(RelatedModule, RelatedRecordID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MultimediaAsset_Type' AND object_id = OBJECT_ID('dbo.MultimediaAsset'))
    CREATE INDEX IX_MultimediaAsset_Type ON dbo.MultimediaAsset(MediaType);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MultimediaAsset_Validation' AND object_id = OBJECT_ID('dbo.MultimediaAsset'))
    CREATE INDEX IX_MultimediaAsset_Validation ON dbo.MultimediaAsset(ValidationStatus);
GO

-- ---------------------------------------------------------------------------
-- 9. SRD-aligned reporting views
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.vw_Report_MarketVisits', 'V') IS NOT NULL DROP VIEW dbo.vw_Report_MarketVisits;
GO
CREATE VIEW dbo.vw_Report_MarketVisits AS
SELECT
    m.ReportID, m.VisitDate, m.Status, m.VisitType, m.StockLevelObserved,
    m.CompetitorPresenceNoted, m.KeyFindings, m.PhotoVideoRef, m.FollowUpRequired,
    bg.BusinessGroupID, bg.Code AS BusinessGroupCode, bg.Name AS BusinessGroupName,
    r.RegionID, r.RegionName, r.Country,
    o.OutletID, o.OutletName, o.City,
    u.UserID AS SubmittedByUserID, u.Name AS SubmittedByName
FROM dbo.MarketVisitReport m
JOIN dbo.Outlet o ON o.OutletID = m.OutletID
JOIN dbo.Region r ON r.RegionID = o.RegionID
JOIN dbo.[User] u ON u.UserID = m.UserID
LEFT JOIN dbo.BusinessGroup bg ON bg.BusinessGroupID = m.BusinessGroupID;
GO

IF OBJECT_ID('dbo.vw_Report_Interviews', 'V') IS NOT NULL DROP VIEW dbo.vw_Report_Interviews;
GO
CREATE VIEW dbo.vw_Report_Interviews AS
SELECT
    i.InterviewID, i.InterviewDate, i.RespondentType, i.RespondentName,
    i.SatisfactionScore, i.Sentiment, i.KeyFeedback, i.Status,
    i.PhotoVideoRef,
    bg.BusinessGroupID, bg.Code AS BusinessGroupCode, bg.Name AS BusinessGroupName,
    r.RegionID, r.RegionName, r.Country,
    o.OutletID, o.OutletName, o.City,
    u.UserID AS InterviewerUserID, u.Name AS InterviewerName
FROM dbo.Interview i
JOIN dbo.BusinessGroup bg ON bg.BusinessGroupID = i.BusinessGroupID
JOIN dbo.Region r ON r.RegionID = i.RegionID
LEFT JOIN dbo.Outlet o ON o.OutletID = i.OutletID
JOIN dbo.[User] u ON u.UserID = i.UserID;
GO

IF OBJECT_ID('dbo.vw_Report_Multimedia', 'V') IS NOT NULL DROP VIEW dbo.vw_Report_Multimedia;
GO
CREATE VIEW dbo.vw_Report_Multimedia AS
SELECT
    ma.MediaID, ma.CaptureDate, ma.MediaType, ma.StorageURL, ma.OriginName,
    ma.SizeBytes, ma.MimeType, ma.CaptureLat, ma.CaptureLng, ma.Tag,
    ma.TranscriptionRequired, ma.Transcription, ma.ValidationStatus,
    ma.RelatedModule, ma.RelatedRecordID,
    bg.BusinessGroupID, bg.Name AS BusinessGroupName,
    r.RegionID, r.RegionName,
    o.OutletID, o.OutletName,
    u.UserID AS CapturedByUserID, u.Name AS CapturedByName
FROM dbo.MultimediaAsset ma
LEFT JOIN dbo.BusinessGroup bg ON bg.BusinessGroupID = ma.BusinessGroupID
LEFT JOIN dbo.Region r ON r.RegionID = ma.RegionID
LEFT JOIN dbo.Outlet o ON o.OutletID = ma.OutletID
JOIN dbo.[User] u ON u.UserID = ma.CapturedBy;
GO

IF OBJECT_ID('dbo.vw_Report_WeeklySales', 'V') IS NOT NULL DROP VIEW dbo.vw_Report_WeeklySales;
GO
CREATE VIEW dbo.vw_Report_WeeklySales AS
SELECT
    w.WeeklySalesID, w.WeekEnding, w.QuantitySold, w.UnitPrice, w.Revenue, w.Status,
    bg.BusinessGroupID, bg.Code AS BusinessGroupCode, bg.Name AS BusinessGroupName,
    p.ProductID, p.ProductCode, p.Name AS ProductName, p.Category,
    r.RegionID, r.RegionName, r.Country,
    o.OutletID, o.OutletName, o.City,
    c.CustomerID, c.Name AS CustomerName, c.CustomerType,
    u.UserID AS SubmittedByUserID, u.Name AS SubmittedByName
FROM dbo.WeeklySales w
JOIN dbo.BusinessGroup bg ON bg.BusinessGroupID = w.BusinessGroupID
JOIN dbo.Product  p ON p.ProductID = w.ProductID
JOIN dbo.Region   r ON r.RegionID = w.RegionID
JOIN dbo.Outlet   o ON o.OutletID = w.OutletID
LEFT JOIN dbo.Customer c ON c.CustomerID = w.CustomerID
JOIN dbo.[User]   u ON u.UserID = w.SubmittedBy;
GO

IF OBJECT_ID('dbo.vw_Report_CompetitorIntelligence', 'V') IS NOT NULL DROP VIEW dbo.vw_Report_CompetitorIntelligence;
GO
CREATE VIEW dbo.vw_Report_CompetitorIntelligence AS
SELECT
    cp.PriceID, cp.RecordedDate, cp.Price AS CompetitorPrice, cp.Availability,
    cp.PromotionObserved, cp.QualityObservation, cp.PhotoVideoRef,
    comp.CompetitorID, comp.Name AS CompetitorName,
    p.ProductID, p.ProductCode, p.Name AS ProductName, p.Category,
    p.UnitPrice AS OwnPrice,
    CASE WHEN p.UnitPrice IS NOT NULL AND p.UnitPrice > 0
         THEN ROUND(((p.UnitPrice - cp.Price) / p.UnitPrice) * 100.0, 2)
         ELSE NULL END AS GapPercent,
    bg.BusinessGroupID, bg.Name AS BusinessGroupName,
    r.RegionID, r.RegionName, r.Country,
    o.OutletID, o.OutletName,
    u.UserID AS RecordedByUserID, u.Name AS RecordedByName
FROM dbo.CompetitorPrice cp
JOIN dbo.Product  p ON p.ProductID = cp.ProductID
JOIN dbo.Region   r ON r.RegionID  = cp.RegionID
LEFT JOIN dbo.Outlet o ON o.OutletID = cp.OutletID
LEFT JOIN dbo.Competitor comp ON comp.CompetitorID = cp.CompetitorID
LEFT JOIN dbo.BusinessGroup bg ON bg.BusinessGroupID = p.BusinessGroupID
JOIN dbo.[User]   u ON u.UserID = cp.RecordedBy;
GO

-- ---------------------------------------------------------------------------
-- 10. Seed sample SRD-aligned rows for dev / UAT (template sample data)
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.Interview)
BEGIN
    INSERT INTO dbo.Interview (UserID, BusinessGroupID, RegionID, OutletID, InterviewDate, RespondentType, RespondentName, SatisfactionScore, Sentiment, KeyFeedback, Status) VALUES
        (5, 1, 2, 4, '2026-08-15', 'Distributor', 'Meron Alemu', 4, 'Positive', 'Happy with delivery times; asked for wider pen color range', 'Submitted'),
        (4, 1, 1, 1, '2026-08-16', 'Retailer', 'Abebe Kebede', 5, 'Positive', 'Excellent product quality; customers love the new packaging', 'Approved');
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.WeeklySales)
BEGIN
    INSERT INTO dbo.WeeklySales (WeekEnding, BusinessGroupID, ProductID, RegionID, OutletID, CustomerID, QuantitySold, UnitPrice, Notes, SubmittedBy) VALUES
        ('2026-08-14', 1, 1, 2, 4, 1, 1200, 35.00, 'Regular weekly restock order', 5),
        ('2026-08-14', 4, 8, 1, 1, 4, 500, 45.00, 'Weekly replenishment', 5);
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MarketVisitReport WHERE VisitType IS NOT NULL)
BEGIN
    INSERT INTO dbo.MarketVisitReport (UserID, OutletID, VisitDate, VisitType, StockLevelObserved, CompetitorPresenceNoted, KeyFindings, PhotoVideoRef, FollowUpRequired, Status, BusinessGroupID) VALUES
        (5, 4, '2026-08-17', 'Market Visit', 'In Stock', 'Yes - Oromia Coffee Co. display seen', 'Shelf space reduced vs last month; competitor added a promo endcap', 'visits/2026-08-17_adama-central.jpg', 1, 'Submitted', 1),
        (5, 1, '2026-08-18', 'Follow-up', 'In Stock', 'No competitor presence', 'Previous issues resolved; shelf space restored', 'visits/2026-08-18_shola.jpg', 0, 'Approved', 1);
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.CompetitorPrice WHERE Availability IS NOT NULL)
BEGIN
    INSERT INTO dbo.CompetitorPrice (ProductID, CompetitorID, CompetitorName, Price, RegionID, OutletID, RecordedBy, RecordedDate, Availability, PromotionObserved, QualityObservation, PhotoVideoRef) VALUES
        (1, 1, 'Oromia Coffee Co.', 920.00, 2, 4, 5, '2026-08-19', 'In Stock', 'Buy 10 Get 1', 'Comparable', 'competitor/2026-08-19.jpg');
END
GO