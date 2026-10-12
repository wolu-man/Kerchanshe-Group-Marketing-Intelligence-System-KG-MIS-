-- 033: Tender & Opportunity Intelligence — source adapters, opportunity storage,
-- interest profiles, saved tenders, and notification config seeds.
-- Idempotent (safe to re-run). Follows the conventions in 001 / 030.
-- Tables: dbo.TenderSource, dbo.TenderOpportunity, dbo.TenderInterestProfile,
--         dbo.SavedTender.

-- ---------------------------------------------------------------------------
-- 1. dbo.TenderSource — configurable data sources (API / RSS / scraping)
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.TenderSource', 'U') IS NULL
CREATE TABLE dbo.TenderSource
(
    TenderSourceID    INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TenderSource PRIMARY KEY,
    Name              NVARCHAR(200) NOT NULL CONSTRAINT UQ_TenderSource_Name UNIQUE,
    SourceType        VARCHAR(20) NOT NULL, -- api | rss | scraping
    URL               NVARCHAR(1000) NOT NULL,
    ApiConfig          NVARCHAR(MAX) NULL,  -- JSON: field mappings, headers, auth (server-side only — never exposed to frontend)
    Schedule          VARCHAR(20) NOT NULL CONSTRAINT DF_TenderSource_Schedule DEFAULT '6h', -- cron-like label: 1h / 6h / 12h / 24h
    RateLimitMs       INT NOT NULL CONSTRAINT DF_TenderSource_RateLimitMs DEFAULT 2000,
    RobotsCompliance  BIT NOT NULL CONSTRAINT DF_TenderSource_RobotsCompliance DEFAULT 1,
    IsActive          BIT NOT NULL CONSTRAINT DF_TenderSource_IsActive DEFAULT 1,
    LastCollectedAt   DATETIME2 NULL,
    LastCollectionStatus VARCHAR(20) NULL, -- Success / Failed / Partial
    LastCollectionError NVARCHAR(MAX) NULL,
    TotalCollected    INT NOT NULL CONSTRAINT DF_TenderSource_TotalCollected DEFAULT 0,
    CreatedAt         DATETIME2 NOT NULL CONSTRAINT DF_TenderSource_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt         DATETIME2 NULL,
    CONSTRAINT CK_TenderSource_Type CHECK (SourceType IN ('api', 'rss', 'scraping'))
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TenderSource_Type' AND object_id = OBJECT_ID('dbo.TenderSource'))
    CREATE INDEX IX_TenderSource_Type ON dbo.TenderSource(SourceType);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TenderSource_IsActive' AND object_id = OBJECT_ID('dbo.TenderSource'))
    CREATE INDEX IX_TenderSource_IsActive ON dbo.TenderSource(IsActive);
GO

-- ---------------------------------------------------------------------------
-- 2. dbo.TenderOpportunity — normalized opportunity records
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.TenderOpportunity', 'U') IS NULL
CREATE TABLE dbo.TenderOpportunity
(
    TenderOpportunityID INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TenderOpportunity PRIMARY KEY,
    TenderSourceID     INT NULL CONSTRAINT FK_TenderOpportunity_Source FOREIGN KEY REFERENCES dbo.TenderSource(TenderSourceID),
    Title              NVARCHAR(500) NOT NULL,
    Organization       NVARCHAR(300) NULL,
    Country            NVARCHAR(100) NULL,
    Sector             NVARCHAR(200) NULL,
    Description        NVARCHAR(MAX) NULL,
    SourceUrl          NVARCHAR(1000) NOT NULL,
    SourceReference    NVARCHAR(200) NULL,  -- source-specific ID (e.g. tender number, feed GUID)
    PublicationDate    DATETIME2 NULL,
    DeadlineDate       DATETIME2 NULL,
    EstimatedValue     DECIMAL(18,2) NULL,
    Currency           VARCHAR(10) NULL,
    ContentHash        VARCHAR(64) NOT NULL, -- SHA256(normalized_title|org|deadline) for dedup
    VerificationStatus VARCHAR(20) NOT NULL CONSTRAINT DF_TenderOpportunity_Verification DEFAULT 'Unverified', -- Unverified / Verified
    RelevanceScore     INT NULL,             -- 0-100, computed against active interest profiles
    AiSummary          NVARCHAR(MAX) NULL,   -- AI-generated summary (lazily populated)
    AiStructuredData   NVARCHAR(MAX) NULL,  -- JSON: extracted fields (value, eligibility, documents, contact)
    AiEnrichedAt       DATETIME2 NULL,
    RawContent         NVARCHAR(MAX) NULL,  -- original raw payload for re-normalization
    CreatedAt          DATETIME2 NOT NULL CONSTRAINT DF_TenderOpportunity_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt          DATETIME2 NULL,
    CONSTRAINT UQ_TenderOpportunity_ContentHash UNIQUE (ContentHash),
    CONSTRAINT CK_TenderOpportunity_Verification CHECK (VerificationStatus IN ('Unverified', 'Verified')),
    CONSTRAINT CK_TenderOpportunity_Relevance CHECK (RelevanceScore IS NULL OR (RelevanceScore >= 0 AND RelevanceScore <= 100))
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TenderOpportunity_Source' AND object_id = OBJECT_ID('dbo.TenderOpportunity'))
    CREATE INDEX IX_TenderOpportunity_Source ON dbo.TenderOpportunity(TenderSourceID);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TenderOpportunity_Country' AND object_id = OBJECT_ID('dbo.TenderOpportunity'))
    CREATE INDEX IX_TenderOpportunity_Country ON dbo.TenderOpportunity(Country);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TenderOpportunity_Sector' AND object_id = OBJECT_ID('dbo.TenderOpportunity'))
    CREATE INDEX IX_TenderOpportunity_Sector ON dbo.TenderOpportunity(Sector);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TenderOpportunity_Deadline' AND object_id = OBJECT_ID('dbo.TenderOpportunity'))
    CREATE INDEX IX_TenderOpportunity_Deadline ON dbo.TenderOpportunity(DeadlineDate);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TenderOpportunity_Relevance' AND object_id = OBJECT_ID('dbo.TenderOpportunity'))
    CREATE INDEX IX_TenderOpportunity_Relevance ON dbo.TenderOpportunity(RelevanceScore);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TenderOpportunity_Verification' AND object_id = OBJECT_ID('dbo.TenderOpportunity'))
    CREATE INDEX IX_TenderOpportunity_Verification ON dbo.TenderOpportunity(VerificationStatus);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TenderOpportunity_Publication' AND object_id = OBJECT_ID('dbo.TenderOpportunity'))
    CREATE INDEX IX_TenderOpportunity_Publication ON dbo.TenderOpportunity(PublicationDate);
GO

-- ---------------------------------------------------------------------------
-- 3. dbo.TenderInterestProfile — configurable business interests for matching
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.TenderInterestProfile', 'U') IS NULL
CREATE TABLE dbo.TenderInterestProfile
(
    InterestProfileID INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TenderInterestProfile PRIMARY KEY,
    Name              NVARCHAR(200) NOT NULL CONSTRAINT UQ_TenderInterestProfile_Name UNIQUE,
    Sectors           NVARCHAR(MAX) NULL,   -- JSON array of sector strings
    Keywords          NVARCHAR(MAX) NULL,   -- JSON array of keyword strings
    Countries         NVARCHAR(MAX) NULL,   -- JSON array of country strings
    MinValue          DECIMAL(18,2) NULL,
    MaxValue          DECIMAL(18,2) NULL,
    Currency          VARCHAR(10) NULL,
    IsActive          BIT NOT NULL CONSTRAINT DF_TenderInterestProfile_IsActive DEFAULT 1,
    CreatedAt         DATETIME2 NOT NULL CONSTRAINT DF_TenderInterestProfile_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt         DATETIME2 NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TenderInterestProfile_IsActive' AND object_id = OBJECT_ID('dbo.TenderInterestProfile'))
    CREATE INDEX IX_TenderInterestProfile_IsActive ON dbo.TenderInterestProfile(IsActive);
GO

-- ---------------------------------------------------------------------------
-- 4. dbo.SavedTender — user-saved opportunities with status tracking
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.SavedTender', 'U') IS NULL
CREATE TABLE dbo.SavedTender
(
    SavedTenderID    INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SavedTender PRIMARY KEY,
    TenderOpportunityID INT NOT NULL CONSTRAINT FK_SavedTender_Opportunity FOREIGN KEY REFERENCES dbo.TenderOpportunity(TenderOpportunityID),
    UserID           INT NOT NULL CONSTRAINT FK_SavedTender_User FOREIGN KEY REFERENCES dbo.[User](UserID),
    Status           VARCHAR(20) NOT NULL CONSTRAINT DF_SavedTender_Status DEFAULT 'New', -- New / Reviewing / Interested / Applied / Won / Lost / Archived
    Notes            NVARCHAR(MAX) NULL,
    CreatedAt        DATETIME2 NOT NULL CONSTRAINT DF_SavedTender_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt        DATETIME2 NULL,
    CONSTRAINT UQ_SavedTender_Opp_User UNIQUE (TenderOpportunityID, UserID),
    CONSTRAINT CK_SavedTender_Status CHECK (Status IN ('New', 'Reviewing', 'Interested', 'Applied', 'Won', 'Lost', 'Archived'))
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SavedTender_User' AND object_id = OBJECT_ID('dbo.SavedTender'))
    CREATE INDEX IX_SavedTender_User ON dbo.SavedTender(UserID);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SavedTender_Status' AND object_id = OBJECT_ID('dbo.SavedTender'))
    CREATE INDEX IX_SavedTender_Status ON dbo.SavedTender(Status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SavedTender_Opportunity' AND object_id = OBJECT_ID('dbo.SavedTender'))
    CREATE INDEX IX_SavedTender_Opportunity ON dbo.SavedTender(TenderOpportunityID);
GO

-- ---------------------------------------------------------------------------
-- 5. NotificationConfig seed for TENDER_DEADLINE_REMINDER event
--    RoleIDs: 1=Administrator, 2=Marketing Manager, 3=Marketing Analyst
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.NotificationConfig WHERE TriggerEvent = 'TENDER_DEADLINE_REMINDER')
BEGIN
    INSERT INTO dbo.NotificationConfig (TriggerEvent, Channel, RoleID, Enabled) VALUES
        ('TENDER_DEADLINE_REMINDER', 'Email', 1, 1),  -- Administrator
        ('TENDER_DEADLINE_REMINDER', 'Email', 2, 1),  -- Marketing Manager
        ('TENDER_DEADLINE_REMINDER', 'Email', 3, 1);  -- Marketing Analyst
END
GO

-- ---------------------------------------------------------------------------
-- 6. NotificationConfig seed for TENDER_NEW_MATCH event
--    Notifies when a new high-relevance opportunity is collected.
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.NotificationConfig WHERE TriggerEvent = 'TENDER_NEW_MATCH')
BEGIN
    INSERT INTO dbo.NotificationConfig (TriggerEvent, Channel, RoleID, Enabled) VALUES
        ('TENDER_NEW_MATCH', 'Email', 1, 1),  -- Administrator
        ('TENDER_NEW_MATCH', 'Email', 2, 1),  -- Marketing Manager
        ('TENDER_NEW_MATCH', 'Email', 3, 1);  -- Marketing Analyst
END
GO

-- ---------------------------------------------------------------------------
-- 7. SystemConfig defaults for tender intelligence
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.SystemConfig WHERE ConfigKey = 'tenders.collectionCron')
    INSERT INTO dbo.SystemConfig (ConfigKey, ConfigValue) VALUES ('tenders.collectionCron', '0 */6 * * *');
IF NOT EXISTS (SELECT 1 FROM dbo.SystemConfig WHERE ConfigKey = 'tenders.reminderLeadDays')
    INSERT INTO dbo.SystemConfig (ConfigKey, ConfigValue) VALUES ('tenders.reminderLeadDays', '7');
IF NOT EXISTS (SELECT 1 FROM dbo.SystemConfig WHERE ConfigKey = 'tenders.reminderCron')
    INSERT INTO dbo.SystemConfig (ConfigKey, ConfigValue) VALUES ('tenders.reminderCron', '0 9 * * *');
IF NOT EXISTS (SELECT 1 FROM dbo.SystemConfig WHERE ConfigKey = 'tenders.defaultRateLimitMs')
    INSERT INTO dbo.SystemConfig (ConfigKey, ConfigValue) VALUES ('tenders.defaultRateLimitMs', '2000');
IF NOT EXISTS (SELECT 1 FROM dbo.SystemConfig WHERE ConfigKey = 'tenders.fetchTimeoutMs')
    INSERT INTO dbo.SystemConfig (ConfigKey, ConfigValue) VALUES ('tenders.fetchTimeoutMs', '30000');
IF NOT EXISTS (SELECT 1 FROM dbo.SystemConfig WHERE ConfigKey = 'tenders.highRelevanceThreshold')
    INSERT INTO dbo.SystemConfig (ConfigKey, ConfigValue) VALUES ('tenders.highRelevanceThreshold', '70');
GO
