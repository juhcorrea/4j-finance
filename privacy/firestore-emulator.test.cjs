'use strict';
// Run only against a local emulator. Never points at a real Firebase project.
const {readFileSync}=require('node:fs');const path=require('node:path');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,getDocs,collection,query,where,updateDoc,deleteDoc,serverTimestamp}=require('firebase/firestore');
if(!process.env.FIRESTORE_EMULATOR_HOST)throw new Error('Start a Firestore emulator first. No production connection is allowed by this test.');
const [host,portText]=process.env.FIRESTORE_EMULATOR_HOST.split(':');
if(!['localhost','127.0.0.1'].includes(host))throw new Error('Only a loopback emulator is allowed.');
(async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-4j-privacy',firestore:{host,port:Number(portText),rules:readFileSync(path.join(__dirname,'firestore.rules'),'utf8')}});
 let checks=0;
 try{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context=>{
   const db=context.firestore();
   for(const [uid,role,status]of [['alice','member','approved'],['bob','member','approved'],['viewer','member','approved'],['editor','member','approved'],['admin','admin','approved'],['blocked','member','pending']])await setDoc(doc(db,'users',uid),{name:uid,email:uid+'@example.test',role,status,createdAt:serverTimestamp()});
   await setDoc(doc(db,'profiles','alice-private'),{ownerUid:'alice',ownerEmail:'alice@example.test',displayName:'Private',kind:'personal',sharedView:[],sharedEdit:[],createdAt:serverTimestamp()});
   await setDoc(doc(db,'profiles','family'),{ownerUid:'bob',ownerEmail:'bob@example.test',displayName:'Family',kind:'family',sharedView:['viewer@example.test'],sharedEdit:['editor@example.test'],createdAt:serverTimestamp()});
   await setDoc(doc(db,'profiles','family','despesas','entry'),{desc:'Example',valor:135,data:'2026-10-10',parcelas:1});
   await setDoc(doc(db,'billingAccounts','alice'),{adFree:true});
  });
  const db=(uid,verified=true)=>env.authenticatedContext(uid,{email:uid+'@example.test',email_verified:verified}).firestore();
  async function ok(name,operation){await assertSucceeds(operation);checks++;console.log('PASS '+name);}
  async function no(name,operation){await assertFails(operation);checks++;console.log('PASS '+name);}
  await ok('owner reads private profile',getDoc(doc(db('alice'),'profiles','alice-private')));
  await no('other family cannot read private profile',getDoc(doc(db('bob'),'profiles','alice-private')));
  await no('platform admin cannot read private finances',getDoc(doc(db('admin'),'profiles','alice-private')));
  await no('platform admin cannot list every profile',getDocs(collection(db('admin'),'profiles')));
  await ok('owner-scoped query',getDocs(query(collection(db('alice'),'profiles'),where('ownerUid','==','alice'))));
  await ok('verified invitation-scoped query',getDocs(query(collection(db('viewer'),'profiles'),where('sharedView','array-contains','viewer@example.test'))));
  await no('unverified invitation query',getDocs(query(collection(db('viewer',false),'profiles'),where('sharedView','array-contains','viewer@example.test'))));
  await ok('viewer reads family expense',getDoc(doc(db('viewer'),'profiles','family','despesas','entry')));
  await no('viewer cannot write expense',updateDoc(doc(db('viewer'),'profiles','family','despesas','entry'),{valor:100}));
  await ok('verified editor writes expense',updateDoc(doc(db('editor'),'profiles','family','despesas','entry'),{valor:100}));
  await no('unverified editor cannot write expense',updateDoc(doc(db('editor',false),'profiles','family','despesas','entry'),{valor:120}));
  await no('editor cannot invite another email',updateDoc(doc(db('editor'),'profiles','family'),{sharedView:['viewer@example.test','admin@example.test']}));
  await no('admin cannot invite themselves',updateDoc(doc(db('admin'),'profiles','family'),{sharedEdit:['admin@example.test']}));
  await no('owner cannot rewrite ownerUid',updateDoc(doc(db('bob'),'profiles','family'),{ownerUid:'admin'}));
  await ok('new signup is approved member',setDoc(doc(db('new'),'users','new'),{name:'New',email:'new@example.test',role:'member',status:'approved',createdAt:serverTimestamp()}));
  await ok('new member creates private profile',setDoc(doc(db('new'),'profiles','new-private'),{ownerUid:'new',ownerEmail:'new@example.test',displayName:'My space',kind:'personal',sharedView:[],sharedEdit:[],goalsV2:[],createdAt:serverTimestamp()}));
  await ok('new member creates optional family',setDoc(doc(db('new'),'profiles','new-family'),{ownerUid:'new',ownerEmail:'new@example.test',displayName:'Family space',kind:'family',sharedView:[],sharedEdit:[],goalsV2:[],createdAt:serverTimestamp()}));
  await ok('owner saves budgets and goals',updateDoc(doc(db('new'),'profiles','new-private'),{goalsV2:[],budgetPlan:{fixed:50,reserve:20,variable:30},budgetMonths:{'2026-10':100},lastUpdatedAt:serverTimestamp(),lastUpdatedBy:'New'}));
  await no('signup cannot grant admin',setDoc(doc(db('bad'),'users','bad'),{name:'Bad',email:'bad@example.test',role:'admin',status:'approved',createdAt:serverTimestamp()}));
  await no('self cannot upgrade role',updateDoc(doc(db('alice'),'users','alice'),{role:'admin'}));
  await no('suspended member cannot reactivate themselves',updateDoc(doc(db('blocked'),'users','blocked'),{status:'approved'}));
  await no('cannot delete account record to bypass suspension',deleteDoc(doc(db('blocked'),'users','blocked')));
  await ok('platform admin can list accounts',getDocs(collection(db('admin'),'users')));
  await ok('platform admin can suspend another account',updateDoc(doc(db('admin'),'users','editor'),{status:'pending'}));
  await no('suspended editor loses finance access',getDoc(doc(db('editor'),'profiles','family','despesas','entry')));
  await ok('owner revokes viewer',updateDoc(doc(db('bob'),'profiles','family'),{sharedView:[]}));
  await no('revoked viewer loses access',getDoc(doc(db('viewer'),'profiles','family','despesas','entry')));
  for(const name of ['billingOrders','billingAccounts','billingLocks']){await no('clients cannot write '+name,setDoc(doc(db('admin'),name,'alice'),{adFree:true}));await no('clients cannot read '+name,getDoc(doc(db('alice'),name,'alice')));}
  await no('anonymous cannot read finance',getDoc(doc(env.unauthenticatedContext().firestore(),'profiles','alice-private')));
  console.log(JSON.stringify({passed:checks,emulator:'demo-4j-privacy',productionTouched:false}));
 }finally{await env.cleanup();}
})().catch(error=>{console.error(error);process.exitCode=1;});
