import sql from 'mssql';
import { db } from '../../db/pool';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface KpiDefRow {
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

export interface KpiResultRow {
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
  ActualValue: number | null;
  PlannedValue: number | null;
  PlannedText: string | null;
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
  ReviewerUserID: number | null;
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

// ---------------------------------------------------------------------------
// KPI Definition CRUD
// ---------------------------------------------------------------------------
export async function listKpiDefs(query: {
  category?: string;
  frequency?: string;
  isActive?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = query.page ?? 1;
  const pageSize = Math.min(query.pageSize ?? 20, 100);
  const offset = (page - 1) * pageSize;

  const request = db.request();
  const conditions: string[] = ['1=1'];

  if (query.category) {
    conditions.push('kd.Category = @Category');
    request.input('Category', sql.NVarChar(100), query.category);
  }
  if (query.frequency) {
    conditions.push('kd.Frequency = @Frequency');
    request.input('Frequency', sql.NVarChar(20), query.frequency);
  }
  if (query.isActive !== undefined) {
    conditions.push('kd.IsActive = @IsActive');
    request.input('IsActive', sql.Bit, query.isActive === 'true' ? 1 : 0);
  }
  if (query.search) {
    conditions.push('(kd.KpiName LIKE @Search OR kd.KpiCode LIKE @Search OR kd.Description LIKE @Search)');
    request.input('Search', sql.NVarChar(200), `%${query.search}%`);
  }

  const where = conditions.join(' AND ');

  const countResult = await request.query(`SELECT COUNT(*) AS total FROM dbo.KpiDefinition kd WHERE ${where}`);
  const total = countResult.recordset[0].total;

  const dataRequest = db.request();
  if (query.category) dataRequest.input('Category', sql.NVarChar(100), query.category);
  if (query.frequency) dataRequest.input('Frequency', sql.NVarChar(20), query.frequency);
  if (query.isActive !== undefined) dataRequest.input('IsActive', sql.Bit, query.isActive === 'true' ? 1 : 0);
  if (query.search) dataRequest.input('Search', sql.NVarChar(200), `%${query.search}%`);
  dataRequest.input('Offset', sql.Int, offset);
  dataRequest.input('Limit', sql.Int, pageSize);

  const result = await dataRequest.query<KpiDefRow>(`
    SELECT
      kd.*,
      r.RegionName AS ApplicableRegionName,
      p.Name AS ApplicableProductName,
      bg.Name AS BusinessUnitName,
      owner.Name AS KpiOwnerUserName
    FROM dbo.KpiDefinition kd
    LEFT JOIN dbo.Region r ON r.RegionID = kd.ApplicableRegionID
    LEFT JOIN dbo.Product p ON p.ProductID = kd.ApplicableProductID
    LEFT JOIN dbo.BusinessGroup bg ON bg.BusinessGroupID = kd.BusinessUnitID
    LEFT JOIN dbo.[User] owner ON owner.UserID = kd.KpiOwnerUserID
    WHERE ${where}
    ORDER BY kd.Category, kd.KpiName
    OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY
  `);

  return { items: result.recordset, total, page, pageSize };
}

export async function getKpiDef(defId: number): Promise<KpiDefRow | null> {
  const request = db.request();
  request.input('KpiDefID', sql.Int, defId);

  const result = await request.query<KpiDefRow>(`
    SELECT
      kd.*,
      r.RegionName AS ApplicableRegionName,
      p.Name AS ApplicableProductName,
      bg.Name AS BusinessUnitName,
      owner.Name AS KpiOwnerUserName
    FROM dbo.KpiDefinition kd
    LEFT JOIN dbo.Region r ON r.RegionID = kd.ApplicableRegionID
    LEFT JOIN dbo.Product p ON p.ProductID = kd.ApplicableProductID
    LEFT JOIN dbo.BusinessGroup bg ON bg.BusinessGroupID = kd.BusinessUnitID
    LEFT JOIN dbo.[User] owner ON owner.UserID = kd.KpiOwnerUserID
    WHERE kd.KpiDefID = @KpiDefID
  `);

  return result.recordset[0] ?? null;
}

export async function createKpiDef(data: {
  kpiCode: string;
  kpiName: string;
  description?: string;
  category?: string;
  measurementUnit?: string;
  targetValue?: number;
  weight?: number;
  frequency?: string;
  direction?: string;
  thresholdExcellent?: number;
  thresholdGood?: number;
  thresholdAverage?: number;
  applicableRole?: string;
  applicableRegionId?: number;
  applicableProductId?: number;
  strategicObjective?: string;
  businessUnitId?: number;
  kpiOwnerName?: string;
  kpiOwnerUserId?: number;
  dataSource?: string;
  collectionMethod?: string;
  alertThresholdText?: string;
  alertThresholdPercent?: number;
  evidenceRequired?: boolean;
  verificationRole?: string;
  dashboardGroup?: string;
  systemModule?: string;
  integrationMethod?: string;
  targetText?: string;
  unitOfMeasure?: string;
  sourceRef?: string;
}) {
  const request = db.request();
  request.input('KpiCode', sql.NVarChar(50), data.kpiCode);
  request.input('KpiName', sql.NVarChar(200), data.kpiName);
  request.input('Description', sql.NVarChar(sql.MAX), data.description ?? null);
  request.input('Category', sql.NVarChar(100), data.category ?? null);
  request.input('MeasurementUnit', sql.NVarChar(50), data.measurementUnit ?? 'Count');
  request.input('TargetValue', sql.Float, data.targetValue ?? null);
  request.input('Weight', sql.Float, data.weight ?? 1.0);
  request.input('Frequency', sql.NVarChar(20), data.frequency ?? 'Monthly');
  request.input('Direction', sql.NVarChar(20), data.direction ?? 'HigherIsBetter');
  request.input('ThresholdExcellent', sql.Float, data.thresholdExcellent ?? null);
  request.input('ThresholdGood', sql.Float, data.thresholdGood ?? null);
  request.input('ThresholdAverage', sql.Float, data.thresholdAverage ?? null);
  request.input('ApplicableRole', sql.NVarChar(50), data.applicableRole ?? null);
  request.input('ApplicableRegionID', sql.Int, data.applicableRegionId ?? null);
  request.input('ApplicableProductID', sql.Int, data.applicableProductId ?? null);
  request.input('StrategicObjective', sql.NVarChar(200), data.strategicObjective ?? null);
  request.input('BusinessUnitID', sql.Int, data.businessUnitId ?? null);
  request.input('KpiOwnerName', sql.NVarChar(100), data.kpiOwnerName ?? null);
  request.input('KpiOwnerUserID', sql.Int, data.kpiOwnerUserId ?? null);
  request.input('DataSource', sql.NVarChar(50), data.dataSource ?? null);
  request.input('CollectionMethod', sql.NVarChar(50), data.collectionMethod ?? null);
  request.input('AlertThresholdText', sql.NVarChar(50), data.alertThresholdText ?? null);
  request.input('AlertThresholdPercent', sql.Decimal(5, 2), data.alertThresholdPercent ?? null);
  request.input('EvidenceRequired', sql.Bit, data.evidenceRequired ? 1 : 0);
  request.input('VerificationRole', sql.NVarChar(100), data.verificationRole ?? null);
  request.input('DashboardGroup', sql.NVarChar(100), data.dashboardGroup ?? null);
  request.input('SystemModule', sql.NVarChar(100), data.systemModule ?? null);
  request.input('IntegrationMethod', sql.NVarChar(100), data.integrationMethod ?? null);
  request.input('TargetText', sql.NVarChar(300), data.targetText ?? null);
  request.input('UnitOfMeasure', sql.NVarChar(50), data.unitOfMeasure ?? null);
  request.input('SourceRef', sql.NVarChar(20), data.sourceRef ?? null);

  const result = await request.query(`
    INSERT INTO dbo.KpiDefinition (
      KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue,
      Weight, Frequency, Direction, ThresholdExcellent, ThresholdGood,
      ThresholdAverage, ApplicableRole, ApplicableRegionID, ApplicableProductID,
      StrategicObjective, BusinessUnitID, KpiOwnerName, KpiOwnerUserID, DataSource,
      CollectionMethod, AlertThresholdText, AlertThresholdPercent, EvidenceRequired,
      VerificationRole, DashboardGroup, SystemModule, IntegrationMethod,
      TargetText, UnitOfMeasure, SourceRef
    ) VALUES (
      @KpiCode, @KpiName, @Description, @Category, @MeasurementUnit, @TargetValue,
      @Weight, @Frequency, @Direction, @ThresholdExcellent, @ThresholdGood,
      @ThresholdAverage, @ApplicableRole, @ApplicableRegionID, @ApplicableProductID,
      @StrategicObjective, @BusinessUnitID, @KpiOwnerName, @KpiOwnerUserID, @DataSource,
      @CollectionMethod, @AlertThresholdText, @AlertThresholdPercent, @EvidenceRequired,
      @VerificationRole, @DashboardGroup, @SystemModule, @IntegrationMethod,
      @TargetText, @UnitOfMeasure, @SourceRef
    );
    SELECT SCOPE_IDENTITY() AS KpiDefID;
  `);

  return { kpiDefId: result.recordset[0].KpiDefID };
}

export async function updateKpiDef(defId: number, data: {
  kpiCode?: string;
  kpiName?: string;
  description?: string;
  category?: string;
  measurementUnit?: string;
  targetValue?: number;
  weight?: number;
  frequency?: string;
  direction?: string;
  thresholdExcellent?: number;
  thresholdGood?: number;
  thresholdAverage?: number;
  applicableRole?: string;
  applicableRegionId?: number;
  applicableProductId?: number;
  isActive?: boolean;
  strategicObjective?: string;
  businessUnitId?: number;
  kpiOwnerName?: string;
  kpiOwnerUserId?: number;
  dataSource?: string;
  collectionMethod?: string;
  alertThresholdText?: string;
  alertThresholdPercent?: number;
  evidenceRequired?: boolean;
  verificationRole?: string;
  dashboardGroup?: string;
  systemModule?: string;
  integrationMethod?: string;
  targetText?: string;
  unitOfMeasure?: string;
  sourceRef?: string;
}) {
  const sets: string[] = [];
  const request = db.request();
  request.input('KpiDefID', sql.Int, defId);

  if (data.kpiCode !== undefined) { sets.push('KpiCode = @KpiCode'); request.input('KpiCode', sql.NVarChar(50), data.kpiCode); }
  if (data.kpiName !== undefined) { sets.push('KpiName = @KpiName'); request.input('KpiName', sql.NVarChar(200), data.kpiName); }
  if (data.description !== undefined) { sets.push('Description = @Description'); request.input('Description', sql.NVarChar(sql.MAX), data.description); }
  if (data.category !== undefined) { sets.push('Category = @Category'); request.input('Category', sql.NVarChar(100), data.category); }
  if (data.measurementUnit !== undefined) { sets.push('MeasurementUnit = @MeasurementUnit'); request.input('MeasurementUnit', sql.NVarChar(50), data.measurementUnit); }
  if (data.targetValue !== undefined) { sets.push('TargetValue = @TargetValue'); request.input('TargetValue', sql.Float, data.targetValue); }
  if (data.weight !== undefined) { sets.push('Weight = @Weight'); request.input('Weight', sql.Float, data.weight); }
  if (data.frequency !== undefined) { sets.push('Frequency = @Frequency'); request.input('Frequency', sql.NVarChar(20), data.frequency); }
  if (data.direction !== undefined) { sets.push('Direction = @Direction'); request.input('Direction', sql.NVarChar(20), data.direction); }
  if (data.thresholdExcellent !== undefined) { sets.push('ThresholdExcellent = @ThresholdExcellent'); request.input('ThresholdExcellent', sql.Float, data.thresholdExcellent); }
  if (data.thresholdGood !== undefined) { sets.push('ThresholdGood = @ThresholdGood'); request.input('ThresholdGood', sql.Float, data.thresholdGood); }
  if (data.thresholdAverage !== undefined) { sets.push('ThresholdAverage = @ThresholdAverage'); request.input('ThresholdAverage', sql.Float, data.thresholdAverage); }
  if (data.applicableRole !== undefined) { sets.push('ApplicableRole = @ApplicableRole'); request.input('ApplicableRole', sql.NVarChar(50), data.applicableRole); }
  if (data.applicableRegionId !== undefined) { sets.push('ApplicableRegionID = @ApplicableRegionID'); request.input('ApplicableRegionID', sql.Int, data.applicableRegionId); }
  if (data.applicableProductId !== undefined) { sets.push('ApplicableProductID = @ApplicableProductID'); request.input('ApplicableProductID', sql.Int, data.applicableProductId); }
  if (data.isActive !== undefined) { sets.push('IsActive = @IsActive'); request.input('IsActive', sql.Bit, data.isActive ? 1 : 0); }
  if (data.strategicObjective !== undefined) { sets.push('StrategicObjective = @StrategicObjective'); request.input('StrategicObjective', sql.NVarChar(200), data.strategicObjective); }
  if (data.businessUnitId !== undefined) { sets.push('BusinessUnitID = @BusinessUnitID'); request.input('BusinessUnitID', sql.Int, data.businessUnitId); }
  if (data.kpiOwnerName !== undefined) { sets.push('KpiOwnerName = @KpiOwnerName'); request.input('KpiOwnerName', sql.NVarChar(100), data.kpiOwnerName); }
  if (data.kpiOwnerUserId !== undefined) { sets.push('KpiOwnerUserID = @KpiOwnerUserID'); request.input('KpiOwnerUserID', sql.Int, data.kpiOwnerUserId); }
  if (data.dataSource !== undefined) { sets.push('DataSource = @DataSource'); request.input('DataSource', sql.NVarChar(50), data.dataSource); }
  if (data.collectionMethod !== undefined) { sets.push('CollectionMethod = @CollectionMethod'); request.input('CollectionMethod', sql.NVarChar(50), data.collectionMethod); }
  if (data.alertThresholdText !== undefined) { sets.push('AlertThresholdText = @AlertThresholdText'); request.input('AlertThresholdText', sql.NVarChar(50), data.alertThresholdText); }
  if (data.alertThresholdPercent !== undefined) { sets.push('AlertThresholdPercent = @AlertThresholdPercent'); request.input('AlertThresholdPercent', sql.Decimal(5, 2), data.alertThresholdPercent); }
  if (data.evidenceRequired !== undefined) { sets.push('EvidenceRequired = @EvidenceRequired'); request.input('EvidenceRequired', sql.Bit, data.evidenceRequired ? 1 : 0); }
  if (data.verificationRole !== undefined) { sets.push('VerificationRole = @VerificationRole'); request.input('VerificationRole', sql.NVarChar(100), data.verificationRole); }
  if (data.dashboardGroup !== undefined) { sets.push('DashboardGroup = @DashboardGroup'); request.input('DashboardGroup', sql.NVarChar(100), data.dashboardGroup); }
  if (data.systemModule !== undefined) { sets.push('SystemModule = @SystemModule'); request.input('SystemModule', sql.NVarChar(100), data.systemModule); }
  if (data.integrationMethod !== undefined) { sets.push('IntegrationMethod = @IntegrationMethod'); request.input('IntegrationMethod', sql.NVarChar(100), data.integrationMethod); }
  if (data.targetText !== undefined) { sets.push('TargetText = @TargetText'); request.input('TargetText', sql.NVarChar(300), data.targetText); }
  if (data.unitOfMeasure !== undefined) { sets.push('UnitOfMeasure = @UnitOfMeasure'); request.input('UnitOfMeasure', sql.NVarChar(50), data.unitOfMeasure); }
  if (data.sourceRef !== undefined) { sets.push('SourceRef = @SourceRef'); request.input('SourceRef', sql.NVarChar(20), data.sourceRef); }

  if (sets.length === 0) return;

  sets.push('UpdatedAt = SYSUTCDATETIME()');
  await request.query(`UPDATE dbo.KpiDefinition SET ${sets.join(', ')} WHERE KpiDefID = @KpiDefID`);
}

export async function deleteKpiDef(defId: number) {
  const request = db.request();
  request.input('KpiDefID', sql.Int, defId);
  await request.query(`DELETE FROM dbo.KpiDefinition WHERE KpiDefID = @KpiDefID`);
}

// ---------------------------------------------------------------------------
// KPI Results
// ---------------------------------------------------------------------------
function rateKpi(achievementPercent: number, def: KpiDefRow): string {
  if (def.ThresholdExcellent != null && achievementPercent >= def.ThresholdExcellent) return 'Excellent';
  if (def.ThresholdGood != null && achievementPercent >= def.ThresholdGood) return 'Good';
  if (def.ThresholdAverage != null && achievementPercent >= def.ThresholdAverage) return 'Average';
  return 'Needs Attention';
}

function computeWeightedScore(achievementPercent: number, weight: number, direction: string): number {
  const effectivePercent = direction === 'LowerIsBetter'
    ? Math.max(0, 100 - achievementPercent + 100)
    : achievementPercent;
  return Math.round(effectivePercent * weight * 100) / 100;
}

// Monthly efficiency: actual vs planned (falls back to the annual target).
// Lower-is-best KPIs are compared in reverse.
function computeEfficiency(
  actual: number | null | undefined,
  planned: number | null | undefined,
  annualTarget: number | null | undefined,
  direction: string
): number | null {
  if (actual == null) return null;
  const base = planned ?? annualTarget;
  if (base == null || base <= 0) return null;
  const ratio = direction === 'LowerIsBetter' ? (base / actual) * 100 : (actual / base) * 100;
  return Math.round(ratio * 100) / 100;
}

// On Track / At Risk / Off Track against the KPI alert threshold (default 90%).
function computeAutoStatus(efficiency: number | null, alertPercent: number | null | undefined): string | null {
  if (efficiency == null) return null;
  const alert = Number(alertPercent ?? 90);
  if (efficiency >= alert) return 'On Track';
  if (efficiency >= alert - 15) return 'At Risk';
  return 'Off Track';
}

// Manual status_override always wins over the computed auto status.
function computeFinalStatus(autoStatus: string | null, override: string | null): string | null {
  return override ?? autoStatus;
}

const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function misRecordIdFor(sourceRef: string | null, kpiCode: string, periodStart: string): string | null {
  let ref = sourceRef ?? '';
  if (!/^\d+$/.test(ref)) {
    const m = kpiCode.match(/(\d+)$/);
    if (!m) return null;
    ref = m[1];
  }
  return `KPI-${periodStart.slice(0, 4)}-${ref.padStart(3, '0')}-${MONTH_ABBR[Number(periodStart.slice(5, 7)) - 1]}`;
}

function monthEnd(periodStart: string): string {
  const y = Number(periodStart.slice(0, 4));
  const m = Number(periodStart.slice(5, 7));
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

export async function upsertKpiResult(data: {
  kpiDefId: number;
  userId: number;
  periodStart: string;
  periodEnd: string;
  frequency: string;
  actualValue: number;
  targetValue?: number;
  dataSource?: string;
  regionId?: number;
  productId?: number;
  remarks?: string;
}) {
  const def = await getKpiDef(data.kpiDefId);
  if (!def) throw new Error('KPI definition not found');

  const targetValue = data.targetValue ?? def.TargetValue ?? 0;
  const achievementPercent = targetValue > 0 ? Math.round((data.actualValue / targetValue) * 10000) / 100 : 0;
  const weightedScore = computeWeightedScore(achievementPercent, def.Weight, def.Direction);
  const rating = rateKpi(achievementPercent, def);
  const autoStatus = computeAutoStatus(achievementPercent, def.AlertThresholdPercent);
  const finalStatus = computeFinalStatus(autoStatus, null);

  const request = db.request();
  request.input('KpiDefID', sql.Int, data.kpiDefId);
  request.input('UserID', sql.Int, data.userId);
  request.input('PeriodStart', sql.Date, data.periodStart);
  request.input('PeriodEnd', sql.Date, data.periodEnd);

  const existing = await request.query(`
    SELECT KpiResultID FROM dbo.KpiResult
    WHERE KpiDefID = @KpiDefID AND UserID = @UserID AND PeriodStart = @PeriodStart AND PeriodEnd = @PeriodEnd
  `);

  const updateReq = db.request();
  updateReq.input('KpiDefID', sql.Int, data.kpiDefId);
  updateReq.input('UserID', sql.Int, data.userId);
  updateReq.input('PeriodStart', sql.Date, data.periodStart);
  updateReq.input('PeriodEnd', sql.Date, data.periodEnd);
  updateReq.input('Frequency', sql.NVarChar(20), data.frequency);
  updateReq.input('ActualValue', sql.Float, data.actualValue);
  updateReq.input('TargetValue', sql.Float, targetValue);
  updateReq.input('AchievementPercent', sql.Float, achievementPercent);
  updateReq.input('WeightedScore', sql.Float, weightedScore);
  updateReq.input('Rating', sql.NVarChar(30), rating);
  updateReq.input('AutoStatus', sql.NVarChar(20), autoStatus);
  updateReq.input('FinalStatus', sql.NVarChar(20), finalStatus);
  updateReq.input('DataSource', sql.NVarChar(50), data.dataSource ?? 'Manual');
  updateReq.input('RegionID', sql.Int, data.regionId ?? null);
  updateReq.input('ProductID', sql.Int, data.productId ?? null);
  updateReq.input('Remarks', sql.NVarChar(sql.MAX), data.remarks ?? null);

  if (existing.recordset.length > 0) {
    updateReq.input('KpiResultID', sql.Int, existing.recordset[0].KpiResultID);
    await updateReq.query(`
      UPDATE dbo.KpiResult SET
        ActualValue = @ActualValue, TargetValue = @TargetValue,
        AchievementPercent = @AchievementPercent, WeightedScore = @WeightedScore,
        Rating = @Rating, AutoStatus = @AutoStatus, FinalStatus = @FinalStatus,
        DataSource = @DataSource, RegionID = @RegionID,
        ProductID = @ProductID, Remarks = @Remarks, UpdatedAt = SYSUTCDATETIME()
      WHERE KpiResultID = @KpiResultID
    `);
    return { kpiResultId: existing.recordset[0].KpiResultID, action: 'updated' };
  } else {
    const result = await updateReq.query(`
      INSERT INTO dbo.KpiResult (
        KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, ActualValue,
        TargetValue, AchievementPercent, WeightedScore, Rating, AutoStatus, FinalStatus,
        DataSource, RegionID, ProductID, Remarks
      ) VALUES (
        @KpiDefID, @UserID, @PeriodStart, @PeriodEnd, @Frequency, @ActualValue,
        @TargetValue, @AchievementPercent, @WeightedScore, @Rating, @AutoStatus, @FinalStatus,
        @DataSource, @RegionID, @ProductID, @Remarks
      );
      SELECT SCOPE_IDENTITY() AS KpiResultID;
    `);
    return { kpiResultId: result.recordset[0].KpiResultID, action: 'created' };
  }
}

export async function listKpiResults(query: {
  kpiDefId?: string;
  userId?: string;
  frequency?: string;
  regionId?: string;
  periodFrom?: string;
  periodTo?: string;
  recordType?: string;
  verificationStatus?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = query.page ?? 1;
  const pageSize = Math.min(query.pageSize ?? 20, 100);
  const offset = (page - 1) * pageSize;

  const request = db.request();
  const conditions: string[] = ['1=1'];

  if (query.kpiDefId) {
    conditions.push('kr.KpiDefID = @KpiDefID');
    request.input('KpiDefID', sql.Int, Number(query.kpiDefId));
  }
  if (query.userId) {
    conditions.push('kr.UserID = @UserID');
    request.input('UserID', sql.Int, Number(query.userId));
  }
  if (query.frequency) {
    conditions.push('kr.Frequency = @Frequency');
    request.input('Frequency', sql.NVarChar(20), query.frequency);
  }
  if (query.regionId) {
    conditions.push('kr.RegionID = @RegionID');
    request.input('RegionID', sql.Int, Number(query.regionId));
  }
  if (query.periodFrom) {
    conditions.push('kr.PeriodStart >= @PeriodFrom');
    request.input('PeriodFrom', sql.Date, query.periodFrom);
  }
  if (query.periodTo) {
    conditions.push('kr.PeriodEnd <= @PeriodTo');
    request.input('PeriodTo', sql.Date, query.periodTo);
  }
  if (query.recordType) {
    conditions.push('kr.RecordType = @RecordType');
    request.input('RecordType', sql.NVarChar(20), query.recordType);
  }
  if (query.verificationStatus) {
    conditions.push('kr.VerificationStatus = @VerificationStatus');
    request.input('VerificationStatus', sql.NVarChar(20), query.verificationStatus);
  }

  const where = conditions.join(' AND ');

  const countResult = await request.query(`SELECT COUNT(*) AS total FROM dbo.KpiResult kr WHERE ${where}`);
  const total = countResult.recordset[0].total;

  const dataRequest = db.request();
  if (query.kpiDefId) dataRequest.input('KpiDefID', sql.Int, Number(query.kpiDefId));
  if (query.userId) dataRequest.input('UserID', sql.Int, Number(query.userId));
  if (query.frequency) dataRequest.input('Frequency', sql.NVarChar(20), query.frequency);
  if (query.regionId) dataRequest.input('RegionID', sql.Int, Number(query.regionId));
  if (query.periodFrom) dataRequest.input('PeriodFrom', sql.Date, query.periodFrom);
  if (query.periodTo) dataRequest.input('PeriodTo', sql.Date, query.periodTo);
  if (query.recordType) dataRequest.input('RecordType', sql.NVarChar(20), query.recordType);
  if (query.verificationStatus) dataRequest.input('VerificationStatus', sql.NVarChar(20), query.verificationStatus);
  dataRequest.input('Offset', sql.Int, offset);
  dataRequest.input('Limit', sql.Int, pageSize);

  const result = await dataRequest.query<KpiResultRow>(`
    SELECT
      kr.*,
      kd.KpiCode, kd.KpiName, kd.Category,
      u.Name AS UserName,
      rv.Name AS ReviewerName,
      r.RegionName,
      p.Name AS ProductName
    FROM dbo.KpiResult kr
    JOIN dbo.KpiDefinition kd ON kd.KpiDefID = kr.KpiDefID
    LEFT JOIN dbo.[User] u ON u.UserID = kr.UserID
    LEFT JOIN dbo.[User] rv ON rv.UserID = kr.ReviewerUserID
    LEFT JOIN dbo.Region r ON r.RegionID = kr.RegionID
    LEFT JOIN dbo.Product p ON p.ProductID = kr.ProductID
    WHERE ${where}
    ORDER BY kr.PeriodStart DESC, u.Name
    OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY
  `);

  return { items: result.recordset, total, page, pageSize };
}

// ---------------------------------------------------------------------------
// Officer Ranking (KPI-based)
// ---------------------------------------------------------------------------
export async function getKpiRanking(query: {
  frequency?: string;
  regionId?: string;
  periodFrom?: string;
  periodTo?: string;
  search?: string;
  sort?: string;
}) {
  const request = db.request();
  const conditions: string[] = ['kr.Frequency = @Frequency'];

  if (query.frequency) {
    request.input('Frequency', sql.NVarChar(20), query.frequency);
  } else {
    request.input('Frequency', sql.NVarChar(20), 'Monthly');
  }

  if (query.regionId) {
    conditions.push('kr.RegionID = @RegionID');
    request.input('RegionID', sql.Int, Number(query.regionId));
  }
  if (query.periodFrom) {
    conditions.push('kr.PeriodStart >= @PeriodFrom');
    request.input('PeriodFrom', sql.Date, query.periodFrom);
  }
  if (query.periodTo) {
    conditions.push('kr.PeriodEnd <= @PeriodTo');
    request.input('PeriodTo', sql.Date, query.periodTo);
  }
  if (query.search) {
    conditions.push('u.Name LIKE @Search');
    request.input('Search', sql.NVarChar(200), `%${query.search}%`);
  }

  const where = conditions.join(' AND ');

  const result = await request.query(`
    SELECT
      u.UserID,
      u.Name,
      STRING_AGG(r.RegionName, ', ') WITHIN GROUP (ORDER BY r.RegionName) AS regionNames,
      SUM(kr.WeightedScore) AS totalWeightedScore,
      AVG(kr.AchievementPercent) AS avgAchievement,
      COUNT(DISTINCT kr.KpiDefID) AS kpiCount,
      CASE
        WHEN AVG(kr.AchievementPercent) >= 85 THEN 'Excellent'
        WHEN AVG(kr.AchievementPercent) >= 70 THEN 'Good'
        WHEN AVG(kr.AchievementPercent) >= 50 THEN 'Average'
        ELSE 'Needs Attention'
      END AS rating
    FROM dbo.KpiResult kr
    JOIN dbo.[User] u ON u.UserID = kr.UserID
    LEFT JOIN dbo.UserRegionAssignment ura ON ura.UserID = u.UserID
    LEFT JOIN dbo.Region r ON r.RegionID = ura.RegionID
    WHERE ${where}
    GROUP BY u.UserID, u.Name
    ORDER BY ${query.sort === 'avgAchievement' ? 'avgAchievement' : 'totalWeightedScore'} DESC
  `);

  return result.recordset.map((r: any, i: number) => ({
    userId: r.UserID,
    name: r.Name,
    regionNames: r.regionNames ?? '—',
    totalWeightedScore: Math.round(r.totalWeightedScore * 100) / 100,
    avgAchievement: Math.round(r.avgAchievement * 100) / 100,
    kpiCount: r.kpiCount,
    rating: r.rating,
    rank: i + 1,
  }));
}

// ---------------------------------------------------------------------------
// Planned vs Achieved
// ---------------------------------------------------------------------------
export async function getPlannedVsAchieved(query: {
  frequency?: string;
  regionId?: string;
  userId?: string;
  periodFrom?: string;
  periodTo?: string;
}) {
  const request = db.request();
  const conditions: string[] = ['1=1'];

  if (query.frequency) {
    conditions.push('kr.Frequency = @Frequency');
    request.input('Frequency', sql.NVarChar(20), query.frequency);
  }
  if (query.regionId) {
    conditions.push('kr.RegionID = @RegionID');
    request.input('RegionID', sql.Int, Number(query.regionId));
  }
  if (query.userId) {
    conditions.push('kr.UserID = @UserID');
    request.input('UserID', sql.Int, Number(query.userId));
  }
  if (query.periodFrom) {
    conditions.push('kr.PeriodStart >= @PeriodFrom');
    request.input('PeriodFrom', sql.Date, query.periodFrom);
  }
  if (query.periodTo) {
    conditions.push('kr.PeriodEnd <= @PeriodTo');
    request.input('PeriodTo', sql.Date, query.periodTo);
  }

  const where = conditions.join(' AND ');

  const result = await request.query(`
    SELECT
      kd.KpiCode,
      kd.KpiName,
      kd.Category,
      kd.MeasurementUnit,
      kd.Weight,
      SUM(kr.TargetValue) AS totalTarget,
      SUM(kr.ActualValue) AS totalActual,
      CASE WHEN SUM(kr.TargetValue) > 0
        THEN ROUND(SUM(kr.ActualValue) / SUM(kr.TargetValue) * 100, 1)
        ELSE 0
      END AS achievementPercent,
      COUNT(DISTINCT kr.UserID) AS officerCount
    FROM dbo.KpiResult kr
    JOIN dbo.KpiDefinition kd ON kd.KpiDefID = kr.KpiDefID
    WHERE ${where}
    GROUP BY kd.KpiCode, kd.KpiName, kd.Category, kd.MeasurementUnit, kd.Weight
    ORDER BY kd.Category, kd.KpiName
  `);

  return result.recordset.map((r: any) => ({
    kpiCode: r.KpiCode,
    kpiName: r.KpiName,
    category: r.Category,
    measurementUnit: r.MeasurementUnit,
    weight: r.Weight,
    totalTarget: r.totalTarget,
    totalActual: r.totalActual,
    achievementPercent: r.achievementPercent,
    officerCount: r.officerCount,
    status: r.achievementPercent >= 85 ? 'Excellent' : r.achievementPercent >= 70 ? 'Good' : r.achievementPercent >= 50 ? 'Average' : 'Needs Attention',
  }));
}

// ---------------------------------------------------------------------------
// Monthly Measurement Entry (workbook workflow: actual only, rest computed)
// ---------------------------------------------------------------------------
export async function upsertMeasurement(data: {
  kpiDefId: number;
  periodStart: string; // YYYY-MM-01
  plannedValue?: number | null;
  plannedText?: string | null;
  actualValue?: number | null;
  statusOverride?: string | null;
  notes?: string | null;
  evidenceReference?: string | null;
  misRecordId?: string | null;
}) {
  const def = await getKpiDef(data.kpiDefId);
  if (!def) throw new Error('KPI definition not found');

  const periodEnd = monthEnd(data.periodStart);
  const request = db.request();
  request.input('KpiDefID', sql.Int, data.kpiDefId);
  request.input('PeriodStart', sql.Date, data.periodStart);

  const existing = await request.query<{
    KpiResultID: number;
    PlannedValue: number | null;
    PlannedText: string | null;
    ActualValue: number | null;
    StatusOverride: string | null;
    Remarks: string | null;
    EvidenceReference: string | null;
  }>(`
    SELECT KpiResultID, PlannedValue, PlannedText, ActualValue, StatusOverride, Remarks, EvidenceReference
    FROM dbo.KpiResult
    WHERE KpiDefID = @KpiDefID AND RecordType = 'Measurement' AND PeriodStart = @PeriodStart
  `);

  const row = existing.recordset[0] ?? null;
  const actualValue = data.actualValue !== undefined ? data.actualValue : (row?.ActualValue ?? null);
  const statusOverride = data.statusOverride !== undefined ? data.statusOverride : (row?.StatusOverride ?? null);
  const notes = data.notes !== undefined ? data.notes : (row?.Remarks ?? null);
  const evidenceReference = data.evidenceReference !== undefined ? data.evidenceReference : (row?.EvidenceReference ?? null);
  const plannedValue = data.plannedValue !== undefined ? data.plannedValue : (row?.PlannedValue ?? null);
  const plannedText = data.plannedText !== undefined ? data.plannedText : (row?.PlannedText ?? null);
  const planned = plannedValue;

  const efficiency = computeEfficiency(actualValue, planned, def.TargetValue, def.Direction);
  const autoStatus = computeAutoStatus(efficiency, def.AlertThresholdPercent);
  const finalStatus = computeFinalStatus(autoStatus, statusOverride);
  const rating = efficiency != null ? rateKpi(efficiency, def) : null;
  const weightedScore = efficiency != null
    ? Math.round(efficiency * def.Weight * 100) / 100
    : null;

  const write = db.request();
  write.input('KpiDefID', sql.Int, data.kpiDefId);
  write.input('PeriodStart', sql.Date, data.periodStart);
  write.input('PeriodEnd', sql.Date, periodEnd);
  write.input('Frequency', sql.NVarChar(20), def.Frequency);
  write.input('PlannedValue', sql.Float, plannedValue);
  write.input('PlannedText', sql.NVarChar(100), plannedText);
  write.input('ActualValue', sql.Float, actualValue);
  write.input('AchievementPercent', sql.Float, efficiency);
  write.input('WeightedScore', sql.Float, weightedScore);
  write.input('Rating', sql.NVarChar(30), rating);
  write.input('AutoStatus', sql.NVarChar(20), autoStatus);
  write.input('StatusOverride', sql.NVarChar(20), statusOverride);
  write.input('FinalStatus', sql.NVarChar(20), finalStatus);
  write.input('Remarks', sql.NVarChar(sql.MAX), notes);
  write.input('EvidenceReference', sql.NVarChar(500), evidenceReference);
  write.input('DataSource', sql.NVarChar(50), def.DataSource ?? 'Manual');
  write.input('MisRecordId', sql.NVarChar(40), data.misRecordId ?? misRecordIdFor(def.SourceRef, def.KpiCode, data.periodStart));

  if (row) {
    // A changed actual invalidates any earlier verification.
    const actualChanged = (row.ActualValue ?? null) !== (actualValue ?? null);
    write.input('KpiResultID', sql.Int, row.KpiResultID);
    await write.query(`
      UPDATE dbo.KpiResult SET
        PlannedValue = @PlannedValue, PlannedText = @PlannedText,
        ActualValue = @ActualValue, AchievementPercent = @AchievementPercent,
        WeightedScore = @WeightedScore, Rating = @Rating,
        AutoStatus = @AutoStatus, StatusOverride = @StatusOverride, FinalStatus = @FinalStatus,
        Remarks = @Remarks, EvidenceReference = @EvidenceReference,
        DataSource = @DataSource, MisRecordId = @MisRecordId,
        ${actualChanged ? "VerificationStatus = 'Pending', VerificationNote = NULL, ReviewerUserID = NULL," : ''}
        UpdatedAt = SYSUTCDATETIME()
      WHERE KpiResultID = @KpiResultID
    `);
    return { kpiResultId: row.KpiResultID, action: 'updated' };
  }

  const result = await write.query(`
    INSERT INTO dbo.KpiResult (
      KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, PlannedValue, PlannedText,
      ActualValue, TargetValue, AchievementPercent, WeightedScore, Rating,
      AutoStatus, StatusOverride, FinalStatus, Remarks, EvidenceReference,
      RecordType, DataSource, VerificationStatus, MisRecordId
    ) VALUES (
      @KpiDefID, NULL, @PeriodStart, @PeriodEnd, @Frequency, @PlannedValue, @PlannedText,
      @ActualValue, @PlannedValue, @AchievementPercent, @WeightedScore, @Rating,
      @AutoStatus, @StatusOverride, @FinalStatus, @Remarks, @EvidenceReference,
      'Measurement', @DataSource, 'Pending', @MisRecordId
    );
    SELECT SCOPE_IDENTITY() AS KpiResultID;
  `);
  return { kpiResultId: result.recordset[0].KpiResultID, action: 'created' };
}

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

export async function listMeasurement(query: {
  year?: string;
  month?: string;
  category?: string;
  businessUnitId?: string;
  status?: string;
  search?: string;
}) {
  const year = Number(query.year) || new Date().getFullYear();
  const month = query.month ? Number(query.month) : null;

  const request = db.request();
  const conditions: string[] = ["kd.SourceRef IS NOT NULL", 'kd.IsActive = 1'];
  request.input('YearStart', sql.Date, `${year}-01-01`);
  request.input('YearNext', sql.Date, `${year + 1}-01-01`);

  if (month) {
    conditions.push('MONTH(kr.PeriodStart) = @Month');
    request.input('Month', sql.Int, month);
  }
  if (query.category) {
    conditions.push('kd.Category = @Category');
    request.input('Category', sql.NVarChar(100), query.category);
  }
  if (query.businessUnitId) {
    conditions.push('kd.BusinessUnitID = @BusinessUnitID');
    request.input('BusinessUnitID', sql.Int, Number(query.businessUnitId));
  }
  if (query.status) {
    conditions.push("ISNULL(kr.FinalStatus, 'No Data') = @Status");
    request.input('Status', sql.NVarChar(20), query.status);
  }
  if (query.search) {
    conditions.push('(kd.KpiName LIKE @Search OR kd.KpiCode LIKE @Search)');
    request.input('Search', sql.NVarChar(200), `%${query.search}%`);
  }

  const result = await request.query<MeasurementRow>(`
    SELECT
      kd.KpiDefID, kd.KpiCode, kd.KpiName, kd.Category, kd.StrategicObjective,
      kd.UnitOfMeasure, kd.TargetText, kd.TargetValue AS AnnualTarget,
      kd.BusinessUnitID, bg.Name AS BusinessUnitName,
      kd.KpiOwnerName, owner.Name AS KpiOwnerUserName,
      kd.DataSource, kd.CollectionMethod, kd.Direction, kd.AlertThresholdPercent,
      kd.EvidenceRequired, kd.VerificationRole, kd.SystemModule, kd.DashboardGroup, kd.SourceRef,
      kr.KpiResultID, kr.PeriodStart, kr.PeriodEnd, kr.PlannedValue, kr.PlannedText,
      kr.ActualValue, kr.AchievementPercent AS EfficiencyPercent,
      kr.AutoStatus, kr.StatusOverride, kr.FinalStatus,
      kr.Remarks AS Notes, kr.EvidenceReference,
      kr.VerificationStatus, kr.VerificationNote, rv.Name AS ReviewerName,
      kr.MisRecordId, kr.UpdatedAt
    FROM dbo.KpiDefinition kd
    LEFT JOIN dbo.BusinessGroup bg ON bg.BusinessGroupID = kd.BusinessUnitID
    LEFT JOIN dbo.[User] owner ON owner.UserID = kd.KpiOwnerUserID
    LEFT JOIN dbo.KpiResult kr
      ON kr.KpiDefID = kd.KpiDefID
     AND kr.RecordType = 'Measurement'
     AND kr.PeriodStart >= @YearStart AND kr.PeriodStart < @YearNext
    LEFT JOIN dbo.[User] rv ON rv.UserID = kr.ReviewerUserID
    WHERE ${conditions.join(' AND ')}
    ORDER BY LEN(kd.SourceRef), kd.SourceRef, kr.PeriodStart
  `);

  return { year, month: month ?? null, items: result.recordset };
}

// ---------------------------------------------------------------------------
// Verification workflow (Pending -> Verified / Rejected)
// ---------------------------------------------------------------------------
export async function getVerificationQueue(query: {
  status?: string;
  category?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = query.page ?? 1;
  const pageSize = Math.min(query.pageSize ?? 50, 200);
  const offset = (page - 1) * pageSize;
  const status = query.status ?? 'Pending';

  const request = db.request();
  const conditions: string[] = [
    "kr.RecordType = 'Measurement'",
    'kr.VerificationStatus = @Status',
    '(kr.ActualValue IS NOT NULL OR kr.FinalStatus IS NOT NULL)',
  ];
  request.input('Status', sql.NVarChar(20), status);
  if (query.category) {
    conditions.push('kd.Category = @Category');
    request.input('Category', sql.NVarChar(100), query.category);
  }
  const where = conditions.join(' AND ');

  const countRequest = db.request();
  countRequest.input('Status', sql.NVarChar(20), status);
  if (query.category) countRequest.input('Category', sql.NVarChar(100), query.category);
  const countResult = await countRequest.query(
    `SELECT COUNT(*) AS total FROM dbo.KpiResult kr JOIN dbo.KpiDefinition kd ON kd.KpiDefID = kr.KpiDefID WHERE ${where}`
  );

  const dataRequest = db.request();
  dataRequest.input('Status', sql.NVarChar(20), status);
  if (query.category) dataRequest.input('Category', sql.NVarChar(100), query.category);
  dataRequest.input('Offset', sql.Int, offset);
  dataRequest.input('Limit', sql.Int, pageSize);
  const result = await dataRequest.query(`
    SELECT
      kr.KpiResultID, kr.PeriodStart, kr.PeriodEnd, kr.PlannedValue, kr.PlannedText,
      kr.ActualValue, kr.AchievementPercent AS EfficiencyPercent,
      kr.AutoStatus, kr.StatusOverride, kr.FinalStatus,
      kr.Remarks AS Notes, kr.EvidenceReference, kr.VerificationStatus, kr.VerificationNote,
      kr.MisRecordId, kr.UpdatedAt,
      kd.KpiCode, kd.KpiName, kd.Category, kd.UnitOfMeasure, kd.SourceRef,
      bg.Name AS BusinessUnitName, kd.KpiOwnerName,
      rv.Name AS ReviewerName
    FROM dbo.KpiResult kr
    JOIN dbo.KpiDefinition kd ON kd.KpiDefID = kr.KpiDefID
    LEFT JOIN dbo.BusinessGroup bg ON bg.BusinessGroupID = kd.BusinessUnitID
    LEFT JOIN dbo.[User] rv ON rv.UserID = kr.ReviewerUserID
    WHERE ${where}
    ORDER BY kr.UpdatedAt DESC, kr.PeriodStart DESC
    OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY
  `);

  return { items: result.recordset, total: countResult.recordset[0].total, page, pageSize, status };
}

export async function verifyMeasurements(data: {
  ids: number[];
  decision: 'Verified' | 'Rejected';
  note?: string | null;
  reviewerUserId: number;
}) {
  const request = db.request();
  request.input('Decision', sql.NVarChar(20), data.decision);
  request.input('Note', sql.NVarChar(500), data.note ?? null);
  request.input('ReviewerUserID', sql.Int, data.reviewerUserId);
  const idParams = data.ids.map((id, i) => {
    request.input(`Id${i}`, sql.Int, id);
    return `@Id${i}`;
  });

  const result = await request.query(`
    UPDATE dbo.KpiResult SET
      VerificationStatus = @Decision, VerificationNote = @Note,
      ReviewerUserID = @ReviewerUserID, UpdatedAt = SYSUTCDATETIME()
    WHERE KpiResultID IN (${idParams.join(', ')})
      AND RecordType = 'Measurement' AND VerificationStatus = 'Pending'
  `);

  return { updated: result.rowsAffected[0] ?? 0, decision: data.decision };
}
