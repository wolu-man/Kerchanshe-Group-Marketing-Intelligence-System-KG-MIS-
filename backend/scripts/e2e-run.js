/**
 * All-in-one: starts the server (DB + Express), runs e2e test, reports results.
 * Usage: node scripts/e2e-run.js
 */
const http = require('http');

const BASE = 'http://localhost:4000/api/v1';
const DEV_PASSWORD = process.env.DEV_PASSWORD || 'Password123!';

function req(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const fullPath = BASE + (path.startsWith('/') ? path : '/' + path);
    const url = new URL(fullPath);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const options = { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method, headers };
    const r = http.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, data: parsed });
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

let P = 0, F = 0;
function ok(l) { P++; console.log(`  ✓ ${l}`); }
function fail(l, d) { F++; console.error(`  ✗ ${l}${d ? ' — ' + d : ''}`); }
function assert(l, c, d) { if (c) ok(l); else fail(l, d); }

async function main() {
  console.log('=== Connecting to database ===');
  const { db } = require('../dist/db/pool');
  await db.connect();
  console.log('DB connected');

  // Clean up old notifications from previous e2e runs
  const sql = require('mssql');
  await db.request().query('DELETE FROM dbo.Notification');
  console.log('Cleaned old notifications');

  const { app } = require('../dist/app');
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(4000, () => {
      console.log('Server listening on 4000');
      resolve(s);
    });
    s.on('error', reject);
  });

  try {
    let adminToken, fieldToken, viewerToken, formId;

    // Step 0: Login
    console.log('\n== Step 0: Login ==');
    const admin = await req('POST', '/auth/login/local', undefined, { username: 'woluman.urgesa@kerchanshe.net', password: DEV_PASSWORD });
    assert('Admin login', admin.status === 200 && admin.data?.token, `status=${admin.status}`);
    adminToken = admin.data?.token;
    const field = await req('POST', '/auth/login/local', undefined, { username: 'shalama.girma@kerchanshegroup.com', password: DEV_PASSWORD });
    assert('Field Officer login', field.status === 200 && field.data?.token, `status=${field.status}`);
    fieldToken = field.data?.token;
    const viewer = await req('POST', '/auth/login/local', undefined, { username: 'mekdes.tilahun@kerchanshe.com', password: DEV_PASSWORD });
    assert('Viewer login', viewer.status === 200 && viewer.data?.token, `status=${viewer.status}`);
    viewerToken = viewer.data?.token;

    // Step 1: Seed config
    console.log('\n== Step 1: Seed NotificationConfig ==');
    const configs = [
      { triggerEvent: 'FORM_PUBLISHED', channel: 'Email', roleId: 1, enabled: true },
      { triggerEvent: 'FORM_PUBLISHED', channel: 'Email', roleId: 4, enabled: true },
      { triggerEvent: 'OWNERSHIP_TRANSFERRED', channel: 'Email', roleId: 4, enabled: true },
      { triggerEvent: 'SUBMISSION_CONFIRMED', channel: 'Email', roleId: 4, enabled: true },
      { triggerEvent: 'OWNERSHIP_TRANSFERRED', channel: 'Email', roleId: 1, enabled: true },
      { triggerEvent: 'FORM_INVITE', channel: 'Email', roleId: 4, enabled: true },
    ];
    for (const c of configs) {
      const r = await req('POST', '/notifications/config', adminToken, c);
      assert(`Config: ${c.triggerEvent}+R${c.roleId}`, r.status === 201 || r.status === 409, `status=${r.status}`);
    }

    // Step 2: Create form
    console.log('\n== Step 2: Create Marketing Survey Form ==');
    const cr = await req('POST', '/forms', adminToken, {
      title: 'Marketing Survey – Full Form',
      description: 'Full marketing survey for field data collection.',
    });
    assert('Form created', cr.status === 201 && cr.data?.templateId, `status=${cr.status}`);
    formId = cr.data?.templateId;
    console.log(`    Form ID: ${formId}`);

    // Step 3: Save schema
    console.log('\n== Step 3: Save Schema ==');
    const sr = await req('POST', `/forms/${formId}/versions`, adminToken, {
      schema: {
        schemaVersion: 2,
        pages: [{ id: 'p1', title: 'General' }, { id: 'p2', title: 'Feedback' }],
        elements: [
          { key: 'outlet_name', type: 'shorttext', label: 'Outlet Name', pageId: 'p1', order: 0, required: true },
          { key: 'region', type: 'dropdown', label: 'Region', pageId: 'p1', order: 1, options: ['Addis Ababa', 'Oromia', 'Amhara', 'SNNPR'] },
          { key: 'product_availability', type: 'rating', label: 'Product Availability', pageId: 'p1', order: 2 },
          { key: 'competitor_presence', type: 'shorttext', label: 'Competitor Products', pageId: 'p2', order: 3 },
          { key: 'overall_satisfaction', type: 'rating', label: 'Overall Satisfaction', pageId: 'p2', order: 4 },
          { key: 'comments', type: 'longtext', label: 'Comments', pageId: 'p2', order: 5 },
        ],
      },
    });
    assert('Schema saved', sr.status === 201, `status=${sr.status}`);

    // Step 4: Configure access
    console.log('\n== Step 4: Configure Invite Access ==');
    const ar = await req('PUT', `/forms/${formId}/access`, adminToken, { mode: 'Invite', config: {} });
    assert('Access mode set', ar.status === 200, `status=${ar.status}`);
    const ir = await req('POST', `/forms/${formId}/invites`, adminToken, { email: 'shalama.girma@kerchanshegroup.com' });
    assert('Invite added', ir.status === 201, `status=${ir.status}`);

    // Step 5: Publish
    console.log('\n== Step 5: Publish Form ==');
    const pr = await req('POST', `/forms/${formId}/publish`, adminToken);
    assert('Form published', pr.status === 200, `status=${pr.status}`);
    console.log('    Waiting 3s for async delivery...');
    await new Promise(r => setTimeout(r, 3000));

    // Step 6: Transfer ownership
    console.log('\n== Step 6: Transfer Ownership ==');
    const otr = await req('POST', `/forms/${formId}/ownership`, adminToken, { newOwnerUserId: 5 });
    assert('Ownership transferred', otr.status === 200, `status=${otr.status}`);
    console.log('    Waiting 3s for async delivery...');
    await new Promise(r => setTimeout(r, 3000));

    // Step 7: Verify admin notifications
    console.log('\n== Step 7: Verify Admin Notifications ==');
    const au = await req('GET', '/notifications/unread-count', adminToken);
    assert('Admin unread > 0', au.status === 200 && au.data?.count > 0, `count=${au.data?.count}`);
    const am = await req('GET', '/notifications/mine', adminToken);
    assert('Admin has notifications', am.status === 200 && am.data?.items?.length > 0, `total=${am.data?.total}`);
    const fp = am.data?.items?.find(n => n.TriggerEvent === 'FORM_PUBLISHED');
    if (fp) {
      ok('FORM_PUBLISHED found');
      const fd = await req('GET', `/notifications/${fp.NotificationID}`, adminToken);
      assert('GET /:id detail', fd.status === 200 && fd.data?.Body);
      const fmr = await req('PATCH', `/notifications/${fp.NotificationID}/read`, adminToken);
      assert('Mark as read', fmr.status === 200 && fmr.data?.ok === true);
    } else fail('FORM_PUBLISHED not found');

    // Step 8: Verify field officer notifications
    console.log('\n== Step 8: Verify Field Officer Notifications ==');
    const fu = await req('GET', '/notifications/unread-count', fieldToken);
    assert('Field unread > 0', fu.status === 200 && fu.data?.count > 0, `count=${fu.data?.count}`);
    const fm = await req('GET', '/notifications/mine', fieldToken);
    assert('Field has notifications', fm.status === 200 && fm.data?.items?.length > 0, `total=${fm.data?.total}`);
    const ot = fm.data?.items?.find(n => n.TriggerEvent === 'OWNERSHIP_TRANSFERRED');
    assert('OWNERSHIP_TRANSFERRED found', !!ot);
    const fi = fm.data?.items?.find(n => n.TriggerEvent === 'FORM_INVITE');
    assert('FORM_INVITE found for invited user', !!fi);
    const mar = await req('PATCH', '/notifications/read-all', fieldToken);
    assert('Mark all read', mar.status === 200 && mar.data?.ok === true);
    const fu2 = await req('GET', '/notifications/unread-count', fieldToken);
    assert('Unread now 0', fu2.status === 200 && fu2.data?.count === 0);

    // Step 9: Submit response
    console.log('\n== Step 9: Submit Response as Field Officer ==');
    const sub = await req('POST', `/forms/${formId}/responses`, fieldToken, {
      answers: {
        outlet_name: 'Test Outlet Addis',
        region: 'Addis Ababa',
        product_availability: 4,
        competitor_presence: 'Camel, ITAI',
        overall_satisfaction: 5,
        comments: 'E2E test submission.',
      },
    });
    assert('Response submitted', sub.status === 201, `status=${sub.status}`);
    console.log('    Waiting 3s for async delivery...');
    await new Promise(r => setTimeout(r, 3000));
    const fu3 = await req('GET', '/notifications/unread-count', fieldToken);
    assert('New unread after response', fu3.status === 200 && fu3.data?.count > 0, `count=${fu3.data?.count}`);
    const fm2 = await req('GET', '/notifications/mine', fieldToken);
    const sc = fm2.data?.items?.find(n => n.TriggerEvent === 'SUBMISSION_CONFIRMED');
    assert('SUBMISSION_CONFIRMED found', !!sc);

    // Step 10: Unauthorized access
    console.log('\n== Step 10: Unauthorized Access Tests ==');
    if (sc) {
      const tid = sc.NotificationID;
      const vd = await req('GET', `/notifications/${tid}`, viewerToken);
      assert('Viewer cant read field notification', vd.status === 404);
      const vm = await req('PATCH', `/notifications/${tid}/read`, viewerToken);
      assert('Viewer cant mark field notification', vm.status === 404);
    }
    const vu = await req('GET', '/notifications/unread-count', viewerToken);
    assert('Viewer 0 unread', vu.status === 200 && vu.data?.count === 0);
    const vn = await req('GET', '/notifications/mine', viewerToken);
    assert('Viewer no notifications', vn.status === 200 && vn.data?.items?.length === 0);
    const al = await req('GET', '/notifications', viewerToken);
    assert('Viewer blocked from admin (403)', al.status === 403);
    const ua = await req('GET', '/notifications/unread-count');
    assert('Unauth blocked (401)', ua.status === 401);
    const bi = await req('GET', '/notifications/abc', fieldToken);
    assert('Invalid ID 400', bi.status === 400);
    const ne = await req('GET', '/notifications/999999', fieldToken);
    assert('Non-existent 404', ne.status === 404);
    const mn = await req('PATCH', '/notifications/999999/read', fieldToken);
    assert('Mark non-existent 404', mn.status === 404);

    // Step 11: Email delivery
    console.log('\n== Step 11: Verify Email Delivery ==');
    const allA = await req('GET', '/notifications/mine?page=1&pageSize=100', adminToken);
    const as = (allA.data?.items || []).filter(n => n.Status === 'Sent');
    const af = (allA.data?.items || []).filter(n => n.Status === 'Failed');
    console.log(`    Admin: sent=${as.length}, failed=${af.length}`);
    assert('Admin has notification records', allA.data?.items?.length > 0);
    const allF = await req('GET', '/notifications/mine?page=1&pageSize=100', fieldToken);
    const fs = (allF.data?.items || []).filter(n => n.Status === 'Sent');
    const ff = (allF.data?.items || []).filter(n => n.Status === 'Failed');
    console.log(`    Field: sent=${fs.length}, failed=${ff.length}`);
    assert('Field has notification records', allF.data?.items?.length > 0);

  } catch (err) {
    console.error('FATAL:', err.message);
    F++;
  }

  console.log(`\n=== Results ===`);
  console.log(`Passed: ${P}`);
  console.log(`Failed: ${F}`);
  console.log(`Total:  ${P + F}`);

  server.close();
  await db.close();
  process.exit(F > 0 ? 1 : 0);
}

main().catch(err => { console.error('STARTUP FAILED:', err.message); process.exit(1); });
