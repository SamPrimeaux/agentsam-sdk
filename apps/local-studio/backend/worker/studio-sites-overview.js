import { listStudioThemeDrafts } from './studio-theme-drafts.js';
import { ensureDefaultCmsSite, resolveCmsSite } from '../../../ecommerce-cms-agentsam/backend/cms/site-context.mjs';
import { listThemeProjects } from '../../../ecommerce-cms-agentsam/backend/cms/theme-project-store.mjs';
/**
 * Studio Sites read-model. Hosted Studio D1 is not the legacy Ecommerce
 * customer pages/page_sections schema. Use account-scoped CMS tables.
 */
const response = data => Response.json(data,{headers:{'cache-control':'private, no-store'}});
const emptyPerformance = {period_days:30,lcp_ms:null,inp_ms:null,cls:null,sessions_desktop:null,sessions_mobile:null};
export async function handleStudioSitesOverview(request, env, accountId) {
  if (!accountId) return Response.json({ok:false,error:'unauthorized'},{status:401});
  if (!env.DB) return Response.json({ok:false,error:'cms_database_unavailable'},{status:503});
  let cmsConnected = false;
  try {
    // Verifies schema only; owner/site resolution happens during the
    // explicit site-link workflow. Never list other tenants' sites.
    await env.DB.prepare("SELECT id FROM cms_sites LIMIT 1").first();
    cmsConnected = true;
  } catch {}
  const requestUrl=new URL(request.url);
  const siteId=requestUrl.searchParams.get('site_id');
  const hostname=requestUrl.hostname.toLowerCase();
  // A storefront always opens with a real, account-owned site. Explicit
  // selection wins, then this origin's owned domain, then account default,
  // then an established site with actual authored pages. The switcher
  // changes context; it is never a prerequisite for seeing an editor.
  let sites=[];
  try {
    const rows=await env.DB.prepare(`
      SELECT s.id,s.name,s.slug,s.primary_domain,s.domain_aliases_json,
        s.is_default,s.status,s.updated_at,
        (SELECT COUNT(*) FROM cms_pages p WHERE p.site_id=s.id) AS page_count
      FROM cms_sites s
      WHERE s.account_id=? AND s.status!='archived'
      ORDER BY s.is_default DESC,s.updated_at DESC,s.name ASC
    `).bind(accountId).all();
    sites=rows.results||[];
  } catch { /* Site directory stays unavailable until the CMS schema exists. */ }
  if(cmsConnected && !sites.length) {
    try { sites=[await ensureDefaultCmsSite(env.DB,accountId)]; }
    catch {return Response.json({ok:false,error:'cms_default_site_unavailable'},{status:503});}
  }
  let selectedSite=null;
  if(siteId) {
    try {selectedSite=await resolveCmsSite(env.DB,{accountId,siteId});}
    catch {return Response.json({ok:false,error:'site_not_found_or_unauthorized'},{status:404});}
  } else if(sites.length) {
    // The account's designated primary website wins inside Local Studio.
    // Hostnames are useful only if the account has no selected default.
    const hostnameMatch=site=>String(site.primary_domain||'').toLowerCase()===hostname ||
      (()=>{try{return JSON.parse(site.domain_aliases_json||'[]').some(
        domain=>String(domain).toLowerCase()===hostname);}
      catch{return false;}})();
    const atOrigin=sites.find(hostnameMatch);
    const designated=sites.find(site=>Number(site.is_default)===1);
    const established=[...sites].sort((a,b)=>
      Number(b.status==='active')-Number(a.status==='active') ||
      Number(b.page_count||0)-Number(a.page_count||0) ||
      String(b.updated_at||'').localeCompare(String(a.updated_at||'')) ||
      String(a.name).localeCompare(String(b.name)));
    selectedSite=designated||atOrigin||established[0];
  }
  let provisioned=null;
  if(selectedSite) {
    // A library read never installs a different theme into an authored site.
    // Empty sites go directly to discovery; Add is the installation action.
    provisioned=await listThemeProjects(env,accountId,selectedSite.id);
  }
  let drafts=[];
  try { drafts=await listStudioThemeDrafts(env,accountId); }
  catch { /* A failed optional draft read does not impersonate a published site. */ }
  // Never put the first draft from an unrelated site into the active preview.
  const installed=selectedSite
    ? drafts.find(theme=>theme.installed===true&&theme.site_id===selectedSite.id&&theme.edit_href)
    : null;
  // Provisioning has already verified the saved CMS project. A legacy draft
  // list failure must not turn a usable installed site back into an empty UI.
  const saved=provisioned?.projects?.[0]||null;
  const currentTheme=installed || (saved ? {
    id:saved.id,name:saved.name,preview_url:saved.sourcePreviewUrl||null,
    edit_href:'/admin/theme-project-editor?project='+encodeURIComponent(saved.id)+'&site_id='+encodeURIComponent(selectedSite.id),
  }:null);
  // Existing sites already own authored CMS pages. Never make a newly
  // provisioned template the only way to edit a real published homepage.
  let homePage=null;
  if(selectedSite) {
    try {
      homePage=await env.DB.prepare(`
        SELECT id,slug,title,status,route_path FROM cms_pages
        WHERE site_id=? AND (route_path='/' OR slug='home')
          AND status NOT IN ('archived','removed')
        ORDER BY (route_path='/') DESC,(status='published') DESC LIMIT 1
      `).bind(selectedSite.id).first();
    } catch { /* Theme projects remain available for new websites. */ }
  }
  const domain=String(selectedSite?.primary_domain||'').trim().toLowerCase();
  const externalPreview=homePage?.status==='published' &&
    selectedSite?.status==='active' &&
    /^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/.test(domain)
      ? 'https://'+domain+(homePage.route_path||'/') : null;
  const siteEditHref=homePage
    ? '/admin/theme-editor?'+new URLSearchParams({
      site_id:selectedSite.id,slug:homePage.slug,page_id:homePage.id,
    }).toString()
    : null;
  return response({
    ok:true,source:'studio_cms_site_read_model',
    store:{visibility:'unpublished',url:null,domain:null,company_name:null},
    site_preview:homePage?{
      title:homePage.title,site_id:selectedSite.id,
      page_id:homePage.id,status:homePage.status,
      url:externalPreview,edit_href:siteEditHref,
    }:null,
    performance:emptyPerformance,active_theme:null,
    draft_themes:selectedSite?drafts.filter(draft=>draft.installed&&draft.site_id===selectedSite.id):[],
    // A project preview is never proof that its site is published.
    preview_theme:currentTheme?{
      id:currentTheme.id,name:currentTheme.name,preview_href:null,
      last_saved:currentTheme.updated_at||saved?.updatedAt||currentTheme.created_at||saved?.createdAt||null,
      source_preview_href:currentTheme.preview_url,
      edit_href:currentTheme.edit_href,verified:false,installed:true
    }:null,
    pages:[],cms_connected:cmsConnected,setup_required:!selectedSite,
    available_sites:sites.map(({id,name,slug,primary_domain,is_default,status,page_count})=>({
      id,name,slug,primary_domain,is_default,status,page_count,
    })),
    site_selection_required:false,
    selected_site_id:selectedSite?.id||null,
    selected_site_name:selectedSite?.name||null,
  });
}
