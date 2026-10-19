'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PROJECT_NAME, ACCOUNT_ID, configureTestSecrets, safeFailure, SetupError,
  parseWranglerToken } = require('./configurar-pix-cloudflare.cjs');
const INPUT = { accessToken: 'synthetic_test_access_token_123456789',
  webhookSecret: 'synthetic_test_webhook_secret_123456789' };
const OAUTH = 'synthetic_cloudflare_oauth_token_123456789';
const CONFIG = { name: PROJECT_NAME, vars: {
  FIREBASE_PROJECT_ID: 'fjfinance-pix-test',
  FIREBASE_WEB_API_KEY: 'synthetic_public_key',
  MP_COLLECTOR_ID: '100001', MP_APPLICATION_ID: '100002',
  MP_LIVE_MODE: 'false', MP_TEST_FIREBASE_PROJECT_ID: 'fjfinance-pix-test',
  MP_PRODUCTION_FIREBASE_PROJECT_ID: 'synthetic-production-project',
  PAYMENTS_ENABLED: 'false', ALLOWED_ORIGINS: '["https://4jfinance-pix-test.pages.dev"]'
} };
const response = (value, status = 200) => ({
  ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(value)
});
function scenario({ tags = ['test_user'], merchantId = 100001, accountId = ACCOUNT_ID,
  projectName = PROJECT_NAME, networkError } = {}) {
  const calls = [];
  let oauthReads = 0;
  const state = {
    id: 'synthetic-project-id', name: projectName,
    deployment_configs: {
      production: { env_vars: {
        UNRELATED_SECRET: { type: 'secret_text', value: 'masked_value_never_copy' },
        UNRELATED_PUBLIC: { type: 'plain_text', value: 'keep' }
      }, wrangler_config_hash: 'synthetic-config-hash', d1_databases: { BILLING_DB: { id: 'keep-d1' } } },
      preview: { env_vars: { PREVIEW: { type: 'plain_text', value: 'keep-preview' } } }
    }
  };
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.redirect, 'error');
    if (networkError) throw new Error(INPUT.accessToken + INPUT.webhookSecret + OAUTH);
    if (url === 'https://api.mercadopago.com/users/me')
      return response({ id: merchantId, country_id: 'BR', site_id: 'MLB', tags });
    assert.equal(options.headers.Authorization, 'Bearer ' + OAUTH);
    if (url.endsWith('/accounts/' + ACCOUNT_ID)) return response({ success: true, result: { id: accountId } });
    assert.equal(url, 'https://api.cloudflare.com/client/v4/accounts/' + ACCOUNT_ID + '/pages/projects/' + PROJECT_NAME);
    if (options.method === 'PATCH') {
      const patch = JSON.parse(options.body);
      assert.deepEqual(Object.keys(patch), ['deployment_configs']);
      assert.deepEqual(Object.keys(patch.deployment_configs), ['production']);
      assert.deepEqual(Object.keys(patch.deployment_configs.production).sort(), ['env_vars', 'wrangler_config_hash']);
      const production = patch.deployment_configs.production;
      assert.equal(production.wrangler_config_hash, 'synthetic-config-hash');
      assert.equal(Object.hasOwn(production.env_vars, 'UNRELATED_SECRET'), false);
      assert.equal(options.body.includes('masked_value_never_copy'), false);
      for (const [key, value] of Object.entries(production.env_vars)) {
        state.deployment_configs.production.env_vars[key] = value.type === 'secret_text' ? { type: 'secret_text' } : value;
      }
    }
    return response({ success: true, result: structuredClone(state) });
  };
  return { calls, state, options: { config: CONFIG, fetchImpl,
    getCloudflareToken: async () => { oauthReads++; return OAUTH; }, now: () => Date.UTC(2026, 9, 15) },
  oauthReads: () => oauthReads };
}
test('production or different merchant token stops before OAuth read or Cloudflare write', async () => {
  for (const params of [{ tags: [] }, { merchantId: 100099 }, { tags: null }]) {
    const s = scenario(params);
    await assert.rejects(configureTestSecrets(INPUT, s.options), error =>
      ['MERCHANT_NOT_TEST', 'MERCHANT_MISMATCH'].includes(error.code));
    assert.equal(s.oauthReads(), 0);
    assert.equal(s.calls.length, 1);
    assert.equal(s.calls[0].options.method, 'GET');
  }
  const s = scenario();
  for (const config of [
    { ...CONFIG, name: '4jfinance' },
    { ...CONFIG, account_id: 'different-account' },
    { ...CONFIG, vars: { ...CONFIG.vars, MP_LIVE_MODE: 'true' } }
  ]) await assert.rejects(configureTestSecrets(INPUT, { ...s.options, config }), { code: 'INVALID_TEST_CONFIG' });
  assert.equal(s.calls.length, 0);
});
test('only test project env keys are patched; existing secrets, preview and D1 survive', async () => {
  const s = scenario();
  const report = await configureTestSecrets(INPUT, s.options);
  assert.equal(s.calls.filter(call => call.options.method === 'PATCH').length, 1);
  assert.equal(s.calls.filter(call => call.url.includes('/pages/projects/')).length, 3);
  assert.deepEqual(s.state.deployment_configs.preview, { env_vars: { PREVIEW: { type: 'plain_text', value: 'keep-preview' } } });
  assert.deepEqual(s.state.deployment_configs.production.d1_databases, { BILLING_DB: { id: 'keep-d1' } });
  assert.deepEqual(s.state.deployment_configs.production.env_vars.UNRELATED_SECRET,
    { type: 'secret_text', value: 'masked_value_never_copy' });
  assert.deepEqual(s.state.deployment_configs.production.env_vars.UNRELATED_PUBLIC, { type: 'plain_text', value: 'keep' });
  assert.deepEqual(report, { ok: true, test: true, at: '2026-10-15T00:00:00.000Z',
    projectName: PROJECT_NAME, merchantValidated: true, webhookSecretConfigured: true });
  for (const secret of Object.values(INPUT).concat(OAUTH)) assert.equal(JSON.stringify(report).includes(secret), false);
  for (const params of [{ accountId: 'wrong-account' }, { projectName: '4jfinance' }]) {
    const bad = scenario(params);
    await assert.rejects(configureTestSecrets(INPUT, bad.options));
    assert.equal(bad.calls.some(call => call.options.method === 'PATCH'), false);
  }
});
test('provider errors, malformed OAuth and malicious messages expose only allowlisted codes', async () => {
  const s = scenario({ networkError: true });
  let caught;
  try { await configureTestSecrets(INPUT, s.options); } catch (error) { caught = error; }
  assert.equal(caught.code, 'MP_REQUEST_FAILED');
  const outputs = [safeFailure(caught), safeFailure(new Error(INPUT.accessToken)),
    safeFailure({ code: INPUT.webhookSecret }), safeFailure(new SetupError(OAUTH))];
  for (const secret of Object.values(INPUT).concat(OAUTH)) assert.equal(JSON.stringify(outputs).includes(secret), false);
  assert.equal(outputs[1].errorCode, 'SETUP_FAILED');
  const api = scenario();
  const originalFetch = api.options.fetchImpl;
  api.options.fetchImpl = async (url, options) => url.includes('api.cloudflare.com')
    ? response({ success: false, errors: [{ message: INPUT.accessToken + INPUT.webhookSecret + OAUTH }] }, 400)
    : originalFetch(url, options);
  let apiError;
  try { await configureTestSecrets(INPUT, api.options); } catch (error) { apiError = error; }
  assert.equal(apiError.code, 'CF_REQUEST_FAILED');
  for (const secret of Object.values(INPUT).concat(OAUTH)) assert.equal(JSON.stringify(safeFailure(apiError)).includes(secret), false);
  const toml = 'oauth_token = "' + OAUTH + '"\nexpiration_time = "2026-10-15T02:00:00Z"\n';
  assert.equal(parseWranglerToken(toml, Date.UTC(2026, 9, 15)), OAUTH);
  assert.throws(() => parseWranglerToken(toml, Date.UTC(2026, 9, 16)), { code: 'WRANGLER_LOGIN_REQUIRED' });
  assert.throws(() => parseWranglerToken('oauth_token = "' + OAUTH + '"'), { code: 'WRANGLER_LOGIN_REQUIRED' });
});
