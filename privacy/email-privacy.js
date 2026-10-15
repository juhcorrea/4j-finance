/* Email invitations require Firebase's verified-email claim, not a typed address. */
const EmailPrivacy={
  busy:false,
  markup(){
    if(Store.demo||Store.screen!=='app'||!Store.user||Store.user.emailVerified===true)return '';
    return '<section class="family-access-banner"><div><b>Confirme seu e-mail para participar de uma família</b><p>Seus registros pessoais já estão disponíveis. Para abrir espaços que alguém compartilhou com você, confirme o link recebido por e-mail.</p><div class="settings-buttons"><button class="button secondary" data-action="privacy-send-email">Enviar confirmação</button><button class="text-button" data-action="privacy-check-email">Já confirmei meu e-mail</button></div></div></section>';
  },
  async handle(action){
    if(this.busy||Store.demo||!Store.auth?.currentUser)return;
    const user=Store.auth.currentUser,uid=user.uid;
    this.busy=true;
    try{
      if(action==='privacy-send-email'){
        await user.sendEmailVerification();
        if(Store.user?.uid===uid)toast('Enviamos o link de confirmação. Confira também a pasta de spam.');
      }else{
        await user.reload();
        if(Store.auth.currentUser?.uid!==uid||Store.user?.uid!==uid)return;
        await Store.auth.currentUser.getIdToken(true);
        Store.user=Store.auth.currentUser;
        if(!Store.user.emailVerified){toast('A confirmação ainda não chegou. Abra o link recebido e tente novamente.');return;}
        Store.profileWatchScope=null;
        Store.watchProfiles();Store.emit();toast('E-mail confirmado. Os espaços compartilhados estão disponíveis.');
      }
    }catch(error){if(Store.user?.uid===uid)toast(error?.code==='auth/too-many-requests'?'Aguarde um pouco antes de enviar outro e-mail.':'Não foi possível confirmar agora. Confira sua conexão e tente novamente.');}
    finally{this.busy=false;}
  }
};
document.addEventListener('click',event=>{const action=event.target.closest('[data-action]')?.dataset.action;if(action==='privacy-send-email'||action==='privacy-check-email')EmailPrivacy.handle(action);});
