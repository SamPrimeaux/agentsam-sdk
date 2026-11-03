/**
 * The existing ecommerce Theme Studio consumes Local Studio's R2/D1 CMS
 * through its documented host adapter. No second editor and no customer
 * Worker dependencies. Runs ONLY in Local Studio's /admin/theme-editor.
 *
 * Site selection uses real authorized CMS sites from /api/cms/sites — never
 * invents fake cms records when the account has no site access.
 */
(() => {
  // The source editor remains available for R2-backed legacy HTML documents,
  // but normal Theme Editor navigation now uses canonical site-first CMS pages.
  if (location.pathname !== '/admin/theme-editor' ||
      new URLSearchParams(location.search).get('source') !== 'html') return;

  async function resolveAuthorizedSite() {
    const requested = new URLSearchParams(location.search).get('site');
    const response = await fetch('/api/cms/sites', { credentials: 'same-origin', cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok || !Array.isArray(data.sites)) {
      throw new Error(data?.error || 'cms_sites_unavailable');
    }
    if (!data.sites.length) {
      throw new Error('cms_site_not_found_or_not_authorized');
    }
    if (requested) {
      const match = data.sites.find((site) => site.slug === requested || site.id === requested);
      if (!match) throw new Error('cms_site_not_found_or_not_authorized');
      return { site: match, sites: data.sites };
    }
    return { site: data.sites[0], sites: data.sites };
  }

  function paintSiteGate(message, sites) {
    const host = document.querySelector('#theme-editor-root, main, .theme-editor, body');
    if (!host) return;
    const panel = document.createElement('div');
    panel.setAttribute('role', 'alert');
    panel.style.cssText = 'margin:1.5rem;padding:1rem 1.25rem;border:1px solid #ffffff22;border-radius:12px;background:#111;color:#eee;font:14px/1.45 system-ui,sans-serif;max-width:42rem';
    panel.innerHTML = '<strong style="display:block;margin-bottom:.5rem">Theme Editor needs an authorized site</strong>'
      + '<p style="margin:0 0 .75rem;opacity:.8">' + message + '</p>';
    if (Array.isArray(sites) && sites.length) {
      const list = document.createElement('div');
      list.style.cssText = 'display:flex;flex-wrap:wrap;gap:.5rem';
      for (const site of sites) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = site.name || site.slug;
        button.style.cssText = 'border:1px solid #ffffff33;background:#1b1b1b;color:#fff;border-radius:8px;padding:.4rem .75rem;cursor:pointer';
        button.addEventListener('click', () => {
          const url = new URL(location.href);
          url.searchParams.set('site', site.slug);
          location.assign(url.toString());
        });
        list.appendChild(button);
      }
      panel.appendChild(list);
    } else {
      const link = document.createElement('a');
      link.href = '/admin/store';
      link.textContent = 'Open Online Store to connect a site';
      link.style.cssText = 'color:#c4b8ff';
      panel.appendChild(link);
    }
    host.prepend(panel);
  }

  resolveAuthorizedSite().then(({ site, sites }) => {
    const siteSlug = site.slug;
    const url = new URL(location.href);
    if (url.searchParams.get('site') !== siteSlug) {
      url.searchParams.set('site', siteSlug);
      history.replaceState(null, '', url);
    }

    const sourceUrl = (tail) => '/api/cms/source/pages' + tail + '?site=' + encodeURIComponent(siteSlug);
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
        return { name: site.name || siteSlug, status: 'draft', site: siteSlug };
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
    window.AgentSamThemeEditorHost = {
      page: slug,
      adapter,
      pageRoutes: {},
      site: siteSlug,
      sites,
      onPageChange(next) {
        const nextUrl = new URL(location.href);
        nextUrl.searchParams.set('slug', next);
        history.replaceState(null, '', nextUrl);
      },
      onSiteChange(nextSite) {
        const nextUrl = new URL(location.href);
        nextUrl.searchParams.set('site', nextSite);
        location.assign(nextUrl.toString());
      },
    };
    window.__agentsamCmsSourceHost = true;
    if (sites.length > 1) {
      paintSiteGate('Editing site “' + (site.name || siteSlug) + '”. Choose another authorized site if needed.', sites);
    }
  }).catch((error) => {
    const message = String(error?.message || error);
    if (message === 'cms_site_not_found_or_not_authorized') {
      paintSiteGate('No CMS site is authorized for this account. Connect or select a real site before editing themes.', []);
    } else {
      paintSiteGate('Theme Editor could not resolve site access: ' + message, []);
    }
    console.warn('[theme-editor/site]', error);
  });
})();
