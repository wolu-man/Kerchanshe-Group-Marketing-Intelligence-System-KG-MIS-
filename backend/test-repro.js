const sql = require('mssql');
const http = require('http');
const jwt = require('jsonwebtoken');

async function main() {
  const pool = await sql.connect({
    server: '127.0.0.1',
    port: 50404,
    database: 'KG_MIS',
    user: 'kgmis_user',
    password: 'KgMis!2026Dev',
    options: { encrypt: false, trustServerCertificate: true }
  });
  
  // Get the real form schema (version 180 = VersionID 3326)
  const result = await pool.request().query('SELECT SchemaJSON FROM dbo.FormVersion WHERE VersionID = 3326');
  const schema = JSON.parse(result.recordset[0].SchemaJSON);
  console.log('Schema elements:', schema.elements.length);
  console.log('Schema keys:', schema.elements.map(e => e.key));
  
  const token = jwt.sign(
    { sub: 1, cuasId: 'woluman.urgesa@kerchanshe.net', name: 'Woluman Urgesa', email: 'woluman.urgesa@kerchanshe.net', role: 'Administrator', profilePhoto: null },
    'change-me-to-a-long-random-string',
    { expiresIn: '8h' }
  );
  
  const body = JSON.stringify({ schema });
  
  const options = {
    hostname: 'localhost',
    port: 4000,
    path: '/api/v1/forms/3074/versions',
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  };
  
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Response:', data);
        pool.close().then(() => resolve());
      });
    });
    req.on('error', (e) => { console.error('Request error:', e); pool.close().then(() => reject(e)); });
    req.write(body);
    req.end();
  });
}

main().catch(e => { console.error(e); process.exit(1); });
