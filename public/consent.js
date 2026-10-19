/* First-party preferences; not a certified CMP or a TCF signal. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory;
  else if(!root.FourJConsent){const c=factory({window:root,document:root.document});root.FourJConsent=Object.freeze({getState:c.getState,openSettings:c.openSettings});c.start();}
})(typeof window!=='undefined'?window:globalThis,function createConsentController(env){
  'use strict';
  const win=env.window,doc=env.document,now=env.now||Date.now;
  const KEY='4j.cookie-consent.v1',CHANNEL='4j-cookie-preferences',LIFETIME=180*86400000,MAX_TIMER=2147483647;
  let record=null,storage=null,started=false,destroyed=false,memoryOnly=false,channel=null,timer=null,ui=null,returnFocus=null,googleAvailable=false;
  function parse(raw){
    try{
      const v=typeof raw==='string'?JSON.parse(raw):raw;
      if(!v||v.version!==1||typeof v.advertising!=='boolean'||!Number.isSafeInteger(v.updatedAt)||!Number.isSafeInteger(v.expiresAt)||v.updatedAt<=0||v.updatedAt>now()||v.expiresAt<=now()||v.expiresAt<=v.updatedAt||v.expiresAt-v.updatedAt>LIFETIME)return null;
      return{version:1,advertising:v.advertising,updatedAt:v.updatedAt,expiresAt:v.expiresAt};
    }catch(_){return null;}
  }
  function snapshot(){return Object.freeze({ready:Boolean(record),adsAllowed:Boolean(record&&record.advertising),source:'4j-preferences'});}
  function emit(){if(typeof win.dispatchEvent==='function'&&typeof win.CustomEvent==='function')win.dispatchEvent(new win.CustomEvent('4j:consent-change',{detail:snapshot()}));}
  function scheduleExpiry(){
    if(timer!==null&&win.clearTimeout)win.clearTimeout(timer);timer=null;
    if(record&&win.setTimeout)timer=win.setTimeout(()=>{timer=null;checkExpiry();if(record)scheduleExpiry();},Math.min(MAX_TIMER,Math.max(1,record.expiresAt-now())));
  }
  function checkExpiry(){if(!record||record.expiresAt>now())return;record=null;scheduleExpiry();render();emit();}
  function getState(){checkExpiry();return snapshot();}
  function persist(next){
    memoryOnly=false;
    try{
      if(!storage)throw new Error('Storage unavailable');storage.setItem(KEY,JSON.stringify(next));
      const saved=parse(storage.getItem(KEY));
      if(!saved||saved.updatedAt!==next.updatedAt||saved.advertising!==next.advertising)throw new Error('Storage unavailable');
    }catch(_){
      memoryOnly=true;
      // A full quota may allow removing an old grant even when writing fails.
      try{if(storage)storage.removeItem(KEY);}catch(_){/* Current decision remains in memory. */}
    }
  }
  function saveChoice(advertising){
    if(destroyed||typeof advertising!=='boolean')return snapshot();
    const timestamp=now(),next={version:1,advertising,updatedAt:timestamp,expiresAt:timestamp+LIFETIME};
    // Persist refusal and close the gate before an ad listener can reload.
    persist(next);record=next;scheduleExpiry();render();
    if(channel)try{channel.postMessage({type:'4j-consent-update',record:next,memoryOnly});}catch(_){/* Storage events also synchronize tabs. */}
    emit();return snapshot();
  }
  function newest(a,b){
    if(!a)return b;if(!b)return a;
    if(a.updatedAt!==b.updatedAt)return a.updatedAt>b.updatedAt?a:b;
    // Equal timestamps from simultaneous tabs always favor refusal.
    return a.advertising===false?a:b;
  }
  function readCurrent(){
    try{
      if(!storage)storage=Object.prototype.hasOwnProperty.call(env,'storage')?env.storage:win.localStorage;
      if(!storage)throw new Error('Storage unavailable');
      return{available:true,value:parse(storage.getItem(KEY))};
    }catch(_){return{available:false,value:null};}
  }
  function reconcile(raw,hasIncoming=false){
    const current=readCurrent(),previous=parse(record),incoming=hasIncoming?parse(raw):null;
    let next=null;
    if(current.available){
      if(current.value){
        // An in-memory grant never overrides a durable choice made elsewhere.
        next=memoryOnly&&previous&&previous.advertising?current.value:newest(current.value,previous);
        // A broadcast grant alone is insufficient: granting requires current
        // persistent evidence. A newer refusal can close the gate immediately.
        if(incoming&&incoming.advertising===false)next=newest(next,incoming);
        if(next&&!next.advertising&&(current.value.advertising||current.value.updatedAt<next.updatedAt))persist(next);
        else memoryOnly=false;
      }else if(memoryOnly&&!hasIncoming){next=previous;}
      else{memoryOnly=false;}
    }else{
      next=memoryOnly?previous:null;
      if(incoming&&incoming.advertising===false)next=newest(next,incoming);
      memoryOnly=true;
    }
    record=next;scheduleExpiry();
    if(ui)ui.checkbox.checked=Boolean(record&&record.advertising);
    render();emit();
  }
  function onStorage(e){if(e.key!==KEY&&e.key!==null)return;if(e.storageArea&&storage&&e.storageArea!==storage)return;reconcile(e.key===null?null:e.newValue,true);}
  function onChannel(e){if(e.data&&e.data.type==='4j-consent-update')reconcile(e.data.record,true);}
  function onRestore(){reconcile();}
  function onVisibility(){if(!doc||!doc.hidden)onRestore();}
  function onGoogleReady(e){googleAvailable=e?.detail?.ready===true;if(ui)ui.googleSettings.hidden=!googleAvailable;}
  function onSettingsClick(e){const trigger=e.target&&e.target.closest&&e.target.closest('[data-cookie-settings]');if(trigger){e.preventDefault();openSettings(trigger);}}
  function focusBack(){
    const target=returnFocus&&returnFocus.isConnected&&!returnFocus.closest('[hidden]')?returnFocus:doc.querySelector('[data-cookie-settings]');returnFocus=null;
    if(target&&target.focus)target.focus({preventScroll:true});
  }
  function closeSettings(){
    if(!ui)return;
    if(typeof ui.dialog.close==='function'&&ui.dialog.hasAttribute('open'))ui.dialog.close();
    else{ui.dialog.removeAttribute('open');ui.dialog.classList.remove('fourj-consent-dialog--fallback');focusBack();}
  }
  function openSettings(trigger){
    if(!started)start();checkExpiry();if(!ui)mount();if(!ui||ui.dialog.hasAttribute('open'))return;
    returnFocus=trigger&&trigger.focus?trigger:doc.activeElement;ui.checkbox.checked=Boolean(record&&record.advertising);ui.dialogStatus.textContent=memoryOnly?memoryMessage():'';
    if(typeof ui.dialog.showModal==='function')ui.dialog.showModal();else{ui.dialog.setAttribute('open','');ui.dialog.classList.add('fourj-consent-dialog--fallback');}
    ui.heading.focus({preventScroll:true});
  }
  function requestGoogleSettings(){
    if(!googleAvailable||!ui)return;
    const notify=()=>win.dispatchEvent(new win.CustomEvent('4j:google-consent-settings'));
    // Native dialog close restores focus asynchronously. Hand over to Google's
    // dialog only after that event, so local focus restoration cannot steal it.
    if(typeof ui.dialog.close==='function'&&ui.dialog.hasAttribute('open')){ui.dialog.addEventListener('close',notify,{once:true});closeSettings();}
    else{closeSettings();notify();}
  }
  function memoryMessage(){return'Seu navegador não permitiu guardar a escolha. Ela vale nesta página; em uma próxima visita, podemos perguntar novamente.';}
  function render(){
    if(!ui)return;ui.banner.hidden=Boolean(record);
    if(!ui.dialog.hasAttribute('open'))ui.checkbox.checked=Boolean(record&&record.advertising);
    ui.googleSettings.hidden=!googleAvailable;
    ui.statusText.textContent=memoryOnly&&record?memoryMessage():'';ui.status.hidden=!(memoryOnly&&record);ui.dialogStatus.textContent=memoryOnly?memoryMessage():'';
  }
  function chooseAndClose(value){saveChoice(value);if(ui&&ui.dialog.hasAttribute('open'))closeSettings();else if(ui&&ui.banner.contains(doc.activeElement))focusBack();}
  function onDialogKey(e){
    if(e.key==='Escape'){e.preventDefault();closeSettings();return;}if(e.key!=='Tab')return;
    const list=Array.from(ui.dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),a[href],[tabindex="0"]')),first=list[0],last=list[list.length-1];
    if(!first){e.preventDefault();return;}
    if(e.shiftKey&&(doc.activeElement===first||doc.activeElement===ui.heading)){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&doc.activeElement===last){e.preventDefault();first.focus();}
  }
  function mount(){
    if(ui||destroyed||!doc||!doc.body||typeof doc.createElement!=='function')return;
    const host=doc.createElement('div');host.id='fourj-consent';host.className='fourj-consent';
    host.innerHTML=`
      <section class="fourj-consent-banner" aria-labelledby="fourj-cookie-banner-title" hidden>
        <div class="fourj-consent-copy">
          <h2 id="fourj-cookie-banner-title">Cookies e privacidade</h2>
          <p>Usamos armazenamento necessário para o site funcionar. A publicidade do Google AdSense está em preparação. Você escolhe se permite cookies de publicidade; recusar não impede o uso do 4J Finance.</p>
          <a class="fourj-consent-link" href="./privacidade.html#cookies">Entenda como usamos seus dados</a>
        </div>
        <div class="fourj-consent-actions" aria-label="Escolha de cookies opcionais">
          <button type="button" data-consent-action="reject">Recusar opcionais</button>
          <button type="button" data-consent-action="accept">Aceitar opcionais</button>
          <button type="button" data-consent-action="customize">Personalizar</button>
        </div>
      </section>
      <div class="fourj-consent-status" role="status" aria-live="polite" hidden><p></p><button type="button" data-consent-action="dismiss">Fechar aviso</button></div>
      <dialog class="fourj-consent-dialog" aria-modal="true" aria-labelledby="fourj-cookie-title" aria-describedby="fourj-cookie-description">
        <div class="fourj-consent-dialog-head"><span class="fourj-consent-eyebrow">4J FINANCE · PRIVACIDADE</span><button class="fourj-consent-close" type="button" data-consent-action="close" aria-label="Fechar preferências de cookies">Fechar <span aria-hidden="true">×</span></button></div>
        <h2 id="fourj-cookie-title" tabindex="-1">Você decide sobre os cookies</h2>
        <p id="fourj-cookie-description">Os opcionais começam desligados. Você pode mudar ou retirar sua autorização pelo link “Preferências de cookies” no rodapé, sem pagar por isso.</p>
        <div class="fourj-consent-category"><div><h3>Necessários</h3><p>Ajudam no funcionamento do site, no login e no registro desta escolha.</p></div><span class="fourj-consent-required">Sempre ativos</span></div>
        <div class="fourj-consent-category fourj-consent-category--optional">
          <label for="fourj-cookie-advertising"><span class="fourj-consent-label">Publicidade</span><span class="fourj-consent-description">Permitir cookies do Google AdSense para exibir e medir anúncios. A publicidade ainda está em preparação e depende da conclusão da configuração.</span></label>
          <input type="checkbox" id="fourj-cookie-advertising" aria-label="Permitir cookies de publicidade">
        </div>
        <p class="fourj-consent-note">Esta preferência vale por até 180 dias neste navegador. A recusa mantém as funções do site disponíveis.</p>
        <p class="fourj-consent-dialog-status" role="status" aria-live="polite"></p>
        <div class="fourj-consent-dialog-actions"><button type="button" data-consent-action="reject">Recusar opcionais</button><button type="button" data-consent-action="save">Salvar escolhas</button></div>
        <button type="button" data-consent-action="google-settings" hidden>Rever escolha de anúncios</button>
        <a class="fourj-consent-link" href="./privacidade.html#cookies">Ler a Política de Privacidade</a>
      </dialog>`;
    doc.body.appendChild(host);
    ui={host,banner:host.querySelector('.fourj-consent-banner'),dialog:host.querySelector('dialog'),heading:host.querySelector('#fourj-cookie-title'),checkbox:host.querySelector('#fourj-cookie-advertising'),status:host.querySelector('.fourj-consent-status'),statusText:host.querySelector('.fourj-consent-status p'),dialogStatus:host.querySelector('.fourj-consent-dialog-status'),googleSettings:host.querySelector('[data-consent-action=google-settings]')};
    host.addEventListener('click',e=>{
      const b=e.target.closest('[data-consent-action]');if(!b)return;
      switch(b.dataset.consentAction){case'google-settings':requestGoogleSettings();break;case'accept':chooseAndClose(true);break;case'reject':chooseAndClose(false);break;case'save':chooseAndClose(ui.checkbox.checked);break;case'customize':openSettings(b);break;case'close':closeSettings();break;case'dismiss':ui.status.hidden=true;focusBack();break;}
    });
    ui.dialog.addEventListener('close',focusBack);ui.dialog.addEventListener('cancel',e=>{e.preventDefault();closeSettings();});ui.dialog.addEventListener('keydown',onDialogKey);render();
  }
  function start(){
    if(started||destroyed)return;started=true;
    try{storage=Object.prototype.hasOwnProperty.call(env,'storage')?env.storage:win.localStorage;if(!storage)throw new Error('Storage unavailable');record=parse(storage.getItem(KEY));}catch(_){storage=null;record=null;memoryOnly=true;}
    if(win.addEventListener){win.addEventListener('storage',onStorage);win.addEventListener('focus',onRestore);win.addEventListener('pageshow',onRestore);win.addEventListener('4j:google-consent-ready',onGoogleReady);}
    if(doc&&doc.addEventListener){doc.addEventListener('click',onSettingsClick);doc.addEventListener('visibilitychange',onVisibility);if(!doc.body)doc.addEventListener('DOMContentLoaded',mount,{once:true});}
    if(typeof win.BroadcastChannel==='function')try{channel=new win.BroadcastChannel(CHANNEL);channel.onmessage=onChannel;}catch(_){channel=null;}
    mount();scheduleExpiry();emit();
  }
  function destroy(){
    destroyed=true;if(timer!==null&&win.clearTimeout)win.clearTimeout(timer);if(channel)channel.close();
    if(win.removeEventListener){win.removeEventListener('storage',onStorage);win.removeEventListener('focus',onRestore);win.removeEventListener('pageshow',onRestore);win.removeEventListener('4j:google-consent-ready',onGoogleReady);}
    if(doc&&doc.removeEventListener){doc.removeEventListener('click',onSettingsClick);doc.removeEventListener('visibilitychange',onVisibility);doc.removeEventListener('DOMContentLoaded',mount);}
    if(ui)ui.host.remove();ui=null;
  }
  return{start,getState,openSettings,saveChoice,destroy};
});


