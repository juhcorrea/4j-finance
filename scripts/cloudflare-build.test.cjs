'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { buildCloudflare, deploymentConfigs, inspectPackage, PUBLIC_FILES, PUBLIC_VARS, EXECUTOR_FILES, TEST_HTML } = require('./build-cloudflare.cjs');
const root = path.resolve(__dirname, '..');
const readConfig = mode => JSON.parse(fs.readFileSync(path.join(root, 'cloudflare', 'wrangler.' + mode + '.json'), 'utf8'));

async function temporary(fn) {
  const parent = fs.realpathSync(os.tmpdir()), directory = fs.mkdtempSync(path.join(parent, '4j-cloudflare-build-'));
  try { return await fn(directory); }
  finally {
    const resolved = fs.realpathSync(directory);
    assert.equal(path.dirname(resolved), parent);
    assert.match(path.basename(resolved), /^4j-cloudflare-build-/);
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}
function write(directory, rel, data = 'synthetic') {
  const file = path.join(directory, rel); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data);
}
function list(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(item => item.isDirectory()
    ? list(path.join(directory, item.name), prefix + item.name + '/') : [prefix + item.name]).sort();
}
function fixture(directory) {
  fs.cpSync(path.join(root, 'cloudflare'), path.join(directory, 'cloudflare'), { recursive: true });
  write(directory, 'functions/payment-core.js', fs.readFileSync(path.join(root, 'functions/payment-core.js')));
  for (const rel of PUBLIC_FILES) write(directory, 'public/' + rel, 'PUBLIC-FIXTURE:' + rel);
  // These files must never be collected by either deployment package.
  for (const rel of ['.env', '.dev.vars', 'work/private.json', 'public/private.txt', 'cloudflare/private.json']) write(directory, rel, 'SYNTHETIC_PRIVATE_DO_NOT_PACKAGE');
}

for (const mode of ['test', 'production']) test('executor configuration keeps ' + mode + ' isolated and private on SQLite', () => {
  const original = readConfig(mode), before = structuredClone(original), configs = deploymentConfigs(original, mode === 'test');
  assert.deepEqual(original, before, 'does not mutate source config');
  assert.deepEqual(configs.executor.vars, { ...original.vars, ...(mode === 'test' ? { PIX_CPU_DIAGNOSTICS: 'true' } : {}) });
  assert.deepEqual(Object.keys(configs.executor.vars), [...PUBLIC_VARS, ...(mode === 'test' ? ['PIX_CPU_DIAGNOSTICS'] : [])]);
  assert.deepEqual(configs.executor.d1_databases, original.d1_databases);
  assert.deepEqual(configs.executor.migrations, [{ tag: 'v1', new_sqlite_classes: ['PixExecutor'] }]);
  assert.equal(configs.executor.workers_dev, false);
  assert.equal(configs.executor.preview_urls, false);
  assert.deepEqual(configs.executor.routes, []);
  assert.equal(configs.executor.vars.PAYMENTS_ENABLED, 'true');
  assert.equal(configs.executor.vars.MP_LIVE_MODE, String(mode !== 'test'));
  assert.equal(configs.pages.durable_objects.bindings[0].script_name, configs.executor.name);
  assert.equal(configs.executor.main, '../cloudflare-' + mode + '-executor/index.mjs');
  for (const key of ['PIX_PILOT_CONFIG', 'MP_ACCESS_TOKEN', 'MP_WEBHOOK_SECRET']) assert.equal(Object.hasOwn(configs.executor.vars, key), false);
  for (const key of ['usage_model', 'limits', 'services', 'queues', 'triggers', 'build', 'assets', 'exports']) assert.equal(Object.hasOwn(configs.executor, key), false);
});

test('rollback configurations retain strict boolean purchase flags and separate identities', () => {
  for (const mode of ['test', 'production']) {
    const original = readConfig(mode); original.vars.PAYMENTS_ENABLED = 'false';
    const result = deploymentConfigs(original, mode === 'test');
    assert.equal(result.pages.vars.PAYMENTS_ENABLED, 'false');
    assert.equal(result.executor.vars.PAYMENTS_ENABLED, 'false');
    assert.equal(result.executor.vars.MP_LIVE_MODE, String(mode === 'production'));
  }
});

test('configuration guard refuses secrets, identifiers from another environment and expanded capabilities', () => {
  const mutations = [
    x => { x.vars.MP_ACCESS_TOKEN = 'synthetic-secret'; },
    x => { x.vars.MP_WEBHOOK_SECRET = 'synthetic-secret'; },
    x => { x.vars.PIX_PILOT_CONFIG = '{}'; },
    x => { x.vars.EXTRA = 'unexpected'; },
    x => { x.vars.PIX_CPU_DIAGNOSTICS = 'true'; },
    x => { delete x.vars.FIREBASE_PROJECT_ID; },
    x => { x.vars.PAYMENTS_ENABLED = 'TRUE'; },
    x => { x.vars.PAYMENTS_ENABLED = true; },
    x => { x.vars.MP_LIVE_MODE = 'false'; },
    x => { x.vars.MP_APPLICATION_ID = '0'; },
    x => { x.vars.MP_COLLECTOR_ID = '0'; },
    x => { x.vars.FIREBASE_PROJECT_ID = 'fjfinance-pix-test'; },
    x => { x.vars.ALLOWED_ORIGINS = '["https://other.invalid"]'; },
    x => { x.d1_databases = readConfig('test').d1_databases; },
    x => { x.durable_objects.bindings[0].script_name += '-test'; },
    x => { x.durable_objects.bindings[0].environment = 'production'; },
    x => { x.name = 'unexpected'; },
    x => { x.pages_build_output_dir = '..'; },
    x => { x.workers_dev = true; },
    x => { x.usage_model = 'unbound'; },
    x => { x.limits = { cpu_ms: 30000 }; },
    x => { x.services = []; },
    x => { x.compatibility_flags.push('unsafe_flag'); },
  ];
  for (const change of mutations) { const config = readConfig('production'); change(config); assert.throws(() => deploymentConfigs(config, false)); }
  assert.throws(() => deploymentConfigs(readConfig('test'), false));
  assert.throws(() => deploymentConfigs(readConfig('production'), true));
});

for (const mode of ['test', 'production']) test('isolated ' + mode + ' build separates public assets from compiled private executor', () => temporary(async directory => {
  fixture(directory);
  const report = await buildCloudflare({ root: directory, test: mode === 'test' });
  const stage = path.join(directory, report.stage), executor = path.join(directory, report.executorStage);
  assert.deepEqual(list(stage), [...(mode === 'test' ? ['index.html'] : PUBLIC_FILES), '_worker.js', '_routes.json'].sort());
  assert.deepEqual(list(executor), EXECUTOR_FILES);
  if (mode === 'test') assert.equal(fs.readFileSync(path.join(stage, 'index.html'), 'utf8'), TEST_HTML);
  else for (const rel of PUBLIC_FILES) assert.equal(fs.readFileSync(path.join(stage, rel), 'utf8'), 'PUBLIC-FIXTURE:' + rel);
  const router = fs.readFileSync(path.join(stage, '_worker.js'), 'utf8'), server = fs.readFileSync(path.join(executor, 'index.mjs'), 'utf8');
  assert.doesNotMatch(router, /node:crypto|INSERT INTO|identitytoolkit\.googleapis|api\.mercadopago\.com/);
  assert.match(server, /PixExecutor/); assert.match(server, /cloudflare:workers/);
  for (const contents of [router, server]) assert.doesNotMatch(contents, /SYNTHETIC_PRIVATE_DO_NOT_PACKAGE|sourceMappingURL|from ['"]\.\//);
  const configs = JSON.parse(fs.readFileSync(path.join(directory, report.executorConfig), 'utf8'));
  assert.equal(path.resolve(path.dirname(path.join(directory, report.executorConfig)), configs.main), path.join(executor, 'index.mjs'));
  assert.equal(configs.workers_dev, false); assert.equal(configs.preview_urls, false);
  assert.equal(report.executorPublicRoutes, false); assert.equal(report.sqliteExecutor, true);
  const original = [router, server]; await buildCloudflare({ root: directory, test: mode === 'test' });
  assert.deepEqual([fs.readFileSync(path.join(stage, '_worker.js'), 'utf8'), fs.readFileSync(path.join(executor, 'index.mjs'), 'utf8')], original);
}));

test('allowlists reject raw source, configs, maps, private files and empty private directories', () => temporary(async directory => {
  for (const rel of ['worker.mjs', 'billing.cjs', 'wrangler.json', '.env', '.dev.vars', 'index.mjs.map', 'node_modules/private.js']) {
    const stage = path.join(directory, rel.replaceAll(/[^a-z0-9]/gi, '_')); fs.mkdirSync(stage);
    write(stage, 'index.mjs'); write(stage, rel);
    assert.throws(() => inspectPackage(stage, EXECUTOR_FILES));
  }
  const empty = path.join(directory, 'empty-folder'); write(empty, 'index.mjs'); fs.mkdirSync(path.join(empty, 'private'));
  assert.throws(() => inspectPackage(empty, EXECUTOR_FILES));
  assert.throws(() => inspectPackage(path.join(directory, 'missing'), EXECUTOR_FILES));
}));

test('existing forbidden files abort before either build package is overwritten', () => temporary(async directory => {
  fixture(directory);
  write(directory, 'work/cloudflare-test/_worker.js', 'UNCHANGED');
  write(directory, 'work/cloudflare-test-executor/wrangler.json', 'PRIVATE_CONFIG');
  await assert.rejects(buildCloudflare({ root: directory, test: true }));
  assert.equal(fs.readFileSync(path.join(directory, 'work/cloudflare-test/_worker.js'), 'utf8'), 'UNCHANGED');
  assert.equal(fs.existsSync(path.join(directory, 'work/cloudflare-test-executor/index.mjs')), false);
}));

test('stage directory junctions cannot redirect generated packages outside their owner', () => temporary(async directory => {
  const owner = path.join(directory, 'owner'), outside = path.join(directory, 'outside');
  fs.mkdirSync(owner); fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(owner, 'work'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(buildCloudflare({ root: owner, test: true }));
  assert.deepEqual(fs.readdirSync(outside), []);
}));

test('package allowlists reject symbolic links even under an allowed name', () => temporary(async directory => {
  const external = path.join(directory, 'external'), stage = path.join(directory, 'stage');
  fs.mkdirSync(external); fs.mkdirSync(stage);
  fs.symlinkSync(external, path.join(stage, 'index.mjs'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => inspectPackage(stage, EXECUTOR_FILES));
}));
