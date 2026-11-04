import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createCmsDbClient } from './cms-db.js';

function d1(db) {
  return {
    prepare(sql) {
      let args = [];
      const stmt = {
        bind(...values) { args = values; return stmt; },
        async first() { return db.prepare(sql).get(...args) || null; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        async run() { return { meta: { changes: db.prepare(sql).run(...args).changes } }; },
      };
      return stmt;
    },
    async batch(statements) {
      db.exec('BEGIN;');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        db.exec('COMMIT;');
        return results;
      } catch (error) {
        db.exec('ROLLBACK;');
        throw error;
      }
    },
  };
}

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE accounts(id TEXT PRIMARY KEY);
    INSERT INTO accounts VALUES ('acct-a'),('acct-b');
    CREATE TABLE cms_sites(
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
      slug TEXT NOT NULL, name TEXT NOT NULL, primary_domain TEXT,
      worker_id TEXT, status TEXT NOT NULL
    );
    INSERT INTO cms_sites VALUES
      ('site-a','acct-a','alpha','Alpha',NULL,NULL,'active'),
      ('site-b','acct-b','beta','Beta',NULL,NULL,'active');
    CREATE TABLE cms_definitions(id TEXT PRIMARY KEY);
    CREATE TABLE cms_component_templates(
      sku TEXT PRIMARY KEY, is_system INTEGER NOT NULL DEFAULT 0, sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE cms_pages(
      id TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES cms_sites(id),
      slug TEXT NOT NULL, route_path TEXT NOT NULL,
      page_type TEXT NOT NULL DEFAULT 'page' CHECK (length(trim(page_type)) > 0),
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
      seo_json TEXT NOT NULL DEFAULT '{}', metadata_json TEXT NOT NULL DEFAULT '{}',
      definition_id TEXT REFERENCES cms_definitions(id),
      template_sku TEXT,
      requires_auth INTEGER NOT NULL DEFAULT 0, nav_visible INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      content_object_key TEXT, published_manifest_object_key TEXT, published_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(site_id,slug), UNIQUE(site_id,route_path)
    );
    INSERT INTO cms_pages(id,site_id,slug,route_path,page_type,title,status,created_at,updated_at)
      VALUES ('home-a','site-a','home','/','landing','Alpha Home','draft',1700000000,1700000000),
             ('home-b','site-b','home','/','landing','Beta Home','draft',1700000000,1700000000);
    CREATE TABLE cms_page_sections(
      id TEXT PRIMARY KEY, page_id TEXT NOT NULL REFERENCES cms_pages(id) ON DELETE CASCADE,
      section_type TEXT NOT NULL, section_name TEXT NOT NULL, section_data TEXT NOT NULL DEFAULT '{}',
      sort_order INTEGER DEFAULT 0, is_visible INTEGER DEFAULT 1,
      css_classes TEXT, custom_css TEXT, created_at TEXT DEFAULT(datetime('now')),
      updated_at TEXT DEFAULT(datetime('now')), liquid_section_id TEXT,
      created_at_unix INTEGER, draft_r2_key TEXT, published_r2_key TEXT,
      r2_bucket TEXT NOT NULL DEFAULT 'cms', content_hash TEXT, published_hash TEXT,
      schema_version INTEGER NOT NULL DEFAULT 1, definition_id TEXT, template_sku TEXT,
      section_key TEXT, metadata_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE cms_section_blocks(
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
      section_id TEXT NOT NULL REFERENCES cms_page_sections(id) ON DELETE CASCADE,
      parent_block_id TEXT REFERENCES cms_section_blocks(id) ON DELETE CASCADE,
      block_key TEXT NOT NULL, block_type TEXT NOT NULL, definition_id TEXT,
      template_sku TEXT, sort_order INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','hidden','archived')),
      content_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(content_json) AND json_type(content_json)='object'),
      settings_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(settings_json) AND json_type(settings_json)='object'),
      source_path TEXT, metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT(datetime('now')), updated_at TEXT NOT NULL DEFAULT(datetime('now')),
      UNIQUE(section_id,block_key)
    );
    INSERT INTO cms_page_sections(id,page_id,section_type,section_name,section_data,section_key)
      VALUES ('sec-a','home-a','hero','Hero','{"headline":"Alpha"}','hero'),
             ('sec-b','home-b','hero','Hero','{"headline":"Beta"}','hero');
  `);
  return db;
}

test('Local Studio CMS data access is site-scoped after the site-identity migration', async () => {
  const raw = fixture();
  const db = d1(raw);
  try {
    const siteA = { id:'site-a', account_id:'acct-a', slug:'alpha', name:'Alpha', status:'active' };
    const siteB = { id:'site-b', account_id:'acct-b', slug:'beta', name:'Beta', status:'active' };
    const a = createCmsDbClient(db, siteA);
    const b = createCmsDbClient(db, siteB);

    assert.deepEqual((await a.getPages()).map(p => p.id), ['home-a']);
    assert.equal(await a.getPageById('home-b'), null);
    assert.deepEqual((await a.getSectionsForPage('home-b')), []);
    assert.deepEqual((await a.getSectionsForPage('home-a')).map(s => s.id), ['sec-a']);

    const page = await a.createPage({
      title:'Journal', slug:'journal', routePath:'/journal', pageType:'blog',
    });
    assert.equal(page.site_id,'site-a');
    assert.equal(page.status,'draft');
    assert.equal(page.sort_order,10);
    assert.equal((await b.getPageById(page.id)),null);
    await assert.rejects(a.createPage({
      title:'Duplicate', slug:'journal', routePath:'/another', pageType:'custom',
    }), /already_exists/);
    await assert.rejects(a.createPage({
      title:'Duplicate route', slug:'journal-two', routePath:'/journal', pageType:'custom',
    }), /already_exists/);

    await assert.rejects(a.updatePage(page.id,{status:'published'}),/publish_workflow/);
    const updated = await a.updatePage(page.id, {
      title:'Stories', slug:'stories', route_path:'/stories',
      seo_title:'Stories | Alpha', meta_description:'Community stories',
      canonical_url:'https://alpha.example/stories',
    });
    assert.equal(updated.title,'Stories');
    assert.equal(updated.route_path,'/stories');
    const seo = JSON.parse(updated.seo_json);
    assert.equal(seo.title,'Stories | Alpha');
    assert.equal(seo.description,'Community stories');
    assert.equal(seo.canonical,'https://alpha.example/stories');
    await assert.rejects(a.updatePage('home-b',{title:'Cross-site edit'}),/not found/);

    await assert.rejects(a.createSection({
      pageId:'home-b', sectionType:'hero', sectionName:'Wrong site',
    }),/does not belong to site/);
    const section = await a.createSection({
      pageId:page.id, sectionType:'rich_text', sectionName:'Introduction',
      sectionData:{body:'A first story'}, sortOrder:0,
    });
    assert.equal(section.page_id,page.id);
    await assert.rejects(a.updateSection('sec-b',{section_name:'Wrong site'}),/not found/);
    await assert.rejects(a.setSectionVisibility('sec-b',false),/not found/);

    await assert.rejects(a.createBlock({
      sectionId:'sec-b', componentType:'text', componentData:{text:'wrong'},
    }),/does not belong to site/);
    const block = await a.createBlock({
      sectionId:section.id, componentType:'text', blockKey:'intro',
      componentData:{text:'Welcome'}, sortOrder:0,
    });
    assert.equal(block.account_id,'acct-a');
    assert.equal(block.component_type,'text');
    assert.deepEqual(JSON.parse(block.component_data),{text:'Welcome'});
    await a.setBlockVisibility(block.id,false);
    assert.equal((await a.getBlockById(block.id)).status,'hidden');
    assert.equal(await b.getBlockById(block.id), null);

    await a.publishPage(page.id,'acct-a');
    assert.equal((await a.getPageById(page.id)).status,'published');
    await a.deletePage(page.id);
    assert.equal(await a.getPageById(page.id),null);
    assert.equal(raw.prepare('SELECT COUNT(*) n FROM cms_page_sections WHERE page_id=?').get(page.id).n,0);
    assert.deepEqual(await a.getPages().then(rows => rows.map(p=>p.id)),['home-a']);
  } finally {
    raw.close();
  }
});


test('new page writes fail clearly until the legacy identity migration is applied', async () => {
  const raw = fixture();
  try {
    raw.exec("ALTER TABLE cms_pages ADD COLUMN project_id TEXT; ALTER TABLE cms_pages ADD COLUMN project_slug TEXT;");
    const client = createCmsDbClient(d1(raw), {
      id:'site-a', account_id:'acct-a', slug:'alpha', name:'Alpha', status:'active',
    });
    await assert.rejects(client.createPage({
      title:'New page', slug:'new-page', routePath:'/new-page',
    }), /cms_pages_site_identity_migration_required/);
    assert.equal(raw.prepare("SELECT COUNT(*) n FROM cms_pages WHERE site_id='site-a'").get().n,1);
  } finally { raw.close(); }
});


test('Local Studio refuses the separate account-plus-legacy-page schema', async () => {
  const raw = fixture();
  try {
    raw.exec("ALTER TABLE cms_pages ADD COLUMN account_id TEXT; ALTER TABLE cms_pages ADD COLUMN legacy_page_id TEXT;");
    const client = createCmsDbClient(d1(raw), {
      id:'site-a', account_id:'acct-a', slug:'alpha', name:'Alpha', status:'active',
    });
    await assert.rejects(client.createPage({
      title:'New page', slug:'new-page', routePath:'/new-page',
    }), /cms_pages_site_identity_migration_required/);
  } finally { raw.close(); }
});
