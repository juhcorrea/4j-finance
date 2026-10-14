const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const file=path.resolve(__dirname,'..','index.html');
http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(!['/','/index.html'].includes(url.pathname)){res.writeHead(404).end();return;}fs.readFile(file,(err,data)=>{if(err){res.writeHead(500).end();return;}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(data);});}).listen(4174,'127.0.0.1',()=>console.log('Final file preview: http://127.0.0.1:4174/?demo=1'));
