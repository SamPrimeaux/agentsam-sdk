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
    location: { pathname: '/admin/theme-editor', search: '?slug=sam-docs' },
    window: fakeWindow,
    URLSearchParams,
    history: { replaceState() {} },
    URL: class {},
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.includes('/draft?')) return { ok: true, json: async () => ({ ok: true, version: 4 }) };
      if (url.includes('/sam-docs?')) return { ok: true, json: async () => ({ ok: true, page, html, source: 'published' }) };
      return { ok: true, json: async () => ({ ok: true, pages: [page] }) };
    },
    Error, JSON, Date, Object
  };
  runInNewContext(script, context);
  const host = fakeWindow.AgentSamThemeEditorHost;
  assert.equal(host.page, 'sam-docs');
  assert.equal(host.adapter.capabilities.publish, false);
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
});
