'use strict';

// Public Google signing keys only; no Admin SDK, service-account credential or user cache.
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const LOOKUP_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup';
const MAX_TOKEN_LENGTH = 16384;
const MAX_RESPONSE_LENGTH = 131072;
const KEY_REFRESH_COOLDOWN_MS = 60000;
const MAX_KEY_TTL_MS = 3600000;

class AuthError extends Error {
  constructor(code) {
    super(code === 'unavailable' ? 'Não foi possível conferir a conta agora.' : 'A conta precisa ser autenticada e autorizada.');
    this.name = 'AuthError';
    this.code = code;
  }
}
const fail = code => { throw new AuthError(code); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const seconds = value => Number.isSafeInteger(value) && value >= 0;

function bytes(segment) {
  if (!segment || !/^[A-Za-z0-9_-]+$/.test(segment)) fail('unauthenticated');
  try {
    const binary = atob(segment.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(binary, char => char.charCodeAt(0));
  } catch { fail('unauthenticated'); }
}
function jsonSegment(segment) {
  try {
    const result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes(segment)));
    if (!object(result)) fail('unauthenticated');
    return result;
  } catch { fail('unauthenticated'); }
}

function createAuthenticator({ projectId, apiKey, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  if (typeof projectId !== 'string' || !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId)
    || typeof apiKey !== 'string' || !apiKey.trim() || apiKey.length > 256
    || typeof fetchImpl !== 'function' || typeof now !== 'function') fail('unavailable');
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) fail('unavailable');
  let keys = new Map();
  let keysExpireAt = 0;
  let lastRefreshAt = -Infinity;
  let refreshInFlight = null;

  async function googleJson(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetchImpl(url, { ...options, redirect: 'manual', signal: controller.signal });
      // workerd accepts manual/follow; manual keeps ID tokens on the fixed Google origin.
      if (response.status >= 300 && response.status < 400) fail('unavailable');
      const declaredLength = Number(response.headers.get('content-length'));
      if (declaredLength > MAX_RESPONSE_LENGTH) fail('unavailable');
      const text = await response.text();
      if (text.length > MAX_RESPONSE_LENGTH) fail('unavailable');
      const data = JSON.parse(text);
      if (!object(data)) fail('unavailable');
      return { response, data };
    } catch { fail('unavailable'); }
    finally { clearTimeout(timeout); }
  }

  async function refreshKeys() {
    if (refreshInFlight) return refreshInFlight;
    const current = now();
    if (current - lastRefreshAt < KEY_REFRESH_COOLDOWN_MS) return;
    lastRefreshAt = current;
    refreshInFlight = (async () => {
      const { response, data } = await googleJson(JWKS_URL);
      if (!response.ok || !Array.isArray(data.keys) || data.keys.length < 1 || data.keys.length > 20) fail('unavailable');
      const replacement = new Map();
      for (const jwk of data.keys) {
        if (!object(jwk) || jwk.kty !== 'RSA' || typeof jwk.kid !== 'string' || !jwk.kid || jwk.kid.length > 128
          || (jwk.alg !== undefined && jwk.alg !== 'RS256') || (jwk.use !== undefined && jwk.use !== 'sig')
          || typeof jwk.n !== 'string' || typeof jwk.e !== 'string' || replacement.has(jwk.kid)) fail('unavailable');
        try {
          const modulus = bytes(jwk.n);
          if (modulus.length < 256 || modulus.length > 512) fail('unavailable');
          const key = await subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
          replacement.set(jwk.kid, key);
        } catch { fail('unavailable'); }
      }
      const cacheControl = response.headers.get('cache-control') || '';
      const maxAge = /(?:^|,)\s*max-age\s*=\s*(\d+)/i.exec(cacheControl);
      const ttl = /(?:no-store|no-cache)/i.test(cacheControl) ? 0
        : maxAge ? Math.min(Number(maxAge[1]) * 1000, MAX_KEY_TTL_MS) : 300000;
      keys = replacement;
      keysExpireAt = now() + ttl;
    })();
    try { await refreshInFlight; }
    finally { refreshInFlight = null; }
  }

  async function verifyToken(token) {
    if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) fail('unauthenticated');
    const parts = token.split('.');
    if (parts.length !== 3) fail('unauthenticated');
    const header = jsonSegment(parts[0]);
    const claims = jsonSegment(parts[1]);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid || header.kid.length > 128
      || header.crit !== undefined || (header.typ !== undefined && header.typ !== 'JWT')) fail('unauthenticated');
    const current = Math.floor(now() / 1000);
    if (claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}`
      || typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128 || /[\x00-\x1f/]/.test(claims.sub)
      || claims.sub === '.' || claims.sub === '..'
      || !seconds(claims.exp) || claims.exp <= current || !seconds(claims.iat) || claims.iat > current
      || !seconds(claims.auth_time) || claims.auth_time > current || claims.auth_time > claims.iat
      || claims.exp <= claims.iat) fail('unauthenticated');
    if (now() >= keysExpireAt || !keys.has(header.kid)) await refreshKeys();
    if (now() >= keysExpireAt) fail('unavailable');
    const key = keys.get(header.kid);
    if (!key) fail('unauthenticated');
    let verified = false;
    try {
      verified = await subtle.verify('RSASSA-PKCS1-v1_5', key, bytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    } catch { fail('unauthenticated'); }
    if (!verified) fail('unauthenticated');
    return claims;
  }

  return async function authenticate(request, { purchase = false } = {}) {
    const authorization = request?.headers?.get('authorization');
    if (typeof authorization !== 'string' || !/^Bearer [A-Za-z0-9_.-]+$/i.test(authorization)) fail('unauthenticated');
    const token = authorization.slice(7);
    const claims = await verifyToken(token);
    const { response, data } = await googleJson(`${LOOKUP_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token }), cache: 'no-store',
    });
    if (!response.ok) {
      const reason = data.error?.message?.split(' : ')[0];
      if (response.status === 401 || ['INVALID_ID_TOKEN', 'TOKEN_EXPIRED', 'USER_DISABLED', 'USER_NOT_FOUND'].includes(reason)) fail('unauthenticated');
      fail('unavailable');
    }
    if (!Array.isArray(data.users) || data.users.length !== 1 || !object(data.users[0])) fail('unavailable');
    const account = data.users[0];
    if (account.localId !== claims.sub || account.disabled === true) fail('unauthenticated');
    if (account.disabled !== undefined && typeof account.disabled !== 'boolean') fail('unavailable');
    if (typeof account.validSince !== 'string' || !/^\d+$/.test(account.validSince) || !seconds(Number(account.validSince))) fail('unavailable');
    if (claims.auth_time < Number(account.validSince)) fail('unauthenticated');
    const email = typeof account.email === 'string' && account.email.length <= 254 ? account.email : '';
    const emailVerified = account.emailVerified === true;
    if (purchase && (!emailVerified || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) fail('permission-denied');

    const documentName = `projects/${projectId}/databases/(default)/documents/users/${claims.sub}`;
    const documentUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(claims.sub)}?mask.fieldPaths=status`;
    const profile = await googleJson(documentUrl, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    let active = false;
    if (profile.response.status === 401) fail('unauthenticated');
    if (profile.response.status === 403) fail('permission-denied');
    if (profile.response.ok) {
      if (profile.data.name !== documentName) fail('unavailable');
      active = profile.data.fields?.status?.stringValue === 'approved';
    } else if (profile.response.status !== 404) fail('unavailable');
    if (purchase && !active) fail('permission-denied');
    return { uid: claims.sub, email, emailVerified, active };
  };
}

module.exports = { createAuthenticator, AuthError };