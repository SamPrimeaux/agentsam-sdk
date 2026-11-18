import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createSiteOwnedPage, getSiteOwnedPage, updateSiteOwnedPage } from '../backend/cms/site-owned-page-adapter.mjs';

function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE cms_sites(id TEXT PRIMARY KEY,account_id TEXT NOT NULL,name TEXT NOT NULL,slug TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',is_default INTEGER DEFAULT 1,primary_domain TEXT);
    CREATE TABLE cms_pages(id TEXT PRIMARY KEY,site_id TEXT NOT NULL,slug TEXT NOT NULL,route_path TEXT NOT NULL,
      page_type TEXT NOT NULL,title TEXT NOT NULL,status TEXT NOT NULL,template_sku TEXT,nav_visible INTEGER,
      requires_auth INTEGER,sort_order INTEGER,seo_json TEXT NOT NULL DEFAULT '{}',metadata_json TEXT NOT NULL DEFAULT '{}',
      content_object_key TEXT,published_manifest_object_key TEXT,created_at INTEGER,updated_at INTEGER,published_at INTEGER,
      UNIQUE(site_id,slug),UNIQUE(site_id,route_path));
    CREATE TABLE cms_page_sections(id TEXT, page_id TEXT,section_key TEXT,section_type TEXT,section_name TEXT,
      section_data TEXT,sort_order INTEGER,is_visible INTEGER,r2_bucket TEXT,draft_r2_key TEXT,published_r2_key TEXT,updated_at INTEGER);
    CREATE TABLE cms_revisions(account_id TEXT,site_id TEXT,entity_type TEXT,entity_id TEXT,revision_number INTEGER);
    INSERT INTO cms_sites(id,account_id,name,slug) VALUES ('site_one','account_one','Test store','test-store');
  `);
  const DB = {prepare(sql) {
    const statement=db.prepare(sql);
    return {bind(...params) {
      return {
        async first() {return statement.get(...params)||null},
        async all() {return {results:statement.all(...params)}},
        async run() {const result=statement.run(...params);return {meta:{changes:result.changes}}},
      };
    }};
  }};
  return {db,env:{DB}};
}

test('Add Page inserts a tenant-owned canonical draft, then can be reopened using its stable page ID',async()=>{
  const {db,env}=d1();
  try{
    const created=await createSiteOwnedPage(env,'account_one','site_one',{
      title:'Frequently asked questions',slug:'frequently-asked-questions',route_path:'/pages/frequently-asked-questions',page_type:'standard',
    });
    assert.equal(created.ok,true);
    assert.equal(created.page.status,'draft');
    assert.equal(created.page.route_path,'/pages/frequently-asked-questions');
    assert.match(created.page.id,/^cmsp_/);
    const reopened=await getSiteOwnedPage(env,'account_one','frequently-asked-questions','site_one',created.page.id);
    assert.equal(reopened.page.id,created.page.id);
    assert.equal(reopened.page.slug,'frequently-asked-questions');
    const duplicate=await createSiteOwnedPage(env,'account_one','site_one',{
      title:'FAQ duplicate',slug:'frequently-asked-questions',route_path:'/pages/frequently-asked-questions',page_type:'standard',
    });
    assert.equal(duplicate.status,409);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cms_pages').get().n,1);
  }finally{db.close()}
});

test('a page can be renamed in its original URL family without changing its ID or site',async()=>{
  const {db,env}=d1();
  try{
    const {page}=await createSiteOwnedPage(env,'account_one','site_one',{
      title:'One page',slug:'first',route_path:'/pages/first',page_type:'standard',
    });
    const changed=await updateSiteOwnedPage(env,'account_one','first','site_one',page.id,{
      title:'One page',slug:'second',route_path:'/pages/second',
    });
    assert.equal(changed.ok,true);
    assert.equal(changed.page.id,page.id);
    assert.equal(changed.page.route_path,'/pages/second');
    assert.equal(db.prepare('SELECT slug FROM cms_pages WHERE id=?').get(page.id).slug,'second');
  }finally{db.close()}
});

test('Add Page cannot write into another account\'s store',async()=>{
  const {db,env}=d1();
  try {
    await assert.rejects(createSiteOwnedPage(env,'other_account','site_one',{
      title:'Not authorized',slug:'nope',route_path:'/pages/nope',page_type:'standard',
    }),/cms_site_not_found/);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cms_pages').get().n,0);
  } finally {db.close()}
});
