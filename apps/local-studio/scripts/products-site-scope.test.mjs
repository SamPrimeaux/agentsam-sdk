import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../ecommerce-cms-agentsam/frontend/static/products.html', import.meta.url), 'utf8');

test('the canonical merchant Products screen preserves the selected site across reads and edits', () => {
  assert.match(source, /(?:let|const)\s+catalogSiteId\s*=\s*new URLSearchParams\(location\.search\)\.get\('site_id'\)/);
  assert.match(source, /function catalogFetch\(path,\s*options\)/);
  assert.match(source, /if\s*\(catalogSiteId\)url\.searchParams\.set\('site_id',\s*catalogSiteId\)/);
  assert.match(source, /function catalogLink\(path,\s*productSiteId=null\)/);
  assert.match(source, /catalogFetch\(catalogSiteId \? '\/api\/admin\/products' : '\/api\/admin\/products\?scope=account'\)/);
  assert.match(source, /catalogLink\('\/admin\/product-edit\?id='\+encodeURIComponent\(p\.id\),p\.site_id\)/);
});

test('merchant products are not silently replaced by platform packages or an obsolete collection form', () => {
  assert.match(source, /const rawProductView = new URLSearchParams\(location\.search\)\.get\('view'\)\s*\|\|\s*'store'/);
  assert.match(source, /rawProductView === 'platform' \? 'platform' : 'store'/);
  assert.match(source, /new URL\('\/admin\/collections',\s*location\.origin\)/);
  assert.match(source, /if\s*\(siteId\) destination\.searchParams\.set\('site_id',\s*siteId\)/);
  assert.match(source, /catalogFetch\('\/api\/admin\/platform\/products'\)/);
});
