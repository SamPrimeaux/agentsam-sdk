import test from 'node:test';
import assert from 'node:assert/strict';
import { handleCmsSourceRequest } from './cms-source.js';

const siteSlug = 'agentsam-sdk';
const siteId = 'site_agentsam_sdk';
const sourceKey = 'sites/agentsam-sdk/public/docs/sam/index.html';
const sourceHtml = '<!doctype html><html><body>Existing docs</body></html>';
function harness() {
  const objects = new Map([[sourceKey, sourceHtml]]);
  const row = {
    id: 'page_sdk_sam_docs', site_id: siteId, slug: 'sam-docs', title: 'SAM Docs',
    route_path: '/docs/sam/', content_object_key: sourceKey,
    status: 'published', metadata_json: '{}',
  };
  let dbWrites = 0;
  const dbClient = {
    siteId,
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
    prepare(sql) {
      assert.match(sql, /WHERE id = \? AND site_id = \?/);
      if (/UPDATE cms_pages SET content_object_key/.test(sql)) {
        assert.match(sql, /cms_source_draft_key/);
        return { bind(key, metadata, publishedAt, updatedAt, pageId, boundSiteId, priorKey, expectedVersion, priorDraft) {
          return { async run() {
            assert.equal(pageId, row.id); assert.equal(boundSiteId, siteId);
            const current = JSON.parse(row.metadata_json);
            if (row.content_object_key !== priorKey || (current.cms_source_version || 0) !== expectedVersion ||
                (current.cms_source_draft_key || '') !== priorDraft)
              return { meta: { changes: 0 } };
            row.content_object_key = key;
            row.metadata_json = metadata;
            row.published_at = publishedAt;
            row.status = 'published';
            dbWrites++;
            return { meta: { changes: 1 } };
          } };
        } };
      }
      assert.match(sql, /UPDATE cms_pages SET metadata_json/);
      assert.match(sql, /content_object_key = \?/);
      return { bind(json, pageId, boundSiteId, expected, priorKey) {
        return { async run() {
          assert.equal(pageId, row.id); assert.equal(boundSiteId, siteId);
          const current = JSON.parse(row.metadata_json).cms_source_version || 0;
          if (expected !== current || priorKey !== row.content_object_key) return { meta: { changes: 0 } };
          row.metadata_json = json; dbWrites++;
          return { meta: { changes: 1 } };
        } };
      } };
    },
  };
  const env = {
    DB: db,
    WEBSITE_ASSETS: {
      async get(key) {
        const text = objects.get(key);
        return text === undefined ? null : { text: async () => text };
      },
      async put(key, text) { objects.set(key, text); },
      async delete(key) { objects.delete(key); },
    },
  };
  const ownedSite = { id: siteId, slug: siteSlug, source: 'shared-d1', can_edit: true, can_publish: true };
  async function route(path, method = 'GET', body) {
    const request = new Request('https://example.test' + path + '?site=' + siteSlug, { method });
    const url = new URL(request.url);
    return handleCmsSourceRequest({ request, url, body, env, siteSlug, dbClient, ownedSite });
  }
  return { route, row, objects, ownedSite, get dbWrites() { return dbWrites; } };
}

test('enumerates only registered non-archived pages, then reads exact R2 source', async () => {
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

test('publishing a private draft atomically switches to immutable verified R2 and retains rollback', async () => {
  const h = harness();
  const edited = sourceHtml.replace('Existing', 'Edited');
  const draft = await (await h.route('/api/cms/source/pages/sam-docs/draft', 'PUT',
    { html: edited, expected_version: 0 })).json();
  assert.equal(draft.version, 1);
  const publish = await (await h.route('/api/cms/source/pages/sam-docs/publish', 'POST',
    { expected_version: 1, confirm: 'publish' })).json();
  assert.equal(publish.ok, true);
  assert.equal(publish.version, 2);
  assert.equal(publish.receipt.verified, true);
  assert.equal(publish.content_object_key, h.row.content_object_key);
  assert.match(publish.content_object_key, /^sites\/agentsam-sdk\/public\/_cms-publications\/page_sdk_sam_docs\//);
  assert.equal(h.objects.get(publish.content_object_key), edited);
  assert.equal(h.objects.get(sourceKey), sourceHtml, 'original public R2 HTML is never overwritten');
  assert.equal(h.objects.get(publish.receipt.previous_key), sourceHtml, 'immutable baseline exists');
  const current = await (await h.route('/api/cms/source/pages/sam-docs')).json();
  assert.equal(current.html, edited);
  assert.equal(current.page.version, 2);
  assert.equal(current.source, 'published');
  const rollback = await (await h.route('/api/cms/source/pages/sam-docs/rollback', 'POST',
    { expected_version: 2, confirm: 'rollback' })).json();
  assert.equal(rollback.ok, true);
  assert.equal(h.objects.get(h.row.content_object_key), sourceHtml);
  assert.equal(rollback.version, 3);
  assert.equal(h.objects.get(publish.content_object_key), edited, 'previous release is retained');
});
test('publishing fails closed on stale version, permission, missing confirmation and foreign draft', async () => {
  const h = harness();
  const edited = sourceHtml.replace('Existing', 'Edited');
  await h.route('/api/cms/source/pages/sam-docs/draft', 'PUT',
    { html: edited, expected_version: 0 });
  let reply = await h.route('/api/cms/source/pages/sam-docs/publish', 'POST',
    { expected_version: 0, confirm: 'publish' });
  assert.equal(reply.status, 409);
  reply = await h.route('/api/cms/source/pages/sam-docs/publish', 'POST',
    { expected_version: 1 });
  assert.equal(reply.status, 400);
  h.ownedSite.can_publish = false;
  reply = await h.route('/api/cms/source/pages/sam-docs/publish', 'POST',
    { expected_version: 1, confirm: 'publish' });
  assert.equal(reply.status, 403);
  h.ownedSite.can_publish = true;
  const metadata = JSON.parse(h.row.metadata_json);
  metadata.cms_source_draft_key = 'sites/other-site/cms/drafts/foreign.html';
  h.row.metadata_json = JSON.stringify(metadata);
  reply = await h.route('/api/cms/source/pages/sam-docs/publish', 'POST',
    { expected_version: 1, confirm: 'publish' });
  assert.equal(reply.status, 409);
  assert.equal(h.row.content_object_key, sourceKey);
});
