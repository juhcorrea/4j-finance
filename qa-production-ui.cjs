'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=__dirname,pub=path.join(base,'public'),qa=path.join(base,'qa/cloudflare');fs.mkdirSync(qa,{recursive:true});
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.txt':'text/plain; charset=utf-8'};
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://127.0.0.1');const file=path.resolve(pub,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(pub+path.sep)){res.writeHead(403);res.end();return;}try{res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}});
(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='https://4jfinance.pages.dev';
const executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined;
const browser=await chromium.launch({headless:true,executablePath});const results=[];try{
for(const viewport of [{width:390,height:844},{width:1440,height:1000}]){
const context=await browser.newContext({viewport,deviceScaleFactor:1});const page=await context.newPage();const errors=[];page.on('pageerror',err=>errors.push(err.message));
await page.route('**/*',route=>(route.request().url().startsWith(origin)||['fonts.googleapis.com','fonts.gstatic.com'].includes(new URL(route.request().url()).hostname))?route.continue():route.abort());
await page.goto(origin+'/index.html?demo=1',{waitUntil:'networkidle'});
await page.locator('[data-action="settings"]:visible').first().waitFor({timeout:15000});await page.evaluate(()=>document.fonts.ready);assert.ok(await page.evaluate(()=>Array.from(document.fonts).some(f=>f.family==='Montserrat'&&f.status==='loaded')),'Original Montserrat font must be loaded');
assert.equal(await page.evaluate(()=>typeof window.firebase),'undefined','demo must work without Firebase');
const overflow=await page.evaluate(()=>({body:document.body.scrollWidth,screen:innerWidth}));assert.ok(overflow.body<=overflow.screen+1,JSON.stringify(overflow));
if(viewport.width===390)await page.locator('[data-action="theme"]:visible').first().click();
await page.locator('[data-action="settings"]:visible').first().click();
await page.locator('#monetization-card').waitFor();await page.locator('[data-action="monetization-open"]').click();
await page.getByRole('button',{name:'Simular confirmação',exact:true}).waitFor();
await page.screenshot({path:path.join(qa,'checkout-'+viewport.width+'.png')});
assert.equal(await page.locator('#pix-qr').count(),0,'demo must not issue QR');
await page.getByRole('button',{name:'Simular confirmação',exact:true}).click();
assert.match(await page.locator('#pix-checkout').innerText(),/apenas uma simulação/);
await page.getByRole('button',{name:'Voltar aos ajustes',exact:true}).click();
assert.match(await page.locator('#monetization-card').innerText(),/Sem anúncios · ativo/);
await page.goto(origin+'/guia.html',{waitUntil:'networkidle'});
assert.equal(await page.locator('[id="4j-public-ad-script"]').count(),0);
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'guide overflow');
await page.screenshot({path:path.join(qa,'guia-'+viewport.width+'.png')});
assert.equal(await page.locator('a[href="./privacidade.html"]').count()>0,true);
await page.goto(origin+'/privacidade.html',{waitUntil:'networkidle'});
assert.equal(await page.locator('a[href="mailto:juliana07correa@gmail.com"]').count(),1);
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'privacy overflow');
assert.deepEqual(errors,[],'No page JavaScript errors');
results.push({viewport,demoWithoutFirebase:true,originalMontserratLoaded:true,paymentSimulation:true,adsBlocked:true,contactPresent:true,noOverflow:true,pageErrors:errors});await context.close();
}
fs.writeFileSync(path.join(qa,'ui-result.json'),JSON.stringify({browser:path.basename(executablePath||chromium.executablePath()),results},null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser.close();server.close();}})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
