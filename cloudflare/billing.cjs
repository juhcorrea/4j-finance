'use strict';
const { randomUUID } = require('node:crypto');
const core = require('../functions/payment-core');

class BillingError extends Error {
  constructor(code, message) { super(message); this.name = 'BillingError'; this.code = code; }
}
const error = (code, message) => new BillingError(code, message);
const unavailable = () => error('unavailable', 'Não foi possível atualizar o pagamento agora. Tente novamente.');
const guarded = 'EXISTS (SELECT 1 FROM billingLocks WHERE uid = ? AND nonce = ? AND untilMs > ?)';
const bindingColumns = 'orderId, uid, sku, amountCents, currency, collectorId, applicationId, liveMode, projectId, providerOrderId, paid';
const receiptSql = 'INSERT INTO billingAccounts(uid, adFreeLifetime, updatedAt) SELECT ?, ?, ? WHERE ' + guarded +
  ' ON CONFLICT(uid) DO UPDATE SET adFreeLifetime=excluded.adFreeLifetime, updatedAt=excluded.updatedAt';
function createBillingService({ db, fetchImpl = fetch, now = Date.now, uuid = randomUUID, config }) {
  const stmt = (sql, values = []) => db.prepare(sql).bind(...values);
  const guardValues = lock => [lock.uid, lock.nonce, now()];
  const asOrder = row => row ? { ...row, liveMode: row.liveMode === 1 } : null;
  async function first(sql, values = []) {
    try { return await stmt(sql, values).first(); } catch { throw unavailable(); }
  }
  async function all(sql, values = []) {
    try { const result = await stmt(sql, values).all(); return result.results || []; } catch { throw unavailable(); }
  }
  async function write(sql, values, mustChange = true) {
    let result;
    try { result = await stmt(sql, values).run(); } catch { throw unavailable(); }
    if (mustChange && result.meta?.changes !== 1) throw error('aborted', 'O pagamento está sendo atualizado. Tente novamente.');
    return result;
  }
  async function assertLock(lock) {
    if (!await first('SELECT nonce FROM billingLocks WHERE uid = ? AND nonce = ? AND untilMs > ?', guardValues(lock))) throw error('aborted', 'O pagamento está sendo atualizado. Tente novamente.');
  }
  async function readBatch(queries) {
    let results;
    try { results = await db.batch(queries.map(([sql, values]) => stmt(sql, values))); } catch { throw unavailable(); }
    if (!Array.isArray(results) || results.length !== queries.length || !queries.every((_, index) =>
      Object.hasOwn(results, index) && results[index] && results[index].success === true && Array.isArray(results[index].results))) throw unavailable();
    return results.map(result => result.results);
  }
  async function withLock(uid, fn) {
    const lock = { uid, nonce: uuid() };
    await write('INSERT INTO billingLocks(uid, nonce, untilMs) VALUES (?, ?, ?) ON CONFLICT(uid) DO UPDATE SET nonce=excluded.nonce, untilMs=excluded.untilMs WHERE billingLocks.untilMs <= ?',
      [uid, lock.nonce, now() + 180000, now()]);
    let released = false;
    try {
      const value = await fn(lock);
      const receipt = lock.finalReceipt;
      const offset = receipt ? 1 : 0;
      const statements = receipt ? [stmt(receiptSql, [uid, receipt.granted ? 1 : 0, now(), ...guardValues(lock)])] : [];
      statements.push(
        stmt('SELECT nonce FROM billingLocks WHERE uid = ? AND nonce = ? AND untilMs > ?', guardValues(lock)),
        stmt('DELETE FROM billingLocks WHERE uid = ? AND nonce = ?', [uid, lock.nonce]),
      );
      let results;
      try { results = await db.batch(statements); } catch { throw unavailable(); }
      const complete = Array.isArray(results) && results.length === offset + 2 && statements.every((_, index) =>
        Object.hasOwn(results, index) && results[index] && results[index].success === true && Array.isArray(results[index].results));
      if (!complete) throw unavailable();
      released = results[offset + 1].meta?.changes === 0 || results[offset + 1].meta?.changes === 1;
      if ((receipt && results[0].meta?.changes !== 1) || results[offset]?.results?.length !== 1 ||
          results[offset].results[0]?.nonce !== lock.nonce || results[offset + 1]?.meta?.changes !== 1)
        throw error('aborted', 'O pagamento está sendo atualizado. Tente novamente.');
      return value;
    } finally {
      // A late request must never delete a successor's lock, including on failure.
      if (!released) await write('DELETE FROM billingLocks WHERE uid = ? AND nonce = ?', [uid, lock.nonce], false);
    }
  }
  function actorCheck(actor, purchase = false) {
    if (!actor || typeof actor.uid !== 'string' || !actor.uid || actor.uid.length > 128) throw error('unauthenticated', 'Entre na sua conta para continuar.');
    if (purchase) {
      if (config.paymentsEnabled !== true) throw error('failed-precondition', 'O pagamento ainda não foi ativado.');
      if (actor.emailVerified !== true || typeof actor.email !== 'string' || !actor.email) throw error('failed-precondition', 'Confirme seu e-mail antes de gerar o Pix.');
      if (actor.active !== true) throw error('permission-denied', 'Sua conta precisa estar ativa para comprar.');
    }
    return actor;
  }
  function configuration() {
    const cfg = config;
    const projectPattern = /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/;
    if (typeof cfg.liveMode !== 'boolean' || !/^\d+$/.test(cfg.collectorId || '') || !/^\d+$/.test(cfg.applicationId || '') ||
      !projectPattern.test(cfg.testProjectId || '') || !projectPattern.test(cfg.productionProjectId || '') ||
      cfg.testProjectId === cfg.productionProjectId || cfg.projectId !== (cfg.liveMode ? cfg.productionProjectId : cfg.testProjectId) ||
      typeof cfg.accessToken !== 'string' || !cfg.accessToken) throw error('failed-precondition', 'O ambiente do pagamento ainda está em configuração.');
    return { collectorId: cfg.collectorId, applicationId: cfg.applicationId, liveMode: cfg.liveMode, projectId: cfg.projectId };
  }
  async function providerRequest(path, body, idempotencyKey) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetchImpl('https://api.mercadopago.com' + path, {
        method: body === undefined ? 'GET' : 'POST', redirect: 'manual', signal: controller.signal,
        headers: { Authorization: 'Bearer ' + config.accessToken, 'Content-Type': 'application/json', ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}) },
        ...(body === undefined ? {} : { body }),
      });
      // workerd accepts manual/follow; manual keeps the bearer on the original origin.
      if (response.redirected === true || (response.status >= 300 && response.status < 400) || !response.ok) throw unavailable();
      return await response.json();
    } catch { throw unavailable(); }
    finally { clearTimeout(timer); }
  }
  async function merchantConfig() {
    const cfg = configuration();
    const merchant = await providerRequest('/users/me');
    try { core.validateMerchant(merchant, cfg); } catch { throw error('failed-precondition', 'A conta e o ambiente do Mercado Pago precisam ser conferidos.'); }
    return cfg;
  }
  async function orderById(id) {
    if (typeof id !== 'string' || !core.PROVIDER_ORDER_ID_RE.test(id)) throw error('invalid-argument', 'Pagamento inválido.');
    return providerRequest('/v1/orders/' + id.toUpperCase());
  }
  const paidSql = 'SELECT ' + bindingColumns + ' FROM billingOrders WHERE uid = ? AND paid = 1 LIMIT 11';
  async function readReconciliation(uid, candidate) {
    if (!candidate) return { saved: (await all(paidSql, [uid])).map(asOrder) };
    const id = core.internalOrderId(candidate.external_reference);
    if (!id) throw error('permission-denied', 'O pagamento não pertence a esta conta.');
    const [orders, saved] = await readBatch([
      ['SELECT ' + bindingColumns + ' FROM billingOrders WHERE orderId = ? AND uid = ?', [id, uid]],
      [paidSql, [uid]],
    ]);
    if (orders.length !== 1) throw error('permission-denied', 'O pagamento não pertence a esta conta.');
    return { order: asOrder(orders[0]), saved: saved.map(asOrder) };
  }
  async function readCreateState(uid) {
    const queries = [[paidSql, [uid]], ['SELECT * FROM billingAccounts WHERE uid = ?', [uid]]];
    if (config.pilotMode === true) queries.push(['SELECT COUNT(*) AS count FROM billingOrders WHERE uid = ?', [uid]]);
    const [saved, accounts, reservations] = await readBatch(queries);
    if (accounts.length > 1) throw unavailable();
    return { saved: saved.map(asOrder), account: accounts[0] || null, pilotReservations: reservations?.[0]?.count };
  }
  async function recordOrder(provider, uid, cfg, lock, order, paidCount) {
    const id = core.internalOrderId(provider?.external_reference);
    if (!id || !order || order.orderId !== id || order.uid !== uid) throw error('permission-denied', 'O pagamento não pertence a esta conta.');
    try { core.validateOrder(provider, order, cfg); } catch { throw error('failed-precondition', 'Os dados do pagamento não correspondem ao pedido.'); }
    const paid = core.isPaid(provider) ? 1 : 0;
    if (paid && !order.paid && paidCount >= 10) throw error('resource-exhausted', 'Precisamos revisar os pagamentos desta conta.');
    await write('UPDATE billingOrders SET providerOrderId = ?, providerStatus = ?, providerUpdatedAt = ?, checkedAt = ?, paid = ? WHERE orderId = ? AND uid = ? AND ' + guarded,
      [provider.id, core.publicStatus(provider), provider.last_updated_date, now(), paid, order.orderId, uid, ...guardValues(lock)]);
    return paid === 1;
  }
  async function updateReceipt(uid, granted, lock) {
    await write(receiptSql,
      [uid, granted ? 1 : 0, now(), ...guardValues(lock)]);
  }
  async function flushReceipt(lock) {
    if (!lock.finalReceipt) return;
    await updateReceipt(lock.uid, lock.finalReceipt.granted, lock);
    delete lock.finalReceipt;
  }
  async function syncEntitlement(uid, candidate, cfg, lock, initialState, skipEmptyReceipt = false, deferFinalReceipt = false) {
    // The snapshot is read under this UID's lease. Every provider response is
    // still fetched and fully validated; guarded writes reject an expired lease.
    const state = initialState || await readReconciliation(uid, candidate);
    const orders = new Map(state.saved.map(order => [order.providerOrderId, order]));
    if (candidate) orders.set(candidate.id, state.order);
    if (state.saved.length > 10 || orders.size > 10) throw error('resource-exhausted', 'Precisamos revisar os pagamentos desta conta.');
    if (orders.size && !cfg) cfg = await merchantConfig();
    let granted = candidate ? await recordOrder(candidate, uid, cfg, lock, state.order, state.saved.length) : false;
    for (const [id, order] of orders) {
      if (candidate?.id === id) continue;
      const provider = await orderById(id);
      const paid = await recordOrder(provider, uid, cfg, lock, order, state.saved.length);
      granted = paid || granted;
    }
    // A virgin create reserves an account with the database's false default.
    // Skipping that preliminary false write never grants a cached benefit.
    if (!skipEmptyReceipt || orders.size) {
      // Only a final reconciliation may defer its receipt. Earlier revocations
      // must persist even if a later provider call or reservation fails.
      if (deferFinalReceipt) lock.finalReceipt = { granted };
      else await updateReceipt(uid, granted, lock);
    }
    return granted;
  }
  async function getStatus(actor) {
    const { uid } = actorCheck(actor);
    const status = (adFreeLifetime, pendingOrderId, pilotTerminal = false) => ({ adFreeLifetime, pendingOrderId, price: 5, currency: 'BRL', paymentsEnabled: config.paymentsEnabled === true && !pilotTerminal, pilotMode: config.pilotMode === true });
    // No reservation means no paid benefit. A concurrent create may only make
    // this negative answer briefly stale; it never grants access or bypasses a lock.
    if (!await first('SELECT orderId FROM billingOrders WHERE uid = ? LIMIT 1', [uid])) return status(false, null);
    return withLock(uid, async lock => {
      let adFreeLifetime = await syncEntitlement(uid, null, null, lock, undefined, false, true);
      let pendingOrderId = null;
      let pilotTerminal = false;
      if (!adFreeLifetime) {
        // Persist revocations before any later lookup or provider failure.
        await flushReceipt(lock);
        const order = asOrder(await first('SELECT o.* FROM billingAccounts a JOIN billingOrders o ON o.orderId=a.activeOrderId AND o.uid=a.uid WHERE a.uid = ?', [uid]));
        if (order && core.ORDER_ID_RE.test(order.orderId) && core.PROVIDER_ORDER_ID_RE.test(order.providerOrderId || '')) {
          const cfg = configuration();
          try { core.validateLocalOrder(order, cfg); }
          catch { throw error('failed-precondition', 'O ambiente do pedido precisa ser conferido.'); }
          // Reopening the app must recover payment confirmation even if its webhook
          // was delayed. This path only reads the existing provider order, never submits.
          await merchantConfig();
          const provider = await orderById(order.providerOrderId);
          try { core.validateOrder(provider, order, cfg); }
          catch { throw error('failed-precondition', 'Os dados do pagamento não correspondem ao pedido.'); }
          adFreeLifetime = await syncEntitlement(uid, provider, cfg, lock, undefined, false, true);
          pilotTerminal = config.pilotMode === true && core.canReplace(provider);
          if (!adFreeLifetime) pendingOrderId = order.orderId;
        }
      }
      return status(adFreeLifetime, pendingOrderId, pilotTerminal);
    });
  }
  async function reserve(actor, account, cfg, lock, pilotReservations) {
    if (config.pilotMode === true) {
      // The authenticated UID may reserve only one pilot order, ever. Resuming an
      // existing reservation happens in create(), before reaching this branch.
      if (!Number.isSafeInteger(pilotReservations) || pilotReservations < 0) throw unavailable();
      if (pilotReservations !== 0) throw error('resource-exhausted', 'O teste desta conta já possui um pedido. Confira o pagamento existente.');
    }
    const day = new Date(now()).toISOString().slice(0, 10);
    const count = account?.orderDay === day ? Number(account.ordersToday || 0) : 0;
    if (count >= 5 || now() - Number(account?.lastCreatedAt || 0) < 60000) throw error('resource-exhausted', 'Aguarde um minuto antes de gerar outro Pix. Limite: 5 pedidos por dia.');
    const orderId = uuid();
    let requestPayload;
    try { requestPayload = JSON.stringify(core.createOrderBody(orderId, actor.email, cfg.liveMode)); }
    catch { throw error('invalid-argument', 'Confira o e-mail da sua conta antes de gerar o Pix.'); }
    const order = { orderId, uid: actor.uid, sku: core.SKU, amountCents: 500, currency: 'BRL', ...cfg,
      requestPayload, expiresAt: new Date(now() + 86400000).toISOString(), createdAt: now() };
    const insert = stmt('INSERT INTO billingOrders(orderId, uid, sku, amountCents, currency, collectorId, applicationId, liveMode, projectId, requestPayload, expiresAt, createdAt) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ' + guarded,
      [orderId, actor.uid, order.sku, 500, 'BRL', cfg.collectorId, cfg.applicationId, cfg.liveMode ? 1 : 0, cfg.projectId, requestPayload, order.expiresAt, order.createdAt, ...guardValues(lock)]);
    const accountWrite = stmt('INSERT INTO billingAccounts(uid, activeOrderId, orderDay, ordersToday, lastCreatedAt, updatedAt) SELECT ?, ?, ?, ?, ?, ? WHERE ' + guarded +
      ' ON CONFLICT(uid) DO UPDATE SET activeOrderId=excluded.activeOrderId, orderDay=excluded.orderDay, ordersToday=excluded.ordersToday, lastCreatedAt=excluded.lastCreatedAt, updatedAt=excluded.updatedAt',
      [actor.uid, orderId, day, count + 1, now(), now(), ...guardValues(lock)]);
    let results;
    try { results = await db.batch([insert, accountWrite]); } catch { throw unavailable(); }
    // Both guarded writes must be confirmed before the pre-POST lease check.
    if (!Array.isArray(results) || results.length !== 2 || ![0, 1].every(index =>
      Object.hasOwn(results, index) && results[index] && results[index].success === true && Array.isArray(results[index].results))) throw unavailable();
    if ([0, 1].some(index => results[index].meta?.changes !== 1)) throw error('aborted', 'O pedido está sendo atualizado. Tente novamente.');
    return order;
  }
  async function submit(order, cfg, lock) {
    try {
      core.validateLocalOrder(order, cfg);
      const body = JSON.parse(order.requestPayload);
      if (JSON.stringify(core.createOrderBody(order.orderId, body.payer?.email, order.liveMode)) !== order.requestPayload) throw Error('payload');
    } catch { throw error('failed-precondition', 'O pedido precisa ser conferido antes de continuar.'); }
    await assertLock(lock);
    const result = await providerRequest('/v1/orders', order.requestPayload, order.orderId);
    if (!core.PROVIDER_ORDER_ID_RE.test(result?.id || '')) throw unavailable();
    if (result.external_reference !== undefined && result.external_reference !== core.reference(order.orderId)) throw error('failed-precondition', 'O pedido precisa ser conferido antes de continuar.');
    await write('UPDATE billingOrders SET providerOrderId = ? WHERE orderId = ? AND uid = ? AND ' + guarded,
      [result.id, order.orderId, order.uid, ...guardValues(lock)]);
    return orderById(result.id);
  }
  async function create(actor) {
    actorCheck(actor, true);
    const cfg = await merchantConfig();
    return withLock(actor.uid, async lock => {
      const initial = await readCreateState(actor.uid);
      if (await syncEntitlement(actor.uid, null, cfg, lock, initial, !initial.account)) return { adFreeLifetime: true, status: 'approved' };
      const account = initial.account;
      let order;
      if (account?.activeOrderId != null) {
        order = asOrder(await first('SELECT * FROM billingOrders WHERE orderId = ? AND uid = ?', [account.activeOrderId, actor.uid]));
        if (!order) throw error('failed-precondition', 'O pedido precisa ser conferido antes de continuar.');
        try { core.validateLocalOrder(order, cfg); } catch { throw error('failed-precondition', 'O ambiente do pedido precisa ser conferido.'); }
      }
      if (order?.providerOrderId) {
        const provider = await orderById(order.providerOrderId);
        const granted = await syncEntitlement(actor.uid, provider, cfg, lock);
        if (granted || !core.canReplace(provider)) return { ...core.safeCheckout(provider, order), adFreeLifetime: granted };
        order = null;
      }
      // Unknown POST results retain the same UUID, byte-identical payload and key.
      if (!order) order = await reserve(actor, account, cfg, lock, initial.pilotReservations);
      const provider = await submit(order, cfg, lock);
      const adFreeLifetime = await syncEntitlement(actor.uid, provider, cfg, lock, undefined, false, true);
      return { ...core.safeCheckout(provider, order), adFreeLifetime };
    });
  }
  async function check(actor, { orderId } = {}) {
    actorCheck(actor);
    if (!core.ORDER_ID_RE.test(orderId || '')) throw error('invalid-argument', 'Pedido inválido.');
    return withLock(actor.uid, async lock => {
      const [orders, paidOrders] = await readBatch([
        ['SELECT * FROM billingOrders WHERE orderId = ? AND uid = ?', [orderId, actor.uid]],
        [paidSql, [actor.uid]],
      ]);
      if (orders.length !== 1) throw error('permission-denied', 'Este pedido não está disponível para sua conta.');
      const order = asOrder(orders[0]);
      if (!order.providerOrderId) throw error('unavailable', 'A cobrança ainda está sendo gerada. Tente gerar o Pix novamente.');
      const cfg = await merchantConfig();
      const provider = await orderById(order.providerOrderId);
      const adFreeLifetime = await syncEntitlement(actor.uid, provider, cfg, lock, { order, saved: paidOrders.map(asOrder) }, false, true);
      return { ...core.safeCheckout(provider, order), adFreeLifetime };
    });
  }
  async function webhook({ headers, query, body }) {
    const get = (source, key) => source?.get ? source.get(key) : source?.[key];
    const dataId = get(query, 'data.id');
    if (!core.verifySignature({ signature: get(headers, 'x-signature'), requestId: get(headers, 'x-request-id'), dataId, secret: config.webhookSecret })) return { status: 401, body: 'signature' };
    if (get(query, 'type') !== 'order' && body?.type !== 'order') return { status: 400, body: 'topic' };
    try {
      const cfg = await merchantConfig();
      // This unique, immutable binding only locates the lease; the provider is
      // still read and fully validated inside that lease on every delivery.
      let saved = await first('SELECT uid, orderId FROM billingOrders WHERE providerOrderId = ?', [dataId.toUpperCase()]);
      if (!saved) {
        // A natural notification may precede saving the POST response locally.
        const provider = await orderById(dataId);
        const orderId = core.internalOrderId(provider.external_reference);
        if (!orderId) return { status: 200, body: 'ignored' };
        saved = await first('SELECT uid, orderId FROM billingOrders WHERE orderId = ?', [orderId]);
        if (!saved) return { status: 422, body: 'binding' };
      }
      await withLock(saved.uid, async lock => {
        const current = await orderById(dataId);
        if (core.internalOrderId(current.external_reference) !== saved.orderId) throw error('failed-precondition', 'Os dados do pagamento não correspondem ao pedido.');
        await syncEntitlement(saved.uid, current, cfg, lock, undefined, false, true);
      });
      return { status: 200, body: 'ok' };
    } catch { return { status: 503, body: 'retry' }; }
  }
  return { getStatus, create, check, webhook };
}
module.exports = { BillingError, createBillingService };
