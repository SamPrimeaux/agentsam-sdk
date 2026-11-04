import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const migration = readFileSync(resolve(
  import.meta.dirname, '../migrations/1350_cms_pages_site_identity.sql'
), 'utf8');

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE accounts(id TEXT PRIMARY KEY);
    INSERT INTO accounts VALUES ('acct-a'),('acct-b');
    PRAGMA foreign_keys=OFF;
    CREATE TABLE account_identities(
      id INTEGER PRIMARY KEY, account_id TEXT REFERENCES accounts(id)
    );
    INSERT INTO account_identities VALUES (14,'legacy-missing-a'),(15,'legacy-missing-b');
    PRAGMA foreign_keys=ON;
    CREATE TABLE cms_sites(
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
      slug TEXT NOT NULL, status TEXT NOT NULL
    );
    INSERT INTO cms_sites VALUES
      ('site-a','acct-a','alpha','active'),
      ('site-b','acct-b','beta','active');
    CREATE TABLE cms_definitions(id TEXT PRIMARY KEY);
    CREATE TABLE cms_component_templates(
      id TEXT PRIMARY KEY, sku TEXT UNIQUE
    );
    CREATE TABLE cms_liquid_imports(
      id TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES cms_sites(id)
    );
    CREATE TABLE cms_pages(
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, project_slug TEXT NOT NULL,
      workspace_id TEXT, worker_id TEXT, person_uuid TEXT,
      slug TEXT NOT NULL, path TEXT NOT NULL, route_path TEXT NOT NULL,
      page_type TEXT NOT NULL CHECK(page_type IN (
        'home','about','services','work','case_study','contact','pricing',
        'privacy','terms','faq','product','collection','blog','post',
        'landing','portal','dashboard','auth','sitemap','custom'
      )),
      title TEXT NOT NULL, meta_description TEXT, description TEXT,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK(status IN ('draft','published','archived','scheduled')),
      seo_title TEXT, canonical_url TEXT, robots TEXT DEFAULT 'index,follow',
      og_image_asset_id TEXT, r2_bucket TEXT, r2_key TEXT, r2_url TEXT,
      content_type TEXT DEFAULT 'text/html', content_size_bytes INTEGER DEFAULT 0,
      config_json TEXT DEFAULT '{}', seo_json TEXT DEFAULT '{}',
      analytics_json TEXT DEFAULT '{}', metadata_json TEXT DEFAULT '{}',
      is_homepage INTEGER DEFAULT 0, is_system_page INTEGER DEFAULT 0,
      requires_auth INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0, created_by TEXT, updated_by TEXT,
      published_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      published_at INTEGER, archived_at INTEGER, nav_visible INTEGER NOT NULL DEFAULT 1,
      published_manifest_r2_key TEXT,
      definition_id TEXT REFERENCES cms_definitions(id),
      template_sku TEXT REFERENCES cms_component_templates(sku),
      site_id TEXT NOT NULL REFERENCES cms_sites(id),
      UNIQUE(project_id,slug), UNIQUE(project_id,route_path)
    );
    CREATE TABLE cms_liquid_sections(
      id TEXT PRIMARY KEY, import_id TEXT NOT NULL REFERENCES cms_liquid_imports(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL, section_key TEXT NOT NULL, section_type TEXT,
      liquid_source TEXT, schema_json TEXT DEFAULT '{}', settings_map_json TEXT DEFAULT '{}',
      render_deps TEXT DEFAULT '[]',
      mapped_template_id TEXT REFERENCES cms_component_templates(id) ON DELETE SET NULL,
      mapped_section_id TEXT REFERENCES cms_page_sections(id) ON DELETE SET NULL,
      parse_status TEXT NOT NULL DEFAULT 'pending'
        CHECK(parse_status IN ('pending','parsed','mapped','registered','failed')),
      parse_error TEXT, created_at INTEGER DEFAULT (unixepoch()),
      site_id TEXT NOT NULL REFERENCES cms_sites(id)
    );
    CREATE TABLE cms_page_sections(
      id TEXT PRIMARY KEY, page_id TEXT NOT NULL, section_type TEXT NOT NULL,
      section_name TEXT NOT NULL, section_data TEXT NOT NULL DEFAULT '{}',
      sort_order INTEGER DEFAULT 0, is_visible INTEGER DEFAULT 1,
      css_classes TEXT, custom_css TEXT, created_at TEXT DEFAULT(datetime('now')),
      updated_at TEXT DEFAULT(datetime('now')),
      liquid_section_id TEXT REFERENCES cms_liquid_sections(id) ON DELETE SET NULL,
      created_at_unix INTEGER, draft_r2_key TEXT, published_r2_key TEXT,
      r2_bucket TEXT NOT NULL DEFAULT 'cms', content_hash TEXT, published_hash TEXT,
      schema_version INTEGER NOT NULL DEFAULT 1,
      definition_id TEXT REFERENCES cms_definitions(id),
      template_sku TEXT REFERENCES cms_component_templates(sku),
      section_key TEXT, metadata_json TEXT NOT NULL DEFAULT '{}'
        CHECK(json_valid(metadata_json)),
      FOREIGN KEY(page_id) REFERENCES cms_pages(id) ON DELETE CASCADE
    );
    CREATE TABLE cms_section_blocks(
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
      section_id TEXT NOT NULL REFERENCES cms_page_sections(id) ON DELETE CASCADE,
      parent_block_id TEXT REFERENCES cms_section_blocks(id) ON DELETE CASCADE,
      block_key TEXT NOT NULL, block_type TEXT NOT NULL,
      definition_id TEXT REFERENCES cms_definitions(id),
      template_sku TEXT REFERENCES cms_component_templates(sku),
      sort_order INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','hidden','archived')),
      content_json TEXT NOT NULL DEFAULT '{}'
        CHECK(json_valid(content_json) AND json_type(content_json)='object'),
      settings_json TEXT NOT NULL DEFAULT '{}'
        CHECK(json_valid(settings_json) AND json_type(settings_json)='object'),
      source_path TEXT, metadata_json TEXT NOT NULL DEFAULT '{}'
        CHECK(json_valid(metadata_json)),
      created_at TEXT NOT NULL DEFAULT(datetime('now')),
      updated_at TEXT NOT NULL DEFAULT(datetime('now')),
      CHECK(parent_block_id IS NULL OR parent_block_id != id),
      UNIQUE(section_id,block_key)
    );
    CREATE TABLE cms_live_edit_sessions(
      id TEXT PRIMARY KEY DEFAULT(lower(hex(randomblob(16)))),
      page_id TEXT NOT NULL, user_id TEXT NOT NULL,
      session_token TEXT NOT NULL UNIQUE, is_active INTEGER DEFAULT 1,
      last_activity TEXT DEFAULT(datetime('now')),
      created_at TEXT DEFAULT(datetime('now')),
      FOREIGN KEY(page_id) REFERENCES cms_pages(id) ON DELETE CASCADE
    );
    CREATE INDEX cms_pages_site_system_order
      ON cms_pages(site_id,is_system_page,sort_order,slug);
    CREATE INDEX idx_cms_pages_site_id ON cms_pages(site_id);
    CREATE INDEX idx_cms_pages_definition ON cms_pages(definition_id);
    CREATE INDEX idx_cms_pages_template ON cms_pages(template_sku);
    CREATE UNIQUE INDEX cms_page_sections_page_section_key_unique
      ON cms_page_sections(page_id,section_key);
    CREATE INDEX idx_cms_page_sections_definition ON cms_page_sections(definition_id);
    CREATE INDEX idx_cms_page_sections_draft_r2_key ON cms_page_sections(draft_r2_key);
    CREATE INDEX idx_cms_page_sections_published_r2_key ON cms_page_sections(published_r2_key);
    CREATE INDEX idx_cms_page_sections_template ON cms_page_sections(template_sku);
    CREATE INDEX idx_cms_section_blocks_definition ON cms_section_blocks(definition_id);
    CREATE INDEX idx_cms_section_blocks_template ON cms_section_blocks(template_sku);
    CREATE INDEX idx_cms_section_blocks_tree
      ON cms_section_blocks(section_id,parent_block_id,sort_order,status);

    PRAGMA defer_foreign_keys=ON;
    BEGIN;
    INSERT INTO cms_pages(
      id,project_id,project_slug,workspace_id,worker_id,person_uuid,slug,path,route_path,
      page_type,title,status,r2_bucket,r2_key,r2_url,content_size_bytes,analytics_json,
      is_homepage,is_system_page,requires_auth,is_active,sort_order,created_at,updated_at,
      published_at,archived_at,nav_visible,published_manifest_r2_key,site_id
    ) VALUES
      ('p1','proj-one','alpha','ws-one','worker-a','person-a','home','/','/','home',
       'Alpha Home','published','bucket-a','sites/alpha/home.html','https://cdn/home',2048,
       '{"visits":7}',1,1,0,1,0,1700000000,1700000001,1700000002,NULL,1,
       'manifest/home.json','site-a'),
      ('p2','proj-two','alpha','ws-two','worker-b','person-b','about','pages/about.html','/about',
       'about','Alpha About','draft','bucket-a','sites/alpha/about.html',NULL,512,
       '{}',0,0,0,1,10,1700000000,1700000001,NULL,NULL,1,NULL,'site-a'),
      ('p3','proj-b','beta',NULL,NULL,NULL,'home','/','/','home','Beta Home','archived',
       NULL,NULL,NULL,0,'{}',1,0,0,1,0,1700000000,1700000001,NULL,1700000001,1,NULL,'site-b');
    INSERT INTO cms_liquid_imports(id,site_id) VALUES ('imp1','site-a');
    INSERT INTO cms_page_sections(
      id,page_id,section_type,section_name,section_data,sort_order,is_visible,
      liquid_section_id,draft_r2_key,published_r2_key,section_key,metadata_json
    ) VALUES
      ('sec1','p1','hero','Hero','{"headline":"Alpha"}',0,1,'liq1',
       'draft/hero.json','published/hero.json','hero','{"origin":"theme"}'),
      ('sec2','p2','rich_text','About','{"body":"About Alpha"}',1,1,NULL,
       NULL,NULL,'about','{}'),
      ('sec3','p3','hero','Hero','{"headline":"Beta"}',0,1,NULL,
       NULL,NULL,'hero','{}');
    INSERT INTO cms_liquid_sections(
      id,import_id,file_name,section_key,section_type,liquid_source,
      mapped_section_id,parse_status,site_id
    ) VALUES (
      'liq1','imp1','hero.liquid','hero','hero','<h1>{{ title }}</h1>',
      'sec1','mapped','site-a'
    );
    INSERT INTO cms_section_blocks(
      id,account_id,section_id,parent_block_id,block_key,block_type,
      sort_order,status,content_json,settings_json
    ) VALUES
      ('block-parent','acct-a','sec1',NULL,'container','container',0,'active','{}','{}'),
      ('block-child','acct-a','sec1','block-parent','headline','text',1,'active',
       '{"text":"Alpha"}','{"tone":"large"}');
    INSERT INTO cms_live_edit_sessions(
      id,page_id,user_id,session_token,is_active,last_activity,created_at
    ) VALUES ('live1','p1','user-a','session-token-a',1,'2026-11-03 12:00:00','2026-11-03 11:00:00');
    COMMIT;
  `);
  return db;
}

function runMigration(db) {
  db.exec('BEGIN;');
  try {
    db.exec(migration);
    db.exec('COMMIT;');
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}

test('D1-safe migration preserves page, section, Liquid, block-tree and live-edit data', () => {
  const db = fixture();
  try {
    runMigration(db);
    const columns = db.prepare('PRAGMA table_info(cms_pages)').all().map(row => row.name);
    for (const removed of [
      'project_id','project_slug','workspace_id','worker_id','person_uuid',
      'path','is_homepage','is_active','account_id','seo_title','meta_description',
      'description','canonical_url','robots','og_image_asset_id','r2_bucket','r2_key',
      'r2_url','content_type','content_size_bytes','config_json','analytics_json',
      'is_system_page','created_by','updated_by','published_by','archived_at',
      'published_manifest_r2_key',
    ]) assert.equal(columns.includes(removed), false, removed + ' must be removed');
    for (const retained of [
      'id','site_id','slug','route_path','page_type','title','status','seo_json',
      'metadata_json','definition_id','template_sku','requires_auth','nav_visible',
      'sort_order','content_object_key','published_manifest_object_key',
      'published_at','created_at','updated_at',
    ]) assert.equal(columns.includes(retained), true, retained + ' must remain');

    assert.equal(db.prepare('SELECT COUNT(*) n FROM cms_pages').get().n, 3);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM cms_mig_backup_cms_pages_20261103').get().n, 3);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM cms_page_sections').get().n, 3);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM cms_mig_backup_cms_page_sections_20261103').get().n, 3);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM cms_section_blocks').get().n, 2);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM cms_mig_backup_cms_section_blocks_20261103').get().n, 2);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM cms_liquid_sections').get().n, 1);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM cms_mig_backup_cms_liquid_sections_20261103').get().n, 1);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM cms_live_edit_sessions').get().n, 1);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM cms_mig_backup_cms_live_edit_sessions_20261103').get().n, 1);

    const home = db.prepare('SELECT * FROM cms_pages WHERE id=?').get('p1');
    assert.equal(home.content_object_key,'sites/alpha/home.html');
    assert.equal(home.published_manifest_object_key,'manifest/home.json');
    assert.equal(home.page_type,'landing');
    assert.equal(typeof JSON.parse(home.seo_json), 'object');
    const meta = JSON.parse(home.metadata_json);
    assert.ok(meta.migrated_from && 'project_id' in meta.migrated_from);
    assert.equal(JSON.stringify(meta).includes('legacy_'), false, 'no legacy_* keys survive');

    const section = db.prepare('SELECT * FROM cms_page_sections WHERE id=?').get('sec1');
    assert.equal(section.page_id,'p1');
    assert.equal(section.liquid_section_id,'liq1');
    assert.equal(section.draft_r2_key,'draft/hero.json');
    const liquid = db.prepare('SELECT * FROM cms_liquid_sections WHERE id=?').get('liq1');
    assert.equal(liquid.mapped_section_id,'sec1');
    assert.equal(liquid.liquid_source,'<h1>{{ title }}</h1>');

    const child = db.prepare('SELECT * FROM cms_section_blocks WHERE id=?').get('block-child');
    assert.equal(child.parent_block_id,'block-parent');
    assert.equal(child.section_id,'sec1');
    assert.equal(child.content_json,'{"text":"Alpha"}');
    assert.equal(db.prepare('SELECT page_id FROM cms_live_edit_sessions WHERE id=?').get('live1').page_id,'p1');

    for (const table of [
      'cms_pages','cms_page_sections','cms_liquid_sections',
      'cms_section_blocks','cms_live_edit_sessions',
    ]) {
      assert.deepEqual(db.prepare(`PRAGMA foreign_key_check(${table})`).all(), [], table);
    }
    assert.deepEqual(
      db.prepare('PRAGMA foreign_key_check').all().map(row => ({ ...row })),
      [
        { table:'account_identities', rowid:14, parent:'accounts', fkid:0 },
        { table:'account_identities', rowid:15, parent:'accounts', fkid:0 },
      ],
      'the migration must not create new violations or silently mutate unrelated identity data',
    );
    const legacyTables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%__legacy_20261103'"
    ).all();
    assert.equal(legacyTables.length,0);
  } finally { db.close(); }
});

test('site-level route uniqueness replaces project-level uniqueness', () => {
  const db = fixture();
  try {
    runMigration(db);
    db.prepare(`
      INSERT INTO cms_pages(id,site_id,slug,route_path,page_type,title,created_at,updated_at)
      VALUES('p4','site-b','about','/about','about','Beta About',1,1)
    `).run();
    assert.throws(() => db.prepare(`
      INSERT INTO cms_pages(id,site_id,slug,route_path,page_type,title,created_at,updated_at)
      VALUES('p5','site-a','about-two','/about','about','Duplicate route',1,1)
    `).run(), /UNIQUE/);
    assert.throws(() => db.prepare(`
      INSERT INTO cms_pages(id,site_id,slug,route_path,page_type,title,created_at,updated_at)
      VALUES('p6','site-a','about','/another','about','Duplicate slug',1,1)
    `).run(), /UNIQUE/);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM cms_pages WHERE site_id=? AND route_path=?')
      .get('site-b','/about').n,1);
  } finally { db.close(); }
});
