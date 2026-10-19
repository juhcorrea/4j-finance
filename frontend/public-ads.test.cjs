'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const create=require('../public/public-ads.js');
const localChoice=allowed=>({source:'4j-preferences',ready:true,adsAllowed:allowed});
const tc=overrides=>({cmpId:300,cmpStatus:'loaded',eventStatus:'tcloaded',gdprApplies:false,...overrides});
function setup(overrides={}){
 const scripts=[],calls=[],events={};let observer,errorObserver,cmpObserver,reloads=0,reply=async()=>({data:{adFreeLifetime:false}});
 const config={enabled:true,approvalConfirmed:true,certifiedCmpConfigured:true,publisherId:'ca-pub-9462093834252455',...overrides};
 const doc={head:{appendChild:s=>scripts.push(s)},createElement:()=>({}),getElementById:()=>({textContent:JSON.stringify({projectId:'test',apiKey:'public-test'})}),addEventListener:(type,fn)=>events['doc-'+type]=fn};
 const auth={onIdTokenChanged(fn,error){observer=fn;errorObserver=error;return()=>{};}};
 const firebase={apps:[],initializeApp(data){this.apps.push(data);},auth:()=>auth,functions(){},app:()=>({functions:region=>({httpsCallable:name=>async data=>{calls.push({region,name,data});return reply();}})})};
 const win={PUBLIC_ADS_CONFIG:config,firebase,FourJConsent:{getState:()=>localChoice(true)},__tcfapi:(cmd,v,fn)=>{assert.equal(cmd,'addEventListener');assert.equal(v,2);cmpObserver=fn;},addEventListener:(type,fn)=>events[type]=fn};
 const location={href:'https://4j.example/guia.html',pathname:'/guia.html',reload:()=>reloads++},c=create({window:win,document:doc,location});
 return{c,scripts,calls,events,doc,win,location,get reloads(){return reloads;},setReply(fn){reply=fn;},settle(user){auth.currentUser=user;observer(user);},fail(){errorObserver(new Error('offline'));},cmp(data=tc(),success=true){cmpObserver(data,success);},start(){c.start();if(cmpObserver)cmpObserver(tc(),true);},get observer(){return observer;}};
}
const flush=()=>new Promise(setImmediate);
for(const flag of ['enabled','approvalConfirmed','certifiedCmpConfigured'])
 test(flag+' must be explicitly enabled before Auth or ads initialize',()=>{const h=setup({[flag]:false});h.start();assert.equal(h.observer,undefined);assert.equal(h.scripts.length,0);});
for(const path of ['/','/index.html','/sobre.html','/contato.html','/privacidade.html'])
 test('no ads on non-advertising route '+path,()=>{const h=setup();h.location.pathname=path;h.start();assert.equal(h.observer,undefined);assert.equal(h.scripts.length,0);});
test('local preference alone cannot replace a real CMP',()=>{const h=setup();delete h.win.__tcfapi;h.start();assert.equal(h.c.state.phase,'cmp-required');assert.equal(h.scripts.length,0);});
test('legacy config booleans cannot stand in for a local choice',()=>{const h=setup({consentReady:true,consentGranted:true});delete h.win.FourJConsent;h.start();h.settle(null);assert.equal(h.scripts.length,0);h.c.setConsent({ready:true,adsAllowed:true});assert.equal(h.scripts.length,0);});
test('waits for Auth before classifying anonymous visitor',()=>{const h=setup();h.start();assert.equal(h.c.state.settled,false);assert.equal(h.scripts.length,0);h.settle(null);assert.equal(h.scripts.length,1);assert.equal(h.calls.length,0);});
test('consent startup event can follow script startup',()=>{const h=setup();delete h.win.FourJConsent;h.start();h.settle(null);assert.equal(h.scripts.length,0);h.events['4j:consent-change']({detail:localChoice(true)});assert.equal(h.scripts.length,1);});
test('rejection keeps ads blocked despite CMP approval',()=>{const h=setup();h.win.FourJConsent.getState=()=>localChoice(false);h.start();h.settle(null);assert.equal(h.scripts.length,0);});
test('consent withdrawal reloads once to clear all loaded Auto Ads formats',()=>{const h=setup();h.start();h.settle(null);h.c.setConsent(localChoice(false));h.c.setConsent(localChoice(false));assert.equal(h.reloads,1);assert.equal(h.c.eligible(),false);h.c.setConsent(localChoice(true));assert.equal(h.scripts.length,1);});
test('CMP failure / unknown geography / UI still open never permits ads',()=>{for(const data of [tc({cmpStatus:'stub'}),tc({cmpStatus:'loading'}),tc({gdprApplies:undefined}),tc({eventStatus:'cmpuishown'}),tc({cmpId:undefined})]){const h=setup();h.c.start();h.cmp(data);h.settle(null);assert.equal(h.scripts.length,0);}});
test('CMP success flag is required',()=>{const h=setup();h.c.start();h.cmp(tc(),false);h.settle(null);assert.equal(h.scripts.length,0);});
const european=()=>tc({gdprApplies:true,isServiceSpecific:true,tcString:'synthetic-test-only',purpose:{consents:Object.fromEntries([1,2,3,4,7,9,10].map(id=>[id,true]))},vendor:{consents:{755:true}}});
test('TCF choice availability is not consent; vendor and all conservative purposes must allow',()=>{for(const mutate of [d=>{d.vendor.consents[755]=false;},d=>{d.purpose.consents[1]=false;},d=>{d.purpose.consents[4]=false;},d=>{d.tcString='';},d=>{d.publisher={restrictions:{4:{755:0}}};}]){const h=setup(),d=european();mutate(d);h.c.start();h.cmp(d);h.settle(null);assert.equal(h.scripts.length,0);}});
test('fully consented CMP choice plus local preference may load',()=>{const h=setup();h.c.start();h.cmp(european());h.settle(null);assert.equal(h.scripts.length,1);});
test('CMP revocation clears loaded ads',()=>{const h=setup();h.start();h.settle(null);h.cmp(tc({eventStatus:'cmpuishown'}));assert.equal(h.reloads,1);assert.equal(h.c.eligible(),false);});
test('paid account never requests an AdSense script',async()=>{const h=setup();h.setReply(async()=>({data:{adFreeLifetime:true}}));h.start();h.settle({uid:'paid'});await flush();assert.equal(h.c.state.phase,'paid');assert.equal(h.scripts.length,0);});
test('free account waits for backend then loads once',async()=>{const h=setup();h.start();h.settle({uid:'free'});assert.equal(h.scripts.length,0);await flush();assert.equal(h.scripts.length,1);await h.c.refresh(true);assert.equal(h.scripts.length,1);});
test('backend unavailable or malformed entitlement fails closed',async()=>{for(const reply of [async()=>{throw Error('offline');},async()=>({data:{adFreeLifetime:'false'}})]){const h=setup();h.setReply(reply);h.start();h.settle({uid:'x'});await flush();assert.equal(h.c.state.phase,'unavailable');assert.equal(h.scripts.length,0);}});
test('Auth error invalidates prior anonymous state before later consent/focus',async()=>{const h=setup();h.win.FourJConsent.getState=()=>localChoice(false);h.start();h.settle(null);h.fail();h.c.setConsent(localChoice(true));h.events.focus();await h.c.refresh(true);assert.equal(h.c.state.settled,false);assert.equal(h.scripts.length,0);});
test('Auth error invalidates pending free backend response',async()=>{const h=setup();let resolve;h.setReply(()=>new Promise(r=>resolve=r));h.start();h.settle({uid:'x'});h.fail();resolve({data:{adFreeLifetime:false}});await flush();assert.equal(h.c.state.settled,false);assert.equal(h.scripts.length,0);});
test('late free response cannot overwrite new paid account',async()=>{const h=setup();let resolve;h.setReply(()=>new Promise(r=>resolve=r));h.start();h.settle({uid:'a'});h.setReply(async()=>({data:{adFreeLifetime:true}}));h.settle({uid:'b'});await flush();resolve({data:{adFreeLifetime:false}});await flush();assert.equal(h.c.state.phase,'paid');assert.equal(h.scripts.length,0);});
test('revocation invalidates pending backend response',async()=>{const h=setup();let resolve;h.setReply(()=>new Promise(r=>resolve=r));h.start();h.settle({uid:'a'});h.c.setConsent(localChoice(false));resolve({data:{adFreeLifetime:false}});await flush();assert.equal(h.scripts.length,0);});
test('backend confirmation of paid status removes previously loaded ads',async()=>{const h=setup();h.start();h.settle({uid:'a'});await flush();h.setReply(async()=>({data:{adFreeLifetime:true}}));await h.c.refresh(true);assert.equal(h.reloads,1);});
test('account change reloads before evaluation of the new account',()=>{const h=setup();h.start();h.settle(null);h.settle({uid:'a'});assert.equal(h.reloads,1);assert.equal(h.calls.length,0);});
test('same-UID token refresh rechecks updated benefit',async()=>{const h=setup();h.start();h.settle({uid:'a'});await flush();h.setReply(async()=>({data:{adFreeLifetime:true}}));h.settle({uid:'a'});await flush();assert.equal(h.reloads,1);});
test('storage fallback clears loaded ads on payment signal without trusting local entitlement',()=>{const h=setup();h.start();h.settle(null);h.events.storage({key:'4j-entitlement-refresh'});assert.equal(h.reloads,1);assert.equal(h.c.eligible(),false);});
test('BroadcastChannel clears loaded ads on payment signal',()=>{const h=setup();h.win.BroadcastChannel=function(name){assert.equal(name,'4j-entitlement-refresh');};h.start();h.settle(null);h.c.state.channel.onmessage({data:{type:'refresh'}});assert.equal(h.reloads,1);});
test('BFCache restore removes stale ads and forces a fresh check via reload',()=>{const h=setup();h.start();h.settle(null);h.events.pageshow({persisted:true});assert.equal(h.reloads,1);});
test('public guide ships disabled, with no financial SDK or stored premium flag',()=>{const html=fs.readFileSync(__dirname+'/../public/guia.html','utf8'),js=fs.readFileSync(__dirname+'/../public/public-ads.js','utf8');assert.doesNotMatch(html,/firestore-compat|firebase-firestore/);assert.doesNotMatch(js,/localStorage|sessionStorage|collection\(/);assert.match(html,/enabled:false/);});


test('visible signed-in guide rechecks payment in another device within one minute',async()=>{
 const h=setup(),timers=new Map();let seq=0;
 h.win.setTimeout=(fn,ms)=>{const id=++seq;timers.set(id,{fn,ms});return id;};
 h.win.clearTimeout=id=>timers.delete(id);
 h.start();h.settle({uid:'a'});await flush();
 assert.equal(timers.size,1);const tick=[...timers.values()][0];assert.equal(tick.ms,60000);
 h.setReply(async()=>({data:{adFreeLifetime:true}}));await tick.fn();await flush();
 assert.equal(h.reloads,1);assert.equal(h.c.state.phase,'paid');assert.equal(h.c.eligible(),false);
});
test('public payment polling pauses when hidden and resumes on visibility',async()=>{
 const h=setup(),timers=new Map();let seq=0;
 h.win.setTimeout=(fn,ms)=>{const id=++seq;timers.set(id,{fn,ms});return id;};h.win.clearTimeout=id=>timers.delete(id);
 h.start();h.settle({uid:'a'});await flush();assert.equal(timers.size,1);
 h.doc.hidden=true;h.events['doc-visibilitychange']();assert.equal(timers.size,0);
 const before=h.calls.length;h.doc.hidden=false;h.events['doc-visibilitychange']();await flush();
 assert.equal(h.calls.length,before+1);assert.equal(timers.size,1);
 h.events.pagehide();assert.equal(timers.size,0);
});
test('anonymous, paid and disabled visitors never start recurring benefit requests',async()=>{
 for(const mode of ['anonymous','paid','disabled']){
  const h=setup({enabled:mode!=='disabled'}),timers=[];
  h.win.setTimeout=(fn,ms)=>timers.push({fn,ms});h.win.clearTimeout=()=>{};
  if(mode==='paid')h.setReply(async()=>({data:{adFreeLifetime:true}}));
  h.start();if(h.observer)h.settle(mode==='anonymous'?null:{uid:'a'});await flush();
  assert.equal(timers.length,0,mode);
 }
});


function cloudflarePublic(overrides={}){const h=setup({provider:'cloudflare',apiBase:'/api/pix',...overrides});h.requests=[];h.win.fetch=async(url,options)=>{h.requests.push({url,options});return {ok:true,json:async()=>({data:{adFreeLifetime:false}})};};h.user={uid:'synthetic-user',getIdToken:async()=> 'synthetic-id-token'};return h;}

test('Cloudflare public status uses the settled Auth user and an empty same-origin callable body',async()=>{const h=cloudflarePublic({apiBase:'/api/pix/'});delete h.win.firebase.functions;h.start();h.settle(h.user);await flush();assert.equal(h.requests.length,1);const r=h.requests[0];assert.equal(r.url,'https://4j.example/api/pix/getMonetizationStatus');assert.equal(r.options.method,'POST');assert.equal(r.options.headers.Authorization,'Bearer synthetic-id-token');assert.equal(r.options.headers['Content-Type'],'application/json');assert.equal(r.options.redirect,'error');assert.deepEqual(JSON.parse(r.options.body),{data:{}});assert.equal(h.calls.length,0);assert.equal(h.scripts.length,1);});

test('Cloudflare public ads reject unsafe origins before Auth or token use',()=>{for(const apiBase of ['https://external.example/api/pix','//external.example/api/pix','http://4j.example/api/pix','https://name:pass@4j.example/api/pix','/api/pix?url=other','/api/pix#route']){const h=cloudflarePublic({apiBase});h.start();assert.equal(h.observer,undefined);assert.equal(h.requests.length,0);assert.equal(h.scripts.length,0);assert.equal(h.c.state.phase,'unavailable');}const h=cloudflarePublic();h.location.href='http://4j.example/guia.html';h.start();assert.equal(h.observer,undefined);assert.equal(h.requests.length,0);});

test('Cloudflare public status supports explicit localhost tests',async()=>{const h=cloudflarePublic();h.location.href='http://localhost:8080/guia.html';h.start();h.settle(h.user);await flush();assert.equal(h.requests[0].url,'http://localhost:8080/api/pix/getMonetizationStatus');});

test('Cloudflare public token from an earlier account is never sent',async()=>{const h=cloudflarePublic();let resolve;h.user.getIdToken=()=>new Promise(r=>resolve=r);h.start();h.settle(h.user);h.settle({uid:'new-user',getIdToken:async()=> 'new-synthetic-token'});await flush();resolve('old-synthetic-token');await flush();assert.equal(h.requests.length,1);assert.equal(h.requests[0].options.headers.Authorization,'Bearer new-synthetic-token');});

test('Cloudflare public status invalidates a pending token after consent withdrawal or Auth error',async()=>{for(const invalidate of [h=>h.c.setConsent(localChoice(false)),h=>h.fail()]){const h=cloudflarePublic();let resolve;h.user.getIdToken=()=>new Promise(r=>resolve=r);h.start();h.settle(h.user);invalidate(h);resolve('old-synthetic-token');await flush();assert.equal(h.requests.length,0);assert.equal(h.scripts.length,0);}});

test('Cloudflare public paid account never requests AdSense and never reads claim fallback',async()=>{const h=cloudflarePublic();h.user.getIdTokenResult=()=>{throw Error('Claims must not be used');};h.win.fetch=async()=>({ok:true,json:async()=>({data:{adFreeLifetime:true}})});h.start();h.settle(h.user);await flush();assert.equal(h.c.state.phase,'paid');assert.equal(h.scripts.length,0);assert.equal(h.calls.length,0);});

test('Cloudflare public failures block ads with no Firebase callable fallback',async()=>{for(const reply of [async()=>{throw Error('offline');},async()=>({ok:false,json:async()=>({error:{status:'UNAVAILABLE'}})}),async()=>({ok:true,json:async()=>({data:{adFreeLifetime:'false'}})})]){const h=cloudflarePublic();h.win.fetch=reply;h.start();h.settle(h.user);await flush();assert.equal(h.c.state.phase,'unavailable');assert.equal(h.scripts.length,0);assert.equal(h.calls.length,0);}});

test('Cloudflare public late free response cannot overwrite a new paid account',async()=>{const h=cloudflarePublic();let resolve;h.win.fetch=()=>new Promise(r=>resolve=r);h.start();h.settle(h.user);await flush();h.win.fetch=async()=>({ok:true,json:async()=>({data:{adFreeLifetime:true}})});h.settle({uid:'paid-new',getIdToken:async()=> 'synthetic-new'});await flush();resolve({ok:true,json:async()=>({data:{adFreeLifetime:false}})});await flush();assert.equal(h.c.state.phase,'paid');assert.equal(h.scripts.length,0);});
