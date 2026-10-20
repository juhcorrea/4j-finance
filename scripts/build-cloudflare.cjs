'use strict';
const fs = require('node:fs'), path = require('node:path');
const esbuild = require('esbuild');
const PUBLIC_FILES = Object.freeze(['_headers', 'ads.txt', 'index.html', 'sobre.html', 'guia.html', 'privacidade.html', 'contato.html', 'public-site.css', 'public-ads.js', 'consent.css', 'consent.js', 'assets/4j-symbol.svg', 'assets/catatau.webp']);
const PUBLIC_VARS = Object.freeze(['FIREBASE_PROJECT_ID', 'FIREBASE_WEB_API_KEY', 'MP_COLLECTOR_ID', 'MP_APPLICATION_ID', 'MP_LIVE_MODE', 'MP_TEST_FIREBASE_PROJECT_ID', 'MP_PRODUCTION_FIREBASE_PROJECT_ID', 'PAYMENTS_ENABLED', 'ALLOWED_ORIGINS']);
const EXECUTOR_FILES = Object.freeze(['index.mjs']);
const TEST_HTML = '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>4J Finance — teste Pix</title><h1>Ambiente de teste do Pix</h1><p>Usado apenas para validar pagamentos fictícios. Nenhum valor real é cobrado aqui.</p></html>';
const MODES = Object.freeze({
  test: { pages: '4jfinance-pix-test', executor: '4jfinance-pix-executor-test', database: '4jfinance-pix-test', databaseId: 'c0c6d41a-6013-45c2-896f-ecb3746d8962', firebase: 'fjfinance-pix-test', collector: '3765216065', application: '2201067926559576', origins: ['https://4jfinance-pix-test.pages.dev'] },
  production: { pages: '4jfinance', executor: '4jfinance-pix-executor', database: '4jfinance-billing', databaseId: 'b3cf312a-950a-4998-897e-4d299e6ea2dc', firebase: 'financas-familia-9480b', collector: '672577400', application: '6568194540882659', origins: ['https://4jfinance.com.br', 'https://www.4jfinance.com.br', 'https://4jfinance.pages.dev'] }
});
const ownKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function refused() { throw Error('Configuracao ou pacote Cloudflare fora da lista permitida.'); }

function deploymentConfigs(pages, test) {
  const mode = test ? 'test' : 'production', expected = MODES[mode];
  if (!ownKeys(pages, ['name', 'pages_build_output_dir', 'compatibility_date', 'compatibility_flags', 'd1_databases', 'vars', 'durable_objects'])
    || pages.name !== expected.pages || pages.pages_build_output_dir !== '../work/cloudflare-' + mode
    || pages.compatibility_date !== '2026-10-15' || !same(pages.compatibility_flags, ['nodejs_compat'])
    || !same(pages.d1_databases, [{ binding: 'BILLING_DB', database_name: expected.database, database_id: expected.databaseId }])
    || !same(pages.durable_objects, { bindings: [{ name: 'PIX_EXECUTOR', class_name: 'PixExecutor', script_name: expected.executor }] })
    || !ownKeys(pages.vars, PUBLIC_VARS)) refused();
  const vars = pages.vars;
  if (PUBLIC_VARS.some(key => typeof vars[key] !== 'string' || vars[key].length > 2048)
    || vars.FIREBASE_PROJECT_ID !== expected.firebase || !/^AIza[A-Za-z0-9_-]{20,100}$/.test(vars.FIREBASE_WEB_API_KEY)
    || vars.MP_TEST_FIREBASE_PROJECT_ID !== MODES.test.firebase || vars.MP_PRODUCTION_FIREBASE_PROJECT_ID !== MODES.production.firebase
    || vars.MP_COLLECTOR_ID !== expected.collector || vars.MP_APPLICATION_ID !== expected.application
    || vars.MP_LIVE_MODE !== String(!test) || vars.PAYMENTS_ENABLED !== String(test)
    || vars.ALLOWED_ORIGINS !== JSON.stringify(expected.origins)) refused();
  const executor = {
    name: expected.executor,
    main: '../cloudflare-' + mode + '-executor/index.mjs',
    compatibility_date: pages.compatibility_date,
    compatibility_flags: [...pages.compatibility_flags],
    workers_dev: false,
    preview_urls: false,
    routes: [],
    migrations: [{ tag: 'v1', new_sqlite_classes: ['PixExecutor'] }],
    d1_databases: structuredClone(pages.d1_databases),
    vars: Object.fromEntries(PUBLIC_VARS.map(key => [key, vars[key]])),
  };
  if (test) executor.vars.PIX_CPU_DIAGNOSTICS = 'true';
  return { pages: { ...structuredClone(pages), pages_build_output_dir: '../cloudflare-' + mode }, executor };
}

function ownedDirectory(root, folder) {
  const relative = path.relative(root, folder);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) refused();
  let current = root;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    if (fs.existsSync(current)) {
      const info = fs.lstatSync(current);
      if (info.isSymbolicLink() || !info.isDirectory()) refused();
    }
  }
}
function inspectPackage(folder, allowed, complete = true) {
  const permitted = new Set(allowed), found = new Set();
  if (!fs.existsSync(folder)) { if (complete) refused(); return; }
  if (fs.lstatSync(folder).isSymbolicLink()) refused();
  function inspect(current, prefix = '') {
    for (const item of fs.readdirSync(current, { withFileTypes: true })) {
      const rel = prefix + item.name, file = path.join(current, item.name);
      if (item.isSymbolicLink()) refused();
      if (item.isDirectory()) {
        if (![...permitted].some(name => name.startsWith(rel + '/'))) refused();
        inspect(file, rel + '/');
      } else if (!item.isFile() || !permitted.has(rel)) refused();
      else found.add(rel);
    }
  }
  inspect(folder);
  if (complete && (found.size !== permitted.size || [...permitted].some(file => !found.has(file)))) refused();
}
function writeFile(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file) && (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink())) refused();
  fs.writeFileSync(file, contents);
}
async function bundle(root, entry, executor) {
  const result = await esbuild.build({
    entryPoints: [path.join(root, entry)], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022',
    external: ['node:*', 'cloudflare:workers'], minify: true, sourcemap: false, logLevel: 'silent',
    ...(executor ? { banner: { js: 'import * as __fourJCrypto from "node:crypto"; const require = (name) => { if (name === "node:crypto") return __fourJCrypto; throw new Error("Unsupported server module"); };' } } : {})
  });
  if (result.outputFiles?.length !== 1) refused();
  return result.outputFiles[0].contents;
}
async function buildCloudflare({ root = path.resolve(__dirname, '..'), test = false } = {}) {
  root = fs.realpathSync(root);
  const mode = test ? 'test' : 'production';
  const stage = path.join(root, 'work', 'cloudflare-' + mode);
  const executorStage = stage + '-executor';
  const control = stage + '-deploy', executorControl = executorStage + '-deploy';
  for (const folder of [stage, executorStage, control, executorControl]) ownedDirectory(root, folder);
  const allowed = [...(test ? ['index.html'] : PUBLIC_FILES), '_worker.js', '_routes.json'];
  // Refuse stale private files before writing either deployable directory.
  inspectPackage(stage, allowed, false);
  inspectPackage(executorStage, EXECUTOR_FILES, false);
  const configs = deploymentConfigs(JSON.parse(fs.readFileSync(path.join(root, 'cloudflare', 'wrangler.' + mode + '.json'), 'utf8')), test);
  const [router, executor] = await Promise.all([bundle(root, 'cloudflare/router.mjs', false), bundle(root, 'cloudflare/durable.mjs', true)]);
  const staticFiles = new Map();
  if (test) staticFiles.set('index.html', TEST_HTML);
  else for (const rel of PUBLIC_FILES) {
    const source = path.join(root, 'public', rel);
    ownedDirectory(root, path.dirname(source));
    if (!fs.lstatSync(source).isFile() || fs.lstatSync(source).isSymbolicLink()) refused();
    staticFiles.set(rel, fs.readFileSync(source));
  }
  for (const [rel, data] of staticFiles) writeFile(path.join(stage, rel), data);
  writeFile(path.join(stage, '_worker.js'), router);
  writeFile(path.join(stage, '_routes.json'), JSON.stringify({ version: 1, include: ['/api/pix/*'], exclude: [] }, null, 2) + '\n');
  writeFile(path.join(executorStage, 'index.mjs'), executor);
  writeFile(path.join(control, 'wrangler.json'), JSON.stringify(configs.pages, null, 2) + '\n');
  writeFile(path.join(executorControl, 'wrangler.json'), JSON.stringify(configs.executor, null, 2) + '\n');
  inspectPackage(stage, allowed);
  inspectPackage(executorStage, EXECUTOR_FILES);
  return { stage: path.relative(root, stage).replaceAll('\\', '/'), executorStage: path.relative(root, executorStage).replaceAll('\\', '/'), executorConfig: path.relative(root, path.join(executorControl, 'wrangler.json')).replaceAll('\\', '/'), mode, serverBundled: true, secretsEmbedded: false, sqliteExecutor: true, executorPublicRoutes: false };
}
module.exports = { buildCloudflare, deploymentConfigs, inspectPackage, bundle, PUBLIC_FILES, PUBLIC_VARS, EXECUTOR_FILES, TEST_HTML };
if (require.main === module) buildCloudflare({ test: process.argv.includes('--test') })
  .then(result => console.log(JSON.stringify(result)))
  .catch(() => { console.error('Falha no empacotamento Cloudflare. Confira as fontes e a lista permitida.'); process.exitCode = 1; });
