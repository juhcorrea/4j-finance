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
 plannerClear(){CatatauPlanner.clear()}
};`;
let html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const marker='if(document.modelContext?.registerTool)';assert.equal(html.split(marker).length,2);html=html.replace(marker,hook+'\n'+marker);
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);});
(async()=>{
 fs.mkdirSync(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined});
 const results=[],errors=[],forbidden=[];
 try{
  for(const width of [320,390,1440]){
   const context=await browser.newContext({viewport:{width,height:width<768?844:1000},isMobile:width<768,hasTouch:width<768});
   await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===origin||['fonts.googleapis.com','fonts.gstatic.com'].includes(u.hostname))return route.continue();if(u.hostname==='www.gstatic.com'&&u.pathname.startsWith('/firebasejs/'))return route.fulfill({status:200,contentType:'application/javascript',body:''});forbidden.push({host:u.hostname,method:route.request().method()});return route.abort();});
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin+'/?demo=1',{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>PlannerFixture.configure());
   const original=await page.evaluate(()=>PlannerFixture.data());
   const trigger=width<961?page.locator('#catatau-mobile-trigger'):page.locator('#catatau-launcher');await trigger.click();
   await page.locator('#catatau-firm').check();assert.match(await page.locator('#catatau-firm-note').textContent(),/Ativo:/);
   async function send(value){await page.locator('#chat-input').fill(value);await page.locator('#chat-input').press('Enter');}
   async function last(){return page.locator('#chat-log .from-catatau').last().textContent();}
   await page.getByRole('button',{name:'Planejar uma compra',exact:true}).click();
   for(const value of ['Sofá sintético','10.000,00','hoje','3','10.500,00','500'])await send(value);
   const due=await page.evaluate(()=>PlannerFixture.firstDue());await send(due);assert.match(await last(),/total.*10\.500,00/);
   await send('confirmar');assert.match(await last(),/Não há renda registrada/);
   await send('3000');await send('0');await send('confirmar');await send('100');await send('1000');assert.match(await last(),/Antes de calcular/);
   await send('confirmar');const result=await last();assert.match(result,/Não compre agora/);assert.match(result,/500,00 a mais/);assert.match(result,/não bloqueia banco, cartão ou o registro/);
   assert.equal(await page.evaluate(()=>PlannerFixture.data()),original,'planning does not create or mutate expenses');
   await page.waitForFunction(()=>{const log=document.querySelector('#chat-log');return Math.abs(log.lastElementChild.getBoundingClientRect().top-log.getBoundingClientRect().top)<20;});
   const geometry=await page.evaluate(()=>{const panel=document.querySelector('#catatau-panel'),r=panel.getBoundingClientRect();return {width:innerWidth,height:innerHeight,root:document.documentElement.scrollWidth,left:r.left,right:r.right,top:r.top,bottom:r.bottom,client:panel.clientWidth,scroll:panel.scrollWidth,font:getComputedStyle(panel).fontFamily,firmHeight:panel.querySelector('.planner-settings label').getBoundingClientRect().height,logHeight:panel.querySelector('#chat-log').clientHeight,controls:[...panel.querySelectorAll('#planner-actions button,#chat-send,.planner-settings label')].filter(e=>e.getClientRects().length).map(e=>({height:e.getBoundingClientRect().height}))};});
   assert.ok(geometry.root<=width+1&&geometry.left>=-1&&geometry.right<=width+1,'no horizontal overflow');assert.ok(geometry.top>=-1&&geometry.bottom<=geometry.height+1,'panel stays in viewport');assert.ok(geometry.scroll<=geometry.client+2,'no internal horizontal overflow');assert.match(geometry.font,/Montserrat/);assert.ok(geometry.firmHeight<=60,'compact firm control');assert.ok(geometry.logHeight>=100,'readable conversation area');for(const c of geometry.controls)assert.ok(c.height>=44,'readable touch control');
   await page.screenshot({path:path.join(out,'planner-'+width+'.png'),fullPage:false});
   const initialProfile=await page.evaluate(()=>PlannerFixture.profile());
   await page.evaluate(()=>PlannerFixture.switchProfile('Meu novo espaço'));await trigger.click();assert.equal(await page.locator('#catatau-firm').isChecked(),false);assert.doesNotMatch(await page.locator('#catatau-firm-note').textContent(),/Ativo:/);assert.doesNotMatch(await page.locator('#chat-log').textContent(),/Sofá sintético/);
   await page.evaluate(id=>PlannerFixture.switchProfile(id),initialProfile);await trigger.click();assert.equal(await page.locator('#catatau-firm').isChecked(),true);
   await page.getByRole('button',{name:'Planejar uma compra',exact:true}).click();await send('Plano interrompido');await page.evaluate(()=>PlannerFixture.changed());await send('500');assert.match(await last(),/registros ou o acesso deste perfil mudaram/);
   const preferences=await page.evaluate(()=>Object.entries(localStorage).filter(([key])=>key.startsWith('4j-catatau-firm-v1:')).map(([,value])=>value));assert.deepEqual(preferences,['true']);
   await page.locator('[data-action=close-catatau]').click();await page.evaluate(()=>location.hash='lancamentos');await page.locator('#entry-form').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>PlannerFixture.editable()),true);assert.equal(await page.locator('#entry-amount').isEnabled(),true);
   await context.close();results.push({width,guidedComparison:true,firmOptInIsolated:true,recordsUnchanged:true,entryStillEnabled:true});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(forbidden,[]);
  const result={ok:true,results,errors,forbidden,scope:'Built app with demo rows; Chromium at 320/390/1440, no Firebase backend, LLM, payment or deploy.'};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error.stack);server.close();process.exitCode=1;});