window.addEventListener('DOMContentLoaded',()=>{
const CATATAU_IMAGE="__4J_ASSET_8__";document.querySelectorAll('[data-catatau]').forEach(el=>el.src=CATATAU_IMAGE);
window.FINANCE_CONFIG = {
  apiKey: "AIzaSyA_FIN-_KEsblQ1QBu2S-RFLp0iwm3Y3I8",
  authDomain: "financas-familia-9480b.firebaseapp.com",
  projectId: "financas-familia-9480b",
  storageBucket: "financas-familia-9480b.firebasestorage.app",
  messagingSenderId: "526422325343",
  appId: "1:526422325343:web:89d7dd4c295b21686043ea",
  measurementId: "G-QHMZ6WF0ER"
};
/* Compatible with the existing 4J Firestore collections; demo never connects to Firebase. */
'use strict';
const Money={
  cents:v=>Math.round((Number(v)||0)*100),
  format:v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0),
  parse:v=>{let s=String(v).replace(/R\$|\s/g,'');if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');return /^\d+(\.\d{1,2})?$/.test(s)?Math.round(Number(s)*100)/100:NaN;},
  today:()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),
  date:s=>s?String(s).split('-').reverse().join('/'):'Sem data',
  validDate:s=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;},
  addMonth:(s,n)=>{const[y,m,d]=s.split('-').map(Number);const date=new Date(Date.UTC(y,m-1+n,1));date.setUTCDate(Math.min(d,new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate()));return date.toISOString().slice(0,10);},
  occurrences:d=>{const count=Math.min(600,Math.max(1,parseInt(d.parcelas)||1)),paid=Math.min(count,Math.max(0,parseInt(d.jaPagas)||0)),total=Money.cents(d.valor),base=Math.floor(total/count),rest=total%count;return Array.from({length:count},(_,i)=>({...d,type:'despesa',date:Money.addMonth(d.data,i),value:(base+(i<rest?1:0))/100,idx:i,paid:i<paid,total:count}));}
};
const Store={
  demo:new URLSearchParams(location.search).get('demo')==='1',user:null,userDoc:null,profiles:[],profile:'',meta:{},data:{receitas:[],despesas:[]},error:'',loading:true,screen:'auth',listeners:[],profileListeners:[],userListener:null,
  get permission(){if(this.demo)return 'owner';if(!this.user||!this.profile||!this.meta.ownerUid)return 'view';if(this.meta.ownerUid===this.user.uid)return 'owner';return Privacy.canEdit(this,this.meta)?'edit':'view';},
  get editable(){return ['owner','edit'].includes(this.permission);},get manageable(){return this.permission==='owner';},
  emit(){window.dispatchEvent(new Event('finance-update'));},
  cleanProfiles(){this.profileListeners.splice(0).forEach(fn=>fn());this.meta={};this.data={receitas:[],despesas:[]};},
  clean(){this.profileWatchVersion=(this.profileWatchVersion||0)+1;this.cleanProfiles();this.listeners.splice(0).forEach(fn=>fn());FamilyGroups.clean(this);this.profiles=[];this.profile='';},
  fail(e){console.error('4J:',e.code||e.message);if(e.code==='permission-denied'){this.clean();if(typeof document!=='undefined'){document.querySelector('#modal')?.close();const content=document.querySelector('#modal-content');if(content)content.innerHTML='';}this.error='Seu acesso mudou ou o Firebase ainda precisa das regras desta versão. Os dados foram fechados. Atualize a página para consultar seus perfis disponíveis.';}else this.error='Não foi possível carregar os dados. Verifique a conexão e tente novamente.';this.loading=false;if(this.screen==='loading')this.screen='auth';this.emit();},
  async init(){
    if(this.demo){this.seed();this.emit();return;}
    try{if(!window.firebase)throw new Error('Firebase unavailable');firebase.initializeApp(window.FINANCE_CONFIG);this.auth=firebase.auth();this.db=firebase.firestore();this.auth.onAuthStateChanged(user=>{this.clean();this.userListener?.();this.userListener=null;this.user=user;this.userDoc=null;this.loading=!!user;this.screen=user?'loading':'auth';this.emit();if(!user)return;this.userListener=this.db.collection('users').doc(user.uid).onSnapshot(doc=>{if(this.user?.uid!==user.uid)return;this.userDoc=doc.data();if(!this.userDoc||this.userDoc.status!=='approved'){this.clean();this.screen='pending';this.loading=false;this.emit();return;}this.screen='app';this.watchProfiles();},e=>this.fail(e));});}catch(e){this.loading=false;this.screen='auth';this.error='Não foi possível conectar. Confira sua internet e recarregue a página.';this.emit();}
  },
  watchProfiles(){
    if(this.demo||!this.user||this.userDoc?.status!=='approved')return;
    const uid=this.user.uid,version=this.profileWatchVersion=(this.profileWatchVersion||0)+1;
    this.listeners.splice(0).forEach(fn=>fn());
    const coll=this.db.collection('profiles'),queries=[coll.where('ownerUid','==',uid)];
    if(this.user.emailVerified){const email=String(this.user.email||'').toLowerCase();queries.push(coll.where('sharedView','array-contains',email),coll.where('sharedEdit','array-contains',email));}
    queries.push(...FamilyGroups.profileQueries(this,coll));
    const snapshots=new Map(),active=()=>this.user?.uid===uid&&this.profileWatchVersion===version;
    queries.forEach((q,i)=>this.listeners.push(q.onSnapshot(snap=>{
      if(!active())return;snapshots.set(i,snap.docs.map(d=>({...d.data(),id:d.id})));if(snapshots.size!==queries.length)return;
      const merged=new Map();snapshots.forEach(rows=>rows.forEach(d=>merged.set(d.id,d)));
      this.profiles=[...merged.values()].filter(p=>Privacy.canRead(this,p)).sort((a,b)=>(a.displayName||a.id).localeCompare(b.displayName||b.id));this.loading=false;
      if(!this.profiles.some(p=>p.id===this.profile)){this.cleanProfiles();this.profile='';if(this.profiles.length)this.selectProfile(ProfilePreference.pick(this));}
      this.emit();
    },e=>{if(active())this.fail(e);}))); 
  },
  refreshSharedAccess(){FamilyGroups.watch(this);},
  selectProfile(id){if(!this.profiles.some(p=>p.id===id))return;this.cleanProfiles();this.profile=id;this.error='';this.loading=true;ProfilePreference.remember(this,id);this.emit();if(this.demo){this.seed();this.emit();return;}let ready=0;const ref=this.db.collection('profiles').doc(id);this.profileListeners.push(ref.onSnapshot(doc=>{this.meta=doc.data()||{};this.emit();},e=>this.fail(e)));['receitas','despesas'].forEach(cat=>{let first=true;this.profileListeners.push(ref.collection(cat).onSnapshot(snap=>{this.data[cat]=snap.docs.map(d=>({...d.data(),id:d.id}));if(first){ready++;first=false;}if(ready===2)this.loading=false;this.emit();},e=>this.fail(e)));});},
  assertEdit(){if(!this.editable)throw new Error('Este perfil permite apenas visualização.');},
  assertManage(){if(!this.manageable)throw new Error('Apenas o proprietário do perfil pode fazer isso.');},
  async touch(){if(this.demo)return;try{await this.db.collection('profiles').doc(this.profile).update({lastUpdatedAt:firebase.firestore.FieldValue.serverTimestamp(),lastUpdatedBy:this.userDoc.name||this.user.email});}catch(e){console.warn('Metadados não atualizados',e.code);}},
  async saveRecord(type,record,id){this.assertEdit();const cat=type==='receita'?'receitas':'despesas';if(this.demo){if(id){const i=this.data[cat].findIndex(r=>r.id===id);if(i<0)throw new Error('Lançamento não encontrado.');this.data[cat][i]={...this.data[cat][i],...record,id};}else this.data[cat].push({...record,id:crypto.randomUUID()});this.emit();return;}const col=this.db.collection('profiles').doc(this.profile).collection(cat);if(id)await col.doc(id).set(record,{merge:true});else await col.add(record);await this.touch();},
  async removeRecord(type,id){this.assertEdit();const cat=type==='receita'?'receitas':'despesas';if(this.demo){this.data[cat]=this.data[cat].filter(r=>r.id!==id);this.emit();return;}await this.db.collection('profiles').doc(this.profile).collection(cat).doc(id).delete();await this.touch();},
  async saveGoals(mutator){this.assertEdit();if(this.demo){this.meta.goalsV2=mutator(structuredClone(this.meta.goalsV2||[]));this.emit();return;}const ref=this.db.collection('profiles').doc(this.profile);await this.db.runTransaction(async tx=>{const doc=await tx.get(ref);if(!doc.exists)throw new Error('Perfil não encontrado.');tx.update(ref,{goalsV2:mutator(doc.data().goalsV2||[])});});await this.touch();},
  async addCategory(type,value){this.assertEdit();const key=type==='receita'?'customCatReceita':'customCatDespesa';if(this.demo){this.meta[key]=[...(this.meta[key]||[]),value];this.emit();return;}await this.db.collection('profiles').doc(this.profile).update({[key]:firebase.firestore.FieldValue.arrayUnion(value)});},
  async createProfile(name){if(this.demo)throw new Error('Para criar perfis reais, entre na sua conta.');name=String(name||'').trim();if(!name||name.includes('/')||name.length>60)throw new Error('Use um nome de até 60 caracteres, sem barra.');const ref=this.db.collection('profiles').doc();await ref.set({displayName:name,ownerUid:this.user.uid,ownerEmail:this.user.email.toLowerCase(),sharedView:[],sharedEdit:[],createdAt:firebase.firestore.FieldValue.serverTimestamp()});},
  async share(email,level){this.assertManage();if(this.demo)throw new Error('Compartilhamento disponível na sua conta.');if(email===this.meta.ownerEmail?.toLowerCase())throw new Error('O proprietário já tem acesso.');const ref=this.db.collection('profiles').doc(this.profile);await this.db.runTransaction(async tx=>{const m=(await tx.get(ref)).data();const view=(m.sharedView||[]).filter(e=>e!==email),edit=(m.sharedEdit||[]).filter(e=>e!==email);if(level==='edit')edit.push(email);if(level==='view')view.push(email);tx.update(ref,{sharedView:view,sharedEdit:edit});});},
  async importRows(rows){this.assertEdit();if(this.demo){for(const r of rows){const{type,...data}=r;this.data[type==='receita'?'receitas':'despesas'].push({...data,id:crypto.randomUUID()});}this.emit();return;}for(let i=0;i<rows.length;i+=400){const batch=this.db.batch();for(const row of rows.slice(i,i+400)){const{type,...data}=row;batch.set(this.db.collection('profiles').doc(this.profile).collection(type==='receita'?'receitas':'despesas').doc(),data);}await batch.commit();}await this.touch();},
  async login(email,password,remember){if(!this.auth)throw new Error('Não foi possível conectar. Recarregue a página.');await this.auth.setPersistence(remember?firebase.auth.Auth.Persistence.LOCAL:firebase.auth.Auth.Persistence.SESSION);await this.auth.signInWithEmailAndPassword(email,password);},
  async signup(name,email,password){const cred=await this.auth.createUserWithEmailAndPassword(email,password);await this.db.collection('users').doc(cred.user.uid).set({name,email:email.toLowerCase(),status:'pending',role:'member',createdAt:firebase.firestore.FieldValue.serverTimestamp()});},
  async logout(){if(this.demo){location.href='?';return;}this.clean();this.userListener?.();this.userListener=null;await this.auth.signOut();},
  seed(){const month=Money.today().slice(0,7),year=month.slice(0,4);this.screen='app';this.user={uid:'demo',email:'familia@exemplo.com'};this.userDoc={name:'Sua família',role:'member'};this.profile='Família 4J';this.profiles=[{id:this.profile}];this.loading=false;this.meta={ownerUid:'demo',goalsV2:[{id:'g1',name:'Férias em família',emoji:'🏖️',target:12000,saved:7800,date:Money.addMonth(month+'-01',6)},{id:'g2',name:'Nossa reserva',emoji:'🌱',target:20000,saved:8500,date:Money.addMonth(month+'-01',12)},{id:'g3',name:'Um novo cantinho',emoji:'🏡',target:6000,saved:2400,date:Money.addMonth(month+'-01',8)}]};this.data={receitas:[],despesas:[]};for(let k=5;k>=0;k--){const m=Money.addMonth(month+'-01',-k).slice(0,7);this.data.receitas.push({id:'r'+k,desc:'Salários da família',cat:'Salário',valor:12800+(k%3)*350,data:m+'-05'},{id:'rx'+k,desc:'Trabalho extra',cat:'Freelance/Extra',valor:k===0?750:450+k*50,data:m+'-03'});const spend=[['Aluguel','Moradia',2800,'Boleto',10],['Supermercado','Alimentação',k===0?1248.50:1170+k*44,'Pix',4],['Escola','Educação',1350,'Boleto',12],['Plano de saúde','Saúde',780,'Débito',15],['Internet de casa','Assinaturas',119.90,'Pix',8],['Combustível','Transporte',420+k*20,'Cartão de Crédito',3],['Cinema em família','Lazer',185,'Pix',2]];spend.forEach(([desc,cat,valor,forma,day],i)=>this.data.despesas.push({id:'d'+k+'-'+i,desc,cat,valor,data:m+'-'+String(day).padStart(2,'0'),forma,parcelas:1,jaPagas:k>0||day<6?1:0,reembolsavel:false,reembolsado:false}));}}
};


'use strict';
/* Profile data operations: one bounded transaction, with fresh authorization. */
const ProfileOps={
  limit:180,collections:['receitas','despesas'],categoryKeys:['customCatReceita','customCatDespesa','customFormaPg'],
  clone:value=>structuredClone(value),
  signature(value){return JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.keys(v).sort().reduce((o,k)=>(o[k]=v[k],o),{}):v);},
  requireAccess(store,meta,account,manage=false){
    if(!store.user||!account||account.status!=='approved')throw new Error('Sua conta precisa estar ativa. Entre novamente e confira seu acesso.');
    const owner=meta?.ownerUid===store.user.uid;
    if(!meta?.ownerUid||!(owner||(!manage&&Privacy.canEdit(store,meta))))throw new Error(manage?'Apenas o proprietário pode gerenciar este perfil.':'Você precisa de permissão para editar o perfil de destino.');
  },
  validatePayload(payload){
    if(!payload||typeof payload!=='object')throw new Error('Dados inválidos.');
    if(payload.budgetPlan!==undefined)Budget.validatePlan(payload.budgetPlan);if(payload.budgetMonths!==undefined)Budget.validateMonths(payload.budgetMonths);
    for(const key of [...this.collections,'goalsV2',...this.categoryKeys])if(payload[key]!==undefined&&!Array.isArray(payload[key]))throw new Error('Formato de dados inválido: '+key+'.');
    for(const cat of this.collections)for(const row of payload[cat]||[])if(!row||typeof row!=='object'||Array.isArray(row))throw new Error('Lançamento inválido.');
    if(this.collections.reduce((n,k)=>n+(payload[k]||[]).length,0)>this.limit)throw new Error('Limite de '+this.limit+' lançamentos por operação. Nenhum dado foi alterado.');
    if((payload.goalsV2||[]).length>200||this.categoryKeys.some(k=>(payload[k]||[]).length>200))throw new Error('Limite de 200 metas ou categorias por grupo. Nenhum dado foi alterado.');
    if(new TextEncoder().encode(this.signature(payload)).length>600000)throw new Error('Os dados excedem o limite desta operação. Nenhum dado foi alterado.');
  },
  payload(snapshot,selection={receitas:true,despesas:true,goals:true,categories:true}){
    const data={receitas:selection.receitas?snapshot.receitas:[],despesas:selection.despesas?snapshot.despesas:[],goalsV2:selection.goals?(snapshot.meta.goalsV2||[]):[]};
    for(const key of this.categoryKeys)data[key]=selection.categories?(snapshot.meta[key]||[]):[];
    this.validatePayload(data);return data;
  },
  mergeMeta(meta,payload){
    const update={goalsV2:[...(meta.goalsV2||[]),...(payload.goalsV2||[]).map(g=>({...g,id:crypto.randomUUID()}))]};
    for(const key of this.categoryKeys)update[key]=[...new Set([...(meta[key]||[]),...(payload[key]||[])])];
    if(payload.budgetPlan!==undefined&&!meta.budgetPlan)update.budgetPlan=Budget.validatePlan(payload.budgetPlan);
    if(payload.budgetMonths!==undefined)update.budgetMonths=Budget.validateMonths({...payload.budgetMonths,...meta.budgetMonths});
    this.validatePayload(update);return update;
  },
  stamp(store){return{lastUpdatedAt:firebase.firestore.FieldValue.serverTimestamp(),lastUpdatedBy:store.userDoc?.name||store.user.email};},
  async snapshot(store,id){
    if(store.demo){const space=store.demoSpaces[id];if(!space)throw new Error('Perfil não encontrado.');return{id,meta:this.clone(space.meta),receitas:this.clone(space.data.receitas),despesas:this.clone(space.data.despesas)};}
    const ref=store.db.collection('profiles').doc(id),meta=await ref.get({source:'server'});
    if(!meta.exists)throw new Error('Perfil não encontrado.');
    const data={id,meta:meta.data()};
    for(const cat of this.collections){const result=await ref.collection(cat).limit(this.limit+1).get({source:'server'});data[cat]=result.docs.map(doc=>({...doc.data(),id:doc.id}));}
    this.validatePayload({...data,...data.meta});return data;
  },
  async authorized(tx,store,refs){
    const account=await tx.get(store.db.collection('users').doc(store.user.uid));
    const snapshots=[];for(const ref of refs)snapshots.push(await tx.get(ref));
    if(snapshots.some(s=>!s.exists))throw new Error('Um dos perfis já não existe. Reabra esta janela.');
    const metas=snapshots.map(s=>s.data());for(const meta of metas)await Privacy.loadFreshFamily(tx,store,meta);
    return{account:account.data(),metas};
  },
  async verifySnapshot(tx,store,snapshot,freshMeta){
    if(this.signature(snapshot.meta)!==this.signature(freshMeta))throw new Error('O perfil foi atualizado. Feche e abra esta operação para revisar os dados atuais.');
    const rows=[];
    for(const cat of this.collections)for(const row of snapshot[cat]){
      const ref=store.db.collection('profiles').doc(snapshot.id).collection(cat).doc(row.id),current=await tx.get(ref);
      if(!current.exists||this.signature({...current.data(),id:current.id})!==this.signature(row))throw new Error('Os lançamentos mudaram. Reabra esta operação e confira a prévia.');
      rows.push({cat,ref,data:current.data()});
    }return rows;
  },
  async remove(store,snapshot,confirmation){
    if(snapshot.despesas.some(r=>r.family?.linkedRecordId))throw new Error('Este perfil tem acertos sincronizados. Encerre a sincronização em Acertos antes de excluir o perfil; assim os registros da outra pessoa são preservados.');
    const label=snapshot.meta.displayName||snapshot.id;
    if(confirmation!==label)throw new Error('Digite exatamente o nome do perfil para confirmar.');
    this.validatePayload({...snapshot,...snapshot.meta});
    if(store.demo){const fresh=await this.snapshot(store,snapshot.id);if(this.signature(fresh)!==this.signature(snapshot))throw new Error('Os dados mudaram. Reabra a operação.');delete store.demoSpaces[snapshot.id];store.refreshDemoProfiles();return;}
    const ref=store.db.collection('profiles').doc(snapshot.id);
    await store.db.runTransaction(async tx=>{
      const {account,metas}=await this.authorized(tx,store,[ref]);this.requireAccess(store,metas[0],account,true);
      const rows=await this.verifySnapshot(tx,store,snapshot,metas[0]);
      for(const row of rows)tx.delete(row.ref);
      tx.delete(ref);
    });
    if(ProfilePreference.last(store)===snapshot.id)ProfilePreference.remember(store,'');
  },
  async transfer(store,snapshot,target,mode,selection,confirmation){
    if(!['copy','move'].includes(mode))throw new Error('Escolha copiar ou mover.');
    if(target===snapshot.id)throw new Error('Escolha um perfil diferente para receber os dados.');
    if(confirmation!==(snapshot.meta.displayName||snapshot.id))throw new Error('Digite exatamente o nome do perfil de origem.');
    if(!Object.values(selection).some(Boolean))throw new Error('Escolha quais dados deseja levar.');
    if(selection.despesas&&snapshot.despesas.some(r=>r.family?.linkedRecordId))throw new Error('Há acertos sincronizados nas despesas. Encerre a sincronização em Acertos antes de transferir estes registros.');
    const payload=this.payload(snapshot,selection);
    if(store.demo){
      const source=store.demoSpaces[snapshot.id],dest=store.demoSpaces[target];if(!source||!dest)throw new Error('Perfil não encontrado.');
      if(this.signature(await this.snapshot(store,snapshot.id))!==this.signature(snapshot))throw new Error('Os dados mudaram. Reabra a operação.');
      const update=this.mergeMeta(dest.meta,payload),next=this.clone(dest.data);
      for(const cat of this.collections)next[cat].push(...payload[cat].map(row=>({...row,id:crypto.randomUUID()})));
      Object.assign(dest.meta,update);dest.data=next;
      if(mode==='move'){for(const cat of this.collections)if(selection[cat])source.data[cat]=[];if(selection.goals)source.meta.goalsV2=[];if(selection.categories)for(const key of this.categoryKeys)source.meta[key]=[];}
      store.loadDemoProfile(store.profile);return;
    }
    const sourceRef=store.db.collection('profiles').doc(snapshot.id),destRef=store.db.collection('profiles').doc(target);
    const targets={};for(const cat of this.collections)targets[cat]=payload[cat].map(()=>destRef.collection(cat).doc());
    await store.db.runTransaction(async tx=>{
      const {account,metas}=await this.authorized(tx,store,[sourceRef,destRef]);this.requireAccess(store,metas[0],account,true);this.requireAccess(store,metas[1],account);
      const rows=await this.verifySnapshot(tx,store,snapshot,metas[0]),update=this.mergeMeta(metas[1],payload);
      const changes={...this.stamp(store)};
      for(const cat of this.collections)payload[cat].forEach((row,i)=>{const{id,...data}=row;tx.set(targets[cat][i],data);});
      tx.update(destRef,{...update,...changes});
      if(mode==='move'){
        for(const row of rows)if(selection[row.cat])tx.delete(row.ref);
        if(selection.goals)changes.goalsV2=[];
        if(selection.categories)for(const key of this.categoryKeys)changes[key]=[];
        tx.update(sourceRef,changes);
      }
    });
  },
  async restore(store,payload){
    this.validatePayload(payload);store.assertEdit();
    if(store.demo){const update=this.mergeMeta(store.meta,payload),next=this.clone(store.data);for(const cat of this.collections)next[cat].push(...(payload[cat]||[]).map(row=>({...row,id:crypto.randomUUID()})));Object.assign(store.meta,update);store.data=next;store.emit();return;}
    const ref=store.db.collection('profiles').doc(store.profile),targets={};for(const cat of this.collections)targets[cat]=(payload[cat]||[]).map(()=>ref.collection(cat).doc());
    await store.db.runTransaction(async tx=>{const{account,metas}=await this.authorized(tx,store,[ref]);this.requireAccess(store,metas[0],account);const update=this.mergeMeta(metas[0],payload);for(const cat of this.collections)(payload[cat]||[]).forEach((row,i)=>{const{id,...data}=row;tx.set(targets[cat][i],data);});tx.update(ref,{...update,...this.stamp(store)});});
  }
};
/* Startup preference belongs to a login, never to a shared browser-wide profile. */
const ProfilePreference={
  key(store,suffix='default'){return '4j-profile-'+suffix+':'+(store.demo?'demo':store.user?.uid||'signed-out');},
  read(store){try{return JSON.parse(localStorage.getItem(this.key(store))||'null');}catch{return null;}},
  write(store,value){try{localStorage.setItem(this.key(store),JSON.stringify(value));return true;}catch{return false;}},
  preferred(store){const local=this.read(store);return local?.pending?local.id:(typeof store.userDoc?.defaultProfileId==='string'?store.userDoc.defaultProfileId:local?.id||'');},
  remember(store,id){try{if(id)localStorage.setItem(this.key(store,'last'),id);else localStorage.removeItem(this.key(store,'last'));}catch{}},
  last(store){try{return localStorage.getItem(this.key(store,'last'))||'';}catch{return '';}},
  pick(store){const available=store.profiles||[],preferred=this.preferred(store);return available.find(p=>p.id===preferred)?.id||available.find(p=>p.ownerUid===store.user?.uid)?.id||available.find(p=>p.id===this.last(store))?.id||available[0]?.id||'';},
  async save(store,id){
    if(!store.user?.uid||store.userDoc?.status!=='approved')throw new Error('Entre com uma conta ativa para escolher seu perfil padrão.');
    if(id&&!store.profiles.some(p=>p.id===id))throw new Error('Escolha um perfil ao qual você tem acesso.');
    const context={demo:store.demo,user:{uid:store.user.uid,email:store.user.email,emailVerified:store.user.emailVerified},db:store.db,families:[...(store.families||[])]},previous=this.read(store),localSaved=this.write(context,{id,pending:true});
    if(store.demo){store.userDoc.defaultProfileId=id;this.write(context,{id,pending:false});return 'demo';}
    try{
      const userRef=context.db.collection('users').doc(context.user.uid),profileRef=id?context.db.collection('profiles').doc(id):null;
      await context.db.runTransaction(async tx=>{
        const user=await tx.get(userRef),account=user.data();if(!user.exists||account?.status!=='approved')throw new Error('Sua conta precisa estar ativa.');
        if(profileRef){const snapshot=await tx.get(profileRef),profile=snapshot.data();await Privacy.loadFreshFamily(tx,context,profile);if(!snapshot.exists||!Privacy.canRead(context,profile))throw new Error('Esse perfil não está mais disponível para sua conta.');}
        tx.update(userRef,{defaultProfileId:id});
      });
      this.write(context,{id,pending:false});if(store.user?.uid===context.user.uid)store.userDoc={...store.userDoc,defaultProfileId:id};return 'account';
    }catch(error){
      const code=String(error?.code||'').split('/').at(-1);
      if(localSaved&&['permission-denied','unavailable','deadline-exceeded','failed-precondition','network-request-failed'].includes(code))return 'device';
      this.write(context,previous);throw error;
    }
  }
};
function defaultProfileSettings(){
  const selected=ProfilePreference.preferred(Store),optionsHtml=Store.profiles.map(p=>`<option value="${esc(p.id)}" ${p.id===selected?'selected':''}>${esc(p.id===Store.profile?profileName():p.displayName||p.id)}${p.ownerUid===Store.user?.uid?' · meu perfil':''}</option>`).join('');
  return `<form id="default-profile-form" class="settings-group"><h3>Seu perfil ao entrar</h3><p class="modal-copy">Escolha o espaço que deve abrir sempre que você entrar com este e-mail. Visitar outro perfil não muda essa preferência.</p><label style="margin-top:12px">Perfil padrão<select name="defaultProfile"><option value="" ${!Store.profiles.some(p=>p.id===selected)?'selected':''}>Automático · meu perfil primeiro</option>${optionsHtml}</select></label><p class="form-tip">Sem uma escolha, o 4J prioriza um perfil do qual você seja proprietário(a). ${Store.demo?'Na demonstração, a preferência vale apenas para o teste.':'A preferência será sincronizada com sua conta quando o Firebase permitir.'}</p><p id="default-profile-error" class="form-error" role="alert" hidden></p><p id="default-profile-result" class="form-tip" role="status" hidden></p><button type="submit" class="button primary" style="margin-top:12px">Salvar perfil padrão</button></form>`;
}
document.addEventListener('submit',e=>{
  if(e.target.id!=='default-profile-form')return;e.preventDefault();const form=e.target,id=String(new FormData(form).get('defaultProfile')||''),uid=Store.user?.uid;
  runForm(form,'#default-profile-error',async()=>{const scope=await ProfilePreference.save(Store,id);if(Store.user?.uid!==uid||$('#default-profile-form')!==form)return;const result=$('#default-profile-result');result.hidden=false;result.textContent=scope==='account'?'Salvo na sua conta. Este será o perfil aberto nos próximos acessos.':scope==='device'?'Salvo neste navegador. O Firebase não permitiu sincronizar com sua conta; em outro aparelho, escolha o padrão novamente.':'Padrão salvo para a demonstração. Recarregue para conferir.';toast(scope==='device'?'Perfil padrão salvo neste navegador.':'Perfil padrão salvo.');});
});

/* Open member signup. Existing account roles and inactive states are never overwritten. */
const AccountSignup={
  jobs:new Map(),draft:null,
  active(store,uid){return store.user?.uid===uid&&store.auth?.currentUser?.uid===uid;},
  message(error){return String(error?.code||'').split('/').pop()==='permission-denied'?'Sua conta de login foi criada, mas o Firebase não permitiu concluir o cadastro. Quem configura o site precisa permitir, nas regras do Firestore, que cada pessoa crie somente seu próprio cadastro como Membro ativo. Depois, toque em Tentar novamente. Não é necessário criar outro login.':error?.code==='auth/user-changed'?'A conta conectada mudou. Entre novamente para continuar.':'Não foi possível concluir seu cadastro. Confira a conexão e toque em Tentar novamente. Seu login já existe; não crie outra conta.';},
  fail(store,uid,error){if(!this.active(store,uid))return;store.accountSetupBusy=false;store.accountSetupError=this.message(error);store.loading=false;store.screen='provisioning';store.emit();},
  apply(store,uid,account){
    if(!this.active(store,uid))return;
    store.userDoc=account;store.accountSetupBusy=false;store.accountSetupError='';store.error='';
    if(account?.status!=='approved'){store.clean();store.screen='pending';store.loading=false;store.emit();return;}
    store.screen='app';FamilyGroups.watch(store);
  },
  async provision(store,user,name=''){
    const uid=user?.uid,email=String(user?.email||'').trim().toLowerCase();
    if(!uid||!email||!this.active(store,uid))throw Object.assign(new Error('A conta conectada mudou.'),{code:'auth/user-changed'});
    if(this.jobs.has(uid))return this.jobs.get(uid);
    const db=store.db,ref=db.collection('users').doc(uid),display=String(name||user.displayName||email.split('@')[0]).trim().slice(0,80)||'Meu espaço';
    store.accountSetupBusy=true;store.accountSetupError='';store.loading=false;store.screen='provisioning';store.emit();
    const task=(async()=>{
      const account=await db.runTransaction(async tx=>{
        if(!this.active(store,uid))throw Object.assign(new Error('A conta conectada mudou.'),{code:'auth/user-changed'});
        const snapshot=await tx.get(ref);
        if(!this.active(store,uid))throw Object.assign(new Error('A conta conectada mudou.'),{code:'auth/user-changed'});
        if(snapshot.exists)return snapshot.data();
        const data={name:display,email,status:'approved',role:'member',createdAt:firebase.firestore.FieldValue.serverTimestamp()};
        tx.set(ref,data);return data;
      });
      this.apply(store,uid,account);return account;
    })();
    this.jobs.set(uid,task);
    try{return await task;}catch(error){this.fail(store,uid,error);throw error;}finally{if(this.jobs.get(uid)===task)this.jobs.delete(uid);}
  },
  watch(store,user,name=''){
    const uid=user.uid;let attempted=false;
    store.userListener?.();store.userListener=null;
    store.userListener=store.db.collection('users').doc(uid).onSnapshot(snapshot=>{
      if(!this.active(store,uid))return;
      if(snapshot.exists){this.apply(store,uid,snapshot.data());return;}
      store.userDoc=null;store.clean();store.screen='provisioning';store.loading=false;store.emit();
      if(!attempted){attempted=true;this.provision(store,user,name).catch(()=>{});}
    },error=>this.fail(store,uid,error));
  },
  async retry(store){
    if(store.demo||store.accountSetupBusy||!store.user)return;
    const user=store.user,uid=user.uid,name=this.draft?.email===String(user.email||'').toLowerCase()?this.draft.name:'';
    try{await this.provision(store,user,name);if(this.active(store,uid))this.watch(store,user,name);}catch(_){}
  }
};
Object.assign(Store,{
  accountSetupBusy:false,accountSetupError:'',
  async init(){
    if(this.demo){this.seed();this.emit();return;}
    try{
      if(!window.firebase)throw new Error('Firebase unavailable');
      firebase.initializeApp(window.FINANCE_CONFIG);this.auth=firebase.auth();this.db=firebase.firestore();
      this.auth.onAuthStateChanged(user=>{
        this.clean();this.userListener?.();this.userListener=null;this.user=user;this.userDoc=null;this.error='';this.accountSetupBusy=false;this.accountSetupError='';this.loading=!!user;this.screen=user?'loading':'auth';this.emit();
        if(!user)return;
        const name=AccountSignup.draft?.email===String(user.email||'').toLowerCase()?AccountSignup.draft.name:'';
        AccountSignup.watch(this,user,name);
      });
    }catch(error){this.loading=false;this.screen='auth';this.error='Não foi possível conectar. Confira sua internet e recarregue a página.';this.emit();}
  },
  async signup(name,email,password){
    if(!this.auth||!this.db)throw new Error('Não foi possível conectar. Recarregue a página.');
    const display=String(name||'').trim(),address=String(email||'').trim().toLowerCase();
    if(!display||display.length>80)throw new Error('Preencha seu nome com até 80 caracteres.');
    AccountSignup.draft={name:display,email:address};
    let user;
    try{user=(await this.auth.createUserWithEmailAndPassword(address,password)).user;}
    catch(error){AccountSignup.draft=null;throw error;}
    // Auth's observer owns provisioning; never write credentials or an administrator role here.
    if(this.user?.uid===user.uid){
      try{await AccountSignup.provision(this,user,display);}catch(_){}
    }
  }
});
function renderAccountGate(){
  const loading=Store.screen==='loading',inactive=Store.screen==='pending',busy=loading||Store.accountSetupBusy;
  const title=loading?'Preparando seu espaço...':inactive?'Seu acesso está inativo':busy?'Concluindo seu cadastro...':'Vamos concluir seu cadastro';
  const copy=loading?'Estamos conectando sua conta.':inactive?'Esta conta está inativa. Entre em contato com quem administra a plataforma para recuperar o acesso. Contas novas entram automaticamente como Membro.':Store.accountSetupError||'Seu espaço é pessoal. Você acessará seus próprios perfis e aqueles que forem compartilhados com você.';
  const boot=document.querySelector('#boot');boot.hidden=false;
  boot.innerHTML=`<img class="brand-symbol" src="__4J_ASSET_7__" width="76" height="45" alt="4J"><h2>${esc(title)}</h2><p ${Store.accountSetupError?'role="alert"':'role="status"'} style="max-width:540px;padding:0 20px">${esc(copy)}</p><div class="settings-buttons" style="justify-content:center;gap:12px;margin-top:18px">${!inactive&&!loading?`<button class="button primary" data-action="retry-account" ${busy?'disabled':''}>${busy?'Concluindo...':'Tentar novamente'}</button>`:''}<button class="button secondary" data-action="logout">Sair da conta</button></div>`;
}
document.addEventListener('click',event=>{if(event.target.closest('[data-action="retry-account"]'))AccountSignup.retry(Store);});

const originalProfileStore={seed:Store.seed,emit:Store.emit,selectProfile:Store.selectProfile,createProfile:Store.createProfile,saveRecord:Store.saveRecord,removeRecord:Store.removeRecord,importRows:Store.importRows};
Object.assign(Store,{
  demoSpaces:null,
  seed(){if(this.demoSpaces){this.loadDemoProfile(this.profile);return;}originalProfileStore.seed.call(this);this.userDoc.status='approved';this.demoSpaces=Object.create(null);this.demoSpaces[this.profile]={meta:this.meta,data:this.data};this.demoSpaces['Meu novo espaço']={meta:{ownerUid:'demo',ownerEmail:this.user.email,displayName:'Meu novo espaço',goalsV2:[],customCatReceita:[],customCatDespesa:[]},data:{receitas:[],despesas:[]}};this.refreshDemoProfiles();this.loadDemoProfile(ProfilePreference.pick(this));},
  emit(){if(this.demo&&this.demoSpaces&&this.demoSpaces[this.profile]){this.demoSpaces[this.profile].meta=this.meta;this.demoSpaces[this.profile].data=this.data;this.profiles=this.profiles.map(p=>p.id===this.profile?{id:p.id,...this.meta}:p);}originalProfileStore.emit.call(this);},
  refreshDemoProfiles(){this.profiles=Object.entries(this.demoSpaces).map(([id,s])=>({id,...s.meta}));if(!this.demoSpaces[this.profile])this.profile=this.profiles[0]?.id||'';this.loadDemoProfile(this.profile);},
  loadDemoProfile(id){const space=this.demoSpaces[id];this.profile=space?id:'';this.meta=space?.meta||{};this.data=space?.data||{receitas:[],despesas:[]};this.loading=false;this.error='';ProfilePreference.remember(this,id);this.emit();},
  selectProfile(id){if(this.demo){if(this.demoSpaces[id]){this.emit();this.loadDemoProfile(id);}return;}return originalProfileStore.selectProfile.call(this,id);},
  async createProfile(name){if(!this.demo)return originalProfileStore.createProfile.call(this,name);if(!name||name.includes('/')||name.length>60)throw new Error('Use um nome de até 60 caracteres, sem barra.');if(this.demoSpaces[name])throw new Error('Esse nome de perfil já existe.');this.demoSpaces[name]={meta:{ownerUid:'demo',ownerEmail:this.user.email,goalsV2:[]},data:{receitas:[],despesas:[]}};this.refreshDemoProfiles();},
  async saveRecord(type,record,id){
    if(this.demo)return originalProfileStore.saveRecord.call(this,type,record,id);
    this.assertEdit();
    const context={db:this.db,user:{uid:this.user.uid,email:this.user.email,emailVerified:this.user.emailVerified},userDoc:{name:this.userDoc?.name}},ref=context.db.collection('profiles').doc(this.profile),item=ref.collection(type==='receita'?'receitas':'despesas').doc(id||undefined);
    await context.db.runTransaction(async tx=>{
      const{account,metas}=await ProfileOps.authorized(tx,context,[ref]);ProfileOps.requireAccess(context,metas[0],account);
      let fresh={};if(id){const current=await tx.get(item);if(!current.exists)throw new Error('Lançamento não encontrado.');fresh=current.data();}
      const merged={...fresh,...record};
      if(type==='despesa'&&Recurrence.is(merged)){const error=Recurrence.validate(merged);if(error)throw new Error(error+' Confira os pagamentos atuais antes de encerrar a série.');}
      tx.set(item,record,{merge:!!id});tx.update(ref,ProfileOps.stamp(context));
    });
  },
  async removeRecord(type,id){if(this.demo)return originalProfileStore.removeRecord.call(this,type,id);this.assertEdit();const ref=this.db.collection('profiles').doc(this.profile),item=ref.collection(type==='receita'?'receitas':'despesas').doc(id);await this.db.runTransaction(async tx=>{const{account,metas}=await ProfileOps.authorized(tx,this,[ref]);ProfileOps.requireAccess(this,metas[0],account);tx.delete(item);tx.update(ref,ProfileOps.stamp(this));});},
  async importRows(rows){if(this.demo)return originalProfileStore.importRows.call(this,rows);this.assertEdit();if(rows.length>400)throw new Error('Limite de 400 lançamentos por importação.');const ref=this.db.collection('profiles').doc(this.profile),targets=rows.map(r=>ref.collection(r.type==='receita'?'receitas':'despesas').doc());await this.db.runTransaction(async tx=>{const{account,metas}=await ProfileOps.authorized(tx,this,[ref]);ProfileOps.requireAccess(this,metas[0],account);rows.forEach((row,i)=>{const{type,...data}=row;tx.set(targets[i],data);});tx.update(ref,ProfileOps.stamp(this));});},
  profileSnapshot(id=this.profile){return ProfileOps.snapshot(this,id);},
  deleteProfile(snapshot,confirmation){return ProfileOps.remove(this,snapshot,confirmation);},
  transferProfile(snapshot,target,mode,selection,confirmation){return ProfileOps.transfer(this,snapshot,target,mode,selection,confirmation);},
  restoreBackup(payload){return ProfileOps.restore(this,payload);}
});


/* Monthly planning. Money stays in integer cents until presentation. */
const Budget={
  defaults:{fixed:50,reserve:20,variable:30},
  keys:['fixed','reserve','variable'],
  labels:{fixed:'Despesas fixas',reserve:'Reserva',variable:'Despesas variáveis'},
  validMonth:m=>typeof m==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(m),
  validatePlan(plan){if(!plan||!this.keys.every(k=>Number.isInteger(plan[k])&&plan[k]>=0&&plan[k]<=100)||this.keys.reduce((s,k)=>s+plan[k],0)!==100)throw new Error('Os três percentuais precisam somar 100%. Use números inteiros de 0 a 100.');return Object.fromEntries(this.keys.map(k=>[k,plan[k]]));},
  plan(meta){try{return this.validatePlan(meta.budgetPlan);}catch{return {...this.defaults};}},
  validateMonths(months){if(!months||typeof months!=='object'||Array.isArray(months)||Object.keys(months).length>1200)throw new Error('Histórico de reservas inválido.');const result={};for(const [m,v] of Object.entries(months)){if(!this.validMonth(m)||typeof v!=='number'||!Number.isFinite(v)||v<0||v>999999999||Math.abs(v*100-Math.round(v*100))>0.001)throw new Error('Confira o mês e o valor da reserva.');result[m]=v;}return result;},
  group(row){if(['fixed','variable'].includes(row.budgetGroup))return row.budgetGroup;return row.recurrence?.frequency==='monthly'||['Moradia','Educação','Saúde','Assinaturas'].includes(row.cat)?'fixed':'variable';},
  analyze(rows,meta,month){
    const plan=this.plan(meta),expenses=rows.filter(r=>r.type==='despesa'&&r.date.startsWith(month)),income=rows.filter(r=>r.type==='receita'&&r.date.startsWith(month)).reduce((s,r)=>s+Money.cents(r.value),0);
    // Largest remainder allocation keeps every cent, including very small incomes.
    const limits=Object.fromEntries(this.keys.map(k=>[k,Math.floor(income*plan[k]/100)]));
    const order=[...this.keys].sort((a,b)=>(income*plan[b]%100)-(income*plan[a]%100));
    for(let rest=income-this.keys.reduce((s,k)=>s+limits[k],0),i=0;rest>0;rest--,i++)limits[order[i%3]]++;
    const reserveKnown=Object.hasOwn(meta.budgetMonths||{},month),spent={fixed:0,reserve:Money.cents(meta.budgetMonths?.[month]||0),variable:0};
    for(const r of expenses)spent[this.group(r)]+=Money.cents(r.value);
    const groups=this.keys.map(key=>({key,label:this.labels[key],percent:plan[key],limit:limits[key],actual:spent[key],delta:spent[key]-limits[key],ratio:income?spent[key]/income*100:null}));
    return {month,plan,income,groups,expenses,reserveKnown,suggested:expenses.filter(r=>!['fixed','variable'].includes(r.budgetGroup)).length,available:income-spent.fixed-spent.variable-spent.reserve};
  },
  advice(b){
    const cash=c=>Money.format(c/100),percent=n=>n.toLocaleString('pt-BR',{maximumFractionDigits:1}),lines=[];
    if(!b.income)return 'Ainda não há receitas registradas neste mês para calcular os limites. Cadastre o valor líquido recebido em Lançamentos. Suas despesas já aparecem aqui; depois eu comparo com o plano.';
    const over=b.groups.filter(g=>g.key!=='reserve'&&g.delta>0).sort((a,b)=>b.delta-a.delta);
    for(const g of b.groups.filter(g=>g.key!=='reserve'))lines.push(`${g.label}: ${cash(g.actual)} (${percent(g.ratio)}% da renda). ${g.delta>0?`Acima do limite em ${cash(g.delta)} — ${percent(g.ratio-g.percent)} pontos percentuais.`:g.delta===0?'Você chegou ao limite planejado.':`Ainda cabem ${cash(-g.delta)} no limite planejado.`}`);
    if(over.length){const main=over[0],grouped=new Map();for(const row of b.expenses.filter(r=>this.group(r)===main.key))grouped.set(row.cat||'Sem categoria',(grouped.get(row.cat||'Sem categoria')||0)+Money.cents(row.value));const top=[...grouped].sort((a,b)=>b[1]-a[1])[0];lines.push(`Por onde começar: em ${main.label.toLowerCase()}, ${top[0]} concentra ${cash(top[1])}. Confira esses lançamentos e veja quais próximos gastos podem ser reduzidos ou renegociados.`);}
    else lines.push('As despesas registradas estão dentro dos limites. Continue incluindo os gastos para acompanhar o mês.');
    const reserve=b.groups.find(g=>g.key==='reserve');
    lines.push(!b.reserveKnown?`Reserva: a meta é ${cash(reserve.limit)}. Informe em “Registrar reserva” o total que você separou neste mês para eu acompanhar.`:reserve.delta>=0?`Reserva: ${cash(reserve.actual)} registrados; você alcançou a meta de ${cash(reserve.limit)} do mês.`:`Reserva: ${cash(reserve.actual)} de ${cash(reserve.limit)}. Faltam ${cash(-reserve.delta)} para a meta deste mês; ajuste os próximos passos ao que couber.`);
    if(b.available<0)lines.push(`Atenção ao conjunto: despesas + reserva registrada superam as receitas do mês em ${cash(-b.available)}. Confira se usou saldo anterior e revise o planejamento antes de separar mais dinheiro.`);
    if(b.suggested)lines.push(`${b.suggested} despesa(s) usam classificação sugerida. Revise em “Conferir fixas e variáveis” para deixar a análise mais fiel.`);
    lines.push('Leitura parcial dos seus registros: inclui despesas pagas e previstas do mês. Não é saldo bancário.');return lines.join('\n\n');
  }
};
Store.saveBudget=async function({plan,month,reserve}){
  this.assertEdit();if(this.loading||this.error||!this.profile)throw new Error('Aguarde o carregamento do perfil.');
  const checkedPlan=plan===undefined?undefined:Budget.validatePlan(plan);
  const checkedMonths=month===undefined?undefined:Budget.validateMonths({[month]:reserve});
  const merge=meta=>({...checkedPlan?{budgetPlan:checkedPlan}:{},...checkedMonths?{budgetMonths:Budget.validateMonths({...meta.budgetMonths,...checkedMonths})}:{}});
  if(this.demo){Object.assign(this.meta,merge(this.meta));this.emit();return;}
  const context={db:this.db,user:{uid:this.user.uid,email:this.user.email,emailVerified:this.user.emailVerified},userDoc:{name:this.userDoc?.name}},ref=context.db.collection('profiles').doc(this.profile);
  await context.db.runTransaction(async tx=>{const {account,metas}=await ProfileOps.authorized(tx,context,[ref]);ProfileOps.requireAccess(context,metas[0],account);tx.update(ref,{...merge(metas[0]),...ProfileOps.stamp(context)});});
};

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={home:'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',plus:'M12 5v14M5 12h14',wallet:'M20 8V5H4a1 1 0 0 0 0 4h17v11H4a2 2 0 0 1-2-2V7m19 5h-5v5h5',chart:'M4 3v17h17M8 15v-4m5 4V7m5 8V4',target:'M21 12a9 9 0 1 1-9-9m5 2-5 7m0-5a5 5 0 1 0 5 5m0-9v4h4',calendar:'M5 5h14v16H5ZM8 3v4m8-4v4M5 10h14',chat:'M4 4h16v12H9l-5 4Zm4 5h8m-8 3h5',settings:'M9 4 10 2h4l1 2 3 2 2 1v4l-1 1 1 2v4l-2 1-3 2h-5l-1-2-3-1-2-1v-4l1-1-1-2V7l2-1Zm6 8a3 3 0 1 0-6 0 3 3 0 0 0 6 0',help:'M9 9a3 3 0 1 1 4 3c-1 1-1 1-1 3m0 3h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',logout:'M9 3H3v18h6m5-14 5 5-5 5m-7-5h12',moon:'M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11',income:'M7 7h10v10M17 7 7 17',expense:'M7 7v10h10M7 17 17 7',check:'M5 12l4 4L19 6',clock:'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',food:'M4 3v7h6V3M7 3v18m11-18v18m0-18c-5 5-5 10 0 10',health:'M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z',car:'m3 10 3-6h12l3 6v9h-3v-3H6v3H3Zm0 0h18M6 13h2m8 0h2',education:'m2 8 10-5 10 5-10 5Zm4 3v6c4 3 8 3 12 0v-6m4-3v9',edit:'m4 15 11-11 5 5L9 20H4Zm9-9 5 5',trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',upload:'M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5',search:'M21 21l-5-5m2-6a8 8 0 1 1-16 0 8 8 0 0 1 16 0',more:'M5 12h.01M12 12h.01M19 12h.01',spark:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z',shield:'m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Zm-4 10 3 3 5-6',leaf:'M4 20C3 10 8 3 21 3c0 13-7 18-15 14M4 20l11-11',print:'M6 8V3h12v5M6 17H3V8h18v9h-3M6 14h12v8H6Z'};
const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.wallet}"/></svg>`;
const nav=[['inicio','Início','home'],['lancamentos','Lançamentos','plus'],['relatorios','Relatórios','chart'],['acertos','Acertos','users'],['metas','Metas','target'],['ano','Meu ano','calendar']];
const state={page:location.hash.slice(1)||'inicio',month:Money.today().slice(0,7),year:Money.today().slice(0,4),type:'despesa',editId:null,search:'',category:'Todas',filterType:'todos',authMode:'login',busy:false};
const incomeCats=['Salário','Reembolso Corporativo','Freelance/Extra','Investimentos','Outros'],expenseCats=['Moradia','Alimentação','Transporte','Saúde','Educação','Lazer','Assinaturas','Viagem Corporativa','Outros'],payments=['Pix','Débito','Cartão de Crédito','Boleto','Dinheiro','Transferência'];
const fmt=Money.format,sum=rows=>rows.reduce((a,r)=>a+Money.cents(r.value),0)/100;
/* A recurring bill is one record; monthly occurrences are calculated only for the requested window. */
const Recurrence={
  maxWindow:1200,
  is:d=>!!d&&d.recurrence?.frequency==='monthly',
  monthIndex(value){
    if(typeof value!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))return null;
    const year=Number(value.slice(0,4));return year>=1?year*12+Number(value.slice(5,7))-1:null;
  },
  monthKey(index){return String(Math.floor(index/12)).padStart(4,'0')+'-'+String(index%12+1).padStart(2,'0');},
  daysInMonth(year,month){return [31,year%4===0&&(year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31][month-1];},
  validate(d){
    if(!this.is(d)||typeof d.recurrence!=='object'||Array.isArray(d.recurrence))return 'Escolha uma repetição mensal válida.';
    if(typeof d.data!=='string'||!Money.validDate(d.data)||this.monthIndex(d.data.slice(0,7))===null)return 'Confira a data da primeira cobrança.';
    const amount=Number(d.valor);
    if(d.valor===null||typeof d.valor==='boolean'||!Number.isFinite(amount)||amount<0.01||amount>999999999||Math.abs(amount*100-Math.round(amount*100))>0.001)return 'Confira o valor mensal da despesa.';
    const first=this.monthIndex(d.data.slice(0,7)),until=d.recurrence.until??'';
    if(until!==''&&(this.monthIndex(until)===null||this.monthIndex(until)<first))return 'O último mês deve ser igual ou posterior à primeira cobrança.';
    if(d.recurrencePaid!==undefined&&(!Array.isArray(d.recurrencePaid)||d.recurrencePaid.length>12000))return 'A lista de pagamentos recorrentes é inválida.';
    for(const key of d.recurrencePaid||[]){const index=this.monthIndex(key);if(index===null||index<first||(until!==''&&index>this.monthIndex(until)))return 'Confira os meses já pagos desta despesa recorrente.';}
    return '';
  },
  occurrences(d,fromMonth,toMonth){
    if(!this.is(d)||this.validate(d))return [];
    const from=this.monthIndex(fromMonth),to=this.monthIndex(toMonth);
    if(from===null||to===null||to<from||to-from+1>this.maxWindow)return [];
    const first=this.monthIndex(d.data.slice(0,7)),until=d.recurrence.until?this.monthIndex(d.recurrence.until):to,start=Math.max(first,from),end=Math.min(until,to),day=Number(d.data.slice(8,10)),paid=new Set(d.recurrencePaid||[]),rows=[];
    for(let index=start;index<=end;index++){
      const key=this.monthKey(index),year=Math.floor(index/12),month=index%12+1,date=key+'-'+String(Math.min(day,this.daysInMonth(year,month))).padStart(2,'0');
      rows.push({...d,type:'despesa',date,value:Money.cents(d.valor)/100,idx:index-first,paid:paid.has(key),total:1,recurring:true,monthKey:key});
    }
    return rows;
  },
  requireOccurrence(d,monthKey){
    const error=this.validate(d);if(error)throw new Error(error);
    if(!this.occurrences(d,monthKey,monthKey).length)throw new Error('Esse mês não faz parte desta despesa recorrente.');
  },
  async markPaid(id,monthKey){
    Store.assertEdit();
    if(typeof id!=='string'||!id||id.includes('/')||id.length>1500)throw new Error('Despesa não encontrada.');
    if(this.monthIndex(monthKey)===null)throw new Error('Confira o mês do pagamento.');
    const profile=Store.profile,user=Store.user?{uid:Store.user.uid,email:Store.user.email,emailVerified:Store.user.emailVerified}:null,db=Store.db;
    const current=Store.data.despesas.find(d=>d.id===id);
    if(!current)throw new Error('Despesa não encontrada. Atualize a página.');
    this.requireOccurrence(current,monthKey);
    if(Store.demo){
      current.recurrencePaid=[...new Set([...(current.recurrencePaid||[]),monthKey])].sort();Store.emit();return;
    }
    if(!profile||!user?.uid||!db)throw new Error('Entre novamente para confirmar o pagamento.');
    const profileRef=db.collection('profiles').doc(profile),itemRef=profileRef.collection('despesas').doc(id),accountRef=db.collection('users').doc(user.uid);
    await db.runTransaction(async tx=>{
      const account=await tx.get(accountRef),meta=await tx.get(profileRef),item=await tx.get(itemRef);
      if(!account.exists||!meta.exists)throw new Error('Seu acesso a este perfil já não está disponível.');
      const accountData=account.data(),profileData=meta.data(),context={user,db};await Privacy.loadFreshFamily(tx,context,profileData);
      if(accountData.status!=='approved'||!Privacy.canEdit(context,profileData))throw new Error('Você precisa de permissão para editar este perfil.');
      if(!item.exists)throw new Error('Esta despesa já foi excluída.');
      const fresh=item.data();this.requireOccurrence(fresh,monthKey);
      const months=[...new Set([...(fresh.recurrencePaid||[]),monthKey])].sort();
      if(months.length>12000)throw new Error('Limite de meses pagos atingido.');
      if(!(fresh.recurrencePaid||[]).includes(monthKey))tx.update(itemRef,{recurrencePaid:months});
    });
  }
};

/* A family settlement is a personal expense and, when authorized, a matching receivable.
   Both documents change atomically. A settlement is not the card issuer's payment status. */
const Family={
  fields:['desc','cat','valor','data','forma','parcelas','jaPagas','reembolsavel','reembolsado','purchaseDate','recurrence','recurrencePaid','budgetGroup'],
  is:record=>!!record?.family&&['pay','receive'].includes(record.family.direction),
  linked:record=>!!record?.family?.linkedRecordId,
  validId:value=>typeof value==='string'&&value.length>0&&value.length<=1500&&!value.includes('/'),
  validate(record,{pending=true}={}){
    if(record.family===undefined||record.family===null)return '';
    const f=record.family;
    if(typeof f!=='object'||Array.isArray(f)||!['pay','receive'].includes(f.direction))return 'Escolha se você vai repassar ou receber o dinheiro.';
    if(typeof f.person!=='string'||!f.person.trim()||f.person.length>70)return 'Informe o nome da pessoa, com até 70 caracteres.';
    if(f.card!==undefined&&(typeof f.card!=='string'||f.card.length>60))return 'Use um nome de cartão com até 60 caracteres.';
    const hasProfile=f.linkedProfileId!==undefined,hasRecord=f.linkedRecordId!==undefined,hasAgreement=f.agreementId!==undefined;
    if([['linkedProfileId',hasProfile],['linkedRecordId',hasRecord],['agreementId',hasAgreement]].some(([key,has])=>has&&!this.validId(f[key])))return 'O vínculo do acerto é inválido. Reabra o lançamento.';
    if((hasRecord||hasAgreement)&&!(hasProfile&&hasRecord&&hasAgreement))return 'O vínculo do acerto está incompleto. Reabra o lançamento.';
    if(hasProfile&&!hasRecord&&!pending)return 'O vínculo do acerto está incompleto. Reabra o lançamento.';
    if(typeof record.valor!=='number'||!Number.isFinite(record.valor)||record.valor<0.01||record.valor>999999999||Math.abs(record.valor*100-Math.round(record.valor*100))>0.001)return 'Confira o valor da sua parte no acerto.';
    if(!Money.validDate(record.data)||!Number.isInteger(record.parcelas)||record.parcelas<1||record.parcelas>600||!Number.isInteger(record.jaPagas)||record.jaPagas<0||record.jaPagas>record.parcelas)return 'Confira as datas e as parcelas do acerto.';
    if(record.purchaseDate&&(!Money.validDate(record.purchaseDate)||record.purchaseDate>record.data))return 'Confira a data de compra do acerto.';
    if(Recurrence.is(record))return Recurrence.validate(record);
    if(record.recurrence!==undefined&&record.recurrence!==null)return 'A repetição do acerto é inválida.';
    return '';
  },
  requireValid(record,options){const error=this.validate(record,options);if(error)throw new Error(error);if(Recurrence.is(record)){const recurrenceError=Recurrence.validate(record);if(recurrenceError)throw new Error(recurrenceError);}},
  manual(family){return{direction:family.direction,person:family.person,card:family.card||''};},
  clean(record){const result={};for(const [key,value] of Object.entries(record))if(key!=='id'&&value!==undefined)result[key]=structuredClone(value);return result;},
  context(){
    Store.assertEdit();
    if(!Store.profile||!Store.user?.uid)throw new Error('Entre novamente para registrar o acerto.');
    const context={profile:Store.profile,user:{uid:Store.user.uid,email:Store.user.email,emailVerified:Store.user.emailVerified},userDoc:{...Store.userDoc},db:Store.db,demo:Store.demo,spaces:Store.demoSpaces};
    if(context.demo)context.db=this.demoDb(context);
    if(!context.db)throw new Error('Não foi possível conectar. Tente novamente.');
    return context;
  },
  demoDb(context){
    const ref=path=>({path,id:path.split('/').at(-1),collection:key=>ref(path+'/'+key),doc:id=>ref(path+'/'+(id||crypto.randomUUID()))});
    return{collection:key=>ref(key),runTransaction:async callback=>{
      const read=path=>{const [group,id,cat,row]=path.split('/');if(group==='users')return id===context.user.uid?{...context.userDoc,status:context.userDoc.status||'approved'}:undefined;const space=context.spaces?.[id];return cat?space?.data[cat]?.find(item=>item.id===row):space?.meta;},writes=[];
      const tx={get:async target=>{const data=read(target.path);return{exists:data!==undefined,data:()=>structuredClone(data)};},set:(target,data)=>writes.push({target,data:this.clean(data),mode:'set'}),update:(target,data)=>writes.push({target,data:this.clean(data),mode:'update'}),delete:target=>writes.push({target,mode:'delete'})};
      const result=await callback(tx);
      // Apply only after every authorization and reciprocal-link check has succeeded.
      for(const {target,data,mode} of writes){const [,profile,cat,id]=target.path.split('/'),space=context.spaces[profile];if(!cat){Object.assign(space.meta,data);continue;}const rows=space.data[cat],index=rows.findIndex(row=>row.id===id);if(mode==='delete'){if(index>=0)rows.splice(index,1);}else if(index>=0)rows[index]={...(mode==='update'?rows[index]:{}),...data,id};else rows.push({...data,id});}
      if(Store.demo&&Store.demoSpaces===context.spaces&&Store.user?.uid===context.user.uid){const active=context.spaces[Store.profile];if(active){Store.meta=active.meta;Store.data=active.data;}Store.emit();}
      return result;
    }};
  },
  mirror(source,target){
    const mirrored={...target};for(const key of this.fields){if(Object.hasOwn(source,key))mirrored[key]=structuredClone(source[key]);else delete mirrored[key];}
    mirrored.family={...target.family,card:source.family.card||''};return mirrored;
  },
  async change(operation,id,input={},payment={}){
    const context=this.context();
    if(operation!=='save'&&!id)throw new Error('Lançamento não encontrado.');
    if(id!=null&&!this.validId(id))throw new Error('Lançamento não encontrado.');
    const db=context.db,sourceRef=db.collection('profiles').doc(context.profile),sourceItem=sourceRef.collection('despesas').doc(id||undefined),proposed=this.clean(input);
    return db.runTransaction(async tx=>{
      const {account,metas}=await ProfileOps.authorized(tx,context,[sourceRef]);ProfileOps.requireAccess(context,metas[0],account);
      const snapshot=id?await tx.get(sourceItem):null;
      if(id&&!snapshot.exists)throw new Error('Este lançamento já foi excluído. Atualize a página.');
      const current=snapshot?.data()||{},existing=current.family,wasLinked=this.linked(current);
      if(existing)this.requireValid(current,{pending:false});
      let source=operation==='save'?{...current,...proposed}:this.clean(current);
      if(wasLinked){
        const supplied=proposed.family;
        if(operation==='save'&&Object.hasOwn(proposed,'family')&&(!supplied||supplied.direction!==existing.direction||supplied.linkedProfileId!==existing.linkedProfileId||(supplied.linkedRecordId!==undefined&&supplied.linkedRecordId!==existing.linkedRecordId)||(supplied.agreementId!==undefined&&supplied.agreementId!==existing.agreementId)))throw new Error('Não é possível trocar a pessoa ou o perfil de um acerto sincronizado. Desvincule o acerto primeiro.');
        source.family={...existing,...(supplied||{})};
      }else if(operation==='save'&&(source.family?.linkedRecordId||source.family?.agreementId))throw new Error('Este vínculo não pertence ao lançamento. Crie um novo acerto.');
      const targetId=wasLinked?existing.linkedProfileId:source.family?.linkedProfileId;
      let targetRef=null,targetItem=null,target=null,originalTarget=null;
      if(targetId){
        if(!this.validId(targetId)||targetId===context.profile)throw new Error('Escolha outro perfil para sincronizar o acerto.');
        targetRef=db.collection('profiles').doc(targetId);
        const targetSnapshot=await tx.get(targetRef);if(!targetSnapshot.exists)throw new Error('O perfil da outra pessoa já não existe.');
        await Privacy.loadFreshFamily(tx,context,targetSnapshot.data());ProfileOps.requireAccess(context,targetSnapshot.data(),account);
        targetItem=targetRef.collection('despesas').doc(wasLinked?existing.linkedRecordId:undefined);
        if(wasLinked){
          const paired=await tx.get(targetItem);if(!paired.exists)throw new Error('O outro lado do acerto não foi encontrado. Nenhum dos lados foi alterado.');
          target=paired.data();originalTarget=structuredClone(target);
          if(target.family?.linkedProfileId!==context.profile||target.family?.linkedRecordId!==sourceItem.id||target.family?.agreementId!==existing.agreementId||target.family?.direction!==(existing.direction==='pay'?'receive':'pay'))throw new Error('Os vínculos do acerto não conferem. Nenhum dos lados foi alterado.');
        }
      }
      if(operation==='remove'){
        tx.delete(sourceItem);if(targetItem)tx.delete(targetItem);
      }else{
        if(operation==='detach'){
          if(!wasLinked)throw new Error('Este acerto já é controlado manualmente.');
          source.family=this.manual(existing);target={...target,family:this.manual(target.family)};
        }else{
          if(operation==='paid'){
            if(!this.is(source))throw new Error('Este lançamento não é um acerto familiar.');
            if(Recurrence.is(source)){
              Recurrence.requireOccurrence(source,payment.monthKey);
              source.recurrencePaid=[...new Set([...(source.recurrencePaid||[]),...(target?.recurrencePaid||[]),payment.monthKey])].sort();
            }else{
              if(!Number.isInteger(payment.idx)||payment.idx<0||payment.idx>=source.parcelas)throw new Error('Confira a parcela do repasse.');
              source.jaPagas=Math.max(source.jaPagas||0,target?.jaPagas||0,payment.idx+1);
            }
          }
          // An old edit form must not undo a repasse registered on another device.
          if(this.is(source)&&this.is(current)){
            if(Recurrence.is(source))source.recurrencePaid=[...new Set([...(current.recurrencePaid||[]),...(source.recurrencePaid||[]),...(target?.recurrencePaid||[])])].sort();
            else source.jaPagas=Math.max(current.jaPagas||0,source.jaPagas||0,target?.jaPagas||0);
          }
          if(targetItem&&!wasLinked){
            const agreementId=crypto.randomUUID();source.family={...this.manual(source.family),linkedProfileId:targetId,linkedRecordId:targetItem.id,agreementId};
            target={family:{direction:source.family.direction==='pay'?'receive':'pay',person:String(metas[0].displayName||context.profile).slice(0,70),card:source.family.card,linkedProfileId:context.profile,linkedRecordId:sourceItem.id,agreementId}};
          }
          this.requireValid(source,{pending:false});
          if(targetItem){target=this.mirror(source,target);this.requireValid(target,{pending:false});}
        }
        if(operation==='paid'&&ProfileOps.signature(this.clean(source))===ProfileOps.signature(this.clean(current))&&(!targetItem||ProfileOps.signature(this.clean(target))===ProfileOps.signature(this.clean(originalTarget))))return{id:sourceItem.id,linked:!!targetItem,linkedProfileId:targetId||''};
        tx.set(sourceItem,this.clean(source));if(targetItem)tx.set(targetItem,this.clean(target));
      }
      if(!context.demo){const stamp=ProfileOps.stamp(context);tx.update(sourceRef,stamp);if(targetRef)tx.update(targetRef,stamp);}
      return{id:sourceItem.id,linked:!!targetItem&&operation!=='detach',linkedProfileId:targetId||''};
    });
  },
  saveRecord(type,record,id){if(type!=='despesa')return this.original.saveRecord.call(Store,type,record,id);return this.change('save',id,record);},
  removeRecord(type,id){if(type!=='despesa')return this.original.removeRecord.call(Store,type,id);return this.change('remove',id);},
  markPaid(id,idx,monthKey){return this.change('paid',id,{}, {idx,monthKey});},
  detach(id){return this.change('detach',id);},
  install(){if(this.original)return;this.original={saveRecord:Store.saveRecord,removeRecord:Store.removeRecord};Store.saveRecord=(type,record,id)=>this.saveRecord(type,record,id);Store.removeRecord=(type,id)=>this.removeRecord(type,id);}
};

Family.install();
const allRows=(fromMonth,toMonth)=>{
  const horizon=[Money.addMonth(Money.today(),1).slice(0,7),Money.addMonth(state.month+'-01',1).slice(0,7),state.year+'-12'].sort().at(-1);
  const recurring=d=>{const last=toMonth||horizon,first=fromMonth||d.data.slice(0,7);let start=first,rows=[];
    while(start<=last){const end=[Money.addMonth(start+'-01',1199).slice(0,7),last].sort()[0];rows.push(...Recurrence.occurrences(d,start,end));if(end===last)break;start=Money.addMonth(end+'-01',1).slice(0,7);}return rows;};
  return [...Store.data.receitas.filter(r=>Money.validDate(r.data)).map(r=>({...r,type:'receita',date:r.data,value:Number(r.valor),paid:true})),...Store.data.despesas.filter(d=>d.family?.direction!=='receive'&&Money.validDate(d.data)).flatMap(d=>Recurrence.is(d)?recurring(d):Money.occurrences(d))];
};
const monthRows=(month=state.month)=>allRows(month,month).filter(r=>r.date.startsWith(month));
const totals=(rows=monthRows())=>{const income=sum(rows.filter(r=>r.type==='receita')),expense=sum(rows.filter(r=>r.type==='despesa'));return{income,expense,balance:Math.round((income-expense)*100)/100,pending:sum(rows.filter(r=>r.type==='despesa'&&!r.paid)),paid:sum(rows.filter(r=>r.type==='despesa'&&r.paid))};};
const monthName=(m,short=false)=>new Date(m+'-02T12:00:00').toLocaleDateString('pt-BR',{month:short?'short':'long',...(short?{}:{year:'numeric'})});
const pct=g=>Money.cents(g.saved)>=Money.cents(g.target)?100:Math.max(0,Math.min(99,Math.floor((g.saved||0)/g.target*100)));
const profileOptions=()=>Store.profiles.map(p=>`<option value="${esc(p.id)}" ${p.id===Store.profile?'selected':''}>${esc(p.id===Store.profile?(Store.meta.displayName||p.displayName||p.id):(p.displayName||p.id))}</option>`).join('');
const profileName=()=>Store.meta.displayName||Store.profile;
const accountIsAdmin=()=>!Store.demo&&Store.userDoc?.role==='admin'&&Store.userDoc?.status==='approved';
const accountRoleLabel=()=>Store.demo?'DEMO':accountIsAdmin()?'ADMIN':'Membro';
const goals=()=>Store.meta.goalsV2||[];
const catIcon=c=>({'Moradia':'home','Alimentação':'food','Transporte':'car','Saúde':'health','Educação':'education','Salário':'wallet'}[c]||'wallet');
const catClass=c=>c==='Alimentação'?'food':c==='Saúde'?'health':'';
const options=(list,sel)=>[...new Set(list)].map(v=>`<option value="${esc(v)}" ${v===sel?'selected':''}>${esc(v)}</option>`).join('');
function paintIcons(root=document){root.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));}
function toast(s){$('#toast').textContent=s;$('#toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('visible'),4200);}
function pageTop(title,sub,extra=''){return `<div class="page-top"><div><h1>${title}</h1><p>${sub}</p></div><div class="page-actions">${extra}</div></div>`;}
function monthPicker(){return `<label class="month-picker">${icon('calendar')}<input type="month" id="month-picker" aria-label="Mês dos lançamentos e relatórios" value="${state.month}"></label>`;}
function addButton(){return `<button class="button primary" data-action="new-expense">${icon('plus')} Novo lançamento</button>`;}
function metric(label,value,kind,note,ic){return `<div class="metric ${kind}"><div class="metric-top"><span>${label}</span><span class="metric-icon">${icon(ic)}</span></div><strong>${fmt(value)}</strong><small>${note}</small></div>`;}
function empty(title,copy,action=''){return `<div class="empty">${icon('leaf')}<h3>${title}</h3><p>${copy}</p>${action}</div>`;}
function badges(r){if(r.family)return `<span class="badge ${r.paid?'paid':r.date<Money.today()?'late':'pending'}">${r.paid?'Acertado':r.date<Money.today()?'Repasse atrasado':'A repassar'}</span>`;return r.type==='receita'?'<span class="badge paid">Recebido</span>':r.paid?'<span class="badge paid">Pago</span>':r.date<Money.today()?'<span class="badge late">Em atraso</span>':'<span class="badge pending">A pagar</span>';}
function miniGoal(g){return `<div class="goal-mini"><div class="goal-mini-top"><div class="goal-title"><span class="goal-emoji">${esc(g.emoji||'🎯')}</span><b>${esc(g.name)}</b></div><b>${pct(g)}%</b></div><div class="progress" role="progressbar" aria-label="${esc(g.name)}" aria-valuenow="${pct(g)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct(g)}%"></span></div><div class="goal-meta"><span><b>${fmt(g.saved)}</b> guardados</span><span>de ${fmt(g.target)}</span></div></div>`;}
function transaction(r,actions=false){return `<div class="transaction-row"><span class="row-icon ${r.type==='receita'?'income':catClass(r.cat)}">${icon(r.type==='receita'?'income':catIcon(r.cat))}</span><div class="row-main"><b>${esc(r.desc)}</b><small>${esc(r.cat)} · ${esc(Money.date(r.date))}${r.total>1?' · '+(r.idx+1)+'/'+r.total:''}${r.recurring?' · Todo mês':''}</small></div><div class="row-value"><b class="${r.type==='receita'?'positive':''}">${r.type==='receita'?'+ ':''}${fmt(r.value)}</b>${badges(r)}</div>${actions?rowActions(r):''}</div>`;}
function rowActions(r){return `<div class="transaction-actions">${Store.editable?`<button data-action="edit-record" data-type="${r.type}" data-id="${esc(r.id)}" aria-label="Editar ${esc(r.desc)}">${icon('edit')}</button><button data-action="delete-record" data-type="${r.type}" data-id="${esc(r.id)}" aria-label="Excluir ${esc(r.desc)}">${icon('trash')}</button>`:''}</div>`;}
function chart(months,annual=false){const values=months.map(m=>totals(monthRows(m))),max=Math.max(100,...values.flatMap(v=>[v.income,v.expense])),w=640,h=210,left=80,bottom=177,top=12,plot=w-left-15,step=plot/months.length;let svg=`<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Receitas e despesas de ${esc(monthName(months[0]))} a ${esc(monthName(months.at(-1)))}"><title>Receitas e despesas mensais em reais. Consulte os valores no resumo e no relatório.</title>`;for(let i=0;i<4;i++){const y=top+(bottom-top)*i/3;svg+=`<line class="axis" x1="${left}" y1="${y}" x2="${w-8}" y2="${y}"/><text x="0" y="${y+3}">${Math.round(max*(1-i/3)/1000*10)/10} mil</text>`;}values.forEach((v,i)=>{const x=left+step*(i+.5),bw=Math.min(annual?12:23,step*.26),a=(bottom-top)*v.income/max,b=(bottom-top)*v.expense/max;svg+=`<rect x="${x-bw-3}" y="${bottom-a}" width="${bw}" height="${a}" rx="3" fill="#2e5372"><title>${monthName(months[i])}: receitas ${fmt(v.income)}</title></rect><rect x="${x+3}" y="${bottom-b}" width="${bw}" height="${b}" rx="3" fill="#e8797e"><title>${monthName(months[i])}: despesas ${fmt(v.expense)}</title></rect><text x="${x}" y="202" text-anchor="middle">${monthName(months[i],true).replace('.','')}</text>`;});return svg+'</svg>';}
function homePage(){const t=totals(),gs=goals(),saved=gs.reduce((a,g)=>a+Number(g.saved||0),0),months=Array.from({length:6},(_,i)=>Money.addMonth(state.month+'-01',i-5).slice(0,7)),due=monthRows().filter(r=>r.type==='despesa'&&!r.paid).sort((a,b)=>a.date.localeCompare(b.date));return `${pageTop('Cada plano começa com cuidado.','Uma visão tranquila das finanças da sua família.',monthPicker()+addButton())}<section class="welcome"><div><span class="eyebrow">SEU COMPANHEIRO DE CONQUISTAS</span><h2>Oi, família! Cada passo<br>aproxima um sonho.</h2><p>${gs.length?`Vamos cuidar do presente e acompanhar os próximos planos?`:'Eu sou o Catatau. Posso ajudar a organizar seus gastos e transformar os planos da família em metas.'}</p><button class="text-button" data-action="catatau">Ver as dicas do Catatau ${icon('chat')}</button></div><div class="mascot-stage"><span class="hello-bubble">Pode contar comigo!</span><img src="${CATATAU_IMAGE}" alt="Catatau, seu castor companheiro de planos"></div></section><div class="metrics">${metric('Receitas do mês',t.income,'income','Tudo o que entrou neste mês','income')}${metric('Despesas do mês',t.expense,'expense','Pagas e previstas para o mês','expense')}${metric('Saldo previsto',t.balance,'balance','Receitas menos todas as despesas','wallet')}${metric('Guardado em metas',saved,'goal',gs.length+' planos para o futuro','target')}</div><div class="content-grid"><section class="card"><div class="card-head"><div><h2>Um olhar para a sua evolução</h2><p>Receitas e despesas nos últimos 6 meses</p></div><a class="text-button" href="#relatorios">Ver relatório</a></div><div class="legend"><span><i></i> Receitas</span><span><i class="coral"></i> Despesas</span></div>${chart(months)}<div class="chart-summary"><span>Em ${esc(monthName(state.month,true))}, o saldo previsto é</span><b class="${t.balance<0?'negative':''}">${fmt(t.balance)}</b></div></section><section class="card"><div class="card-head"><div><h2>Contas para acompanhar</h2><p>Vencimentos do mês selecionado</p></div><span class="badge pending">${due.length} a pagar</span></div>${due.length?due.slice(0,3).map(r=>transaction(r)).join(''):empty('Tudo em dia por aqui','Nenhuma despesa pendente neste mês.')}<div class="due-footer">${icon('clock')} ${due.length?'Reserve '+fmt(t.pending)+' para essas contas.':'Continue registrando suas despesas.'}</div></section></div><div class="content-grid"><section class="card"><div class="card-head"><div><h2>Últimos lançamentos</h2><p>Os movimentos mais recentes do mês</p></div><a class="text-button" href="#lancamentos">Ver lançamentos</a></div>${monthRows().length?monthRows().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,3).map(r=>transaction(r)).join(''):empty('Seu novo começo','Registre uma receita ou despesa para começar.',addButton())}</section><section class="card"><div class="card-head"><div><h2>Sonhos que ganham forma</h2><p>Uma conquista de cada vez</p></div><a class="text-button" href="#metas">Ver metas</a></div>${gs.length?gs.slice(0,2).map(miniGoal).join(''):empty('Qual é o próximo plano?','Uma viagem, a reserva ou um novo cantinho.',`<a class="button secondary" href="#metas">Criar uma meta</a>`)}</section></div>`;}
function render(){
  syncCatatauContext();
  $('#catatau-launcher').hidden=Store.screen!=='app';
  if(Store.screen!=='app'){$('#modal').close();$('#modal-content').innerHTML='';closeCatatau(false);$('#chat-answer').textContent='';}
  if(render.profile!==Store.profile){$('#modal').close();$('#modal-content').innerHTML='';closeCatatau(false);state.editId=null;state.familyDraft=false;state.category='Todas';state.search='';render.wasRendered=false;render.profile=Store.profile;}
  $('#boot').hidden=!Store.loading||Store.screen==='app';$('#auth').hidden=Store.screen!=='auth';$('#app').hidden=Store.screen!=='app';
  if(Store.screen==='auth'){if(Store.error){$('#auth-error').hidden=false;$('#auth-error').textContent=Store.error;}return;}
  if(['pending','provisioning','loading'].includes(Store.screen)){renderAccountGate();return;}
  if(Store.screen!=='app')return;
  const roleButton=$('#account-role');roleButton.textContent=accountRoleLabel();roleButton.classList.toggle('is-admin',accountIsAdmin());roleButton.setAttribute('aria-label','Seu acesso: '+accountRoleLabel()+'. Abrir Família e ajustes');roleButton.title=accountIsAdmin()?'Administrador da plataforma: gerencia contas; finanças exigem compartilhamento':Store.demo?'Demonstração com dados fictícios':'Conta de membro da família';
  if(!nav.some(n=>n[0]===state.page))state.page='inicio';document.title=nav.find(n=>n[0]===state.page)[1]+' · 4J Finance';
  $('#demo-banner').hidden=!Store.demo;$('#profile').innerHTML=profileOptions();$('#user-name').textContent=Store.userDoc?.name||'Sua família';$('#user-avatar').textContent=(Store.userDoc?.name||'F').slice(0,1).toUpperCase();$('#save-status').textContent=Store.demo?'Modo demonstração':Store.loading?'Carregando...':Store.error?'Verificar conexão':'Conectado à sua conta';$('#header-profile').textContent=profileName()||'Seu espaço';$('#crumb').textContent=nav.find(n=>n[0]===state.page)[1];
  for(const id of ['side-nav','bottom-nav'])$('#'+id).innerHTML=nav.map(([key,title,ic])=>`<a href="#${key}" aria-label="${title}" class="nav-link ${state.page===key?'active':''}" ${state.page===key?'aria-current="page"':''}>${icon(ic)}<span>${id==='bottom-nav'&&key==='lancamentos'?'Lançar':title}</span></a>`).join('');
  if(Store.error){$('#main').innerHTML=pageTop('Vamos reconectar seu espaço','Seus registros continuam na sua conta.')+empty('Não foi possível carregar',esc(Store.error),'<button class="button primary" data-action="reload">Tentar novamente</button>');return;}
  if(!Store.profile){$('#main').innerHTML=pageTop('Bem-vindo à sua nova organização.','Comece criando um perfil para suas finanças.')+empty('Um espaço para a família','Dê um nome ao seu primeiro perfil.', '<button class="button primary" data-action="create-profile">Criar perfil</button>');return;}
  const pages={inicio:homePage,lancamentos:typeof entriesPage==='function'?entriesPage:homePage,relatorios:typeof reportsPage==='function'?reportsPage:homePage,acertos:familyPage,metas:typeof goalsPage==='function'?goalsPage:homePage,ano:typeof yearPage==='function'?yearPage:homePage};
  if(Store.loading){$('#main').innerHTML='<div class="loading-inline" role="status">Carregando os registros da família...</div>';render.wasRendered=false;return;}
  const focus=document.activeElement;const isTyping=(focus&&$('#main').contains(focus)&&/INPUT|SELECT|TEXTAREA/.test(focus.tagName))||(state.page==='lancamentos'&&!!$('#entry-form'));
  if(!isTyping||!render.wasRendered){$('#main').innerHTML=pages[state.page]();render.wasRendered=true;}paintIcons();if(state.page==='lancamentos'){syncEntrySchedule();syncFamilyFields();}
}
window.addEventListener('finance-update',render);
window.addEventListener('hashchange',()=>{state.page=location.hash.slice(1)||'inicio';render.wasRendered=false;render();window.scrollTo({top:0});$('#main').focus({preventScroll:true});});
document.addEventListener('change',e=>{if(e.target.id==='month-picker'){state.month=e.target.value||Money.today().slice(0,7);state.category='Todas';e.target.blur();render();}if(e.target.id==='profile')Store.selectProfile(e.target.value);});
document.addEventListener('click',e=>{const el=e.target.closest('[data-action]');if(!el)return;handleAction(el.dataset.action,el);});
function handleAction(action,el){if(action==='new-expense'){state.familyDraft=false;state.type='despesa';state.editId=null;location.hash='lancamentos';render.wasRendered=false;render();setTimeout(()=>$('#entry-amount')?.focus(),0);}if(action==='logout')Store.logout();if(action==='reload')location.reload();if(action==='text-size'){document.body.classList.toggle('large-text');localStorage.setItem('4j-large-text',document.body.classList.contains('large-text')?'1':'0');}if(action==='theme'){document.body.classList.toggle('dark');localStorage.setItem('dashTheme',document.body.classList.contains('dark')?'dark':'light');}if(action==='close-modal')$('#modal').close();if(action==='catatau')openCatatau();if(action==='toggle-catatau'){$('#catatau-panel').hidden?openCatatau():closeCatatau();}if(action==='close-catatau')closeCatatau();if(typeof extendedAction==='function')extendedAction(action,el);}
function closeCatatau(restoreFocus=true){const wasOpen=!$('#catatau-panel').hidden;$('#catatau-panel').hidden=true;$('#catatau-launcher').setAttribute('aria-expanded','false');$('#catatau-launcher').setAttribute('aria-label','Abrir Catatau, seu assistente');$('#catatau-launcher').title='Abrir Catatau';if(restoreFocus&&wasOpen&&!$('#catatau-launcher').hidden)$('#catatau-launcher').focus({preventScroll:true});}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#catatau-panel').hidden){e.preventDefault();closeCatatau();}});
/* Catatau: consultas locais, sem serviços de IA ou envio de mensagens. */
const catatauNormalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9\s-]/g,' ').replace(/\s+/g,' ').trim();
function catatauReply(question,context){
  const q=catatauNormalize(question),{month,today,rows:all,plans}=context;
  const rows=all.filter(r=>r.date.startsWith(month)),t=totals(rows),expenses=rows.filter(r=>r.type==='despesa');
  const period=monthName(month),money=v=>Money.format(v),add=(items)=>items.reduce((s,r)=>s+Money.cents(r.value),0)/100;
  const list=items=>items.slice(0,5).map(r=>`• ${r.desc}: ${money(r.value)} · ${Money.date(r.date)}${r.total>1?` · parcela ${r.idx+1}/${r.total}`:''}`).join('\n')+(items.length>5?`\nE mais ${items.length-5}; consulte os demais em Relatórios.`:'');
  const answer=(text,scope=period)=>({text,scope});
  if(/\b(acerto|acertos|repassar|repasse|repasses|porto|cartao de|cartao do|cartao da|receber da familia)\b/.test(q))return answer(familyAdvice(month),period+' · Acertos da família');
  if(/\b(orcamento|desvio|desvios|desviando|controle|controlando|comportando|fixa|fixas|variavel|variaveis|reserva|reservas|50\s*[/%]|30\s*[/%]|20\s*[/%])\b/.test(q))return answer(Budget.advice(Budget.analyze(rows,context.budgetMeta||{},month)),period+' · Seu orçamento');
  if(/\b(recorrente|recorrentes|recorrencia|todo mes|mensalidade|mensalidades)\b/.test(q))return answer('Em Lançamentos, escolha Despesa → Todo mês. Informe o valor mensal (por exemplo, VIVO: R$ 135), o primeiro vencimento e se quer repetir sem prazo ou até um mês específico. A cobrança aparecerá automaticamente em cada mês. Em Relatórios, marque cada mensalidade como paga separadamente. Para encerrar, edite a despesa e escolha o último mês.','Despesas recorrentes');
  if(/\b(compra antiga|compras antigas|parcelado antigo|parcelas antigas|data da compra)\b/.test(q))return answer('Cadastre em Lançamentos → Despesa → Parcelada, sem precisar ir ao mês da compra. Informe o valor total, a data da compra (opcional), o vencimento original da primeira parcela, o total de parcelas e quantas já foram pagas. A prévia mostra a próxima parcela não paga. O relatório considera o mês de vencimento de cada parcela.','Compras anteriores');
  if(/\b(transferir|transferencia|migrar|migracao|trocar conta|outra conta|restaurar)\b/.test(q))return answer('Para levar registros a outro perfil, abra Família e ajustes → Transferir dados. Confira a prévia e o destino antes de confirmar.\n\nPara outra conta: Baixar cópia dos dados → sair e entrar na outra conta → criar ou selecionar o perfil de destino → Restaurar cópia. A restauração adiciona registros, sem substituir os existentes; confira a prévia para evitar duplicatas. Cada operação aceita até 180 lançamentos.\n\nEu apenas explico o caminho; não transfiro dados nem dinheiro pelo chat.','Guia do app');
  if(/\b(excluir|apagar|remover)\b.*\b(perfil|perfis)\b|\b(perfil|perfis)\b.*\b(excluir|apagar|remover)\b/.test(q))return answer('Em Família e ajustes, selecione o perfil e use Excluir perfil. A ação exige permissão para gerenciar o perfil e confirmação. Baixe uma cópia dos dados antes de excluir, se quiser mantê-los. Excluir um perfil não exclui sua conta de acesso.','Guia do app');
  if(/\b(backup|copia|exportar|baixar|planilha|pdf)\b/.test(q))return answer('Para guardar tudo do perfil atual, abra Família e ajustes → Baixar cópia dos dados. Para recuperar essa cópia, use Restaurar cópia no perfil de destino.\n\nEm Relatórios, Baixar planilha exporta o mês com os filtros atuais. Salvar PDF abre a impressão do relatório. Guarde os arquivos em um lugar de sua confiança.','Guia do app');
  if(/\b(perfil|perfis|compartilhar|renomear|conta de acesso)\b/.test(q))return answer('Cada perfil reúne seus próprios lançamentos e metas. Troque o perfil no seletor ou em Família e ajustes. Nessa área, você pode criar perfis e, com a permissão necessária, renomear, compartilhar, transferir dados ou excluir.\n\nCompartilhar dá acesso ao mesmo perfil; transferir leva registros para outro perfil. A conta de acesso é seu login, diferente do perfil financeiro.','Guia do app');
  if(/\b(como|onde)\b.*\b(registrar|lancar|adicionar|gasto|despesa|receita|compra|parcela)\b|\b(comecar|primeiro registro|lancamento)\b/.test(q))return answer('1. Abra Lançamentos e escolha Despesa ou Receita.\n2. Preencha valor, descrição, data e categoria.\n3. Confira se a despesa já foi paga e salve.\n\nSe parcelou, escolha Parcelada e informe o valor total da compra, a data da compra (opcional), o vencimento original da primeira parcela, o número de parcelas e quantas já foram pagas. Para uma conta fixa, escolha Todo mês. O 4J organiza os meses e distribui os centavos das parcelas.','Guia do app');
  if(/\b(importar|extrato|csv)\b/.test(q))return answer('Abra Lançamentos → Importar extrato. Escolha o CSV, confira as colunas de descrição, valor, data e tipo e revise a prévia antes de importar. Reimportar o mesmo extrato pode criar duplicatas. Para um backup JSON do 4J, use Família e ajustes → Restaurar cópia.','Guia do app');
  if(/\b(quatro|4 perguntas|limite|inteligencia artificial|chatgpt|ia|quem e voce|o que voce faz|ajuda|ajudar)\b/.test(q))return answer('Sou o Catatau, assistente local do 4J. Você pode repetir as consultas quantas vezes quiser: não há limite de quatro perguntas.\n\nReconheço temas como orçamento, desvios, reserva mensal, saldo, contas atrasadas, contas a pagar, categorias, maior gasto, metas, comparação de meses, próximas parcelas e uso do app. Calculo as respostas com os registros do perfil selecionado.\n\nNão sou uma IA conversacional. Não acesso seu banco e não altero registros pelo chat. Se eu não reconhecer a pergunta, escolha uma sugestão.','Sobre o Catatau');
  if(/\b(atraso|atrasada|atrasadas|atrasado|atrasados|vencida|vencidas)\b/.test(q)){
    const due=all.filter(r=>r.type==='despesa'&&!r.paid&&r.date<today).sort((a,b)=>a.date.localeCompare(b.date));
    return answer(due.length?`Há ${due.length} conta(s) ou parcela(s) vencida(s), somando ${money(add(due))}. Incluí todos os meses registrados, até ontem.\n\n${list(due)}\n\nConfira o pagamento antes de marcar como pago.`:'Não encontrei despesas vencidas e ainda não pagas nos registros deste perfil. Contas que vencem hoje não entram como atrasadas.',`Atrasos até ${Money.date(today)}`);
  }
  if(/\b(comparar|comparacao|comparativo|anterior|aumentou|diminuiu|variacao)\b/.test(q)){
    const previous=Money.addMonth(month+'-01',-1).slice(0,7),prevRows=all.filter(r=>r.date.startsWith(previous)),prev=totals(prevRows),delta=(Money.cents(t.expense)-Money.cents(prev.expense))/100;
    if(!rows.length||!prevRows.length)return answer(`Não há registros suficientes para comparar ${monthName(previous)} e ${period}. ${!rows.length?'O mês selecionado':'O mês anterior'} está sem lançamentos; isso não significa que não houve movimentação.`);
    return answer(`Despesas: ${money(prev.expense)} em ${monthName(previous)} → ${money(t.expense)} em ${period}.\n${!delta?'Os totais de despesas são iguais.':`Variação: ${delta>0?'+':'−'}${money(Math.abs(delta))}${prev.expense?` (${(Math.abs(delta)/prev.expense*100).toLocaleString('pt-BR',{maximumFractionDigits:1})}% ${delta>0?'a mais':'a menos'})`:'. Sem base de despesas anterior para calcular porcentagem'}.`}\nReceitas: ${money(prev.income)} → ${money(t.income)}.\nSaldo previsto: ${money(prev.balance)} → ${money(t.balance)}.\n\nComparei os meses completos conforme os registros, incluindo parcelas previstas; um mês ainda em andamento pode ter menos lançamentos.`);
  }
  if(/\b(proxima|proximas|proximo|proximos|parcela|parcelas|vencimento|vencimentos)\b/.test(q)){
    const end=new Date(today+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+30);const last=end.toISOString().slice(0,10),onlyInstallments=/\b(parcela|parcelas)\b/.test(q);
    const due=all.filter(r=>r.type==='despesa'&&!r.paid&&r.date>=today&&r.date<last&&(!onlyInstallments||r.total>1)).sort((a,b)=>a.date.localeCompare(b.date));
    return answer(due.length?`Nos próximos 30 dias, contando hoje, há ${due.length} ${onlyInstallments?'parcela(s) de compras parceladas':'conta(s) ou parcela(s)'} a pagar, somando ${money(add(due))}.\n\n${list(due)}\n\nAs contas já atrasadas ficam na consulta “Contas atrasadas”.`:`Não encontrei ${onlyInstallments?'parcelas de compras parceladas':'contas ou parcelas'} pendentes nos próximos 30 dias, contando hoje. Só considero os registros deste perfil.`,`A partir de ${Money.date(today)}`);
  }
  if(/\b(meta|metas|sonho|sonhos|objetivo|objetivos|guardar|guardado)\b/.test(q)){
    if(!plans.length)return answer('Você ainda não cadastrou metas neste perfil. Abra Metas → Nova meta e informe nome, valor e prazo. Os valores guardados são registros das suas reservas; não transferem dinheiro nem alteram o saldo dos lançamentos.','Metas do perfil');
    const saved=plans.reduce((s,g)=>s+Money.cents(g.saved),0)/100;
    const lines=plans.slice(0,5).map(g=>{const remaining=Math.max(0,Money.cents(g.target)-Money.cents(g.saved))/100;if(!remaining)return `• ${g.name}: objetivo alcançado! ${money(g.saved)} registrados.`;if(!Money.validDate(g.date))return `• ${g.name}: faltam ${money(remaining)}. Confira o prazo da meta.`;const[y,m]=g.date.slice(0,7).split('-').map(Number),[cy,cm]=today.slice(0,7).split('-').map(Number),months=(y-cy)*12+m-cm+1;return `• ${g.name}: faltam ${money(remaining)}.${g.date<today?' O prazo passou; você pode ajustá-lo.':` Dividindo em ${months} mês(es), seriam ${money(Math.ceil(Money.cents(remaining)/Math.max(1,months))/100)} por mês até ${Money.date(g.date)}.`}`;});
    return answer(`${money(saved)} registrados em ${plans.length} meta(s).\n\n${lines.join('\n')}${plans.length>5?`\nE mais ${plans.length-5} meta(s) na página Metas.`:''}\n\nEssa divisão é apenas um cálculo do objetivo. O valor guardado nas metas não altera o saldo dos lançamentos.`,'Metas do perfil');
  }
  if(/\b(reembolso|reembolsos|reembolsar|reembolsado)\b/.test(q)){
    const reimb=expenses.filter(r=>r.reembolsavel&&!r.reembolsado);
    return answer(reimb.length?`${money(add(reimb))} em parcelas do mês estão marcadas como reembolsáveis e ainda não reembolsadas.\n\n${list(reimb)}\n\nO reembolso só entra nas receitas quando você registra o recebimento.`:'Não há parcelas marcadas como reembolsáveis e ainda não reembolsadas neste mês.');
  }
  if(/\b(maior|maiores)\b.*\b(gasto|gastos|despesa|despesas|compra|compras)\b/.test(q)){
    const sorted=[...expenses].sort((a,b)=>Money.cents(b.value)-Money.cents(a.value));
    return answer(sorted.length?`O maior valor de despesa no mês é ${money(sorted[0].value)}: ${sorted[0].desc}, em ${Money.date(sorted[0].date)}${sorted[0].total>1?` (parcela ${sorted[0].idx+1}/${sorted[0].total})`:''}.\n\nMaiores valores do mês:\n${list(sorted.slice(0,3))}\n\nConsiderei cada parcela que pertence ao mês, incluindo as já pagas.`:'Não há despesas registradas neste mês para identificar o maior gasto.');
  }
  if(/\b(categoria|categorias|onde gastei|para onde|alimentacao|moradia|transporte|lazer|saude|educacao|assinaturas)\b/.test(q)){
    const grouped=new Map();expenses.forEach(r=>grouped.set(r.cat||'Sem categoria',(grouped.get(r.cat||'Sem categoria')||0)+Money.cents(r.value)));
    const entries=[...grouped].sort((a,b)=>b[1]-a[1]),matched=entries.find(([name])=>catatauNormalize(name).length>2&&q.includes(catatauNormalize(name)));
    if(matched)return answer(`${matched[0]} soma ${money(matched[1]/100)} em despesas neste mês${t.expense?`, ${Math.round(matched[1]/Money.cents(t.expense)*100)}% do total`:''}. Inclui despesas pagas e previstas.`);
    return answer(entries.length?`Despesas por categoria, incluindo pagas e previstas:\n\n${entries.slice(0,6).map(([name,value])=>`• ${name}: ${money(value/100)}${t.expense?` (${Math.round(value/Money.cents(t.expense)*100)}%)`:''}`).join('\n')}${entries.length>6?`\nE mais ${entries.length-6} categoria(s) em Relatórios.`:''}\n\nTotal do mês: ${money(t.expense)}.`:'Não há despesas registradas neste mês para agrupar por categoria.');
  }
  if(/\b(pagar|pendente|pendentes|contas|boleto|boletos)\b/.test(q)){
    const due=expenses.filter(r=>!r.paid).sort((a,b)=>a.date.localeCompare(b.date));
    return answer(due.length?`Há ${due.length} conta(s) ou parcela(s) ainda não paga(s) no mês, somando ${money(t.pending)}.\n\n${list(due)}\n\nIncluí vencidas e futuras dentro do mês selecionado. Marque como pago somente após o pagamento.`:'Não há despesas pendentes registradas neste mês. Confira se todos os vencimentos foram incluídos.');
  }
  if(/\b(receita|receitas|recebi|recebido|entrou|entradas)\b/.test(q))return answer(rows.length?`As receitas registradas no mês somam ${money(t.income)} em ${rows.filter(r=>r.type==='receita').length} lançamento(s). Reembolsos e outras entradas só entram nesse total quando registrados como receita.`:'Ainda não há lançamentos neste mês. Registre as receitas recebidas para começar.');
  if(/\b(saldo|resumo|mes|gastei|gastos|despesas|orcamento|sobrou|sobra)\b/.test(q))return answer(rows.length?`Receitas: ${money(t.income)}.\nDespesas pagas e previstas: ${money(t.expense)}.\nSaldo previsto: ${money(t.balance)}.\nAinda a pagar: ${money(t.pending)}.\n\n${t.balance<0?'As despesas registradas superam as receitas.':'Todas as despesas registradas do mês já estão descontadas desse saldo.'} Esse é o saldo dos lançamentos, não o saldo da sua conta bancária.`:'Ainda não há lançamentos neste mês. Abra Lançamentos para registrar uma receita ou despesa; um mês vazio não informa o saldo da sua conta bancária.');
  if(/^(oi|ola|bom dia|boa tarde|boa noite|obrigado|obrigada|valeu)\b/.test(q))return answer('Oi! Vamos cuidar dos seus planos? Você pode perguntar “qual é meu saldo?”, “tenho contas atrasadas?” ou escolher um tema abaixo. Sou um assistente local com consultas programadas, sem IA conversacional.','Conversa local');
  return answer('Não reconheci essa pergunta. Sou um assistente local com consultas programadas, sem IA conversacional. Posso consultar orçamento, desvios, reserva mensal, saldo, atrasos, categorias, maior gasto, metas, comparação e próximas parcelas, ou explicar como usar o app.\n\nEscolha um dos temas abaixo ou tente, por exemplo: “Quais contas estão atrasadas?”.','Tema não reconhecido');
}

const catatauMemory={user:'',key:'',histories:new Map()};
const catatauSuggestions=['Como estão meus acertos da família?','Como estou no meu orçamento?','Onde estou desviando?','Como está minha reserva do mês?','Como cadastrar uma despesa recorrente?','Como registrar uma compra antiga?','Como está meu saldo?','Contas atrasadas','O que preciso pagar?','Gastos por categoria','Meu maior gasto','Como estão minhas metas?','Comparar com o mês anterior','Próximas parcelas','Quanto entrou em receitas?','Reembolsos pendentes','Como transferir dados?','Como registrar um gasto?'];
function catatauReady(){return Store.screen==='app'&&!!Store.user&&!!Store.profile&&!Store.loading&&!Store.error;}
function resetCatatau(){catatauMemory.histories.clear();catatauMemory.user='';catatauMemory.key='';$('#chat-log').replaceChildren();$('#chat-input').value='';closeCatatau(false);}
function syncCatatauContext(){
  const user=Store.screen==='app'?Store.user?.uid||'':'';
  if(user!==catatauMemory.user){resetCatatau();catatauMemory.user=user;}
  const key=user&&Store.profile?JSON.stringify([user,Store.profile]):'';
  if(catatauMemory.key!==key){catatauMemory.key=key;$('#chat-log').replaceChildren();$('#chat-input').value='';closeCatatau(false);}
  const allowed=new Set(Store.profiles.map(p=>JSON.stringify([user,p.id])));
  for(const savedKey of catatauMemory.histories.keys())if(!allowed.has(savedKey))catatauMemory.histories.delete(savedKey);
  if(Store.error){catatauMemory.histories.delete(key);$('#chat-log').replaceChildren();closeCatatau(false);}
  $('#chat-input').disabled=!catatauReady();$('#chat-send').disabled=!catatauReady();
  $('#chat-context').textContent=Store.profile?`${profileName()} · ${monthName(state.month)}`:'Selecione um perfil';
  $('#chat-answer').textContent=catatauReady()?'Consultas locais com os registros deste perfil.':Store.loading?'Aguarde os dados do perfil carregarem.':'Selecione um perfil disponível para consultar os registros.';
}
function renderCatatauHistory(){
  const log=$('#chat-log');log.replaceChildren();
  for(const message of catatauMemory.histories.get(catatauMemory.key)||[]){const item=document.createElement('div');item.className='chat-message '+(message.role==='user'?'from-you':'from-catatau');const label=document.createElement('b');label.textContent=message.role==='user'?'Você':`Catatau · ${message.scope}`;const copy=document.createElement('p');copy.textContent=message.text;item.append(label,copy);log.append(item);}
  log.scrollTop=log.scrollHeight;
}
function askCatatau(question){
  syncCatatauContext();if(!catatauReady())return;const text=String(question||'').trim().slice(0,400);if(!text)return;
  const history=catatauMemory.histories.get(catatauMemory.key)||[];
  const response=catatauReply(text,{month:state.month,today:Money.today(),rows:allRows(),plans:goals(),budgetMeta:Store.meta});
  history.push({role:'user',text},{role:'assistant',text:response.text,scope:response.scope});
  catatauMemory.histories.set(catatauMemory.key,history.slice(-40));$('#chat-input').value='';renderCatatauHistory();
}
function openCatatau(){
  $('#toast').classList.remove('visible');
  if(Store.screen!=='app')return;syncCatatauContext();$('#modal').close();$('#catatau-panel').hidden=false;$('#catatau-launcher').setAttribute('aria-expanded','true');$('#catatau-launcher').setAttribute('aria-label','Fechar assistente Catatau');$('#catatau-launcher').title='Fechar Catatau';
  const choices=$('#chat-choices');choices.replaceChildren();
  for(const question of catatauSuggestions){const button=document.createElement('button');button.type='button';button.textContent=question;button.addEventListener('click',()=>askCatatau(question));choices.append(button);}
  renderCatatauHistory();$('#chat-input').focus({preventScroll:true});
}
document.addEventListener('submit',e=>{if(e.target.id==='catatau-form'){e.preventDefault();askCatatau($('#chat-input').value);}});
document.addEventListener('click',e=>{const action=e.target.closest('[data-action]')?.dataset.action;if(action==='logout')resetCatatau();if(action==='clear-catatau'){catatauMemory.histories.delete(catatauMemory.key);renderCatatauHistory();$('#chat-input').focus({preventScroll:true});}},true);
window.addEventListener('pagehide',resetCatatau);

function familyTargets(){return Store.profiles.filter(p=>p.id!==Store.profile&&(Store.demo||Privacy.canEdit(Store,p)));}
function familyFields(r){const f=r?.family||(state.familyDraft?{direction:'pay'}:null);return `<details class="family-entry" ${f?'open':''}><summary>Cartão de outra pessoa ou gasto dividido?</summary><p class="form-tip">Ex.: sua viagem está no cartão Porto do Jairson e você repassa a parcela a ele todo mês.</p><label>Como você participa?<select name="familyDirection" ${r?.family?'disabled':''}><option value="none">Este gasto é só meu</option><option value="pay" ${f?.direction==='pay'?'selected':''}>Eu devo repassar para alguém</option><option value="receive" ${f?.direction==='receive'?'selected':''}>Eu paguei / vou pagar por alguém e receberei de volta</option></select>${r?.family?`<input type="hidden" name="familyDirection" value="${f.direction}">`:''}</label><div id="family-fields" ${f?'':'hidden'}><div class="field-grid"><label>Nome da outra pessoa<input name="familyPerson" maxlength="70" placeholder="Ex.: Jairson" value="${esc(f?.person||'')}" required></label><label>Cartão ou identificação<input name="familyCard" maxlength="60" placeholder="Ex.: Porto do Jairson" value="${esc(f?.card||'')}" required></label></div><label style="margin-top:16px">Sincronizar com outro perfil<select name="familyTarget" ${r?'disabled':''}><option value="">Só controlar neste perfil, pelo nome</option>${familyTargets().map(p=>`<option value="${esc(p.id)}" ${p.id===f?.linkedProfileId?'selected':''}>${esc(p.displayName||p.id)}</option>`).join('')}${f?.linkedProfileId&&!familyTargets().some(p=>p.id===f.linkedProfileId)?`<option value="${esc(f.linkedProfileId)}" selected>${esc(f.linkedProfileId)} · acesso a conferir</option>`:''}</select></label><p class="form-tip">${r?'O vínculo original é mantido. Você pode encerrar a sincronização em Acertos.':'Só aparecem perfis que você pode editar. Ao vincular, a outra parte aparece automaticamente lá; o repasse é confirmado nos dois lados, sem enviar mensagens.'}</p><p class="family-note"><b>Informe no valor apenas a parte deste acerto.</b> Se uma compra de R$ 1.000 foi dividida meio a meio, registre R$ 500 aqui e a outra parte separadamente. Para repasses mensais de uma compra, escolha Parcelada e use o total desta parte.</p><p class="form-tip">O vencimento será a data combinada para o repasse. “Pago” significa repasse acertado entre vocês; não confirma o pagamento da fatura ao banco. Não cadastre o mesmo acerto de novo no outro perfil quando usar a sincronização.</p></div></details>`;}
function syncFamilyFields(){const form=$('#entry-form');if(!form||state.type!=='despesa')return;const f=new FormData(form),active=f.get('familyDirection')!=='none',section=$('#family-fields');if(!section)return;section.hidden=!active;section.querySelectorAll('input').forEach(i=>i.disabled=!active);const target=form.elements.familyTarget;if(target&&!state.editId)target.disabled=!active;const reimb=form.querySelector('.reimbursement-options');if(reimb){reimb.hidden=active;reimb.querySelectorAll('input').forEach(i=>i.disabled=active);}if(active){$('#entry-paid-label').textContent='O primeiro repasse já foi acertado?';$('#due-date-note').textContent='Use a data combinada entre vocês para o repasse.';}}
function familyFromForm(data,f,existing){const direction=f.get('familyDirection')||'none';if(direction==='none'){if(existing?.family)throw new Error('Mantenha o tipo de acerto original.');return data;}if(!['pay','receive'].includes(direction))throw new Error('Escolha como participa do acerto.');data.family={...(existing?.family||{}),direction,person:String(f.get('familyPerson')||'').trim(),card:String(f.get('familyCard')||'').trim()};if(!existing&&f.get('familyTarget'))data.family.linkedProfileId=String(f.get('familyTarget'));data.reembolsavel=false;data.reembolsado=false;const error=Family.validate(data,{pending:true});if(error)throw new Error(error);return data;}
function familyRows(month=state.month){return Store.data.despesas.filter(r=>r.family&&Money.validDate(r.data)).flatMap(r=>Recurrence.is(r)?Recurrence.occurrences(r,month,month):Money.occurrences(r)).filter(r=>r.date.startsWith(month)).sort((a,b)=>a.date.localeCompare(b.date));}
function familyAdvice(month=state.month){const rows=familyRows(month),pay=rows.filter(r=>r.family.direction==='pay'&&!r.paid),receive=rows.filter(r=>r.family.direction==='receive'&&!r.paid);return `Em ${monthName(month)}, há ${fmt(sum(pay))} a repassar e ${fmt(sum(receive))} a receber da família.\n\n${[...pay,...receive].slice(0,8).map(r=>`• ${r.family.direction==='pay'?'Repassar para':'Receber de'} ${r.family.person}: ${fmt(r.value)} · ${r.desc} · ${Money.date(r.date)}.`).join('\n')||'Todos os acertos cadastrados neste mês estão concluídos.'}\n\nEm Acertos, confirme somente o dinheiro que já foi repassado ou recebido. O acerto vinculado atualiza os dois perfis quando você tem permissão para editar ambos. Recebimentos de acertos não são salário nem receita extra. A fatura do banco deve ser conferida separadamente.`;}
function confirmFamilyPayment(id,idx,month){const r=Store.data.despesas.find(x=>x.id===id);if(!r?.family)return;const monthly=Recurrence.is(r);confirmAction('Confirmar o acerto',`<b>${esc(r.desc)}</b> · ${esc(r.family.person)}<br>${monthly?'Confirmar somente o repasse de '+esc(monthName(month))+'?':idx>0?'Confirmar os repasses até a parcela '+(idx+1)+'? As parcelas são acertadas em sequência.':'O valor já foi repassado / recebido?'}${r.family.linkedProfileId?'<br>O acerto também será atualizado no perfil vinculado.':''}`,'Confirmar acerto',async()=>{await Family.markPaid(r.id,idx,month);toast('Acerto atualizado.');});}
function familyPage(){const rows=familyRows(),pay=rows.filter(r=>r.family.direction==='pay'),receive=rows.filter(r=>r.family.direction==='receive');return `${pageTop('Combinado claro. Família tranquila.','Quem paga a fatura e quem ficou responsável por cada parte.',monthPicker()+`<button class="button primary" data-action="new-family">${icon('plus')} Novo acerto</button>`)}<div class="family-overview"><section class="card"><span class="eyebrow">EU VOU REPASSAR</span><h2>${fmt(sum(pay.filter(r=>!r.paid)))}</h2><p>Falta acertar com quem pagou por você.</p></section><section class="card"><span class="eyebrow">EU VOU RECEBER</span><h2>${fmt(sum(receive.filter(r=>!r.paid)))}</h2><p>Partes de outras pessoas que você assumiu.</p></section><section class="card"><span class="eyebrow">JÁ ACERTADO NO MÊS</span><h2>${fmt(sum(rows.filter(r=>r.paid)))}</h2><p>Repasses confirmados neste perfil.</p></section></div><section class="family-guide"><img src="${CATATAU_IMAGE}" alt="Catatau"><div><h2>A viagem é sua. O cartão pode ser do Jairson.</h2><p>Cadastre sua parte em “Eu devo repassar para alguém”. Informe as parcelas e, se tiver acesso, escolha o perfil dele para sincronizar. No seu orçamento entra a parcela da viagem; no dele aparece um acerto a receber.</p><p><b>Não registre o repasse novamente como despesa ou receita.</b> Marque o acerto quando o dinheiro mudar de mãos. A aba não reproduz a fatura bancária: confira o total devido ao cartão separadamente.</p></div></section>${['pay','receive'].map(direction=>`<section class="card family-list"><div class="card-head"><div><h2>${direction==='pay'?'Meus repasses':'Meus recebimentos'}</h2><p>${esc(monthName(state.month))}</p></div></div>${rows.filter(r=>r.family.direction===direction).map(r=>`<article class="family-row"><div class="family-row-main"><span class="badge ${r.paid?'paid':r.date<Money.today()?'late':'pending'}">${r.paid?'Acertado':r.date<Money.today()?'Repasse atrasado':direction==='pay'?'A repassar':'A receber'}</span><h3>${esc(r.desc)}</h3><p>${direction==='pay'?'Para':'De'} <b>${esc(r.family.person)}</b> · ${esc(r.family.card)}</p><small>${esc(Money.date(r.date))}${r.total>1?' · Parcela '+(r.idx+1)+' de '+r.total:''}${r.recurring?' · Todo mês':''} · ${r.family.linkedProfileId?'Sincronizado com '+esc(r.family.linkedProfileId):'Controle neste perfil'}</small></div><div class="family-row-actions"><b>${fmt(r.value)}</b>${!r.paid&&Store.editable?`<button class="button primary" data-action="family-paid" data-id="${esc(r.id)}" data-idx="${r.idx}" data-month="${esc(r.monthKey||'')}">${direction==='pay'?'Já repassei':'Já recebi'}</button>`:''}${rowActions(r)}${r.family.linkedProfileId&&Store.editable?`<button class="text-button" data-action="family-detach" data-id="${esc(r.id)}">Encerrar sincronização</button>`:''}</div></article>`).join('')||empty(direction==='pay'?'Nenhum repasse neste mês':'Nenhum recebimento neste mês','Cadastre apenas a parte combinada com a outra pessoa.')}</section>`).join('')}<p class="form-tip">O que você deve repassar já aparece como despesa nos seus relatórios. O que você tem a receber fica somente em Acertos: não aumenta suas receitas nem suas despesas pessoais. A aba controla o acordo entre pessoas, e não o fluxo de caixa completo de adiantamentos e da fatura.</p>`;}
document.addEventListener('change',e=>{if(e.target.closest?.('#entry-form')&&['familyDirection','expenseMode'].includes(e.target.name))syncFamilyFields();});
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-action]');if(!el)return;const action=el.dataset.action;
  if(action==='new-family'){state.familyDraft=true;state.type='despesa';state.editId=null;state.page='lancamentos';location.hash='lancamentos';render.wasRendered=false;render();const section=$('.family-entry');section.open=true;const form=$('#entry-form');form.elements.familyDirection.value='pay';syncFamilyFields();form.elements.familyPerson.focus();}
  if(action==='family-paid')confirmFamilyPayment(el.dataset.id,Number(el.dataset.idx),el.dataset.month);
  if(action==='family-detach'){const r=Store.data.despesas.find(x=>x.id===el.dataset.id);if(!r?.family?.linkedProfileId)return;confirmAction('Encerrar a sincronização?',`Os registros de <b>${esc(r.desc)}</b> e o histórico serão mantidos nos dois perfis, mas os próximos ajustes serão feitos separadamente em cada um.`,'Encerrar sincronização',async()=>{await Family.detach(r.id);toast('Sincronização encerrada. O histórico foi mantido.');});}
});

function expenseMode(record){return Recurrence.is(record)?'monthly':Number(record?.parcelas)>1?'installments':'once';}
function entriesPage(){
  const expense=state.type==='despesa',r=state.editId?Store.data[expense?'despesas':'receitas'].find(x=>x.id===state.editId):null,mode=expenseMode(r);
  const cats=[...(expense?expenseCats:incomeCats),...(Store.meta[expense?'customCatDespesa':'customCatReceita']||[])];
  const modes=[['once','Uma vez','Uma conta ou compra'],['installments','Parcelada','Uma compra em parcelas'],['monthly','Todo mês','Uma despesa recorrente']];
  return `${pageTop(state.editId?'Vamos ajustar este lançamento.':'Um registro. Mais tranquilidade.','Registre hoje, mesmo que a compra tenha sido feita antes.',`<button class="button secondary" data-action="import">${icon('upload')} Importar extrato</button>`)}<div class="entry-layout"><section class="card"><form id="entry-form" class="entry-form">
    <div class="segmented" role="group" aria-label="Tipo de lançamento"><button type="button" data-action="entry-type" data-type="despesa" class="expense ${expense?'active':''}" aria-pressed="${expense}">${icon('expense')} Despesa</button><button type="button" data-action="entry-type" data-type="receita" class="income ${expense?'':'active'}" aria-pressed="${!expense}">${icon('income')} Receita</button></div>
    ${expense?`<fieldset class="expense-frequency"><legend>Como essa despesa acontece?</legend>${r?`<input type="hidden" name="expenseMode" value="${mode}"><div class="schedule-fixed"><b>${modes.find(m=>m[0]===mode)[1]}</b><span>O tipo do lançamento é mantido para preservar seu histórico.</span></div>`:`<div class="frequency-options">${modes.map(([key,title,note])=>`<label><input type="radio" name="expenseMode" value="${key}" ${mode===key?'checked':''}><span><b>${title}</b><small>${note}</small></span></label>`).join('')}</div>`}</fieldset>`:''}
    ${expense?familyFields(r):''}
    <label class="amount-field"><b id="amount-label">${expense?'Quanto você gastou?':'Quanto você recebeu?'}</b><span>R$</span><input id="entry-amount" name="amount" inputmode="decimal" required maxlength="16" autocomplete="off" placeholder="0,00" value="${r?Number(r.valor).toFixed(2).replace('.',','):''}" aria-describedby="amount-note"></label><small id="amount-note" class="muted">${expense?'Informe o valor da despesa.':'Informe o valor que entrou.'}</small>
    <div class="field-grid"><label class="span2">${expense?'Com o que você gastou?':'De onde veio esse dinheiro?'}<input id="entry-desc" name="description" required maxlength="150" placeholder="${expense?'Ex.: plano VIVO, supermercado...':'Ex.: salário, trabalho extra...'}" value="${esc(r?.desc||'')}"></label>
    ${expense?`<label id="purchase-date-field">Data da compra <small>Opcional · pode ser de um mês anterior</small><input name="purchaseDate" id="purchase-date" type="date" value="${esc(r?.purchaseDate||'')}"></label>`:''}
    <label><span id="due-date-label">${expense?'Pagamento ou vencimento':'Data do recebimento'}</span><input name="date" id="entry-date" type="date" required ${mode==='monthly'&&r?'readonly':''} value="${esc(r?.data||Money.today())}"><small id="due-date-note">${expense?'É esta data que define o mês do relatório.':''}</small></label>
    <label>Categoria<select name="category" id="entry-category">${options(cats,r?.cat||cats[0])}<option value="__new">+ Nova categoria</option></select></label>
    ${expense?`<label>Como entra no seu orçamento?<select name="budgetGroup"><option value="auto" ${!['fixed','variable'].includes(r?.budgetGroup)?'selected':''}>Sugestão pela categoria e recorrência</option><option value="fixed" ${r?.budgetGroup==='fixed'?'selected':''}>Despesa fixa</option><option value="variable" ${r?.budgetGroup==='variable'?'selected':''}>Despesa variável</option></select><small>Revise a sugestão em Metas → Conferir fixas e variáveis.</small></label><label>Forma de pagamento<select name="payment">${options([...payments,...(Store.meta.customFormaPg||[])],r?.forma||'Pix')}</select></label><label id="entry-paid-field"><span id="entry-paid-label">Pagamento</span><select name="paid"><option value="0" ${!r?.jaPagas?'selected':''}>Ainda vou pagar</option><option value="1" ${r?.jaPagas?'selected':''}>Já foi pago</option></select></label>`:''}</div>
    ${expense?`<section id="installment-fields" class="schedule-fields" ${mode!=='installments'?'hidden':''}><h3>Parcelas da compra</h3><p>Informe a primeira parcela, mesmo que ela tenha vencido há meses. Não é preciso mudar o mês da página para cadastrar.</p><div class="field-grid"><label>Em quantas parcelas?<input name="installments" type="number" min="2" max="600" step="1" value="${Math.min(600,Math.max(2,parseInt(r?.parcelas)||2))}" required></label><label>Quantas já foram pagas?<input name="paidInstallments" type="number" min="0" max="600" step="1" value="${Math.max(0,parseInt(r?.jaPagas)||0)}" required><small>Contando desde a primeira parcela.</small></label></div></section>
    <section id="recurrence-fields" class="schedule-fields" ${mode!=='monthly'?'hidden':''}><h3>Repete todos os meses</h3><p>Cadastre uma vez. A cobrança aparece automaticamente nos meses seguintes, sempre com o valor mensal informado.</p><div class="field-grid"><label>Até quando repetir?<select name="recurrenceEnd"><option value="never" ${!r?.recurrence?.until?'selected':''}>Sem data para terminar</option><option value="until" ${r?.recurrence?.until?'selected':''}>Até um mês específico</option></select></label><label id="recurrence-until-field">Último mês da cobrança<input type="month" name="recurrenceUntil" value="${esc(r?.recurrence?.until||'')}" required><small>Inclui a cobrança deste mês.</small></label></div>${r?'<p class="form-tip">Os pagamentos são marcados por mês em Relatórios. Alterar o valor atualiza toda a série, inclusive os meses anteriores. Para encerrar sem apagar o histórico, defina o último mês.</p>':'<p class="form-tip">As próximas mensalidades ficam a pagar. Você confirma cada pagamento nos relatórios.</p>'}</section>
    <div id="schedule-preview" class="schedule-preview" role="status" aria-live="polite" hidden></div>
    <details class="reimbursement-options"><summary>Reembolso</summary><label class="checkbox"><input type="checkbox" name="reimbursable" ${r?.reembolsavel?'checked':''}> A empresa vai me reembolsar</label>${r?.reembolsavel?`<label class="checkbox"><input type="checkbox" name="reimbursed" ${r.reembolsado?'checked':''}> Já recebi o reembolso</label>`:''}</details>`:''}
    <p id="entry-error" class="form-error" role="alert" hidden></p><button class="button primary full" type="submit" ${!Store.editable?'disabled':''}>${icon('check')} ${state.editId?'Salvar alterações':expense?'Salvar despesa':'Salvar receita'}</button>${state.editId?'<button class="text-button" type="button" data-action="cancel-edit">Cancelar edição</button>':''}<p class="form-tip">${Store.demo?'Demonstração: as mudanças somem ao recarregar.':Store.editable?'O lançamento será salvo na conta da sua família.':'Seu acesso a este perfil é somente leitura.'}</p></form></section>
    <aside class="entry-side"><div class="gentle-tip"><img src="${CATATAU_IMAGE}" alt="Catatau"><div><h3>Seu histórico também cabe aqui.</h3><p>Comprou antes de começar a usar o 4J? Escolha Parcelada, informe as datas originais e quantas parcelas já pagou. Eu organizo os meses para você.</p><button class="text-button" data-action="catatau">Preciso de uma ajuda</button></div></div><section class="card"><div class="card-head"><div><h2>Seus últimos registros</h2><p>Receitas e despesas de ${esc(monthName(state.month))}</p></div></div>${monthRows().length?monthRows().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5).map(r=>transaction(r,true)).join(''):empty('Pode começar por aqui','O primeiro registro aparece assim que você salvar.')}<a class="text-button" href="#relatorios">Consultar todos os lançamentos</a></section></aside></div>`;
}
function syncEntrySchedule(){
  const form=$('#entry-form');if(!form||state.type!=='despesa')return;
  const mode=new FormData(form).get('expenseMode')||'once',monthly=mode==='monthly',installments=mode==='installments';
  const section=(id,visible)=>{const el=$(id);el.hidden=!visible;el.querySelectorAll('input,select').forEach(input=>input.disabled=!visible);};
  section('#installment-fields',installments);section('#recurrence-fields',monthly);section('#purchase-date-field',!monthly);section('#entry-paid-field',!installments&&!(monthly&&state.editId));
  section('#recurrence-until-field',monthly&&form.elements.recurrenceEnd.value==='until');
  $('#amount-label').textContent=monthly?'Qual é o valor mensal?':installments?'Qual foi o valor total da compra?':'Quanto você gastou?';
  $('#amount-note').textContent=monthly?'Ex.: R$ 135,00 por mês no plano da VIVO.':installments?'Informe o total da compra. O 4J calcula o valor de cada parcela.':'Informe o valor da despesa.';
  $('#due-date-label').textContent=monthly?'Primeiro vencimento':installments?'Vencimento da 1ª parcela':'Pagamento ou vencimento';
  $('#due-date-note').textContent=installments?'Use a data original da primeira parcela, mesmo que já esteja paga.':monthly?'Os meses seguintes repetem este dia. No mês mais curto, usamos o último dia.':'É esta data que define o mês do relatório.';
  $('#entry-paid-label').textContent=monthly?'A primeira mensalidade já foi paga?':'Pagamento';
  const f=new FormData(form),amount=Money.parse(f.get('amount')),date=f.get('date'),preview=$('#schedule-preview');preview.hidden=mode==='once';
  if(preview.hidden)return;
  if(!Money.validDate(date)||!Number.isFinite(amount)||amount<=0){preview.textContent='Preencha o valor e o primeiro vencimento para conferir o calendário.';return;}
  if(monthly){const until=f.get('recurrenceEnd')==='until'?f.get('recurrenceUntil'):'';preview.textContent=`${fmt(amount)} por mês, a partir de ${Money.date(date)}${until&&/^\d{4}-\d{2}$/.test(until)?', até '+monthName(until):', sem data para terminar'}. Cada mês tem seu próprio pagamento.`;return;}
  const count=Number(f.get('installments')),paid=Number(f.get('paidInstallments'));
  if(!Number.isInteger(count)||count<2||count>600||!Number.isInteger(paid)||paid<0||paid>count){preview.textContent='Confira o número de parcelas e a quantidade já paga.';return;}
  const rows=Money.occurrences({valor:amount,data:date,parcelas:count,jaPagas:paid}),next=rows[paid],first=rows[0],last=rows.at(-1);
  preview.textContent=`${count} parcelas de aproximadamente ${fmt(first.value)}. De ${Money.date(first.date)} até ${Money.date(last.date)}. ${paid} já paga(s). ${next?'Próxima parcela não paga: '+(paid+1)+'/'+count+', '+fmt(next.value)+' em '+Money.date(next.date)+'.':'Todas as parcelas já foram pagas.'} Os centavos são distribuídos para fechar o total da compra.`;
}
document.addEventListener('change',e=>{if(e.target.closest?.('#entry-form')&&['expenseMode','recurrenceEnd'].includes(e.target.name))syncEntrySchedule();});
document.addEventListener('input',e=>{if(e.target.closest?.('#entry-form')&&['amount','date','installments','paidInstallments','recurrenceUntil'].includes(e.target.name))syncEntrySchedule();});
document.addEventListener('input',e=>{if(e.target.closest?.('#entry-form'))syncFamilyFields();});
document.addEventListener('change',e=>{if(e.target.closest?.('#entry-form'))syncFamilyFields();});
function entryRecordFromForm(f,type,id){
  const expense=type==='despesa',existing=id?Store.data[expense?'despesas':'receitas'].find(r=>r.id===id):null,mode=expense?(f.get('expenseMode')||'once'):'once';
  if(id&&!existing)throw new Error('Lançamento não encontrado.');
  if(!['once','installments','monthly'].includes(mode)||existing&&expense&&mode!==expenseMode(existing))throw new Error('Mantenha o tipo original do lançamento.');
  const amount=Money.parse(f.get('amount')),date=String(f.get('date')||''),purchaseDate=expense&&mode!=='monthly'?String(f.get('purchaseDate')||''):'';
  if(!Number.isFinite(amount)||amount<=0||amount>999999999)throw new Error('Informe um valor maior que zero, como 125,50.');
  if(!Money.validDate(date))throw new Error('Confira a data de vencimento ou recebimento.');
  if(purchaseDate&&(!Money.validDate(purchaseDate)||purchaseDate>date))throw new Error('A data da compra deve ser válida e não pode ser posterior ao primeiro vencimento.');
  if(!String(f.get('description')||'').trim())throw new Error('Conte o que foi este lançamento.');
  if(!f.get('category')||f.get('category')==='__new')throw new Error('Selecione uma categoria.');
  const data={desc:String(f.get('description')).trim(),cat:f.get('category'),valor:amount,data:date};
  if(expense){const installments=mode==='installments'?Number(f.get('installments')):1,paid=mode==='installments'?Number(f.get('paidInstallments')):mode==='monthly'?0:Number(f.get('paid'));
    if(!Number.isInteger(installments)||installments<(mode==='installments'?2:1)||installments>600||!Number.isInteger(paid)||paid<0||paid>installments)throw new Error('Confira as parcelas e a quantidade já paga.');
    const budgetGroup=f.get('budgetGroup')||'auto';if(!['auto','fixed','variable'].includes(budgetGroup))throw new Error('Confira a classificação no orçamento.');
    Object.assign(data,{budgetGroup,forma:f.get('payment'),parcelas:installments,jaPagas:paid,purchaseDate,reembolsavel:f.has('reimbursable'),reembolsado:f.has('reimbursed')});
    if(mode==='monthly'){
      const until=f.get('recurrenceEnd')==='until'?String(f.get('recurrenceUntil')||''):'';
      if(f.get('recurrenceEnd')==='until'&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(until))throw new Error('Escolha o último mês da recorrência.');
      if(existing&&date!==existing.data)throw new Error('Mantenha o primeiro vencimento da série. Para mudar o dia, encerre esta recorrência e cadastre uma nova.');
      data.recurrence={frequency:'monthly',until};
      if(!id)data.recurrencePaid=Number(f.get('paid'))===1?[date.slice(0,7)]:[];
      const problem=Recurrence.validate({...existing,...data});if(problem)throw new Error(problem);
    }
  }
  return expense?familyFromForm(data,f,existing):data;
}

function categoryData(rows=monthRows()){const map=new Map();rows.filter(r=>r.type==='despesa').forEach(r=>map.set(r.cat,(map.get(r.cat)||0)+Money.cents(r.value)));return [...map].map(([name,v])=>({name,value:v/100})).sort((a,b)=>b.value-a.value);}
function reportCategories(){const cats=categoryData(),total=cats.reduce((a,c)=>a+c.value,0),colors=['var(--blue)','#f2a900','#e8797e','#78a998','#bdb58c','#879ab1'];let angle=0;const gradient=cats.map((c,i)=>{const start=angle;angle+=c.value/total*360;return `${colors[i%colors.length]} ${start}deg ${angle}deg`;}).join(',');return `<div class="card-head"><div><h2>Para onde foi o dinheiro?</h2><p>Despesas por categoria neste mês</p></div></div>${cats.length?`<div class="donut-wrap"><div class="donut" style="background:conic-gradient(${gradient})" role="img" aria-label="Despesas por categoria. Total ${fmt(total)}"><div><small>DESPESAS</small><b>${fmt(total)}</b></div></div><div class="donut-legend">${cats.slice(0,5).map((c,i)=>`<span><i style="background:${colors[i]}"></i>${esc(c.name)}</span>`).join('')}</div></div><div class="category-list">${cats.map((c,i)=>`<div class="category-item"><div><span>${esc(c.name)}</span><b>${fmt(c.value)} <small class="muted">(${Math.round(c.value/total*100)}%)</small></b></div><div class="progress"><span style="width:${c.value/total*100}%;background:${colors[i%colors.length]}"></span></div></div>`).join('')}</div>`:empty('Os números vêm com os registros','Suas categorias aparecem depois do primeiro lançamento.')}`;}
function filteredRows(){const norm=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();return monthRows().filter(r=>(state.category==='Todas'||r.cat===state.category)&&(state.filterType==='todos'||r.type===state.filterType)&&(!state.search||norm(r.desc).includes(norm(state.search)))).sort((a,b)=>b.date.localeCompare(a.date));}
function reportTable(){const rows=filteredRows();return `<div class="table-scroll"><table><thead><tr><th>Descrição</th><th class="mobile-hide">Categoria</th><th>Data</th><th class="num">Valor</th><th>Status</th><th class="no-print"><span class="sr-only">Ações</span></th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${esc(r.desc)}</b><small>${r.type==='receita'?'Receita':esc(r.forma||'Despesa')}${r.total>1?' · Parcela '+(r.idx+1)+' de '+r.total:''}${r.recurring?' · Recorrente mensal':''}${r.purchaseDate?' · Compra em '+esc(Money.date(r.purchaseDate)):''}${r.family?' · Repasse para '+esc(r.family.person):''}${r.reembolsavel?' · '+(r.reembolsado?'Reembolsado':'A reembolsar'):''}</small></td><td class="mobile-hide">${esc(r.cat)}</td><td>${esc(Money.date(r.date))}</td><td class="num ${r.type==='receita'?'positive':''}">${r.type==='receita'?'+ ':''}${fmt(r.value)}</td><td>${badges(r)}${r.type==='despesa'&&!r.paid&&Store.editable?`<button class="text-button no-print" data-action="pay-record" data-id="${esc(r.id)}" data-idx="${r.idx}" data-month="${esc(r.monthKey||'')}">${r.family?'Confirmar repasse':'Marcar pago'}</button>`:''}</td><td class="no-print">${rowActions(r)}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="3"><b>${rows.length} lançamento(s)</b></td><td class="num"><b>${fmt(sum(rows.map(r=>({...r,value:r.type==='despesa'?-r.value:r.value}))))}</b></td><td colspan="2">Saldo dos filtros</td></tr></tfoot></table></div>${!rows.length?empty('Nenhum lançamento encontrado','Tente outro mês ou altere os filtros.'):''}`;}
function reportsPage(){const t=totals(),prev=totals(monthRows(Money.addMonth(state.month+'-01',-1).slice(0,7))),cats=[...new Set(monthRows().map(r=>r.cat))];const reimb=monthRows().filter(r=>r.type==='despesa'&&r.reembolsavel&&!r.reembolsado);return `${pageTop('Seu dinheiro, com mais clareza.','Entenda o mês e tome decisões em família.',monthPicker()+`<button class="button secondary" data-action="print">${icon('print')} Salvar PDF</button>`)}<div class="metrics">${metric('Receitas',t.income,'income','Recebimentos registrados','income')}${metric('Despesas',t.expense,'expense','Pagas e previstas','expense')}${metric('Saldo previsto',t.balance,'balance','Não é o saldo da conta bancária','wallet')}${metric('Ainda a pagar',t.pending,'goal','Do mês selecionado','clock')}</div><div class="content-grid"><section class="card">${reportCategories()}</section><section class="card"><div class="card-head"><div><h2>Um mês ao lado do outro</h2><p>${esc(monthName(Money.addMonth(state.month+'-01',-1).slice(0,7)))} × ${esc(monthName(state.month))}</p></div></div>${chart([Money.addMonth(state.month+'-01',-1).slice(0,7),state.month])}<div class="chart-summary"><span>Variação das despesas</span><b class="${t.expense>prev.expense?'negative':''}">${prev.expense?((t.expense/prev.expense-1)*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%':'Sem base anterior'}</b></div><div class="due-footer">${icon('wallet')} ${fmt(sum(reimb))} em parcelas a reembolsar neste mês.</div><p class="form-tip">Reembolsos só entram nas receitas quando você os registra como recebidos.</p></section></div><section class="card"><div class="card-head"><div><h2>Todos os lançamentos do mês</h2><p>Confira, filtre ou ajuste seus registros</p></div><button class="text-button" data-action="export-csv">${icon('download')} Baixar planilha</button></div><div class="report-toolbar"><label class="search-field">${icon('search')}<input id="report-search" type="search" aria-label="Buscar descrição" placeholder="Buscar um lançamento..." value="${esc(state.search)}"></label><select id="report-type" aria-label="Filtrar por tipo">${options(['todos','receita','despesa'],state.filterType).replace('>todos<','>Todas as movimentações<').replace('>receita<','>Receitas<').replace('>despesa<','>Despesas<')}</select><select id="report-category" aria-label="Filtrar por categoria">${options(['Todas',...cats],state.category)}</select></div><div id="report-table">${reportTable()}</div></section>`;}
function monthlyTarget(g){const[y,m]=g.date.slice(0,7).split('-').map(Number),[cy,cm]=Money.today().slice(0,7).split('-').map(Number),months=(y-cy)*12+m-cm+1;return{months,amount:Math.ceil(Math.max(0,Money.cents(g.target)-Money.cents(g.saved))/Math.max(1,months))/100};}
function budgetSnapshot(){return Budget.analyze(monthRows(),Store.meta,state.month);}
function budgetSection(){
  const b=budgetSnapshot(),editable=Store.editable;
  return `<section class="card budget-section"><div class="budget-head"><div><span class="eyebrow">SEU PLANO DO MÊS</span><h2>Um destino para cada parte da renda.</h2><p class="budget-intro">${esc(monthName(state.month))} · Base: <b>${fmt(b.income/100)}</b> em receitas registradas.</p></div><button class="button secondary" data-action="budget-plan" ${editable?'':'disabled'}>${icon('edit')} Ajustar percentuais</button></div>
  <div class="budget-split" aria-label="Divisão da renda"><span>${b.plan.fixed}% fixas</span><span>${b.plan.reserve}% reserva</span><span>${b.plan.variable}% variáveis</span></div>
  <div class="budget-cards">${b.groups.map(g=>{const reserve=g.key==='reserve',known=!reserve||b.reserveKnown,over=!reserve&&b.income>0&&g.delta>0,progress=b.income&&g.limit?Math.min(100,Math.round(g.actual/g.limit*100)):0;return `<article class="budget-card ${g.key} ${over?'is-over':''}"><div class="budget-kicker"><h3>${g.label}</h3><span>${g.percent}% da renda</span></div><b class="budget-amount">${known?fmt(g.actual/100):'A informar'}</b><p class="budget-meta">${reserve?'Separado neste mês':'Despesas pagas + previstas'}<br>${reserve?'Meta':'Limite'}: <b>${b.income?fmt(g.limit/100):'aguardando receita'}</b></p><div class="budget-track" aria-hidden="true"><span style="width:${progress}%"></span></div><p class="budget-status">${!b.income?'Cadastre sua receita para comparar.':!known?'Conte quanto já conseguiu guardar.':reserve?g.delta>=0?'Meta do mês alcançada!':`Faltam ${fmt(-g.delta/100)} para a meta.`:over?`${fmt(g.delta/100)} acima do limite.`:g.delta===0?'Limite planejado atingido.':`Restam ${fmt(-g.delta/100)} no limite.`}</p>${reserve?`<button class="text-button" data-action="budget-reserve" ${editable?'':'disabled'}>${b.reserveKnown?'Atualizar reserva':'Registrar reserva'} ${icon('plus')}</button>`:''}</article>`;}).join('')}</div>
  <div class="budget-coach"><img src="${CATATAU_IMAGE}" alt="Catatau"><div><span class="eyebrow">CATATAU DE OLHO NO SEU PLANO</span><h3>Vamos acompanhar juntos?</h3><p>${esc(Budget.advice(b))}</p><button class="text-button" data-action="budget-chat">Conversar sobre meu orçamento ${icon('chat')}</button></div></div>
  <details class="budget-review"><summary>Conferir fixas e variáveis${b.suggested?` · ${b.suggested} a revisar`:''}</summary><p class="form-tip">Sugestão inicial: despesas recorrentes e categorias Moradia, Educação, Saúde e Assinaturas entram como fixas; as demais, variáveis. Você pode corrigir cada uma. A escolha vale para todas as parcelas ou mensalidades desse lançamento.</p>${b.expenses.length?b.expenses.map(r=>`<div class="budget-review-row"><div><b>${esc(r.desc)}</b><small>${esc(r.cat)}${r.total>1?' · Parcela '+(r.idx+1)+'/'+r.total:''}${r.recurring?' · Todo mês':''}</small></div><b>${fmt(r.value)}</b><select data-budget-record="${esc(r.id)}" aria-label="Classificação de ${esc(r.desc)}" ${editable?'':'disabled'}><option value="auto" ${!['fixed','variable'].includes(r.budgetGroup)?'selected':''}>Sugerida: ${Budget.group(r)==='fixed'?'fixa':'variável'}</option><option value="fixed" ${r.budgetGroup==='fixed'?'selected':''}>Fixa</option><option value="variable" ${r.budgetGroup==='variable'?'selected':''}>Variável</option></select></div>`).join(''):'<p class="form-tip">As despesas deste mês aparecerão aqui.</p>'}<p id="budget-review-error" class="form-error" role="alert" hidden></p></details>
  <details class="budget-source"><summary>De onde vem essa divisão?</summary><p>Começamos em 50% fixas, 20% reserva e 30% variáveis, como uma orientação ajustável à sua família. É uma adaptação da regra 50/30/20: a referência usa 50% para necessidades, 30% para desejos e 20% para poupança e pagamento de dívidas, sobre a renda líquida. Fixo não é sinônimo de essencial, e variável não é sinônimo de supérfluo.</p><p>Registre sua renda líquida. Aqui a reserva é o total que você informa ter separado no mês, inclusive aportes em metas, sem somar novamente o acumulado dos seus sonhos. Não fazemos transferências de dinheiro. Despesas reembolsáveis permanecem no orçamento; registre o reembolso recebido como receita.</p><a class="text-button" href="https://files.consumerfinance.gov/f/201603_cfpb_rules-to-live-by_my-spending-rule-to-live-by.pdf" target="_blank" rel="noopener noreferrer">Consultar a referência do CFPB ↗</a></details></section>`;
}
function budgetPlanForm(){const p=Budget.plan(Store.meta);modal('Um plano que cabe na sua vida',`<form id="budget-plan-form" data-profile="${esc(Store.profile)}"><p class="modal-copy">Comece com 50 / 20 / 30 ou ajuste à sua realidade. Os percentuais deste perfil serão usados em todos os meses; os valores acompanham as receitas de cada mês.</p><div class="field-grid budget-controls">${Budget.keys.map(k=>`<label>${Budget.labels[k]} (%)<input type="number" name="${k}" min="0" max="100" step="1" required value="${p[k]}"></label>`).join('')}</div><p class="form-tip">A soma precisa ser 100%. Fixas e variáveis são limites; reserva é uma meta.</p><button type="button" class="text-button" data-action="budget-reset">Usar 50% / 20% / 30%</button><p id="budget-plan-error" class="form-error" role="alert" hidden></p><div class="modal-actions"><button type="submit" class="button primary">Salvar meu plano</button></div></form>`);}
function budgetReserveForm(){const month=state.month,known=Object.hasOwn(Store.meta.budgetMonths||{},month);modal('Sua reserva deste mês',`<form id="budget-reserve-form" data-profile="${esc(Store.profile)}" data-month="${month}"><p class="modal-copy">${esc(monthName(month))} · ${esc(profileName())}</p><label style="margin-top:18px">Total separado neste mês (R$)<input name="reserve" inputmode="decimal" required placeholder="0,00" value="${known?Number(Store.meta.budgetMonths[month]).toFixed(2).replace('.',','):''}"></label><p class="form-tip">Informe o total do mês, já descontando retiradas desse valor. Se guardou R$ 200 e depois mais R$ 100, atualize para R$ 300. Inclua aportes em metas uma única vez; não use o saldo acumulado de meses anteriores. Pode informar zero.</p><p class="form-tip">Este registro acompanha seu planejamento. Não cria uma despesa, não altera o valor das metas e não transfere dinheiro.</p><p id="budget-reserve-error" class="form-error" role="alert" hidden></p><div class="modal-actions"><button class="button primary" type="submit">Salvar reserva do mês</button></div></form>`);}
document.addEventListener('click',e=>{const action=e.target.closest('[data-action]')?.dataset.action;if(action==='budget-plan'&&Store.editable)budgetPlanForm();if(action==='budget-reserve'&&Store.editable)budgetReserveForm();if(action==='budget-reset'){const form=$('#budget-plan-form');if(form)for(const k of Budget.keys)form.elements[k].value=Budget.defaults[k];}if(action==='budget-chat'){openCatatau();askCatatau('Onde estou desviando do meu orçamento?');}});
document.addEventListener('submit',e=>{
  const form=e.target;if(!['budget-plan-form','budget-reserve-form'].includes(form.id))return;e.preventDefault();const f=new FormData(form),isPlan=form.id==='budget-plan-form';
  runForm(form,isPlan?'#budget-plan-error':'#budget-reserve-error',async()=>{if(form.dataset.profile!==Store.profile)throw new Error('O perfil mudou. Reabra esta janela.');await Store.saveBudget(isPlan?{plan:Object.fromEntries(Budget.keys.map(k=>[k,Number(f.get(k))]))}:{month:form.dataset.month,reserve:Money.parse(f.get('reserve'))});},()=>{$('#modal').close();render.wasRendered=false;render();toast(isPlan?'Seu plano foi salvo.':'Reserva do mês atualizada.');});
});
document.addEventListener('change',async e=>{
  const el=e.target;if(!el.matches?.('[data-budget-record]'))return;const id=el.dataset.budgetRecord,value=el.value;el.disabled=true;
  try{if(!['auto','fixed','variable'].includes(value))throw new Error('Escolha fixa ou variável.');await Store.saveRecord('despesa',{budgetGroup:value},id);document.activeElement?.blur();render.wasRendered=false;render();toast('Classificação atualizada. O Catatau já recalculou seu plano.');}catch(err){el.disabled=!Store.editable;formError('#budget-review-error',err);}
});

function goalsPage(){const gs=goals(),saved=gs.reduce((s,g)=>s+Number(g.saved||0),0);return `${pageTop('Sonhos com um plano para acontecer.','Cuide do mês e dê espaço aos seus próximos sonhos.',monthPicker()+`<button class="button primary" data-action="new-goal" ${!Store.editable?'disabled':''}>${icon('plus')} Nova meta</button>`)}${budgetSection()}<div class="budget-head"><div><span class="eyebrow">SEUS SONHOS</span><h2>Objetivos para construir aos poucos</h2><p class="form-tip">O progresso abaixo é acumulado. A reserva acima acompanha apenas o mês escolhido.</p></div></div><div class="goals-grid">${gs.map(g=>{const p=monthlyTarget(g);return `<article class="card goal-card"><div class="goal-card-top"><span class="goal-emoji">${esc(g.emoji||'🎯')}</span><div><span class="badge ${pct(g)>=100?'paid':'pending'}">${pct(g)>=100?'Conquistada!':pct(g)+'% do caminho'}</span>${Store.editable?`<button class="icon-button" data-action="edit-goal" data-id="${esc(g.id)}" aria-label="Editar ${esc(g.name)}">${icon('edit')}</button>`:''}</div></div><h2>${esc(g.name)}</h2><p class="deadline">${icon('calendar')} Até ${esc(Money.date(g.date))}</p><div class="goal-amount">${fmt(g.saved)} <small>guardados</small></div><div class="progress" role="progressbar" aria-label="${esc(g.name)}" aria-valuenow="${pct(g)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct(g)}%;background:${pct(g)>=100?'var(--green)':'var(--gold)'}"></span></div><div class="goal-meta"><span>Objetivo: <b>${fmt(g.target)}</b></span><span>Faltam ${fmt(Math.max(0,g.target-g.saved))}</span></div><div class="plan">${pct(g)>=100?'Vocês conseguiram! Todo pequeno passo valeu a pena.':p.months<1?'O prazo passou. Você pode ajustar a data e continuar seu plano.':`Um passo possível: <b>${fmt(p.amount)} por mês</b> até o prazo. Ajuste ao que cabe no orçamento.`}</div><button class="button ${pct(g)>=100?'secondary':'primary'}" data-action="contribute" data-id="${esc(g.id)}" ${!Store.editable?'disabled':''}>${icon(pct(g)>=100?'check':'plus')} ${pct(g)>=100?'Ver conquista':'Guardar um valor'}</button></article>`;}).join('')}</div>${!gs.length?`<section class="card">${empty('Todo sonho merece um começo','Conte o que vocês querem conquistar. O Catatau ajuda a dividir em pequenos passos.','<button class="button primary" data-action="new-goal">Criar minha primeira meta</button>')}</section>`:''}<section class="goal-celebrate"><img src="${CATATAU_IMAGE}" alt="Catatau comemora os planos da família"><div><span class="eyebrow">UMA MENSAGEM DO CATATAU</span><h2>${saved?`${fmt(saved)} de cuidado com o futuro.`:'O primeiro passo pode ser pequeno.'}</h2><p>${saved?'Cada valor guardado aproxima vocês de uma conquista. Sigam no ritmo que faz sentido para a família.':'Não precisa resolver tudo hoje. Escolha um plano que seja importante para vocês e comece por ele.'}</p><button class="text-button" data-action="catatau">Me ajude a planejar</button></div></section><p class="form-tip">Valores guardados são registros das suas reservas. Eles não transferem dinheiro nem alteram o saldo dos lançamentos.</p>`;}
function yearPage(){const months=Array.from({length:12},(_,i)=>state.year+'-'+String(i+1).padStart(2,'0')),vals=months.map(m=>totals(monthRows(m))),t=totals(allRows(state.year+'-01',state.year+'-12').filter(r=>r.date.startsWith(state.year))),active=vals.map((v,i)=>({...v,m:months[i]})).filter(v=>v.income||v.expense),best=[...active].sort((a,b)=>b.balance-a.balance)[0],topcat=categoryData(allRows(state.year+'-01',state.year+'-12').filter(r=>r.date.startsWith(state.year)))[0],years=[...new Set([Money.today().slice(0,4),...allRows().map(r=>r.date.slice(0,4)),...Store.data.despesas.filter(Recurrence.is).flatMap(d=>[d.data.slice(0,4),...(d.recurrence.until?[d.recurrence.until.slice(0,4)]:[]),...Array.from({length:5},(_,i)=>String(Number(Money.today().slice(0,4))+i+1))]),state.year])].sort().reverse();return `${pageTop('O ano da sua família.','Uma pausa para olhar o caminho e planejar o que vem.',`<select id="year-picker" class="year-select" aria-label="Ano do relatório">${options(years,state.year)}</select><button class="button secondary" data-action="print">${icon('print')} Salvar PDF</button>`)}<section class="annual-intro"><div><span class="eyebrow">CADA MÊS CONTA UMA HISTÓRIA</span><h2>Os planos de hoje.<br>As conquistas de amanhã.</h2><p>${active.length} ${active.length===1?'mês com registros':'meses com registros'} em ${state.year}. Seus lançamentos contam essa história.</p></div><div class="annual-number">${state.year}</div></section><div class="metrics">${metric('Receitas no ano',t.income,'income','Soma dos recebimentos registrados','income')}${metric('Despesas no ano',t.expense,'expense','Inclui parcelas previstas no ano','expense')}${metric('Saldo previsto anual',t.balance,'balance','Receitas menos despesas do ano','wallet')}${metric('Média de despesas',active.length?t.expense/active.length:0,'goal','Considera meses com registros','chart')}</div><section class="card"><div class="card-head"><div><h2>Seu ano, mês a mês</h2><p>Valores registrados, incluindo parcelas futuras</p></div><div class="legend"><span><i></i> Receitas</span><span><i class="coral"></i> Despesas</span></div></div>${chart(months,true)}</section><div class="insights"><div class="insight"><small>MAIOR SALDO PREVISTO</small><b>${best?esc(monthName(best.m,true)):'Sem registros'}</b><p>${best?fmt(best.balance)+' de saldo previsto.':'Registre os movimentos da família.'}</p></div><div class="insight"><small>PRINCIPAL CATEGORIA</small><b>${esc(topcat?.name||'Sem registros')}</b><p>${topcat?fmt(topcat.value)+' no ano.':'As categorias aparecerão por aqui.'}</p></div><div class="insight"><small>PARCELAS A PAGAR NO ANO</small><b>${fmt(t.pending)}</b><p>Considere esses compromissos nos próximos planos.</p></div></div><section class="card"><div class="card-head"><h2>Resumo completo de ${state.year}</h2><button class="text-button" data-action="export-year">${icon('download')} Baixar planilha</button></div><div class="table-scroll"><table><thead><tr><th>Mês</th><th class="num">Receitas</th><th class="num">Despesas</th><th class="num">Saldo previsto</th></tr></thead><tbody>${months.map((m,i)=>`<tr><td>${esc(monthName(m,true))}</td><td class="num positive">${fmt(vals[i].income)}</td><td class="num">${fmt(vals[i].expense)}</td><td class="num ${vals[i].balance<0?'negative':'positive'}"><b>${fmt(vals[i].balance)}</b></td></tr>`).join('')}</tbody><tfoot><tr><td><b>Total do ano</b></td><td class="num"><b>${fmt(t.income)}</b></td><td class="num"><b>${fmt(t.expense)}</b></td><td class="num"><b>${fmt(t.balance)}</b></td></tr></tfoot></table></div></section>`;}
function modal(title,body){closeCatatau(false);$('#modal-content').innerHTML=`<div class="modal-heading"><h2>${title}</h2><button class="icon-button" data-action="close-modal" aria-label="Fechar">×</button></div>${body}`;if(!$('#modal').open)$('#modal').showModal();}
function formError(id,error){const el=$(id);el.hidden=false;el.textContent=friendlyError(error);}
function friendlyError(e){return({'auth/invalid-credential':'E-mail ou senha incorretos. Confira e tente novamente.','auth/user-not-found':'E-mail ou senha incorretos.','auth/wrong-password':'E-mail ou senha incorretos.','auth/email-already-in-use':'Este e-mail já tem uma conta. Use a opção Entrar.','auth/weak-password':'Escolha uma senha com pelo menos 6 caracteres.','auth/too-many-requests':'Muitas tentativas. Aguarde um pouco e tente novamente.','auth/network-request-failed':'Confira sua conexão e tente novamente.','auth/unauthorized-domain':'Este endereço precisa ser autorizado no Firebase pela administração.','permission-denied':'Você não tem permissão para esta ação. Peça à administração para verificar o acesso.'}[e.code]||e.message||'Não foi possível concluir. Tente novamente.');}
async function runForm(form,errorId,task,success){if(state.busy)return;state.busy=true;const buttons=[...form.querySelectorAll('button[type="submit"]')];buttons.forEach(b=>b.disabled=true);$('#profile').disabled=true;try{await task();if(success)success();}catch(e){formError(errorId,e);}finally{state.busy=false;buttons.forEach(b=>b.disabled=false);$('#profile').disabled=false;}}
function goalForm(id){const g=goals().find(g=>g.id===id);modal(g?'Ajustar seu plano':'Qual é o próximo sonho?',`<form id="goal-form" data-id="${esc(id||'')}"><label>Nome da meta<input name="name" required maxlength="70" placeholder="Ex.: férias em família" value="${esc(g?.name||'')}"></label><div class="field-grid"><label>Quanto quer juntar? (R$)<input name="target" inputmode="decimal" required placeholder="12.000,00" value="${g?Number(g.target).toFixed(2).replace('.',','):''}"></label><label>Quanto já guardou? (R$)<input name="saved" inputmode="decimal" required value="${Number(g?.saved||0).toFixed(2).replace('.',',')}"></label><label>Até quando?<input name="date" type="date" required value="${esc(g?.date||Money.addMonth(Money.today(),6))}"></label><label>Um símbolo para o sonho<select name="emoji">${options(['🏖️','🌱','🏡','🎓','🚗','💛','🎯','🎉'],g?.emoji||'🎯')}</select></label></div><p class="modal-copy">O Catatau calcula quanto falta e divide o objetivo em passos mensais.</p><p id="goal-error" class="form-error" hidden role="alert"></p><div class="modal-actions">${g?`<button type="button" class="button danger" data-action="delete-goal" data-id="${esc(g.id)}">Excluir</button>`:''}<button type="submit" class="button primary">Salvar meta</button></div></form>`);}
function contribution(id){const g=goals().find(g=>g.id===id);if(!g)return;if(pct(g)>=100){modal('Vocês conseguiram! 🎉',`<div class="goal-celebrate"><img src="${CATATAU_IMAGE}" alt="Catatau comemorando"><div><h2>${esc(g.name)}</h2><p>Uma conquista de ${fmt(g.saved)}. Celebrem esse momento em família!</p></div></div><div class="modal-actions"><button class="button primary" data-action="close-modal">Que venha o próximo sonho!</button></div>`);return;}modal('Mais um passo para o seu sonho',`<form id="contribute-form" data-id="${esc(g.id)}"><p class="modal-copy" style="margin-bottom:20px">${esc(g.name)} · Faltam ${fmt(g.target-g.saved)}</p><label>Quanto você guardou desta vez? (R$)<input name="amount" inputmode="decimal" required placeholder="0,00" autofocus></label><p class="form-tip">Registre o valor que você já separou para essa meta. Depois, atualize o total da Reserva do mês em Metas, contando este aporte uma única vez.</p><p id="contribute-error" class="form-error" role="alert" hidden></p><div class="modal-actions"><button type="submit" class="button primary">Registrar valor guardado</button></div></form>`);}
function confirmAction(title,copy,label,task){modal(title,`<p class="modal-copy">${copy}</p><p id="confirm-error" class="form-error" hidden role="alert"></p><div class="modal-actions"><button class="button secondary" data-action="close-modal">Cancelar</button><button class="button primary" id="confirm-action">${label}</button></div>`);$('#confirm-action').onclick=async()=>{const btn=$('#confirm-action');btn.disabled=true;try{await task();$('#modal').close();render.wasRendered=false;render();}catch(e){formError('#confirm-error',e);btn.disabled=false;}};}
function firebaseSignupHelp(){if(!accountIsAdmin())return;modal('Publicação e privacidade',`<p class="modal-copy">Esta versão precisa das regras completas fornecidas no arquivo <b>firestore.rules</b>. Elas isolam os perfis pessoais, liberam o compartilhamento escolhido pelo proprietário e separam o administrador da família do administrador da plataforma.</p><p class="modal-copy" style="margin-top:14px">No Firebase, abra Firestore Database → Regras. Salve uma cópia das regras atuais e substitua o conteúdo pelas regras entregues. Não mantenha permissões antigas que liberam todos os perfis para ADMIN. Faça isso antes de abrir cadastros ao público.</p><p class="modal-copy" style="margin-top:14px">O HTML sozinho não altera as permissões do banco. Consulte também o guia PUBLICAR.md entregue com esta versão.</p><a class="text-button" href="https://firebase.google.com/docs/firestore/security/get-started" target="_blank" rel="noopener noreferrer">Documentação oficial do Firebase ↗</a>`);}

function settings(){modal('Família e ajustes',`<section class="account-summary"><span class="account-role ${accountIsAdmin()?'is-admin':''}">${accountRoleLabel()}</span><div><h3>Seu acesso à plataforma</h3><p>${esc(Store.user?.email||'')}</p></div></section><p class="modal-copy">${Store.demo?'Você está em uma demonstração. Entre na sua conta para consultar seu acesso real.':accountIsAdmin()?'Você administra as contas da plataforma. Suas finanças seguem as mesmas permissões de todos: apenas perfis próprios ou compartilhados com você. ADMIN da família é um papel separado, definido no grupo.':'Sua conta é pessoal. Você pode criar uma família, escolher seus administradores e compartilhar apenas os perfis que desejar.'}</p><div class="settings-group"><h3>${accountIsAdmin()?'Administração da plataforma':'Seu espaço'}</h3>${accountIsAdmin()?'<p class="modal-copy">Novos cadastros entram automaticamente como Membro. Gerencie contas ativas e escolha quem pode administrar a plataforma.</p><button class="button primary full" style="margin-top:12px" data-action="admin">Gerenciar usuários e acessos</button><button class="text-button" data-action="firebase-signup-help">Configurar privacidade no Firebase</button></div><div class="settings-group"><h3>Seu espaço</h3>':''}<label>Perfil financeiro<select id="mobile-profile">${profileOptions()}</select></label><p class="form-tip">Neste perfil: ${({owner:'Proprietário',admin:'Administrador',edit:'Pode editar',view:'Somente leitura'})[Store.permission]}.</p><div class="settings-buttons" style="margin-top:15px"><button class="button secondary" data-action="create-profile">Criar perfil</button>${Store.manageable?'<button class="button secondary" data-action="share">Compartilhar perfil</button><button class="button secondary" data-action="rename-profile">Renomear</button><button class="button secondary" data-action="transfer-profile">Transferir dados</button><button class="button danger" data-action="delete-profile">Excluir perfil</button>':''}</div></div>${defaultProfileSettings()}<div class="settings-group"><h3>Deixe confortável para você</h3><div class="settings-buttons"><button class="button secondary" data-action="text-size">Aa · Tamanho das letras</button><button class="button secondary" data-action="theme">Alternar tema</button></div></div><div class="settings-group"><h3>Seus registros</h3><div class="settings-buttons"><button class="button secondary" data-action="backup">Baixar cópia dos dados</button>${Store.editable?'<button class="button secondary" data-action="restore-backup">Restaurar cópia</button>':''}</div></div><div class="settings-group"><div class="account-summary"><img src="__4J_ASSET_0__" width="56" height="56" style="border-radius:13px" alt="Ícone 4J Finance"><div><h3>Seu 4J, sempre por perto</h3><p>Adicione o app à tela inicial do iPhone.</p></div></div><p class="modal-copy">No Safari, abra o menu Compartilhar e escolha <b>Adicionar à Tela de Início</b>. O acesso aos dados precisa de internet. Se o atalho foi criado com o ícone antigo, remova esse atalho e adicione novamente depois de atualizar o site.</p></div><div class="modal-actions"><button class="button secondary" data-action="logout">Sair da conta</button><button class="button primary" data-action="close-modal">Pronto</button></div>`);}
function shareForm(){modal('Cuidar das finanças juntos',`<form id="share-form"><label>E-mail de quem terá acesso<input name="email" type="email" required placeholder="pessoa@exemplo.com"></label><label style="margin-top:18px">O que essa pessoa pode fazer?<select name="level"><option value="view">Apenas visualizar</option><option value="edit">Visualizar e editar lançamentos e metas</option></select></label><p class="form-tip">A pessoa precisa criar uma conta no 4J Finance. O cadastro é liberado automaticamente como Membro.</p><p id="share-error" class="form-error" role="alert" hidden></p><div class="modal-actions"><button class="button primary" type="submit">Dar acesso</button></div></form><div class="settings-group"><h3>Pessoas com acesso</h3>${[...(Store.meta.sharedView||[]).map(e=>[e,'Visualiza']),...(Store.meta.sharedEdit||[]).map(e=>[e,'Edita'])].map(([email,level])=>`<div class="due-row"><div class="row-main"><b>${esc(email)}</b><small>${level}</small></div><button class="text-button" data-action="revoke-share" data-email="${esc(email)}">Remover</button></div>`).join('')||'<p class="modal-copy">Nenhum convite ainda.</p>'}</div>`);}
async function extendedAction(action,el){
  if(action==='entry-type'){state.type=el.dataset.type;state.editId=null;render.wasRendered=false;render();}
  if(action==='cancel-edit'){state.editId=null;render.wasRendered=false;render();}
  if(action==='edit-record'){state.type=el.dataset.type;state.editId=el.dataset.id;location.hash='lancamentos';render.wasRendered=false;render();window.scrollTo({top:0});}
  if(action==='delete-record'){const cat=el.dataset.type==='receita'?'receitas':'despesas',r=Store.data[cat].find(x=>x.id===el.dataset.id);confirmAction('Excluir este lançamento?',`<b>${esc(r?.desc)}</b>${Recurrence.is(r)?' e todas as suas mensalidades, inclusive as já pagas':r?.parcelas>1?' e todas as suas parcelas':''} será excluído. Essa ação não pode ser desfeita.${r?.family?.linkedProfileId?' O acerto correspondente também será excluído do outro perfil.':''}${Recurrence.is(r)?' Para apenas encerrar as próximas cobranças, cancele e edite o último mês da recorrência.':''}`,'Excluir lançamento',async()=>{await Store.removeRecord(el.dataset.type,el.dataset.id);toast('Lançamento excluído.');});}
  if(action==='pay-record'&&Store.data.despesas.find(r=>r.id===el.dataset.id)?.family){confirmFamilyPayment(el.dataset.id,Number(el.dataset.idx),el.dataset.month);return;}
  if(action==='pay-record'){const r=Store.data.despesas.find(x=>x.id===el.dataset.id),idx=Number(el.dataset.idx);if(!r){toast('Lançamento não encontrado.');return;}if(Recurrence.is(r)){const month=el.dataset.month;if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return;confirmAction('Confirmar esta mensalidade',`Marcar <b>${esc(r.desc)}</b> de <b>${esc(monthName(month))}</b> como paga? Os outros meses continuam como estão.`,'Confirmar pagamento',async()=>{await Recurrence.markPaid(r.id,month);toast('Mensalidade marcada como paga.');});}else confirmAction('Confirmar o pagamento',idx>0?`Marcar até a parcela ${idx+1} de <b>${esc(r.desc)}</b> como pagas? Esse registro considera as parcelas em sequência.`:`Marcar <b>${esc(r.desc)}</b> como pago?`,'Confirmar pagamento',async()=>{await Store.saveRecord('despesa',{jaPagas:idx+1},r.id);toast('Pagamento atualizado.');});}
  if(action==='new-goal')goalForm();if(action==='edit-goal')goalForm(el.dataset.id);if(action==='contribute')contribution(el.dataset.id);
  if(action==='delete-goal'){const id=el.dataset.id,g=goals().find(x=>x.id===id);confirmAction('Excluir esta meta?',`O plano <b>${esc(g.name)}</b> e seu progresso serão removidos. Isso não altera os lançamentos.`,'Excluir meta',async()=>{await Store.saveGoals(gs=>gs.filter(g=>g.id!==id));toast('Meta excluída.');});}
  if(action==='catatau-tip'){const prompts={month:'Como está meu saldo?',goals:'Como estão minhas metas?',bills:'O que preciso pagar?',start:'Como registrar um gasto?'};askCatatau(prompts[el.dataset.tip]||'Ajuda');}
  if(action==='firebase-signup-help')firebaseSignupHelp();if(action==='settings')settings();if(action==='help')modal('É mais fácil com um passo a passo',`<ol class="steps"><li><b>Lançamentos:</b> registre uma entrada ou saída de dinheiro.</li><li><b>Início:</b> confira o mês e as contas que ainda faltam pagar.</li><li><b>Relatórios:</b> entenda os gastos por categoria, edite e marque pagamentos.</li><li><b>Acertos:</b> acompanhe os repasses da família, inclusive compras no cartão de outra pessoa.</li><li><b>Metas:</b> acompanhe seu plano 50 / 20 / 30, confira fixas e variáveis, registre a reserva do mês e crie objetivos.</li><li><b>Meu ano:</b> acompanhe o ano inteiro e salve o relatório em PDF.</li></ol><button class="button primary full" data-action="catatau">Quero uma dica do Catatau</button>`);
  if(action==='create-profile')modal('Um novo espaço para se organizar',`<form id="profile-form"><label>Nome do perfil<input name="name" required maxlength="60" placeholder="Ex.: Casa, Pessoal, Família"></label><p id="profile-error" class="form-error" role="alert" hidden></p><div class="modal-actions"><button type="submit" class="button primary">Criar perfil</button></div></form>`);
  if(action==='share')shareForm();if(action==='revoke-share')confirmAction('Remover acesso?',`Retirar o acesso de <b>${esc(el.dataset.email)}</b> a este perfil?`,'Remover acesso',async()=>{await Store.share(el.dataset.email,'none');toast('Acesso removido.');});
  if(action==='print'){document.title=`4J Finance - ${state.page==='ano'?state.year:state.month}`;window.print();}
  if(action==='export-csv')exportCSV(false);if(action==='export-year')exportCSV(true);
  if(action==='backup')saveFinancialBackup();if(action==='restore-backup')restoreBackupForm();
  if(action==='import')openImport();if(action==='admin')openAdmin();if(action==='rename-profile')renameProfile();if(action==='transfer-profile')await openProfileOperation('transfer');if(action==='delete-profile')await openProfileOperation('delete');
  if(action==='reset-password'){const email=$('#auth-email').value.trim();if(!email){$('#auth-error').hidden=false;$('#auth-error').textContent='Preencha seu e-mail acima para receber o link.';return;}try{await Store.auth.sendPasswordResetEmail(email);toast('Se o e-mail estiver cadastrado, você receberá um link.');}catch(e){formError('#auth-error',e);}}
}
document.addEventListener('submit',e=>{
  if(e.target.id==='entry-form'){e.preventDefault();const form=e.target,f=new FormData(form),id=state.editId,type=state.type,mode=f.get('expenseMode');runForm(form,'#entry-error',async()=>{const data=entryRecordFromForm(f,type,id);await Store.saveRecord(type,data,id);},()=>{state.editId=null;state.familyDraft=false;if(mode!=='installments'&&mode!=='monthly')state.month=String(f.get('date')).slice(0,7);document.activeElement?.blur();render.wasRendered=false;render();toast(id?'Alterações salvas.':mode==='monthly'?'Despesa recorrente cadastrada. Os meses seguintes já estão previstos.':mode==='installments'?'Compra registrada. As parcelas foram distribuídas desde o primeiro vencimento.':'Pronto! Lançamento registrado.');});}
  if(e.target.id==='goal-form'){e.preventDefault();const form=e.target,f=new FormData(form),id=form.dataset.id;runForm(form,'#goal-error',async()=>{const target=Money.parse(f.get('target')),saved=Money.parse(f.get('saved'));if(!Number.isFinite(target)||target<=0||!Number.isFinite(saved)||saved<0||target>999999999||saved>999999999)throw new Error('Confira os valores da meta. O objetivo deve ser maior que zero.');if(!Money.validDate(f.get('date')))throw new Error('Escolha uma data válida.');if(!String(f.get('name')).trim())throw new Error('Dê um nome à meta.');const g={id:id||crypto.randomUUID(),name:String(f.get('name')).trim(),target,saved,date:f.get('date'),emoji:f.get('emoji')};await Store.saveGoals(gs=>id?gs.map(x=>x.id===id?g:x):[...gs,g]);},()=>{$('#modal').close();render.wasRendered=false;render();toast(id?'Meta atualizada.':'Seu sonho agora tem um plano!');});}
  if(e.target.id==='contribute-form'){e.preventDefault();const form=e.target,f=new FormData(form),id=form.dataset.id;runForm(form,'#contribute-error',async()=>{const amount=Money.parse(f.get('amount'));if(!Number.isFinite(amount)||amount<=0||amount>999999999)throw new Error('Informe um valor maior que zero.');await Store.saveGoals(gs=>gs.map(g=>g.id===id?{...g,saved:Math.round((g.saved+amount)*100)/100}:g));},()=>{$('#modal').close();render.wasRendered=false;render();toast('Mais um passo registrado. Boa, família!');});}
  if(e.target.id==='auth-form'){e.preventDefault();const form=e.target;runForm(form,'#auth-error',async()=>{const email=$('#auth-email').value.trim(),password=$('#auth-password').value;if(state.authMode==='signup')await Store.signup($('#auth-name').value.trim(),email,password);else await Store.login(email,password,$('#remember').checked);});}
  if(e.target.id==='profile-form'){e.preventDefault();const form=e.target,f=new FormData(form);runForm(form,'#profile-error',()=>Store.createProfile(String(f.get('name')).trim()),()=>{$('#modal').close();toast('Perfil criado. Escolha-o no seletor de perfis.');});}
  if(e.target.id==='share-form'){e.preventDefault();const form=e.target,f=new FormData(form);runForm(form,'#share-error',()=>Store.share(String(f.get('email')).trim().toLowerCase(),f.get('level')),()=>{shareForm();toast('Acesso atualizado.');});}
});
document.addEventListener('click',e=>{const b=e.target.closest('[data-auth]');if(!b)return;state.authMode=b.dataset.auth;$$('[data-auth]').forEach(x=>x.classList.toggle('active',x===b));$('#signup-name').hidden=state.authMode!=='signup';$('#auth-name').required=state.authMode==='signup';$('#auth-password').autocomplete=state.authMode==='signup'?'new-password':'current-password';$('#auth-submit').textContent=state.authMode==='signup'?'Criar minha conta':'Entrar na minha conta';$('#auth-error').hidden=true;});
document.addEventListener('input',e=>{if(e.target.id==='report-search'){state.search=e.target.value;$('#report-table').innerHTML=reportTable();}});
document.addEventListener('change',e=>{if(e.target.id==='year-picker'){state.year=e.target.value;e.target.blur();render();}if(e.target.id==='report-category'||e.target.id==='report-type'){state[e.target.id==='report-category'?'category':'filterType']=e.target.value;$('#report-table').innerHTML=reportTable();}if(e.target.id==='mobile-profile'){Store.selectProfile(e.target.value);$('#modal').close();}if(e.target.id==='entry-category'&&e.target.value==='__new'){modal('Uma categoria do seu jeito',`<form id="category-form"><label>Nome da categoria<input name="name" required maxlength="50" placeholder="Ex.: Pets"></label><p id="category-error" class="form-error" hidden role="alert"></p><div class="modal-actions"><button class="button primary" type="submit">Criar categoria</button></div></form>`);$('#category-form').onsubmit=evt=>{evt.preventDefault();const form=evt.target,name=new FormData(form).get('name').trim();runForm(form,'#category-error',async()=>{if(!name)throw new Error('Digite um nome.');await Store.addCategory(state.type,name);},()=>{const select=$('#entry-category');select.add(new Option(name,name));select.value=name;$('#modal').close();toast('Categoria criada.');});};}});
function download(text,name,type){const blob=new Blob(['\uFEFF',text],{type:type+';charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function csvCell(v){let s=String(v??'');if(/^[=+@\-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
function exportCSV(year){let rows;if(year){rows=[['Mês','Receitas','Despesas','Saldo previsto'],...Array.from({length:12},(_,i)=>{const m=state.year+'-'+String(i+1).padStart(2,'0'),t=totals(monthRows(m));return[m,t.income.toFixed(2).replace('.',','),t.expense.toFixed(2).replace('.',','),t.balance.toFixed(2).replace('.',',')];})];}else rows=[['Vencimento/Recebimento','Descrição','Categoria','Tipo','Valor','Status','Parcela','Recorrência','Data da compra'],...filteredRows().map(r=>[r.date,r.desc,r.cat,r.type,r.value.toFixed(2).replace('.',','),r.paid?'Pago/Recebido':'Pendente',r.total>1?(r.idx+1)+'/'+r.total:'',r.recurring?'Mensal':'',r.purchaseDate||''])];download(rows.map(r=>r.map(csvCell).join(';')).join('\r\n'),'4J-'+(year?state.year:state.month)+'.csv','text/csv');toast('Planilha pronta para baixar.');}
$('.skip').addEventListener('click',e=>{e.preventDefault();$('#main').focus();});
document.body.classList.toggle('dark',localStorage.getItem('dashTheme')==='dark');document.body.classList.toggle('large-text',localStorage.getItem('4j-large-text')==='1');paintIcons();Store.init();

// Portable backups contain financial records only; account access stays unchanged.
function financialBackup(){
  if(Store.loading||Store.error||!Store.profile)throw new Error('Aguarde o carregamento do perfil antes de salvar uma cópia.');
  return {format:'4j-finance-backup-v4',budgetPlan:Budget.plan(Store.meta),budgetMonths:{...(Store.meta.budgetMonths||{})},exportedAt:new Date().toISOString(),profile:Store.profile,displayName:profileName(),receitas:structuredClone(Store.data.receitas),despesas:structuredClone(Store.data.despesas),goalsV2:structuredClone(goals()),customCatReceita:[...(Store.meta.customCatReceita||[])],customCatDespesa:[...(Store.meta.customCatDespesa||[])],customFormaPg:[...(Store.meta.customFormaPg||[])]};
}
function saveFinancialBackup(){
  try{download(JSON.stringify(financialBackup(),null,2),'4J-'+Money.today()+'-backup.json','application/json');toast('Cópia pronta. Guarde o arquivo para restaurar.');}catch(e){toast(e.message);}
}
function validateFinancialBackup(raw){
  if(!raw||typeof raw!=='object'||!['4j-finance-backup-v2','4j-finance-backup-v3','4j-finance-backup-v4'].includes(raw.format))throw new Error('Escolha uma cópia JSON exportada pelo 4J Finance.');
  const fail=()=>{throw new Error('A cópia contém registros inválidos. Nenhum dado foi importado.');};
  const text=(v,max,optional=false)=>{if(optional&&v==null)return '';if(typeof v!=='string'||!v.trim()||v.length>max)fail();return v.trim();};
  const amount=(v,zero=false)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<(zero?0:0.01)||v>999999999||Math.abs(v*100-Math.round(v*100))>0.001)fail();return v;};
  if(!Array.isArray(raw.receitas)||!Array.isArray(raw.despesas)||!Array.isArray(raw.goalsV2))fail();
  if(raw.receitas.length+raw.despesas.length>180)throw new Error('Esta cópia tem mais de 180 lançamentos. A restauração pelo navegador aceita até 180 por operação para manter a gravação em uma única etapa.');
  if(raw.goalsV2.length>100)throw new Error('Esta cópia tem mais de 100 metas.');
  const records=(rows,expense)=>rows.map(r=>{
    if(!r||typeof r!=='object'||!Money.validDate(r.data))return fail();
    const result={desc:text(r.desc,150),cat:text(r.cat,60),valor:amount(r.valor),data:r.data};
    if(expense){const installments=r.parcelas??1,paid=r.jaPagas??0;if(!Number.isInteger(installments)||installments<1||installments>600||!Number.isInteger(paid)||paid<0||paid>installments)fail();if(r.reembolsavel!=null&&typeof r.reembolsavel!=='boolean'||r.reembolsado!=null&&typeof r.reembolsado!=='boolean')fail();Object.assign(result,{forma:text(r.forma||'Pix',60),parcelas:installments,jaPagas:paid,reembolsavel:r.reembolsavel===true,reembolsado:r.reembolsado===true});}
    if(expense){if(r.budgetGroup!==undefined){if(!['auto','fixed','variable'].includes(r.budgetGroup))fail();result.budgetGroup=r.budgetGroup;}if(r.purchaseDate){if(!Money.validDate(r.purchaseDate)||r.purchaseDate>r.data)fail();result.purchaseDate=r.purchaseDate;}
      if(r.recurrence!=null){if(!Recurrence.is(r))fail();result.recurrence={frequency:'monthly',until:r.recurrence.until??''};result.recurrencePaid=r.recurrencePaid??[];if(result.parcelas!==1||result.jaPagas!==0||Recurrence.validate(result))fail();}
    }
    if(expense&&r.family){result.family=Family.manual(r.family);if(Family.validate(result,{pending:false}))fail();}
    return result;
  });
  const result={receitas:records(raw.receitas,false),despesas:records(raw.despesas,true),goalsV2:raw.goalsV2.map(g=>{if(!g||!Money.validDate(g.date))return fail();return{name:text(g.name,70),target:amount(g.target),saved:amount(g.saved,true),date:g.date,emoji:g.emoji?text(g.emoji,24):'🎯'};})};
  if(raw.budgetPlan!==undefined)result.budgetPlan=Budget.validatePlan(raw.budgetPlan);if(raw.budgetMonths!==undefined)result.budgetMonths=Budget.validateMonths(raw.budgetMonths);
  for(const key of ['customCatReceita','customCatDespesa','customFormaPg']){const values=raw[key]??[];if(!Array.isArray(values)||values.length>100)fail();result[key]=[...new Set(values.map(v=>text(v,60)))];}
  result.customCatReceita=[...new Set([...result.customCatReceita,...result.receitas.map(r=>r.cat)])];
  result.customCatDespesa=[...new Set([...result.customCatDespesa,...result.despesas.map(r=>r.cat)])];
  result.customFormaPg=[...new Set([...result.customFormaPg,...result.despesas.map(r=>r.forma)])];
  return result;
}
function restoreBackupForm(){
  if(!Store.editable||!Store.profile||Store.loading){toast('Selecione um perfil com permissão para editar.');return;}
  const destinationId=Store.profile,destinationName=profileName();let ready=null;
  modal('Seus dados podem ir com você',`<p class="modal-copy">Para trocar de conta, baixe uma cópia na conta antiga, entre na nova e restaure aqui. Receitas, despesas, parcelas, metas e categorias serão adicionadas ao perfil <b>${esc(destinationName)}</b>.</p><form id="restore-form"><label style="margin-top:18px">Cópia do 4J Finance<input id="restore-file" type="file" accept=".json,application/json" required></label><p class="form-tip">Até 180 lançamentos por operação. Os registros atuais são mantidos. Importar a mesma cópia novamente cria duplicatas. Acertos restaurados ficam como controles manuais, sem reativar vínculos com outros perfis. O plano e as reservas mensais da cópia também são recuperados: o plano já salvo e os meses já informados no destino prevalecem.</p><div id="restore-preview" class="restore-preview" hidden></div><label style="margin-top:16px">Confirme o perfil de destino<input name="confirmation" required maxlength="60" autocomplete="off" placeholder="${esc(destinationName)}"></label><label class="checkbox" style="margin-top:16px"><input name="understood" type="checkbox" required> Entendi que esta cópia será adicionada aos dados atuais.</label><p id="restore-error" class="form-error" role="alert" hidden></p><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Cancelar</button><button id="restore-submit" type="submit" class="button primary" disabled>Restaurar cópia</button></div></form>`);
  const form=$('#restore-form');
  $('#restore-file').onchange=async e=>{
    ready=null;$('#restore-submit').disabled=true;$('#restore-preview').hidden=true;$('#restore-error').hidden=true;
    const file=e.target.files?.[0];if(!file)return;
    try{if(file.size>5*1024*1024)throw new Error('Escolha um arquivo JSON de até 5 MB.');const raw=JSON.parse((await file.text()).replace(/^\uFEFF/,''));if($('#restore-form')!==form)return;ready=validateFinancialBackup(raw);$('#restore-preview').textContent=`Pronto para conferir: ${ready.receitas.length} receitas · ${ready.despesas.length} despesas · ${ready.goalsV2.length} metas. Destino: ${destinationName}. Acertos serão restaurados sem sincronização. Orçamento e reservas mensais serão recuperados apenas onde o destino ainda não tem valores. Permissões e acesso à conta permanecem como estão.`;$('#restore-preview').hidden=false;$('#restore-submit').disabled=false;}catch(err){if($('#restore-form')===form)formError('#restore-error',err instanceof SyntaxError?new Error('Não foi possível ler este JSON. Escolha a cópia original do 4J.'):err);}
  };
  form.onsubmit=e=>{e.preventDefault();runForm(form,'#restore-error',async()=>{
    if(!ready)throw new Error('Escolha e confira uma cópia válida.');
    if(Store.profile!==destinationId)throw new Error('O perfil mudou. Abra a restauração novamente.');
    const f=new FormData(form);if(String(f.get('confirmation')).trim()!==destinationName||!f.has('understood'))throw new Error('Digite o nome do perfil de destino e confirme a inclusão dos registros.');
    await Store.restoreBackup(ready);ready=null;
  },()=>{$('#modal').close();state.editId=null;render.wasRendered=false;render();toast('Cópia restaurada. Seus registros já estão no perfil escolhido.');});};
}

/* Import, profile administration and progressive browser agent integration. */
'use strict';
let importData=[],importRowsReady=[];
function parseCSV(text){const first=text.split(/\r?\n/)[0],delim=(first.match(/;/g)||[]).length>(first.match(/,/g)||[]).length?';':',';const rows=[];let row=[],field='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===delim&&!quoted){row.push(field);field='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(s=>s.trim()))rows.push(row);row=[];field='';}else field+=c;}row.push(field);if(row.some(s=>s.trim()))rows.push(row);return rows;}
function importNumber(v){if(typeof v==='number')return v;const s=String(v).replace(/R\$|\s/g,'');if(s.startsWith('-'))return -Money.parse(s.slice(1));if(s.startsWith('+'))return Money.parse(s.slice(1));return Money.parse(s);}
function importDate(v){if(typeof v==='number'&&window.XLSX){const d=XLSX.SSF.parse_date_code(v);return d?`${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`:'';}if(v instanceof Date)return v.toISOString().slice(0,10);const s=String(v||'').trim();if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);const m=s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);return m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:'';}
function openImport(){if(!Store.editable){toast('Seu acesso é somente leitura.');return;}importData=[];importRowsReady=[];modal('Importar um extrato',`<p class="modal-copy">Traga seus lançamentos em CSV ou Excel. Confira as colunas e os valores antes de salvar.</p><label style="margin-top:20px">Arquivo de extrato<input id="import-file" type="file" accept=".csv,.xlsx,.xls"></label><p class="form-tip">Até 400 linhas por importação. Os registros serão considerados pagos ou recebidos.</p><div id="import-mapping"></div><div id="import-preview"></div><p id="import-error" class="form-error" role="alert" hidden></p>`);$('#import-file').onchange=async e=>{try{importRowsReady=[];importData=[];$('#import-preview').innerHTML='';$('#import-mapping').innerHTML='';const file=e.target.files[0];if(!file)return;if(file.size>8*1024*1024)throw new Error('Escolha um arquivo de até 8 MB.');if(/\.csv$/i.test(file.name))importData=parseCSV(await file.text());else{if(!window.XLSX)await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';s.onload=resolve;s.onerror=()=>reject(new Error('Não foi possível abrir Excel. Tente salvar o arquivo como CSV.'));document.head.append(s);});const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});importData=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:''});}if(importData.length<2)throw new Error('O arquivo precisa ter cabeçalhos e pelo menos um lançamento.');if(importData.length>401)throw new Error('Há mais de 400 lançamentos. Divida o arquivo para conferir e importar com segurança.');const headers=importData[0].map((s,i)=>({s:String(s).slice(0,70),i}));const cols=(label,id,pattern,optional=false)=>`<label>${label}<select id="map-${id}">${optional?'<option value="-1">Não tem essa coluna</option>':''}${headers.map(({s,i})=>`<option value="${i}" ${pattern.test(s.toLowerCase())?'selected':''}>${esc(s||'Coluna '+(i+1))}</option>`).join('')}</select></label>`;$('#import-mapping').innerHTML=`<div class="field-grid">${cols('Descrição','desc',/descr|hist|nome/)}${cols('Valor','amount',/valor|amount|quantia/)}${cols('Data','date',/data|date/)}${cols('Tipo (receita/despesa)','type',/^tipo$|^type$/,true)}</div><label class="checkbox"><input id="import-invert" type="checkbox"> Valores positivos representam despesas</label><label style="margin-top:12px">Forma de pagamento das despesas<select id="import-payment">${options(payments,'Débito')}</select></label><button class="button secondary full" id="preview-import" style="margin-top:18px">Conferir os lançamentos</button>`;$('#map-type').value=String(headers.find(h=>/^tipo$|^type$/i.test(h.s))?.i??-1);$('#preview-import').onclick=previewImport;$('#import-mapping').onchange=()=>{importRowsReady=[];$('#import-preview').innerHTML='';};$('#import-preview').innerHTML='';$('#import-error').hidden=true;}catch(e){formError('#import-error',e);}};}
function previewImport(){try{const desc=Number($('#map-desc').value),amount=Number($('#map-amount').value),date=Number($('#map-date').value),type=Number($('#map-type').value),invert=$('#import-invert').checked,forma=$('#import-payment').value;if(new Set([desc,amount,date]).size!==3)throw new Error('Descrição, valor e data precisam usar colunas diferentes.');let invalid=[];importRowsReady=[];importData.slice(1).forEach((r,i)=>{if(!r.some(v=>String(v).trim()))return;const val=importNumber(r[amount]),day=importDate(r[date]),description=String(r[desc]||'').trim();if(!Number.isFinite(val)||val===0||!Money.validDate(day)||!description){invalid.push(i+2);return;}let kind;if(type>=0){const label=String(r[type]).trim().toLowerCase();if(/receita|cr[eé]dito|entrada/.test(label))kind='receita';else if(/despesa|d[eé]bito|sa[ií]da/.test(label))kind='despesa';else{invalid.push(i+2);return;}}else kind=(invert?val>0:val<0)?'despesa':'receita';const record={type:kind,desc:description.slice(0,150),cat:'Outros',valor:Math.round(Math.abs(val)*100)/100,data:day};if(kind==='despesa')Object.assign(record,{forma,parcelas:1,jaPagas:1,reembolsavel:false,reembolsado:false});importRowsReady.push(record);});$('#import-preview').innerHTML=`<div class="settings-group"><h3>${importRowsReady.length} lançamentos válidos</h3><p class="modal-copy">${invalid.length?`Linhas ${invalid.slice(0,20).join(', ')}${invalid.length>20?'…':''} não serão importadas: confira datas, valores e tipos.`:'Todas as linhas foram reconhecidas.'} Os dados serão adicionados ao perfil <b>${esc(Store.profile)}</b>, na categoria Outros. Reimportar o mesmo extrato cria duplicatas.</p><div class="table-scroll"><table><thead><tr><th>Descrição</th><th>Tipo</th><th>Data</th><th>Valor</th></tr></thead><tbody>${importRowsReady.slice(0,10).map(r=>`<tr><td>${esc(r.desc)}</td><td>${r.type}</td><td>${Money.date(r.data)}</td><td>${fmt(r.valor)}</td></tr>`).join('')}</tbody></table></div><p class="form-tip">Prévia das primeiras ${Math.min(10,importRowsReady.length)} linhas.</p><button class="button primary full" id="confirm-import" ${!importRowsReady.length?'disabled':''}>Importar ${importRowsReady.length} lançamentos</button></div>`;$('#import-error').hidden=true;$('#confirm-import').onclick=async()=>{const btn=$('#confirm-import');btn.disabled=true;try{if(importRowsReady.length>400)throw new Error('Limite de 400 lançamentos por importação.');await Store.importRows(importRowsReady);$('#modal').close();toast('Extrato importado. Confira em Relatórios.');render.wasRendered=false;render();}catch(e){formError('#import-error',e);btn.disabled=false;}};}catch(e){formError('#import-error',e);}}
function assertAdminAccess(actorUid){if(Store.demo||!Store.user?.uid||Store.userDoc?.role!=='admin'||Store.userDoc?.status!=='approved'||(actorUid&&Store.user.uid!==actorUid))throw new Error('Somente uma conta ADMIN ativa pode gerenciar usuários. Entre novamente se seu acesso mudou.');return Store.user.uid;}
function adminError(error){if(String(error?.code||'').split('/').pop()==='permission-denied')return new Error('O Firebase não autorizou esta ação. As regras do Firestore precisam permitir o gerenciamento de usuários por uma conta ADMIN ativa. Nenhuma regra de segurança foi alterada ou liberada por este site.');return error;}
async function updateAdminUser(actorUid,targetUid,field,value,expected){
  assertAdminAccess(actorUid);
  if(targetUid===actorUid)throw new Error('Você não pode alterar as permissões da própria conta.');
  if(typeof targetUid!=='string'||!targetUid||targetUid.includes('/')||!((field==='status'&&['approved','pending'].includes(value))||(field==='role'&&['admin','member'].includes(value))))throw new Error('Alteração de acesso inválida.');
  try{const users=Store.db.collection('users');await Store.db.runTransaction(async tx=>{
    assertAdminAccess(actorUid);
    const actor=await tx.get(users.doc(actorUid));
    if(!actor.exists||actor.data().role!=='admin'||actor.data().status!=='approved')throw new Error('Sua conta não tem mais permissão de ADMIN ativa. Nenhum acesso foi alterado.');
    const targetRef=users.doc(targetUid),target=await tx.get(targetRef);
    if(!target.exists)throw new Error('Esta conta não foi encontrada. Atualize a lista de usuários.');
    const current=target.data();
    if(!expected||current.role!==expected.role||current.status!==expected.status)throw new Error('O acesso desta conta mudou desde que a lista foi aberta. Volte à lista e confira antes de confirmar.');
    if(field==='role'&&value==='admin'&&current.status!=='approved')throw new Error('Ative o acesso da pessoa antes de conceder ADMIN.');
    assertAdminAccess(actorUid);
    tx.update(targetRef,{[field]:value});
  });}catch(e){throw adminError(e);}
}
function confirmAdminChange(account,field,value,query){
  let actorUid;try{actorUid=assertAdminAccess();if(account.id===actorUid)throw new Error('Você não pode alterar as permissões da própria conta.');}catch(e){toast(friendlyError(e));return;}
  const title=field==='role'?(value==='admin'?'Conceder acesso ADMIN?':'Remover acesso ADMIN?'):(value==='approved'?'Ativar o acesso?':'Suspender o acesso?');
  const copy=field==='role'?(value==='admin'?'Esta pessoa poderá gerenciar as contas da plataforma, inclusive conceder ADMIN. Esse papel não libera finanças de outras pessoas. Para administrar apenas sua família, use a seção Família.':`Esta pessoa passará a ser Membro. ${account.status==='approved'?'Continuará ativa, com acesso aos próprios perfis e aos compartilhados com ela.':'Continuará inativa até que seu acesso seja reativado.'}`):(value==='approved'?(account.role==='admin'?'Esta conta já tem o papel ADMIN. Ao ativá-la, a pessoa poderá gerenciar contas; só verá perfis próprios ou compartilhados.':'A pessoa poderá entrar e acessar os próprios perfis e os compartilhados com ela. Ativar não concede ADMIN.'):'A pessoa ficará inativa e não poderá acessar o painel. O papel ADMIN ou Membro será mantido, mas não dará acesso enquanto a conta estiver inativa.');
  modal(title,`<p class="modal-copy"><b>${esc(account.name||account.email||'Conta sem nome')}</b><br>${esc(account.email||'E-mail não informado')}</p><p class="modal-copy" style="margin-top:14px">${copy}</p><p id="admin-confirm-error" class="form-error" role="alert" hidden></p><div class="modal-actions" style="flex-wrap:wrap"><button class="button secondary" id="admin-back">Voltar à lista</button><button class="button primary" id="admin-confirm">${field==='role'?(value==='admin'?'Conceder ADMIN':'Remover ADMIN'):(value==='approved'?'Ativar acesso':'Suspender acesso')}</button></div>`);
  $('#admin-back').onclick=()=>openAdmin(query);
  $('#admin-confirm').onclick=async()=>{const button=$('#admin-confirm');button.disabled=true;$('#admin-back').disabled=true;try{await updateAdminUser(actorUid,account.id,field,value,{role:account.role,status:account.status});toast('Permissão atualizada.');if($('#admin-confirm')===button&&$('#modal').open)await openAdmin(query);}catch(e){if($('#admin-confirm')!==button||!$('#modal').open)return;formError('#admin-confirm-error',adminError(e));button.disabled=false;$('#admin-back').disabled=false;}};
}
async function openAdmin(query=''){
  if(Store.demo){modal('Gerenciar usuários', '<p class="modal-copy">Você está na demonstração. Nenhuma conta real é consultada ou alterada.</p><div class="settings-group"><h3>Como funcionam os acessos</h3><p class="modal-copy"><b>Membro ativo:</b> acessa os próprios perfis e os compartilhados com ele.<br><b>ADMIN da plataforma:</b> gerencia contas, sem acesso automático aos perfis financeiros.<br><b>ADMIN da família:</b> gerencia os participantes do seu grupo; cada proprietário escolhe o que compartilhar.<br><b>Inativo:</b> não entra no painel até que o acesso seja reativado. Novos cadastros são liberados automaticamente como Membro.</p></div><p class="modal-copy" style="margin-top:16px">Na sua conta ADMIN, abra Família e ajustes → Gerenciar usuários. O primeiro ADMIN precisa ser definido por quem administra o projeto Firebase.</p>');return;}
  let actorUid;try{actorUid=assertAdminAccess();}catch(e){toast(friendlyError(e));return;}
  modal('Gerenciar usuários','<p id="admin-loading" class="loading-inline">Carregando contas cadastradas...</p>');
  const loading=$('#admin-loading');
  try{const snap=await Store.db.collection('users').get();assertAdminAccess(actorUid);if($('#admin-loading')!==loading||!$('#modal').open)return;
    const accounts=snap.docs.map(doc=>({...doc.data(),id:doc.id})).sort((a,b)=>(a.name||a.email||'').localeCompare(b.name||b.email||'','pt-BR'));
    modal('Gerenciar usuários',`<p class="modal-copy">Você está usando uma conta <b>ADMIN</b>. Novos cadastros entram automaticamente como Membro. Suspender bloqueia a entrada; conceder ADMIN permite gerenciar contas, sem liberar finanças privadas. Para escolher ADMIN apenas da família, use a seção Família.</p><label style="margin-top:18px">Buscar por nome ou e-mail<input id="admin-search" type="search" placeholder="Digite o nome ou e-mail" autocomplete="off" value="${esc(query)}"></label><p id="admin-count" class="form-tip" aria-live="polite"></p><div id="admin-list"></div><p class="form-tip" style="margin-top:18px">A lista mostra quem já se cadastrou pelo site. Uma conta criada apenas no Firebase Authentication conclui o cadastro de Membro automaticamente no primeiro login, quando as regras permitem. Sua própria conta não pode ser alterada por aqui.</p>`);
    const paint=()=>{const search=$('#admin-search');if(!search)return;const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();const term=normalize(search.value.trim()),visible=accounts.filter(u=>normalize(`${u.name||''} ${u.email||''}`).includes(term));$('#admin-count').textContent=`${visible.length} de ${accounts.length} conta${accounts.length===1?'':'s'}`;
      $('#admin-list').innerHTML=visible.length?visible.map(u=>{const own=u.id===actorUid,approved=u.status==='approved',admin=u.role==='admin';return `<section class="settings-group"><h3 style="margin-bottom:3px;overflow-wrap:anywhere">${esc(u.name||u.email||'Conta sem nome')}${own?' · Você':''}</h3><p class="modal-copy" style="overflow-wrap:anywhere">${esc(u.email||'E-mail não informado')}</p><div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:8px"><span class="badge ${admin?'pending':'paid'}">${admin?'ADMIN':'Membro'}</span><span class="badge ${approved?'paid':'pending'}">${approved?'Ativo':'Inativo'}</span></div>${own?'<p class="form-tip">Sua conta · permissões protegidas contra alterações próprias.</p>':`<div class="settings-buttons" style="margin-top:13px"><button class="button secondary" data-admin-id="${esc(u.id)}" data-admin-field="status" data-admin-value="${approved?'pending':'approved'}">${approved?'Suspender acesso':'Ativar acesso'}</button><button class="button secondary" data-admin-id="${esc(u.id)}" data-admin-field="role" data-admin-value="${admin?'member':'admin'}" ${!approved&&!admin?'disabled title="Ative o acesso antes de conceder ADMIN"':''}>${admin?'Remover ADMIN':'Conceder ADMIN'}</button></div>${!approved&&!admin?'<p class="form-tip">Para conceder ADMIN, ative o acesso primeiro.</p>':''}`}</section>`;}).join(''):'<p class="empty">Nenhuma conta encontrada. Confira o nome ou e-mail.</p>';
      $$('[data-admin-id]').forEach(button=>button.onclick=()=>{const account=accounts.find(u=>u.id===button.dataset.adminId);if(account)confirmAdminChange(account,button.dataset.adminField,button.dataset.adminValue,search.value);});
    };$('#admin-search').oninput=paint;paint();
  }catch(e){if($('#admin-loading')!==loading||!$('#modal').open)return;modal('Não foi possível carregar usuários',`<p class="modal-copy">${esc(friendlyError(adminError(e)))}</p>`);}
}
async function runProfileForm(form,task,message){
  if(state.busy)return;state.busy=true;
  const dialog=$('#modal'),buttons=[...dialog.querySelectorAll('button,input,select')],preventClose=e=>e.preventDefault();
  buttons.forEach(b=>b.disabled=true);dialog.addEventListener('cancel',preventClose);$('#profile').disabled=true;
  try{await task();dialog.close();render.wasRendered=false;render();toast(message);}catch(e){const error=form.querySelector('[role="alert"]');if(error){error.textContent=friendlyError(e);error.hidden=false;}}
  finally{state.busy=false;buttons.forEach(b=>b.disabled=false);dialog.removeEventListener('cancel',preventClose);$('#profile').disabled=false;}
}
function profileCountSummary(snapshot){return `${snapshot.receitas.length} receitas · ${snapshot.despesas.length} despesas · ${(snapshot.meta.goalsV2||[]).length} metas`;}
async function openProfileOperation(kind){
  Store.assertManage();const sourceId=Store.profile;
  modal(kind==='delete'?'Excluir perfil':'Levar meus dados para outro perfil','<p id="profile-operation-loading" class="loading-inline">Conferindo os dados do perfil...</p>');
  const loading=$('#profile-operation-loading');
  try{
    const snapshot=await Store.profileSnapshot(sourceId);
    if(!$('#modal').open||$('#profile-operation-loading')!==loading)return;
    const label=snapshot.meta.displayName||sourceId;
    if(kind==='delete'){
      modal('Excluir perfil',`<form id="delete-profile-form"><p class="modal-copy">Você vai excluir <b>${esc(label)}</b> e todos os registros deste perfil, de todos os meses. As parcelas futuras também serão removidas. Essa ação não pode ser desfeita.</p><div class="due-footer" style="margin:18px 0"><b>${profileCountSummary(snapshot)}</b></div><p class="modal-copy">Os compartilhamentos deste perfil serão encerrados. Sua conta de acesso será mantida.</p><button class="text-button" type="button" id="download-profile-before-delete">${icon('download')} Baixar uma cópia antes de excluir</button><label style="margin-top:18px">Digite ${esc(label)} para confirmar<input name="confirmation" required autocomplete="off" placeholder="Nome exato do perfil"></label><p id="delete-profile-error" class="form-error" role="alert" hidden></p><div class="modal-actions"><button type="button" class="button secondary" data-action="settings">Voltar</button><button type="submit" class="button danger">${icon('trash')} Excluir perfil</button></div></form>`);
      $('#download-profile-before-delete').onclick=()=>download(JSON.stringify({format:'4j-finance-backup-v4',budgetPlan:Budget.plan(snapshot.meta),budgetMonths:{...(snapshot.meta.budgetMonths||{})},exportedAt:new Date().toISOString(),profile:sourceId,...ProfileOps.payload(snapshot)},null,2),'4J-perfil-backup.json','application/json');
      $('#delete-profile-form').onsubmit=e=>{e.preventDefault();const confirmation=String(new FormData(e.target).get('confirmation'));runProfileForm(e.target,()=>Store.deleteProfile(snapshot,confirmation),'Perfil excluído.');};
      return;
    }
    const targets=Store.profiles.filter(p=>p.id!==sourceId&&(Store.demo||Privacy.canEdit(Store,p)));
    if(!targets.length){modal('Prepare o destino',`<p class="modal-copy">Crie outro perfil ou peça acesso de edição a um perfil existente. Depois, volte aqui para copiar ou mover seus dados.</p><div class="modal-actions"><button class="button secondary" data-action="settings">Voltar</button><button class="button primary" data-action="create-profile">Criar perfil de destino</button></div>`);return;}
    modal('Levar meus dados para outro perfil',`<form id="transfer-profile-form"><p class="modal-copy">Origem: <b>${esc(label)}</b>. Você decide o que vai junto, incluindo registros de todos os meses e parcelas futuras.</p><label style="margin-top:18px">Perfil de destino<select name="target">${targets.map(p=>`<option value="${esc(p.id)}">${esc(p.displayName||p.id)}</option>`).join('')}</select></label><label style="margin-top:18px">Como levar os dados?<select name="mode"><option value="copy">Copiar — manter também na origem</option><option value="move">Mover — retirar da origem após concluir</option></select></label><fieldset style="border:1px solid var(--line);border-radius:12px;padding:14px;margin:18px 0"><legend>O que vai junto</legend><label class="checkbox"><input type="checkbox" name="receitas" checked> Receitas (${snapshot.receitas.length})</label><label class="checkbox"><input type="checkbox" name="despesas" checked> Despesas (${snapshot.despesas.length})</label><label class="checkbox"><input type="checkbox" name="goals" checked> Metas e valores guardados (${(snapshot.meta.goalsV2||[]).length})</label><label class="checkbox"><input type="checkbox" name="categories" checked> Categorias e formas de pagamento personalizadas</label></fieldset><p id="transfer-profile-summary" class="due-footer" aria-live="polite"></p><p class="form-tip">Os dados existentes no destino serão preservados. Repetir uma cópia cria novos lançamentos e metas. Contas e permissões de acesso continuam iguais. O plano do orçamento e as reservas mensais ficam neste perfil; para levá-los, use a cópia JSON e a restauração.</p><label style="margin-top:18px">Confirme a origem: digite ${esc(label)}<input name="confirmation" required autocomplete="off" placeholder="Nome exato do perfil"></label><p id="transfer-profile-error" class="form-error" role="alert" hidden></p><div class="modal-actions"><button type="button" class="button secondary" data-action="settings">Voltar</button><button type="submit" class="button primary" id="transfer-profile-submit">Copiar dados</button></div></form>`);
    const form=$('#transfer-profile-form'),paint=()=>{const f=new FormData(form),move=f.get('mode')==='move';$('#transfer-profile-submit').textContent=move?'Mover dados':'Copiar dados';$('#transfer-profile-summary').textContent=`${f.has('receitas')?snapshot.receitas.length:0} receitas · ${f.has('despesas')?snapshot.despesas.length:0} despesas · ${f.has('goals')?(snapshot.meta.goalsV2||[]).length:0} metas. ${move?'Os itens selecionados serão retirados da origem; o perfil continuará existindo.':'Os itens selecionados continuarão na origem.'}`;};form.onchange=paint;paint();
    form.onsubmit=e=>{e.preventDefault();const f=new FormData(form),mode=f.get('mode'),selection={receitas:f.has('receitas'),despesas:f.has('despesas'),goals:f.has('goals'),categories:f.has('categories')};runProfileForm(form,()=>Store.transferProfile(snapshot,String(f.get('target')),mode,selection,String(f.get('confirmation'))),mode==='move'?'Dados movidos. Confira o perfil de destino.':'Dados copiados. Confira o perfil de destino.');};
  }catch(e){if($('#modal').open&&$('#profile-operation-loading')===loading)modal('Não foi possível preparar a operação',`<p class="form-error" role="alert">${esc(friendlyError(e))}</p><p class="modal-copy">Nada foi alterado. Operações de perfil aceitam até ${ProfileOps.limit} lançamentos em uma única confirmação. Para um perfil maior, baixe o backup e peça à administração uma migração completa.</p><div class="modal-actions"><button class="button secondary" data-action="settings">Voltar</button></div>`);}
}

function renameProfile(){Store.assertManage();modal('Renomear o perfil',`<form id="rename-form"><label>Novo nome<input name="name" required maxlength="60" value="${esc(profileName())}"></label><p class="form-tip">O nome de exibição muda. Os registros e compartilhamentos são mantidos.</p><p id="rename-error" class="form-error" role="alert" hidden></p><div class="modal-actions"><button class="button primary" type="submit">Salvar nome</button></div></form>`);$('#rename-form').onsubmit=e=>{e.preventDefault();const form=e.target,name=new FormData(form).get('name').trim();runForm(form,'#rename-error',async()=>{if(!name||name.length>60)throw new Error('Use um nome de até 60 caracteres.');Store.assertManage();if(Store.demo){Store.meta.displayName=name;Store.emit();return;}await Store.db.collection('profiles').doc(Store.profile).update({displayName:name});},()=>{$('#modal').close();toast('Nome atualizado.');});};}
if(document.modelContext?.registerTool){const lifecycle=new AbortController();const register=t=>Promise.resolve(document.modelContext.registerTool(t,{signal:lifecycle.signal})).catch(e=>console.warn('WebMCP indisponível',e));register({name:'read_finance_month',title:'Consultar resumo mensal',description:'Lê receitas, despesas e saldo previsto do perfil autenticado. Não modifica os dados.',inputSchema:{type:'object',properties:{month:{type:'string',pattern:'^\\d{4}-(0[1-9]|1[0-2])$'}},required:['month'],additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:({month})=>{if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('Mês inválido.');if(Store.screen!=='app'||Store.loading||Store.error)throw new Error('Dados indisponíveis.');return{profile:Store.profile,month,...totals(monthRows(month)),demo:Store.demo};}});register({name:'start_finance_entry',title:'Abrir novo lançamento',description:'Abre o formulário para uma receita ou despesa. O usuário ainda precisa preencher e salvar.',inputSchema:{type:'object',properties:{type:{type:'string',enum:['receita','despesa']}},required:['type'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:async({type})=>{if(!['receita','despesa'].includes(type))throw new Error('Tipo inválido.');Store.assertEdit();state.type=type;state.editId=null;state.page='lancamentos';location.hash='lancamentos';render.wasRendered=false;render();return{status:'form_open',type,saved:false};}});window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});}


});
