import { renderThemePage, withThemeSharedChrome } from './project.mjs';

/**
 * CMS-page target for the single Theme Studio runtime.
 *
 * The editor always speaks the same /api/admin/cms/pages contract. This
 * adapter routes those calls to the account-owned CMS page APIs while the
 * theme-project adapter routes the identical contract to a draft theme.
 */
export function createCmsPageThemeEditorAdapter({
  siteId: initialSiteId = null,
  pagesPayload: initialPagesPayload = null,
  fetchImpl = (...args) => fetch(...args),
  publicUrlResolver = null,
} = {}) {
  let siteId = initialSiteId || initialPagesPayload?.site?.id || null;
  let pagesPayload = initialPagesPayload;
  let pages = Array.isArray(pagesPayload?.pages) ? pagesPayload.pages : [];
  let site = pagesPayload?.site || null;
  const pageIds = new Map(pages.filter(page => page?.slug && page?.id).map(page => [page.slug, page.id]));

  function scopedUrl(path) {
    const url = new URL(path, globalThis.location?.origin || 'https://agentsam.invalid');
    const isCmsApi = url.pathname.startsWith('/api/admin/cms/');
    const isMerchantCatalog = url.pathname === '/api/admin/products' || url.pathname === '/api/admin/collections';
    if ((isCmsApi || isMerchantCatalog) && siteId) {
      url.searchParams.set('site_id', siteId);
    }
    const pageMatch = url.pathname.match(/^\/api\/admin\/cms\/pages\/([^/]+)(?:\/|$)/);
    if (pageMatch && pageMatch[1] !== 'site' && !url.searchParams.has('page_id')) {
      const slug = decodeURIComponent(pageMatch[1]);
      const pageId = pageIds.get(slug);
      if (pageId) url.searchParams.set('page_id', pageId);
    }
    return url;
  }

  async function request(path, init = {}) {
    const url = scopedUrl(path);
    const headers = new Headers(init.headers || {});
    if (typeof init.body === 'string' && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }
    const response = await fetchImpl(url.pathname + url.search, {
      credentials: 'include',
      ...init,
      headers,
    });
    let data = null;
    try { data = await response.json(); } catch { /* Preserve the HTTP failure below. */ }
    if (!response.ok || data?.ok === false) {
      const error = new Error(data?.error || data?.message || `CMS request failed (${response.status})`);
      error.status = response.status;
      error.code = data?.error || null;
      throw error;
    }
    if (url.pathname === '/api/admin/cms/pages' && response.ok && data) {
      pagesPayload = data;
      pages = Array.isArray(data.pages) ? data.pages : [];
      site = data.site || site;
      if (!siteId && site?.id) siteId = site.id;
      pageIds.clear();
      for (const page of pages) if (page?.slug && page?.id) pageIds.set(page.slug, page.id);
    }
    return data || {};
  }

  async function getRegistry() {
    const result = await request('/api/admin/cms/registry');
    return result.registry || result;
  }

  async function getSelectedThemeProject() {
    const catalog = await request('/api/admin/cms/themes');
    // Theme Studio edits the selected preview theme. The live theme remains
    // untouched until the merchant explicitly publishes the theme.
    const selected = catalog.preview_theme || catalog.active_theme || null;
    if (!selected?.slug) throw new Error('cms_theme_selection_missing');
    const inventory = await request('/api/admin/cms/theme-projects');
    const projects = Array.isArray(inventory.projects) ? inventory.projects : [];
    const summary = projects.find(project =>
      project?.sourceThemeId === selected.slug ||
      project?.id === selected.project_id ||
      project?.id === selected.projectId
    );
    if (!summary?.id) throw new Error('cms_theme_project_not_found_for_selected_theme');
    const result = await request(`/api/admin/cms/theme-projects/${encodeURIComponent(summary.id)}`);
    if (!result?.project || result.project.id !== summary.id) {
      throw new Error('cms_theme_project_read_failed');
    }
    return result.project;
  }

  async function getThemeIdentity() {
    const catalog = await request('/api/admin/cms/themes');
    const theme = catalog.preview_theme || catalog.active_theme || null;
    return {
      name: theme?.name || theme?.slug || 'Website theme',
      status: theme?.state || theme?.status || 'draft',
    };
  }

  async function getThemeSettings() {
    const project = await getSelectedThemeProject();
    return structuredClone(project.themeSettings || {});
  }

  async function updateThemeSettings(settings) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      throw new Error('theme_settings_object_required');
    }
    const project = await getSelectedThemeProject();
    const nextProject = { ...project, themeSettings: structuredClone(settings) };
    const saved = await request(`/api/admin/cms/theme-projects/${encodeURIComponent(project.id)}`, {
      method: 'PUT',
      body: JSON.stringify({
        site_id: siteId,
        project: nextProject,
        expected_version: Number(project.revision || 0),
      }),
    });
    if (!saved?.ok || !saved.project) throw new Error(saved?.error || 'cms_theme_settings_save_failed');
    return structuredClone(saved.project.themeSettings || {});
  }

  async function resolvePreview(slug, pageData) {
    if (!site || !Array.isArray(pages)) {
      const result = await request('/api/admin/cms/pages');
      site = result.site || site;
      pages = Array.isArray(result.pages) ? result.pages : pages;
    }
    const page = pageData || pages.find(item => item.slug === slug);
    const previewPage = slug === 'site' ? (pages.find(item => item.slug === 'home') || page) : page;
    if (!previewPage?.slug || previewPage.route_path === '/_site-shell') {
      throw new Error('cms_page_preview_target_unavailable');
    }
    const route = previewPage.route_path || (previewPage.slug === 'home' ? '/' : null);
    const openUrl = route ? publicUrlResolver?.(site, route) : null;
    const hasPageSections = Array.isArray(previewPage.sections) && previewPage.sections.length > 0;

    // A CMS page with no page-owned sections inherits its matching page
    // template from the selected theme project. Reuse the exact Theme Studio
    // composition/rendering contract, including shared header/footer chrome.
    // Once the merchant adds page-owned sections, the canonical D1/R2 page
    // renderer takes over for that page's content.
    if (!hasPageSections) {
      let project = null;
      try { project = await getSelectedThemeProject(); } catch {}
      const templatePage = project?.pages?.find(item => item.slug === previewPage.slug) ||
        project?.pages?.find(item => item.slug === previewPage.page_type);
      if (templatePage) {
        const composed = withThemeSharedChrome(project, templatePage);
        const html = renderThemePage(composed, project.tokens || {}, {
          baseUrl: composed.assetBase || undefined,
        });
        if (typeof html !== 'string' || !html.trim()) throw new Error('cms_theme_template_preview_render_empty');
        return { html, ...(openUrl ? { openUrl } : {}), inheritedThemeTemplate: true,
          templateSlug: templatePage.slug };
      }
    }

    // Never point the editor at the public route with a decorative ?preview=1
    // query. The storefront does not own private drafts. Render the current
    // canonical D1/R2 page through the same server renderer used by Publish.
    const rendered = await request(`/api/admin/cms/pages/${encodeURIComponent(previewPage.slug)}/preview`, {
      method: 'POST',
      body: JSON.stringify({
        title: previewPage.title || previewPage.slug,
        body_html: '',
        visibility: previewPage.status === 'published' ? 'visible' : 'hidden',
        template_sku: previewPage.template_sku || '',
        seo_title: '',
        seo_description: '',
        url_handle: previewPage.slug,
      }),
    });
    if (typeof rendered?.html !== 'string' || !rendered.html.trim()) {
      throw new Error('cms_page_preview_render_empty');
    }
    return { html: rendered.html, ...(openUrl ? { openUrl } : {}) };
  }

  async function listMedia() {
    const assets = [];
    let page = 1;
    let pageCount = 1;
    do {
      const result = await request(`/api/admin/media?view=all&page_size=100&sort=newest&page=${page}`);
      assets.push(...(result.assets || result.media || []));
      pageCount = Number(result.pagination?.pages || 1);
      page += 1;
    } while (page <= pageCount && page <= 50);
    return assets;
  }

  async function uploadMedia(files) {
    const form = new FormData();
    [...(files || [])].forEach(file => form.append('files', file));
    form.append('prefix', 'uploads/theme-editor/');
    const result = await request('/api/admin/media', { method: 'POST', body: form });
    return result.assets || [];
  }

  return {
    request,
    getRegistry,
    getThemeIdentity,
    getThemeSettings,
    updateThemeSettings,
    resolvePreview,
    listMedia,
    uploadMedia,
    capabilities: { publish: true, catalogResources: true },
    get site() { return site; },
    get pages() { return pages; },
    get siteId() { return siteId; },
  };
}
