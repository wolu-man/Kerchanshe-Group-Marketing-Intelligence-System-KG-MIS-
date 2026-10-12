-- 013: Create InterviewQA table for structured question-answer pairs

IF OBJECT_ID('dbo.InterviewQA', 'U') IS NULL
CREATE TABLE dbo.InterviewQA
(
  QaID        INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_InterviewQA PRIMARY KEY,
  InterviewID INT NOT NULL,
  Question    NVARCHAR(500) NOT NULL,
  Answer      NVARCHAR(MAX) NULL,
  SortOrder   INT NOT NULL CONSTRAINT DF_InterviewQA_SortOrder DEFAULT 0,
  CreatedAt   DATETIME2 NOT NULL CONSTRAINT DF_InterviewQA_CreatedAt DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_InterviewQA_Interview FOREIGN KEY (InterviewID) REFERENCES dbo.Interview(InterviewID) ON DELETE CASCADE
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_InterviewQA_Interview' AND object_id = OBJECT_ID('dbo.InterviewQA'))
  CREATE INDEX IX_InterviewQA_Interview ON dbo.InterviewQA(InterviewID);
GO
