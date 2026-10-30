'use strict';
// Synthetic local-emulator checks only. Never connects to a real Firebase project.
const {readFileSync}=require('node:fs'),path=require('node:path');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,updateDoc,serverTimestamp}=require('firebase/firestore');
if(!process.env.FIRESTORE_EMULATOR_HOST)throw new Error('A local Firestore emulator is required.');
const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');
if(!['localhost','127.0.0.1'].includes(host))throw new Error('Only the local emulator is allowed.');
(async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-4j-admin-identity',firestore:{host,port:Number(port),rules:readFileSync(path.join(__dirname,'firestore.rules'),'utf8')}});let checks=0;
 try{
  await env.clearFirestore();const now=Math.floor(Date.now()/1000),cutoff=now-10;
  await env.withSecurityRulesDisabled(async context=>{
   const db=context.firestore();
   for(const [uid,role,status]of [['admin','admin','approved'],['otheradmin','admin','approved'],['member','member','approved'],['other','member','approved'],['blockedadmin','admin','pending']])await setDoc(doc(db,'users',uid),{name:uid,email:uid+'@example.test',role,status,createdAt:serverTimestamp()});
   await setDoc(doc(db,'profiles','private'),{ownerUid:'member',ownerEmail:'member@example.test',sharedView:[],sharedEdit:[],createdAt:serverTimestamp()});
   await setDoc(doc(db,'profiles','shared'),{ownerUid:'other',ownerEmail:'other@example.test',sharedView:['member@example.test'],sharedEdit:[],createdAt:serverTimestamp()});
  });
  const db=(uid,extra={})=>env.authenticatedContext(uid,{email:uid+'@example.test',email_verified:true,auth_time:now,...extra}).firestore();
  const ok=async(name,request)=>{await assertSucceeds(request);checks++;console.log('PASS '+name);};
  const no=async(name,request)=>{await assertFails(request);checks++;console.log('PASS '+name);};
  await ok('fresh verified admin edits member name',updateDoc(doc(db('admin'),'users','member'),{name:'New name'}));
  await no('member cannot edit another identity',updateDoc(doc(db('other'),'users','member'),{name:'Bad'}));
  await no('unverified admin cannot edit identity',updateDoc(doc(db('admin',{email_verified:false}),'users','member'),{name:'Bad'}));
  await no('stale admin cannot edit identity',updateDoc(doc(db('admin',{auth_time:now-1000}),'users','member'),{name:'Bad'}));
  await no('suspended admin cannot edit identity',updateDoc(doc(db('blockedadmin'),'users','member'),{name:'Bad'}));
  await no('admin cannot edit other admin identity',updateDoc(doc(db('admin'),'users','otheradmin'),{name:'Bad'}));
  await no('identity update cannot combine a role change',updateDoc(doc(db('admin'),'users','member'),{name:'Bad',role:'admin'}));
  await no('identity update cannot combine a status change',updateDoc(doc(db('admin'),'users','member'),{name:'Bad',status:'pending'}));
  await ok('member can mirror own signed unverified email',updateDoc(doc(db('member',{email:'new@example.test',email_verified:false}),'users','member'),{email:'new@example.test'}));
  await no('member cannot invent own display email',updateDoc(doc(db('member'),'users','member'),{email:'invented@example.test'}));
  await ok('old session initially reads own profile',getDoc(doc(db('member',{auth_time:now-100}),'profiles','private')));
  await ok('old verified session initially reads invited profile',getDoc(doc(db('member',{auth_time:now-100}),'profiles','shared')));
  await ok('admin mirrors changed email and Auth cutoff',updateDoc(doc(db('admin'),'users','member'),{email:'new@example.test',authValidAfter:cutoff}));
  await no('old token loses own finance access after email change',getDoc(doc(db('member',{auth_time:now-100}),'profiles','private')));
  await no('old verified email token loses former invitation access',getDoc(doc(db('member',{auth_time:now-100}),'profiles','shared')));
  await no('old token cannot restore the prior display email',updateDoc(doc(db('member',{auth_time:now-100}),'users','member'),{email:'member@example.test'}));
  await no('token exactly at the cutoff loses finance access',getDoc(doc(db('member',{auth_time:cutoff}),'profiles','private')));
  await no('token exactly at the cutoff cannot restore email',updateDoc(doc(db('member',{auth_time:cutoff}),'users','member'),{email:'member@example.test'}));
  await ok('current token keeps own profile by UID',getDoc(doc(db('member',{email:'new@example.test',email_verified:false}),'profiles','private')));
  await no('new unverified address gains no invitation access',getDoc(doc(db('member',{email:'new@example.test',email_verified:false}),'profiles','shared')));
  await no('member cannot lower the authentication cutoff',updateDoc(doc(db('member'),'users','member'),{authValidAfter:0}));
  await no('admin cannot lower the authentication cutoff',updateDoc(doc(db('admin'),'users','member'),{authValidAfter:0}));
  await no('admin cannot put cutoff into future',updateDoc(doc(db('admin'),'users','member'),{authValidAfter:now+3600}));
  await no('admin cannot write private finances after identity permission',updateDoc(doc(db('admin'),'profiles','private'),{displayName:'Bad'}));
  await no('member still cannot grant self admin',updateDoc(doc(db('member'),'users','member'),{role:'admin'}));
  await ok('existing role status admin policy remains available',updateDoc(doc(db('admin',{auth_time:now-1000}),'users','other'),{status:'pending'}));
  console.log(JSON.stringify({passed:checks,emulator:'demo-4j-admin-identity',productionTouched:false}));
 }finally{await env.cleanup();}
})().catch(error=>{console.error(error);process.exitCode=1;});
