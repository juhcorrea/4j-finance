'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { createHmac } = require('node:crypto');
const core = require('../payment-core');
const f = require('./fixtures');
const copy = x => x == null ? x : JSON.parse(JSON.stringify(x));

function harness(overrides = {}) {
  const documents = new Map([['users/alice', { status: 'approved' }], ['users/bob', { status: 'approved' }]]);
  const users = new Map([['alice', { uid: 'alice', email: 'alice@example.invalid', emailVerified: true, customClaims: { unrelatedRole: 'member' } }], ['bob', { uid: 'bob', email: 'bob@example.invalid', emailVerified: true, customClaims: {} }]]);
  const orders = new Map(), keys = new Map(), postedBodies = new Map();
  const calls = { post: 0, get: 0, merchant: 0, setClaims: 0, submissions: [] };
  const flags = { failClaims: false, failPostBefore: 0, failPostAfter: 0, failGet: 0, asyncOrder: false, minimalPost: false };
  const merchant = { id: 5678, country_id: 'BR', site_id: 'MLB', tags: ['test_user'] };
  let transactionTail = Promise.resolve();
  function ref(path) {
    return {
      path, id: path.split('/').pop(),
      async get() { return { exists: documents.has(path), id: this.id, data: () => copy(documents.get(path)) }; },
      async set(value, options) { documents.set(path, options?.merge ? { ...documents.get(path), ...copy(value) } : copy(value)); },
      async delete() { documents.delete(path); },
    };
  }
  const db = {
    collection: path => ({ doc: id => ref(path + '/' + id) }),
    runTransaction(fn) {
      const operation = transactionTail.then(async () => {
        const writes = [];
        const result = await fn({ get: doc => doc.get(), set: (doc, value, options) => { writes.push(() => doc.set(value, options)); }, delete: doc => { writes.push(() => doc.delete()); } });
        for (const write of writes) await write();
        return result;
      });
      transactionTail = operation.catch(() => {});
      return operation;
    },
    batch() {
      const jobs = [];
      return { create(doc, value) { jobs.push(() => { assert.equal(documents.has(doc.path), false); return doc.set(value); }); }, set(doc, value, options) { jobs.push(() => doc.set(value, options)); }, async commit() { for (const job of jobs) await job(); } };
    },
  };
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const settings = { MP_ACCESS_TOKEN: 'synthetic-token', MP_WEBHOOK_SECRET: 'synthetic-secret', MP_COLLECTOR_ID: '5678', MP_APPLICATION_ID: '9012', MP_LIVE_MODE: 'false', MP_TEST_FIREBASE_PROJECT_ID: 'demo-4j-pix', MP_PRODUCTION_FIREBASE_PROJECT_ID: 'production-4j-pix', PAYMENTS_ENABLED: true, ...overrides };
  const env = { GCLOUD_PROJECT: 'demo-4j-pix' };
  const modules = {
    'firebase-admin/app': { initializeApp() {} },
    'firebase-admin/auth': { getAuth: () => ({ getUser: async uid => { if (!users.has(uid)) throw Error('missing'); return copy(users.get(uid)); }, setCustomUserClaims: async (uid, claims) => { if (flags.failClaims) throw Error('Auth down'); calls.setClaims++; users.get(uid).customClaims = copy(claims); } }) },
    'firebase-admin/firestore': { getFirestore: () => db, FieldValue: { serverTimestamp: () => Date.now() } },
    'firebase-functions/v2/https': { HttpsError, onCall: (_, fn) => fn, onRequest: (_, fn) => fn },
    'firebase-functions/params': Object.fromEntries(['defineSecret', 'defineString', 'defineBoolean'].map(key => [key, name => ({ value: () => settings[name] })])),
    './payment-core': core, 'node:crypto': require('node:crypto'),
  };
  const api = {};
  const context = vm.createContext({
    require: name => { if (!(name in modules)) throw Error('Unexpected import ' + name); return modules[name]; },
    exports: api, URL, AbortController, setTimeout, clearTimeout, console, process: { env },
    async fetch(url, options) {
      assert.equal(options.headers.Authorization, 'Bearer synthetic-token');
      assert.equal(options.redirect, 'error');
      if (url === 'https://api.mercadopago.com/users/me') {
        assert.equal(options.method, 'GET'); calls.merchant++; return { ok: true, json: async () => copy(merchant) };
      }
      assert.ok(url.startsWith('https://api.mercadopago.com/v1/orders'));
      assert.equal(url.includes('/search'), false);
      if (options.method === 'POST') {
        assert.equal(url, 'https://api.mercadopago.com/v1/orders');
        calls.post++;
        const key = options.headers['X-Idempotency-Key'];
        assert.ok(core.ORDER_ID_RE.test(key));
        const body = JSON.parse(options.body);
        calls.submissions.push({ key, body: options.body });
        assert.equal(body.total_amount, '5.00');
        assert.equal(body.type, 'online'); assert.equal(body.processing_mode, 'automatic');
        assert.equal(body.transactions.payments.length, 1);
        assert.deepEqual(body.transactions.payments[0], { amount: '5.00', payment_method: { id: 'pix', type: 'bank_transfer' }, expiration_time: 'PT24H' });
        assert.equal('identification' in body.payer, false);
        if (flags.failPostBefore > 0) { flags.failPostBefore--; throw Error('network before response'); }
        if (keys.has(key)) {
          assert.equal(options.body, postedBodies.get(key), 'idempotency replay must be byte-identical');
          return { ok: true, json: async () => copy(orders.get(keys.get(key))) };
        }
        const count = orders.size + 1;
        const value = f.provider({ id: f.providerId(count), external_reference: body.external_reference,
          status: flags.asyncOrder ? 'processing' : 'action_required', status_detail: flags.asyncOrder ? 'in_process' : 'waiting_transfer',
          total_paid_amount: '0.00', last_updated_date: new Date().toISOString(), user_id: String(merchant.id),
          integration_data: { application_id: settings.MP_APPLICATION_ID } });
        value.transactions.payments[0].id = f.paymentId(count);
        Object.assign(value.transactions.payments[0], { status: value.status, status_detail: value.status_detail, paid_amount: '0.00', date_of_expiration: new Date(Date.now() + 86400000).toISOString() });
        if (flags.asyncOrder) value.transactions = {};
        orders.set(value.id, value); keys.set(key, value.id); postedBodies.set(key, options.body);
        if (flags.failPostAfter > 0) { flags.failPostAfter--; throw Error('network lost after creation'); }
        return { ok: true, json: async () => flags.minimalPost ? { id: value.id } : copy(value) };
      }
      calls.get++;
      if (flags.failGet > 0) { flags.failGet--; return { ok: false }; }
      const id = url.split('/').pop();
      return orders.has(id) ? { ok: true, json: async () => copy(orders.get(id)) } : { ok: false };
    },
  });
  vm.runInContext(fs.readFileSync(require.resolve('../index'), 'utf8'), context);
  const request = (uid = 'alice', data = {}) => ({ auth: { uid }, data });
  async function webhook(id, overrides = {}) {
    const ts = String(Date.now()), requestId = 'request-test';
    const signature = createHmac('sha256', settings.MP_WEBHOOK_SECRET).update('id:' + id.toLowerCase() + ';request-id:' + requestId + ';ts:' + ts + ';').digest('hex');
    const req = { method: 'POST', query: { 'data.id': id, type: 'order' }, body: { type: 'order', live_mode: true, user_id: 'attacker', data: { status: 'processed', status_detail: 'accredited' } },
      get: name => ({ 'x-request-id': requestId, 'x-signature': 'ts=' + ts + ',v1=' + signature })[name], ...overrides };
    const result = {};
    const res = { set() { return res; }, status(status) { result.status = status; return res; }, send(body) { result.body = body; return res; } };
    await api.mercadoPagoWebhook(req, res);
    return result;
  }
  const stored = id => documents.get('billingOrders/' + id);
  const remote = id => orders.get(stored(id).providerOrderId);
  return { api, documents, users, orders, calls, request, webhook, settings, env, merchant, flags, stored, remote };
}
test('purchase requires authenticated enabled active verified account and ignores client amount/CPF/UID', async () => {
  const h = harness();
  await assert.rejects(h.api.createPixCheckout({}), e => e.code === 'unauthenticated');
  h.users.get('alice').emailVerified = false;
  await assert.rejects(h.api.createPixCheckout(h.request()), e => e.code === 'failed-precondition');
  h.users.get('alice').emailVerified = true; h.users.get('alice').disabled = true;
  await assert.rejects(h.api.createPixCheckout(h.request()), e => e.code === 'permission-denied');
  h.users.get('alice').disabled = false; h.documents.get('users/alice').status = 'pending';
  await assert.rejects(h.api.createPixCheckout(h.request()), e => e.code === 'permission-denied');
  h.documents.get('users/alice').status = 'approved'; h.settings.PAYMENTS_ENABLED = false;
  await assert.rejects(h.api.createPixCheckout(h.request()), e => e.code === 'failed-precondition');
  h.settings.PAYMENTS_ENABLED = true;
  const result = await h.api.createPixCheckout(h.request('alice', { cpf: 'DO-NOT-STORE', amount: 0.01, uid: 'bob' }));
  assert.equal(result.amount, 5); assert.equal(h.stored(result.orderId).uid, 'alice');
  assert.equal(JSON.stringify([...h.documents.values()]).includes('DO-NOT-STORE'), false);
  assert.equal(h.calls.post, 1);
});
for (const change of [
  h => { h.settings.MP_LIVE_MODE = 'invalid'; },
  h => { h.settings.MP_APPLICATION_ID = ''; },
  h => { h.settings.MP_TEST_FIREBASE_PROJECT_ID = h.settings.MP_PRODUCTION_FIREBASE_PROJECT_ID; },
  h => { h.env.GCLOUD_PROJECT = 'production-4j-pix'; },
  h => { h.merchant.tags = []; },
  h => { delete h.merchant.tags; },
  h => { h.merchant.id = 9999; },
  h => { h.merchant.site_id = 'MLA'; },
]) test('fails closed before creating against wrong environment ' + String(change), async () => {
  const h = harness(); change(h); await assert.rejects(h.api.createPixCheckout(h.request()), e => e.code === 'failed-precondition'); assert.equal(h.calls.post, 0);
});
test('production requires production project and non-test merchant, never sends sandbox APRO', async () => {
  const h = harness({ MP_LIVE_MODE: 'true' }); h.env.GCLOUD_PROJECT = 'production-4j-pix';
  await assert.rejects(h.api.createPixCheckout(h.request()), e => e.code === 'failed-precondition');
  h.merchant.tags = ['normal'];
  const result = await h.api.createPixCheckout(h.request());
  assert.equal(JSON.parse(h.stored(result.orderId).requestPayload).payer.first_name, undefined);
});
test('pending checkout is reused and restored without leaking QR/payer data in status', async () => {
  const h = harness(); const first = await h.api.createPixCheckout(h.request());
  const repeat = await h.api.createPixCheckout(h.request());
  assert.equal(repeat.orderId, first.orderId); assert.equal(h.calls.post, 1);
  const status = await h.api.getMonetizationStatus(h.request());
  assert.equal(status.pendingOrderId, first.orderId);
  assert.deepEqual(Object.keys(status).sort(), ['adFreeLifetime', 'currency', 'paymentsEnabled', 'pendingOrderId', 'price']);
  h.settings.PAYMENTS_ENABLED = false;
  assert.equal((await h.api.getMonetizationStatus(h.request())).pendingOrderId, first.orderId);
  assert.equal((await h.api.checkPixCheckout(h.request('alice', { orderId: first.orderId }))).status, 'pending');
  await assert.rejects(h.api.createPixCheckout(h.request()), e => e.code === 'failed-precondition');
});
test('processing order without a payment or QR is saved and resumable with purchases off', async () => {
  const h = harness(); h.flags.asyncOrder = true; h.flags.minimalPost = true;
  const first = await h.api.createPixCheckout(h.request());
  assert.equal(first.status, 'in_process'); assert.equal(first.paymentId, ''); assert.equal(first.qrCode, '');
  h.settings.PAYMENTS_ENABLED = false;
  assert.equal((await h.api.getMonetizationStatus(h.request())).pendingOrderId, first.orderId);
  const checked = await h.api.checkPixCheckout(h.request('alice', { orderId: first.orderId }));
  assert.equal(checked.adFreeLifetime, false); assert.equal(checked.status, 'in_process'); assert.equal(h.calls.post, 1);
});
test('foreign, malformed and unbound active orders do not leak or get replaced silently', async () => {
  const h = harness(); const first = await h.api.createPixCheckout(h.request('bob'));
  h.documents.set('billingAccounts/alice', { activeOrderId: first.orderId });
  assert.equal((await h.api.getMonetizationStatus(h.request())).pendingOrderId, null);
  await assert.rejects(h.api.createPixCheckout(h.request()), e => e.code === 'failed-precondition');
  await assert.rejects(h.api.checkPixCheckout(h.request('alice', { orderId: first.orderId })), e => e.code === 'permission-denied');
  h.documents.get('billingAccounts/alice').activeOrderId = '../../users/bob';
  assert.equal((await h.api.getMonetizationStatus(h.request())).pendingOrderId, null);
  delete h.stored(first.orderId).providerOrderId;
  assert.equal((await h.api.getMonetizationStatus(h.request('bob'))).pendingOrderId, null);
  h.stored(first.orderId).providerOrderId = 'invalid';
  assert.equal((await h.api.getMonetizationStatus(h.request('bob'))).pendingOrderId, null);
  assert.equal(h.calls.post, 1);
});
test('only provider accreditation grants, retry is idempotent and unrelated claims survive', async () => {
  const h = harness(); const first = await h.api.createPixCheckout(h.request());
  const order = h.remote(first.orderId);
  assert.equal((await h.webhook(order.id)).status, 200);
  assert.equal(h.users.get('alice').customClaims.adFreeLifetime, false);
  f.approve(order);
  assert.equal((await h.webhook(order.id.toLowerCase())).status, 200);
  assert.equal(h.users.get('alice').customClaims.adFreeLifetime, true);
  const claimsCount = h.calls.setClaims;
  assert.equal((await h.webhook(order.id)).status, 200);
  assert.equal(h.calls.setClaims, claimsCount);
  const status = await h.api.getMonetizationStatus(h.request());
  assert.equal(status.pendingOrderId, null); assert.equal(status.adFreeLifetime, true);
  assert.equal(h.users.get('alice').customClaims.unrelatedRole, 'member');
  assert.deepEqual(h.users.get('alice').customClaims.adFreeOrderIds, [order.id]);
  assert.equal((await h.api.createPixCheckout(h.request())).adFreeLifetime, true);
  assert.equal(h.calls.post, 1);
});
test('webhook rejects unsigned/wrong topics, ignores unrelated references and retries Auth failures', async () => {
  const h = harness(); const first = await h.api.createPixCheckout(h.request()); const order = h.remote(first.orderId);
  assert.equal((await h.webhook(order.id, { get: () => 'forged' })).status, 401);
  assert.equal((await h.webhook(order.id, { body: { type: 'payment' }, query: { type: 'payment', 'data.id': order.id } })).status, 400);
  f.approve(order); h.flags.failClaims = true;
  assert.equal((await h.webhook(order.id)).status, 503);
  h.flags.failClaims = false; assert.equal((await h.webhook(order.id)).status, 200);
  const another = f.provider({ id: f.providerId(9), external_reference: 'another-product' }); h.orders.set(another.id, another);
  assert.equal((await h.webhook(another.id)).body, 'ignored');
});
for (const mutate of [
  p => { p.status = 'refunded'; p.status_detail = 'refunded'; },
  p => { p.status_detail = 'partially_refunded'; },
  p => { p.transactions.payments[0].status_detail = 'partially_refunded'; },
  p => { p.transactions.refunds = [{ id: 'REF-SYNTHETIC', amount: '1.00', status: 'processed' }]; },
  p => { p.status = 'charged_back'; },
]) test('refund/chargeback revokes benefit ' + String(mutate), async () => {
  const h = harness(); const first = await h.api.createPixCheckout(h.request()); const order = h.remote(first.orderId);
  f.approve(order); await h.webhook(order.id); mutate(order);
  assert.equal((await h.webhook(order.id)).status, 200);
  assert.equal(h.users.get('alice').customClaims.adFreeLifetime, false);
  assert.equal(h.users.get('alice').customClaims.unrelatedRole, 'member');
});
test('forged Firestore flags and client success fields never grant benefit', async () => {
  const h = harness(); h.documents.set('billingAccounts/alice', { adFreeLifetime: true });
  assert.equal((await h.api.getMonetizationStatus(h.request())).adFreeLifetime, false);
  const first = await h.api.createPixCheckout(h.request());
  const result = await h.api.checkPixCheckout(h.request('alice', { orderId: first.orderId, adFreeLifetime: true, status: 'approved' }));
  assert.equal(result.adFreeLifetime, false);
});
test('lost creation response replays identical key/body even after expiry and Auth email change', async () => {
  const h = harness(); h.flags.failPostAfter = 1;
  await assert.rejects(h.api.createPixCheckout(h.request()), e => e.code === 'unavailable');
  const reservedId = h.documents.get('billingAccounts/alice').activeOrderId;
  assert.equal(h.stored(reservedId).providerOrderId, undefined);
  h.stored(reservedId).expiresAt = '2020-01-01T00:00:00Z';
  h.users.get('alice').email = 'changed@example.invalid';
  const recovered = await h.api.createPixCheckout(h.request());
  assert.equal(recovered.orderId, reservedId); assert.equal(h.orders.size, 1);
  assert.equal(h.calls.submissions[0].body, h.calls.submissions[1].body);
  assert.equal(h.calls.submissions[0].key, h.calls.submissions[1].key);
});
test('unknown result before creation never discards the original reservation', async () => {
  const h = harness(); h.flags.failPostBefore = 1;
  await assert.rejects(h.api.createPixCheckout(h.request()), e => e.code === 'unavailable');
  const reserved = h.documents.get('billingAccounts/alice').activeOrderId;
  h.stored(reserved).expiresAt = '2020-01-01T00:00:00Z';
  assert.equal((await h.api.createPixCheckout(h.request())).orderId, reserved);
  assert.equal(h.orders.size, 1); assert.equal(h.calls.submissions[0].key, h.calls.submissions[1].key);
});
test('trusted POST id survives failed GET and webhook recovers response-lost reservation', async () => {
  const h = harness(); h.flags.failGet = 1; h.flags.minimalPost = true;
  await assert.rejects(h.api.createPixCheckout(h.request()), e => e.code === 'unavailable');
  const id = h.documents.get('billingAccounts/alice').activeOrderId;
  assert.ok(h.stored(id).providerOrderId);
  assert.equal((await h.api.createPixCheckout(h.request())).orderId, id);
  assert.equal(h.calls.post, 1);
  delete h.stored(id).providerOrderId;
  const order = [...h.orders.values()][0]; f.approve(order);
  assert.equal((await h.webhook(order.id)).status, 200);
  assert.equal(h.stored(id).providerOrderId, order.id);
  assert.equal(h.users.get('alice').customClaims.adFreeLifetime, true);
});
for (const status of ['action_required', 'processing']) test('expired clock never creates a second ' + status + ' charge', async () => {
  const h = harness(); const first = await h.api.createPixCheckout(h.request()); const order = h.remote(first.orderId);
  order.status = status; order.transactions.payments[0].status = status;
  order.transactions.payments[0].date_of_expiration = '2020-01-01T00:00:00Z';
  h.stored(first.orderId).expiresAt = '2020-01-01T00:00:00Z';
  h.documents.get('billingAccounts/alice').lastCreatedAt = Date.now() - 61000;
  assert.equal((await h.api.createPixCheckout(h.request())).orderId, first.orderId); assert.equal(h.calls.post, 1);
  f.approve(order); await h.webhook(order.id);
  assert.equal((await h.api.createPixCheckout(h.request())).adFreeLifetime, true); assert.equal(h.calls.post, 1);
});
test('authoritative order expiration permits replacement, not child payment expiration alone', async () => {
  const h = harness(); const first = await h.api.createPixCheckout(h.request()); const order = h.remote(first.orderId);
  order.transactions.payments[0].status = 'expired';
  h.documents.get('billingAccounts/alice').lastCreatedAt = Date.now() - 61000;
  assert.equal((await h.api.createPixCheckout(h.request())).orderId, first.orderId);
  order.status = 'expired'; order.status_detail = 'expired';
  assert.notEqual((await h.api.createPixCheckout(h.request())).orderId, first.orderId);
  assert.equal(h.orders.size, 2);
});
test('concurrent requests hold the per-account lock and create only one provider order', async () => {
  const h = harness();
  const results = await Promise.allSettled([h.api.createPixCheckout(h.request()), h.api.createPixCheckout(h.request())]);
  assert.equal(h.orders.size, 1); assert.equal(h.calls.post, 1);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'aborted');
});
test('refund of one purchase preserves a distinct approved purchase', async () => {
  const h = harness(); const first = await h.api.createPixCheckout(h.request()); const one = h.remote(first.orderId); f.approve(one); await h.webhook(one.id);
  const secondId = 'a6ca7e62-b8fb-4b66-8140-b3b85cf8295b';
  const two = f.provider({ id: f.providerId(2), external_reference: core.reference(secondId) });
  h.orders.set(two.id, two); h.documents.set('billingOrders/' + secondId, f.order({ orderId: secondId, providerOrderId: two.id }));
  await h.webhook(two.id); one.status = 'refunded'; one.status_detail = 'refunded'; await h.webhook(one.id);
  assert.equal(h.users.get('alice').customClaims.adFreeLifetime, true);
  assert.deepEqual(h.users.get('alice').customClaims.adFreeOrderIds, [two.id]);
});


for (const mutate of [
  p => { p.transactions.payments[0].refunded_amount = '1.00'; },
  p => { p.transactions.payments[0].refunded_amount = 'invalid'; },
  p => { p.transactions.chargebacks = [{ id: 'CBK-SYNTHETIC', transaction_id: p.transactions.payments[0].id, status: 'in_process' }]; },
  p => { p.transactions.chargebacks = {}; },
]) test('explicit reversal evidence never grants or preserves an accredited benefit: ' + String(mutate), async () => {
  const h = harness(); const first = await h.api.createPixCheckout(h.request()); const remote = h.remote(first.orderId);
  f.approve(remote); const clean = copy(remote); mutate(remote);
  assert.equal((await h.webhook(remote.id)).status, 200);
  assert.equal(h.users.get('alice').customClaims.adFreeLifetime, false);
  h.orders.set(remote.id, clean);
  assert.equal((await h.webhook(clean.id)).status, 200);
  assert.equal(h.users.get('alice').customClaims.adFreeLifetime, true);
  mutate(clean);
  assert.equal((await h.api.getMonetizationStatus(h.request())).adFreeLifetime, false);
  assert.equal(h.users.get('alice').customClaims.adFreeLifetime, false);
  assert.equal(h.users.get('alice').customClaims.unrelatedRole, 'member');
});
test('malformed payment object cannot authorize a second charge from an expired order', async () => {
  const h = harness(); const first = await h.api.createPixCheckout(h.request()); const remote = h.remote(first.orderId);
  f.approve(remote);
  remote.status = 'expired'; remote.status_detail = 'expired'; remote.total_paid_amount = '0.00';
  remote.transactions.payments = remote.transactions.payments[0];
  h.documents.get('billingAccounts/alice').lastCreatedAt = Date.now() - 61000;
  await assert.rejects(h.api.createPixCheckout(h.request()), e => e.code === 'failed-precondition');
  assert.equal(h.orders.size, 1); assert.equal(h.calls.post, 1);
  assert.equal(h.users.get('alice').customClaims.adFreeLifetime, false);
});
