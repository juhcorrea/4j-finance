const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),output=path.resolve(root,'../4j-finance-portfolio-compartilhar.html');
let html=fs.readFileSync(path.join(root,'ABRA-O-PORTFOLIO.html'),'utf8');
html=html.replace('A galeria funciona offline após extrair a pasta completa.','Este arquivo contém as imagens, os vídeos, as legendas e a fonte. Pode ser enviado sozinho e aberto no navegador de outro computador.');
html=html.replace('<title>4J Finance · Kit de divulgação</title>','<title>4J Finance · Portfólio para compartilhar</title>');
html=html.replace('Narração sintetizada; dados demonstrativos.</footer>','Narração sintetizada; dados demonstrativos. <a href="assets/FONT-LICENSE.txt" download>Licença da fonte Montserrat</a></footer>');
const mime={'.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.mp4':'video/mp4','.vtt':'text/vtt','.txt':'text/plain;charset=utf-8','.ttf':'font/ttf'};
const assets={},audit=[];
function embed(relative){const full=path.resolve(root,relative);if(!full.startsWith(root+path.sep))throw Error('Asset outside portfolio');if(!assets[relative]){let b=fs.readFileSync(full);if(relative==='GUIA-DE-PUBLICACAO.txt'){let guide=b.toString('utf8').replaceAll('ABRA-O-PORTFOLIO.html','4j-finance-portfolio-compartilhar.html');guide='VERSÃO EM ARQUIVO ÚNICO\nAs imagens, os vídeos e os textos estão dentro do HTML. Use os botões do portfólio para baixar cada material; não é necessário ter as pastas do kit original.\n\n'+guide;b=Buffer.from(guide,'utf8');}assets[relative]={type:mime[path.extname(relative)]||'application/octet-stream',base64:b.toString('base64')};audit.push({file:relative,size:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')})}return relative;}
html=html.replace(/\b(src|href|poster)="([^"]+)"/g,(whole,attr,ref)=>{if(/^(?:https?:|data:|blob:|#|mailto:)/i.test(ref))return whole;embed(ref);return `data-contained-${attr}="${ref}"`});
const font=fs.readFileSync(path.join(root,'assets/Montserrat.ttf'));
html=html.replace("url('assets/Montserrat.ttf')",`url('data:font/ttf;base64,${font.toString('base64')}')`);
audit.push({file:'assets/Montserrat.ttf',size:font.length,sha256:crypto.createHash('sha256').update(font).digest('hex')});
const bootstrap=`<script id="embedded-media" type="application/json">${JSON.stringify(assets).replaceAll('<','\\u003c')}</script><script>
(function(){
'use strict';
const mediaElement=document.getElementById('embedded-media');
const media=JSON.parse(mediaElement.textContent);const urls=new Map();
for(const [key,item] of Object.entries(media)){
 const binary=atob(item.base64);const chunks=[];
 for(let offset=0;offset<binary.length;offset+=65536){const part=binary.slice(offset,offset+65536);const bytes=new Uint8Array(part.length);for(let i=0;i<part.length;i++)bytes[i]=part.charCodeAt(i);chunks.push(bytes);}
 urls.set(key,URL.createObjectURL(new Blob(chunks,{type:item.type})));
}
for(const attr of ['src','href','poster']){
 for(const node of document.querySelectorAll('[data-contained-'+attr+']')){
  const key=node.getAttribute('data-contained-'+attr);const url=urls.get(key);
  if(!url)throw Error('Recurso incorporado ausente: '+key);
  node.setAttribute(attr,url);
  if(attr==='href'&&node.hasAttribute('download'))node.setAttribute('download',key.split('/').pop());
 }
}
mediaElement.remove();
for(const video of document.querySelectorAll('video'))video.load();
document.documentElement.dataset.portableReady='true';
})();</script>`;
html=html.replace('</body>',bootstrap+'</body>');
fs.writeFileSync(output,html,'utf8');
fs.writeFileSync(path.join(__dirname,'portable-assets-manifest.json'),JSON.stringify({output:path.basename(output),embedded:audit,totalSourceBytes:audit.reduce((n,x)=>n+x.size,0),htmlBytes:Buffer.byteLength(html)},null,2));
console.log(JSON.stringify({file:output,resources:audit.length,bytes:fs.statSync(output).size,mb:Math.round(fs.statSync(output).size/1048576*10)/10}));
