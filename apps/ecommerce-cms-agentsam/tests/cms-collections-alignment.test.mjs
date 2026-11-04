import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { JSDOM } from 'jsdom';
import { createCmsTestDb, seedCmsAccountAndSite } from './cms-test-db.mjs';
import { parseD1CommandOutput } from '../bin/migrate-collections.mjs';
import { alignCmsCollections, planCmsCollectionAlignment } from '../db/schema/migrations/cms-collections.mjs';
import { saveCmsCollection, getCmsCollection, listCmsCollections, replaceCmsCollectionItems, productCollectionWrites, productCollectionIds, handleCollectionApi } from '../backend/cms/collection-store.mjs';
import { getStoreCollection, listStoreCollections } from '../backend/store/collections.js';
import { handleAdminApi } from '../backend/admin/api.js';
import { STARTER_PRODUCT_ILLUSTRATIONS } from '../frontend/theme-editor/starter-products.mjs';
import { materializeStarterProject } from '../frontend/theme-editor/starter-project.mjs';
import { renderThemePage, createThemeProjectAdapter } from '../frontend/theme-editor/project.mjs';
import { heuristicStarterPreset } from '../../../packages/heuristic-theme/src/starter.js';

function adapters(db) {
  return {
    sql:{all:async(query,args=[])=>db.prepare(query).all(...args),exec:async(query)=>db.exec(query)},
    env:{DB:{
      prepare(query) {
        let args=[];
        return {bind(...values){args=values;return this;},
          async first(){return db.prepare(query).get(...args)||null;},
          async all(){return {results:db.prepare(query).all(...args)};},
          async run(){const r=db.prepare(query).run(...args);return {meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)}};},
        };
      },
      async batch(writes){db.exec('BEGIN');try {const result=[];for(const w of writes)result.push(await w.run());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}},
    }},
  };
}
function productTables(db) {
  db.exec(`CREATE TABLE products(id INTEGER PRIMARY KEY,slug TEXT UNIQUE,title TEXT,description TEXT,collection TEXT,
    price_cents INTEGER DEFAULT 0,image_url TEXT,status TEXT DEFAULT 'draft',seo_title TEXT,seo_description TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE product_variants(id INTEGER PRIMARY KEY,product_id INTEGER,sku TEXT,size TEXT,color TEXT,price_cents INTEGER,inventory_qty INTEGER,updated_at TEXT);`);
}
function setup() {
  const db=createCmsTestDb();
  seedCmsAccountAndSite(db,{accountId:'a',siteId:'s1'});
  seedCmsAccountAndSite(db,{accountId:'b',siteId:'s2'});
  db.exec("UPDATE cms_sites SET primary_domain=id||'.test'");
  productTables(db);
  return {db,...adapters(db)};
}
const scope={id:'s1',account_id:'a'};

test('deployed media collection shape aligns additively and keeps identities, fields and asset membership',async()=>{
  const {db,sql,env}=setup();
  try {
    db.exec(`DROP TABLE cms_collection_items;DROP TABLE cms_collections;
      CREATE TABLE cms_collections(id TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT,thumbnail_url TEXT,is_public INTEGER DEFAULT 0,
      created_by TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,slug TEXT,kind TEXT NOT NULL DEFAULT 'manual',
      allowed_item_types_json TEXT NOT NULL DEFAULT '["asset"]',rule_json TEXT,tags TEXT NOT NULL DEFAULT '[]',sort_by TEXT NOT NULL DEFAULT 'manual',
      seo_title TEXT,seo_description TEXT,thumbnail_asset_id TEXT,sku TEXT,site_id TEXT NOT NULL REFERENCES cms_sites(id));
      CREATE TABLE cms_collection_assets(collection_id TEXT,asset_id TEXT,order_index INTEGER);
      INSERT INTO cms_collections(id,name,slug,is_public,created_at,updated_at,tags,thumbnail_url,site_id)
        VALUES('existing','Gallery','gallery',1,100,200,'["work"]','/original.svg','s1');
      INSERT INTO cms_collection_assets VALUES('existing','asset1',3);`);
    const before=db.prepare('SELECT count(*) n FROM cms_collections').get().n;
    await alignCmsCollections(sql);
    const row=await getCmsCollection(env,scope,'existing');
    assert.equal(row.id,'existing');assert.equal(row.account_id,'a');
    assert.equal(row.created_at,100);assert.equal(row.status,'active');assert.equal(row.visibility,'public');
    assert.deepEqual(row.tags,['work']);assert.equal(row.image_url,'/original.svg');
    assert.equal(db.prepare('SELECT count(*) n FROM cms_collections').get().n,before);
    assert.equal(db.prepare('SELECT item_ref FROM cms_collection_items').get().item_ref,'asset1');
    await alignCmsCollections(sql);
    assert.equal(db.prepare('SELECT count(*) n FROM cms_collection_items').get().n,1);
    await saveCmsCollection(env,scope,{tags:['updated'],status:'draft'},row.id);
    assert.deepEqual(JSON.parse(db.prepare('SELECT tags FROM cms_collections').get().tags),['updated']);
    assert.equal(db.prepare('SELECT is_public FROM cms_collections').get().is_public,0);
    db.exec(`INSERT INTO cms_collections(id,name,slug,is_public,tags,site_id,created_at,updated_at)
      VALUES('legacy-write','Legacy write','legacy-write',1,'["legacy"]','s1',300,300);`);
    assert.equal((await getCmsCollection(env,scope,'legacy-write')).account_id,'a');
    assert.equal((await getCmsCollection(env,scope,'legacy-write')).status,'active');
    assert.deepEqual((await getCmsCollection(env,scope,'legacy-write')).tags,['legacy']);
    db.exec(`UPDATE cms_collections SET tags='["from-legacy"]',is_public=0 WHERE id='legacy-write'`);
    assert.deepEqual((await getCmsCollection(env,scope,'legacy-write')).tags,['from-legacy']);
    assert.equal((await getCmsCollection(env,scope,'legacy-write')).visibility,'private');

    assert.throws(()=>db.exec("INSERT INTO cms_collections(id,account_id,site_id,name,slug,created_at,updated_at) VALUES('bad','b','s1','Bad','bad',1,1)"),/owner_mismatch/);
  } finally {db.close();}
});

test('legacy commerce bridge preserves products and memberships, and refuses ambiguous product claims',async()=>{
  const db=createCmsTestDb();seedCmsAccountAndSite(db,{accountId:'a',siteId:'s1'});
  const {sql,env}=adapters(db);
  try {
    db.exec('DROP TABLE cms_collection_items;DROP TABLE cms_collections;');productTables(db);
    db.exec(`CREATE TABLE store_collections(id INTEGER PRIMARY KEY,slug TEXT,title TEXT,description TEXT,eyebrow TEXT,image_url TEXT,accent_color TEXT,status TEXT,sort_order INTEGER,seo_title TEXT,seo_description TEXT,created_at TEXT,updated_at TEXT);
      CREATE TABLE store_collection_products(collection_id INTEGER,product_id INTEGER,sort_order INTEGER);
      INSERT INTO products(id,slug,title,status) VALUES(1,'shirt','Real shirt','active'),(2,'bag','Real bag','draft');
      INSERT INTO store_collections VALUES(10,'featured','Featured','Real copy','Shop','/real.webp','#123456','active',3,NULL,NULL,'2025-01-01','2025-01-02');
      INSERT INTO store_collection_products VALUES(10,1,4),(10,2,8);`);
    const original=db.prepare('SELECT * FROM products ORDER BY id').all();
    await alignCmsCollections(sql,{legacySiteId:'s1',claimUnscopedProducts:true});
    const collections=await listCmsCollections(env,scope);
    assert.equal(collections.length,1);assert.equal(collections[0].metadata.legacy_store_collection_id,'10');
    assert.equal(db.prepare('SELECT count(*) n FROM products').get().n,original.length);
    assert.equal(db.prepare('SELECT count(*) n FROM store_collection_products').get().n,2);
    assert.equal(db.prepare('SELECT count(*) n FROM cms_collection_items').get().n,2);
    assert.deepEqual(await productCollectionIds(env,scope,1),[collections[0].id]);
    await alignCmsCollections(sql,{legacySiteId:'s1',claimUnscopedProducts:true});
    assert.equal(db.prepare('SELECT count(*) n FROM cms_collection_items').get().n,2);
    await env.DB.batch(await productCollectionWrites(env,scope,1,[]));
    await alignCmsCollections(sql,{legacySiteId:'s1',claimUnscopedProducts:true});
    assert.deepEqual(await productCollectionIds(env,scope,1),[],'migration rerun must not resurrect removed legacy memberships');
    seedCmsAccountAndSite(db,{accountId:'b',siteId:'s2'});
    await assert.rejects(planCmsCollectionAlignment(sql,{legacySiteId:'s1',claimUnscopedProducts:true}),/must_be_explicit/);
  } finally {db.close();}
});

test('site-owned manual collections round-trip; foreign products are rejected before any writes',async()=>{
  const {db,sql,env}=setup();
  try {
    await alignCmsCollections(sql);
    db.exec("INSERT INTO products(id,slug,title,site_id,status) VALUES(1,'a','A','s1','active'),(2,'b','B','s2','active')");
    const collection=await saveCmsCollection(env,scope,{title:'Featured',allowed_item_types:['product']});
    await replaceCmsCollectionItems(env,scope,collection.id,[{item_type:'product',item_ref:'1'}]);
    assert.deepEqual(await productCollectionIds(env,scope,1),[collection.id]);
    await assert.rejects(replaceCmsCollectionItems(env,scope,collection.id,[{item_type:'product',item_ref:'2'}]),/unauthorized/);
    assert.equal(db.prepare('SELECT item_ref FROM cms_collection_items').get().item_ref,'1');
    await assert.rejects(productCollectionWrites(env,{id:'s2',account_id:'b'},2,[collection.id]),/unauthorized/);
    assert.deepEqual(await listCmsCollections(env,{id:'s2',account_id:'b'}),[]);
    assert.equal(await getCmsCollection(env,{id:'s2',account_id:'b'},collection.id),null);
    const stale=await getCmsCollection(env,scope,collection.id);
    await saveCmsCollection(env,scope,{name:'Updated'},collection.id);
    await assert.rejects(saveCmsCollection(env,scope,{name:'Stale',expected_updated_at:stale.updated_at},collection.id),/reload/);
    await env.DB.batch(await productCollectionWrites(env,scope,1,[]));
    assert.deepEqual(await productCollectionIds(env,scope,1),[]);
  } finally {db.close();}
});

test('storefront uses the same collection and product records, only on its verified host and active state',async()=>{
  const {db,sql,env}=setup();
  try {
    await alignCmsCollections(sql);
    db.exec("INSERT INTO products(id,slug,title,site_id,status) VALUES(1,'shirt','Shirt','s1','active'),(2,'hidden','Hidden','s1','draft')");
    const collection=await saveCmsCollection(env,scope,{title:'Featured',status:'draft'});
    await replaceCmsCollectionItems(env,scope,collection.id,[{item_type:'product',item_ref:'1'},{item_type:'product',item_ref:'2'}]);
    assert.deepEqual((await (await listStoreCollections(env,'https://s1.test/api/store/collections')).json()).collections,[]);
    await saveCmsCollection(env,scope,{status:'active'},collection.id);
    const response=await getStoreCollection(env,'featured','https://s1.test/api/store/collections/featured');
    const body=await response.json();assert.equal(response.status,200);
    assert.deepEqual(body.products.map(p=>p.id),[1]);assert.equal(body.collection.id,collection.id);
    assert.equal((await getStoreCollection(env,'featured','https://s2.test/')).status,404);
    assert.equal((await listStoreCollections(env,'https://unknown.test/')).status,404);
    const denied=await handleCollectionApi(new Request('https://cms.test/api/admin/collections?site_id=s2'),env,new URL('https://cms.test/api/admin/collections?site_id=s2'),{accountId:'a'});
    assert.equal(denied.status,404);
  } finally {db.close();}
});

test('real authenticated product API saves canonical memberships atomically and enforces site scope',async()=>{
  const {db,sql,env}=setup();
  try {
    await alignCmsCollections(sql);
    db.exec(`CREATE TABLE product_studio_drafts(id TEXT,product_id INTEGER,completeful_catalog_product_id TEXT,state TEXT,version INTEGER,selected_variant_ids_json TEXT,original_media_asset_id TEXT,prepared_media_asset_id TEXT,preview_media_asset_id TEXT,completeful_design_id TEXT,completeful_render_status TEXT);
      CREATE UNIQUE INDEX variant_sku ON product_variants(sku);
      INSERT INTO products(id,slug,title,site_id,status) VALUES(1,'real','Original','s1','draft'),(2,'foreign','Foreign','s2','draft');
      INSERT INTO product_variants(id,product_id,sku,inventory_qty) VALUES(1,1,'one',5),(2,1,'two',5);`);
    const request=async(path,method='GET',body=null,account='a')=>{
      const url=new URL('https://cms.test'+path);
      return handleAdminApi(new Request(url,{method,...(body?{body:JSON.stringify(body),headers:{'content-type':'application/json'}}:{})}),
        env,url,null,{id:'actor',account_id:account,role:'owner'});
    };
    const created=await request('/api/admin/collections?site_id=s1','POST',{title:'Featured'});
    assert.equal(created.status,201);
    const collection=(await created.json()).collection;
    const save=await request('/api/admin/products/1?site_id=s1','PUT',{title:'Saved',status:'draft',collection_ids:[collection.id]});
    assert.equal(save.status,200,await save.text());
    const first=await (await request('/api/admin/products/1?site_id=s1')).json();
    assert.equal(first.product.title,'Saved');assert.deepEqual(first.collection_ids,[collection.id]);
    const oldId=db.prepare('SELECT id FROM cms_collection_items').get().id;
    await request('/api/admin/products/1?site_id=s1','PUT',{title:'Again',status:'draft',collection_ids:[collection.id]});
    assert.equal(db.prepare('SELECT id FROM cms_collection_items').get().id,oldId);
    const failed=await request('/api/admin/products/1?site_id=s1','PUT',{title:'Should roll back',status:'draft',collection_ids:[],variants:[{id:1,sku:'two'}]});
    assert.equal(failed.status,400);
    assert.match((await failed.json()).error,/SKU|already|used|unique/i);
    assert.equal(db.prepare('SELECT title FROM products WHERE id=1').get().title,'Again');
    assert.deepEqual(await productCollectionIds(env,scope,1),[collection.id]);
    assert.equal((await request('/api/admin/products/2?site_id=s1')).status,404);
    assert.equal((await request('/api/admin/collections?site_id=s2')).status,404);
    const listed=await (await request('/api/admin/products?site_id=s1')).json();
    assert.deepEqual(listed.products.map(p=>p.id),[1]);
    assert.equal(listed.products[0].collection_names,'Featured');
  } finally {db.close();}
});

test('starter illustrations are editable, reusable, portable and never purchasable catalog records',async()=>{
  const dom=new JSDOM('<!doctype html>');
  const previous=globalThis.DOMParser;globalThis.DOMParser=dom.window.DOMParser;
  try {
    assert.equal(STARTER_PRODUCT_ILLUSTRATIONS.length,4);
    assert.ok(STARTER_PRODUCT_ILLUSTRATIONS.every(p=>p.sample&&!p.purchasable&&p.image_url.startsWith('data:image/svg+xml,')));
    const project=materializeStarterProject(heuristicStarterPreset,{name:'A new store'});
    const store={state:structuredClone(project),async get(){return structuredClone(this.state);},async save(value){this.state=structuredClone(value);return value;}};
    const adapter=createThemeProjectAdapter(project,store);
    const page=await adapter.getPage('home');
    const section=page.sections.find(s=>s.type==='products');
    assert.equal(section.schema.blocks.length,4);
    let document=new JSDOM(renderThemePage(page)).window.document;
    assert.equal(document.querySelectorAll('[data-sample-product]').length,4);
    assert.equal(document.querySelectorAll('[data-cms-section] [data-cms-block] img[data-cms]').length,4);

    assert.equal(document.querySelectorAll('[data-sample-product] button,[data-sample-product] a').length,0);
    assert.match(document.body.textContent,/Sample products/);
    const block=section.content.__editor.blocks[0];
    section.content[block.id].title='My edited illustration';
    await adapter.saveDraft('home',section.key,section.content,section.version);
    const reloaded=createThemeProjectAdapter(store.state,store);
    document=new JSDOM(renderThemePage(await reloaded.getPage('home'))).window.document;
    assert.match(document.body.textContent,/My edited illustration/);
    const second=materializeStarterProject({...heuristicStarterPreset,theme:{...heuristicStarterPreset.theme,slug:'second',name:'Second theme'}},{name:'Another store'});
    assert.equal(second.pages[0].sections.find(s=>s.type==='products').schema.blocks.length,4);
    assert.doesNotMatch(second.pages[0].template,/A new store/);
    const empty=materializeStarterProject({...heuristicStarterPreset,sampleProducts:false},{name:'No samples'});
    assert.equal(empty.pages[0].sections.find(s=>s.type==='products').schema.blocks.length,0);
  } finally {globalThis.DOMParser=previous;dom.window.close();}
});

test('D1 migration output accepts upload progress before the JSON receipt',()=>{
  assert.deepEqual(parseD1CommandOutput('├ Checking if file needs uploading\n[\n{"success":true,"results":[{"n":10}]}\n]'),[{n:10}]);
  assert.throws(()=>parseD1CommandOutput('[{"success":false}]'),/query failed/);
});
