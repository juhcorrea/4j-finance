'use strict';
const { createHmac, timingSafeEqual } = require('node:crypto');

const SKU = '4j_adfree_lifetime';
const PRICE_CENTS = 500;
const REGION = 'southamerica-east1';
const ORDER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYMENT_ID_RE = /^[0-9]{1,32}$/;

function cents(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(String(value))) return null;
  const amount = Number(value) * 100;
  return Number.isSafeInteger(Math.round(amount)) ? Math.round(amount) : null;
}

function validCpf(input) {
  if (typeof input !== 'string' || input.length > 20) return false;
  const cpf = input.replace(/[.\-\s]/g, '');
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (let n = 9; n <= 10; n++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Number(cpf[i]) * (n + 1 - i);
    const digit = (sum * 10) % 11 % 10;
    if (digit !== Number(cpf[n])) return false;
  }
  return true;
}

function verifySignature({ signature, requestId, dataId, secret }) {
  if (typeof signature !== 'string' || typeof requestId !== 'string' || typeof dataId !== 'string' || !secret) return false;
  if (!PAYMENT_ID_RE.test(dataId) || !/^[\w-]{1,200}$/.test(requestId)) return false;
  const fields = Object.create(null);
  for (const item of signature.split(',')) {
    const match = /^\s*(ts|v1)=([^,]+)\s*$/.exec(item);
    if (!match || fields[match[1]]) return false;
    fields[match[1]] = match[2].trim();
  }
  if (!/^\d{10,13}$/.test(fields.ts || '') || !/^[a-f0-9]{64}$/i.test(fields.v1 || '')) return false;
  // Signed timestamp is kept verbatim. Delayed retries are allowed: replay is harmless
  // because every delivery re-reads the payment via the authenticated provider API.
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${fields.ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest();
  return timingSafeEqual(expected, Buffer.from(fields.v1, 'hex'));
}

function validatePayment(payment, order, config) {
  const fail = (code) => { const error = new Error(code); error.code = code; throw error; };
  if (!payment || !PAYMENT_ID_RE.test(String(payment.id || ''))) fail('invalid_payment');
  if (!order || !ORDER_ID_RE.test(order.orderId || '') || typeof order.uid !== 'string' || !order.uid) fail('invalid_order');
  if (order.sku !== SKU || order.amountCents !== PRICE_CENTS || order.currency !== 'BRL') fail('order_product_mismatch');
  if (order.paymentId && String(order.paymentId) !== String(payment.id)) fail('payment_mismatch');
  if (payment.external_reference !== `4j_${order.orderId}`) fail('reference_mismatch');
  const metadata = payment.metadata || {};
  if (metadata.order_id !== order.orderId || metadata.firebase_uid !== order.uid || metadata.sku !== SKU) fail('binding_mismatch');
  if (cents(payment.transaction_amount) !== PRICE_CENTS || payment.currency_id !== 'BRL') fail('amount_mismatch');
  if (payment.payment_method_id !== 'pix') fail('method_mismatch');
  if (typeof config.liveMode !== 'boolean' || payment.live_mode !== config.liveMode) fail('mode_mismatch');
  if (!/^\d+$/.test(String(config.collectorId || '')) || String(payment.collector_id) !== String(config.collectorId)) fail('collector_mismatch');
  if (!Number.isFinite(Date.parse(payment.date_last_updated || ''))) fail('missing_provider_date');
  return true;
}

function isPaid(payment) {
  return payment.status === 'approved' && cents(payment.transaction_amount_refunded ?? 0) === 0;
}

function publicStatus(payment) {
  if (cents(payment.transaction_amount_refunded ?? 0) > 0) return 'refunded';
  return ['approved', 'pending', 'in_process', 'rejected', 'cancelled', 'refunded', 'charged_back'].includes(payment.status) ? payment.status : 'pending';
}

function safeCheckout(payment, order) {
  const data = payment.point_of_interaction?.transaction_data || {};
  let ticketUrl = '';
  try { const url = new URL(data.ticket_url); if (url.protocol === 'https:' && ['www.mercadopago.com.br', 'mercadopago.com.br'].includes(url.hostname)) ticketUrl = url.href; } catch {}
  return {
    orderId: order.orderId, paymentId: String(payment.id), status: publicStatus(payment),
    amount: PRICE_CENTS / 100, currency: 'BRL',
    qrCode: typeof data.qr_code === 'string' && data.qr_code.length <= 4096 ? data.qr_code : '',
    qrCodeBase64: typeof data.qr_code_base64 === 'string' && data.qr_code_base64.length <= 500000 && /^[A-Za-z0-9+/=\r\n]+$/.test(data.qr_code_base64) ? data.qr_code_base64 : '',
    ticketUrl, expiresAt: payment.date_of_expiration || order.expiresAt || null,
  };
}

module.exports = { SKU, PRICE_CENTS, REGION, ORDER_ID_RE, PAYMENT_ID_RE, cents, validCpf, verifySignature, validatePayment, isPaid, publicStatus, safeCheckout };
