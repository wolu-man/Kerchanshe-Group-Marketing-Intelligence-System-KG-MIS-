export interface User {
  userId: number;
  cuasId: string;
  name: string;
  email?: string | null;
  role: string;
}

export interface Region {
  RegionID: number;
  RegionName: string;
  Country: string;
  OutletCount?: number;
}

export interface Outlet {
  OutletID: number;
  RegionID: number;
  RegionName?: string;
  OutletName: string;
  City: string;
}

export interface Product {
  ProductID: number;
  ProductCode: string;
  Name: string;
  Category: string;
  UnitPrice: number | null;
}

export interface MarketVisitReport {
  ReportID: number;
  UserID: number;
  SubmittedByName: string;
  OutletID: number;
  OutletName: string;
  City: string;
  RegionID?: number;
  RegionName?: string;
  VisitDate: string;
  Notes: string | null;
  Status: 'Draft' | 'Submitted' | 'Reviewed';
  CreatedAt: string;
}

export type QuestionType = 'SingleChoice' | 'MultiChoice' | 'Text' | 'Numeric' | 'Rating';

export interface LogicRule {
  dependsOnQuestionId: number;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte';
  value: string | number;
}

export interface SurveyQuestion {
  questionId?: number;
  surveyId?: number;
  questionType: QuestionType;
  questionText: string;
  options?: string[];
  logicRule?: LogicRule | null;
  isRequired?: boolean;
  minValue?: number;
  maxValue?: number;
  sortOrder?: number;
}

export interface Survey {
  SurveyID: number;
  Title: string;
  BusinessUnit: string;
  Status: 'Draft' | 'Published' | 'Closed';
  CreatedBy: number;
  CreatedByName?: string;
  QuestionCount?: number;
  ResponseCount?: number;
  questions: SurveyQuestion[];
}

export interface CompetitorPrice {
  PriceID: number;
  ProductID: number;
  ProductName: string;
  Category: string;
  OwnPrice: number | null;
  CompetitorName: string;
  Price: number;
  RegionID: number;
  RegionName: string;
  OutletID?: number;
  OutletName?: string;
  RecordedBy: number;
  RecordedByName: string;
  RecordedDate: string;
  ObservedAt: string;
  GapPercent: number;
}

export interface PriceComparison {
  ProductID: number;
  ProductName: string;
  Category: string;
  OwnPrice: number | null;
  CompetitorName: string;
  AvgCompetitorPrice: number;
  AvgGapPercent: number;
  Observations: number;
}

export interface PriceGapAlert {
  GapAlertID: number;
  PriceID: number;
  ProductID: number;
  ProductName: string;
  Category: string;
  CompetitorName: string;
  CompetitorPrice: number;
  OwnPrice: number;
  GapPercent: number;
  Status: string;
  CreatedAt: string;
  RegionName: string;
}

export interface SyncLogEntry {
  SyncLogID: number;
  Entity: string;
  Status: string;
  RecordsProcessed: number;
  ErrorCount: number;
  ErrorDetail: string | null;
  StartedAt: string;
  FinishedAt: string | null;
}

export interface NotificationEntry {
  NotificationID: number;
  TriggerEvent: string;
  Channel: string;
  RecipientName: string;
  RecipientEmail: string | null;
  Subject: string | null;
  Status: string;
  Attempts: number;
  SentAt: string | null;
  CreatedAt: string;
}

export interface NotificationConfigEntry {
  ConfigID: number;
  TriggerEvent: string;
  Channel: string;
  Enabled: boolean;
  RoleID: number;
  RoleName: string;
}

export interface RoleMappingEntry {
  MappingID: number;
  CUASClaim: string;
  RoleID: number;
  RoleName: string;
}

export interface Report {
  reportId: string;
  name: string;
  embedUrl: string;
  workspaceId: string;
}
