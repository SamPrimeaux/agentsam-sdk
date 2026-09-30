import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTheme,
  createProductRow,
  createIasfStarterPackSeed,
  products,
  resolveStorefrontCssPath,
  readStorefrontCss,
} from '../src/index.js';

test('iasf is an installable stock theme', () => {
  const theme = createTheme();
  assert.equal(theme.slug, 'iasf');
  assert.equal(theme.installable, true);
  assert.equal(theme.stock, true);
  assert.equal(theme.package, '@inneranimalmedia/theme-iasf');
  assert.equal(theme.lineage, 'iasf');
  assert.ok(theme.pages.includes('Shop'));
});

test('iasf product row marks promoted stock', () => {
  const row = createProductRow({ accountId: 'acct_demo' });
  assert.equal(row.slug, 'iasf');
  assert.equal(row.metadata.normalization_state, 'promoted_stock');
  assert.equal(row.metadata.stock, true);
});

test('iasf starter seed has multipage commerce routes', () => {
  const seed = createIasfStarterPackSeed();
  assert.equal(seed.id, 'iasf');
  assert.equal(seed.provenance.kind, 'builtin_starter');
  assert.ok(seed.pages.some((p) => p.slug === '/'));
  assert.ok(seed.pages.some((p) => p.slug === '/shop'));
  assert.ok(seed.pages.some((p) => p.slug === '/journal'));
  assert.ok(seed.pages.some((p) => p.slug === '/story'));
  assert.equal(products.length, 4);
  assert.ok(seed.theme.cssVars['--ia-acid']);
});

test('storefront css ships with the package', () => {
  const css = readStorefrontCss();
  assert.ok(css.includes('.ia-site'));
  assert.ok(resolveStorefrontCssPath().endsWith('storefront.css'));
});
