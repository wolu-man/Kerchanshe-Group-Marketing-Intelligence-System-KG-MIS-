const http = require('http');
const jwt = require('jsonwebtoken');
const fs = require('fs');

// Load env
const envContent = fs.readFileSync('C:\\2026 Projects\\MIS\\backend\\.env', 'utf8');
const env = {};
for (const line of envContent.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq < 1) continue;
  env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
}
const JWT_SECRET = env.JWT_SECRET;

function login() {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ username: 'woluman.urgesa@kerchanshe.net', password: 'Admin@123' });
    const req = http.request({
      hostname: 'localhost', port: 4000, path: '/api/v1/auth/login/local', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode !== 200) { console.error('Login failed:', res.statusCode, data); process.exit(1); }
        resolve(JSON.parse(data));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function postVersion(token, schema) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ schema });
    const req = http.request({
      hostname: 'localhost', port: 4000, path: '/api/v1/forms/3074/versions', method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
        'Authorization': 'Bearer ' + token
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { resolve({ status: res.statusCode, body: data }); });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  // 1. Login to get a real token
  const loginRes = await login();
  const token = loginRes.token;
  console.log('Got token:', token.substring(0, 30) + '...');
  console.log('Decoded:', jwt.decode(token));

  // 2. Test with empty elements
  console.log('\n--- Test 1: empty elements ---');
  const r1 = await postVersion(token, { schemaVersion: 2, pages: [{ id: 'p1', title: 'Page 1' }], elements: [], branding: undefined });
  console.log('Status:', r1.status, 'Body:', r1.body);

  // 3. Test with a single element
  console.log('\n--- Test 2: single element ---');
  const r2 = await postVersion(token, { schemaVersion: 2, pages: [{ id: 'p1', title: 'Page 1' }], elements: [{ key: 'test1', type: 'shorttext', label: 'Test', order: 0 }], branding: undefined });
  console.log('Status:', r2.status, 'Body:', r2.body);

  // 4. Fetch the latest schema for form 3074 and send it back
  const sql = require('mssql');
  const pool = await sql.connect({
    server: '127.0.0.1', port: 50404, database: 'KG_MIS',
    user: 'kgmis_user', password: 'KgMis!2026Dev',
    options: { encrypt: false, trustServerCertificate: true }
  });
  const result = await pool.request().query(
    "SELECT TOP 1 SchemaJSON FROM dbo.FormVersion WHERE TemplateID = 3074 ORDER BY VersionNumber DESC"
  );
  const latestSchema = JSON.parse(result.recordset[0].SchemaJSON);
  
  console.log('\n--- Test 3: real 22-element schema ---');
  const r3 = await postVersion(token, latestSchema);
  console.log('Status:', r3.status, 'Body:', r3.body);
  
  // 5. Test with what the frontend sends (envelope wrapped in {schema:})
  console.log('\n--- Test 4: wrapped envelope ---');
  const r4 = await postVersion(token, { schemaVersion: latestSchema.schemaVersion, pages: latestSchema.pages, elements: latestSchema.elements, branding: latestSchema.branding });
  console.log('Status:', r4.status, 'Body:', r4.body);

  await pool.close();
}

main().catch(e => { console.error(e); process.exit(1); });
