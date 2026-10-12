(async () => {
  const base = 'http://localhost:4000/api/v1';
  
  async function req(method, url, body, token) {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, json, text };
  }

  const loginFO = await req('POST', '/auth/login/local', { username: 'field1', password: 'Password123!' });
  const tokenFO = loginFO.json?.token;

  const outlets = await req('GET', '/reference/outlets', null, tokenFO);
  const outletId = outlets.json?.items?.[0]?.OutletId ?? outlets.json?.items?.[0]?.OutletID;
  console.log('Outlet ID:', outletId);

  const products = await req('GET', '/reference/products?businessGroupId=5', null, 'Bearer ' + tokenFO); // BPL
  const productId = products.json?.items?.[0]?.ProductID;
  console.log('Product ID:', productId);

  const ws = await req('POST', '/weekly-sales', {
    weekEnding: '2026-08-30', businessGroupId: 5, productId, regionId: 1, outletId,
    quantitySold: 100, unitPrice: 50, notes: 'Smoke test'
  }, tokenFO);
  console.log('Weekly Sales:', ws.status, ws.text);

  process.exit(0);
})().catch(e => { console.error('ERROR:', e); process.exit(1); });