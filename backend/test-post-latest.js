const sql = require('mssql');
const http = require('http');

async function main() {
  const pool = await sql.connect({
    server: '127.0.0.1', port: 50404, database: 'KG_MIS',
    user: 'kgmis_user', password: 'KgMis!2026Dev',
    options: { encrypt: false, trustServerCertificate: true }
  });

  // Get the latest version schema
  const result = await pool.request().query(
    "SELECT TOP 1 SchemaJSON FROM dbo.FormVersion WHERE TemplateID = 3074 ORDER BY VersionNumber DESC"
  );
  const latestSchema = JSON.parse(result.recordset[0].SchemaJSON);
  console.log('Latest schema element count:', latestSchema.elements.length);
  console.log('Latest schema pages:', latestSchema.pages?.length);
  console.log('Branding keys:', latestSchema.branding ? Object.keys(latestSchema.branding) : 'none');

  // Generate a token (same as backend)
  const jwt = require('jsonwebtoken');
  const token = jwt.sign({ userId: 1, role: 'Administrator' }, 'change-me-to-a-long-random-string', { expiresIn: '1h' });

  // Send the POST request
  const body = JSON.stringify({ schema: latestSchema });
  const options = {
    hostname: 'localhost', port: 4000,
    path: '/api/v1/forms/3074/versions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'Authorization': 'Bearer ' + token
    }
  };

  console.log('Sending request with', latestSchema.elements.length, 'elements, body size:', Buffer.byteLength(body), 'bytes');

  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      console.log('Status:', res.statusCode);
      console.log('Response:', data);
      pool.close();
    });
  });

  req.on('error', (e) => {
    console.error('Request error:', e.message);
    pool.close();
  });

  req.write(body);
  req.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
