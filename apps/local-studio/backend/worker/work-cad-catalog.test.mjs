import test from 'node:test';
import assert from 'node:assert/strict';
import { toCatalogItem, payloadSlug, isWorkCadCatalogRequest, handleWorkCadCatalogRequest } from './work-cad-catalog.js';

test('tab comes from specs.tab, else a structural rule, and no kind is dropped', () => {
  const base = { id: 'a', app_id: 'shared', category: 'seating', title: 'Sofa', specs_json: '{"w":84}' };
  assert.equal(toCatalogItem({ ...base, resource_kind: 'cad_stock_object' }).tab, 'objects');
  assert.equal(toCatalogItem({ ...base, resource_kind: 'cad_project_template' }).tab, 'templates');
  assert.equal(toCatalogItem({ ...base, resource_kind: 'scene_composition' }).tab, 'scenes');
  assert.equal(toCatalogItem({ ...base, resource_kind: 'bim_starter' }).tab, 'scenes');
  assert.equal(toCatalogItem({ ...base, resource_kind: 'moviemode_clip' }).tab, 'objects');
  assert.equal(toCatalogItem({ ...base, resource_kind: 'moviemode_clip', specs_json: '{"tab":"scenes"}' }).tab, 'scenes');
  assert.deepEqual(toCatalogItem({ ...base, resource_kind: 'x', compatible_apps_json: '["*","a"]' }).compatibleApps, ['*', 'a']);
});

test('payload slug and preview url come from the row', () => {
  assert.equal(payloadSlug('studio-templates/cad-creator/platform/modern_villa/v1/project.json'), 'modern_villa');
  const item = toCatalogItem({ id: 'tpl_x', app_id: 'samsketch', resource_kind: 'source_part', category: 'p', title: 'T', preview_bucket_id: 'r2_cad', preview_r2_key: 'k.webp', specs_json: 'not json' });
  assert.equal(item.previewUrl, '/api/work/cad/catalog/tpl_x/preview');
  assert.deepEqual(item.specs, {});
  const bim = toCatalogItem({ id: 'tpl_bim_example', app_id: 'shared', resource_kind: 'bim_starter', category: 'bim', title: 'Example', payload_bucket_id: 'r2_cad', payload_r2_key: 'library/bim-starters/example/manifest.json', specs_json: '{"tab":"scenes"}' });
  assert.equal(bim.ref, null);
  assert.equal(bim.payloadUrl, '/api/work/cad/catalog/tpl_bim_example/payload');
  const model = toCatalogItem({ id: 'model_x', app_id: 'cad-creator', resource_kind: 'model_3d', category: 'nature', title: 'Oak', payload_bucket_id: 'r2_cad', payload_r2_key: 'models/oak.glb', specs_json: '{}' });
  assert.equal(model.assetUrl, '/api/work/cad/catalog/model_x/asset');
});

test('route matching and list handler', async () => {
  assert.ok(isWorkCadCatalogRequest('/api/work/cad/catalog'));
  assert.ok(isWorkCadCatalogRequest('/api/work/cad/catalog/tpl_cad_stock_desk/preview'));
  assert.ok(isWorkCadCatalogRequest('/api/work/cad/catalog/tpl_bim_example/payload'));
  assert.ok(isWorkCadCatalogRequest('/api/work/cad/catalog/model_x/asset'));
  assert.ok(!isWorkCadCatalogRequest('/api/work/cad/catalog/../x'));
  let sql = '', binds = [];
  const env = { DB: { prepare: (q) => ({ bind: (...b) => { sql = q; binds = b; return ({ all: async () => ({ results: [{ id: 'i', app_id: 'cad-creator', resource_kind: 'cad_stock_object', category: 'office', title: 'Desk', specs_json: '{}' }] }) , first: async () => null }); } }) } };
  const res = await handleWorkCadCatalogRequest(new Request('https://x/api/work/cad/catalog'), env);
  const body = await res.json();
  assert.equal(body.schema, 'agentsam.cad.quick-add-catalog.v2');
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].tab, 'objects');
  assert.ok(!/app_id IN/.test(sql));
  assert.deepEqual(binds, []);
  await handleWorkCadCatalogRequest(new Request('https://x/api/work/cad/catalog?app=samsketch&kind=source_part'), env);
  assert.deepEqual(binds, ['source_part', 'samsketch', 'samsketch']);
  assert.equal((await handleWorkCadCatalogRequest(new Request('https://x/api/work/cad/catalog?app=a%20b'), env)).status, 400);
  assert.equal((await handleWorkCadCatalogRequest(new Request('https://x/api/work/cad/catalog', { method: 'POST' }), env)).status, 405);
});


test('BIM source manifest resolves through the registered R2 bucket and is never a hardcoded runtime preset', async () => {
  const manifest = '{"schema":"agentsam.cad.bim-starter.v1","id":"example"}';
  let queried = '', objectKey = '', record = 'library/bim-starters/example/manifest.json';
  const env = {
    DB: { prepare: (sql) => ({ bind: () => ({ first: async () => {
      queried = sql;
      return { resource_kind: 'bim_starter', payload_r2_key: record, payload_binding_name: 'CAD_PROJECT_ASSETS' };
    } }) }) },
    CAD_PROJECT_ASSETS: { get: async (key) => {
      objectKey = key;
      return key ? { body: new TextEncoder().encode(manifest), httpMetadata: {} } : null;
    } },
  };
  const url = 'https://x/api/work/cad/catalog/tpl_bim_example/payload';
  const res = await handleWorkCadCatalogRequest(new Request(url), env);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), manifest);
  assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(res.headers.get('cache-control'), /private/);
  assert.match(queried, /payload_bucket_id/);
  assert.equal(objectKey, record);
  record = null;
  const missing = await handleWorkCadCatalogRequest(new Request(url), env);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error, 'payload_not_found');
});


test('3D asset endpoint streams only model_3d payloads with the correct GLB media type', async () => {
  let requestedKey = '';
  const env = {
    DB: { prepare: () => ({ bind: () => ({ first: async () => ({
      resource_kind: 'model_3d', payload_r2_key: 'studio-templates/cad-creator/models/oak/v1/model.glb',
      payload_binding_name: 'CAD_PROJECT_ASSETS',
    }) }) }) },
    CAD_PROJECT_ASSETS: { get: async (key) => { requestedKey = key; return { body: new Uint8Array([1, 2, 3]), httpMetadata: {} }; } },
  };
  const response = await handleWorkCadCatalogRequest(new Request('https://x/api/work/cad/catalog/model_oak/asset'), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'model/gltf-binary');
  assert.equal(response.headers.get('content-disposition'), 'inline');
  assert.equal(requestedKey, 'studio-templates/cad-creator/models/oak/v1/model.glb');
  assert.deepEqual(Array.from(new Uint8Array(await response.arrayBuffer())), [1, 2, 3]);
});

test('asset endpoint rejects non-model catalog records', async () => {
  const env = { DB: { prepare: () => ({ bind: () => ({ first: async () => ({ resource_kind: 'cad_project_template', payload_r2_key: 'project.json', payload_binding_name: 'CAD_PROJECT_ASSETS' }) }) }) } };
  const response = await handleWorkCadCatalogRequest(new Request('https://x/api/work/cad/catalog/template_x/asset'), env);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, 'asset_not_available');
});
