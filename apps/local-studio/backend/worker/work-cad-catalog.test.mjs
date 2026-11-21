import test from 'node:test';
import assert from 'node:assert/strict';
import { toCatalogItem, payloadSlug, isWorkCadCatalogRequest, handleWorkCadCatalogRequest } from './work-cad-catalog.js';

test('resource_kind decides the tab and unknown kinds are dropped', () => {
  const base = { id: 'a', app_id: 'cad-creator', category: 'seating', title: 'Sofa', specs_json: '{"w":84}' };
  assert.equal(toCatalogItem({ ...base, resource_kind: 'cad_stock_object' }).tab, 'objects');
  assert.equal(toCatalogItem({ ...base, resource_kind: 'cad_project_template' }).tab, 'scenes');
  assert.equal(toCatalogItem({ ...base, resource_kind: 'moviemode_clip' }), null);
});

test('payload slug and preview url come from the row', () => {
  assert.equal(payloadSlug('studio-templates/cad-creator/platform/modern_villa/v1/project.json'), 'modern_villa');
  const item = toCatalogItem({ id: 'tpl_x', app_id: 'samsketch', resource_kind: 'source_part', category: 'p', title: 'T', preview_bucket_id: 'r2_cad', preview_r2_key: 'k.webp', specs_json: 'not json' });
  assert.equal(item.previewUrl, '/api/work/cad/catalog/tpl_x/preview');
  assert.deepEqual(item.specs, {});
});

test('route matching and list handler', async () => {
  assert.ok(isWorkCadCatalogRequest('/api/work/cad/catalog'));
  assert.ok(isWorkCadCatalogRequest('/api/work/cad/catalog/tpl_cad_stock_desk/preview'));
  assert.ok(!isWorkCadCatalogRequest('/api/work/cad/catalog/../x'));
  const env = { DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: [{ id: 'i', app_id: 'cad-creator', resource_kind: 'cad_stock_object', category: 'office', title: 'Desk', specs_json: '{}' }] }) }) }) } };
  const res = await handleWorkCadCatalogRequest(new Request('https://x/api/work/cad/catalog'), env);
  const body = await res.json();
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].tab, 'objects');
  assert.equal((await handleWorkCadCatalogRequest(new Request('https://x/api/work/cad/catalog', { method: 'POST' }), env)).status, 405);
});
