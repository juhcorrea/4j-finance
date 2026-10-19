'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PROJECT_ID, ORIGIN, MAX_POLLS, runRemoteQa, readLocalInputs } = require('./testar-pix-cloudflare.cjs');
const SUFFIX = 'abcdef123456abcdef123456';
const ACCOUNT = { projectId: PROJECT_ID, syntheticOnly: true, uid: 'pixqa_' + SUFFIX,
  email: 'pix-qa-' + SUFFIX + '@testuser.com', password: 'synthetic_password_never_report_123456789' };
const CONFIG = { projectId: PROJECT_ID, appId: '1:23221093985:web:synthetic',
  apiKey: 'synthetic_public_firebase_key_123456789' };
const ID = 'f55cd31f-21e0-4a22-b393-a723e7e44c21';
const OTHER_ID = 'c1d77c72-29c2-4c30-ad7e-97e34f2fb60e';
const NOW = Date.UTC(2026, 9, 15);
const token = claims => Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url') + '.' +
  Buffer.from(JSON.stringify({ aud: PROJECT_ID, iss: 'https://securetoken.google.com/' + PROJECT_ID,
    sub: ACCOUNT.uid, email: ACCOUNT.email, email_verified: true, exp: NOW / 1000 + 3600, ...claims })).toString('base64url') + '.syntheticSignature';
const TOKEN = token();
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, text: async () => JSON.stringify(body) });
function scenario({ ready = true, initialPaid = false, pending = null, enabled = true,
  finalPaid = true, wrongProjectToken = false, wrongOrder = false, wrongAmount = false,
  neverApproved = false, maliciousError = false } = {}) {
  const calls = [], sleeps = [];
  let statuses = 0, polls = 0;
  const checkout = (status, adFreeLifetime, orderId = ID) => ({
    orderId, amount: wrongAmount ? 0.01 : 5, currency: 'BRL', status, adFreeLifetime,
    qrCode: 'synthetic_qr_never_report', qrCodeBase64: 'c3ludGhldGlj', paymentId: 'synthetic_private_payment'
  });
  return { calls, sleeps, options: { publicConfig: CONFIG, account: ACCOUNT, now: () => NOW,
    sleep: async ms => sleeps.push(ms), fetchImpl: async (url, options) => {
      calls.push({ url, options });
      assert.equal(options.redirect, 'error');
      if (url === ORIGIN + '/api/pix/health') return response({ backendReady: ready });
      if (url.startsWith('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=')) {
        assert.deepEqual(JSON.parse(options.body), { email: ACCOUNT.email, password: ACCOUNT.password, returnSecureToken: true });
        assert.equal(options.headers.Authorization, undefined);
        return response({ idToken: wrongProjectToken ? token({ aud: 'production-project' }) : TOKEN,
          localId: ACCOUNT.uid, email: ACCOUNT.email, refreshToken: 'synthetic_refresh_token_never_report' });
      }
      assert.equal(options.headers.Authorization, 'Bearer ' + TOKEN);
      assert.equal(options.headers.Origin, ORIGIN);
      assert.ok(url.startsWith(ORIGIN + '/api/pix/'));
      const payload = JSON.parse(options.body);
      if (maliciousError) return response({ error: { message: TOKEN + ACCOUNT.password + ACCOUNT.email } }, 500);
      if (url.endsWith('/getMonetizationStatus')) {
        assert.deepEqual(payload, { data: {} });
        const paid = statuses++ === 0 ? initialPaid : finalPaid;
        return response({ data: { adFreeLifetime: paid, pendingOrderId: paid ? null : pending,
          price: 5, currency: 'BRL', paymentsEnabled: enabled } });
      }
      if (url.endsWith('/createPixCheckout')) {
        assert.deepEqual(payload, { data: {} });
        return response({ data: checkout('in_process', false) });
      }
      if (url.endsWith('/checkPixCheckout')) {
        assert.deepEqual(payload, { data: { orderId: ID } });
        polls++;
        const paid = !neverApproved && polls >= 2;
        return response({ data: checkout(paid ? 'approved' : 'in_process', paid, wrongOrder ? OTHER_ID : ID) });
      }
      throw Error('Unexpected endpoint (must never invoke webhook)');
    }
  } };
}
function noPrivateValues(report) {
  const serialized = JSON.stringify(report);
  for (const value of [ACCOUNT.password, ACCOUNT.email, ACCOUNT.uid, TOKEN, ID, OTHER_ID,
    'synthetic_qr_never_report', 'synthetic_private_payment', 'synthetic_refresh_token_never_report'])
    assert.equal(serialized.includes(value), false);
  assert.equal(report.realWebhookDeliveryVerified, false);
}
test('remote workflow creates once using server price and polls one order through lifetime status', async () => {
  const s = scenario(), result = await runRemoteQa(s.options);
  assert.equal(result.ok, true);
  assert.equal(result.checkoutCreatedConfirmed, true);
  assert.equal(result.pollCount, 2);
  assert.equal(result.sameOrderPollingVerified, true);
  assert.equal(result.amountVerified, true);
  assert.equal(result.adFreeLifetime, true);
  assert.equal(s.calls.filter(call => call.url.endsWith('/createPixCheckout')).length, 1);
  assert.equal(s.calls.some(call => call.url.includes('Webhook') || call.url.includes('mercadopago.com')), false);
  noPrivateValues(result);
});
test('reuses a pending order with payments off and never sends a second create', async () => {
  const s = scenario({ pending: ID, enabled: false }), result = await runRemoteQa(s.options);
  assert.equal(result.ok, true);
  assert.equal(result.checkoutResumed, true);
  assert.equal(result.createRequested, false);
  assert.equal(s.calls.some(call => call.url.endsWith('/createPixCheckout')), false);
  noPrivateValues(result);
});
test('strict project/account validation and backend readiness stop before sign-in or create', async () => {
  for (const override of [
    { publicConfig: { ...CONFIG, projectId: 'production-project' } },
    { account: { ...ACCOUNT, syntheticOnly: false } },
    { account: { ...ACCOUNT, email: 'real@example.invalid' } }
  ]) {
    const s = scenario(), result = await runRemoteQa({ ...s.options, ...override });
    assert.equal(result.ok, false);
    assert.equal(s.calls.length, 0);
    noPrivateValues(result);
  }
  const s = scenario({ ready: false }), result = await runRemoteQa(s.options);
  assert.equal(result.code, 'BACKEND_NOT_READY');
  assert.equal(s.calls.length, 1);
  const wrong = scenario({ wrongProjectToken: true }), rejected = await runRemoteQa(wrong.options);
  assert.equal(rejected.code, 'AUTH_IDENTITY_MISMATCH');
  assert.equal(wrong.calls.length, 2);
});
test('wrong amount or changing order fails without replacing the charge', async () => {
  for (const [options, code] of [[{ wrongAmount: true }, 'CHECKOUT_CONTRACT_INVALID'], [{ wrongOrder: true }, 'ORDER_CHANGED']]) {
    const s = scenario(options), result = await runRemoteQa(s.options);
    assert.equal(result.code, code);
    assert.equal(s.calls.filter(call => call.url.endsWith('/createPixCheckout')).length, 1);
    noPrivateValues(result);
  }
});
test('timeout, missing lifetime and already paid state do not claim a fresh successful flow', async () => {
  for (const [options, code] of [
    [{ neverApproved: true }, 'POLL_TIMEOUT'], [{ finalPaid: false }, 'LIFETIME_NOT_CONFIRMED'],
    [{ initialPaid: true }, 'ALREADY_AD_FREE_NO_NEW_CHECKOUT'], [{ enabled: false }, 'PAYMENTS_DISABLED']
  ]) {
    const s = scenario(options), result = await runRemoteQa(s.options);
    assert.equal(result.ok, false);
    assert.equal(result.code, code);
    assert.ok(s.calls.filter(call => call.url.endsWith('/createPixCheckout')).length <= 1);
    if (options.neverApproved) assert.equal(result.pollCount, MAX_POLLS);
    noPrivateValues(result);
  }
});
test('missing local files have safe codes and provider bodies cannot leak account or tokens', async () => {
  for (const missing of ['firebase-public-config.json', 'test-account.json']) {
    const reads = [];
    assert.throws(() => readLocalInputs(file => {
      reads.push(file);
      if (file.endsWith(missing)) { const error = new Error(ACCOUNT.password); error.code = 'ENOENT'; throw error; }
      return JSON.stringify(CONFIG);
    }), { code: missing === 'test-account.json' ? 'TEST_ACCOUNT_MISSING' : 'PUBLIC_CONFIG_MISSING' });
    assert.equal(reads.some(file => /default.toml|secrets/.test(file)), false);
  }
  const s = scenario({ maliciousError: true }), result = await runRemoteQa(s.options);
  assert.equal(result.code, 'AUTH_STATUS_FAILED');
  noPrivateValues(result);
  const bad = scenario();
  bad.options.fetchImpl = async () => { throw new Error(TOKEN + ACCOUNT.password); };
  const failure = await runRemoteQa(bad.options);
  assert.equal(failure.code, 'HEALTH_REQUEST_FAILED');
  noPrivateValues(failure);
});
