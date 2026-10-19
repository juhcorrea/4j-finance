'use strict';
const { randomUUID } = require('node:crypto');
const core = require('../functions/payment-core');

class BillingError extends Error {
  constructor(code, message) { super(message); this.name = 'BillingError'; this.code = code; }
}
const error = (code, message) => new BillingError(code, message);
const unavailable = () => error('unavailable', 'Não foi possível atualizar o pagamento agora. Tente novamente.');
const guarded = 'EXISTS (SELECT 1 FROM billingLocks WHERE uid = ? AND nonce = ? AND untilMs > ?)';
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
  async function withLock(uid, fn) {
    const lock = { uid, nonce: uuid() };
    await write('INSERT INTO billingLocks(uid, nonce, untilMs) VALUES (?, ?, ?) ON CONFLICT(uid) DO UPDATE SET nonce=excluded.nonce, untilMs=excluded.untilMs WHERE billingLocks.untilMs <= ?',
      [uid, lock.nonce, now() + 180000, now()]);
    try { return await fn(lock); }
    finally {
      // A late request must never delete a successor's lock.
      await write('DELETE FROM billingLocks WHERE uid = ? AND nonce = ?', [uid, lock.nonce], false);
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
  async function boundOrder(provider, uid, cfg) {
    const id = core.internalOrderId(provider?.external_reference);
    if (!id) throw error('permission-denied', 'O pagamento não pertence a esta conta.');
    const order = asOrder(await first('SELECT * FROM billingOrders WHERE orderId = ? AND uid = ?', [id, uid]));
    if (!order) throw error('permission-denied', 'O pagamento não pertence a esta conta.');
    try { core.validateOrder(provider, order, cfg); } catch { throw error('failed-precondition', 'Os dados do pagamento não correspondem ao pedido.'); }
    return order;
  }
  async function recordOrder(provider, uid, cfg, lock) {
    const order = await boundOrder(provider, uid, cfg);
    const paid = core.isPaid(provider) ? 1 : 0;
    if (paid && !order.paid) {
      const count = await first('SELECT COUNT(*) AS count FROM billingOrders WHERE uid = ? AND paid = 1', [uid]);
      if (count.count >= 10) throw error('resource-exhausted', 'Precisamos revisar os pagamentos desta conta.');
    }
    await write('UPDATE billingOrders SET providerOrderId = ?, providerStatus = ?, providerUpdatedAt = ?, checkedAt = ?, paid = ? WHERE orderId = ? AND uid = ? AND ' + guarded,
      [provider.id, core.publicStatus(provider), provider.last_updated_date, now(), paid, order.orderId, uid, ...guardValues(lock)]);
    return { ...order, providerOrderId: provider.id, paid };
  }
  async function updateReceipt(uid, granted, lock) {
    await write('INSERT INTO billingAccounts(uid, adFreeLifetime, updatedAt) SELECT ?, ?, ? WHERE ' + guarded +
      ' ON CONFLICT(uid) DO UPDATE SET adFreeLifetime=excluded.adFreeLifetime, updatedAt=excluded.updatedAt',
      [uid, granted ? 1 : 0, now(), ...guardValues(lock)]);
  }
  async function syncEntitlement(uid, candidate, cfg, lock) {
    const saved = await all('SELECT providerOrderId FROM billingOrders WHERE uid = ? AND paid = 1 LIMIT 11', [uid]);
    const ids = [...new Set([...saved.map(order => order.providerOrderId), ...(candidate ? [candidate.id] : [])])];
    if (ids.length > 10) throw error('resource-exhausted', 'Precisamos revisar os pagamentos desta conta.');
    if (ids.length && !cfg) cfg = await merchantConfig();
    const active = [];
    for (const id of ids) {
      const provider = candidate?.id === id ? candidate : await orderById(id);
      await recordOrder(provider, uid, cfg, lock);
      if (core.isPaid(provider)) active.push(id);
    }
    await updateReceipt(uid, active.length > 0, lock);
    return active.length > 0;
  }
  async function getStatus(actor) {
    const { uid } = actorCheck(actor);
    return withLock(uid, async lock => {
      let adFreeLifetime = await syncEntitlement(uid, null, null, lock);
      let pendingOrderId = null;
      if (!adFreeLifetime) {
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
          adFreeLifetime = await syncEntitlement(uid, provider, cfg, lock);
          if (!adFreeLifetime) pendingOrderId = order.orderId;
        }
      }
      await assertLock(lock);
      return { adFreeLifetime, pendingOrderId, price: 5, currency: 'BRL', paymentsEnabled: config.paymentsEnabled === true };
    });
  }
  async function reserve(actor, account, cfg, lock) {
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
    if (results.some(result => result.meta?.changes !== 1)) throw error('aborted', 'O pedido está sendo atualizado. Tente novamente.');
    // Never contact the provider unless both reservation and account pointer exist.
    const saved = await first('SELECT o.orderId FROM billingOrders o JOIN billingAccounts a ON a.activeOrderId=o.orderId AND a.uid=o.uid WHERE o.orderId=? AND o.uid=?', [orderId, actor.uid]);
    if (!saved) throw unavailable();
    await assertLock(lock);
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
      if (await syncEntitlement(actor.uid, null, cfg, lock)) return { adFreeLifetime: true, status: 'approved' };
      const account = await first('SELECT * FROM billingAccounts WHERE uid = ?', [actor.uid]);
      let order;
      if (account?.activeOrderId != null) {
        order = asOrder(await first('SELECT * FROM billingOrders WHERE orderId = ? AND uid = ?', [account.activeOrderId, actor.uid]));
        if (!order) throw error('failed-precondition', 'O pedido precisa ser conferido antes de continuar.');
        try { core.validateLocalOrder(order, cfg); } catch { throw error('failed-precondition', 'O ambiente do pedido precisa ser conferido.'); }
      }
      if (order?.providerOrderId) {
        const provider = await orderById(order.providerOrderId);
        await recordOrder(provider, actor.uid, cfg, lock);
        const granted = await syncEntitlement(actor.uid, provider, cfg, lock);
        if (granted || !core.canReplace(provider)) return { ...core.safeCheckout(provider, order), adFreeLifetime: granted };
        order = null;
      }
      // Unknown POST results retain the same UUID, byte-identical payload and key.
      if (!order) order = await reserve(actor, account, cfg, lock);
      const provider = await submit(order, cfg, lock);
      await recordOrder(provider, actor.uid, cfg, lock);
      const adFreeLifetime = await syncEntitlement(actor.uid, provider, cfg, lock);
      await assertLock(lock);
      return { ...core.safeCheckout(provider, order), adFreeLifetime };
    });
  }
  async function check(actor, { orderId } = {}) {
    actorCheck(actor);
    if (!core.ORDER_ID_RE.test(orderId || '')) throw error('invalid-argument', 'Pedido inválido.');
    return withLock(actor.uid, async lock => {
      const order = asOrder(await first('SELECT * FROM billingOrders WHERE orderId = ? AND uid = ?', [orderId, actor.uid]));
      if (!order) throw error('permission-denied', 'Este pedido não está disponível para sua conta.');
      if (!order.providerOrderId) throw error('unavailable', 'A cobrança ainda está sendo gerada. Tente gerar o Pix novamente.');
      const cfg = await merchantConfig();
      const provider = await orderById(order.providerOrderId);
      await recordOrder(provider, actor.uid, cfg, lock);
      const adFreeLifetime = await syncEntitlement(actor.uid, provider, cfg, lock);
      await assertLock(lock);
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
      const provider = await orderById(dataId);
      const orderId = core.internalOrderId(provider.external_reference);
      if (!orderId) return { status: 200, body: 'ignored' };
      const saved = await first('SELECT uid FROM billingOrders WHERE orderId = ?', [orderId]);
      if (!saved) return { status: 422, body: 'binding' };
      await withLock(saved.uid, async lock => {
        const current = await orderById(dataId);
        await recordOrder(current, saved.uid, cfg, lock);
        await syncEntitlement(saved.uid, current, cfg, lock);
        await assertLock(lock);
      });
      return { status: 200, body: 'ok' };
    } catch { return { status: 503, body: 'retry' }; }
  }
  return { getStatus, create, check, webhook };
}
module.exports = { BillingError, createBillingService };
