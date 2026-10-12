/**
 * End-to-end test for the Notification Center (Phase 2 completion).
 *
 * Tests:
 *  1. Seed required NotificationConfig entries
 *  2. Admin creates "Marketing Survey – Full Form"
 *  3. Admin configures Invite access for wolumaan@gmail.com
 *  4. Admin publishes the form → FORM_PUBLISHED email to admin
 *  5. Admin transfers ownership to wolumaan → OWNERSHIP_TRANSFERRED email
 *  6. Login as wolumaan → verify in-app notifications, unread count, mark-as-read
 *  7. wolumaan submits a response → SUBMISSION_CONFIRMED email
 *  8. Unauthorized access tests (other user cannot see wolumaan's notifications)
 *
 * Usage:  npx tsx scripts/test-e2e-notification-center.ts
 */
import http from 'http';

const BASE = process.env.API_URL || 'http://localhost:4000/api/v1';
const DEV_PASSWORD = process.env.DEV_PASSWORD || 'Password123!';
const FIELD_EMAIL = 'wolumaan@gmail.com';

// ---------------------------------------------------------------------------
// Minimal HTTP helper
// ---------------------------------------------------------------------------
function request(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const baseUrl = BASE.endsWith('/') ? BASE : BASE;
    const fullPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${baseUrl}${fullPath}`);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers,
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed: any;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode ?? 0, data: parsed });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Test state
// ---------------------------------------------------------------------------
let adminToken = '';
let fieldToken = '';
let viewerToken = '';
let formId = 0;
let adminNotifId = 0;
let fieldNotifIds: number[] = [];
let passed = 0;
let failed = 0;

function ok(label: string) { passed++; console.log(`  ✓ ${label}`); }
function fail(label: string, detail?: string) { failed++; console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); }

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) ok(label);
  else fail(label, detail);
}

// ---------------------------------------------------------------------------
// Step 0: Login all users
// ---------------------------------------------------------------------------
async function loginAll() {
  console.log('\n== Step 0: Login ==');

  const admin = await request('POST', '/auth/login/local', undefined, { username: 'admin', password: DEV_PASSWORD });
  assert('Admin login', admin.status === 200 && admin.data?.token, `status=${admin.status}`);
  adminToken = admin.data.token;

  const field = await request('POST', '/auth/login/local', undefined, { username: 'field1', password: DEV_PASSWORD });
  assert('Field Officer login', field.status === 200 && field.data?.token, `status=${field.status}`);
  fieldToken = field.data.token;

  const viewer = await request('POST', '/auth/login/local', undefined, { username: 'viewer1', password: DEV_PASSWORD });
  assert('Viewer login', viewer.status === 200 && viewer.data?.token, `status=${viewer.status}`);
  viewerToken = viewer.data.token;
}

// ---------------------------------------------------------------------------
// Step 1: Seed NotificationConfig entries
// ---------------------------------------------------------------------------
async function seedNotificationConfig() {
  console.log('\n== Step 1: Seed NotificationConfig ==');

  const entries = [
    { triggerEvent: 'FORM_PUBLISHED', channel: 'Email', roleId: 1, enabled: true },       // Administrator
    { triggerEvent: 'FORM_PUBLISHED', channel: 'Email', roleId: 4, enabled: true },       // Field Officer
    { triggerEvent: 'OWNERSHIP_TRANSFERRED', channel: 'Email', roleId: 4, enabled: true }, // Field Officer
    { triggerEvent: 'SUBMISSION_CONFIRMED', channel: 'Email', roleId: 4, enabled: true },  // Field Officer (already in seed, safe to upsert)
    { triggerEvent: 'OWNERSHIP_TRANSFERRED', channel: 'Email', roleId: 1, enabled: true }, // Administrator
  ];

  for (const entry of entries) {
    const res = await request('POST', '/notifications/config', adminToken, entry);
    // 201 = created/updated, 409 = already exists (both are acceptable)
    assert(`Config: ${entry.triggerEvent} + RoleID ${entry.roleId}`, res.status === 201 || res.status === 409, `status=${res.status}`);
  }
}

// ---------------------------------------------------------------------------
// Step 2: Create Marketing Survey – Full Form
// ---------------------------------------------------------------------------
async function createForm() {
  console.log('\n== Step 2: Create Form ==');

  const res = await request('POST', '/forms', adminToken, {
    title: 'Marketing Survey – Full Form',
    description: 'Full marketing survey for field data collection. Tests the complete notification lifecycle.',
  });
  assert('Form created', res.status === 201 && res.data?.templateId, `status=${res.status}, body=${JSON.stringify(res.data)}`);
  formId = res.data.templateId;
  console.log(`    Form ID: ${formId}`);
}

// ---------------------------------------------------------------------------
// Step 3: Save a schema version
// ---------------------------------------------------------------------------
async function saveSchema() {
  console.log('\n== Step 3: Save Schema ==');

  const res = await request('POST', `/forms/${formId}/versions`, adminToken, {
    schema: {
      schemaVersion: 2,
      pages: [{ id: 'p1', title: 'General' }, { id: 'p2', title: 'Feedback' }],
      elements: [
        { key: 'outlet_name', type: 'shorttext', label: 'Outlet Name', pageId: 'p1', order: 0, required: true },
        { key: 'region', type: 'dropdown', label: 'Region', pageId: 'p1', order: 1, options: ['Addis Ababa', 'Oromia', 'Amhara', 'SNNPR'] },
        { key: 'product_availability', type: 'rating', label: 'Product Availability (1-5)', pageId: 'p1', order: 2 },
        { key: 'competitor_presence', type: 'shorttext', label: 'Competitor Products Seen', pageId: 'p2', order: 3 },
        { key: 'overall_satisfaction', type: 'rating', label: 'Overall Satisfaction (1-5)', pageId: 'p2', order: 4 },
        { key: 'comments', type: 'longtext', label: 'Additional Comments', pageId: 'p2', order: 5 },
      ],
    },
  });
  assert('Schema saved', res.status === 201, `status=${res.status}, body=${JSON.stringify(res.data)}`);
}

// ---------------------------------------------------------------------------
// Step 4: Configure Invite access + add wolumaan@gmail.com
// ---------------------------------------------------------------------------
async function configureAccess() {
  console.log('\n== Step 4: Configure Access ==');

  const accessRes = await request('PUT', `/forms/${formId}/access`, adminToken, {
    mode: 'Invite',
    config: {},
  });
  assert('Access mode set to Invite', accessRes.status === 200, `status=${accessRes.status}`);

  const inviteRes = await request('POST', `/forms/${formId}/invites`, adminToken, {
    email: FIELD_EMAIL,
  });
  assert(`Invite added for ${FIELD_EMAIL}`, inviteRes.status === 201, `status=${inviteRes.status}, body=${JSON.stringify(inviteRes.data)}`);
}

// ---------------------------------------------------------------------------
// Step 5: Publish the form → triggers FORM_PUBLISHED
// ---------------------------------------------------------------------------
async function publishForm() {
  console.log('\n== Step 5: Publish Form ==');

  const res = await request('POST', `/forms/${formId}/publish`, adminToken);
  assert('Form published', res.status === 200, `status=${res.status}, body=${JSON.stringify(res.data)}`);

  // Give delivery a moment (fire-and-forget)
  await new Promise((r) => setTimeout(r, 2000));
}

// ---------------------------------------------------------------------------
// Step 6: Transfer ownership to Field Officer → triggers OWNERSHIP_TRANSFERRED
// ---------------------------------------------------------------------------
async function transferOwnership() {
  console.log('\n== Step 6: Transfer Ownership ==');

  const res = await request('POST', `/forms/${formId}/ownership`, adminToken, {
    newOwnerUserId: 4, // field1 = UserID 4
  });
  assert('Ownership transferred to field1', res.status === 200, `status=${res.status}, body=${JSON.stringify(res.data)}`);

  // Give delivery a moment
  await new Promise((r) => setTimeout(r, 2000));
}

// ---------------------------------------------------------------------------
// Step 7: Verify admin notifications
// ---------------------------------------------------------------------------
async function verifyAdminNotifications() {
  console.log('\n== Step 7: Verify Admin Notifications ==');

  const unread = await request('GET', '/notifications/unread-count', adminToken);
  assert('Admin has unread count > 0', unread.status === 200 && unread.data?.count > 0, `count=${unread.data?.count}`);

  const mine = await request('GET', '/notifications/mine', adminToken);
  assert('Admin has notifications in list', mine.status === 200 && mine.data?.items?.length > 0, `total=${mine.data?.total}`);

  // Find the FORM_PUBLISHED notification
  const formPubNotif = mine.data.items.find((n: any) => n.TriggerEvent === 'FORM_PUBLISHED');
  if (formPubNotif) {
    adminNotifId = formPubNotif.NotificationID;
    assert('FORM_PUBLISHED notification found', true);
    assert('Notification has IsRead=false', formPubNotif.IsRead === false);

    // Get details
    const detail = await request('GET', `/notifications/${adminNotifId}`, adminToken);
    assert('GET /notifications/:id returns detail', detail.status === 200 && detail.data?.Body, `status=${detail.status}`);

    // Mark as read
    const markRead = await request('PATCH', `/notifications/${adminNotifId}/read`, adminToken);
    assert('Mark as read returns ok', markRead.status === 200 && markRead.data?.ok === true);

    // Verify it's now read
    const detailAfter = await request('GET', `/notifications/${adminNotifId}`, adminToken);
    assert('Notification is now read (IsRead=true)', detailAfter.status === 200 && detailAfter.data?.IsRead === true);
  } else {
    fail('FORM_PUBLISHED notification not found in admin list');
  }
}

// ---------------------------------------------------------------------------
// Step 8: Login as Field Officer, verify notifications
// ---------------------------------------------------------------------------
async function verifyFieldNotifications() {
  console.log('\n== Step 8: Verify Field Officer Notifications ==');

  // Unread count
  const unread = await request('GET', '/notifications/unread-count', fieldToken);
  assert('Field Officer unread count > 0', unread.status === 200 && unread.data?.count > 0, `count=${unread.data?.count}`);
  console.log(`    Unread count: ${unread.data?.count}`);

  // List notifications
  const mine = await request('GET', '/notifications/mine', fieldToken);
  assert('Field Officer has notifications', mine.status === 200 && mine.data?.items?.length > 0, `total=${mine.data?.total}`);

  // Find OWNERSHIP_TRANSFERRED notification
  const ownershipNotif = mine.data.items.find((n: any) => n.TriggerEvent === 'OWNERSHIP_TRANSFERRED');
  if (ownershipNotif) {
    fieldNotifIds.push(ownershipNotif.NotificationID);
    assert('OWNERSHIP_TRANSFERRED notification found', true);
    assert('Notification has IsRead=false', ownershipNotif.IsRead === false);

    // Get details
    const detail = await request('GET', `/notifications/${ownershipNotif.NotificationID}`, fieldToken);
    assert('GET /notifications/:id returns detail', detail.status === 200 && detail.data?.Body, `status=${detail.status}`);
    assert('Detail has correct TriggerEvent', detail.data?.TriggerEvent === 'OWNERSHIP_TRANSFERRED');
    console.log(`    Subject: ${detail.data?.Subject}`);
  } else {
    fail('OWNERSHIP_TRANSFERRED notification not found');
  }

  // Mark all as read
  const markAll = await request('PATCH', '/notifications/read-all', fieldToken);
  assert('Mark all read returns ok', markAll.status === 200 && markAll.data?.ok === true);
  console.log(`    Marked ${markAll.data?.updated} notifications as read`);

  // Verify count is now 0
  const unreadAfter = await request('GET', '/notifications/unread-count', fieldToken);
  assert('Unread count is now 0', unreadAfter.status === 200 && unreadAfter.data?.count === 0, `count=${unreadAfter.data?.count}`);
}

// ---------------------------------------------------------------------------
// Step 9: Field Officer submits a response → triggers SUBMISSION_CONFIRMED
// ---------------------------------------------------------------------------
async function submitResponse() {
  console.log('\n== Step 9: Submit Response as Field Officer ==');

  const res = await request('POST', `/forms/${formId}/responses`, fieldToken, {
    answers: {
      outlet_name: 'Test Outlet Addis',
      region: 'Addis Ababa',
      product_availability: 4,
      competitor_presence: 'Camel, ITAI',
      overall_satisfaction: 5,
      comments: 'E2E test submission for notification center verification.',
    },
  });
  assert('Response submitted', res.status === 201, `status=${res.status}, body=${JSON.stringify(res.data)}`);

  // Give delivery a moment
  await new Promise((r) => setTimeout(r, 2000));

  // Verify SUBMISSION_CONFIRMED notification
  const unread = await request('GET', '/notifications/unread-count', fieldToken);
  assert('Field Officer has new unread notification after response', unread.status === 200 && unread.data?.count > 0, `count=${unread.data?.count}`);

  const mine = await request('GET', '/notifications/mine', fieldToken);
  const submissionNotif = mine.data?.items?.find((n: any) => n.TriggerEvent === 'SUBMISSION_CONFIRMED');
  if (submissionNotif) {
    assert('SUBMISSION_CONFIRMED notification found', true);
    fieldNotifIds.push(submissionNotif.NotificationID);
  } else {
    fail('SUBMISSION_CONFIRMED notification not found');
  }
}

// ---------------------------------------------------------------------------
// Step 10: Unauthorized access tests
// ---------------------------------------------------------------------------
async function testUnauthorizedAccess() {
  console.log('\n== Step 10: Unauthorized Access Tests ==');

  if (fieldNotifIds.length === 0) {
    fail('No field notification IDs to test against');
    return;
  }

  const targetId = fieldNotifIds[0];

  // Viewer tries to read field officer's notification detail
  const detail = await request('GET', `/notifications/${targetId}`, viewerToken);
  assert('Viewer cannot GET field officer notification (404)', detail.status === 404, `status=${detail.status}`);

  // Viewer tries to mark field officer's notification as read
  const markRead = await request('PATCH', `/notifications/${targetId}/read`, viewerToken);
  assert('Viewer cannot PATCH field officer notification (404)', markRead.status === 404, `status=${markRead.status}`);

  // Viewer checks their own unread count (should be 0)
  const viewerUnread = await request('GET', '/notifications/unread-count', viewerToken);
  assert('Viewer has 0 unread notifications', viewerUnread.status === 200 && viewerUnread.data?.count === 0, `count=${viewerUnread.data?.count}`);

  // Viewer's notification list should be empty
  const viewerMine = await request('GET', '/notifications/mine', viewerToken);
  assert('Viewer has no notifications in list', viewerMine.status === 200 && viewerMine.data?.items?.length === 0, `total=${viewerMine.data?.total}`);

  // Viewer cannot access admin notification endpoint (403)
  const adminList = await request('GET', '/notifications', viewerToken);
  assert('Viewer cannot access admin notification list (403)', adminList.status === 403, `status=${adminList.status}`);

  // Unauthenticated request is rejected (401)
  const unauth = await request('GET', '/notifications/unread-count');
  assert('Unauthenticated request rejected (401)', unauth.status === 401, `status=${unauth.status}`);

  // Invalid notification ID returns 400
  const badId = await request('GET', '/notifications/abc', fieldToken);
  assert('Invalid notification ID returns 400', badId.status === 400, `status=${badId.status}`);

  // Non-existent notification ID returns 404
  const notExist = await request('GET', '/notifications/999999', fieldToken);
  assert('Non-existent notification ID returns 404', notExist.status === 404, `status=${notExist.status}`);

  // Mark non-existent notification as read returns 404
  const markNotExist = await request('PATCH', '/notifications/999999/read', fieldToken);
  assert('Mark non-existent notification as read returns 404', markNotExist.status === 404, `status=${markNotExist.status}`);
}

// ---------------------------------------------------------------------------
// Step 11: Verify email delivery via SMTP logs
// ---------------------------------------------------------------------------
async function verifyEmailDelivery() {
  console.log('\n== Step 11: Verify Email Delivery ==');

  // The notification pipeline sends emails via deliver() → sendEmail().
  // We check the notification Status field to confirm delivery was attempted.
  // Status = 'Sent' means SMTP accepted the message.

  const adminMine = await request('GET', '/notifications/mine', adminToken);
  const sentNotifs = adminMine.data?.items?.filter((n: any) => n.Status === 'Sent') ?? [];
  assert('At least 1 admin notification has Status=Sent', sentNotifs.length > 0, `sentCount=${sentNotifs.length}`);

  const fieldMine = await request('GET', '/notifications/mine?page=1&pageSize=100', fieldToken);
  const fieldSentNotifs = fieldMine.data?.items?.filter((n: any) => n.Status === 'Sent') ?? [];
  assert('At least 1 field officer notification has Status=Sent', fieldSentNotifs.length > 0, `sentCount=${fieldSentNotifs.length}`);
  console.log(`    Admin sent emails: ${sentNotifs.length}`);
  console.log(`    Field Officer sent emails: ${fieldSentNotifs.length}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== Notification Center E2E Test ===');
  console.log(`API: ${BASE}`);

  try {
    await loginAll();
    await seedNotificationConfig();
    await createForm();
    await saveSchema();
    await configureAccess();
    await publishForm();
    await transferOwnership();
    await verifyAdminNotifications();
    await verifyFieldNotifications();
    await submitResponse();
    await testUnauthorizedAccess();
    await verifyEmailDelivery();
  } catch (err) {
    console.error('\nFATAL:', (err as Error).message);
    failed++;
  }

  console.log('\n=== Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('\nAll tests passed!');
  }
}

main();
