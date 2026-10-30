import authModule from './auth.cjs';
import accountsModule from './admin-accounts.cjs';

const { createAuthenticator } = authModule;
const { createAdminAccounts, AdminAccountError } = accountsModule;
const ORIGINS = new Set(['https://4jfinance.com.br', 'https://www.4jfinance.com.br']);
const PATHS = new Map([['/api/admin/accounts/update', 'update'], ['/api/admin/accounts/lookup', 'lookup']]);
const MAX_BODY_BYTES = 2048;
const STATUS = { 'invalid-argument': 400, unauthenticated: 401, 'permission-denied': 403, 'requires-recent-login': 401, 'failed-precondition': 503, 'not-found': 404, conflict: 409, 'email-already-in-use': 409, unavailable: 503 };

// Deploy independently of Pix. Env vars: FIREBASE_PROJECT_ID,
// FIREBASE_WEB_API_KEY, ADMIN_AUTH_SERVICE_ACCOUNT_EMAIL, ADMIN_ACCOUNTS_ENABLED.
// Secret: FIREBASE_ADMIN_SERVICE_ACCOUNT. No account data persistence or billing bindings.
export function createAdminAccountsWorker({ fetchImpl = globalThis.fetch, now = Date.now, delegate = false, serialize = false } = {}) {
  let cachedEnv; let service;
  const queues = new Map(); let pending = 0;
  async function locked(uid, operation) {
    if (!serialize) return operation();
    if (typeof uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new AdminAccountError('invalid-argument');
    if (pending >= 32) throw new AdminAccountError('unavailable');
    pending++;
    const previous = queues.get(uid) || Promise.resolve();
    const running = previous.then(operation);
    const tail = running.then(() => {}, () => {});
    queues.set(uid, tail);
    try { return await running; }
    finally { pending--; if (queues.get(uid) === tail) queues.delete(uid); }
  }
  function reply(body, status, origin) {
    return new Response(body === null ? null : JSON.stringify(body), {
      status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin',
        ...(ORIGINS.has(origin) ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600' } : {}) },
    });
  }
  async function input(request) {
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
      || Number(request.headers.get('content-length')) > MAX_BODY_BYTES || !request.body) throw new AdminAccountError('invalid-argument');
    const reader = request.body.getReader(); const decoder = new TextDecoder('utf-8', { fatal: true }); let content = ''; let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new AdminAccountError('invalid-argument'); }
        content += decoder.decode(value, { stream: true });
      }
      content += decoder.decode(); return JSON.parse(content);
    } catch { throw new AdminAccountError('invalid-argument'); }
    finally { reader.releaseLock(); }
  }
  return {
    async fetch(request, env) {
      const origin = request.headers.get('origin');
      try {
        const url = new URL(request.url);
        if (!PATHS.has(url.pathname) || url.search) return reply({ error: { code: 'not-found', message: 'Rota não encontrada.' } }, 404, origin);
        if (!ORIGINS.has(origin)) throw new AdminAccountError('permission-denied');
        if (request.method === 'OPTIONS') {
          if (request.headers.get('access-control-request-method') !== 'POST'
            || (request.headers.get('access-control-request-headers') || '').split(',').some(header => header.trim() && !['authorization', 'content-type'].includes(header.trim().toLowerCase()))) throw new AdminAccountError('permission-denied');
          return reply(null, 204, origin);
        }
        if (request.method !== 'POST') return reply({ error: { code: 'method-not-allowed', message: 'Método não permitido.' } }, 405, origin);
        if (env.ADMIN_ACCOUNTS_ENABLED !== 'true') throw new AdminAccountError('failed-precondition');
        const body = await input(delegate ? request.clone() : request);
        if (delegate) {
          if (!env.ADMIN_ACCOUNTS_EXECUTOR?.idFromName || !env.ADMIN_ACCOUNTS_EXECUTOR?.get) throw new AdminAccountError('failed-precondition');
          const id = env.ADMIN_ACCOUNTS_EXECUTOR.idFromName('accounts');
          return await env.ADMIN_ACCOUNTS_EXECUTOR.get(id).fetch(request);
        }
        if (!service || cachedEnv !== env) {
          service = createAdminAccounts({ projectId: env.FIREBASE_PROJECT_ID, serviceAccountEmail: env.ADMIN_AUTH_SERVICE_ACCOUNT_EMAIL,
            serviceAccountJson: env.FIREBASE_ADMIN_SERVICE_ACCOUNT, fetchImpl, now,
            authenticate: createAuthenticator({ projectId: env.FIREBASE_PROJECT_ID, apiKey: env.FIREBASE_WEB_API_KEY, fetchImpl, now }) });
          cachedEnv = env;
        }
        return reply(await locked(body?.uid, () => service[PATHS.get(url.pathname)](request, body)), 200, origin);
      } catch (error) {
        const safe = error instanceof AdminAccountError ? error : new AdminAccountError('unavailable');
        return reply({ error: { code: safe.code, message: safe.message,
          ...(safe.targetReauthRequired ? { targetReauthRequired: true } : {}) } }, STATUS[safe.code] || 503, origin);
      }
    },
  };
}

// One private SQLite Durable Object instance performs crypto outside the public
// Worker's short Free CPU allowance. No storage is used. Per-UID queues serialize
// edits from this API; external Firebase Console changes still require readback.
export class AdminAccountsExecutor {
  constructor(state, env) {
    this.env = env;
    this.handler = createAdminAccountsWorker({ serialize: true });
  }
  fetch(request) { return this.handler.fetch(request, this.env); }
}

export default createAdminAccountsWorker({ delegate: true });
