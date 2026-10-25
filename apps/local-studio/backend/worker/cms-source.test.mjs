import test from 'node:test';
import assert from 'node:assert/strict';
import { handleCmsSourceRequest } from './cms-source.js';

const siteSlug = 'agentsam-sdk';
const sourceKey = 'sites/agentsam-sdk/public/docs/sam/index.html';
const sourceHtml = '<!doctype html><html><body>Existing docs</body></html>';
function harness() {
  const objects = new Map([[sourceKey, sourceHtml]]);
  const row = {
    id: 'page_sdk_sam_docs', slug: 'sam-docs', title: 'SAM Docs',
    route_path: '/docs/sam/', r2_key: sourceKey, r2_bucket: 'agentsam-os-blueprint-content',
    status: 'published', is_active: 1, metadata_json: '{}',
  };
  let dbWrites = 0;
  const dbClient = {
    async getPages() { return [row]; },
    async getSectionsForPage(id) {
      assert.equal(id, row.id);
      return [{ id: 'sec_sdk_html_sam_docs', section_type: 'html_source' }];
    },
    async getBlocksForSection(id) {
      assert.equal(id, 'sec_sdk_html_sam_docs');
      return [{ id: 'cmsb_sdk_html_sam_docs', block_key: 'document', block_type: 'html' }];
    },
  };
  const db = {
    prepare() {
      return { bind(json, pageId, projectSlug, expected) {
        return { async run() {
          assert.equal(pageId, row.id);
          assert.equal(projectSlug, siteSlug);
          const current = JSON.parse(row.metadata_json).cms_source_version || 0;
          if (expected !== current) return { meta: { changes: 0 } };
          row.metadata_json = json; dbWrites++;
          return { meta: { changes: 1 } };
        } };
      } };
    }
  };
  const env = {
    DB: db,
    WEBSITE_ASSETS: {
      async get(key) {
        const text = objects.get(key);
        return text === undefined ? null : { text: async () => text };
      },
      async put(key, text) { objects.set(key, text); },
      async delete(key) { objects.delete(key); }
    }
  };
  const ownedSite = { source: 'shared-d1', can_edit: true };
  async function route(path, method = 'GET', body) {
    const request = new Request('https://example.test' + path + '?site=' + siteSlug, { method });
    const url = new URL(request.url);
    return handleCmsSourceRequest({ request, url, body, env, siteSlug, dbClient, ownedSite });
  }
  return { route, row, objects, get dbWrites() { return dbWrites; } };
}

test('enumerates only registered pages, then reads exact R2 source', async () => {
  const h = harness();
  const listed = await (await h.route('/api/cms/source/pages')).json();
  assert.equal(listed.pages.length, 1);
  assert.equal(listed.pages[0].route, '/docs/sam/');
  const result = await (await h.route('/api/cms/source/pages/sam-docs')).json();
  assert.equal(result.html, sourceHtml);
  assert.equal(result.source, 'published');
  assert.equal(result.page.section_id, 'sec_sdk_html_sam_docs');
  assert.equal(result.page.block_id, 'cmsb_sdk_html_sam_docs');
});
test('saving edits creates a private R2 draft and retains original public HTML', async () => {
  const h = harness();
  const html = sourceHtml.replace('Existing', 'Edited');
  const result = await (await h.route('/api/cms/source/pages/sam-docs/draft','PUT',
    { html, expected_version: 0 })).json();
  assert.equal(result.version, 1);
  assert.equal(h.objects.get(sourceKey), sourceHtml);
  assert.equal(h.objects.get(result.draft_key), html);
  assert.equal(h.dbWrites, 1);
  const refreshed = await (await h.route('/api/cms/source/pages/sam-docs')).json();
  assert.equal(refreshed.html, html);
  assert.equal(refreshed.source, 'draft');
});
test('rejects stale saves, malformed HTML, and missing page identities', async () => {
  const h = harness();
  let response = await h.route('/api/cms/source/pages/unknown');
  assert.equal(response.status, 404);
  response = await h.route('/api/cms/source/pages/sam-docs/draft','PUT',
    { html: 'just some text', expected_version: 0 });
  assert.equal(response.status, 400);
  response = await h.route('/api/cms/source/pages/sam-docs/draft','PUT',
    { html: sourceHtml, expected_version: 3 });
  assert.equal(response.status, 409);
  assert.equal(h.dbWrites, 0);
});
