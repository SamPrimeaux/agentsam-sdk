import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { D1BrandRegistryAdapter } from '../src/adapters/d1-registry.js';

const ACCOUNT_A = 'au_aaaaaaaaaaaaaaaa';
const ACCOUNT_B = 'au_bbbbbbbbbbbbbbbb';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE brands (
      id TEXT PRIMARY KEY DEFAULT ('brand_' || lower(hex(randomblob(6)))),
      parent_brand_id TEXT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      display_name TEXT,
      tagline TEXT,
      description TEXT,
      mission TEXT,
      architecture_model TEXT NOT NULL DEFAULT 'monolithic',
      status TEXT NOT NULL DEFAULT 'active',
      priority INTEGER DEFAULT 5,
      tags TEXT,
      domain TEXT,
      alternate_domains TEXT,
      subdomain TEXT,
      meta_title TEXT,
      meta_description TEXT,
      meta_keywords TEXT,
      og_image_url TEXT,
      twitter_handle TEXT,
      canonical_base_url TEXT,
      theme_json TEXT DEFAULT '{}',
      settings_json TEXT DEFAULT '{}',
      timezone TEXT DEFAULT 'America/Chicago',
      service_tier TEXT DEFAULT 'family',
      is_public INTEGER DEFAULT 0,
      requires_oauth INTEGER DEFAULT 1,
      notes TEXT,
      usage_notes TEXT,
      project_id TEXT,
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(parent_brand_id) REFERENCES brands(id)
    );
    CREATE TABLE brand_asset (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      brand_slug TEXT NOT NULL,
      asset_key TEXT NOT NULL,
      version TEXT NOT NULL DEFAULT 'v1',
      category TEXT NOT NULL,
      title TEXT,
      alt_text TEXT,
      description TEXT,
      meta_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE brand_asset_variant (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL REFERENCES brand_asset(id) ON DELETE CASCADE,
      variant_key TEXT NOT NULL,
      file_format TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      file_size_bytes INTEGER,
      storage_provider TEXT NOT NULL,
      storage_location TEXT NOT NULL,
      delivery_url TEXT,
      custom_domain_url TEXT,
      cf_image_id TEXT,
      cf_variant_name TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  const db = {
    prepare(sql) {
      let params = [];
      return {
        bind(...values) { params = values; return this; },
        async all() { return { results: sqlite.prepare(sql).all(...params) }; },
        async first() { return sqlite.prepare(sql).get(...params) ?? null; },
        async run() {
          const result = sqlite.prepare(sql).run(...params);
          return { meta: { changes: Number(result.changes) } };
        },
      };
    },
  };
  sqlite.prepare(`INSERT INTO brands (id,name,slug,display_name,architecture_model,status,theme_json)
    VALUES ('brand_root','InnerAnimal','inneranimal','InnerAnimal','master_brand','active','{"color":{"ink":"#111111"}}')`).run();
  sqlite.prepare(`INSERT INTO brands (id,parent_brand_id,name,slug,architecture_model,status)
    VALUES ('brand_alpha','brand_root','Alpha','alpha','endorsed_brand','active')`).run();
  sqlite.prepare(`INSERT INTO brand_asset (id,account_id,brand_slug,asset_key,category,title,meta_json,created_at,updated_at)
    VALUES ('asset_a1',?,'alpha','logo-primary','logo','Primary logo','{"role":"logo.primary"}',1,1),
           ('asset_b1',?,'alpha','logo-private','logo','Other account logo','{}',1,1),
           ('asset_a2',?,'orphan-brand','mark','mark','Unmatched mark','{}',1,1)`)
    .run(ACCOUNT_A, ACCOUNT_B, ACCOUNT_A);
  sqlite.prepare(`INSERT INTO brand_asset_variant
    (id,asset_id,variant_key,file_format,storage_provider,storage_location,delivery_url,is_primary,created_at,updated_at)
    VALUES ('variant_a1','asset_a1','public','png','cf_images','alpha/logo','https://cdn.example/logo.png',1,1,1),
           ('variant_b1','asset_b1','public','png','cf_images','alpha/private','https://cdn.example/private.png',1,1,1)`).run();
  return { sqlite, db };
}

test('registry reads shared brand identity but scopes assets and variants to the authenticated account', async () => {
  const { sqlite, db } = fixture();
  const registry = new D1BrandRegistryAdapter({ db, accountId: ACCOUNT_A });
  const brands = await registry.list();
  assert.equal(brands.length, 2);
  assert.equal(brands.find((brand) => brand.slug === 'alpha').assetCount, 1);
  assert.equal(brands.find((brand) => brand.slug === 'inneranimal').theme.color.ink, '#111111');

  const inventory = await registry.listAssets({ brandSlug: 'alpha' });
  assert.equal(inventory.total, 1);
  assert.equal(inventory.items[0].id, 'asset_a1');
  assert.equal(inventory.items[0].metadata.role, 'logo.primary');
  assert.equal(inventory.items[0].primaryVariant.deliveryUrl, 'https://cdn.example/logo.png');
  assert.equal(inventory.items[0].variants.length, 1);
  assert.deepEqual(await registry.listUnmatchedAssetSlugs(), [{
    brandSlug: 'orphan-brand',
    brand_slug: 'orphan-brand',
    assetCount: 1,
    asset_count: 1,
    status: 'unmatched_registry_slug',
  }]);
  sqlite.close();
});

test('registry creation and updates are guarded, preserve slugs, and respect hierarchy', async () => {
  const { sqlite, db } = fixture();
  const readOnly = new D1BrandRegistryAdapter({ db, accountId: ACCOUNT_A });
  await assert.rejects(() => readOnly.register({ name: 'New brand', slug: 'new-brand' }), /brand_registry_write_not_authorized/);

  const registry = new D1BrandRegistryAdapter({ db, accountId: ACCOUNT_A, allowWrites: true });
  const created = await registry.register({
    name: 'PrimeTech',
    slug: 'primetech',
    parentBrandId: 'brand_root',
    architectureModel: 'endorsed_brand',
    tagline: 'Creative production systems',
    tags: ['creative', 'production'],
  });
  assert.equal(created.brand.slug, 'primetech');
  assert.equal(created.brand.parent_brand_id, 'brand_root');
  assert.deepEqual(created.brand.tags, ['creative', 'production']);

  const renamed = await registry.update(created.brand.id, { name: 'PrimeTech Studio', tagline: 'A creative systems studio' });
  assert.equal(renamed.brand.name, 'PrimeTech Studio');
  assert.equal(renamed.brand.slug, 'primetech');
  await assert.rejects(() => registry.update('brand_root', { parentBrandId: created.brand.id }), /brand_hierarchy_cycle/);
  await registry.archive(created.brand.id);
  assert.equal((await registry.find({ id: created.brand.id })).status, 'archived');
  assert.equal((await registry.list()).some((brand) => brand.slug === 'primetech'), false);
  assert.equal((await registry.list({ includeArchived: true })).some((brand) => brand.slug === 'primetech'), true);
  sqlite.close();
});

test('registry supports the previous execute injection contract', async () => {
  const calls = [];
  const registry = new D1BrandRegistryAdapter({
    execute: async (input) => { calls.push(input); return input.op === 'find' ? { id: 'legacy' } : []; },
  });
  assert.deepEqual(await registry.list({ status: 'active' }), []);
  assert.deepEqual(await registry.find({ slug: 'legacy' }), { id: 'legacy' });
  assert.deepEqual(calls.map((call) => call.op), ['list', 'find']);
});
