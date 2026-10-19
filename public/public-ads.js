/* Public guide only; no Firestore or financial records.
   Local preferences do not replace the real, operator-configured certified CMP.
   The three activation flags remain false until AdSense and CMP activation QA. */
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
  const state={auth:null,settled:false,user:null,phase:'disabled',loaded:false,sequence:0,lastCheck:0,consent:false,cmpAllowed:false,channel:null,reloading:false,started:false,timer:null};
  function validPage(){return ['/guia.html','/guia'].includes(loc.pathname);}
  function configured(){return config.enabled===true&&config.approvalConfirmed===true&&config.certifiedCmpConfigured===true&&validPage();}
  function permitted(){return configured()&&state.consent&&state.cmpAllowed&&!state.reloading;}
  function eligible(){return permitted()&&state.settled&&['anonymous','free'].includes(state.phase)&&/^ca-pub-\d{16}$/.test(config.publisherId);}
  function stopCheck(){if(state.timer!==null){win.clearTimeout?.(state.timer);state.timer=null;}}
  function scheduleCheck(){stopCheck();if(!eligible()||!state.loaded||!state.user||doc.hidden||typeof win.setTimeout!=='function')return;state.timer=win.setTimeout(()=>{state.timer=null;if(!doc.hidden&&state.user&&state.loaded)refresh(true);},60000);}
  function reloadForSafety(){stopCheck();if(state.loaded&&!state.reloading){state.reloading=true;loc.reload();}}
  function inject(){
    if(!eligible()||state.loaded)return false;
    const script=doc.createElement('script');script.id='4j-public-ad-script';script.async=true;script.crossOrigin='anonymous';script.src='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client='+encodeURIComponent(config.publisherId);
    state.loaded=true;doc.head.appendChild(script);return true;
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
    const url=statusUrl(),current=()=>sequence===state.sequence&&state.user===user&&state.auth?.currentUser===user&&state.settled&&permitted();
    const token=await user.getIdToken();if(!current())throw new Error('Session changed');
    if(typeof token!=='string'||!token.trim()||typeof win.fetch!=='function')throw new Error('Status unavailable');
    const response=await win.fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},credentials:'same-origin',redirect:'error',body:JSON.stringify({data:{}})});
    const result=await response.json();if(!current())throw new Error('Session changed');
    if(!response.ok||result?.error||!result?.data||typeof result.data!=='object'||Array.isArray(result.data))throw new Error('Status unavailable');
    return result;
  }
  async function refresh(force=false){
    if(!permitted()||!state.settled)return;
    if(!force&&Date.now()-state.lastCheck<15000)return;
    stopCheck();
    const sequence=++state.sequence,user=state.user;state.phase='checking';
    if(!user){state.phase='anonymous';state.lastCheck=Date.now();inject();return;}
    try{
      const result=await statusCall(user,sequence);
      if(sequence!==state.sequence||state.user?.uid!==user.uid||!permitted()||!state.settled)return;
      if(typeof result?.data?.adFreeLifetime!=='boolean')throw new Error('Invalid entitlement');
      state.phase=result.data.adFreeLifetime?'paid':'free';state.lastCheck=Date.now();
      if(state.phase==='paid')reloadForSafety();else{inject();scheduleCheck();}
    }catch(error){if(sequence===state.sequence){state.phase='unavailable';reloadForSafety();}}
  }
  function setConsent(value){
    state.consent=value?.source==='4j-preferences'&&value?.ready===true&&value?.adsAllowed===true;
    if(!state.consent){state.sequence++;state.phase='consent-required';reloadForSafety();return;}
    refresh(true);
  }
  function cmpDecision(data,success){
    // Conservative activation adapter: fully consented advertising only.
    // No fallback to limited/non-personalized ads on refusal or unknown CMP data.
    let allowed=false;
    if(success===true&&data?.cmpStatus==='loaded'&&Number.isInteger(data.cmpId)&&data.cmpId>0&&['tcloaded','useractioncomplete'].includes(data.eventStatus)){
      if(data.gdprApplies===false)allowed=true;
      else if(data.gdprApplies===true&&typeof data.tcString==='string'&&data.tcString.length>0&&data.isServiceSpecific===true){
        allowed=data.vendor?.consents?.[755]===true&&[1,2,3,4,7,9,10].every(id=>{
          const restriction=data.publisher?.restrictions?.[id]?.[755];
          return data.purpose?.consents?.[id]===true&&(restriction===undefined||restriction===1);
        });
      }
    }
    state.cmpAllowed=allowed;
    if(!allowed){state.sequence++;state.phase='consent-required';reloadForSafety();return;}
    refresh(true);
  }
  function authFailure(){state.sequence++;state.settled=false;state.user=null;state.phase='unavailable';reloadForSafety();}
  function entitlementChanged(){if(state.loaded)reloadForSafety();else refresh(true);}
  function start(){
    if(state.started)return;state.started=true;
    win.addEventListener('4j:consent-change',event=>setConsent(event.detail));
    if(win.FourJConsent?.getState)setConsent(win.FourJConsent.getState());
    if(!configured())return;
    try{
      if(typeof win.__tcfapi!=='function'){state.phase='cmp-required';return;}
      win.__tcfapi('addEventListener',2,cmpDecision);
      if(!['firebase','cloudflare'].includes(config.provider)||!win.firebase?.auth||(config.provider==='firebase'&&!win.firebase?.functions))throw new Error('Firebase unavailable');
      if(config.provider==='cloudflare')statusUrl();
      const raw=doc.getElementById('public-firebase-config')?.textContent||'';
      const firebaseConfig=JSON.parse(raw);
      if(!firebaseConfig.projectId||!firebaseConfig.apiKey)throw new Error('Firebase configuration missing');
      if(!win.firebase.apps.length)win.firebase.initializeApp(firebaseConfig);
      state.auth=win.firebase.auth();
      state.unsubscribe=state.auth.onIdTokenChanged(user=>{
        const changed=state.settled&&(state.user?.uid||'')!==(user?.uid||'');
        stopCheck();state.sequence++;state.user=user;state.settled=true;state.lastCheck=0;state.phase='checking';
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
  return{start,setConsent,refresh,eligible,state};
});

