import sql from 'mssql';

const base: Partial<sql.config> = {
  server: '127.0.0.1',
  port: 50404,
  authentication: { type: 'default', options: { userName: 'kgmis_user', password: 'KgMis!2026Dev' } },
  options: { database: 'KG_MIS' },
  connectionTimeout: 30000,
  requestTimeout: 30000,
};

async function attempt(label: string, extra: Partial<sql.config>) {
  const t0 = Date.now();
  const pool = new sql.ConnectionPool({ ...base, ...extra } as sql.config);
  try {
    await pool.connect();
    const r = await pool.request().query('SELECT DB_NAME() AS db');
    console.log(`${label}: OK in ${Date.now() - t0}ms db=${r.recordset[0].db}`);
    await pool.close();
    return true;
  } catch (e: any) {
    console.log(`${label}: FAIL after ${Date.now() - t0}ms — ${e.message}`);
    try { await pool.close(); } catch {}
    return false;
  }
}

async function main() {
  await attempt('encrypt=false,trust=true', { options: { database: 'KG_MIS', encrypt: false, trustServerCertificate: true } } as any);
  await attempt('encrypt=true,trust=true', { options: { database: 'KG_MIS', encrypt: true, trustServerCertificate: true } } as any);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
