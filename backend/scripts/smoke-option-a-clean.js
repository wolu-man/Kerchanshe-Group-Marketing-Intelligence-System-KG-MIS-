/* Clean sequential Option A verification — no concurrent form-2051 writers. */
const BASE = 'http://localhost:4000/api/v1';

async function login() {
  const res = await fetch(`${BASE}/auth/login/local`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'woluman.urgesa@kerchanshe.net', password: 'Password123!' }),
  });
  if (!res.ok) throw new Error(`login ${res.status}: ${await res.text()}`);
  return (await res.json()).token;
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

  // ---- Published form 2051 ----
  const latest0 = await api(token, 'GET', '/forms/2051/versions/latest');
  const env = JSON.parse(latest0.body.SchemaJSON);
  env.branding = { ...(env.branding || {}), fontFamily: 'Inter' };

  const save = await api(token, 'POST', '/forms/2051/versions', { schema: env });
  if (!save.ok) { console.log('FAIL save', save.status, JSON.stringify(save.body)); process.exit(1); }
  const savedId = save.body.versionId;
  console.log('saved versionId', savedId);

  // Immediately re-read latest + published — must match the saved id
  const latest1 = await api(token, 'GET', '/forms/2051/versions/latest');
  const pub1 = await api(token, 'GET', '/forms/2051/versions/published');
  const ps1 = await api(token, 'GET', '/forms/2051/publish-state');

  console.log('latest', latest1.body.VersionID, 'v' + latest1.body.VersionNumber, 'IsPublished', latest1.body.IsPublished);
  console.log('published', pub1.body.VersionID, 'v' + pub1.body.VersionNumber);
  console.log('publish-state', JSON.stringify(ps1.body));

  const checks = {
    savedIsLatest: latest1.body.VersionID === savedId,
    publishedIsSaved: pub1.body.VersionID === savedId,
    latestIsPublished: latest1.body.IsPublished === true,
    noUnpublishedChanges: ps1.body.hasUnpublishedChanges === false,
    versionsEqual: ps1.body.latestVersion === ps1.body.publishedVersion,
  };
  console.log('checks', JSON.stringify(checks));

  // Public endpoint should serve the same version
  const publicPub = await api(token, 'GET', '/forms/2051/public/versions/published');
  console.log('public published', publicPub.status, publicPub.body?.VersionID, 'v' + publicPub.body?.VersionNumber);
  checks.publicMatches = publicPub.body?.VersionID === savedId;

  // ---- Draft form: save must NOT promote ----
  const create = await api(token, 'POST', '/forms', { title: `OptionAClean ${Date.now()}` });
  const draftId = create.body.templateId;
  console.log('draft id', draftId);

  const dLatest = await api(token, 'GET', `/forms/${draftId}/versions/latest`);
  const dEnv = JSON.parse(dLatest.body.SchemaJSON);
  dEnv.elements = [{ key: 'opta-d1', type: 'shorttext', label: 'Draft only', order: 0, pageId: 'page-1' }];
  const dSave = await api(token, 'POST', `/forms/${draftId}/versions`, { schema: dEnv });
  console.log('draft save', dSave.status, dSave.body?.versionId);

  const dPs = await api(token, 'GET', `/forms/${draftId}/publish-state`);
  const dPub = await api(token, 'GET', `/forms/${draftId}/versions/published`);
  console.log('draft ps', JSON.stringify(dPs.body), 'published_ep', dPub.status);
  checks.draftNotPromoted =
    dPs.body.status === 'Draft' &&
    dPs.body.hasUnpublishedChanges === false &&
    dPub.status === 404;

  // Publish draft → first publish promotes latest
  const dPubPost = await api(token, 'POST', `/forms/${draftId}/publish`);
  console.log('draft publish', dPubPost.status, JSON.stringify(dPubPost.body));
  const dPs2 = await api(token, 'GET', `/forms/${draftId}/publish-state`);
  console.log('after first publish', JSON.stringify(dPs2.body));
  checks.firstPublishWorks = dPubPost.ok && dPs2.body.status === 'Published' && dPs2.body.hasUnpublishedChanges === false;

  // Save again on now-published draft → auto-promote
  const dLatest2 = await api(token, 'GET', `/forms/${draftId}/versions/latest`);
  const dEnv2 = JSON.parse(dLatest2.body.SchemaJSON);
  dEnv2.elements = [...(dEnv2.elements || []), { key: 'opta-d2', type: 'shorttext', label: 'Live after save', order: 1, pageId: 'page-1' }];
  const dSave2 = await api(token, 'POST', `/forms/${draftId}/versions`, { schema: dEnv2 });
  const dPs3 = await api(token, 'GET', `/forms/${draftId}/publish-state`);
  const dPub2 = await api(token, 'GET', `/forms/${draftId}/versions/published`);
  console.log('auto save', dSave2.status, 'ps', JSON.stringify(dPs3.body), 'pub id', dPub2.body?.VersionID, 'saved', dSave2.body?.versionId);
  checks.autoPromote =
    dSave2.ok &&
    dPs3.body.status === 'Published' &&
    dPs3.body.hasUnpublishedChanges === false &&
    dPub2.body?.VersionID === dSave2.body?.versionId;

  const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  console.log(failed.length ? `RESULT FAIL: ${failed.join(',')}` : 'RESULT PASS — all checks');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error('SMOKE_ERR', e);
  process.exit(1);
});
