import { listStudioThemeDrafts } from './studio-theme-drafts.js';
import { ensureDefaultCmsSite, resolveCmsSite } from '../../../ecommerce-cms-agentsam/backend/cms/site-context.mjs';
import { ensureCmsSiteStarter } from '../../../ecommerce-cms-agentsam/backend/cms/site-starter.mjs';
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
  const siteId=new URL(request.url).searchParams.get('site_id');
  // A merchant chooses their website explicitly. A single site (or an
  // explicitly designated default) can open without another selection step.
  // Never guess the first site in a multi-site account.
  let sites=[];
  try {
    const rows=await env.DB.prepare(`
      SELECT id,name,slug,primary_domain,is_default FROM cms_sites
      WHERE account_id=? AND status!='archived'
      ORDER BY is_default DESC,created_at ASC,name ASC
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
  } else if(sites.length===1 || sites.filter(site=>site.is_default===1).length===1) {
    selectedSite=sites.find(site=>site.is_default===1)||sites[0];
  }
  if(selectedSite) {
    // The first visit is also the recovery path for older blank sites.
    // Idempotent: an existing theme or edited draft is never replaced.
    const seeded=await ensureCmsSiteStarter(env,accountId,selectedSite.id);
    if(!seeded.ok) return Response.json({ok:false,error:seeded.error||'cms_starter_install_failed',
      site_id:selectedSite.id},{status:seeded.status||503});
  }
  let drafts=[];
  try { drafts=await listStudioThemeDrafts(env,accountId); }
  catch { /* A failed optional draft read does not impersonate a published site. */ }
  // Never put the first draft from an unrelated site into the active preview.
  const installed=selectedSite
    ? drafts.find(theme=>theme.installed===true&&theme.site_id===selectedSite.id&&theme.edit_href)
    : null;
  return response({
    ok:true,source:'studio_cms_site_read_model',
    store:{visibility:'unpublished',url:null,domain:null,company_name:null},
    performance:emptyPerformance,active_theme:null,
    draft_themes:selectedSite?drafts.filter(draft=>!draft.installed||draft.site_id===selectedSite.id):drafts,
    // A project preview is never proof that its site is published.
    preview_theme:installed?{
      id:installed.id,name:installed.name,preview_href:null,
      source_preview_href:installed.preview_url,
      edit_href:installed.edit_href,verified:false,installed:true
    }:null,
    pages:[],cms_connected:cmsConnected,setup_required:!selectedSite,
    available_sites:sites.map(({id,name,slug})=>({id,name,slug})),
    site_selection_required:!selectedSite&&sites.length>1,
    selected_site_id:selectedSite?.id||null,
    selected_site_name:selectedSite?.name||null,
  });
}
