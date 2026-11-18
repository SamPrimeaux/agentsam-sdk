import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createSiteOwnedPage } from '../backend/cms/site-owned-page-adapter.mjs';
import { publishMerchantPage, previewMerchantPage, renderMerchantPage, sanitizeMerchantBody } from '../backend/cms/page-publication.mjs';

function setup() {
  const db=new DatabaseSync(':memory:');
  db.exec(`
   CREATE TABLE cms_sites(id TEXT PRIMARY KEY,account_id TEXT NOT NULL,name TEXT NOT NULL,slug TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active',is_default INTEGER DEFAULT 1,primary_domain TEXT,settings_json TEXT NOT NULL DEFAULT '{}');
   CREATE TABLE cms_pages(id TEXT PRIMARY KEY,site_id TEXT NOT NULL,slug TEXT NOT NULL,route_path TEXT NOT NULL,page_type TEXT NOT NULL,title TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft',template_sku TEXT,nav_visible INTEGER,requires_auth INTEGER,sort_order INTEGER,seo_json TEXT NOT NULL DEFAULT '{}',metadata_json TEXT NOT NULL DEFAULT '{}',content_object_key TEXT,published_manifest_object_key TEXT,created_at INTEGER,updated_at INTEGER,published_at INTEGER,UNIQUE(site_id,slug),UNIQUE(site_id,route_path));
   CREATE TABLE cms_page_sections(id TEXT,page_id TEXT,section_key TEXT,section_type TEXT,section_name TEXT,section_data TEXT,sort_order INTEGER,is_visible INTEGER,r2_bucket TEXT,draft_r2_key TEXT,published_r2_key TEXT,updated_at INTEGER);
   CREATE TABLE cms_revisions(account_id TEXT,site_id TEXT,entity_type TEXT,entity_id TEXT,revision_number INTEGER);
   CREATE TABLE cms_page_drafts(id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),page_id TEXT NOT NULL,user_id TEXT NOT NULL,draft_data TEXT NOT NULL,created_at TEXT DEFAULT (datetime('now')),updated_at TEXT DEFAULT (datetime('now')),UNIQUE(page_id,user_id));
   INSERT INTO cms_sites(id,account_id,name,slug,settings_json) VALUES('site_one','owner1','Custom Shop','custom-shop','{"store":{"brand":{"primary_color":"#23845c"}}}');
  `);
  const DB={prepare(sql){const stmt=db.prepare(sql);return {bind(...params){return {async first(){return stmt.get(...params)||null},async all(){return {results:stmt.all(...params)}},async run(){const result=stmt.run(...params);return {meta:{changes:result.changes}}}}}}}};
  const objects=new Map();
  const WEBSITE_ASSETS={async get(key){const value=objects.get(key);return value == null ? null : {async text(){return value}}},async put(key,value){objects.set(key,value)}};
  return {db,objects,env:{DB,WEBSITE_ASSETS}};
}
const draft=(extra={})=>({title:'Starter page',body_html:'<p>Hello <strong>world</strong></p>',visibility:'visible',url_handle:'starter',seo_title:'Starter SEO',seo_description:'Page details',template_sku:'',...extra});
async function create(env,body=draft()) {
  const created=await createSiteOwnedPage(env,'owner1','site_one',{title:body.title,slug:body.url_handle,route_path:'/pages/'+body.url_handle,page_type:'standard'});
  assert.equal(created.ok,true);
  await env.DB.prepare('INSERT INTO cms_page_drafts(page_id,user_id,draft_data) VALUES(?,?,?)').bind(created.page.id,'owner1',JSON.stringify(body)).run();
  return created.page;
}

test('create, preview, publish and serve a canonical page with one stable cms_pages id',async()=>{
 const {db,objects,env}=setup();try {
  const p=await create(env);
  const preview=await previewMerchantPage(env,'owner1','site_one','starter',p.id);
  assert.equal(preview.ok,true);
  assert.match(preview.html,/<h1>Starter page<\/h1>/);
  const out=await publishMerchantPage(env,'owner1','site_one','starter',p.id);
  assert.equal(out.ok,true,JSON.stringify(out));
  assert.equal(out.page_id,p.id);
  assert.equal(out.status,'published');
  assert.equal(out.route_path,'/pages/starter');
  assert.equal(objects.get(out.key),preview.html);
  const row=db.prepare('SELECT * FROM cms_pages WHERE id=?').get(p.id);
  assert.equal(row.id,p.id);assert.equal(row.site_id,'site_one');assert.equal(row.status,'published');
  assert.equal(row.content_object_key,out.key);
  assert.equal(JSON.parse(row.seo_json).title,'Starter SEO');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cms_pages').get().n,1);
 }finally{db.close()}
});

test('rich content renderer rejects executable HTML and dangerous URLs',()=>{
 const clean=sanitizeMerchantBody('<img src="javascript:alert(1)" onerror="evil()"><a href="javascript:alert(1)" onclick="evil()">link</a><script>alert(1)</script><svg onload="evil()"><circle/></svg><p>Hello <em>visitor</em></p>');
 assert.equal(clean,'link<p>Hello <em>visitor</em></p>');
 const html=renderMerchantPage({site:{name:'A <B>',settings_json:'{}'},page:{title:'ok'},draft:draft({title:'The <page>',body_html:'<p>Hello</p>'}),navigation:[{title:'About',route_path:'/pages/about',nav_visible:1}]});
 assert.ok(!html.includes('<page>'));assert.match(html,/The &lt;page&gt;/);
 assert.match(html,/Content-Security-Policy/);assert.match(html,/href="pages\/about"/);
});

test('publishing twice advances the pointer and preserves its previous source',async()=>{
 const {db,env}=setup();try {
  const p=await create(env);
  const first=await publishMerchantPage(env,'owner1','site_one','starter',p.id);
  assert.equal(first.ok,true);
  await env.DB.prepare('UPDATE cms_page_drafts SET draft_data=? WHERE page_id=? AND user_id=?').bind(JSON.stringify(draft({body_html:'<p>Updated</p>'})),p.id,'owner1').run();
  const second=await publishMerchantPage(env,'owner1','site_one','starter',p.id);
  assert.equal(second.ok,true,JSON.stringify(second));
  assert.notEqual(second.key,first.key);
  const updated=db.prepare('SELECT metadata_json FROM cms_pages WHERE id=?').get(p.id);
  const meta=JSON.parse(updated.metadata_json);
  assert.equal(meta.cms_page_publication_version,2);
  assert.equal(meta.cms_page_previous_key,first.key);
 }finally{db.close()}
});

test('hidden published pages remain addressable but are excluded from navigation and search',async()=>{
 const {db,objects,env}=setup();try {
  const p=await create(env,draft({visibility:'hidden'}));
  const res=await publishMerchantPage(env,'owner1','site_one','starter',p.id);
  assert.equal(res.ok,true);
  assert.match(objects.get(res.key),/noindex,nofollow/);
  assert.equal(db.prepare('SELECT nav_visible FROM cms_pages WHERE id=?').get(p.id).nav_visible,0);
 }finally{db.close()}
});

test('cross-site publishers and missing R2 cannot mutate published page pointers',async()=>{
 const {db,env}=setup();try {
  const p=await create(env);
  const denied=await publishMerchantPage(env,'someone_else','site_one','starter',p.id);
  assert.equal(denied.ok,false);
  const missing=await publishMerchantPage({DB:env.DB},'owner1','site_one','starter',p.id);
  assert.equal(missing.status,503);
  assert.equal(db.prepare('SELECT status FROM cms_pages WHERE id=?').get(p.id).status,'draft');
 }finally{db.close()}
});

test('draft changed during publication rejects the CAS and leaves the page unpublished',async()=>{
 const {db,objects,env}=setup();try {
  const p=await create(env);
  let mutated=false;
  const base=env.WEBSITE_ASSETS;
  env.WEBSITE_ASSETS={...base,async put(key,value){await base.put(key,value);if(!mutated){mutated=true;db.prepare('UPDATE cms_page_drafts SET draft_data=? WHERE page_id=?').run(JSON.stringify(draft({title:'changed in second tab'})),p.id);}}};
  const result=await publishMerchantPage(env,'owner1','site_one','starter',p.id);
  assert.equal(result.status,409);
  assert.equal(db.prepare('SELECT status FROM cms_pages WHERE id=?').get(p.id).status,'draft');
 }finally{db.close()}
});
