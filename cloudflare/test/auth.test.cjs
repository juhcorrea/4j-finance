'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, sign } = require('node:crypto');
const { createAuthenticator, AuthError } = require('../auth.cjs');
const projectId = 'demo-4j-pix';
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const rotated = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...pair.publicKey.export({ format: 'jwk' }), kid: 'synthetic-key', alg: 'RS256', use: 'sig' };
const rotatedJwk = { ...rotated.publicKey.export({ format: 'jwk' }), kid: 'rotated-key', alg: 'RS256', use: 'sig' };
const initialTime = Date.parse('2026-10-15T12:00:00Z');
const initialSeconds = initialTime / 1000;
const baseClaims = { iss: `https://securetoken.google.com/${projectId}`, aud: projectId, sub: 'synthetic-alice', iat: initialSeconds - 10, auth_time: initialSeconds - 20, exp: initialSeconds + 3600 };
const baseAccount = { localId: 'synthetic-alice', email: 'alice@testuser.com', emailVerified: true, disabled: false, validSince: String(initialSeconds - 30) };
function jwt(claims = {}, header = {}, privateKey = pair.privateKey) {
  const a = Buffer.from(JSON.stringify({ alg: 'RS256', kid: jwk.kid, typ: 'JWT', ...header })).toString('base64url');
  const b = Buffer.from(JSON.stringify({ ...baseClaims, ...claims })).toString('base64url');
  return `${a}.${b}.${sign('RSA-SHA256', Buffer.from(`${a}.${b}`), privateKey).toString('base64url')}`;
}
function request(token = jwt()) { return new Request('https://billing.invalid/api/status', { headers: { Authorization: `Bearer ${token}` } }); }
function json(value, status = 200, headers = {}) { return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', ...headers } }); }
function harness(overrides = {}) {
  const calls = [];
  let time = initialTime;
  const state = { account: { ...baseAccount }, status: 'approved', keys: [jwk], maxAge: 3600, ...overrides };
  const auth = createAuthenticator({ projectId, apiKey: 'synthetic-api-key', now: () => time, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.redirect, 'manual');
    assert.ok(options.signal instanceof AbortSignal);
    if (state.networkError) throw new Error('private-provider-body-token-should-not-leak');
    if (url === 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com') {
      return json({ keys: state.keys }, state.keysStatus || 200, { 'cache-control': `public, max-age=${state.maxAge}` });
    }
    if (url === 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=synthetic-api-key') {
      assert.equal(options.method, 'POST');
      assert.deepEqual(Object.keys(JSON.parse(options.body)), ['idToken']);
      return json(state.lookupBody || { users: [state.account] }, state.lookupStatus || 200);
    }
    const expectedUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/synthetic-alice?mask.fieldPaths=status`;
    assert.equal(url, expectedUrl, 'only the authenticated own status document is accessed');
    assert.match(options.headers.Authorization, /^Bearer /);
    return json(state.profileBody || { name: `projects/${projectId}/databases/(default)/documents/users/synthetic-alice`, fields: { status: { stringValue: state.status } } }, state.profileStatus || 200);
  } });
  return { auth, calls, state, advance: ms => { time += ms; } };
}
const errorCode = code => error => error instanceof AuthError && error.code === code;

test('verified current account and own approved profile permit purchase without Admin SDK', async () => {
  const h = harness(); const token = jwt();
  assert.deepEqual(await h.auth(request(token), { purchase: true }), { uid: 'synthetic-alice', email: 'alice@testuser.com', emailVerified: true, active: true });
  assert.equal(h.calls.length, 3);
  assert.equal(JSON.parse(h.calls[1].options.body).idToken, token);
  assert.equal(h.calls[2].options.headers.Authorization, `Bearer ${token}`);
});
test('authorization is required before any Google request', async () => {
  const h = harness();
  await assert.rejects(h.auth(new Request('https://billing.invalid')), errorCode('unauthenticated'));
  assert.equal(h.calls.length, 0);
});
for (const [label, claims, header] of [
  ['wrong audience', { aud: 'another-project' }], ['wrong issuer', { iss: 'https://attacker.invalid' }],
  ['empty uid', { sub: '' }], ['path uid', { sub: '../another-user' }], ['expired', { exp: initialSeconds }],
  ['future issued', { iat: initialSeconds + 1 }], ['future auth', { auth_time: initialSeconds + 1 }],
  ['missing auth_time', { auth_time: undefined }], ['string exp', { exp: String(initialSeconds + 300) }],
  ['wrong algorithm', {}, { alg: 'HS256' }], ['unsigned emulator', {}, { alg: 'none' }],
  ['critical extension', {}, { crit: ['unhandled'] }],
]) test('rejects ' + label + ' before account data lookup', async () => {
  const h = harness(); await assert.rejects(h.auth(request(jwt(claims, header))), errorCode('unauthenticated'));
  assert.equal(h.calls.length, 0);
});
test('a forged RSA signature cannot invoke user lookup', async () => {
  const h = harness(); await assert.rejects(h.auth(request(jwt({}, {}, rotated.privateKey))), errorCode('unauthenticated'));
  assert.equal(h.calls.length, 1);
});
for (const [label, patch, code] of [
  ['different uid', { localId: 'synthetic-bob' }, 'unauthenticated'],
  ['disabled', { disabled: true }, 'unauthenticated'],
  ['revoked session even with recently refreshed iat', { validSince: String(initialSeconds - 15) }, 'unauthenticated'],
  ['malformed disabled', { disabled: 'false' }, 'unavailable'],
  ['missing revocation boundary', { validSince: undefined }, 'unavailable'],
  ['malformed revocation boundary', { validSince: 'invalid' }, 'unavailable'],
]) test('rejects current account ' + label, async () => {
  const h = harness({ account: { ...baseAccount, ...patch } });
  await assert.rejects(h.auth(request()), errorCode(code)); assert.equal(h.calls.length, 2);
});
test('auth_time equal to validSince remains valid; omitted disabled uses API false default', async () => {
  const h = harness({ account: { ...baseAccount, disabled: undefined, validSince: String(baseClaims.auth_time) } });
  assert.equal((await h.auth(request())).uid, 'synthetic-alice');
});
test('current unverified email blocks purchase despite signed historical email_verified', async () => {
  const h = harness({ account: { ...baseAccount, emailVerified: false } });
  await assert.rejects(h.auth(request(jwt({ email_verified: true })), { purchase: true }), errorCode('permission-denied'));
  assert.equal((await h.auth(request())).emailVerified, false);
});
test('inactive user can read own status but cannot purchase', async () => {
  const h = harness({ status: 'pending' });
  assert.equal((await h.auth(request())).active, false);
  await assert.rejects(h.auth(request(), { purchase: true }), errorCode('permission-denied'));
});
test('missing profile does not grant active status', async () => {
  const h = harness({ profileStatus: 404, profileBody: { error: { status: 'NOT_FOUND' } } });
  assert.equal((await h.auth(request())).active, false);
  await assert.rejects(h.auth(request(), { purchase: true }), errorCode('permission-denied'));
});
test('a substituted Firestore user document is rejected', async () => {
  const h = harness({ profileBody: { name: `projects/${projectId}/databases/(default)/documents/users/synthetic-bob`, fields: { status: { stringValue: 'approved' } } } });
  await assert.rejects(h.auth(request()), errorCode('unavailable'));
});
for (const [status, code] of [[401, 'unauthenticated'], [403, 'permission-denied'], [429, 'unavailable'], [503, 'unavailable']]) test('Firestore HTTP ' + status + ' fails closed', async () => {
  const h = harness({ profileStatus: status, profileBody: { error: {} } });
  await assert.rejects(h.auth(request()), errorCode(code));
});
test('lookup disabled error fails closed without exposing provider details', async () => {
  const h = harness({ lookupStatus: 400, lookupBody: { error: { message: 'USER_DISABLED' } } });
  await assert.rejects(h.auth(request()), errorCode('unauthenticated'));
});
test('lookup quota failure is unavailable', async () => {
  const h = harness({ lookupStatus: 429, lookupBody: { error: { message: 'TOO_MANY_ATTEMPTS_TRY_LATER' } } });
  await assert.rejects(h.auth(request()), errorCode('unavailable'));
});
test('public keys are cached; account state is refreshed for each request', async () => {
  const h = harness(); await h.auth(request()); await h.auth(request());
  assert.equal(h.calls.filter(call => call.url.includes('/jwk/')).length, 1);
  assert.equal(h.calls.filter(call => call.url.includes('accounts:lookup')).length, 2);
  h.state.account.disabled = true; await assert.rejects(h.auth(request()), errorCode('unauthenticated'));
});
test('concurrent requests share one public key fetch', async () => {
  const h = harness(); await Promise.all([h.auth(request()), h.auth(request()), h.auth(request())]);
  assert.equal(h.calls.filter(call => call.url.includes('/jwk/')).length, 1);
});
test('unknown kid refresh has a shared cooldown and supports rotation after it', async () => {
  const h = harness(); await h.auth(request());
  for (let i = 0; i < 5; i++) await assert.rejects(h.auth(request(jwt({}, { kid: 'unknown-' + i }))), errorCode('unauthenticated'));
  assert.equal(h.calls.filter(call => call.url.includes('/jwk/')).length, 1);
  h.advance(60001); h.state.keys = [jwk, rotatedJwk];
  assert.equal((await h.auth(request(jwt({}, { kid: rotatedJwk.kid }, rotated.privateKey)))).uid, 'synthetic-alice');
  assert.equal(h.calls.filter(call => call.url.includes('/jwk/')).length, 2);
});
test('expired cached key cannot be used during refresh cooldown', async () => {
  const h = harness({ maxAge: 1 }); await h.auth(request()); h.advance(2000);
  await assert.rejects(h.auth(request()), errorCode('unavailable'));
});
test('public key cache TTL is capped even when Google sends a very large max-age', async () => {
  const h = harness({ maxAge: 999999 }); await h.auth(request()); h.advance(3600001);
  await h.auth(request(jwt({ iat: initialSeconds + 3600, exp: initialSeconds + 7200 })));
  assert.equal(h.calls.filter(call => call.url.includes('/jwk/')).length, 2);
});
test('network errors never expose token, API key or provider error content', async () => {
  const h = harness({ networkError: true });
  await assert.rejects(h.auth(request()), error => errorCode('unavailable')(error) && !/private-provider|synthetic-api-key|Bearer/.test(error.message));
});
for (const [stage, overrides, count] of [
  ['public keys', { keysStatus: 302 }, 1],
  ['account lookup', { lookupStatus: 307 }, 2],
  ['own profile', { profileStatus: 308 }, 3],
]) test('Google redirect is never followed at ' + stage, async () => {
  const h = harness(overrides);
  await assert.rejects(h.auth(request()), errorCode('unavailable'));
  assert.equal(h.calls.length, count);
  assert.ok(h.calls.every(call => call.options.redirect === 'manual'));
});
test('invalid configuration fails closed', () => {
  assert.throws(() => createAuthenticator({ projectId: '../escape', apiKey: 'x' }), errorCode('unavailable'));
});

test('unchanged freshly fetched public keys reuse imports but still verify every token and current account', async t => {
  const subtle = globalThis.crypto.subtle;
  const importKey = subtle.importKey;
  const verify = subtle.verify;
  const imports = t.mock.method(subtle, 'importKey', function (...args) { return importKey.apply(this, args); });
  const verifications = t.mock.method(subtle, 'verify', function (...args) { return verify.apply(this, args); });
  const h = harness({ keys: [jwk, rotatedJwk], maxAge: 60 });
  await h.auth(request(), { purchase: true });
  assert.equal(imports.mock.callCount(), 2);
  h.advance(60001);
  await h.auth(request(), { purchase: true });
  assert.equal(h.calls.filter(call => call.url.includes('/jwk/')).length, 2, 'fresh Google response is required after TTL');
  assert.equal(imports.mock.callCount(), 2, 'identical public keys need no second import');
  assert.equal(verifications.mock.callCount(), 2, 'signed tokens are never cached');
  assert.equal(h.calls.filter(call => call.url.includes('accounts:lookup')).length, 2);
  assert.equal(h.calls.filter(call => call.url.includes('firestore.googleapis.com')).length, 2);
});

test('changed key material under the same kid invalidates the previously imported key', async t => {
  const subtle = globalThis.crypto.subtle;
  const original = subtle.importKey;
  const imports = t.mock.method(subtle, 'importKey', function (...args) { return original.apply(this, args); });
  const h = harness({ maxAge: 60 });
  await h.auth(request());
  h.advance(60001);
  h.state.keys = [{ ...rotatedJwk, kid: jwk.kid }];
  await assert.rejects(h.auth(request()), errorCode('unauthenticated'));
  assert.equal(imports.mock.callCount(), 2);
  assert.equal(h.calls.filter(call => call.url.includes('accounts:lookup')).length, 1);
  assert.equal((await h.auth(request(jwt({}, {}, rotated.privateKey)))).uid, 'synthetic-alice');
});

test('a key absent from the refreshed JWKS is removed even when it was already imported', async () => {
  const h = harness({ maxAge: 60 });
  await h.auth(request());
  h.advance(60001);
  h.state.keys = [rotatedJwk];
  await assert.rejects(h.auth(request()), errorCode('unauthenticated'));
  assert.equal(h.calls.filter(call => call.url.includes('accounts:lookup')).length, 1);
  assert.equal((await h.auth(request(jwt({}, { kid: rotatedJwk.kid }, rotated.privateKey)))).uid, 'synthetic-alice');
});

test('changed JWK usage metadata cannot reuse a previously imported verify key', async () => {
  const h = harness({ maxAge: 60 });
  await h.auth(request());
  h.advance(60001);
  h.state.keys = [{ ...jwk, key_ops: ['sign'] }];
  await assert.rejects(h.auth(request()), errorCode('unavailable'));
  assert.equal(h.calls.filter(call => call.url.includes('accounts:lookup')).length, 1);
});

test('failed or duplicate refreshed key sets cannot extend an expired public-key cache', async () => {
  for (const patch of [{ keys: [jwk, jwk] }, { keysStatus: 503 }]) {
    const h = harness({ maxAge: 60 });
    await h.auth(request());
    h.advance(60001);
    Object.assign(h.state, patch);
    await assert.rejects(h.auth(request()), errorCode('unavailable'));
    await assert.rejects(h.auth(request()), errorCode('unavailable'));
    assert.equal(h.calls.filter(call => call.url.includes('accounts:lookup')).length, 1);
  }
});

test('public-key reuse never caches account revocation or profile approval', async () => {
  const revoked = harness();
  await revoked.auth(request(), { purchase: true });
  revoked.state.account.validSince = String(initialSeconds - 15);
  await assert.rejects(revoked.auth(request(), { purchase: true }), errorCode('unauthenticated'));
  const inactive = harness();
  await inactive.auth(request(), { purchase: true });
  inactive.state.status = 'pending';
  await assert.rejects(inactive.auth(request(), { purchase: true }), errorCode('permission-denied'));
});

test('shared UTF-8 codecs preserve Unicode and recover safely after a malformed segment', async () => {
  const h = harness();
  const invalidUtf8 = Buffer.from([0xff]).toString('base64url');
  await assert.rejects(h.auth(request(invalidUtf8 + '.e30.AAAA')), errorCode('unauthenticated'));
  assert.equal(h.calls.length, 0);
  assert.equal((await h.auth(request(jwt({ note: 'ação segura 🔒' })))).uid, 'synthetic-alice');
});

test('base64 conversion keeps malformed segments and oversized tokens rejected before network access', async () => {
  for (const token of ['A.e30.AAAA', 'e30.A.AAAA', 'e30.e30.A', 'a'.repeat(16385)]) {
    const h = harness();
    await assert.rejects(h.auth(request(token)), errorCode('unauthenticated'));
    assert.equal(h.calls.length, 0);
  }
});
