import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { test } from 'node:test';

const html = readFileSync('apps/ecommerce-cms-agentsam/frontend/static/products.html', 'utf8');
const css = readFileSync('apps/ecommerce-cms-agentsam/frontend/static/css/product-edit.css', 'utf8');
const backend = readFileSync('apps/local-studio/backend/worker/studio-platform-products.js', 'utf8');

test('product catalog inline JavaScript parses and shares the existing commerce table', () => {
  const inline = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map(match => match[1]).filter(Boolean);
  assert.ok(inline.length > 0);
  for (const script of inline) assert.doesNotThrow(() => new Script(script));
  assert.match(html, /class="admin-table platform-product-table"/);
  assert.match(html, /class="product-card platform-product-editor"/);
  assert.match(html, /id="store-products-table"/);
  assert.doesNotMatch(html, /product-platform-row/);
});

test('digital products show image, search, type, and collection with accessible details', () => {
  for (const field of ['platform-product-search','platform-product-kind','platform-product-collection',
    'platform-products-body','platform-editor-preview','platform-editor-meta']) {
    assert.ok(html.includes('id="' + field + '"'), field);
  }
  assert.match(html, /aria-label', 'Edit ' \+ product\.name/);
  assert.match(html, /platformIcon\(product, 'platform-product-thumb'\)/);
  assert.match(html, /platformKindLabel\(product\.kind\)/);
  assert.match(html, /platform-product-status--/);
  assert.match(css, /--c-surface/);
  assert.match(css, /@media\(max-width:600px\)/);
});

test('platform product editor persists only presentation data; not package release metadata', () => {
  for (const field of ['name','description','collection','thumbnail_url']) {
    assert.ok(html.includes('form.elements['), 'form mapping');
    assert.ok(backend.includes(field));
  }
  assert.match(backend, /revision\(row\)/);
  assert.match(backend, /Product changed\. Reload before saving your changes/);
  assert.match(backend, /Only product details may be edited here/);
});
