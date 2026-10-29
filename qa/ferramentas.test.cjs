'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=path.resolve(__dirname,'..'),pub=path.join(base,'public');
const out=process.env.FOURJ_TOOLS_QA_OUTPUT||path.resolve(base,'work/qa-ferramentas');
fs.mkdirSync(out,{recursive:true});
const types={'.html':'text/html;charset=utf-8','.css':'text/css;charset=utf-8','.js':'application/javascript;charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');let file=path.resolve(pub,'.'+decodeURIComponent(url.pathname));if(!path.extname(file))file+='.html';
  if(!file.startsWith(pub+path.sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const results=[],errors=[],unexpectedRequests=[];
  try{
    for(const width of [320,390,1440]){
      const ctx=await browser.newContext({viewport:{width,height:width<768?844:1000}});
      await ctx.route('**/*',route=>{const req=route.request(),url=new URL(req.url());if(url.origin===origin&&req.method()==='GET'&&!url.search)return route.continue();if(['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname))return route.continue();unexpectedRequests.push({host:url.hostname,path:url.pathname,method:req.method()});return route.abort();});
      const page=await ctx.newPage();page.on('pageerror',error=>errors.push(error.message));
      await page.goto(origin+'/ferramentas.html',{waitUntil:'networkidle'});
      await page.waitForFunction(()=>window.FourJTools&&![...document.querySelectorAll('[data-tool-controls]')].some(el=>el.disabled));
      await page.locator('[data-consent-action=reject]').first().click();
      assert.equal(await page.locator('main h1').count(),1);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,'no horizontal overflow '+width);
      const budget=page.locator('[data-tool=budget]');
      await budget.getByRole('button',{name:'Calcular meu plano'}).click();
      assert.match(await budget.locator('.tool-error').textContent(),/Preencha renda/);
      assert.equal(await budget.locator('.tool-error').evaluate(el=>el===document.activeElement),true);
      await budget.locator('[data-example]').click();await budget.getByRole('button',{name:'Calcular meu plano'}).click();
      assert.match(await page.locator('#budget-result .result-value').textContent(),/200,00/);
      assert.equal(await page.locator('#budget-result').evaluate(el=>el===document.activeElement),true);
      await budget.locator('[name=daily]').fill('1.100,00');assert.equal(await page.locator('#budget-result').isVisible(),false);
      await budget.getByRole('button',{name:'Calcular meu plano'}).click();assert.match(await page.locator('#budget-result').textContent(),/ultrapassa/);
      await budget.locator('[name=goals]').fill('');await budget.getByRole('button',{name:'Calcular meu plano'}).click();assert.match(await budget.locator('.tool-error').textContent(),/Preencha valor separado/);
      await budget.locator('[data-example]').click();await budget.getByRole('button',{name:'Calcular meu plano'}).click();
      const goal=page.locator('[data-tool=goal]');await goal.locator('[data-example]').click();await goal.getByRole('button',{name:'Calcular minha meta'}).click();assert.match(await page.locator('#goal-result').textContent(),/7 contribuições/);assert.match(await page.locator('#goal-result').textContent(),/50,00/);
      const installments=page.locator('[data-tool=installments]');await installments.locator('[data-example]').click();await installments.getByRole('button',{name:'Comparar os preços'}).click();assert.match(await page.locator('#installments-result .result-value').textContent(),/1\.000,00/);
      await installments.locator('[type=reset]').click();assert.equal(await installments.locator('[name=cash]').inputValue(),'');assert.equal(await page.locator('#installments-result').isVisible(),false);
      await page.screenshot({path:path.join(out,'ferramentas-'+width+'.png'),fullPage:true});
      await page.locator('#orcamento').screenshot({path:path.join(out,'orcamento-'+width+'.png')});
      await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('#budget-result').isVisible(),false);assert.equal(await budget.locator('[name=income]').inputValue(),'');
      const storage=await page.evaluate(()=>Object.keys(localStorage));assert.ok(storage.every(key=>key==='4j.cookie-consent.v1'),'only consent preference may be persisted');
      results.push({width,calculations:true,validation:true,reset:true,noSavedInputs:true,noOverflow:true});await ctx.close();
    }
    const nojs=await browser.newContext({javaScriptEnabled:false});const page=await nojs.newPage();await page.goto(origin+'/ferramentas.html');assert.equal(await page.locator('[data-tool-controls][disabled]').count(),3);assert.equal(await page.locator('noscript').isVisible(),true);await nojs.close();
    assert.deepEqual(errors,[]);assert.deepEqual(unexpectedRequests,[]);
    const report={ok:true,results,noJavascriptSafe:true,errors,unexpectedRequests};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
