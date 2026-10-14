const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'script-1.js'),'utf8');
const money=source.slice(source.indexOf('const Money={'),source.indexOf('const Store={'));
const engine=fs.readFileSync(path.join(__dirname,'recurrence-engine.js'),'utf8');
const tests=[];
const plain=value=>JSON.parse(JSON.stringify(value));
const bill=changes=>({id:'vivo',desc:'Plano VIVO',valor:135,data:'2026-01-31',parcelas:1,jaPagas:1,recurrence:{frequency:'monthly',until:''},recurrencePaid:[],...changes});
function setup(){
  let emits=0,reads=0;
  const store={demo:true,profile:'family',user:{uid:'u1',email:'OWNER@example.com'},data:{despesas:[bill()]},editable:true,assertEdit(){if(!this.editable)throw new Error('Somente visualização');},emit(){emits++;}};
  const context=vm.createContext({console,Intl,Date,Store:store});
  vm.runInContext(money+'\n'+engine+'\nglobalThis.engine=Recurrence;globalThis.money=Money;',context);
  return{store,r:context.engine,m:context.money,get emits(){return emits;},get reads(){return reads;}};
}
function backend(state,{account={status:'approved',role:'member'},meta={ownerUid:'u1'},row=bill(),onGet=null,missing=null}={}){
  const data=new Map([['users/u1',account],['profiles/family',meta],['profiles/family/despesas/vivo',row]]),reads=[],writes=[];
  const ref=path=>({path,collection:key=>ref(path+'/'+key),doc:key=>ref(path+'/'+key)});
  state.store.demo=false;
  state.store.db={collection:key=>ref(key),async runTransaction(fn){const tx={async get(doc){reads.push(doc.path);await onGet?.(doc,reads.length);return{exists:data.has(doc.path)&&doc.path!==missing,data:()=>structuredClone(data.get(doc.path))};},update(doc,update){writes.push({path:doc.path,update:structuredClone(update)});data.set(doc.path,{...data.get(doc.path),...structuredClone(update)});}};await fn(tx);}};
  return{data,reads,writes};
}
async function test(name,fn){try{await fn();tests.push({name,status:'PASS'});}catch(e){tests.push({name,status:'FAIL',detail:e.stack});}}
(async()=>{
 await test('Month-end clamp restores 31 after February',()=>{const{r}=setup();assert.deepEqual(plain(r.occurrences(bill(),'2026-01','2026-04').map(x=>x.date)),['2026-01-31','2026-02-28','2026-03-31','2026-04-30']);});
 await test('Leap year and year rollover',()=>{const{r}=setup();assert.deepEqual(plain(r.occurrences(bill({data:'2023-12-31'}),'2023-12','2024-03').map(x=>x.date)),['2023-12-31','2024-01-31','2024-02-29','2024-03-31']);assert.equal(r.occurrences(bill({data:'2099-12-31'}),'2100-02','2100-02')[0].date,'2100-02-28');});
 await test('Future query beyond 600 months returns only requested rows',()=>{const{r}=setup(),rows=r.occurrences(bill(),'2080-01','2080-12');assert.equal(rows.length,12);assert.equal(rows[0].idx,648);assert.equal(rows[0].date,'2080-01-31');});
 await test('Inclusive final month and start boundary',()=>{const{r}=setup(),d=bill({data:'2026-05-15',recurrence:{frequency:'monthly',until:'2026-07'}});assert.deepEqual(plain(r.occurrences(d,'2026-01','2026-12').map(x=>x.monthKey)),['2026-05','2026-06','2026-07']);assert.equal(r.occurrences(d,'2027-01','2027-02').length,0);});
 await test('Full monthly R$135 amount and independent payment state',()=>{const{r}=setup(),rows=r.occurrences(bill({parcelas:12,jaPagas:12,recurrencePaid:['2026-02']}),'2026-01','2026-03');assert.deepEqual(plain(rows.map(x=>[x.value,x.paid,x.total,x.recurring])),[[135,false,1,true],[135,true,1,true],[135,false,1,true]]);});
 await test('Bounded and invalid windows do not generate rows',()=>{const{r}=setup();for(const[from,to]of[['oops','2026-01'],['2026-13','2027-01'],['2026-02','2026-01'],['0000-01','2026-01'],['2026-01','2200-01']])assert.equal(r.occurrences(bill(),from,to).length,0);});
 await test('Invalid bill dates, amounts, until and payment keys rejected',()=>{const{r}=setup();for(const change of [{data:'2026-02-31'},{valor:0},{valor:Infinity},{valor:135.009},{valor:1000000000},{recurrence:{frequency:'yearly',until:''}},{recurrence:{frequency:'monthly',until:'2025-12'}},{recurrence:{frequency:'monthly',until:'2026-13'}},{recurrencePaid:'2026-01'},{recurrencePaid:['2025-12']},{recurrencePaid:['2026-1']},{recurrence:{frequency:'monthly',until:'2026-02'},recurrencePaid:['2026-03']},{recurrencePaid:Array(12001).fill('2026-01')}])assert.ok(r.validate(bill(change)),JSON.stringify(change));});
 await test('Legacy installment values remain exact and unchanged',()=>{const{r,m}=setup(),legacy={data:'2026-01-31',valor:100.01,parcelas:3,jaPagas:1};assert.equal(r.is(legacy),false);assert.deepEqual(plain(m.occurrences(legacy).map(x=>[x.value,x.date,x.paid])),[[33.34,'2026-01-31',true],[33.34,'2026-02-28',false],[33.33,'2026-03-31',false]]);assert.equal(r.occurrences(legacy,'2026-01','2026-03').length,0);});
 await test('Demo payment marks selected month only, idempotently',async()=>{const state=setup();await state.r.markPaid('vivo','2026-03');await state.r.markPaid('vivo','2026-03');assert.deepEqual(plain(state.store.data.despesas[0].recurrencePaid),['2026-03']);assert.equal(state.emits,2);assert.equal(state.store.data.despesas[0].jaPagas,1);});
 await test('View permission rejects before backend access',async()=>{const state=setup(),db=backend(state);state.store.editable=false;await assert.rejects(state.r.markPaid('vivo','2026-02'),/visualização/);assert.equal(db.reads.length,0);assert.equal(db.writes.length,0);});
 await test('Out-of-schedule payment rejects without backend write',async()=>{const state=setup(),db=backend(state);await assert.rejects(state.r.markPaid('vivo','2025-12'),/faz parte/);await assert.rejects(state.r.markPaid('vivo','2026-13'),/mês/);assert.equal(db.reads.length,0);assert.equal(db.writes.length,0);});
 await test('Fresh transaction merges another device payment; only payment field changes',async()=>{const state=setup(),db=backend(state,{row:bill({recurrencePaid:['2026-02']})});await state.r.markPaid('vivo','2026-03');assert.deepEqual(db.writes,[{path:'profiles/family/despesas/vivo',update:{recurrencePaid:['2026-02','2026-03']}}]);});
 await test('Real repeat payment writes nothing',async()=>{const state=setup(),db=backend(state,{row:bill({recurrencePaid:['2026-03']})});await state.r.markPaid('vivo','2026-03');assert.equal(db.writes.length,0);});
 await test('Profile and identity switches during await do not redirect transaction',async()=>{const state=setup(),db=backend(state,{onGet(_doc,n){if(n===1){state.store.profile='unrelated';state.store.user={uid:'u2',email:'other@example.com'};state.store.db=null;}}});await state.r.markPaid('vivo','2026-03');assert.deepEqual(db.reads,['users/u1','profiles/family','profiles/family/despesas/vivo']);assert.equal(db.writes[0].path,'profiles/family/despesas/vivo');});
 await test('Fresh account revoked or downgraded blocks stale local edit permission',async()=>{for(const cfg of [{account:{status:'pending',role:'admin'}},{account:{status:'approved',role:'member'},meta:{ownerUid:'other',sharedView:['owner@example.com']}}]){const state=setup(),db=backend(state,cfg);await assert.rejects(state.r.markPaid('vivo','2026-03'),/permissão/);assert.equal(db.writes.length,0);}});
 await test('Fresh sharedEdit and approved admin are permitted',async()=>{for(const cfg of [{meta:{ownerUid:'other',sharedEdit:['owner@example.com']}},{account:{status:'approved',role:'admin'},meta:{ownerUid:'other'}}]){const state=setup(),db=backend(state,cfg);await state.r.markPaid('vivo','2026-03');assert.equal(db.writes.length,1);}});
 await test('Fresh edited schedule or deleted record blocks stale occurrence',async()=>{for(const cfg of [{row:bill({recurrence:{frequency:'monthly',until:'2026-02'}})},{row:{...bill(),recurrence:null}},{missing:'profiles/family/despesas/vivo'}]){const state=setup(),db=backend(state,cfg);await assert.rejects(state.r.markPaid('vivo','2026-03'));assert.equal(db.writes.length,0);}});
 await test('Missing fresh profile or account blocks payment',async()=>{for(const missing of ['profiles/family','users/u1']){const state=setup(),db=backend(state,{missing});await assert.rejects(state.r.markPaid('vivo','2026-03'));assert.equal(db.writes.length,0);}});
 console.log(JSON.stringify({passed:tests.filter(t=>t.status==='PASS').length,total:tests.length,tests},null,2));
 if(tests.some(t=>t.status!=='PASS'))process.exitCode=1;
})();
