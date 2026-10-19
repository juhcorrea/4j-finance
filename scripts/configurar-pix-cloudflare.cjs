'use strict';
// Local, explicitly invoked setup. Never creates a payment or deploys the site.
// Partial env_vars PATCH matches Wrangler's Pages secret implementation:
// https://github.com/cloudflare/workers-sdk/blob/main/packages/wrangler/src/pages/secret/index.ts
// https://developers.cloudflare.com/api/resources/pages/subresources/projects/methods/edit/
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_NAME = '4jfinance-pix-test';
const ACCOUNT_ID = '30d41a970cf8e98064fc76bc1d8d2d51';
const TEST_FIREBASE_PROJECT = 'fjfinance-pix-test';
const ROOT = path.resolve(__dirname, '..');
const MP_ME = 'https://api.mercadopago.com/users/me';
const CF_ACCOUNT = 'https://api.cloudflare.com/client/v4/accounts/' + ACCOUNT_ID;
const CF_PROJECT = CF_ACCOUNT + '/pages/projects/' + PROJECT_NAME;
const SAFE_CODES = new Set([
  'INVALID_INPUT', 'INVALID_TEST_CONFIG', 'MERCHANT_NOT_TEST', 'MERCHANT_MISMATCH',
  'MP_REQUEST_FAILED', 'CF_REQUEST_FAILED', 'CF_ACCOUNT_MISMATCH', 'CF_PROJECT_MISMATCH',
  'CF_CONFIG_INVALID', 'CF_VERIFICATION_FAILED', 'WRANGLER_LOGIN_REQUIRED',
  'NO_ARGUMENTS_ALLOWED', 'PRIVATE_OUTPUT_NOT_IGNORED', 'CONFIG_READ_FAILED',
  'REPORT_WRITE_FAILED', 'SETUP_FAILED'
]);
class SetupError extends Error {
  constructor(code) { super(SAFE_CODES.has(code) ? code : 'SETUP_FAILED'); this.code = this.message; }
}
const fail = code => { throw new SetupError(code); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function safeFailure(error) {
  return { ok: false, test: true, projectName: PROJECT_NAME,
    errorCode: error instanceof SetupError && SAFE_CODES.has(error.code) ? error.code : 'SETUP_FAILED' };
}
function validateConfig(config) {
  const vars = config?.vars;
  if (!record(config) || config.name !== PROJECT_NAME ||
      (config.account_id !== undefined && config.account_id !== ACCOUNT_ID) || !record(vars) ||
      vars.MP_LIVE_MODE !== 'false' || vars.FIREBASE_PROJECT_ID !== TEST_FIREBASE_PROJECT ||
      vars.MP_TEST_FIREBASE_PROJECT_ID !== TEST_FIREBASE_PROJECT ||
      typeof vars.MP_PRODUCTION_FIREBASE_PROJECT_ID !== 'string' ||
      !vars.MP_PRODUCTION_FIREBASE_PROJECT_ID || vars.MP_PRODUCTION_FIREBASE_PROJECT_ID === TEST_FIREBASE_PROJECT ||
      !/^\d+$/.test(vars.MP_COLLECTOR_ID || '') || !/^\d+$/.test(vars.MP_APPLICATION_ID || '') ||
      !['true', 'false'].includes(vars.PAYMENTS_ENABLED)) fail('INVALID_TEST_CONFIG');
  for (const [key, value] of Object.entries(vars)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || /SECRET|PASSWORD|TOKEN/.test(key) ||
        typeof value !== 'string' || value.length > 8192) fail('INVALID_TEST_CONFIG');
  }
  return vars;
}
function validateInput(input) {
  if (!record(input) || Object.keys(input).sort().join(',') !== 'accessToken,webhookSecret' ||
      typeof input.accessToken !== 'string' || typeof input.webhookSecret !== 'string' ||
      !/^\S{16,8192}$/.test(input.accessToken) || !/^\S{16,1024}$/.test(input.webhookSecret))
    fail('INVALID_INPUT');
  return input;
}
function parseWranglerToken(toml, now = Date.now()) {
  try {
    // Only top-level JSON-compatible TOML basic strings are accepted.
    const lines = String(toml).split(/\r?\n/);
    const fields = new Map();
    for (const line of lines) {
      if (/^\s*\[/.test(line)) break;
      const match = /^\s*(oauth_token|expiration_time)\s*=\s*("(?:[^"\\]|\\.)*")\s*(?:#.*)?$/.exec(line);
      if (match) {
        if (fields.has(match[1])) fail('WRANGLER_LOGIN_REQUIRED');
        fields.set(match[1], JSON.parse(match[2]));
      }
    }
    const token = fields.get('oauth_token');
    const expiration = Date.parse(fields.get('expiration_time'));
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
async function configureTestSecrets(input, { config, getCloudflareToken, fetchImpl = fetch, now = Date.now } = {}) {
  validateInput(input);
  const vars = validateConfig(config);
  async function request(url, token, method = 'GET', body) {
    const isMP = url === MP_ME;
    const code = isMP ? 'MP_REQUEST_FAILED' : 'CF_REQUEST_FAILED';
    if (!isMP && url !== CF_ACCOUNT && url !== CF_PROJECT) fail(code);
    if (method !== 'GET' && !(url === CF_PROJECT && method === 'PATCH')) fail(code);
    try {
      const response = await fetchImpl(url, {
        method, redirect: 'error', signal: AbortSignal.timeout(25000),
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      const raw = await response.text();
      if (!response.ok || raw.length > 2000000) fail(code);
      const data = JSON.parse(raw);
      if (!record(data)) fail(code);
      if (isMP) return data;
      if (data.success !== true || !record(data.result)) fail(code);
      return data.result;
    } catch { fail(code); } // Provider/network messages and bodies never cross this boundary.
  }

  const merchant = await request(MP_ME, input.accessToken);
  if (String(merchant.id) !== vars.MP_COLLECTOR_ID ||
      merchant.country_id !== 'BR' || merchant.site_id !== 'MLB') fail('MERCHANT_MISMATCH');
  if (!Array.isArray(merchant.tags) || merchant.tags.some(tag => typeof tag !== 'string') ||
      !merchant.tags.includes('test_user')) fail('MERCHANT_NOT_TEST');

  // OAuth is loaded only after the MP token is proven to belong to the configured test merchant.
  let cloudflareToken;
  try { cloudflareToken = await getCloudflareToken(); }
  catch { fail('WRANGLER_LOGIN_REQUIRED'); }
  if (typeof cloudflareToken !== 'string' || !/^\S{16,8192}$/.test(cloudflareToken))
    fail('WRANGLER_LOGIN_REQUIRED');
  const account = await request(CF_ACCOUNT, cloudflareToken);
  if (account.id !== ACCOUNT_ID) fail('CF_ACCOUNT_MISMATCH');
  function validateProject(project) {
    if (project.name !== PROJECT_NAME || typeof project.id !== 'string' || !project.id ||
        (project.account_id !== undefined && project.account_id !== ACCOUNT_ID)) fail('CF_PROJECT_MISMATCH');
    if (!record(project.deployment_configs?.production) ||
        !record(project.deployment_configs.production.env_vars)) fail('CF_CONFIG_INVALID');
    return project.deployment_configs.production;
  }
  const project = await request(CF_PROJECT, cloudflareToken);
  const existing = validateProject(project);
  const envVars = {};
  for (const [key, value] of Object.entries(vars)) envVars[key] = { type: 'plain_text', value };
  envVars.MP_ACCESS_TOKEN = { type: 'secret_text', value: input.accessToken };
  envVars.MP_WEBHOOK_SECRET = { type: 'secret_text', value: input.webhookSecret };
  // Omission preserves existing vars/secrets and preview/D1 configuration. Never copy masked secrets.
  const production = { env_vars: envVars };
  if (existing.wrangler_config_hash !== undefined) {
    if (existing.wrangler_config_hash !== null && typeof existing.wrangler_config_hash !== 'string')
      fail('CF_CONFIG_INVALID');
    production.wrangler_config_hash = existing.wrangler_config_hash;
  }
  await request(CF_PROJECT, cloudflareToken, 'PATCH', { deployment_configs: { production } });
  const verifiedProject = await request(CF_PROJECT, cloudflareToken);
  const verified = validateProject(verifiedProject);
  if (verifiedProject.id !== project.id || verified.env_vars.MP_ACCESS_TOKEN?.type !== 'secret_text' ||
      verified.env_vars.MP_WEBHOOK_SECRET?.type !== 'secret_text' ||
      Object.entries(vars).some(([key, value]) =>
        verified.env_vars[key]?.type !== 'plain_text' || verified.env_vars[key]?.value !== value))
    fail('CF_VERIFICATION_FAILED');
  return { ok: true, test: true, at: new Date(now()).toISOString(), projectName: PROJECT_NAME,
    merchantValidated: true, webhookSecretConfigured: true };
}
async function readInput(stream) {
  try {
    stream.setEncoding('utf8');
    let text = '';
    for await (const chunk of stream) {
      text += chunk;
      if (Buffer.byteLength(text, 'utf8') > 16384) fail('INVALID_INPUT');
    }
    return validateInput(JSON.parse(text));
  } catch { fail('INVALID_INPUT'); }
}
async function main() {
  if (process.argv.length !== 2) fail('NO_ARGUMENTS_ALLOWED');
  let config;
  try {
    const ignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').replace(/\r/g, '');
    if (!/^work\/$/m.test(ignore) || /^!work(?:\/|$)/m.test(ignore)) fail('PRIVATE_OUTPUT_NOT_IGNORED');
    config = JSON.parse(fs.readFileSync(path.join(ROOT, 'cloudflare', 'wrangler.test.json'), 'utf8'));
  } catch (error) { if (error instanceof SetupError) throw error; fail('CONFIG_READ_FAILED'); }
  validateConfig(config);
  const input = await readInput(process.stdin);
  const report = await configureTestSecrets(input, { config, getCloudflareToken: readWranglerToken });
  input.accessToken = '';
  input.webhookSecret = '';
  try {
    const output = path.join(ROOT, 'work', 'pix-cloudflare');
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'secrets-setup.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  } catch { fail('REPORT_WRITE_FAILED'); }
  process.stdout.write(JSON.stringify(report) + '\n');
}
module.exports = { PROJECT_NAME, ACCOUNT_ID, SetupError, safeFailure, validateConfig,
  parseWranglerToken, configureTestSecrets, readInput };
if (require.main === module) {
  main().catch(error => {
    process.stderr.write(JSON.stringify(safeFailure(error)) + '\n');
    process.exitCode = 1;
  });
}
