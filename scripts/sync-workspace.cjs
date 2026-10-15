'use strict';
// Importacao seletiva; executar na copia Git depois de conferir alteracoes locais.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),arg=process.argv[2];
if(!arg)throw Error('Uso: node scripts/sync-workspace.cjs <workspace-do-projeto>');
const workspace=fs.realpathSync(path.resolve(arg)),source=path.join(workspace,'4j-finance-monetizacao');
if(!fs.existsSync(path.join(root,'.git')))throw Error('Execute o importador na copia Git, nao no pacote de trabalho.');
const remote=cp.execFileSync('git',['remote','get-url','origin'],{cwd:root,encoding:'utf8',windowsHide:true}).trim();
if(!/github\.com[/:]juhcorrea\/4j-finance(?:\.git)?$/.test(remote))throw Error('Repositorio de destino inesperado.');
if(!fs.existsSync(path.join(source,'public/index.html')))throw Error('Pacote de origem ausente.');
const files=new Map();
function collect(from,to){
 const info=fs.lstatSync(from);if(info.isSymbolicLink())throw Error('Link simbolico nao permitido: '+to);
 if(info.isDirectory()){for(const name of fs.readdirSync(from).sort()){if(['node_modules','.wrangler','.firebase','.git'].includes(name))continue;collect(path.join(from,name),path.posix.join(to,name));}return;}
 if(!info.isFile())throw Error('Tipo de arquivo inesperado: '+to);
 if(to.split('/').some(p=>['node_modules','.wrangler','.firebase','.git'].includes(p))||/\.(?:pem|key|log|zip)$/i.test(to)||/(^|\/)\.env(?:\.|$)/.test(to)&&!to.endsWith('.env.example'))throw Error('Arquivo local ou secreto recusado: '+to);
 if(info.size>45*1024*1024)throw Error('Arquivo grande demais para sincronizacao: '+to);
 files.set(to,from);
}
for(const dir of ['public','frontend','source','scripts','docs','.github'])collect(path.join(source,dir),dir);
for(const file of ['README.md','AGENTS.md','.gitignore','.gitattributes','.nvmrc','netlify.toml','package.json','pnpm-lock.yaml','build.cjs','finalize.cjs','firebase.json','firebase-rules-deploy.json','PUBLICACAO.json','COMECE-AQUI.md','PUBLICAR-NO-CLOUDFLARE.md','ADSENSE-PREPARACAO.txt','DOMINIO-OFICIAL.txt','DECISOES.txt','TESTES.txt','ui-qa.cjs','qa-production-ui.cjs'])collect(path.join(source,file),file);
for(const file of ['index.js','payment-core.js','package.json','package-lock.json','.env.example','.gitignore','CONFIGURAR.md','firestore-billing.rules.fragment'])collect(path.join(source,'functions',file),'functions/'+file);
collect(path.join(source,'functions/test'),'functions/test');
for(const file of ['apply-privacy.cjs','email-privacy.js','firestore.rules','privacy.test.cjs','firestore-emulator.test.cjs','firebase-emulator.json','package.json','VERIFICACAO.txt'])collect(path.join(source,'privacy',file),'privacy/'+file);
for(const file of ['public-pages.test.cjs','auth-responsive.test.cjs'])collect(path.join(source,'qa',file),'qa/'+file);
const marketing=path.join(workspace,'4j-finance-marketing-2026-10');
for(const dir of ['assets','capas','capturas','carrossel','legendas','posts','stories','videos'])collect(path.join(marketing,dir),'marketing/'+dir);
for(const file of ['ABRA-O-PORTFOLIO.html','conteudo.json','GUIA-DE-PUBLICACAO.txt','LEIA-ME.txt'])collect(path.join(marketing,file),'marketing/'+file);
collect(path.join(workspace,'4j-finance-logotipo-adsense.png'),'branding/4j-finance-logotipo-adsense.png');
collect(path.join(workspace,'4j-finance-portfolio-compartilhar.html'),'4j-finance-portfolio-compartilhar.html');
collect(path.join(source,'public/index.html'),'index.html');
collect(path.join(source,'public/index.html'),'outputs/index.html');
const oldManifest=path.join(root,'sync-manifest.json');
if(fs.existsSync(oldManifest)){
 const previous=JSON.parse(fs.readFileSync(oldManifest,'utf8'));
 const absent=(previous.files||[]).map(f=>f.path).filter(p=>!files.has(p));
 if(absent.length)throw Error('Arquivos removidos da origem exigem reconciliacao antes de sincronizar: '+absent.join(', '));
}
const manifest=[];
for(const [rel,from] of files){
 const target=path.resolve(root,rel);
 if(!target.startsWith(root+path.sep)||rel.split('/').includes('.git'))throw Error('Destino fora do repositorio.');
 const data=fs.readFileSync(from);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data);
 manifest.push({path:rel,bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')});
}
manifest.sort((a,b)=>a.path.localeCompare(b.path));
const result={repository:'juhcorrea/4j-finance',hostingDirectory:'public',files:manifest};
fs.writeFileSync(oldManifest,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({copied:manifest.length,totalBytes:manifest.reduce((n,f)=>n+f.bytes,0),repository:result.repository,committed:false,pushed:false}));
