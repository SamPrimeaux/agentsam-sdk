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

  async function getThemeIdentity() {
    const catalog = await request('/api/admin/cms/themes');
    const theme = catalog.active_theme || catalog.preview_theme || null;
    return {
      name: theme?.name || theme?.slug || 'Website theme',
      status: theme?.state || theme?.status || 'draft',
    };
  }

  async function resolvePreview(slug, pageData) {
    if (!site || !Array.isArray(pages)) {
      const result = await request('/api/admin/cms/pages');
      site = result.site || site;
      pages = Array.isArray(result.pages) ? result.pages : pages;
    }
    const page = pageData || pages.find(item => item.slug === slug);
    const previewPage = slug === 'site' ? (pages.find(item => item.slug === 'home') || page) : page;
    const route = previewPage?.route_path || previewPage?.route || previewPage?.live_route || (slug === 'home' || slug === 'site' ? '/' : null);
    if (!route || route === '/_site-shell') throw new Error('cms_page_public_route_unavailable');
    const publicUrl = publicUrlResolver?.(site, route);
    if (!publicUrl) throw new Error('cms_site_public_domain_required');
    const previewUrl = new URL(publicUrl);
    previewUrl.searchParams.set('preview', '1');
    previewUrl.searchParams.set('_', String(Date.now()));
    return { url: previewUrl.href, openUrl: publicUrl };
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
    resolvePreview,
    listMedia,
    uploadMedia,
    capabilities: { publish: true },
    get site() { return site; },
    get pages() { return pages; },
    get siteId() { return siteId; },
  };
}
