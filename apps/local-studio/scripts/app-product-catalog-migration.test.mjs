import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

const migration = readFileSync(new URL('../backend/migrations/1384_db_driven_apps_products.sql', import.meta.url), 'utf8');

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE accounts (id TEXT PRIMARY KEY);
    CREATE TABLE code_repositories (id TEXT PRIMARY KEY);
    CREATE TABLE agentsam_products (
      id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      kind TEXT NOT NULL, status TEXT NOT NULL, description TEXT,
      repository_id TEXT REFERENCES code_repositories(id) ON DELETE SET NULL,
      source_type TEXT, source_id TEXT, canonical_path TEXT, package_name TEXT, version TEXT,
      tags TEXT NOT NULL DEFAULT '[]', metadata TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT 1700000000, updated_at INTEGER NOT NULL DEFAULT 1700000000,
      display_name TEXT, catalog_visibility TEXT NOT NULL DEFAULT 'internal', sku TEXT
    );
    CREATE TABLE cms_sites (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
      name TEXT NOT NULL, product_id TEXT REFERENCES agentsam_products(id),
      primary_domain TEXT, worker_id TEXT, managed_by TEXT, slug TEXT,
      status TEXT DEFAULT 'draft', source_site_id TEXT, settings_json TEXT DEFAULT '{}',
      domain_aliases_json TEXT DEFAULT '[]', created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP, is_default INTEGER DEFAULT 0
    );
    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
      description TEXT, collection TEXT, price_cents INTEGER NOT NULL DEFAULT 0,
      image_url TEXT, status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      seo_title TEXT, seo_description TEXT, site_id TEXT REFERENCES cms_sites(id),
      product_kind TEXT NOT NULL DEFAULT 'physical'
        CHECK (product_kind IN ('physical','digital_download','app','plugin','app_embed','theme','service')),
      digital_ref TEXT, registry_id TEXT REFERENCES agentsam_products(id) ON DELETE SET NULL,
      CHECK ((product_kind = 'physical' AND digital_ref IS NULL)
        OR (product_kind <> 'physical' AND digital_ref IS NOT NULL AND length(trim(digital_ref)) > 0))
    );
    CREATE TABLE apps (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE, description TEXT, category TEXT,
      framework TEXT, repo_url TEXT, demo_url TEXT, preview_image_url TEXT, tags_json TEXT,
      status TEXT DEFAULT 'active', featured INTEGER DEFAULT 0, created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL, app_icon TEXT, icon_url TEXT, workspace_id TEXT,
      github_app_id TEXT, github_client_id TEXT, installation_id TEXT,
      account_id TEXT REFERENCES accounts(id), product_id TEXT REFERENCES agentsam_products(id),
      site_id TEXT REFERENCES cms_sites(id), icon_id TEXT, canonical_app_id TEXT REFERENCES apps(id),
      app_type TEXT, visibility TEXT DEFAULT 'private', launch_url TEXT, editor_url TEXT,
      install_url TEXT, download_url TEXT, capabilities_json TEXT DEFAULT '{}', config_json TEXT DEFAULT '{}'
    );
    CREATE INDEX idx_apps_product ON apps(product_id);
    CREATE INDEX idx_cms_sites_product ON cms_sites(product_id);
    CREATE TABLE agentsam_product_releases (
      id TEXT PRIMARY KEY, product_id TEXT, product_slug TEXT NOT NULL, version TEXT NOT NULL
    );
    CREATE TABLE cms_globals (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), site_id TEXT NOT NULL,
      global_key TEXT NOT NULL, global_type TEXT NOT NULL, status TEXT DEFAULT 'draft',
      inline_content_json TEXT DEFAULT '{}', content_object_key TEXT, content_version INTEGER DEFAULT 0,
      content_hash TEXT, product_id TEXT REFERENCES agentsam_products(id), package_version TEXT,
      metadata_json TEXT DEFAULT '{}'
    );
    CREATE TABLE cms_site_themes (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), site_id TEXT NOT NULL,
      name TEXT NOT NULL, source_kind TEXT NOT NULL,
      source_product_id TEXT REFERENCES agentsam_products(id) ON DELETE SET NULL,
      source_release_id TEXT REFERENCES agentsam_product_releases(id) ON DELETE SET NULL,
      source_ref TEXT, source_version TEXT, status TEXT DEFAULT 'installing', is_live INTEGER DEFAULT 0,
      storage_ref TEXT, draft_manifest_key TEXT, draft_revision INTEGER DEFAULT 0,
      published_manifest_key TEXT, published_revision INTEGER, preview_image_key TEXT,
      metadata_json TEXT DEFAULT '{}', created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP, published_at TEXT
    );
    CREATE TABLE worker_registry (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
      cloudflare_account_id TEXT NOT NULL, name TEXT NOT NULL UNIQUE,
      environment TEXT DEFAULT 'production', status TEXT DEFAULT 'active',
      product_id TEXT REFERENCES agentsam_products(id), git_repo TEXT,
      build_json TEXT DEFAULT '{}', routes_json TEXT DEFAULT '[]', bindings_json TEXT DEFAULT '{}',
      notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE asset_relationships (
      id TEXT PRIMARY KEY DEFAULT ('rel_' || lower(hex(randomblob(8)))),
      source_type TEXT NOT NULL, source_id TEXT NOT NULL,
      target_type TEXT NOT NULL, target_id TEXT NOT NULL,
      relationship_type TEXT NOT NULL, metadata TEXT DEFAULT '{}',
      created_at INTEGER DEFAULT (unixepoch()),
      UNIQUE(source_type,source_id,target_type,target_id,relationship_type)
    );

    CREATE TRIGGER agentsam_products_ai AFTER INSERT ON agentsam_products BEGIN
      INSERT OR IGNORE INTO asset_relationships
        (source_type,source_id,target_type,target_id,relationship_type,metadata)
      SELECT 'agentsam_product',new.id,'code_repository',new.repository_id,'defined_in',
        json_object('managed_by','agentsam_products','canonical_path',new.canonical_path,
          'package_name',new.package_name,'version',new.version)
      WHERE new.repository_id IS NOT NULL;
      INSERT OR IGNORE INTO asset_relationships
        (source_type,source_id,target_type,target_id,relationship_type,metadata)
      SELECT 'agentsam_product',new.id,new.source_type,new.source_id,'sourced_from',
        json_object('managed_by','agentsam_products')
      WHERE new.source_type IS NOT NULL AND new.source_id IS NOT NULL;
    END;

    INSERT INTO accounts VALUES ('acct_1');
    INSERT INTO code_repositories VALUES ('repo_1');
    INSERT INTO agentsam_products
      (id,slug,name,kind,status,description,repository_id,source_type,source_id,canonical_path,package_name,version,tags,metadata,display_name,catalog_visibility,sku)
    VALUES
      ('prod_app','sample-app','Sample App','app','wired','App description','repo_1','manifest','sample-app','apps/sample','@demo/sample-app','1.2.3','["app","demo"]','{"account_id":"acct_1","capability_states":[]}','Sample App','public','IA-APP-SAMPLE-APP'),
      ('prod_theme','sample-theme','Sample Theme','theme','production','Theme description','repo_1',NULL,NULL,'themes/sample','@demo/sample-theme','2.0.0','["theme"]','{}','Sample Theme','public','IA-THM-SAMPLE-THEME'),
      ('prod_service','sample-service','Sample Service','service','production','Service description','repo_1',NULL,NULL,'services/sample','@demo/sample-service','0.1.0','["service"]','{"account_id":"acct_1"}','Sample Service','internal','IA-SVC-SAMPLE-SERVICE');

    INSERT INTO cms_sites (id,account_id,name,product_id,slug) VALUES
      ('site_1','acct_1','Sample Site','prod_service','sample-site');

    INSERT INTO products
      (id,slug,title,description,price_cents,status,site_id,product_kind,digital_ref,registry_id)
    VALUES
      (7,'sample-app','Sample App Store Listing','Commerce description',1200,'active',NULL,'app','sample-app','prod_app'),
      (8,'sample-theme','Sample Theme Store Listing','Theme commerce description',500,'active',NULL,'theme','sample-theme',NULL);

    INSERT INTO apps (id,name,slug,created_at,updated_at,account_id,product_id,app_type,visibility)
    VALUES ('sample-app','Sample App','sample-app',1700000000,1700000000,'acct_1','prod_app','application','public');

    INSERT INTO agentsam_product_releases (id,product_id,product_slug,version)
    VALUES ('rel_theme','prod_theme','sample-theme','2.0.0');

    INSERT INTO cms_globals (id,account_id,site_id,global_key,global_type,product_id)
    VALUES ('global_1','acct_1','site_1','theme','theme-project','prod_theme');

    INSERT INTO cms_site_themes (id,account_id,site_id,name,source_kind,source_product_id,source_release_id)
    VALUES ('theme_1','acct_1','site_1','Sample Theme','catalog','prod_theme','rel_theme');

    INSERT INTO worker_registry (id,account_id,cloudflare_account_id,name,product_id)
    VALUES ('worker_1','acct_1','cf_1','sample-worker','prod_service');

    INSERT INTO asset_relationships (source_type,source_id,target_type,target_id,relationship_type,metadata)
    VALUES
      ('agentsam_product','prod_app','code_repository','repo_1','sourced_from','{}'),
      ('code_repository','repo_1','agentsam_product','prod_theme','includes','{}');
  `);
  return db;
}

test('1384 moves product identities into products and repoints all application relationships', () => {
  const db = fixture();
  try {
    db.exec(migration);

    const products = db.prepare('SELECT id,slug,catalog_kind,lifecycle_status,package_name,version,repository_id,account_id,tags_json,metadata_json,legacy_product_id FROM products ORDER BY id').all();
    assert.equal(products.length, 3);
    const appProduct = products.find(row => row.slug === 'sample-app');
    const themeProduct = products.find(row => row.slug === 'sample-theme');
    const serviceProduct = products.find(row => row.slug === 'sample-service');
    assert.equal(appProduct.id, 7);
    assert.equal(appProduct.catalog_kind, 'app');
    assert.equal(appProduct.lifecycle_status, 'wired');
    assert.equal(appProduct.package_name, '@demo/sample-app');
    assert.equal(appProduct.legacy_product_id, 'prod_app');
    assert.equal(appProduct.account_id, 'acct_1');
    assert.equal(appProduct.repository_id, 'repo_1');
    assert.deepEqual(JSON.parse(appProduct.tags_json), ['app','demo']);
    assert.equal(themeProduct.catalog_kind, 'theme');
    assert.equal(serviceProduct.catalog_kind, 'service');

    assert.equal(db.prepare('SELECT product_id FROM apps WHERE id=?').get('sample-app').product_id, 7);
    assert.equal(db.prepare('SELECT product_id FROM cms_sites WHERE id=?').get('site_1').product_id, serviceProduct.id);
    assert.equal(db.prepare('SELECT product_id FROM cms_globals WHERE id=?').get('global_1').product_id, themeProduct.id);
    assert.equal(db.prepare('SELECT source_product_id FROM cms_site_themes WHERE id=?').get('theme_1').source_product_id, themeProduct.id);
    assert.equal(db.prepare('SELECT product_id FROM worker_registry WHERE id=?').get('worker_1').product_id, serviceProduct.id);
    assert.equal(db.prepare('SELECT product_id FROM agentsam_product_releases WHERE id=?').get('rel_theme').product_id, String(themeProduct.id));
    assert.equal(db.prepare("SELECT source_id FROM asset_relationships WHERE source_type='product' AND relationship_type='sourced_from'").get().source_id, String(appProduct.id));
    assert.equal(db.prepare("SELECT target_id FROM asset_relationships WHERE target_type='product' AND relationship_type='includes'").get().target_id, String(themeProduct.id));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM asset_relationships WHERE source_type='agentsam_product' OR target_type='agentsam_product'").get().n, 0);
    assert.equal(db.prepare("SELECT json_extract(metadata,'$.managed_by') AS owner FROM asset_relationships WHERE source_type='product' AND source_id=? AND relationship_type='defined_in'").get(String(appProduct.id)).owner, 'products');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger' AND tbl_name='agentsam_products' AND name NOT LIKE 'agentsam_products_legacy_readonly_%'").get().n, 0);
    assert.throws(() => db.prepare("INSERT INTO agentsam_products (id,slug,name,kind,status) VALUES ('prod_blocked','blocked','Blocked','app','wired')").run(), /agentsam_products_legacy_read_only/);

    const columns = db.prepare('PRAGMA table_info(products)').all().map(row => row.name);
    assert.ok(!columns.includes('registry_id'));
    assert.ok(columns.includes('catalog_kind'));
    assert.ok(columns.includes('lifecycle_status'));
    assert.ok(!db.prepare('PRAGMA table_info(apps)').all().some(row => row.name === 'product_id_v2'));

    for (const table of ['apps','products','cms_sites','cms_globals','cms_site_themes','worker_registry']) {
      const foreignKeys = db.prepare(`PRAGMA foreign_key_list(${table})`).all();
      assert.ok(!foreignKeys.some(fk => fk.table === 'agentsam_products'), `${table} still references agentsam_products`);
    }
    const created = db.prepare(`
      INSERT INTO products (
        slug,title,product_kind,digital_ref,catalog_kind,lifecycle_status,status,
        repository_id,source_type,source_id,canonical_path,package_name,version,
        tags_json,metadata_json
      ) VALUES (
        'new-generated-service','New Generated Service','service','new-generated-service',
        'service','scaffolded','draft','repo_1','generated_asset','asset_new',
        'services/new-generated','@demo/new-generated-service','0.1.0','[]','{}'
      )
    `).run();
    const createdId = String(created.lastInsertRowid);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM asset_relationships WHERE source_type='product' AND source_id=? AND relationship_type='defined_in' AND json_extract(metadata,'$.managed_by')='products'").get(createdId).n, 1);
    assert.equal(db.prepare("SELECT target_id FROM asset_relationships WHERE source_type='product' AND source_id=? AND relationship_type='sourced_from'").get(createdId).target_id, 'asset_new');

    db.prepare("UPDATE products SET repository_id=NULL,source_id='asset_next',updated_at='stale' WHERE id=?").run(Number(createdId));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM asset_relationships WHERE source_type='product' AND source_id=? AND relationship_type='defined_in'").get(createdId).n, 0);
    assert.equal(db.prepare("SELECT target_id FROM asset_relationships WHERE source_type='product' AND source_id=? AND relationship_type='sourced_from'").get(createdId).target_id, 'asset_next');
    assert.notEqual(db.prepare('SELECT updated_at FROM products WHERE id=?').get(Number(createdId)).updated_at, 'stale');

    db.prepare('DELETE FROM products WHERE id=?').run(Number(createdId));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM asset_relationships WHERE (source_type='product' AND source_id=?) OR (target_type='product' AND target_id=?)").get(createdId,createdId).n, 0);

    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    db.close();
  }
});
