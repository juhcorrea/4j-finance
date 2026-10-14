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
    if(!store.user?.uid||store.userDoc?.status!=='approved')throw new Error('Entre com uma conta aprovada para escolher seu perfil padrão.');
    if(id&&!store.profiles.some(p=>p.id===id))throw new Error('Escolha um perfil ao qual você tem acesso.');
    const context={demo:store.demo,user:{uid:store.user.uid,email:store.user.email},db:store.db},previous=this.read(store),localSaved=this.write(context,{id,pending:true});
    if(store.demo){store.userDoc.defaultProfileId=id;this.write(context,{id,pending:false});return 'demo';}
    try{
      const userRef=context.db.collection('users').doc(context.user.uid),profileRef=id?context.db.collection('profiles').doc(id):null;
      await context.db.runTransaction(async tx=>{
        const user=await tx.get(userRef),account=user.data();if(!user.exists||account?.status!=='approved')throw new Error('Sua conta precisa estar aprovada.');
        if(profileRef){const snapshot=await tx.get(profileRef),profile=snapshot.data(),email=String(context.user.email||'').toLowerCase();if(!snapshot.exists||!(account.role==='admin'||profile.ownerUid===context.user.uid||(profile.sharedView||[]).includes(email)||(profile.sharedEdit||[]).includes(email)))throw new Error('Esse perfil não está mais disponível para sua conta.');}
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
