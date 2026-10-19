'use strict';
const { createHmac, timingSafeEqual } = require('node:crypto');

const SKU = '4j_adfree_lifetime';
const PRICE_CENTS = 500;
const REGION = 'southamerica-east1';
const ORDER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_ORDER_ID_RE = /^ORD(?:TST)?[0-9A-Z]{26}$/i;
const PAYMENT_ID_RE = /^PAY[0-9A-Z]{26}$/i;
const REFERENCE_PREFIX = '4j_adfree_';
const fail = code => { const error = new Error(code); error.code = code; throw error; };

function cents(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(String(value))) return null;
  const amount = Number(value) * 100;
  return Number.isSafeInteger(Math.round(amount)) ? Math.round(amount) : null;
}
function reference(orderId) {
  if (!ORDER_ID_RE.test(orderId || '')) fail('invalid_order');
  return REFERENCE_PREFIX + orderId;
}
function internalOrderId(value) {
  if (typeof value !== 'string' || !value.startsWith(REFERENCE_PREFIX)) return null;
  const id = value.slice(REFERENCE_PREFIX.length);
  return ORDER_ID_RE.test(id) ? id : null;
}
function validateMerchant(merchant, config) {
  if (!merchant || String(merchant.id) !== config.collectorId) fail('collector_mismatch');
  if (merchant.country_id !== 'BR' || merchant.site_id !== 'MLB') fail('merchant_country_mismatch');
  if (!Array.isArray(merchant.tags) || !merchant.tags.every(tag => typeof tag === 'string')) fail('missing_merchant_tags');
  if (typeof config.liveMode !== 'boolean' || merchant.tags.includes('test_user') === config.liveMode) fail('mode_mismatch');
  return true;
}
function validateLocalOrder(order, config) {
  if (!order || !ORDER_ID_RE.test(order.orderId || '') || typeof order.uid !== 'string' || !order.uid || order.uid.length > 128) fail('invalid_order');
  if (order.sku !== SKU || order.amountCents !== PRICE_CENTS || order.currency !== 'BRL') fail('order_product_mismatch');
  if (order.collectorId !== config.collectorId || order.applicationId !== config.applicationId || order.liveMode !== config.liveMode || order.projectId !== config.projectId) fail('order_environment_mismatch');
}
function createOrderBody(orderId, email, liveMode) {
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('invalid_email');
  return {
    type: 'online', total_amount: '5.00', external_reference: reference(orderId), processing_mode: 'automatic',
    transactions: { payments: [{ amount: '5.00', payment_method: { id: 'pix', type: 'bank_transfer' }, expiration_time: 'PT24H' }] },
    payer: { email, ...(liveMode === false ? { first_name: 'APRO' } : {}) },
  };
}
function verifySignature({ signature, requestId, dataId, secret }) {
  if (typeof signature !== 'string' || typeof requestId !== 'string' || typeof dataId !== 'string' || !secret) return false;
  if (!PROVIDER_ORDER_ID_RE.test(dataId) || !/^[\w-]{1,200}$/.test(requestId)) return false;
  const fields = Object.create(null);
  for (const item of signature.split(',')) {
    const match = /^\s*(ts|v1)=([^,]+)\s*$/.exec(item);
    if (!match || fields[match[1]]) return false;
    fields[match[1]] = match[2].trim();
  }
  if (!/^\d{10,13}$/.test(fields.ts || '') || !/^[a-f0-9]{64}$/i.test(fields.v1 || '')) return false;
  // Keep the signed timestamp verbatim; delayed retries re-read the current order.
  // Orders docs lowercase data.id; the official SDK preserves its original case.
  // Both variants require the complete signed manifest and the same strict order ID.
  // https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/notifications
  // https://github.com/mercadopago/sdk-nodejs/blob/master/src/utils/webhook/index.ts
  const suffix = ';request-id:' + requestId + ';ts:' + fields.ts + ';';
  const expectedExact = createHmac('sha256', secret).update('id:' + dataId + suffix).digest();
  const expectedLower = createHmac('sha256', secret).update('id:' + dataId.toLowerCase() + suffix).digest();
  const received = Buffer.from(fields.v1, 'hex');
  const exactMatches = timingSafeEqual(expectedExact, received);
  const lowerMatches = timingSafeEqual(expectedLower, received);
  return exactMatches || lowerMatches;
}
function paymentsOf(provider) {
  const transactions = provider?.transactions;
  if (transactions !== undefined && (transactions === null || typeof transactions !== 'object' || Array.isArray(transactions))) return null;
  const payments = transactions?.payments;
  if (payments === undefined) return [];
  return Array.isArray(payments) && payments.every(payment => payment !== null && typeof payment === 'object' && !Array.isArray(payment)) ? payments : null;
}
function validateOrder(provider, order, config) {
  validateLocalOrder(order, config);
  if (!provider || !PROVIDER_ORDER_ID_RE.test(provider.id || '')) fail('invalid_provider_order');
  if (order.providerOrderId && order.providerOrderId !== provider.id) fail('provider_order_mismatch');
  if (provider.external_reference !== reference(order.orderId)) fail('reference_mismatch');
  if (provider.type !== 'online' || provider.processing_mode !== 'automatic') fail('order_type_mismatch');
  if (cents(provider.total_amount) !== PRICE_CENTS) fail('amount_mismatch');
  if (String(provider.user_id) !== config.collectorId) fail('collector_mismatch');
  if (provider.country_code !== 'BRA') fail('country_mismatch');
  // The online GET contract uses country_code, not mandatory currency/live_mode.
  // Validate currency when returned; environment comes from authenticated /users/me.
  for (const key of ['currency', 'currency_id']) if (provider[key] !== undefined && provider[key] !== 'BRL') fail('currency_mismatch');
  const app = provider.integration_data?.application_id;
  if (app !== undefined && String(app) !== config.applicationId) fail('application_mismatch');
  if (!Number.isFinite(Date.parse(provider.last_updated_date || ''))) fail('missing_provider_date');
  const payments = paymentsOf(provider);
  if (payments === null) fail('malformed_payments');
  if (payments.length > 1) fail('multiple_payments');
  if (payments.length === 0) {
    if (!['created', 'processing', 'canceled', 'expired', 'failed'].includes(provider.status) || cents(provider.total_paid_amount ?? 0) !== 0) fail('missing_payment');
    return true;
  }
  const payment = payments[0];
  if (!PAYMENT_ID_RE.test(payment?.id || '')) fail('invalid_payment');
  if (cents(payment.amount) !== PRICE_CENTS) fail('payment_amount_mismatch');
  if (payment.payment_method?.id !== 'pix' || payment.payment_method?.type !== 'bank_transfer') fail('method_mismatch');
  return true;
}
function hasRefund(provider) {
  const payment = paymentsOf(provider)?.[0];
  if (payment?.refunded_amount !== undefined && cents(payment.refunded_amount) !== 0) return true;
  if ([provider?.status, provider?.status_detail, payment?.status, payment?.status_detail].some(value => ['refunded', 'partially_refunded'].includes(value))) return true;
  // Refund data is optional in the online GET schema. If supplied, any refund
  // record or malformed collection closes entitlement until reconciled.
  for (const value of [provider?.transactions?.refunds, provider?.refunds, payment?.refunds]) {
    if (value !== undefined && (!Array.isArray(value) || value.length !== 0)) return true;
  }
  return false;
}
function hasChargeback(provider) {
  const chargebacks = provider?.transactions?.chargebacks;
  return chargebacks !== undefined && (!Array.isArray(chargebacks) || chargebacks.length !== 0);
}
function isPaid(provider) {
  const payments = paymentsOf(provider);
  const payment = payments?.[0];
  return payments !== null && payments.length === 1 && !hasRefund(provider) && !hasChargeback(provider) &&
    provider.status === 'processed' && provider.status_detail === 'accredited' &&
    payment.status === 'processed' && payment.status_detail === 'accredited' &&
    cents(provider.total_amount) === PRICE_CENTS && cents(provider.total_paid_amount) === PRICE_CENTS &&
    cents(payment.amount) === PRICE_CENTS && cents(payment.paid_amount) === PRICE_CENTS;
}
function publicStatus(provider) {
  const payments = paymentsOf(provider);
  if (payments === null) return 'in_process';
  const payment = payments[0];
  if (hasChargeback(provider) || provider?.status === 'charged_back' || payment?.status === 'charged_back') return 'charged_back';
  if (hasRefund(provider)) return 'refunded';
  if (isPaid(provider)) return 'approved';
  if (provider?.status === 'canceled' || provider?.status === 'expired') return 'cancelled';
  if (provider?.status === 'failed') return 'rejected';
  if (provider?.status === 'action_required' && ['waiting_transfer', 'waiting_payment'].includes(provider.status_detail) &&
      payment?.status === 'action_required' && ['waiting_transfer', 'waiting_payment'].includes(payment.status_detail)) return 'pending';
  return 'in_process';
}
function canReplace(provider) {
  const payments = paymentsOf(provider);
  if (payments === null) return false;
  // Only an authoritative terminal state for the entire order permits a new
  // charge. A clock deadline or terminal child payment is not sufficient.
  if (['canceled', 'expired', 'failed'].includes(provider?.status)) {
    return cents(provider.total_paid_amount ?? 0) === 0 && payments.every(payment =>
      cents(payment.paid_amount ?? 0) === 0 && ['canceled', 'expired', 'failed'].includes(payment.status));
  }
  return ['refunded', 'charged_back'].includes(provider?.status) ||
    (provider?.status === 'processed' && ['refunded', 'partially_refunded'].includes(provider.status_detail));
}
function safeCheckout(provider, order) {
  const payment = paymentsOf(provider)?.[0];
  const data = payment?.payment_method || {};
  let ticketUrl = '';
  try { const url = new URL(data.ticket_url); if (url.protocol === 'https:' && ['www.mercadopago.com.br', 'mercadopago.com.br'].includes(url.hostname) && !url.username && !url.password) ticketUrl = url.href; } catch {}
  return {
    orderId: order.orderId, paymentId: payment?.id || '', status: publicStatus(provider),
    amount: PRICE_CENTS / 100, currency: 'BRL',
    qrCode: typeof data.qr_code === 'string' && data.qr_code.length <= 4096 ? data.qr_code : '',
    qrCodeBase64: typeof data.qr_code_base64 === 'string' && data.qr_code_base64.length <= 500000 && /^[A-Za-z0-9+/=\r\n]+$/.test(data.qr_code_base64) ? data.qr_code_base64 : '',
    ticketUrl, expiresAt: payment?.date_of_expiration || order.expiresAt || null,
  };
}
module.exports = { SKU, PRICE_CENTS, REGION, ORDER_ID_RE, PROVIDER_ORDER_ID_RE, PAYMENT_ID_RE, cents, reference, internalOrderId, validateMerchant, validateLocalOrder, createOrderBody, verifySignature, validateOrder, isPaid, publicStatus, canReplace, safeCheckout };
