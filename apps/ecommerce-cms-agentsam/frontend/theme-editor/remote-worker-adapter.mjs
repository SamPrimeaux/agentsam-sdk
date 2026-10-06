/**
 * Theme Editor adapter over a remotely owned ecommerce CMS.
 *
 * FNF's own Worker retains page, section, R2, concurrency and publish authority.
 * This module only translates its CMS admin API to the portable Theme Studio
 * boundary. Never projects customer content into the SDK's shared D1.
 */
export function createRemoteThemeEditorAdapter(siteSlug, transport) {
  if (!/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(siteSlug)) throw new Error('cms_site_slug_invalid');
  if (typeof transport !== 'function') throw new Error('cms_remote_transport_required');

  const request = async (tail, method='GET', body) => {
    const response = await transport('/api/cms/remote/' + tail + '?site=' + encodeURIComponent(siteSlug), {
      method, credentials: 'same-origin', cache: 'no-store',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const content = await response.json().catch(() => ({}));
    if (!response.ok || content?.ok === false) {
      const error = new Error(content.error || 'cms_remote_status_' + response.status);
      error.status = response.status;
      throw error;
    }
    return content;
  };
  const part = (value) => {
    if (typeof value !== 'string' || !/^[a-z0-9-]+$/i.test(value)) throw new Error('cms_remote_invalid_identifier');
    return encodeURIComponent(value);
  };

  return {
    // Publishing stays unavailable until a verified draft preview and
    // publication/rollback receipt have been proven in this client.
    capabilities: { publish: false },
    async listPages() {
      const result = await request('pages');
      return (result.pages || []).map(({slug,title}) => ({ slug, title, id: slug }));
    },
    async getRegistry() { return request('registry'); },
    async getPage(slug) { const result = await request('pages/' + part(slug)); return result.page; },
    async saveDraft(slug, key, content, expectedVersion) {
      return request('pages/' + part(slug) + '/sections/' + part(key), 'PUT', {
        content, expected_version: Number(expectedVersion),
      });
    },
    async addSection(slug, templateKey, toIndex) {
      return request('pages/' + part(slug) + '/sections', 'POST', {templateKey,toIndex});
    },
    async duplicateSection(slug, key) {
      return request('pages/' + part(slug) + '/sections/' + part(key) + '/duplicate','POST',{});
    },
    async removeSection(slug, key) {
      return request('pages/' + part(slug) + '/sections/' + part(key),'DELETE');
    },
    async moveSection(slug, key, toIndex) {
      return request('pages/' + part(slug) + '/sections/' + part(key) + '/move','POST',{toIndex});
    },
    async setSectionVisibility(slug, key, enabled) {
      return request('pages/' + part(slug) + '/sections/' + part(key) + '/visibility','PUT',{enabled});
    },
    async addBlock(slug, key, templateKey, toIndex) {
      return request('pages/' + part(slug) + '/sections/' + part(key) + '/blocks','POST',{templateKey,toIndex});
    },
    async duplicateBlock(slug, key, id) {
      return request('pages/' + part(slug) + '/sections/' + part(key) + '/blocks/' + part(id) + '/duplicate','POST',{});
    },
    async moveBlock(slug, key, id, toIndex) {
      return request('pages/' + part(slug) + '/sections/' + part(key) + '/blocks/' + part(id) + '/move','POST',{toIndex});
    },
    async removeBlock(slug, key, id) {
      return request('pages/' + part(slug) + '/sections/' + part(key) + '/blocks/' + part(id),'DELETE');
    },
    async publish() {
      throw new Error('cms_live_publish_requires_verified_preview_and_rollback');
    },
    async resolvePreview(slug, draft) {
      // This is a real data-bound visual composition from the portable FNF
      // renderer, NOT a claim that the exact published Heuristic storefront
      // will look identical. The live-publish gate remains intentionally shut.
      if (typeof window === 'undefined') throw new Error('cms_preview_requires_browser');
      if (!window.ThemeStudioPreview) {
        await import('../../../../packages/theme-contract/runtime/theme-preview-registry.js');
      }
      if (!window.ThemeStudioPreview.getTheme('fnf')) {
        await import('../../../../packages/fnf-theme/src/editor/preview-adapter.js');
      }
      const site = slug === 'site'
        ? draft
        : (await request('pages/site').catch(() => ({ page: null }))).page;
      const html = window.ThemeStudioPreview.render('fnf', draft, site);
      if (!html || !html.includes('<html')) throw new Error('cms_visual_preview_unavailable');
      return { html };
    },
    async listMedia() { return []; },
  };
}
