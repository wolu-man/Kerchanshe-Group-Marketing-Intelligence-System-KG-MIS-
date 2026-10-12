-- 031: Create AiConversation table (AI Form Assistant chat history)
-- One row per chat message (user prompt or assistant reply) for a form.

IF OBJECT_ID('dbo.AiConversation', 'U') IS NULL
CREATE TABLE dbo.AiConversation
(
  ConversationID INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AiConversation PRIMARY KEY,
  UserID         INT NOT NULL,
  TemplateID     INT NULL,
  Role           VARCHAR(20) NOT NULL,
  Provider       VARCHAR(20) NULL,
  Model          NVARCHAR(100) NULL,
  Message        NVARCHAR(MAX) NOT NULL,
  ActionsJSON    NVARCHAR(MAX) NULL,
  DurationMs     INT NULL,
  Success        BIT NOT NULL CONSTRAINT DF_AiConversation_Success DEFAULT 1,
  ErrorCategory  NVARCHAR(50) NULL,
  CreatedAt      DATETIME2 NOT NULL CONSTRAINT DF_AiConversation_CreatedAt DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_AiConversation_User FOREIGN KEY (UserID) REFERENCES dbo.[User](UserID) ON DELETE CASCADE,
  CONSTRAINT FK_AiConversation_Form FOREIGN KEY (TemplateID) REFERENCES dbo.FormTemplate(TemplateID) ON DELETE CASCADE,
  CONSTRAINT CK_AiConversation_Role CHECK (Role IN ('user', 'assistant'))
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AiConversation_User_Form' AND object_id = OBJECT_ID('dbo.AiConversation'))
  CREATE INDEX IX_AiConversation_User_Form ON dbo.AiConversation(UserID, TemplateID, CreatedAt);
GO
