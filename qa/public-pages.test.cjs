'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=path.resolve(__dirname,'..'),pub=path.join(base,'public'),out=path.join(__dirname,'adsense');
fs.mkdirSync(out,{recursive:true});
const types={'.html':'text/html;charset=utf-8','.css':'text/css;charset=utf-8','.js':'application/javascript;charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.txt':'text/plain;charset=utf-8'};
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1'),relative=decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname);
 let file=path.resolve(pub,'.'+relative);if(!path.extname(file))file+='.html';
 if(!file.startsWith(pub+path.sep)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined;
 const browser=await chromium.launch({headless:true,executablePath});
 const results=[],requests=[],errors=[],missing=[];
 async function context(width=390,extra={}){
   const ctx=await browser.newContext({viewport:{width,height:width<768?844:1000},...extra});
   ctx.on('page',page=>{
     page.on('pageerror',e=>errors.push(e.message));
     page.on('response',r=>{if(r.status()>=400&&r.url().startsWith(origin))missing.push({url:r.url(),status:r.status()});});
   });
   await ctx.route('**/*',route=>{
    const r=route.request(),u=new URL(r.url());
    if(/googlesyndication|doubleclick|googleadservices|fundingchoices|google-analytics/.test(u.hostname)){requests.push({host:u.hostname,path:u.pathname});return route.abort();}
    if(u.origin===origin||['fonts.googleapis.com','fonts.gstatic.com','www.gstatic.com'].includes(u.hostname))return route.continue();
    if(r.method()!=='GET'&&/googleapis|firebaseio/.test(u.hostname))requests.push({host:u.hostname,method:r.method()});
    return route.abort();
   });
   return ctx;
 }
 async function open(page,name){await page.goto(origin+'/'+name+'.html',{waitUntil:'networkidle'});await page.waitForFunction(()=>!!window.FourJConsent);await page.evaluate(()=>document.fonts.ready);}
 async function fit(page,width,label){
   const g=await page.evaluate(()=>({width:innerWidth,body:document.body.scrollWidth,root:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.position!=='absolute'&&s.display!=='none'&&(r.left< -1||r.right>innerWidth+1);}).slice(0,8).map(e=>e.tagName+'.'+e.className),font:getComputedStyle(document.body).fontFamily}));
   assert.ok(g.body<=width+1&&g.root<=width+1,label+' overflow '+JSON.stringify(g));
   assert.match(g.font,/Montserrat/,label+' typeface');
 }
 try{
  for(const width of [320,390,1440])for(const name of ['conheca','ferramentas','sobre','guia','privacidade','contato']){
    const ctx=await context(width),page=await ctx.newPage();await open(page,name);await fit(page,width,name);
    assert.equal(await page.locator('main h1').count(),1);
    assert.equal(await page.locator('.fourj-consent-banner').isVisible(),true);
    assert.deepEqual(await page.evaluate(()=>window.FourJConsent.getState()),{ready:false,adsAllowed:false,source:'4j-preferences'});
    await page.locator('.fourj-consent-banner [data-consent-action=customize]').click();
    await page.locator('dialog[open]').waitFor();
    assert.equal(await page.locator('#fourj-cookie-advertising').isChecked(),false);
    await fit(page,width,name+' modal');
    const dialogBox=await page.locator('dialog[open]').boundingBox();
    assert.ok(dialogBox.x>=0&&dialogBox.x+dialogBox.width<=width+1);
    for(let i=0;i<8;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('dialog')),true);}
    if(name==='sobre'&&width===390)await page.screenshot({path:path.join(out,'cookies-390.png')});
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('dialog[open]').count(),0);
    assert.equal(await page.evaluate(()=>document.activeElement?.dataset.consentAction),'customize');
    await page.locator('.fourj-consent-banner [data-consent-action=reject]').click();
    assert.equal(await page.locator('.fourj-consent-banner').isVisible(),false);
    assert.equal(await page.evaluate(()=>FourJConsent.getState().adsAllowed),false);
    await page.reload({waitUntil:'networkidle'});
    assert.equal(await page.locator('.fourj-consent-banner').isVisible(),false);
    if(width===390||width===1440)await page.screenshot({path:path.join(out,name+'-'+width+'.png'),fullPage:true});
    const hrefs=await page.locator('a[href]').evaluateAll(els=>els.map(e=>e.getAttribute('href')).filter(h=>h&&!h.startsWith('http')&&!h.startsWith('mailto:')&&!h.startsWith('#')));
    for(const href of new Set(hrefs)){const u=new URL(href,origin+'/'+name+'.html');const response=await ctx.request.get(u.href);assert.equal(response.status(),200,name+' broken link '+href);}
    results.push({name,width,layout:true,keyboard:true,rejectionPersists:true});await ctx.close();
  }
  {
    const ctx=await context(),a=await ctx.newPage();await open(a,'guia');
    await a.locator('.fourj-consent-banner [data-consent-action=accept]').click();
    assert.equal(await a.evaluate(()=>FourJConsent.getState().adsAllowed),true);
    const b=await ctx.newPage();await open(b,'privacidade');
    assert.equal(await b.evaluate(()=>FourJConsent.getState().adsAllowed),true);
    await b.locator('[data-cookie-settings]').first().click();
    assert.equal(await b.locator('#fourj-cookie-advertising').isChecked(),true);
    await b.locator('dialog [data-consent-action=reject]').click();
    await a.waitForFunction(()=>FourJConsent.getState().adsAllowed===false);
    await a.locator('[data-cookie-settings]').first().click();
    await a.locator('#fourj-cookie-advertising').check();await a.locator('dialog [data-consent-action=save]').click();
    await b.waitForFunction(()=>FourJConsent.getState().adsAllowed===true);
    await a.evaluate(()=>localStorage.setItem('4j.cookie-consent.v1',JSON.stringify({version:1,advertising:true,updatedAt:1,expiresAt:2})));
    await a.reload({waitUntil:'networkidle'});
    assert.equal(await a.locator('.fourj-consent-banner').isVisible(),true);
    assert.equal(await a.evaluate(()=>FourJConsent.getState().adsAllowed),false);
    results.push({case:'cross-tab accept/reject/customize and expiry',passed:true});await ctx.close();
  }
  {
    const ctx=await context();
    await ctx.addInitScript(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='4j.cookie-consent.v1')throw new DOMException('blocked','QuotaExceededError');return original.call(this,k,v);};});
    const page=await ctx.newPage();await open(page,'sobre');
    await page.locator('.fourj-consent-banner [data-consent-action=reject]').click();
    assert.equal(await page.locator('.fourj-consent-status').isVisible(),true);
    assert.equal(await page.evaluate(()=>FourJConsent.getState().adsAllowed),false);
    await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('.fourj-consent-banner').isVisible(),true);
    results.push({case:'storage disabled is explained and remains safe',passed:true});await ctx.close();
  }
  {
    const ctx=await context(320),page=await ctx.newPage();await page.goto(origin+'/index.html',{waitUntil:'networkidle'});
    await page.locator('#auth-form').waitFor();await fit(page,320,'app login');
    assert.equal(await page.locator('.auth-public-links a').count(),5);
    assert.equal(await page.locator('.auth-open-access a').count(),2);
    assert.equal(await page.evaluate(()=>typeof window.FourJPublicAds),'undefined');
    results.push({case:'private app login links and no ad loader',passed:true});await ctx.close();
  }
  for(const width of [390,1440]){
    const ctx=await context(width),page=await ctx.newPage();await open(page,'guia');
    await page.locator('.fourj-consent-banner [data-consent-action=accept]').click();
    await page.locator('[data-cookie-settings]').first().click();
    const review=page.locator('[data-consent-action=google-settings]');assert.equal(await review.isVisible(),false);
    await page.evaluate(()=>{
      window.syntheticGoogleReview={count:0,localDialogClosed:false};
      window.addEventListener('4j:google-consent-settings',()=>{syntheticGoogleReview.count++;syntheticGoogleReview.localDialogClosed=!document.querySelector('dialog[open]');});
      window.dispatchEvent(new CustomEvent('4j:google-consent-ready',{detail:{ready:true}}));
    });
    assert.equal(await review.isVisible(),true);assert.equal(await review.textContent(),'Rever escolha de anúncios');await fit(page,width,'review ads settings');
    const box=await review.boundingBox();assert.ok(box.height>=44);await review.focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>syntheticGoogleReview.count===1);
    assert.deepEqual(await page.evaluate(()=>syntheticGoogleReview),{count:1,localDialogClosed:true});
    assert.equal(await page.evaluate(()=>FourJConsent.getState().adsAllowed),true);
    await page.locator('[data-cookie-settings]').first().click();await fit(page,width,'reopened review settings');
    await page.screenshot({path:path.join(out,'review-ads-'+width+'.png')});
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('4j:google-consent-ready',{detail:{ready:false}})));
    assert.equal(await review.isVisible(),false);
    results.push({case:'Google choice control: synthetic readiness, keyboard and local dialog handoff',width,passed:true});await ctx.close();
  }
  assert.deepEqual(errors,[],'JavaScript errors');assert.deepEqual(missing,[],'Missing public assets');assert.deepEqual(requests,[],'No advertising, analytics or Firebase writes');
  const report={checkedAt:new Date().toISOString(),results,requests,errors,missing,scope:'Headless Chromium-compatible browser, local site and synthetic cookies; no real login, payment, ad or CMP activated.'};
  fs.writeFileSync(path.join(out,'public-pages-result.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:results.length,results,errors,marketingRequests:requests.length},null,2));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e.stack);server.close();process.exitCode=1;});

