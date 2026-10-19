'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { PROJECT_NAME, ACCOUNT_ID, FIREBASE_PROJECT_ID, APPLICATION_ID,
  configureProductionSecrets, readInput } = require('./configurar-pix-producao.cjs');
const INPUT = { accessToken: 'synthetic_production_access_token_123456789',
  webhookSecret: 'synthetic_production_webhook_secret_123456789' };
const OAUTH = 'synthetic_cloudflare_oauth_token_123456789';
const DB_ID = '12345678-1234-4234-8234-123456789abc';
const COLLECTOR = '7654321';
const CONFIG = { name: PROJECT_NAME, d1_databases: [
  { binding: 'BILLING_DB', database_name: '4jfinance-billing', database_id: DB_ID }
], vars: { FIREBASE_PROJECT_ID, FIREBASE_WEB_API_KEY: 'synthetic-public-key',
  MP_COLLECTOR_ID: '0', MP_APPLICATION_ID: APPLICATION_ID, MP_LIVE_MODE: 'true',
  MP_TEST_FIREBASE_PROJECT_ID: 'fjfinance-pix-test', MP_PRODUCTION_FIREBASE_PROJECT_ID: FIREBASE_PROJECT_ID,
  PAYMENTS_ENABLED: 'false', ALLOWED_ORIGINS: '["https://4jfinance.com.br","https://www.4jfinance.com.br","https://4jfinance.pages.dev"]'
} };
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, redirected: false,
  text: async () => JSON.stringify(data) });
function scenario({ tags = ['normal'], country = 'BR', site = 'MLB', merchantId = COLLECTOR,
  accountId = ACCOUNT_ID, projectName = PROJECT_NAME, databaseId = DB_ID, unknownPatch = false,
  badVerify = false, updateError = false } = {}) {
  const calls = [], updatedCollectors = [];
  let oauthReads = 0, patched = false;
  const project = { id: 'synthetic-project-id', name: projectName, deployment_configs: {
    production: { env_vars: { KEEP_SECRET: { type: 'secret_text', value: 'masked_must_not_copy' },
      KEEP_PUBLIC: { type: 'plain_text', value: 'keep' } },
    d1_databases: { BILLING_DB: { id: databaseId } }, wrangler_config_hash: 'synthetic-wrangler-hash' },
    preview: { env_vars: { PREVIEW: { type: 'plain_text', value: 'unchanged' } } }
  } };
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.redirect, 'error');
    if (url === 'https://api.mercadopago.com/users/me') {
      assert.equal(options.method, 'GET');
      return response({ id: merchantId, country_id: country, site_id: site, tags });
    }
    assert.equal(options.headers.Authorization, 'Bearer ' + OAUTH);
    if (url.endsWith('/accounts/' + ACCOUNT_ID)) return response({ success: true, result: { id: accountId } });
    assert.equal(url, 'https://api.cloudflare.com/client/v4/accounts/' + ACCOUNT_ID + '/pages/projects/' + PROJECT_NAME);
    if (options.method === 'PATCH') {
      const body = JSON.parse(options.body), production = body.deployment_configs.production;
      assert.deepEqual(Object.keys(body.deployment_configs), ['production']);
      assert.deepEqual(Object.keys(production).sort(), ['env_vars', 'wrangler_config_hash']);
      assert.equal(production.env_vars.PAYMENTS_ENABLED.value, 'false');
      assert.equal(production.env_vars.MP_LIVE_MODE.value, 'true');
      assert.equal(production.env_vars.MP_COLLECTOR_ID.value, COLLECTOR);
      assert.equal(production.env_vars.MP_ACCESS_TOKEN.type, 'secret_text');
      assert.equal(production.env_vars.MP_WEBHOOK_SECRET.type, 'secret_text');
      assert.equal(Object.hasOwn(production.env_vars, 'KEEP_SECRET'), false);
      assert.equal(options.body.includes('masked_must_not_copy'), false);
      patched = true;
      for (const [key, value] of Object.entries(production.env_vars))
        project.deployment_configs.production.env_vars[key] = value.type === 'secret_text' ? { type: 'secret_text' } : value;
      if (unknownPatch) throw new Error(INPUT.accessToken + INPUT.webhookSecret + OAUTH);
    }
    const result = structuredClone(project);
    if (badVerify && patched && options.method === 'GET') result.deployment_configs.production.env_vars.MP_WEBHOOK_SECRET = {};
    return response({ success: true, result });
  };
  return { calls, project, updatedCollectors, oauthReads: () => oauthReads, options: {
    config: structuredClone(CONFIG), fetchImpl, now: () => Date.UTC(2026, 9, 15),
    getCloudflareToken: async () => { oauthReads++; return OAUTH; },
    updateCollector: async value => {
      assert.equal(patched, true);
      assert.equal(calls.at(-1).options.method, 'GET', 'local config follows remote verification');
      if (updateError) throw new Error(INPUT.accessToken);
      updatedCollectors.push(value);
    }
  } };
}
function assertSanitized(result) {
  const text = JSON.stringify(result);
  for (const secret of [...Object.values(INPUT), OAUTH, 'masked_must_not_copy']) assert.equal(text.includes(secret), false);
  assert.equal(result.projectName, PROJECT_NAME); assert.equal(result.firebaseProjectId, FIREBASE_PROJECT_ID);
  assert.equal(result.test, false); assert.equal(result.production, true); assert.equal(result.paymentsEnabled, false);
}
test('rejects sandbox token, missing mode evidence or wrong merchant before Cloudflare OAuth/write', async () => {
  for (const args of [{ tags: ['test_user'] }, { tags: null }, { country: 'AR' }, { site: 'MLA' }, { merchantId: '0' }]) {
    const s = scenario(args), result = await configureProductionSecrets(INPUT, s.options);
    assert.equal(result.ok, false); assert.equal(s.oauthReads(), 0); assert.equal(s.calls.length, 1);
    assert.equal(s.calls[0].options.method, 'GET'); assert.equal(s.updatedCollectors.length, 0); assertSanitized(result);
  }
  const s = scenario(); s.options.config.vars.MP_COLLECTOR_ID = '9999999';
  assert.equal((await configureProductionSecrets(INPUT, s.options)).code, 'MERCHANT_MISMATCH');
  assert.equal(s.oauthReads(), 0);
});
test('refuses enabling payments, wrong project/app/mode or test D1 before any remote call', async () => {
  const changes = [
    config => { config.vars.PAYMENTS_ENABLED = 'true'; },
    config => { config.vars.MP_LIVE_MODE = 'false'; },
    config => { config.vars.FIREBASE_PROJECT_ID = 'fjfinance-pix-test'; },
    config => { config.vars.MP_APPLICATION_ID = '2201067926559576'; },
    config => { config.name = '4jfinance-pix-test'; },
    config => { config.account_id = 'wrong-account'; },
    config => { config.d1_databases[0].database_id = 'c0c6d41a-6013-45c2-896f-ecb3746d8962'; },
  ];
  for (const mutate of changes) {
    const s = scenario(); mutate(s.options.config);
    const result = await configureProductionSecrets(INPUT, s.options);
    assert.equal(result.code, 'INVALID_PRODUCTION_CONFIG'); assert.equal(s.calls.length, 0); assertSanitized(result);
  }
});
test('wrong remote account, Pages project or existing D1 binding cannot be mutated', async () => {
  for (const [args, code] of [
    [{ accountId: 'wrong' }, 'CF_ACCOUNT_MISMATCH'], [{ projectName: '4jfinance-pix-test' }, 'CF_PROJECT_MISMATCH'],
    [{ databaseId: 'c0c6d41a-6013-45c2-896f-ecb3746d8962' }, 'CF_DB_MISMATCH']
  ]) {
    const s = scenario(args), result = await configureProductionSecrets(INPUT, s.options);
    assert.equal(result.code, code); assert.equal(s.calls.some(call => call.options.method === 'PATCH'), false);
    assert.equal(s.updatedCollectors.length, 0); assertSanitized(result);
  }
});
test('production secrets stay disabled, preserve D1/preview and update only derived public collector after confirmation', async () => {
  const s = scenario(), before = structuredClone(s.project);
  const result = await configureProductionSecrets(INPUT, s.options);
  assert.equal(result.ok, true); assert.equal(result.cloudflareWriteConfirmed, true); assert.equal(result.localCollectorUpdated, true);
  assert.deepEqual(s.updatedCollectors, [COLLECTOR]);
  assert.deepEqual(s.project.deployment_configs.production.d1_databases, before.deployment_configs.production.d1_databases);
  assert.deepEqual(s.project.deployment_configs.preview, before.deployment_configs.preview);
  assert.deepEqual(s.project.deployment_configs.production.env_vars.KEEP_SECRET, before.deployment_configs.production.env_vars.KEEP_SECRET);
  assert.equal(s.options.config.vars.MP_COLLECTOR_ID, '0', 'caller config is not mutated in place');
  assert.equal(s.calls.filter(call => call.options.method === 'PATCH').length, 1);
  assert.ok(s.calls.every(call => call.options.method !== 'POST'));
  assert.ok(s.calls.every(call => !/orders|payments|deployments/.test(call.url)));
  assertSanitized(result);
});
test('unknown remote result or failed verification never changes the local collector; error reports keep safe destination', async () => {
  for (const [args, code] of [[{ unknownPatch: true }, 'CF_REQUEST_FAILED'], [{ badVerify: true }, 'CF_VERIFICATION_FAILED']]) {
    const s = scenario(args), result = await configureProductionSecrets(INPUT, s.options);
    assert.equal(result.ok, false); assert.equal(result.code, code);
    assert.equal(result.cloudflareWriteAttempted, true); assert.equal(result.cloudflareWriteConfirmed, false);
    assert.equal(result.localCollectorUpdated, false); assert.equal(s.updatedCollectors.length, 0); assertSanitized(result);
  }
  const s = scenario({ updateError: true }), result = await configureProductionSecrets(INPUT, s.options);
  assert.equal(result.code, 'CONFIG_UPDATE_FAILED'); assert.equal(result.cloudflareWriteConfirmed, true);
  assert.equal(result.localCollectorUpdated, false); assertSanitized(result);
});
test('stdin JSON contains the only supplied credentials and malformed input cannot expose them', async () => {
  assert.deepEqual(await readInput(Readable.from([JSON.stringify(INPUT)])), INPUT);
  await assert.rejects(readInput(Readable.from([INPUT.accessToken])), { code: 'INVALID_INPUT' });
  const s = scenario(); s.options.fetchImpl = async () => { throw new Error(INPUT.accessToken + OAUTH); };
  const result = await configureProductionSecrets(INPUT, s.options);
  assert.equal(result.code, 'MP_REQUEST_FAILED'); assertSanitized(result);
});
