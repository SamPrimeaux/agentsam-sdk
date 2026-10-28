#!/usr/bin/env node
/* Local non-production UI preview; does not connect to customer databases. */
import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {getRegistryPage} from '../backend/cms/registry.js';
import {listLocalThemeProducts} from '../../../packages/catalog/src/theme-products.mjs';
import {RESOLVE_PORTAL_TEMPLATES,portalCmsPage,portalTemplateForSlug,portalTemplateForPath} from '../../../packages/theme-resolve/src/portal-templates.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const staticRoot=path.join(root,'frontend/static');
const distRoot=path.join(root,'frontend/dist');
// Serve the real packaged theme assets; local preview never forks the storefront.
const themeRoots=Object.fromEntries(['violet','resolve'].map(theme=>[theme,path.resolve(root,'../theme-gallery-preview/themes/'+theme+'/site')]));
const violetRoot=path.resolve(root,'../../packages/theme-violet/site');
themeRoots.violet=violetRoot;
const journalRoot=path.resolve(root,'../../packages/theme-plain-jane/site');
const journalManifest=JSON.parse(await readFile(path.join(journalRoot,'journal-cms-manifest.json'),'utf8'));
const journalPages=journalManifest.pages.map(page=>({
  slug:page.slug,title:page.title,status:'draft',template_key:page.template_key,
  live_route:'/themes/plain-jane/demo/'+page.path,
  preview_only:true
}));
const journalPaths=new Set(journalManifest.pages.map(p=>p.path));
const resolvePortalRoot=path.resolve(root,'../../packages/theme-resolve/site/portal');
const port=Number(process.env.PORT||4327);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.json':'application/json','.woff2':'font/woff2'};
const storefrontManifestPaths=[
 path.join(root,'agentsam.app.json'),
 path.join(root,'apps/resend/agentsam.app.json')
];
const spa=new Set(['analytics','account','products/create','products/help/artwork']);
// Read-only supplier examples for this isolated UI preview. Production uses the
// authenticated Completeful adapter; these records keep the local visual route
// on the same catalog contract without substituting for the production backend.
const previewCatalog = [
  {
    catalog_product_id: "product-555100fd-13cf-46a0-b6ec-1a73fa625a2f",
    provider: "completeful",
    provider_product_id: "product-555100fd-13cf-46a0-b6ec-1a73fa625a2f",
    name: "11x17 Bamboo Cutting Board",
    product_type: "ENGRAVING",
    print_type: "ENGRAVING",
    material: "Bamboo",
    sku: null,
    available: 1,
    pricing_currency: "USD",
    fulfillment_cost_free_cents: null,
    realistic_image_url: "https://jvkydnvdajcfnqysmuwt.supabase.co/storage/v1/object/public/product-images/product-555100fd-13cf-46a0-b6ec-1a73fa625a2f/covers/6fa805ee-f13c-489e-81dd-47d5665844b9-_-2400-x-2400-px-2026-08-12T105504.484.png",
    variant_count: 1,
    print_location_count: 1,
    mockup_count: 1
  },
  {
    catalog_product_id: "c21d336d-cae7-408e-a212-98438cf04c7e",
    provider: "completeful",
    provider_product_id: "c21d336d-cae7-408e-a212-98438cf04c7e",
    name: "12oz Kids Tumbler",
    product_type: "ETCHING",
    print_type: "ETCHING",
    material: "Stainless steel",
    sku: "KIDSMBLK",
    default_title: "Black",
    available: 1,
    pricing_currency: "USD",
    fulfillment_cost_free_cents: 1250,
    realistic_image_url: "https://jvkydnvdajcfnqysmuwt.supabase.co/storage/v1/object/public/product-images/mockups/c21d336d-cae7-408e-a212-98438cf04c7e/10417e91-c692-44db-a5f1-e88849dc6cad/background.png",
    variant_count: 7,
    print_location_count: 1,
    mockup_count: 12
  },
  {
    catalog_product_id: "88a4fd95-d42c-4f48-910a-dc5b606662e0",
    provider: "completeful",
    provider_product_id: "88a4fd95-d42c-4f48-910a-dc5b606662e0",
    name: "12oz Skinny Mini Tumbler",
    product_type: "ETCHING",
    print_type: "ETCHING",
    material: "Stainless steel",
    available: 1,
    pricing_currency: "USD",
    fulfillment_cost_free_cents: null,
    realistic_image_url: "https://jvkydnvdajcfnqysmuwt.supabase.co/storage/v1/object/public/product-images/mockups/88a4fd95-d42c-4f48-910a-dc5b606662e0/bccebc69-c3cb-4c3f-8f6a-bb0e355c11cc/background.png",
    variant_count: 1,
    print_location_count: 1,
    mockup_count: 1
  }
];
const find=(p)=>{
 if(p==='/themes/plain-jane/demo'||p.startsWith('/themes/plain-jane/demo/')){
   const relative=p.replace(/^\/themes\/plain-jane\/demo\/?/,'').replace(/\/$/,'');
   if(!relative||journalPaths.has(relative))return path.join(journalRoot,'index.html');
   if(!(/^(?:assets|images|icons)\/[a-z0-9._/-]+$/.test(relative)) && relative!=='journal-cms-manifest.json')return null;
   const target=path.resolve(journalRoot,relative);
   return target.startsWith(journalRoot+path.sep)?target:null;
 }

 if(p==='/themes/resolve/demo/portal'||p.startsWith('/themes/resolve/demo/portal/')){
   const relative=p.replace(/^\/themes\/resolve\/demo\/portal\/?/,'').replace(/\/$/,'');
   if(relative==='portal.js'||relative==='portal.css'||relative==='catalog.js'||relative==='preview-settings.js')return path.join(resolvePortalRoot,relative);
   if(!relative||portalTemplateForPath(relative))return path.join(resolvePortalRoot,'index.html');
   return null;
 }

 const themeRoute=p.match(/^\/themes\/(violet|resolve)\/demo(?:\/(.*))?$/);
 if(themeRoute){
   const themeRoot=themeRoots[themeRoute[1]];
   const target=path.resolve(themeRoot,themeRoute[2]||'index.html');
   return target===path.resolve(themeRoot,'index.html') || target.startsWith(themeRoot+path.sep) ? target : null;
 }
 if(p.startsWith('/assets/generated/')){
   const target=path.resolve(violetRoot,'assets/generated',p.slice('/assets/generated/'.length));
   return target.startsWith(violetRoot+path.sep) ? target : null;
 }
 if(p==='/themes/violet/demo'||p==='/themes/violet/demo/')return path.join(violetRoot,'index.html');
 if(p.startsWith('/themes/violet/demo/')){
   const relative=p.slice('/themes/violet/demo/'.length);
   const target=path.resolve(violetRoot,relative);
   return target.startsWith(violetRoot+path.sep) ? target : null;
 }
 if(p==='/')return path.join(staticRoot,'home.html');
 if(p==='/admin/registry-build-edit')return path.join(staticRoot,'registry-build-edit.html');
 if(p==='/admin/product-edit')return path.join(staticRoot,'product-edit.html');
 // Preserve the production Resend app route on this static local preview.
 if(p==='/admin/email')return path.join(staticRoot,'dashboard/email.html');
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
  const requestUrl=new URL(req.url,'http://localhost');
  const pathname=decodeURIComponent(requestUrl.pathname);
  // Localhost is the Resolve commerce design studio. A bare editor URL must
  // never fall into a disconnected Violet production mode and show a white iframe.
  if(pathname==='/admin/theme-editor' && !requestUrl.searchParams.has('showcase')){
    requestUrl.searchParams.set('showcase','resolve');
    if(!requestUrl.searchParams.has('slug'))requestUrl.searchParams.set('slug','home');
    res.writeHead(302,{Location:requestUrl.pathname+requestUrl.search});
    res.end();return;
  }
  if(pathname==='/api/admin/completeful/catalog' && req.method==='GET'){
   const url = new URL(req.url,'http://localhost');
   const search = (url.searchParams.get('search') || '').trim().toLowerCase();
   const category = (url.searchParams.get('category') || '').trim().toLowerCase();
   const limit = Math.max(1,Math.min(100,Number(url.searchParams.get('limit') || 24)));
   const offset = Math.max(0,Number(url.searchParams.get('offset') || 0));
   const filtered = previewCatalog.filter(item => {
    const text = [item.name,item.product_type,item.print_type,item.material,item.sku].filter(Boolean).join(' ').toLowerCase();
    if (search && !text.includes(search)) return false;
    if (category === 'apparel' && !/apparel|shirt|hood|hat|garment/.test(text)) return false;
    return true;
   });
   const items = filtered.slice(offset,offset+limit);
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
   res.end(JSON.stringify({items,pagination:{total:filtered.length,has_more:offset+limit<filtered.length},sample_source:'read-only supplier catalog preview'}));
   return;
  }
  if(pathname==='/api/admin/completeful/status' && req.method==='GET'){
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
   res.end(JSON.stringify({sync:{status:'complete',updated_at:'2026-10-22T00:00:00Z',completed_at:'2026-10-22T00:00:00Z',page_count:1,product_count:previewCatalog.length}}));
   return;
  }
  if(pathname==='/api/admin/completeful/catalog/sync' && req.method==='POST'){
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
   res.end(JSON.stringify({ok:true,status:'complete',has_more:false,counts:{catalog_products:previewCatalog.length}}));
   return;
  }
  const completefulDetail = pathname.match(/^\/api\/admin\/completeful\/catalog\/([^/]+)$/);
  if(completefulDetail && req.method==='GET'){
   const id=decodeURIComponent(completefulDetail[1]);
   const product=previewCatalog.find(item=>item.catalog_product_id===id || item.provider_product_id===id);
   if(!product){res.writeHead(404,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'not_found'}));return}
   const image=product.realistic_image_url;
   const variant={catalog_variant_id:'preview:'+id+':default',variant_title:product.default_title||'Default',name:product.default_title||'Default',title:product.default_title||'Default',sku:product.sku||undefined,is_primary:1,pricing_currency:product.pricing_currency,fulfillment_cost_free_cents:product.fulfillment_cost_free_cents,attributes:{Color:product.default_title||'Default'},variant_attributes:{Color:product.default_title||'Default'}};
   const printLocation={print_location_id:'preview:'+id+':front',name:'Front',enabled:1,x:0.32,y:0.22,width:0.36,height:0.56,artboard_width:1000,artboard_height:1000,file_width:13,file_height:13,dpi:300,unit:'in',shape_type:'rectangle',artboard_image_url:image};
   const detail={product,variants:[variant],print_locations:[printLocation],images:image?[{url:image,thumbnail_url:image,is_primary:1,variant_title:variant.variant_title}]:[],image_pagination:{limit:24,count:image?1:0,total:image?1:0,has_more:false},mockups:image?[{mockup_id:'preview:'+id+':mockup',name:'Product preview',preview_url:image,active:1,print_location_id:printLocation.print_location_id,variant_scope_json:null}]:[]};
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(detail));return;
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
  if(pathname==='/api/admin/cms/embed-catalog' && req.method==='GET'){
   const manifests=await Promise.all(storefrontManifestPaths.map(async file=>JSON.parse(await readFile(file,'utf8'))));
   const apps=manifests.flatMap(app=>(app.storefront_embeds||[]).map(embed=>({
     ...embed,provider:app.id,provider_name:app.provider||app.name,
     installed:app.id==='ecommerce-cms-agentsam',connection_status:'preview_only'
   })));
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
   res.end(JSON.stringify({ok:true,preview_only:true,apps}));return;
  }
  // Isolated CMS fixtures: no tenant D1, no writes, no Stripe.
  if(pathname==='/api/admin/theme-products/plain-jane/download' && req.method==='GET'){
    // Only serve the explicitly built local preview artifact. No install/payment.
    const zip=path.join(tmpdir(),'agentsam-template-releases','plain-jane-journal-0.1.0-preview.zip');
    try{
      const [data,checksumLine]=await Promise.all([readFile(zip),readFile(zip+'.sha256','utf8')]);
      const actual=createHash('sha256').update(data).digest('hex');
      if(checksumLine.split(/\s+/)[0]!==actual){
        res.writeHead(409,{'Content-Type':'application/json'});
        res.end(JSON.stringify({error:'artifact_checksum_mismatch'}));return;
      }
      res.writeHead(200,{'Content-Type':'application/zip','Cache-Control':'no-store',
        'X-Content-Type-Options':'nosniff',
        'Content-Length':String(data.length),
        'Content-Disposition':'attachment; filename="plain-jane-journal-0.1.0-preview.zip"'});
      res.end(data);
    }catch{
      res.writeHead(404,{'Content-Type':'application/json'});
      res.end(JSON.stringify({error:'preview_artifact_missing',message:'Generate the local preview ZIP before downloading.'}));
    }
    return;
  }
  if(pathname==='/api/admin/theme-products' && req.method==='GET'){
    const products=await listLocalThemeProducts();
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify({ok:true,preview_only:true,products}));return;
  }
  if(pathname==='/api/admin/cms/pages' && req.method==='GET'){
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
   res.end(JSON.stringify({pages:['home','shop','about'].map(slug=>({
     slug,title:getRegistryPage(slug).title,live_route:slug==='home'?'/':'/'+slug
   })).concat(journalPages).concat(RESOLVE_PORTAL_TEMPLATES.map(page=>({
     slug:page.slug,title:page.title,live_route:'/themes/resolve/demo/portal/'+page.path,
     status:'draft',template_key:page.template_key,preview_only:true
   })))}));return;
  }
  const journalSlug=pathname.match(/^\/api\/admin\/cms\/pages\/(journal-[a-z0-9-]+)$/);
  const journalPage=journalSlug && journalManifest.pages.find(page=>page.slug===journalSlug[1]);
  if(journalPage && req.method==='GET'){
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify({page:{
      ...journalPage,metadata_json:JSON.stringify({theme:'plain-jane',path:journalPage.path}),
      content_authority:'cms-draft'
    },seeded:false,preview_only:true}));return;
  }
  const portalSlug=pathname.match(/^\/api\/admin\/cms\/pages\/(resolve-[a-z0-9-]+)$/);
  const portalDef=portalSlug && portalTemplateForSlug(portalSlug[1]);
  if(portalDef && req.method==='GET'){
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify({page:portalCmsPage(portalDef),seeded:false,preview_only:true}));return;
  }
  if(pathname==='/api/admin/cms/resolve-portal/templates' && req.method==='GET'){
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify({templates:RESOLVE_PORTAL_TEMPLATES,preview_only:true}));return;
  }
  const previewPage=pathname.match(/^\/api\/admin\/cms\/pages\/(home|shop|about|site)$/);
  if(previewPage && req.method==='GET'){
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
   res.end(JSON.stringify({page:getRegistryPage(previewPage[1]),seeded:false}));return;
  }
  if(pathname==='/api/admin/cms/themes' && req.method==='GET'){
   res.writeHead(200,{'Content-Type':'application/json'});
   res.end(JSON.stringify({ok:true,active_theme:null,
     preview_theme:{slug:'resolve',name:'Resolve',state:'preview'},
     themes:[{slug:'resolve',name:'Resolve',state:'preview'},
             {slug:'violet',name:'Violet',state:'preview'}],content_version:1}));return;
  }
  if(pathname==='/api/admin/cms/registry' && req.method==='GET'){
   res.writeHead(200,{'Content-Type':'application/json'});
   res.end(JSON.stringify({registry:[],sections:[]}));return;
  }
  if(pathname==='/api/admin/collections'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({collections:[]}));return}
  if(pathname.startsWith('/api/')){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'preview_only',message:'This is an isolated UI preview. Backend APIs and tenant data are not connected.'}));return}
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return}
  let target=(pathname==='/admin/product-edit' && /^\d+$/.test(new URL(req.url,'http://localhost').searchParams.get('id')||''))?path.join(staticRoot,'product-edit.html'):find(pathname);
  if(!target){
    if(pathname.startsWith('/themes/resolve/demo/portal/')){
      res.writeHead(404,{'Content-Type':'text/plain','Cache-Control':'no-store'});
      res.end('Resolve portal route not found');return;
    }
    res.writeHead(302,{Location:'/admin/home'});res.end();return;
  }
  target=path.resolve(target);
  if(![staticRoot,distRoot,path.join(root,'frontend'),resolvePortalRoot,journalRoot,...Object.values(themeRoots)].some(x=>target.startsWith(path.resolve(x)+path.sep))){res.writeHead(403);res.end();return}
  let data=await readFile(target);
  const ext=path.extname(target);
  if(ext==='.html'){
   let html=data.toString();
   if(target===path.join(resolvePortalRoot,'index.html')){
     html=html.replaceAll('__RESOLVE_PORTAL_BASE__','/themes/resolve/demo/portal/');
     if(requestUrl.searchParams.has('studio_preview')){
       // The same manifest-driven embed bridge runs on native Resolve AND portal pages.
       html=html.replace('</body>','<script src="/themes/resolve/demo/portal/preview-settings.js"></script><script src="/admin/js/resolve-preview-bridge.js"></script></body>');
     }
   }
   if(pathname==='/themes/resolve/demo/' && new URL(req.url,'http://localhost').searchParams.has('studio_preview')){
     html=html.replace('</body>','<script src="/themes/resolve/demo/portal/preview-settings.js"></script><script src="/admin/js/resolve-preview-bridge.js"></script></body>');
   }
   html=html.replaceAll('Fuel & Free Time Admin','AgentSam SDK Commerce · Local Preview').replaceAll('Fuel & Free Time','AgentSam SDK');
   data=Buffer.from(html);
  }
  res.writeHead(200,{'Content-Type':mime[ext]||'application/octet-stream','Cache-Control':'no-store'});if(req.method==='HEAD')res.end();else res.end(data);
 }catch(e){res.writeHead(e.code==='ENOENT'?404:500,{'Content-Type':'text/plain'});res.end(String(e.message||e))}
});
server.listen(port,'127.0.0.1',()=>console.log('AgentSam SDK preview on http://127.0.0.1:'+port+'/admin/home'));
