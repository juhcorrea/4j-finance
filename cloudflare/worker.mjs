import billingModule from './billing.cjs';
import authModule from './auth.cjs';

const { createBillingService } = billingModule;
const { createAuthenticator } = authModule;
const CALLABLES = new Set(['getMonetizationStatus', 'createPixCheckout', 'checkPixCheckout']);
const ORDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROJECT_ID = /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/;
const ERROR_INFO = Object.freeze({
  'invalid-argument': [400, 'Confira os dados enviados.'],
  'unauthenticated': [401, 'Entre novamente na sua conta para continuar.'],
  'permission-denied': [403, 'Esta operação não está disponível para sua conta ou origem.'],
  'not-found': [404, 'Endpoint não encontrado.'],
  'already-exists': [409, 'A solicitação já existe.'],
  'failed-precondition': [412, 'O pagamento ainda está em configuração.'],
  'resource-exhausted': [429, 'Limite de solicitações atingido. Tente novamente mais tarde.'],
  'aborted': [409, 'O pagamento está sendo atualizado. Tente novamente.'],
  'deadline-exceeded': [504, 'A consulta demorou mais que o esperado. Tente novamente.'],
  'unavailable': [503, 'Não foi possível conferir o pagamento agora. Tente novamente.'],
  'internal': [500, 'Não foi possível concluir a solicitação.'],
});
class HttpError extends Error {
  constructor(code, httpStatus, allow) { super(code); this.code = code; this.httpStatus = httpStatus; this.allow = allow; }
}
const fail = (code, status, allow) => { throw new HttpError(code, status, allow); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const boundedString = (value, max = 4096) => typeof value === 'string' && value.length > 0 && value.length <= max && value === value.trim();
function strictBoolean(value) {
  if (value !== 'true' && value !== 'false') fail('failed-precondition');
  return value === 'true';
}
function pilotConfiguration(value) {
  if (value === undefined) return null;
  if (typeof value !== 'string' || value.length > 2048) fail('failed-precondition');
  let pilot;
  try { pilot = JSON.parse(value); } catch { fail('failed-precondition'); }
  if (!exactKeys(pilot, ['uids', 'expiresAt']) || !Array.isArray(pilot.uids) || pilot.uids.length !== 1
    || !boundedString(pilot.uids[0], 128) || /[\x00-\x20/]/.test(pilot.uids[0]) || ['.', '..'].includes(pilot.uids[0])
    || typeof pilot.expiresAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(pilot.expiresAt)
    || !Number.isFinite(Date.parse(pilot.expiresAt))) fail('failed-precondition');
  const expiresAt = Date.parse(pilot.expiresAt);
  if (new Date(expiresAt).toISOString() !== pilot.expiresAt) fail('failed-precondition');
  return { uid: pilot.uids[0], expiresAt };
}
function allowedOrigins(env) {
  let values;
  try { values = JSON.parse(env.ALLOWED_ORIGINS); } catch { fail('failed-precondition'); }
  if (!Array.isArray(values) || values.length < 1 || values.length > 32) fail('failed-precondition');
  const result = new Set();
  for (const value of values) {
    let url;
    try { if (typeof value !== 'string') throw Error(); url = new URL(value); } catch { fail('failed-precondition'); }
    const local = env.MP_LIVE_MODE === 'false' && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (value !== url.origin || (url.protocol !== 'https:' && !local) || url.username || url.password || url.search || url.hash) fail('failed-precondition');
    result.add(value);
  }
  return result;
}
function configuration(env) {
  const liveMode = strictBoolean(env.MP_LIVE_MODE), paymentsEnabled = strictBoolean(env.PAYMENTS_ENABLED);
  const pilot = pilotConfiguration(env.PIX_PILOT_CONFIG);
  // A pilot can never accidentally coexist with public purchase activation.
  if (pilot && paymentsEnabled) fail('failed-precondition');
  if (!env.BILLING_DB || typeof env.BILLING_DB.prepare !== 'function' || !PROJECT_ID.test(env.FIREBASE_PROJECT_ID || '')
    || !PROJECT_ID.test(env.MP_TEST_FIREBASE_PROJECT_ID || '') || !PROJECT_ID.test(env.MP_PRODUCTION_FIREBASE_PROJECT_ID || '')
    || env.MP_TEST_FIREBASE_PROJECT_ID === env.MP_PRODUCTION_FIREBASE_PROJECT_ID
    || env.FIREBASE_PROJECT_ID !== (liveMode ? env.MP_PRODUCTION_FIREBASE_PROJECT_ID : env.MP_TEST_FIREBASE_PROJECT_ID)
    || !boundedString(env.FIREBASE_WEB_API_KEY, 256) || !boundedString(env.MP_ACCESS_TOKEN) || !boundedString(env.MP_WEBHOOK_SECRET)
    || typeof env.MP_COLLECTOR_ID !== 'string' || typeof env.MP_APPLICATION_ID !== 'string'
    || !/^\d{1,32}$/.test(env.MP_COLLECTOR_ID || '') || !/^\d{1,32}$/.test(env.MP_APPLICATION_ID || '')) fail('failed-precondition');
  allowedOrigins(env);
  return { projectId: env.FIREBASE_PROJECT_ID, testProjectId: env.MP_TEST_FIREBASE_PROJECT_ID, productionProjectId: env.MP_PRODUCTION_FIREBASE_PROJECT_ID,
    collectorId: env.MP_COLLECTOR_ID, applicationId: env.MP_APPLICATION_ID, liveMode, paymentsEnabled,
    accessToken: env.MP_ACCESS_TOKEN, webhookSecret: env.MP_WEBHOOK_SECRET, pilot };
}
function responseHeaders(origin, contentType = 'application/json; charset=utf-8') {
  const headers = new Headers({ 'Content-Type': contentType, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', Vary: 'Origin' });
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}
function json(value, status = 200, origin = null) { return new Response(JSON.stringify(value), { status, headers: responseHeaders(origin) }); }
function errorResponse(error, origin) {
  const code = typeof error?.code === 'string' && Object.hasOwn(ERROR_INFO, error.code) ? error.code : 'internal';
  const [status, message] = ERROR_INFO[code];
  const response = json({ error: { status: code.toUpperCase().replace(/-/g, '_'), message } }, error instanceof HttpError && error.httpStatus ? error.httpStatus : status, origin);
  if (error instanceof HttpError && error.allow) response.headers.set('Allow', error.allow);
  return response;
}
function requestOrigin(request, env) {
  const origin = request.headers.get('origin');
  if (origin === null) return null;
  if (!allowedOrigins(env).has(origin)) fail('permission-denied');
  return origin;
}
async function cancelBody(request) { try { await request.body?.cancel(); } catch { /* no request contents retained */ } }
async function readJson(request, limit) {
  const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') fail('invalid-argument', 415);
  const declared = request.headers.get('content-length');
  if (declared !== null) {
    if (!/^\d+$/.test(declared)) fail('invalid-argument');
    if (Number(declared) > limit) { await cancelBody(request); fail('resource-exhausted', 413); }
  }
  if (!request.body) fail('invalid-argument');
  const reader = request.body.getReader(), chunks = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) fail('invalid-argument');
      if (value.byteLength === 0) continue;
      length += value.byteLength;
      if (length > limit) { try { await reader.cancel(); } catch {} fail('resource-exhausted', 413); }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    fail('invalid-argument');
  } finally { reader.releaseLock(); }
  try {
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { fail('invalid-argument'); }
}
function callableData(body, name) {
  if (!exactKeys(body, ['data'])) fail('invalid-argument');
  if (name === 'checkPixCheckout') {
    if (!exactKeys(body.data, ['orderId']) || typeof body.data.orderId !== 'string' || !ORDER_ID.test(body.data.orderId)) fail('invalid-argument');
    return { orderId: body.data.orderId };
  }
  if (!exactKeys(body.data, [])) fail('invalid-argument');
  return {};
}
function preflight(request, origin) {
  if (!origin) fail('permission-denied');
  if (request.headers.get('access-control-request-method') !== 'POST') fail('permission-denied');
  const requested = (request.headers.get('access-control-request-headers') || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  if (requested.some(value => !['authorization', 'content-type'].includes(value))) fail('permission-denied');
  const headers = responseHeaders(origin);
  headers.set('Access-Control-Allow-Methods', 'POST');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return new Response(null, { status: 204, headers });
}

export function createWorker({ authFactory = createAuthenticator, billingFactory = createBillingService, now = Date.now } = {}) {
  // Keep only public signing-key caches, never actors or request tokens.
  const authenticators = new Map();
  function authenticator(env) {
    const key = JSON.stringify([env.FIREBASE_PROJECT_ID, env.FIREBASE_WEB_API_KEY]);
    if (authenticators.has(key)) { const cached = authenticators.get(key); authenticators.delete(key); authenticators.set(key, cached); return cached; }
    const authenticate = authFactory({ projectId: env.FIREBASE_PROJECT_ID, apiKey: env.FIREBASE_WEB_API_KEY });
    if (typeof authenticate !== 'function') fail('failed-precondition');
    if (authenticators.size >= 4) authenticators.delete(authenticators.keys().next().value);
    authenticators.set(key, authenticate); return authenticate;
  }
  return {
    async fetch(request, env = {}) {
      let origin = null;
      try {
        const url = new URL(request.url), path = url.pathname;
        if (path !== '/api' && !path.startsWith('/api/')) {
          if (typeof env.ASSETS?.fetch === 'function') return await env.ASSETS.fetch(request);
          return json({ error: { status: 'NOT_FOUND', message: ERROR_INFO['not-found'][1] } }, 404);
        }
        const name = path.startsWith('/api/pix/') ? path.slice('/api/pix/'.length) : '';
        const webhook = name === 'mercadoPagoWebhook';
        if (path !== '/api/pix/health' && !CALLABLES.has(name) && !webhook) fail('not-found');
        origin = requestOrigin(request, env);
        if (path === '/api/pix/health') {
          if (request.method !== 'GET') fail('invalid-argument', 405, 'GET');
          let backendReady = false;
          try { configuration(env); backendReady = true; } catch { /* report only the aggregate readiness */ }
          return json({ backendReady }, 200, origin);
        }
        if (request.method === 'OPTIONS') return preflight(request, origin);
        if (request.method !== 'POST') fail('invalid-argument', 405, 'POST');
        const body = await readJson(request, webhook ? 65536 : 8192);
        if (webhook && !object(body)) fail('invalid-argument');
        const data = webhook ? null : callableData(body, name);
        const config = configuration(env);
        if (webhook) {
          const service = billingFactory({ db: env.BILLING_DB, config });
          const result = await service.webhook({ headers: request.headers, query: Object.fromEntries(url.searchParams), body });
          if (![200, 400, 401, 422, 503].includes(result?.status) || !['ok', 'ignored', 'signature', 'topic', 'binding', 'retry'].includes(result?.body)) fail('internal');
          return new Response(result.body, { status: result.status, headers: responseHeaders(origin, 'text/plain; charset=utf-8') });
        }
        const actor = await authenticator(env)(request, { purchase: name === 'createPixCheckout' });
        const { pilot, ...billingConfig } = config;
        billingConfig.pilotMode = pilot !== null;
        billingConfig.paymentsEnabled = config.paymentsEnabled || !!(pilot && now() < pilot.expiresAt
          && actor.uid === pilot.uid && actor.active === true && actor.emailVerified === true);
        if (name === 'createPixCheckout' && !billingConfig.paymentsEnabled) fail('failed-precondition');
        const service = billingFactory({ db: env.BILLING_DB, config: billingConfig });
        const result = name === 'getMonetizationStatus' ? await service.getStatus(actor)
          : name === 'createPixCheckout' ? await service.create(actor) : await service.check(actor, data);
        return json({ data: result }, 200, origin);
      } catch (error) { return errorResponse(error, origin); }
    },
  };
}
export default createWorker();
