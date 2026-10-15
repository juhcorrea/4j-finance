'use strict';
// Provider API: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/integration-configuration/integrate-pix
// Signatures: https://www.mercadopago.com.br/developers/en/docs/links-and-debts/additional-content/your-integrations/notifications/webhooks
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
const liveMode = defineString('MP_LIVE_MODE', { default: 'false' });
const webhookUrl = defineString('MP_WEBHOOK_URL');
const paymentsEnabled = defineBoolean('PAYMENTS_ENABLED', { default: false });
const options = { region: core.REGION, timeoutSeconds: 120, memory: '256MiB', minInstances: 0, maxInstances: 5, secrets: [accessToken] };

function config() {
  const mode = liveMode.value();
  const collector = collectorId.value();
  let url;
  try { url = new URL(webhookUrl.value()); } catch { throw new HttpsError('failed-precondition', 'O pagamento ainda está em configuração.'); }
  if (!['true', 'false'].includes(mode) || !/^\d+$/.test(collector) || url.protocol !== 'https:') throw new HttpsError('failed-precondition', 'O pagamento ainda está em configuração.');
  return { liveMode: mode === 'true', collectorId: collector, webhookUrl: url.href };
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

async function mp(path, body, idempotencyKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`https://api.mercadopago.com${path}`, {
      method: body ? 'POST' : 'GET', signal: controller.signal,
      headers: { Authorization: `Bearer ${accessToken.value()}`, 'Content-Type': 'application/json', ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      // Never expose provider payloads: they can contain payer identity or credentials.
      const failure = new HttpsError('unavailable', 'O Mercado Pago não confirmou a operação. Aguarde e tente novamente.');
      failure.providerStatus = response.status;
      throw failure;
    }
    return await response.json();
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('unavailable', 'Não foi possível consultar o pagamento agora. Tente novamente.');
  } finally { clearTimeout(timeout); }
}

async function paymentById(id) {
  if (!core.PAYMENT_ID_RE.test(String(id))) throw new HttpsError('invalid-argument', 'Pagamento inválido.');
  return mp(`/v1/payments/${id}`);
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

async function boundOrder(payment, expectedUid) {
  const id = payment.metadata?.order_id;
  if (!core.ORDER_ID_RE.test(id || '') || payment.metadata?.firebase_uid !== expectedUid) throw new HttpsError('permission-denied', 'O pagamento não pertence a esta conta.');
  const ref = db.collection('billingOrders').doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('failed-precondition', 'Não encontramos o pedido deste pagamento.');
  const order = { ...snap.data(), orderId: snap.id };
  if (order.uid !== expectedUid) throw new HttpsError('permission-denied', 'O pagamento não pertence a esta conta.');
  try { core.validatePayment(payment, order, config()); }
  catch { throw new HttpsError('failed-precondition', 'Os dados do pagamento não correspondem ao pedido.'); }
  return { ref, order };
}

async function recordPayment(payment, expectedUid) {
  const { ref, order } = await boundOrder(payment, expectedUid);
  await ref.set({
    paymentId: String(payment.id), providerStatus: core.publicStatus(payment),
    providerUpdatedAt: payment.date_last_updated, checkedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return order;
}

async function syncClaims(uid, candidate) {
  // The browser cannot write Firebase custom claims. Firestore billing records alone
  // NEVER grant the benefit, even if an old application's rules are too permissive.
  // All candidate payment IDs are checked again against the authenticated provider.
  const user = await auth.getUser(uid);
  const claims = user.customClaims || {};
  const previous = Array.isArray(claims.adFreePaymentIds) ? claims.adFreePaymentIds.filter(id => core.PAYMENT_ID_RE.test(String(id))) : [];
  const ids = [...new Set([...previous.map(String), ...(candidate ? [String(candidate.id)] : [])])];
  if (ids.length > 10) throw new HttpsError('resource-exhausted', 'Precisamos revisar os pagamentos desta conta.');
  const active = [];
  for (const id of ids) {
    const payment = candidate && String(candidate.id) === id ? candidate : await paymentById(id);
    await recordPayment(payment, uid);
    if (core.isPaid(payment)) active.push(id);
  }
  active.sort();
  const granted = active.length > 0;
  if (claims.adFreeLifetime !== granted || JSON.stringify(previous.slice().sort()) !== JSON.stringify(active)) {
    await auth.setCustomUserClaims(uid, { ...claims, adFreeLifetime: granted, adFreePaymentIds: active });
  }
  // This receipt is informational and is NOT an authority for entitlement.
  await db.collection('billingAccounts').doc(encodeURIComponent(uid)).set({ adFreeLifetime: granted, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return granted;
}

exports.getMonetizationStatus = onCall(options, async request => {
  const user = await actor(request);
  const adFreeLifetime = await withUserLock(user.uid, () => syncClaims(user.uid));
  return { adFreeLifetime, price: core.PRICE_CENTS / 100, currency: 'BRL', paymentsEnabled: paymentsEnabled.value() };
});

exports.createPixCheckout = onCall(options, async request => {
  const user = await actor(request, true);
  const cfg = config();
  if (!core.validCpf(request.data?.cpf)) throw new HttpsError('invalid-argument', 'Informe um CPF válido para gerar o Pix.');
  return withUserLock(user.uid, async () => {
    if (await syncClaims(user.uid)) return { adFreeLifetime: true, status: 'approved' };
    const accountRef = db.collection('billingAccounts').doc(encodeURIComponent(user.uid));
    const accountSnap = await accountRef.get();
    const account = accountSnap.data() || {};
    let order;
    if (core.ORDER_ID_RE.test(account.activeOrderId || '')) {
      const snap = await db.collection('billingOrders').doc(account.activeOrderId).get();
      if (snap.exists && snap.data().uid === user.uid) order = { ...snap.data(), orderId: snap.id };
    }
    if (order && !order.paymentId) {
      const search = await mp('/v1/payments/search?external_reference=' + encodeURIComponent('4j_' + order.orderId) + '&limit=10&sort=date_created&criteria=desc');
      const found = Array.isArray(search.results) ? search.results.filter(p => p.external_reference === '4j_' + order.orderId) : null;
      if (!found) throw new HttpsError('unavailable', 'Não foi possível recuperar o pedido. Tente novamente.');
      if (found.length > 1) throw new HttpsError('failed-precondition', 'Há mais de um pagamento neste pedido. Entre em contato com o suporte.');
      if (found.length === 1) {
        const recovered = await paymentById(found[0].id);
        await recordPayment(recovered, user.uid);
        order.paymentId = String(recovered.id);
      } else if (Date.parse(order.expiresAt) <= Date.now() || order.creationRejected === true) {
        order = null;
      }
    }
    if (order?.paymentId) {
      const existing = await paymentById(order.paymentId);
      await recordPayment(existing, user.uid);
      const granted = await syncClaims(user.uid, existing);
      if (granted) return { ...core.safeCheckout(existing, order), adFreeLifetime: true };
      if (['pending', 'in_process'].includes(existing.status) && Date.parse(existing.date_of_expiration || order.expiresAt) > Date.now()) {
        return { ...core.safeCheckout(existing, order), adFreeLifetime: false };
      }
      order = null;
    }
    // A failed/unknown provider response keeps the same reserved order and idempotency
    // key. Retrying cannot create a second charge for that attempt.
    if (!order) {
      const day = new Date().toISOString().slice(0, 10);
      const count = account.orderDay === day ? Number(account.ordersToday || 0) : 0;
      if (count >= 5 || Date.now() - Number(account.lastCreatedAt || 0) < 60000) throw new HttpsError('resource-exhausted', 'Aguarde um minuto antes de gerar outro Pix. Limite: 5 pedidos por dia.');
      const orderId = randomUUID();
      order = { orderId, uid: user.uid, sku: core.SKU, amountCents: core.PRICE_CENTS, currency: 'BRL', expiresAt: new Date(Date.now() + 86400000).toISOString(), createdAt: Date.now() };
      const batch = db.batch();
      batch.create(db.collection('billingOrders').doc(orderId), order);
      batch.set(accountRef, { activeOrderId: orderId, orderDay: day, ordersToday: count + 1, lastCreatedAt: Date.now() }, { merge: true });
      await batch.commit();
    }
    let payment;
    try { payment = await mp('/v1/payments', {
      transaction_amount: core.PRICE_CENTS / 100, description: '4J Finance: sem anúncios nesta conta, pagamento único',
      payment_method_id: 'pix', date_of_expiration: order.expiresAt,
      external_reference: `4j_${order.orderId}`, notification_url: cfg.webhookUrl,
      metadata: { firebase_uid: user.uid, order_id: order.orderId, sku: core.SKU },
      payer: { email: user.email, identification: { type: 'CPF', number: request.data.cpf.replace(/[.\-\s]/g, '') } },
    }, order.orderId); }
    catch (error) {
      if ([400, 422].includes(error.providerStatus)) {
        await db.collection('billingOrders').doc(order.orderId).set({ creationRejected: true }, { merge: true });
        throw new HttpsError('invalid-argument', 'Os dados do Pix não foram aceitos. Confira o CPF e tente novamente.');
      }
      throw error;
    }
    // CPF is not persisted or logged by this code.
    await recordPayment(payment, user.uid);
    const adFreeLifetime = await syncClaims(user.uid, payment);
    return { ...core.safeCheckout(payment, order), adFreeLifetime };
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
    if (!order.paymentId) throw new HttpsError('unavailable', 'A cobrança ainda está sendo gerada. Tente gerar o Pix novamente.');
    const payment = await paymentById(order.paymentId);
    await recordPayment(payment, user.uid);
    const adFreeLifetime = await syncClaims(user.uid, payment);
    return { ...core.safeCheckout(payment, order), adFreeLifetime };
  });
});

exports.mercadoPagoWebhook = onRequest({ ...options, secrets: [accessToken, webhookSecret], cors: false }, async (request, response) => {
  if (request.method !== 'POST') { response.set('Allow', 'POST').status(405).send('method'); return; }
  const dataId = request.query['data.id'];
  if (!core.verifySignature({ signature: request.get('x-signature'), requestId: request.get('x-request-id'), dataId, secret: webhookSecret.value() })) { response.status(401).send('signature'); return; }
  // Never trust status, UID, or resource URLs supplied by the webhook body.
  if (request.body?.type !== 'payment' && request.query.type !== 'payment') { response.status(400).send('topic'); return; }
  try {
    const payment = await paymentById(dataId);
    const uid = payment.metadata?.firebase_uid;
    // Other merchant products may use the same app/webhook; acknowledge without action.
    if (payment.metadata?.sku !== core.SKU) { response.status(200).send('ignored'); return; }
    if (typeof uid !== 'string' || !uid || uid.length > 128) { response.status(422).send('binding'); return; }
    await withUserLock(uid, async () => { const current = await paymentById(dataId); await recordPayment(current, uid); await syncClaims(uid, current); });
    // ACK only after Firestore AND Firebase Auth have completed. Failures are retried.
    response.status(200).send('ok');
  } catch {
    response.status(503).send('retry');
  }
});
