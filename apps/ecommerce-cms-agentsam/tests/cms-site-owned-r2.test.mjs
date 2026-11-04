import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {handleAdminCmsApi} from '../backend/cms/api.js';
import {getSiteOwnedPage} from '../backend/cms/site-owned-page-adapter.mjs';

function fixture(){
  // Minimal site-owned fixture: only the columns the adapter touches.
  const db=new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE cms_sites(id TEXT PRIMARY KEY,account_id TEXT NOT NULL,name TEXT,
      slug TEXT,primary_domain TEXT,status TEXT,is_default INTEGER);
    CREATE TABLE cms_pages(id TEXT PRIMARY KEY,site_id TEXT NOT NULL,slug TEXT,route_path TEXT,
      page_type TEXT,title TEXT,status TEXT,template_sku TEXT,nav_visible INTEGER,
      requires_auth INTEGER,sort_order INTEGER,seo_json TEXT,metadata_json TEXT,
      content_object_key TEXT,published_manifest_object_key TEXT,
      created_at INTEGER,updated_at INTEGER,published_at INTEGER);
    CREATE TABLE cms_page_sections(id TEXT PRIMARY KEY,page_id TEXT,section_key TEXT,
      section_type TEXT,section_name TEXT,section_data TEXT,sort_order INTEGER,
      is_visible INTEGER,r2_bucket TEXT,draft_r2_key TEXT,published_r2_key TEXT,
      content_hash TEXT,updated_at TEXT);
    CREATE TABLE cms_revisions(account_id TEXT,site_id TEXT,entity_type TEXT,
      entity_id TEXT,revision_number INTEGER,revision_kind TEXT,
      content_object_key TEXT,content_hash TEXT,snapshot_json TEXT,metadata_json TEXT);
    INSERT INTO cms_sites VALUES ('main','merchant','Site','site','example.com','active',1),
      ('foreign','other','Other','other','other.example','active',1);
    INSERT INTO cms_pages VALUES
      ('home','main','home','/','landing','Home','published',NULL,1,0,0,'{}','{}',
        NULL,NULL,1790000000,1790000000,1790000000),
      ('otherhome','foreign','home','/','landing','Other','published',NULL,1,0,0,'{}','{}',
        NULL,NULL,1790000000,1790000000,1790000000);
    INSERT INTO cms_page_sections VALUES
      ('hero','home','main-hero','hero','Hero','{}',0,1,'cms',
        'cms/sections/drafts/home/hero.json','cms/sections/publications/home/hero.json',
        'original','2026-10-01');
  `);
  const objects=new Map([
    ['cms/sections/drafts/home/hero.json',JSON.stringify({headline:'Existing R2 headline'})],
    ['cms/sections/publications/home/hero.json',JSON.stringify({headline:'Published headline'})],
  ]);
  const env={
    DB:{prepare(sql){
      let params=[];
      const statement={
        bind(...args){params=args;return statement;},
        async first(){return db.prepare(sql).get(...params)||null;},
        async all(){return {results:db.prepare(sql).all(...params)};},
        async run(){const result=db.prepare(sql).run(...params);return {meta:{changes:result.changes}};},
      };
      return statement;
    }},
    CMS_CONTENT:{
      async get(key){return objects.has(key)?{text:async()=>objects.get(key)}:null;},
      async put(key,value){objects.set(key,String(value));},
    },
  };
  return {db,env,objects};
}

test('existing published homepage reads authored R2 draft, saves a new private revision and preserves publication',async()=>{
  const {db,env,objects}=fixture();
  try{
    const original=await getSiteOwnedPage(env,'merchant','home','main','home');
    assert.equal(original.page.sections[0].content.headline,'Existing R2 headline');
    assert.equal(original.page.sections[0].version,0);
    const path='https://cms.test/api/admin/cms/pages/home/sections/main-hero?site_id=main&page_id=home';
    const saved=await handleAdminCmsApi(new Request(path,{
      method:'PUT',headers:{'content-type':'application/json'},
      body:JSON.stringify({content:{headline:'Edited private draft'},expected_version:0}),
    }),env,new URL(path),{accountId:'merchant'});
    const result=await saved.json();
    assert.equal(saved.status,200,JSON.stringify(result));
    assert.equal(result.ok,true);
    assert.equal(result.published,false);
    assert.equal(result.version,1);
    const row=db.prepare("SELECT draft_r2_key,published_r2_key FROM cms_page_sections WHERE id='hero'").get();
    assert.notEqual(row.draft_r2_key,'cms/sections/drafts/home/hero.json');
    assert.equal(row.published_r2_key,'cms/sections/publications/home/hero.json');
    assert.equal(JSON.parse(objects.get(row.draft_r2_key)).headline,'Edited private draft');
    assert.equal(JSON.parse(objects.get(row.published_r2_key)).headline,'Published headline');
    assert.equal(db.prepare("SELECT status FROM cms_pages WHERE id='home'").get().status,'published');
    const reopened=await getSiteOwnedPage(env,'merchant','home','main','home');
    assert.equal(reopened.page.sections[0].content.headline,'Edited private draft');
    assert.equal(reopened.page.sections[0].version,1);
    const stale=await handleAdminCmsApi(new Request(path,{
      method:'PUT',headers:{'content-type':'application/json'},
      body:JSON.stringify({content:{headline:'Old tab edit'},expected_version:0}),
    }),env,new URL(path),{accountId:'merchant'});
    assert.equal(stale.status,409);
    assert.equal((await getSiteOwnedPage(env,'merchant','home','main','home')).page.sections[0].content.headline,'Edited private draft');
    assert.equal(await getSiteOwnedPage(env,'other','home','main','home').catch(()=>null),null);
  }finally{db.close();}
});
