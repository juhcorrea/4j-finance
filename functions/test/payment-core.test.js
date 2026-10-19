'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const core = require('../payment-core');
const f = require('./fixtures');
test('official Orders shape binds the server reservation, merchant and Pix product', () => {
  assert.equal(core.validateOrder(f.provider(), f.order(), f.config), true);
  assert.equal(core.isPaid(f.provider()), true);
});
for (const [field, value] of [
  ['id', '1234'], ['external_reference', 'foreign'], ['total_amount', '4.99'], ['total_amount', '5.01'],
  ['user_id', '9999'], ['country_code', 'ARG'], ['country_code', undefined], ['currency', 'ARS'],
  ['currency_id', 'USD'], ['processing_mode', 'manual'], ['type', 'qr'], ['last_updated_date', ''],
]) test('rejects mismatched provider ' + field + '=' + value, () => assert.throws(() => core.validateOrder({ ...f.provider(), [field]: value }, f.order(), f.config)));
for (const [field, value] of [['sku', 'other'], ['amountCents', 1], ['currency', 'USD'], ['collectorId', '9'], ['applicationId', '8'], ['liveMode', true], ['projectId', 'production'], ['providerOrderId', f.providerId(2)]]) {
  test('rejects altered reservation ' + field, () => assert.throws(() => core.validateOrder(f.provider(), f.order({ [field]: value }), f.config)));
}
test('optional currency and application are checked when supplied, not invented', () => {
  const value = f.provider(); delete value.integration_data;
  assert.equal(core.validateOrder(value, f.order(), f.config), true);
  value.currency = 'BRL'; value.currency_id = 'BRL';
  assert.equal(core.validateOrder(value, f.order(), f.config), true);
  value.integration_data = { application_id: '9999' };
  assert.throws(() => core.validateOrder(value, f.order(), f.config), /application_mismatch/);
});
for (const mutate of [
  p => { p.transactions.payments.push({ ...p.transactions.payments[0] }); },
  p => { p.transactions.payments[0].amount = '0.05'; },
  p => { p.transactions.payments[0].id = '123'; },
  p => { p.transactions.payments[0].payment_method.id = 'visa'; },
  p => { p.transactions.payments[0].payment_method.type = 'credit_card'; },
  p => { p.transactions.payments = []; },
]) test('rejects unsafe payment collection ' + String(mutate), () => {
  const value = f.provider(); mutate(value); assert.throws(() => core.validateOrder(value, f.order(), f.config));
});
test('created/processing order without a payment is resumable but never paid', () => {
  for (const status of ['created', 'processing']) {
    const value = f.provider({ status, status_detail: 'in_process', total_paid_amount: '0.00', transactions: {} });
    assert.equal(core.validateOrder(value, f.order(), f.config), true);
    assert.equal(core.isPaid(value), false);
    assert.equal(core.publicStatus(value), 'in_process');
    assert.equal(core.safeCheckout(value, f.order()).qrCode, '');
    value.total_paid_amount = '5.00';
    assert.throws(() => core.validateOrder(value, f.order(), f.config));
  }
});
for (const mutate of [
  p => { p.status = 'processing'; },
  p => { p.status_detail = 'pending_review_manual'; },
  p => { p.total_paid_amount = '4.99'; },
  p => { delete p.total_paid_amount; },
  p => { p.transactions.payments[0].status = 'action_required'; },
  p => { p.transactions.payments[0].status_detail = 'waiting_transfer'; },
  p => { p.transactions.payments[0].paid_amount = '4.99'; },
  p => { p.transactions.payments[0].paid_amount = '5.01'; },
  p => { delete p.transactions.payments[0].paid_amount; },
  p => { p.transactions.payments[0].paid_amount = 'invalid'; },
  p => { p.status_detail = 'partially_refunded'; },
  p => { p.transactions.payments[0].status_detail = 'partially_refunded'; },
  p => { p.transactions.refunds = [{ amount: '1.00', status: 'processed' }]; },
  p => { p.transactions.refunds = 'invalid'; },
  p => { p.status = 'charged_back'; },
]) test('does not grant incomplete or refunded payment ' + String(mutate), () => {
  const value = f.provider(); mutate(value); assert.equal(core.isPaid(value), false);
});
test('normalizes provider terminal states and never replaces unresolved orders', () => {
  for (const [status, normalized] of [['canceled', 'cancelled'], ['expired', 'cancelled'], ['failed', 'rejected'], ['refunded', 'refunded'], ['charged_back', 'charged_back']]) {
    const value = f.provider({ status, status_detail: status });
    assert.equal(core.publicStatus(value), normalized);
    if (['canceled', 'expired', 'failed'].includes(status)) {
      value.total_paid_amount = '0.00'; value.transactions.payments[0].paid_amount = '0.00'; value.transactions.payments[0].status = status;
    }
    assert.equal(core.canReplace(value), true);
  }
  for (const status of ['processing', 'created', 'action_required', 'unknown']) assert.equal(core.canReplace(f.provider({ status })), false);
  const value = f.provider({ status: 'action_required', status_detail: 'waiting_transfer', total_paid_amount: '0.00' });
  Object.assign(value.transactions.payments[0], { status: 'action_required', status_detail: 'waiting_transfer', paid_amount: '0.00' });
  assert.equal(core.publicStatus(value), 'pending');
});
test('merchant token must prove expected account, Brazil site and test/production mode', () => {
  const merchant = { id: 5678, country_id: 'BR', site_id: 'MLB', tags: ['test_user'] };
  assert.equal(core.validateMerchant(merchant, f.config), true);
  assert.equal(core.validateMerchant({ ...merchant, tags: ['normal'] }, { ...f.config, liveMode: true }), true);
  for (const patch of [{ id: 1 }, { country_id: 'AR' }, { site_id: 'MLA' }, { tags: undefined }, { tags: 'test_user' }, { tags: [] }]) {
    assert.throws(() => core.validateMerchant({ ...merchant, ...patch }, f.config));
  }
  assert.throws(() => core.validateMerchant(merchant, { ...f.config, liveMode: true }));
});
test('idempotent payload uses only verified email and sandbox APRO, never CPF or metadata', () => {
  const body = core.createOrderBody(f.order().orderId, 'alice@example.invalid', true);
  assert.deepEqual(body.payer, { email: 'alice@example.invalid' });
  assert.equal(body.total_amount, '5.00');
  assert.equal(body.transactions.payments[0].expiration_time, 'PT24H');
  assert.equal('metadata' in body, false);
  assert.equal('live_mode' in body, false);
  assert.equal('notification_url' in body, false);
  assert.equal(core.createOrderBody(f.order().orderId, 'alice@example.invalid', false).payer.first_name, 'APRO');
});
const secret = 'synthetic-secret';
const dataId = f.providerId(1);
const requestId = 'request-123';
const ts = '1742505638683';
const signature = 'ts=' + ts + ',v1=' + createHmac('sha256', secret).update('id:' + dataId.toLowerCase() + ';request-id:' + requestId + ';ts:' + ts + ';').digest('hex');
test('official webhook HMAC lowercases ORD query id and ignores no signed fields', () => {
  assert.equal(core.verifySignature({ signature, requestId, dataId, secret }), true);
  assert.equal(core.verifySignature({ signature, requestId, dataId: dataId.toLowerCase(), secret }), true);
});
for (const override of [{ dataId: f.providerId(2) }, { requestId: 'other' }, { secret: 'other' }, { signature: signature + ',ts=' + ts }, { signature: 'ts=1,v1=abc' }, { dataId: [dataId] }, { dataId: '1234' }]) {
  test('rejects altered signature ' + JSON.stringify(override), () => assert.equal(core.verifySignature({ signature, requestId, dataId, secret, ...override }), false));
}
test('integer cents reject malformed amounts and checkout emits no payer/merchant records', () => {
  for (const value of [null, {}, -1, '5e0', '5.001', Infinity]) assert.equal(core.cents(value), null);
  assert.equal(core.cents('5.00'), 500);
  const value = f.provider(); value.transactions.payments[0].payment_method.ticket_url = 'https://evil.example/pay';
  const result = core.safeCheckout(value, f.order());
  assert.equal(result.ticketUrl, ''); assert.equal(result.qrCode, 'SYNTHETIC-PIX');
  assert.equal(result.paymentId, f.paymentId(1)); assert.equal(result.currency, 'BRL');
  assert.equal('payer' in result, false); assert.equal('user_id' in result, false);
});


test('official sandbox ORDTST order IDs are accepted and signed in lowercase', () => {
  const id = 'ORDTST01KB00C5QRFKWERZQW5D6THPYQ';
  assert.equal(core.PROVIDER_ORDER_ID_RE.test(id), true);
  const signature = 'ts=' + ts + ',v1=' + createHmac('sha256', secret).update('id:' + id.toLowerCase() + ';request-id:' + requestId + ';ts:' + ts + ';').digest('hex');
  assert.equal(core.verifySignature({ signature, requestId, dataId: id, secret }), true);
});

test('contradictory terminal order with paid or still-processing child cannot create another charge', () => {
  for (const status of ['canceled', 'expired', 'failed']) {
    const value = f.provider({ status, status_detail: status });
    assert.equal(core.canReplace(value), false);
    value.total_paid_amount = '0.00'; value.transactions.payments[0].paid_amount = '0.00'; value.transactions.payments[0].status = 'processing';
    assert.equal(core.canReplace(value), false);
    value.transactions.payments[0].status = status; value.total_paid_amount = 'invalid';
    assert.equal(core.canReplace(value), false);
  }
});
test('terminal empty order is safe to replace only with no paid amount', () => {
  const value = f.provider({ status: 'expired', status_detail: 'expired', total_paid_amount: '0.00', transactions: {} });
  assert.equal(core.validateOrder(value, f.order(), f.config), true);
  assert.equal(core.canReplace(value), true);
  value.total_paid_amount = '5.00';
  assert.equal(core.canReplace(value), false);
  assert.throws(() => core.validateOrder(value, f.order(), f.config));
});

for (const amount of ['0.01', '1.00', 'invalid', null]) test('refunded_amount blocks entitlement before provider statuses update: ' + amount, () => {
  const value = f.provider(); value.transactions.payments[0].refunded_amount = amount;
  assert.equal(core.validateOrder(value, f.order(), f.config), true);
  assert.equal(core.isPaid(value), false);
  assert.equal(core.publicStatus(value), 'refunded');
});
test('zero refunded_amount does not revoke a fully credited order', () => {
  const value = f.provider(); value.transactions.payments[0].refunded_amount = '0.00';
  assert.equal(core.isPaid(value), true);
});
for (const chargebacks of [[{ id: 'CBK-SYNTHETIC', transaction_id: f.paymentId(1), status: 'in_process' }], {}, null]) test('supplied chargeback evidence closes entitlement: ' + JSON.stringify(chargebacks), () => {
  const value = f.provider(); value.transactions.chargebacks = chargebacks;
  assert.equal(core.validateOrder(value, f.order(), f.config), true);
  assert.equal(core.isPaid(value), false);
  assert.equal(core.publicStatus(value), 'charged_back');
});
for (const payments of [f.provider().transactions.payments[0], null, 'invalid', [null], [['invalid']]]) test('malformed payments never become an empty terminal order: ' + JSON.stringify(payments), () => {
  const value = f.provider({ status: 'expired', status_detail: 'expired', total_paid_amount: '0.00', transactions: { payments } });
  assert.throws(() => core.validateOrder(value, f.order(), f.config), /malformed_payments/);
  assert.equal(core.isPaid(value), false);
  assert.equal(core.canReplace(value), false);
  assert.equal(core.publicStatus(value), 'in_process');
});

test('official SDK exact-case and Orders lowercase HMAC variants require every signed field', () => {
  for (const id of [f.providerId(73), 'ORDTST01KB00C5QRFKWERZQW5D6THPYQ']) {
    for (const signedId of [id, id.toLowerCase()]) {
      const mac = createHmac('sha256', secret).update('id:' + signedId + ';request-id:' + requestId + ';ts:' + ts + ';').digest('hex');
      const input = { signature: 'ts=' + ts + ',v1=' + mac, dataId: id, requestId, secret };
      assert.equal(core.verifySignature(input), true);
      for (const override of [{ dataId: f.providerId(999) }, { requestId: 'different-request' }, { secret: 'different-secret' },
        { signature: 'ts=1742505638684,v1=' + mac }, { signature: input.signature + ',v1=' + mac },
        { signature: 'ts=' + ts + ',v1=' + 'ａ'.repeat(64) }, { signature: 'ts=' + ts + ',v1=' + mac.slice(1) },
        { dataId: undefined }, { requestId: undefined }]) assert.equal(core.verifySignature({ ...input, ...override }), false);
    }
    const omitted = createHmac('sha256', secret).update('request-id:' + requestId + ';ts:' + ts + ';').digest('hex');
    assert.equal(core.verifySignature({ signature: 'ts=' + ts + ',v1=' + omitted, dataId: id, requestId, secret }), false);
  }
});
