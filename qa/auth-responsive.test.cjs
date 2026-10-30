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
  const viewports=[{width:320,height:844},{width:390,height:844},{width:430,height:932},{width:768,height:1000},{width:844,height:390},{width:390,height:420},{width:961,height:900},{width:961,height:620},{width:1440,height:900},{width:1920,height:1080},{width:2291,height:908}];
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
   const themeToggle=page.locator('#auth .auth-theme-toggle[data-action="theme"]');
   const assertTheme=async expected=>{
    const actual=await themeToggle.evaluate(button=>({dark:document.body.classList.contains('dark'),pressed:button.getAttribute('aria-pressed'),label:button.getAttribute('aria-label'),title:button.getAttribute('title'),type:button.type,saved:localStorage.getItem('dashTheme')}));
    assert.equal(actual.dark,expected==='dark','Login theme matches selected appearance');
    assert.equal(actual.pressed,String(expected==='dark'),'Theme toggle exposes its pressed state');
    assert.equal(actual.type,'button','Theme switch must never submit the login form');
    assert.match(actual.label,expected==='dark'?/Ativar modo claro/i:/Ativar modo (noturno|escuro)/i,'Theme action has a descriptive accessible name');
    assert.equal(actual.title,actual.label,'Theme tooltip matches accessible action');
    assert.equal(actual.saved,expected,'Theme preference is saved locally');
   };
   assert.ok(await themeToggle.isVisible(),'Theme choice is available before signing in');
   await page.evaluate(()=>{window.__qaAuthSubmits=0;document.querySelector('#auth-form').addEventListener('submit',event=>{event.preventDefault();window.__qaAuthSubmits++;},true);});
   await page.locator('#auth-email').fill('qa-theme@example.invalid');
   await page.locator('#auth-password').fill('local-theme-test-only');
   await themeToggle.focus();
   await page.keyboard.press('Space');
   await assertTheme('dark');
   assert.equal(await page.locator('#auth-email').inputValue(),'qa-theme@example.invalid','Changing appearance preserves the email draft');
   assert.equal(await page.locator('#auth-password').inputValue(),'local-theme-test-only','Changing appearance preserves the password draft');
   assert.equal(await page.evaluate(()=>window.__qaAuthSubmits),0,'Theme choice cannot trigger form submission');
   await page.reload({waitUntil:'networkidle'});
   await page.locator('#auth-form').waitFor({state:'visible',timeout:15000});
   await assertTheme('dark');
   await themeToggle.click();
   await assertTheme('light');
   await page.evaluate(()=>{window.__qaPasswordSubmits=0;document.querySelector('#auth-form').addEventListener('submit',event=>{event.preventDefault();window.__qaPasswordSubmits++;},true);});
   results.push({width,height,mode:'theme-toggle',keyboardOperable:true,persistsOnReload:true,preservesDraft:true,noFormSubmission:true});
   for(const theme of ['light','dark']){
    if(await page.evaluate(()=>document.body.classList.contains('dark'))!==(theme==='dark'))await themeToggle.click();
    await assertTheme(theme);
   for(const mode of ['login','signup']){
    await page.locator('[data-auth="'+mode+'"]').click();
    const password=page.locator('#auth-password'),passwordToggle=page.locator('#auth-password-toggle');
    assert.equal(await password.getAttribute('type'),'password','Changing login/signup starts with the password concealed');
    assert.equal(await passwordToggle.getAttribute('type'),'button','Visibility control never submits the form');
    assert.equal(await passwordToggle.getAttribute('aria-label'),'Mostrar senha');
    assert.equal(await passwordToggle.getAttribute('aria-controls'),'auth-password');
    await password.fill('local-password-qa');
    await password.focus();
    await password.evaluate(el=>el.setSelectionRange(2,8));
    await passwordToggle.click();
    assert.equal(await password.getAttribute('type'),'text');
    assert.equal(await passwordToggle.getAttribute('aria-label'),'Ocultar senha');
    assert.equal(await password.inputValue(),'local-password-qa','Toggling preserves typed value');
    assert.deepEqual(await password.evaluate(el=>({focused:document.activeElement===el,start:el.selectionStart,end:el.selectionEnd})),{focused:true,start:2,end:8},'Pointer toggle preserves field focus and selection');
    await passwordToggle.focus();await page.keyboard.press('Space');
    assert.equal(await password.getAttribute('type'),'password','Keyboard can conceal password');
    await page.keyboard.press('Enter');
    assert.equal(await password.getAttribute('type'),'text','Keyboard can reveal password');
    assert.equal(await page.evaluate(()=>window.__qaPasswordSubmits),0,'Visibility clicks/keys never submit');
    const otherMode=mode==='login'?'signup':'login';
    await page.locator('[data-auth="'+otherMode+'"]').click();
    assert.equal(await password.getAttribute('type'),'password','Switching mode conceals the field');
    await page.locator('[data-auth="'+mode+'"]').click();
    assert.equal(await password.getAttribute('autocomplete'),mode==='login'?'current-password':'new-password');
    assert.equal(await password.inputValue(),'local-password-qa','Mode changes preserve the draft');
    await password.fill('');
    const geometry=await page.evaluate(()=>{
     const f=document.querySelector('#auth-form');
     const visible=[...f.querySelectorAll('input,button'),document.querySelector('#auth .auth-theme-toggle')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');
     const mobile=document.querySelector('.auth-mobile-welcome'),desktop=document.querySelector('.auth-desktop-pair');
     const pair=innerWidth<=960?mobile.querySelector('.auth-mascot-pair'):desktop;
     const mascots=[...pair.querySelectorAll('img')].map(image=>({normal:image.classList.contains('auth-catatau-normal'),sheriff:image.classList.contains('auth-catatau-sheriff'),duo:image.classList.contains('auth-catatau-duo'),alt:image.alt,loaded:image.complete&&image.naturalWidth>0,fixed:!image.hasAttribute('data-catatau'),src:image.getAttribute('src'),visible:!!image.getClientRects().length,bounds:image.getBoundingClientRect().toJSON()}));
     const headline=document.querySelector('.auth-story-copy').getBoundingClientRect();
     const shell=document.querySelector('#auth .auth-shell'),story=document.querySelector('#auth .auth-story'),formWrap=document.querySelector('#auth .auth-form-wrap');
     return {viewport:innerWidth,scrollY,body:document.body.scrollWidth,root:document.documentElement.scrollWidth,shell:shell.getBoundingClientRect().toJSON(),story:story.getBoundingClientRect().toJSON(),formWrap:formWrap.getBoundingClientRect().toJSON(),storyBackground:getComputedStyle(story).backgroundImage,storyColor:getComputedStyle(story).backgroundColor,formColor:getComputedStyle(formWrap).backgroundColor,form:f.getBoundingClientRect().toJSON(),submitTop:document.querySelector('#auth-submit').getBoundingClientRect().top+scrollY,mobileWelcomeVisible:!!mobile.getClientRects().length,desktopMascotVisible:!!desktop.getClientRects().length,mascots,pairBounds:pair.getBoundingClientRect().toJSON(),headlineBounds:headline.toJSON(),controls:visible.map(e=>({id:e.id||e.dataset.auth||e.textContent.trim().slice(0,30),tag:e.tagName,type:e.type,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,fontSize:parseFloat(getComputedStyle(e).fontSize),scroll:e.scrollWidth,client:e.clientWidth})),montserrat:[...document.fonts].some(f=>f.family==='Montserrat'&&f.status==='loaded')};
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
    assert.equal(geometry.desktopMascotVisible,width>960,'Desktop mascot pair matches its layout');
    assert.equal(geometry.mascots.length,1,'Welcome uses one illustration containing both Catatau versions');
    assert.ok(geometry.mascots[0].duo&&geometry.mascots[0].src==='assets/catatau-duo-welcome.webp','Welcome uses the side-by-side waving duo');
    assert.match(geometry.mascots[0].alt,/abra[cç]|abra[sç]ad/i,'Duo alternative text describes their embrace');
    assert.match(geometry.mascots[0].alt,/acen|dando tchau/i,'Duo alternative text describes their greeting');
    assert.ok(geometry.mascots.every(image=>image.loaded&&image.fixed&&image.visible),'Both welcome mascots load without choosing firm mode');
    for(const image of geometry.mascots)assert.ok(image.bounds.left>=-1&&image.bounds.right<=width+1&&image.bounds.width>40&&image.bounds.height>40,'Both Catatau versions remain visible inside the viewport');
    if(width>960){
     const {shell,story,formWrap}=geometry;
     assert.ok(shell.width<=1121,'Desktop login card remains compact on wide screens');
     assert.ok(Math.abs(shell.left+shell.width/2-width/2)<=1,'Desktop login card is horizontally centered');
     assert.ok(story.left>=shell.left-1&&formWrap.right<=shell.right+1,'Both desktop panels remain inside the login card');
     assert.ok(Math.abs(story.right-formWrap.left)<=1,'Welcome and form panels meet without a gap or overlap');
     assert.ok(Math.abs(story.top-formWrap.top)<=1&&Math.abs(story.bottom-formWrap.bottom)<=1,'Desktop panels share the card height');
     assert.ok(geometry.form.left>=formWrap.left-1&&geometry.form.right<=formWrap.right+1,'Desktop form stays inside the right panel');
     assert.ok(shell.top+geometry.scrollY>=0,'Desktop card starts within the reachable document');
     if(width>=1440&&height>=900&&mode==='login')assert.ok(shell.height<=height-64+1,'Desktop login card fits vertically with comfortable outer margins');
     if(shell.height<=height-64)assert.ok(Math.abs(shell.top+geometry.scrollY+shell.height/2-height/2)<=1,'Desktop card is vertically centered when it fits');
     assert.ok(geometry.pairBounds.top>=geometry.headlineBounds.bottom,'Desktop Catatau duo must not overlap its welcome copy');
     if(theme==='light'){
      assert.equal(geometry.formColor,'rgb(255, 255, 255)','Light desktop form panel remains white');
      assert.equal(geometry.storyColor,'rgb(255, 246, 222)','Light desktop welcome retains the warm yellow panel');
     }
    }
    if(width>=390&&width<=430&&height>=844&&mode==='login')assert.ok(geometry.submitTop<height,'Login action must be visible before scrolling on a regular iPhone');
    if(width===390&&height===844)await page.screenshot({path:path.join(qa,'auth-'+mode+'-'+theme+'-390.png'),fullPage:true});
    if(width===320&&mode==='login')await page.screenshot({path:path.join(qa,'auth-login-'+theme+'-320.png'),fullPage:true});
    if(width===1440&&mode==='login')await page.screenshot({path:path.join(qa,'auth-desktop-'+theme+'.png'),fullPage:true});
    if(width===2291&&mode==='login')await page.screenshot({path:path.join(qa,'auth-desktop-wide-'+theme+'.png'),fullPage:true});
    if(width===390&&height===420&&mode==='login'){
     await page.locator('#auth-password').focus();
     await page.locator('#auth-password').scrollIntoViewIfNeeded();
     const field=await page.locator('#auth-password').boundingBox();
     assert.ok(field.y>=0&&field.y+field.height<=height,'Password remains reachable with a short keyboard-sized viewport');
    }
    results.push({width,height,theme,mode,noOverflow:true,controlsInsideViewport:true,inputsAtLeast200px:true,mobileWelcomeVisible:geometry.mobileWelcomeVisible,bothMascotsVisible:true,themeToggleAccessible:true,montserratLoaded:geometry.montserrat,...(width>960?{desktopCard:{width:geometry.shell.width,height:geometry.shell.height,left:geometry.shell.left,top:geometry.shell.top+geometry.scrollY,storyWidth:geometry.story.width,formPanelWidth:geometry.formWrap.width},cardCentered:true,panelsAdjacent:true}:{})});
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
