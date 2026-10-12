/* Smoke: Option A — save on Published form auto-promotes; Draft does not. */
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

  // --- Published form 2051: save should auto-promote ---
  const ps0 = await api(token, 'GET', '/forms/2051/publish-state');
  console.log('ps0', JSON.stringify(ps0.body));

  const latest0 = await api(token, 'GET', '/forms/2051/versions/latest');
  const env = JSON.parse(latest0.body.SchemaJSON);
  env.branding = { ...(env.branding || {}), secondaryColor: '#00843d' };

  const save = await api(token, 'POST', '/forms/2051/versions', { schema: env });
  console.log('save', save.status, JSON.stringify(save.body));

  const ps1 = await api(token, 'GET', '/forms/2051/publish-state');
  console.log('ps1', JSON.stringify(ps1.body));

  const pubv = await api(token, 'GET', '/forms/2051/versions/published');
  const latest1 = await api(token, 'GET', '/forms/2051/versions/latest');
  console.log('published', pubv.status, 'num', pubv.body?.VersionNumber, 'id', pubv.body?.VersionID);
  console.log('latest   ', latest1.status, 'num', latest1.body?.VersionNumber, 'id', latest1.body?.VersionID);

  const promoted = pubv.body?.VersionID === latest1.body?.VersionID && pubv.body?.VersionNumber === latest1.body?.VersionNumber;
  const noUnpublished = ps1.body?.hasUnpublishedChanges === false;
  console.log('promoted_match', promoted, 'noUnpublishedChanges', noUnpublished);

  // public endpoint should return same schema marker
  const pubSchema = await api(token, 'GET', '/forms/2051/public/versions/published');
  console.log('public_published', pubSchema.status, 'num', pubSchema.body?.VersionNumber);

  // --- Draft form: create one, save should NOT promote ---
  const create = await api(token, 'POST', '/forms', { title: `OptionA Draft ${Date.now()}` });
  console.log('create draft', create.status, JSON.stringify(create.body));
  const draftId = create.body?.templateId;

  if (draftId) {
    const dLatest = await api(token, 'GET', `/forms/${draftId}/versions/latest`);
    const dEnv = JSON.parse(dLatest.body.SchemaJSON);
    if (!dEnv.elements) dEnv.elements = [];
    dEnv.elements = [...(dEnv.elements || []), {
      key: 'opta-1', type: 'shorttext', label: 'Draft field', order: 0, pageId: 'page-1',
    }];
    const dSave = await api(token, 'POST', `/forms/${draftId}/versions`, { schema: dEnv });
    console.log('draft save', dSave.status, JSON.stringify(dSave.body));
    const dPs = await api(token, 'GET', `/forms/${draftId}/publish-state`);
    console.log('draft ps', JSON.stringify(dPs.body));
    const dPub = await api(token, 'GET', `/forms/${draftId}/versions/published`);
    console.log('draft published endpoint', dPub.status, JSON.stringify(dPub.body));
    const draftOk = dPs.body?.status === 'Draft' && dPs.body?.hasUnpublishedChanges === false && dPub.status === 404;
    console.log('draft_not_promoted', draftOk);

    // publish draft → should become Published with that version live
    const dPubPost = await api(token, 'POST', `/forms/${draftId}/publish`);
    console.log('draft publish', dPubPost.status, JSON.stringify(dPubPost.body));
    const dPs2 = await api(token, 'GET', `/forms/${draftId}/publish-state`);
    console.log('draft ps after publish', JSON.stringify(dPs2.body));

    // save again on now-published draft → should auto-promote
    const dLatest2 = await api(token, 'GET', `/forms/${draftId}/versions/latest`);
    const dEnv2 = JSON.parse(dLatest2.body.SchemaJSON);
    dEnv2.elements = [...(dEnv2.elements || []), {
      key: 'opta-2', type: 'shorttext', label: 'Live field', order: 1, pageId: 'page-1',
    }];
    const dSave2 = await api(token, 'POST', `/forms/${draftId}/versions`, { schema: dEnv2 });
    console.log('republish save', dSave2.status);
    const dPs3 = await api(token, 'GET', `/forms/${draftId}/publish-state`);
    console.log('after auto-promote', JSON.stringify(dPs3.body));
    const autoOk = dPs3.body?.status === 'Published' && dPs3.body?.hasUnpublishedChanges === false;
    console.log('auto_promote_ok', autoOk);
  }

  // cleanup draft form
  if (draftId) {
    // only draft forms can be deleted — if we published it, archive first? deleteForm requires Draft.
    // leave it; or try delete if still draft.
  }

  const pass = promoted && noUnpublished && ps1.body?.status === 'Published';
  console.log(pass ? 'RESULT PASS' : 'RESULT FAIL');
  if (!pass) process.exit(1);
})().catch((e) => {
  console.error('SMOKE_ERR', e);
  process.exit(1);
});
