'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),temporaryRoot=fs.realpathSync(os.tmpdir()),temporary=fs.mkdtempSync(path.join(temporaryRoot,'4j-build-'));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
try{
 for(const dir of ['source','frontend','public'])fs.cpSync(path.join(root,dir),path.join(temporary,dir),{recursive:true,filter:src=>!src.split(path.sep).some(part=>['node_modules','.wrangler','.firebase','.git'].includes(part))});
 fs.mkdirSync(path.join(temporary,'privacy'));
 for(const file of ['apply-privacy.cjs','email-privacy.js'])fs.copyFileSync(path.join(root,'privacy',file),path.join(temporary,'privacy',file));
 fs.copyFileSync(path.join(root,'build.cjs'),path.join(temporary,'build.cjs'));
 cp.execFileSync(process.execPath,['build.cjs'],{cwd:temporary,stdio:'pipe',windowsHide:true});
 const before=hash(path.join(root,'public/index.html')),after=hash(path.join(temporary,'public/index.html'));
 if(before!==after)throw Error('O build difere do public/index.html versionado. Reconciliar fonte e entrega antes do envio.');
 console.log('Build reproduzivel: public/index.html identico. SHA-256 '+after);
}finally{
 const resolved=fs.realpathSync(temporary);
 if(path.dirname(resolved)!==temporaryRoot||!path.basename(resolved).startsWith('4j-build-'))throw Error('Limpeza recusada: pasta temporaria inesperada.');
 fs.rmSync(resolved,{recursive:true,force:true});
}
