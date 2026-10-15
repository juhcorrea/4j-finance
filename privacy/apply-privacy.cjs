'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
function applyPrivacy(input){
  let html=input.replace(/\r\n/g,'\n');
  const report=[];
  function replace(from,to,label,count=1){const found=html.split(from).length-1;if(found!==count)throw new Error(`${label}: expected ${count}, found ${found}`);html=html.split(from).join(to);report.push(label);}
  replace("if(this.userDoc?.role==='admin')return 'admin';",'', 'remove-global-admin-permission');
  replace("if((this.meta.sharedEdit||[]).includes(this.user.email.toLowerCase()))", "if(this.user.emailVerified===true&&(this.meta.sharedEdit||[]).includes(this.user.email.toLowerCase()))",'verified-edit-getter');
  replace("['owner','admin','edit'].includes(this.permission)","['owner','edit'].includes(this.permission)",'editable-roles');
  replace("['owner','admin'].includes(this.permission)","this.permission==='owner'",'manage-owner-only');
  replace("const queries=this.userDoc.role==='admin'?[coll]:[coll.where('ownerUid','==',this.user.uid),coll.where('sharedView','array-contains',this.user.email.toLowerCase()),coll.where('sharedEdit','array-contains',this.user.email.toLowerCase())];","const queries=[coll.where('ownerUid','==',this.user.uid),...(this.user.emailVerified===true?[coll.where('sharedView','array-contains',this.user.email.toLowerCase()),coll.where('sharedEdit','array-contains',this.user.email.toLowerCase())]:[])];",'legacy-scoped-queries');
  replace("const owner=meta?.ownerUid===store.user.uid,admin=account.role==='admin',edit=(meta?.sharedEdit||[]).includes(String(store.user.email||'').toLowerCase());", "const owner=meta?.ownerUid===store.user.uid,edit=store.user.emailVerified===true&&(meta?.sharedEdit||[]).includes(String(store.user.email||'').toLowerCase());",'fresh-transaction-permissions');
  replace('!(owner||admin||(!manage&&edit))','!(owner||(!manage&&edit))','remove-transaction-admin');
  replace("Apenas o proprietário ou a administração pode", "Apenas o proprietário pode", 'owner-only-copy',2);
  for(const source of ['store','this','Store']){
    const before=`{uid:${source}.user.uid,email:${source}.user.email}`;
    const count=html.split(before).length-1;
    if(count)replace(before,`{uid:${source}.user.uid,email:${source}.user.email,emailVerified:${source}.user.emailVerified===true}`,`snapshot-verification-${source}`,count);
  }
  replace("!(account.role==='admin'||profile.ownerUid===context.user.uid||(profile.sharedView||[]).includes(email)||(profile.sharedEdit||[]).includes(email))", "!(profile.ownerUid===context.user.uid||(context.user.emailVerified===true&&((profile.sharedView||[]).includes(email)||(profile.sharedEdit||[]).includes(email))))",'default-profile-privacy');
  replace("return p.ownerUid===store.user?.uid||(p.sharedView||[]).includes(email)||(p.sharedEdit||[]).includes(email);", "return p.ownerUid===store.user?.uid||(store.user?.emailVerified===true&&((p.sharedView||[]).includes(email)||(p.sharedEdit||[]).includes(email)));",'verified-family-participation');
  replace("this.approved(store)&&(p.ownerUid===store.user.uid||store.userDoc.role==='admin')", "this.approved(store)&&p.ownerUid===store.user.uid",'family-owner-management');
  replace("!(meta?.ownerUid===actor.uid||account?.role==='admin')", "meta?.ownerUid!==actor.uid",'fresh-share-owner-check');
  replace('Somente o proprietário deste espaço ou um administrador da plataforma pode gerenciar o acesso.', 'Somente o proprietário deste espaço pode gerenciar o acesso.','share-owner-copy');
  replace("FamilyAccess.email(this),this.userDoc?.role,this.userDoc?.status", "FamilyAccess.email(this),this.user?.emailVerified===true,this.userDoc?.status",'watch-scope-verification');
  replace("queries=this.userDoc.role==='admin'?[coll]:[coll.where('ownerUid','==',actor),coll.where('sharedView','array-contains',FamilyAccess.email(this)),coll.where('sharedEdit','array-contains',FamilyAccess.email(this))]", "queries=[coll.where('ownerUid','==',actor),...(this.user.emailVerified===true?[coll.where('sharedView','array-contains',FamilyAccess.email(this)),coll.where('sharedEdit','array-contains',FamilyAccess.email(this))]:[])]",'final-scoped-queries');
  replace("!(accountData.role==='admin'||profileData.ownerUid===user.uid||(Array.isArray(profileData.sharedEdit)&&profileData.sharedEdit.includes(email)))", "!(profileData.ownerUid===user.uid||(user.emailVerified===true&&Array.isArray(profileData.sharedEdit)&&profileData.sharedEdit.includes(email)))",'recurrence-no-admin-bypass');
  replace("space.meta.ownerUid!==context.user.uid&&context.userDoc?.role!=='admin'&&!(space.meta.sharedEdit||[]).includes(String(context.user.email||'').toLowerCase())", "space.meta.ownerUid!==context.user.uid&&!(context.user.emailVerified===true&&(space.meta.sharedEdit||[]).includes(String(context.user.email||'').toLowerCase()))",'receipt-candidates-no-admin');
  replace("Store.demo||Store.userDoc?.role==='admin'||p.ownerUid===Store.user?.uid||(p.sharedEdit||[]).includes(String(Store.user?.email||'').toLowerCase())", "Store.demo||p.ownerUid===Store.user?.uid||(Store.user?.emailVerified===true&&(p.sharedEdit||[]).includes(String(Store.user?.email||'').toLowerCase()))",'family-targets-no-admin');
  replace("Administrador: gerencia usuários e todos os perfis", "Administrador da plataforma: gerencia contas; finanças somente com compartilhamento",'role-tooltip');
  replace("${accountIsAdmin()?'Consulta administrativa':'Perfil compartilhado explicitamente'}", 'Perfil compartilhado explicitamente', 'banner-privacy');
  replace('Você administra a plataforma. O seletor principal mostra seus perfis pessoais e as famílias das quais participa. A consulta de todos os perfis fica nesta tela.','Você administra as contas da plataforma. Só acessa seus próprios perfis e os espaços compartilhados explicitamente com você.','settings-privacy-copy');
  const legacyAdminPicker="${accountIsAdmin()?`<div class=\"settings-group\"><h3>Todos os perfis · consulta ADMIN</h3><label>Selecionar perfil para administrar<select id=\"admin-profile-select\">${FamilyAccess.options(Store,true,true)}</select></label><p class=\"form-tip\">A consulta administrativa não transforma você em participante da família.</p></div>`:Store.profiles.some";
  replace(legacyAdminPicker,'${Store.profiles.some','remove-global-profile-picker');
  replace('Esta pessoa terá acesso a todos os perfis financeiros e poderá gerenciar usuários, inclusive conceder ADMIN a outras contas. Só conceda a alguém de confiança.','Esta pessoa poderá gerenciar contas, inclusive conceder ADMIN a outras pessoas. Esse papel não dá acesso aos registros financeiros de outras famílias. Só conceda a alguém de confiança.','grant-admin-copy');
  replace('Esta conta já tem o papel ADMIN. Ao ativá-la, a pessoa terá acesso a todos os perfis financeiros e ao gerenciamento de usuários.','Esta conta já tem o papel ADMIN. Ao ativá-la, a pessoa poderá gerenciar contas. O acesso financeiro continua limitado aos próprios espaços e aos compartilhados com ela.','activate-admin-copy');
  replace('acessa todos os perfis e pode suspender acessos ou conceder e remover ADMIN.','gerencia contas, mas só vê seus próprios perfis e os compartilhados com ela.','demo-admin-copy');
  replace('conceder ADMIN permite acessar todos os perfis e gerenciar usuários.','conceder ADMIN permite gerenciar contas e não libera as finanças de outras famílias.','admin-list-copy');
  replace('<b>Perfis deste proprietário:</b>','<b>Perfis compartilhados com você ou próprios:</b>','admin-profile-summary');

  // Open signup. Existing suspended/pending documents are deliberately preserved.
  replace("status:'pending',role:'member'", "status:'approved',role:'member'",'open-signup-data',2);
  replace('/* Approval is required. Missing user documents are created pending; existing roles/status are never overwritten. */','/* Public signup creates active members. Existing roles/status are never overwritten. */','signup-comment');
  replace('Novos cadastros aguardam aprovação.','Crie sua conta e comece na hora.','login-public-copy');
  replace('como Membro aguardando aprovação','como Membro ativo','provisioning-copy');
  replace("inactive?'Aguardando aprovação'","inactive?'Acesso inativo'",'inactive-title');
  replace('Seu cadastro foi recebido e aguarda a aprovação da administração da plataforma. Se o acesso foi suspenso, somente um administrador pode reativá-lo. A tela será atualizada quando a aprovação chegar.','Esta conta está inativa. Peça à administração a reativação. Novos cadastros começam ativos; contas que já estavam suspensas ou pendentes não são reativadas automaticamente.','inactive-copy');
  replace('Aguarde a aprovação da administração antes de criar ou compartilhar espaços.','Sua conta precisa estar ativa para criar ou compartilhar espaços.','active-space-copy');
  replace('Sua conta precisa estar aprovada.','Sua conta precisa estar ativa.','active-create-copy');
  replace('poderá convidar pessoas aprovadas','poderá convidar pessoas com conta ativa e e-mail verificado','family-create-copy');
  replace('Sua conta aprovada pode criar perfis pessoais e famílias.','Sua conta ativa pode criar perfis pessoais e famílias.','settings-active-copy');
  replace('Aprove novos cadastros antes de liberar o painel. Donos de famílias não aprovam contas da plataforma.','Novos cadastros começam ativos. Você pode suspender contas e gerenciar administradores. Proprietários de famílias gerenciam somente seus próprios espaços.','admin-open-copy');
  replace('Gerenciar usuários e aprovações','Gerenciar contas','admin-button');
  replace('A pessoa precisa ter uma conta aprovada pela administração da plataforma.','A pessoa precisa ter uma conta ativa e confirmar o próprio e-mail para acessar o espaço.','family-invite-copy');
  replace('nem aprovar cadastros.','nem administrar contas da plataforma.','family-permission-copy');
  replace('Novos cadastros aguardam aprovação da administração.','Novos cadastros começam ativos.','demo-open-copy');
  replace('Novos cadastros aguardam aprovação como Membro.','Novos cadastros começam ativos como Membro.','admin-open-list-copy');
  replace('cria um pedido pendente no primeiro login','cria um cadastro ativo no primeiro login','admin-auth-provision-copy');

  // Replace outdated partial Firebase guidance; the complete rules ship separately.
  const helpStart=html.indexOf('function firebaseSignupHelp(){');
  const helpEnd=html.indexOf('\nfunction createSpaceForm(',helpStart);
  if(helpStart<0||helpEnd<0)throw new Error('Firebase help anchors not found');
  html=html.slice(0,helpStart)+`function firebaseSignupHelp(){if(!accountIsAdmin())return;modal('Privacidade e acesso no Firebase','<p class="modal-copy">Novas contas entram como membros ativos. ADMIN da plataforma gerencia contas; esse papel não permite ler as finanças de outros usuários.</p><p class="modal-copy" style="margin-top:14px">A proteção depende das regras completas do Firestore entregues com esta atualização. O HTML sozinho não bloqueia consultas diretas ao banco. Publique as regras após revisar os perfis existentes e testar com contas diferentes. Não mantenha regras antigas que liberem todos os dados.</p><p class="modal-copy" style="margin-top:14px">Perfis pessoais são privados por padrão. Compartilhamentos por e-mail exigem que a pessoa confirme esse e-mail. Quem administra o projeto Firebase pelo console ainda possui os acessos técnicos concedidos pelo Google Cloud; isso é diferente do papel ADMIN do aplicativo.</p>');}`+html.slice(helpEnd);
  report.push('replace-partial-rule-guide');

  const emailModule=fs.readFileSync(require('node:path').join(__dirname,'email-privacy.js'),'utf8');
  replace('const FamilyAccess={',emailModule+'\nconst FamilyAccess={','email-verification-module');
  replace("updateShell('family-access-context',familyMembershipMarkup());","updateShell('family-access-context',EmailPrivacy.markup()+familyMembershipMarkup());",'verification-banner');
  // Compile every inline script before yielding a candidate.
  let scripts=0;for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){if(match[1].trim()){new vm.Script(match[1]);scripts++;}}
  return {html,report,scripts};
}
module.exports={applyPrivacy};
if(require.main===module){const [, ,input,output]=process.argv;if(!input||!output)throw new Error('Usage: node apply-privacy.cjs INPUT.html OUTPUT.html');const result=applyPrivacy(fs.readFileSync(input,'utf8'));fs.writeFileSync(output,result.html);console.log(JSON.stringify({output,changes:result.report,scripts:result.scripts},null,2));}
