import { listStudioThemeDrafts } from './studio-theme-drafts.js';
import { listThemeProjects } from '../../../ecommerce-cms-agentsam/backend/cms/theme-project-store.mjs';
import { listAuthorizedCmsSites, resolveCmsSiteAccess, configuredCmsWorkers } from './cms-authority.js';

/** Local Studio-owned site picker and Online Store read model. */
const response = data => Response.json(data, { headers: { 'cache-control': 'private, no-store' } });
const emptyPerformance = { period_days: 30, lcp_ms: null, inp_ms: null, cls: null, sessions_desktop: null, sessions_mobile: null };

export async function handleStudioSitesOverview(request, env, actorUserId) {
  if (!actorUserId) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!env?.DB) return Response.json({ ok: false, error: 'cms_database_unavailable' }, { status: 503 });

  let cmsConnected = false;
  try {
    await env.DB.prepare('SELECT id FROM cms_sites LIMIT 1').first();
    cmsConnected = true;
  } catch { /* The site directory remains unavailable until its schema exists. */ }

  const url = new URL(request.url);
  const requestedSite = url.searchParams.get('site_id') || url.searchParams.get('site');
  const hostname = url.hostname.toLowerCase();
  let sites = [];
  try {
    sites = await listAuthorizedCmsSites(env.DB, actorUserId, { remoteWorkerNames: configuredCmsWorkers(env) });
  } catch {
    return Response.json({ ok: false, error: 'cms_site_inventory_unavailable' }, { status: 503 });
  }

  let selectedSite = null;
  if (requestedSite) {
    const access = await resolveCmsSiteAccess(env.DB, actorUserId, requestedSite, 'read', {
      remoteWorkerNames: configuredCmsWorkers(env),
    });
    if (!access.ok) return Response.json({ ok: false, error: access.error }, { status: access.status });
    selectedSite = access.site;
  } else {
    const defaults = sites.filter(site => site.is_default === true || site.is_default === 1 || site.is_default === '1');
    const hostnameMatches = sites.filter(site => {
      if (String(site.primary_domain || site.domain || '').toLowerCase() === hostname) return true;
      try {
        const aliases = typeof site.domain_aliases_json === 'string'
          ? JSON.parse(site.domain_aliases_json || '[]') : site.domain_aliases_json || [];
        return Array.isArray(aliases) && aliases.some(domain => String(domain).toLowerCase() === hostname);
      } catch { return false; }
    });
    if (defaults.length === 1) selectedSite = defaults[0];
    else if (defaults.length > 1) selectedSite = null;
    else if (hostnameMatches.length === 1) selectedSite = hostnameMatches[0];
    else if (sites.length === 1) selectedSite = sites[0];
    // Multiple sites without a designated default require an explicit choice.
    // Never pick the first or most recently updated site on the user's behalf.
  }

  const siteAccountId = selectedSite?.account_id || actorUserId;
  let provisioned = null;
  if (selectedSite?.source === 'shared-d1') {
    provisioned = await listThemeProjects(env, siteAccountId, selectedSite.id);
  }

  const authoring=await listThemeProjects(env,actorUserId).catch(()=>({projects:[]}));
  const authored=(authoring.projects||[]).map(p=>({id:p.id,name:p.name,version:p.sourcePackageVersion||p.version,updated_at:p.updatedAt,preview_url:p.sourcePreviewUrl,installed:true,publish_ready:false,scope:'account',edit_href:'/admin/theme-editor?'+new URLSearchParams({project:p.id,page:p.pages?.find(page=>page.slug==='home')?.slug||p.pages?.[0]?.slug||'home'})}));
  let drafts = [];
  if (selectedSite) {
    try { drafts = await listStudioThemeDrafts(env, siteAccountId); }
    catch { /* An optional draft inventory failure does not impersonate a published site. */ }
  }
  const installed = selectedSite
    ? drafts.find(theme => theme.installed === true && theme.site_id === selectedSite.id && theme.edit_href)
    : null;
  const saved = provisioned?.projects?.[0] || null;
  const currentTheme = installed || (saved ? {
    id: saved.id,
    name: saved.name,
    preview_url: saved.sourcePreviewUrl || null,
    edit_href: '/admin/sites/' + encodeURIComponent(selectedSite.id) + '/themes/' + encodeURIComponent(saved.id) + '/editor/home',
  } : null);

  let homePage = null;
  if (selectedSite?.source === 'shared-d1') {
    try {
      homePage = await env.DB.prepare(`
        SELECT id, slug, title, status, route_path FROM cms_pages
        WHERE site_id = ? AND (route_path = '/' OR slug = 'home')
          AND status NOT IN ('archived', 'removed')
        ORDER BY (route_path = '/') DESC, (status = 'published') DESC LIMIT 1
      `).bind(selectedSite.id).first();
    } catch { /* Theme projects remain available even when legacy page reads are absent. */ }
  }

  const domain = String(selectedSite?.primary_domain || selectedSite?.domain || '').trim().toLowerCase();
  const externalPreview = homePage?.status === 'published' && selectedSite?.status === 'active' &&
    /^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/.test(domain)
      ? 'https://' + domain + (homePage.route_path || '/') : null;
  const siteEditHref = homePage
    ? '/admin/sites/' + encodeURIComponent(selectedSite.id) + '/pages/' + encodeURIComponent(homePage.id) + '/editor'
    : null;

  // The selected site's actual settings are already authorized by the directory.
  // Return only the access state, never password hashes or settings JSON.
  let passwordProtected=false;
  if(selectedSite?.source==='shared-d1') {
    try { const settings=typeof selectedSite.settings_json==='string'?JSON.parse(selectedSite.settings_json):selectedSite.settings_json; passwordProtected=settings?.store?.passwordProtection===true; } catch {}
  }
  return response({
    ok: true,
    source: 'studio_cms_site_read_model',
    new_theme_url: '/admin/theme-editor?new=1',
    store: { visibility: passwordProtected ? 'password' : externalPreview ? 'public' : 'unpublished', url: externalPreview, domain: externalPreview ? domain : null, company_name: selectedSite?.name || null },
    site_preview: homePage ? {
      title: homePage.title,
      site_id: selectedSite.id,
      page_id: homePage.id,
      status: homePage.status,
      url: externalPreview,
      edit_href: siteEditHref,
    } : null,
    performance: emptyPerformance,
    active_theme: null,
    draft_themes: [...authored,...(selectedSite ? drafts.filter(draft => draft.site_id === selectedSite.id) : [])],
    preview_theme: currentTheme ? {
      id: currentTheme.id,
      name: currentTheme.name,
      preview_href: null,
      last_saved: currentTheme.updated_at || saved?.updatedAt || currentTheme.created_at || saved?.createdAt || null,
      source_preview_href: currentTheme.preview_url,
      edit_href: currentTheme.edit_href,
      verified: false,
      installed: true,
    } : null,
    pages: [],
    cms_connected: cmsConnected,
    setup_required: sites.length === 0,
    available_sites: sites.map(({ id, name, slug, primary_domain, domain, is_default, status, page_count, role, can_edit, can_publish }) => ({
      id, name, slug, primary_domain: primary_domain || domain || null,
      is_default: Boolean(is_default), status, page_count, role, can_edit, can_publish,
    })),
    site_selection_required: !selectedSite && sites.length > 1,
    selected_site_id: selectedSite?.id || null,
    selected_site_name: selectedSite?.name || null,
  });
}
