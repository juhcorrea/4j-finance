'use strict';
// Real built app with synthetic demo rows. Every external service and financial mutation is blocked.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),pub=path.join(root,'public'),out=path.join(root,'work','planning-page-qa');
const hook=`window.PlanningFixture={
 operations:[],
 configure(kind='within'){
  const m=Money.today().slice(0,7);
  Store.data={receitas:kind==='missing'?[]:[{id:'qa-income',data:m+'-05',valor:3000,desc:'Renda sintética',cat:'Salário'}],despesas:[{id:'qa-expense',data:m+'-10',valor:kind==='over'?2900:1500,desc:'Compromisso sintético',cat:'Moradia',parcelas:1,jaPagas:0,recurrence:{frequency:'monthly',until:''},recurrencePaid:[]}]};
  Store.meta.budgetPlan={fixed:50,reserve:20,variable:30};Store.meta.budgetMonths={};Store.emit();
 },
 protect(){for(const name of ['saveRecord','removeRecord','saveGoals','addCategory','createProfile','share','importRows','touch']){Store[name]=()=>{this.operations.push(name);throw Error('QA forbids financial mutation: '+name);};}},
 data(){return JSON.stringify(Store.data)},
 today(){return Money.today()},
 firstDue(){return Money.addMonth(Money.today(),1)},
 clock(days){this.originalToday||=Money.today;Money.today=days?()=>new Date(new Date(this.originalToday()+'T12:00:00Z').getTime()+days*86400000).toISOString().slice(0,10):this.originalToday;},
 profile(){return Store.profile},
 switchProfile(id){Store.selectProfile(id)},
 changed(){Store.data.receitas=[...Store.data.receitas];Store.emit()},
 loading(value){Store.loading=value;Store.emit()},
 account(uid){Store.user={...Store.user,uid};Store.emit()},
 leaveApp(){Store.screen='auth';Store.emit()},
 error(value){Store.error=value;Store.emit()},
 month(){return Money.today().slice(0,7)}
};`;
let html=fs.readFileSync(path.join(pub,'index.html'),'utf8');
const buildSha256=crypto.createHash('sha256').update(html).digest('hex');
const marker='if(document.modelContext?.registerTool)';
assert.equal(html.split(marker).length,2,'fixture injection point is unique');
html=html.replace(marker,hook+'\n'+marker);
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://127.0.0.1').pathname;
 if(pathname==='/'||pathname==='/index.html'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);return;}
 const file=path.resolve(pub,'.'+decodeURIComponent(pathname));
 if(!file.startsWith(pub+path.sep)){res.writeHead(403);res.end();return;}
 try{res.setHeader('Content-Type',path.extname(file)==='.webp'?'image/webp':'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
});

async function geometry(page,width){
 const value=await page.evaluate(()=>{
  const root=document.querySelector('#main'),r=root.getBoundingClientRect();
  return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,left:r.left,right:r.right,client:root.clientWidth,scroll:root.scrollWidth,font:getComputedStyle(root).fontFamily,overflow:[...root.querySelectorAll('*')].filter(el=>el.getClientRects().length&&el.getBoundingClientRect().right>root.getBoundingClientRect().right+1).slice(0,8).map(el=>({tag:el.tagName,id:el.id,class:el.className,right:el.getBoundingClientRect().right}))};
 });
 assert.ok(value.documentWidth<=width+1,'no horizontal document overflow: '+JSON.stringify(value));
 assert.ok(value.left>=-1&&value.right<=width+1,'main fits viewport: '+JSON.stringify(value));
 assert.ok(value.scroll<=value.client+2,'no horizontal main overflow: '+JSON.stringify(value));
 assert.match(value.font,/Montserrat/);
 return value;
}

async function capture(page,name){
 await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo({top:0,left:0,behavior:'instant'});});
 await page.screenshot({path:path.join(out,name),fullPage:true});
 if(/^planning-(1440-light|390-dark)\.png$/.test(name))await page.screenshot({path:path.join(out,name.replace('.png','-viewport.png')),fullPage:false});
}

async function runScenarios(page,width,height,dark){
 const planning=page.locator('#planning-page');await planning.waitFor({state:'visible'});
 assert.equal(await page.locator('#catatau-panel').isVisible(),false,'dedicated page works without chat');
 assert.equal(await page.locator('body').evaluate(body=>body.classList.contains('dark')),dark);
 const original=await page.evaluate(()=>PlanningFixture.data());
 const profile=await page.evaluate(()=>PlanningFixture.profile());
 const date=await page.evaluate(()=>PlanningFixture.today()),due=await page.evaluate(()=>PlanningFixture.firstDue());
 const navigation=page.locator((width<961?'#bottom-nav':'#side-nav')+' a[href="#planejar"]');
 assert.equal(await navigation.isVisible(),true,'direct visible planning navigation');
 const navBox=await navigation.boundingBox();assert.ok(navBox.width>=44&&navBox.height>=44,'planning touch target');
 assert.equal(await navigation.getAttribute('aria-current'),'page');
 await page.locator('[data-planning-action="start"]').click();
 assert.equal(await page.locator('#planning-name').evaluate(el=>el===document.activeElement),true,'direct purchase action focuses form');
 assert.equal(await page.evaluate(()=>location.hash),'#planejar','purchase shortcut keeps dedicated route');
 if(width<961){
  const more=page.locator('#bottom-nav [data-action="mobile-more"]');assert.equal(await more.isVisible(),true);
  assert.equal(await page.locator('#bottom-nav>a,#bottom-nav>button').count(),5,'mobile bar keeps five reachable items');
  await more.click();await page.locator('#modal').waitFor({state:'visible'});
  assert.match(await page.locator('#modal').textContent(),/Mais do seu 4J/);await page.keyboard.press('Escape');
  assert.equal(await page.locator('#modal').isVisible(),false,'More dialog closes with Escape');
  for(const route of ['metas','ano','acertos']){
   await more.click();await page.locator('#modal .mobile-more-links a[href="#'+route+'"]').click();
   await page.waitForFunction(route=>location.hash==='#'+route,route);
   assert.equal(await page.locator('#modal').isVisible(),false,'More navigation closes dialog');
   await navigation.click();await planning.waitFor({state:'visible'});
  }
 }else assert.equal(await page.locator('#side-nav>a').count(),7,'desktop retains all seven pages');
 await capture(page,`planning-${width}-${dark?'dark':'light'}.png`);
 async function start(){
  if(await page.locator('[data-planning-action="new"]').count())await page.locator('[data-planning-action="new"]').first().click();
  else if(await page.locator('[data-planning-action="back"]').count())await page.locator('[data-planning-action="back"]').first().click();
  await page.locator('#planning-terms-form').waitFor({state:'visible'});
 }
 async function terms(kind,name='Sofá sintético'){
  await start();const form=page.locator('#planning-terms-form');
  await form.locator('[name=name]').fill(name);await form.locator('[name=cash]').fill(kind==='over'?'10000':'100');
  await form.locator('[name=purchaseDate]').fill(date);
  await form.locator('[name=compare]').setChecked(kind==='over');
  if(kind==='over'){
   await form.locator('[name=count]').fill('3');await form.locator('[name=total]').fill('10500');
   await form.locator('[name=down]').fill('500');await form.locator('[name=firstDue]').fill(due);
  }
  await form.locator('[type=submit]').click();await page.locator('#planning-assumptions-form').waitFor({state:'visible'});
 }
 async function assumptions(kind){
  const form=page.locator('#planning-assumptions-form');
  if(await form.locator('[name=income]').count())await form.locator('[name=income]').fill(kind==='missing'?'':'3000');
  await form.locator('[name=extra]').fill(kind==='missing'?'':'0');
  await form.locator('[name=reserveMode]').selectOption(kind==='missing'?'unknown':'plan');
  await form.locator('[name=cashAvailable]').fill(kind==='missing'?'':kind==='over'?'100':'1000');
  if(await form.locator('[name=cardLimit]').count())await form.locator('[name=cardLimit]').fill(kind==='missing'?'':kind==='over'?'1000':'10000');
  await form.locator('[name=confirm]').uncheck();await form.locator('[type=submit]').click();
  assert.equal(await page.locator('#planning-result').count(),0,'calculation requires explicit assumptions confirmation');
  await form.locator('[name=confirm]').check();await form.locator('[type=submit]').click();
  await page.locator('#planning-result').waitFor({state:'visible'});
  const status=await page.locator('#planning-result').getAttribute('data-status');
  assert.equal(status,kind==='missing'?'insufficient':kind);
  return page.locator('#planning-result-copy').textContent();
 }
 async function scenario(kind,name){await terms(kind,name);return assumptions(kind);}
 function financialDetails(text){return text.match(/R\$\s*[\d.]+,\d{2}/g)||[];}
 const normal=await scenario('within');assert.match(normal,/Cabe no orçamento informado/);assert.match(normal,/800,00/);
 assert.match(normal,/não bloqueia banco, cartão/);assert.doesNotMatch(normal,/ronda|xerife|uai/i);
 await page.locator('#planning-firm').check();
 await page.waitForFunction(()=>document.querySelector('#catatau-firm')?.checked===true);
 const firm=await page.locator('#planning-result-copy').textContent();assert.match(firm,/ronda|trem bão/i);
 assert.deepEqual(financialDetails(firm),financialDetails(normal),'firm voice preserves calculations');
 const trigger=page.locator(width<961?'#catatau-mobile-trigger':'#catatau-launcher');await trigger.click();
 assert.equal(await page.locator('#catatau-firm').isChecked(),true);
 await page.locator('#catatau-firm').uncheck();await page.locator('[data-action="close-catatau"]').click();
 assert.equal(await page.locator('#planning-firm').isChecked(),false,'chat preference updates page');
 assert.match(await page.locator('#planning-result-copy').textContent(),/Cabe no orçamento informado/);
 assert.doesNotMatch(await page.locator('#planning-result-copy').textContent(),/ronda|trem bão/i);
 const missing=await scenario('missing');assert.match(missing,/faltam dados/);assert.doesNotMatch(missing,/Cabe no orçamento informado/);
 const over=await scenario('over');assert.match(over,/9\.100,00/);assert.match(over,/9\.900,00/);assert.match(over,/9\.000,00/);assert.match(over,/500,00 a mais/);
 await page.locator('#planning-firm').check();assert.match(await page.locator('#planning-result-copy').textContent(),/Não compre agora/);
 await geometry(page,width);
 await capture(page,`planning-result-${width}-${dark?'dark':'light'}.png`);
 assert.equal(await page.evaluate(()=>PlanningFixture.data()),original,'planning never changes records');

 await start();let form=page.locator('#planning-terms-form');
 await form.locator('[name=name]').fill('Compra inválida sintética');await form.locator('[name=cash]').fill('10000');await form.locator('[name=purchaseDate]').fill(date);
 await form.locator('[name=compare]').check();await form.locator('[name=total]').fill('10500');await form.locator('[name=down]').fill('500');await form.locator('[name=firstDue]').fill(due);
 await form.locator('[name=count]').fill('25');await form.locator('[type=submit]').click();
 assert.equal(await page.locator('#planning-assumptions-form').count(),0,'25 installments rejected');
 assert.equal(await form.locator('[name=count]').getAttribute('aria-invalid'),'true');
 assert.equal(await page.locator('#planning-result').count(),0);
 await form.locator('[name=count]').fill('3');await form.locator('[name=down]').fill('10500');await form.locator('[type=submit]').click();
 assert.equal(await page.locator('#planning-assumptions-form').count(),0,'down payment equal to total rejected');
 assert.equal(await form.locator('[name=down]').getAttribute('aria-invalid'),'true');
 await form.locator('[name=down]').fill('500');await form.locator('[name=firstDue]').fill('2020-01-01');await form.locator('[type=submit]').click();
 assert.equal(await page.locator('#planning-assumptions-form').count(),0,'past installment due date rejected');
 assert.equal(await form.locator('[name=firstDue]').getAttribute('aria-invalid'),'true');
 const escaped='<img id="qa-xss" src=x onerror="window.qaXss=1">';
 const safe=await scenario('within',escaped);assert.ok(safe.includes(escaped),'name preserved as text');
 assert.equal(await page.locator('#qa-xss').count(),0,'purchase name is not interpreted as HTML');assert.equal(await page.evaluate(()=>window.qaXss),undefined);

 await page.evaluate(()=>PlanningFixture.changed());await page.locator('#planning-terms-form').waitFor({state:'visible'});
 assert.equal(await page.locator('#planning-result').count(),0,'record changes invalidate result');
 assert.match(await page.locator('#planning-notice').textContent(),/mud|atualiz|refa|novamente/i);
 assert.equal(await page.locator('#planning-terms-form [name=name]').inputValue(),escaped,'authorized same-profile draft survives invalidation');
 await scenario('within','Plano antes da troca');
 await page.evaluate(()=>PlanningFixture.switchProfile('Meu novo espaço'));
 await page.locator('#planning-terms-form').waitFor({state:'visible'});
 assert.equal(await page.locator('#planning-result').count(),0,'other profile has no result');
 assert.equal(await page.locator('#planning-terms-form [name=name]').inputValue(),'','other profile has no purchase draft');
 assert.equal(await page.locator('#planning-firm').isChecked(),false,'firm opt-in is profile scoped');
 assert.doesNotMatch(await planning.textContent(),/Plano antes da troca|Sofá sintético/);
 await page.evaluate(profile=>PlanningFixture.switchProfile(profile),profile);
 await page.waitForFunction(()=>document.querySelector('#planning-firm')?.checked===true);
 await scenario('within','Plano antes de carregar');
 await page.evaluate(()=>PlanningFixture.loading(true));
 await page.waitForFunction(()=>!document.querySelector('#planning-result'));
 assert.doesNotMatch(await page.locator('#main').textContent(),/Plano antes de carregar|R\$\s*9\.100/,'loading clears prior financial result');
 await page.evaluate(()=>PlanningFixture.loading(false));await page.locator('#planning-terms-form').waitFor({state:'visible'});

 // Watch findings update from current records; home supervision is optional per profile.
 await page.evaluate(()=>PlanningFixture.configure('over'));
 await page.locator('[data-planning-watch="page"]').waitFor({state:'visible'});
 assert.ok(await page.locator('[data-planning-watch="page"] [data-watch-kind="expense-gap"], [data-planning-watch="page"] [data-watch-kind="reserve-gap"]').count()>0,'budget pressure produces an actionable local watch finding');
 await page.locator('#planning-firm').uncheck();await page.evaluate(()=>location.hash='inicio');
 await page.waitForFunction(()=>location.hash==='#inicio'&&!document.querySelector('#planning-page'));
 assert.equal(await page.locator('[data-planning-watch="home"] .watch-home').count(),0,'home supervision is not shown without consent');
 await navigation.click();await page.locator('#planning-firm').check();await page.evaluate(()=>location.hash='inicio');
 await page.locator('[data-planning-watch="home"] .watch-home').waitFor({state:'visible'});
 assert.match(await page.locator('[data-planning-watch="home"]').textContent(),/RONDA DO CATATAU|Ronda do Catatau/);
 await page.evaluate(()=>PlanningFixture.loading(true));await page.waitForFunction(()=>!document.querySelector('[data-planning-watch="home"] .watch-home'));
 await page.evaluate(()=>PlanningFixture.loading(false));await navigation.click();
 await page.evaluate(()=>PlanningFixture.configure('missing'));
 await page.locator('[data-planning-watch="page"] [data-watch-kind="income-missing"]').waitFor({state:'visible'});
 assert.equal(await page.locator('[data-planning-watch="page"] [data-watch-kind="within"]').count(),0,'unknown income cannot produce reassuring within label');
 await page.evaluate(()=>PlanningFixture.configure());
 async function chooseMonth(value){
  await page.locator('[data-planning-watch="page"] [data-action="month-dialog"]').click();
  const year=value.slice(0,4);
  if(await page.locator('#calendar-year').inputValue()!==year)await page.locator('#modal [data-action="month-year"][data-year="'+year+'"]').click();
  await page.locator('#modal [data-action="select-month"][data-month="'+value+'"]').first().click();
 }
 await chooseMonth(due.slice(0,7));
 await page.waitForFunction(()=>document.querySelector('[data-planning-watch="page"] [data-watch-kind="income-missing"]'));
 assert.doesNotMatch(await page.locator('[data-planning-watch="page"] .watch-numbers').textContent(),/3\.000,00/,'watch month selection replaces prior income');
 await chooseMonth(date.slice(0,7));
 await page.waitForFunction(()=>document.querySelector('[data-planning-watch="page"] .watch-numbers')?.textContent.includes('3.000,00'));
 await geometry(page,width);

 // Page and relevant form controls stay usable when text is enlarged to 200%.
 if((width===320&&!dark)||(width===1440&&dark)){
  await page.evaluate(()=>{
   const nodes=[...document.querySelectorAll('#main *,#bottom-nav *')].map(el=>[el,parseFloat(getComputedStyle(el).fontSize)]);
   window.qaOriginalFontStyles=nodes.map(([el])=>[el,el.style.fontSize]);
   for(const [el,size] of nodes)el.style.fontSize=(size*2)+'px';
  });
  await capture(page,`planning-200-text-${width}.png`);await geometry(page,width);
  await page.evaluate(()=>{for(const [el,size] of window.qaOriginalFontStyles)el.style.fontSize=size;delete window.qaOriginalFontStyles;});
  // Navigate away and back to restore the unmodified generated page.
  await page.evaluate(()=>location.hash='inicio');await page.waitForFunction(()=>!document.querySelector('#planning-page'));await navigation.click();
 }
 if(width===1440&&dark){
  await terms('within','Plano de ontem');await page.evaluate(()=>PlanningFixture.clock(1));
  await page.locator('#planning-assumptions-form [type=submit]').click();
  await page.locator('#planning-terms-form').waitFor({state:'visible'});
  assert.equal(await page.locator('#planning-result').count(),0,'day rollover invalidates old calculation');
  assert.match(await page.locator('#planning-notice').textContent(),/mud|atualiz|novamente/i);
  await page.evaluate(()=>{PlanningFixture.clock(0);PlanningFixture.changed();});
 }
 await scenario('within','Plano da conta anterior');
 await page.evaluate(()=>PlanningFixture.account('qa-other-account'));
 await page.locator('#planning-terms-form').waitFor({state:'visible'});
 assert.equal(await page.locator('#planning-terms-form [name=name]').inputValue(),'','account change clears purchase draft');
 assert.equal(await page.locator('#planning-result').count(),0,'account change clears result');
 assert.equal(await page.locator('#planning-firm').isChecked(),false,'another account does not inherit opt-in');
 await page.evaluate(()=>PlanningFixture.leaveApp());
 await page.waitForFunction(()=>!document.querySelector('#planning-result'));
 assert.doesNotMatch(await page.locator('#main').textContent(),/Plano da conta anterior|R\$/,'auth state clears financial planning content');
 return {directTabWithoutChat:true,allNavigationReachable:true,withinOverMissing:true,installmentsValidated:true,escapedName:true,firmPageChatSync:true,firmScoped:true,recordsUnchanged:true,invalidatedOnRecordsProfilesAccountsLoadingAuth:true,watchLocalAndOptional:true,text200:((width===320&&!dark)||(width===1440&&dark)),dayRollover:width===1440&&dark};
}

(async()=>{
 fs.mkdirSync(out,{recursive:true});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined});
 const results=[],errors=[],forbidden=[];
 try{
  for(const [width,height] of [[320,844],[390,844],[1440,1000]])for(const dark of [false,true]){
   const context=await browser.newContext({viewport:{width,height},isMobile:width<768,hasTouch:width<768});
   await context.addInitScript(dark=>localStorage.setItem('dashTheme',dark?'dark':'light'),dark);
   await context.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.origin===origin||['fonts.googleapis.com','fonts.gstatic.com'].includes(u.hostname))return route.continue();
    if(u.hostname==='www.gstatic.com'&&u.pathname.startsWith('/firebasejs/'))return route.fulfill({status:200,contentType:'application/javascript',body:''});
    forbidden.push({host:u.hostname,method:route.request().method()});return route.abort();
   });
   const page=await context.newPage();page.setDefaultTimeout(10000);
   page.on('pageerror',error=>errors.push({width,height,dark,message:error.message}));
   await page.goto(origin+'/?demo=1#planejar',{waitUntil:'networkidle'});
   await page.evaluate(()=>document.fonts.ready);
   await page.evaluate(()=>{PlanningFixture.configure();PlanningFixture.protect();});
   const result=await runScenarios(page,width,height,dark);
   assert.deepEqual(await page.evaluate(()=>PlanningFixture.operations),[],'no attempted financial mutation');
   results.push({width,height,dark,...result});await context.close();
  }
  assert.deepEqual(errors,[],'no browser JavaScript errors');assert.deepEqual(forbidden,[],'no attempted external backend/LLM/payment request');
  const result={ok:true,buildSha256,results,errors,forbidden,scope:'Locally served built app with synthetic demo data; Chromium 320/390/1440 light/dark. No real Firebase, LLM, payment, physical iPhone or Safari test.'};
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error.stack);server.close();process.exitCode=1;});
