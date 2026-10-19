'use strict';
// Static publication is isolated from legacy functions/ and local Wrangler caches.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),stage=path.join(root,'work/cloudflare-static'),control=path.join(root,'work/cloudflare-static-deploy');
const files=['_headers','ads.txt','index.html','sobre.html','guia.html','privacidade.html','contato.html','public-site.css','public-ads.js','consent.css','consent.js','assets/4j-symbol.svg','assets/catatau.webp'];
for(const rel of files){const source=path.join(root,'public',rel),target=path.join(stage,rel);const info=fs.lstatSync(source);if(!info.isFile()||info.isSymbolicLink())throw Error('Unexpected public file');fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);}
function inspect(dir,prefix=''){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const rel=prefix+entry.name;if(entry.isSymbolicLink())throw Error('Unexpected staged link');if(entry.isDirectory())inspect(path.join(dir,entry.name),rel+'/');else if(!files.includes(rel))throw Error('Unexpected staged file');}}
inspect(stage);fs.mkdirSync(control,{recursive:true});fs.writeFileSync(path.join(control,'wrangler.json'),JSON.stringify({name:'4jfinance',pages_build_output_dir:'../cloudflare-static',compatibility_date:'2026-10-15'},null,2)+'\n');
console.log(JSON.stringify({mode:'static',files:files.length,stage:'work/cloudflare-static',control:'work/cloudflare-static-deploy',published:false}));
