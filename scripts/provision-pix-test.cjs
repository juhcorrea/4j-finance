'use strict';
// LOCAL ONLY. Run explicitly after the Spark test project exists. No production selector.
// Official REST contracts:
// https://firebase.google.com/docs/reference/firebase-management/rest/v1beta1/projects.webApps/list
// https://firebase.google.com/docs/reference/firebase-management/rest/v1beta1/projects.webApps/create
// https://cloud.google.com/identity-platform/docs/reference/rest/v2/projects/updateConfig
// https://cloud.google.com/identity-platform/docs/reference/rest/v1/projects/accounts
// https://cloud.google.com/firestore/docs/reference/rest/v1/projects.databases/create
// https://firebase.google.com/docs/reference/rules/rest/v1/projects.releases/patch
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const PROJECT_ID = 'fjfinance-pix-test';
const PROJECT_NUMBER = '23221093985';
const APP_NAME = '4JPixQA';
const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'work', 'pix-cloudflare');
const RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow get: if request.auth != null && request.auth.uid == uid;
      allow list, create, update, delete: if false;
    }
    match /{document=**} { allow read, write: if false; }
  }
}\n`;
class SafeError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}
const fail = (code, status) => { throw new SafeError(code, status); };
let step = 'preflight';

function assertTestUrl(value, operationUrls = new Set()) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port) fail('UNSAFE_ENDPOINT');
  const p = url.pathname;
  const project = `projects/${PROJECT_ID}`;
  const allowed = {
    'cloudbilling.googleapis.com': p === `/v1/${project}/billingInfo`,
    'firebase.googleapis.com': p.startsWith(`/v1beta1/${project}`) && (p.length === `/v1beta1/${project}`.length || p[`/v1beta1/${project}`.length] === '/') || /^\/v1beta1\/operations\/[A-Za-z0-9._:-]+$/.test(p),
    'serviceusage.googleapis.com': p.startsWith(`/v1/projects/${PROJECT_NUMBER}/services/`) || /^\/v1\/operations\/[A-Za-z0-9._:-]+$/.test(p),
    'identitytoolkit.googleapis.com': p === `/admin/v2/${project}/config` || p === '/v1/projects/fjfinance-pix-test/accounts' || /^\/v1\/accounts:(lookup|update)$/.test(p),
    'firestore.googleapis.com': p.startsWith(`/v1/${project}/databases`),
    'firebaserules.googleapis.com': p.startsWith(`/v1/${project}/`),
  };
  if (!allowed[url.hostname] && !operationUrls.has(url.href)) {
    const error = new SafeError('UNSAFE_ENDPOINT');
    error.endpoint = url.origin + url.pathname;
    throw error;
  }
  return url;
}
function validateAccountFile(value) {
  if (!value || value.projectId !== PROJECT_ID || value.syntheticOnly !== true
    || !/^pixqa_[a-f0-9]{24}$/.test(value.uid || '') || !/^pix-qa-[a-f0-9]{24}@testuser\.com$/.test(value.email || '')
    || typeof value.password !== 'string' || value.password.length < 32) fail('UNEXPECTED_LOCAL_TEST_ACCOUNT');
  return value;
}
async function oauthFromFirebaseCli() {
  let lib = process.env.FIREBASE_TOOLS_LIB;
  if (!lib) {
    try { lib = path.dirname(require.resolve('firebase-tools/lib/auth')); }
    catch { fail('SET_FIREBASE_TOOLS_LIB'); }
  }
  try {
    const { logger } = require(path.join(lib, 'logger.js'));
    logger.silent = true;
    for (const method of ['log', 'debug', 'info', 'warn', 'error']) logger[method] = () => logger;
    const auth = require(path.join(lib, 'auth.js'));
    const account = auth.getGlobalDefaultAccount();
    if (!account?.tokens?.refresh_token) fail('FIREBASE_CLI_LOGIN_REQUIRED');
    const tokens = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/firebase']);
    if (!tokens?.access_token || tokens.access_token === account.tokens.refresh_token) fail('FIREBASE_CLI_TOKEN_INVALID');
    return tokens.access_token;
  } catch (error) { if (error instanceof SafeError) throw error; fail('FIREBASE_CLI_AUTH_FAILED'); }
}

async function main() {
  if (process.argv.length !== 2) fail('NO_PROJECT_OR_CREDENTIAL_ARGUMENTS_ALLOWED');
  const ignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  if (!/^work\/$/m.test(ignore.replace(/\r/g, '')) || /^!work(?:\/|$)/m.test(ignore)) fail('PRIVATE_OUTPUT_NOT_IGNORED');
  const accessToken = await oauthFromFirebaseCli();
  const operationUrls = new Set();
  async function call(urlValue, { method = 'GET', body, allow = [] } = {}) {
    const url = assertTestUrl(urlValue, operationUrls);
    if (operationUrls.has(url.href) && method !== 'GET') fail('OPERATION_READ_ONLY');
    if (url.hostname === 'cloudbilling.googleapis.com' && method !== 'GET') fail('BILLING_MUTATION_FORBIDDEN');
    if ((url.pathname.startsWith('/v1/accounts:') || url.pathname === '/v1/projects/' + PROJECT_ID + '/accounts')
      && body?.targetProjectId !== PROJECT_ID) fail('UNSAFE_AUTH_PROJECT');
    if (url.hostname === 'identitytoolkit.googleapis.com' && url.searchParams.has('key')) fail('ADMIN_AUTH_MUST_USE_OAUTH_ONLY');
    if (url.hostname === 'serviceusage.googleapis.com' && method !== 'GET'
      && !['firestore.googleapis.com', 'firebaserules.googleapis.com', 'identitytoolkit.googleapis.com'].some(service => url.pathname === `/v1/projects/${PROJECT_NUMBER}/services/${service}:enable`)) fail('UNSAFE_SERVICE');
    let response, data;
    try {
      response = await fetch(url, { method, redirect: 'error', signal: AbortSignal.timeout(25000),
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const text = await response.text();
      if (text.length > 2000000) fail('OVERSIZED_RESPONSE');
      data = text ? JSON.parse(text) : {};
    } catch (error) { if (error instanceof SafeError) throw error; fail('REQUEST_FAILED'); }
    if (!response.ok && !allow.includes(response.status)) {
      const code = typeof data.error?.status === 'string' && /^[A-Z_]+$/.test(data.error.status) ? data.error.status : 'API_ERROR';
      fail(code, response.status);
    }
    return { status: response.status, data };
  }
  async function assertNoBilling() {
    const result = (await call(`https://cloudbilling.googleapis.com/v1/projects/${PROJECT_ID}/billingInfo`)).data;
    if (result.projectId !== PROJECT_ID || result.billingEnabled !== false) fail('BILLING_MUST_REMAIN_DISABLED');
  }
  async function waitOperation(origin, version, operation) {
    let current = operation;
    const end = Date.now() + 180000;
    while (!current.done) {
      if (typeof current.name !== 'string' || Date.now() >= end) fail('OPERATION_PENDING_RETRY_SAME_SCRIPT');
      await new Promise(resolve => setTimeout(resolve, 2000));
      // A polling URL is a read-only capability returned by a creation request
      // already pinned to this test project. Operation IDs can contain slashes.
      if (!['https://firebase.googleapis.com', 'https://serviceusage.googleapis.com', 'https://firestore.googleapis.com'].includes(origin)
        || /[?#\s]/.test(current.name)
        || !(current.name.startsWith('operations/') || current.name.startsWith(`projects/${PROJECT_ID}/`) || current.name.startsWith(`projects/${PROJECT_NUMBER}/`))) fail('UNSAFE_OPERATION_NAME');
      const operationUrl = new URL(`${origin}/${version}/${current.name}`);
      if (operationUrl.origin !== origin || operationUrl.pathname !== `/${version}/${current.name}`) fail('UNSAFE_OPERATION_NAME');
      operationUrls.add(operationUrl.href);
      current = (await call(operationUrl.href)).data;
    }
    if (current.error) fail('OPERATION_FAILED');
    return current.response || {};
  }
  let billingChecked = false;
  let result;
  try {
    step = 'billing-before'; await assertNoBilling(); billingChecked = true;
    step = 'project';
    const project = (await call(`https://firebase.googleapis.com/v1beta1/projects/${PROJECT_ID}`)).data;
    if (project.projectId !== PROJECT_ID || String(project.projectNumber) !== PROJECT_NUMBER || project.state !== 'ACTIVE') fail('UNEXPECTED_TEST_PROJECT');
    fs.mkdirSync(OUTPUT, { recursive: true, mode: 0o700 });
    step = 'required-free-apis';
    for (const service of ['identitytoolkit.googleapis.com', 'firestore.googleapis.com', 'firebaserules.googleapis.com']) {
      const serviceUrl = `https://serviceusage.googleapis.com/v1/projects/${PROJECT_NUMBER}/services/${service}`;
      const state = (await call(serviceUrl)).data;
      if (state.state !== 'ENABLED') await waitOperation('https://serviceusage.googleapis.com', 'v1', (await call(`${serviceUrl}:enable`, { method: 'POST', body: {} })).data);
    }
    step = 'web-app';
    const apps = [];
    let pageToken;
    do {
      const listed = (await call(`https://firebase.googleapis.com/v1beta1/projects/${PROJECT_ID}/webApps?pageSize=100${pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''}`)).data;
      apps.push(...(listed.apps || [])); pageToken = listed.nextPageToken;
    } while (pageToken);
    const matches = apps.filter(app => String(app.displayName || '').replace(/\s/g, '').toLowerCase() === APP_NAME.toLowerCase());
    if (matches.length > 1) fail('AMBIGUOUS_TEST_WEB_APP');
    let app = matches[0];
    if (!app) app = await waitOperation('https://firebase.googleapis.com', 'v1beta1', (await call(`https://firebase.googleapis.com/v1beta1/projects/${PROJECT_ID}/webApps`, { method: 'POST', body: { displayName: APP_NAME } })).data);
    if (typeof app.appId !== 'string' || !app.appId.startsWith(`1:${PROJECT_NUMBER}:web:`)) fail('UNEXPECTED_WEB_APP');
    const sdk = (await call(`https://firebase.googleapis.com/v1beta1/projects/${PROJECT_ID}/webApps/${encodeURIComponent(app.appId)}/config`)).data;
    if (sdk.projectId !== PROJECT_ID || sdk.appId !== app.appId || typeof sdk.apiKey !== 'string' || !sdk.apiKey) fail('UNEXPECTED_SDK_CONFIG');
    const publicConfig = { projectId: PROJECT_ID, appId: app.appId, apiKey: sdk.apiKey, authDomain: sdk.authDomain, messagingSenderId: sdk.messagingSenderId };
    fs.writeFileSync(path.join(OUTPUT, 'firebase-public-config.json'), JSON.stringify(publicConfig, null, 2) + '\n', { mode: 0o600 });
    step = 'firebase-auth-email-password';
    const configUrl = `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config`;
    const existingAuthConfig = await call(configUrl, { allow: [404] });
    if (existingAuthConfig.status === 404) fail('INITIALIZE_AUTH_IN_FIREBASE_SPARK_CONSOLE');
    await call(`${configUrl}?updateMask=signIn.email.enabled,signIn.email.passwordRequired`, { method: 'PATCH', body: { signIn: { email: { enabled: true, passwordRequired: true } } } });
    const authConfig = (await call(configUrl)).data;
    if (authConfig.signIn?.email?.enabled !== true || authConfig.signIn.email.passwordRequired !== true) fail('EMAIL_PASSWORD_NOT_READY');
    step = 'firestore-default';
    const databaseUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases`;
    const databases = (await call(databaseUrl)).data.databases || [];
    const databaseName = `projects/${PROJECT_ID}/databases/(default)`;
    if (databases.some(database => database.name !== databaseName)) fail('ONLY_FIRST_DEFAULT_DATABASE_ALLOWED');
    let database = databases.find(value => value.name === databaseName);
    if (!database) database = await waitOperation('https://firestore.googleapis.com', 'v1', (await call(`${databaseUrl}?databaseId=%28default%29`, { method: 'POST', body: { type: 'FIRESTORE_NATIVE', locationId: 'nam5' } })).data);
    if (database.name !== databaseName || database.type !== 'FIRESTORE_NATIVE' || database.locationId !== 'nam5') fail('UNEXPECTED_FIRESTORE_DATABASE');
    step = 'test-only-firestore-rules';
    const rulesBase = `https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}`;
    const releaseName = `projects/${PROJECT_ID}/releases/cloud.firestore`;
    const ruleset = (await call(`${rulesBase}/rulesets`, { method: 'POST', body: { source: { files: [{ name: 'firestore.rules', content: RULES }] } } })).data;
    if (typeof ruleset.name !== 'string' || !ruleset.name.startsWith(`projects/${PROJECT_ID}/rulesets/`)) fail('UNEXPECTED_RULESET');
    const prior = await call(`${rulesBase}/releases/cloud.firestore`, { allow: [404] });
    const release = { name: releaseName, rulesetName: ruleset.name };
    if (prior.status === 404) await call(`${rulesBase}/releases`, { method: 'POST', body: release });
    else await call(`${rulesBase}/releases/cloud.firestore`, { method: 'PATCH', body: { release, updateMask: 'rulesetName' } });
    const confirmedRelease = (await call(`${rulesBase}/releases/cloud.firestore`)).data;
    if (confirmedRelease.rulesetName !== ruleset.name) fail('RULES_RELEASE_NOT_CONFIRMED');
    step = 'synthetic-test-account';
    const accountPath = path.join(OUTPUT, 'test-account.json');
    let account;
    if (fs.existsSync(accountPath)) account = validateAccountFile(JSON.parse(fs.readFileSync(accountPath, 'utf8')));
    else {
      const suffix = randomBytes(12).toString('hex');
      account = { projectId: PROJECT_ID, syntheticOnly: true, uid: `pixqa_${suffix}`, email: `pix-qa-${suffix}@testuser.com`, password: randomBytes(32).toString('base64url'), createdAt: new Date().toISOString() };
      // Save before remote creation so a lost response can resume the exact same synthetic UID.
      fs.writeFileSync(accountPath, JSON.stringify(account, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    }
    const lookupBody = { targetProjectId: PROJECT_ID, localId: [account.uid] };
    let lookup = (await call('https://identitytoolkit.googleapis.com/v1/accounts:lookup', { method: 'POST', body: lookupBody })).data;
    let testUserCreated = false;
    if (!lookup.users?.length) {
      // Administrative create pins the project in the path and uses OAuth alone.
      // Combining this project's Web API key with the CLI OAuth client is rejected.
      await call('https://identitytoolkit.googleapis.com/v1/projects/fjfinance-pix-test/accounts', { method: 'POST', body: { targetProjectId: PROJECT_ID, localId: account.uid, email: account.email, password: account.password, emailVerified: true, disabled: false } });
      testUserCreated = true;
    } else {
      if (lookup.users.length !== 1 || lookup.users[0].localId !== account.uid || lookup.users[0].email !== account.email) fail('UNEXPECTED_REMOTE_TEST_ACCOUNT');
      await call('https://identitytoolkit.googleapis.com/v1/accounts:update', { method: 'POST', body: { targetProjectId: PROJECT_ID, localId: account.uid, emailVerified: true, disableUser: false } });
    }
    lookup = (await call('https://identitytoolkit.googleapis.com/v1/accounts:lookup', { method: 'POST', body: lookupBody })).data;
    if (lookup.users?.length !== 1 || lookup.users[0].localId !== account.uid || lookup.users[0].email !== account.email || lookup.users[0].emailVerified !== true || lookup.users[0].disabled === true) fail('TEST_ACCOUNT_NOT_READY');
    step = 'own-test-status-document';
    const documentName = `${databaseName}/documents/users/${account.uid}`;
    const profile = (await call(`https://firestore.googleapis.com/v1/${documentName}?updateMask.fieldPaths=status`, { method: 'PATCH', body: { fields: { status: { stringValue: 'approved' } } } })).data;
    if (profile.name !== documentName || profile.fields?.status?.stringValue !== 'approved') fail('TEST_PROFILE_NOT_READY');
    result = { projectId: PROJECT_ID, webAppId: app.appId, apiKey: sdk.apiKey, firestoreReady: true, authReady: true, testUserCreated };
  } finally {
    if (billingChecked) { const previousStep = step; step = 'billing-after'; await assertNoBilling(); step = previousStep; }
  }
  process.stdout.write(JSON.stringify(result) + '\n');
}
if (require.main === module) main().catch(error => {
  process.stderr.write(JSON.stringify({ ok: false, projectId: PROJECT_ID, step, errorCode: error instanceof SafeError ? error.code : 'LOCAL_SETUP_FAILED', ...(error instanceof SafeError && error.endpoint ? { endpoint: error.endpoint } : {}), ...(error instanceof SafeError && error.status ? { httpStatus: error.status } : {}) }) + '\n');
  process.exitCode = 1;
});
module.exports = { PROJECT_ID, RULES, assertTestUrl, validateAccountFile };