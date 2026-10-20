'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const test=require('node:test'),assert=require('node:assert/strict');
const {publicConfig,embeddedConfig}=require('../frontend/monetization-build-config.cjs');
const root=path.resolve(__dirname,'..');
const modes=[{pilotEnabled:false,publicPayments:false},{pilotEnabled:true,publicPayments:false},{pilotEnabled:false,publicPayments:true}];
test('reviewed disabled pilot and public modes never include ads or account identifiers',()=>{
 for(const mode of modes){
  const result=publicConfig(mode);assert.equal(result.enabled,mode.pilotEnabled||mode.publicPayments);assert.equal(result.pilotEnabled,mode.pilotEnabled);assert.equal(result.publicPayments,mode.publicPayments);assert.equal(result.adsEnabled,false);assert.deepEqual(result.adPageAllowlist,[]);assert.equal(result.provider,'cloudflare');assert.deepEqual(Object.keys(result),['enabled','region','adsEnabled','adPageAllowlist','provider','apiBase','publicPayments','pilotEnabled']);
 }
});
test('missing malformed or expanded build modes fail closed',()=>{
 for(const input of [undefined,null,true,[],{},'true',{pilotEnabled:'true'},{pilotEnabled:1},{pilotEnabled:true,uids:['synthetic-user']},{pilotEnabled:false,publicPayments:'true'},{pilotEnabled:true,publicPayments:true},{pilotEnabled:false,publicPayments:true,adsEnabled:true},{pilotEnabled:false},{publicPayments:true},{pilotEnabled:'false',publicPayments:true}])assert.throws(()=>publicConfig(input));
 assert.throws(()=>embeddedConfig('<script>window.MONETIZATION_CONFIG=(()=>({enabled:true}))();</script>'));
});
for(const mode of modes)test('isolated build reproduces explicit Pix mode '+JSON.stringify(mode),()=>{
 const {pilotEnabled,publicPayments}=mode;
 const temporaryRoot=fs.realpathSync(os.tmpdir()),temporary=fs.mkdtempSync(path.join(temporaryRoot,'4j-pilot-build-'));
 try{
  for(const dir of ['source','frontend'])fs.cpSync(path.join(root,dir),path.join(temporary,dir),{recursive:true});
  fs.mkdirSync(path.join(temporary,'privacy'));for(const name of ['apply-privacy.cjs','email-privacy.js'])fs.copyFileSync(path.join(root,'privacy',name),path.join(temporary,'privacy',name));
  fs.copyFileSync(path.join(root,'build.cjs'),path.join(temporary,'build.cjs'));
  fs.writeFileSync(path.join(temporary,'frontend/monetization-build.json'),JSON.stringify(mode));
  cp.execFileSync(process.execPath,['build.cjs'],{cwd:temporary,stdio:'pipe',windowsHide:true});
  const html=fs.readFileSync(path.join(temporary,'public/index.html'),'utf8'),report=JSON.parse(fs.readFileSync(path.join(temporary,'build-report.json'),'utf8'));
  assert.deepEqual(embeddedConfig(html),publicConfig(mode));assert.equal(report.pixPilotEnabled,pilotEnabled);assert.equal(report.frontendIntegrationEnabled,pilotEnabled||publicPayments);assert.equal(report.paymentsEnabled,publicPayments);assert.equal(report.adsEnabled,false);assert.doesNotMatch(html,/adsbygoogle\.js/);
  cp.execFileSync(process.execPath,['build.cjs'],{cwd:temporary,stdio:'pipe',windowsHide:true});assert.equal(fs.readFileSync(path.join(temporary,'public/index.html'),'utf8'),html);
 }finally{const resolved=fs.realpathSync(temporary);if(path.dirname(resolved)!==temporaryRoot||!path.basename(resolved).startsWith('4j-pilot-build-'))throw Error('Unexpected temporary directory');fs.rmSync(resolved,{recursive:true,force:true});}
});
