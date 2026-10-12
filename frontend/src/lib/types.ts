// Shared API types matching the backend responses (see backend/src).

export interface AuthUser {
  userId: number;
  cuasId: string;
  name: string;
  email: string | null;
  role: Role;
  profilePhoto?: string | null;
}

export type Role =
  | 'Administrator'
  | 'Marketing Manager'
  | 'Marketing Analyst'
  | 'Field Officer'
  | 'Viewer';

export interface FormTemplate {
  TemplateID: number;
  OwnerUserID: number;
  Title: string;
  Description: string | null;
  Status: 'Draft' | 'Published' | 'Archived';
  AccessMode: 'Public' | 'Domain' | 'Invite' | 'Group' | 'Password';
  MaxResponses: number | null;
  PublishAt: string | null;
  ExpireAt: string | null;
  GDPRConsentRequired: boolean;
  GDPRConsentVersion: number;
  GDPRConsentText: string | null;
  EditWindowHours: number | null;
  AutoRejectAnomalies: boolean;
  AllowDrafts: boolean;
  ParentTemplateID: number | null;
  InheritedFromVersionID: number | null;
  LinkedFormTemplateID: number | null;
  ResponseCount: number;
  CreatedAt: string;
  UpdatedAt: string | null;
  OwnerName: string;
  CurrentVersion: number | null;
}

export interface FormVersion {
  VersionID: number;
  VersionNumber: number;
  SchemaJSON: string;
  IsPublished: boolean;
  PublishedAt?: string | null;
  CreatedAt?: string;
}

export interface FormPage {
  id: string;
  title: string;
}

export interface FormBranding {
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  fontFamily?: string;
  thankYou?: {
    title?: string;
    message?: string;
    showResponseId?: boolean;
    redirectUrl?: string;
  };
  theme?: FormTheme;
  appearanceConfig?: AppearanceConfig;
}

// ---------------------------------------------------------------------------
// Per-Field Visual Styling
// ---------------------------------------------------------------------------
export interface FieldStyle {
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  fontColor?: string;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  labelSize?: string;
  labelWeight?: string;
  labelColor?: string;
  labelPosition?: 'top' | 'left' | 'right';
  hideLabel?: boolean;
  descriptionSize?: string;
  descriptionColor?: string;
  hideDescription?: boolean;
  placeholderColor?: string;
  placeholderFontStyle?: 'normal' | 'italic';
  hidePlaceholder?: boolean;
  inputBg?: string;
  inputBorder?: string;
  inputBorderColor?: string;
  inputBorderRadius?: string;
  inputShadow?: string;
  inputPaddingH?: string;
  inputPaddingV?: string;
  focusBorderColor?: string;
  focusShadow?: string;
  hoverBorderColor?: string;
  requiredColor?: string;
  requiredPosition?: 'label-end' | 'floating';
  fieldMargin?: string;
  fieldPadding?: string;
  labelGap?: string;
  width?: string;
  minHeight?: string;
  alignSelf?: 'start' | 'center' | 'end' | 'stretch';
  justifySelf?: 'start' | 'center' | 'end' | 'stretch';
  responsive?: {
    tablet?: { columnWidth?: 1 | 2 | 3 | 4; fontSize?: string; hideLabel?: boolean };
    mobile?: { columnWidth?: 1 | 2 | 3 | 4; fontSize?: string; hideLabel?: boolean };
  };
}

// ---------------------------------------------------------------------------
// Column Layout
// ---------------------------------------------------------------------------
export interface FieldLayout {
  columnWidth?: 1 | 2 | 3 | 4;
  rowGap?: number;
  forceRowBreak?: boolean;
  columnGap?: number;
}

// ---------------------------------------------------------------------------
// Global Form Theme
// ---------------------------------------------------------------------------
export interface FormTheme {
  fieldRadius?: string;
  fieldBorder?: string;
  fieldBg?: string;
  labelFont?: string;
  labelSize?: string;
  labelWeight?: string;
  labelColor?: string;
  inputFont?: string;
  inputSize?: string;
  inputWeight?: string;
  inputColor?: string;
  inputBg?: string;
  inputBorder?: string;
  inputRadius?: string;
  inputPadding?: string;
  focusBorder?: string;
  focusShadow?: string;
  sectionBg?: string;
  sectionRadius?: string;
  gap?: string;
  contentMaxWidth?: string;
}

export interface AppearanceConfig {
  header?: {
    enabled: boolean;
    imageUrl?: string;
    height: 'small' | 'medium' | 'large';
    fit: 'cover' | 'contain';
    position: 'left' | 'center' | 'right';
  };
  watermark?: {
    enabled: boolean;
    type: 'image' | 'text';
    imageUrl?: string;
    text?: string;
    position: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'repeat';
    opacity: number;
    size: number;
    rotation: number;
  };
  bodyBackground?: {
    type: 'default' | 'solid' | 'gradient';
    color?: string;
    gradientStart?: string;
    gradientEnd?: string;
    gradientDirection: number;
  };
  footer?: {
    enabled: boolean;
    text?: string;
    logoUrl?: string;
    backgroundColor?: string;
    textColor?: string;
    textAlign: 'left' | 'center' | 'right';
    copyrightText?: string;
    showPoweredBy: boolean;
  };
}

export interface FormSchemaEnvelope {
  schemaVersion: number;
  pages: FormPage[];
  elements: FormElement[];
  branding?: FormBranding;
}

export interface FormElement {
  key: string;
  type: FieldType;
  label: string;
  required?: boolean;
  description?: string;
  placeholder?: string;
  options?: string[];
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  regex?: string;
  minSelections?: number;
  maxSelections?: number;
  fileAllowedTypes?: string[];
  fileMaxSizeMB?: number;
  fileMaxCount?: number;
  conditional?: ConditionalRule | ConditionalGroup;
  displayWhen?: ConditionalRule | ConditionalGroup;
  branching?: BranchingRule;
  pageId?: string;
  scoring?: { optionPoints?: Record<string, number>; maxPoints?: number };
  formula?: string;
  prefillSource?: 'name' | 'email' | 'static';
  prefillValue?: string;
  matrixRows?: string[];
  matrixColumns?: string[];
  matrixScale?: 'single' | 'multi';
  radiusKm?: number;
  isReadOnly?: boolean;
  order: number;
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  contentHtml?: string;
  imageUrl?: string;
  imageAlt?: string;
  imageCaption?: string;
  imageWidth?: string;
  imageFit?: 'cover' | 'contain' | 'fill' | 'none';
  imageBorderRadius?: number;
  imageCrop?: { x: number; y: number; w: number; h: number };
  dividerColor?: string;
  dividerStyle?: 'solid' | 'dashed' | 'dotted';
  spacerHeight?: number;
  buttonLabel?: string;
  buttonUrl?: string;
  buttonVariant?: 'primary' | 'secondary' | 'ghost';
  quoteContent?: string;
  quoteAuthor?: string;
  penColor?: string;
  penWidth?: number;
  signatureHeight?: number;
  style?: FieldStyle;
  layout?: FieldLayout;
  /** Free-drag position — if set, element is absolutely positioned on canvas */
  x?: number;
  y?: number;
  /** Explicit width in pixels for free-drag mode */
  posWidth?: number;
  /** Explicit height in pixels for free-drag mode (0 = auto) */
  posHeight?: number;
  /** Parent container key — element renders inside this container */
  containerKey?: string;
  /** Container layout mode (only meaningful on 'container' type elements) */
  containerLayout?: {
    columns?: 1 | 2 | 3;
    gap?: number;
    background?: string;
    border?: string;
    borderColor?: string;
    borderRadius?: string;
    padding?: string;
  };
}

export type FieldType =
  | 'shorttext'
  | 'longtext'
  | 'number'
  | 'email'
  | 'phone'
  | 'date'
  | 'time'
  | 'datetime'
  | 'dropdown'
  | 'multiplechoice'
  | 'rating'
  | 'yesno'
  | 'file'
  | 'image'
  | 'signature'
  | 'slider'
  | 'location'
  | 'matrix'
  | 'richtext'
  | 'calculated'
  | 'prefill'
  | 'section'
  | 'instructions'
  | 'heading'
  | 'content-image'
  | 'divider'
  | 'spacer'
  | 'button'
  | 'quote'
  | 'container';

export interface ConditionalRule {
  fieldKey: string;
  operator: string;
  value?: unknown;
}

export interface ConditionalGroup {
  operator: 'and' | 'or';
  rules: ConditionalRule[];
}

export interface BranchingRule {
  condition: ConditionalRule | ConditionalGroup;
  jumpTo?: string;
  endForm?: boolean;
}

export type Answers = Record<string, unknown>;

export interface DraftResponse {
  responseId: number;
  resumeToken: string;
  savedAt: string;
  answers?: Answers;
}

export interface ResponseDetail {
  ResponseID: number;
  VersionID: number;
  TemplateID: number;
  RespondentUserID: number | null;
  RespondentEmail: string | null;
  Status: string;
  ConsentGiven: boolean | null;
  ConsentVersion: number | null;
  IPAddress: string | null;
  SubmittedAt: string | null;
  IsErased: boolean;
  CreatedAt: string;
  UpdatedAt: string | null;
  TotalScore: number | null;
  ScoreMax: number | null;
  EditCount: number;
  EditedAt: string | null;
  RespondentName: string | null;
  answers: Array<{ FieldKey: string; ValueJSON: string }>;
  files: Array<{ FileID: number; FieldKey: string; OriginalName: string; StorageURL: string; SizeBytes: number; MimeType: string | null; ScanStatus: string }>;
}

export interface ResponseRevisionRow {
  RevisionID: number;
  VersionID: number;
  AnswersJSON: string;
  ScoreJSON: string | null;
  EditedBy: number | null;
  Reason: string | null;
  CreatedAt: string;
}

export interface AnomalyFlag {
  FlagID: number;
  ResponseID: number;
  FieldKey: string | null;
  AnomalyType: string;
  Score: number | null;
  Reason: string;
  Status: 'Pending' | 'Acknowledged' | 'Resolved';
  AutoRejected: boolean;
  Resolution: string | null;
  CreatedAt: string;
  ReviewedAt: string | null;
  ReviewedByName: string | null;
  SubmittedAt: string | null;
  RespondentEmail: string | null;
}

export interface CrossReport {
  CrossReportID: number;
  Name: string;
  Description: string | null;
  TemplateIDs: number[];
  FieldMappings: Array<{ displayName: string; fieldKeys: Record<string, string> }>;
  CreatedBy: number;
  CreatedAt: string;
  UpdatedAt: string | null;
}

export interface ShareRow {
  ShareID: number;
  ShareType: 'form' | 'cross-report';
  Token: string;
  CreatedAt: string;
  ExpiresAt: string | null;
  RevokedAt: string | null;
  FormTitle: string | null;
  CrossReportName: string | null;
  CreatedByName: string;
}

export interface ReportAccessRow {
  AccessID: number;
  TemplateID: number;
  UserID: number;
  AccessLevel: 'View' | 'Export';
  CreatedAt: string;
  UserName: string;
  UserEmail: string | null;
}

export interface ConsentInfo {
  templateId: number;
  consentRequired: boolean;
  consentVersion: number;
  consentText: string | null;
}

export interface ConsentHistoryRow {
  ConsentHistoryID: number;
  ConsentVersion: number;
  ConsentText: string;
  EffectiveAt: string;
  ChangedBy: number | null;
}

export interface AccessRule {
  RuleID: number;
  Mode: string;
  ConfigJSON: string | null;
}

export interface Invite {
  InviteID: number;
  TemplateID: number;
  Email: string;
  Status: string;
  CreatedAt: string;
}

export interface FormResponseRow {
  ResponseID: number;
  VersionID: number;
  RespondentUserID: number | null;
  RespondentEmail: string | null;
  Status: string;
  ConsentGiven: boolean | null;
  ConsentVersion: number | null;
  SubmittedAt: string | null;
  IsErased: boolean;
  TotalScore: number | null;
  ScoreMax: number | null;
  EditCount: number;
  EditedAt: string | null;
  RespondentName: string | null;
}

export interface ReportFieldSummary {
  key: string;
  label: string;
  type: string;
  summary: {
    count: number;
    avg?: number | null;
    min?: number | null;
    max?: number | null;
    optionCounts?: Record<string, number>;
    byMonth?: Record<string, number>;
  };
}

export interface FormReport {
  template: { templateId: number; title: string };
  filters: Record<string, string | undefined>;
  total: number;
  lastUpdated: string;
  fields: ReportFieldSummary[];
}

export interface CompetitorPrice {
  PriceID: number;
  ProductID: number;
  CompetitorName: string;
  Price: number;
  RegionID: number;
  OutletID: number | null;
  RecordedBy: number;
  RecordedDate: string;
  ProductCode: string;
  ProductName: string;
  Category: string;
  OwnPrice: number | null;
  RegionName: string;
  OutletName: string | null;
  RecordedByName: string;
  GapPercent: number | null;
  CompetitorID: number | null;
  CompetitorCatalogueName: string | null;
  Availability: string | null;
  PromotionObserved: string | null;
  QualityObservation: string | null;
  PhotoVideoRef: string | null;
  CustomerTypeID: number | null;
  CustomerTypeName: string | null;
}

export interface PriceGapAlert {
  GapAlertID: number;
  PriceID: number | null;
  CompetitorProductID: number | null;
  OwnPrice: number;
  GapPercent: number;
  ThresholdPercent: number;
  Status: string;
  CreatedAt: string;
  ResolvedAt: string | null;
  ProductCode: string;
  ProductName: string;
  Category: string;
  CompetitorName: string;
  CompetitorPrice: number;
  RegionName: string | null;
}

export interface Threshold {
  ThresholdID: number;
  ProductCategory: string;
  ThresholdPercent: number;
  CreatedAt: string;
  UpdatedAt: string;
}

export interface LookupOption {
  LookupID: number;
  Category: string;
  Value: string;
  SortOrder: number;
  IsActive?: boolean;
}

export interface CompareCompetitor {
  CompetitorName: string;
  Model: string;
  Price: number;
  PriceMax: number | null;
  EffectiveDate: string | null;
  Status: string;
  gapPercent: number | null;
}

export interface CompareResult {
  product: Product;
  ownPrice: number;
  competitors: CompareCompetitor[];
}

export interface MarketVisit {
  ReportID: number;
  UserID: number;
  OutletID: number;
  VisitDate: string;
  Notes: string | null;
  Status: string;
  ReviewedBy: number | null;
  BusinessGroupID: number | null;
  BusinessGroupCode: string | null;
  BusinessGroupName: string | null;
  VisitType: string | null;
  StockLevelObserved: string | null;
  CompetitorPresenceNoted: string | null;
  KeyFindings: string | null;
  PhotoVideoRef: string | null;
  FollowUpRequired: boolean | null;
  ShopsVisited: number | null;
  ApprovedBy: number | null;
  ApprovedAt: string | null;
  RejectedBy: number | null;
  RejectedAt: string | null;
  RejectionReason: string | null;
  OutletName: string;
  City: string;
  RegionID: number;
  RegionName: string;
  SubmittedByName: string;
}

export interface BusinessGroup {
  BusinessGroupID: number;
  Code: string;
  Name: string;
  Description: string | null;
}

export interface InterviewQA {
  QuestionID: number;
  Question: string;
  Answer: string | null;
  SortOrder: number;
}

export interface Interview {
  InterviewID: number;
  UserID: number;
  BusinessGroupID: number;
  RegionID: number;
  OutletID: number | null;
  InterviewDate: string;
  RespondentType: string;
  RespondentName: string;
  SatisfactionScore: number | null;
  Sentiment: string | null;
  KeyFeedback: string | null;
  PhotoVideoRef: string | null;
  Address: string | null;
  CapturedLat: number | null;
  CapturedLng: number | null;
  Status: string;
  ReviewedBy: number | null;
  ReviewedAt: string | null;
  ApprovedBy: number | null;
  ApprovedAt: string | null;
  RejectedBy: number | null;
  RejectedAt: string | null;
  RejectionReason: string | null;
  CreatedAt: string;
  UpdatedAt: string | null;
  BusinessGroupCode: string;
  BusinessGroupName: string;
  RegionName: string;
  Country: string;
  OutletName: string | null;
  City: string | null;
  InterviewerName: string;
  QAs?: InterviewQA[];
}

export interface MultimediaAsset {
  MediaID: number;
  CaptureDate: string;
  CapturedAt: string | null;
  CapturedBy: number;
  BusinessGroupID: number | null;
  RegionID: number | null;
  OutletID: number | null;
  RelatedModule: string | null;
  RelatedRecordID: number | null;
  MediaType: 'Photo' | 'Video' | 'Audio';
  StorageURL: string;
  OriginName: string | null;
  SizeBytes: number | null;
  MimeType: string | null;
  CaptureLat: number | null;
  CaptureLng: number | null;
  Tag: string | null;
  TranscriptionRequired: boolean;
  Transcription: string | null;
  ValidationStatus: 'Pending' | 'Validated' | 'Rejected';
  Notes: string | null;
  CreatedAt: string;
  BusinessGroupCode: string | null;
  BusinessGroupName: string | null;
  RegionName: string | null;
  OutletName: string | null;
  CapturedByName: string;
}

export interface WeeklySalesRow {
  WeeklySalesID: number;
  WeekEnding: string;
  QuantitySold: number;
  UnitPrice: number;
  Revenue: number;
  Status: string;
  SubmittedBy: number;
  CreatedAt: string;
  UpdatedAt: string | null;
  BusinessGroupID: number;
  BusinessGroupCode: string;
  BusinessGroupName: string;
  ProductID: number;
  ProductCode: string;
  ProductName: string;
  Category: string;
  ColorID: number | null;
  ProductColor: string | null;
  ProductSize: string | null;
  ProductCategory: string | null;
  ProductSpecs: string | null;
  RegionID: number;
  RegionName: string;
  Country: string;
  OutletID: number;
  OutletName: string;
  City: string;
  CustomerID: number | null;
  CustomerName: string | null;
  CustomerType: string | null;
  CustomerTypeID: number | null;
  CustomerTypeName: string | null;
  Notes: string | null;
  SubmittedByName: string;
}

export interface CompetitorCatalogueRow {
  CompetitorID: number;
  Name: string;
  ProductsCovered: string | null;
  RegionsActiveIn: string | null;
  Notes: string | null;
  BusinessGroupID: number | null;
  BusinessGroupCode: string | null;
  BusinessGroupName: string | null;
  IsActive: boolean;
  CreatedAt?: string;
  UpdatedAt?: string | null;
  ProductCount?: number;
}

export interface CompetitorProductRow {
  CompetitorProductID: number;
  CompetitorID: number;
  CompetitorName: string;
  OurProductID: number | null;
  ProductCode: string | null;
  OurProductName: string | null;
  ProductColors: string | null;
  OwnPrice: number | null;
  CompetitorProduct: string;
  Category: string;
  Price: number;
  PriceMax: number | null;
  EffectiveDate: string | null;
  Status: 'Active' | 'Inactive' | 'Expired';
  Notes: string | null;
  Specifications: string | null;
  CreatedAt: string;
  UpdatedAt: string | null;
  PriceDifference: number | null;
  PriceDifferencePct: number | null;
}

export interface GeneratedAlert {
  type: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
}

export interface InterviewsOverview {
  summary: {
    Total: number;
    AvgSatisfaction: number | null;
    PositiveCount: number;
    NeutralCount: number;
    NegativeCount: number;
  };
  byRegion: Array<{ RegionName: string; Total: number; AvgSatisfaction: number | null }>;
}

export interface WeeklySalesOverview {
  totals: { RowCount: number; Quantity: number; Revenue: number };
  byRegion: Array<{ RegionName: string; Revenue: number; Rows: number }>;
  byProduct: Array<{ ProductName: string; Category: string; Quantity: number; Revenue: number }>;
  byColor: Array<{ Color: string; Revenue: number; Quantity: number; Rows: number }>;
}

export interface NotificationRow {
  NotificationID: number;
  TriggerEvent: string;
  Channel: string;
  Subject: string | null;
  Status: string;
  Attempts: number;
  SentAt: string | null;
  CreatedAt: string;
  IsRead: boolean;
  ReadAt: string | null;
}

export interface AiInsights {
  period: { from: string | null; to: string | null };
  kpis: {
    totalSales: number;
    activePriceGaps: number;
    marketVisits: number;
    shopsVisited: number;
    formResponses: number;
    avgSatisfaction: number | null;
    totalInterviews: number;
    availabilityRate: number | null;
    weeklySalesRevenue: number;
    totalCustomers: number;
    totalProducts: number;
    kpiAchievement: number | null;
    officerCount: number;
  };
  observations: string[];
  generatedAlerts: GeneratedAlert[];
  generatedAt: string;
}

/** One dashboard tile from GET /ai/predictive/summary (backend predictiveCardSchema). */
export interface PredictiveCard {
  module: string;
  metric: string;
  label: string;
  unit: 'currency' | 'count' | 'percent';
  granularity: 'day' | 'week' | 'month';
  confidence: 'High' | 'Moderate' | 'Low' | 'Insufficient';
  sufficientData: boolean;
  notice: string | null;
  model: string;
  latest: { period: string; value: number };
  changePct: number | null;
  next: { period: string; value: number; lower: number; upper: number } | null;
  anomalies: number;
  signals: Array<{ kind: 'risk' | 'opportunity'; code: string; message: string; severity: 'low' | 'medium' | 'high' }>;
  generatedAt: string;
}

export interface PredictiveSummary {
  generatedAt: string;
  cards: PredictiveCard[];
  unavailable: string[];
}

export interface RoleMapping {
  MappingID: number;
  CUASClaim: string;
  RoleID: number;
  RoleName: string;
}

export interface NotificationConfigRow {
  ConfigID?: number;
  TriggerEvent: string;
  Channel: string;
  RoleID: number;
  RoleName: string;
  Enabled: boolean;
}

export interface AdminUser {
  UserID: number;
  CUAS_ID: string;
  Name: string;
  Email: string | null;
  RoleID: number;
  RoleName: string;
  IsActive: boolean;
  RegionIds: string | null;
}

export interface AuditRow {
  AuditLogID: number;
  UserID: number | null;
  UserName: string | null;
  Action: string;
  Entity: string;
  EntityID: number | null;
  Detail: string | null;
  IPAddress: string | null;
  Location: string | null;
  CreatedAt: string;
}

export interface RoleRow {
  RoleID: number;
  RoleName: string;
}

export interface Region {
  RegionID: number;
  RegionName: string;
  Country: string;
}

export interface Customer {
  CustomerID: number;
  CustomerCode: string;
  Name: string;
  CustomerType: string;
  CustomerTypeID: number | null;
  CustomerTypeName: string | null;
  ContactPerson: string | null;
  ContactPhone: string | null;
  Email: string | null;
  RegionID: number;
  OutletID: number | null;
  BusinessGroupID: number | null;
  RegionName: string;
  OutletName: string | null;
  BusinessGroupName: string | null;
  IsActive: boolean;
  Address: string | null;
  Area: string | null;
  StarRating: string | null;
  ProductInterest: string | null;
}

export interface Product {
  ProductID: number;
  ProductCode: string;
  Name: string;
  Category: string;
  UnitPrice: number | null;
  BusinessGroupID?: number | null;
  BusinessGroupCode?: string | null;
  BusinessGroupName?: string | null;
  Color?: string | null;
  colors?: string[];
  Size?: string | null;
  WeightKg?: number | null;
  ImageUrl?: string | null;
  AgentPriceAfterVat?: number | null;
  WholesalePriceAfterVat?: number | null;
  KeyAccountPriceAfterVat?: number | null;
  BidPriceAfterVat?: number | null;
  Prices?: string | null;
  Specifications?: Record<string, unknown> | null;
}

export interface CustomerType {
  CustomerTypeID: number;
  Name: string;
  IsActive: boolean;
}

export interface ProductPrice {
  ProductPriceID: number;
  ProductID: number;
  CustomerTypeID: number;
  UnitPrice: number;
  CustomerTypeName?: string;
}

export interface Outlet {
  OutletID: number;
  OutletName: string;
  City: string;
  RegionID: number;
  RegionName: string;
}

export interface PowerBiReport {
  reportId: string;
  name: string;
  description: string;
  url: string;
}

export interface SalesOverview {
  totals: {
    OrderCount: number;
    TotalQuantity: number;
    TotalAmount: number;
    ProductsSold: number;
    RegionsCovered: number;
  };
  byRegion: Array<{ RegionName: string; Amount: number; Orders: number }>;
  topProducts: Array<{ ProductName: string; Category: string; Color: string; Quantity: number; Amount: number }>;
  byColor: Array<{ Color: string; Amount: number; Quantity: number; Orders: number }>;
}

export interface ColorInfo {
  ColorID: number;
  Name: string;
  HexCode: string | null;
}

export interface PriceComparisonRow {
  ProductName: string;
  Category: string;
  ProductColors: string | null;
  CompetitorName: string;
  CompetitorPrice: number;
  OwnPrice: number;
  GapPercent: number | null;
  RegionName: string;
  RecordedDate: string;
}

export interface CustomersReport {
  totals: { TotalCustomers: number; RegionsCovered: number; BusinessGroups: number };
  byType: Array<{ CustomerTypeName: string; Count: number }>;
  byRegion: Array<{ RegionName: string; Count: number }>;
  byBusinessGroup: Array<{ BusinessGroupName: string; Count: number }>;
  byStarRating: Array<{ StarRating: string; Count: number }>;
}

export interface ProductsReport {
  totals: { TotalProducts: number; Categories: number; BusinessGroups: number; AvgPrice: number };
  byCategory: Array<{ Category: string; Count: number; AvgPrice: number }>;
  byBusinessGroup: Array<{ BusinessGroupName: string; Count: number }>;
  byColor: Array<{ Color: string; Count: number; AvgPrice: number }>;
  productsWithTiers: number;
  pricingTiers: Array<{ CustomerTypeName: string; PriceCount: number; AvgPrice: number }>;
}

export interface CompetitorIntelReport {
  summary: { CompetitorsTracked: number; TotalRecords: number; AvgGapPercent: number };
  byCompetitor: Array<{ CompetitorName: string; Records: number; AvgPrice: number; AvgGap: number }>;
  items: Array<{
    RecordedDate: string; CompetitorName: string; ProductCode: string; ProductName: string;
    Category: string; ProductColors: string | null; CompetitorPrice: number; OwnPrice: number; GapPercent: number | null;
    Availability: string | null; PromotionObserved: string | null; QualityObservation: string | null;
    RegionName: string; OutletName: string; RecordedByName: string;
  }>;
}

export interface KpiPerformanceReport {
  summary: { OfficersWithResults: number; TotalResults: number; AvgAchievement: number; TotalWeightedScore: number };
  byKpi: Array<{
    KpiCode: string; KpiName: string; Category: string; Weight: number;
    TotalTarget: number; TotalActual: number; AchievementPercent: number; OfficerCount: number;
  }>;
  byOfficer: Array<{
    UserID: number; UserName: string; RegionNames: string;
    TotalWeightedScore: number; AvgAchievement: number; KpiCount: number; Rating: string; Rank: number;
  }>;
}

export interface MarketVisitsReport {
  items: Array<{
    ReportID: number; VisitDate: string; Status: string; OutletName: string;
    City: string; RegionName: string; Country: string; SubmittedByName: string;
    ShopsVisited: number | null;
  }>;
}

export interface EmbedToken {
  token: string;
  embedUrl: string;
  expiresAt: string;
  reportId: string;
}

export interface ReportSchedule {
  id: string;
  reportId: string;
  cron: string;
  recipients: string[];
  enabled: boolean;
}

export interface NotificationConfigResponse {
  items: NotificationConfigRow[];
  events: string[];
  channels: string[];
}

export interface UsersResponse {
  items: AdminUser[];
  roles: RoleRow[];
}

export interface DashboardLayout {
  widgets: Array<{
    id: string;
    kind: string;
    fieldKey?: string;
    title: string;
    size: { w: number; h: number };
  }>;
}

// ---------------------------------------------------------------------------
// Admin KPI & Performance types
// ---------------------------------------------------------------------------
export interface KpiSummary {
  totalOfficers: number;
  activeOfficers: number;
  totalActivities: number;
  completedActivities: number;
  pendingActivities: number;
  rejectedActivities: number;
  completionRate: number;
  avgActivitiesPerOfficer: number;
  avgSatisfaction: number | null;
  topPerformer: { name: string; score: number } | null;
  needsAttention: number;
}

export interface OfficerKpi {
  userId: number;
  name: string;
  email: string | null;
  regionNames: string;
  totalActivities: number;
  visits: number;
  interviews: number;
  weeklySales: number;
  multimedia: number;
  pricing: number;
  forms: number;
  completed: number;
  pending: number;
  rejected: number;
  completionRate: number;
  productivityScore: number;
  completionScore: number;
  qualityScore: number;
  timelinessScore: number;
  overallScore: number;
  rank: number;
  category: 'Excellent' | 'Good' | 'Average' | 'Needs Attention';
}

export interface OfficerDetail extends OfficerKpi {
  recentActivity: Array<{
    module: string;
    date: string;
    status: string;
  }>;
  monthlyTrend: Array<{
    month: string;
    activities: number;
    score: number;
  }>;
}

export interface KpiTrend {
  period: string;
  totalActivities: number;
  completedActivities: number;
  completionRate: number;
}

export interface OperationalKpi {
  label: string;
  value: number | string;
  sub?: string;
  icon: string;
  color: 'blue' | 'green' | 'amber' | 'red' | 'teal' | 'purple' | 'indigo';
}

// ---------------------------------------------------------------------------
// Planning & KPI types
// ---------------------------------------------------------------------------
export interface Plan {
  PlanID: number;
  ParentPlanID: number | null;
  Title: string;
  Description: string | null;
  Frequency: 'Annual' | 'Quarterly' | 'Monthly' | 'Weekly';
  PeriodStart: string;
  PeriodEnd: string;
  PlannedSubmissionDate: string | null;
  ActualSubmissionDate: string | null;
  Status: 'Not Started' | 'In Progress' | 'Under Review' | 'Completed' | 'Delayed' | 'Ongoing' | 'Planned';
  ResponsibleUserID: number | null;
  ResponsibleUserName: string | null;
  ResponsibleTeam: string | null;
  RegionID: number | null;
  RegionName: string | null;
  MainFocus: string | null;
  KeyDeliverable: string | null;
  ApprovalStatus: 'Draft' | 'Submitted' | 'Reviewed' | 'Approved' | 'Rejected';
  ApprovedBy: number | null;
  ApprovedByName: string | null;
  ApprovedAt: string | null;
  Remarks: string | null;
  CreatedBy: number | null;
  CreatedByName: string | null;
  CreatedAt: string;
  UpdatedAt: string | null;
  ActivityCount: number;
  CompletedActivities: number;
  ChildCount: number;
  children?: Plan[];
  activities?: PlanActivity[];
}

export interface PlanActivity {
  ActivityID: number;
  PlanID: number;
  Title: string;
  Description: string | null;
  DetailedActivity: string | null;
  Frequency: string | null;
  StartDate: string;
  EndDate: string;
  PlannedSubmissionDate: string | null;
  ActualSubmissionDate: string | null;
  Status: 'Not Started' | 'In Progress' | 'Under Review' | 'Completed' | 'Delayed' | 'Ongoing' | 'Planned';
  Priority: 'Low' | 'Medium' | 'High' | 'Critical';
  ResponsibleUserID: number | null;
  ResponsibleUserName: string | null;
  ResponsibleTeam: string | null;
  RegionID: number | null;
  RegionName: string | null;
  ProductID: number | null;
  ProductName: string | null;
  MainFocus: string | null;
  ActivityType: string | null;
  ExpectedDeliverable: string | null;
  Target: string | null;
  Unit: string | null;
  ApprovalStatus: 'Draft' | 'Submitted' | 'Reviewed' | 'Approved' | 'Rejected';
  Remarks: string | null;
  CreatedBy: number | null;
  CreatedByName: string | null;
  CreatedAt: string;
  UpdatedAt: string | null;
}

export interface KpiDefinition {
  KpiDefID: number;
  KpiCode: string;
  KpiName: string;
  Description: string | null;
  Category: string | null;
  MeasurementUnit: string;
  TargetValue: number | null;
  Weight: number;
  Frequency: string;
  Direction: string;
  ThresholdExcellent: number | null;
  ThresholdGood: number | null;
  ThresholdAverage: number | null;
  ApplicableRole: string | null;
  ApplicableRegionID: number | null;
  ApplicableRegionName: string | null;
  ApplicableProductID: number | null;
  ApplicableProductName: string | null;
  IsActive: boolean;
  StrategicObjective: string | null;
  BusinessUnitID: number | null;
  BusinessUnitName: string | null;
  KpiOwnerName: string | null;
  KpiOwnerUserID: number | null;
  KpiOwnerUserName: string | null;
  DataSource: string | null;
  CollectionMethod: string | null;
  AlertThresholdText: string | null;
  AlertThresholdPercent: number | null;
  EvidenceRequired: boolean;
  VerificationRole: string | null;
  DashboardGroup: string | null;
  SystemModule: string | null;
  IntegrationMethod: string | null;
  TargetText: string | null;
  UnitOfMeasure: string | null;
  SourceRef: string | null;
  CreatedAt: string;
  UpdatedAt: string | null;
}

export interface KpiResult {
  KpiResultID: number;
  KpiDefID: number;
  KpiCode: string;
  KpiName: string;
  Category: string | null;
  UserID: number | null;
  UserName: string | null;
  PeriodStart: string;
  PeriodEnd: string;
  Frequency: string;
  RecordType: string;
  PlannedValue: number | null;
  PlannedText: string | null;
  ActualValue: number | null;
  TargetValue: number | null;
  AchievementPercent: number | null;
  WeightedScore: number | null;
  Rating: string | null;
  AutoStatus: string | null;
  FinalStatus: string | null;
  StatusOverride: string | null;
  EvidenceReference: string | null;
  VerificationStatus: string;
  VerificationNote: string | null;
  ReviewerName: string | null;
  MisRecordId: string | null;
  DataSource: string;
  RegionID: number | null;
  RegionName: string | null;
  ProductID: number | null;
  ProductName: string | null;
  Remarks: string | null;
  CreatedAt: string;
  UpdatedAt: string | null;
}

/** One row of GET /admin/kpi/measurement (monthly grid, workbook KPIs). */
export interface MeasurementRow {
  KpiDefID: number;
  KpiCode: string;
  KpiName: string;
  Category: string | null;
  StrategicObjective: string | null;
  UnitOfMeasure: string | null;
  TargetText: string | null;
  AnnualTarget: number | null;
  BusinessUnitID: number | null;
  BusinessUnitName: string | null;
  KpiOwnerName: string | null;
  KpiOwnerUserName: string | null;
  DataSource: string | null;
  CollectionMethod: string | null;
  Direction: string;
  AlertThresholdPercent: number | null;
  EvidenceRequired: boolean;
  VerificationRole: string | null;
  SystemModule: string | null;
  DashboardGroup: string | null;
  SourceRef: string | null;
  KpiResultID: number | null;
  PeriodStart: string | null;
  PeriodEnd: string | null;
  PlannedValue: number | null;
  PlannedText: string | null;
  ActualValue: number | null;
  EfficiencyPercent: number | null;
  AutoStatus: string | null;
  StatusOverride: string | null;
  FinalStatus: string | null;
  Notes: string | null;
  EvidenceReference: string | null;
  VerificationStatus: string | null;
  VerificationNote: string | null;
  ReviewerName: string | null;
  MisRecordId: string | null;
  UpdatedAt: string | null;
}

/** One row of GET /admin/kpi/verification. */
export interface VerificationRow {
  KpiResultID: number;
  PeriodStart: string;
  PeriodEnd: string;
  PlannedValue: number | null;
  PlannedText: string | null;
  ActualValue: number | null;
  EfficiencyPercent: number | null;
  AutoStatus: string | null;
  StatusOverride: string | null;
  FinalStatus: string | null;
  Notes: string | null;
  EvidenceReference: string | null;
  VerificationStatus: string;
  VerificationNote: string | null;
  MisRecordId: string | null;
  UpdatedAt: string | null;
  KpiCode: string;
  KpiName: string;
  Category: string | null;
  UnitOfMeasure: string | null;
  SourceRef: string | null;
  BusinessUnitName: string | null;
  KpiOwnerName: string | null;
  ReviewerName: string | null;
}

/** Result of POST /admin/kpi/import. */
export interface KpiImportStats {
  definitionsCreated: number;
  definitionsUpdated: number;
  measurementsUpserted: number;
  measurementsSkipped: number;
  rows: number;
  errors: string[];
}

export interface OfficerKpiScore {
  userId: number;
  name: string;
  regionNames: string;
  totalWeightedScore: number;
  avgAchievement: number;
  kpiCount: number;
  rating: string;
  rank: number;
}

export interface PlannedVsAchieved {
  kpiCode: string;
  kpiName: string;
  category: string | null;
  measurementUnit: string;
  weight: number;
  totalTarget: number;
  totalActual: number;
  achievementPercent: number;
  officerCount: number;
  status: string;
}

export interface PlanningSummary {
  totalPlans: number;
  completedPlans: number;
  activePlans: number;
  delayedPlans: number;
  totalActivities: number;
  completedActivities: number;
  activeActivities: number;
  overdueActivities: number;
  upcomingDeadlines: Plan[];
  recentActivity: PlanActivity[];
}

// ---------------------------------------------------------------------------
// Tender & Opportunity Intelligence
// ---------------------------------------------------------------------------

export interface TenderSource {
  TenderSourceID: number;
  Name: string;
  SourceType: 'api' | 'rss' | 'scraping';
  URL: string;
  ApiConfig?: string | null;
  Schedule: string;
  RateLimitMs: number;
  RobotsCompliance: boolean;
  IsActive: boolean;
  /** Opt-in AI enrichment of newly collected opportunities from this source. */
  AiAutoEnrich: boolean;
  /** Source quality score 0-100 (feeds relevance scoring v2). */
  QualityScore: number;
  LastCollectedAt: string | null;
  LastCollectionStatus: string | null;
  LastCollectionError: string | null;
  Restricted: boolean;
  TotalCollected: number;
  CreatedAt: string;
  UpdatedAt: string | null;
}

/** Result of POST /tenders/sources/test or /tenders/sources/:id/test. */
export interface SourceTestResult {
  ok: boolean;
  restricted: boolean;
  error: string | null;
  durationMs: number;
  fetched: number;
  sample: Array<{
    Title: string;
    Organization: string | null;
    DeadlineDate: string | null;
    SourceUrl: string;
  }>;
}

export interface TenderOpportunity {
  TenderOpportunityID: number;
  TenderSourceID: number | null;
  SourceName: string | null;
  Title: string;
  Organization: string | null;
  Country: string | null;
  Sector: string | null;
  Description: string | null;
  SourceUrl: string;
  SourceReference: string | null;
  PublicationDate: string | null;
  DeadlineDate: string | null;
  EstimatedValue: number | null;
  Currency: string | null;
  /** Region / macro-geography when the source provides one (plan §6). */
  Region: string | null;
  /** Field-presence confidence 0-100 (plan §6/§8). */
  Confidence: number | null;
  /** Complete | Partial | Sparse (plan §19). */
  DataQuality: string | null;
  ContentHash: string;
  VerificationStatus: 'Unverified' | 'Verified';
  RelevanceScore: number | null;
  /** TENDER | RFQ | BUYER_LEAD | TRADE_INTELLIGENCE | MARKET_SIGNAL */
  OpportunityType: string;
  ProductGroupId: number | null;
  ProductGroupCode: string | null;
  ProductGroupName: string | null;
  AiSummary: string | null;
  AiStructuredData: string | null;
  /** AI gap-fill extras: fieldBasis / businessFit / suggestions / applied. */
  AiGapFill: string | null;
  AiEnrichedAt: string | null;
  IsSaved: boolean;
  SavedStatus: string | null;
  SavedTenderID: number | null;
  CreatedAt: string;
}

export interface SavedTender {
  SavedTenderID: number;
  TenderOpportunityID: number;
  UserID: number;
  Status: 'New' | 'Reviewing' | 'Interested' | 'Applied' | 'Won' | 'Lost' | 'Archived';
  Notes: string | null;
  Title: string;
  DeadlineDate: string | null;
  CreatedAt: string;
  UpdatedAt: string | null;
}

export interface TenderInterestProfile {
  InterestProfileID: number;
  Name: string;
  Sectors: string[];
  Keywords: string[];
  Countries: string[];
  MinValue: number | null;
  MaxValue: number | null;
  Currency: string | null;
  /** Preferred organizations (relevance v2). */
  Organizations: string[];
  /** Product group codes, e.g. COFFEE (relevance v2). */
  ProductGroupCodes: string[];
  /** OPPORTUNITY_TYPES values the profile is interested in. */
  Types: string[];
  /** Business group codes, e.g. KCC (relevance v2). */
  BusinessGroupCodes: string[];
  IsActive: boolean;
  CreatedAt: string;
  UpdatedAt: string | null;
}

export interface TenderDashboard {
  totalOpportunities: number;
  newThisWeek: number;
  deadlineSoon: number;
  savedCount: number;
  highRelevance: number;
  rfqCount: number;
  buyerLeadCount: number;
  exportCount: number;
  tradeCount: number;
  byCountry: Array<{ country: string; count: number }>;
  bySector: Array<{ sector: string; count: number }>;
  byType: Array<{ type: string; count: number }>;
  bySource: Array<{ source: string; count: number }>;
  byProductGroup: Array<{ group: string; count: number }>;
  relevanceBuckets: Array<{ label: string; min: number; max: number; count: number }>;
  deadlineTrend: Array<{ label: string; weekStart: string; count: number }>;
  upcomingDeadlines: TenderOpportunity[];
}

/** Row of GET /tenders/business-groups (business groups owning product groups). */
export interface BusinessGroupItem {
  Code: string;
  Name: string;
  ProductGroupCount: number;
}

/** POST /tenders/:id/relevance-explanation response. */
export interface ScoreExplanation {
  total: number;
  profileId: number;
  profileName: string | null;
  components: Array<{
    key: string;
    label: string;
    points: number;
    max: number;
    detail: string;
  }>;
  matchedKeywords: string[];
}

/** Parsed AiGapFill column on an opportunity. */
export interface AiGapFillData {
  fieldBasis?: Record<string, string>;
  businessFit?: string | null;
  suggestions?: {
    opportunityType?: string | null;
    productGroup?: string | null;
  };
  applied?: {
    typeApplied?: boolean;
    productGroupApplied?: boolean;
  };
}

/** Active row of the configurable product-group taxonomy (dbo.ProductGroup). */
export interface ProductGroup {
  ProductGroupID: number;
  Code: string;
  Name: string;
  SortOrder: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TenderEnrichmentResult {
  summary: string;
  structuredData: {
    estimatedValue: string | null;
    currency: string | null;
    eligibility: string | null;
    requiredDocuments: string | null;
    contactInfo: string | null;
    keyDates: string | null;
  };
  /** Per-field derivation basis (plan §8). */
  fieldBasis?: Record<string, string>;
  businessFit?: string | null;
  suggestions?: {
    opportunityType?: string | null;
    productGroup?: string | null;
  };
  applied?: {
    typeApplied: boolean;
    productGroupApplied: boolean;
  };
}

export interface CollectionResult {
  sourceId: number;
  sourceName: string;
  status: 'Success' | 'Failed' | 'Partial';
  opportunities: unknown[];
  error: string | null;
  newCount: number;
  duplicateCount: number;
  failedCount: number;
}

// ---------------------------------------------------------------------------
// Manual data upload (Excel/CSV import)
// ---------------------------------------------------------------------------

export type ImportRowStatus = 'valid' | 'invalid' | 'duplicate';

export interface ImportRowIssue {
  /** Spreadsheet row number (header = row 1, first data row = 2). */
  row: number;
  field: string | null;
  message: string;
}

export interface ImportRowPreview {
  row: number;
  status: ImportRowStatus;
  values: Record<string, string>;
  issues: ImportRowIssue[];
  duplicateReason: 'existing' | 'in-file' | null;
}

export interface ImportSuggestedColumn {
  column: number;
  header: string;
  field: string | null;
}

/** Response of POST /tenders/imports/parse. */
export interface ImportParseResult {
  token: string;
  fileName: string;
  sheets: string[];
  sheet: string;
  headers: string[];
  suggestedMapping: ImportSuggestedColumn[];
  rows: ImportRowPreview[];
  counts: { total: number; valid: number; invalid: number; duplicate: number };
}

/** Response of POST /tenders/imports/commit. */
export interface ImportSummary {
  fileName: string;
  totalRows: number;
  imported: number;
  duplicates: number;
  skipped: number;
  failed: number;
  highRelevanceCount: number;
  durationMs: number;
  errors: ImportRowIssue[];
  errorCount: number;
}

/** Item of GET /tenders/imports — history from dbo.AuditLog. */
export interface ImportHistoryItem {
  AuditLogID: number;
  UserName: string | null;
  CreatedAt: string;
  fileName: string | null;
  totalRows: number | null;
  imported: number | null;
  duplicates: number | null;
  skipped: number | null;
  failed: number | null;
}

/** Body of POST /tenders — manual tender entry. */
export interface TenderCreateInput {
  Title: string;
  Organization?: string | null;
  Country?: string | null;
  Sector?: string | null;
  Description?: string | null;
  SourceUrl: string;
  SourceReference?: string | null;
  PublicationDate?: string | null;
  DeadlineDate?: string | null;
  EstimatedValue?: number | null;
  Currency?: string | null;
  /** Region / macro-geography when known (plan §6). */
  Region?: string | null;
  /** Manual type override; omitted = rule-based classification. */
  OpportunityType?: string;
}

// ---------------------------------------------------------------------------
// Corporate Marketing Activities Plan (workbook: KG Corporate Marketing_Plan_and_Activities.xlsx)
// ---------------------------------------------------------------------------
export interface CorpTask {
  CorpTaskID: number;
  PlanYear: number;
  Month: number;
  TaskId: string;
  ParentCode: string;
  MainActivityKpi: string | null;
  TaskIndex: number;
  TaskName: string;
  ResponsibleRole: string | null;
  ResponsiblePerson: string | null;
  Status: string;
  CompletionPercent: number | null;
  EvidenceRemarks: string | null;
  VerificationNote: string | null;
  VerifiedByUserID: number | null;
  VerifiedByName: string | null;
  VerifiedAt: string | null;
  UpdatedAt: string | null;
}

export interface CorpTaskPage {
  items: CorpTask[];
  total: number;
  page: number;
  pageSize: number;
  year: number;
  month: number | null;
}

export interface CorpEvent {
  CorpEventID: number;
  EventCode: string;
  Category: string | null;
  EventName: string | null;
  BusinessUnit: string | null;
  ResponsiblePerson: string | null;
  ResponsibleRole: string | null;
  Location: string | null;
  StartDate: string | null;
  EndDate: string | null;
  Status: string;
  PlannedParticipants: number | null;
  ActualParticipants: number | null;
  LeadsGenerated: number | null;
  Conversions: number | null;
  PlannedRevenue: number | null;
  ActualRevenue: number | null;
  ApprovedBudget: number | null;
  ActualCost: number | null;
  ReachImpressions: number | null;
  Engagements: number | null;
  SatisfactionScore: number | null;
  KpiTarget: string | null;
  KpiActual: string | null;
  EvidenceLink: string | null;
  Remarks: string | null;
  UpdatedAt: string | null;
  Month: number | null;
  IsoWeek: number | null;
  ConversionRate: number | null;
  ROIPercent: number | null;
  BudgetVariance: number | null;
  AttendanceRate: number | null;
  EngagementRate: number | null;
}

export interface CorpSummary {
  year: number;
  month: number | null;
  tasks: {
    total: number;
    verified: number;
    rejected: number;
    notVerified: number;
    avgCompletion: number | null;
    assigned: number;
  };
  byRole: { ResponsibleRole: string | null; total: number; verified: number; avgCompletion: number | null }[];
  events: { total: number; planned: number; inProgress: number; completed: number };
}

export interface CorpImportStats {
  parentsUpserted: number;
  tasksUpserted: number;
  eventsUpserted: number;
  errors: string[];
}
