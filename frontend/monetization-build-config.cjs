'use strict';
const fs=require('node:fs'),path=require('node:path');
function publicConfig(mode){
 if(!mode||typeof mode!=='object'||Array.isArray(mode)||Object.keys(mode).length!==2||!Object.hasOwn(mode,'pilotEnabled')||!Object.hasOwn(mode,'publicPayments')||typeof mode.pilotEnabled!=='boolean'||typeof mode.publicPayments!=='boolean'||(mode.pilotEnabled&&mode.publicPayments))throw Error('Configuracao Pix invalida. Use pilotEnabled e publicPayments booleanos, sem ativar ambos.');
 return {enabled:mode.pilotEnabled||mode.publicPayments,region:'southamerica-east1',adsEnabled:false,adPageAllowlist:[],provider:'cloudflare',apiBase:'/api/pix',publicPayments:mode.publicPayments,pilotEnabled:mode.pilotEnabled};
}
function readPublicConfig(root){return publicConfig(JSON.parse(fs.readFileSync(path.join(root,'frontend/monetization-build.json'),'utf8')));}
function embeddedConfig(html){const match=html.match(/window\.MONETIZATION_CONFIG=(\{[^;]+\});/);if(!match)throw Error('Configuracao publica do Pix ausente.');return JSON.parse(match[1]);}
module.exports={publicConfig,readPublicConfig,embeddedConfig};
