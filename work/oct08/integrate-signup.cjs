const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dir=__dirname,scriptPath=path.join(dir,'script-1.js'),templatePath=path.join(dir,'template.html');
let source=fs.readFileSync(scriptPath,'utf8').replace(/\r\n/g,'\n'),template=fs.readFileSync(templatePath,'utf8');
function replace(from,to){if(!source.includes(from))throw Error('Missing signup anchor: '+from.slice(0,90));source=source.replaceAll(from,to);}
if(source.includes('const AccountSignup='))throw Error('Signup integration already exists.');
replace('const originalProfileStore=',fs.readFileSync(path.join(dir,'signup-access.js'),'utf8')+'\nconst originalProfileStore=');
const gate=source.split('\n').find(line=>line.trimStart().startsWith("if(Store.screen==='pending')"));
if(!gate)throw Error('Missing account gate');
replace(gate,"  if(['pending','provisioning','loading'].includes(Store.screen)){renderAccountGate();return;}");
const wording=[
  ['Sua conta precisa estar aprovada. Entre novamente e confira seu acesso.','Sua conta precisa estar ativa. Entre novamente e confira seu acesso.'],
  ['Entre com uma conta aprovada para escolher seu perfil padrão.','Entre com uma conta ativa para escolher seu perfil padrão.'],
  ['Sua conta precisa estar aprovada.','Sua conta precisa estar ativa.'],
  ['Aprove os e-mails cadastrados e escolha quem pode administrar a plataforma.','Novos cadastros entram automaticamente como Membro. Gerencie contas ativas e escolha quem pode administrar a plataforma.'],
  ['A pessoa precisa criar uma conta aprovada no 4J Finance.','A pessoa precisa criar uma conta no 4J Finance. O cadastro é liberado automaticamente como Membro.'],
  ['Somente uma conta ADMIN aprovada pode gerenciar usuários.','Somente uma conta ADMIN ativa pode gerenciar usuários.'],
  ['por uma conta ADMIN aprovada.','por uma conta ADMIN ativa.'],
  ['Sua conta não tem mais permissão de ADMIN aprovada.','Sua conta não tem mais permissão de ADMIN ativa.'],
  ['Aprove o acesso da pessoa antes de conceder ADMIN.','Ative o acesso da pessoa antes de conceder ADMIN.'],
  ['Aprovar o acesso?','Ativar o acesso?'],['Revogar o acesso?','Suspender o acesso?'],
  ['Continuará aprovada, com acesso aos próprios perfis e aos compartilhados com ela.','Continuará ativa, com acesso aos próprios perfis e aos compartilhados com ela.'],
  ['Continuará pendente até que seu acesso seja aprovado.','Continuará inativa até que seu acesso seja reativado.'],
  ['Ao aprová-la, a pessoa terá acesso','Ao ativá-la, a pessoa terá acesso'],
  ['Aprovar não concede ADMIN.','Ativar não concede ADMIN.'],
  ['A pessoa ficará pendente e não poderá acessar o painel. O papel ADMIN ou Membro será mantido, mas não dará acesso enquanto a conta estiver pendente.','A pessoa ficará inativa e não poderá acessar o painel. O papel ADMIN ou Membro será mantido, mas não dará acesso enquanto a conta estiver inativa.'],
  ['Aprovar acesso','Ativar acesso'],['Revogar acesso','Suspender acesso'],
  ['Membro aprovado:','Membro ativo:'],['ADMIN aprovado:','ADMIN ativo:'],
  ['pode aprovar pessoas ou conceder e remover ADMIN.','pode suspender acessos ou conceder e remover ADMIN.'],
  ['<b>Pendente:</b> aguarda aprovação para entrar no painel.','<b>Inativo:</b> não entra no painel até que o acesso seja reativado. Novos cadastros são liberados automaticamente como Membro.'],
  ['Aprovar libera a entrada; conceder ADMIN permite acessar todos os perfis e gerenciar usuários.','Novos cadastros entram automaticamente como Membro. Suspender bloqueia a entrada; conceder ADMIN permite acessar todos os perfis e gerenciar usuários.'],
  ["${approved?'Aprovado':'Pendente'}","${approved?'Ativo':'Inativo'}"],
  ['Aprove o acesso antes de conceder ADMIN','Ative o acesso antes de conceder ADMIN'],
  ['Para conceder ADMIN, aprove o acesso primeiro.','Para conceder ADMIN, ative o acesso primeiro.'],
  ['Um e-mail criado apenas no Firebase Authentication ainda precisa de seu documento em users.','Uma conta criada apenas no Firebase Authentication conclui o cadastro de Membro automaticamente no primeiro login, quando as regras permitem.']
];
for(const [from,to] of wording)replace(from,to);
const note='Novas contas precisam da aprovação da administração da família.';
if(!template.includes(note))throw Error('Missing auth note');
template=template.replace(note,'Cadastro liberado na hora como Membro. Seus perfis são pessoais; compartilhar é uma escolha sua.');
new vm.Script(source);fs.writeFileSync(scriptPath,source);fs.writeFileSync(templatePath,template);
console.log('Automatic member signup and active/inactive account labels integrated.');
