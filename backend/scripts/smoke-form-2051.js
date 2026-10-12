/* Smoke test: race-safe saveVersion + publish-state + republish for form 2051 */
const BASE = 'http://localhost:4000/api/v1';

async function login() {
  const res = await fetch(`${BASE}/auth/login/local`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'woluman.urgesa@kerchanshe.net', password: 'Password123!' }),
  });
  if (!res.ok) throw new Error(`login ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.token;
}

async function api(token, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, ok: res.ok, body: json };
}

(async () => {
  const token = await login();
  console.log('login ok');

  const ps1 = await api(token, 'GET', '/forms/2051/publish-state');
  console.log('publish-state-before', ps1.status, JSON.stringify(ps1.body));

  const latest = await api(token, 'GET', '/forms/2051/versions/latest');
  console.log('latest', latest.status, latest.body?.VersionID, latest.body?.VersionNumber, latest.body?.IsPublished);
  const envelope = JSON.parse(latest.body.SchemaJSON);
  envelope.branding = { ...(envelope.branding || {}), primaryColor: '#0047ab' };

  const save1 = await api(token, 'POST', '/forms/2051/versions', { schema: envelope });
  console.log('save1', save1.status, JSON.stringify(save1.body));

  // Concurrent saves to exercise the race
  const concurrent = await Promise.all(
    Array.from({ length: 5 }, (_, i) => {
      const e = { ...envelope, branding: { ...envelope.branding, secondaryColor: `#1111${i}${i}` } };
      return api(token, 'POST', '/forms/2051/versions', { schema: e });
    })
  );
  const codes = concurrent.map((r) => r.status);
  const failures = concurrent.filter((r) => !r.ok).map((r) => `${r.status}:${JSON.stringify(r.body)}`);
  console.log('concurrent_codes', codes.join(','));
  if (failures.length) console.log('concurrent_failures', failures.join(' | '));

  const ps2 = await api(token, 'GET', '/forms/2051/publish-state');
  console.log('publish-state-after-saves', ps2.status, JSON.stringify(ps2.body));

  const pub = await api(token, 'POST', '/forms/2051/publish');
  console.log('publish', pub.status, JSON.stringify(pub.body));

  const ps3 = await api(token, 'GET', '/forms/2051/publish-state');
  console.log('publish-state-final', ps3.status, JSON.stringify(ps3.body));

  const vers = await api(token, 'GET', '/forms/2051/versions');
  const published = (vers.body?.items || []).filter((v) => v.IsPublished);
  console.log(
    'versions',
    'total', vers.body?.items?.length,
    'published_count', published.length,
    'published_nums', published.map((v) => v.VersionNumber).join(',')
  );

  const pubv = await api(token, 'GET', '/forms/2051/versions/published');
  console.log('published-endpoint', pubv.status, pubv.body?.VersionID, pubv.body?.VersionNumber);

  // Final concurrent race after publish (should still not 500)
  const post = await Promise.all(
    Array.from({ length: 8 }, () => api(token, 'POST', '/forms/2051/versions', { schema: envelope }))
  );
  const postCodes = post.map((r) => r.status);
  const postFails = post.filter((r) => !r.ok).map((r) => `${r.status}:${JSON.stringify(r.body)}`);
  console.log('post_publish_concurrent', postCodes.join(','));
  if (postFails.length) console.log('post_publish_failures', postFails.join(' | '));

  const any500 = [...concurrent, ...post, save1, pub].some((r) => r.status === 500);
  console.log(any500 ? 'RESULT FAIL (500 present)' : 'RESULT PASS (no 500s)');
})().catch((e) => {
  console.error('SMOKE_ERR', e);
  process.exit(1);
});
