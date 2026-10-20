'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID, createHmac } = require('node:crypto');
const { createBillingService, BillingError } = require('../billing.cjs');
const core = require('../../functions/payment-core');
const fixture = require('../../functions/test/fixtures');
const clone = value => JSON.parse(JSON.stringify(value));
function makeD1() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync(require.resolve('../schema.sql'), 'utf8'));
  const flags = { partialBatchFailure: false, zeroOrderUpdate: false, zeroReceiptUpdate: false, beforeFinalBatch: null };
  function prepared(query, params = []) {
    return {
      query,
      bind(...values) { return prepared(query, values); },
      async first() { return sql.prepare(query).get(...params) || null; },
      async all() { return { results: sql.prepare(query).all(...params) }; },
      async run() {
        if (/^SELECT /.test(query)) return { success: true, results: sql.prepare(query).all(...params), meta: { changes: 0 } };
        if (flags.zeroReceiptUpdate && query.startsWith('INSERT INTO billingAccounts(uid, adFreeLifetime, updatedAt)')) {
          flags.zeroReceiptUpdate = false;
          return { success: true, results: [], meta: { changes: 0 } };
        }
        if (flags.zeroOrderUpdate && /^UPDATE billingOrders SET.*providerStatus/.test(query)) {
          flags.zeroOrderUpdate = false;
          return { success: true, results: [], meta: { changes: 0 } };
        }
        return { success: true, results: [], meta: { changes: Number(sql.prepare(query).run(...params).changes) } };
      },
    };
  }
  return {
    sql, flags, prepare: query => prepared(query),
    async batch(statements) {
      if (flags.beforeFinalBatch && statements.some(item => /^DELETE FROM billingLocks/.test(item.query))) {
        const hook = flags.beforeFinalBatch; flags.beforeFinalBatch = null; await hook();
      }
      if (flags.partialBatchFailure && statements.some(item => /^INSERT INTO billingOrders/.test(item.query))) {
        flags.partialBatchFailure = false;
        await statements[0].run();
        throw Error('Synthetic partial batch failure');
      }
      sql.exec('BEGIN');
      try { const result = []; for (const item of statements) result.push(await item.run()); sql.exec('COMMIT'); return result; }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
}
function setup(overrides = {}) {
  const db = makeD1();
  let clock = Date.parse('2026-10-15T12:00:00Z');
  const config = { projectId: 'demo-4j-pix', testProjectId: 'demo-4j-pix', productionProjectId: 'production-4j-pix',
    collectorId: '5678', applicationId: '9012', liveMode: false, paymentsEnabled: true,
    accessToken: 'synthetic-token', webhookSecret: 'synthetic-secret', ...overrides };
  const actor = { uid: 'alice', email: 'alice@example.invalid', emailVerified: true, active: true };
  const bob = { ...actor, uid: 'bob', email: 'bob@example.invalid' };
  const merchant = { id: 5678, country_id: 'BR', site_id: 'MLB', tags: ['test_user'] };
  const orders = new Map(), keys = new Map();
  const calls = { posts: [], gets: 0, merchant: 0 };
  const control = { postBefore: 0, postAfter: 0, getFailure: 0, asyncOrder: false, nextGetHook: null };
  const stored = id => db.sql.prepare('SELECT * FROM billingOrders WHERE orderId=?').get(id);
  const remote = id => orders.get(stored(id).providerOrderId);
  async function fetchImpl(url, options) {
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.Authorization, 'Bearer synthetic-token');
    if (url === 'https://api.mercadopago.com/users/me') { calls.merchant++; return { ok: true, json: async () => clone(merchant) }; }
    assert.ok(url.startsWith('https://api.mercadopago.com/v1/orders'));
    assert.equal(url.includes('/search'), false);
    if (options.method === 'POST') {
      const body = JSON.parse(options.body), key = options.headers['X-Idempotency-Key'];
      calls.posts.push({ key, body: options.body });
      assert.equal(body.total_amount, '5.00'); assert.equal(body.type, 'online'); assert.equal(body.processing_mode, 'automatic');
      assert.deepEqual(body.transactions.payments, [{ amount: '5.00', payment_method: { id: 'pix', type: 'bank_transfer' }, expiration_time: 'PT24H' }]);
      assert.equal(body.payer.identification, undefined);
      if (control.postBefore-- > 0) throw Error('Synthetic unknown response');
      if (keys.has(key)) {
        const original = calls.posts.find(item => item.key === key);
        assert.equal(original.body, options.body);
        return { ok: true, json: async () => clone(orders.get(keys.get(key))) };
      }
      const n = orders.size + 1;
      const value = fixture.provider({ id: 'ORDTST' + String(n).padStart(26, '0'), external_reference: body.external_reference,
        status: 'action_required', status_detail: 'waiting_transfer', total_paid_amount: '0.00', last_updated_date: new Date(clock).toISOString() });
      Object.assign(value.transactions.payments[0], { id: fixture.paymentId(n), status: 'action_required', status_detail: 'waiting_transfer', paid_amount: '0.00' });
      if (control.asyncOrder) { value.status = 'processing'; value.status_detail = 'in_process'; value.transactions = {}; }
      orders.set(value.id, value); keys.set(key, value.id);
      if (control.postAfter-- > 0) throw Error('Synthetic response lost after creation');
      return { ok: true, json: async () => ({ id: value.id }) };
    }
    calls.gets++;
    if (control.getFailure-- > 0) return { ok: false };
    const value = orders.get(url.split('/').pop());
    const snapshot = value && clone(value);
    const hook = control.nextGetHook; control.nextGetHook = null;
    if (hook) await hook();
    return snapshot ? { ok: true, json: async () => snapshot } : { ok: false };
  }
  const service = createBillingService({ db, fetchImpl, now: () => clock, uuid: randomUUID, config });
  const account = (uid = 'alice') => db.sql.prepare('SELECT * FROM billingAccounts WHERE uid=?').get(uid);
  async function webhook(id, patch = {}) {
    const ts = String(clock), requestId = 'synthetic-request';
    const signature = createHmac('sha256', config.webhookSecret).update('id:' + id.toLowerCase() + ';request-id:' + requestId + ';ts:' + ts + ';').digest('hex');
    return service.webhook({ headers: new Headers({ 'x-request-id': requestId, 'x-signature': 'ts=' + ts + ',v1=' + signature }),
      query: new URLSearchParams({ 'data.id': id, type: 'order' }), body: { type: 'order', live_mode: true, user_id: 'attacker', data: { status: 'processed' } }, ...patch });
  }
  return { db, config, actor, bob, merchant, orders, calls, control, service, stored, remote, account, webhook,
    advance: ms => { clock += ms; }, now: () => clock };
}
test('status with no paid order is false without contacting Mercado Pago', async () => {
  const h = setup({ accessToken: '', collectorId: '', applicationId: '' });
  assert.equal((await h.service.getStatus(h.actor)).adFreeLifetime, false);
  assert.equal(h.calls.merchant, 0); assert.equal(h.calls.gets, 0);
  h.db.sql.prepare('UPDATE billingAccounts SET adFreeLifetime=1 WHERE uid=?').run('alice');
  assert.equal((await h.service.getStatus(h.actor)).adFreeLifetime, false);
});
test('new purchase gates authentication, email, activation, project and merchant before charge', async () => {
  const h = setup();
  await assert.rejects(h.service.create(null), e => e instanceof BillingError && e.code === 'unauthenticated');
  await assert.rejects(h.service.create({ ...h.actor, emailVerified: false }), e => e.code === 'failed-precondition');
  await assert.rejects(h.service.create({ ...h.actor, active: false }), e => e.code === 'permission-denied');
  h.config.paymentsEnabled = false;
  await assert.rejects(h.service.create(h.actor), e => e.code === 'failed-precondition');
  h.config.paymentsEnabled = true; h.config.projectId = h.config.productionProjectId;
  await assert.rejects(h.service.create(h.actor), e => e.code === 'failed-precondition');
  h.config.projectId = h.config.testProjectId; h.merchant.tags = [];
  await assert.rejects(h.service.create(h.actor), e => e.code === 'failed-precondition');
  assert.equal(h.calls.posts.length, 0);
});
test('D1 reservation binds UID, fixed product and immutable email payload with no CPF', async () => {
  const h = setup(); const first = await h.service.create({ ...h.actor, cpf: 'DO-NOT-STORE', amount: 1 });
  const saved = h.stored(first.orderId);
  assert.equal(saved.uid, 'alice'); assert.equal(saved.amountCents, 500); assert.equal(saved.currency, 'BRL');
  assert.equal(JSON.stringify(saved).includes('DO-NOT-STORE'), false);
  assert.equal(JSON.parse(saved.requestPayload).payer.first_name, 'APRO');
  assert.equal((await h.service.create(h.actor)).orderId, first.orderId);
  assert.equal(h.calls.posts.length, 1);
});
test('production never includes sandbox APRO and rejects test-user token', async () => {
  const h = setup({ liveMode: true, projectId: 'production-4j-pix' });
  await assert.rejects(h.service.create(h.actor), e => e.code === 'failed-precondition');
  h.merchant.tags = ['normal'];
  const first = await h.service.create(h.actor);
  assert.equal(JSON.parse(h.stored(first.orderId).requestPayload).payer.first_name, undefined);
});
test('pending and async orders resume while new purchases are off; status exposes only the internal id', async () => {
  for (const asyncOrder of [false, true]) {
    const h = setup(); h.control.asyncOrder = asyncOrder; const first = await h.service.create(h.actor);
    h.config.paymentsEnabled = false;
    const status = await h.service.getStatus(h.actor);
    assert.equal(status.pendingOrderId, first.orderId); assert.equal(status.paymentsEnabled, false);
    assert.deepEqual(Object.keys(status).sort(), ['adFreeLifetime','currency','paymentsEnabled','pendingOrderId','pilotMode','price']);
    const result = await h.service.check(h.actor, { orderId: first.orderId });
    assert.equal(result.status, asyncOrder ? 'in_process' : 'pending');
    if (asyncOrder) { assert.equal(result.qrCode, ''); assert.equal(result.paymentId, ''); }
    await assert.rejects(h.service.create(h.actor), e => e.code === 'failed-precondition');
  }
});
test('cross-account check is denied and raw SQL cannot point a different owner account to the order', async () => {
  const h = setup(); const first = await h.service.create(h.actor);
  await assert.rejects(h.service.check(h.bob, { orderId: first.orderId }), e => e.code === 'permission-denied');
  assert.equal((await h.service.getStatus(h.bob)).pendingOrderId, null);
  h.db.sql.prepare('INSERT INTO billingAccounts(uid) VALUES (?)').run(h.bob.uid);
  assert.throws(() => h.db.sql.prepare('UPDATE billingAccounts SET activeOrderId=? WHERE uid=?').run(first.orderId, 'bob'), /FOREIGN KEY/);
});
test('bound webhook reads provider and grants only real accreditation, without Firebase claims', async () => {
  const h = setup(); const first = await h.service.create(h.actor); const provider = h.remote(first.orderId);
  assert.equal((await h.webhook(provider.id)).status, 200); assert.equal(h.account().adFreeLifetime, 0);
  fixture.approve(provider);
  assert.equal((await h.webhook(provider.id.toLowerCase())).status, 200);
  assert.equal(h.account().adFreeLifetime, 1); assert.equal(h.stored(first.orderId).paid, 1);
  assert.equal((await h.service.getStatus(h.actor)).adFreeLifetime, true);
  assert.equal((await h.service.getStatus(h.actor)).pendingOrderId, null);
  assert.equal((await h.service.create(h.actor)).adFreeLifetime, true);
  assert.equal(h.calls.posts.length, 1);
});
test('webhook signature, topic and order binding are required', async () => {
  const h = setup(); const first = await h.service.create(h.actor); const provider = h.remote(first.orderId);
  assert.equal((await h.webhook(provider.id, { headers: new Headers() })).status, 401);
  assert.equal((await h.webhook(provider.id, { query: new URLSearchParams({ 'data.id': provider.id, type: 'payment' }), body: { type: 'payment' } })).status, 400);
  fixture.approve(provider); provider.user_id = '9999';
  assert.equal((await h.webhook(provider.id)).status, 503);
  assert.equal(h.account().adFreeLifetime, 0);
});
for (const mutate of [
  p => { p.status_detail = 'partially_refunded'; },
  p => { p.transactions.payments[0].refunded_amount = '1.00'; },
  p => { p.transactions.chargebacks = [{ id: 'CBK-SYNTHETIC', status: 'in_process' }]; },
  p => { p.status = 'refunded'; p.status_detail = 'refunded'; },
]) test('provider reversal revokes D1 entitlement: ' + String(mutate), async () => {
  const h = setup(); const first = await h.service.create(h.actor); const provider = h.remote(first.orderId);
  fixture.approve(provider); await h.webhook(provider.id); assert.equal(h.account().adFreeLifetime, 1);
  mutate(provider); assert.equal((await h.webhook(provider.id)).status, 200);
  assert.equal(h.stored(first.orderId).paid, 0); assert.equal(h.account().adFreeLifetime, 0);
  assert.equal((await h.service.getStatus(h.actor)).adFreeLifetime, false);
});
test('provider failure cannot return a paid entitlement from the D1 cache', async () => {
  const h = setup(); const first = await h.service.create(h.actor); fixture.approve(h.remote(first.orderId));
  await h.service.check(h.actor, { orderId: first.orderId });
  h.control.getFailure = 1;
  await assert.rejects(h.service.getStatus(h.actor), e => e.code === 'unavailable');
});
test('lost POST response retains exact payload/key after email change and expiration', async () => {
  const h = setup(); h.control.postAfter = 1;
  await assert.rejects(h.service.create(h.actor), e => e.code === 'unavailable');
  const id = h.account().activeOrderId; assert.equal(h.stored(id).providerOrderId, null);
  h.advance(2 * 86400000); h.actor.email = 'changed@example.invalid';
  assert.equal((await h.service.create(h.actor)).orderId, id);
  assert.equal(h.orders.size, 1);
  assert.deepEqual(h.calls.posts[0], h.calls.posts[1]);
});
test('unknown response before provider creation and failed GET do not create a new reservation', async () => {
  const h = setup(); h.control.postBefore = 1;
  await assert.rejects(h.service.create(h.actor), e => e.code === 'unavailable');
  const id = h.account().activeOrderId; h.control.getFailure = 1;
  await assert.rejects(h.service.create(h.actor), e => e.code === 'unavailable');
  assert.ok(h.stored(id).providerOrderId);
  assert.equal((await h.service.create(h.actor)).orderId, id);
  assert.equal(h.orders.size, 1); assert.equal(h.calls.posts.length, 2);
});
test('provider-state expiration permits a new charge; clock expiration alone does not', async () => {
  const h = setup(); const first = await h.service.create(h.actor); h.advance(2 * 86400000);
  assert.equal((await h.service.create(h.actor)).orderId, first.orderId);
  const provider = h.remote(first.orderId);
  provider.status = 'expired'; provider.status_detail = 'expired'; provider.transactions.payments[0].status = 'expired';
  assert.notEqual((await h.service.create(h.actor)).orderId, first.orderId);
  assert.equal(h.orders.size, 2);
});
test('malformed provider payment collection never permits a second charge', async () => {
  const h = setup(); const first = await h.service.create(h.actor); h.advance(61000);
  const provider = h.remote(first.orderId); fixture.approve(provider);
  provider.status = 'expired'; provider.total_paid_amount = '0.00';
  provider.transactions.payments = provider.transactions.payments[0];
  await assert.rejects(h.service.create(h.actor), e => e.code === 'failed-precondition');
  assert.equal(h.orders.size, 1); assert.equal(h.calls.posts.length, 1);
});
test('SQLite atomic lock allows only one concurrent creation', async () => {
  const h = setup();
  const result = await Promise.allSettled([h.service.create(h.actor), h.service.create(h.actor)]);
  assert.equal(result.filter(value => value.status === 'fulfilled').length, 1);
  assert.equal(result.find(value => value.status === 'rejected').reason.code, 'aborted');
  assert.equal(h.orders.size, 1); assert.equal(h.calls.posts.length, 1);
});
test('expired lock fencing rejects a stale approved response after a successor processed refund', async () => {
  const h = setup(); const first = await h.service.create(h.actor); const provider = h.remote(first.orderId); fixture.approve(provider);
  let entered, release;
  const reached = new Promise(resolve => { entered = resolve; });
  const paused = new Promise(resolve => { release = resolve; });
  h.control.nextGetHook = async () => { entered(); await paused; };
  const stale = h.service.check(h.actor, { orderId: first.orderId });
  await reached; h.advance(181000);
  provider.status = 'refunded'; provider.status_detail = 'refunded';
  assert.equal((await h.service.check(h.actor, { orderId: first.orderId })).adFreeLifetime, false);
  release();
  await assert.rejects(stale, e => e.code === 'aborted');
  assert.equal(h.stored(first.orderId).paid, 0); assert.equal(h.stored(first.orderId).providerStatus, 'refunded');
  assert.equal(h.account().adFreeLifetime, 0);
});
test('D1 constraints protect payload/owner/product and unique provider IDs', async () => {
  const h = setup(); const first = await h.service.create(h.actor);
  assert.throws(() => h.db.sql.prepare('UPDATE billingOrders SET uid=? WHERE orderId=?').run('bob', first.orderId), /immutable/);
  assert.throws(() => h.db.sql.prepare('UPDATE billingOrders SET requestPayload=? WHERE orderId=?').run('{}', first.orderId), /immutable/);
  assert.throws(() => h.db.sql.prepare('UPDATE billingOrders SET amountCents=1 WHERE orderId=?').run(first.orderId), /immutable/);
  assert.throws(() => h.db.sql.prepare('UPDATE billingOrders SET providerOrderId=? WHERE orderId=?').run(fixture.providerId(99), first.orderId), /already bound/);
  const other = await h.service.create(h.bob);
  assert.throws(() => h.db.sql.prepare('UPDATE billingOrders SET providerOrderId=? WHERE orderId=?').run(h.stored(first.orderId).providerOrderId, other.orderId));
});
test('partial local batch failure cannot contact Mercado Pago or strand a charge', async () => {
  const h = setup(); h.db.flags.partialBatchFailure = true;
  await assert.rejects(h.service.create(h.actor), e => e.code === 'unavailable');
  assert.equal(h.calls.posts.length, 0);
  assert.equal((await h.service.create(h.actor)).status, 'pending');
  assert.equal(h.orders.size, 1);
});
test('daily generation limit remains five after terminal provider states', async () => {
  const h = setup();
  for (let i=0; i<5; i++) {
    const result = await h.service.create(h.actor); const provider = h.remote(result.orderId);
    provider.status = 'expired'; provider.status_detail = 'expired'; provider.transactions.payments[0].status = 'expired';
    h.advance(61000);
  }
  await assert.rejects(h.service.create(h.actor), e => e.code === 'resource-exhausted');
  assert.equal(h.orders.size, 5);
});

function seed(h, number, paid = true, bindProvider = true) {
  const orderId = randomUUID(), id = fixture.providerId(number);
  const provider = fixture.provider({ id, external_reference: core.reference(orderId) });
  h.orders.set(id, provider);
  h.db.sql.prepare('INSERT INTO billingOrders(orderId,uid,sku,amountCents,currency,collectorId,applicationId,liveMode,projectId,requestPayload,expiresAt,createdAt,providerOrderId,paid) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(orderId,h.actor.uid,core.SKU,500,'BRL',h.config.collectorId,h.config.applicationId,0,h.config.projectId,
      JSON.stringify(core.createOrderBody(orderId,h.actor.email,false)),new Date(h.now()+86400000).toISOString(),h.now(),bindProvider?id:null,paid?1:0);
  return { orderId, provider };
}
test('ten paid orders are the maximum in both service and SQL constraints', async () => {
  const h = setup();
  for(let i=1;i<=10;i++) seed(h,i);
  assert.throws(() => seed(h,11), /paid order limit/);
  const next = seed(h,12,false);
  assert.throws(() => h.db.sql.prepare('UPDATE billingOrders SET paid=1 WHERE orderId=?').run(next.orderId), /paid order limit/);
  assert.equal((await h.webhook(next.provider.id)).status,503);
  assert.equal(h.stored(next.orderId).paid,0);
  assert.equal((await h.service.getStatus(h.actor)).adFreeLifetime,true);
});
test('refunding one purchase preserves a different revalidated paid order', async () => {
  const h = setup(); const one=seed(h,1),two=seed(h,2);
  one.provider.status='refunded';one.provider.status_detail='refunded';
  assert.equal((await h.webhook(one.provider.id)).status,200);
  assert.equal(h.stored(one.orderId).paid,0);assert.equal(h.stored(two.orderId).paid,1);
  assert.equal(h.account().adFreeLifetime,1);
  assert.equal((await h.service.getStatus(h.actor)).adFreeLifetime,true);
});

test('provider redirects fail closed without forwarding bearer or accepting redirected content', async () => {
  for (const response of [
    { ok: false, status: 302, redirected: false },
    { ok: true, status: 307, redirected: false },
    { ok: true, status: 200, redirected: true },
  ]) {
    const h = setup();
    const requests = [];
    let bodyRead = false;
    const fetchImpl = async (url, options) => {
      requests.push({ url, redirect: options.redirect, authorization: options.headers.Authorization });
      assert.equal(options.redirect, 'manual', 'must run on workerd without automatic redirects');
      return { ...response, headers: new Headers({ Location: 'https://untrusted.example.invalid/capture' }),
        json: async () => { bodyRead = true; return clone(h.merchant); } };
    };
    const service = createBillingService({ db: h.db, config: h.config, now: h.now, fetchImpl });
    await assert.rejects(service.create(h.actor), error => error.code === 'unavailable');
    assert.equal(bodyRead, false);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://api.mercadopago.com/users/me');
    assert.equal(requests[0].authorization, 'Bearer synthetic-token');
    assert.equal(h.db.sql.prepare('SELECT COUNT(*) AS count FROM billingOrders').get().count, 0);

    const pending = await h.service.create(h.actor);
    requests.length = 0;
    await assert.rejects(service.check(h.actor, { orderId: pending.orderId }), error => error.code === 'unavailable');
    assert.equal(requests.length, 1);
    assert.ok(requests.every(request => new URL(request.url).origin === 'https://api.mercadopago.com'));
    assert.equal(h.stored(pending.orderId).paid, 0);
    assert.equal(h.calls.posts.length, 1, 'redirect failure cannot create another payment');
  }
});

test('reopening status reconciles a paid pending order without webhook or another checkout', async () => {
  const h = setup(); const first = await h.service.create(h.actor);
  fixture.approve(h.remote(first.orderId));
  h.config.paymentsEnabled = false;
  const inactive = { ...h.actor, active: false, emailVerified: false };
  const status = await h.service.getStatus(inactive);
  assert.deepEqual(status, { adFreeLifetime: true, pendingOrderId: null, price: 5, currency: 'BRL', paymentsEnabled: false, pilotMode: false });
  assert.equal(h.stored(first.orderId).paid, 1);
  assert.equal(h.account().adFreeLifetime, 1);
  assert.equal((await h.service.getStatus(inactive)).adFreeLifetime, true);
  assert.equal(h.calls.posts.length, 1);
});
test('status never submits a reservation whose provider response is still unknown', async () => {
  const h = setup(); h.control.postAfter = 1;
  await assert.rejects(h.service.create(h.actor), error => error.code === 'unavailable');
  const reserved = h.account().activeOrderId;
  assert.equal(h.stored(reserved).providerOrderId, null);
  const before = { merchant: h.calls.merchant, gets: h.calls.gets, posts: h.calls.posts.length };
  const status = await h.service.getStatus(h.actor);
  assert.equal(status.adFreeLifetime, false); assert.equal(status.pendingOrderId, null);
  assert.deepEqual({ merchant: h.calls.merchant, gets: h.calls.gets, posts: h.calls.posts.length }, before);
  assert.equal(h.account().activeOrderId, reserved);
});
test('status ignores an active pointer to another UID without consulting its provider order', async () => {
  const h = setup(); const first = await h.service.create(h.actor);
  fixture.approve(h.remote(first.orderId));
  // Simulate a corrupt legacy pointer; the service must still enforce its own JOIN.
  h.db.sql.exec('PRAGMA foreign_keys=OFF');
  h.db.sql.prepare('INSERT INTO billingAccounts(uid,activeOrderId) VALUES (?,?)').run(h.bob.uid, first.orderId);
  const before = { merchant: h.calls.merchant, gets: h.calls.gets };
  const status = await h.service.getStatus(h.bob);
  assert.equal(status.adFreeLifetime, false); assert.equal(status.pendingOrderId, null);
  assert.deepEqual({ merchant: h.calls.merchant, gets: h.calls.gets }, before);
  assert.equal(h.stored(first.orderId).paid, 0);
});
test('status rejects corrupt product or environment binding before fetching the pending order', async () => {
  for (const [field, value] of [
    ['sku', 'other_product'], ['amountCents', 1], ['currency', 'USD'],
    ['collectorId', '9999'], ['applicationId', '9999'], ['liveMode', 1], ['projectId', 'other-project']
  ]) {
    const h = setup(); const first = await h.service.create(h.actor);
    fixture.approve(h.remote(first.orderId));
    h.db.sql.exec('DROP TRIGGER billingOrders_immutable; PRAGMA ignore_check_constraints=ON');
    h.db.sql.prepare('UPDATE billingOrders SET ' + field + '=? WHERE orderId=?').run(value, first.orderId);
    const before = { merchant: h.calls.merchant, gets: h.calls.gets };
    await assert.rejects(h.service.getStatus(h.actor), error => error.code === 'failed-precondition');
    assert.deepEqual({ merchant: h.calls.merchant, gets: h.calls.gets }, before);
    assert.equal(h.stored(first.orderId).paid, 0);
    assert.equal(h.account().adFreeLifetime, 0);
    assert.equal(h.calls.posts.length, 1);
  }
});
test('status validates the fetched provider against the exact active local order', async () => {
  const h = setup(); const first = await h.service.create(h.actor);
  const provider = h.remote(first.orderId); fixture.approve(provider);
  provider.external_reference = core.reference(randomUUID());
  await assert.rejects(h.service.getStatus(h.actor), error => error.code === 'failed-precondition');
  assert.equal(h.stored(first.orderId).paid, 0);
  assert.equal(h.account().adFreeLifetime, 0);
  assert.equal(h.calls.posts.length, 1);
});
test('pending reconciliation fails closed and never returns an unverified cached benefit', async () => {
  const h = setup(); const first = await h.service.create(h.actor);
  fixture.approve(h.remote(first.orderId));
  h.db.sql.prepare('UPDATE billingAccounts SET adFreeLifetime=1 WHERE uid=?').run(h.actor.uid);
  h.control.getFailure = 1;
  await assert.rejects(h.service.getStatus(h.actor), error => error.code === 'unavailable');
  assert.equal(h.account().adFreeLifetime, 0);
  assert.equal(h.stored(first.orderId).paid, 0);
  assert.equal(h.calls.posts.length, 1);
  assert.equal((await h.service.getStatus(h.actor)).adFreeLifetime, true);
});
test('pending status reconciliation fences a late approved result after a successor sees refund', async () => {
  const h = setup(); const first = await h.service.create(h.actor);
  const provider = h.remote(first.orderId); fixture.approve(provider);
  let entered, release;
  const reached = new Promise(resolve => { entered = resolve; });
  const paused = new Promise(resolve => { release = resolve; });
  h.control.nextGetHook = async () => { entered(); await paused; };
  const stale = h.service.getStatus(h.actor);
  const rejected = assert.rejects(stale, error => error.code === 'aborted');
  await reached; h.advance(180001);
  provider.status_detail = 'partially_refunded';
  const current = await h.service.getStatus(h.actor);
  assert.equal(current.adFreeLifetime, false); assert.equal(current.pendingOrderId, first.orderId);
  release(); await rejected;
  assert.equal(h.stored(first.orderId).paid, 0); assert.equal(h.account().adFreeLifetime, 0);
  assert.equal(h.calls.posts.length, 1);
});

test('exact-case signed webhook rechecks refund on replay; invalid or omitted-ID HMAC never reaches MP or D1', async () => {
  const h = setup(); const first = await h.service.create(h.actor); const provider = h.remote(first.orderId);
  fixture.approve(provider);
  const requestId = 'synthetic-exact-case', ts = String(h.now());
  const signed = manifest => new Headers({ 'x-request-id': requestId, 'x-signature': 'ts=' + ts + ',v1=' + createHmac('sha256', h.config.webhookSecret).update(manifest).digest('hex') });
  const exact = signed('id:' + provider.id + ';request-id:' + requestId + ';ts:' + ts + ';');
  const before = clone(h.calls), accountBefore = { ...h.account() }, orderBefore = { ...h.stored(first.orderId) };
  for (const headers of [signed('request-id:' + requestId + ';ts:' + ts + ';'), signed('id:' + fixture.providerId(999) + ';request-id:' + requestId + ';ts:' + ts + ';')]) {
    assert.equal((await h.webhook(provider.id, { headers })).status, 401);
    assert.deepEqual(h.calls, before); assert.deepEqual({ ...h.account() }, accountBefore); assert.deepEqual({ ...h.stored(first.orderId) }, orderBefore);
  }
  assert.equal((await h.webhook(provider.id, { headers: exact })).status, 200);
  assert.equal(h.account().adFreeLifetime, 1);
  provider.transactions.payments[0].refunded_amount = '1.00';
  for (let replay = 0; replay < 2; replay++) {
    assert.equal((await h.webhook(provider.id, { headers: exact })).status, 200);
    assert.equal(h.account().adFreeLifetime, 0); assert.equal(h.stored(first.orderId).paid, 0);
  }
  assert.equal(h.calls.posts.length, 1);
});

function trackReconciliations(h) {
  h.db.sql.exec('CREATE TABLE reconciliations(orderId TEXT); CREATE TRIGGER countReconciliation AFTER UPDATE OF providerStatus ON billingOrders BEGIN INSERT INTO reconciliations VALUES(NEW.orderId); END;');
  return () => {
    const rows = h.db.sql.prepare('SELECT orderId FROM reconciliations').all();
    h.db.sql.exec('DELETE FROM reconciliations');
    return rows.map(row => row.orderId);
  };
}

test('creation, reuse, check and webhook each record their candidate once', async () => {
  const h = setup(), updates = trackReconciliations(h);
  const first = await h.service.create(h.actor);
  assert.deepEqual(updates(), [first.orderId]);
  assert.equal((await h.service.create(h.actor)).orderId, first.orderId);
  assert.deepEqual(updates(), [first.orderId]);
  fixture.approve(h.remote(first.orderId));
  assert.equal((await h.service.check(h.actor, { orderId: first.orderId })).adFreeLifetime, true);
  assert.deepEqual(updates(), [first.orderId]);
  assert.equal((await h.webhook(h.remote(first.orderId).id)).status, 200);
  assert.deepEqual(updates(), [first.orderId]);
  assert.equal(h.calls.posts.length, 1);
});

test('a refunded candidate still reconciles every other paid order without duplicate writes', async () => {
  const h = setup(), first = seed(h, 1), second = seed(h, 2), updates = trackReconciliations(h);
  assert.equal((await h.service.getStatus(h.actor)).adFreeLifetime, true);
  assert.deepEqual(updates().sort(), [first.orderId, second.orderId].sort());
  first.provider.transactions.payments[0].refunded_amount = '1.00';
  const getsBefore = h.calls.gets;
  assert.equal((await h.service.check(h.actor, { orderId: first.orderId })).adFreeLifetime, true);
  assert.deepEqual(updates().sort(), [first.orderId, second.orderId].sort());
  assert.equal(h.calls.gets - getsBefore, 2);
  assert.equal(h.stored(first.orderId).paid, 0); assert.equal(h.stored(second.orderId).paid, 1);
  second.provider.status = 'refunded'; second.provider.status_detail = 'refunded';
  assert.equal((await h.service.check(h.actor, { orderId: second.orderId })).adFreeLifetime, false);
  assert.deepEqual(updates(), [second.orderId]);
  assert.equal(h.account().adFreeLifetime, 0);
});

test('candidate binding failure performs no reconciliation or receipt update', async () => {
  const h = setup(), first = seed(h, 1), second = seed(h, 2), updates = trackReconciliations(h);
  await h.service.getStatus(h.actor); updates();
  const before = { ...h.account() };
  first.provider.integration_data = { application_id: 'wrong-application' };
  await assert.rejects(h.service.check(h.actor, { orderId: first.orderId }), e => e.code === 'failed-precondition');
  assert.deepEqual(updates(), []); assert.deepEqual({ ...h.account() }, before);
  assert.equal(h.stored(second.orderId).paid, 1);
});

test('pilot reuses its pending order and never reserves a replacement after a terminal state or new day', async () => {
  for (const terminal of ['expired', 'failed', 'refunded']) {
    const h = setup({ pilotMode: true }), first = await h.service.create(h.actor);
    assert.equal((await h.service.create(h.actor)).orderId, first.orderId);
    const provider = h.remote(first.orderId);
    if (terminal === 'refunded') {
      fixture.approve(provider); provider.status_detail = 'refunded';
      provider.transactions.payments[0].refunded_amount = '5.00';
    } else {
      provider.status = terminal; provider.status_detail = terminal;
      provider.transactions.payments[0].status = terminal;
    }
    h.advance(2 * 86400000);
    await assert.rejects(h.service.create(h.actor), e => e.code === 'resource-exhausted');
    assert.equal(h.calls.posts.length, 1); assert.equal(h.orders.size, 1);
    assert.equal(h.db.sql.prepare('SELECT COUNT(*) AS count FROM billingOrders WHERE uid=?').get(h.actor.uid).count, 1);
  }
});

test('pilot retries an unknown POST with the original reservation and idempotency key', async () => {
  const h = setup({ pilotMode: true }); h.control.postAfter = 1;
  await assert.rejects(h.service.create(h.actor), e => e.code === 'unavailable');
  const reserved = h.account().activeOrderId;
  assert.equal((await h.service.create(h.actor)).orderId, reserved);
  assert.deepEqual(h.calls.posts[0], h.calls.posts[1]); assert.equal(h.orders.size, 1);
  assert.equal(h.db.sql.prepare('SELECT COUNT(*) AS count FROM billingOrders WHERE uid=?').get(h.actor.uid).count, 1);
});

test('pilot reservation limit belongs to each authenticated UID, independently', async () => {
  const h = setup({ pilotMode: true });
  const alice = await h.service.create(h.actor), bob = await h.service.create(h.bob);
  assert.notEqual(alice.orderId, bob.orderId);
  assert.equal(h.stored(alice.orderId).uid, h.actor.uid); assert.equal(h.stored(bob.orderId).uid, h.bob.uid);
  assert.equal((await h.service.create(h.actor)).orderId, alice.orderId);
  assert.equal((await h.service.create(h.bob)).orderId, bob.orderId);
  assert.equal(h.calls.posts.length, 2);
});

test('pilot does not reserve again after an incomplete local batch', async () => {
  const h = setup({ pilotMode: true }); h.db.flags.partialBatchFailure = true;
  await assert.rejects(h.service.create(h.actor), e => e.code === 'unavailable');
  await assert.rejects(h.service.create(h.actor), e => e.code === 'resource-exhausted');
  assert.equal(h.calls.posts.length, 0);
  assert.equal(h.db.sql.prepare('SELECT COUNT(*) AS count FROM billingOrders WHERE uid=?').get(h.actor.uid).count, 1);
});

test('status without any orders performs no writes and exposes only boolean pilot availability', async () => {
  for (const paymentsEnabled of [false, true]) {
    const h = setup({ pilotMode: true, paymentsEnabled });
    // Even a stale cached entitlement cannot grant access without an order.
    h.db.sql.prepare('INSERT INTO billingAccounts(uid,adFreeLifetime) VALUES (?,1)').run(h.actor.uid);
    h.db.sql.exec('PRAGMA query_only=ON');
    const status = await h.service.getStatus(h.actor);
    assert.deepEqual(status, { adFreeLifetime: false, pendingOrderId: null, price: 5, currency: 'BRL', paymentsEnabled, pilotMode: true });
    assert.equal(h.db.sql.prepare('SELECT COUNT(*) AS count FROM billingLocks').get().count, 0);
    assert.equal(h.calls.merchant, 0); assert.equal(h.calls.gets, 0);
  }
});

test('failure reading whether an order exists cannot return cached status', async () => {
  const h = setup(); h.db.sql.exec('DROP TABLE billingAccounts; DROP TABLE billingOrders');
  await assert.rejects(h.service.getStatus(h.actor), e => e.code === 'unavailable');
  assert.equal(h.calls.merchant, 0); assert.equal(h.calls.gets, 0);
});

test('an existing pilot order still takes the lock and revalidates provider state', async () => {
  const h = setup({ pilotMode: true }), first = await h.service.create(h.actor);
  fixture.approve(h.remote(first.orderId));
  const before = h.calls.gets;
  const status = await h.service.getStatus(h.actor);
  assert.equal(status.adFreeLifetime, true); assert.equal(status.pilotMode, true); assert.ok(h.calls.gets > before);
  h.remote(first.orderId).transactions.payments[0].refunded_amount = '1.00';
  assert.equal((await h.service.getStatus(h.actor)).adFreeLifetime, false);
  h.db.sql.exec('PRAGMA query_only=ON');
  await assert.rejects(h.service.getStatus(h.actor), e => e.code === 'unavailable');
});


test('pilot status suppresses replacement after a terminal order but preserves pending and unknown POST recovery', async () => {
  const h = setup({ pilotMode: true }), first = await h.service.create(h.actor);
  let status = await h.service.getStatus(h.actor);
  assert.equal(status.paymentsEnabled, true); assert.equal(status.pendingOrderId, first.orderId);
  const provider = h.remote(first.orderId);
  provider.status = 'expired'; provider.status_detail = 'expired'; provider.transactions.payments[0].status = 'expired';
  status = await h.service.getStatus(h.actor);
  assert.equal(status.paymentsEnabled, false); assert.equal(status.pilotMode, true); assert.equal(status.pendingOrderId, first.orderId);
  const unknown = setup({ pilotMode: true }); unknown.control.postAfter = 1;
  await assert.rejects(unknown.service.create(unknown.actor), e => e.code === 'unavailable');
  const reserved = unknown.account().activeOrderId;
  const recoverable = await unknown.service.getStatus(unknown.actor);
  assert.equal(recoverable.paymentsEnabled, true); assert.equal(recoverable.pendingOrderId, null);
  assert.equal((await unknown.service.create(unknown.actor)).orderId, reserved);
});


test('zero conditional order updates cannot grant a receipt or a successful webhook', async () => {
  const h = setup(), first = await h.service.create(h.actor), provider = h.remote(first.orderId);
  fixture.approve(provider);
  h.db.flags.zeroOrderUpdate = true;
  await assert.rejects(h.service.check(h.actor, { orderId: first.orderId }), e => e.code === 'aborted');
  assert.equal(h.stored(first.orderId).paid, 0); assert.equal(h.account().adFreeLifetime, 0);
  h.db.flags.zeroOrderUpdate = true;
  assert.equal((await h.webhook(provider.id)).status, 503);
  assert.equal(h.stored(first.orderId).paid, 0); assert.equal(h.account().adFreeLifetime, 0);
  assert.equal(h.db.sql.prepare('SELECT COUNT(*) AS count FROM billingLocks').get().count, 0);
});

test('malformed read batch fails before reserving or submitting a payment', async () => {
  const h = setup(), batch = h.db.batch.bind(h.db);
  h.db.batch = async statements => statements.every(statement => /^SELECT /.test(statement.query))
    ? statements.map(() => ({ success: true, results: null })) : batch(statements);
  await assert.rejects(h.service.create(h.actor), e => e.code === 'unavailable');
  assert.equal(h.calls.posts.length, 0); assert.equal(h.orders.size, 0);
  assert.equal(h.db.sql.prepare('SELECT COUNT(*) AS count FROM billingOrders').get().count, 0);
  assert.equal(h.db.sql.prepare('SELECT COUNT(*) AS count FROM billingLocks').get().count, 0);
});

test('final lease batch rejects a stale result and preserves the successor nonce', async () => {
  const h = setup(), first = await h.service.create(h.actor), provider = h.remote(first.orderId);
  fixture.approve(provider);
  h.db.flags.beforeFinalBatch = () => {
    h.advance(180001);
    h.db.sql.prepare('UPDATE billingLocks SET nonce=?,untilMs=? WHERE uid=?').run('successor-nonce', h.now() + 180000, h.actor.uid);
  };
  await assert.rejects(h.service.check(h.actor, { orderId: first.orderId }), e => e.code === 'aborted');
  assert.equal(h.db.sql.prepare('SELECT nonce FROM billingLocks WHERE uid=?').get(h.actor.uid).nonce, 'successor-nonce');
});

test('refund handled by successor before final release cannot be overwritten or returned as paid', async () => {
  const h = setup(), first = await h.service.create(h.actor), provider = h.remote(first.orderId);
  fixture.approve(provider);
  h.db.flags.beforeFinalBatch = async () => {
    h.advance(180001); provider.status = 'refunded'; provider.status_detail = 'refunded';
    const successor = await h.service.check(h.actor, { orderId: first.orderId });
    assert.equal(successor.adFreeLifetime, false);
  };
  await assert.rejects(h.service.check(h.actor, { orderId: first.orderId }), e => e.code === 'aborted');
  assert.equal(h.stored(first.orderId).paid, 0); assert.equal(h.account().adFreeLifetime, 0);
  assert.equal(h.db.sql.prepare('SELECT COUNT(*) AS count FROM billingLocks').get().count, 0);
});

function countD1Roundtrips(h) {
  let count = 0, batchDepth = 0;
  const prepare = h.db.prepare.bind(h.db), batch = h.db.batch.bind(h.db);
  function wrap(statement) {
    const result = { query: statement.query, bind(...values) { return wrap(statement.bind(...values)); } };
    for (const method of ['first', 'all', 'run']) result[method] = async () => {
      if (!batchDepth) count++;
      return statement[method]();
    };
    return result;
  }
  h.db.prepare = query => wrap(prepare(query));
  h.db.batch = async statements => { count++; batchDepth++; try { return await batch(statements); } finally { batchDepth--; } };
  return () => count;
}

test('virgin creation and webhook stay within the reduced D1 roundtrip budgets', async () => {
  for (const pilotMode of [false, true]) {
    const h = setup({ pilotMode }), count = countD1Roundtrips(h);
    const first = await h.service.create(h.actor);
    assert.ok(count() <= 8, 'virgin create must use at most eight D1 calls');
    assert.equal(h.account().adFreeLifetime, 0);
    fixture.approve(h.remote(first.orderId)); const before = count();
    assert.equal((await h.webhook(h.remote(first.orderId).id)).status, 200);
    assert.ok(count() - before <= 5, 'new accreditation webhook must use at most five D1 calls');
    assert.equal(h.account().adFreeLifetime, 1);
  }
});


test('failed final batch is rejected and releases only its own lock', async () => {
  const h = setup(), first = await h.service.create(h.actor), batch = h.db.batch.bind(h.db);
  h.db.batch = async statements => statements.some(statement => /^DELETE FROM billingLocks/.test(statement.query))
    ? [{ success: false, results: [] }, { success: false, results: [] }] : batch(statements);
  await assert.rejects(h.service.check(h.actor, { orderId: first.orderId }), e => e.code === 'unavailable');
  assert.equal(h.db.sql.prepare('SELECT COUNT(*) AS count FROM billingLocks').get().count, 0);
  assert.equal(h.account().adFreeLifetime, 0);
});


test('bound webhook performs one fresh provider read per accreditation and refund', async () => {
  const h = setup(), first = await h.service.create(h.actor), provider = h.remote(first.orderId);
  fixture.approve(provider);
  let before = h.calls.gets;
  assert.equal((await h.webhook(provider.id.toLowerCase())).status, 200);
  assert.equal(h.calls.gets - before, 1); assert.equal(h.account().adFreeLifetime, 1);
  provider.transactions.payments[0].refunded_amount = '1.00';
  before = h.calls.gets;
  assert.equal((await h.webhook(provider.id)).status, 200);
  assert.equal(h.calls.gets - before, 1); assert.equal(h.account().adFreeLifetime, 0);
  assert.equal(h.stored(first.orderId).paid, 0);
});

test('natural webhook preceding the local provider binding preserves two validated provider reads', async () => {
  const h = setup(), early = seed(h, 888, false, false);
  assert.equal(h.stored(early.orderId).providerOrderId, null);
  assert.equal((await h.webhook(early.provider.id)).status, 200);
  assert.equal(h.calls.gets, 2); assert.equal(h.calls.posts.length, 0);
  assert.equal(h.stored(early.orderId).providerOrderId, early.provider.id);
  assert.equal(h.stored(early.orderId).paid, 1); assert.equal(h.account().adFreeLifetime, 1);
});

test('bound webhook rejects a provider reference changed to another local order', async () => {
  const h = setup(), first = await h.service.create(h.actor), other = seed(h, 889, false, false);
  const provider = h.remote(first.orderId); fixture.approve(provider);
  provider.external_reference = core.reference(other.orderId);
  const before = h.calls.gets;
  assert.equal((await h.webhook(provider.id)).status, 503);
  assert.equal(h.calls.gets - before, 1);
  assert.equal(h.stored(first.orderId).paid, 0); assert.equal(h.stored(other.orderId).paid, 0);
  assert.equal(h.stored(other.orderId).providerOrderId, null); assert.equal(h.account().adFreeLifetime, 0);
});

test('unbound webhook rejects a changed reference between its discovery and locked provider reads', async () => {
  const h = setup(), early = seed(h, 888, false, false), other = seed(h, 889, false, false);
  h.control.nextGetHook = () => { early.provider.external_reference = core.reference(other.orderId); };
  assert.equal((await h.webhook(early.provider.id)).status, 503);
  assert.equal(h.calls.gets, 2);
  assert.equal(h.stored(early.orderId).paid, 0); assert.equal(h.stored(other.orderId).paid, 0);
  assert.equal(h.stored(early.orderId).providerOrderId, null); assert.equal(h.stored(other.orderId).providerOrderId, null);
  assert.equal(h.account(), undefined);
});

test('bound webhook with an expired lease cannot grant over a successor refund', async () => {
  const h = setup(), first = await h.service.create(h.actor), provider = h.remote(first.orderId);
  fixture.approve(provider);
  h.control.nextGetHook = async () => {
    h.advance(180001);
    provider.status = 'refunded'; provider.status_detail = 'refunded';
    assert.equal((await h.webhook(provider.id)).status, 200);
  };
  assert.equal((await h.webhook(provider.id)).status, 503);
  assert.equal(h.stored(first.orderId).paid, 0); assert.equal(h.account().adFreeLifetime, 0);
  assert.equal(h.db.sql.prepare('SELECT COUNT(*) AS count FROM billingLocks').get().count, 0);
});

test('invalid webhook HMAC performs no local binding lookup or Mercado Pago request', async () => {
  const h = setup(), first = await h.service.create(h.actor), provider = h.remote(first.orderId);
  const count = countD1Roundtrips(h), before = clone(h.calls);
  assert.equal((await h.webhook(provider.id, { headers: new Headers() })).status, 401);
  assert.equal(count(), 0); assert.deepEqual(h.calls, before);
});


test('check reuses its locked snapshot and paid status batches its final receipt', async () => {
  const h = setup(), first = await h.service.create(h.actor), count = countD1Roundtrips(h);
  fixture.approve(h.remote(first.orderId));
  assert.equal((await h.service.check(h.actor, { orderId: first.orderId })).adFreeLifetime, true);
  assert.equal(count(), 4);
  const before = count();
  assert.equal((await h.service.getStatus(h.actor)).adFreeLifetime, true);
  assert.equal(count() - before, 5);
});

test('check snapshot binds the exact requested order and rejects malformed batches before provider access', async () => {
  const h = setup(), first = await h.service.create(h.actor), other = seed(h, 890, false, false);
  h.remote(first.orderId).external_reference = core.reference(other.orderId);
  await assert.rejects(h.service.check(h.actor, { orderId: first.orderId }), e => e.code === 'permission-denied');
  assert.equal(h.stored(first.orderId).paid, 0); assert.equal(h.stored(other.orderId).paid, 0);
  const before = clone(h.calls), batch = h.db.batch.bind(h.db);
  h.db.batch = statements => statements.every(statement => /^SELECT /.test(statement.query))
    ? Promise.resolve([{ success: true, results: [] }]) : batch(statements);
  await assert.rejects(h.service.check(h.actor, { orderId: first.orderId }), e => e.code === 'unavailable');
  assert.deepEqual(h.calls, before);
});

test('zero changes from a final guarded receipt cannot return a granted benefit', async () => {
  const h = setup(), first = await h.service.create(h.actor);
  fixture.approve(h.remote(first.orderId)); h.db.flags.zeroReceiptUpdate = true;
  await assert.rejects(h.service.check(h.actor, { orderId: first.orderId }), e => e.code === 'aborted');
  assert.equal(h.account().adFreeLifetime, 0);
  assert.equal(h.db.sql.prepare('SELECT COUNT(*) AS count FROM billingLocks').get().count, 0);
});

test('malformed final receipt batch cannot grant or return success and cleans only its lease', async () => {
  for (const badResult of [null, [], [{ success: true, meta: { changes: 1 } }],
    [{ success: false }, { success: true, results: [] }, { success: true, meta: { changes: 1 } }]]) {
    const h = setup(), first = await h.service.create(h.actor), batch = h.db.batch.bind(h.db);
    fixture.approve(h.remote(first.orderId));
    h.db.batch = statements => statements.some(statement => /^DELETE FROM billingLocks/.test(statement.query))
      ? Promise.resolve(badResult) : batch(statements);
    await assert.rejects(h.service.check(h.actor, { orderId: first.orderId }), e => e.code === 'unavailable');
    assert.equal(h.account().adFreeLifetime, 0);
    assert.equal(h.db.sql.prepare('SELECT COUNT(*) AS count FROM billingLocks').get().count, 0);
  }
});

test('SQL failure after the final receipt rolls the batch back and returns no benefit', async () => {
  const h = setup(), first = await h.service.create(h.actor), batch = h.db.batch.bind(h.db);
  fixture.approve(h.remote(first.orderId));
  h.db.batch = statements => statements.some(statement => /^DELETE FROM billingLocks/.test(statement.query))
    ? batch([statements[0], h.db.prepare('SELECT missingColumn FROM missingTable'), ...statements.slice(1)]) : batch(statements);
  await assert.rejects(h.service.check(h.actor, { orderId: first.orderId }), e => e.code === 'unavailable');
  assert.equal(h.account().adFreeLifetime, 0);
  assert.equal(h.db.sql.prepare('SELECT COUNT(*) AS count FROM billingLocks').get().count, 0);
});

test('an intermediate refund remains revoked when the later status provider GET fails', async () => {
  const h = setup(), first = await h.service.create(h.actor), provider = h.remote(first.orderId);
  fixture.approve(provider); await h.service.check(h.actor, { orderId: first.orderId });
  assert.equal(h.account().adFreeLifetime, 1);
  provider.transactions.payments[0].refunded_amount = '1.00';
  h.control.nextGetHook = () => { h.control.getFailure = 1; };
  const before = h.calls.gets;
  await assert.rejects(h.service.getStatus(h.actor), e => e.code === 'unavailable');
  assert.equal(h.calls.gets - before, 2);
  assert.equal(h.stored(first.orderId).paid, 0); assert.equal(h.account().adFreeLifetime, 0);
});

test('a failed intermediate revocation aborts before the later status lookup or provider GET', async () => {
  const h = setup(), first = await h.service.create(h.actor), provider = h.remote(first.orderId);
  fixture.approve(provider); await h.service.check(h.actor, { orderId: first.orderId });
  provider.transactions.payments[0].refunded_amount = '1.00'; h.db.flags.zeroReceiptUpdate = true;
  const before = h.calls.gets;
  await assert.rejects(h.service.getStatus(h.actor), e => e.code === 'aborted');
  assert.equal(h.calls.gets - before, 1);
  assert.equal(h.stored(first.orderId).paid, 0);
  assert.equal(h.db.sql.prepare('SELECT COUNT(*) AS count FROM billingLocks').get().count, 0);
});


function malformedReservationResults() {
  const valid = () => ({ success: true, results: [], meta: { changes: 1 } });
  return [[], new Array(2), [valid()], null, [null, valid()], [valid(), null],
    [{ success: false, results: [], meta: { changes: 1 } }, valid()],
    [valid(), { results: [], meta: { changes: 1 } }],
    [valid(), { success: true, results: null, meta: { changes: 1 } }],
    [valid(), { success: true, results: [], meta: { changes: 0 } }]];
}

test('invalid reservation batch shape or write acknowledgement prevents every provider POST', async () => {
  for (const result of malformedReservationResults()) {
    const h = setup({ pilotMode: true }), batch = h.db.batch.bind(h.db);
    h.db.batch = statements => statements.some(statement => /^INSERT INTO billingOrders/.test(statement.query))
      ? Promise.resolve(result) : batch(statements);
    await assert.rejects(h.service.create(h.actor), e => ['unavailable', 'aborted'].includes(e.code));
    assert.equal(h.calls.posts.length, 0); assert.equal(h.orders.size, 0);
    assert.equal(h.db.sql.prepare('SELECT COUNT(*) AS count FROM billingOrders').get().count, 0);
    assert.equal(h.db.sql.prepare('SELECT COUNT(*) AS count FROM billingLocks').get().count, 0);
  }
});

test('malformed acknowledgement after reservation commit recovers the same pilot key and payload', async () => {
  for (const result of malformedReservationResults()) {
    const h = setup({ pilotMode: true }), batch = h.db.batch.bind(h.db);
    let intercept = true;
    h.db.batch = async statements => {
      const actual = await batch(statements);
      if (intercept && statements.some(statement => /^INSERT INTO billingOrders/.test(statement.query))) {
        intercept = false; return result;
      }
      return actual;
    };
    await assert.rejects(h.service.create(h.actor), e => ['unavailable', 'aborted'].includes(e.code));
    assert.equal(h.calls.posts.length, 0); assert.equal(h.orders.size, 0);
    const reserved = h.account().activeOrderId, payload = h.stored(reserved).requestPayload;
    const recovered = await h.service.create(h.actor);
    assert.equal(recovered.orderId, reserved);
    assert.equal(h.calls.posts.length, 1); assert.equal(h.calls.posts[0].key, reserved);
    assert.equal(h.calls.posts[0].body, payload); assert.equal(h.orders.size, 1);
    assert.equal(h.db.sql.prepare('SELECT COUNT(*) AS count FROM billingOrders').get().count, 1);
  }
});

test('the retained pre-POST lease check rejects expiration after a successful reservation batch', async () => {
  const h = setup({ pilotMode: true }), batch = h.db.batch.bind(h.db);
  h.db.batch = async statements => {
    const result = await batch(statements);
    if (statements.some(statement => /^INSERT INTO billingOrders/.test(statement.query))) h.advance(180001);
    return result;
  };
  await assert.rejects(h.service.create(h.actor), e => e.code === 'aborted');
  assert.equal(h.calls.posts.length, 0); assert.equal(h.orders.size, 0);
  const reserved = h.account().activeOrderId;
  assert.equal((await h.service.create(h.actor)).orderId, reserved);
  assert.equal(h.calls.posts.length, 1); assert.equal(h.calls.posts[0].key, reserved);
});


function incompleteStrictBatchResults(length) {
  const valid = () => ({ success: true, results: [], meta: { changes: 1 } });
  const variants = [null, new Array(length)];
  for (const invalid of [null, undefined, { results: [] }, { success: false, results: [] }, { success: true }, { success: true, results: null }]) {
    const rows = Array.from({ length }, valid); rows[1] = invalid; variants.push(rows);
  }
  const missing = Array.from({ length }, valid); delete missing[1]; variants.push(missing);
  return variants;
}

test('read batches require present successful results at every position before provider access', async () => {
  for (const result of incompleteStrictBatchResults(2)) {
    const h = setup(), first = await h.service.create(h.actor), before = clone(h.calls), batch = h.db.batch.bind(h.db);
    h.db.batch = statements => statements.every(statement => /^SELECT /.test(statement.query))
      ? Promise.resolve(result) : batch(statements);
    await assert.rejects(h.service.check(h.actor, { orderId: first.orderId }), e => e.code === 'unavailable');
    assert.deepEqual(h.calls, before); assert.equal(h.account().adFreeLifetime, 0);
    assert.equal(h.db.sql.prepare('SELECT COUNT(*) AS count FROM billingLocks').get().count, 0);
  }
});

test('final batches reject absent success flags, null entries and sparse results without granting', async () => {
  for (const result of incompleteStrictBatchResults(3)) {
    const h = setup(), first = await h.service.create(h.actor), batch = h.db.batch.bind(h.db);
    fixture.approve(h.remote(first.orderId));
    h.db.batch = statements => statements.some(statement => /^DELETE FROM billingLocks/.test(statement.query))
      ? Promise.resolve(result) : batch(statements);
    await assert.rejects(h.service.check(h.actor, { orderId: first.orderId }), e => e.code === 'unavailable');
    assert.equal(h.account().adFreeLifetime, 0);
    assert.equal(h.db.sql.prepare('SELECT COUNT(*) AS count FROM billingLocks').get().count, 0);
  }
});


test('public production preserves paid benefit and allows only a separate eligible account purchase', async () => {
  const h = setup({ liveMode: true, projectId: 'production-4j-pix', paymentsEnabled: true, pilotMode: false });
  h.merchant.tags = [];
  const first = await h.service.create(h.actor);
  fixture.approve(h.remote(first.orderId)); await h.webhook(h.remote(first.orderId).id);
  assert.equal((await h.service.getStatus(h.actor)).adFreeLifetime, true);
  assert.equal((await h.service.create(h.actor)).adFreeLifetime, true);
  assert.equal(h.calls.posts.length, 1, 'a paid user is never charged again');
  const otherStatus = await h.service.getStatus(h.bob);
  assert.equal(otherStatus.adFreeLifetime, false); assert.equal(otherStatus.paymentsEnabled, true); assert.equal(otherStatus.pilotMode, false);
  const other = await h.service.create(h.bob);
  assert.notEqual(other.orderId, first.orderId); assert.equal(h.calls.posts.length, 2);
  assert.equal(h.stored(other.orderId).uid, h.bob.uid); assert.equal(h.stored(other.orderId).liveMode, 1);
  assert.equal(h.stored(other.orderId).amountCents, 500); assert.equal(h.stored(other.orderId).currency, 'BRL');
  for (const post of h.calls.posts) assert.equal(JSON.parse(post.body).payer.first_name, undefined);
  const before = h.calls.gets;
  await assert.rejects(h.service.check(h.bob, { orderId: first.orderId }), e => e.code === 'permission-denied');
  await assert.rejects(h.service.check(h.actor, { orderId: other.orderId }), e => e.code === 'permission-denied');
  assert.equal(h.calls.gets, before, 'cross-account attempts never consult another provider order');
  assert.equal(h.account(h.bob.uid).adFreeLifetime, 0); assert.equal(h.account(h.actor.uid).adFreeLifetime, 1);
});

test('public production rejects anonymous unverified suspended and cross-project purchases before any charge', async () => {
  const h = setup({ liveMode: true, projectId: 'production-4j-pix', paymentsEnabled: true, pilotMode: false });
  h.merchant.tags = [];
  for (const [actor, code] of [[null, 'unauthenticated'], [{ ...h.actor, emailVerified: false }, 'failed-precondition'], [{ ...h.actor, active: false }, 'permission-denied']]) {
    await assert.rejects(h.service.create(actor), e => e.code === code);
  }
  assert.equal(h.calls.merchant, 0); assert.equal(h.calls.posts.length, 0);
  h.config.projectId = h.config.testProjectId;
  await assert.rejects(h.service.create(h.actor), e => e.code === 'failed-precondition');
  assert.equal(h.calls.posts.length, 0); assert.equal(h.account(), undefined);
});
