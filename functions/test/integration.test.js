'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { createHmac } = require('node:crypto');
const core = require('../payment-core');

function harness(overrides = {}) {
  const documents = new Map([['users/alice', { status: 'approved' }], ['users/bob', { status: 'approved' }]]);
  const users = new Map([['alice', { uid: 'alice', email: 'alice@example.invalid', emailVerified: true, customClaims: { unrelatedRole: 'member' } }], ['bob', { uid: 'bob', email: 'bob@example.invalid', emailVerified: true, customClaims: {} }]]);
  const payments = new Map();
  const calls = { post: 0, get: 0, setClaims: 0 };
  let failClaims = false;
  const copy = x => x == null ? x : JSON.parse(JSON.stringify(x));
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
    runTransaction: async fn => fn({ get: doc => doc.get(), set: (doc, value, options) => doc.set(value, options), delete: doc => doc.delete() }),
    batch() {
      const jobs = [];
      return { create(doc, value) { jobs.push(() => doc.set(value)); }, set(doc, value, options) { jobs.push(() => doc.set(value, options)); }, async commit() { for (const job of jobs) await job(); } };
    },
  };
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const settings = { MP_ACCESS_TOKEN: 'synthetic-token', MP_WEBHOOK_SECRET: 'synthetic-secret', MP_COLLECTOR_ID: '5678', MP_LIVE_MODE: 'false', MP_WEBHOOK_URL: 'https://test.example.invalid/webhook', PAYMENTS_ENABLED: true, ...overrides };
  const modules = {
    'firebase-admin/app': { initializeApp() {} },
    'firebase-admin/auth': { getAuth: () => ({ getUser: async uid => { if (!users.has(uid)) throw Error('missing'); return copy(users.get(uid)); }, setCustomUserClaims: async (uid, claims) => { if (failClaims) throw Error('Auth down'); calls.setClaims++; users.get(uid).customClaims = copy(claims); } }) },
    'firebase-admin/firestore': { getFirestore: () => db, FieldValue: { serverTimestamp: () => Date.now() } },
    'firebase-functions/v2/https': { HttpsError, onCall: (_, fn) => fn, onRequest: (_, fn) => fn },
    'firebase-functions/params': Object.fromEntries(['defineSecret', 'defineString', 'defineBoolean'].map(key => [key, name => ({ value: () => settings[name] })])),
    './payment-core': core, 'node:crypto': require('node:crypto'),
  };
  const api = {};
  const context = vm.createContext({
    require: name => { if (!(name in modules)) throw Error('Unexpected import ' + name); return modules[name]; },
    exports: api, URL, AbortController, setTimeout, clearTimeout, console,
    async fetch(url, options) {
      if (!url.startsWith('https://api.mercadopago.com/v1/payments')) throw Error('Unexpected URL');
      if (options.headers.Authorization !== 'Bearer synthetic-token') throw Error('No server credential');
      if (options.method === 'POST') {
        calls.post++;
        const body = JSON.parse(options.body);
        assert.equal(body.transaction_amount, 5);
        assert.equal(body.payment_method_id, 'pix');
        const previous = [...payments.values()].find(p => p.external_reference === body.external_reference);
        if (previous) return { ok: true, json: async () => copy(previous) };
        const payment = { ...body, id: String(1000 + payments.size), transaction_amount_refunded: 0, status: 'pending', currency_id: 'BRL', collector_id: 5678, live_mode: false, date_last_updated: new Date().toISOString(), point_of_interaction: { transaction_data: { qr_code: 'SYNTHETIC-PIX', qr_code_base64: 'dGVzdA==', ticket_url: 'https://www.mercadopago.com.br/payments/1000/ticket' } } };
        payments.set(payment.id, payment);
        return { ok: true, json: async () => copy(payment) };
      }
      calls.get++;
      if (url.includes('/search?')) { const external = new URL(url).searchParams.get('external_reference'); return { ok: true, json: async () => ({ results: [...payments.values()].filter(p => p.external_reference === external).map(copy) }) }; }
      const id = url.split('/').pop();
      if (!payments.has(id)) return { ok: false };
      return { ok: true, json: async () => copy(payments.get(id)) };
    },
  });
  vm.runInContext(fs.readFileSync(require.resolve('../index'), 'utf8'), context);
  const request = (uid = 'alice', data = {}) => ({ auth: { uid }, data });
  async function webhook(id, bodyStatus = 'approved') {
    const ts = String(Date.now()), requestId = 'request-test';
    const signature = createHmac('sha256', settings.MP_WEBHOOK_SECRET).update('id:' + id + ';request-id:' + requestId + ';ts:' + ts + ';').digest('hex');
    const req = { method: 'POST', query: { 'data.id': id, type: 'payment' }, body: { type: 'payment', status: bodyStatus }, get: name => ({ 'x-request-id': requestId, 'x-signature': 'ts=' + ts + ',v1=' + signature })[name] };
    const result = { status: null, body: null };
    const res = { set() { return res; }, status(status) { result.status = status; return res; }, send(body) { result.body = body; return res; } };
    await api.mercadoPagoWebhook(req, res);
    return result;
  }
  return { api, documents, users, payments, calls, request, webhook, setFailClaims: value => { failClaims = value; } };
}
const cpf = '52998224725';
test('purchase requires login, verified email, active account, enabled merchant', async () => {
  const h = harness();
  await assert.rejects(h.api.createPixCheckout({}), e => e.code === 'unauthenticated');
  h.users.get('alice').emailVerified = false;
  await assert.rejects(h.api.createPixCheckout(h.request('alice', { cpf })), e => e.code === 'failed-precondition');
  h.users.get('alice').emailVerified = true;
  h.documents.set('users/alice', { status: 'pending' });
  await assert.rejects(h.api.createPixCheckout(h.request('alice', { cpf })), e => e.code === 'permission-denied');
  const disabled = harness({ PAYMENTS_ENABLED: false });
  await assert.rejects(disabled.api.createPixCheckout(disabled.request('alice', { cpf })), e => e.code === 'failed-precondition');
  assert.equal(h.calls.post, 0);
});
test('creates a fixed-price private order and reuses pending Pix without saving CPF', async () => {
  const h = harness();
  const result = await h.api.createPixCheckout(h.request('alice', { cpf, amount: 0.01, uid: 'bob' }));
  assert.equal(result.amount, 5);
  assert.equal(result.adFreeLifetime, false);
  assert.equal(h.payments.get(result.paymentId).metadata.firebase_uid, 'alice');
  assert.equal(JSON.stringify([...h.documents.values()]).includes(cpf), false);
  const repeat = await h.api.createPixCheckout(h.request('alice', { cpf }));
  assert.equal(repeat.orderId, result.orderId);
  assert.equal(h.calls.post, 1);
});
test('browser cannot check another user order or convert a pending payment to premium', async () => {
  const h = harness();
  const order = await h.api.createPixCheckout(h.request('alice', { cpf }));
  await assert.rejects(h.api.checkPixCheckout(h.request('bob', { orderId: order.orderId })), e => e.code === 'permission-denied');
  const status = await h.api.checkPixCheckout(h.request('alice', { orderId: order.orderId, status: 'approved', adFreeLifetime: true }));
  assert.equal(status.adFreeLifetime, false);
});
test('approved payment grants once, repeat is idempotent, refund revokes only this benefit', async () => {
  const h = harness();
  const order = await h.api.createPixCheckout(h.request('alice', { cpf }));
  h.payments.get(order.paymentId).status = 'approved';
  let status = await h.api.checkPixCheckout(h.request('alice', { orderId: order.orderId }));
  assert.equal(status.adFreeLifetime, true);
  const after = h.calls.setClaims;
  status = await h.api.checkPixCheckout(h.request('alice', { orderId: order.orderId }));
  assert.equal(h.calls.setClaims, after);
  assert.equal(status.adFreeLifetime, true);
  h.payments.get(order.paymentId).status = 'refunded';
  h.payments.get(order.paymentId).transaction_amount_refunded = 5;
  status = await h.api.getMonetizationStatus(h.request());
  assert.equal(status.adFreeLifetime, false);
  assert.equal(h.users.get('alice').customClaims.unrelatedRole, 'member');
});
test('forged billing flags never grant an entitlement', async () => {
  const h = harness();
  h.documents.set('billingAccounts/alice', { adFreeLifetime: true, paymentId: '123' });
  const result = await h.api.getMonetizationStatus(h.request());
  assert.equal(result.adFreeLifetime, false);
});
test('tampered order uid cannot steal a paid purchase', async () => {
  const h = harness();
  const order = await h.api.createPixCheckout(h.request('alice', { cpf }));
  h.payments.get(order.paymentId).status = 'approved';
  h.documents.get('billingOrders/' + order.orderId).uid = 'bob';
  await assert.rejects(h.api.checkPixCheckout(h.request('bob', { orderId: order.orderId })), e => e.code === 'permission-denied');
  assert.notEqual(h.users.get('bob').customClaims.adFreeLifetime, true);
});
test('webhook ignores body approval, reads provider and grants after real approval', async () => {
  const h = harness();
  const order = await h.api.createPixCheckout(h.request('alice', { cpf }));
  assert.equal((await h.webhook(order.paymentId, 'approved')).status, 200);
  assert.equal(h.users.get('alice').customClaims.adFreeLifetime, false);
  h.payments.get(order.paymentId).status = 'approved';
  assert.equal((await h.webhook(order.paymentId, 'pending')).status, 200);
  assert.equal(h.users.get('alice').customClaims.adFreeLifetime, true);
});
test('webhook fails for retry when entitlement could not be committed', async () => {
  const h = harness();
  const order = await h.api.createPixCheckout(h.request('alice', { cpf }));
  h.payments.get(order.paymentId).status = 'approved';
  h.setFailClaims(true);
  assert.equal((await h.webhook(order.paymentId)).status, 503);
  h.setFailClaims(false);
  assert.equal((await h.webhook(order.paymentId)).status, 200);
  assert.equal(h.users.get('alice').customClaims.adFreeLifetime, true);
});
test('refunding one payment preserves a different approved purchase', async () => {
  const h = harness();
  const first = await h.api.createPixCheckout(h.request('alice', { cpf }));
  const id = '4000';
  const secondOrder = 'a6ca7e62-b8fb-4b66-8140-b3b85cf8295b';
  const second = { ...h.payments.get(first.paymentId), id, status: 'approved', external_reference: '4j_' + secondOrder, metadata: { firebase_uid: 'alice', order_id: secondOrder, sku: core.SKU } };
  h.documents.set('billingOrders/' + secondOrder, { uid: 'alice', orderId: secondOrder, paymentId: id, sku: core.SKU, amountCents: 500, currency: 'BRL' });
  h.payments.set(id, second);
  h.payments.get(first.paymentId).status = 'approved';
  await h.api.checkPixCheckout(h.request('alice', { orderId: first.orderId }));
  await h.webhook(id);
  h.payments.get(first.paymentId).status = 'charged_back';
  await h.webhook(first.paymentId);
  assert.equal(h.users.get('alice').customClaims.adFreeLifetime, true);
  assert.deepEqual(h.users.get('alice').customClaims.adFreePaymentIds, [id]);
});

test('recovers a lost payment response by provider reference without a second charge', async () => {
  const h = harness();
  const first = await h.api.createPixCheckout(h.request('alice', { cpf }));
  delete h.documents.get('billingOrders/' + first.orderId).paymentId;
  const recovered = await h.api.createPixCheckout(h.request('alice', { cpf }));
  assert.equal(recovered.paymentId, first.paymentId);
  assert.equal(recovered.orderId, first.orderId);
  assert.equal(h.calls.post, 1);
});
test('expired reservation with no provider payment can be replaced', async () => {
  const h = harness();
  const first = await h.api.createPixCheckout(h.request('alice', { cpf }));
  const stored = h.documents.get('billingOrders/' + first.orderId);
  delete stored.paymentId;
  stored.expiresAt = '2020-01-01T00:00:00Z';
  h.payments.delete(first.paymentId);
  h.documents.get('billingAccounts/alice').lastCreatedAt = Date.now() - 61000;
  const renewed = await h.api.createPixCheckout(h.request('alice', { cpf }));
  assert.notEqual(renewed.orderId, first.orderId);
  assert.equal(renewed.adFreeLifetime, false);
});
