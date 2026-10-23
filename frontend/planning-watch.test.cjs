'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const planner = require('./catatau-planner.js'), watch = require('./planning-watch.js');
const base = fs.readFileSync(path.join(__dirname, '../source/base.html'), 'utf8');
const budgetCode = base.slice(base.indexOf('const Budget={'), base.indexOf('Store.saveBudget=async'));
const budget = vm.runInNewContext(budgetCode + '\nBudget;', { Money: { cents: value => Math.round(value * 100) } });
const today = '2026-10-23', month = '2026-10';
function store(overrides = {}) {
  return { screen:'app', loading:false, error:'', demo:false, user:{uid:'qa-member',email:'member@example.test',emailVerified:true},
    userDoc:{status:'approved',role:'member'}, profile:'own',profiles:[{id:'own'}],
    profileDataScope:{uid:'qa-member',profile:'own',ready:true},
    meta:{ownerUid:'qa-member',budgetPlan:{fixed:50,reserve:20,variable:30},budgetMonths:{[month]:0}},...overrides };
}
const receipt = value => ({date:month+'-05',type:'receita',value,paid:true});
const expense = (value, details={}) => ({date:month+'-15',type:'despesa',value,paid:true,budgetGroup:'variable',...details});
function read(rows, current=store()) {
  const finance=planner.snapshot({store:current,fromMonth:month,months:1,today,rowsForWindow:()=>rows});
  return watch.analyze(finance,budget.analyze(rows,current.meta,month),rows);
}
const kind = (model,name) => model.findings.find(item=>item.kind===name);

test('missing income remains unknown even with expenses; never a positive budget reading',()=>{
  const model=read([expense(100)]);
  assert.equal(model.incomeKnown,false);assert.equal(model.protectedCents,0);
  assert.equal(model.primary.kind,'income-missing');assert.equal(kind(model,'within'),undefined);
});
test('explicit zero income differs from absent income and exposes an expense gap',()=>{
  const model=read([receipt(0),expense(25)]);
  assert.equal(model.incomeKnown,true);assert.equal(kind(model,'income-missing'),undefined);
  assert.equal(kind(model,'expense-gap').cents,2500);
});
test('pending and overdue count only unpaid records in the selected month',()=>{
  const rows=[receipt(3000),expense(10,{paid:false,date:month+'-22'}),expense(20,{date:month+'-20'}),expense(30,{paid:false,date:month+'-23'}),expense(40,{paid:false,date:month+'-30'}),expense(50,{paid:false,date:month+'-31'}),expense(99,{paid:false,date:'2026-09-01'})];
  const model=read(rows);
  assert.deepEqual(kind(model,'overdue'),{kind:'overdue',count:1,cents:1000,attention:true});
  assert.deepEqual(kind(model,'due-soon'),{kind:'due-soon',count:2,cents:7000,through:'2026-10-30',attention:true});
  assert.equal(model.expenseCents,15000);assert.equal(model.pendingCents,13000);
});
test('expense gap takes priority and does not duplicate a reserve gap',()=>{
  const model=read([receipt(100),expense(150)]);
  assert.equal(model.primary.kind,'expense-gap');assert.equal(kind(model,'expense-gap').cents,5000);
  assert.equal(kind(model,'reserve-gap'),undefined);
});
test('reserve protects larger of selected-month target and recorded amount, never accumulated goals',()=>{
  const current=store();current.meta.budgetMonths[month]=300;current.meta.goalsV2=[{saved:999999}];
  const model=read([receipt(1000),expense(750)],current);
  assert.equal(model.protectedCents,30000);assert.equal(kind(model,'reserve-gap').cents,5000);
  assert.doesNotMatch(JSON.stringify(model),/999999/);
});
test('missing budget plan does not silently enforce the default 50/20/30 division',()=>{
  const current=store();delete current.meta.budgetPlan;delete current.meta.budgetMonths[month];
  const model=read([receipt(1000),expense(700)],current);
  assert.equal(model.protectedCents,null);assert.ok(kind(model,'plan-missing'));
  assert.equal(kind(model,'variable-over'),undefined);assert.equal(kind(model,'reserve-gap'),undefined);
});
test('variable near-limit warning starts at 80%, then exact limit and excess remain accurate',()=>{
  assert.equal(kind(read([receipt(1000),expense(239.99)]),'variable-near'),undefined);
  assert.equal(kind(read([receipt(1000),expense(240)]),'variable-near').percent,80);
  assert.equal(kind(read([receipt(1000),expense(300)]),'variable-near').cents,0);
  assert.equal(kind(read([receipt(1000),expense(300.01)]),'variable-over').cents,1);
});
test('zero variable allowance and excess fixed obligations are explicit',()=>{
  const current=store();current.meta.budgetPlan={fixed:80,reserve:20,variable:0};
  assert.equal(kind(read([receipt(100),expense(1)],current),'variable-over').cents,100);
  assert.equal(kind(read([receipt(100),expense(60,{budgetGroup:'fixed'})]),'fixed-over').cents,1000);
});
test('empty expense data is an incompleteness prompt and not a clear-to-spend state',()=>{
  const model=read([receipt(1000)]);assert.ok(kind(model,'expense-missing'));assert.equal(kind(model,'within'),undefined);assert.equal(model.primary,null);
});
test('complete registered data with no monitored pressure is neutral and has no home warning',()=>{
  const model=read([receipt(1000),expense(150)]);assert.equal(model.findings.length,1);assert.equal(model.findings[0].kind,'within');assert.equal(model.primary,null);
});
test('mismatched budget totals fail closed',()=>{
  const current=store(),rows=[receipt(1000),expense(150)];
  const finance=planner.snapshot({store:current,fromMonth:month,months:1,today,rowsForWindow:()=>rows});
  assert.throws(()=>watch.analyze(finance,{...budget.analyze(rows,current.meta,month),income:123},rows),/invalid-watch-data/);
});

function browser(current=store(),rows=[receipt(1000),expense(150)]) {
  let reads=0;
  const listeners=new Map(),sandbox={Store:current,CatatauPlanner:{...planner,isFirm:()=>true},state:{month},Budget:budget,
    Money:{today:()=>today,format:v=>String(v),date:v=>v},allRows:()=>{reads++;return rows;},
    document:{querySelectorAll:()=>[]},window:{addEventListener:(name,fn)=>listeners.set(name,fn)},
    esc:String,monthName:String,monthPicker:()=>'<select aria-label="Mês"></select>'};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'planning-watch.js'),'utf8'),sandbox);
  return {watch:sandbox.PlanningWatch,reads:()=>reads,listeners,sandbox};
}
for(const [name,patch] of [
  ['loading',{loading:true}],['failed metadata',{error:'unavailable'}],['wrong profile data',{profileDataScope:{uid:'qa-member',profile:'different',ready:true}}],
  ['signed out',{user:null}],['platform admin without profile permission',{userDoc:{status:'approved',role:'admin'},meta:{ownerUid:'someone-else'}}],
  ['pending account',{userDoc:{status:'pending'}}],['unverified invitation',{user:{uid:'qa-member',email:'member@example.test',emailVerified:false},meta:{ownerUid:'other',sharedView:['member@example.test']}}]
])test('watch refuses '+name+' before consulting any finance row',()=>{
  const runtime=browser(store(patch));assert.equal(runtime.watch.collect(),null);assert.equal(runtime.reads(),0);
  assert.equal(runtime.watch.home(),'<div data-planning-watch="home"></div>');assert.equal(runtime.reads(),0);
});
test('read-only verified shared viewer may see authorized data without writing',()=>{
  const runtime=browser(store({meta:{ownerUid:'other',sharedView:['member@example.test']}}));
  assert.equal(runtime.watch.collect().incomeCents,100000);assert.equal(runtime.reads(),1);
});
test('finance-update removes old findings immediately when access becomes unavailable',()=>{
  const runtime=browser(store(),[receipt(100),expense(200)]);
  const host={dataset:{planningWatch:'page'},innerHTML:runtime.watch.page()};
  runtime.sandbox.document.querySelectorAll=()=>[host];runtime.sandbox.Store.loading=true;
  runtime.listeners.get('finance-update')();assert.match(host.innerHTML,/Aguarde/);assert.doesNotMatch(host.innerHTML,/Despesas pagas|200|superam/);
});
