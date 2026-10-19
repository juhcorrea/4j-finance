'use strict';
// Prepare production secrets only: no payment, activation or deployment.
// Partial Pages env_vars PATCH preserves every omitted variable, binding and preview setting.
// https://github.com/cloudflare/workers-sdk/blob/main/packages/wrangler/src/pages/secret/index.ts
const fs = require('node:fs');
const path = require('node:path');
const PROJECT_NAME = '4jfinance';
const ACCOUNT_ID = '30d41a970cf8e98064fc76bc1d8d2d51';
const FIREBASE_PROJECT_ID = 'financas-familia-9480b';
const TEST_PROJECT_ID = 'fjfinance-pix-test';
const APPLICATION_ID = '6568194540882659';
const TEST_DB_ID = 'c0c6d41a-6013-45c2-896f-ecb3746d8962';
const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'cloudflare', 'wrangler.production.json');
const REPORT_PATH = path.join(ROOT, 'work', 'pix-cloudflare', 'production-secrets-setup.json');
const MP_ME = 'https://api.mercadopago.com/users/me';
const CF_ACCOUNT = 'https://api.cloudflare.com/client/v4/accounts/' + ACCOUNT_ID;
const CF_PROJECT = CF_ACCOUNT + '/pages/projects/' + PROJECT_NAME;
const SAFE_CODES = new Set(['OK', 'INVALID_INPUT', 'INVALID_PRODUCTION_CONFIG',
  'MERCHANT_NOT_PRODUCTION', 'MERCHANT_MISMATCH', 'MP_REQUEST_FAILED',
  'CF_REQUEST_FAILED', 'CF_ACCOUNT_MISMATCH', 'CF_PROJECT_MISMATCH', 'CF_DB_MISMATCH',
  'CF_CONFIG_INVALID', 'CF_VERIFICATION_FAILED', 'WRANGLER_LOGIN_REQUIRED',
  'NO_ARGUMENTS_ALLOWED', 'PRIVATE_OUTPUT_NOT_IGNORED', 'CONFIG_READ_FAILED',
  'CONFIG_CHANGED', 'CONFIG_UPDATE_FAILED', 'REPORT_WRITE_FAILED', 'SETUP_FAILED']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
class SetupError extends Error {
  constructor(code) { super(SAFE_CODES.has(code) ? code : 'SETUP_FAILED'); this.code = this.message; }
}
const fail = code => { throw new SetupError(code); };
function report(state = {}, code = 'SETUP_FAILED', now = Date.now) {
  return { ok: code === 'OK', test: false, production: true, at: new Date(now()).toISOString(),
    projectName: PROJECT_NAME, firebaseProjectId: FIREBASE_PROJECT_ID, paymentsEnabled: false,
    code: SAFE_CODES.has(code) ? code : 'SETUP_FAILED', merchantValidated: state.merchantValidated === true,
    cloudflareWriteAttempted: state.cloudflareWriteAttempted === true,
    cloudflareWriteConfirmed: state.cloudflareWriteConfirmed === true,
    webhookSecretConfigured: state.cloudflareWriteConfirmed === true,
    localCollectorUpdated: state.localCollectorUpdated === true };
}
function validateConfig(config) {
  const vars = config?.vars;
  if (!object(config) || config.name !== PROJECT_NAME ||
      (config.account_id !== undefined && config.account_id !== ACCOUNT_ID) || !object(vars) ||
      vars.FIREBASE_PROJECT_ID !== FIREBASE_PROJECT_ID || vars.MP_PRODUCTION_FIREBASE_PROJECT_ID !== FIREBASE_PROJECT_ID ||
      vars.MP_TEST_FIREBASE_PROJECT_ID !== TEST_PROJECT_ID || vars.MP_APPLICATION_ID !== APPLICATION_ID ||
      vars.MP_LIVE_MODE !== 'true' || vars.PAYMENTS_ENABLED !== 'false' ||
      !/^(0|[1-9]\d{0,31})$/.test(vars.MP_COLLECTOR_ID || '')) fail('INVALID_PRODUCTION_CONFIG');
  for (const [key, value] of Object.entries(vars)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || /SECRET|PASSWORD|TOKEN/.test(key) ||
        typeof value !== 'string' || value.length > 8192) fail('INVALID_PRODUCTION_CONFIG');
  }
  let origins;
  try { origins = JSON.parse(vars.ALLOWED_ORIGINS); } catch { fail('INVALID_PRODUCTION_CONFIG'); }
  const allowed = new Set(['https://4jfinance.com.br', 'https://www.4jfinance.com.br', 'https://4jfinance.pages.dev']);
  if (!Array.isArray(origins) || origins.length !== 3 || new Set(origins).size !== 3 ||
      origins.some(origin => !allowed.has(origin))) fail('INVALID_PRODUCTION_CONFIG');
  if (!Array.isArray(config.d1_databases) || config.d1_databases.length !== 1) fail('INVALID_PRODUCTION_CONFIG');
  const db = config.d1_databases[0];
  if (!object(db) || db.binding !== 'BILLING_DB' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(db.database_id || '') ||
      db.database_id.toLowerCase() === TEST_DB_ID ||
      typeof db.database_name !== 'string' || !db.database_name || /test/i.test(db.database_name))
    fail('INVALID_PRODUCTION_CONFIG');
  return { vars, databaseId: db.database_id };
}
function validateInput(input) {
  if (!object(input) || Object.keys(input).sort().join(',') !== 'accessToken,webhookSecret' ||
      typeof input.accessToken !== 'string' || typeof input.webhookSecret !== 'string' ||
      !/^\S{16,8192}$/.test(input.accessToken) || !/^\S{16,1024}$/.test(input.webhookSecret))
    fail('INVALID_INPUT');
}
function parseWranglerToken(toml, now = Date.now()) {
  try {
    const fields = new Map();
    for (const line of String(toml).split(/\r?\n/)) {
      if (/^\s*\[/.test(line)) break;
      const match = /^\s*(oauth_token|expiration_time)\s*=\s*("(?:[^"\\]|\\.)*")\s*(?:#.*)?$/.exec(line);
      if (match) {
        if (fields.has(match[1])) fail('WRANGLER_LOGIN_REQUIRED');
        fields.set(match[1], JSON.parse(match[2]));
      }
    }
    const token = fields.get('oauth_token'), expiration = Date.parse(fields.get('expiration_time'));
    if (typeof token !== 'string' || !/^\S{16,8192}$/.test(token) ||
        !Number.isFinite(expiration) || expiration <= now + 60000) fail('WRANGLER_LOGIN_REQUIRED');
    return token;
  } catch { fail('WRANGLER_LOGIN_REQUIRED'); }
}
function readWranglerToken() {
  try {
    if (!process.env.APPDATA) fail('WRANGLER_LOGIN_REQUIRED');
    return parseWranglerToken(fs.readFileSync(path.join(process.env.APPDATA,
      'xdg.config', '.wrangler', 'config', 'default.toml'), 'utf8'));
  } catch { fail('WRANGLER_LOGIN_REQUIRED'); }
}
async function configureProductionSecrets(input, {
  config, getCloudflareToken, updateCollector, fetchImpl = fetch, now = Date.now
} = {}) {
  const state = {};
  try {
    validateInput(input);
    const { vars, databaseId } = validateConfig(config);
    if (typeof updateCollector !== 'function') fail('CONFIG_UPDATE_FAILED');
    async function request(url, token, method = 'GET', body) {
      const isMP = url === MP_ME, code = isMP ? 'MP_REQUEST_FAILED' : 'CF_REQUEST_FAILED';
      if (!isMP && url !== CF_ACCOUNT && url !== CF_PROJECT) fail(code);
      if (method !== 'GET' && !(url === CF_PROJECT && method === 'PATCH')) fail(code);
      try {
        const response = await fetchImpl(url, { method, redirect: 'error', signal: AbortSignal.timeout(25000),
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        if (response.redirected === true || (response.status >= 300 && response.status < 400)) fail(code);
        const raw = await response.text();
        if (!response.ok || raw.length > 2000000) fail(code);
        const data = JSON.parse(raw);
        if (!object(data)) fail(code);
        if (isMP) return data;
        if (data.success !== true || !object(data.result)) fail(code);
        return data.result;
      } catch { fail(code); } // Never forward raw exception text or API error bodies.
    }
    const merchant = await request(MP_ME, input.accessToken);
    const collectorId = String(merchant.id);
    if ((typeof merchant.id !== 'string' && !(Number.isSafeInteger(merchant.id) && merchant.id > 0)) ||
        !/^[1-9]\d{0,31}$/.test(collectorId) || merchant.country_id !== 'BR' || merchant.site_id !== 'MLB' ||
        (vars.MP_COLLECTOR_ID !== '0' && vars.MP_COLLECTOR_ID !== collectorId)) fail('MERCHANT_MISMATCH');
    if (!Array.isArray(merchant.tags) || merchant.tags.some(tag => typeof tag !== 'string') ||
        merchant.tags.includes('test_user')) fail('MERCHANT_NOT_PRODUCTION');
    state.merchantValidated = true;
    let cloudflareToken;
    try { cloudflareToken = await getCloudflareToken(); } catch { fail('WRANGLER_LOGIN_REQUIRED'); }
    if (typeof cloudflareToken !== 'string' || !/^\S{16,8192}$/.test(cloudflareToken)) fail('WRANGLER_LOGIN_REQUIRED');
    const account = await request(CF_ACCOUNT, cloudflareToken);
    if (account.id !== ACCOUNT_ID) fail('CF_ACCOUNT_MISMATCH');
    function validateProject(project) {
      if (project.name !== PROJECT_NAME || typeof project.id !== 'string' || !project.id ||
          (project.account_id !== undefined && project.account_id !== ACCOUNT_ID)) fail('CF_PROJECT_MISMATCH');
      const production = project.deployment_configs?.production;
      if (!object(production) || !(production.env_vars == null || object(production.env_vars))) fail('CF_CONFIG_INVALID');
      if (production.d1_databases?.BILLING_DB && production.d1_databases.BILLING_DB.id !== databaseId)
        fail('CF_DB_MISMATCH');
      return production;
    }
    const project = await request(CF_PROJECT, cloudflareToken);
    const existing = validateProject(project);
    const publicVars = { ...vars, MP_COLLECTOR_ID: collectorId };
    const envVars = {};
    for (const [key, value] of Object.entries(publicVars)) envVars[key] = { type: 'plain_text', value };
    envVars.MP_ACCESS_TOKEN = { type: 'secret_text', value: input.accessToken };
    envVars.MP_WEBHOOK_SECRET = { type: 'secret_text', value: input.webhookSecret };
    // Never round-trip masked secrets or write D1/preview configuration.
    const production = { env_vars: envVars };
    if (existing.wrangler_config_hash !== undefined) {
      if (existing.wrangler_config_hash !== null && typeof existing.wrangler_config_hash !== 'string')
        fail('CF_CONFIG_INVALID');
      production.wrangler_config_hash = existing.wrangler_config_hash;
    }
    state.cloudflareWriteAttempted = true;
    await request(CF_PROJECT, cloudflareToken, 'PATCH', { deployment_configs: { production } });
    const checkedProject = await request(CF_PROJECT, cloudflareToken);
    const checked = validateProject(checkedProject);
    if (checkedProject.id !== project.id || checked.env_vars?.MP_ACCESS_TOKEN?.type !== 'secret_text' ||
        checked.env_vars?.MP_WEBHOOK_SECRET?.type !== 'secret_text' ||
        Object.entries(publicVars).some(([key, value]) =>
          checked.env_vars?.[key]?.type !== 'plain_text' || checked.env_vars?.[key]?.value !== value))
      fail('CF_VERIFICATION_FAILED');
    state.cloudflareWriteConfirmed = true;
    // Only this public ID can reach the local updater, and only after remote confirmation.
    try { await updateCollector(collectorId); }
    catch (error) { if (error instanceof SetupError) throw error; fail('CONFIG_UPDATE_FAILED'); }
    state.localCollectorUpdated = true;
    return report(state, 'OK', now);
  } catch (error) { return report(state, error instanceof SetupError ? error.code : 'SETUP_FAILED', now); }
}
async function readInput(stream) {
  try {
    stream.setEncoding('utf8'); let text = '';
    for await (const chunk of stream) {
      text += chunk;
      if (Buffer.byteLength(text, 'utf8') > 16384) fail('INVALID_INPUT');
    }
    const input = JSON.parse(text); validateInput(input); return input;
  } catch { fail('INVALID_INPUT'); }
}
function updateLocalCollector(originalText, collectorId) {
  try {
    if (fs.readFileSync(CONFIG_PATH, 'utf8') !== originalText) fail('CONFIG_CHANGED');
    const config = JSON.parse(originalText);
    validateConfig(config);
    if (!/^[1-9]\d{0,31}$/.test(collectorId)) fail('CONFIG_UPDATE_FAILED');
    config.vars.MP_COLLECTOR_ID = collectorId;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf8');
  } catch (error) { if (error instanceof SetupError) throw error; fail('CONFIG_UPDATE_FAILED'); }
}
async function main() {
  let result, input;
  try {
    if (process.argv.length !== 2) fail('NO_ARGUMENTS_ALLOWED');
    let config, originalText;
    try {
      const ignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').replace(/\r/g, '');
      if (!/^work\/$/m.test(ignore) || /^!work(?:\/|$)/m.test(ignore)) fail('PRIVATE_OUTPUT_NOT_IGNORED');
      originalText = fs.readFileSync(CONFIG_PATH, 'utf8'); config = JSON.parse(originalText);
    } catch (error) { if (error instanceof SetupError) throw error; fail('CONFIG_READ_FAILED'); }
    validateConfig(config); input = await readInput(process.stdin);
    result = await configureProductionSecrets(input, { config, getCloudflareToken: readWranglerToken,
      updateCollector: collectorId => updateLocalCollector(originalText, collectorId) });
  } catch (error) { result = report({}, error instanceof SetupError ? error.code : 'SETUP_FAILED'); }
  finally { if (input) { input.accessToken = ''; input.webhookSecret = ''; } }
  try {
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(result, null, 2) + '\n', 'utf8');
  } catch { result = { ...result, ok: false, code: 'REPORT_WRITE_FAILED' }; }
  (result.ok ? process.stdout : process.stderr).write(JSON.stringify(result) + '\n');
  process.exitCode = result.ok ? 0 : 1;
}
module.exports = { PROJECT_NAME, ACCOUNT_ID, FIREBASE_PROJECT_ID, APPLICATION_ID,
  SetupError, validateConfig, configureProductionSecrets, readInput, parseWranglerToken };
if (require.main === module) main().catch(() => {
  process.stderr.write(JSON.stringify(report()) + '\n'); process.exitCode = 1;
});
