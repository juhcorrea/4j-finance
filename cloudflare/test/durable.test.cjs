'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHmac, createHash } = require('node:crypto');
const Module = require('node:module');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '../..');
const ORIGIN = 'https://synthetic.example';
const ID = 'ORDTST' + '0'.repeat(25) + '1';
const routerModule = import(pathToFileURL(path.join(root, 'cloudflare/router.mjs')).href);
function configuration(overrides = {}) {
  return {
    FIREBASE_PROJECT_ID: 'synthetic-test', FIREBASE_WEB_API_KEY: 'synthetic-public-key',
    MP_COLLECTOR_ID: '5678', MP_APPLICATION_ID: '9012', MP_LIVE_MODE: 'false',
    MP_TEST_FIREBASE_PROJECT_ID: 'synthetic-test', MP_PRODUCTION_FIREBASE_PROJECT_ID: 'synthetic-production',
    PAYMENTS_ENABLED: 'true', ALLOWED_ORIGINS: JSON.stringify([ORIGIN]),
    MP_ACCESS_TOKEN: 'synthetic-private-access', MP_WEBHOOK_SECRET: 'synthetic-private-signature', ...overrides,
  };
}
const request = (pathName = '/api/pix/health', options) => new Request(ORIGIN + pathName, options);
function httpResponse(value) {
  if (value instanceof Response || typeof value?.text === 'function' && typeof value?.headers?.get === 'function') return value;
  assert.deepEqual(Object.keys(value).sort(), ['body', 'headers', 'status']);
  assert.ok(value.body === null || typeof value.body === 'string');
  return new Response(value.body, { status: value.status, headers: value.headers });
}
async function genericFailure(response, status = 503) {
  response = httpResponse(response);
  assert.equal(response.status, status);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.text();
  assert.doesNotMatch(body, /synthetic-private|credential|stack|BILLING_DB|PIX_EXECUTOR/);
  return body;
}
const nodeExecutor = esbuild.build({
  entryPoints: [path.join(root, 'cloudflare/durable.mjs')], bundle: true, write: false,
  platform: 'node', format: 'cjs', target: 'node22', logLevel: 'silent',
  plugins: [{ name: 'unit-runtime-base', setup(build) {
    build.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'runtime-base', namespace: 'unit-runtime' }));
    build.onLoad({ filter: /.*/, namespace: 'unit-runtime' }, () => ({
      contents: 'export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }', loader: 'js',
    }));
  } }],
}).then(result => {
  const compiled = new Module(path.join(__dirname, 'synthetic-durable.cjs'), module);
  compiled.filename = path.join(__dirname, 'synthetic-durable.cjs');
  compiled.paths = module.paths; compiled._compile(result.outputFiles[0].text, compiled.filename);
  return compiled.exports;
});

test('router forwards only exact APIs and only scalar allowlisted environment fields', async () => {
  const { default: router, PIX_CONFIG_KEYS } = await routerModule;
  const calls = [], config = configuration();
  const binding = { getByName(name) { assert.equal(name, 'pix-api'); return { async handle(input, values) {
    calls.push({ input, values }); return { status: 200, headers: [], body: 'private-rpc-response' };
  } }; } };
  const env = { ...config, PIX_EXECUTOR: binding, BILLING_DB: { prepare() {} }, SECRET_OTHER: 'do-not-forward' };
  for (const route of ['health', 'getMonetizationStatus', 'createPixCheckout', 'checkPixCheckout', 'mercadoPagoWebhook']) {
    const input = request('/api/pix/' + route, { method: 'POST', headers: { 'x-config-MP_ACCESS_TOKEN': 'attacker' }, body: '{"MP_ACCESS_TOKEN":"attacker"}' });
    assert.equal(await (await router.fetch(input, env)).text(), 'private-rpc-response');
    assert.equal(calls.at(-1).input, input);
    assert.deepEqual(calls.at(-1).values, config);
    assert.ok(Object.keys(calls.at(-1).values).every(key => PIX_CONFIG_KEYS.includes(key)));
  }
  assert.equal(calls.length, 5);
});

test('router preserves a finite response and disposes the RPC result before HTTP delivery', async () => {
  const { default: router } = await routerModule;
  let disposed = 0;
  const headers = [['Content-Type', 'application/json; charset=utf-8'], ['Cache-Control', 'no-store'],
    ['X-Content-Type-Options', 'nosniff'], ['X-Frame-Options', 'DENY'], ['Vary', 'Origin'],
    ['Access-Control-Allow-Origin', ORIGIN], ['Allow', 'POST']];
  const body = JSON.stringify({ data: { qrCode: 'Pix sintético — sem cobrança', qrCodeBase64: 'A'.repeat(500000) } });
  const result = { status: 201, headers, body, [Symbol.dispose]() { disposed++; } };
  const env = { PIX_EXECUTOR: { getByName() { return { handle() { return result; } }; } } };
  const response = await router.fetch(request(), env);
  assert.equal(disposed, 1);
  assert.equal(response.status, 201);
  assert.deepEqual(Array.from(response.headers), Array.from(new Headers(headers)));
  assert.equal(await response.text(), body);
  result.status = 204; result.body = null;
  const empty = await router.fetch(request(), env);
  assert.equal(disposed, 2); assert.equal(empty.status, 204); assert.equal(empty.body, null);
});

test('router rejects malformed or oversized finite RPC results and disposes them', async () => {
  const { default: router } = await routerModule;
  const PIX_RESPONSE_BODY_LIMIT = 1024 * 1024;
  const valid = () => ({ status: 200, headers: [['Cache-Control', 'no-store']], body: 'finite' });
  const invalid = [
    null, [], new Response('stream'), { ...valid(), extra: 'unexpected' },
    { ...valid(), status: '200' }, { ...valid(), status: 199 }, { ...valid(), status: 600 },
    { ...valid(), status: 204 }, { ...valid(), status: 205 }, { ...valid(), status: 304 },
    { ...valid(), body: {} }, { ...valid(), body: 'A'.repeat(PIX_RESPONSE_BODY_LIMIT + 1) },
    { ...valid(), headers: {} }, { ...valid(), headers: [['X-Test']] },
    { ...valid(), headers: [['X-Test', 'a', 'extra']] }, { ...valid(), headers: [['bad:name', 'a']] },
    { ...valid(), headers: [['X-Test', '\r\ninjected: value']] },
    { ...valid(), headers: [['X-Test', 'A'.repeat(8193)]] },
    { ...valid(), headers: Array.from({ length: 33 }, () => ['X-Test', 'a']) },
    { ...valid(), headers: Array.from({ length: 5 }, () => ['X-Test', 'A'.repeat(8192)]) },
  ];
  for (const value of invalid) {
    let disposed = 0;
    if (value && typeof value === 'object') value[Symbol.dispose] = () => { disposed++; };
    const env = { PIX_EXECUTOR: { getByName() { return { handle() { return value; } }; } } };
    await genericFailure(await router.fetch(request(), env));
    assert.equal(disposed, value && typeof value === 'object' ? 1 : 0);
  }
});

test('router preserves static assets and rejects unknown API paths without RPC', async () => {
  const { default: router } = await routerModule; let assets = 0, rpc = 0;
  const env = { ASSETS: { async fetch() { assets++; return new Response('asset'); } }, PIX_EXECUTOR: { getByName() { rpc++; throw Error(); } } };
  assert.equal(await (await router.fetch(request('/index.html'), env)).text(), 'asset');
  for (const route of ['/api', '/api/other', '/api/pix/health/', '/api/pix/mercadoPagoWebhook/extra']) await genericFailure(await router.fetch(request(route), env), 404);
  assert.equal(assets, 1); assert.equal(rpc, 0);
});

test('router missing binding, rejected RPC and invalid response fail generically', async () => {
  const { default: router } = await routerModule;
  for (const env of [{}, { PIX_EXECUTOR: {} }, { PIX_EXECUTOR: { getByName() { throw Error('synthetic-private-access'); } } },
    { PIX_EXECUTOR: { getByName() { return { handle() { throw Error('synthetic-private-signature'); } }; } } },
    { PIX_EXECUTOR: { getByName() { return { handle() { return { secret: 'synthetic-private-access' }; } }; } } }]) {
    await genericFailure(await router.fetch(request(), env));
  }
});

test('executor fixes all public identity values and rejects extra bindings or malformed private configs', async () => {
  const { PixExecutor } = await nodeExecutor;
  const config = configuration(), fixed = { ...config, BILLING_DB: { prepare() { throw Error('No SQL expected'); } } };
  delete fixed.MP_ACCESS_TOKEN; delete fixed.MP_WEBHOOK_SECRET;
  const executor = new PixExecutor({}, fixed);
  assert.deepEqual(await httpResponse(await executor.handle(request(), config)).json(), { backendReady: true });
  for (const key of Object.keys(fixed).filter(key => key !== 'BILLING_DB')) {
    await genericFailure(await executor.handle(request(), { ...config, [key]: 'mismatch' }));
  }
  for (const bad of [null, [], {}, { ...config, BILLING_DB: {} }, { ...config, EXTRA: 'secret' }, { ...config, MP_ACCESS_TOKEN: {} }]) {
    await genericFailure(await executor.handle(request(), bad));
  }
  const missingDb = new PixExecutor({}, { ...fixed, BILLING_DB: null });
  await genericFailure(await missingDb.handle(request(), config));
});

test('executor keeps credentials per invocation and never exposes a public fetch endpoint', async () => {
  const { PixExecutor, default: publicWorker } = await nodeExecutor;
  const fixed = configuration(), executor = new PixExecutor({}, { ...fixed, BILLING_DB: { prepare() {} } });
  assert.equal((await executor.fetch(request())).status, 404);
  assert.equal((await publicWorker.fetch(request())).status, 404);
  assert.deepEqual(await httpResponse(await executor.handle(request(), fixed)).json(), { backendReady: true });
  const missing = { ...fixed }; delete missing.MP_ACCESS_TOKEN;
  assert.deepEqual(await httpResponse(await executor.handle(request(), missing)).json(), { backendReady: false });
  assert.deepEqual(await httpResponse(await executor.handle(request(), { ...fixed, MP_ACCESS_TOKEN: 'rotated-synthetic-access' })).json(), { backendReady: true });
  assert.deepEqual(await httpResponse(await executor.handle(request(), missing)).json(), { backendReady: false });
});

test('executor production cannot enable global purchases and rejects cross-environment identity', async () => {
  const { PixExecutor } = await nodeExecutor;
  const production = configuration({ FIREBASE_PROJECT_ID: 'synthetic-production', MP_LIVE_MODE: 'true', PAYMENTS_ENABLED: 'false' });
  const executor = new PixExecutor({}, { ...production, BILLING_DB: { prepare() {} } });
  assert.deepEqual(await httpResponse(await executor.handle(request(), production)).json(), { backendReady: true });
  await genericFailure(await executor.handle(request(), configuration()));
  const unsafe = { ...production, PAYMENTS_ENABLED: 'true' };
  const unsafeExecutor = new PixExecutor({}, { ...unsafe, BILLING_DB: { prepare() {} } });
  await genericFailure(await unsafeExecutor.handle(request(), unsafe));
});

test('Miniflare: actual cross-worker RPC preserves core HTTP, HMAC and environment isolation', { timeout: 90000 }, async () => {
  const { Miniflare, Log, LogLevel, convertV4MiniflareOptions } = require('miniflare');
  const common = { bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', external: ['node:*', 'cloudflare:workers'], logLevel: 'silent' };
  const router = (await esbuild.build({ ...common, entryPoints: [path.join(root, 'cloudflare/router.mjs')] })).outputFiles[0].text;
  const executor = (await esbuild.build({ ...common, entryPoints: [path.join(root, 'cloudflare/durable.mjs')], banner: { js: 'import * as __crypto from "node:crypto"; const require = name => { if (name === "node:crypto") return __crypto; throw Error("Unsupported module"); };' } })).outputFiles[0].text;
  const config = configuration(), fixed = { ...config }; delete fixed.MP_ACCESS_TOKEN; delete fixed.MP_WEBHOOK_SECRET;
  let upstream = 0;
  const outbound = async input => {
    upstream++; const url = new URL(input.url);
    assert.equal(url.origin, 'https://api.mercadopago.com');
    assert.equal(input.headers.get('authorization'), 'Bearer synthetic-private-access');
    if (url.pathname === '/users/me') return Response.json({ id: 5678, country_id: 'BR', site_id: 'MLB', tags: ['test_user'] });
    if (url.pathname === '/v1/orders/' + ID) return Response.json({ id: ID, external_reference: 'unrelated-synthetic-order' });
    throw Error('Unexpected network request in local fixture');
  };
  const runtime = { modules: true, compatibilityDate: '2026-10-15', compatibilityFlags: ['nodejs_compat'], outboundService: outbound };
  const binding = { PIX_EXECUTOR: { className: 'PixExecutor', scriptName: 'executor', useSQLite: true } };
  const mf = new Miniflare(convertV4MiniflareOptions({ cf: false, log: new Log(LogLevel.ERROR), workers: [
    { ...runtime, name: 'pages', script: router, bindings: config, durableObjects: binding },
    { ...runtime, name: 'pages-wrong-identity', script: router, bindings: { ...config, MP_APPLICATION_ID: '9999' }, durableObjects: binding },
    { ...runtime, name: 'executor', script: executor, bindings: fixed, d1Databases: { BILLING_DB: 'synthetic-database' },
      durableObjects: { SELF: { className: 'PixExecutor', useSQLite: true } } },
  ] }));
  try {
    const db = await mf.getD1Database('BILLING_DB', 'executor');
    // One statement is enough for the unknown-order lookup exercised here.
    await db.prepare('CREATE TABLE billingOrders (uid TEXT, orderId TEXT, providerOrderId TEXT UNIQUE)').run();
    let response = await mf.dispatchFetch(ORIGIN + '/api/pix/health');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('vary'), 'Origin');
    assert.deepEqual(await response.json(), { backendReady: true });
    response = await mf.dispatchFetch(ORIGIN + '/api/pix/health', { method: 'POST' });
    assert.equal(response.status, 405); assert.equal(response.headers.get('allow'), 'GET');
    response = await mf.dispatchFetch(ORIGIN + '/api/pix/createPixCheckout', { method: 'OPTIONS', headers: {
      Origin: ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Authorization, Content-Type',
    } });
    assert.equal(response.status, 204); assert.equal(response.headers.get('access-control-allow-origin'), ORIGIN);
    assert.equal(response.body, null);
    assert.equal(response.headers.get('access-control-allow-methods'), 'POST');
    assert.equal(response.headers.get('access-control-allow-headers'), 'Content-Type, Authorization');
    response = await mf.dispatchFetch(ORIGIN + '/api/pix/getMonetizationStatus', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: {} }) });
    assert.equal(response.status, 401); assert.equal(upstream, 0);
    response = await mf.dispatchFetch(ORIGIN + '/api/pix/health', { headers: { Origin: 'https://attacker.invalid' } }); assert.equal(response.status, 403);
    const webhookUrl = ORIGIN + '/api/pix/mercadoPagoWebhook?type=order&data.id=' + ID;
    response = await mf.dispatchFetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'order' }) });
    assert.equal(response.status, 401); assert.equal(upstream, 0);
    const ts = '1792410000000', requestId = 'synthetic-local-rpc';
    const signature = createHmac('sha256', config.MP_WEBHOOK_SECRET).update('id:' + ID.toLowerCase() + ';request-id:' + requestId + ';ts:' + ts + ';').digest('hex');
    response = await mf.dispatchFetch(webhookUrl, { method: 'POST', headers: {
      'Content-Type': 'application/json', 'x-request-id': requestId, 'x-signature': 'ts=' + ts + ',v1=' + signature,
    }, body: JSON.stringify({ type: 'order', data: { status: 'processed' } }) });
    assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
    assert.equal(await response.text(), 'ignored'); assert.equal(upstream, 2);
    const wrong = await mf.getWorker('pages-wrong-identity');
    await genericFailure(await wrong.fetch(ORIGIN + '/api/pix/health')); assert.equal(upstream, 2);
    const publicExecutor = await mf.getWorker('executor');
    assert.equal((await publicExecutor.fetch(ORIGIN + '/api/pix/health')).status, 404);
    const namespace = await mf.getDurableObjectNamespace('SELF', 'executor');
    assert.equal((await namespace.getByName('pix-api').fetch(ORIGIN + '/api/pix/health')).status, 404);
  } finally { await mf.dispose(); }
});


test('CPU diagnostic is fixed-test-only and emits only bounded operation metadata', async () => {
  const { PixExecutor } = await nodeExecutor;
  const config = configuration(), marker = 'a'.repeat(40), captured = [], originalLog = console.log;
  const fixed = { ...config, PIX_CPU_DIAGNOSTICS: 'true', BILLING_DB: { prepare() { throw Error('No SQL expected'); } } };
  const callable = () => request('/api/pix/getMonetizationStatus', { method: 'POST', headers: {
    'Content-Type': 'application/json', 'x-pix-qa': marker, 'x-request-id': 'do-not-log-raw',
  }, body: JSON.stringify({ data: {} }) });
  console.log = value => captured.push(value);
  try {
    const active = new PixExecutor({}, fixed);
    assert.equal((await active.handle(callable(), config)).status, 401);
    assert.deepEqual(JSON.parse(captured.pop()), { event: 'pix-cpu-diagnostic', testOnly: true,
      operation: 'getMonetizationStatus', httpStatus: 401, qaMarker: marker, webhookRequestIdHash: null });
    const webhook = request('/api/pix/mercadoPagoWebhook?type=order&data.id=' + ID, { method: 'POST', headers: {
      'Content-Type': 'application/json', 'x-pix-qa': marker, 'x-request-id': 'synthetic-request-hash',
    }, body: JSON.stringify({ type: 'order', private: 'do-not-log-body' }) });
    assert.equal((await active.handle(webhook, config)).status, 401);
    assert.deepEqual(JSON.parse(captured.pop()), { event: 'pix-cpu-diagnostic', testOnly: true,
      operation: 'mercadoPagoWebhook', httpStatus: 401, qaMarker: null,
      webhookRequestIdHash: createHash('sha256').update('synthetic-request-hash').digest('hex') });
    await active.handle(request(), config); assert.equal(captured.length, 0);
    const disabled = new PixExecutor({}, { ...fixed, PIX_CPU_DIAGNOSTICS: undefined });
    await disabled.handle(callable(), config); assert.equal(captured.length, 0);
    const production = configuration({ FIREBASE_PROJECT_ID: 'synthetic-production', MP_LIVE_MODE: 'true', PAYMENTS_ENABLED: 'false' });
    const prod = new PixExecutor({}, { ...production, PIX_CPU_DIAGNOSTICS: 'true', BILLING_DB: fixed.BILLING_DB });
    await prod.handle(callable(), production); assert.equal(captured.length, 0);
  } finally { console.log = originalLog; }
});
