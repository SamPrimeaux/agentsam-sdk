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
 if(p==='/admin/registry-build-edit')return path.join(staticRoot,'registry-build-edit.html');
 if(p==='/admin/products/create')return path.join(staticRoot,'product-create-universal.html');
 if(p.startsWith('/admin/products/create/'))return path.join(staticRoot,'product-explore-universal.html');
 if(p==='/admin/product-edit')return path.join(staticRoot,'product-edit.html');
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
  if(pathname==='/api/admin/completeful/catalog'){
   // Isolated SDK UI review ONLY: real read-only FNF supplier sample records.
   // The packaged application reads the real authenticated catalog backend.
   const items=[
    {name:'11x17 Bamboo Cutting Board',product_type:'ENGRAVING',realistic_image_url:'https://jvkydnvdajcfnqysmuwt.supabase.co/storage/v1/object/public/product-images/product-555100fd-13cf-46a0-b6ec-1a73fa625a2f/covers/6fa805ee-f13c-489e-81dd-47d5665844b9-_-2400-x-2400-px-2026-08-12T105504.484.png'},
    {name:'12oz Kids Tumbler',product_type:'ETCHING',realistic_image_url:'https://jvkydnvdajcfnqysmuwt.supabase.co/storage/v1/object/public/product-images/mockups/c21d336d-cae7-408e-a212-98438cf04c7e/10417e91-c692-44db-a5f1-e88849dc6cad/background.png'},
    {name:'12oz Skinny Mini Tumbler',product_type:'ETCHING',realistic_image_url:'https://jvkydnvdajcfnqysmuwt.supabase.co/storage/v1/object/public/product-images/mockups/88a4fd95-d42c-4f48-910a-dc5b606662e0/bccebc69-c3cb-4c3f-8f6a-bb0e355c11cc/background.png'}
   ];
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
   res.end(JSON.stringify({items,pagination:{total:3,has_more:false},sample_source:'read-only supplier catalog records; preview only'}));
   return;
  }
  const match=pathname.match(/^\/api\/admin\/products\/(prod_[a-z0-9]+)(\/images)?$/);
  if(match){
   const snapshot=JSON.parse(await readFile(path.join(staticRoot,'registry/products-snapshot.json'),'utf8'));
   const item=snapshot.items.find(x=>x.id===match[1]);
   if(!item){res.writeHead(404,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'not_found'}));return}
   const demoImages=item.slug==='agentsam-local-studio'?[
    {id:901,asset_id:901,url:'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/9017b9cc-c5e7-4d48-e38f-456e9dd55100/thumbnail',is_primary:1,filename:'agentsam-sdk-icon'},
    {id:902,asset_id:902,url:'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/a39b5154-8b51-4efa-4b71-6a97a37ff900/medium',is_primary:0,filename:'local-studio-dark'}
   ]:[];
   if(req.method!=='GET'){res.writeHead(405,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'preview_read_only'}));return}
   const product={id:item.id,title:item.name,slug:item.slug,description:item.slug==='agentsam-local-studio'?'AgentSam Local Studio is a desktop workspace for working with AgentSam SDK. Explore projects, files, terminal sessions and developer workflows in one interface.':'',seo_title:item.slug==='agentsam-local-studio'?'AgentSam Local Studio | Desktop Developer Workspace':'',seo_description:item.slug==='agentsam-local-studio'?'Explore AgentSam Local Studio, a desktop workspace integrating projects, files, terminal sessions and developer tools with AgentSam SDK.':'',collection:item.kind==='app'?'Applications':'',status:'draft',price_cents:0,kind:item.kind,sku:'IAM-APP-'+item.slug.toUpperCase().replace(/[^A-Z0-9]+/g,'-')};
   const out=match[2]?{images:demoImages}:{product,variants:[],collection_ids:[],design_draft:null,fulfillment:null,source:null,selling_selection:null};
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(out));return;
  }
  if(pathname==='/api/admin/store/online'){
   if(req.method!=='GET'){res.writeHead(405,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'read_only'}));return}
   // An SDK-scoped, read-only store overview. Absence of a verified installed
   // theme must not be misrepresented as an active theme or a published draft.
   const payload={
     store:{name:'AgentSam SDK',site_url:'https://agentsam.inneranimalmedia.com/',visibility:'public'},
     active_theme:null,draft_themes:[],
     performance:{period_days:30,lcp_ms:null,inp_ms:null,cls:null,sessions_desktop:null,sessions_mobile:null},
     installation:{status:'not_connected',required:['tenant_session','cms_themes','cms_pages','cms_page_sections','cms_assets']}
   };
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(payload));return;
  }
  if(pathname==='/api/admin/collections'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({collections:[]}));return}
  if(pathname.startsWith('/api/')){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'preview_only',message:'This is an isolated UI preview. Backend APIs and tenant data are not connected.'}));return}
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return}
  let target=(pathname==='/admin/product-edit' && /^\d+$/.test(new URL(req.url,'http://localhost').searchParams.get('id')||''))?path.join(staticRoot,'product-edit.html'):find(pathname);
  if(!target){res.writeHead(302,{Location:'/admin/home'});res.end();return}
  target=path.resolve(target);
  if(![staticRoot,distRoot,path.join(root,'frontend')].some(x=>target.startsWith(path.resolve(x)+path.sep))){res.writeHead(403);res.end();return}
  let data=await readFile(target);
  const ext=path.extname(target);
  if(ext==='.html'){
   let html=data.toString().replaceAll('Fuel & Free Time Admin','AgentSam SDK Commerce · Local Preview').replaceAll('Fuel & Free Time','AgentSam SDK');
   data=Buffer.from(html);
  }
  res.writeHead(200,{'Content-Type':mime[ext]||'application/octet-stream','Cache-Control':'no-store'});if(req.method==='HEAD')res.end();else res.end(data);
 }catch(e){res.writeHead(e.code==='ENOENT'?404:500,{'Content-Type':'text/plain'});res.end(String(e.message||e))}
});
server.listen(port,'127.0.0.1',()=>console.log('AgentSam SDK preview on http://127.0.0.1:'+port+'/admin/home'));
