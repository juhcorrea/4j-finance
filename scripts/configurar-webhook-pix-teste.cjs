'use strict';
// Explicit local setup: updates one secret in the fixed TEST Pages project only.
// Partial PATCH follows Wrangler Pages secrets; omitted secrets/bindings are preserved.
const fs = require('node:fs');
const path = require('node:path');
const { validateConfig: validateBaseConfig, parseWranglerToken } = require('./configurar-pix-cloudflare.cjs');
const PROJECT_NAME = '4jfinance-pix-test';
const ACCOUNT_ID = '30d41a970cf8e98064fc76bc1d8d2d51';
const DATABASE_ID = 'c0c6d41a-6013-45c2-896f-ecb3746d8962';
const ROOT = path.resolve(__dirname, '..');
const ACCOUNT_URL = 'https://api.cloudflare.com/client/v4/accounts/' + ACCOUNT_ID;
const PROJECT_URL = ACCOUNT_URL + '/pages/projects/' + PROJECT_NAME;
const SAFE_CODES = new Set(['INVALID_INPUT', 'INVALID_TEST_CONFIG', 'WRANGLER_LOGIN_REQUIRED',
  'CF_REQUEST_FAILED', 'CF_ACCOUNT_MISMATCH', 'CF_PROJECT_MISMATCH', 'CF_CONFIG_INVALID',
  'CF_VERIFICATION_FAILED', 'NO_ARGUMENTS_ALLOWED', 'PRIVATE_OUTPUT_NOT_IGNORED',
  'CONFIG_READ_FAILED', 'REPORT_WRITE_FAILED', 'SETUP_FAILED']);
class WebhookSetupError extends Error {
  constructor(code) { super(SAFE_CODES.has(code) ? code : 'SETUP_FAILED'); this.code = this.message; }
}
const fail = code => { throw new WebhookSetupError(code); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function safeFailure(error) {
  return { ok: false, test: true, projectName: PROJECT_NAME,
    errorCode: error instanceof WebhookSetupError ? error.code : 'SETUP_FAILED',
    cloudflareWriteAttempted: error instanceof WebhookSetupError && error.cloudflareWriteAttempted === true,
    cloudflareWriteConfirmed: error instanceof WebhookSetupError && error.cloudflareWriteConfirmed === true };
}
function validateConfig(config) {
  let vars;
  try { vars = validateBaseConfig(config); } catch { fail('INVALID_TEST_CONFIG'); }
  if (config.d1_databases?.length !== 1 || config.d1_databases[0]?.binding !== 'BILLING_DB' ||
      config.d1_databases[0]?.database_id !== DATABASE_ID ||
      vars.ALLOWED_ORIGINS !== '["https://4jfinance-pix-test.pages.dev"]') fail('INVALID_TEST_CONFIG');
  return vars;
}
function validateInput(input) {
  if (!record(input) || Object.keys(input).join(',') !== 'webhookSecret' ||
      typeof input.webhookSecret !== 'string' || !/^[\x21-\x7e]{16,1024}$/.test(input.webhookSecret) ||
      /^(?:APP_USR-|TEST-|Bearer|https?:\/\/|eyJ)/i.test(input.webhookSecret)) fail('INVALID_INPUT');
  return input;
}
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (record(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
function withoutWebhook(project) {
  const copy = structuredClone(project.deployment_configs);
  delete copy.production.env_vars.MP_WEBHOOK_SECRET;
  return canonical(copy);
}
async function configureWebhookSecret(input, { config, getCloudflareToken, fetchImpl = fetch, now = Date.now } = {}) {
  validateInput(input);
  const vars = validateConfig(config);
  let attempted = false, confirmed = false;
  try {
    let token;
    try { token = await getCloudflareToken(); } catch { fail('WRANGLER_LOGIN_REQUIRED'); }
    if (typeof token !== 'string' || !/^\S{16,8192}$/.test(token)) fail('WRANGLER_LOGIN_REQUIRED');
    if (input.webhookSecret === token) fail('INVALID_INPUT');
    async function request(url, method = 'GET', body) {
      if (![ACCOUNT_URL, PROJECT_URL].includes(url) || (method !== 'GET' && !(url === PROJECT_URL && method === 'PATCH'))) fail('CF_REQUEST_FAILED');
      try {
        const response = await fetchImpl(url, { method, redirect: 'error', signal: AbortSignal.timeout(25000),
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        const raw = await response.text();
        if (!response.ok || response.redirected === true || raw.length > 2000000) fail('CF_REQUEST_FAILED');
        const data = JSON.parse(raw);
        if (data?.success !== true || !record(data.result)) fail('CF_REQUEST_FAILED');
        return data.result;
      } catch { fail('CF_REQUEST_FAILED'); }
    }
    const account = await request(ACCOUNT_URL);
    if (account.id !== ACCOUNT_ID) fail('CF_ACCOUNT_MISMATCH');
    function validateProject(project) {
      if (project.name !== PROJECT_NAME || typeof project.id !== 'string' || !project.id ||
          (project.account_id !== undefined && project.account_id !== ACCOUNT_ID)) fail('CF_PROJECT_MISMATCH');
      const production = project.deployment_configs?.production;
      if (!record(production?.env_vars) || !record(project.deployment_configs?.preview) ||
          production.d1_databases?.BILLING_DB?.id !== DATABASE_ID ||
          production.env_vars.MP_ACCESS_TOKEN?.type !== 'secret_text' ||
          Object.entries(vars).some(([key, value]) => production.env_vars[key]?.type !== 'plain_text' || production.env_vars[key]?.value !== value))
        fail('CF_CONFIG_INVALID');
      return production;
    }
    const project = await request(PROJECT_URL);
    const existing = validateProject(project);
    const before = withoutWebhook(project);
    const production = { env_vars: { MP_WEBHOOK_SECRET: { type: 'secret_text', value: input.webhookSecret } } };
    if (existing.wrangler_config_hash !== undefined) {
      if (existing.wrangler_config_hash !== null && typeof existing.wrangler_config_hash !== 'string') fail('CF_CONFIG_INVALID');
      production.wrangler_config_hash = existing.wrangler_config_hash;
    }
    attempted = true;
    await request(PROJECT_URL, 'PATCH', { deployment_configs: { production } });
    const verifiedProject = await request(PROJECT_URL);
    const verified = validateProject(verifiedProject);
    if (verifiedProject.id !== project.id || verified.env_vars.MP_WEBHOOK_SECRET?.type !== 'secret_text' ||
        before !== withoutWebhook(verifiedProject)) fail('CF_VERIFICATION_FAILED');
    confirmed = true;
    return { ok: true, test: true, at: new Date(now()).toISOString(), projectName: PROJECT_NAME,
      webhookSecretConfigured: true, accessTokenChanged: false, deploymentRequired: true };
  } catch (error) {
    const safe = error instanceof WebhookSetupError ? error : new WebhookSetupError('SETUP_FAILED');
    safe.cloudflareWriteAttempted = attempted; safe.cloudflareWriteConfirmed = confirmed; throw safe;
  }
}
async function readInput(stream) {
  try {
    stream.setEncoding('utf8'); let text = '';
    for await (const chunk of stream) { text += chunk; if (Buffer.byteLength(text, 'utf8') > 8192) fail('INVALID_INPUT'); }
    return validateInput(JSON.parse(text));
  } catch { fail('INVALID_INPUT'); }
}
function readToken() {
  try {
    if (!process.env.APPDATA) fail('WRANGLER_LOGIN_REQUIRED');
    return parseWranglerToken(fs.readFileSync(path.join(process.env.APPDATA, 'xdg.config', '.wrangler', 'config', 'default.toml'), 'utf8'));
  } catch { fail('WRANGLER_LOGIN_REQUIRED'); }
}
async function main() {
  if (process.argv.length !== 2) fail('NO_ARGUMENTS_ALLOWED');
  let config;
  try {
    const ignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').replace(/\r/g, '');
    if (!/^work\/$/m.test(ignore) || /^!work(?:\/|$)/m.test(ignore)) fail('PRIVATE_OUTPUT_NOT_IGNORED');
    config = JSON.parse(fs.readFileSync(path.join(ROOT, 'cloudflare/wrangler.test.json'), 'utf8'));
  } catch (error) { if (error instanceof WebhookSetupError) throw error; fail('CONFIG_READ_FAILED'); }
  validateConfig(config);
  const input = await readInput(process.stdin);
  let report;
  try { report = await configureWebhookSecret(input, { config, getCloudflareToken: readToken }); }
  finally { input.webhookSecret = ''; }
  try {
    fs.mkdirSync(path.join(ROOT, 'work/pix-cloudflare'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'work/pix-cloudflare/webhook-secret-setup.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  } catch { fail('REPORT_WRITE_FAILED'); }
  process.stdout.write(JSON.stringify(report) + '\n');
}
module.exports = { PROJECT_NAME, ACCOUNT_ID, DATABASE_ID, WebhookSetupError, validateConfig,
  validateInput, configureWebhookSecret, readInput, safeFailure };
if (require.main === module) main().catch(error => { process.stderr.write(JSON.stringify(safeFailure(error)) + '\n'); process.exitCode = 1; });
