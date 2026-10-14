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
    store.screen='app';store.watchProfiles();
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
