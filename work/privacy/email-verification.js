/* Email ownership is required for sharing; personal profiles remain available. */
const EmailVerification={
  sessions:new WeakMap(),
  verified(store=Store){return store.demo||store.user?.emailVerified===true;},
  state(store=Store){const user=store.user;if(!user)return {busy:false,message:'',error:false};if(!this.sessions.has(user))this.sessions.set(user,{busy:false,message:'',error:false});return this.sessions.get(user);},
  capture(store){
    if(store.demo)throw new Error('Na demonstração não enviamos e-mails. Entre na sua conta para confirmar seu endereço.');
    const user=store.user,auth=store.auth;
    if(!user?.uid||!user.email||auth?.currentUser!==user)throw Object.assign(new Error('A conta conectada mudou. Entre novamente para continuar.'),{code:'auth/user-changed'});
    return {user,auth,email:user.email};
  },
  active(store,session){return store.auth===session.auth&&store.user===session.user&&session.auth.currentUser===session.user&&session.user.email===session.email;},
  assertActive(store,session){if(!this.active(store,session))throw Object.assign(new Error('A conta conectada mudou. Entre novamente para continuar.'),{code:'auth/user-changed'});},
  errorMessage(error){
    if(error?.code==='auth/too-many-requests')return 'Já enviamos algumas solicitações. Aguarde um pouco e confira também a pasta de spam antes de tentar novamente.';
    if(error?.code==='auth/network-request-failed')return 'Não foi possível conectar. Confira sua internet e tente novamente.';
    if(error?.code==='auth/user-changed')return 'A conta conectada mudou. Entre novamente para continuar.';
    if(['auth/user-token-expired','auth/invalid-user-token','auth/user-disabled'].includes(error?.code))return 'Entre novamente na sua conta para confirmar o e-mail.';
    return 'Não foi possível concluir agora. Tente novamente em alguns instantes.';
  },
  async perform(store,operation){
    const session=this.capture(store),status=this.state(store);
    if(status.busy)throw new Error('Aguarde a confirmação anterior terminar.');
    status.busy=true;status.message='';status.error=false;this.sync(store);
    try{
      const result=await operation(session);
      this.assertActive(store,session);status.message=result.message;
      return result;
    }catch(error){if(this.active(store,session)){status.error=true;status.message=this.errorMessage(error);}throw error;}
    finally{status.busy=false;if(this.active(store,session))this.sync(store);}
  },
  async send(store=Store){
    return this.perform(store,async session=>{
      if(session.user.emailVerified===true)return {verified:true,message:'Seu e-mail já está confirmado.'};
      session.auth.languageCode='pt-BR';
      await session.user.sendEmailVerification();
      this.assertActive(store,session);
      return {verified:false,message:'Link enviado. Abra seu e-mail, confirme o endereço e volte aqui para tocar em “Já confirmei”. Confira também a pasta de spam.'};
    });
  },
  async reload(store=Store){
    return this.perform(store,async session=>{
      await session.user.reload();this.assertActive(store,session);
      await session.user.getIdToken(true);this.assertActive(store,session);
      store.user=session.auth.currentUser;
      if(store.screen==='app'&&store.userDoc?.status==='approved'){
        // The integration hook restarts family membership and profile queries.
        if(typeof store.refreshSharedAccess==='function')await store.refreshSharedAccess();
        else if(typeof store.watchProfiles==='function')store.watchProfiles();
        this.assertActive(store,session);
      }
      if(typeof store.emit==='function')store.emit();
      const verified=session.user.emailVerified===true;
      return {verified,message:verified?'E-mail confirmado. Você já pode participar de famílias e acessar os perfis compartilhados com você.':'Ainda não apareceu a confirmação. Abra o link recebido no seu e-mail e depois toque em “Já confirmei” novamente.'};
    });
  },
  renderSettings(store=Store){
    if(!store.user)return '';
    if(store.demo)return '<section id="email-verification-card" class="settings-group email-verification-card"><h3>Confirmação do e-mail</h3><p class="modal-copy">Na sua conta, confirme seu e-mail para criar ou participar de famílias e usar o compartilhamento. Nesta demonstração nenhum e-mail é enviado.</p></section>';
    const verified=this.verified(store),status=this.state(store),disabled=status.busy?'disabled':'';
    const actions=verified?(status.error?`<div class="settings-buttons email-verification-actions"><button type="button" class="button secondary" data-action="refresh-email-verification" ${disabled}>Atualizar confirmação</button></div>`:''):`<div class="settings-buttons email-verification-actions"><button type="button" class="button primary" data-action="send-verification-email" ${disabled}>${status.busy?'Aguarde...':'Enviar link de confirmação'}</button><button type="button" class="button secondary" data-action="refresh-email-verification" ${disabled}>Já confirmei</button></div><p class="form-tip">Abra o link no seu e-mail e volte aqui. Não é preciso aprovação de um administrador.</p>`;
    return `<section id="email-verification-card" class="settings-group email-verification-card" aria-busy="${status.busy}"><div class="email-verification-title"><h3>Seu e-mail</h3><span class="badge ${verified?'paid':'pending'}">${verified?'Confirmado':'Confirmação pendente'}</span></div><p class="email-verification-address">${esc(store.user.email||'')}</p><p class="modal-copy">${verified?'Endereço confirmado. Você decide se quer compartilhar seus perfis ou participar de uma família.':'Você já pode cuidar dos seus perfis pessoais. Para criar ou participar de famílias e acessar perfis compartilhados, confirme que este e-mail é seu.'}</p>${actions}<p id="email-verification-status" class="${status.error?'form-error':'form-tip'}" role="${status.error?'alert':'status'}" ${status.message?'':'hidden'}>${esc(status.message)}</p></section>`;
  },
  banner(store=Store){
    if(store.demo||!store.user||store.screen!=='app'||this.verified(store))return '<div id="email-verification-banner" hidden></div>';
    return '<div id="email-verification-banner" class="email-verification-banner" role="status"><div><b>Seu espaço pessoal já está disponível.</b><span>Confirme seu e-mail para participar de famílias e usar perfis compartilhados.</span></div><button type="button" class="button secondary" data-action="settings">Confirmar meu e-mail</button></div>';
  },
  sync(store=Store){
    const card=document.querySelector('#email-verification-card');if(card)card.outerHTML=this.renderSettings(store);
    const banner=document.querySelector('#email-verification-banner');if(banner)banner.outerHTML=this.banner(store);
  }
};
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-action="send-verification-email"], [data-action="refresh-email-verification"]');
  if(!button||button.disabled)return;
  event.preventDefault();
  const user=Store.user,auth=Store.auth;
  try{
    const result=await (button.dataset.action==='send-verification-email'?EmailVerification.send(Store):EmailVerification.reload(Store));
    if(Store.user!==user||Store.auth!==auth||auth?.currentUser!==user)return;
    toast(result.verified?'E-mail confirmado.':button.dataset.action==='send-verification-email'?'Link enviado. Confira seu e-mail.':'Confira o link de confirmação no seu e-mail.');
  }catch(error){
    if(Store.user!==user||Store.auth!==auth||auth?.currentUser!==user)return;
    toast(EmailVerification.errorMessage(error));
  }
});
