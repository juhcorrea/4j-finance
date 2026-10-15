'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=path.resolve(__dirname,'..'),pub=path.join(base,'public'),qa=path.join(base,'qa');
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 const file=path.resolve(pub,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
 if(!file.startsWith(pub+path.sep)){res.writeHead(403);res.end();return;}
 try{res.setHeader('Content-Type',path.extname(file)==='.html'?'text/html;charset=utf-8':'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined;
 const browser=await chromium.launch({headless:true,executablePath});
 const results=[];
 try{
  for(const width of [320,390,430,768,1440]){
   const context=await browser.newContext({viewport:{width,height:width<768?844:1000},deviceScaleFactor:1});
   const page=await context.newPage();
   const errors=[],firebaseWrites=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>{
    const request=route.request(),url=new URL(request.url());
    if(request.method()!=='GET'&&/googleapis\.com|firebaseio\.com/.test(url.hostname))firebaseWrites.push({host:url.hostname,method:request.method()});
    if(url.origin===origin||['fonts.googleapis.com','fonts.gstatic.com','www.gstatic.com'].includes(url.hostname))return route.continue();
    return route.abort();
   });
   await page.goto(origin+'/index.html',{waitUntil:'networkidle'});
   await page.locator('#auth-form').waitFor({state:'visible',timeout:15000});
   await page.evaluate(()=>document.fonts.ready);
   for(const mode of ['login','signup']){
    await page.locator('[data-auth="'+mode+'"]').click();
    const geometry=await page.evaluate(()=>{
     const f=document.querySelector('#auth-form');
     const visible=[...f.querySelectorAll('input,button')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');
     return {viewport:innerWidth,body:document.body.scrollWidth,root:document.documentElement.scrollWidth,form:f.getBoundingClientRect().toJSON(),controls:visible.map(e=>({id:e.id||e.dataset.auth||e.textContent.trim().slice(0,30),tag:e.tagName,type:e.type,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width,scroll:e.scrollWidth,client:e.clientWidth})),montserrat:[...document.fonts].some(f=>f.family==='Montserrat'&&f.status==='loaded')};
    });
    assert.ok(geometry.body<=width+1&&geometry.root<=width+1,mode+' '+width+' page overflow '+JSON.stringify(geometry));
    assert.ok(geometry.form.left>=-1&&geometry.form.right<=width+1,mode+' '+width+' form clipped');
    for(const control of geometry.controls){
     assert.ok(control.left>=-1&&control.right<=width+1,mode+' '+width+' control clipped '+control.id);
     if(control.tag==='INPUT'&&control.type!=='checkbox'&&control.type!=='radio')assert.ok(control.width>=200,mode+' '+width+' input too narrow '+control.id);
     assert.ok(control.scroll<=control.client+2,mode+' '+width+' internal content overflow '+control.id);
    }
    if(width===390)await page.screenshot({path:path.join(qa,'auth-'+mode+'-390.png'),fullPage:true});
    results.push({width,mode,noOverflow:true,controlsInsideViewport:true,inputsAtLeast200px:true,montserratLoaded:geometry.montserrat});
   }
   assert.equal(firebaseWrites.length,0,'No writes to Firebase even attempted');
   assert.deepEqual(errors,[],'No JavaScript exceptions');
   await context.close();
  }
  fs.writeFileSync(path.join(qa,'auth-responsive-result.json'),JSON.stringify({browser:path.basename(executablePath||chromium.executablePath()),results,realAccountsCreated:0,firebaseWrites:0},null,2));
  console.log(JSON.stringify({passed:results.length,results,firebaseWrites:0,screenshots:['qa/auth-login-390.png','qa/auth-signup-390.png']},null,2));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e.message);server.close();process.exitCode=1;});
