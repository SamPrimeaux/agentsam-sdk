import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function source(path) {
  return readFileSync(new URL('../frontend/src/' + path, import.meta.url), 'utf8');
}

test('merchant cards use the owned products catalog and site-scoped product editor', () => {
  const merchant = source('pages/products/MerchantProductCatalog.tsx');
  assert.match(merchant, /\/api\/admin\/products\?scope=account/);
  assert.match(merchant, /\/api\/admin\/products\?site_id=/);
  assert.match(merchant, /\/admin\/product-edit\?/);
  assert.match(merchant, /openProduct\(p\.site_id, p\.id\)/);
  assert.match(merchant, /\/api\/admin\/cms\/sites/);
  assert.doesNotMatch(merchant, /\/api\/admin\/platform\/products/);
  assert.doesNotMatch(merchant, /scrollIntoView/);
});

test('merchant-owned product records do not enter the Completeful catalog detail canvas', () => {
  const product = source('pages/products/ProductStudioPage.tsx');
  assert.match(product, /productRecordId\s*=\s*productId\s*&&/);
  assert.match(product, /\^prod_\[A-Za-z0-9_-\]\+\$/);
  assert.match(product, /if \(productId \|\| isMerchantCategory\) return;/);
  assert.match(product, /productRecordId \? \(/);
  assert.match(product, /productId=\{productRecordId\}/);
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


test('Completeful product creation and publishing actions remain connected to the existing draft API', () => {
  const editor = readFileSync(new URL('../frontend/static/product-edit.html', import.meta.url), 'utf8');
  assert.match(editor, /\/api\/admin\/product-studio\/drafts\/" \+ encodeURIComponent\(supplierDraftId\) \+ "\/create-product/);
  assert.match(editor, /\/api\/admin\/product-studio\/drafts\/" \+ encodeURIComponent\(supplierDraftId\) \+ "\/publish/);
  assert.match(editor, /productAdminFetch\(/);
  assert.match(editor, /if \(publishSupplier\)/);
});

test('Product Studio preserves the selected site across the provider-to-merchant handoff', () => {
  const product = source('pages/products/ProductStudioPage.tsx');
  const workspace = source('pages/products/StudioWorkspace.tsx');
  const host = source('lib/studio-host-navigation.ts');
  const editor = readFileSync(new URL('../frontend/static/product-edit.html', import.meta.url), 'utf8');
  assert.match(product, /currentCommerceSiteId\(\)/);
  assert.match(product, /site_id=\$\{encodeURIComponent\(siteId\)\}/);
  assert.match(workspace, /siteId\?: string \| null/);
  assert.match(workspace, /productDetailsParams\.set\("site_id", siteId\)/);
  assert.match(host, /currentCommerceSiteId\(\)/);
  assert.match(editor, /editParams\.set\("site_id", productSiteId\)/);
  assert.match(editor, /storefrontProductUrl\(productStorefrontDomain, productSlug\)/);
  assert.doesNotMatch(editor, /viewBtn\.href = `\/products\/\$\{productSlug\}`/);
});
