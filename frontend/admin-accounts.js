/* Runs inside the app closure. The server is authoritative for account identity;
   other people's passwords are unavailable and finance records stay untouched. */
const AdminAccounts={
  config:Object.freeze({enabled:false,apiBase:'',...(window.ADMIN_ACCOUNTS_CONFIG||{})}),
  normalize(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();},
  current(uid){return !Store.demo&&Store.user?.uid===uid&&Store.auth?.currentUser?.uid===uid&&Store.userDoc?.role==='admin'&&Store.userDoc?.status==='approved';},
  requireCurrent(uid){if(!this.current(uid))throw new Error('Sua sessão de ADMIN mudou. Entre novamente para continuar.');},
  message(error){
    const notice=error?.targetReauthRequired===true?' A pessoa poderá precisar entrar novamente. Confira o cadastro na lista antes de repetir.':'';
    return this.baseMessage(error)+notice;
  },
  baseMessage(error){
    const code=String(error?.code||'').toLowerCase().replaceAll('_','-');
    if(code.includes('requires-recent-login')||code.includes('recent-auth')||code.includes('reauth'))return 'Confirme sua senha de ADMIN novamente para continuar.';
    if(code.includes('email-already')||code.includes('email-exists'))return 'Esse e-mail já está ligado a outra conta. Confira o endereço.';
    if(code.includes('wrong-password')||code.includes('invalid-credential'))return 'A senha de ADMIN não foi confirmada. Confira e tente novamente.';
    if(code.includes('too-many')||code.includes('rate-limit'))return 'Foram feitas várias tentativas. Aguarde um pouco e tente novamente.';
    if(code.includes('permission')||code.includes('forbidden'))return 'Sua conta não tem permissão para essa alteração. Atualize a sessão e confira o acesso ADMIN.';
    if(code.includes('conflict')||code.includes('stale'))return 'O cadastro mudou enquanto esta tela estava aberta. Volte à lista e confira novamente.';
    if(code.includes('network')||code.includes('timeout')||error?.name==='AbortError')return 'Não foi possível confirmar a resposta. Volte à lista e confira o cadastro antes de tentar novamente.';
    return error?.message||'Não foi possível concluir agora. Volte à lista e tente novamente.';
  },
  async context(uid,targetUid){
    this.requireCurrent(uid);
    if(!targetUid||targetUid===uid)throw new Error('A própria conta ADMIN fica protegida contra alterações por esta tela.');
    const users=Store.db.collection('users'),[actor,target]=await Promise.all([users.doc(uid).get({source:'server'}),users.doc(targetUid).get({source:'server'})]);
    this.requireCurrent(uid);
    if(!actor.exists||actor.data().role!=='admin'||actor.data().status!=='approved')throw new Error('Sua conta não tem mais permissão de ADMIN ativa.');
    if(!target.exists||target.data().role!=='member')throw new Error('A edição por aqui está disponível apenas para contas de Membro. Atualize a lista.');
    if(Store.auth.currentUser.emailVerified!==true)throw new Error('Confirme o e-mail da sua conta ADMIN antes de gerenciar os cadastros.');
    return {...target.data(),id:targetUid};
  },
  apiUrl(operation){
    if(!this.config.enabled||!['lookup','update'].includes(operation))throw new Error('A edição de cadastros ainda não está disponível.');
    const url=new URL(this.config.apiBase,location.href);
    const local=location.hostname==='127.0.0.1'||location.hostname==='localhost';
    const hosted=url.protocol==='https:'&&/^4jfinance-admin-accounts\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname);
    if((!hosted&&!(local&&url.origin===location.origin))||url.username||url.password||url.search||url.hash||url.pathname!=='/api/admin/accounts')throw new Error('O serviço de cadastros não está configurado.');
    return url.href+'/'+operation;
  },
  async call(uid,operation,payload){
    this.requireCurrent(uid);
    const token=await Store.auth.currentUser.getIdToken(true);this.requireCurrent(uid);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    try{
      const response=await fetch(this.apiUrl(operation),{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal,body:JSON.stringify(payload)});
      const result=await response.json();this.requireCurrent(uid);
      if(!response.ok||result?.error){const error=new Error('Não foi possível concluir a operação.');error.code=result?.error?.code||result?.error?.status||result?.code||(response.status===409?'conflict':response.status===403?'permission-denied':'unavailable');error.targetReauthRequired=result?.error?.targetReauthRequired===true;throw error;}
      const data=result?.data||result;
      if(!data?.account||data.account.uid!==payload.uid||typeof data.account.email!=='string')throw new Error('O serviço retornou uma resposta inesperada. Confira o cadastro antes de repetir.');
      return data;
    }finally{clearTimeout(timer);}
  },
  async recent(uid){
    this.requireCurrent(uid);const result=await Store.auth.currentUser.getIdTokenResult();this.requireCurrent(uid);
    const seconds=Number(result.claims?.auth_time),age=Date.now()/1000-seconds;
    return Number.isFinite(seconds)&&age>=-60&&age<=540;
  },
  async prepare(account,query,operation){
    let uid;try{uid=assertAdminAccess();await this.context(uid,account.id);if(!await this.recent(uid)){this.reauthenticate(account,query,operation,uid);return;}}
    catch(error){toast(this.message(error));return;}
    modal('Conferindo o cadastro','<p id="admin-identity-loading" class="loading-inline">Consultando os dados atuais de acesso...</p>');const loading=$('#admin-identity-loading');
    try{
      const result=await this.call(uid,'lookup',{uid:account.id});if($('#admin-identity-loading')!==loading||!$('#modal').open)return;
      const canonical={...account,...result.account,id:account.id,name:result.account.displayName||account.name||''};
      if(operation==='reset')this.reset(canonical,query,uid);else this.edit(canonical,query,uid);
    }catch(error){if($('#admin-identity-loading')!==loading||!$('#modal').open)return;modal('Não foi possível abrir o cadastro',`<p class="form-error" role="alert">${esc(this.message(error))}</p><div class="modal-actions"><button type="button" class="button secondary" id="admin-identity-back">Voltar à lista</button></div>`);$('#admin-identity-back').onclick=()=>openAdmin(query);}
  },
  reauthenticate(account,query,operation,uid){
    modal('Confirme seu acesso ADMIN',`<form id="admin-reauth-form" class="admin-account-form"><p class="modal-copy">Para proteger os cadastros, confirme a senha da <b>sua conta ADMIN</b>. A senha da outra pessoa nunca é solicitada.</p><label for="admin-reauth-password">Sua senha de ADMIN</label><div class="admin-password-control"><input id="admin-reauth-password" name="password" type="password" required autocomplete="current-password"><button type="button" id="admin-reauth-reveal" class="text-button" aria-controls="admin-reauth-password" aria-label="Mostrar senha">Mostrar</button></div><p id="admin-reauth-error" class="form-error" role="alert" hidden></p><div class="modal-actions"><button type="button" class="button secondary" id="admin-identity-back">Voltar à lista</button><button type="submit" class="button primary">Confirmar acesso</button></div></form>`);
    const form=$('#admin-reauth-form'),input=$('#admin-reauth-password'),reveal=$('#admin-reauth-reveal');
    reveal.onclick=()=>{const show=input.type==='password';input.type=show?'text':'password';reveal.textContent=show?'Ocultar':'Mostrar';reveal.setAttribute('aria-label',show?'Ocultar senha':'Mostrar senha');};
    $('#admin-identity-back').onclick=()=>{input.value='';openAdmin(query);};
    form.onsubmit=event=>{event.preventDefault();this.run(form,'#admin-reauth-error',async()=>{
      this.requireCurrent(uid);const user=Store.auth.currentUser,password=input.value;input.value='';input.type='password';
      await user.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(user.email,password));this.requireCurrent(uid);
      if($('#admin-reauth-form')===form&&$('#modal').open)await this.prepare(account,query,operation);
    });};
    input.focus();
  },
  async run(form,errorSelector,task){
    if(form.dataset.busy==='true')return;form.dataset.busy='true';const controls=[...form.querySelectorAll('input,button')],states=controls.map(el=>el.disabled);controls.forEach(el=>el.disabled=true);
    const error=$(errorSelector);if(error)error.hidden=true;
    try{await task();}catch(reason){if(form.isConnected&&$('#modal').open){const target=$(errorSelector);if(target){target.textContent=this.message(reason);target.hidden=false;}}}
    finally{form.dataset.busy='false';controls.forEach((el,i)=>el.disabled=states[i]);}
  },
  edit(account,query,uid,pending=false){
    const oldEmail=String(account.email).toLowerCase();
    modal('Editar cadastro',`<form id="admin-edit-form" class="admin-account-form"><p class="modal-copy">Edite o nome e o e-mail usado para entrar. Os registros e o benefício sem anúncios continuam na mesma conta.</p>${pending?'<p class="form-error" role="alert">O login já foi atualizado, mas a lista de contas ainda não sincronizou. Os campos abaixo mostram os dados atuais do login. Salve novamente para concluir a sincronização.</p>':''}<label for="admin-edit-name">Nome da pessoa</label><input id="admin-edit-name" name="name" required maxlength="80" autocomplete="off" value="${esc(account.name||'')}"><label for="admin-edit-email">E-mail de acesso</label><input id="admin-edit-email" name="email" type="email" required maxlength="254" autocomplete="off" autocapitalize="none" spellcheck="false" value="${esc(oldEmail)}"><div id="admin-email-confirmation" hidden><label for="admin-edit-email-confirm">Repita o novo e-mail</label><input id="admin-edit-email-confirm" name="emailConfirmation" type="email" maxlength="254" autocomplete="off" autocapitalize="none" spellcheck="false"><p class="form-tip">A pessoa passará a entrar com o novo endereço e precisará confirmá-lo para abrir os espaços compartilhados com ele. Os convites enviados ao endereço antigo não são transferidos.</p></div><p id="admin-edit-error" class="form-error" role="alert" hidden></p><div class="modal-actions"><button type="button" class="button secondary" id="admin-identity-back">Voltar à lista</button><button type="submit" class="button primary">Salvar cadastro</button></div></form>`);
    const form=$('#admin-edit-form'),email=$('#admin-edit-email'),confirm=$('#admin-edit-email-confirm');
    const paint=()=>{const changed=email.value.trim().toLowerCase()!==oldEmail;$('#admin-email-confirmation').hidden=!changed;confirm.required=changed;};email.oninput=paint;paint();$('#admin-identity-back').onclick=()=>openAdmin(query);
    form.onsubmit=event=>{event.preventDefault();const name=$('#admin-edit-name').value.trim(),address=email.value.trim().toLowerCase(),confirmation=confirm.value.trim().toLowerCase();this.run(form,'#admin-edit-error',async()=>{
      if(!name||name.length>80)throw new Error('Preencha um nome com até 80 caracteres.');
      if(address!==oldEmail&&address!==confirmation)throw new Error('Os dois campos de e-mail precisam ser iguais.');
      await this.context(uid,account.id);if(!await this.recent(uid))throw Object.assign(new Error(),{code:'recent-auth'});
      const result=await this.call(uid,'update',{uid:account.id,expectedEmail:oldEmail,email:address,displayName:name});
      if($('#admin-edit-form')!==form||!$('#modal').open)return;
      if(result.mirrorPending){this.edit({...account,...result.account,id:account.id,name:result.account.displayName||name},query,uid,true);return;}
      toast('Cadastro atualizado.');await openAdmin(query);
    });};
  },
  reset(account,query,uid){
    modal('Enviar link para redefinir senha?',`<form id="admin-reset-form" class="admin-account-form"><p class="modal-copy">O link será enviado para <b>${esc(account.email)}</b>. A própria pessoa escolherá uma nova senha. A senha atual não pode ser vista por ninguém.</p><p class="form-tip">Enviar o link não altera a senha imediatamente. A pessoa precisa abrir o e-mail e concluir a redefinição.</p><p id="admin-reset-error" class="form-error" role="alert" hidden></p><div class="modal-actions"><button type="button" class="button secondary" id="admin-identity-back">Cancelar</button><button type="submit" class="button primary">Enviar link</button></div></form>`);
    const form=$('#admin-reset-form');$('#admin-identity-back').onclick=()=>openAdmin(query);
    form.onsubmit=event=>{event.preventDefault();this.run(form,'#admin-reset-error',async()=>{
      await this.context(uid,account.id);const current=await this.call(uid,'lookup',{uid:account.id});
      if(current.account.email.toLowerCase()!==account.email.toLowerCase())throw Object.assign(new Error(),{code:'conflict'});
      this.requireCurrent(uid);await Store.auth.sendPasswordResetEmail(current.account.email);this.requireCurrent(uid);
      if($('#admin-reset-form')!==form||!$('#modal').open)return;
      modal('Solicitação enviada',`<p class="modal-copy">O Firebase aceitou a solicitação para <b>${esc(current.account.email)}</b>. Oriente a pessoa a conferir a caixa de entrada e o spam. A entrega do e-mail pode levar alguns minutos.</p><div class="modal-actions"><button type="button" class="button primary" id="admin-identity-back">Voltar à lista</button></div>`);$('#admin-identity-back').onclick=()=>openAdmin(query);
    });};
  },
  async open(query=''){
    if(Store.demo){modal('Gerenciar contas','<p class="modal-copy">Na demonstração, nenhuma conta real é consultada ou alterada. Na sua conta ADMIN, você poderá consultar os cadastros, editar membros e enviar links de redefinição de senha.</p>');return;}
    let uid;try{uid=assertAdminAccess();}catch(error){toast(this.message(error));return;}
    modal('Gerenciar contas','<p id="admin-loading" class="loading-inline">Carregando contas cadastradas...</p>');const loading=$('#admin-loading');
    try{
      const snapshot=await Store.db.collection('users').get({source:'server'});this.requireCurrent(uid);if($('#admin-loading')!==loading||!$('#modal').open)return;
      const accounts=snapshot.docs.map(doc=>({...doc.data(),id:doc.id})).sort((a,b)=>(a.name||a.email||'').localeCompare(b.name||b.email||'','pt-BR'));
      modal('Gerenciar contas',`<p class="modal-copy">Consulte os cadastros e gerencie o acesso à plataforma. <b>Ativo</b> significa acesso permitido; não indica quem está on-line. A administração não abre os dados financeiros de outras famílias.</p><label style="margin-top:18px">Buscar por pessoa, e-mail ou perfil<input id="admin-search" type="search" placeholder="Digite o nome ou e-mail" autocomplete="off" value="${esc(query)}"></label><p id="admin-count" class="form-tip" aria-live="polite"></p><div id="admin-list"></div><p class="form-tip" style="margin-top:18px">A lista mostra quem já criou uma conta no site. Visitantes sem login não informam um e-mail. As ações de cadastro ficam disponíveis para contas de Membro.</p>`);
      const paint=()=>{const search=$('#admin-search');if(!search)return;const term=this.normalize(search.value.trim()),visible=accounts.filter(account=>this.normalize(`${account.name||''} ${account.email||''} ${Store.profiles.filter(profile=>profile.ownerUid===account.id).map(profile=>profile.displayName||profile.id).join(' ')}`).includes(term));$('#admin-count').textContent=`${visible.length} de ${accounts.length} conta${accounts.length===1?'':'s'}`;
        $('#admin-list').innerHTML=visible.length?visible.map(account=>{const own=account.id===uid,approved=account.status==='approved',admin=account.role==='admin';return `<section class="settings-group"><h3 style="margin-bottom:3px;overflow-wrap:anywhere">${esc(account.name||account.email||'Conta sem nome')}${own?' · Você':''}</h3><p class="modal-copy" style="overflow-wrap:anywhere">${esc(account.email||'E-mail não informado')}</p>${adminOwnedProfiles(account)}<div class="admin-account-badges"><span class="badge ${admin?'pending':'paid'}">${admin?'ADMIN':'Membro'}</span><span class="badge ${approved?'paid':'pending'}">${approved?'Ativo':'Inativo'}</span></div>${own?'<p class="form-tip">Sua conta ADMIN fica protegida contra alterações por esta tela.</p>':`<div class="settings-buttons admin-account-actions">${!admin&&this.config.enabled?`<button type="button" class="button primary" data-account-id="${esc(account.id)}" data-account-operation="edit">Editar cadastro</button><button type="button" class="button secondary" data-account-id="${esc(account.id)}" data-account-operation="reset">Redefinir senha</button>`:''}<button type="button" class="button secondary" data-admin-id="${esc(account.id)}" data-admin-field="status" data-admin-value="${approved?'pending':'approved'}">${approved?'Suspender acesso':'Ativar acesso'}</button><button type="button" class="button secondary" data-admin-id="${esc(account.id)}" data-admin-field="role" data-admin-value="${admin?'member':'admin'}" ${!approved&&!admin?'disabled title="Ative o acesso antes de conceder ADMIN"':''}>${admin?'Remover ADMIN':'Conceder ADMIN'}</button></div>${admin?'<p class="form-tip">O nome, o e-mail e a senha de outras contas ADMIN não são alterados por aqui.</p>':!approved?'<p class="form-tip">Para conceder ADMIN, ative o acesso primeiro.</p>':''}`}</section>`;}).join(''):'<p class="empty">Nenhuma conta encontrada. Confira o nome ou e-mail.</p>';
        $$('[data-admin-id]').forEach(button=>button.onclick=()=>{const account=accounts.find(item=>item.id===button.dataset.adminId);if(account)confirmAdminChange(account,button.dataset.adminField,button.dataset.adminValue,search.value);});
        $$('[data-account-id]').forEach(button=>button.onclick=()=>{const account=accounts.find(item=>item.id===button.dataset.accountId);if(account)this.prepare(account,search.value,button.dataset.accountOperation);});
      };$('#admin-search').oninput=paint;paint();
    }catch(error){if($('#admin-loading')!==loading||!$('#modal').open)return;modal('Não foi possível carregar as contas',`<p class="form-error" role="alert">${esc(this.message(adminError(error)))}</p>`);}
  }
};
openAdmin=query=>AdminAccounts.open(query);

/* Repair only the current account's display e-mail from its own signed token.
   Rules require equality with request.auth.token.email; no role/name rewrites. */
const adminIdentityApply=AccountSignup.apply,adminIdentitySyncing=new Set();
AccountSignup.apply=function(store,uid,account){
  const result=adminIdentityApply.call(this,store,uid,account),user=store.auth?.currentUser;
  if(store.demo||!user||user.uid!==uid||store.user?.uid!==uid||!account||adminIdentitySyncing.has(uid))return result;
  const email=String(user.email||'').trim().toLowerCase();
  if(!email||String(account.email||'').toLowerCase()===email)return result;
  adminIdentitySyncing.add(uid);
  (async()=>{
    const token=await user.getIdTokenResult(true);
    if(store.auth?.currentUser!==user||store.user?.uid!==uid||String(token.claims?.email||'').toLowerCase()!==email)return;
    const ref=store.db.collection('users').doc(uid);
    await store.db.runTransaction(async transaction=>{
      if(store.auth?.currentUser!==user||store.user?.uid!==uid)return;
      const snapshot=await transaction.get(ref);
      if(snapshot.exists&&String(snapshot.data().email||'').toLowerCase()!==email)transaction.update(ref,{email});
    });
  })().catch(()=>{}).finally(()=>adminIdentitySyncing.delete(uid));
  return result;
};
