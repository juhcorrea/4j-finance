'use strict';

// Dedicated Auth-only service account. Never use a Firebase CLI/operator refresh token.
// IAM: firebaseauth.users.get + firebaseauth.users.update; NO Firestore permissions.
// API contracts: https://cloud.google.com/identity-platform/docs/reference/rest/v1/projects.accounts/update
// OAuth: https://developers.google.com/identity/protocols/oauth2/service-account
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_SCOPE = 'https://www.googleapis.com/auth/identitytoolkit';
const encoder = new TextEncoder();
const MAX_RESPONSE_BYTES = 131072;
const RECENT_AUTH_SECONDS = 600;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const MESSAGES = Object.freeze({
  'invalid-argument': 'Confira o nome e o e-mail informados.',
  unauthenticated: 'Entre novamente na sua conta.',
  'permission-denied': 'Esta conta não pode realizar essa alteração.',
  'requires-recent-login': 'Confirme sua senha novamente para alterar a conta.',
  'failed-precondition': 'A edição de contas ainda não está disponível.',
  'not-found': 'A conta não está mais disponível.',
  conflict: 'A conta mudou. Atualize a lista antes de continuar.',
  'email-already-in-use': 'Esse e-mail já pertence a outra conta.',
  unavailable: 'Não foi possível confirmar a alteração. Atualize a lista antes de tentar novamente.',
});
class AdminAccountError extends Error {
  constructor(code) { super(MESSAGES[code] || MESSAGES.unavailable); this.name = 'AdminAccountError'; this.code = code in MESSAGES ? code : 'unavailable'; }
}
const fail = code => { throw new AdminAccountError(code); };
function email(value) {
  if (typeof value !== 'string' || value.length > 254 || value !== value.trim()
    || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/.test(value)
    || value.includes('..')) fail('invalid-argument');
  return value.toLowerCase();
}
function validateInput(input) {
  if (!object(input) || Object.keys(input).some(key => !['uid', 'expectedEmail', 'email', 'displayName'].includes(key))) fail('invalid-argument');
  if (typeof input.uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(input.uid)) fail('invalid-argument');
  const result = { uid: input.uid, expectedEmail: email(input.expectedEmail) };
  if (Object.hasOwn(input, 'email')) result.email = email(input.email);
  if (Object.hasOwn(input, 'displayName')) {
    if (typeof input.displayName !== 'string' || input.displayName !== input.displayName.trim()
      || input.displayName.length < 1 || input.displayName.length > 80 || /[\x00-\x1f\x7f]/.test(input.displayName)) fail('invalid-argument');
    result.displayName = input.displayName;
  }
  if (!Object.hasOwn(result, 'email') && !Object.hasOwn(result, 'displayName')) fail('invalid-argument');
  return result;
}
function base64url(bytes) {
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
const segment = value => base64url(encoder.encode(JSON.stringify(value)));
function authenticatedClaims(request) {
  // Called ONLY after the existing authenticator verifies the signature, audience,
  // issuer, expiry, live Auth record, revocation cutoff and current account status.
  try {
    const token = request.headers.get('authorization').slice(7);
    const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(encoded));
    if (!object(claims)) fail('unauthenticated');
    return { token, claims };
  } catch { fail('unauthenticated'); }
}
async function boundedJson(response) {
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES || !response.body) fail('unavailable');
  const reader = response.body.getReader(); const chunks = []; let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) { await reader.cancel(); fail('unavailable'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!object(result)) fail('unavailable'); return result;
  } catch { fail('unavailable'); }
  finally { reader.releaseLock(); }
}
function createAdminAccounts({ projectId, serviceAccountEmail, serviceAccountJson, authenticate, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  if (typeof projectId !== 'string' || !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId)
    || typeof authenticate !== 'function' || typeof fetchImpl !== 'function' || typeof now !== 'function') fail('failed-precondition');
  let credential; let signingKey; let accessToken; let tokenExpires = 0; let tokenPromise;
  async function google(url, options = {}) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetchImpl(url, { ...options, redirect: 'manual', signal: controller.signal, cache: 'no-store' });
      if (response.status >= 300 && response.status < 400) fail('unavailable');
      return { response, data: await boundedJson(response) };
    } catch (error) { if (error instanceof AdminAccountError) throw error; fail('unavailable'); }
    finally { clearTimeout(timer); }
  }
  function getCredential() {
    if (credential) return credential;
    try {
      if (typeof serviceAccountJson !== 'string' || serviceAccountJson.length > 16384) fail('failed-precondition');
      const value = JSON.parse(serviceAccountJson);
      if (!object(value) || value.type !== 'service_account' || value.project_id !== projectId
        || typeof serviceAccountEmail !== 'string' || value.client_email !== serviceAccountEmail
        || !new RegExp(`^[a-z][a-z0-9-]{4,28}[a-z0-9]@${projectId}\\.iam\\.gserviceaccount\\.com$`).test(serviceAccountEmail)
        || (value.token_uri !== undefined && value.token_uri !== TOKEN_URL)
        || typeof value.private_key_id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value.private_key_id)
        || typeof value.private_key !== 'string' || value.private_key.length > 8192
        || !/^-----BEGIN PRIVATE KEY-----\r?\n[\sA-Za-z0-9+/=]+-----END PRIVATE KEY-----\s*$/.test(value.private_key)) fail('failed-precondition');
      credential = value; return credential;
    } catch { fail('failed-precondition'); }
  }
  async function oauth() {
    if (accessToken && now() < tokenExpires - 60000) return accessToken;
    if (tokenPromise) return tokenPromise;
    tokenPromise = (async () => {
      const value = getCredential();
      try {
        if (!signingKey) {
          const raw = atob(value.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, ''));
          const bytes = Uint8Array.from(raw, char => char.charCodeAt(0));
          signingKey = await globalThis.crypto.subtle.importKey('pkcs8', bytes, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
          if (signingKey.algorithm.modulusLength < 2048) fail('failed-precondition');
        }
        const issued = Math.floor(now() / 1000);
        const content = `${segment({ alg: 'RS256', typ: 'JWT', kid: value.private_key_id })}.${segment({ iss: value.client_email, scope: AUTH_SCOPE, aud: TOKEN_URL, iat: issued, exp: issued + 3600 })}`;
        const signed = base64url(new Uint8Array(await globalThis.crypto.subtle.sign('RSASSA-PKCS1-v1_5', signingKey, encoder.encode(content))));
        const { response, data } = await google(TOKEN_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${content}.${signed}` }).toString(),
        });
        if (!response.ok || data.token_type !== 'Bearer' || typeof data.access_token !== 'string' || !data.access_token
          || data.access_token.length > 8192 || /[\s\r\n]/.test(data.access_token)
          || !Number.isInteger(data.expires_in) || data.expires_in < 120 || data.expires_in > 3600) fail('unavailable');
        accessToken = data.access_token; tokenExpires = now() + data.expires_in * 1000; return accessToken;
      } catch (error) { if (error instanceof AdminAccountError) throw error; fail('failed-precondition'); }
    })();
    try { return await tokenPromise; } finally { tokenPromise = undefined; }
  }
  async function userDocument(uid, token) {
    const name = `projects/${projectId}/databases/(default)/documents/users/${uid}`;
    const mask = new URLSearchParams();
    for (const field of ['role', 'status', 'email', 'name', 'authValidAfter']) mask.append('mask.fieldPaths', field);
    const { response, data } = await google(`https://firestore.googleapis.com/v1/${name}?${mask}`, { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 401) fail('unauthenticated');
    if (response.status === 403) fail('permission-denied');
    if (response.status === 404) fail('not-found');
    if (!response.ok || data.name !== name || !object(data.fields)) fail('unavailable');
    const cutoff = data.fields.authValidAfter;
    if (cutoff !== undefined && (typeof cutoff.integerValue !== 'string' || !/^\d+$/.test(cutoff.integerValue) || !Number.isSafeInteger(Number(cutoff.integerValue)))) fail('unavailable');
    return { role: data.fields.role?.stringValue, status: data.fields.status?.stringValue,
      email: data.fields.email?.stringValue, name: data.fields.name?.stringValue, updateTime: data.updateTime,
      authValidAfter: cutoff === undefined ? undefined : Number(cutoff.integerValue) };
  }
  async function currentScope(actorUid, targetUid, token) {
    const actor = await userDocument(actorUid, token);
    if (actor.role !== 'admin' || actor.status !== 'approved') fail('permission-denied');
    const target = await userDocument(targetUid, token);
    if (target.role !== 'member' || !['approved', 'pending'].includes(target.status)) fail('permission-denied');
    return target;
  }
  async function authApi(action, body, token) {
    const { response, data } = await google(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:${action}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!response.ok) {
      const reason = data.error?.message?.split(' : ')[0];
      if (reason === 'EMAIL_EXISTS') fail('email-already-in-use');
      if (reason === 'USER_NOT_FOUND') fail('not-found');
      if (reason === 'INVALID_EMAIL' || reason === 'INVALID_DISPLAY_NAME') fail('invalid-argument');
      fail('unavailable');
    }
    return data;
  }
  async function lookup(uid, token) {
    const data = await authApi('lookup', { localId: [uid] }, token);
    if (!data.users || (Array.isArray(data.users) && data.users.length === 0)) fail('not-found');
    if (!Array.isArray(data.users) || data.users.length !== 1 || !object(data.users[0])) fail('unavailable');
    const account = data.users[0];
    if (account.localId !== uid || typeof account.email !== 'string' || account.disabled === true) fail('conflict');
    if (account.disabled !== undefined && typeof account.disabled !== 'boolean') fail('unavailable');
    return account;
  }
  async function authorize(request, targetUid) {
    let actor;
    try { actor = await authenticate(request, { purchase: true }); }
    catch (error) { fail(error?.code in MESSAGES ? error.code : 'unauthenticated'); }
    if (!actor?.uid || !actor.emailVerified || !actor.active || actor.uid === targetUid) fail('permission-denied');
    const { token, claims } = authenticatedClaims(request); const seconds = Math.floor(now() / 1000);
    if (claims.sub !== actor.uid || claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}`) fail('unauthenticated');
    if (!Number.isSafeInteger(claims.auth_time) || claims.auth_time > seconds || seconds - claims.auth_time > RECENT_AUTH_SECONDS) fail('requires-recent-login');
    await currentScope(actor.uid, targetUid, token);
    return { actor, token, seconds };
  }
  async function patchDocument(uid, fields, updateTime, token) {
    if (typeof updateTime !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(updateTime)) fail('unavailable');
    const name = `projects/${projectId}/databases/(default)/documents/users/${uid}`;
    const query = new URLSearchParams({ 'currentDocument.updateTime': updateTime });
    for (const key of Object.keys(fields)) query.append('updateMask.fieldPaths', key);
    const { response, data } = await google(`https://firestore.googleapis.com/v1/${name}?${query}`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }),
    });
    if (response.status === 409 || response.status === 412) fail('conflict');
    if (!response.ok || data.name !== name || Object.keys(fields).some(key => JSON.stringify(data.fields?.[key]) !== JSON.stringify(fields[key]))) fail('unavailable');
  }
  async function cutOffOldIdentity(account, actorUid, token) {
    const target = await currentScope(actorUid, account.localId, token);
    const cutoff = Math.floor(now() / 1000);
    if ((target.authValidAfter || 0) > cutoff) fail('conflict');
    const fields = {};
    if (target.authValidAfter !== cutoff) fields.authValidAfter = { integerValue: String(cutoff) };
    // A legacy mixed-case/stale display address is normalized to the CURRENT
    // Auth email, never to the requested new identity before Auth confirms it.
    const currentEmail = email(account.email);
    if (target.email !== currentEmail) fields.email = { stringValue: currentEmail };
    if (Object.keys(fields).length) await patchDocument(account.localId, fields, target.updateTime, token);
    return cutoff;
  }
  async function mirror(account, input, actorUid, token, emailChanged = false) {
    // Uses the authenticated administrator's Firestore rules, NOT service-account
    // privileges. The service account cannot read or write financial documents.
    try {
      const target = await currentScope(actorUid, account.localId, token);
      const fields = {};
      const currentEmail = email(account.email);
      if (input.email !== undefined && target.email !== currentEmail) fields.email = { stringValue: currentEmail };
      if (input.displayName !== undefined && target.name !== account.displayName) fields.name = { stringValue: account.displayName };
      // The rules check this cutoff on financial access so old signed ID tokens
      // cannot continue using a previous email after the mirror commits.
      const repairCutoff = input.email !== undefined && (emailChanged || target.email !== currentEmail
        || input.expectedEmail !== currentEmail || target.authValidAfter !== undefined);
      if (repairCutoff) {
        if (!/^\d+$/.test(account.validSince || '') || !Number.isSafeInteger(Number(account.validSince))) return true;
        const cutoff = Math.max(Number(account.validSince), target.authValidAfter || 0);
        if (cutoff > Math.floor(now() / 1000)) return true;
        if (target.authValidAfter !== cutoff) fields.authValidAfter = { integerValue: String(cutoff) };
      }
      const keys = Object.keys(fields);
      if (!keys.length) return false;
      await patchDocument(account.localId, fields, target.updateTime, token);
      return false;
    } catch { return true; }
  }
  async function update(request, rawInput) {
    const input = validateInput(rawInput);
    const { actor, token } = await authorize(request, input.uid);
    const privilegedToken = await oauth();
    const before = await lookup(input.uid, privilegedToken);
    const beforeEmail = email(before.email);
    const matches = account => (!input.email || email(account.email) === input.email)
      && (input.displayName === undefined || account.displayName === input.displayName);
    // Retrying an already-completed update is a read-only success. A verified new
    // email is never marked unverified again, and refresh tokens are not revoked twice.
    if (matches(before)) return { account: result(before, false), authUpdated: false, mirrorPending: await mirror(before, input, actor.uid, token) };
    if (beforeEmail !== input.expectedEmail) fail('conflict');
    // Recheck live roles immediately before writing; never trust roles from the UI.
    await currentScope(actor.uid, input.uid, token);
    const latest = await lookup(input.uid, privilegedToken);
    if (email(latest.email) !== beforeEmail || latest.displayName !== before.displayName || latest.validSince !== before.validSince) fail('conflict');
    const patch = { localId: input.uid };
    if (input.displayName !== undefined && input.displayName !== before.displayName) patch.displayName = input.displayName;
    if (input.email && input.email !== beforeEmail) {
      patch.email = input.email; patch.emailVerified = false;
      // Financial rules reject the old identity BEFORE Auth can change it. If
      // this guarded write fails, Auth is untouched. A later Auth failure may
      // require a new login but never leaves old identity tokens authorized.
      patch.validSince = String(await cutOffOldIdentity(before, actor.uid, token));
    }
    let after;
    try {
      await authApi('update', patch, privilegedToken);
      after = await lookup(input.uid, privilegedToken);
      if (!matches(after) || (patch.email && (after.emailVerified !== false || !/^\d+$/.test(after.validSince || '') || Number(after.validSince) < Number(patch.validSince)))) fail('conflict');
    } catch (error) {
      const safe = error instanceof AdminAccountError ? error : new AdminAccountError('unavailable');
      if (patch.email) safe.targetReauthRequired = true;
      throw safe;
    }
    return { account: result(after, true), authUpdated: true, mirrorPending: await mirror(after, input, actor.uid, token, !!patch.email) };
  }
  function result(account, changed) {
    // Never return providerData, tokens, password hashes, or Google error bodies.
    return { uid: account.localId, email: email(account.email), displayName: account.displayName || '', emailVerified: account.emailVerified === true, changed };
  }
  async function inspect(request, input) {
    if (!object(input) || Object.keys(input).length !== 1 || typeof input.uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(input.uid)) fail('invalid-argument');
    await authorize(request, input.uid);
    const account = await lookup(input.uid, await oauth());
    return { account: result(account, false) };
  }
  return { update, lookup: inspect };
}

module.exports = { createAdminAccounts, AdminAccountError, validateInput };
