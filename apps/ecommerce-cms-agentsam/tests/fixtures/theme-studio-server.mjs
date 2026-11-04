#!/usr/bin/env node
/**
 * Disposable local acceptance harness. It serves the actual packaged editor and
 * calls the real Ecommerce API against isolated SQLite/object fixtures.
 * No production bindings, credentials, publications or external repositories.
 */
import http from "node:http";
import path from "node:path";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {createSiteOwnedFixture} from "./site-owned-cms.mjs";
import {handleAdminCmsApi} from "../../backend/cms/api.js";
import {getSiteOwnedPage} from "../../backend/cms/site-owned-page-adapter.mjs";
import {registryForAdmin} from "../../backend/cms/registry.js";
import {HeadEdgeHydratedHandler} from "../../backend/cms/edge-hydrate.js";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const assets=path.join(root,"dist/assets");
const f=createSiteOwnedFixture();
f.db.exec(`UPDATE cms_pages SET title='Disposable development fixture' WHERE id='home';
  UPDATE cms_page_sections SET section_key='hero' WHERE id='hero';
  INSERT INTO cms_pages VALUES ('sitepage','main','site','/__site','global','Global','published',NULL,0,0,0,'{}','{}',NULL,NULL,1790000000,1790000000,1790000000);
  INSERT INTO cms_page_sections VALUES ('brand','sitepage','brand','brand','Brand','{}',0,1,'cms','brand-draft','brand-live','original','2026-10-01');`);
f.objects.set("brand-draft",JSON.stringify({__editor:{themeSettings:{}}}));
f.objects.set("brand-live",JSON.stringify({__editor:{themeSettings:{}}}));
const mime={".html":"text/html",".js":"text/javascript",".mjs":"text/javascript",".css":"text/css",".json":"application/json",".svg":"image/svg+xml",".png":"image/png",".woff2":"font/woff2"};
const bootstrap=`<script>
window.AgentSamThemeEditorHost={
 page:"home",pageRoutes:{home:"/"},capabilities:{cmsWrite:true},
 adapter:{
  capabilities:{publish:false},
  async request(input,options={}) {
   const response=await fetch(input,{...options,headers:{"content-type":"application/json",...(options.headers||{})}});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||"Request failed");
   return data;
  },
  async getRegistry(){return (await fetch("/__fixture/registry")).json();},
  async getThemeIdentity(){return {slug:"heuristic",name:"Development fixture",version:1};},
  async resolvePreview(){return {html:await (await fetch("/__fixture/preview")).text()};}
 }
};
</script>`;
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,"http://127.0.0.1");
  const json=(value,status=200)=>{res.writeHead(status,{"content-type":"application/json","cache-control":"no-store"});res.end(JSON.stringify(value));};
  if(url.pathname==="/__fixture/registry")return json(registryForAdmin());
  if(url.pathname==="/__fixture/preview"){
   const site=await getSiteOwnedPage(f.env,"merchant","site","main","sitepage");
   const content=site.page.sections[0].content;let head="";
   new HeadEdgeHydratedHandler({brand:content}).element({append(value){head+=value;}});
   res.writeHead(200,{"content-type":"text/html","cache-control":"no-store"});
   res.end('<!doctype html><html><head>'+head+'<style>body{margin:0;background:#f4f3f0;color:#202129;font:16px system-ui}main{padding:32px;box-sizing:border-box}button{padding:14px 24px;background:#202129;color:white;border:0}.h-container{width:100%}</style></head><body><main class="h-container" data-cms-page-container><p>Disposable development fixture · private preview</p><section data-cms-section="hero"><h1 data-cms="headline">Theme settings round trip</h1><p>Same mounted editor, validation and private draft service.</p><button data-cms-button>Example storefront button</button><p><input aria-label="Example input" placeholder="Example input"></p></section></main></body></html>');
   return;
  }
  if(url.pathname==="/api/admin/me")return json({user:{id:"fixture",name:"Development fixture",role:"owner"},company:{name:"Disposable development fixture"},permissions:[]});
  if(url.pathname==="/api/admin/cms/pages"&&req.method==="GET")return json({site:{id:"main"},pages:[{id:"home",slug:"home",title:"Disposable development fixture",site_id:"main",route_path:"/",status:"published"}]});
  if(url.pathname.startsWith("/api/admin/cms/pages/")){
   url.searchParams.set("site_id","main");
   const slug=url.pathname.split("/")[5];
   url.searchParams.set("page_id",slug==="site"?"sitepage":"home");
   let body="";for await(const chunk of req)body+=chunk;
   const input=new Request(url,{method:req.method,headers:{"content-type":"application/json"},...(body?{body}:{})});
   const response=await handleAdminCmsApi(input,f.env,url,{accountId:"merchant"});
   if(!response)return json({error:"fixture_route_unavailable"},404);
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
  }
  if(url.pathname.startsWith("/api/"))return json({error:"Explicit development fixture: integration unavailable"},503);
  let relative=url.pathname==="/admin/theme-editor"?"admin/theme-editor.html":decodeURIComponent(url.pathname).replace(/^\//,"");
  const target=path.resolve(assets,relative);
  if(!target.startsWith(assets+path.sep))return json({error:"forbidden"},403);
  let bytes=await readFile(target);
  if(relative==="admin/theme-editor.html")bytes=Buffer.from(bytes.toString().replace("<head>","<head>"+bootstrap));
  res.writeHead(200,{"content-type":mime[path.extname(target)]||"application/octet-stream","cache-control":"no-store"});res.end(bytes);
 }catch(error){res.writeHead(error.code==="ENOENT"?404:500,{"content-type":"application/json"});res.end(JSON.stringify({error:error.message}));}
});
// Never inherit PORT: the terminal transport may own it. Request a free local port.
server.listen(0,"127.0.0.1",()=>{
 console.log("Disposable Theme Studio: http://127.0.0.1:"+server.address().port+"/admin/theme-editor?slug=home");
});
process.on("SIGTERM",()=>server.close(()=>{f.db.close();process.exit(0);}));
