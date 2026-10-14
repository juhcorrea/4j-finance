/* Optional families. A family role never grants access to a private profile. */
const FamilyGroups={
  limit:50,
  email(value){return String(value||'').trim().toLowerCase();},
  verified(store){return !!(store.demo||store.user?.emailVerified);},
  isMember(store,family){if(!store.user||!family)return false;return family.ownerUid===store.user.uid||(this.verified(store)&&(family.memberEmails||[]).includes(this.email(store.user.email)));},
  canManage(store,family){return this.isMember(store,family)&&(family.ownerUid===store.user.uid||(family.adminEmails||[]).includes(this.email(store.user.email)));},
  canRead(store,meta){if(!['view','edit'].includes(meta?.familyAccess)||!meta?.familyId)return false;const family=(store.families||[]).find(f=>f.id===meta.familyId);return this.isMember(store,family);},
  canEdit(store,meta){return meta?.familyAccess==='edit'&&this.canRead(store,meta);},
  profileQueries(store,collection){return(store.families||[]).filter(f=>this.isMember(store,f)).map(f=>collection.where('familyId','==',f.id).where('familyAccess','in',['view','edit']));},
  clean(store){store.familyEpoch=(store.familyEpoch||0)+1;store.familyListeners=store.familyListeners||[];store.familyListeners.splice(0).forEach(stop=>stop());store.familyWatchKey='';store.families=[];store.familiesLoading=false;store.familyError='';},
  watch(store){
    if(!store.user)return this.clean(store);
    if(store.demo){store.families=store.families||[];store.familiesLoading=false;return;}
    const key=store.user.uid+':'+this.email(store.user.email)+':'+this.verified(store);
    if(store.familyWatchKey===key)return;
    this.clean(store);store.familyWatchKey=key;store.familiesLoading=true;
    const epoch=store.familyEpoch,uid=store.user.uid,collection=store.db.collection('families'),queries=[collection.where('ownerUid','==',uid)],snapshots=new Map();
    if(this.verified(store))queries.push(collection.where('memberEmails','array-contains',this.email(store.user.email)));
    let accessSignature='';
    const live=()=>store.user?.uid===uid&&store.familyEpoch===epoch&&store.familyWatchKey===key;
    queries.forEach((query,i)=>store.familyListeners.push(query.onSnapshot(snapshot=>{
      if(!live())return;snapshots.set(i,snapshot.docs.map(doc=>({...doc.data(),id:doc.id})));
      if(snapshots.size!==queries.length)return;
      const merged=new Map();snapshots.forEach(rows=>rows.forEach(row=>merged.set(row.id,row)));
      store.families=[...merged.values()].filter(f=>this.isMember(store,f)).sort((a,b)=>String(a.name).localeCompare(String(b.name),'pt-BR'));
      store.familiesLoading=false;store.familyError='';
      const signature=JSON.stringify(store.families.map(f=>[f.id,f.ownerUid,f.memberEmails,f.adminEmails]).sort((a,b)=>a[0].localeCompare(b[0])));
      if(signature!==accessSignature){accessSignature=signature;if(store.screen==='app')store.watchProfiles();}
      store.emit();this.refreshOpen(store);
    },()=>{
      if(!live())return;
      // Discard possibly revoked family access; personal profile access is independent.
      snapshots.delete(i);store.families=[];store.familiesLoading=false;store.familyError='Não foi possível carregar suas famílias. Confira a conexão e as regras do Firebase.';
      if(store.screen==='app')store.watchProfiles();store.emit();this.refreshOpen(store);
    })));
  },
  name(value){const name=String(value||'').trim();if(!name||name.length>60)throw new Error('Escolha um nome de 1 a 60 caracteres para a família.');return name;},
  validate(family){
    this.name(family.name);
    if(!family.ownerUid||!this.email(family.ownerEmail))throw new Error('Proprietário da família inválido.');
    const members=family.memberEmails,admins=family.adminEmails;
    if(!Array.isArray(members)||!Array.isArray(admins)||members.length>this.limit||new Set(members).size!==members.length||new Set(admins).size!==admins.length||!members.includes(family.ownerEmail)||admins.some(email=>!members.includes(email))||members.some(email=>email!==this.email(email)||!/^\S+@\S+\.\S+$/.test(email)||email.length>254))throw new Error('Confira os integrantes da família. São permitidos até '+this.limit+' e-mails diferentes.');
    return family;
  },
  actor(store){if(!store.user||(!store.demo&&store.userDoc?.status!=='approved'))throw new Error('Entre em uma conta ativa para continuar.');return{uid:store.user.uid,email:this.email(store.user.email)};},
  assertActor(store,actor){if(store.user?.uid!==actor.uid||(!store.demo&&store.auth?.currentUser?.uid!==actor.uid))throw new Error('A conta mudou. Entre novamente e reabra esta janela.');},
  async account(tx,store,actor){this.assertActor(store,actor);const snapshot=await tx.get(store.db.collection('users').doc(actor.uid));this.assertActor(store,actor);if(!snapshot.exists||snapshot.data().status!=='approved')throw new Error('Sua conta precisa estar ativa para continuar.');},
  async create(store,value){
    if(!this.verified(store))throw new Error('Confirme seu e-mail antes de criar uma família. Abra os ajustes para enviar ou conferir a confirmação.');
    const actor=this.actor(store),family=this.validate({name:this.name(value),ownerUid:actor.uid,ownerEmail:actor.email,memberEmails:[actor.email],adminEmails:[]});
    if(store.demo){const id=crypto.randomUUID();store.families=[...(store.families||[]),{...family,id,createdAt:new Date().toISOString()}];store.emit();return id;}
    const ref=store.db.collection('families').doc();
    await store.db.runTransaction(async tx=>{await this.account(tx,store,actor);tx.set(ref,{...family,createdAt:firebase.firestore.FieldValue.serverTimestamp()});});
    this.assertActor(store,actor);return ref.id;
  },
  async update(store,id,mutator){
    const actor=this.actor(store);
    const change=family=>{if(!this.canManage(store,family))throw new Error('Apenas o proprietário ou um administrador desta família pode alterar os integrantes.');const next=this.validate(mutator(structuredClone(family)));if(next.ownerUid!==family.ownerUid||next.ownerEmail!==family.ownerEmail)throw new Error('O proprietário da família não pode ser alterado aqui.');return{name:this.name(next.name),memberEmails:next.memberEmails,adminEmails:next.adminEmails};};
    if(store.demo){const family=(store.families||[]).find(f=>f.id===id);if(!family)throw new Error('Família não encontrada.');Object.assign(family,change(family));store.emit();return;}
    const ref=store.db.collection('families').doc(id);
    await store.db.runTransaction(async tx=>{await this.account(tx,store,actor);const snapshot=await tx.get(ref);this.assertActor(store,actor);if(!snapshot.exists)throw new Error('Família não encontrada.');tx.update(ref,change(snapshot.data()));});
    this.assertActor(store,actor);
  },
  async member(store,id,value,role){
    const email=this.email(value);
    if(!/^\S+@\S+\.\S+$/.test(email)||email.length>254)throw new Error('Digite um e-mail válido.');
    if(!['member','admin','remove'].includes(role))throw new Error('Escolha o tipo de acesso.');
    return this.update(store,id,family=>{
      if(email===family.ownerEmail)throw new Error('O proprietário sempre mantém a administração da família.');
      family.memberEmails=family.memberEmails.filter(e=>e!==email);family.adminEmails=family.adminEmails.filter(e=>e!==email);
      if(role!=='remove')family.memberEmails.push(email);if(role==='admin')family.adminEmails.push(email);return family;
    });
  },
  async shareProfile(store,profileId,familyId,access){
    const actor=this.actor(store);familyId=String(familyId||'');
    if(!['','view','edit'].includes(access)||(!familyId&&access)||(familyId&&!access))throw new Error('Escolha a família e o tipo de acesso.');
    const check=(meta,family)=>{if(meta.ownerUid!==actor.uid)throw new Error('Somente o proprietário pode compartilhar este perfil.');if(familyId&&!this.isMember(store,family))throw new Error('Você precisa fazer parte da família escolhida.');};
    if(store.demo){const space=store.demoSpaces[profileId];if(!space)throw new Error('Perfil não encontrado.');check(space.meta,(store.families||[]).find(f=>f.id===familyId));Object.assign(space.meta,{familyId,familyAccess:access});if(store.profile===profileId)store.meta=space.meta;store.refreshDemoProfiles();return;}
    const ref=store.db.collection('profiles').doc(profileId);
    await store.db.runTransaction(async tx=>{await this.account(tx,store,actor);const profile=await tx.get(ref),family=familyId?await tx.get(store.db.collection('families').doc(familyId)):null;this.assertActor(store,actor);if(!profile.exists)throw new Error('Perfil não encontrado.');if(familyId&&!family?.exists)throw new Error('Família não encontrada.');check(profile.data(),family?.data());tx.update(ref,{familyId,familyAccess:access});});
    this.assertActor(store,actor);
  },
  renderSettings(store){
    const families=store.families||[],selected=store.meta?.familyId&&families.find(f=>f.id===store.meta.familyId);
    return `<div class="settings-group family-settings"><div class="family-section-heading"><div><span class="eyebrow">JUNTOS, SE VOCÊ QUISER</span><h3>Sua família no 4J</h3></div><span class="family-mini-icon" aria-hidden="true">⌂</span></div><p class="modal-copy">Use seu espaço sozinho ou crie uma família. Só os perfis que você compartilhar ficam visíveis para os integrantes.</p>${store.familiesLoading?'<p class="form-tip" role="status">Carregando famílias…</p>':''}${store.familyError?`<p class="form-error" role="alert">${esc(store.familyError)}</p>`:''}<div class="family-group-list">${families.map(f=>`<button class="family-group-card" data-family-action="open" data-family-id="${esc(f.id)}"><span><b>${esc(f.name)}</b><small>${f.memberEmails.length} integrante(s) · ${f.ownerUid===store.user?.uid?'Proprietário':this.canManage(store,f)?'ADMIN desta família':'Integrante'}</small></span><span aria-hidden="true">→</span></button>`).join('')}</div><div class="settings-buttons"><button class="button secondary" data-family-action="create">Criar uma família</button>${store.profile&&store.meta?.ownerUid===store.user?.uid?'<button class="button secondary" data-family-action="share">Compartilhar este perfil com uma família</button>':''}</div>${store.profile?`<p class="form-tip family-profile-note">Este perfil: <b>${selected?`compartilhado com ${esc(selected.name)} (${store.meta.familyAccess==='edit'?'visualizar e editar':'somente visualizar'})`:store.meta?.familyId?'compartilhamento com uma família configurado':'sem compartilhamento por família'}</b>.${(store.meta.sharedView?.length||store.meta.sharedEdit?.length)?' Há também acessos individuais por e-mail.':''}</p>`:''}<p class="form-tip">ADMIN da família organiza integrantes e escolhe outros administradores. Esse cargo não abre os perfis particulares de ninguém.</p></div>`;
  },
  createForm(){modal('Uma família, no seu ritmo',`<form id="family-group-create-form"><p class="modal-copy">Criar uma família é opcional. Seus perfis continuam particulares até você escolher compartilhá-los.</p><label>Nome da família<input name="name" required maxlength="60" placeholder="Ex.: Nossa família" autocomplete="off"></label><p class="form-tip">Você será o proprietário. Depois poderá adicionar integrantes e escolher administradores.</p><p id="family-group-create-error" class="form-error" role="alert" hidden></p><div class="modal-actions"><button class="button secondary" type="button" data-action="settings">Voltar</button><button class="button primary" type="submit">Criar minha família</button></div></form>`);},
  open(store,id){
    const family=(store.families||[]).find(f=>f.id===id);
    if(!family||!this.isMember(store,family)){modal('Família indisponível','<p class="modal-copy">Seu acesso a esta família mudou. Volte aos ajustes para conferir seus espaços.</p><button class="button secondary" data-action="settings">Voltar aos ajustes</button>');return;}
    const manage=this.canManage(store,family);
    modal('Sua família',`<section data-family-open="${esc(id)}"><div class="family-detail-heading"><h3>${esc(family.name)}</h3><span class="badge ${manage?'paid':'pending'}">${family.ownerUid===store.user.uid?'Proprietário':manage?'ADMIN da família':'Integrante'}</span></div><p class="modal-copy">Os integrantes só acessam os perfis compartilhados com esta família. Cada pessoa mantém o controle dos próprios perfis.</p>${manage?`<form id="family-group-name-form" data-family-id="${esc(id)}"><label>Nome da família<input name="name" value="${esc(family.name)}" required maxlength="60"></label><p id="family-group-name-error" class="form-error" role="alert" hidden></p><button type="submit" class="text-button">Salvar nome</button></form>`:''}<div class="settings-group"><h3>Quem faz parte</h3><div class="family-member-list">${family.memberEmails.map(email=>`<div class="family-member"><div><b>${esc(email)}</b><small>${email===family.ownerEmail?'Proprietário · administração permanente':family.adminEmails.includes(email)?'ADMIN da família':'Integrante'}</small></div>${manage&&email!==family.ownerEmail?`<button class="text-button" data-family-action="member" data-family-id="${esc(id)}" data-family-email="${esc(email)}">Alterar acesso</button>`:''}</div>`).join('')}</div>${manage?`<button class="button secondary full" data-family-action="member" data-family-id="${esc(id)}">Adicionar integrante</button>`:''}</div><p class="form-tip">O acesso funciona quando a pessoa entra no 4J e confirma o e-mail cadastrado. Não enviamos convites por e-mail automaticamente.</p><p class="form-tip">Remover um integrante encerra o acesso pela família. Compartilhamentos individuais por e-mail, se existirem, precisam ser removidos no próprio perfil. Os dados que a pessoa já baixou permanecem com ela.</p><div class="modal-actions"><button class="button primary" data-action="settings">Voltar aos ajustes</button></div></section>`);
  },
  memberForm(store,id,value=''){
    const family=(store.families||[]).find(f=>f.id===id);if(!family||!this.canManage(store,family))return;
    const email=this.email(value),existing=family.memberEmails.includes(email),role=family.adminEmails.includes(email)?'admin':'member';
    modal(existing?'Acesso na família':'Adicionar à família',`<form id="family-group-member-form" data-family-id="${esc(id)}"><p class="modal-copy">${esc(family.name)}</p><label>E-mail do integrante<input name="email" type="email" required maxlength="254" autocomplete="email" value="${esc(email)}" ${existing?'readonly':''} placeholder="pessoa@exemplo.com"></label><label>O que essa pessoa pode fazer?<select name="role"><option value="member" ${role==='member'?'selected':''}>Integrante</option><option value="admin" ${role==='admin'?'selected':''}>ADMIN desta família</option>${existing?'<option value="remove">Remover da família</option>':''}</select></label><p class="form-tip">Um ADMIN pode adicionar ou remover integrantes e escolher outros administradores. Os perfis particulares continuam protegidos. Os perfis compartilhados seguem a permissão escolhida por seu proprietário.</p><p id="family-group-member-error" class="form-error" role="alert" hidden></p><div class="modal-actions"><button class="button secondary" type="button" data-family-action="open" data-family-id="${esc(id)}">Voltar</button><button class="button primary" type="submit">${existing?'Salvar acesso':'Adicionar integrante'}</button></div></form>`);
  },
  shareForm(store){
    if(!store.profile||store.meta?.ownerUid!==store.user?.uid)return;
    const families=(store.families||[]).filter(f=>this.isMember(store,f)),current=store.meta.familyId||'',access=store.meta.familyAccess||'view';
    modal('Você escolhe o que compartilhar',`<form id="family-group-share-form" data-profile="${esc(store.profile)}"><p class="modal-copy">Perfil: <b>${esc(store.meta.displayName||store.profile)}</b>. O compartilhamento inclui seus lançamentos, metas e relatórios deste perfil.</p><label>Compartilhar este perfil com<select name="familyId" id="family-group-share-select"><option value="">Não compartilhar por família</option>${families.map(f=>`<option value="${esc(f.id)}" ${current===f.id?'selected':''}>${esc(f.name)}</option>`).join('')}</select></label>${current&&!families.some(f=>f.id===current)?'<p class="form-tip">Você não faz mais parte da família anterior. Pode remover esse compartilhamento ou escolher outra família.</p>':''}<label>Permissão dos integrantes<select name="access" id="family-group-share-access" ${!current?'disabled':''}><option value="view" ${access==='view'?'selected':''}>Somente visualizar</option><option value="edit" ${access==='edit'?'selected':''}>Visualizar e editar lançamentos e metas</option></select></label><p class="form-tip">Integrantes atuais e futuros desta família terão essa permissão. Só você, proprietário, pode mudar o compartilhamento ou excluir o perfil.</p><p class="form-tip">Esta escolha não altera os acessos individuais por e-mail.</p><p id="family-group-share-error" class="form-error" role="alert" hidden></p><div class="modal-actions"><button class="button secondary" type="button" data-action="settings">Voltar</button><button class="button primary" type="submit">Salvar compartilhamento</button></div></form>`);
  },
  refreshOpen(store){const open=document.querySelector('[data-family-open]');if(open&&!document.querySelector('#family-group-name-form input:focus')&&!state.busy)this.open(store,open.dataset.familyOpen);},
  bindSettings(){
    document.addEventListener('click',event=>{const button=event.target.closest('[data-family-action]');if(!button)return;const action=button.dataset.familyAction,id=button.dataset.familyId;if(action==='create')this.createForm();if(action==='open')this.open(Store,id);if(action==='member')this.memberForm(Store,id,button.dataset.familyEmail);if(action==='share')this.shareForm(Store);});
    document.addEventListener('change',event=>{if(event.target.id==='family-group-share-select'){const input=document.querySelector('#family-group-share-access');if(input)input.disabled=!event.target.value;}});
    document.addEventListener('submit',event=>{
      const form=event.target,actions=['family-group-create-form','family-group-name-form','family-group-member-form','family-group-share-form'];if(!actions.includes(form.id))return;event.preventDefault();const values=new FormData(form),id=form.dataset.familyId,uid=Store.user?.uid;let createdId='';
      const error='#'+form.id.replace('-form','-error');
      runForm(form,error,async()=>{
        if(form.id==='family-group-create-form')createdId=await this.create(Store,values.get('name'));
        if(form.id==='family-group-name-form')await this.update(Store,id,f=>({...f,name:this.name(values.get('name'))}));
        if(form.id==='family-group-member-form')await this.member(Store,id,values.get('email'),values.get('role'));
        if(form.id==='family-group-share-form'){if(form.dataset.profile!==Store.profile)throw new Error('O perfil mudou. Reabra esta janela.');const familyId=values.get('familyId');await this.shareProfile(Store,form.dataset.profile,familyId,familyId?values.get('access'):'');}
      },()=>{
        if(Store.user?.uid!==uid)return;
        if(form.id==='family-group-create-form'){if((Store.families||[]).some(f=>f.id===createdId))this.open(Store,createdId);else settings();toast('Família criada. Agora você pode adicionar integrantes.');}
        else if(form.id==='family-group-share-form'){settings();toast('Compartilhamento da família atualizado.');}
        else{this.open(Store,id);toast('Família atualizada.');}
      });
    });
  }
};
FamilyGroups.bindSettings();
