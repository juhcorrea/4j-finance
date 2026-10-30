'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, sign, verify } = require('node:crypto');
const { createAuthenticator } = require('../auth.cjs');
const { createAdminAccounts, AdminAccountError, validateInput } = require('../admin-accounts.cjs');
const PROJECT = 'synthetic-4j-admin';
const NOW = Date.parse('2026-10-30T15:00:00Z');
const SECONDS = NOW / 1000;
const ORIGIN = 'https://4jfinance.com.br';
const ACTOR = 'synthetic-admin';
const TARGET = 'synthetic-member';
const SA_EMAIL = `fourj-admin@${PROJECT}.iam.gserviceaccount.com`;
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const servicePair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...pair.publicKey.export({ format: 'jwk' }), kid: 'synthetic-public-key', alg: 'RS256', use: 'sig' };
const credential = { type: 'service_account', project_id: PROJECT, client_email: SA_EMAIL, private_key_id: 'synthetic-private-key-id', private_key: servicePair.privateKey.export({ format: 'pem', type: 'pkcs8' }), token_uri: 'https://oauth2.googleapis.com/token' };
const initialTarget = { localId: TARGET, email: 'member@example.test', displayName: 'Conta de teste', emailVerified: true, disabled: false, validSince: String(SECONDS - 3600), passwordHash: 'NEVER-RETURN-HASH', providerUserInfo: [{ rawId: 'NEVER-RETURN-PROVIDER' }] };
const input = changes => ({ uid: TARGET, expectedEmail: 'member@example.test', email: 'novo@example.test', displayName: 'Novo nome', ...changes });
function jwt(changes = {}, signingPair = pair) {
  const a = Buffer.from(JSON.stringify({ alg: 'RS256', kid: jwk.kid, typ: 'JWT' })).toString('base64url');
  const b = Buffer.from(JSON.stringify({ aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, sub: ACTOR, iat: SECONDS - 10, auth_time: SECONDS - 20, exp: SECONDS + 3600, ...changes })).toString('base64url');
  return `${a}.${b}.${sign('RSA-SHA256', Buffer.from(`${a}.${b}`), signingPair.privateKey).toString('base64url')}`;
}
function request(token = jwt(), body = input(), extras = {}) {
  return new Request(`https://admin.example.test/api/admin/accounts/update`, { method: 'POST', headers: { Origin: ORIGIN, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extras.headers }, body: JSON.stringify(body), ...extras });
}
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const errorCode = code => error => error instanceof AdminAccountError && error.code === code && !error.message.includes('NEVER-RETURN');
function harness(overrides = {}) {
  const state = {
    actor: { localId: ACTOR, email: 'admin@example.test', emailVerified: true, disabled: false, validSince: String(SECONDS - 100) },
    actorDoc: { role: 'admin', status: 'approved' }, targetDoc: { role: 'member', status: 'approved', email: initialTarget.email, name: initialTarget.displayName },
    target: { ...initialTarget }, calls: [], updates: [], mirrorWrites: [], privilegedLookups: 0, oauthCalls: 0, actorChecks: 0, ...overrides,
  };
  function document(uid) {
    const record = uid === ACTOR ? state.actorDoc : state.targetDoc;
    const fields = Object.fromEntries(Object.entries(record).map(([key, value]) => [key, key === 'authValidAfter' ? { integerValue: String(value) } : { stringValue: value }]));
    return { name: `projects/${PROJECT}/databases/(default)/documents/users/${uid}`, fields, updateTime: '2026-10-30T14:50:00.000Z' };
  }
  const fetchImpl = async (rawUrl, options) => {
    const url = new URL(rawUrl); state.calls.push({ url: rawUrl, options });
    assert.equal(options.redirect, 'manual'); assert.ok(options.signal instanceof AbortSignal);
    if (url.pathname.includes('/jwk/')) return json({ keys: [jwk] }, 200, { 'cache-control': 'max-age=3600' });
    assert.equal(options.cache, 'no-store');
    if (url.href === 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=synthetic-public-key') return json({ users: [state.actor] });
    if (url.hostname === 'firestore.googleapis.com') {
      assert.match(options.headers.Authorization, /^Bearer ey/);
      const uid = url.pathname.split('/').at(-1); assert.ok([ACTOR, TARGET].includes(uid));
      if (options.method === 'PATCH') {
        assert.equal(uid, TARGET); assert.equal(url.searchParams.get('currentDocument.updateTime'), '2026-10-30T14:50:00.000Z');
        const patch = JSON.parse(options.body).fields;
        assert.ok(Object.keys(patch).every(key => ['email', 'name', 'authValidAfter'].includes(key)));
        assert.deepEqual(url.searchParams.getAll('updateMask.fieldPaths').sort(), Object.keys(patch).sort());
        state.mirrorWrites.push(patch);
        if (state.cutoffFailure || (state.mirrorFailure && state.updates.length)) return json({ error: { message: 'NEVER-RETURN-PRIVATE-ERROR' } }, 403);
        for (const [key, value] of Object.entries(patch)) state.targetDoc[key] = key === 'authValidAfter' ? Number(value.integerValue) : value.stringValue;
        return json(document(uid));
      }
      if (url.searchParams.getAll('mask.fieldPaths').includes('role') && uid === ACTOR) {
        state.actorChecks++; state.beforeActorCheck?.(state);
      }
      if (state.documentFailure) return json({ error: {} }, state.documentFailure);
      return json(document(uid));
    }
    if (url.href === 'https://oauth2.googleapis.com/token') {
      state.oauthCalls++;
      const form = new URLSearchParams(options.body); assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
      const [header, claims, signature] = form.get('assertion').split('.');
      assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url')), { alg: 'RS256', typ: 'JWT', kid: credential.private_key_id });
      assert.deepEqual(JSON.parse(Buffer.from(claims, 'base64url')), { iss: SA_EMAIL, scope: 'https://www.googleapis.com/auth/identitytoolkit', aud: 'https://oauth2.googleapis.com/token', iat: SECONDS, exp: SECONDS + 3600 });
      assert.ok(verify('RSA-SHA256', Buffer.from(`${header}.${claims}`), servicePair.publicKey, Buffer.from(signature, 'base64url')));
      if (state.oauthFailure) return json({ error: 'NEVER-RETURN-OAUTH-ERROR' }, 400);
      return json({ access_token: 'synthetic-oauth-token-NEVER-RETURN', token_type: 'Bearer', expires_in: 3600 });
    }
    assert.equal(url.origin, 'https://identitytoolkit.googleapis.com');
    assert.equal(options.headers.Authorization, 'Bearer synthetic-oauth-token-NEVER-RETURN');
    const body = JSON.parse(options.body);
    if (url.pathname.endsWith('accounts:lookup')) {
      assert.deepEqual(body, { localId: [TARGET] });
      state.privilegedLookups++; state.beforeLookup?.(state);
      if (state.missingTarget) return json({ users: [] });
      return json({ users: [state.target] });
    }
    assert.equal(url.pathname, `/v1/projects/${PROJECT}/accounts:update`);
    assert.ok(Object.keys(body).every(key => ['localId', 'email', 'displayName', 'emailVerified', 'validSince'].includes(key)));
    assert.equal(body.localId, TARGET);
    if (body.email) assert.equal(state.targetDoc.authValidAfter, Number(body.validSince), 'financial cutoff must be committed before changing Auth email');
    state.updates.push(body);
    if (state.duplicateEmail) return json({ error: { message: 'EMAIL_EXISTS' } }, 400);
    if (state.updateFailure) return json({ error: { message: 'NEVER-RETURN-PRIVATE-ERROR' } }, 500);
    Object.assign(state.target, body); state.afterUpdate?.(state);
    return json({ localId: TARGET, idToken: 'NEVER-RETURN-TARGET-TOKEN', refreshToken: 'NEVER-RETURN-REFRESH-TOKEN' });
  };
  const authenticate = createAuthenticator({ projectId: PROJECT, apiKey: 'synthetic-public-key', fetchImpl, now: () => NOW });
  const config = { projectId: PROJECT, serviceAccountEmail: SA_EMAIL, serviceAccountJson: JSON.stringify(credential), authenticate, fetchImpl, now: () => NOW, ...overrides.config };
  return { state, fetchImpl, service: createAdminAccounts(config), env: { FIREBASE_PROJECT_ID: PROJECT, FIREBASE_WEB_API_KEY: 'synthetic-public-key', ADMIN_AUTH_SERVICE_ACCOUNT_EMAIL: SA_EMAIL, FIREBASE_ADMIN_SERVICE_ACCOUNT: config.serviceAccountJson, ADMIN_ACCOUNTS_ENABLED: 'true' } };
}

test('updates the exact UID, un-verifies changed email, revokes sessions, reads back, and mirrors only name/email with actor token', async () => {
  const h = harness(); const result = await h.service.update(request(), input());
  assert.deepEqual(h.state.updates, [{ localId: TARGET, displayName: 'Novo nome', email: 'novo@example.test', emailVerified: false, validSince: String(SECONDS) }]);
  assert.deepEqual(result, { account: { uid: TARGET, email: 'novo@example.test', displayName: 'Novo nome', emailVerified: false, changed: true }, authUpdated: true, mirrorPending: false });
  assert.equal(h.state.privilegedLookups, 3); assert.equal(h.state.mirrorWrites.length, 2);
  assert.equal(h.state.targetDoc.role, 'member'); assert.equal(h.state.targetDoc.status, 'approved');
  assert.equal(h.state.targetDoc.authValidAfter, SECONDS);
  assert.doesNotMatch(JSON.stringify(result), /NEVER-RETURN/);
});
test('canonical lookup is read-only and returns a restricted account shape', async () => {
  const h = harness(); const result = await h.service.lookup(request(), { uid: TARGET });
  assert.equal(result.account.email, initialTarget.email); assert.equal(h.state.updates.length, 0); assert.equal(h.state.mirrorWrites.length, 0);
  assert.doesNotMatch(JSON.stringify(result), /NEVER-RETURN|provider|password/);
});
test('name-only edits do not revoke sessions or change email verification', async () => {
  const h = harness(); const body = { uid: TARGET, expectedEmail: initialTarget.email, displayName: 'Nome ajustado' };
  await h.service.update(request(), body);
  assert.deepEqual(h.state.updates, [{ localId: TARGET, displayName: 'Nome ajustado' }]);
  assert.equal(h.state.target.emailVerified, true);
  assert.equal(h.state.targetDoc.authValidAfter, undefined);
});
test('idempotent retry is read-only for Auth and repairs a failed Firestore mirror', async () => {
  const h = harness({ mirrorFailure: true }); const first = await h.service.update(request(), input());
  assert.equal(first.authUpdated, true); assert.equal(first.mirrorPending, true);
  h.state.mirrorFailure = false; h.state.target.emailVerified = true;
  const retry = await h.service.update(request(), input());
  assert.equal(retry.authUpdated, false); assert.equal(retry.mirrorPending, false); assert.equal(retry.account.emailVerified, true);
  assert.equal(h.state.updates.length, 1); assert.equal(h.state.oauthCalls, 1);
  assert.equal(h.state.targetDoc.authValidAfter, SECONDS);
});
test('wrong-project token, invalid signature, and expired token are rejected before privileged OAuth', async () => {
  for (const token of [jwt({ aud: 'wrong-project' }), jwt({ iss: 'https://securetoken.google.com/wrong-project' }), jwt({}, servicePair), jwt({ exp: SECONDS - 1 })]) {
    const h = harness(); await assert.rejects(h.service.update(request(token), input()), errorCode('unauthenticated')); assert.equal(h.state.oauthCalls, 0);
  }
});
test('live Auth record rejects disabled, unverified, and revoked administrator sessions', async () => {
  for (const [changes, code] of [[{ disabled: true }, 'unauthenticated'], [{ emailVerified: false }, 'permission-denied'], [{ validSince: String(SECONDS) }, 'unauthenticated']]) {
    const h = harness(); Object.assign(h.state.actor, changes);
    await assert.rejects(h.service.update(request(), input()), errorCode(code)); assert.equal(h.state.oauthCalls, 0);
  }
});
test('fresh current Firestore roles reject stale admin claims, suspended actors and admin targets', async () => {
  for (const change of [h => { h.state.actorDoc.role = 'member'; }, h => { h.state.actorDoc.status = 'pending'; }, h => { h.state.targetDoc.role = 'admin'; }]) {
    const h = harness(); change(h);
    await assert.rejects(h.service.update(request(), input()), errorCode('permission-denied')); assert.equal(h.state.updates.length, 0);
  }
});
test('identity operations require recent authentication including lookup', async () => {
  const h = harness(); const token = jwt({ auth_time: SECONDS - 601 }); h.state.actor.validSince = String(SECONDS - 3600);
  await assert.rejects(h.service.update(request(token), input()), errorCode('requires-recent-login'));
  await assert.rejects(h.service.lookup(request(token), { uid: TARGET }), errorCode('requires-recent-login'));
  assert.equal(h.state.oauthCalls, 0);
});
test('the administrator cannot modify their own identity through this API', async () => {
  const h = harness(); await assert.rejects(h.service.update(request(), input({ uid: ACTOR })), errorCode('permission-denied')); assert.equal(h.state.updates.length, 0);
});
test('lost admin permission during the request prevents the Auth update', async () => {
  const h = harness({ beforeActorCheck: state => { if (state.actorChecks === 2) state.actorDoc.role = 'member'; } });
  await assert.rejects(h.service.update(request(), input()), errorCode('permission-denied')); assert.equal(h.state.updates.length, 0);
});
test('stale email and concurrent pre-write changes never overwrite a changed account', async () => {
  const stale = harness(); await assert.rejects(stale.service.update(request(), input({ expectedEmail: 'stale@example.test' })), errorCode('conflict')); assert.equal(stale.state.updates.length, 0);
  const concurrent = harness({ beforeLookup: state => { if (state.privilegedLookups === 2) state.target.email = 'concurrent@example.test'; } });
  await assert.rejects(concurrent.service.update(request(), input()), errorCode('conflict')); assert.equal(concurrent.state.updates.length, 0);
});
test('readback mismatches and failed revocation never report confirmed success', async () => {
  for (const afterUpdate of [state => { state.target.email = 'different@example.test'; }, state => { state.target.emailVerified = true; }, state => { state.target.validSince = '1'; }]) {
    const h = harness({ afterUpdate }); await assert.rejects(h.service.update(request(), input()), errorCode('conflict')); assert.equal(h.state.mirrorWrites.length, 1);
    assert.equal(h.state.targetDoc.email, initialTarget.email); assert.equal(h.state.targetDoc.authValidAfter, SECONDS);
  }
});
test('duplicate-email errors preserve identity and clearly flag the previously committed session cutoff', async () => {
  const h = harness({ duplicateEmail: true });
  await assert.rejects(h.service.update(request(), input()), error => errorCode('email-already-in-use')(error) && error.targetReauthRequired === true);
  assert.equal(h.state.mirrorWrites.length, 1); assert.equal(h.state.targetDoc.email, initialTarget.email);
  assert.equal(h.state.target.email, initialTarget.email); assert.equal(h.state.targetDoc.authValidAfter, SECONDS);
});
test('unknown fields and malformed identities are rejected before any network request', async () => {
  const invalid = [null, [], {}, input({ uid: '../profiles' }), input({ uid: 'member/path' }), input({ email: 'bad' }), input({ email: ' x@example.test' }), input({ displayName: '' }), input({ displayName: 'x'.repeat(81) }), input({ displayName: 'name\nextra' }), input({ password: 'never' }), input({ role: 'admin' }), input({ disabled: false }), input({ customClaims: {} }), input({ expectedEmail: undefined })];
  for (const body of invalid) {
    const h = harness(); await assert.rejects(h.service.update(request(), body), errorCode('invalid-argument')); assert.equal(h.state.calls.length, 0);
  }
  assert.equal(validateInput(input({ email: 'NOVO@EXAMPLE.TEST' })).email, 'novo@example.test');
});
test('credential project, type, pinned email, endpoint and key must match before OAuth exchange', async () => {
  for (const changes of [{ project_id: 'wrong-project' }, { type: 'authorized_user', refresh_token: 'NEVER-USE-OPERATOR' }, { client_email: 'other@example.test' }, { token_uri: 'https://evil.example.test/token' }, { private_key: 'not-a-key' }]) {
    const h = harness({ config: { serviceAccountJson: JSON.stringify({ ...credential, ...changes }) } });
    await assert.rejects(h.service.update(request(), input()), errorCode('failed-precondition')); assert.equal(h.state.oauthCalls, 0);
  }
});
test('upstream errors are reduced to safe errors without secrets', async () => {
  for (const overrides of [{ oauthFailure: true }, { updateFailure: true }]) {
    const h = harness(overrides); await assert.rejects(h.service.update(request(), input()), errorCode('unavailable'));
  }
});
test('HTTP CORS, route, method, body-size and disabled-service checks happen without Google calls', async () => {
  const { createAdminAccountsWorker } = await import('../admin-accounts-worker.mjs');
  const cases = [
    [new Request('https://admin.example.test/api/admin/accounts/update', { method: 'POST', headers: { Origin: 'https://evil.example.test' } }), {}, 403],
    [new Request('https://admin.example.test/api/admin/accounts/update', { method: 'POST' }), {}, 403],
    [new Request('https://admin.example.test/api/admin/accounts/update?extra=1', { method: 'POST', headers: { Origin: ORIGIN } }), {}, 404],
    [new Request('https://admin.example.test/api/admin/accounts/update', { headers: { Origin: ORIGIN } }), {}, 405],
    [request(), { ADMIN_ACCOUNTS_ENABLED: 'false' }, 503],
    [new Request('https://admin.example.test/api/admin/accounts/update', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 'x'.repeat(2048) }) }), {}, 400],
    [new Request('https://admin.example.test/api/admin/accounts/update', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'text/plain' }, body: '{}' }), {}, 400],
  ];
  for (const [req, override, expected] of cases) {
    const h = harness(); const worker = createAdminAccountsWorker({ fetchImpl: h.fetchImpl, now: () => NOW });
    const result = await worker.fetch(req, { ...h.env, ...override }); assert.equal(result.status, expected); assert.equal(h.state.calls.length, 0);
    assert.equal(result.headers.get('cache-control'), 'no-store'); assert.doesNotMatch(await result.text(), /NEVER-RETURN/);
  }
});
test('HTTP entry point exposes canonical lookup/update and exact-origin preflight', async () => {
  const { createAdminAccountsWorker } = await import('../admin-accounts-worker.mjs');
  const h = harness(); const worker = createAdminAccountsWorker({ fetchImpl: h.fetchImpl, now: () => NOW });
  const preflight = await worker.fetch(new Request('https://admin.example.test/api/admin/accounts/lookup', { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Authorization, Content-Type' } }), h.env);
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), ORIGIN);
  const lookup = new Request('https://admin.example.test/api/admin/accounts/lookup', { method: 'POST', headers: { Origin: ORIGIN, Authorization: `Bearer ${jwt()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: TARGET }) });
  assert.equal((await worker.fetch(lookup, h.env)).status, 200);
  const response = await worker.fetch(request(), h.env); assert.equal(response.status, 200); assert.equal((await response.json()).authUpdated, true);
});
test('public Worker forwards only validated requests to the single private executor', async () => {
  const { createAdminAccountsWorker } = await import('../admin-accounts-worker.mjs');
  const h = harness(); const inner = createAdminAccountsWorker({ fetchImpl: h.fetchImpl, now: () => NOW, serialize: true });
  const root = createAdminAccountsWorker({ delegate: true }); let forwarded = 0;
  const env = { ...h.env, ADMIN_ACCOUNTS_EXECUTOR: {
    idFromName(name) { assert.equal(name, 'accounts'); return 'synthetic-object-id'; },
    get(id) { assert.equal(id, 'synthetic-object-id'); return { fetch(req) { forwarded++; return inner.fetch(req, h.env); } }; },
  } };
  const response = await root.fetch(request(), env); assert.equal(response.status, 200); assert.equal(forwarded, 1);
  const wrongOrigin = new Request('https://admin.example.test/api/admin/accounts/update', { method: 'POST', headers: { Origin: 'https://evil.example.test' }, body: '{}' });
  assert.equal((await root.fetch(wrongOrigin, env)).status, 403); assert.equal(forwarded, 1);
});
test('private executor repeats origin checks and does not persist user or credential data', async () => {
  const { AdminAccountsExecutor } = await import('../admin-accounts-worker.mjs');
  const h = harness(); const instance = new AdminAccountsExecutor({ storage: new Proxy({}, { get() { assert.fail('no storage access is permitted'); } }) }, h.env);
  const response = await instance.fetch(new Request('https://internal/api/admin/accounts/update', { method: 'POST', headers: { Origin: 'https://evil.example.test' }, body: '{}' }));
  assert.equal(response.status, 403);
});
test('executor serializes concurrent edits to the same UID and rejects the stale second change', async () => {
  const { createAdminAccountsWorker } = await import('../admin-accounts-worker.mjs');
  const h = harness(); const worker = createAdminAccountsWorker({ fetchImpl: h.fetchImpl, now: () => NOW, serialize: true });
  const first = worker.fetch(request(), h.env);
  const second = worker.fetch(request(jwt(), input({ email: 'second@example.test' })), h.env);
  const results = await Promise.all([first, second]);
  assert.deepEqual(results.map(result => result.status), [200, 409]); assert.equal(h.state.updates.length, 1);
  const retry = await worker.fetch(request(), h.env); assert.equal(retry.status, 200); assert.equal(h.state.updates.length, 1);
});
test('existing revocation cutoff is preserved on name-only updates', async () => {
  const h = harness(); h.state.targetDoc.authValidAfter = SECONDS - 100;
  await h.service.update(request(), { uid: TARGET, expectedEmail: initialTarget.email, displayName: 'Nome ajustado' });
  assert.equal(h.state.targetDoc.authValidAfter, SECONDS - 100);
  assert.equal(h.state.mirrorWrites[0].authValidAfter, undefined);
});
test('failed pre-cutoff prevents every Auth mutation', async () => {
  const h = harness({ cutoffFailure: true });
  await assert.rejects(h.service.update(request(), input()), errorCode('unavailable'));
  assert.equal(h.state.updates.length, 0); assert.equal(h.state.target.email, initialTarget.email); assert.equal(h.state.targetDoc.authValidAfter, undefined);
});
test('Auth failure after pre-cutoff never claims that identity changed', async () => {
  const { createAdminAccountsWorker } = await import('../admin-accounts-worker.mjs');
  const h = harness({ updateFailure: true }); const worker = createAdminAccountsWorker({ fetchImpl: h.fetchImpl, now: () => NOW });
  const response = await worker.fetch(request(), h.env); const result = await response.json();
  assert.equal(response.status, 503); assert.equal(result.error.targetReauthRequired, true); assert.equal(result.account, undefined);
  assert.equal(h.state.targetDoc.email, initialTarget.email); assert.equal(h.state.targetDoc.authValidAfter, SECONDS);
});
test('legacy mixed-case Auth addresses are normalized and a single-character name is supported', async () => {
  const h = harness(); h.state.target.email = 'Member@Example.Test'; h.state.targetDoc.email = 'Member@Example.Test';
  const before = await h.service.lookup(request(), { uid: TARGET }); assert.equal(before.account.email, 'member@example.test');
  const result = await h.service.update(request(), input({ displayName: 'J' }));
  assert.equal(result.account.displayName, 'J'); assert.equal(result.mirrorPending, false);
  assert.deepEqual(h.state.mirrorWrites[0], { authValidAfter: { integerValue: String(SECONDS) }, email: { stringValue: 'member@example.test' } });
});
test('Miniflare runs the real root-to-SQLite-DO flow with signed actor and service-account JWTs', { timeout: 60000 }, async () => {
  const path = require('node:path'); const esbuild = require('esbuild');
  const { Miniflare, Log, LogLevel, convertV4MiniflareOptions } = require('miniflare');
  const h = harness();
  const build = await esbuild.build({ entryPoints: [path.resolve(__dirname, '../admin-accounts-worker.mjs')], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', logLevel: 'silent', banner: { js: `Date.now = () => ${NOW};` } });
  const mf = new Miniflare(convertV4MiniflareOptions({ cf: false, log: new Log(LogLevel.ERROR), modules: true, script: build.outputFiles[0].text,
    compatibilityDate: '2026-10-01', bindings: h.env,
    durableObjects: { ADMIN_ACCOUNTS_EXECUTOR: { className: 'AdminAccountsExecutor', useSQLite: true } },
    outboundService: async req => {
      const headers = Object.fromEntries(req.headers);
      if (req.headers.has('authorization')) headers.Authorization = req.headers.get('authorization');
      return h.fetchImpl(req.url, { method: req.method, headers, body: req.method === 'POST' || req.method === 'PATCH' ? await req.text() : undefined, redirect: 'manual', cache: 'no-store', signal: new AbortController().signal });
    },
  }));
  try {
    const response = await mf.dispatchFetch('https://admin.example.test/api/admin/accounts/update', { method: 'POST', headers: { Origin: ORIGIN, Authorization: `Bearer ${jwt()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(input()) });
    assert.equal(response.status, 200); const result = await response.json(); assert.equal(result.authUpdated, true); assert.equal(result.mirrorPending, false);
    assert.equal(h.state.targetDoc.authValidAfter, SECONDS); assert.equal(h.state.updates.length, 1);
    const anonymous = await mf.dispatchFetch('https://admin.example.test/api/admin/accounts/lookup', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: TARGET }) });
    assert.equal(anonymous.status, 401); assert.equal(h.state.updates.length, 1);
  } finally { await mf.dispose(); }
});
