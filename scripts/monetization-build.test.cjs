'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const test=require('node:test'),assert=require('node:assert/strict');
const {publicConfig,embeddedConfig}=require('../frontend/monetization-build-config.cjs');
const root=path.resolve(__dirname,'..');
test('pilot build config never includes public purchasing, ads or account identifiers',()=>{
 for(const pilotEnabled of [false,true]){
  const result=publicConfig({pilotEnabled});assert.equal(result.enabled,pilotEnabled);assert.equal(result.pilotEnabled,pilotEnabled);assert.equal(result.publicPayments,false);assert.equal(result.adsEnabled,false);assert.deepEqual(result.adPageAllowlist,[]);assert.equal(result.provider,'cloudflare');assert.deepEqual(Object.keys(result),['enabled','region','adsEnabled','adPageAllowlist','provider','apiBase','publicPayments','pilotEnabled']);
 }
});
test('missing malformed or expanded build modes fail closed',()=>{
 for(const input of [undefined,null,true,[],{},'true',{pilotEnabled:'true'},{pilotEnabled:1},{pilotEnabled:true,uids:['synthetic-user']},{pilotEnabled:false,publicPayments:true},{pilotEnabled:true,adsEnabled:true}])assert.throws(()=>publicConfig(input));
 assert.throws(()=>embeddedConfig('<script>window.MONETIZATION_CONFIG=(()=>({enabled:true}))();</script>'));
});
for(const pilotEnabled of [false,true])test('isolated build reproduces explicit pilot mode '+pilotEnabled,()=>{
 const temporaryRoot=fs.realpathSync(os.tmpdir()),temporary=fs.mkdtempSync(path.join(temporaryRoot,'4j-pilot-build-'));
 try{
  for(const dir of ['source','frontend'])fs.cpSync(path.join(root,dir),path.join(temporary,dir),{recursive:true});
  fs.mkdirSync(path.join(temporary,'privacy'));for(const name of ['apply-privacy.cjs','email-privacy.js'])fs.copyFileSync(path.join(root,'privacy',name),path.join(temporary,'privacy',name));
  fs.copyFileSync(path.join(root,'build.cjs'),path.join(temporary,'build.cjs'));
  fs.writeFileSync(path.join(temporary,'frontend/monetization-build.json'),JSON.stringify({pilotEnabled}));
  cp.execFileSync(process.execPath,['build.cjs'],{cwd:temporary,stdio:'pipe',windowsHide:true});
  const html=fs.readFileSync(path.join(temporary,'public/index.html'),'utf8'),report=JSON.parse(fs.readFileSync(path.join(temporary,'build-report.json'),'utf8'));
  assert.deepEqual(embeddedConfig(html),publicConfig({pilotEnabled}));assert.equal(report.pixPilotEnabled,pilotEnabled);assert.equal(report.frontendIntegrationEnabled,pilotEnabled);assert.equal(report.paymentsEnabled,false);assert.equal(report.adsEnabled,false);assert.doesNotMatch(html,/adsbygoogle\.js/);
  cp.execFileSync(process.execPath,['build.cjs'],{cwd:temporary,stdio:'pipe',windowsHide:true});assert.equal(fs.readFileSync(path.join(temporary,'public/index.html'),'utf8'),html);
 }finally{const resolved=fs.realpathSync(temporary);if(path.dirname(resolved)!==temporaryRoot||!path.basename(resolved).startsWith('4j-pilot-build-'))throw Error('Unexpected temporary directory');fs.rmSync(resolved,{recursive:true,force:true});}
});
