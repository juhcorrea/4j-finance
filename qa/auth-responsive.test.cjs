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
  const viewports=[{width:320,height:844},{width:390,height:844},{width:430,height:932},{width:768,height:1000},{width:844,height:390},{width:390,height:420},{width:1440,height:1000}];
  for(const {width,height} of viewports){
   const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});
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
   for(const theme of ['light','dark']){
    await page.evaluate(dark=>document.body.classList.toggle('dark',dark),theme==='dark');
   for(const mode of ['login','signup']){
    await page.locator('[data-auth="'+mode+'"]').click();
    const geometry=await page.evaluate(()=>{
     const f=document.querySelector('#auth-form');
     const visible=[...f.querySelectorAll('input,button')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');
     const mobile=document.querySelector('.auth-mobile-welcome'),sheriff=mobile.querySelector('img'),desktop=document.querySelector('.auth-story>img');
     return {viewport:innerWidth,body:document.body.scrollWidth,root:document.documentElement.scrollWidth,form:f.getBoundingClientRect().toJSON(),submitTop:document.querySelector('#auth-submit').getBoundingClientRect().top+scrollY,mobileWelcomeVisible:!!mobile.getClientRects().length,sheriffLoaded:sheriff.complete&&sheriff.naturalWidth>0,sheriffIsDecorativeMode:!sheriff.hasAttribute('data-catatau'),desktopMascotVisible:!!desktop.getClientRects().length,controls:visible.map(e=>({id:e.id||e.dataset.auth||e.textContent.trim().slice(0,30),tag:e.tagName,type:e.type,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,fontSize:parseFloat(getComputedStyle(e).fontSize),scroll:e.scrollWidth,client:e.clientWidth})),montserrat:[...document.fonts].some(f=>f.family==='Montserrat'&&f.status==='loaded')};
    });
    assert.ok(geometry.body<=width+1&&geometry.root<=width+1,mode+' '+width+' page overflow '+JSON.stringify(geometry));
    assert.ok(geometry.form.left>=-1&&geometry.form.right<=width+1,mode+' '+width+' form clipped');
    for(const control of geometry.controls){
     assert.ok(control.left>=-1&&control.right<=width+1,mode+' '+width+' control clipped '+control.id);
     if(control.tag==='INPUT'&&control.type!=='checkbox'&&control.type!=='radio')assert.ok(control.width>=200,mode+' '+width+' input too narrow '+control.id);
     if(width<=960&&control.tag==='INPUT'&&control.type!=='checkbox'&&control.type!=='radio')assert.ok(control.fontSize>=16,mode+' '+width+' input could trigger iPhone zoom '+control.id);
     if(width<=960&&control.tag==='BUTTON')assert.ok(control.height>=44,mode+' '+width+' touch target too small '+control.id);
     assert.ok(control.scroll<=control.client+2,mode+' '+width+' internal content overflow '+control.id);
    }
    assert.equal(geometry.mobileWelcomeVisible,width<=960,'Mobile welcome matches layout');
    assert.equal(geometry.desktopMascotVisible,width>960,'Original desktop scene preserved');
    assert.ok(geometry.sheriffLoaded&&geometry.sheriffIsDecorativeMode,'Welcome sheriff loads without choosing firm mode');
    if(width>=390&&width<=430&&height>=844&&mode==='login')assert.ok(geometry.submitTop<height,'Login action must be visible before scrolling on a regular iPhone');
    if(width===390&&height===844)await page.screenshot({path:path.join(qa,'auth-'+mode+'-'+theme+'-390.png'),fullPage:true});
    if(width===320&&mode==='login')await page.screenshot({path:path.join(qa,'auth-login-'+theme+'-320.png'),fullPage:true});
    if(width===1440&&mode==='login')await page.screenshot({path:path.join(qa,'auth-desktop-'+theme+'.png'),fullPage:true});
    if(width===390&&height===420&&mode==='login'){
     await page.locator('#auth-password').focus();
     await page.locator('#auth-password').scrollIntoViewIfNeeded();
     const field=await page.locator('#auth-password').boundingBox();
     assert.ok(field.y>=0&&field.y+field.height<=height,'Password remains reachable with a short keyboard-sized viewport');
    }
    results.push({width,height,theme,mode,noOverflow:true,controlsInsideViewport:true,inputsAtLeast200px:true,mobileWelcomeVisible:geometry.mobileWelcomeVisible,montserratLoaded:geometry.montserrat});
   }
   }
   await page.locator('[data-auth="login"]').click();
   await page.locator('#auth-email').fill('');
   await page.locator('[data-action="reset-password"]').click();
   assert.ok(await page.locator('#auth-error').isVisible(),'Password reset keeps its accessible inline message');
   if(width===320){
    await page.evaluate(()=>{
     const elements=[...document.querySelectorAll('#auth h1,#auth h2,#auth p,#auth button,#auth input,#auth label,#auth a,#auth small,#auth span')];
     const sizes=elements.map(el=>parseFloat(getComputedStyle(el).fontSize));
     elements.forEach((el,index)=>el.style.fontSize=(sizes[index]*2)+'px');
    });
    const overflow=await page.evaluate(()=>({body:document.body.scrollWidth,root:document.documentElement.scrollWidth,dividerBottom:document.querySelector('.auth-form .or span').getBoundingClientRect().bottom,demoTop:document.querySelector('.auth-form a[href="?demo=1"]').getBoundingClientRect().top}));
    assert.ok(overflow.body<=width+1&&overflow.root<=width+1,'200% text must reflow without horizontal page scrolling');
    assert.ok(overflow.dividerBottom<overflow.demoTop,'200% divider text must not overlap the demonstration action');
    await page.locator('#auth-submit').scrollIntoViewIfNeeded();
    assert.ok(await page.locator('#auth-submit').isVisible(),'Login action remains reachable at 200% text');
    await page.evaluate(()=>{document.activeElement.blur();window.scrollTo(0,0);});
    await page.screenshot({path:path.join(qa,'auth-large-text-320.png'),fullPage:true});
    results.push({width,height,theme:'dark',mode:'large-text-200%',noOverflow:true,loginReachable:true});
   }
   assert.equal(firebaseWrites.length,0,'No writes to Firebase even attempted');
   assert.deepEqual(errors,[],'No JavaScript exceptions');
   await context.close();
  }
  fs.writeFileSync(path.join(qa,'auth-responsive-result.json'),JSON.stringify({browser:path.basename(executablePath||chromium.executablePath()),results,realAccountsCreated:0,firebaseWrites:0},null,2));
  console.log(JSON.stringify({passed:results.length,results,firebaseWrites:0,screenshots:['qa/auth-login-light-390.png','qa/auth-login-dark-390.png','qa/auth-signup-light-390.png','qa/auth-signup-dark-390.png','qa/auth-large-text-320.png','qa/auth-desktop-light.png','qa/auth-desktop-dark.png']},null,2));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e.message);server.close();process.exitCode=1;});
