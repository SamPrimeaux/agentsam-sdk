/**
 * Authoritative website-theme installation transaction.
 *
 * The Theme Store owns released packages. This Worker verifies its published
 * checksum against an immutable source-rendered project bundled with the SDK,
 * resolves the authenticated owner's site, then delegates persistence to
 * canonical CMS cms_globals + cms_revisions + R2 theme-projects.
 * No cms_themes appearance presets and no parallel install table.
 */
import { resolveCmsSite } from '../../../ecommerce-cms-agentsam/backend/cms/site-context.mjs';
import { installThemeDraft } from '../../../ecommerce-cms-agentsam/backend/cms/theme-project-store.mjs';

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
export async function getWebsiteThemeInstallIndex(request, env) {
  const data = await getAsset(request,env,INDEX);
  if (data?.schema !== 'agentsam.website-theme-install-index.v1' || !Array.isArray(data.packages))
    throw Error('theme_install_index_invalid');
  return data.packages.filter(p=>SAFE_SLUG.test(p.slug||'') &&
    /^\d+\.\d+\.\d+$/.test(p.version||'') &&
    HASH.test(p.sha256||'') &&
    p.project_asset === '/ecommerce-cms-agentsam/admin/data/site-theme-projects/'+p.slug+'-'+p.version+'.json');
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
    !SAFE_ID.test(body.site_id||'') || !/^\d+\.\d+\.\d+$/.test(body.version||'')) {
    return json({ok:false,error:'site_id_and_package_version_required'},400);
  }

  try {
    if(!env.DB||!env.WEBSITE_ASSETS)return json({ok:false,error:'cms_storage_unavailable'},503);
    // Required ownership check, never infer from account default or client name.
    const site=await resolveCmsSite(env.DB,{accountId,siteId:body.site_id});
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
    const project=await getAsset(request,env,ready.project_asset);
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

    const result=await installThemeDraft(env,accountId,slug,{
      project,
      package_name:project.sourcePackage,
      package_version:body.version,
      preview_url:base,
    },site.id);
    if(!result.ok)return json(result,result.status||503);
    const projectId=result.project.id;
    const editor='/admin/theme-project-editor?project='+encodeURIComponent(projectId)+
      '&site_id='+encodeURIComponent(site.id);
    return json({
      ok:true,installed:true,unchanged:result.unchanged===true,
      site_id:site.id, site_name:site.name, project_id:projectId,
      page_count:result.project.pages.length,
      source_release_sha256:ready.sha256,
      revision:result.project.revision,
      editor_url:editor,
    },result.unchanged?200:201);
  }catch(error){
    const message=String(error?.message||error);
    if(/site_not_found|cms_site_not_found|site_access_denied|account_required/.test(message))
      return json({ok:false,error:'site_not_found_or_unauthorized'},404);
    console.error('website_theme_install_failed',slug,message);
    return json({ok:false,error:'theme_install_failed'},503);
  }
}
