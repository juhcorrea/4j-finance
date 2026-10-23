'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const base=__dirname,source=process.argv[2]||path.join(base,'source/base.html');
const {readPublicConfig,embeddedConfig}=require('./frontend/monetization-build-config.cjs');
const monetizationConfig=readPublicConfig(base);
const original=fs.readFileSync(source,'utf8');
const transformed=require('./privacy/apply-privacy.cjs').applyPrivacy(original);
let html=transformed.html;
function replaceOnce(from,to){if(html.split(from).length!==2)throw new Error('Expected unique anchor: '+from.slice(0,80));html=html.replace(from,to);}
const publisher='ca-pub-9462093834252455';
replaceOnce('<meta charset="utf-8">','<meta charset="utf-8">\n<meta name="google-adsense-account" content="'+publisher+'">');
const firestoreSdk='<script defer src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>';
replaceOnce(firestoreSdk,firestoreSdk+'\n<script defer src="https://www.gstatic.com/firebasejs/10.12.2/firebase-functions-compat.js"></script>\n<script>window.MONETIZATION_CONFIG='+JSON.stringify(monetizationConfig)+';</script>');
replaceOnce('</head>','<style>\n'+['monetization.css','auth-responsive.css','planning-watch.css','planning-page.css','planning-navigation.css'].map(file=>fs.readFileSync(path.join(base,'frontend',file),'utf8')).join('\n')+'\n</style>\n</head>');
const plannerMarker='/* Catatau: consultas locais, sem serviços de IA ou envio de mensagens. */';
replaceOnce(plannerMarker,['catatau-planner.js','planning-watch.js','planning-page.js'].map(file=>fs.readFileSync(path.join(base,'frontend',file),'utf8')).join('\n')+'\n'+plannerMarker);
const marker='if(document.modelContext?.registerTool)';
replaceOnce(marker,fs.readFileSync(path.join(base,'frontend/monetization.js'),'utf8')+'\n'+marker);
const note='<small class="muted">A demonstração usa apenas dados fictícios.</small>';
replaceOnce(note,note+'<nav class="auth-public-links" aria-label="Conheça o 4J Finance"><a class="text-button" href="sobre.html">Conheça o 4J</a><a class="text-button" href="guia.html">Guia financeiro</a><a class="text-button" href="privacidade.html">Privacidade e cookies</a><a class="text-button" href="contato.html">Atendimento</a></nav>');
let inlineScripts=0;for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(match[2].trim()){new vm.Script(match[2]);inlineScripts++;}}
if(/adsbygoogle\.js/.test(html))throw new Error('AdSense script must not execute in the private finance application');
if(JSON.stringify(embeddedConfig(html))!==JSON.stringify(monetizationConfig)||monetizationConfig.adsEnabled!==false)throw new Error('Pix must match the reviewed build mode and ads must remain disabled');
const configMatch=html.match(/window\.FINANCE_CONFIG\s*=\s*(\{[\s\S]*?\});/);if(!configMatch)throw new Error('Firebase public config not found');
const publicConfig=vm.runInNewContext('('+configMatch[1]+')');
const guidePath=path.join(base,'public/guia.html');
if(fs.existsSync(guidePath)){let guide=fs.readFileSync(guidePath,'utf8');if(guide.includes('__FIREBASE_CONFIG__')){guide=guide.replace('__FIREBASE_CONFIG__',JSON.stringify(publicConfig));fs.writeFileSync(guidePath,guide);}for(const match of guide.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(match[2].trim()){if(/type=["']application\/json["']/i.test(match[1]))JSON.parse(match[2]);else new vm.Script(match[2]);}}
fs.mkdirSync(path.join(base,'public'),{recursive:true});
const output=path.join(base,'public/index.html');fs.writeFileSync(output,html);
const sourceRelative=path.relative(base,path.resolve(source));
const sourceLabel=sourceRelative.startsWith('..'+path.sep)||path.isAbsolute(sourceRelative)?path.basename(source):sourceRelative.split(path.sep).join('/');
const report={source:sourceLabel,sourceSha256:crypto.createHash('sha256').update(original).digest('hex'),output:'public/index.html',bytes:Buffer.byteLength(html),inlineScripts,privacyChanges:transformed.report,paymentsEnabled:monetizationConfig.publicPayments,pixPilotEnabled:monetizationConfig.pilotEnabled,frontendIntegrationEnabled:monetizationConfig.enabled,adsEnabled:false,realBackendChanged:false};
fs.writeFileSync(path.join(base,'build-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({output:report.output,bytes:report.bytes,inlineScripts,privacyChanges:report.privacyChanges.length,paymentsEnabled:monetizationConfig.publicPayments,pixPilotEnabled:monetizationConfig.pilotEnabled,frontendIntegrationEnabled:monetizationConfig.enabled,adsEnabled:false}));
