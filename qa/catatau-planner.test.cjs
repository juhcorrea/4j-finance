'use strict';
// Real built app in demo mode. Only synthetic rows; no Firebase or payment calls.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'work','catatau-qa');
const hook=`window.PlannerFixture={
 configure(){const m=Money.today().slice(0,7);Store.data={receitas:[{id:'qa-income',data:m+'-05',valor:3000,desc:'Renda sintética',cat:'Salário'}],despesas:[{id:'qa-expense',data:m+'-10',valor:1500,desc:'Compromisso sintético',cat:'Moradia',parcelas:1,jaPagas:0,recurrence:{frequency:'monthly',until:''},recurrencePaid:[]}]};Store.meta.budgetPlan={fixed:50,reserve:20,variable:30};Store.meta.budgetMonths={};Store.emit();},
 data(){return JSON.stringify(Store.data)},
 today(){return Money.today()},
 firstDue(){return Money.addMonth(Money.today(),1)},
 switchProfile(id){Store.selectProfile(id)},
 profile(){return Store.profile},
 changed(){Store.data.receitas=[...Store.data.receitas];Store.emit();},
 editable(){return Store.editable},
 plannerClear(){CatatauPlanner.clear()},
 loading(value){Store.loading=value;Store.emit();},
 leaveApp(){Store.screen="auth";Store.emit();}
};`;
let html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const marker='if(document.modelContext?.registerTool)';assert.equal(html.split(marker).length,2);html=html.replace(marker,hook+'\n'+marker);
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/assets/catatau-sheriff.webp'){res.setHeader('Content-Type','image/webp');res.end(fs.readFileSync(path.join(root,'public/assets/catatau-sheriff.webp')));return;}res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);});
(async()=>{
 fs.mkdirSync(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined});
 const results=[],errors=[],forbidden=[];
 try{
  for(const [width,height] of [[320,568],[320,844],[390,844],[1440,1000]]){
   const context=await browser.newContext({viewport:{width,height},isMobile:width<768,hasTouch:width<768});
   await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===origin||['fonts.googleapis.com','fonts.gstatic.com'].includes(u.hostname))return route.continue();if(u.hostname==='www.gstatic.com'&&u.pathname.startsWith('/firebasejs/'))return route.fulfill({status:200,contentType:'application/javascript',body:''});forbidden.push({host:u.hostname,method:route.request().method()});return route.abort();});
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin+'/?demo=1',{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>PlannerFixture.configure());
   const original=await page.evaluate(()=>PlannerFixture.data());
   const trigger=width<961?page.locator('#catatau-mobile-trigger'):page.locator('#catatau-launcher');await trigger.click();
   let originalImage=await page.locator('#catatau-panel .chat-intro img').getAttribute('src');
   async function appearance(expected){
    await page.waitForFunction(active=>document.body.classList.contains('catatau-firm-active')===active,expected);
    const images=await page.locator('[data-catatau]').evaluateAll(elements=>elements.map(image=>({auth:!!image.closest('#auth'),src:image.getAttribute('src')})));
    for(const image of images)assert.equal(image.src,expected&&!image.auth?'assets/catatau-sheriff.webp':originalImage,'all app mascots follow active profile; login remains original');
    if(expected){await page.waitForFunction(()=>[...document.querySelectorAll('[data-catatau]')].filter(image=>!image.closest('#auth')).every(image=>image.complete&&image.naturalWidth>0));assert.match(await page.locator('#catatau-panel .chat-intro img').getAttribute('alt'),/chapéu de cowboy.*espora.*coldre/);}
   }
   await appearance(false);
   await page.locator('#catatau-firm').check();assert.match(await page.locator('#catatau-firm-note').textContent(),/Ativo:/);await appearance(true);
   if(height>660){const portrait=await page.locator('#catatau-panel .chat-intro img').evaluate(image=>{const frame=image.parentElement.getBoundingClientRect(),r=image.getBoundingClientRect();return {fit:getComputedStyle(image).objectFit,left:r.left,right:r.right,top:r.top,bottom:r.bottom,frameLeft:frame.left,frameRight:frame.right,frameTop:frame.top,frameBottom:frame.bottom};});assert.equal(portrait.fit,'contain');assert.ok(portrait.left>=portrait.frameLeft&&portrait.right<=portrait.frameRight+1&&portrait.top>=portrait.frameTop&&portrait.bottom<=portrait.frameBottom+1,'sheriff portrait fits entire body');}
   await page.screenshot({path:path.join(out,'sheriff-'+width+'x'+height+'.png'),fullPage:false});
   await page.locator('#catatau-firm').uncheck();await appearance(false);
   await page.locator('#catatau-firm').check();await appearance(true);
   async function send(value){await page.locator('#chat-input').fill(value);await page.locator('#chat-input').press('Enter');}
   async function last(){return page.locator('#chat-log .from-catatau').last().locator('p').textContent();}
   const financialDetails=text=>({amounts:text.match(/R\$\s*[\d.]+,\d{2}/g),details:text.split('\n').filter(line=>/^(•|A confirmar:|Para caber,|O parcelamento|Isso não garante|Este é um planejamento)/.test(line.trim()))});
   async function scenario(kind){
    await page.getByRole('button',{name:'Planejar uma compra',exact:true}).click();
    const welcome=await last();assert.match(welcome,/não cria um lançamento/);
    for(const value of ['Sofá sintético',kind==='over'?'10.000,00':'100','hoje',kind==='over'?'3':'não'])await send(value);
    if(kind==='over'){for(const value of ['10.500,00','500'])await send(value);const due=await page.evaluate(()=>PlannerFixture.firstDue());await send(due);assert.match(await last(),/total.*10\.500,00/);}
    await send('confirmar');assert.match(await last(),/Não há renda registrada/);
    for(const value of ['3000','0','confirmar',kind==='missing'?'não sei':kind==='over'?'100':'1000'])await send(value);
    if(kind==='over')await send('1000');
    assert.match(await last(),/Antes de calcular/);await send('confirmar');
    const result=await last();assert.match(result,/não bloqueia banco, cartão ou o registro/);
    if(kind==='over'){assert.match(result,/9\.100,00 após despesas, reserva e compra/);assert.match(result,/9\.900,00 no dinheiro livre/);assert.match(result,/limite disponível em R\$\s*9\.000,00/);assert.match(result,/500,00 a mais/);}
    if(kind==='missing'){assert.match(result,/A confirmar: Dinheiro livre na data da compra/);assert.doesNotMatch(result,/Cabe no orçamento informado/);}
    if(kind==='within'){assert.match(result,/Cabe no orçamento informado, preservando a reserva escolhida/);assert.match(result,/800,00/);assert.match(result,/não garante saldo no dia do vencimento/);}
    return {welcome,result};
   }
   const voiceChecks=[];
   for(const kind of ['missing','within','over']){
    await page.locator('#catatau-firm').uncheck();const normal=await scenario(kind);assert.doesNotMatch(normal.welcome+' '+normal.result,/xerife|carrinho|ronda|chapéu|uai|trem bão/i);
    await page.locator('#catatau-firm').check();const sheriff=await scenario(kind);assert.match(sheriff.welcome,/Uai, chega mais! Xerife Catatau/);
    assert.match(sheriff.result,kind==='over'?/Uai, sô.*segura esse carrinho.*Não compre agora/:kind==='missing'?/Uai, o xerife.*faltam dados/:/Ô trem bão.*ronda do orçamento/);
    assert.deepEqual(financialDetails(sheriff.result),financialDetails(normal.result),'voice preserves amounts, missing facts, actionable reasons and limitations: '+kind);
    voiceChecks.push(kind);
   }
   assert.equal(await page.evaluate(()=>PlannerFixture.data()),original,'planning does not create or mutate expenses');
   await page.waitForFunction(()=>{const log=document.querySelector('#chat-log');return Math.abs(log.lastElementChild.getBoundingClientRect().top-log.getBoundingClientRect().top)<20;});
   const geometry=await page.evaluate(()=>{const panel=document.querySelector('#catatau-panel'),r=panel.getBoundingClientRect();return {width:innerWidth,height:innerHeight,root:document.documentElement.scrollWidth,left:r.left,right:r.right,top:r.top,bottom:r.bottom,client:panel.clientWidth,scroll:panel.scrollWidth,font:getComputedStyle(panel).fontFamily,firmHeight:panel.querySelector('.planner-settings label').getBoundingClientRect().height,logHeight:panel.querySelector('#chat-log').clientHeight,controls:[...panel.querySelectorAll('#planner-actions button,#chat-send,.planner-settings label')].filter(e=>e.getClientRects().length).map(e=>({height:e.getBoundingClientRect().height}))};});
   assert.ok(geometry.root<=width+1&&geometry.left>=-1&&geometry.right<=width+1,'no horizontal overflow');assert.ok(geometry.top>=-1&&geometry.bottom<=geometry.height+1,'panel stays in viewport');assert.ok(geometry.scroll<=geometry.client+2,'no internal horizontal overflow');assert.match(geometry.font,/Montserrat/);assert.ok(geometry.firmHeight<=60,'compact firm control');assert.ok(geometry.logHeight>=100,'readable conversation area: '+JSON.stringify(geometry));for(const c of geometry.controls)assert.ok(c.height>=44,'readable touch control');
   await page.screenshot({path:path.join(out,'planner-'+width+'x'+height+'.png'),fullPage:false});
   for(const question of ['Oi','Como está meu saldo?','Como está minha reserva do mês?','Contas atrasadas','Como transferir dados?']){
    await page.locator('#catatau-firm').uncheck();await send(question);const normal=await last();
    await page.locator('#catatau-firm').check();await send(question);const sheriff=await last();
    assert.ok(sheriff.endsWith(normal),'general answer keeps every fact and limitation: '+question);
    if(question==='Como transferir dados?')assert.equal(sheriff,normal,'technical instructions are not embellished');else assert.notEqual(sheriff,normal,'contextual voice is active: '+question);
   }
   const initialProfile=await page.evaluate(()=>PlannerFixture.profile());
   await page.evaluate(()=>PlannerFixture.switchProfile('Meu novo espaço'));await trigger.click();assert.equal(await page.locator('#catatau-firm').isChecked(),false);assert.doesNotMatch(await page.locator('#catatau-firm-note').textContent(),/Ativo:/);assert.doesNotMatch(await page.locator('#chat-log').textContent(),/Sofá sintético/);await appearance(false);
   await send('Oi');assert.doesNotMatch(await last(),/Xerife Catatau/,'another profile does not inherit the voice');
   await page.evaluate(id=>PlannerFixture.switchProfile(id),initialProfile);await trigger.click();assert.equal(await page.locator('#catatau-firm').isChecked(),true);await appearance(true);
   await send('Oi');assert.match(await last(),/Xerife Catatau/,'returning to the active profile restores the voice');
   await page.getByRole('button',{name:'Planejar uma compra',exact:true}).click();await send('Plano interrompido');await page.evaluate(()=>PlannerFixture.changed());await send('500');assert.match(await last(),/registros ou o acesso deste perfil mudaram/);
   const preferences=await page.evaluate(()=>Object.entries(localStorage).filter(([key])=>key.startsWith('4j-catatau-firm-v1:')).map(([,value])=>value));assert.deepEqual(preferences,['true']);
   await page.locator('[data-action=close-catatau]').click();await page.evaluate(()=>location.hash='lancamentos');await page.locator('#entry-form').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>PlannerFixture.editable()),true);assert.equal(await page.locator('#entry-amount').isEnabled(),true);
   await appearance(true);
   await page.reload({waitUntil:'networkidle'});originalImage=await page.locator('#auth [data-catatau]').getAttribute('src');await page.evaluate(()=>PlannerFixture.configure());await trigger.click();assert.equal(await page.locator('#catatau-firm').isChecked(),true);await appearance(true);
   await page.evaluate(()=>PlannerFixture.loading(true));await appearance(false);assert.equal(await page.locator('#catatau-firm').isDisabled(),true);
   await page.evaluate(()=>PlannerFixture.loading(false));await appearance(true);
   await page.evaluate(()=>PlannerFixture.leaveApp());await appearance(false);
   await context.close();results.push({width,height,guidedComparison:true,voiceChecks,voiceKeepsFinancialDetails:true,generalRepliesKeepFacts:true,firmOptInIsolated:true,recordsUnchanged:true,entryStillEnabled:true,sheriffToggle:true,sheriffPersisted:true,sheriffProfileScoped:true,originalWithoutReadyProfile:true});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(forbidden,[]);
  const result={ok:true,results,errors,forbidden,scope:'Built app with demo rows; Chromium at 320/390/1440, no Firebase backend, LLM, payment or deploy.'};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error.stack);server.close();process.exitCode=1;});
