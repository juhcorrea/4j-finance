const fs=require('node:fs');
const vm=require('node:vm');
const test=require('node:test');
const assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/monetization.js','utf8').replace(/Monetization\.install\(\);\s*$/,'');
const ORDER_ID='12345678-1234-4123-8123-123456789abc';
const account=overrides=>({adFreeLifetime:false,price:5,currency:'BRL',paymentsEnabled:true,pendingOrderId:null,...overrides});
const checkout=overrides=>({orderId:ORDER_ID,amount:5,currency:'BRL',status:'pending',adFreeLifetime:false,qrCode:'synthetic pix',qrCodeBase64:'AA==',expiresAt:Date.now()+3600000,...overrides});
function setup(config={enabled:true,adsEnabled:true,adPageAllowlist:['/guia/']}){
  let token={claims:{}};let calls=[];let timeouts=[];const events={},frames=[];
  const elements=new Map();const marker={querySelector:()=>null};elements.set('#pix-checkout',marker);elements.set('#pix-status',{textContent:''});elements.set('#modal',{open:true,addEventListener:(name,fn)=>events['modal-'+name]=fn});
  const user={uid:'user-a',emailVerified:true,getIdTokenResult:async()=>token,getIdToken:async()=>{calls.push('token-refreshed');return 'synthetic-id-token';}};
  const store={screen:'app',profile:'profile-a',demo:false,user,userDoc:{status:'approved'},auth:{currentUser:user,onIdTokenChanged:()=>()=>{}},emit(){}};
  const sandbox={window:{MONETIZATION_CONFIG:config,addEventListener:(name,fn)=>events['window-'+name]=fn},Store:store,location:{href:'https://4j.example/painel/',pathname:'/painel/',hash:'#inicio'},URL,Date,console,clearTimeout(){},setTimeout(fn,ms){timeouts.push({fn,ms});return timeouts.length;},$:selector=>elements.get(selector),esc:value=>String(value).replace(/[<>&"]/g,'_'),modal(title,html){frames.push({title,html});for(const [key,value] of elements){if(key.startsWith('#pix-')){value.isConnected=false;elements.delete(key);}}for(const match of html.matchAll(/\bid="([^"]+)"/g))elements.set('#'+match[1],{isConnected:true,querySelector:()=>null});elements.get('#modal').open=true;},familyAccessSettings(){},document:{addEventListener:(name,fn)=>events['document-'+name]=fn},navigator:{}};
  const m=vm.runInNewContext(source+'\nMonetization;',sandbox);m.sync();const transportCall=m.call.bind(m);m.call=async(name,data)=>{calls.push({name,data});return account();};
  return {m,transportCall,store,elements,marker,calls,timeouts,sandbox,events,frames,setToken(value){token=value;}};
}
test('ads fail closed until confirmed free and explicitly allowlisted',()=>{const {m}=setup();assert.equal(m.shouldLoadAds('/guia/'),false);m.phase='free';assert.equal(m.shouldLoadAds('/guia/'),true);assert.equal(m.shouldLoadAds('/painel/'),false);m.adFree=true;assert.equal(m.shouldLoadAds('/guia/'),false);});
test('default config cannot charge or enable ads',()=>{const {m}=setup(undefined);const s=setup({});assert.equal(s.m.enabled(),false);s.m.phase='free';assert.equal(s.m.shouldLoadAds('/guia/'),false);assert.match(s.m.card(),/Em preparação/);assert.match(s.m.card(),/disabled/);});
test('server entitlement determines free state',async()=>{const {m}=setup();await m.refresh(true);assert.equal(m.phase,'free');assert.equal(m.adFree,false);});
test('server entitlement determines paid state',async()=>{const {m}=setup();m.call=async()=>(account({adFreeLifetime:true}));await m.refresh(true);assert.equal(m.phase,'paid');assert.equal(m.adFree,true);assert.equal(m.shouldLoadAds('/guia/'),false);});
test('network failure blocks ads',async()=>{const {m}=setup();m.call=async()=>{throw new Error('network');};await m.refresh(true);assert.equal(m.phase,'unavailable');assert.equal(m.shouldLoadAds('/guia/'),false);});
test('signed entitlement preserves ad-free when status service is offline',async()=>{const {m,setToken}=setup();setToken({claims:{adFreeLifetime:true}});m.call=async()=>{throw new Error('network');};await m.refresh(true);assert.equal(m.adFree,true);assert.equal(m.shouldLoadAds('/guia/'),false);});
test('server revocation clears an older claim',async()=>{const {m,setToken}=setup();setToken({claims:{adFreeLifetime:true}});await m.refresh(true);assert.equal(m.adFree,false);assert.equal(m.phase,'free');});
test('wrong server price fails closed',async()=>{const {m}=setup();m.call=async()=>(account({price:50}));await m.refresh(true);assert.equal(m.phase,'unavailable');assert.equal(m.shouldLoadAds('/guia/'),false);});
test('benefit belongs to account rather than profile',()=>{const {m,store}=setup();m.adFree=true;m.phase='paid';store.profile='another-family';m.sync();assert.equal(m.adFree,true);assert.equal(m.phase,'paid');});
test('account switch clears entitlement and pending order',()=>{const {m,store}=setup();m.adFree=true;m.phase='paid';m.order={orderId:'old'};store.user={...store.user,uid:'user-b'};store.auth.currentUser=store.user;m.sync();assert.equal(m.adFree,false);assert.equal(m.order,null);assert.equal(m.uid,'user-b');});
test('suspended account cannot show ads or checkout',()=>{const {m,store}=setup();m.phase='free';store.userDoc.status='pending';m.sync();assert.equal(m.uid,'');assert.equal(m.current('user-a'),false);assert.equal(m.shouldLoadAds('/guia/'),false);});
test('pending response from a previous login cannot grant entitlement',async()=>{const {m,store}=setup();let resolve;m.call=()=>new Promise(r=>resolve=r);const task=m.refresh(true);await new Promise(setImmediate);store.user={...store.user,uid:'user-b'};store.auth.currentUser=store.user;m.sync();resolve(account({adFreeLifetime:true}));await task;assert.equal(m.adFree,false);assert.equal(m.uid,'user-b');});
test('demo entitlement cannot enable ads or escape to real account',()=>{const {m,store}=setup();store.demo=true;m.sync();m.demoPaid=true;m.phase='paid';assert.equal(m.shouldLoadAds('/guia/'),false);assert.equal(m.adFree,false);store.demo=false;store.user={...store.user,uid:'real-user'};store.auth.currentUser=store.user;m.sync();assert.equal(m.demoPaid,false);assert.equal(m.adFree,false);});
test('status approved alone never grants entitlement',async()=>{const {m,store,marker,elements}=setup();const order={uid:store.user.uid,orderId:ORDER_ID,marker,watch:m.watch,started:Date.now(),profile:store.profile,page:'#inicio'};m.order=order;m.call=async()=>checkout({status:'approved'});await m.check();assert.equal(m.adFree,false);assert.match(elements.get('#pix-status').textContent,/Finalizando/);});
test('confirmed server benefit updates token and paid view',async()=>{const {m,store,marker,calls}=setup();let paid=0;m.paidScreen=()=>paid++;m.order={uid:store.user.uid,orderId:'o1',marker,watch:m.watch,started:Date.now(),profile:store.profile,page:'#inicio'};m.call=async()=>({status:'approved',adFreeLifetime:true});await m.check();assert.equal(m.adFree,true);assert.equal(paid,1);assert.ok(calls.includes('token-refreshed'));});
test('polling stops when the dialog closes',()=>{const {m,store,marker,elements,timeouts}=setup();m.order={uid:store.user.uid,orderId:'o1',marker,watch:m.watch,started:Date.now(),profile:store.profile,page:'#inicio'};m.schedule(m.order);assert.equal(timeouts.at(-1).ms,15000);elements.get('#modal').open=false;const n=timeouts.length;m.schedule(m.order);assert.equal(timeouts.length,n);});
test('polling stops after profile or route change',()=>{const {m,store,marker,sandbox}=setup();m.order={uid:store.user.uid,orderId:'o1',marker,watch:m.watch,started:Date.now(),profile:store.profile,page:'#inicio'};store.profile='other';assert.equal(m.watching(m.order),false);store.profile='profile-a';sandbox.location.hash='#metas';assert.equal(m.watching(m.order),false);});
test('new checkout sends only an empty payload and never requests a document',async()=>{const h=setup();h.m.phase='free';h.m.paymentsEnabled=true;const button={},error={};const form={isConnected:true,querySelector:s=>s==='[type=submit]'?button:error};let resolve;h.m.call=(name,data)=>{h.calls.push({name,data});return new Promise(r=>resolve=r);};let shown;h.m.showOrder=o=>shown=o;const task=h.m.create(form);assert.equal(h.calls[0].name,'createPixCheckout');assert.deepEqual(Object.keys(h.calls[0].data),[]);resolve(checkout());await task;assert.equal(shown.orderId,ORDER_ID);assert.doesNotMatch(source,/CPF|name=cpf|cpf:/i);});
test('provider error content is never printed to the user',()=>{const {m}=setup();assert.doesNotMatch(m.errorText({code:'internal',message:'private-provider-payload'}),/private-provider/);});
test('no local entitlement is read and no provider secret exists',()=>{assert.doesNotMatch(source,/sessionStorage|\.getItem\(|access_token|MP_ACCESS_TOKEN|APP_USR/);});
test('confirmation broadcasts only a timestamp, never a local premium flag',async()=>{const h=setup(),writes=[];h.sandbox.window.localStorage={setItem:(key,value)=>writes.push({key,value})};await h.m.confirmPaid(h.store.user.uid,false);assert.equal(writes.length,1);assert.equal(writes[0].key,'4j-entitlement-refresh');assert.match(writes[0].value,/^\d+$/);});



test('server-disabled payments keep status readable but block new charges',async()=>{const h=setup();h.m.call=async name=>{h.calls.push(name);return account({paymentsEnabled:false});};await h.m.open();assert.equal(h.m.phase,'free');assert.equal(h.m.canCreate(),false);assert.match(h.frames.at(-1).title,/preparação/);assert.equal(h.elements.has('#pix-confirm-form'),false);assert.deepEqual(h.calls,['getMonetizationStatus']);assert.match(h.m.card(),/disabled/);});

test('missing or malformed availability and pending-order metadata fail closed',async()=>{for(const changes of [{paymentsEnabled:undefined},{paymentsEnabled:'true'},{pendingOrderId:undefined},{pendingOrderId:'other-user-order'}]){const h=setup();h.m.call=async()=>account(changes);await h.m.open();assert.equal(h.m.phase,'unavailable');assert.equal(h.m.canCreate(),false);assert.equal(h.elements.has('#pix-confirm-form'),false);}});

test('paid benefit remains available while new payments are disabled',async()=>{const h=setup();h.m.call=async()=>account({adFreeLifetime:true,paymentsEnabled:false});await h.m.open();assert.equal(h.m.adFree,true);assert.match(h.frames.at(-1).html,/Pagamento confirmado/);assert.equal(h.elements.has('#pix-confirm-form'),false);});

test('pending Pix resumes after a fresh page load without a document, including disabled new payments',async()=>{for(const paymentsEnabled of [true,false]){const h=setup();h.m.call=async(name,data)=>{h.calls.push({name,data});return name==='getMonetizationStatus'?account({paymentsEnabled,pendingOrderId:ORDER_ID}):checkout();};await h.m.open();assert.match(h.frames.at(-1).html,/Pix Copia e Cola/);assert.equal(h.elements.has('#pix-confirm-form'),false);assert.equal(h.m.order.orderId,ORDER_ID);assert.deepEqual(h.calls.map(c=>c.name),['getMonetizationStatus','checkPixCheckout']);assert.equal(h.calls[1].data.orderId,ORDER_ID);assert.equal(h.timeouts.at(-1).ms,15000);assert.match(h.m.card(),/Conferir meu Pix/);}});

test('closing then reopening recovers the same Pix without creating another',async()=>{const h=setup();h.m.call=async(name,data)=>{h.calls.push({name,data});return name==='getMonetizationStatus'?account({pendingOrderId:ORDER_ID}):checkout();};await h.m.open();h.elements.get('#modal').open=false;h.m.stop();await h.m.open();assert.equal(h.m.order.orderId,ORDER_ID);assert.equal(h.calls.filter(c=>c.name==='checkPixCheckout').length,2);assert.equal(h.calls.some(c=>c.name==='createPixCheckout'),false);});

test('failed recovery never opens a new-charge form',async()=>{const h=setup();h.m.call=async name=>{h.calls.push(name);if(name==='getMonetizationStatus')return account({pendingOrderId:ORDER_ID});throw Error('offline');};await h.m.open();assert.match(h.frames.at(-1).html,/não pague novamente/);assert.equal(h.elements.has('#pix-confirm-form'),false);assert.deepEqual(h.calls,['getMonetizationStatus','checkPixCheckout']);});

test('mismatched recovery ID and malformed QR never show a payable checkout',async()=>{for(const order of [checkout({orderId:'22345678-1234-4123-8123-123456789abc'}),checkout({qrCodeBase64:'<script>'}),checkout({adFreeLifetime:undefined}),checkout({amount:50})]){const h=setup();h.m.call=async name=>name==='getMonetizationStatus'?account({pendingOrderId:ORDER_ID}):order;await h.m.open();assert.match(h.frames.at(-1).title,/Pix anterior/);assert.equal(h.elements.has('#pix-copy-code'),false);assert.equal(h.elements.has('#pix-confirm-form'),false);}});

test('recovered approval without entitlement waits for automatic confirmation',async()=>{const h=setup();h.m.call=async name=>name==='getMonetizationStatus'?account({pendingOrderId:ORDER_ID}):checkout({status:'approved',qrCode:null,qrCodeBase64:null});await h.m.open();assert.equal(h.m.adFree,false);assert.match(h.frames.at(-1).html,/Aguardando a confirmação do benefício/);assert.equal(h.timeouts.at(-1).ms,15000);});

test('recovered paid entitlement finishes without another charge',async()=>{const h=setup();h.m.call=async name=>name==='getMonetizationStatus'?account({pendingOrderId:ORDER_ID,paymentsEnabled:false}):checkout({status:'approved',adFreeLifetime:true});await h.m.open();assert.equal(h.m.adFree,true);assert.equal(h.m.pendingOrderId,null);assert.equal(h.m.order,null);assert.match(h.frames.at(-1).html,/Pagamento confirmado/);});

test('terminal orders require an explicit action before preparing another Pix',async()=>{for(const status of ['expired','rejected','cancelled','refunded','charged_back']){const h=setup();h.m.call=async(name,data)=>{h.calls.push({name,data});return name==='getMonetizationStatus'?account({pendingOrderId:ORDER_ID}):checkout({status});};await h.m.open();assert.match(h.frames.at(-1).html,/Preparar outro Pix/);assert.equal(h.elements.has('#pix-copy-code'),false);assert.equal(h.elements.has('#pix-confirm-form'),false);assert.equal(h.timeouts.length,0);await h.m.open(true);assert.equal(h.elements.has('#pix-confirm-form'),true);assert.equal(h.calls.some(c=>c.name==='createPixCheckout'),false);assert.equal(h.calls.filter(c=>c.name==='checkPixCheckout').length,2);}});

test('terminal orders offer no new-charge action while payments are disabled',async()=>{const h=setup();h.m.call=async name=>name==='getMonetizationStatus'?account({pendingOrderId:ORDER_ID,paymentsEnabled:false}):checkout({status:'expired'});await h.m.open();assert.doesNotMatch(h.frames.at(-1).html,/monetization-new/);await h.m.open(true);assert.equal(h.elements.has('#pix-confirm-form'),false);assert.match(h.frames.at(-1).title,/preparação/);});

test('explicit replacement rechecks and preserves an order that became paid',async()=>{const h=setup();let approved=false;h.m.call=async name=>name==='getMonetizationStatus'?account({pendingOrderId:ORDER_ID}):checkout({status:approved?'approved':'expired',adFreeLifetime:approved});await h.m.open();approved=true;await h.m.open(true);assert.equal(h.m.adFree,true);assert.equal(h.elements.has('#pix-confirm-form'),false);});

test('late recovery response cannot affect a different login',async()=>{const h=setup();let resolve;h.m.call=async name=>name==='getMonetizationStatus'?account({pendingOrderId:ORDER_ID}):new Promise(r=>resolve=r);const task=h.m.open();await new Promise(setImmediate);h.store.user={...h.store.user,uid:'user-b'};h.store.auth.currentUser=h.store.user;h.m.sync();resolve(checkout({adFreeLifetime:true,status:'approved'}));await task;assert.equal(h.m.uid,'user-b');assert.equal(h.m.adFree,false);assert.equal(h.m.order,null);assert.equal(h.m.pendingOrderId,null);assert.equal(h.m.paymentsEnabled,false);});

test('late recovery response after logout and same-account login is discarded',async()=>{const h=setup();let resolve;h.m.call=async name=>name==='getMonetizationStatus'?account({pendingOrderId:ORDER_ID}):new Promise(r=>resolve=r);const task=h.m.open();await new Promise(setImmediate);h.store.screen='login';h.m.sync();h.store.screen='app';h.m.sync();resolve(checkout({adFreeLifetime:true,status:'approved'}));await task;assert.equal(h.m.adFree,false);assert.equal(h.m.order,null);assert.equal(h.m.paymentsEnabled,false);});

test('late recovery cannot replace a closed or changed dialog',async()=>{for(const change of [h=>{h.elements.get('#modal').open=false;},h=>h.m.frame('Outra tela','<p>Outro conteúdo</p>')]){const h=setup();let resolve;h.m.call=async name=>name==='getMonetizationStatus'?account({pendingOrderId:ORDER_ID}):new Promise(r=>resolve=r);const task=h.m.open();await new Promise(setImmediate);change(h);const frames=h.frames.length;resolve(checkout());await task;assert.equal(h.frames.length,frames);assert.equal(h.m.order,null);}});

test('create guard blocks calls if the backend disabled payment after the form opened',async()=>{const h=setup();await h.m.refresh(true);h.m.paymentsEnabled=false;const button={},error={};const form={isConnected:true,querySelector:s=>s==='[type=submit]'?button:error};await h.m.create(form);assert.equal(h.calls.some(c=>c.name==='createPixCheckout'),false);assert.equal(button.disabled,true);assert.match(error.textContent,/Nenhuma nova cobrança/);});

test('Safari BFCache restoration resumes status and polling only for persisted pages',()=>{const h=setup();let resumes=0;h.m.resume=()=>resumes++;h.m.install();h.events['window-pageshow']({persisted:false});assert.equal(resumes,0);h.events['window-pageshow']({persisted:true});assert.equal(resumes,1);});


test('terminal status found by polling leaves manual confirmation available',async()=>{const h=setup();h.m.paymentsEnabled=true;h.m.showOrder({...checkout(),uid:h.store.user.uid});let checks=0;h.m.call=async()=>{checks++;return checkout({status:'cancelled'});};await h.m.check();assert.equal(h.m.order.checking,false);assert.match(h.frames.at(-1).html,/foi cancelado/);await h.m.check();assert.equal(checks,2);});

test('late polling confirmation after logout and same-account login is discarded',async()=>{const h=setup();h.m.showOrder({...checkout(),uid:h.store.user.uid});let resolve;h.m.call=()=>new Promise(r=>resolve=r);const task=h.m.check();h.store.screen='login';h.m.sync();h.store.screen='app';h.m.sync();resolve(checkout({adFreeLifetime:true,status:'approved'}));await task;assert.equal(h.m.adFree,false);assert.equal(h.m.order,null);});

test('token refresh from a prior login cannot reopen a paid dialog',async()=>{const h=setup();let resolve;h.store.user.getIdToken=()=>new Promise(r=>resolve=r);const task=h.m.confirmPaid(h.store.user.uid);h.store.screen='login';h.m.sync();h.store.screen='app';h.m.sync();resolve();await task;assert.equal(h.m.adFree,false);assert.equal(h.frames.length,0);});


test('confirmation form states the fixed price without requesting a payer document',async()=>{const h=setup();await h.m.open();assert.equal(h.elements.has('#pix-confirm-form'),true);assert.match(h.frames.at(-1).html,/Gerar Pix de R\$ 5,00/);assert.doesNotMatch(h.frames.at(-1).html,/<input|CPF|documento/i);});

test('processing and pending orders without a QR wait for the same order automatically',async()=>{for(const status of ['in_process','pending']){const h=setup();let ready=false;h.m.call=async(name,data)=>{h.calls.push({name,data});return name==='getMonetizationStatus'?account({pendingOrderId:ORDER_ID}):checkout({status,qrCode:ready?'synthetic pix':null,qrCodeBase64:ready?'AA==':null});};await h.m.open();assert.match(h.frames.at(-1).html,/Estamos gerando seu Pix/);assert.equal(h.elements.has('#pix-copy-code'),false);assert.doesNotMatch(h.frames.at(-1).html,/<img/);assert.equal(h.timeouts.at(-1).ms,15000);await h.m.open(true);assert.match(h.frames.at(-1).html,/Estamos gerando seu Pix/);assert.equal(h.elements.has('#pix-confirm-form'),false);ready=true;await h.m.check();assert.equal(h.elements.has('#pix-copy-code'),true);assert.equal(h.m.order.orderId,ORDER_ID);assert.equal(h.calls.some(c=>c.name==='createPixCheckout'),false);}});

test('creating a processing order never submits a second attempt while waiting for QR',async()=>{const h=setup();h.m.phase='free';h.m.paymentsEnabled=true;const button={},error={};const form={isConnected:true,querySelector:s=>s==='[type=submit]'?button:error};h.m.call=async(name,data)=>{h.calls.push({name,data});return checkout({status:'in_process',qrCode:null,qrCodeBase64:null});};await h.m.create(form);assert.equal(h.calls.length,1);assert.equal(h.calls[0].name,'createPixCheckout');assert.match(h.frames.at(-1).html,/Estamos gerando seu Pix/);assert.equal(h.elements.has('#pix-confirm-form'),false);await h.m.check();assert.equal(h.calls.length,2);assert.equal(h.calls[1].name,'checkPixCheckout');assert.equal(h.calls[1].data.orderId,ORDER_ID);assert.match(h.frames.at(-1).html,/Estamos gerando seu Pix/);});


function cloudflareSetup(overrides={}){const h=setup({enabled:true,provider:'cloudflare',apiBase:'/api/pix',adsEnabled:true,adPageAllowlist:['/guia/'],...overrides});h.requests=[];h.m.call=h.transportCall;h.sandbox.window.fetch=async(url,options)=>{h.requests.push({url,options});return {ok:true,json:async()=>({data:account()})};};return h;}

test('Cloudflare uses same-origin authenticated callable envelopes without caller identity or price',async()=>{const h=cloudflareSetup({apiBase:'/api/pix/'});for(const name of ['getMonetizationStatus','createPixCheckout','checkPixCheckout'])await h.m.call(name,{orderId:ORDER_ID,uid:'forged',email:'synthetic@example.invalid',amount:99});assert.equal(h.requests.length,3);for(const [index,request]of h.requests.entries()){assert.equal(request.url,'https://4j.example/api/pix/'+['getMonetizationStatus','createPixCheckout','checkPixCheckout'][index]);assert.equal(request.options.method,'POST');assert.equal(request.options.headers.Authorization,'Bearer synthetic-id-token');assert.equal(request.options.headers['Content-Type'],'application/json');assert.equal(request.options.redirect,'error');assert.equal(request.options.credentials,'same-origin');assert.deepEqual(JSON.parse(request.options.body),{data:index===2?{orderId:ORDER_ID}:{}});}});

test('Cloudflare rejects external or insecure API URLs before acquiring or sending a token',async()=>{for(const apiBase of ['https://external.example/api/pix','//external.example/api/pix','http://4j.example/api/pix','https://user:pass@4j.example/api/pix','/api/pix?redirect=external','/api/pix#route','data:text/plain,anything']){const h=cloudflareSetup({apiBase});let tokens=0;h.store.user.getIdToken=async()=>{tokens++;return 'synthetic-token';};await assert.rejects(h.m.call('getMonetizationStatus'));assert.equal(tokens,0,apiBase);assert.equal(h.requests.length,0,apiBase);}const h=cloudflareSetup();h.sandbox.location.href='http://4j.example/painel/';await assert.rejects(h.m.call('getMonetizationStatus'));assert.equal(h.requests.length,0);});

test('Cloudflare permits same-origin HTTP only on explicit local test hosts',async()=>{for(const origin of ['http://localhost:8080','http://127.0.0.1:8080','http://[::1]:8080']){const h=cloudflareSetup();h.sandbox.location.href=origin+'/painel/';await h.m.call('getMonetizationStatus');assert.equal(h.requests[0].url,origin+'/api/pix/getMonetizationStatus');}});

test('Cloudflare rejects unknown actions, invalid order IDs and missing ID tokens',async()=>{for(const [name,data]of [['deleteEverything',{}],['checkPixCheckout',{orderId:'invalid'}]]){const h=cloudflareSetup();await assert.rejects(h.m.call(name,data));assert.equal(h.requests.length,0);}for(const token of [undefined,'','   ']){const h=cloudflareSetup();h.store.user.getIdToken=async()=>token;await assert.rejects(h.m.call('getMonetizationStatus'));assert.equal(h.requests.length,0);}});

test('Cloudflare discards tokens resolved after an account or session switch',async()=>{for(const sameUid of [false,true]){const h=cloudflareSetup();let resolve;h.store.user.getIdToken=()=>new Promise(r=>resolve=r);const task=h.m.call('getMonetizationStatus');h.store.user={...h.store.user,uid:sameUid?'user-a':'user-b'};h.store.auth.currentUser=h.store.user;h.m.sync();resolve('old-synthetic-token');await assert.rejects(task,/sessão mudou/);assert.equal(h.requests.length,0);}});

test('Cloudflare discards responses from an earlier account',async()=>{const h=cloudflareSetup();let resolve;h.sandbox.window.fetch=()=>new Promise(r=>resolve=r);const task=h.m.call('getMonetizationStatus');await new Promise(setImmediate);h.store.user={...h.store.user,uid:'user-b'};h.store.auth.currentUser=h.store.user;h.m.sync();resolve({ok:true,json:async()=>({data:account({adFreeLifetime:true})})});await assert.rejects(task,/sessão mudou/);assert.equal(h.m.adFree,false);});

test('Cloudflare errors map to callable codes without exposing backend messages or falling back',async()=>{const h=cloudflareSetup();let fallback=0;h.sandbox.window.firebase={functions:true};h.sandbox.firebase={app:()=>{fallback++;throw Error('legacy fallback');}};h.sandbox.window.fetch=async()=>({ok:false,json:async()=>({error:{status:'FAILED_PRECONDITION',message:'private-provider-data'}})});await assert.rejects(h.m.call('createPixCheckout'),error=>{assert.equal(error.code,'functions/failed-precondition');assert.doesNotMatch(error.message,/private-provider/);return true;});assert.equal(fallback,0);});

test('Cloudflare ignores signed claims and fails closed on unavailable or malformed status',async()=>{for(const reply of [async()=>{throw Error('offline');},async()=>({ok:true,json:async()=>({})}),async()=>({ok:true,json:async()=>({data:null})})]){const h=cloudflareSetup();let claimReads=0;h.store.user.getIdTokenResult=async()=>{claimReads++;return {claims:{adFreeLifetime:true}};};h.sandbox.window.fetch=reply;await h.m.refresh(true);assert.equal(claimReads,0);assert.equal(h.m.adFree,false);assert.equal(h.m.phase,'unavailable');assert.equal(h.m.shouldLoadAds('/guia/'),false);assert.equal(h.m.canCreate(),false);}});

test('Cloudflare server entitlement is authoritative and a later outage keeps ads blocked',async()=>{const h=cloudflareSetup();h.sandbox.window.fetch=async()=>({ok:true,json:async()=>({data:account({adFreeLifetime:true})})});await h.m.refresh(true);assert.equal(h.m.adFree,true);h.sandbox.window.fetch=async()=>{throw Error('offline');};await h.m.refresh(true);assert.equal(h.m.adFree,false);assert.equal(h.m.phase,'unavailable');assert.equal(h.m.shouldLoadAds('/guia/'),false);});

test('Firebase remains the default callable transport',async()=>{const h=setup(),legacy=[];h.sandbox.window.firebase={functions:true};h.sandbox.firebase={app:()=>({functions:region=>({httpsCallable:name=>async data=>{legacy.push({region,name,data});return {data:account()};}})})};const value=await h.transportCall('getMonetizationStatus');assert.equal(value.price,5);assert.equal(legacy.length,1);assert.equal(legacy[0].region,'southamerica-east1');assert.equal(legacy[0].name,'getMonetizationStatus');});

test('disabled configuration and demo never acquire a Cloudflare token',async()=>{for(const mode of ['disabled','demo']){const h=cloudflareSetup({enabled:mode!=='disabled'});if(mode==='demo')h.store.demo=true;let tokens=0;h.store.user.getIdToken=async()=>{tokens++;return 'synthetic';};await assert.rejects(h.m.call('createPixCheckout'));assert.equal(tokens,0);assert.equal(h.requests.length,0);}});

function pollingSetup(overrides={}){
 const h=setup(),pending=new Map(),delays=[];let time=1792400000000,serial=0;
 h.sandbox.Date=class extends Date{constructor(...args){super(...(args.length?args:[time]));}static now(){return time;}};
 h.sandbox.setTimeout=(fn,ms)=>{const id=++serial;pending.set(id,{fn,at:time+ms});delays.push(ms);return id;};
 h.sandbox.clearTimeout=id=>pending.delete(id);
 const clock={now:()=>time,pending:()=>pending.size,delays,jump:ms=>{time+=ms;},async advance(ms){const target=time+ms;let turns=0;while(true){const next=[...pending].filter(([,v])=>v.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;if(++turns>200)throw Error('Unexpected polling loop');pending.delete(next[0]);time=next[1].at;await next[1].fn();}time=target;}};
 h.m.showOrder({...checkout({expiresAt:time+3600000,...overrides}),uid:h.store.user.uid});
 return {...h,clock};
}

test('persistent failures back off and stop at thirty minutes without creating another Pix',async()=>{
 const h=pollingSetup(),requests=[];h.m.call=async(name,data)=>{requests.push({name,data});throw Error('offline');};
 await h.clock.advance(15*1000);assert.equal(h.clock.delays.at(-1),15000);
 await h.clock.advance(15*1000);assert.equal(h.clock.delays.at(-1),30000);
 await h.clock.advance(30*1000);assert.equal(h.clock.delays.at(-1),60000);
 await h.clock.advance(29*60*1000);assert.equal(h.clock.pending(),0);assert.equal(h.m.timer,null);assert.match(h.elements.get('#pix-status').textContent,/consulta automática foi pausada/);
 const count=requests.length;assert.ok(count<=32);await h.clock.advance(60*60*1000);assert.equal(requests.length,count);
 assert.ok(requests.every(r=>r.name==='checkPixCheckout'&&r.data.orderId===ORDER_ID));assert.equal(h.m.adFree,false);
});

test('an automatic timer reaching expiry pauses before sending, while manual confirmation still reads the same order',async()=>{
 const h=pollingSetup({expiresAt:1792400005000}),requests=[];h.m.call=async(name,data)=>{requests.push({name,data});return checkout({status:'approved',adFreeLifetime:true});};
 assert.equal(h.clock.delays[0],5000);await h.clock.advance(5000);assert.equal(requests.length,0);assert.equal(h.clock.pending(),0);
 await h.m.check();assert.equal(requests.length,1);assert.equal(requests[0].name,'checkPixCheckout');assert.equal(requests[0].data.orderId,ORDER_ID);assert.equal(h.m.adFree,true);
});

test('a failed request crossing the deadline cannot restart automatic polling',async()=>{
 for(const expiresAt of [1792400005000,1792403600000]){
  const h=pollingSetup({expiresAt});let reject;h.m.call=()=>new Promise((_,no)=>reject=no);const task=h.m.check(h.m.order,true);
  h.clock.jump(expiresAt===1792400005000?5000:30*60*1000);reject(Error('offline'));await task;
  assert.equal(h.clock.pending(),0);assert.equal(h.m.order.checking,false);assert.match(h.elements.get('#pix-status').textContent,/consulta automática foi pausada/);
 }
});

test('successful recovery resets backoff and confirms the existing Pix without a second checkout',async()=>{
 const h=pollingSetup(),requests=[];let failures=2,paid=false;
 h.m.call=async(name,data)=>{requests.push({name,data});if(failures-->0)throw Error('offline');return checkout({expiresAt:1792403600000,...(paid?{status:'approved',adFreeLifetime:true}:{})});};
 await h.clock.advance(30000);assert.equal(h.clock.delays.at(-1),30000);
 await h.clock.advance(30000);assert.equal(h.clock.delays.at(-1),15000);assert.equal(h.m.order.failures,0);
 paid=true;await h.clock.advance(15000);assert.equal(h.m.adFree,true);assert.equal(h.clock.pending(),0);assert.ok(requests.every(r=>r.name==='checkPixCheckout'&&r.data.orderId===ORDER_ID));
});

test('failed polling after a login profile route or dialog change cannot resume its old timer',async()=>{
 const changes=[h=>{h.store.user={...h.store.user,uid:'user-b'};h.store.auth.currentUser=h.store.user;h.m.sync();},h=>{h.store.profile='profile-b';h.m.sync();},h=>{h.sandbox.location.hash='#metas';},h=>{h.elements.set('#pix-checkout',{querySelector:()=>null});}];
 for(const change of changes){const h=pollingSetup(),before=h.elements.get('#pix-status').textContent;let reject;h.m.call=()=>new Promise((_,no)=>reject=no);const task=h.m.check(h.m.order,true);change(h);reject(Error('offline'));await task;assert.equal(h.clock.pending(),0);assert.equal(h.m.adFree,false);assert.equal(h.elements.get('#pix-status').textContent,before);}
});

test('returning to the app after the polling limit performs one read without renewing the expired watch window',async()=>{
 const h=pollingSetup(),requests=[];h.m.refresh=async()=>{};h.m.call=async(name,data)=>{requests.push({name,data});return checkout({expiresAt:1792403600000});};
 h.m.stop();h.clock.jump(30*60*1000);await h.m.resume();await new Promise(setImmediate);
 assert.equal(requests.length,1);assert.equal(requests[0].name,'checkPixCheckout');assert.equal(requests[0].data.orderId,ORDER_ID);assert.equal(h.clock.pending(),0);assert.match(h.elements.get('#pix-status').textContent,/consulta automática foi pausada/);
});

test('a QR becoming ready preserves the original thirty-minute watch deadline',async()=>{
 const h=pollingSetup({status:'in_process',qrCode:null,qrCodeBase64:null}),started=h.m.order.started;h.m.call=async()=>checkout({expiresAt:1792403600000});
 h.clock.jump(29*60*1000);await h.m.check(h.m.order,true);assert.equal(h.m.order.started,started);assert.equal(h.elements.has('#pix-copy-code'),true);
 await h.clock.advance(60*1000);assert.equal(h.clock.pending(),0);assert.match(h.elements.get('#pix-status').textContent,/consulta automática foi pausada/);
});


test('pilot purchase action stays unavailable until the backend explicitly permits this session',async()=>{
 const h=setup({enabled:true,pilotEnabled:true,publicPayments:false,adsEnabled:false});
 assert.doesNotMatch(h.m.card(),/data-action="monetization-open"/);assert.match(h.m.card(),/disabled/);
 h.m.call=async()=>account({paymentsEnabled:false,pilotMode:false});await h.m.refresh(true);assert.equal(h.m.canCreate(),false);assert.doesNotMatch(h.m.card(),/data-action="monetization-open"/);
 h.m.call=async()=>account({paymentsEnabled:true,pilotMode:true});await h.m.refresh(true);assert.equal(h.m.canCreate(),true);assert.match(h.m.card(),/data-action="monetization-open"/);assert.equal(h.m.shouldLoadAds('/guia/'),false);
 h.store.user={...h.store.user,uid:'another-user'};h.store.auth.currentUser=h.store.user;h.m.sync();assert.equal(h.m.canCreate(),false);assert.doesNotMatch(h.m.card(),/data-action="monetization-open"/);
});

test('pilot malformed permission or failed status never exposes a purchase action',async()=>{
 for(const status of [account(),account({pilotMode:'true'}),account({pilotMode:false})]){
  const h=setup({enabled:true,pilotEnabled:true,adsEnabled:false});h.m.call=async()=>status;await h.m.refresh(true);assert.equal(h.m.phase,'unavailable');assert.equal(h.m.canCreate(),false);assert.doesNotMatch(h.m.card(),/data-action="monetization-open"/);
 }
 const h=setup({enabled:true,pilotEnabled:true,adsEnabled:false});h.m.call=async()=>{throw Error('offline');};await h.m.refresh(true);assert.doesNotMatch(h.m.card(),/data-action="monetization-open"/);assert.equal(h.m.canCreate(),false);
});

test('pilot rollback preserves existing benefit and order controls without exposing new purchase',async()=>{
 for(const state of [account({adFreeLifetime:true,paymentsEnabled:false,pilotMode:false}),account({pendingOrderId:ORDER_ID,paymentsEnabled:false,pilotMode:false})]){
  const h=setup({enabled:true,pilotEnabled:true,adsEnabled:false});h.m.call=async()=>state;await h.m.refresh(true);assert.equal(h.m.canCreate(),false);assert.match(h.m.card(),/data-action="monetization-open"/);assert.doesNotMatch(h.m.card(),/Remover anúncios · R\$ 5,00/);
 }
});

test('pilot mode preserves a local demo with no backend calls',async()=>{
 const h=setup({enabled:true,pilotEnabled:true,provider:'cloudflare',adsEnabled:false});h.store.demo=true;await h.m.open();assert.equal(h.calls.length,0);assert.match(h.frames.at(-1).html,/demonstração|simulação|fictício/i);assert.equal(h.m.shouldLoadAds('/guia/'),false);
});


test('public mode offers the fixed purchase to eligible sessions and preserves a paid account without another checkout', async () => {
 const config=require('./monetization-build-config.cjs').publicConfig({pilotEnabled:false,publicPayments:true});
 const h=setup(config);
 h.m.call=async(name,data)=>{h.calls.push({name,data});return account({pilotMode:false,adFreeLifetime:h.store.user.uid==='user-a'});};
 await h.m.open();assert.equal(h.m.adFree,true);assert.equal(h.m.canCreate(),false);assert.equal(h.elements.has('#pix-confirm-form'),false);assert.match(h.frames.at(-1).html,/Pagamento confirmado/);
 assert.equal(h.calls.some(c=>c.name==='createPixCheckout'),false);assert.equal(h.m.shouldLoadAds('/guia/'),false);
 h.store.user={...h.store.user,uid:'other-eligible-user'};h.store.auth.currentUser=h.store.user;
 await h.m.open();assert.equal(h.m.adFree,false);assert.equal(h.m.canCreate(),true);assert.equal(h.elements.has('#pix-confirm-form'),true);assert.match(h.frames.at(-1).html,/R\$ 5,00/);assert.equal(h.m.shouldLoadAds('/guia/'),false);
 assert.equal(h.calls.some(c=>c.name==='createPixCheckout'),false, 'opening a public checkout still requires explicit confirmation');
});
