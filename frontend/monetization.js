/* Integrate inside DOMContentLoaded, after familyAccessSettings is declared.
   Cloudflare entitlements come from the backend; signed Auth claim fallback is legacy Firebase only. */
const Monetization={
  config:Object.freeze({enabled:false,pilotEnabled:false,publicPayments:false,provider:'firebase',apiBase:'/api/pix',region:'southamerica-east1',adsEnabled:false,adPageAllowlist:[],...(window.MONETIZATION_CONFIG||{})}),
  uid:'',profile:'',generation:0,phase:'disabled',adFree:false,demoPaid:false,paymentsEnabled:false,pendingOrderId:null,order:null,timer:null,watch:0,refreshing:null,lastRefresh:0,auth:null,channel:null,
  enabled(){return this.config.enabled===true;},
  validOrderId(value){return typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);},
  terminal(status){return ['rejected','cancelled','refunded','charged_back','expired'].includes(status);},
  canCreate(){return this.enabled()&&this.phase==='free'&&this.paymentsEnabled===true&&!this.adFree;},
  active(){return Store.screen==='app'&&!!Store.user?.uid&&Store.userDoc?.status==='approved';},
  current(uid){return this.active()&&Store.user.uid===uid&&(Store.demo||Store.auth?.currentUser?.uid===uid);},
  sync(){
    const uid=this.active()?Store.user.uid:'';
    if(uid!==this.uid){this.stop();this.uid=uid;this.generation++;this.phase=this.enabled()?'loading':'disabled';this.adFree=false;this.demoPaid=false;this.paymentsEnabled=false;this.pendingOrderId=null;this.order=null;this.refreshing=null;this.lastRefresh=0;}
    if(this.profile!==Store.profile){this.stop();this.profile=Store.profile;}
    if(Store.auth&&Store.auth!==this.auth){this.unsubscribe?.();this.auth=Store.auth;this.unsubscribe=this.auth.onIdTokenChanged(()=>{this.sync();if(this.uid)this.refresh(false);});}
    if(Store.demo&&uid)this.phase=this.demoPaid?'paid':'free';
  },
  apiUrl(name){
    if(!['getMonetizationStatus','createPixCheckout','checkPixCheckout'].includes(name))throw new Error('Operação indisponível.');
    const page=new URL(location.href),base=new URL(this.config.apiBase,page);
    const secure=page.protocol==='https:'||(page.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(page.hostname));
    if(!secure||base.origin!==page.origin||base.username||base.password||base.search||base.hash)throw new Error('Conexão indisponível.');
    return base.origin+base.pathname.replace(/\/$/,'')+'/'+name;
  },
  async call(name,data={}){
    if(!this.enabled()||Store.demo||!this.current(this.uid))throw new Error('Pagamentos indisponíveis.');
    if(this.config.provider==='cloudflare'){
      const url=this.apiUrl(name),uid=this.uid,generation=this.generation,user=Store.auth.currentUser;
      const current=()=>this.current(uid)&&generation===this.generation&&Store.auth.currentUser===user;
      const token=await user.getIdToken();if(!current())throw new Error('A sessão mudou.');
      if(typeof token!=='string'||!token.trim()||typeof window.fetch!=='function')throw new Error('Conexão indisponível.');
      if(name==='checkPixCheckout'&&!this.validOrderId(data?.orderId))throw new Error('Pedido inválido.');
      const payload=name==='checkPixCheckout'?{orderId:data.orderId}:{};
      const response=await window.fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},credentials:'same-origin',redirect:'error',body:JSON.stringify({data:payload})});
      const result=await response.json();if(!current())throw new Error('A sessão mudou.');
      if(!response.ok||result?.error){const error=new Error('Não foi possível concluir a solicitação.');error.code='functions/'+String(result?.error?.status||'unavailable').toLowerCase().replace(/_/g,'-');throw error;}
      if(!result?.data||typeof result.data!=='object'||Array.isArray(result.data))throw new Error('Resposta inválida.');
      return result.data;
    }
    if(this.config.provider!=='firebase'||!window.firebase?.functions)throw new Error('Conexão indisponível.');
    return(await firebase.app().functions(this.config.region).httpsCallable(name)(data)).data;
  },
  async refresh(force=false){
    this.sync();if(!this.uid||Store.demo||!this.enabled()){this.paintCard();return;}
    if(this.refreshing)return this.refreshing;
    if(!force&&Date.now()-this.lastRefresh<15000){this.paintCard();return;}
    const uid=this.uid,generation=this.generation;
    const task=(async()=>{
      try{
        if(this.config.provider==='firebase'){
          const token=await Store.auth.currentUser.getIdTokenResult(force);
          if(!this.current(uid)||generation!==this.generation)return;
          if(token.claims.adFreeLifetime===true){this.adFree=true;this.phase='paid';this.paintCard();}
        }
        const status=await this.call('getMonetizationStatus');
        if(!this.current(uid)||generation!==this.generation)return;
        if(typeof status?.adFreeLifetime!=='boolean'||Number(status.price)!==5||status.currency!=='BRL'||typeof status.paymentsEnabled!=='boolean'||(status.pendingOrderId!==null&&!this.validOrderId(status.pendingOrderId)))throw new Error('Resposta inválida.');
        if(this.config.pilotEnabled===true&&(typeof status.pilotMode!=='boolean'||(status.paymentsEnabled&&status.pilotMode!==true)))throw new Error('Resposta inválida.');
        this.adFree=status.adFreeLifetime;this.paymentsEnabled=status.paymentsEnabled;this.pendingOrderId=this.adFree?null:status.pendingOrderId;this.phase=this.adFree?'paid':'free';this.lastRefresh=Date.now();
      }catch(error){if(this.current(uid)&&generation===this.generation){this.paymentsEnabled=false;if(this.config.provider==='cloudflare')this.adFree=false;if(!this.adFree)this.phase='unavailable';}}
      finally{if(generation===this.generation){this.paintCard();this.refreshing=null;}}
    })();this.refreshing=task;return task;
  },
  shouldLoadAds(page=location.pathname){return !Store.demo&&this.enabled()&&this.config.adsEnabled===true&&this.current(this.uid)&&this.phase==='free'&&!this.adFree&&Array.isArray(this.config.adPageAllowlist)&&this.config.adPageAllowlist.includes(page);},
  card(){
    const demo=Store.demo,paid=demo?this.demoPaid:this.adFree,pending=!demo&&!paid&&!!this.pendingOrderId,canOpen=demo||paid||pending||this.canCreate(),preparing=!demo&&!canOpen,checking=this.phase==='loading',failed=this.phase==='unavailable';
    return `<div class="monetization-top"><span class="monetization-mark" aria-hidden="true">${paid?'✓':'✦'}</span><div><p class="monetization-eyebrow">SEU 4J FINANCE</p><h3>${paid?'Sem anúncios · ativo':'Mais tranquilidade para seus planos'}</h3></div><span class="monetization-badge">${demo?'Demonstração':paid?'Pagamento único':preparing?'Em preparação':checking?'Conferindo':failed?'Indisponível':pending?'Pix para conferir':'Gratuito'}</span></div><p class="modal-copy">${paid?'Todos os anúncios do Google AdSense no 4J Finance estão removidos para este login, em qualquer dispositivo enquanto você estiver conectado. Sem mensalidade e sem renovação.':pending?'Há um pedido de Pix para esta conta. Confira a situação ou retome o código antes de tentar outro pagamento.':preparing?'Estamos preparando o pagamento único de R$ 5,00 para retirar todos os anúncios do Google AdSense no 4J Finance para esta conta. Nenhuma nova cobrança está disponível agora.':'Use a versão gratuita ou retire todos os anúncios do Google AdSense no 4J Finance para esta conta por R$ 5,00, uma única vez.'}</p>${!paid?'<p class="form-tip">O benefício é permanente para seu login. Não é uma assinatura e não é repassado aos outros membros da família.</p>':''}${demo?'<p class="form-tip">Prévia com pagamento fictício. Nenhum dinheiro é enviado.</p>':''}<div class="settings-buttons"><button type="button" class="button ${paid?'secondary':'primary'}" ${canOpen?'data-action="monetization-open"':'disabled'}>${paid?'Ver meu benefício':preparing?'Pagamento em preparação':checking?'Ver opção sem anúncios':failed?'Tentar novamente':pending?'Conferir meu Pix':'Remover anúncios · R$ 5,00'}</button></div>${!paid&&!preparing?'<p class="form-tip">O pagamento é via Pix. A liberação acontece após a confirmação do pagamento.</p>':''}`;
  },
  appendCard(){
    this.sync();const container=$('#modal-content');if(!container)return;let card=$('#monetization-card');
    if(!card){card=document.createElement('section');card.id='monetization-card';card.className='settings-group monetization-card';const summary=container.querySelector('.account-summary');(summary?.parentNode===container?summary:container.firstElementChild)?.insertAdjacentElement('afterend',card);if(!card.isConnected)container.append(card);}
    this.paintCard();this.refresh(false);
  },
  paintCard(){const card=$('#monetization-card');if(card)card.innerHTML=this.card();},
  stop(){clearTimeout(this.timer);this.timer=null;this.watch++;},
  errorText(error){const code=String(error?.code||'').split('/').pop();return({'unauthenticated':'Entre novamente na sua conta para continuar.','permission-denied':'Confirme seu e-mail e confira se sua conta está ativa antes de pagar.','invalid-argument':'Não foi possível preparar o Pix. Confira sua conta e tente novamente.','resource-exhausted':'Aguarde um pouco antes de tentar novamente.','failed-precondition':'O pagamento não está disponível para esta conta agora. Confirme seu e-mail ou tente mais tarde.'})[code]||'Não conseguimos conferir o pagamento agora. Nenhum benefício foi liberado sem confirmação. Tente novamente.';},
  frame(title,content){this.stop();modal(title,`<div id="pix-checkout">${content}</div>`);},
  paidScreen(demo=false){this.frame(demo?'Demonstração concluída':'Seu 4J, sem anúncios',`<div class="pix-result"><span class="pix-success" aria-hidden="true">✓</span><h3>${demo?'Assim será a confirmação':'Pagamento confirmado'}</h3><p>${demo?'Esta é apenas uma simulação. Sua conta real não foi alterada.':'Seu benefício permanente está ativo para este login. Ele acompanha você nos outros dispositivos, sem pagar novamente.'}</p></div><div class="pix-summary"><span>Plano</span><b>Sem anúncios</b><span>Cobrança</span><b>Única · R$ 5,00</b><span>Renovação</span><b>Não existe</b></div><p class="form-tip">${demo?'Nenhuma cobrança foi criada.':'Guarde o comprovante do Pix no seu banco. O benefício vale para esta conta, não para toda a família.'}</p><div class="modal-actions"><button type="button" class="button primary" data-action="settings">Voltar aos ajustes</button></div>`);},
  async open(newCheckout=false){
    this.sync();if(!this.active())return;
    if(Store.demo){if(this.demoPaid)this.paidScreen(true);else this.demoCheckout();return;}
    if(!this.enabled()){this.frame('Pagamento em preparação','<p class="modal-copy">O pagamento ainda não foi ativado. Nenhuma cobrança pode ser feita agora.</p>');return;}
    const uid=this.uid,generation=this.generation;this.frame('Remover anúncios','<p class="modal-copy" role="status" id="pix-loading">Conferindo o benefício da sua conta...</p>');
    const marker=$('#pix-loading');await this.refresh(true);
    const current=()=>this.current(uid)&&generation===this.generation&&$('#pix-loading')===marker&&$('#modal').open;
    if(!current())return;
    if(this.adFree){this.paidScreen();return;}
    if(this.phase!=='free'){this.frame('Conexão indisponível','<p class="form-error" role="alert">Não conseguimos conferir sua conta. Tente novamente antes de gerar um Pix.</p><div class="modal-actions"><button class="button primary" data-action="monetization-open">Tentar novamente</button></div>');return;}
    const orderId=this.pendingOrderId||(this.order?.uid===uid?this.order.orderId:null);
    if(orderId){
      try{
        const order=await this.call('checkPixCheckout',{orderId});if(!current())return;
        this.validateOrder(order,orderId);
        if(order.adFreeLifetime===true||!newCheckout||!this.terminal(order.status)){await this.presentOrder(order,uid);return;}
        this.order={...order,uid};
      }catch(error){if(current())this.frame('Confira seu Pix anterior','<p class="form-error" role="alert">Não conseguimos recuperar seu Pix agora. Se já pagou, não pague novamente. Tente conferir a confirmação outra vez.</p><div class="modal-actions"><button type="button" class="button secondary" data-action="settings">Voltar aos ajustes</button><button type="button" class="button primary" data-action="monetization-open">Conferir novamente</button></div>');return;}
    }
    if(!this.canCreate()){this.frame('Novos pagamentos em preparação','<p class="modal-copy">Nenhuma nova cobrança está disponível agora. Um benefício já confirmado continua ativo, e você pode conferir um Pix anterior pelos ajustes.</p><div class="modal-actions"><button type="button" class="button primary" data-action="settings">Voltar aos ajustes</button></div>');return;}
    if(!Store.auth.currentUser.emailVerified){this.frame('Primeiro, confirme seu e-mail','<p class="modal-copy">Para vincular o pagamento à conta certa, confirme seu e-mail antes de gerar o Pix.</p><p id="pix-verify-message" class="form-tip" role="status"></p><div class="modal-actions"><button class="button secondary" data-action="monetization-send-verification">Enviar confirmação</button><button class="button primary" data-action="monetization-reload-user">Já confirmei</button></div>');return;}
    this.frame('Sem anúncios, de uma vez',`<div class="pix-price"><span>Pagamento único</span><strong>R$ 5<span>,00</span></strong><p>Sem assinatura. Sem renovação.</p></div><p class="modal-copy">Você continua com todos os recursos do 4J Finance e retira todos os anúncios do Google AdSense no site para esta conta, de forma permanente enquanto estiver conectado.</p><form id="pix-confirm-form"><p class="form-tip">Ao continuar, será gerado um Pix de R$ 5,00 para esta conta. O benefício será liberado após a confirmação do pagamento.</p><p id="pix-create-error" class="form-error" role="alert" hidden></p><div class="modal-actions"><button type="button" class="button secondary" data-action="settings">Voltar</button><button type="submit" class="button primary">Gerar Pix de R$ 5,00</button></div></form>`);
    $('#pix-confirm-form').onsubmit=event=>{event.preventDefault();this.create(event.currentTarget);};
  },
  async create(form){
    if(!this.current(this.uid))return;const uid=this.uid,watch=this.watch,button=form.querySelector('[type=submit]'),error=form.querySelector('[role=alert]');
    if(!this.canCreate()){error.hidden=false;error.textContent='Nenhuma nova cobrança está disponível agora. Volte aos ajustes para conferir sua conta ou um Pix anterior.';button.disabled=true;return;}
    button.disabled=true;button.textContent='Preparando seu Pix...';error.hidden=true;
    try{
      const order=await this.call('createPixCheckout',{});
      if(!this.current(uid)||watch!==this.watch||!form.isConnected)return;
      await this.presentOrder(order,uid);
    }catch(err){if(this.current(uid)&&form.isConnected&&watch===this.watch){error.hidden=false;error.textContent=this.errorText(err);button.disabled=false;button.textContent='Gerar Pix de R$ 5,00';}}
  },
  validateOrder(order,orderId){
    if(typeof order?.adFreeLifetime!=='boolean'||!this.validOrderId(order.orderId)||(orderId&&order.orderId!==orderId)||Number(order.amount)!==5||order.currency!=='BRL'||(!['pending','in_process','approved'].includes(order.status)&&!this.terminal(order.status)))throw new Error('Resposta inválida.');
  },
  async presentOrder(order,uid){
    if(order?.adFreeLifetime===true){await this.confirmPaid(uid);return;}
    this.validateOrder(order);
    this.order={...order,uid};this.pendingOrderId=order.orderId;
    if(this.terminal(order.status)){this.closedOrder(this.order);return;}
    if(order.status==='approved'){this.frame('Conferindo a liberação','<p id="pix-status" class="pix-status" role="status">Pagamento recebido. Aguardando a confirmação do benefício...</p><div class="modal-actions"><button class="button primary" data-action="monetization-check">Conferir confirmação</button></div>');this.watchOrder(this.order);return;}
    this.showOrder(this.order);
  },
  closedOrder(order){
    const message=order.status==='expired'?'Este Pix expirou.':order.status==='cancelled'?'Este Pix foi cancelado.':order.status==='rejected'?'Este pagamento foi recusado.':'Este pagamento foi devolvido ou estornado.';
    this.frame('Confira seu pagamento',`<p id="pix-status" class="pix-status" role="status">${message} O benefício não está ativo. Se já pagou, confira a situação no seu banco e consulte a confirmação antes de preparar outro Pix.</p><div class="modal-actions"><button type="button" class="button secondary" data-action="monetization-check">Conferir confirmação</button>${this.paymentsEnabled?'<button type="button" class="button primary" data-action="monetization-new">Preparar outro Pix</button>':'<button type="button" class="button primary" data-action="settings">Voltar aos ajustes</button>'}</div>`);
    this.watchOrder(order,false);
  },
  expiry(order){const value=typeof order.expiresAt==='number'?order.expiresAt:Date.parse(order.expiresAt);return Number.isFinite(value)?value:0;},
  watchOrder(order,poll=true){this.order={...order,checking:false,failures:0,marker:$('#pix-checkout'),watch:this.watch,started:Number.isFinite(order.started)?order.started:Date.now(),profile:Store.profile,page:location.hash};if(poll)this.schedule(this.order);},
  qrReady(order){
    if(!order.qrCode&&!order.qrCodeBase64)return false;
    if(typeof order.qrCode!=='string'||!order.qrCode.trim()||typeof order.qrCodeBase64!=='string'||!/^[a-zA-Z0-9+/=\r\n]+$/.test(order.qrCodeBase64)||order.qrCodeBase64.length>500000)throw new Error('QR indisponível.');
    return true;
  },
  showOrder(order){
    if(!this.qrReady(order)){this.frame('Preparando seu Pix','<p id="pix-status" class="pix-status" role="status" aria-live="polite">Estamos gerando seu Pix. Aguarde um instante; o código aparecerá aqui automaticamente. Não é necessário gerar outro pagamento.</p><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Conferir depois</button><button type="button" class="button primary" data-action="monetization-check">Conferir código</button></div>');this.watchOrder(order);return;}
    const expires=this.expiry(order),label=expires?new Date(expires).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'Veja a validade no aplicativo do banco';
    this.frame('Pague com Pix',`<div class="pix-price pix-price-small"><span>Uma vez, para esta conta</span><strong>R$ 5<span>,00</span></strong></div><p class="modal-copy">No celular, copie o código e escolha <b>Pix Copia e Cola</b> no aplicativo do seu banco. Confira o recebedor e o valor antes de pagar.</p><div class="pix-qr"><img src="data:image/png;base64,${order.qrCodeBase64}" width="224" height="224" alt="QR Code do Pix de cinco reais"></div><label for="pix-copy-code">Código Pix<textarea id="pix-copy-code" readonly rows="3" spellcheck="false">${esc(order.qrCode)}</textarea></label><button type="button" class="button secondary full" data-action="monetization-copy">Copiar código Pix</button><p id="pix-copy-result" class="form-tip" role="status"></p><p class="form-tip">Válido até: ${esc(label)}. Pague apenas uma vez.</p><p id="pix-status" class="pix-status" role="status" aria-live="polite">Aguardando o pagamento. A confirmação é automática.</p><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Conferir depois</button><button type="button" class="button primary" data-action="monetization-check">Já paguei · conferir</button></div>`);
    this.watchOrder(order);
  },
  watching(order){return this.order===order&&this.current(order.uid)&&order.watch===this.watch&&order.marker===$('#pix-checkout')&&$('#modal').open&&order.profile===Store.profile&&order.page===location.hash;},
  pollingRemaining(order){const expires=this.expiry(order),deadline=order.started+30*60*1000;return Math.min(deadline,expires||deadline)-Date.now();},
  pausePolling(order){clearTimeout(this.timer);this.timer=null;if(this.watching(order))$('#pix-status').textContent='A consulta automática foi pausada. Use o botão de conferir para consultar novamente. Se já pagou, não pague outra vez.';},
  schedule(order){clearTimeout(this.timer);this.timer=null;if(!this.watching(order))return;const remaining=this.pollingRemaining(order);if(remaining<=0){this.pausePolling(order);return;}const delay=Math.min(15000*2**Math.max(0,(order.failures||0)-1),60000,remaining);this.timer=setTimeout(()=>{this.timer=null;return this.check(order,true);},delay);},
  async check(order=this.order,automatic=false){
    if(!order||!this.current(order.uid)||order.checking)return;if(automatic&&!this.watching(order))return;
    if(automatic&&this.pollingRemaining(order)<=0){this.pausePolling(order);return;}
    if(this.watching(order)){clearTimeout(this.timer);this.timer=null;}
    const generation=this.generation,marker=$('#pix-checkout');order.checking=true;const button=marker?.querySelector('[data-action=monetization-check]');if(button)button.disabled=true;
    try{
      const status=await this.call('checkPixCheckout',{orderId:order.orderId});if(!this.current(order.uid)||generation!==this.generation)return;
      if(status.adFreeLifetime===true){await this.confirmPaid(order.uid,this.watching(order));return;}
      if(!this.watching(order))return;
      this.validateOrder(status,order.orderId);
      order.failures=0;
      const area=$('#pix-status');
      if(this.terminal(status.status)){this.closedOrder({...order,status:status.status});return;}
      if(this.pollingRemaining(order)<=0){this.pausePolling(order);return;}
      if(['pending','in_process'].includes(status.status)&&this.qrReady(status)&&!this.qrReady(order)){this.showOrder({...status,uid:order.uid,started:order.started});return;}
      area.textContent=status.status==='approved'?'Pagamento recebido. Finalizando a liberação...':!this.qrReady(order)?'Estamos gerando seu Pix. Aguarde; o código aparecerá automaticamente, sem criar outro pagamento.':'Ainda aguardando a confirmação do pagamento. Se já pagou, não pague novamente.';this.schedule(order);
    }catch(err){if(this.watching(order)){order.failures=Math.min((order.failures||0)+1,3);if(this.pollingRemaining(order)<=0)this.pausePolling(order);else{$('#pix-status').textContent='Não foi possível conferir agora. Se já pagou, não pague novamente; tentaremos conferir outra vez.';this.schedule(order);}}}
    finally{order.checking=false;if(button?.isConnected)button.disabled=false;}
  },
  async confirmPaid(uid,show=true){if(!this.current(uid))return;const generation=this.generation;this.adFree=true;this.phase='paid';this.pendingOrderId=null;this.order=null;this.lastRefresh=Date.now();this.stop();try{await Store.auth.currentUser.getIdToken(true);}catch(error){}if(!this.current(uid)||generation!==this.generation)return;try{this.channel?.postMessage({type:'refresh'});}catch(error){}try{window.localStorage?.setItem('4j-entitlement-refresh',String(Date.now()));}catch(error){}this.paintCard();if(show)this.paidScreen();},
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
    $('#modal')?.addEventListener('close',()=>this.stop());window.addEventListener('hashchange',()=>this.stop());window.addEventListener('pagehide',()=>this.stop());window.addEventListener('pageshow',event=>{if(event.persisted)this.resume();});window.addEventListener('focus',()=>this.resume());document.addEventListener('visibilitychange',()=>{if(document.hidden)this.stop();else this.resume();});
    try{if(window.BroadcastChannel){this.channel=new BroadcastChannel('4j-entitlement-refresh');this.channel.onmessage=()=>this.refresh(true);}}catch(error){}
    document.addEventListener('click',async event=>{
      const action=event.target.closest('[data-action]')?.dataset.action;if(!action?.startsWith('monetization-'))return;
      if(action==='monetization-open')return this.open();if(action==='monetization-copy')return this.copy();
      if(action==='monetization-new')return this.open(true);
      if(action==='monetization-check'){if(this.order){this.order.watch=this.watch;this.order.marker=$('#pix-checkout');this.order.started=Date.now();this.order.failures=0;}return this.check();}
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
