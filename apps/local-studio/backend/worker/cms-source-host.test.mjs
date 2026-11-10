import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const script = readFileSync(new URL('../../frontend/public/studio-cms-source-host.js', import.meta.url), 'utf8');

test('Theme Studio uses the registered CMS page list, R2 HTML source, and D1 version on save', async () => {
  const calls = [];
  const page = { id: 'page_sdk_sam_docs', slug: 'sam-docs', title: 'SAM Docs', route: '/docs/sam/', status: 'published', version: 3 };
  const html = '<!doctype html><html><body>Real R2 docs</body></html>';
  const fakeWindow = {};
  const context = {
    location: {
      pathname: '/admin/theme-editor',
      search: '?slug=sam-docs&source=html&site=agentsam-sdk',
      href: 'https://studio.test/admin/theme-editor?slug=sam-docs&source=html&site=agentsam-sdk',
    },
    window: fakeWindow,
    URLSearchParams,
    history: { replaceState() {} },
    URL,
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      if (url === '/api/cms/sites') return {
        ok: true, json: async () => ({ ok: true, sites: [{ id: 'site-sdk', slug: 'agentsam-sdk', name: 'AgentSam SDK', can_publish: true }] })
      };
      if (url.includes('/publish?')) return { ok: true, json: async () => ({ ok: true, version: 5, published_at: 1794330000, receipt: { verified: true } }) };
      if (url.includes('/draft?')) return { ok: true, json: async () => ({ ok: true, version: 4 }) };
      if (url.includes('/sam-docs?')) return { ok: true, json: async () => ({ ok: true,
        page: { ...page, version: calls.some(x => x.url.includes('/draft?')) ? 4 : 3 },
        html, source: calls.some(x => x.url.includes('/draft?')) ? 'draft' : 'published' }) };
      return { ok: true, json: async () => ({ ok: true, pages: [page] }) };
    },
    Error, JSON, Date, Object
  };
  runInNewContext(script, context);
  assert.equal(typeof fakeWindow.__agentsamCmsSourceHostReady?.then, 'function',
    'source host readiness must be exposed synchronously before theme-editor.js loads');
  await fakeWindow.__agentsamCmsSourceHostReady;
  const host = fakeWindow.AgentSamThemeEditorHost;
  assert.equal(host.page, 'sam-docs');
  assert.equal(host.adapter.capabilities.publish, true);
  const registry = await host.adapter.getRegistry();
  assert.equal(registry.pages['sam-docs'].sections.document.fields[0].key, 'html');
  assert.equal(host.pageRoutes['sam-docs'], '/docs/sam/');
  const result = await host.adapter.request('/api/admin/cms/pages/sam-docs');
  assert.equal(result.page.sections[0].content.html, html);
  assert.equal(result.page.sections[0].version, 3);
  const modified = html.replace('Real', 'Edited');
  const preview = await host.adapter.resolvePreview('sam-docs', {
    sections: [{ key: 'document', content: { html: modified } }]
  });
  assert.equal(preview.html, modified);
  const saved = await host.adapter.request('/api/admin/cms/pages/sam-docs/sections/document', {
    method: 'PUT', body: JSON.stringify({ content: { html: modified }, expected_version: 3 })
  });
  assert.equal(saved.version, 4);
  const draftRequest = calls.find(x => x.url.includes('/draft?'));
  assert.equal(draftRequest.options.method, 'PUT');
  assert.equal(JSON.parse(draftRequest.options.body).expected_version, 3);
  assert.equal(draftRequest.url.includes('site=agentsam-sdk'), true);
  const publication = await host.adapter.request('/api/admin/cms/pages/sam-docs/publish', { method: 'POST' });
  assert.equal(publication.receipt.verified, true);
  const publishRequest = calls.find(x => x.url.includes('/publish?'));
  assert.equal(JSON.parse(publishRequest.options.body).expected_version, 4);
  assert.equal(JSON.parse(publishRequest.options.body).confirm, 'publish');

});


test('legacy source adapter stays out of the canonical site-first Theme Editor', () => {
  const fakeWindow = {};
  runInNewContext(script, {
    location: { pathname: '/admin/theme-editor', search: '?slug=about&site_id=site-a&page_id=cmsp_123' },
    window: fakeWindow,
    URLSearchParams,
  });
  assert.equal(fakeWindow.AgentSamThemeEditorHost, undefined);
  assert.equal(fakeWindow.__agentsamCmsSourceHost, undefined);
  assert.equal(fakeWindow.__agentsamCmsSourceHostReady, undefined);
});

test('an async site lookup holds editor startup until the scoped source adapter exists', async () => {
  let completeSiteLookup;
  const pending = new Promise(resolve => { completeSiteLookup = resolve; });
  const fakeWindow = {};
  const context = {
    location: {
      pathname: '/admin/theme-editor',
      search: '?slug=sdk-help&source=html&site=agentsam-sdk',
      href: 'https://agentsam.inneranimalmedia.com/admin/theme-editor?slug=sdk-help&source=html&site=agentsam-sdk',
    },
    window: fakeWindow,
    URLSearchParams,
    history: { replaceState() {} },
    URL,
    fetch: async () => pending,
    Error, JSON, Date, Object
  };
  runInNewContext(script, context);
  assert.equal(typeof fakeWindow.__agentsamCmsSourceHostReady?.then, 'function');
  assert.equal(fakeWindow.AgentSamThemeEditorHost, undefined,
    'host must not be installed until authenticated site selection completes');
  completeSiteLookup({
    ok: true,
    json: async () => ({ ok: true, sites: [
      { id: 'site_882ac8075543f0d4', slug: 'agentsam-sdk',
        name: 'AgentSam SDK (Local Studio)', can_publish: true }
    ] }),
  });
  const ready = await fakeWindow.__agentsamCmsSourceHostReady;
  assert.equal(ready, fakeWindow.AgentSamThemeEditorHost);
  assert.equal(ready.page, 'sdk-help');
  assert.equal(ready.site, 'agentsam-sdk');
  assert.equal(ready.adapter.capabilities.publish, true);
});

test('the existing Theme Editor waits for source adapter before selecting its CMS request transport', () => {
  const src = readFileSync(new URL('../../../ecommerce-cms-agentsam/frontend/static/js/theme-editor.js', import.meta.url), 'utf8');
  assert.ok(src.includes('await window.__agentsamCmsSourceHostReady'));
  assert.ok(src.includes('if (!window.AgentSamThemeEditorHost) return;'));
  assert.ok(src.includes("if (!host && selectedTheme === 'heuristic')"),
    'srcdoc previews must not be reloaded from the legacy iframe load handler');
  assert.ok(src.indexOf('await window.__agentsamCmsSourceHostReady') <
    src.indexOf('const host = window.AgentSamThemeEditorHost'),
    'site authorization must complete before the transport is captured');
});

test('source editor does not offer publication to a site-scoped editor without approval permission', async () => {
  const fakeWindow = {};
  runInNewContext(script, {
    location: { pathname: '/admin/theme-editor', search: '?slug=home&source=html&site=agentsam-sdk',
      href: 'https://agentsam.inneranimalmedia.com/admin/theme-editor?slug=home&source=html&site=agentsam-sdk' },
    window: fakeWindow, URLSearchParams, URL, history: { replaceState() {} },
    fetch: async () => ({ ok: true, json: async () => ({
      ok: true, sites: [{ id: 'site-sdk', slug: 'agentsam-sdk', name: 'AgentSam SDK', can_edit: true, can_publish: false }]
    }) }),
    Error, JSON, Date, Object,
  });
  const host = await fakeWindow.__agentsamCmsSourceHostReady;
  assert.equal(host.adapter.capabilities.publish, false);
});
