import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { recordCreatedProduct } from '../backend/agentsam/product-catalog.js';

function dbFixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE code_repositories (
      id TEXT PRIMARY KEY, provider TEXT NOT NULL, repo_full_name TEXT NOT NULL,
      account_id TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT,
      product_kind TEXT NOT NULL,
      digital_ref TEXT,
      catalog_kind TEXT,
      lifecycle_status TEXT,
      repository_id TEXT,
      source_type TEXT,
      source_id TEXT,
      canonical_path TEXT,
      package_name TEXT,
      version TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      tags_json TEXT NOT NULL DEFAULT '[]',
      account_id TEXT,
      catalog_visibility TEXT NOT NULL DEFAULT 'internal',
      status TEXT NOT NULL DEFAULT 'draft',
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO code_repositories VALUES
      ('repo_a','github','samprimeaux/agentsam-sdk','acct_a',1),
      ('repo_b','github','other/agentsam-sdk','acct_b',1);
  `);
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let args = [];
      const wrapped = {
        bind(...values) { args = values; return wrapped; },
        async first() { return statement.get(...args) || null; },
        async all() { return { results: statement.all(...args) }; },
        async run() { return { meta: { changes: Number(statement.run(...args).changes) } }; },
      };
      return wrapped;
    },
  };
  return { db, sqlite };
}

const product = {
  slug: 'sam-sketch-addon',
  name: 'SamSketch Add-on',
  description: 'Reusable CAD capability',
  kind: 'app',
  status: 'wired',
  source_type: 'generated_asset',
  source_id: 'asset_123',
  canonical_path: 'packages/samsketch-addon',
  package_name: '@inneranimalmedia/samsketch-addon',
  version: '0.1.0',
  tags: ['samsketch','cad'],
  metadata: { capability_states: [{ key: 'design.edit', state: 'wired' }] },
  repository: { provider: 'github', fullName: 'samprimeaux/agentsam-sdk' },
};

test('created product assets are persisted to products with technical and commerce states separated', async () => {
  const { db, sqlite } = dbFixture();
  try {
    const saved = await recordCreatedProduct(db, product, { origin: 'developer', accountId: 'acct_a' });
    const row = sqlite.prepare('SELECT * FROM products WHERE id=?').get(saved.id);
    assert.equal(row.slug, product.slug);
    assert.equal(row.title, product.name);
    assert.equal(row.product_kind, 'app');
    assert.equal(row.digital_ref, product.slug);
    assert.equal(row.catalog_kind, 'app');
    assert.equal(row.lifecycle_status, 'wired');
    assert.equal(row.status, 'draft');
    assert.equal(row.account_id, 'acct_a');
    assert.equal(row.repository_id, 'repo_a');
    assert.deepEqual(JSON.parse(row.tags_json), product.tags);
    assert.equal(JSON.parse(row.metadata_json).origin, 'developer');
    assert.equal(JSON.parse(row.metadata_json).account_id, 'acct_a');
    assert.equal(saved.updated, false);
  } finally { sqlite.close(); }
});

test('repeat creation updates the same account-owned product instead of duplicating it', async () => {
  const { db, sqlite } = dbFixture();
  try {
    const first = await recordCreatedProduct(db, product, { origin: 'developer', accountId: 'acct_a' });
    const second = await recordCreatedProduct(db, { ...product, version: '0.2.0' }, { origin: 'developer', accountId: 'acct_a' });
    assert.equal(first.id, second.id);
    assert.equal(second.updated, true);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM products').get().n, 1);
    assert.equal(sqlite.prepare('SELECT version FROM products WHERE id=?').get(first.id).version, '0.2.0');
  } finally { sqlite.close(); }
});

test('rejects cross-account updates, unsupported provenance and missing source identity', async () => {
  const { db, sqlite } = dbFixture();
  try {
    await recordCreatedProduct(db, product, { origin: 'developer', accountId: 'acct_a' });
    await assert.rejects(
      recordCreatedProduct(db, { ...product, repository: null }, { origin: 'developer', accountId: 'acct_b' }),
      /another account/,
    );
    await assert.rejects(
      recordCreatedProduct(db, product, { origin: 'provider', accountId: 'acct_a' }),
      /provenance/,
    );
    await assert.rejects(
      recordCreatedProduct(db, { ...product, source_type: 'Completeful' }, { origin: 'developer', accountId: 'acct_a' }),
      /source/,
    );
  } finally { sqlite.close(); }
});
