'use strict';
// Official contracts:
// https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/websites/pix
// https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/notifications
const { randomUUID } = require('node:crypto');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret, defineString, defineBoolean } = require('firebase-functions/params');
const core = require('./payment-core');

initializeApp();
const db = getFirestore();
const auth = getAuth();
const accessToken = defineSecret('MP_ACCESS_TOKEN');
const webhookSecret = defineSecret('MP_WEBHOOK_SECRET');
const collectorId = defineString('MP_COLLECTOR_ID');
const applicationId = defineString('MP_APPLICATION_ID');
const liveMode = defineString('MP_LIVE_MODE', { default: 'false' });
const testProject = defineString('MP_TEST_FIREBASE_PROJECT_ID');
const productionProject = defineString('MP_PRODUCTION_FIREBASE_PROJECT_ID');
const paymentsEnabled = defineBoolean('PAYMENTS_ENABLED', { default: false });
const options = { region: core.REGION, timeoutSeconds: 120, memory: '256MiB', minInstances: 0, maxInstances: 5, secrets: [accessToken] };

function config() {
  const mode = liveMode.value();
  const collector = collectorId.value();
  const application = applicationId.value();
  const test = testProject.value(), production = productionProject.value();
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
  const projectPattern = /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/;
  if (!['true', 'false'].includes(mode) || !/^\d+$/.test(collector) || !/^\d+$/.test(application) ||
      !projectPattern.test(test || '') || !projectPattern.test(production || '') || test === production ||
      projectId !== (mode === 'true' ? production : test)) {
    throw new HttpsError('failed-precondition', 'O ambiente do pagamento ainda está em configuração.');
  }
  return { liveMode: mode === 'true', collectorId: collector, applicationId: application, projectId };
}
async function actor(request, purchase = false) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Entre na sua conta para continuar.');
  const user = await auth.getUser(request.auth.uid);
  if (user.disabled) throw new HttpsError('permission-denied', 'Esta conta está desativada.');
  if (purchase) {
    if (!paymentsEnabled.value()) throw new HttpsError('failed-precondition', 'O pagamento ainda não foi ativado.');
    if (!user.email || !user.emailVerified) throw new HttpsError('failed-precondition', 'Confirme seu e-mail antes de gerar o Pix.');
    const account = await db.collection('users').doc(user.uid).get();
    if (!account.exists || account.data().status !== 'approved') throw new HttpsError('permission-denied', 'Sua conta precisa estar ativa para comprar.');
  }
  return user;
}
async function providerRequest(url, body, idempotencyKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST', signal: controller.signal, redirect: 'error',
      headers: { Authorization: 'Bearer ' + accessToken.value(), 'Content-Type': 'application/json', ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}) },
      ...(body === undefined ? {} : { body }),
    });
    if (!response.ok) throw new HttpsError('unavailable', 'O Mercado Pago não confirmou a operação. Aguarde e tente novamente.');
    return await response.json();
  } catch (error) {
    // Never expose/log provider bodies, tokens, or payer identity.
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('unavailable', 'Não foi possível consultar o pagamento agora. Tente novamente.');
  } finally { clearTimeout(timeout); }
}
async function merchantConfig() {
  const cfg = config();
  const merchant = await providerRequest('https://api.mercadopago.com/users/me');
  try { core.validateMerchant(merchant, cfg); }
  catch { throw new HttpsError('failed-precondition', 'A conta e o ambiente do Mercado Pago precisam ser conferidos.'); }
  return cfg;
}
async function orderById(id) {
  if (typeof id !== 'string' || !core.PROVIDER_ORDER_ID_RE.test(id)) throw new HttpsError('invalid-argument', 'Pagamento inválido.');
  return providerRequest('https://api.mercadopago.com/v1/orders/' + id.toUpperCase());
}
async function withUserLock(uid, operation) {
  const ref = db.collection('billingLocks').doc(encodeURIComponent(uid));
  const nonce = randomUUID();
  await db.runTransaction(async tx => {
    const old = await tx.get(ref);
    if (old.exists && old.data().until > Date.now()) throw new HttpsError('aborted', 'Estamos atualizando seu pagamento. Tente novamente em alguns segundos.');
    tx.set(ref, { nonce, until: Date.now() + 180000 });
  });
  try { return await operation(); }
  finally {
    await db.runTransaction(async tx => { const snap = await tx.get(ref); if (snap.exists && snap.data().nonce === nonce) tx.delete(ref); });
  }
}
async function boundOrder(provider, expectedUid, cfg) {
  const id = core.internalOrderId(provider.external_reference);
  if (!id) throw new HttpsError('permission-denied', 'O pagamento não pertence a esta conta.');
  const ref = db.collection('billingOrders').doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('failed-precondition', 'Não encontramos o pedido deste pagamento.');
  const order = { ...snap.data(), orderId: snap.id };
  if (order.uid !== expectedUid) throw new HttpsError('permission-denied', 'O pagamento não pertence a esta conta.');
  try { core.validateOrder(provider, order, cfg); }
  catch { throw new HttpsError('failed-precondition', 'Os dados do pagamento não correspondem ao pedido.'); }
  return { ref, order };
}
async function recordOrder(provider, expectedUid, cfg) {
  const { ref, order } = await boundOrder(provider, expectedUid, cfg);
  await ref.set({
    providerOrderId: provider.id, providerStatus: core.publicStatus(provider),
    providerUpdatedAt: provider.last_updated_date, checkedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { ...order, providerOrderId: provider.id };
}
async function syncClaims(uid, candidate, cfg) {
  // Only authenticated provider GETs plus the private server-created reservation
  // grant entitlement. Browser fields and informational receipts never do.
  const user = await auth.getUser(uid);
  const claims = user.customClaims || {};
  const previous = Array.isArray(claims.adFreeOrderIds) ? claims.adFreeOrderIds.filter(id => typeof id === 'string' && core.PROVIDER_ORDER_ID_RE.test(id)) : [];
  const ids = [...new Set([...previous, ...(candidate ? [candidate.id] : [])])];
  if (ids.length > 10) throw new HttpsError('resource-exhausted', 'Precisamos revisar os pagamentos desta conta.');
  if (ids.length && !cfg) cfg = await merchantConfig();
  const active = [];
  for (const id of ids) {
    const provider = candidate && candidate.id === id ? candidate : await orderById(id);
    await recordOrder(provider, uid, cfg);
    if (core.isPaid(provider)) active.push(id);
  }
  active.sort();
  const granted = active.length > 0;
  if (claims.adFreeLifetime !== granted || JSON.stringify(previous.slice().sort()) !== JSON.stringify(active) || claims.adFreePaymentIds !== undefined) {
    const nextClaims = { ...claims, adFreeLifetime: granted, adFreeOrderIds: active };
    delete nextClaims.adFreePaymentIds; // No deployed legacy payments exist.
    await auth.setCustomUserClaims(uid, nextClaims);
  }
  await db.collection('billingAccounts').doc(encodeURIComponent(uid)).set({ adFreeLifetime: granted, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return granted;
}
exports.getMonetizationStatus = onCall(options, async request => {
  const user = await actor(request);
  const state = await withUserLock(user.uid, async () => {
    const adFreeLifetime = await syncClaims(user.uid);
    let pendingOrderId = null;
    if (!adFreeLifetime) {
      const account = await db.collection('billingAccounts').doc(encodeURIComponent(user.uid)).get();
      const orderId = account.data()?.activeOrderId;
      if (core.ORDER_ID_RE.test(orderId || '')) {
        const snap = await db.collection('billingOrders').doc(orderId).get();
        const order = snap.data();
        if (snap.exists && order.uid === user.uid && core.PROVIDER_ORDER_ID_RE.test(order.providerOrderId || '')) pendingOrderId = orderId;
      }
    }
    return { adFreeLifetime, pendingOrderId };
  });
  return { ...state, price: core.PRICE_CENTS / 100, currency: 'BRL', paymentsEnabled: paymentsEnabled.value() };
});
async function submitReservedOrder(order, cfg) {
  try {
    core.validateLocalOrder(order, cfg);
    const body = JSON.parse(order.requestPayload);
    // Exact immutable payload is kept in private billing storage for retries.
    // The only payer datum is verified Auth email; CPF is never read or saved.
    if (JSON.stringify(core.createOrderBody(order.orderId, body.payer?.email, order.liveMode)) !== order.requestPayload) throw Error('payload');
  } catch { throw new HttpsError('failed-precondition', 'O pedido precisa ser conferido antes de continuar.'); }
  const result = await providerRequest('https://api.mercadopago.com/v1/orders', order.requestPayload, order.orderId);
  if (!core.PROVIDER_ORDER_ID_RE.test(result?.id || '')) throw new HttpsError('unavailable', 'A cobrança ainda está sendo gerada. Tente novamente.');
  if (result.external_reference !== undefined && result.external_reference !== core.reference(order.orderId)) throw new HttpsError('failed-precondition', 'O pedido precisa ser conferido antes de continuar.');
  // Store a trusted POST response ID even when GET is temporarily unavailable.
  // This does not grant anything; all fields are validated by authenticated GET.
  await db.collection('billingOrders').doc(order.orderId).set({ providerOrderId: result.id }, { merge: true });
  order.providerOrderId = result.id;
  return orderById(result.id);
}
exports.createPixCheckout = onCall(options, async request => {
  const user = await actor(request, true);
  const cfg = await merchantConfig();
  return withUserLock(user.uid, async () => {
    if (await syncClaims(user.uid, null, cfg)) return { adFreeLifetime: true, status: 'approved' };
    const accountRef = db.collection('billingAccounts').doc(encodeURIComponent(user.uid));
    const accountSnap = await accountRef.get();
    const account = accountSnap.data() || {};
    let order;
    if (account.activeOrderId !== undefined) {
      if (!core.ORDER_ID_RE.test(account.activeOrderId || '')) throw new HttpsError('failed-precondition', 'O pedido precisa ser conferido antes de continuar.');
      const snap = await db.collection('billingOrders').doc(account.activeOrderId).get();
      if (!snap.exists || snap.data().uid !== user.uid) throw new HttpsError('failed-precondition', 'O pedido precisa ser conferido antes de continuar.');
      order = { ...snap.data(), orderId: snap.id };
      try { core.validateLocalOrder(order, cfg); } catch { throw new HttpsError('failed-precondition', 'O ambiente do pedido precisa ser conferido.'); }
    }
    if (order?.providerOrderId) {
      const existing = await orderById(order.providerOrderId);
      await recordOrder(existing, user.uid, cfg);
      const granted = await syncClaims(user.uid, existing, cfg);
      if (granted) return { ...core.safeCheckout(existing, order), adFreeLifetime: true };
      if (!core.canReplace(existing)) return { ...core.safeCheckout(existing, order), adFreeLifetime: false };
      order = null;
    }
    // An unknown creation result NEVER expires the reservation and NEVER changes
    // its key/body. Orders has no documented search endpoint; POST replay with the
    // original X-Idempotency-Key or a verified webhook recovers the original ID.
    if (!order) {
      const day = new Date().toISOString().slice(0, 10);
      const count = account.orderDay === day ? Number(account.ordersToday || 0) : 0;
      if (count >= 5 || Date.now() - Number(account.lastCreatedAt || 0) < 60000) throw new HttpsError('resource-exhausted', 'Aguarde um minuto antes de gerar outro Pix. Limite: 5 pedidos por dia.');
      const orderId = randomUUID();
      order = {
        orderId, uid: user.uid, sku: core.SKU, amountCents: core.PRICE_CENTS, currency: 'BRL',
        collectorId: cfg.collectorId, applicationId: cfg.applicationId, liveMode: cfg.liveMode, projectId: cfg.projectId,
        requestPayload: JSON.stringify(core.createOrderBody(orderId, user.email, cfg.liveMode)),
        expiresAt: new Date(Date.now() + 86400000).toISOString(), createdAt: Date.now(),
      };
      const batch = db.batch();
      batch.create(db.collection('billingOrders').doc(orderId), order);
      batch.set(accountRef, { activeOrderId: orderId, orderDay: day, ordersToday: count + 1, lastCreatedAt: Date.now() }, { merge: true });
      await batch.commit();
    }
    const provider = await submitReservedOrder(order, cfg);
    await recordOrder(provider, user.uid, cfg);
    const adFreeLifetime = await syncClaims(user.uid, provider, cfg);
    return { ...core.safeCheckout(provider, order), adFreeLifetime };
  });
});
exports.checkPixCheckout = onCall(options, async request => {
  const user = await actor(request);
  const orderId = request.data?.orderId;
  if (!core.ORDER_ID_RE.test(orderId || '')) throw new HttpsError('invalid-argument', 'Pedido inválido.');
  return withUserLock(user.uid, async () => {
    const snap = await db.collection('billingOrders').doc(orderId).get();
    if (!snap.exists || snap.data().uid !== user.uid) throw new HttpsError('permission-denied', 'Este pedido não está disponível para sua conta.');
    const order = { ...snap.data(), orderId };
    if (!order.providerOrderId) throw new HttpsError('unavailable', 'A cobrança ainda está sendo gerada. Tente gerar o Pix novamente.');
    const cfg = await merchantConfig();
    const provider = await orderById(order.providerOrderId);
    await recordOrder(provider, user.uid, cfg);
    const adFreeLifetime = await syncClaims(user.uid, provider, cfg);
    return { ...core.safeCheckout(provider, order), adFreeLifetime };
  });
});
exports.mercadoPagoWebhook = onRequest({ ...options, secrets: [accessToken, webhookSecret], cors: false }, async (request, response) => {
  if (request.method !== 'POST') { response.set('Allow', 'POST').status(405).send('method'); return; }
  const dataId = request.query['data.id'];
  if (!core.verifySignature({ signature: request.get('x-signature'), requestId: request.get('x-request-id'), dataId, secret: webhookSecret.value() })) { response.status(401).send('signature'); return; }
  if (request.body?.type !== 'order' && request.query.type !== 'order') { response.status(400).send('topic'); return; }
  try {
    // HMAC signs the resource ID, not body status/merchant/live_mode. Ignore all
    // body values and resolve UID exclusively from our private saved reservation.
    const cfg = await merchantConfig();
    const provider = await orderById(dataId);
    const orderId = core.internalOrderId(provider.external_reference);
    if (!orderId) { response.status(200).send('ignored'); return; }
    const snap = await db.collection('billingOrders').doc(orderId).get();
    const uid = snap.data()?.uid;
    if (!snap.exists || typeof uid !== 'string' || !uid || uid.length > 128) { response.status(422).send('binding'); return; }
    await withUserLock(uid, async () => {
      const current = await orderById(dataId);
      await recordOrder(current, uid, cfg);
      await syncClaims(uid, current, cfg);
    });
    response.status(200).send('ok');
  } catch { response.status(503).send('retry'); }
});
