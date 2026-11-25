import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { handleStudioPlatformProducts } from '../backend/worker/studio-platform-products.js';

function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`
    CREATE TABLE code_repositories (id TEXT PRIMARY KEY, account_id TEXT, is_active INTEGER);
    CREATE TABLE cms_sites (id TEXT PRIMARY KEY, account_id TEXT);
    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT,
      collection TEXT,
      price_cents INTEGER NOT NULL DEFAULT 0,
      image_url TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      site_id TEXT,
      product_kind TEXT NOT NULL DEFAULT 'physical',
      digital_ref TEXT,
      catalog_kind TEXT,
      lifecycle_status TEXT,
      display_name TEXT,
      catalog_visibility TEXT DEFAULT 'internal',
      sku TEXT,
      package_name TEXT,
      version TEXT,
      canonical_path TEXT,
      repository_id TEXT,
      source_type TEXT,
      source_id TEXT,
      account_id TEXT,
      tags_json TEXT DEFAULT '[]',
      metadata_json TEXT DEFAULT '{}'
    );
    INSERT INTO code_repositories VALUES ('repo_a','account_a',1),('repo_b','account_b',1);
    INSERT INTO cms_sites VALUES ('site_a','account_a'),('site_b','account_b');
    INSERT INTO products
      (id,slug,title,product_kind,digital_ref,catalog_kind,lifecycle_status,repository_id,package_name,version,metadata_json)
    VALUES
      (1,'one','One','app','one','app','production','repo_a','@demo/one','1.0.0','{"origin":"developer","preserved":true}'),
      (2,'two','Two','app','two','app','production','repo_b','@demo/two','1.0.0','{"account_id":"account_b"}'),
      (3,'three','Three','service','three','service','prototype',NULL,NULL,NULL,'{"account_id":"account_a"}'),
      (4,'four','Four','theme','four','theme','production',NULL,'@demo/four','2.0.0','{}'),
      (5,'five','Five','physical',NULL,NULL,NULL,NULL,NULL,NULL,'{}');
    UPDATE products SET site_id='site_a' WHERE id=4;
    UPDATE products SET account_id='account_a' WHERE id=3;
    UPDATE products SET site_id='site_b' WHERE id=5;
  `);
  const DB = {
    prepare(query) {
      const statement = sql.prepare(query);
      let args = [];
      const wrapped = {
        bind(...values) { args = values; return wrapped; },
        async all() { return { results: statement.all(...args) }; },
        async first() { return statement.get(...args) || null; },
        async run() { return { meta: { changes: Number(statement.run(...args).changes) } }; },
      };
      return wrapped;
    },
  };
  return { DB, sql };
}

const base = 'https://studio.example/api/admin/platform/products';
const patch = (id, body, extra = {}) => new Request(base + '/' + id, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json', ...extra },
  body: JSON.stringify(body),
});

test('platform product list reads the products table and scopes by account, repository, or owned site', async () => {
  const env = database();
  const response = await handleStudioPlatformProducts(new Request(base), env, 'account_a');
  const { products } = await response.json();
  assert.deepEqual(products.map(product => product.id), [4,1,3]);
  assert.equal(products.find(product => product.id === 1).kind, 'app');
  assert.equal(products.find(product => product.id === 1).package_name, '@demo/one');
  assert.equal((await handleStudioPlatformProducts(new Request(base), env, null)).status, 401);
  env.sql.close();
});

test('details save updates the canonical product row and preserves technical/release identity', async () => {
  const env = database();
  const { products } = await (await handleStudioPlatformProducts(new Request(base), env, 'account_a')).json();
  const product = products.find(item => item.id === 1);
  const body = {
    revision: product.revision,
    name: 'Renamed',
    description: 'Description',
    collection: 'Apps',
    thumbnail_url: '/brand/one.svg',
  };
  const response = await handleStudioPlatformProducts(patch(1, body), env, 'account_a');
  assert.equal(response.status, 200);
  const row = env.sql.prepare('SELECT * FROM products WHERE id=?').get(1);
  assert.equal(row.title, 'Renamed');
  assert.equal(row.description, 'Description');
  assert.equal(row.collection, 'Apps');
  assert.equal(row.image_url, '/brand/one.svg');
  assert.equal(row.catalog_kind, 'app');
  assert.equal(row.lifecycle_status, 'production');
  assert.equal(row.package_name, '@demo/one');
  assert.equal(row.version, '1.0.0');
  assert.equal(row.metadata_json, '{"origin":"developer","preserved":true}');
  const stale = await handleStudioPlatformProducts(patch(1, body), env, 'account_a');
  assert.equal(stale.status, 409);
  env.sql.close();
});

test('product edit rejects foreign products, cross-origin writes, and unsupported fields', async () => {
  const env = database();
  assert.equal((await handleStudioPlatformProducts(patch(2, {}), env, 'account_a')).status, 404);
  assert.equal((await handleStudioPlatformProducts(patch(1, {}, { origin: 'https://evil.example' }), env, 'account_a')).status, 403);
  const unsupported = await handleStudioPlatformProducts(patch(1, { revision: 'x', lifecycle_status: 'deprecated' }), env, 'account_a');
  assert.equal(unsupported.status, 409);
  env.sql.close();
});
