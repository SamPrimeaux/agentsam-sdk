import test from 'node:test';
import assert from 'node:assert/strict';
import { toCatalogItem, payloadSlug, isWorkCadCatalogRequest, handleWorkCadCatalogRequest } from './work-cad-catalog.js';

test('studio resource kinds resolve to the correct gallery surface', () => {
  const base = { id: 'a', app_id: 'shared', category: 'seating', title: 'Sofa', specs_json: '{"w":84}' };
  assert.equal(toCatalogItem({ ...base, resource_kind: 'cad_stock_object' }).tab, 'objects');
  assert.equal(toCatalogItem({ ...base, resource_kind: 'cad_project_template' }).tab, 'templates');
  assert.equal(toCatalogItem({ ...base, resource_kind: 'cad_terrain_preset', specs_json: '{"tab":"objects"}' }).tab, 'objects');
  assert.equal(toCatalogItem({ ...base, resource_kind: 'cad_terrain_preset', specs_json: '{"tab":"scenes"}' }).tab, 'scenes');
  assert.equal(toCatalogItem({ ...base, resource_kind: 'model_3d', specs_json: '{"tab":"objects"}' }).tab, 'objects');
  assert.equal(toCatalogItem({ ...base, resource_kind: 'scene_composition' }).tab, 'scenes');
  assert.equal(toCatalogItem({ ...base, resource_kind: 'moviemode_clip' }).tab, 'objects');
  assert.equal(toCatalogItem({ ...base, resource_kind: 'moviemode_clip', specs_json: '{"tab":"scenes"}' }).tab, 'scenes');
  assert.deepEqual(toCatalogItem({ ...base, resource_kind: 'x', compatible_apps_json: '["*","a"]' }).compatibleApps, ['*', 'a']);
});

test('catalog items expose only registered preview, payload and model routes', () => {
  assert.equal(payloadSlug('studio-templates/cad-creator/platform/modern_villa/v1/project.json'), 'modern_villa');
  const item = toCatalogItem({
    id: 'tpl_x', app_id: 'samsketch', resource_kind: 'source_part', category: 'p', title: 'T',
    payload_bucket_id: 'r2_cad', payload_r2_key: 'payload.json',
    preview_bucket_id: 'r2_cad', preview_r2_key: 'k.webp', specs_json: 'not json',
  });
  assert.equal(item.previewUrl, '/api/work/cad/catalog/tpl_x/preview');
  assert.equal(item.payloadUrl, '/api/work/cad/catalog/tpl_x/payload');
  assert.equal(item.assetUrl, null);
  assert.deepEqual(item.specs, {});

  const model = toCatalogItem({
    id: 'tpl_model', app_id: 'shared', resource_kind: 'model_3d', category: 'nature', title: 'Tree',
    payload_bucket_id: 'r2_cad', payload_r2_key: 'tree.glb', specs_json: '{}',
  });
  assert.equal(model.assetUrl, '/api/work/cad/catalog/tpl_model/asset');
  assert.equal(model.tab, 'scenes');
});

test('route matching includes the three registered content streams', () => {
  assert.ok(isWorkCadCatalogRequest('/api/work/cad/catalog'));
  assert.ok(isWorkCadCatalogRequest('/api/work/cad/catalog/tpl_cad_stock_desk/preview'));
  assert.ok(isWorkCadCatalogRequest('/api/work/cad/catalog/tpl_cad_starter/payload'));
  assert.ok(isWorkCadCatalogRequest('/api/work/cad/catalog/tpl_dreamhouse/asset'));
  assert.ok(!isWorkCadCatalogRequest('/api/work/cad/catalog/../x'));
});

test('list handler applies app compatibility and returns the v2 contract', async () => {
  let sql = '', binds = [];
  const env = {
    DB: {
      prepare: (query) => ({
        bind: (...values) => {
          sql = query; binds = values;
          return {
            all: async () => ({ results: [{
              id: 'i', app_id: 'cad-creator', resource_kind: 'cad_stock_object',
              category: 'office', title: 'Desk', specs_json: '{}',
              payload_bucket_id: null, payload_r2_key: null,
            }] }),
            first: async () => null,
          };
        },
      }),
    },
  };
  const response = await handleWorkCadCatalogRequest(new Request('https://x/api/work/cad/catalog'), env);
  const body = await response.json();
  assert.equal(body.items.length, 1);
  assert.equal(body.schema, 'agentsam.cad.quick-add-catalog.v2');
  assert.equal(body.items[0].tab, 'objects');
  assert.ok(!/app_id IN/.test(sql));
  assert.deepEqual(binds, []);

  await handleWorkCadCatalogRequest(new Request('https://x/api/work/cad/catalog?app=samsketch&kind=source_part'), env);
  assert.deepEqual(binds, ['source_part', 'samsketch', 'samsketch']);
  assert.equal((await handleWorkCadCatalogRequest(new Request('https://x/api/work/cad/catalog?app=a%20b'), env)).status, 400);
  assert.equal((await handleWorkCadCatalogRequest(new Request('https://x/api/work/cad/catalog', { method: 'POST' }), env)).status, 405);
});

test('payload and model endpoints stream only active studio_templates rows', async () => {
  const payload = JSON.stringify({ treeCount: 110 });
  const env = {
    DB: {
      prepare: () => ({
        bind: () => ({
          first: async () => ({
            resource_kind: 'cad_terrain_preset',
            payload_r2_key: 'studio-templates/cad-creator/nature/woodland/v1/terrain.json',
            preview_r2_key: 'studio-templates/cad-creator/nature/woodland/v1/preview.svg',
            payload_binding_name: 'CAD_PROJECT_ASSETS',
            preview_binding_name: 'CAD_PROJECT_ASSETS',
          }),
        }),
      }),
    },
    CAD_PROJECT_ASSETS: {
      get: async (key) => ({ body: key.endsWith('.json') ? payload : '<svg/>', httpMetadata: {} }),
    },
  };

  const response = await handleWorkCadCatalogRequest(
    new Request('https://x/api/work/cad/catalog/tpl_woodland/payload'), env,
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await response.json(), { treeCount: 110 });

  const preview = await handleWorkCadCatalogRequest(
    new Request('https://x/api/work/cad/catalog/tpl_woodland/preview'), env,
  );
  assert.equal(preview.headers.get('content-type'), 'image/svg+xml');

  const invalidAsset = await handleWorkCadCatalogRequest(
    new Request('https://x/api/work/cad/catalog/tpl_woodland/asset'), env,
  );
  assert.equal(invalidAsset.status, 404);
});
