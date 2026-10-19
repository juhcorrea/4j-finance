'use strict';
const core = require('../payment-core');
const config = { collectorId: '5678', applicationId: '9012', liveMode: false, projectId: 'demo-4j-pix' };
const orderId = 'd8441a65-2cef-4ba4-8ae9-195796f6ca15';
const providerId = n => 'ORD' + String(n).padStart(26, '0');
const paymentId = n => 'PAY' + String(n).padStart(26, '0');
function order(overrides = {}) {
  return { orderId, uid: 'alice', sku: core.SKU, amountCents: 500, currency: 'BRL', ...config,
    requestPayload: JSON.stringify(core.createOrderBody(orderId, 'alice@example.invalid', false)), ...overrides };
}
function provider(overrides = {}) {
  return {
    id: providerId(1), type: 'online', processing_mode: 'automatic', external_reference: core.reference(orderId),
    user_id: config.collectorId, integration_data: { application_id: config.applicationId }, country_code: 'BRA',
    total_amount: '5.00', total_paid_amount: '5.00', status: 'processed', status_detail: 'accredited',
    created_date: '2026-10-15T12:00:00Z', last_updated_date: '2026-10-15T12:00:00Z',
    transactions: { payments: [{ id: paymentId(1), amount: '5.00', paid_amount: '5.00', status: 'processed', status_detail: 'accredited',
      date_of_expiration: '2026-10-16T12:00:00Z', payment_method: { id: 'pix', type: 'bank_transfer',
        ticket_url: 'https://www.mercadopago.com.br/payments/1/ticket', qr_code: 'SYNTHETIC-PIX', qr_code_base64: 'dGVzdA==' } }] },
    ...overrides,
  };
}
function approve(value) {
  value.status = 'processed'; value.status_detail = 'accredited'; value.total_paid_amount = '5.00';
  const payment = value.transactions.payments[0];
  payment.status = 'processed'; payment.status_detail = 'accredited'; payment.paid_amount = '5.00';
}
module.exports = { config, order, provider, providerId, paymentId, approve };
