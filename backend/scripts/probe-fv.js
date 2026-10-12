require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") });
const sql = require("mssql");
const { dbConfig } = require("./dbconfig");
(async () => {
  const pool = await new sql.ConnectionPool(dbConfig()).connect();
  try {
    const vers = await pool.request().query(`
      SELECT VersionID, VersionNumber, IsPublished, PublishedAt, CreatedAt, LEN(SchemaJSON) AS schemaLen
      FROM dbo.FormVersion WHERE TemplateID = 2051 ORDER BY VersionNumber`);
    console.log("VERSIONS", JSON.stringify(vers.recordset, null, 2));
    const tpl = await pool.request().query(`
      SELECT TemplateID, Status, AccessMode, OwnerUserID, Title
      FROM dbo.FormTemplate WHERE TemplateID = 2051`);
    console.log("TEMPLATE", JSON.stringify(tpl.recordset, null, 2));
    const idx = await pool.request().query(`
      SELECT i.name AS index_name, i.is_unique, c.name AS column_name
      FROM sys.indexes i
      JOIN sys.index_columns ic ON i.object_id=ic.object_id AND i.index_id=ic.index_id
      JOIN sys.columns c ON ic.object_id=c.object_id AND ic.column_id=c.column_id
      WHERE i.object_id=OBJECT_ID('dbo.FormVersion')
      ORDER BY i.index_id, ic.key_ordinal`);
    console.log("INDEXES", JSON.stringify(idx.recordset, null, 2));
  } finally { await pool.close(); }
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
