'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { Readable } = require('node:stream');
const { PROJECT_NAME, ACCOUNT_ID, DATABASE_ID, configureWebhookSecret, validateInput,
  validateConfig, readInput, safeFailure } = require('./configurar-webhook-pix-teste.cjs');
const INPUT = { webhookSecret: 'synthetic_webhook_secret_123456789' };
const OAUTH = 'synthetic_oauth_token_123456789';
const CONFIG = { name: PROJECT_NAME, d1_databases: [{ binding: 'BILLING_DB', database_id: DATABASE_ID }], vars: {
  FIREBASE_PROJECT_ID: 'fjfinance-pix-test', MP_TEST_FIREBASE_PROJECT_ID: 'fjfinance-pix-test',
  MP_PRODUCTION_FIREBASE_PROJECT_ID: 'financas-familia-9480b', MP_LIVE_MODE: 'false',
  MP_COLLECTOR_ID: '123456', MP_APPLICATION_ID: '234567', PAYMENTS_ENABLED: 'true',
  ALLOWED_ORIGINS: '["https://4jfinance-pix-test.pages.dev"]'
} };
const response = (value, status=200) => ({ ok: status>=200&&status<300, status, text: async()=>JSON.stringify(value) });
function scenario({ accountId = ACCOUNT_ID, name = PROJECT_NAME, failPatch = false } = {}) {
  const calls = [];
  const state = { id: 'synthetic-project-id', name, account_id: ACCOUNT_ID, deployment_configs: {
    production: { env_vars: { ...Object.fromEntries(Object.entries(CONFIG.vars).map(([key,value])=>[key,{type:'plain_text',value}])),
      MP_ACCESS_TOKEN: { type:'secret_text' }, MP_WEBHOOK_SECRET: { type:'secret_text' },
      UNRELATED_SECRET: { type:'secret_text',value:'masked_DO_NOT_COPY' } },
      wrangler_config_hash:'synthetic-hash', d1_databases: { BILLING_DB: { id:DATABASE_ID } } },
    preview: { env_vars: { PREVIEW: { type:'plain_text',value:'keep-preview' } } }
  } };
  const fetchImpl = async (url, options) => {
    calls.push({url,options});assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer '+OAUTH);
    assert.match(url,/^https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\//);
    if(url.endsWith('/accounts/'+ACCOUNT_ID))return response({success:true,result:{id:accountId}});
    assert.equal(url,'https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT_ID+'/pages/projects/'+PROJECT_NAME);
    if(options.method==='PATCH'){
      if(failPatch)throw Error(INPUT.webhookSecret+OAUTH);
      const body=JSON.parse(options.body);
      assert.deepEqual(Object.keys(body),['deployment_configs']);
      assert.deepEqual(Object.keys(body.deployment_configs),['production']);
      assert.deepEqual(Object.keys(body.deployment_configs.production).sort(),['env_vars','wrangler_config_hash']);
      assert.deepEqual(body.deployment_configs.production.env_vars,{MP_WEBHOOK_SECRET:{type:'secret_text',value:INPUT.webhookSecret}});
      assert.equal(body.deployment_configs.production.wrangler_config_hash,'synthetic-hash');
      assert.equal(options.body.includes('MP_ACCESS_TOKEN'),false);assert.equal(options.body.includes('masked_DO_NOT_COPY'),false);
      state.deployment_configs.production.env_vars.MP_WEBHOOK_SECRET={type:'secret_text'};
    }
    return response({success:true,result:structuredClone(state)});
  };
  return {calls,state,options:{config:CONFIG,fetchImpl,getCloudflareToken:async()=>OAUTH,now:()=>Date.UTC(2026,9,15)}};
}
test('production config, other account/project/database and token-shaped input fail before PATCH',async()=>{
  const badConfigs=[{...CONFIG,name:'4jfinance'},{...CONFIG,account_id:'other'},
    {...CONFIG,vars:{...CONFIG.vars,MP_LIVE_MODE:'true'}},
    {...CONFIG,vars:{...CONFIG.vars,FIREBASE_PROJECT_ID:'financas-familia-9480b'}},
    {...CONFIG,d1_databases:[{binding:'BILLING_DB',database_id:'other'}]}];
  for(const config of badConfigs){const s=scenario();await assert.rejects(configureWebhookSecret(INPUT,{...s.options,config}),{code:'INVALID_TEST_CONFIG'});assert.equal(s.calls.length,0);}
  for(const secret of ['APP_USR-1234567890123456789','TEST-12345678901234567890','Bearer12345678901234567890','https://secrets.example/not-valid','bad\nsecretlongenough',OAUTH]){
    const s=scenario();await assert.rejects(configureWebhookSecret({webhookSecret:secret},s.options),{code:'INVALID_INPUT'});assert.equal(s.calls.length,0);
  }
  for(const args of [{accountId:'other'},{name:'4jfinance'}]){const s=scenario(args);await assert.rejects(configureWebhookSecret(INPUT,s.options));assert.equal(s.calls.some(c=>c.options.method==='PATCH'),false);}
});
test('PATCH contains only webhook secret; Access Token, preview, D1 and public config stay equal',async()=>{
  const s=scenario();const before=structuredClone(s.state.deployment_configs);const report=await configureWebhookSecret(INPUT,s.options);
  assert.equal(s.calls.length,4);assert.equal(s.calls.filter(c=>c.options.method==='PATCH').length,1);
  assert.deepEqual(s.state.deployment_configs,before);
  assert.deepEqual(report,{ok:true,test:true,at:'2026-10-15T00:00:00.000Z',projectName:PROJECT_NAME,
    webhookSecretConfigured:true,accessTokenChanged:false,deploymentRequired:true});
  for(const value of [INPUT.webhookSecret,OAUTH,'masked_DO_NOT_COPY'])assert.equal(JSON.stringify(report).includes(value),false);
  assert.equal(s.calls.some(c=>c.url.includes('mercadopago')||c.url.includes('/deployments')),false);
});
test('provider failures and unknown write result expose only safe metadata',async()=>{
  const s=scenario({failPatch:true});let error;try{await configureWebhookSecret(INPUT,s.options);}catch(e){error=e;}
  const failure=safeFailure(error);assert.equal(failure.errorCode,'CF_REQUEST_FAILED');assert.equal(failure.cloudflareWriteAttempted,true);assert.equal(failure.cloudflareWriteConfirmed,false);
  const outputs=[failure,safeFailure(new Error(INPUT.webhookSecret)),safeFailure({code:OAUTH})];
  for(const value of [INPUT.webhookSecret,OAUTH])assert.equal(JSON.stringify(outputs).includes(value),false);
});
test('remote public mode drift and collateral changes reject setup',async()=>{
  const drift=scenario();drift.state.deployment_configs.production.env_vars.MP_LIVE_MODE.value='true';
  await assert.rejects(configureWebhookSecret(INPUT,drift.options),{code:'CF_CONFIG_INVALID'});assert.equal(drift.calls.some(c=>c.options.method==='PATCH'),false);
  const s=scenario();const original=s.options.fetchImpl;s.options.fetchImpl=async(url,options)=>{const r=await original(url,options);if(options.method==='PATCH')s.state.deployment_configs.preview.env_vars.PREVIEW.value='unexpected';return r;};
  await assert.rejects(configureWebhookSecret(INPUT,s.options),{code:'CF_VERIFICATION_FAILED'});
});
test('stdin is the sole secret input; PowerShell wrapper uses one SecureString and UTF8 bytes',async()=>{
  assert.deepEqual(await readInput(Readable.from([JSON.stringify(INPUT)])),INPUT);
  await assert.rejects(readInput(Readable.from([JSON.stringify({...INPUT,accessToken:'must-not-be-accepted'})])),{code:'INVALID_INPUT'});
  assert.throws(()=>validateInput({webhookSecret:'short'}),{code:'INVALID_INPUT'});
  validateConfig(CONFIG);
  const ps=fs.readFileSync(require('node:path').join(__dirname,'configurar-webhook-pix-teste.ps1'));
  assert.deepEqual([...ps.subarray(0,3)],[239,187,191]);const text=ps.toString('utf8');
  assert.equal((text.match(/-AsSecureString/g)||[]).length,1);assert.match(text,/StandardInput\.BaseStream\.Write/);
  assert.match(text,/ReadToEndAsync\(\)/);assert.match(text,/ZeroFreeBSTR/);assert.match(text,/Pressione Enter para fechar/);
  assert.doesNotMatch(text,/StandardInputEncoding\s*=|setupAccessPlain/);
  assert.match(text,/\$setupStart\.Arguments = '"' \+ \$setupScriptPath \+ '"'/);
});
