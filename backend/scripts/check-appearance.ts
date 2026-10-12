import sql from 'mssql';
import 'dotenv/config';

async function main() {
  const pool = await sql.connect({
    server: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME!,
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    options: { encrypt: false, trustServerCertificate: true },
  });

  const r = await pool.request().query(`
    SELECT TOP 5 v.TemplateID, v.VersionNumber, v.IsPublished, v.SchemaJSON
    FROM dbo.FormVersion v
    WHERE v.SchemaJSON LIKE '%appearanceConfig%'
    ORDER BY v.VersionID DESC
  `);
  for (const row of r.recordset as any[]) {
    const parsed = JSON.parse(row.SchemaJSON);
    console.log('==== Form', row.TemplateID, 'v' + row.VersionNumber, 'published=', row.IsPublished);
    console.log(JSON.stringify(parsed.branding, null, 2));
  }

  // Latest branding for each recent form
  const latest = await pool.request().query(`
    SELECT t.TemplateID, t.Title, v.VersionNumber, v.IsPublished, v.SchemaJSON
    FROM dbo.FormTemplate t
    OUTER APPLY (
      SELECT TOP 1 VersionNumber, IsPublished, SchemaJSON
      FROM dbo.FormVersion v WHERE v.TemplateID = t.TemplateID
      ORDER BY VersionNumber DESC
    ) v
    WHERE t.TemplateID IN (4, 3076, 3077)
  `);
  for (const row of latest.recordset as any[]) {
    const parsed = row.SchemaJSON ? JSON.parse(row.SchemaJSON) : null;
    console.log('LATEST Form', row.TemplateID, row.Title, 'v' + row.VersionNumber, 'pub=', row.IsPublished,
      'brandingKeys=', Object.keys(parsed?.branding ?? {}),
      'hasAppearance=', !!parsed?.branding?.appearanceConfig);
  }

  await pool.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
