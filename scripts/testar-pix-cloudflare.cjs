'use strict';
// Explicit REMOTE QA of the sandbox only. This can request one simulated Pix.
// It does not invoke a webhook and cannot prove delivery of a real webhook.
// Firebase sign-in contract: https://firebase.google.com/docs/reference/rest/auth#section-sign-in-email-password
const fs = require('node:fs');
const path = require('node:path');
const PROJECT_ID = 'fjfinance-pix-test';
const PROJECT_NUMBER = '23221093985';
const ORIGIN = 'https://4jfinance-pix-test.pages.dev';
const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'work', 'pix-cloudflare');
const ORDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CALLABLES = new Set(['getMonetizationStatus', 'createPixCheckout', 'checkPixCheckout']);
const STATUSES = new Set(['pending', 'in_process', 'approved', 'cancelled', 'rejected', 'refunded', 'charged_back']);
const MAX_POLLS = 12;
const SAFE_CODES = new Set(['OK', 'NO_ARGUMENTS_ALLOWED', 'PRIVATE_OUTPUT_NOT_IGNORED',
  'PUBLIC_CONFIG_MISSING', 'TEST_ACCOUNT_MISSING', 'INPUT_READ_FAILED', 'INVALID_TEST_CONFIG',
  'INVALID_SYNTHETIC_ACCOUNT', 'HEALTH_REQUEST_FAILED', 'BACKEND_NOT_READY',
  'SIGN_IN_FAILED', 'AUTH_IDENTITY_MISMATCH', 'AUTH_STATUS_FAILED', 'STATUS_CONTRACT_INVALID',
  'ALREADY_AD_FREE_NO_NEW_CHECKOUT', 'PAYMENTS_DISABLED', 'CHECKOUT_REQUEST_FAILED',
  'CHECKOUT_CONTRACT_INVALID', 'ORDER_CHANGED', 'ORDER_TERMINAL_WITHOUT_BENEFIT',
  'POLL_REQUEST_FAILED', 'POLL_TIMEOUT', 'FINAL_STATUS_FAILED', 'LIFETIME_NOT_CONFIRMED',
  'REPORT_WRITE_FAILED', 'REMOTE_QA_FAILED']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
class QaError extends Error {
  constructor(code) { super(SAFE_CODES.has(code) ? code : 'REMOTE_QA_FAILED'); this.code = this.message; }
}
const fail = code => { throw new QaError(code); };
function progress() {
  return { backendReady: false, authenticated: false, authStatusVerified: false,
    createRequested: false, checkoutCreatedConfirmed: false, checkoutResumed: false,
    amountVerified: false, sameOrderPollingVerified: false, pollCount: 0, adFreeLifetime: false };
}
function report(state, code, now = Date.now) {
  return { ok: code === 'OK', test: true, at: new Date(now()).toISOString(),
    projectId: PROJECT_ID, testOrigin: ORIGIN, code: SAFE_CODES.has(code) ? code : 'REMOTE_QA_FAILED',
    backendReady: state.backendReady === true, authenticated: state.authenticated === true,
    authStatusVerified: state.authStatusVerified === true, createRequested: state.createRequested === true,
    checkoutCreatedConfirmed: state.checkoutCreatedConfirmed === true, checkoutResumed: state.checkoutResumed === true,
    amountVerified: state.amountVerified === true, sameOrderPollingVerified: state.sameOrderPollingVerified === true,
    pollCount: Number.isInteger(state.pollCount) && state.pollCount >= 0 && state.pollCount <= MAX_POLLS ? state.pollCount : 0,
    adFreeLifetime: state.adFreeLifetime === true, realWebhookDeliveryVerified: false };
}
function validateInputs(publicConfig, account) {
  if (!object(publicConfig) || publicConfig.projectId !== PROJECT_ID ||
      typeof publicConfig.appId !== 'string' || !publicConfig.appId.startsWith('1:' + PROJECT_NUMBER + ':web:') ||
      typeof publicConfig.apiKey !== 'string' || !/^[A-Za-z0-9_-]{20,256}$/.test(publicConfig.apiKey))
    fail('INVALID_TEST_CONFIG');
  const suffix = typeof account?.uid === 'string' && /^pixqa_([a-f0-9]{24})$/.exec(account.uid);
  if (!object(account) || account.projectId !== PROJECT_ID || account.syntheticOnly !== true || !suffix ||
      account.email !== 'pix-qa-' + suffix[1] + '@testuser.com' ||
      typeof account.password !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(account.password))
    fail('INVALID_SYNTHETIC_ACCOUNT');
}
function readLocalInputs(readFile = file => fs.readFileSync(file, 'utf8')) {
  function read(name, missingCode) {
    try {
      const raw = readFile(path.join(OUTPUT, name));
      if (typeof raw !== 'string' || raw.length > 32768) fail('INPUT_READ_FAILED');
      return JSON.parse(raw);
    } catch (error) {
      if (error?.code === 'ENOENT') fail(missingCode);
      fail('INPUT_READ_FAILED');
    }
  }
  const publicConfig = read('firebase-public-config.json', 'PUBLIC_CONFIG_MISSING');
  const account = read('test-account.json', 'TEST_ACCOUNT_MISSING');
  validateInputs(publicConfig, account);
  return { publicConfig, account };
}
function validateAuth(auth, account, now) {
  try {
    if (!object(auth) || auth.localId !== account.uid || auth.email !== account.email ||
        typeof auth.idToken !== 'string' || auth.idToken.length > 16384) fail('AUTH_IDENTITY_MISMATCH');
    const pieces = auth.idToken.split('.');
    if (pieces.length !== 3 || pieces.some(value => !/^[A-Za-z0-9_-]+$/.test(value))) fail('AUTH_IDENTITY_MISMATCH');
    // This token came directly from Google's HTTPS sign-in response. These checks
    // prevent forwarding a token for another project; the backend verifies its signature.
    const claims = JSON.parse(Buffer.from(pieces[1], 'base64url').toString('utf8'));
    if (claims.aud !== PROJECT_ID || claims.iss !== 'https://securetoken.google.com/' + PROJECT_ID ||
        claims.sub !== account.uid || claims.email !== account.email || claims.email_verified !== true ||
        !Number.isFinite(claims.exp) || claims.exp <= now() / 1000 + 30) fail('AUTH_IDENTITY_MISMATCH');
  } catch { fail('AUTH_IDENTITY_MISMATCH'); }
}
function validateStatus(value) {
  if (!object(value) || typeof value.adFreeLifetime !== 'boolean' || value.price !== 5 ||
      value.currency !== 'BRL' || typeof value.paymentsEnabled !== 'boolean' ||
      !(value.pendingOrderId === null || (typeof value.pendingOrderId === 'string' && ORDER_ID.test(value.pendingOrderId))))
    fail('STATUS_CONTRACT_INVALID');
  return value;
}
function validateCheckout(value, expectedOrderId) {
  if (!object(value) || typeof value.orderId !== 'string' || !ORDER_ID.test(value.orderId) ||
      value.amount !== 5 || value.currency !== 'BRL' || typeof value.adFreeLifetime !== 'boolean' ||
      !STATUSES.has(value.status) || (value.adFreeLifetime && value.status !== 'approved'))
    fail('CHECKOUT_CONTRACT_INVALID');
  if (expectedOrderId && value.orderId !== expectedOrderId) fail('ORDER_CHANGED');
  if (['cancelled', 'rejected', 'refunded', 'charged_back'].includes(value.status))
    fail('ORDER_TERMINAL_WITHOUT_BENEFIT');
  return value;
}
async function runRemoteQa({ publicConfig, account, fetchImpl = fetch,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now } = {}) {
  const state = progress();
  try {
    validateInputs(publicConfig, account);
    const signInUrl = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' +
      encodeURIComponent(publicConfig.apiKey);
    async function request(url, { body, token, code }) {
      const parsed = new URL(url);
      const callable = parsed.origin === ORIGIN && CALLABLES.has(parsed.pathname.slice('/api/pix/'.length)) &&
        parsed.pathname.startsWith('/api/pix/') && !parsed.search && !parsed.hash;
      const health = url === ORIGIN + '/api/pix/health';
      if (!(url === signInUrl || callable || health)) fail(code);
      try {
        const response = await fetchImpl(url, {
          method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
          headers: { 'Content-Type': 'application/json',
            ...(parsed.origin === ORIGIN ? { Origin: ORIGIN } : {}),
            ...(token ? { Authorization: 'Bearer ' + token } : {}) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) })
        });
        const raw = await response.text();
        if (!response.ok || raw.length > 2000000) fail(code);
        const data = JSON.parse(raw);
        if (!object(data)) fail(code);
        return data;
      } catch { fail(code); } // Never forward response bodies or exception messages.
    }
    const health = await request(ORIGIN + '/api/pix/health', { code: 'HEALTH_REQUEST_FAILED' });
    if (health.backendReady !== true) fail('BACKEND_NOT_READY');
    state.backendReady = true;
    const auth = await request(signInUrl, { code: 'SIGN_IN_FAILED', body: {
      email: account.email, password: account.password, returnSecureToken: true
    } });
    validateAuth(auth, account, now);
    state.authenticated = true;
    async function call(name, data, code) {
      const envelope = await request(ORIGIN + '/api/pix/' + name,
        { token: auth.idToken, body: { data }, code });
      if (!object(envelope.data)) fail(code);
      return envelope.data;
    }
    const before = validateStatus(await call('getMonetizationStatus', {}, 'AUTH_STATUS_FAILED'));
    state.authStatusVerified = true;
    if (before.adFreeLifetime) {
      state.adFreeLifetime = true;
      fail('ALREADY_AD_FREE_NO_NEW_CHECKOUT');
    }
    let orderId = before.pendingOrderId;
    if (orderId) state.checkoutResumed = true;
    else {
      if (!before.paymentsEnabled) fail('PAYMENTS_DISABLED');
      state.createRequested = true;
      // Price, merchant, product and identity are selected by the server only.
      const checkout = validateCheckout(await call('createPixCheckout', {}, 'CHECKOUT_REQUEST_FAILED'));
      orderId = checkout.orderId;
      state.checkoutCreatedConfirmed = true;
      state.amountVerified = true;
    }
    let approved = false;
    for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
      if (attempt > 0) await sleep(2000);
      const current = validateCheckout(await call('checkPixCheckout', { orderId }, 'POLL_REQUEST_FAILED'), orderId);
      state.pollCount++;
      state.amountVerified = true;
      state.sameOrderPollingVerified = state.pollCount >= 2;
      approved = current.status === 'approved' && current.adFreeLifetime === true;
      if (approved && state.sameOrderPollingVerified) break;
    }
    if (!approved) fail('POLL_TIMEOUT');
    const after = validateStatus(await call('getMonetizationStatus', {}, 'FINAL_STATUS_FAILED'));
    if (after.adFreeLifetime !== true || after.pendingOrderId !== null) fail('LIFETIME_NOT_CONFIRMED');
    state.adFreeLifetime = true;
    return report(state, 'OK', now);
  } catch (error) {
    return report(state, error instanceof QaError ? error.code : 'REMOTE_QA_FAILED', now);
  }
}
async function main() {
  let result;
  try {
    if (process.argv.length !== 2) fail('NO_ARGUMENTS_ALLOWED');
    let ignore;
    try { ignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').replace(/\r/g, ''); }
    catch { fail('PRIVATE_OUTPUT_NOT_IGNORED'); }
    if (!/^work\/$/m.test(ignore) || /^!work(?:\/|$)/m.test(ignore)) fail('PRIVATE_OUTPUT_NOT_IGNORED');
    result = await runRemoteQa(readLocalInputs());
  } catch (error) {
    result = report(progress(), error instanceof QaError ? error.code : 'REMOTE_QA_FAILED');
  }
  try {
    fs.mkdirSync(OUTPUT, { recursive: true });
    fs.writeFileSync(path.join(OUTPUT, 'remote-qa.json'), JSON.stringify(result, null, 2) + '\n', 'utf8');
  } catch { result = report(progress(), 'REPORT_WRITE_FAILED'); }
  (result.ok ? process.stdout : process.stderr).write(JSON.stringify(result) + '\n');
  process.exitCode = result.ok ? 0 : 1;
}
module.exports = { PROJECT_ID, ORIGIN, MAX_POLLS, QaError, runRemoteQa, validateInputs, readLocalInputs };
if (require.main === module) main().catch(() => {
  process.stderr.write(JSON.stringify(report(progress(), 'REMOTE_QA_FAILED')) + '\n');
  process.exitCode = 1;
});
