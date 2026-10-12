import sql from 'mssql';

const config: sql.config = {
  user: 'kgmis_user',
  password: 'KgMis!2026Dev',
  server: 'localhost',
  port: 50404,
  database: 'KG_MIS',
  options: { trustServerCertificate: true, encrypt: false },
};

async function run() {
  const pool = await sql.connect(config);
  console.log('Connected to database. Seeding KPI test data...\n');

  // ── 1. KPI Definitions ──────────────────────────────────────────────────────
  const kpiDefs = [
    { code: 'WK_MI_REPORT', name: 'Weekly MI Report Completion', cat: 'Reporting', unit: 'Count', target: 4, weight: 1.5, freq: 'Weekly', dir: 'HigherIsBetter', ex: 100, good: 80, avg: 60 },
    { code: 'MO_MI_REPORT', name: 'Monthly MI Report Completion', cat: 'Reporting', unit: 'Count', target: 1, weight: 2.0, freq: 'Monthly', dir: 'HigherIsBetter', ex: 100, good: 80, avg: 60 },
    { code: 'COMPETITOR_PRICE', name: 'Competitor Price Updates', cat: 'Data Collection', unit: 'Count', target: 20, weight: 1.0, freq: 'Weekly', dir: 'HigherIsBetter', ex: 100, good: 80, avg: 60 },
    { code: 'MARKET_VISIT', name: 'Market Visit Completion', cat: 'Field Activity', unit: 'Count', target: 10, weight: 1.5, freq: 'Weekly', dir: 'HigherIsBetter', ex: 100, good: 80, avg: 60 },
    { code: 'INTERVIEW', name: 'Customer Interview Completion', cat: 'Field Activity', unit: 'Count', target: 8, weight: 1.0, freq: 'Weekly', dir: 'HigherIsBetter', ex: 100, good: 80, avg: 60 },
    { code: 'WEEKLY_SALES', name: 'Weekly Sales Submission', cat: 'Sales', unit: 'Count', target: 1, weight: 1.5, freq: 'Weekly', dir: 'HigherIsBetter', ex: 100, good: 80, avg: 60 },
    { code: 'FORM_RESPONSE', name: 'Form Response Completion', cat: 'Data Collection', unit: 'Count', target: 5, weight: 1.0, freq: 'Weekly', dir: 'HigherIsBetter', ex: 100, good: 80, avg: 60 },
    { code: 'MULTIMEDIA', name: 'Multimedia Capture & Validation', cat: 'Data Collection', unit: 'Count', target: 10, weight: 0.5, freq: 'Weekly', dir: 'HigherIsBetter', ex: 100, good: 80, avg: 60 },
    { code: 'REVENUE_TARGET', name: 'Revenue Target Achievement', cat: 'Sales', unit: 'Percentage', target: 100, weight: 2.0, freq: 'Monthly', dir: 'HigherIsBetter', ex: 100, good: 80, avg: 60 },
    { code: 'NEW_CLIENTS', name: 'New Client Acquisition', cat: 'Sales', unit: 'Count', target: 5, weight: 1.0, freq: 'Monthly', dir: 'HigherIsBetter', ex: 100, good: 80, avg: 60 },
    { code: 'COMPLAINT_RATE', name: 'Customer Complaint Rate', cat: 'Quality', unit: 'Percentage', target: 5, weight: 1.5, freq: 'Monthly', dir: 'LowerIsBetter', ex: 100, good: 80, avg: 60 },
    { code: 'AVG_SATISFACTION', name: 'Average Customer Satisfaction', cat: 'Quality', unit: 'Percentage', target: 85, weight: 1.5, freq: 'Monthly', dir: 'HigherIsBetter', ex: 100, good: 80, avg: 60 },
  ];

  const kpiIdMap: Record<string, number> = {};
  for (const d of kpiDefs) {
    const r = await pool.request()
      .input('Code', sql.NVarChar(50), d.code)
      .input('Name', sql.NVarChar(200), d.name)
      .input('Desc', sql.NVarChar(sql.MAX), `Automated KPI: ${d.name}`)
      .input('Cat', sql.NVarChar(100), d.cat)
      .input('Unit', sql.NVarChar(50), d.unit)
      .input('Target', sql.Float, d.target)
      .input('Weight', sql.Float, d.weight)
      .input('Freq', sql.NVarChar(20), d.freq)
      .input('Dir', sql.NVarChar(20), d.dir)
      .input('Ex', sql.Float, d.ex)
      .input('Good', sql.Float, d.good)
      .input('Avg', sql.Float, d.avg)
      .query(`
        INSERT INTO KpiDefinition (KpiCode, KpiName, Description, Category, MeasurementUnit, TargetValue, Weight, Frequency, Direction, ThresholdExcellent, ThresholdGood, ThresholdAverage)
        OUTPUT INSERTED.KpiDefID
        VALUES (@Code, @Name, @Desc, @Cat, @Unit, @Target, @Weight, @Freq, @Dir, @Ex, @Good, @Avg)
      `);
    kpiIdMap[d.code] = r.recordset[0].KpiDefID;
    console.log(`  Created KPI: ${d.code} (ID: ${kpiIdMap[d.code]})`);
  }

  // ── 2. Plans (hierarchical: Annual -> Quarterly -> Monthly) ────────────────
  console.log('\nCreating plans...');

  // Annual plan 1
  const annual1 = await pool.request()
    .input('Title', sql.NVarChar(200), '2026 Marketing Strategy Plan')
    .input('Desc', sql.NVarChar(sql.MAX), 'Annual marketing strategy covering all business groups and regions')
    .input('Freq', sql.NVarChar(20), 'Annual')
    .input('PS', sql.Date, '2026-01-01')
    .input('PE', sql.Date, '2026-12-31')
    .input('Team', sql.NVarChar(100), 'Marketing')
    .input('Focus', sql.NVarChar(200), 'Market expansion and brand visibility')
    .input('Del', sql.NVarChar(sql.MAX), 'Full-year marketing plan with quarterly milestones')
    .input('UID', sql.Int, 2)
    .input('RID', sql.Int, 1)
    .input('CID', sql.Int, 2)
    .query(`
      INSERT INTO [Plan] (Title, Description, Frequency, PeriodStart, PeriodEnd, ResponsibleTeam, MainFocus, KeyDeliverable, ResponsibleUserID, RegionID, CreatedBy, Status, ApprovalStatus)
      OUTPUT INSERTED.PlanID
      VALUES (@Title, @Desc, @Freq, @PS, @PE, @Team, @Focus, @Del, @UID, @RID, @CID, 'In Progress', 'Approved')
    `);
  const annual1Id = annual1.recordset[0].PlanID;
  console.log(`  Annual Plan 1: ID ${annual1Id}`);

  // Annual plan 2
  const annual2 = await pool.request()
    .input('Title', sql.NVarChar(200), '2026 Sales Operations Plan')
    .input('Desc', sql.NVarChar(sql.MAX), 'Annual sales targets and field operations')
    .input('Freq', sql.NVarChar(20), 'Annual')
    .input('PS', sql.Date, '2026-01-01')
    .input('PE', sql.Date, '2026-12-31')
    .input('Team', sql.NVarChar(100), 'Sales Operations')
    .input('Focus', sql.NVarChar(200), 'Revenue growth and outlet coverage')
    .input('Del', sql.NVarChar(sql.MAX), 'Quarterly sales targets per region')
    .input('UID', sql.Int, 2)
    .input('RID', sql.Int, 1)
    .input('CID', sql.Int, 2)
    .query(`
      INSERT INTO [Plan] (Title, Description, Frequency, PeriodStart, PeriodEnd, ResponsibleTeam, MainFocus, KeyDeliverable, ResponsibleUserID, RegionID, CreatedBy, Status, ApprovalStatus)
      OUTPUT INSERTED.PlanID
      VALUES (@Title, @Desc, @Freq, @PS, @PE, @Team, @Focus, @Del, @UID, @RID, @CID, 'In Progress', 'Approved')
    `);
  const annual2Id = annual2.recordset[0].PlanID;
  console.log(`  Annual Plan 2: ID ${annual2Id}`);

  // Quarterly children for annual 1
  const quarters = [
    { title: 'Q1 2026 Marketing Execution', start: '2026-01-01', end: '2026-03-31', status: 'Completed' },
    { title: 'Q2 2026 Marketing Execution', start: '2026-04-01', end: '2026-06-30', status: 'Completed' },
    { title: 'Q3 2026 Marketing Execution', start: '2026-07-01', end: '2026-09-30', status: 'In Progress' },
    { title: 'Q4 2026 Marketing Execution', start: '2026-10-01', end: '2026-12-31', status: 'Not Started' },
  ];

  const quarterlyIds: number[] = [];
  for (const q of quarters) {
    const r = await pool.request()
      .input('Parent', sql.Int, annual1Id)
      .input('Title', sql.NVarChar(200), q.title)
      .input('Freq', sql.NVarChar(20), 'Quarterly')
      .input('PS', sql.Date, q.start)
      .input('PE', sql.Date, q.end)
      .input('Team', sql.NVarChar(100), 'Marketing')
      .input('UID', sql.Int, 2)
      .input('RID', sql.Int, 1)
      .input('CID', sql.Int, 2)
      .input('Status', sql.NVarChar(30), q.status)
      .query(`
        INSERT INTO [Plan] (ParentPlanID, Title, Frequency, PeriodStart, PeriodEnd, ResponsibleTeam, ResponsibleUserID, RegionID, CreatedBy, Status, ApprovalStatus)
        OUTPUT INSERTED.PlanID
        VALUES (@Parent, @Title, @Freq, @PS, @PE, @Team, @UID, @RID, @CID, @Status, 'Approved')
      `);
    quarterlyIds.push(r.recordset[0].PlanID);
    console.log(`    ${q.title}: ID ${r.recordset[0].PlanID}`);
  }

  // Quarterly children for annual 2
  const q2Data = [
    { title: 'Q1 2026 Sales Targets', start: '2026-01-01', end: '2026-03-31', status: 'Completed' },
    { title: 'Q2 2026 Sales Targets', start: '2026-04-01', end: '2026-06-30', status: 'Completed' },
    { title: 'Q3 2026 Sales Targets', start: '2026-07-01', end: '2026-09-30', status: 'In Progress' },
    { title: 'Q4 2026 Sales Targets', start: '2026-10-01', end: '2026-12-31', status: 'Planned' },
  ];
  const q2Ids: number[] = [];
  for (const q of q2Data) {
    const r = await pool.request()
      .input('Parent', sql.Int, annual2Id)
      .input('Title', sql.NVarChar(200), q.title)
      .input('Freq', sql.NVarChar(20), 'Quarterly')
      .input('PS', sql.Date, q.start)
      .input('PE', sql.Date, q.end)
      .input('Team', sql.NVarChar(100), 'Sales Operations')
      .input('UID', sql.Int, 2)
      .input('RID', sql.Int, 1)
      .input('CID', sql.Int, 2)
      .input('Status', sql.NVarChar(30), q.status)
      .query(`
        INSERT INTO [Plan] (ParentPlanID, Title, Frequency, PeriodStart, PeriodEnd, ResponsibleTeam, ResponsibleUserID, RegionID, CreatedBy, Status, ApprovalStatus)
        OUTPUT INSERTED.PlanID
        VALUES (@Parent, @Title, @Freq, @PS, @PE, @Team, @UID, @RID, @CID, @Status, 'Approved')
      `);
    q2Ids.push(r.recordset[0].PlanID);
    console.log(`    ${q.title}: ID ${r.recordset[0].PlanID}`);
  }

  // ── 3. Activities for Q3 plans ──────────────────────────────────────────────
  console.log('\nCreating activities...');

  const activities = [
    { planId: quarterlyIds[2], title: 'Field visit - Addis Ababa outlets', type: 'Field Activity', start: '2026-07-01', end: '2026-07-31', status: 'Completed', priority: 'High', target: '15', unit: 'visits', userId: 5, regionId: 1 },
    { planId: quarterlyIds[2], title: 'Competitor price survey - Q3', type: 'Data Collection', start: '2026-07-01', end: '2026-09-30', status: 'In Progress', priority: 'Medium', target: '60', unit: 'records', userId: 6, regionId: 1 },
    { planId: quarterlyIds[2], title: 'Customer satisfaction interviews', type: 'Field Activity', start: '2026-07-15', end: '2026-08-31', status: 'In Progress', priority: 'High', target: '25', unit: 'interviews', userId: 7, regionId: 2 },
    { planId: quarterlyIds[2], title: 'Weekly sales data collection', type: 'Sales', start: '2026-07-01', end: '2026-09-30', status: 'In Progress', priority: 'Medium', target: '12', unit: 'submissions', userId: 5, regionId: 1 },
    { planId: quarterlyIds[2], title: 'Multimedia documentation', type: 'Data Collection', start: '2026-07-01', end: '2026-09-30', status: 'Not Started', priority: 'Low', target: '30', unit: 'assets', userId: 8, regionId: 3 },
    { planId: quarterlyIds[2], title: 'Brand visibility report', type: 'Reporting', start: '2026-08-01', end: '2026-08-31', status: 'Not Started', priority: 'High', target: '1', unit: 'report', userId: 6, regionId: 2 },
    { planId: q2Ids[2], title: 'Oromia region outlet visits', type: 'Field Activity', start: '2026-07-01', end: '2026-09-30', status: 'In Progress', priority: 'High', target: '20', unit: 'visits', userId: 9, regionId: 2 },
    { planId: q2Ids[2], title: 'Distributor performance review', type: 'Reporting', start: '2026-08-01', end: '2026-08-31', status: 'Not Started', priority: 'Medium', target: '5', unit: 'reviews', userId: 10, regionId: 3 },
    { planId: quarterlyIds[1], title: 'Q2 marketing report', type: 'Reporting', start: '2026-04-01', end: '2026-06-30', status: 'Completed', priority: 'High', target: '1', unit: 'report', userId: 2, regionId: 1 },
    { planId: quarterlyIds[1], title: 'Q2 competitor analysis', type: 'Data Collection', start: '2026-04-01', end: '2026-06-30', status: 'Completed', priority: 'Medium', target: '40', unit: 'records', userId: 3, regionId: 1 },
    { planId: quarterlyIds[0], title: 'Q1 field operations kickoff', type: 'Field Activity', start: '2026-01-01', end: '2026-03-31', status: 'Completed', priority: 'Critical', target: '10', unit: 'visits', userId: 5, regionId: 1 },
    { planId: quarterlyIds[0], title: 'Q1 multimedia baseline', type: 'Data Collection', start: '2026-01-01', end: '2026-03-31', status: 'Completed', priority: 'Medium', target: '20', unit: 'assets', userId: 8, regionId: 2 },
    { planId: q2Ids[0], title: 'Q1 sales target tracking', type: 'Sales', start: '2026-01-01', end: '2026-03-31', status: 'Completed', priority: 'High', target: '3', unit: 'reports', userId: 9, regionId: 2 },
    { planId: q2Ids[1], title: 'Q2 sales outreach', type: 'Sales', start: '2026-04-01', end: '2026-06-30', status: 'Completed', priority: 'Medium', target: '8', unit: 'clients', userId: 10, regionId: 3 },
    { planId: quarterlyIds[2], title: 'Emergency field response', type: 'Field Activity', start: '2026-07-15', end: '2026-07-20', status: 'Delayed', priority: 'Critical', target: '3', unit: 'visits', userId: 7, regionId: 4 },
  ];

  for (const a of activities) {
    await pool.request()
      .input('PlanID', sql.Int, a.planId)
      .input('Title', sql.NVarChar(200), a.title)
      .input('AType', sql.NVarChar(100), a.type)
      .input('Start', sql.Date, a.start)
      .input('End', sql.Date, a.end)
      .input('Status', sql.NVarChar(30), a.status)
      .input('Priority', sql.NVarChar(20), a.priority)
      .input('Target', sql.NVarChar(100), a.target)
      .input('Unit', sql.NVarChar(50), a.unit)
      .input('UID', sql.Int, a.userId)
      .input('RID', sql.Int, a.regionId)
      .input('CID', sql.Int, 2)
      .query(`
        INSERT INTO PlanActivity (PlanID, Title, ActivityType, StartDate, EndDate, Status, Priority, Target, Unit, ResponsibleUserID, RegionID, CreatedBy)
        VALUES (@PlanID, @Title, @AType, @Start, @End, @Status, @Priority, @Target, @Unit, @UID, @RID, @CID)
      `);
    console.log(`    Activity: ${a.title} [${a.status}]`);
  }

  // ── 4. KPI Results (realistic data for field officers) ──────────────────────
  console.log('\nCreating KPI results...');

  const fieldOfficers = [
    { id: 5, name: 'Shelema', regionId: 2 },
    { id: 6, name: 'Efrem', regionId: 1 },
    { id: 7, name: 'Duskane', regionId: 4 },
    { id: 8, name: 'Fasika', regionId: 3 },
    { id: 9, name: 'Masamo', regionId: 2 },
    { id: 10, name: 'Leta', regionId: 3 },
  ];

  const periods = [
    { start: '2026-07-01', end: '2026-07-31', freq: 'Monthly' as const },
    { start: '2026-06-01', end: '2026-06-30', freq: 'Monthly' as const },
    { start: '2026-05-01', end: '2026-05-31', freq: 'Monthly' as const },
  ];

  const kpiCodes = Object.keys(kpiIdMap);

  for (const officer of fieldOfficers) {
    for (const period of periods) {
      for (const code of kpiCodes) {
        const def = kpiDefs.find((d) => d.code === code)!;
        // Generate realistic actual values with some variation
        let actual: number;
        const seed = officer.id * 100 + kpiCodes.indexOf(code) * 10 + periods.indexOf(period);
        const rand = ((seed * 9301 + 49297) % 233280) / 233280; // pseudo-random 0-1

        if (code === 'COMPLAINT_RATE') {
          // Lower is better - officers with lower complaint rates are better
          actual = Math.round((rand * 4 + 1) * 100) / 100; // 1-5%
        } else if (code === 'AVG_SATISFACTION') {
          actual = Math.round((rand * 30 + 65) * 100) / 100; // 65-95%
        } else if (code === 'REVENUE_TARGET') {
          actual = Math.round((rand * 40 + 60) * 100) / 100; // 60-100%
        } else {
          const targetVal = def.target;
          const variance = rand * 0.6 + 0.7; // 0.7 - 1.3 of target
          actual = Math.round(targetVal * variance);
        }

        // Achievement
        const achievement = def.dir === 'LowerIsBetter'
          ? (actual <= def.target ? 100 : Math.max(0, 100 - ((actual - def.target) / def.target) * 100))
          : (def.target > 0 ? Math.round((actual / def.target) * 10000) / 100 : 0);
        const effectivePercent = def.dir === 'LowerIsBetter' ? Math.max(0, 100 - achievement + 100) : achievement;
        const weightedScore = Math.round(effectivePercent * def.weight * 100) / 100;

        let rating: string;
        if (achievement >= 100) rating = 'Excellent';
        else if (achievement >= 80) rating = 'Good';
        else if (achievement >= 60) rating = 'Average';
        else rating = 'Needs Attention';

        await pool.request()
          .input('KpiDefID', sql.Int, kpiIdMap[code])
          .input('UserID', sql.Int, officer.id)
          .input('PS', sql.Date, period.start)
          .input('PE', sql.Date, period.end)
          .input('Freq', sql.NVarChar(20), period.freq)
          .input('Actual', sql.Float, actual)
          .input('Target', sql.Float, def.target)
          .input('Achievement', sql.Float, achievement)
          .input('WeightedScore', sql.Float, weightedScore)
          .input('Rating', sql.NVarChar(30), rating)
          .input('RID', sql.Int, officer.regionId)
          .query(`
            INSERT INTO KpiResult (KpiDefID, UserID, PeriodStart, PeriodEnd, Frequency, ActualValue, TargetValue, AchievementPercent, WeightedScore, Rating, DataSource, RegionID)
            VALUES (@KpiDefID, @UserID, @PS, @PE, @Freq, @Actual, @Target, @Achievement, @WeightedScore, @Rating, 'Manual', @RID)
          `);
      }
    }
    console.log(`  Results for ${officer.name}: ${kpiCodes.length * periods.length} records`);
  }

  // Summary
  const planCount = await pool.request().query('SELECT COUNT(*) AS Cnt FROM [Plan]');
  const actCount = await pool.request().query('SELECT COUNT(*) AS Cnt FROM PlanActivity');
  const kpiCount = await pool.request().query('SELECT COUNT(*) AS Cnt FROM KpiDefinition')
  const resCount = await pool.request().query('SELECT COUNT(*) AS Cnt FROM KpiResult');

  console.log('\n═══════════════════════════════════════');
  console.log('Seed complete!');
  console.log(`  Plans:        ${planCount.recordset[0].Cnt}`);
  console.log(`  Activities:   ${actCount.recordset[0].Cnt}`);
  console.log(`  KPI Defs:     ${kpiCount.recordset[0].Cnt}`);
  console.log(`  KPI Results:  ${resCount.recordset[0].Cnt}`);
  console.log('═══════════════════════════════════════');

  await pool.close();
}

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
