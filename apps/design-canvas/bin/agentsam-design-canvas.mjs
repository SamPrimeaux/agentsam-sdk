#!/usr/bin/env node
import { createServer } from 'node:http';
import { stat,readFile } from 'node:fs/promises';
import { resolve,extname,sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(fileURLToPath(new URL('../dist/',import.meta.url)));
const command=process.argv[2]||'preview';
if(command==='info'){console.log(JSON.stringify({id:'design-canvas',name:'AgentSam Design Canvas',source:root,surfaces:['web','side-stage'],auth:'host-controlled'},null,2));process.exit(0);}
if(command==='doctor'){try{await stat(resolve(root,'index.html'));await stat(resolve(root,'sources/manifest.json'));console.log('ready: verified built assets');process.exit(0);}catch{console.error('Build missing: run npm run build -w @inneranimalmedia/agentsam-design-canvas');process.exit(1);}}
if(command!=='preview'){console.error('Usage: agentsam-design-canvas [preview|doctor|info]');process.exit(2);}
let port=Number(process.argv[3]||process.env.PORT||4178);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid port');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
createServer(async(req,res)=>{
 try{
  const url=new URL(req.url||'/', 'http://localhost');
  const pathname=decodeURIComponent(url.pathname);
  const path=resolve(root,'.'+pathname,(pathname.endsWith('/')?'index.html':''));
  if(!(path===root||path.startsWith(root+sep)))throw Error('Invalid path');
  const result=await stat(path);
  if(!result.isFile())throw Error('Not a file');
  const body=await readFile(path);
  res.writeHead(200,{'content-type':types[extname(path)]||'application/octet-stream','x-content-type-options':'nosniff','cache-control':'no-cache'});res.end(body);
 }catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log('Design Canvas: http://127.0.0.1:'+port+'/'));
