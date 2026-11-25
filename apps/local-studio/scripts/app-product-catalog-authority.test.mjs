import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const activeRuntimeFiles = [
  'apps/local-studio/backend/worker/studio-platform-products.js',
  'apps/ecommerce-cms-agentsam/backend/agentsam/product-catalog.js',
  'apps/ecommerce-cms-agentsam/backend/cms/theme-draft-sites.mjs',
  'apps/ecommerce-cms-agentsam/shared/products/product-capabilities.ts',
  'apps/ecommerce-cms-agentsam/frontend/src/pages/products/MerchantProductCatalog.tsx',
  'apps/ecommerce-cms-agentsam/frontend/src/pages/products/ProductStudioPage.tsx',
  'src/go/official-registry.js',
  'src/go/receipts.js',
  'scripts/cad-registry.mjs',
];

test('active app/product runtime uses apps and products, not the legacy product registry', () => {
  for (const file of activeRuntimeFiles) {
    const source = readFileSync(new URL('../../../' + file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /agentsam_products|registry_id/, file);
  }
});

test('merchant product links use canonical IDs with a legacy-ID compatibility alias', () => {
  const source = readFileSync(new URL('../../../apps/ecommerce-cms-agentsam/frontend/src/pages/products/MerchantProductCatalog.tsx', import.meta.url), 'utf8');
  assert.match(source, /legacy_product_id/);
  assert.match(source, /String\(p\.id\)/);
  assert.doesNotMatch(source, /registry_id/);
});
