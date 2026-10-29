/**
 * Theme drafts use the existing hosted cms_themes table.
 * This is a private, account-scoped selection/config draft; the CMS renderer
 * must be connected and verified separately before publishing.
 */
import { listThemeProjects } from '../../../ecommerce-cms-agentsam/backend/cms/theme-project-store.mjs';
const answer=(payload,status=200)=>Response.json(payload,{status,headers:{'cache-control':'private, no-store'}});
const allowed=/^(resolve|violet|plain-jane)$/;
async function slugFor(accountId,sourceSlug) {
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(accountId));
 const owner=Array.from(new Uint8Array(digest)).slice(0,10).map(x=>x.toString(16).padStart(2,'0')).join('');
 return 'draft-'+owner+'-'+sourceSlug;
}
async function catalog(env,request){
 const url=new URL(request.url);
 url.pathname='/ecommerce-cms-agentsam/admin/data/theme-products.json';url.search='';
 const res=await env.ASSETS.fetch(new Request(url,{method:'GET'}));
 if(!res.ok)throw new Error('catalog_not_staged');
 const list=await res.json();
 return Array.isArray(list.products)?list.products:[];
}
function draft(row) {
 let config={};try{config=JSON.parse(row.config||'{}')}catch{}
 return {
  id:row.id,slug:config.source_slug||null,
  name:row.name,theme_slug:row.slug,
  package:config.package||null,version:config.version||null,
  status:'draft',created_at:row.created_at,installed:false,
  site_linked:false,meta:config.package||'Packaged theme',preview_url:config.preview_url||null,
  // Editing is enabled ONLY after a site / CMS installation transaction.
  edit_href:null
 };
}
export async function listStudioThemeDrafts(env,userId) {
 // The canonical CMS v2 project is the real installed, editable draft.
 // cms_themes is retained read-only for historical unlinked selections.
 let installed=[];
 try {
  const response=await listThemeProjects(env,userId);
  if(response.ok)installed=response.projects.filter(project=>allowed.test(project.sourceThemeId||''))
    .map(project=>({
      id:project.id,slug:project.sourceThemeId,name:project.name,
      theme_slug:project.sourceThemeId,package:project.packageName,
      version:project.sourcePackageVersion,status:'draft',
      created_at:project.createdAt,installed:true,site_linked:false,
      meta:project.packageName,preview_url:project.sourcePreviewUrl,
      edit_href:'/admin/theme-project-editor?project='+encodeURIComponent(project.id)
    }));
 }catch{/* A missing v2 table does not erase historical selections. */}
 const rows=await env.DB.prepare(
  "SELECT id,name,slug,config,created_at FROM cms_themes WHERE workspace_id=? AND status='draft' AND slug LIKE 'draft-%' ORDER BY created_at DESC LIMIT 60"
 ).bind(userId).all();
 const installedSlugs=new Set(installed.map(row=>row.slug));
 return [...installed,...(rows.results||[]).map(draft)
   .filter(row=>allowed.test(row.slug||'')&&!installedSlugs.has(row.slug))];
}
export async function handleStudioThemeDrafts(request,env,userId) {
 if(!userId)return answer({ok:false,error:'unauthorized'},401);
 if(!env.DB)return answer({ok:false,error:'database_unavailable'},503);
 const url=new URL(request.url);
 if(request.method==='GET'){
  try{
   return answer({ok:true,drafts:await listStudioThemeDrafts(env,userId)});
  }catch{return answer({ok:false,error:'theme_drafts_unavailable'},503)}
 }
 if(request.method!=='POST')return answer({ok:false,error:'method_not_allowed'},405);
 if(request.headers.get('origin')!==url.origin)return answer({ok:false,error:'origin_not_allowed'},403);
 if(!request.headers.get('content-type')?.startsWith('application/json'))return answer({ok:false,error:'json_content_type_required'},415);
 const body=await request.json().catch(()=>null);
 if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(k=>k!=='slug') || !allowed.test(body.slug||''))
  return answer({ok:false,error:'template_not_supported'},400);
 let product;
 try{ product=(await catalog(env,request)).find(p=>p.slug===body.slug && p.preview_ready); }
 catch{return answer({ok:false,error:'catalog_unavailable'},503)}
 if(!product)return answer({ok:false,error:'template_not_available'},404);
 const slug=await slugFor(userId,body.slug);
 const id='thmd_'+crypto.randomUUID().replaceAll('-','');
 const config=JSON.stringify({source_slug:body.slug,package:product.package,version:product.version,
  template_sku:product.sku,source:'source_backed_template_catalog',
  preview_url:product.preview_url,installation_state:'draft_unlinked'});
 try{
  await env.DB.prepare(
   "INSERT INTO cms_themes (id,name,slug,config,workspace_id,status,visibility,theme_family) VALUES (?,?,?,?,?,'draft','private',?) ON CONFLICT(slug) DO NOTHING"
  ).bind(id,product.name+' Draft',slug,config,userId,product.category||'custom').run();
  const row=await env.DB.prepare(
    "SELECT id,name,slug,config,created_at FROM cms_themes WHERE workspace_id=? AND slug=? AND status='draft'"
  ).bind(userId,slug).first();
  if(!row)return answer({ok:false,error:'theme_draft_write_unverified'},409);
  return answer({ok:true,draft:draft(row),message:'Theme added to private drafts. No site was modified or published.'},201);
 }catch{return answer({ok:false,error:'theme_draft_storage_unavailable'},503)}
}
