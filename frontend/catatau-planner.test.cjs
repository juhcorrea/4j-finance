'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const planner = require('./catatau-planner.js');
const today = '2026-01-31';
function store(overrides = {}) {
  return { screen: 'app', loading: false, error: '', demo: false, user: { uid: 'alice', email: 'alice@example.test', emailVerified: true }, userDoc: { status: 'approved', role: 'member' }, profile: 'own-a', profiles: [{ id: 'own-a' }, { id: 'other-b' }], profileDataScope: { uid: 'alice', profile: 'own-a', ready: true }, meta: { ownerUid: 'alice', budgetPlan: { fixed: 50, reserve: 20, variable: 30 }, budgetMonths: { '2026-01': 600 } }, ...overrides };
}
const income = (month, value = 3000) => ({ date: month + '-05', value, type: 'receita', paid: true });
const expense = (month, value = 2100) => ({ date: month + '-10', value, type: 'despesa', paid: false });
function snapshot(rows = [income('2026-01'), expense('2026-01')], options = {}) {
  return planner.snapshot({ store: store(), fromMonth: '2026-01', months: 3, today, rowsForWindow: () => rows, ...options });
}
const assumptions = { incomes: { '2026-02': 300000, '2026-03': 300000 }, extraMonthlyCents: 0, reserveMode: 'plan', spendableCashCents: 500000, cardLimitCents: 500000 };
const terms = { cashCents: 75000, purchaseDate: today, count: 3, totalCents: 75000, downCents: 0, firstDue: today };

test('money parser preserves cents and refuses ambiguous/negative/nonfinite amounts', () => {
  for (const [text, value] of [['1.200,09',120009],['R$ 0,01',1],['1000.25',100025],['0',0]]) assert.equal(planner.moneyInput(text),value);
  for (const text of ['-1','Infinity','NaN','12x','1.000','1,234','1.20,00','9007199254740991']) assert.equal(planner.moneyInput(text),null);
});
test('installment total is conserved with exact remainder distribution', () => {
  assert.deepEqual(planner.splitCents(100000,3),[33334,33333,33333]);
  for(let count=1;count<=24;count++) assert.equal(planner.splitCents(123457,count).reduce((a,b)=>a+b,0),123457);
  assert.throws(()=>planner.splitCents(2,3));assert.throws(()=>planner.splitCents(100,25));
});
test('original due day survives short months, including leap year', () => {
  assert.deepEqual([0,1,2].map(n=>planner.addMonths('2026-01-31',n)),['2026-01-31','2026-02-28','2026-03-31']);
  assert.equal(planner.addMonths('2028-01-31',1),'2028-02-29');
  assert.equal(planner.dateInput('31/02/2026',today),null);
  assert.equal(planner.dateInput('hoje',today),today);
});
test('down payment belongs to purchase month and installments use first due month', () => {
  const card=planner.schedules({...terms,purchaseDate:'2026-01-15',totalCents:100000,downCents:10000,firstDue:'2026-02-28'})[1];
  assert.deepEqual(card.events,[{date:'2026-01-15',cents:10000},{date:'2026-02-28',cents:30000},{date:'2026-03-28',cents:30000},{date:'2026-04-28',cents:30000}]);
  assert.equal(card.totalCents,100000);assert.equal(card.financedCents,90000);
});
test('snapshot requests only explicit active window and emits no personal descriptions or other profile data', () => {
  let calls=0;
  const value=snapshot(undefined,{rowsForWindow:(from,to)=>{calls++;assert.equal(from,'2026-01');assert.equal(to,'2026-03');return [{...income('2026-01'),desc:'private description',ownerEmail:'private@example.test'},income('2025-12',9999)];}});
  assert.equal(calls,1);assert.equal(value.months[0].incomeCents,300000);assert.equal(value.months[1].incomeKnown,false);
  assert.doesNotMatch(JSON.stringify(value),/private description|private@example|other-b|999900/);
});
for(const [name,patch] of [
  ['loading',{loading:true}],['failed',{error:'offline'}],['signed out',{user:null}],['inactive',{userDoc:{status:'suspended',role:'admin'}}],
  ['unlisted profile',{profile:'missing'}],['wrong loaded profile',{profileDataScope:{uid:'alice',profile:'other-b',ready:true}}],
  ['metadata not loaded',{profileDataScope:{uid:'alice',profile:'own-a',ready:false}}],
  ['different loaded user',{profileDataScope:{uid:'bob',profile:'own-a',ready:true}}],
  ['admin without financial access',{userDoc:{status:'approved',role:'admin'},meta:{ownerUid:'bob'}}],
  ['unverified invitation',{user:{uid:'alice',email:'alice@example.test',emailVerified:false},meta:{ownerUid:'bob',sharedView:['alice@example.test']}}]
])test('snapshot refuses '+name+' before reading rows',()=>{let called=false;assert.throws(()=>snapshot(undefined,{store:store(patch),rowsForWindow:()=>{called=true;return[];}}));assert.equal(called,false);});
test('verified read-only member may simulate without write permission',()=>{
  const value=snapshot(undefined,{store:store({meta:{ownerUid:'bob',sharedView:['alice@example.test']}})});
  assert.equal(value.months[0].incomeCents,300000);
});
test('simulated demo snapshot needs no Firebase object or network',()=>{assert.equal(snapshot(undefined,{store:store({demo:true,db:undefined,profileDataScope:undefined})}).months.length,3);});
test('reserve absent differs from explicit zero; accumulated goals never become money available',()=>{
  const absent=snapshot(undefined,{store:store({meta:{ownerUid:'alice',goalsV2:[{saved:999999}]}})});
  const zero=snapshot(undefined,{store:store({meta:{ownerUid:'alice',budgetMonths:{'2026-01':0},goalsV2:[{saved:999999}]}})});
  assert.equal(absent.months[0].recordedReserveCents,null);assert.equal(zero.months[0].recordedReserveCents,0);
  assert.doesNotMatch(JSON.stringify(zero),/999999/);
});
test('first installment fits but second month deficit blocks the option',()=>{
  const finance=snapshot([income('2026-01'),expense('2026-01'),income('2026-02'),expense('2026-02',2300),income('2026-03'),expense('2026-03')]);
  const card=planner.evaluate(finance,terms,assumptions)[1];
  assert.equal(card.rows[0].afterCents,5000);assert.equal(card.rows[1].afterCents,-15000);assert.equal(card.status,'over');assert.equal(card.deficits[0].month,'2026-02');
});
test('future income is never invented and unknown expenses cannot produce approval',()=>{
  const finance=snapshot([income('2026-01')]);
  const missing=planner.evaluate(finance,{cashCents:10000,purchaseDate:today},{...assumptions,incomes:{}})[0];
  assert.equal(missing.status,'insufficient');assert.equal(missing.rows[1].incomeCents,null);assert.equal(missing.rows[1].afterCents,null);
  assert.equal(planner.evaluate(finance,{cashCents:10000,purchaseDate:today},{...assumptions,extraMonthlyCents:null})[0].status,'insufficient');
});
test('known zero future income is distinct from unknown and can prove a deficit',()=>{
  const finance=snapshot([income('2026-01'),expense('2026-02',100)]);
  const result=planner.evaluate(finance,{cashCents:10000,purchaseDate:today},{...assumptions,incomes:{'2026-02':0,'2026-03':0}})[0];
  assert.equal(result.status,'over');assert.equal(result.rows[1].afterCents,-10000);
});
test('preserves larger recorded reserve without counting goal savings or reserve twice',()=>{
  const finance=snapshot([income('2026-01'),expense('2026-01')],{months:1,store:store({meta:{ownerUid:'alice',budgetMonths:{'2026-01':800},goalsV2:[{saved:9000}]}})});
  const result=planner.evaluate(finance,{cashCents:5000,purchaseDate:today},{...assumptions,reserveMode:'fixed',reserveMonthlyCents:10000})[0];
  assert.equal(result.rows[0].reserveCents,80000);assert.equal(result.rows[0].afterCents,5000);assert.equal(result.status,'within');
});
test('cash availability and card total limit are independent constraints',()=>{
  const finance=snapshot([income('2026-01',10000)]);
  const [cash,card]=planner.evaluate(finance,{...terms,downCents:5000},{...assumptions,spendableCashCents:1000,cardLimitCents:30000});
  assert.equal(cash.cashShortfallCents,74000);assert.equal(card.cashShortfallCents,4000);assert.equal(card.limitShortfallCents,40000);assert.equal(card.status,'over');
  const unknown=planner.evaluate(finance,terms,{...assumptions,cardLimitCents:null})[1];assert.equal(unknown.status,'insufficient');
});
test('zero entry does not consume cash but still requires full card limit',()=>{
  const finance=snapshot([income('2026-01',10000)]);
  const card=planner.evaluate(finance,terms,{...assumptions,spendableCashCents:null})[1];assert.equal(card.status,'within');
});
test('calculation rejects a truncated horizon instead of ignoring later installments',()=>{
  assert.throws(()=>planner.evaluate(snapshot(undefined,{months:1}),terms,assumptions),/outside-window/);
  assert.throws(()=>snapshot(undefined,{months:25}),/invalid-window/);
});
test('largest remainder reserve allocation matches budget plan for tiny amounts',()=>{
  assert.equal(planner.reserveTarget(3,{fixed:50,reserve:20,variable:30}),1);
  assert.equal(planner.reserveTarget(1,{fixed:50,reserve:20,variable:30}),0);
});
test('snapshot rejects malformed values rather than treating missing data as zero',()=>{
  for(const value of [NaN,Infinity,-1,'3000'])assert.throws(()=>snapshot([{date:today,type:'receita',value}]),/invalid-records/);
});
test('real profile listeners reject delayed callbacks after switching, and wait for metadata',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../source/base.html'),'utf8');
  const start=html.indexOf('  selectProfile(id){\n');assert.ok(start>=0);
  const end=html.indexOf('  assertEdit(){',start);
  const method=vm.runInNewContext('({' + html.slice(start,end) + '})',{ProfilePreference:{remember(){}}}).selectProfile;
  const callbacks=new Map();
  const s=store({profile:'',profileDataScope:null,profileListeners:[],data:{receitas:[],despesas:[]},emit(){},fail(){throw Error('stale callback ran');},cleanProfiles(){this.profileDataScope=null;this.profileListeners=[];this.data={receitas:[],despesas:[]};this.meta={};},db:{collection(){return {doc(id){return {onSnapshot(next,error){callbacks.set(id+':meta',{next,error});return()=>{};},collection(kind){return {onSnapshot(next,error){callbacks.set(id+':'+kind,{next,error});return()=>{};}}}};}};}}});
  method.call(s,'own-a');method.call(s,'other-b');
  const empty={docs:[]};callbacks.get('own-a:receitas').next({docs:[{id:'old',data:()=>({valor:999999})}]});callbacks.get('own-a:meta').error({code:'permission-denied'});
  assert.equal(s.data.receitas.length,0);
  callbacks.get('other-b:receitas').next(empty);callbacks.get('other-b:despesas').next(empty);assert.equal(s.loading,true);
  callbacks.get('other-b:meta').next({exists:true,data:()=>({ownerUid:'alice'})});assert.equal(s.loading,false);assert.equal(s.profileDataScope.ready,true);assert.equal(s.profileDataScope.profile,'other-b');
});

function browserPlanner() {
  const state = store(), listeners = new Map(), persisted = new Map(), events = [];
  const context = {
    Store: state, CATATAU_IMAGE: 'assets/catatau.webp',
    document: { querySelector: () => null, querySelectorAll: () => [], body: { classList: { toggle() {} } } },
    window: { addEventListener(type, fn) { listeners.set(type, fn); }, dispatchEvent(event) { events.push(event.type); listeners.get(event.type)?.(event); } },
    Event: class { constructor(type) { this.type = type; } },
    localStorage: { getItem: key => persisted.get(key) ?? null, setItem: (key, value) => persisted.set(key, value) },
    Money: { today: () => today, format: value => 'R$ ' + value.toFixed(2) },
    monthName: value => value, profileName: () => state.profile,
    catatauReady: () => state.screen === 'app' && !!state.user && !!state.profile && !state.loading && !state.error,
    allRows: () => [income('2026-01')],
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'catatau-planner.js'), 'utf8'), context);
  return { api: context.CatatauPlanner, state, listeners, persisted, events, clock: context.Money };
}

test('shared firm control preserves only the current authorized profile preference', () => {
  const runtime = browserPlanner(), { api, state, persisted, events } = runtime;
  assert.equal(api.isFirm(), false); assert.equal(api.setFirm(true), true); assert.equal(api.isFirm(), true);
  assert.deepEqual([...persisted.values()], ['true']); assert.deepEqual(events, ['catatau-firm-change']);
  assert.equal([...persisted.keys()][0], '4j-catatau-firm-v1:["alice","own-a"]');
  state.profile = 'other-b'; state.profileDataScope.profile = 'other-b';
  assert.equal(api.isFirm(), false); assert.equal(api.setFirm(false), true);
  state.profile = 'own-a'; state.profileDataScope.profile = 'own-a'; assert.equal(api.isFirm(), true);
  state.meta.ownerUid = 'someone-else';
  assert.equal(api.contextToken(), ''); assert.equal(api.setFirm(false), false); assert.equal(api.isFirm(), false);
  assert.deepEqual([...persisted.values()], ['true', 'false']);
});

test('planning context token changes with finance updates and refuses stale or revoked access', () => {
  const { api, state, listeners } = browserPlanner(), first = api.contextToken();
  assert.ok(first); listeners.get('finance-update')(); assert.notEqual(api.contextToken(), first);
  state.profileDataScope.ready = false; assert.equal(api.contextToken(), '');
  state.profileDataScope.ready = true; state.userDoc.status = 'suspended'; assert.equal(api.contextToken(), '');
  state.userDoc.status = 'approved'; state.screen = 'auth'; assert.equal(api.contextToken(), '');
});

test('planning token changes across a new day and month without a financial update', () => {
  const { api, clock } = browserPlanner(), january = api.contextToken();
  clock.today = () => '2026-02-01';
  const february = api.contextToken();
  assert.notEqual(february, january);
  assert.equal(api.contextToken(), february);
  clock.today = () => '2026-02-02';
  assert.notEqual(api.contextToken(), february);
});

test('page and chat share result wording and the firm voice does not change arithmetic', () => {
  const { api } = browserPlanner();
  const plan = { name: 'Geladeira', finance: snapshot(), terms, assumptions };
  const before = JSON.stringify(api.evaluate(plan.finance, plan.terms, plan.assumptions));
  assert.doesNotMatch(api.describeResult(plan), /segura esse carrinho/);
  api.setFirm(true); assert.match(api.describeResult(plan), /segura esse carrinho/);
  assert.equal(JSON.stringify(api.evaluate(plan.finance, plan.terms, plan.assumptions)), before);
});
