'use strict';
// Synthetic component fixture: no Firebase SDK, real account, provider or payment.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'pix-checkout');
const base=fs.readFileSync(path.join(root,'source/base.html'),'utf8');
const styles=[...base.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n')+'\n'+fs.readFileSync(path.join(root,'frontend/monetization.css'),'utf8');
const source=fs.readFileSync(path.join(root,'frontend/monetization.js'),'utf8');
const fixtureScript=String.raw`
const $=selector=>document.querySelector(selector);
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const scenario=new URLSearchParams(location.search).get('scenario')||'ready';
const provider=new URLSearchParams(location.search).get('provider')==='cloudflare'?'cloudflare':'firebase';
const fixture={calls:[],transportRequests:0,created:false,paid:false,status:'pending',ready:true,paymentsEnabled:true,pilotMode:true,failStatus:false,failCreate:false,failCheck:false};
if(scenario==='disabled')fixture.paymentsEnabled=false;
if(scenario==='pilot-incomplete')fixture.pilotMode=undefined;
if(scenario==='pilot-mismatch')fixture.pilotMode=false;
if(scenario==='processing'){fixture.status='in_process';fixture.ready=false;}
if(scenario==='error')fixture.failCreate=true;
if(scenario==='unavailable')fixture.failStatus=true;
if(scenario==='terminal'){fixture.created=true;fixture.status='expired';}
const user={uid:'synthetic-qa-user',emailVerified:true,getIdTokenResult:async()=>({claims:{}}),getIdToken:async()=> 'synthetic-browser-id-token'};
const Store={screen:'app',profile:'synthetic-profile',demo:false,user,userDoc:{status:'approved'},auth:{currentUser:user,onIdTokenChanged:()=>()=>{}},emit(){}};
function modal(title,html){const dialog=$('#modal');$('#modal-content').innerHTML='<div class="modal-heading"><h2 id="modal-title">'+esc(title)+'</h2><button type="button" class="icon-button" data-action="close-modal" aria-label="Fechar">×</button></div>'+html;if(!dialog.open)dialog.showModal();}
function familyAccessSettings(){modal('Ajustes','<section class="account-summary"><h3>Conta de demonstração técnica</h3></section>');}
window.MONETIZATION_CONFIG={enabled:true,pilotEnabled:provider==='cloudflare',publicPayments:false,provider,apiBase:'/api/pix',adsEnabled:true,adPageAllowlist:['/guia/']};
document.addEventListener('click',event=>{const action=event.target.closest('[data-action]')?.dataset.action;if(action==='close-modal')$('#modal').close();if(action==='settings')familyAccessSettings();});
`+source+String.raw`
const orderId='12345678-1234-4123-8123-123456789abc';
const order=()=>({orderId,amount:5,currency:'BRL',status:fixture.status,adFreeLifetime:fixture.paid,expiresAt:Date.now()+3600000,qrCode:fixture.ready?'00020101021226890014BR.GOV.BCB.PIX.TESTE-SINTETICO-SEM-VALOR-NAO-PAGAR52040000530398654045.005802BR':'',qrCodeBase64:fixture.ready?'iVBORw0KGgoAAAANSUhEUgAAACUAAAAlCAYAAADFniADAAACJ0lEQVR4Ac3BQY7cMBDAQNLw/7/MbB8EGIJmk7kErrIfvMzFC1280MUL3WxUflPxpLJUPKn8i4qnm4OKnUrFruKTikWlYqeyu/lAZalYVJaKJ5Wl4kRlqTi5+YJKxVBZVEbFUFlUvnXxhQqVkwqVk4pv3HxQsVOpUKkYKhUqFSoVQ6VCZan4m5sDlZMKlZMKlZMKFZV/cXNQ8aQyVCp2KqNipzIqnlQ+sR+8zM2BylLxpLJUPKksFU8qS8VvbjYqFUNlURkVQ2VRGRVDZVEZFUNlURkVTxebCpWTCpWTCpWTCpWTit3FRqVCpWKoVKhUqFQMlQqVCpWKoVKhUqFSMVQqVHYXmwqVkwqVkwqVkwqVk4rdzUalYqcyKnYqo2KnMip2KqPiyX7wMjcHKkvFk8pS8aSyVDypLBW/udmoVAyVRWVUDJVFZVQMlUVlVAyVRWVUPF1sKlROKlROKlROKlROKnYXG5UKlYqhUqFSoVIxVCpUKlQqhkqFSoVKxVCpUNldbCpUTipUTipUTipUTip2NxuVip3KqNipjIqdyqjYqYyKJ/vBg8onFf/DzUHFTmWoLBVPKkvFk8pS8ZubD1SWiqFSMVQWlVExVBaVUTFUFpVR8XTxhQqVkwqVkwqVk4rdxRdUKlQqhkqFSoVKxVCpUKlQqRgqFSq7mw8qdhUqJxUqJxUqJxW7mwOVE5WKncqo2KmMip3KqHiyH7zMxQtdvNDFC/0BBMmsgVDif8IAAAAASUVORK5CYII=':''});
const fixtureCall=async(name,data={})=>{
 fixture.calls.push({name,data});
 if(name==='getMonetizationStatus'){if(fixture.failStatus)throw Error('synthetic offline');return {adFreeLifetime:fixture.paid,price:5,currency:'BRL',paymentsEnabled:fixture.paymentsEnabled,pilotMode:fixture.pilotMode,pendingOrderId:fixture.created?orderId:null};}
 if(name==='createPixCheckout'){assertEmptyPayload(data);if(fixture.failCreate)throw Error('synthetic create failure');fixture.created=true;return order();}
 if(name==='checkPixCheckout'){if(fixture.failCheck)throw Error('synthetic check failure');if(data.orderId!==orderId)throw Error('unexpected order');return order();}
 throw Error('unexpected method');
};
if(provider==='cloudflare')window.fetch=async(url,options)=>{const target=new URL(url);if(target.origin!==location.origin||!target.pathname.startsWith('/api/pix/')||options.method!=='POST'||options.headers.Authorization!=='Bearer synthetic-browser-id-token'||options.redirect!=='error')throw Error('Unsafe fixture transport');fixture.transportRequests++;const envelope=JSON.parse(options.body);return {ok:true,json:async()=>({data:await fixtureCall(target.pathname.split('/').pop(),envelope.data)})};};else Monetization.call=fixtureCall;
function assertEmptyPayload(value){if(Object.keys(value).length)throw Error('document or unexpected field submitted');}
window.PixFixture={state:fixture,open:()=>Monetization.open(),poll:()=>Monetization.check(Monetization.order,true),refresh:()=>Monetization.refresh(true),adsAllowed:()=>FourJAdPolicy.shouldLoadAds('/guia/'),get order(){return Monetization.order;}};
`;
const html='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Pix · fixture sintética 4J Finance</title><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet"><style>'+styles+'</style></head><body><main><h1>4J Finance · teste local</h1><p>Nenhuma cobrança real será criada.</p><button class="button primary" data-action="monetization-open">Abrir Pix de teste</button></main><dialog id="modal" aria-labelledby="modal-title"><div id="modal-content"></div></dialog><script src="/fixture.js"></script></body></html>';
const server=http.createServer((req,res)=>{const script=new URL(req.url,'http://localhost').pathname==='/fixture.js';res.setHeader('Content-Type',script?'application/javascript;charset=utf-8':'text/html;charset=utf-8');res.end(script?fixtureScript:html);});
(async()=>{
 fs.mkdirSync(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined});
 const results=[],errors=[],unexpectedNetwork=[];
 async function fit(page,width,label){
  const geometry=await page.evaluate(()=>{const dialog=document.querySelector('dialog[open]'),rect=dialog.getBoundingClientRect();return {body:document.body.scrollWidth,root:document.documentElement.scrollWidth,left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,height:innerHeight,scroll:dialog.scrollWidth,client:dialog.clientWidth,font:getComputedStyle(dialog).fontFamily,controls:[...dialog.querySelectorAll('.button,input,textarea')].filter(el=>el.getClientRects().length).map(el=>{const r=el.getBoundingClientRect();return {tag:el.tagName,left:r.left,right:r.right,height:r.height,scroll:el.scrollWidth,client:el.clientWidth};})};});
  assert.ok(geometry.body<=width+1&&geometry.root<=width+1,label+' page overflow');assert.ok(geometry.left>=-1&&geometry.right<=width+1,label+' dialog clipped horizontally');assert.ok(geometry.top>=-1&&geometry.bottom<=geometry.height+1,label+' dialog clipped vertically');assert.ok(geometry.scroll<=geometry.client+2,label+' dialog internal overflow');assert.match(geometry.font,/Montserrat/);
  for(const control of geometry.controls){assert.ok(control.left>=geometry.left-1&&control.right<=geometry.right+1,label+' control clipped');if(control.tag==='BUTTON')assert.ok(control.height>=44,label+' touch target too short');}
 }
 async function shot(page,width,label){await fit(page,width,label);await page.screenshot({path:path.join(out,label+'-'+width+'.png'),fullPage:true});}
 try{
  for(const width of [320,375,390,430,1440]){
   const context=await browser.newContext({viewport:{width,height:width<768?844:1000},deviceScaleFactor:1,isMobile:width<768,hasTouch:width<768});
   await context.route('**/*',route=>{const request=route.request(),url=new URL(request.url());if(url.origin===origin||['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname))return route.continue();unexpectedNetwork.push({host:url.hostname,method:request.method()});return route.abort();});
   const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
   async function open(scenario='ready',provider='cloudflare'){await page.goto(origin+'/?scenario='+scenario+'&provider='+provider,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);await page.locator('[data-action=monetization-open]').click();await page.locator('dialog[open]').waitFor();}
   await open();assert.ok(await page.evaluate(()=>PixFixture.state.transportRequests)>0,'Cloudflare transport exercised');await shot(page,width,'confirm');assert.equal(await page.locator('#pix-confirm-form input').count(),0);assert.equal(await page.locator('#pix-confirm-form').textContent().then(t=>/R\$ 5,00/.test(t)),true);
   await page.locator('#pix-confirm-form [type=submit]').click();await page.locator('#pix-copy-code').waitFor();await shot(page,width,'pending');await page.locator('[data-action=monetization-check]').scrollIntoViewIfNeeded();await shot(page,width,'pending-controls');assert.equal(await page.evaluate(()=>PixFixture.state.calls.filter(c=>c.name==='createPixCheckout').length),1);
   await page.locator('[data-action=monetization-copy]').click();await page.locator('#pix-copy-result').filter({hasText:/copiado|Copiar/}).waitFor();
   await page.locator('#pix-checkout [data-action=close-modal]').click();await page.locator('main [data-action=monetization-open]').click();await page.locator('#pix-copy-code').waitFor();assert.equal(await page.evaluate(()=>PixFixture.state.calls.filter(c=>c.name==='createPixCheckout').length),1);
   await page.evaluate(()=>{PixFixture.state.paid=true;PixFixture.state.status='approved';});await page.locator('[data-action=monetization-check]').click();await page.getByRole('heading',{name:'Pagamento confirmado',exact:true}).waitFor();assert.equal(await page.evaluate(()=>PixFixture.adsAllowed()),false);await shot(page,width,'approved');
   await page.evaluate(async()=>{PixFixture.state.paid=false;PixFixture.state.status='refunded';await PixFixture.refresh();await PixFixture.open();});await page.getByText(/devolvido ou estornado/).waitFor();await fit(page,width,'refunded');assert.equal(await page.locator('#pix-copy-code').count(),0);
   results.push({width,case:'create pending close reopen approve and server revocation',passed:true});
   await open('processing');await page.locator('#pix-confirm-form [type=submit]').click();await page.getByText(/Estamos gerando seu Pix/).waitFor();assert.equal(await page.locator('#pix-checkout img').count(),0);await shot(page,width,'processing');await page.evaluate(async()=>{PixFixture.state.ready=true;await PixFixture.poll();});await page.locator('#pix-copy-code').waitFor();assert.equal(await page.evaluate(()=>PixFixture.state.calls.filter(c=>c.name==='createPixCheckout').length),1);results.push({width,case:'processing to QR without another attempt',passed:true});
   await open('error');await page.locator('#pix-confirm-form [type=submit]').click();await page.locator('#pix-create-error:not([hidden])').waitFor();await shot(page,width,'error');assert.equal(await page.locator('#pix-confirm-form [type=submit]').isEnabled(),true);
   await open('disabled');await page.getByRole('heading',{name:'Novos pagamentos em preparação'}).waitFor();assert.equal(await page.locator('#pix-confirm-form').count(),0);await shot(page,width,'disabled');
   for(const scenario of ['pilot-incomplete','pilot-mismatch']){await open(scenario);await page.getByRole('heading',{name:'Conexão indisponível'}).waitFor();assert.equal(await page.locator('#pix-confirm-form').count(),0);assert.equal(await page.evaluate(()=>PixFixture.state.calls.filter(c=>c.name==='createPixCheckout').length),0);await shot(page,width,scenario);results.push({width,case:scenario+' fails closed without a checkout',passed:true});}
   await open('unavailable');await page.getByRole('heading',{name:'Conexão indisponível'}).waitFor();assert.equal(await page.locator('#pix-confirm-form').count(),0);await fit(page,width,'unavailable');results.push({width,case:'pilot allowed checkout, creation error, other account disabled and unavailable status',passed:true});
   if(width===390){await open('terminal');await page.evaluate(()=>document.body.classList.add('dark','large-text'));await shot(page,width,'terminal-dark-large');await page.locator('[data-action=monetization-new]').click();await page.locator('#pix-confirm-form').waitFor();await fit(page,width,'terminal explicit retry');}
   if(width===390){await open('ready','firebase');await page.locator('#pix-confirm-form').waitFor();assert.equal(await page.evaluate(()=>PixFixture.state.transportRequests),0);await fit(page,width,'legacy Firebase fixture');results.push({width,case:'legacy Firebase fixture preserved',passed:true});}
   await context.close();
  }
  assert.deepEqual(errors,[],'Browser errors');assert.deepEqual(unexpectedNetwork,[],'No provider Firebase advertising or other external request');
  const report={checkedAt:new Date().toISOString(),results,errors,unexpectedNetwork,scope:'Local synthetic pilot component (allowed/disabled/incomplete contract) with authenticated Cloudflare fetch mocked and legacy Firebase fixture, Chromium mobile viewports and desktop; no real Safari device, Firebase, payment, provider, advertising or public activation.'};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:results.length,results,errors,unexpectedNetwork},null,2));
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error.stack);server.close();process.exitCode=1;});
