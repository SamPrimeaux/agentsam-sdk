import {DatabaseSync} from "node:sqlite";

export function createSiteOwnedFixture(){
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
    CREATE TABLE cms_section_blocks(account_id TEXT,section_id TEXT,block_key TEXT,
      block_type TEXT,status TEXT,content_json TEXT,metadata_json TEXT);
    CREATE TABLE cms_revisions(account_id TEXT,site_id TEXT,entity_type TEXT,
      entity_id TEXT,revision_number INTEGER NOT NULL,revision_kind TEXT,
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
  // The live inneranimalmedia-business tables have these identity and
  // versioned renderer-reference columns. Site/page owns tenancy; sections
  // themselves intentionally have NO account_id.
  db.exec(`
    ALTER TABLE cms_page_sections ADD COLUMN definition_id TEXT;
    ALTER TABLE cms_page_sections ADD COLUMN template_sku TEXT;
    ALTER TABLE cms_page_sections ADD COLUMN css_classes TEXT;
    ALTER TABLE cms_page_sections ADD COLUMN custom_css TEXT;
    ALTER TABLE cms_page_sections ADD COLUMN liquid_section_id TEXT;
    ALTER TABLE cms_page_sections ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE cms_section_blocks ADD COLUMN source_path TEXT;
    ALTER TABLE cms_page_sections ADD COLUMN published_hash TEXT;
    ALTER TABLE cms_page_sections ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json));
    ALTER TABLE cms_section_blocks ADD COLUMN id TEXT;
    ALTER TABLE cms_section_blocks ADD COLUMN parent_block_id TEXT;
    ALTER TABLE cms_section_blocks ADD COLUMN updated_at TEXT;
    ALTER TABLE cms_section_blocks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE cms_section_blocks ADD COLUMN definition_id TEXT;
    ALTER TABLE cms_section_blocks ADD COLUMN template_sku TEXT;
    ALTER TABLE cms_section_blocks ADD COLUMN settings_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(settings_json));
  `);
  const objects=new Map([
    ['cms/sections/drafts/home/hero.json',JSON.stringify({headline:'Existing R2 headline'})],
    ['cms/sections/publications/home/hero.json',JSON.stringify({headline:'Published headline'})],
  ]);
  const env={
    DB:{async batch(statements) {
      db.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }, prepare(sql){
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
