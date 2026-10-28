function jsonResponse(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store'}})}

export const LIBRARY_CONTRACT='agentsam.openscad-library.v2';
const SLUG=/^[a-z][a-z0-9_-]{0,79}$/;
const IMPORT=/^(include|use) <([A-Za-z0-9_./-]+\.scad)>$/;
const FIELDS=['display_name','import_line','capability_tags','license','commercial_safe','priority','repo_url','notes','active'];
const ok=(body,status=200)=>jsonResponse({ok:true,contract:LIBRARY_CONTRACT,...body},status);
const fail=(error,status=400)=>jsonResponse({ok:false,contract:LIBRARY_CONTRACT,error},status);
export function normalizeLibrary(input,previous={}){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('body_object_required');
  const extra=Object.keys(input).filter(k=>!FIELDS.includes(k)&&!['slug','expected_updated_at'].includes(k));
  if(extra.length)throw Error('unknown_fields');
  const v={...previous,...input};
  if(typeof v.display_name!=='string'||!v.display_name.trim()||v.display_name.length>160)throw Error('display_name_invalid');
  if(typeof v.import_line!=='string'||!IMPORT.test(v.import_line)||v.import_line.includes('..'))throw Error('import_line_invalid');
  if(typeof v.license!=='string'||!v.license.trim()||v.license.length>80)throw Error('license_invalid');
  let tags=v.capability_tags??[];
  if(typeof tags==='string'){try{tags=JSON.parse(tags)}catch{throw Error('capability_tags_invalid')}}
  if(!Array.isArray(tags)||tags.length>64||tags.some(t=>typeof t!=='string'||!/^[-_a-zA-Z0-9]{1,60}$/.test(t)))throw Error('capability_tags_invalid');
  const num=(raw,name,min,max)=>{
    if(raw===null||raw===undefined||typeof raw==='boolean'||!Number.isInteger(Number(raw))||Number(raw)<min||Number(raw)>max)throw Error(name+'_invalid');
    return Number(raw);
  };
  const repo=v.repo_url==null?'':String(v.repo_url);
  if(repo && (!/^https:\/\/[a-z0-9.-]+(?:[/?#][^\s]*)?$/i.test(repo)||repo.length>500))throw Error('repo_url_invalid');
  const notes=v.notes==null?'':String(v.notes);
  if(notes.length>1500)throw Error('notes_invalid');
  return {display_name:v.display_name.trim(),import_line:v.import_line,
    capability_tags:JSON.stringify(tags),license:v.license.trim(),
    commercial_safe:num(v.commercial_safe??1,'commercial_safe',0,1),
    priority:num(v.priority??5,'priority',1,99),repo_url:repo||null,notes:notes||null,
    active:num(v.active??1,'active',0,1)};
}
function toClient(row){
  let tags=[];try{const value=JSON.parse(row.capability_tags||'[]');if(Array.isArray(value))tags=value}catch{}
  return {...row,capability_tags:tags,commercial_safe:Number(row.commercial_safe)===1,active:Number(row.active)===1,availability:'registered-only'};
}
async function superadmin(env,id){
  if(!id)return false;
  const row=await env.DB.prepare('SELECT is_superadmin FROM auth_users WHERE id=? LIMIT 1').bind(id).first();
  return Number(row?.is_superadmin)===1;
}
export async function handleOpenScadLibraries(request,env,authUser){
  if(!env?.DB)return fail('db_unavailable',503);
  const url=new URL(request.url),method=request.method.toUpperCase();
  if(method==='GET'){
    try{
      const data=await env.DB.prepare('SELECT slug,display_name,import_line,capability_tags,license,commercial_safe,priority,repo_url,notes,active,created_at,updated_at FROM agentsam_openscad_libraries ORDER BY active DESC,priority,display_name LIMIT 200').all();
      const q=(url.searchParams.get('q')||'').trim().toLowerCase().slice(0,100),activeOnly=url.searchParams.get('active')==='1';
      const libraries=(data.results||[]).map(toClient).filter(x=>(!activeOnly||x.active)&&(!q||[x.slug,x.display_name,x.notes||'',...x.capability_tags].some(t=>String(t).toLowerCase().includes(q))));
      return ok({source:'cloudflare-d1',libraries,count:libraries.length,canManage:await superadmin(env,authUser?.id)});
    }catch{return fail('catalog_unavailable',503)}
  }
  if(!['POST','PATCH','DELETE'].includes(method))return fail('method_not_allowed',405);
  const origin=request.headers.get('Origin');
  if(origin&&origin!==url.origin)return fail('origin_mismatch',403);
  if(!await superadmin(env,authUser?.id))return fail('catalog_write_forbidden',403);
  const body=await request.json().catch(()=>null);
  if(method==='POST'){
    const slug=body?.slug;
    if(typeof slug!=='string'||!SLUG.test(slug))return fail('slug_invalid');
    let v;try{v=normalizeLibrary(body)}catch(e){return fail(e.message)}
    try{
      await env.DB.prepare('INSERT INTO agentsam_openscad_libraries (slug,display_name,import_line,capability_tags,license,commercial_safe,priority,repo_url,notes,active) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .bind(slug,v.display_name,v.import_line,v.capability_tags,v.license,v.commercial_safe,v.priority,v.repo_url,v.notes,v.active).run();
      const row=await env.DB.prepare('SELECT * FROM agentsam_openscad_libraries WHERE slug=?').bind(slug).first();
      return ok({library:toClient(row)},201);
    }catch(e){return fail(String(e).includes('UNIQUE')?'library_exists':'catalog_write_failed',String(e).includes('UNIQUE')?409:503)}
  }
  const slug=url.pathname.match(/\/api\/agentsam\/openscad-libraries\/([^/]+)$/)?.[1];
  if(!slug||!SLUG.test(slug))return fail('slug_invalid');
  if(!Number.isSafeInteger(body?.expected_updated_at)||body.expected_updated_at<1)return fail('expected_updated_at_required');
  const previous=await env.DB.prepare('SELECT * FROM agentsam_openscad_libraries WHERE slug=?').bind(slug).first();
  if(!previous)return fail('library_not_found',404);
  if(Number(previous.updated_at)!==body.expected_updated_at)return fail('revision_conflict',409);
  let v;try{v=normalizeLibrary(method==='DELETE'?{active:0}:body,previous)}catch(e){return fail(e.message)}
  const result=await env.DB.prepare('UPDATE agentsam_openscad_libraries SET display_name=?,import_line=?,capability_tags=?,license=?,commercial_safe=?,priority=?,repo_url=?,notes=?,active=?,updated_at=CASE WHEN updated_at>=unixepoch() THEN updated_at+1 ELSE unixepoch() END WHERE slug=? AND updated_at=?')
    .bind(v.display_name,v.import_line,v.capability_tags,v.license,v.commercial_safe,v.priority,v.repo_url,v.notes,v.active,slug,body.expected_updated_at).run().catch(()=>null);
  if(!result?.meta?.changes)return fail('revision_conflict',409);
  const row=await env.DB.prepare('SELECT * FROM agentsam_openscad_libraries WHERE slug=?').bind(slug).first();
  return ok({library:toClient(row)});
}
