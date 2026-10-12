/**
 * Historical backfill for Predictive Insights.
 *
 * Purpose: the demo/dev database only holds a few weeks of activity, which is
 * below the forecasting engine's insufficiency gate (8 observed periods). This
 * script inserts DETERMINISTIC historical rows so every module can exercise
 * real forecasts:
 *
 *   SalesRecord       24 months (monthly forecast)
 *   WeeklySales       104 weeks (weekly forecast)
 *   KpiResult         18 months of monthly KPI achievement
 *   CompetitorPrice   12 months of weekly observations
 *   Interview         12 months of approved interviews
 *   MarketVisitReport 12 months of approved visits
 *   FormResponse      12 months of submitted responses (one published form)
 *   MultimediaAsset   12 months of captured assets
 *
 * All values come from a seeded PRNG (mulberry32), so two runs produce
 * identical data. Idempotency: every seeded row carries a marker
 * (HIST- D365FOKey, Notes/DataSource/PhotoVideoRef/StorageURL/RespondentEmail
 * = 'seed-history...') that is deleted before re-inserting. Real rows are never
 * touched. Customer.CreatedAt is intentionally NOT rewritten -- the customers
 * module then honestly reports "insufficient data".
 *
 * Usage: npm run db:seed:history
 */
import sql from 'mssql';
import { dbConfig } from './dbconfig';

// ---------------------------------------------------------------------------
// Deterministic PRNG
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260930);
const rand = (min: number, max: number): number => min + rnd() * (max - min);
const randInt = (min: number, max: number): number => Math.floor(rand(min, max + 1));
const pick = <T>(arr: T[]): T => arr[randInt(0, arr.length - 1)];
const round2 = (v: number): number => Math.round(v * 100) / 100;

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);
const q = (s: string): string => `'${s.replace(/'/g, "''")}'`;
const daysInMonth = (y: number, m: number): number => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

const MARKER = 'seed-history';
const EMAIL_MARKER = 'seed-history@kgmis.local';

type Row = Record<string, string | number | null>;

/** SQL literal for a row value (numbers pass through, strings quoted, null -> NULL). */
function lit(v: string | number | null): string {
  if (v === null) return 'NULL';
  return typeof v === 'number' ? String(v) : q(v);
}

/**
 * Multi-row INSERT built from plain objects. Column names come from the keys
 * of the FIRST row (all rows are built with the same key set), so a typo in
 * one row can never silently shift values into the wrong column.
 */
async function insertRows(pool: sql.ConnectionPool, table: string, rows: Row[]): Promise<void> {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]);
  const CHUNK = 120;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const part = rows.slice(i, i + CHUNK);
    const values = part.map((r) => `(${columns.map((c) => lit(r[c])).join(', ')})`).join(',\n');
    await pool.request().batch(`INSERT INTO ${table} (${columns.join(', ')}) VALUES\n${values}`);
  }
}

interface RefData {
  products: Array<{ id: number; price: number; bg: number | null }>;
  customers: Array<{ id: number; region: number | null }>;
  outlets: Array<{ id: number; region: number }>;
  users: number[];
  regions: number[];
  businessGroups: number[];
  competitors: Array<{ id: number; name: string }>;
  kpis: Array<{ id: number; target: number; weight: number }>;
  form: { templateId: number; versionId: number } | null;
  existingKpiMonths: Set<string>;
}

async function loadRefs(pool: sql.ConnectionPool): Promise<RefData> {
  const products = (
    await pool.request().query(
      `SELECT TOP 20 ProductID AS id, ISNULL(UnitPrice, 150) AS price, BusinessGroupID AS bg
       FROM dbo.Product WHERE IsActive = 1 AND UnitPrice IS NOT NULL ORDER BY ProductID`
    )
  ).recordset as Array<{ id: number; price: number; bg: number | null }>;

  const customers = (
    await pool.request().query(`SELECT TOP 40 CustomerID AS id, RegionID AS region FROM dbo.Customer ORDER BY CustomerID`)
  ).recordset as Array<{ id: number; region: number | null }>;

  const outlets = (
    await pool.request().query(`SELECT OutletID AS id, RegionID AS region FROM dbo.Outlet WHERE IsActive = 1 ORDER BY OutletID`)
  ).recordset as Array<{ id: number; region: number }>;

  const users = (
    (await pool.request().query(`SELECT UserID AS id FROM dbo.[User] WHERE IsActive = 1 ORDER BY UserID`)).recordset as Array<{
      id: number;
    }>
  ).map((r) => r.id);

  const regions = (
    (await pool.request().query(`SELECT RegionID AS id FROM dbo.Region ORDER BY RegionID`)).recordset as Array<{ id: number }>
  ).map((r) => r.id);

  const businessGroups = (
    (await pool.request().query(`SELECT BusinessGroupID AS id FROM dbo.BusinessGroup ORDER BY BusinessGroupID`)).recordset as Array<{
      id: number;
    }>
  ).map((r) => r.id);

  const competitors = (
    await pool.request().query(`SELECT CompetitorID AS id, Name AS name FROM dbo.Competitor WHERE IsActive = 1 ORDER BY CompetitorID`)
  ).recordset as Array<{ id: number; name: string }>;

  const kpis = (
    await pool.request().query(
      `SELECT KpiDefID AS id, ISNULL(TargetValue, 100) AS target, ISNULL(Weight, 1) AS weight
       FROM dbo.KpiDefinition WHERE IsActive = 1 ORDER BY KpiDefID`
    )
  ).recordset as Array<{ id: number; target: number; weight: number }>;

  const formRow = (
    await pool.request().query(
      `SELECT TOP 1 t.TemplateID AS templateId, v.VersionID AS versionId
       FROM dbo.FormTemplate t
       JOIN dbo.FormVersion v ON v.TemplateID = t.TemplateID AND v.IsPublished = 1
       WHERE t.Status = 'Published'
       ORDER BY t.TemplateID`
    )
  ).recordset[0] as { templateId: number; versionId: number } | undefined;

  const kpiMonths = (
    await pool.request().query(
      `SELECT DISTINCT CONVERT(char(10), PeriodStart, 120) AS m FROM dbo.KpiResult WHERE DataSource <> ${q(MARKER)}`
    )
  ).recordset as Array<{ m: string }>;

  return {
    products,
    customers,
    outlets,
    users,
    regions,
    businessGroups,
    competitors,
    kpis,
    form: formRow ?? null,
    existingKpiMonths: new Set(kpiMonths.map((r) => r.m)),
  };
}

async function deleteSeeded(pool: sql.ConnectionPool): Promise<void> {
  const deletes = [
    `DELETE FROM dbo.SalesRecord WHERE D365FOKey LIKE 'HIST-%'`,
    `DELETE FROM dbo.WeeklySales WHERE Notes = ${q(MARKER)}`,
    `DELETE FROM dbo.KpiResult WHERE DataSource = ${q(MARKER)}`,
    `DELETE FROM dbo.CompetitorPrice WHERE PhotoVideoRef = ${q(MARKER)}`,
    `DELETE FROM dbo.Interview WHERE PhotoVideoRef = ${q(MARKER)}`,
    `DELETE FROM dbo.MarketVisitReport WHERE PhotoVideoRef = ${q(MARKER)}`,
    `DELETE FROM dbo.FormResponse WHERE RespondentEmail = ${q(EMAIL_MARKER)}`,
    `DELETE FROM dbo.MultimediaAsset WHERE StorageURL LIKE '/seed/history/%'`,
  ];
  for (const sqlText of deletes) await pool.request().batch(sqlText);
}

const monthStart = (y: number, m: number): string => `${y}-${String(m + 1).padStart(2, '0')}-01`;
const lastDay = (y: number, m: number): string => `${y}-${String(m + 1).padStart(2, '0')}-${String(daysInMonth(y, m)).padStart(2, '0')}`;
const pad2 = (n: number): string => String(n).padStart(2, '0');

function monthWindow(count: number): Array<{ y: number; m: number }> {
  const now = new Date();
  const out: Array<{ y: number; m: number }> = [];
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth();
  for (let i = 0; i < count; i++) {
    out.unshift({ y, m });
    m -= 1;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Row builders
// ---------------------------------------------------------------------------
function buildSales(ref: RefData): Row[] {
  const rows: Row[] = [];
  const months = monthWindow(24);
  months.forEach((mo, idx) => {
    // One deliberate spike month (idx months.length-4) so anomaly detection
    // has a real outlier to flag.
    const count = idx === months.length - 4 ? randInt(18, 22) : randInt(7, 13);
    const dim = daysInMonth(mo.y, mo.m);
    for (let i = 0; i < count; i++) {
      const product = pick(ref.products);
      const customer = pick(ref.customers);
      const region = customer.region ?? pick(ref.regions);
      const date = `${mo.y}-${pad2(mo.m + 1)}-${pad2(randInt(1, dim))}`;
      const qty = randInt(1, 30);
      const price = round2(product.price * rand(0.95, 1.08));
      rows.push({
        D365FOKey: `HIST-${mo.y}${pad2(mo.m + 1)}-${pad2(i)}-${product.id}`,
        ProductID: product.id,
        CustomerID: customer.id,
        SaleDate: date,
        Quantity: qty,
        Amount: round2(qty * price),
        RegionID: region,
      });
    }
  });
  return rows;
}

function buildWeeklySales(ref: RefData): Row[] {
  const rows: Row[] = [];
  if (ref.outlets.length === 0) return rows;
  // UQ_WeeklySales_Week_Product_Outlet: one row per week/product/outlet.
  const seen = new Set<string>();
  const now = new Date();
  // Back up to the most recent Sunday; the two existing rows (WeekEnding
  // 2026-09-14) land in the following bucket, so no gap is created.
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  end.setUTCDate(end.getUTCDate() - ((end.getUTCDay() + 1) % 7));
  for (let w = 103; w >= 0; w--) {
    const week = new Date(end.getTime() - w * 7 * 86_400_000);
    const weekEnding = isoDate(week);
    const rowsThisWeek = randInt(3, 5);
    for (let i = 0; i < rowsThisWeek; i++) {
      const outlet = pick(ref.outlets);
      const product = pick(ref.products);
      const key = `${weekEnding}|${product.id}|${outlet.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const qty = randInt(4, 70);
      const unit = round2(product.price * rand(0.9, 1.1));
      rows.push({
        WeekEnding: weekEnding,
        BusinessGroupID: product.bg ?? pick(ref.businessGroups),
        ProductID: product.id,
        RegionID: outlet.region,
        OutletID: outlet.id,
        CustomerID: rnd() < 0.4 ? pick(ref.customers).id : null,
        QuantitySold: qty,
        UnitPrice: unit,
        // Revenue is a computed column (QuantitySold * UnitPrice) - never set it.
        Notes: MARKER,
        SubmittedBy: pick(ref.users),
        Status: 'Submitted',
        CreatedAt: `${weekEnding}T08:00:00`,
        UpdatedAt: `${weekEnding}T08:00:00`,
      });
    }
  }
  return rows;
}

function buildKpis(ref: RefData): Row[] {
  const rows: Row[] = [];
  if (ref.kpis.length === 0) return rows;
  for (const mo of monthWindow(18)) {
    const key = monthStart(mo.y, mo.m);
    if (ref.existingKpiMonths.has(key)) continue; // never touch months that already have results
    for (const kpi of ref.kpis) {
      for (const userId of ref.users.slice(0, 2)) {
        const achievement = round2(rand(55, 115));
        rows.push({
          KpiDefID: kpi.id,
          UserID: userId,
          PeriodStart: key,
          PeriodEnd: lastDay(mo.y, mo.m),
          Frequency: 'Monthly',
          ActualValue: round2((kpi.target * achievement) / 100),
          TargetValue: kpi.target,
          AchievementPercent: achievement,
          WeightedScore: round2((achievement * kpi.weight) / 100),
          Rating: achievement >= 100 ? 'Excellent' : achievement >= 80 ? 'Good' : 'Average',
          DataSource: MARKER,
          RegionID: pick(ref.regions),
          CreatedAt: `${key}T00:00:00`,
          UpdatedAt: `${key}T00:00:00`,
        });
      }
    }
  }
  return rows;
}

function buildCompetitorPrices(ref: RefData): Row[] {
  const rows: Row[] = [];
  if (ref.competitors.length === 0 || ref.outlets.length === 0) return rows;
  const now = new Date();
  for (let w = 51; w >= 0; w--) {
    const day = new Date(now.getTime() - w * 7 * 86_400_000);
    const date = isoDate(day);
    for (let i = 0; i < 4; i++) {
      const product = pick(ref.products);
      const competitor = pick(ref.competitors);
      const outlet = pick(ref.outlets);
      rows.push({
        ProductID: product.id,
        CompetitorName: competitor.name,
        Price: round2(product.price * rand(0.85, 1.15)),
        RegionID: outlet.region,
        OutletID: outlet.id,
        RecordedBy: pick(ref.users),
        RecordedDate: date,
        ObservedAt: `${date}T09:00:00`,
        CreatedAt: `${date}T09:00:00`,
        CompetitorID: competitor.id,
        Availability: 'Available',
        IsActive: 1,
        PhotoVideoRef: MARKER,
      });
    }
  }
  return rows;
}

function buildInterviews(ref: RefData): Row[] {
  const rows: Row[] = [];
  const types = ['Customer', 'Distributor', 'Retailer'];
  const sentiments = ['Positive', 'Neutral', 'Negative'];
  const feedback = [
    'Delivery lead times improved but stock-outs remain common.',
    'Pricing is competitive; requested longer credit terms.',
    'Product quality praised; packaging needs reinforcement.',
    'Wants more point-of-sale material and demo units.',
    'Complaints about partial deliveries during peak season.',
    'Happy with the new outlet layout and staff service.',
  ];
  for (const mo of monthWindow(12)) {
    const dim = daysInMonth(mo.y, mo.m);
    for (let i = 0; i < randInt(3, 6); i++) {
      const date = `${mo.y}-${pad2(mo.m + 1)}-${pad2(randInt(1, dim))}`;
      const outlet = ref.outlets.length > 0 ? pick(ref.outlets) : null;
      rows.push({
        UserID: pick(ref.users),
        BusinessGroupID: pick(ref.businessGroups),
        RegionID: outlet ? outlet.region : pick(ref.regions),
        OutletID: outlet ? outlet.id : null,
        InterviewDate: date,
        RespondentType: pick(types),
        RespondentName: `Seed respondent ${randInt(1, 999)}`,
        SatisfactionScore: randInt(1, 5),
        Sentiment: pick(sentiments),
        KeyFeedback: pick(feedback),
        CreatedAt: `${date}T09:00:00`,
        Status: 'Approved',
        PhotoVideoRef: MARKER,
      });
    }
  }
  return rows;
}

function buildVisits(ref: RefData): Row[] {
  const rows: Row[] = [];
  const types = ['Market Visit', 'Routine', 'Promotion Check', 'Follow-up'];
  const findings = [
    'Competitor promotion observed in main high street.',
    'Shelf share stable; two new competitors entered the outlet.',
    'Restock completed, display compliance good.',
    'Price boards outdated - flagged for merchandising.',
    'Strong weekend traffic; recommended additional demo.',
  ];
  for (const mo of monthWindow(12)) {
    const dim = daysInMonth(mo.y, mo.m);
    for (let i = 0; i < randInt(4, 8); i++) {
      const date = `${mo.y}-${pad2(mo.m + 1)}-${pad2(randInt(1, dim))}`;
      const outlet = pick(ref.outlets);
      rows.push({
        UserID: pick(ref.users),
        OutletID: outlet.id,
        VisitDate: date,
        Notes: MARKER,
        Status: 'Approved',
        CreatedAt: `${date}T10:00:00`,
        UpdatedAt: `${date}T10:00:00`,
        PhotoVideoRef: MARKER,
        BusinessGroupID: pick(ref.businessGroups),
        VisitType: pick(types),
        StockLevelObserved: 'Adequate',
        KeyFindings: pick(findings),
        FollowUpRequired: 0,
      });
    }
  }
  return rows;
}

function buildResponses(ref: RefData): Row[] {
  const rows: Row[] = [];
  if (!ref.form) return rows;
  for (const mo of monthWindow(12)) {
    const dim = daysInMonth(mo.y, mo.m);
    for (let i = 0; i < randInt(3, 6); i++) {
      const date = `${mo.y}-${pad2(mo.m + 1)}-${pad2(randInt(1, dim))}`;
      const submitted = `${date}T${pad2(randInt(8, 17))}:${pad2(randInt(0, 59))}:00`;
      rows.push({
        TemplateID: ref.form.templateId,
        VersionID: ref.form.versionId,
        RespondentUserID: pick(ref.users),
        ConsentGiven: 1,
        Status: 'Submitted',
        IsErased: 0,
        SubmittedAt: submitted,
        EditCount: 0,
        CreatedAt: `${date}T00:00:00`,
        UpdatedAt: `${date}T00:00:00`,
        ConsentVersion: 1,
        RespondentEmail: EMAIL_MARKER,
      });
    }
  }
  return rows;
}

function buildMultimedia(ref: RefData): Row[] {
  const rows: Row[] = [];
  const modules = ['Interview', 'MarketVisit'];
  let seq = 0;
  for (const mo of monthWindow(12)) {
    const dim = daysInMonth(mo.y, mo.m);
    for (let i = 0; i < randInt(2, 5); i++) {
      seq += 1;
      const date = `${mo.y}-${pad2(mo.m + 1)}-${pad2(randInt(1, dim))}`;
      const outlet = pick(ref.outlets);
      const media = rnd() < 0.75 ? 'Photo' : 'Video';
      rows.push({
        CaptureDate: date,
        CapturedAt: `${date}T11:00:00`,
        CapturedBy: pick(ref.users),
        BusinessGroupID: pick(ref.businessGroups),
        RegionID: outlet.region,
        OutletID: outlet.id,
        RelatedModule: pick(modules),
        MediaType: media,
        StorageURL: `/seed/history/asset-${String(seq).padStart(4, '0')}.${media === 'Photo' ? 'jpg' : 'mp4'}`,
        OriginName: `seed-history-asset-${seq}`,
        SizeBytes: randInt(80_000, 4_500_000),
        MimeType: media === 'Photo' ? 'image/jpeg' : 'video/mp4',
        TranscriptionRequired: 0,
        ValidationStatus: 'Pending',
        Notes: MARKER,
        CreatedAt: `${date}T11:00:00`,
        UpdatedAt: `${date}T11:00:00`,
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const pool = await new sql.ConnectionPool(dbConfig() as sql.config).connect();
  console.log(`Connected to ${dbConfig().options.database}`);

  // Clear old seed rows FIRST so reference probes (e.g. which KPI months
  // already hold real results) never count our own previous inserts.
  await deleteSeeded(pool);
  console.log('Previous seed-history rows removed.');

  const ref = await loadRefs(pool);
  if (ref.products.length === 0 || ref.customers.length === 0 || ref.outlets.length === 0 || ref.users.length === 0) {
    throw new Error('Missing reference data (products/customers/outlets/users) - run npm run db:seed first.');
  }
  console.log(
    `Refs: products=${ref.products.length} customers=${ref.customers.length} outlets=${ref.outlets.length} users=${ref.users.length} kpis=${ref.kpis.length} form=${ref.form?.templateId ?? 'none'}`
  );

  const steps: Array<[string, Row[], string]> = [
    ['SalesRecord', buildSales(ref), '24 months'],
    ['WeeklySales', buildWeeklySales(ref), '104 weeks'],
    ['KpiResult', buildKpis(ref), '18 months (months with real data skipped)'],
    ['CompetitorPrice', buildCompetitorPrices(ref), '12 months'],
    ['Interview', buildInterviews(ref), '12 months'],
    ['MarketVisitReport', buildVisits(ref), '12 months'],
    ['FormResponse', buildResponses(ref), '12 months'],
    ['MultimediaAsset', buildMultimedia(ref), '12 months'],
  ];

  for (const [table, rows, note] of steps) {
    await insertRows(pool, `dbo.${table}`, rows);
    console.log(`${table}: ${rows.length} rows (${note})`);
  }

  if (ref.form) {
    await pool.request().input('TemplateId', sql.Int, ref.form.templateId).query(
      `UPDATE t SET ResponseCount = (SELECT COUNT(*) FROM dbo.FormResponse r WHERE r.TemplateID = t.TemplateID AND r.Status = 'Submitted' AND r.IsErased = 0)
       FROM dbo.FormTemplate t WHERE t.TemplateID = @TemplateId`
    );
  }

  await pool.close();
  console.log('History backfill complete.');
}

main().catch((err) => {
  console.error('History backfill failed:', err.message);
  process.exit(1);
});
