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
  return response({
    ok:true,source:'studio_cms_site_read_model',
    store:{visibility:'unpublished',url:null,domain:null,company_name:null},
    performance:emptyPerformance,active_theme:null,draft_themes:[],
    preview_theme:null,pages:[],cms_connected:cmsConnected,setup_required:true,
  });
}
