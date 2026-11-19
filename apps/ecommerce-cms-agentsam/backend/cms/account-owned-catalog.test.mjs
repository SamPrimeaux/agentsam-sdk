import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { listAccountProducts } from '../admin/api.js';
import { handleCollectionApi, listAccountCmsCollections } from './collection-store.mjs';
import { listCmsSites } from './site-context.mjs';
import { withLocalStudioCmsContext } from '@inneranimalmedia/agentsam-cms/account-context';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE cms_sites (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL, name TEXT NOT NULL,
      slug TEXT, primary_domain TEXT, status TEXT, is_default INTEGER,
      created_at TEXT, domain_aliases_json TEXT
    );
    CREATE TABLE products (
      id INTEGER PRIMARY KEY, site_id TEXT NOT NULL, slug TEXT, title TEXT,
      updated_at TEXT, price_cents INTEGER, status TEXT
    );
    CREATE TABLE product_variants (
      id INTEGER PRIMARY KEY, product_id INTEGER, inventory_qty INTEGER
    );
    CREATE TABLE cms_collections (
      id TEXT PRIMARY KEY, site_id TEXT, account_id TEXT, name TEXT,
      slug TEXT, status TEXT, visibility TEXT, sort_order INTEGER,
      metadata_json TEXT, tags_json TEXT, allowed_item_types_json TEXT
    );
    CREATE TABLE cms_collection_items (
      id TEXT PRIMARY KEY, collection_id TEXT, site_id TEXT, account_id TEXT,
      item_type TEXT, item_ref TEXT, status TEXT
    );
    INSERT INTO cms_sites(id,account_id,name,slug,status,is_default) VALUES
      ('site_a1','account_a','Alpha Store','alpha','active',0),
      ('site_a2','account_a','Beta Store','beta','active',0),
      ('site_b1','account_b','Unrelated Store','other','active',1);
    INSERT INTO products(id,site_id,title,slug,price_cents,status,updated_at) VALUES
      (11,'site_a1','Alpha Product','alpha-product',1200,'active','2026-11-19'),
      (12,'site_a2','Beta Product','beta-product',1500,'draft','2026-11-18'),
      (99,'site_b1','Foreign Product','foreign-product',9000,'active','2026-11-19');
    INSERT INTO product_variants(id,product_id,inventory_qty) VALUES
      (1,11,4),(2,11,5),(3,12,2),(4,99,1);
    INSERT INTO cms_collections(id,site_id,account_id,name,slug,status,visibility,sort_order) VALUES
      ('coll_a1','site_a1','account_a','Alpha Collection','alpha','active','public',0),
      ('coll_a2','site_a2','account_a','Beta Collection','beta','draft','private',0),
      ('coll_b1','site_b1','account_b','Foreign Collection','foreign','active','public',0);
    INSERT INTO cms_collection_items(id,collection_id,site_id,account_id,item_type,item_ref,status) VALUES
      ('item_a1','coll_a1','site_a1','account_a','product','11','active'),
      ('item_a2','coll_a2','site_a2','account_a','product','12','active'),
      ('item_b1','coll_b1','site_b1','account_b','product','99','active');
  `);
  // Match the D1 prepare().bind().all()/first() API without an external database.
  const DB = {
    prepare(query) {
      const statement = sqlite.prepare(query);
      return {
        bind(...args) {
          return {
            all: async () => ({ results: statement.all(...args) }),
            first: async () => statement.get(...args) ?? null,
            run: async () => ({ meta: { changes: statement.run(...args).changes } }),
          };
        },
      };
    },
  };
  return { sqlite, DB };
}

test('account products span owned stores but never another account', async () => {
  const { sqlite, DB } = fixture();
  try {
    const res = await listAccountProducts(new Request('https://test.invalid/api/admin/products?scope=account'), { DB }, 'account_a');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.scope, 'account');
    assert.equal(body.site_id, null);
    assert.deepEqual(body.products.map(p => p.id).sort(), [11, 12]);
    assert.deepEqual(new Set(body.products.map(p => p.site_name)), new Set(['Alpha Store', 'Beta Store']));
    assert.equal(body.products.find(p => p.id === 11).variant_count, 2);
    assert.equal(body.products.find(p => p.id === 11).total_inventory, 9);
    assert.equal(body.products.find(p => p.id === 11).collection_names, 'Alpha Collection');

    const other = await listAccountProducts(new Request('https://test.invalid/api/admin/products'), { DB }, 'account_b');
    assert.deepEqual((await other.json()).products.map(p => p.id), [99]);
    assert.equal((await listAccountProducts(new Request('https://test.invalid'), { DB }, null)).status, 403);
  } finally {
    sqlite.close();
  }
});

test('account collection inventory includes verified store names and per-store counts', async () => {
  const { sqlite, DB } = fixture();
  try {
    const rows = await listAccountCmsCollections({ DB }, 'account_a');
    assert.deepEqual(rows.map(row => row.id).sort(), ['coll_a1', 'coll_a2']);
    assert.deepEqual(new Set(rows.map(row => row.site_name)), new Set(['Alpha Store', 'Beta Store']));
    assert.equal(rows.find(row => row.id === 'coll_a1').product_count, 1);
    const foreign = await listAccountCmsCollections({ DB }, 'account_b');
    assert.deepEqual(foreign.map(row => row.id), ['coll_b1']);
  } finally {
    sqlite.close();
  }
});

test('hosted account inventory lists every owned site without assuming an active editor site', async () => {
  const { sqlite, DB } = fixture();
  try {
    await withLocalStudioCmsContext('account_a', null, async () => {
      const sites = await listCmsSites(DB, 'account_a');
      assert.deepEqual(sites.map(site => site.id).sort(), ['site_a1', 'site_a2']);
      await assert.rejects(() => listCmsSites(DB, 'account_b'), /cms_site_context_account_mismatch/);
    });
  } finally {
    sqlite.close();
  }
});

test('account-level collection GET never requires site context; writes still do', async () => {
  const { sqlite, DB } = fixture();
  try {
    const url = new URL('https://test.invalid/api/admin/collections?scope=account');
    const res = await handleCollectionApi(new Request(url), { DB }, url, { accountId: 'account_a' });
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).collections.map(c => c.id).sort(), ['coll_a1', 'coll_a2']);
    const post = await handleCollectionApi(new Request(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Should Not Create' }),
    }), { DB }, url, { accountId: 'account_a' });
    assert.notEqual(post.status, 201);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM cms_collections').get().n, 3);
    const requestedForeign = new URL('https://test.invalid/api/admin/collections/coll_b1?site_id=site_b1');
    const forbidden = await handleCollectionApi(new Request(requestedForeign), { DB }, requestedForeign, { accountId: 'account_a' });
    assert.notEqual(forbidden.status, 200);
    assert.equal((await forbidden.json()).ok, false);
  } finally {
    sqlite.close();
  }
});
