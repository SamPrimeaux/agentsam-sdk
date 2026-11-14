/**
 * Authoritative website-theme installation transaction.
 *
 * The Theme Store owns released packages. This Worker verifies its published
 * checksum against an immutable source-rendered project bundled with the SDK,
 * resolves an optional explicit site, then delegates persistence to either
 * the account-scoped Theme Studio store or the canonical site CMS store.
 * Site-free authoring never creates cms_sites or uses cms_globals as a proxy.
 */
import { resolveCmsSite } from '../../../ecommerce-cms-agentsam/backend/cms/site-context.mjs';
import { installThemeDraft } from '../../../ecommerce-cms-agentsam/backend/cms/theme-project-store.mjs';
import { installThemeStudioDraft } from '../../../ecommerce-cms-agentsam/backend/cms/theme-studio-store.mjs';

const STORE = 'https://themes.inneranimalmedia.com';
const INDEX = '/ecommerce-cms-agentsam/admin/data/site-theme-projects/index.json';
const SAFE_SLUG = /^[a-z][a-z0-9-]{0,63}$/;
const SAFE_ID = /^[a-zA-Z0-9_-]{1,160}$/;
const HASH = /^[0-9a-f]{64}$/;
const json = (body, status=200) => Response.json(body, {
  status, headers: { 'cache-control':'private, no-store', 'x-content-type-options':'nosniff' },
});
const getAsset = async (request, env, path) => {
  if (!env.ASSETS) throw Error('theme_release_assets_unavailable');
  const url = new URL(request.url);
  url.pathname = path;
  url.search = '';
  const response = await env.ASSETS.fetch(new Request(url,{ method:'GET' }));
  if (!response.ok) throw Error('theme_release_assets_unavailable');
  return response.json();
};
async function remoteInstallIndex() {
  const reply = await fetch(STORE+'/api/install-index',{
    headers:{accept:'application/json'}, signal:AbortSignal.timeout(7000),
  });
  if(!reply.ok) throw Error('theme_install_index_unavailable');
  const data=await reply.json();
  if(data?.ok!==true || data.schema!=='agentsam.website-theme-install-index.v1' ||
     !Array.isArray(data.packages))throw Error('theme_install_index_invalid');
  return data;
}
export async function getWebsiteThemeInstallIndex(request, env) {
  // The immutable theme release owns its project/index. SDK deployment must
  // never be required every time someone publishes a new website starter.
  // Bundled index is retained only for backwards-compatible rollouts.
  let data;
  try {data=await remoteInstallIndex();}
  catch {data=await getAsset(request,env,INDEX);}
  if(data?.schema!=='agentsam.website-theme-install-index.v1' || !Array.isArray(data.packages))
    throw Error('theme_install_index_invalid');
  return data.packages.filter(p=>{
    if(!SAFE_SLUG.test(p.slug||'')||!/^\d+\.\d+\.\d+$/.test(p.version||'')||
      !HASH.test(p.sha256||'')||!Number.isInteger(p.page_count)||p.page_count<1||p.page_count>80)
      return false;
    if (p.project_sha256) return HASH.test(p.project_sha256) &&
      p.project_key === 'install-projects/'+p.slug+'/'+p.version+'/'+p.project_sha256+'.json' &&
      p.project_url === '/api/themes/'+p.slug+'/'+p.version+'/project';
    return p.project_asset === '/ecommerce-cms-agentsam/admin/data/site-theme-projects/'+p.slug+'-'+p.version+'.json';
  });
}
async function getVerifiedInstallProject(request,env,release) {
  if(!release.project_sha256) return getAsset(request,env,release.project_asset);
  const path=STORE+'/api/themes/'+release.slug+'/'+release.version+'/project';
  const reply=await fetch(path,{headers:{accept:'application/json'},signal:AbortSignal.timeout(9000)});
  if(!reply.ok)throw Error('installer_project_unavailable');
  const length=Number(reply.headers.get('content-length')||0);
  if(length>8*1024*1024)throw Error('installer_project_oversized');
  const bytes=new Uint8Array(await reply.arrayBuffer());
  if(bytes.length>8*1024*1024)throw Error('installer_project_oversized');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
  if(digest!==release.project_sha256)throw Error('installer_project_digest_mismatch');
  return JSON.parse(new TextDecoder().decode(bytes));
}
async function publishedListing(slug,version) {
  const response = await fetch(STORE+'/api/catalog',{
    headers:{accept:'application/json'},
    signal:AbortSignal.timeout(7000),
  });
  if(!response.ok)throw Error('website_theme_store_unavailable');
  const data = await response.json();
  if(data?.ok!==true||!Array.isArray(data.products))throw Error('website_theme_catalog_invalid');
  return data.products.find(p=>p.slug===slug&&p.version===version);
}
export async function handleStudioWebsiteThemeInstall(request,env,accountId,slug) {
  if(!accountId)return json({ok:false,error:'unauthorized'},401);
  if(request.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
  const reqUrl=new URL(request.url);
  if(request.headers.get('origin')!==reqUrl.origin)return json({ok:false,error:'origin_not_allowed'},403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))
    return json({ok:false,error:'json_content_type_required'},415);
  if(!SAFE_SLUG.test(slug||''))return json({ok:false,error:'theme_slug_invalid'},400);
  let body;
  try { body=await request.json(); } catch { return json({ok:false,error:'invalid_json'},400); }
  if(!body||typeof body!=='object'||Array.isArray(body) ||
    Object.keys(body).some(key=>!['site_id','version'].includes(key)) ||
    (body.site_id != null && !SAFE_ID.test(body.site_id)) || !/^\d+\.\d+\.\d+$/.test(body.version||'')) {
    return json({ok:false,error:'package_version_or_site_id_invalid'},400);
  }

  try {
    if(!env.DB||!env.WEBSITE_ASSETS)return json({ok:false,error:'cms_storage_unavailable'},503);
    // Validate the released artifact before persisting any customer data.
    // Without an explicit site_id, Try creates an account-owned Theme Studio
    // workspace only. It does not create or select a CMS site.
    const packages=await getWebsiteThemeInstallIndex(request,env);
    const ready=packages.find(p=>p.slug===slug && p.version===body.version);
    if(!ready)return json({ok:false,error:'theme_release_not_installer_ready'},409);
    // Fail closed when the Theme Store has published a new hash for the same
    // version, when approval is withdrawn, or if the bundle is stale.
    const listing=await publishedListing(slug,body.version);
    if(listing?.release?.status!=='published' ||
      listing.release.sha256!==ready.sha256 ||
      listing.release.storageKey!=='releases/'+slug+'/'+body.version+'/'+ready.sha256+'.zip')
      return json({ok:false,error:'theme_release_does_not_match_verified_package'},409);
    const project=await getVerifiedInstallProject(request,env,ready);
    const base=STORE+'/theme-packages/'+slug+'/'+body.version+'/preview/';
    if(project?.schema!=='agentsam.theme-project.v1' ||
      project.id!=='theme_'+slug || project.sourceThemeId!==slug ||
      project.sourcePackage!=='@inneranimalmedia/theme-'+slug ||
      project.sourcePackageVersion!==body.version ||
      project.sourcePreviewUrl!==base || project.sourceReleaseSha256!==ready.sha256 ||
      !Array.isArray(project.pages) || project.pages.length!==ready.page_count ||
      project.pages.length<1) {
      return json({ok:false,error:'theme_installer_artifact_invalid'},503);
    }

    const site=body.site_id
      ? await resolveCmsSite(env.DB,{accountId,siteId:body.site_id})
      : null;
    const installPayload={
      project,
      package_name:project.sourcePackage,
      package_version:body.version,
      preview_url:base,
    };
    const result=site
      ? await installThemeDraft(env,accountId,slug,installPayload,site.id)
      : await installThemeStudioDraft(env,accountId,slug,installPayload);
    if(!result.ok)return json(result,result.status||503);
    const projectId=result.project.id;
    const editor='/admin/theme-project-editor?project='+encodeURIComponent(projectId)+
      (site ? '&site_id='+encodeURIComponent(site.id) : '&scope=studio');
    return json({
      ok:true,installed:true,unchanged:result.unchanged===true,
      scope:site?'site':'studio',
      ...(site ? {site_id:site.id,site_name:site.name,site_status:site.status} : {}),
      project_id:projectId,
      page_count:result.project.pages.length,
      source_release_sha256:ready.sha256,
      revision:result.project.revision,
      editor_url:editor,
    },result.unchanged?200:201);
  }catch(error){
    const message=String(error?.message||error);
    if(message.includes('cms_theme_draft_site_conflict')) return json({ok:false,error:'theme_draft_site_conflict'},409);
    if(/site_not_found|cms_site_not_found|site_access_denied|account_required/.test(message))
      return json({ok:false,error:'site_not_found_or_unauthorized'},404);
    console.error('website_theme_install_failed',slug,message);
    return json({ok:false,error:'theme_install_failed'},503);
  }
}
