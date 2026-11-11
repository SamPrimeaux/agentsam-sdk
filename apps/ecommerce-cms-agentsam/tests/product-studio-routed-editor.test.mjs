import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function source(path) {
  return readFileSync(new URL('../frontend/src/' + path, import.meta.url), 'utf8');
}

test('application cards navigate to a real registered editor URL instead of scrolling to the bottom', () => {
  const platform = source('pages/products/PlatformProductCatalog.tsx');
  assert.match(platform, /navigateHostedStudioRoute\("\/admin" \+ route\)/);
  assert.match(platform, /\/products\/create\/.*encodeURIComponent\(p\.id\)/);
  assert.match(platform, /id="studio-product-editor"/);
  assert.doesNotMatch(platform, /scrollIntoView/);
  assert.match(platform, /"PATCH"/);
  assert.match(platform, /revision: selected\.revision/);
});

test('registered AgentSam products do not enter Completeful catalog detail or design canvas', () => {
  const product = source('pages/products/ProductStudioPage.tsx');
  assert.match(product, /registeredProductId\s*=\s*productId\s*&&\s*\/\^prod_/);
  assert.match(product, /if \(!productId \|\| registeredProductId\) return;/);
  assert.match(product, /registeredProductId \? \(/);
  assert.match(product, /productId=\{registeredProductId\}/);
  assert.match(product, /: designing && detail \? \(/);
});

test('collection picker preserves its real product authority and offers a first-product path', () => {
  const picker = source('pages/collections/CollectionProductPicker.tsx');
  const form = source('pages/collections/CollectionEditor.tsx');
  const api = source('pages/collections/api.ts');
  assert.match(picker, /products\.length \? "No products match this view" : "Your store has no products yet"/);
  assert.match(picker, /onCreateProduct/);
  assert.match(form, /navigateHostedStudioRoute\(destination\)/);
  assert.match(form, /if \(dirty && !form\.title\.trim\(\)\)/);
  assert.match(api, /\/api\/admin\/products/);
  assert.doesNotMatch(api, /\/api\/admin\/platform\/products/);
});

test('hosted deep links retain validated collection context without permitting arbitrary query keys', () => {
  const host = source('lib/studio-host-navigation.ts');
  assert.match(host, /"collection_id"/);
  assert.match(host, /\^\[A-Za-z0-9_-\]\{1,128\}\$/);
  assert.match(host, /onlySearchKeys/);
});
