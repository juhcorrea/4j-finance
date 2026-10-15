'use strict';
const fs=require('node:fs');const vm=require('node:vm');const assert=require('node:assert/strict');const path=require('node:path');
const {applyPrivacy}=require('./apply-privacy.cjs');
const source=fs.readFileSync(process.argv[2]||path.join(__dirname,'../source/base.html'),'utf8');
const {html,report}=applyPrivacy(source);let checks=0;
function check(name,fn){fn();checks++;console.log('PASS '+name);}
function segment(start,end){const a=html.indexOf(start),b=html.indexOf(end,a);assert(a>=0&&b>a);return html.slice(a,b);}
const sandbox={URLSearchParams,location:{search:''},console,structuredClone,TextEncoder,crypto:require('node:crypto').webcrypto,document:{addEventListener(){}},window:{dispatchEvent(){}},Event:class{},localStorage:{getItem(){return null},setItem(){}},firebase:{firestore:{FieldValue:{serverTimestamp:()=>123}}},setTimeout};
vm.createContext(sandbox);
vm.runInContext(segment('const Store={','const ProfileOps={')+segment('const ProfileOps={','const ProfilePreference={')+segment('const ProfilePreference={','function defaultProfileSettings(){')+segment('const AccountSignup={','Object.assign(Store,{')+segment('const FamilyAccess={','const $=s=>')+'\nthis.exports={Store,ProfileOps,ProfilePreference,AccountSignup,FamilyAccess};',sandbox);
const {Store,ProfileOps,AccountSignup,FamilyAccess}=sandbox.exports;
function actor({role='member',verified=false,status='approved',uid='a'}={}){return {demo:false,user:{uid,email:uid+'@example.test',emailVerified:verified},userDoc:{role,status},profile:'p',meta:{ownerUid:'b',sharedView:[],sharedEdit:[]},profiles:[],listeners:[],profileListeners:[],emit(){},cleanProfiles(){},clean(){},fail(e){throw e}};}
check('strict transform checks reject unexpected source',()=>assert.throws(()=>applyPrivacy(source.replace("if(this.userDoc?.role==='admin')return 'admin';",'')),/expected/));
check('global admin does not edit another profile',()=>{const s=actor({role:'admin'});assert.equal(Object.getOwnPropertyDescriptor(Store,'permission').get.call(s),'view');assert.throws(()=>ProfileOps.requireAccess(s,s.meta,s.userDoc));});
check('own profile allows edit without invitation',()=>{const s=actor();s.meta.ownerUid='a';assert.doesNotThrow(()=>ProfileOps.requireAccess(s,s.meta,s.userDoc));assert.equal(FamilyAccess.canManage(s,s.meta),true);});
check('unverified email cannot use an edit invitation',()=>{const s=actor();s.meta.sharedEdit=['a@example.test'];assert.throws(()=>ProfileOps.requireAccess(s,s.meta,s.userDoc));assert.equal(FamilyAccess.participates(s,s.meta),false);});
check('verified editor edits but cannot manage members',()=>{const s=actor({verified:true});s.meta.sharedEdit=['a@example.test'];assert.doesNotThrow(()=>ProfileOps.requireAccess(s,s.meta,s.userDoc));assert.throws(()=>ProfileOps.requireAccess(s,s.meta,s.userDoc,true));assert.equal(FamilyAccess.canManage(s,s.meta),false);assert.equal(FamilyAccess.participates(s,s.meta),true);});
check('verified viewer cannot edit even as platform admin',()=>{const s=actor({role:'admin',verified:true});s.meta.sharedView=['a@example.test'];assert.equal(FamilyAccess.participates(s,s.meta),true);assert.throws(()=>ProfileOps.requireAccess(s,s.meta,s.userDoc));});
check('suspended owner cannot write',()=>{const s=actor({status:'pending'});s.meta.ownerUid='a';assert.throws(()=>ProfileOps.requireAccess(s,s.meta,s.userDoc));});
check('platform admin is not automatically family manager',()=>{const s=actor({role:'admin',verified:true});assert.equal(FamilyAccess.canManage(s,s.meta),false);});
function queries(verified,role){const seen=[];const s=actor({verified,role});s.db={collection(){return {where(...filter){seen.push(filter);return{onSnapshot(){return()=>{}}}},onSnapshot(){throw new Error('UNSCOPED QUERY')}}}};Store.watchProfiles.call(s);return seen;}
check('unverified admin queries only own profiles',()=>{const seen=queries(false,'admin');assert.equal(seen.length,1);assert.deepEqual(seen[0],['ownerUid','==','a']);});
check('verified admin uses the same scoped queries as a member',()=>{const seen=queries(true,'admin');assert.equal(seen.length,3);assert.deepEqual(seen.map(q=>q[0]),['ownerUid','sharedView','sharedEdit']);});
check('automatic profile selection favors own private profile',()=>{const s=actor({verified:true});s.profiles=[{id:'family',kind:'family',ownerUid:'b',sharedView:['a@example.test']},{id:'personal',ownerUid:'a'}];assert.equal(sandbox.exports.ProfilePreference.pick(s),'personal');});
check('signup source and UI are public',()=>{assert(html.includes("const data={name:display,email,status:'approved',role:'member'"));assert(!html.includes('Novos cadastros aguardam'));assert(!html.includes('consulta ADMIN'));assert(!html.includes("queries=this.userDoc.role==='admin'?[coll]"));});
async function signup(existing){let writes=0,created;const user={uid:'new',email:'new@example.test'};const store={user,auth:{currentUser:user},emit(){},clean(){},watchProfiles(){},db:{collection(){return{doc(){return{}}}},async runTransaction(fn){return fn({async get(){return{exists:!!existing,data:()=>existing}},set(ref,data){writes++;created=data;}})}}};await AccountSignup.provision(store,user,'New member');return{writes,created,store};}
(async()=>{
 const n=await signup();check('new signup is active member automatically',()=>{assert.equal(n.writes,1);assert.equal(n.created.status,'approved');assert.equal(n.created.role,'member');assert.equal(n.store.screen,'app');});
 const p=await signup({name:'Existing',role:'member',status:'pending'});check('existing suspension is not overwritten by signup',()=>{assert.equal(p.writes,0);assert.equal(p.store.screen,'pending');});
 const a=await signup({name:'Existing',role:'admin',status:'approved'});check('existing admin role is preserved',()=>{assert.equal(a.writes,0);assert.equal(a.store.userDoc.role,'admin');});
 const s=actor({role:'admin'});s.demo=true;await assert.rejects(()=>FamilyAccess.share(s,'friend@example.test','view'),/proprietário/);check('share operation denies unrelated admin',()=>{});
 console.log(JSON.stringify({passed:checks,transformChanges:report.length,note:'Mock/VM tests. Firestore emulator and production rules are separate checks.'}));
})().catch(error=>{console.error(error);process.exitCode=1;});
