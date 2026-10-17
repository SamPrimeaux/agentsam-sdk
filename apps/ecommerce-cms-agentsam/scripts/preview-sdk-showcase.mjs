#!/usr/bin/env node
/* Local non-production UI preview; does not connect to customer databases. */
import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const staticRoot=path.join(root,'frontend/static');
const distRoot=path.join(root,'frontend/dist');
const port=Number(process.env.PORT||4327);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.json':'application/json','.woff2':'font/woff2'};
const spa=new Set(['analytics','account','products/create','products/help/artwork']);
const find=(p)=>{
 if(p==='/')return path.join(staticRoot,'home.html');
 if(p==='/admin/products')return path.join(staticRoot,'products-registry.html');
 if(p==='/admin/product-edit')return path.join(staticRoot,'product-edit-registry.html');
 if(p==='/admin/commerce-products')return path.join(staticRoot,'products.html');
 if(p==='/admin/_spa/'||p==='/admin/_spa')return path.join(distRoot,'index.html');
 if(p.startsWith('/admin/_spa/assets/'))return path.join(distRoot,p.slice('/admin/_spa/'.length));
 if(p==='/admin/js/shell.js')return path.join(root,'frontend/shell.js');
 if(p==='/admin/js/inspector.js')return path.join(root,'frontend/inspector.js');
 if(p.startsWith('/admin/')){
  const rel=p.slice('/admin/'.length);
  if(rel.includes('.') && !rel.endsWith('.html'))return path.join(staticRoot,rel);
  if([...spa].some(x=>rel===x||rel.startsWith(x+'/')))return path.join(distRoot,'index.html');
  return path.join(staticRoot,(rel||'home').replace(/\.html$/,'')+'.html');
 }
 return null;
};
const server=http.createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname.startsWith('/api/')){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'preview_only',message:'This is an isolated UI preview. Backend APIs and tenant data are not connected.'}));return}
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return}
  let target=find(pathname);
  if(!target){res.writeHead(302,{Location:'/admin/home'});res.end();return}
  target=path.resolve(target);
  if(![staticRoot,distRoot,path.join(root,'frontend')].some(x=>target.startsWith(path.resolve(x)+path.sep))){res.writeHead(403);res.end();return}
  let data=await readFile(target);
  const ext=path.extname(target);
  if(ext==='.html'){
   let html=data.toString().replaceAll('Fuel & Free Time Admin','AgentSam SDK Commerce · Local Preview').replaceAll('Fuel & Free Time','AgentSam SDK');
   html=html.replace('</body>', '<div style="position:fixed;bottom:12px;right:12px;z-index:2147483647;background:#121621;color:#fff;border:1px solid #61677a;border-radius:8px;padding:8px 12px;font:11px system-ui;box-shadow:0 4px 20px #0005">AgentSam SDK · isolated UI preview · no live CMS writes</div></body>');
   data=Buffer.from(html);
  }
  res.writeHead(200,{'Content-Type':mime[ext]||'application/octet-stream','Cache-Control':'no-store'});if(req.method==='HEAD')res.end();else res.end(data);
 }catch(e){res.writeHead(e.code==='ENOENT'?404:500,{'Content-Type':'text/plain'});res.end(String(e.message||e))}
});
server.listen(port,'127.0.0.1',()=>console.log('AgentSam SDK preview on http://127.0.0.1:'+port+'/admin/home'));
