'use strict';
// Public pages are maintained as source. This replaces the historical one-off generator,
// so running finalize never overwrites reviewed copy or cookie controls.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const pub=path.join(__dirname,'public'),names=['sobre.html','guia.html','privacidade.html','contato.html'];
for(const name of names){
 const html=fs.readFileSync(path.join(pub,name),'utf8');
 assert.equal((html.match(/<h1\b/g)||[]).length,1,name+' must have one heading');
 for(const asset of ['public-site.css','consent.css','consent.js'])assert.ok(html.includes(asset),name+' missing '+asset);
 assert.ok(html.includes('data-cookie-settings'),name+' missing cookie settings');
 for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
  if(!match[2].trim())continue;
  if(/type=["']application\/json["']/i.test(match[1]))JSON.parse(match[2]);else new vm.Script(match[2]);
 }
 assert.doesNotMatch(html,/adsbygoogle\.js|firebase-firestore/);
}
const guide=fs.readFileSync(path.join(pub,'guia.html'),'utf8');
for(const flag of ['enabled','approvalConfirmed','certifiedCmpConfigured'])assert.match(guide,new RegExp(flag+':false'));
const app=fs.readFileSync(path.join(pub,'index.html'),'utf8');
assert.doesNotMatch(app,/adsbygoogle\.js/);
const {readPublicConfig,embeddedConfig}=require('./frontend/monetization-build-config.cjs');
const expectedMonetization=readPublicConfig(__dirname);
assert.deepEqual(embeddedConfig(app),expectedMonetization);
assert.equal(expectedMonetization.publicPayments&&expectedMonetization.pilotEnabled,false);
assert.equal(expectedMonetization.adsEnabled,false);
for(const name of ['public-ads.js','consent.js'])new vm.Script(fs.readFileSync(path.join(pub,name),'utf8'));
console.log(JSON.stringify({publicPages:names.length,scriptsValid:true,adsEnabled:false,paymentsEnabled:expectedMonetization.publicPayments,pixPilotEnabled:expectedMonetization.pilotEnabled}));

