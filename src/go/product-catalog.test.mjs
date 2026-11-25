import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGoProductRegistrySql } from './official-registry.js';
import { buildProductRow } from './receipts.js';

test('Go service product projections use the canonical products row contract', () => {
  const row = buildProductRow({
    product: 'agentsam-go-worker',
    repositoryId: 'github:samprimeaux/agentsam-sdk',
    commit: 'abc123',
    packageName: '@inneranimalmedia/agentsam-go-worker',
    packageVersion: '0.1.0',
    health: 'healthy',
    url: 'https://runtime.inneranimalmedia.com',
  });
  assert.equal(row.slug, 'agentsam-go-worker');
  assert.equal(row.title, 'agentsam-go-worker');
  assert.equal(row.product_kind, 'service');
  assert.equal(row.digital_ref, 'agentsam-go-worker');
  assert.equal(row.catalog_kind, 'service');
  assert.equal(row.lifecycle_status, 'production');
  assert.equal(row.status, 'draft');
  assert.equal(row.catalog_visibility, 'internal');
  assert.equal(row.sku, 'IA-SVC-AGENTSAM-GO-WORKER');
  assert.equal(row.repository_id, 'github:samprimeaux/agentsam-sdk');
  assert.deepEqual(row.tags_json, ['go','cloudflare','runtime']);
  assert.equal(row.metadata_json.deployment.health, 'healthy');
  assert.ok(!('kind' in row));
  assert.ok(!('name' in row));
  assert.ok(!('metadata' in row));
});

test('Go official registry SQL upserts products and product asset relationships', () => {
  const sql = buildGoProductRegistrySql({
    product: 'agentsam-go-worker',
    status: 'production',
    repositoryId: 'github:samprimeaux/agentsam-sdk',
    url: 'https://runtime.inneranimalmedia.com',
    health: 'healthy',
    commit: 'abc123',
  });
  assert.match(sql, /INSERT INTO products/);
  assert.match(sql, /catalog_kind/);
  assert.match(sql, /lifecycle_status/);
  assert.match(sql, /metadata_json/);
  assert.match(sql, /display_name, sku/);
  assert.match(sql, /IA-SVC-AGENTSAM-GO-WORKER/);
  assert.match(sql, /INSERT INTO asset_relationships/);
  assert.match(sql, /SELECT 'product', CAST\(p\.id AS TEXT\)/);
  assert.match(sql, /FROM products p WHERE p\.slug/);
  assert.doesNotMatch(sql, /agentsam_products/);
});
