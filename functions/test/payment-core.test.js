'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const core = require('../payment-core');

const order = { orderId: 'd8441a65-2cef-4ba4-8ae9-195796f6ca15', uid: 'firebase-test-user', paymentId: '1234', sku: core.SKU, amountCents: 500, currency: 'BRL' };
const config = { collectorId: '5678', liveMode: false };
const payment = () => ({
  id: 1234, external_reference: '4j_' + order.orderId,
  metadata: { firebase_uid: order.uid, order_id: order.orderId, sku: core.SKU },
  transaction_amount: 5, currency_id: 'BRL', payment_method_id: 'pix', live_mode: false,
  collector_id: 5678, date_last_updated: '2026-10-15T12:00:00Z',
  status: 'approved', transaction_amount_refunded: 0,
});
test('valid payment is bound to the exact account, product, merchant and order', () => {
  assert.equal(core.validatePayment(payment(), order, config), true);
  assert.equal(core.isPaid(payment()), true);
});
for (const [field, value] of [
  ['transaction_amount', 0.05], ['transaction_amount', 4.99], ['transaction_amount', 5.01],
  ['currency_id', 'USD'], ['payment_method_id', 'credit_card'], ['collector_id', 9999],
  ['live_mode', true], ['id', 9999], ['external_reference', 'another-order'], ['date_last_updated', ''],
]) {
  test('rejects mismatched ' + field + '=' + value, () => {
    assert.throws(() => core.validatePayment({ ...payment(), [field]: value }, order, config));
  });
}
for (const [field, value] of [['firebase_uid', 'attacker'], ['order_id', 'another'], ['sku', 'another-product']]) {
  test('rejects tampered provider metadata ' + field, () => {
    const data = payment(); data.metadata[field] = value;
    assert.throws(() => core.validatePayment(data, order, config));
  });
}
test('editing Firestore owner cannot claim another customer payment', () => {
  assert.throws(() => core.validatePayment(payment(), { ...order, uid: 'attacker' }, config), /binding_mismatch/);
});
test('first authenticated creation may bind a payment id only after validation', () => {
  assert.equal(core.validatePayment(payment(), { ...order, paymentId: undefined }, config), true);
});
for (const status of ['pending', 'in_process', 'rejected', 'cancelled', 'refunded', 'charged_back']) {
  test(status + ' never grants ad-free', () => assert.equal(core.isPaid({ ...payment(), status }), false));
}
test('partial refund revokes this product even if provider status remains approved', () => {
  assert.equal(core.isPaid({ ...payment(), transaction_amount_refunded: 1 }), false);
  assert.equal(core.publicStatus({ ...payment(), transaction_amount_refunded: 1 }), 'refunded');
});
test('malformed refund amount never grants', () => {
  assert.equal(core.isPaid({ ...payment(), transaction_amount_refunded: 'invalid' }), false);
});
test('amount parser rejects malformed values and keeps integer cents', () => {
  assert.equal(core.cents('5.00'), 500);
  assert.equal(core.cents('0.01'), 1);
  for (const value of [null, {}, -1, '5e0', '5.001', Infinity]) assert.equal(core.cents(value), null);
});
const secret = 'unit-test-secret-only';
const manifest = 'id:1234;request-id:request-123;ts:1742505638683;';
const signature = 'ts=1742505638683,v1=' + createHmac('sha256', secret).update(manifest).digest('hex');
test('verifies official HMAC manifest with the query payment id', () => {
  assert.equal(core.verifySignature({ signature, requestId: 'request-123', dataId: '1234', secret }), true);
});
for (const override of [{ dataId: '9999' }, { requestId: 'other' }, { secret: 'other' }, { signature: signature + ',ts=1742505638683' }, { signature: 'ts=1,v1=abc' }, { dataId: ['1234'] }]) {
  test('rejects altered webhook ' + JSON.stringify(override), () => {
    assert.equal(core.verifySignature({ signature, requestId: 'request-123', dataId: '1234', secret, ...override }), false);
  });
}
test('CPF validation rejects empty, repeated and invalid digits', () => {
  for (const cpf of ['', '00000000000', '111.111.111-11', '12345678900', '<script>', 123]) assert.equal(core.validCpf(cpf), false);
  // Public synthetic test numbers; never a real customer identity.
  assert.equal(core.validCpf('529.982.247-25'), true);
});
test('checkout exposes only allowed fields and HTTPS Mercado Pago link', () => {
  const result = core.safeCheckout({ ...payment(), payer: { email: 'not-exposed' }, point_of_interaction: { transaction_data: { ticket_url: 'https://evil.example/path', qr_code: 'PIX', qr_code_base64: 'aW1hZ2U=' } } }, order);
  assert.equal(result.ticketUrl, '');
  assert.equal(result.qrCode, 'PIX');
  assert.equal(result.amount, 5);
  assert.equal('payer' in result, false);
});

for (const [field, value] of [['sku', 'another'], ['amountCents', 1], ['currency', 'USD']]) {
  test('rejects tampered stored order ' + field, () => {
    assert.throws(() => core.validatePayment(payment(), { ...order, [field]: value }, config), /order_product_mismatch/);
  });
}
