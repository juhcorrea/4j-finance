'use strict';
const fs=require('node:fs'),path=require('node:path');
function publicConfig(mode){
 if(!mode||typeof mode!=='object'||Array.isArray(mode)||Object.keys(mode).length!==1||!Object.hasOwn(mode,'pilotEnabled')||typeof mode.pilotEnabled!=='boolean')throw Error('Configuracao de piloto invalida. Use somente pilotEnabled booleano.');
 return {enabled:mode.pilotEnabled,region:'southamerica-east1',adsEnabled:false,adPageAllowlist:[],provider:'cloudflare',apiBase:'/api/pix',publicPayments:false,pilotEnabled:mode.pilotEnabled};
}
function readPublicConfig(root){return publicConfig(JSON.parse(fs.readFileSync(path.join(root,'frontend/monetization-build.json'),'utf8')));}
function embeddedConfig(html){const match=html.match(/window\.MONETIZATION_CONFIG=(\{[^;]+\});/);if(!match)throw Error('Configuracao publica do Pix ausente.');return JSON.parse(match[1]);}
module.exports={publicConfig,readPublicConfig,embeddedConfig};
