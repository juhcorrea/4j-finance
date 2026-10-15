/* Integrate inside DOMContentLoaded, after familyAccessSettings is declared.
   Payment entitlements are read from trusted backend responses or signed Auth claims only. */
const Monetization={
  config:Object.freeze({enabled:false,region:'southamerica-east1',adsEnabled:false,adPageAllowlist:[],...(window.MONETIZATION_CONFIG||{})}),
  uid:'',profile:'',generation:0,phase:'disabled',adFree:false,demoPaid:false,order:null,timer:null,watch:0,refreshing:null,lastRefresh:0,auth:null,channel:null,
  enabled(){return this.config.enabled===true;},
  active(){return Store.screen==='app'&&!!Store.user?.uid&&Store.userDoc?.status==='approved';},
  current(uid){return this.active()&&Store.user.uid===uid&&(Store.demo||Store.auth?.currentUser?.uid===uid);},
  sync(){
    const uid=this.active()?Store.user.uid:'';
    if(uid!==this.uid){this.stop();this.uid=uid;this.generation++;this.phase=this.enabled()?'loading':'disabled';this.adFree=false;this.demoPaid=false;this.order=null;this.refreshing=null;this.lastRefresh=0;}
    if(this.profile!==Store.profile){this.stop();this.profile=Store.profile;}
    if(Store.auth&&Store.auth!==this.auth){this.unsubscribe?.();this.auth=Store.auth;this.unsubscribe=this.auth.onIdTokenChanged(()=>{this.sync();if(this.uid)this.refresh(false);});}
    if(Store.demo&&uid)this.phase=this.demoPaid?'paid':'free';
  },
  async call(name,data={}){
    if(!this.enabled()||Store.demo||!this.current(this.uid))throw new Error('Pagamentos indisponíveis.');
    if(!window.firebase?.functions)throw new Error('Conexão indisponível.');
    return(await firebase.app().functions(this.config.region).httpsCallable(name)(data)).data;
  },
  async refresh(force=false){
    this.sync();if(!this.uid||Store.demo||!this.enabled()){this.paintCard();return;}
    if(this.refreshing)return this.refreshing;
    if(!force&&Date.now()-this.lastRefresh<15000){this.paintCard();return;}
    const uid=this.uid,generation=this.generation;
    const task=(async()=>{
      try{
        const token=await Store.auth.currentUser.getIdTokenResult(force);
        if(!this.current(uid)||generation!==this.generation)return;
        if(token.claims.adFreeLifetime===true){this.adFree=true;this.phase='paid';this.paintCard();}
        const status=await this.call('getMonetizationStatus');
        if(!this.current(uid)||generation!==this.generation)return;
        if(typeof status?.adFreeLifetime!=='boolean'||Number(status.price)!==5||status.currency!=='BRL')throw new Error('Resposta inválida.');
        this.adFree=status.adFreeLifetime;this.phase=this.adFree?'paid':'free';this.lastRefresh=Date.now();
      }catch(error){if(this.current(uid)&&generation===this.generation&&!this.adFree)this.phase='unavailable';}
      finally{if(generation===this.generation){this.paintCard();this.refreshing=null;}}
    })();this.refreshing=task;return task;
  },
  shouldLoadAds(page=location.pathname){return !Store.demo&&this.enabled()&&this.config.adsEnabled===true&&this.current(this.uid)&&this.phase==='free'&&!this.adFree&&Array.isArray(this.config.adPageAllowlist)&&this.config.adPageAllowlist.includes(page);},
  card(){
    const demo=Store.demo,paid=demo?this.demoPaid:this.adFree,preparing=!demo&&!this.enabled(),checking=this.phase==='loading',failed=this.phase==='unavailable';
    return `<div class="monetization-top"><span class="monetization-mark" aria-hidden="true">${paid?'✓':'✦'}</span><div><p class="monetization-eyebrow">SEU 4J FINANCE</p><h3>${paid?'Sem anúncios · ativo':'Mais tranquilidade para seus planos'}</h3></div><span class="monetization-badge">${demo?'Demonstração':paid?'Pagamento único':preparing?'Em preparação':checking?'Conferindo':failed?'Indisponível':'Gratuito'}</span></div><p class="modal-copy">${paid?'Todos os anúncios do Google AdSense no 4J Finance estão removidos para este login, em qualquer dispositivo enquanto você estiver conectado. Sem mensalidade e sem renovação.':preparing?'Estamos preparando o pagamento único de R$ 5,00 para retirar todos os anúncios do Google AdSense no 4J Finance para esta conta. Nenhuma cobrança está disponível agora.':'Use a versão gratuita ou retire todos os anúncios do Google AdSense no 4J Finance para esta conta por R$ 5,00, uma única vez.'}</p>${!paid?'<p class="form-tip">O benefício é permanente para seu login. Não é uma assinatura e não é repassado aos outros membros da família.</p>':''}${demo?'<p class="form-tip">Prévia com pagamento fictício. Nenhum dinheiro é enviado.</p>':''}<div class="settings-buttons"><button type="button" class="button ${paid?'secondary':'primary'}" data-action="monetization-open" ${preparing?'disabled':''}>${paid?'Ver meu benefício':preparing?'Pagamento em preparação':checking?'Ver opção sem anúncios':failed?'Tentar novamente':'Remover anúncios · R$ 5,00'}</button></div>${!paid&&!preparing?'<p class="form-tip">O pagamento é via Pix. A liberação acontece após a confirmação do pagamento.</p>':''}`;
  },
  appendCard(){
    this.sync();const container=$('#modal-content');if(!container)return;let card=$('#monetization-card');
    if(!card){card=document.createElement('section');card.id='monetization-card';card.className='settings-group monetization-card';const summary=container.querySelector('.account-summary');(summary?.parentNode===container?summary:container.firstElementChild)?.insertAdjacentElement('afterend',card);if(!card.isConnected)container.append(card);}
    this.paintCard();this.refresh(false);
  },
  paintCard(){const card=$('#monetization-card');if(card)card.innerHTML=this.card();},
  stop(){clearTimeout(this.timer);this.timer=null;this.watch++;},
  errorText(error){const code=String(error?.code||'').split('/').pop();return({'unauthenticated':'Entre novamente na sua conta para continuar.','permission-denied':'Confirme seu e-mail e confira se sua conta está ativa antes de pagar.','invalid-argument':'Confira o CPF informado. Ele deve ser válido e pertencer ao pagador.','resource-exhausted':'Aguarde um pouco antes de tentar novamente.','failed-precondition':'O pagamento não está disponível para esta conta agora. Confirme seu e-mail ou tente mais tarde.'})[code]||'Não conseguimos conferir o pagamento agora. Nenhum benefício foi liberado sem confirmação. Tente novamente.';},
  frame(title,content){this.stop();modal(title,`<div id="pix-checkout">${content}</div>`);},
  paidScreen(demo=false){this.frame(demo?'Demonstração concluída':'Seu 4J, sem anúncios',`<div class="pix-result"><span class="pix-success" aria-hidden="true">✓</span><h3>${demo?'Assim será a confirmação':'Pagamento confirmado'}</h3><p>${demo?'Esta é apenas uma simulação. Sua conta real não foi alterada.':'Seu benefício permanente está ativo para este login. Ele acompanha você nos outros dispositivos, sem pagar novamente.'}</p></div><div class="pix-summary"><span>Plano</span><b>Sem anúncios</b><span>Cobrança</span><b>Única · R$ 5,00</b><span>Renovação</span><b>Não existe</b></div><p class="form-tip">${demo?'Nenhuma cobrança foi criada.':'Guarde o comprovante do Pix no seu banco. O benefício vale para esta conta, não para toda a família.'}</p><div class="modal-actions"><button type="button" class="button primary" data-action="settings">Voltar aos ajustes</button></div>`);},
  async open(){
    this.sync();if(!this.active())return;
    if(Store.demo){if(this.demoPaid)this.paidScreen(true);else this.demoCheckout();return;}
    if(!this.enabled()){this.frame('Pagamento em preparação','<p class="modal-copy">O pagamento ainda não foi ativado. Nenhuma cobrança pode ser feita agora.</p>');return;}
    const uid=this.uid;this.frame('Remover anúncios','<p class="modal-copy" role="status" id="pix-loading">Conferindo o benefício da sua conta...</p>');
    const marker=$('#pix-loading');await this.refresh(true);
    if(!this.current(uid)||$('#pix-loading')!==marker||!$('#modal').open)return;
    if(this.adFree){this.paidScreen();return;}
    if(this.phase!=='free'){this.frame('Conexão indisponível','<p class="form-error" role="alert">Não conseguimos conferir sua conta. Tente novamente antes de gerar um Pix.</p><div class="modal-actions"><button class="button primary" data-action="monetization-open">Tentar novamente</button></div>');return;}
    if(!Store.auth.currentUser.emailVerified){this.frame('Primeiro, confirme seu e-mail','<p class="modal-copy">Para vincular o pagamento à conta certa, confirme seu e-mail antes de gerar o Pix.</p><p id="pix-verify-message" class="form-tip" role="status"></p><div class="modal-actions"><button class="button secondary" data-action="monetization-send-verification">Enviar confirmação</button><button class="button primary" data-action="monetization-reload-user">Já confirmei</button></div>');return;}
    this.frame('Sem anúncios, de uma vez',`<div class="pix-price"><span>Pagamento único</span><strong>R$ 5<span>,00</span></strong><p>Sem assinatura. Sem renovação.</p></div><p class="modal-copy">Você continua com todos os recursos do 4J Finance e retira todos os anúncios do Google AdSense no site para esta conta, de forma permanente enquanto estiver conectado.</p><form id="pix-payer-form"><label for="pix-cpf">CPF do pagador<input id="pix-cpf" name="cpf" inputmode="numeric" autocomplete="off" maxlength="14" required pattern="[0-9.\\- ]{11,14}" placeholder="000.000.000-00" aria-describedby="pix-cpf-help"></label><p id="pix-cpf-help" class="form-tip">Usado pelo Mercado Pago para processar o Pix; não é salvo no 4J Finance.</p><p id="pix-create-error" class="form-error" role="alert" hidden></p><div class="modal-actions"><button type="button" class="button secondary" data-action="settings">Voltar</button><button type="submit" class="button primary">Gerar Pix de R$ 5,00</button></div></form>`);
    $('#pix-payer-form').onsubmit=event=>{event.preventDefault();this.create(event.currentTarget);};
  },
  async create(form){
    if(!this.current(this.uid))return;const uid=this.uid,watch=this.watch,button=form.querySelector('[type=submit]'),input=form.querySelector('[name=cpf]'),error=form.querySelector('[role=alert]');
    let cpf=input.value.replace(/\D/g,'');if(cpf.length!==11){error.hidden=false;error.textContent='Informe os 11 números do CPF.';return;}
    button.disabled=true;button.textContent='Preparando seu Pix...';error.hidden=true;
    try{
      const request=this.call('createPixCheckout',{cpf});cpf='';input.value='';const order=await request;
      if(!this.current(uid)||watch!==this.watch||!form.isConnected)return;
      if(order.adFreeLifetime===true){await this.confirmPaid(uid);return;}
      if(!order.orderId||Number(order.amount)!==5||order.currency!=='BRL')throw new Error('Resposta inválida.');
      this.order={...order,uid};
      if(order.status==='approved'){this.frame('Conferindo a liberação','<p id="pix-status" class="pix-status" role="status">Pagamento recebido. Aguardando a confirmação do benefício...</p><div class="modal-actions"><button class="button primary" data-action="monetization-check">Conferir confirmação</button></div>');this.watchOrder(this.order);await this.check();return;}
      if(typeof order.qrCode!=='string'||!order.qrCode.trim()||typeof order.qrCodeBase64!=='string'||!/^[a-zA-Z0-9+/=\r\n]+$/.test(order.qrCodeBase64)||order.qrCodeBase64.length>500000)throw new Error('QR indisponível.');
      this.showOrder(this.order);
    }catch(err){if(this.current(uid)&&form.isConnected&&watch===this.watch){error.hidden=false;error.textContent=this.errorText(err);button.disabled=false;button.textContent='Gerar Pix de R$ 5,00';}}
  },
  expiry(order){const value=typeof order.expiresAt==='number'?order.expiresAt:Date.parse(order.expiresAt);return Number.isFinite(value)?value:0;},
  watchOrder(order){this.order={...order,marker:$('#pix-checkout'),watch:this.watch,started:Date.now(),profile:Store.profile,page:location.hash};this.schedule(this.order);},
  showOrder(order){
    const expires=this.expiry(order),label=expires?new Date(expires).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'Veja a validade no aplicativo do banco';
    this.frame('Pague com Pix',`<div class="pix-price pix-price-small"><span>Uma vez, para esta conta</span><strong>R$ 5<span>,00</span></strong></div><p class="modal-copy">No celular, copie o código e escolha <b>Pix Copia e Cola</b> no aplicativo do seu banco. Confira o recebedor e o valor antes de pagar.</p><div class="pix-qr"><img src="data:image/png;base64,${order.qrCodeBase64}" width="224" height="224" alt="QR Code do Pix de cinco reais"></div><label for="pix-copy-code">Código Pix<textarea id="pix-copy-code" readonly rows="3" spellcheck="false">${esc(order.qrCode)}</textarea></label><button type="button" class="button secondary full" data-action="monetization-copy">Copiar código Pix</button><p id="pix-copy-result" class="form-tip" role="status"></p><p class="form-tip">Válido até: ${esc(label)}. Pague apenas uma vez.</p><p id="pix-status" class="pix-status" role="status" aria-live="polite">Aguardando o pagamento. A confirmação é automática.</p><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Conferir depois</button><button type="button" class="button primary" data-action="monetization-check">Já paguei · conferir</button></div>`);
    this.watchOrder(order);
  },
  watching(order){return this.order===order&&this.current(order.uid)&&order.watch===this.watch&&order.marker===$('#pix-checkout')&&$('#modal').open&&order.profile===Store.profile&&order.page===location.hash;},
  schedule(order){clearTimeout(this.timer);if(this.watching(order))this.timer=setTimeout(()=>this.check(order,true),15000);},
  async check(order=this.order,automatic=false){
    if(!order||!this.current(order.uid)||order.checking)return;if(automatic&&!this.watching(order))return;
    const marker=$('#pix-checkout');order.checking=true;const button=marker?.querySelector('[data-action=monetization-check]');if(button)button.disabled=true;
    try{
      const status=await this.call('checkPixCheckout',{orderId:order.orderId});if(!this.current(order.uid))return;
      if(status.adFreeLifetime===true){await this.confirmPaid(order.uid,this.watching(order));return;}
      if(!this.watching(order))return;
      const area=$('#pix-status'),terminal=['rejected','cancelled','refunded','charged_back','expired'].includes(status.status);
      if(terminal){this.stop();area.textContent=status.status==='expired'?'Este Pix expirou. Se você já pagou, confira a confirmação antes de gerar outro.':'Este pagamento não liberou o benefício. Confira a situação no seu banco.';return;}
      const expired=this.expiry(order)&&Date.now()>this.expiry(order),longWait=Date.now()-order.started>30*60*1000;
      if(expired||longWait){this.stop();area.textContent='A consulta automática foi pausada. Se já pagou, toque em “Já paguei · conferir” para consultar novamente.';return;}
      area.textContent=status.status==='approved'?'Pagamento recebido. Finalizando a liberação...':'Ainda aguardando a confirmação do pagamento. Se já pagou, não pague novamente.';this.schedule(order);
    }catch(err){if(this.watching(order)){$('#pix-status').textContent='Não foi possível conferir agora. Se já pagou, não pague novamente; tentaremos conferir outra vez.';this.schedule(order);}}
    finally{order.checking=false;if(button?.isConnected)button.disabled=false;}
  },
  async confirmPaid(uid,show=true){if(!this.current(uid))return;this.adFree=true;this.phase='paid';this.lastRefresh=Date.now();this.stop();try{await Store.auth.currentUser.getIdToken(true);}catch(error){}if(!this.current(uid))return;try{this.channel?.postMessage({type:'refresh'});}catch(error){}try{window.localStorage?.setItem('4j-entitlement-refresh',String(Date.now()));}catch(error){}this.paintCard();if(show)this.paidScreen();},
  async resume(){
    const order=this.order,marker=$('#pix-checkout');await this.refresh(false);
    if(order&&order.marker===marker&&marker===$('#pix-checkout')&&$('#modal').open&&this.current(order.uid)&&order.profile===Store.profile&&order.page===location.hash){
      if(this.adFree){this.paidScreen();return;}order.watch=this.watch;this.check(order);
    }
  },
  demoCheckout(){this.frame('Conheça o pagamento sem anúncios',`<div class="pix-price"><span>Simulação · nenhum pagamento real</span><strong>R$ 5<span>,00</span></strong><p>Pagamento único por login</p></div><div class="pix-demo-art" aria-hidden="true">✦</div><p class="modal-copy">Na versão ativada, esta tela mostrará o QR Code e o Pix Copia e Cola. Depois que o pagamento for confirmado, a conta ficará sem anúncios automaticamente.</p><div class="modal-actions"><button type="button" class="button secondary" data-action="settings">Voltar</button><button type="button" class="button primary" data-action="monetization-demo-confirm">Simular confirmação</button></div>`);},
  async copy(){const code=$('#pix-copy-code');if(!code)return;try{await navigator.clipboard.writeText(code.value);$('#pix-copy-result').textContent='Código copiado. Abra o Pix Copia e Cola no seu banco.';}catch(error){code.focus();code.select();code.setSelectionRange(0,code.value.length);$('#pix-copy-result').textContent='Toque e segure no código selecionado e escolha Copiar.';}},
  install(){
    const originalSettings=familyAccessSettings;familyAccessSettings=function(...args){const value=originalSettings.apply(this,args);Monetization.appendCard();return value;};
    const originalEmit=Store.emit;Store.emit=function(...args){Monetization.sync();return originalEmit.apply(this,args);};
    $('#modal')?.addEventListener('close',()=>this.stop());window.addEventListener('hashchange',()=>this.stop());window.addEventListener('pagehide',()=>this.stop());window.addEventListener('focus',()=>this.resume());document.addEventListener('visibilitychange',()=>{if(document.hidden)this.stop();else this.resume();});
    try{if(window.BroadcastChannel){this.channel=new BroadcastChannel('4j-entitlement-refresh');this.channel.onmessage=()=>this.refresh(true);}}catch(error){}
    document.addEventListener('click',async event=>{
      const action=event.target.closest('[data-action]')?.dataset.action;if(!action?.startsWith('monetization-'))return;
      if(action==='monetization-open')return this.open();if(action==='monetization-copy')return this.copy();
      if(action==='monetization-check'){if(this.order){this.order.watch=this.watch;this.order.marker=$('#pix-checkout');this.order.started=Date.now();}return this.check();}
      if(action==='monetization-demo-confirm'&&Store.demo){this.demoPaid=true;this.phase='paid';return this.paidScreen(true);}
      const message=$('#pix-verify-message');
      if(action==='monetization-send-verification'&&!Store.demo&&this.current(this.uid)){
        const button=event.target.closest('button');button.disabled=true;
        try{await Store.auth.currentUser.sendEmailVerification();if(message?.isConnected)message.textContent='Enviamos o link. Confira sua caixa de entrada e o spam.';}catch(error){if(message?.isConnected)message.textContent='Não foi possível enviar agora. Aguarde um pouco e tente novamente.';}finally{if(button.isConnected)button.disabled=false;}
      }
      if(action==='monetization-reload-user'&&!Store.demo&&this.current(this.uid)){try{await Store.auth.currentUser.reload();await Store.auth.currentUser.getIdToken(true);return this.open();}catch(error){if(message?.isConnected)message.textContent='Não foi possível confirmar o e-mail agora. Tente novamente.';}}
    });
    window.FourJAdPolicy=Object.freeze({shouldLoadAds:page=>this.shouldLoadAds(page)});this.sync();
  }
};
Monetization.install();
