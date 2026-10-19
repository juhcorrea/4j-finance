/* Public guide only; no Firestore or financial records.
   Local preferences do not replace the real, operator-configured certified CMP.
   All activation flags stay false until AdSense approval and live CMP QA. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory;
  else{
    const controller=factory({window:root,document:root.document,location:root.location});
    root.FourJPublicAds=Object.freeze({setConsent:value=>controller.setConsent(value),refresh:()=>controller.refresh(true)});
    controller.start();
  }
})(typeof window!=='undefined'?window:globalThis,function createPublicAdsController(env){
  const win=env.window,doc=env.document,loc=env.location;
  const config=Object.freeze({enabled:false,approvalConfirmed:false,certifiedCmpConfigured:false,publisherId:'ca-pub-9462093834252455',region:'southamerica-east1',provider:'firebase',apiBase:'/api/pix',...(win.PUBLIC_ADS_CONFIG||{})});
  const state={auth:null,settled:false,user:null,phase:'disabled',loaded:false,attached:false,sequence:0,lastCheck:0,consent:false,cmpAllowed:false,cmpPhase:'idle',cmpReady:false,cmpRegistered:false,cmpFailed:false,gdprApplies:null,reviewing:false,requestsReleased:false,everReleased:false,channel:null,reloading:false,started:false,timer:null,cmpTimer:null};
  function validPage(){try{return ['/guia.html','/guia'].includes(loc.pathname)&&!new URL(loc.href).searchParams.has('demo');}catch(_){return false;}}
  function configured(){return config.enabled===true&&config.approvalConfirmed===true&&config.certifiedCmpConfigured===true&&validPage()&&/^ca-pub-\d{16}$/.test(config.publisherId);}
  // Auth and entitlement must settle before Google loads, independently of CMP.
  function mayCheck(){return configured()&&state.consent&&!state.reloading;}
  function accountAllowed(){return mayCheck()&&state.settled&&['anonymous','free'].includes(state.phase);}
  function eligible(){return accountAllowed()&&state.cmpAllowed&&!state.cmpFailed;}
  function stopCheck(){if(state.timer!==null){win.clearTimeout?.(state.timer);state.timer=null;}}
  function stopCmpTimer(){if(state.cmpTimer!==null){win.clearTimeout?.(state.cmpTimer);state.cmpTimer=null;}}
  function pauseRequests(){if(state.loaded&&win.adsbygoogle)win.adsbygoogle.pauseAdRequests=1;state.requestsReleased=false;}
  function publishSettingsAvailability(){
    if(typeof win.dispatchEvent==='function'&&typeof win.CustomEvent==='function')win.dispatchEvent(new win.CustomEvent('4j:google-consent-ready',{detail:{ready:state.cmpReady&&state.gdprApplies===true&&!state.cmpFailed&&!state.reloading&&typeof win.googlefc?.showRevocationMessage==='function'}}));
  }
  function scheduleCheck(){stopCheck();if(!eligible()||!state.loaded||!state.user||doc.hidden||typeof win.setTimeout!=='function')return;state.timer=win.setTimeout(()=>{state.timer=null;if(!doc.hidden&&state.user&&state.loaded)refresh(true);},60000);}
  function reloadForSafety(){
    stopCheck();stopCmpTimer();pauseRequests();
    if(state.loaded&&!state.reloading){state.reloading=true;publishSettingsAvailability();loc.reload();}
  }
  function releaseRequests(){
    if(!state.attached||!eligible())return false;
    win.adsbygoogle.pauseAdRequests=0;state.requestsReleased=true;state.everReleased=true;scheduleCheck();return true;
  }
  function cmpFailure(){
    if(state.reloading)return;
    state.cmpAllowed=false;state.cmpFailed=true;state.cmpPhase='unavailable';stopCmpTimer();stopCheck();pauseRequests();publishSettingsAvailability();
    // A blocked bootstrap never reloads itself. Existing ads must be removed.
    if(state.everReleased)reloadForSafety();
  }
  function cmpDecision(data,success){
    if(!state.loaded||state.cmpFailed||state.reloading)return;
    if(success!==true||data?.cmpStatus==='error'){cmpFailure();return;}
    // showRevocationMessage clears the old record before showing its UI. During
    // this explicit review, neither empty nor stale tcloaded data is a decision.
    if(state.reviewing&&data?.eventStatus!=='useractioncomplete'){
      state.cmpAllowed=false;state.cmpPhase='waiting';pauseRequests();stopCheck();return;
    }
    if(data?.eventStatus==='useractioncomplete')state.reviewing=false;
    const complete=data?.cmpStatus==='loaded'&&Number.isInteger(data.cmpId)&&data.cmpId>0&&['tcloaded','useractioncomplete'].includes(data.eventStatus);
    let allowed=false;
    if(complete){
      if(data.gdprApplies===false)allowed=true;
      else if(data.gdprApplies===true&&typeof data.tcString==='string'&&data.tcString.length>0&&data.isServiceSpecific===true){
        allowed=data.vendor?.consents?.[755]===true&&[1,2,3,4,7,9,10].every(id=>{
          const restriction=data.publisher?.restrictions?.[id]?.[755];
          return data.purpose?.consents?.[id]===true&&(restriction===undefined||restriction===1);
        });
      }
    }
    state.gdprApplies=typeof data?.gdprApplies==='boolean'?data.gdprApplies:null;
    state.cmpAllowed=allowed;state.cmpPhase=allowed?'allowed':complete?'denied':'waiting';publishSettingsAvailability();
    if(!allowed){
      pauseRequests();stopCheck();
      // Loading/UI events are not a refusal. Reloading here would close the CMP
      // before the visitor can decide, or cause a bootstrap/reload loop.
      if(complete&&state.everReleased)reloadForSafety();return;
    }
    if(state.phase==='checking')return;
    if(Date.now()-state.lastCheck>=15000)refresh(true);else releaseRequests();
  }
  function consentApiReady(){
    if(!state.loaded||state.cmpFailed||state.reloading||state.cmpRegistered)return;
    if(typeof win.__tcfapi!=='function'){cmpFailure();return;}
    state.cmpRegistered=true;state.cmpReady=true;state.cmpPhase='waiting';stopCmpTimer();
    try{win.__tcfapi('addEventListener',2,cmpDecision);publishSettingsAvailability();}catch(_){cmpFailure();}
  }
  function bootstrap(){
    if(!accountAllowed()||state.cmpFailed)return false;
    if(state.loaded)return releaseRequests();
    try{
      // Official AdSense pause API: configure before loading the tag. The tag
      // supplies Google's published CMP; no consent signal is fabricated here.
      // https://support.google.com/adsense/answer/7670312
      // https://developers.google.com/funding-choices/fc-api-docs
      win.adsbygoogle=win.adsbygoogle||[];win.adsbygoogle.pauseAdRequests=1;
      win.googlefc=win.googlefc||{};win.googlefc.callbackQueue=win.googlefc.callbackQueue||[];
      const script=doc.createElement('script');script.id='4j-public-ad-script';script.async=true;script.crossOrigin='anonymous';script.src='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client='+encodeURIComponent(config.publisherId);script.onerror=cmpFailure;
      state.loaded=true;state.cmpPhase='loading';
      if(typeof win.setTimeout==='function')state.cmpTimer=win.setTimeout(cmpFailure,15000);
      win.googlefc.callbackQueue.push({CONSENT_API_READY:consentApiReady});
      doc.head.appendChild(script);state.attached=true;releaseRequests();return true;
    }catch(_){cmpFailure();return false;}
  }
  function openGoogleSettings(){
    if(!state.cmpReady||state.gdprApplies!==true||state.cmpFailed||state.reloading||!state.loaded||typeof win.googlefc?.showRevocationMessage!=='function')return false;
    state.reviewing=true;state.cmpAllowed=false;state.cmpPhase='waiting';pauseRequests();stopCheck();
    try{
      win.googlefc.callbackQueue.push({CONSENT_API_READY:()=>{
        if(state.cmpFailed||state.reloading)return;
        try{win.googlefc.showRevocationMessage();}catch(_){cmpFailure();}
      }});return true;
    }catch(_){cmpFailure();return false;}
  }
  function statusUrl(){
    const page=new URL(loc.href),base=new URL(config.apiBase,page);
    const secure=page.protocol==='https:'||(page.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(page.hostname));
    if(!secure||base.origin!==page.origin||base.username||base.password||base.search||base.hash)throw new Error('Invalid status origin');
    return base.origin+base.pathname.replace(/\/$/,'')+'/getMonetizationStatus';
  }
  async function statusCall(user,sequence){
    if(config.provider==='firebase')return win.firebase.app().functions(config.region).httpsCallable('getMonetizationStatus')({});
    if(config.provider!=='cloudflare')throw new Error('Unknown provider');
    const url=statusUrl(),current=()=>sequence===state.sequence&&state.user===user&&state.auth?.currentUser===user&&state.settled&&mayCheck();
    const token=await user.getIdToken();if(!current())throw new Error('Session changed');
    if(typeof token!=='string'||!token.trim()||typeof win.fetch!=='function')throw new Error('Status unavailable');
    const response=await win.fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},credentials:'same-origin',redirect:'error',body:JSON.stringify({data:{}})});
    const result=await response.json();if(!current())throw new Error('Session changed');
    if(!response.ok||result?.error||!result?.data||typeof result.data!=='object'||Array.isArray(result.data))throw new Error('Status unavailable');
    return result;
  }
  async function refresh(force=false){
    if(!mayCheck()||!state.settled||state.cmpFailed)return;
    if(!force&&Date.now()-state.lastCheck<15000)return;
    stopCheck();pauseRequests();
    const sequence=++state.sequence,user=state.user;state.phase='checking';
    if(!user){state.phase='anonymous';state.lastCheck=Date.now();bootstrap();return;}
    try{
      const result=await statusCall(user,sequence);
      if(sequence!==state.sequence||state.user?.uid!==user.uid||!mayCheck()||!state.settled)return;
      if(typeof result?.data?.adFreeLifetime!=='boolean')throw new Error('Invalid entitlement');
      state.phase=result.data.adFreeLifetime?'paid':'free';state.lastCheck=Date.now();
      if(state.phase==='paid')reloadForSafety();else bootstrap();
    }catch(error){if(sequence===state.sequence){state.phase='unavailable';reloadForSafety();}}
  }
  function setConsent(value){
    state.consent=value?.source==='4j-preferences'&&value?.ready===true&&value?.adsAllowed===true;
    if(!state.consent){state.sequence++;state.phase='consent-required';reloadForSafety();return;}
    refresh(true);
  }
  function authFailure(){state.sequence++;state.settled=false;state.user=null;state.phase='unavailable';reloadForSafety();}
  function entitlementChanged(){if(state.loaded)reloadForSafety();else refresh(true);}
  function start(){
    if(state.started)return;state.started=true;
    win.addEventListener('4j:consent-change',event=>setConsent(event.detail));
    win.addEventListener('4j:google-consent-settings',openGoogleSettings);
    if(win.FourJConsent?.getState)setConsent(win.FourJConsent.getState());
    if(!configured())return;
    try{
      if(!['firebase','cloudflare'].includes(config.provider)||!win.firebase?.auth||(config.provider==='firebase'&&!win.firebase?.functions))throw new Error('Firebase unavailable');
      if(config.provider==='cloudflare')statusUrl();
      const raw=doc.getElementById('public-firebase-config')?.textContent||'';
      const firebaseConfig=JSON.parse(raw);
      if(!firebaseConfig.projectId||!firebaseConfig.apiKey)throw new Error('Firebase configuration missing');
      if(!win.firebase.apps.length)win.firebase.initializeApp(firebaseConfig);
      state.auth=win.firebase.auth();
      state.unsubscribe=state.auth.onIdTokenChanged(user=>{
        const changed=state.settled&&(state.user?.uid||'')!==(user?.uid||'');
        stopCheck();pauseRequests();state.sequence++;state.user=user;state.settled=true;state.lastCheck=0;state.phase='checking';
        if(changed&&state.loaded){reloadForSafety();return;}refresh(true);
      },authFailure);
      win.addEventListener('focus',()=>refresh(false));
      doc.addEventListener('visibilitychange',()=>{if(doc.hidden)stopCheck();else refresh(true);});
      win.addEventListener('pagehide',stopCheck);
      win.addEventListener('pageshow',event=>{if(event.persisted)entitlementChanged();});
      win.addEventListener('storage',event=>{if(event.key==='4j-entitlement-refresh')entitlementChanged();});
      try{if(win.BroadcastChannel){state.channel=new win.BroadcastChannel('4j-entitlement-refresh');state.channel.onmessage=entitlementChanged;}}catch(error){/* storage/focus still work */}
    }catch(error){authFailure();}
  }
  return{start,setConsent,refresh,eligible,openGoogleSettings,state};
});
