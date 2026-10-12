const http = require('http');
const fs = require('fs');
const jwt = require('jsonwebtoken');

async function main() {
  const schema = JSON.parse(fs.readFileSync('temp_schema.json', 'utf8'));
  console.log('Elements:', schema.elements.length);
  console.log('Pages:', schema.pages.length);
  
  const token = jwt.sign(
    { sub: 1, cuasId: 'woluman.urgesa@kerchanshe.net', name: 'Woluman Urgesa', email: 'woluman.urgesa@kerchanshe.net', role: 'Administrator', profilePhoto: null },
    'change-me-to-a-long-random-string',
    { expiresIn: '8h' }
  );
  
  const body = JSON.stringify({ schema });
  
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/forms/3074/versions',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Response:', data);
        resolve();
      });
    });
    req.on('error', (e) => { console.error('Request error:', e.message); reject(e); });
    req.write(body);
    req.end();
  });
}

main().then(() => process.exit(0)).catch(() => process.exit(1));
