/**
 * Authoritative website-theme installation transaction.
 *
 * The Theme Store owns released packages. This Worker verifies its published
 * checksum against an immutable source-rendered project owned by the Theme Store,
 * installs into an explicitly selected owned site, or automatically creates
 * an isolated draft cms_sites + cms_site_themes pair for site-free Try.
 */
import { installThemeDraft } from '../../../ecommerce-cms-agentsam/backend/cms/theme-project-store.mjs';
import { DRAFT_SITE_KIND, installThemeDraftSite, discardThemeDraftSite } from '../../../ecommerce-cms-agentsam/backend/cms/theme-draft-sites.mjs';
import { withLocalStudioCmsContext } from '../../../ecommerce-cms-agentsam/backend/lib/account-context.js';
import { requireCmsSiteAccess, createAuthorizedCmsSite, configuredCmsWorkers } from './cms-authority.js';

const STORE = 'https://themes.inneranimalmedia.com';
const SAFE_SLUG = /^[a-z][a-z0-9-]{0,63}$/;
const SAFE_ID = /^[a-zA-Z0-9_-]{1,160}$/;
const HASH = /^[0-9a-f]{64}$/;
const dash = value => String(value || '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
async function uniqueDraftSiteSlug(db, accountId, base) {
  const root = base.slice(0, 70);
  for (let n = 1; n <= 200; n += 1) {
    const candidate = n === 1 ? root : `${root}-${n}`;
    const hit = await db.prepare('SELECT 1 AS x FROM cms_sites WHERE account_id=? AND slug=? LIMIT 1')
      .bind(accountId, candidate).first();
    if (!hit) return candidate;
  }
  return `${root}-${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`;
}
const json = (body, status=200) => Response.json(body, {
  status, headers: { 'cache-control':'private, no-store', 'x-content-type-options':'nosniff' },
});
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
export async function getWebsiteThemeInstallIndex(_request, _env) {
  // The Theme Store is the SOLE release/package authority. SDK Workers must
  // never fall back to copied stock-theme JSON in their own static assets.
  // A release may be installed only after the signed ZIP and checksum-addressed
  // editor project have both been verified and indexed by Theme Store R2.
  const data=await remoteInstallIndex();
  return data.packages.filter(p=>
    SAFE_SLUG.test(p.slug||'') && /^\d+\.\d+\.\d+$/.test(p.version||'') &&
    HASH.test(p.sha256||'') &&
    Number.isInteger(p.page_count) && p.page_count>=1 && p.page_count<=80 &&
    HASH.test(p.project_sha256||'') &&
    p.project_key==='install-projects/'+p.slug+'/'+p.version+'/'+p.project_sha256+'.json' &&
    p.project_url==='/api/themes/'+p.slug+'/'+p.version+'/project'
  );
}
async function getVerifiedInstallProject(_request,_env,release) {
  if(!HASH.test(release.project_sha256||''))throw Error('theme_verified_project_required');
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
    // The Theme Store, not SDK deployment config, owns each product's public
    // preview alias. Validate its authoritative catalog URL before importing.
    // The signed editor project records the immutable package preview. The Theme
    // Store may publish a separate site-facing preview alias for the same release.
    // Verify BOTH URLs against the same trusted Theme Store origin and slug/version
    // instead of rejecting a genuine package because its public alias differs.
    const base = String(listing.previewUrl || '');
    const isVerifiedPreview = (candidate) => {
      if(typeof candidate!=='string' || !candidate) return false;
      let preview;
      try { preview = new URL(candidate, STORE); } catch { return false; }
      return preview.origin === STORE && !preview.username && !preview.password &&
        !preview.search && !preview.hash &&
        (preview.pathname.startsWith('/theme-packages/'+slug+'/'+body.version+'/preview/') ||
         preview.pathname.startsWith('/themes/'+slug+'/presets/'+slug+'/demo/') ||
         (typeof listing.previewAlias === 'string' &&
          /^[a-z][a-z0-9-]{1,63}$/.test(listing.previewAlias) &&
          !['admin','api','auth','media','themes','apps','settings'].includes(listing.previewAlias) &&
          preview.pathname === '/' + listing.previewAlias + '/'));
    };
    if (!isVerifiedPreview(base) || !isVerifiedPreview(project?.sourcePreviewUrl))
      return json({ok:false,error:'theme_preview_url_not_verified'},409);
    if(project?.schema!=='agentsam.theme-project.v1' ||
      project.id!=='theme_'+slug || project.sourceThemeId!==slug ||
      project.sourcePackage!=='@inneranimalmedia/theme-'+slug ||
      project.sourcePackageVersion!==body.version ||
      project.sourceReleaseSha256!==ready.sha256 ||
      !Array.isArray(project.pages) || project.pages.length!==ready.page_count ||
      project.pages.length<1) {
      return json({ok:false,error:'theme_installer_artifact_invalid'},503);
    }

    const installPayload={
      project,
      package_name:project.sourcePackage,
      package_version:body.version,
      preview_url:base,
    };
    let site = null;
    let result;
    if (body.site_id) {
      const access = await requireCmsSiteAccess(env.DB, accountId, body.site_id, 'write', {
        remoteWorkerNames: configuredCmsWorkers(env),
      });
      if (!access.ok) return json({ ok: false, error: access.error }, access.status);
      site = access.site;
      if (site.source !== 'shared-d1') return json({ ok: false, error: 'site_requires_remote_cms_adapter' }, 409);
      result = await withLocalStudioCmsContext(site.account_id, site,
        () => installThemeDraft(env, site.account_id, slug, installPayload, site.id), accountId);
    } else {
      // Local Studio explicitly creates the isolated draft site. The CMS helper
      // receives that verified site and only performs the theme data operation.
      const display = String(project?.name || slug).trim() || slug;
      const siteSlug = await uniqueDraftSiteSlug(env.DB, accountId,
        `theme-draft-${dash(slug)}-${dash(body.version)}`);
      const created = await createAuthorizedCmsSite(env.DB, accountId, {
        name: `${display} — Draft`, slug: siteSlug, status: 'draft', is_default: false,
        settings: { kind: DRAFT_SITE_KIND, source_theme_slug: slug, source_release_version: body.version },
      });
      site = { ...created, source: 'shared-d1', role: 'owner', can_edit: true, can_publish: true };
      try {
        result = await withLocalStudioCmsContext(site.account_id, site,
          () => installThemeDraftSite(env, site.account_id, slug, installPayload, { site }), accountId);
      } catch (error) {
        await discardThemeDraftSite(env.DB, site.account_id, site.id);
        throw error;
      }
      if (!result.ok) {
        await discardThemeDraftSite(env.DB, site.account_id, site.id);
        return json(result, result.status || 503);
      }
    }
    if(!result.ok)return json(result,result.status||503);
    const projectId=result.project.id;
    const siteId=site.id;
    const editor='/admin/theme-project-editor?project='+encodeURIComponent(projectId)+
      '&site_id='+encodeURIComponent(siteId);
    return json({
      ok:true,installed:true,unchanged:result.unchanged===true,
      scope:'site',
      site_id:siteId,site_name:site.name,site_status:site.status,
      ...(result.theme_id ? {theme_id:result.theme_id} : {}),
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
    const reason=/^[a-z][a-z0-9_]{2,80}$/.test(message)?message:undefined;
    return json({ok:false,error:'theme_install_failed',...(reason?{reason}:{})},503);
  }
}
