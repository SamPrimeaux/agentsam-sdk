/**
 * The existing ecommerce Theme Studio consumes Local Studio's R2/D1 CMS
 * through its documented host adapter. No second editor and no customer
 * Worker dependencies. Runs ONLY in Local Studio's /admin/theme-editor.
 */
(() => {
  if (location.pathname !== '/admin/theme-editor') return;
  const site = new URLSearchParams(location.search).get('site') || 'agentsam-sdk';
  const sourceUrl = (tail) => '/api/cms/source/pages' + tail + '?site=' + encodeURIComponent(site);
  async function call(tail, method = 'GET', body) {
    const response = await fetch(sourceUrl(tail), {
      method, credentials: 'same-origin',
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'cms_source_request_failed');
    return data;
  }
  let inventory = null;
  const adapter = {
    capabilities: { publish: false, createSections: false, createBlocks: false },
    async listPages() {
      const data = await call('');
      inventory = data.pages;
      const host = window.AgentSamThemeEditorHost;
      if (host) host.pageRoutes = Object.fromEntries(data.pages.map(p => [p.slug, p.route]));
      return data.pages.map(p => ({ id: p.id, slug: p.slug, title: p.title, route: p.route,
        live_route: p.route, status: p.status, section_count: 1 }));
    },
    async getRegistry() {
      const pages = await adapter.listPages();
      const descriptor = {
        label: 'HTML document',
        fields: [{ key: 'html', label: 'HTML source', type: 'textarea', group: 'content',
          description: 'Edit the existing R2-backed HTML. Save stores a private draft; the public file remains unchanged.' }],
        blocks: [], defaultContent: { html: '' }
      };
      return { definitions: [], pages: Object.fromEntries(
        pages.map(p => [p.slug, { title: p.title, sections: { document: descriptor } }])
      ) };
    },
    async getPage(slug) {
      const data = await call('/' + encodeURIComponent(slug));
      return {
        slug, title: data.page.title, status: data.source === 'draft' ? 'draft' : data.page.status,
        sections: [{ key: 'document', name: 'HTML document', sort_order: 0,
          status: data.source, version: data.page.version,
          content: { html: data.html } }]
      };
    },
    async saveDraft(slug, section, content, expectedVersion) {
      if (section !== 'document') throw new Error('cms_unknown_document_section');
      const data = await call('/' + encodeURIComponent(slug) + '/draft', 'PUT', {
        html: content.html, expected_version: expectedVersion
      });
      return { version: data.version, updated_at: new Date().toISOString() };
    },
    async resolvePreview(slug, page) {
      const html = page?.sections?.find(s => s.key === 'document')?.content?.html;
      if (typeof html !== 'string') throw new Error('cms_source_html_missing');
      return { html };
    },
    async getThemeIdentity() {
      return { name: 'AgentSam SDK', status: 'draft' };
    },
    async request(path, options = {}) {
      const chunks = path.split('?')[0].split('/').filter(Boolean);
      if (path === '/api/admin/cms/pages') return { pages: await adapter.listPages() };
      if (chunks.slice(0, 4).join('/') !== 'api/admin/cms/pages') {
        throw new Error('cms_source_adapter_route_unavailable:' + path);
      }
      const slug = decodeURIComponent(chunks[4] || '');
      if (!slug) return { pages: await adapter.listPages() };
      if (chunks.length === 5) return { page: await adapter.getPage(slug), seeded: true };
      if (chunks[5] === 'sections' && chunks[6] === 'document' && (options.method || 'GET') === 'PUT') {
        const body = JSON.parse(options.body || '{}');
        return adapter.saveDraft(slug, 'document', body.content, body.expected_version);
      }
      throw new Error('cms_source_adapter_write_unavailable:' + path);
    }
  };
  const slug = new URLSearchParams(location.search).get('slug') || 'home';
  window.AgentSamThemeEditorHost = { page: slug, adapter, pageRoutes: {},
    onPageChange(next) {
      const url = new URL(location.href);
      url.searchParams.set('slug', next);
      history.replaceState(null, '', url);
    }
  };
  window.__agentsamCmsSourceHost = true;
})();
