-- =============================================================================
-- KG-MIS  Migration 002 - NexForm Phase 2 "Depth" features
-- Reference: NexForm SRS v1.1 Phase 2 (parent/child, cross-form reporting,
--            calculated fields, display conditions, response editing, scoring,
--            report access control, report sharing, branding, save & resume,
--            anomaly detection, consent versioning, audit retention policy).
-- Idempotent (safe to re-run).
-- =============================================================================
USE KG_MIS;
GO

-- ---------------------------------------------------------------------------
-- 1. FormTemplate additions (parent/child inheritance, consent, editing,
--    anomaly auto-reject, drafts)
-- ---------------------------------------------------------------------------
IF COL_LENGTH('dbo.FormTemplate', 'ParentTemplateID') IS NULL
    ALTER TABLE dbo.FormTemplate ADD ParentTemplateID INT NULL;
GO
IF COL_LENGTH('dbo.FormTemplate', 'InheritedFromVersionID') IS NULL
    ALTER TABLE dbo.FormTemplate ADD InheritedFromVersionID INT NULL;
GO
IF COL_LENGTH('dbo.FormTemplate', 'GDPRConsentText') IS NULL
    ALTER TABLE dbo.FormTemplate ADD GDPRConsentText NVARCHAR(MAX) NULL;
GO
IF COL_LENGTH('dbo.FormTemplate', 'GDPRConsentVersion') IS NULL
    ALTER TABLE dbo.FormTemplate ADD GDPRConsentVersion INT NOT NULL CONSTRAINT DF_FormTemplate_GDPRConsentVersion DEFAULT 0;
GO
IF COL_LENGTH('dbo.FormTemplate', 'EditWindowHours') IS NULL
    ALTER TABLE dbo.FormTemplate ADD EditWindowHours INT NULL; -- NULL = editing disabled
GO
IF COL_LENGTH('dbo.FormTemplate', 'AutoRejectAnomalies') IS NULL
    ALTER TABLE dbo.FormTemplate ADD AutoRejectAnomalies BIT NOT NULL CONSTRAINT DF_FormTemplate_AutoRejectAnomalies DEFAULT 0;
GO
IF COL_LENGTH('dbo.FormTemplate', 'AllowDrafts') IS NULL
    ALTER TABLE dbo.FormTemplate ADD AllowDrafts BIT NOT NULL CONSTRAINT DF_FormTemplate_AllowDrafts DEFAULT 1;
GO

-- Single-level inheritance: child cannot become a parent (REL-17) is enforced
-- in the service layer. FK self-reference added only if not present.
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_FormTemplate_Parent')
    ALTER TABLE dbo.FormTemplate ADD CONSTRAINT FK_FormTemplate_Parent
        FOREIGN KEY (ParentTemplateID) REFERENCES dbo.FormTemplate(TemplateID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_FormTemplate_Parent' AND object_id = OBJECT_ID('dbo.FormTemplate'))
    CREATE INDEX IX_FormTemplate_Parent ON dbo.FormTemplate(ParentTemplateID) WHERE ParentTemplateID IS NOT NULL;
GO

-- ---------------------------------------------------------------------------
-- 2. Consent versioning (SC-11)
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.FormConsentHistory', 'U') IS NULL
CREATE TABLE dbo.FormConsentHistory
(
    ConsentHistoryID INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_FormConsentHistory PRIMARY KEY,
    TemplateID       INT NOT NULL CONSTRAINT FK_FormConsentHistory_Template FOREIGN KEY REFERENCES dbo.FormTemplate(TemplateID),
    ConsentVersion   INT NOT NULL,
    ConsentText      NVARCHAR(MAX) NOT NULL,
    EffectiveAt      DATETIME2 NOT NULL CONSTRAINT DF_FormConsentHistory_EffectiveAt DEFAULT SYSUTCDATETIME(),
    ChangedBy        INT NULL CONSTRAINT FK_FormConsentHistory_User FOREIGN KEY REFERENCES dbo.[User](UserID),
    CONSTRAINT UQ_FormConsentHistory_Template_Version UNIQUE (TemplateID, ConsentVersion)
);
GO

CREATE INDEX IX_FormConsentHistory_Template ON dbo.FormConsentHistory(TemplateID);
GO

-- ---------------------------------------------------------------------------
-- 3. FormResponse additions (scoring, editing audit counters, consent version)
-- ---------------------------------------------------------------------------
IF COL_LENGTH('dbo.FormResponse', 'TotalScore') IS NULL
    ALTER TABLE dbo.FormResponse ADD TotalScore DECIMAL(10,2) NULL;
GO
IF COL_LENGTH('dbo.FormResponse', 'ScoreMax') IS NULL
    ALTER TABLE dbo.FormResponse ADD ScoreMax DECIMAL(10,2) NULL;
GO
IF COL_LENGTH('dbo.FormResponse', 'EditCount') IS NULL
    ALTER TABLE dbo.FormResponse ADD EditCount INT NOT NULL CONSTRAINT DF_FormResponse_EditCount DEFAULT 0;
GO
IF COL_LENGTH('dbo.FormResponse', 'EditedAt') IS NULL
    ALTER TABLE dbo.FormResponse ADD EditedAt DATETIME2 NULL;
GO
IF COL_LENGTH('dbo.FormResponse', 'ConsentVersion') IS NULL
    ALTER TABLE dbo.FormResponse ADD ConsentVersion INT NULL;
GO

-- Save & resume (CX-04): resume tokens + partial-draft timestamps.
IF COL_LENGTH('dbo.FormResponse', 'ResumeToken') IS NULL
    ALTER TABLE dbo.FormResponse ADD ResumeToken VARCHAR(100) NULL;
GO
IF COL_LENGTH('dbo.FormResponse', 'ResumeTokenExpiresAt') IS NULL
    ALTER TABLE dbo.FormResponse ADD ResumeTokenExpiresAt DATETIME2 NULL;
GO
IF COL_LENGTH('dbo.FormResponse', 'DraftSavedAt') IS NULL
    ALTER TABLE dbo.FormResponse ADD DraftSavedAt DATETIME2 NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_FormResponse_ResumeToken' AND object_id = OBJECT_ID('dbo.FormResponse'))
    CREATE INDEX IX_FormResponse_ResumeToken ON dbo.FormResponse(ResumeToken) WHERE ResumeToken IS NOT NULL;
GO

-- ---------------------------------------------------------------------------
-- 4. Response revisions (audit trail for response editing, SC-09)
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.ResponseRevision', 'U') IS NULL
CREATE TABLE dbo.ResponseRevision
(
    RevisionID    INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ResponseRevision PRIMARY KEY,
    ResponseID    INT NOT NULL CONSTRAINT FK_ResponseRevision_Response FOREIGN KEY REFERENCES dbo.FormResponse(ResponseID),
    VersionID     INT NOT NULL CONSTRAINT FK_ResponseRevision_Version FOREIGN KEY REFERENCES dbo.FormVersion(VersionID),
    AnswersJSON   NVARCHAR(MAX) NOT NULL,
    ScoreJSON     NVARCHAR(MAX) NULL,
    EditedBy      INT NULL CONSTRAINT FK_ResponseRevision_User FOREIGN KEY REFERENCES dbo.[User](UserID),
    Reason        NVARCHAR(500) NULL,
    CreatedAt     DATETIME2 NOT NULL CONSTRAINT DF_ResponseRevision_CreatedAt DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX IX_ResponseRevision_Response ON dbo.ResponseRevision(ResponseID);
GO

-- ---------------------------------------------------------------------------
-- 5. Cross-form reporting (REL-18..21)
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.FormCrossReport', 'U') IS NULL
CREATE TABLE dbo.FormCrossReport
(
    CrossReportID     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_FormCrossReport PRIMARY KEY,
    Name              NVARCHAR(200) NOT NULL,
    Description       NVARCHAR(MAX) NULL,
    TemplateIDsJSON   NVARCHAR(MAX) NOT NULL,   -- [1,2,3]
    FieldMappingsJSON NVARCHAR(MAX) NULL,       -- [{displayName, fieldKeys:{templateId:key}}]
    LayoutJSON        NVARCHAR(MAX) NULL,       -- dashboard widget layout
    CreatedBy         INT NOT NULL CONSTRAINT FK_FormCrossReport_User FOREIGN KEY REFERENCES dbo.[User](UserID),
    CreatedAt         DATETIME2 NOT NULL CONSTRAINT DF_FormCrossReport_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt         DATETIME2 NULL
);
GO

CREATE INDEX IX_FormCrossReport_CreatedBy ON dbo.FormCrossReport(CreatedBy);
GO

-- ---------------------------------------------------------------------------
-- 6. Report sharing (DR-05, DR-11) - form-level or cross-report share links
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.FormShare', 'U') IS NULL
CREATE TABLE dbo.FormShare
(
    ShareID        INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_FormShare PRIMARY KEY,
    TemplateID     INT NULL CONSTRAINT FK_FormShare_Template FOREIGN KEY REFERENCES dbo.FormTemplate(TemplateID),
    CrossReportID  INT NULL CONSTRAINT FK_FormShare_CrossReport FOREIGN KEY REFERENCES dbo.FormCrossReport(CrossReportID),
    ShareType      VARCHAR(20) NOT NULL,  -- 'form' | 'cross-report'
    Token          VARCHAR(64) NOT NULL CONSTRAINT UQ_FormShare_Token UNIQUE,
    CreatedBy      INT NOT NULL CONSTRAINT FK_FormShare_User FOREIGN KEY REFERENCES dbo.[User](UserID),
    CreatedAt      DATETIME2 NOT NULL CONSTRAINT DF_FormShare_CreatedAt DEFAULT SYSUTCDATETIME(),
    ExpiresAt      DATETIME2 NULL,
    FiltersJSON    NVARCHAR(MAX) NULL,
    RevokedAt      DATETIME2 NULL
);
GO

CREATE INDEX IX_FormShare_Template ON dbo.FormShare(TemplateID);
GO

-- ---------------------------------------------------------------------------
-- 7. Report access control (DR-10)
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.FormReportAccess', 'U') IS NULL
CREATE TABLE dbo.FormReportAccess
(
    AccessID     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_FormReportAccess PRIMARY KEY,
    TemplateID   INT NOT NULL CONSTRAINT FK_FormReportAccess_Template FOREIGN KEY REFERENCES dbo.FormTemplate(TemplateID),
    UserID       INT NOT NULL CONSTRAINT FK_FormReportAccess_User FOREIGN KEY REFERENCES dbo.[User](UserID),
    AccessLevel  VARCHAR(20) NOT NULL CONSTRAINT DF_FormReportAccess_AccessLevel DEFAULT 'View', -- View / Export
    GrantedBy    INT NULL CONSTRAINT FK_FormReportAccess_GrantedBy FOREIGN KEY REFERENCES dbo.[User](UserID),
    CreatedAt    DATETIME2 NOT NULL CONSTRAINT DF_FormReportAccess_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_FormReportAccess_Template_User UNIQUE (TemplateID, UserID)
);
GO

CREATE INDEX IX_FormReportAccess_User ON dbo.FormReportAccess(UserID);
GO

-- ---------------------------------------------------------------------------
-- 8. Data anomaly flags (DR-13, OP-07)
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.FormAnomalyFlag', 'U') IS NULL
CREATE TABLE dbo.FormAnomalyFlag
(
    FlagID       INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_FormAnomalyFlag PRIMARY KEY,
    ResponseID   INT NOT NULL CONSTRAINT FK_FormAnomalyFlag_Response FOREIGN KEY REFERENCES dbo.FormResponse(ResponseID),
    TemplateID   INT NOT NULL CONSTRAINT FK_FormAnomalyFlag_Template FOREIGN KEY REFERENCES dbo.FormTemplate(TemplateID),
    FieldKey     VARCHAR(100) NULL,
    AnomalyType  VARCHAR(50) NOT NULL, -- outlier / implausible / too_fast / duplicate_burst / pattern
    Score        DECIMAL(8,3) NULL,
    Reason       NVARCHAR(500) NOT NULL,
    Status       VARCHAR(20) NOT NULL CONSTRAINT DF_FormAnomalyFlag_Status DEFAULT 'Pending', -- Pending / Acknowledged / Resolved
    AutoRejected BIT NOT NULL CONSTRAINT DF_FormAnomalyFlag_AutoRejected DEFAULT 0,
    ReviewedBy   INT NULL CONSTRAINT FK_FormAnomalyFlag_ReviewedBy FOREIGN KEY REFERENCES dbo.[User](UserID),
    ReviewedAt   DATETIME2 NULL,
    Resolution   NVARCHAR(500) NULL,
    CreatedAt    DATETIME2 NOT NULL CONSTRAINT DF_FormAnomalyFlag_CreatedAt DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX IX_FormAnomalyFlag_Template_Status ON dbo.FormAnomalyFlag(TemplateID, Status);
CREATE INDEX IX_FormAnomalyFlag_Response ON dbo.FormAnomalyFlag(ResponseID);
GO

-- ---------------------------------------------------------------------------
-- 9. System configuration (audit retention days, anomaly thresholds)
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.SystemConfig', 'U') IS NULL
CREATE TABLE dbo.SystemConfig
(
    ConfigID    INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SystemConfig PRIMARY KEY,
    ConfigKey   VARCHAR(100) NOT NULL CONSTRAINT UQ_SystemConfig_Key UNIQUE,
    ConfigValue NVARCHAR(500) NOT NULL,
    UpdatedBy   INT NULL CONSTRAINT FK_SystemConfig_User FOREIGN KEY REFERENCES dbo.[User](UserID),
    UpdatedAt   DATETIME2 NULL CONSTRAINT DF_SystemConfig_UpdatedAt DEFAULT SYSUTCDATETIME()
);
GO

-- Defaults (configurable per plan): audit retention 365d, drafts 7d.
IF NOT EXISTS (SELECT 1 FROM dbo.SystemConfig WHERE ConfigKey = 'audit.retentionDays')
    INSERT INTO dbo.SystemConfig (ConfigKey, ConfigValue) VALUES ('audit.retentionDays', '365');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.SystemConfig WHERE ConfigKey = 'draft.retentionDays')
    INSERT INTO dbo.SystemConfig (ConfigKey, ConfigValue) VALUES ('draft.retentionDays', '7');
GO
