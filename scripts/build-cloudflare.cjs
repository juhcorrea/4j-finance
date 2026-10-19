'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),test=process.argv.includes('--test');
const stage=path.join(root,'work',test?'cloudflare-test':'cloudflare-production');
const esbuild=require('esbuild');
const publicFiles=['_headers','ads.txt','index.html','sobre.html','guia.html','privacidade.html','contato.html','public-site.css','public-ads.js','consent.css','consent.js','assets/4j-symbol.svg','assets/catatau.webp'];
async function main(){
 fs.mkdirSync(stage,{recursive:true});
 if(test)fs.writeFileSync(path.join(stage,'index.html'),'<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>4J Finance — teste Pix</title><h1>Ambiente de teste do Pix</h1><p>Usado apenas para validar pagamentos fictícios. Nenhum valor real é cobrado aqui.</p></html>');
 else for(const rel of publicFiles){const dest=path.join(stage,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,'public',rel),dest);}
 await esbuild.build({entryPoints:[path.join(root,'cloudflare/worker.mjs')],outfile:path.join(stage,'_worker.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',external:['node:*'],banner:{js:'import * as __fourJCrypto from "node:crypto"; const require = (name) => { if (name === "node:crypto") return __fourJCrypto; throw new Error("Unsupported server module"); };'},minify:false,sourcemap:false,logLevel:'silent'});
 fs.writeFileSync(path.join(stage,'_routes.json'),JSON.stringify({version:1,include:['/api/pix/*'],exclude:[]},null,2)+'\n');
 const allowed=new Set([...(test?['index.html']:publicFiles),'_worker.js','_routes.json']);
 function inspect(folder,prefix=''){for(const item of fs.readdirSync(folder,{withFileTypes:true})){const rel=prefix+item.name;if(item.isDirectory())inspect(path.join(folder,item.name),rel+'/');else if(!allowed.has(rel))throw Error('Arquivo não permitido no pacote: '+rel);}}
 const deployConfig=JSON.parse(fs.readFileSync(path.join(root,'cloudflare',test?'wrangler.test.json':'wrangler.production.json'),'utf8'));
 const control=path.join(root,'work',test?'cloudflare-test-deploy':'cloudflare-production-deploy');fs.mkdirSync(control,{recursive:true});
 deployConfig.pages_build_output_dir='../'+path.basename(stage);fs.writeFileSync(path.join(control,'wrangler.json'),JSON.stringify(deployConfig,null,2)+'\n');
 inspect(stage);console.log(JSON.stringify({stage:path.relative(root,stage).replaceAll('\\','/'),mode:test?'test':'production',serverBundled:true,secretsEmbedded:false}));
}
main().catch(()=>{console.error('Falha no empacotamento Cloudflare. Confira as fontes e a lista permitida.');process.exitCode=1;});
