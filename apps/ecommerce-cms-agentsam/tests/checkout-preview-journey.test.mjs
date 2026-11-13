import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleCheckoutPreviewApi} from '../backend/cms/checkout-preview.mjs';

const migration=readFileSync(
  new URL('../../local-studio/backend/migrations/1362_orders_account_site_checkout_preview.sql',import.meta.url),
  'utf8');
const origin='https://cms.test';
function dbFixture(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec('PRAGMA foreign_keys=ON');
 sqlite.exec(`
 CREATE TABLE accounts(id TEXT PRIMARY KEY);
 CREATE TABLE cms_sites(id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id),name TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active');
 CREATE TABLE orders(id INTEGER PRIMARY KEY AUTOINCREMENT,customer_email TEXT,status TEXT DEFAULT 'pending',total_cents INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT (datetime('now')));
 CREATE TABLE cms_definitions(id TEXT PRIMARY KEY,account_id TEXT);
 CREATE TABLE products_catalog(id TEXT PRIMARY KEY, name TEXT,tagline TEXT,price_cents INTEGER,billing_interval TEXT,product_line TEXT,is_active INTEGER,sort_order INTEGER);
 CREATE TABLE products(id INTEGER PRIMARY KEY,title TEXT,description TEXT,price_cents INTEGER,product_kind TEXT,status TEXT,site_id TEXT);
 INSERT INTO accounts(id) VALUES('acct-a'),('acct-b');
 INSERT INTO cms_sites(id,account_id,name) VALUES('site-a','acct-a','InnerAnimal Media'),('site-b','acct-b','Other site');
 INSERT INTO cms_definitions(id,account_id) VALUES('cmsd_store_global_header','acct-a');
 INSERT INTO products_catalog(id,name,tagline,price_cents,billing_interval,product_line,is_active,sort_order)
 VALUES ('plan-starter','Studio Starter','A testable offer',250000,'one_time','studio_services',1,1),
 ('plan-inactive','Inactive','Not available',0,'monthly','studio_services',0,2);
 INSERT INTO products(id,title,description,price_cents,product_kind,status,site_id)
 VALUES(5,'Store Product','A genuine product',1900,'physical','active','site-b');
 `);
 sqlite.exec(migration);
 return {sqlite,env:{DB:{
  prepare(sql){
   let args=[];
   return {bind(...values){args=values;return this;},
     async first(){return sqlite.prepare(sql).get(...args)||null;},
     async all(){return {results:sqlite.prepare(sql).all(...args)};},
     async run(){const result=sqlite.prepare(sql).run(...args);return {meta:{changes:result.changes,last_row_id:result.lastInsertRowid}};}};
  }
 }}};
}
function makeRequest(path,method='GET',body){
 return new Request(origin+path,{method,headers:body===undefined?{}:{'content-type':'application/json'},
  body:body===undefined?undefined:JSON.stringify(body)});
}
function invoke(env,accountId,path,method='GET',body){
 const request=makeRequest(path,method,body);
 return handleCheckoutPreviewApi(request,env,new URL(request.url),{accountId});
}
test('merchant accepts verified offer and completes customer123 UX without orders or payment provider',async()=>{
 const {sqlite,env}=dbFixture();
 try{
  const offersResponse=await invoke(env,'acct-a','/api/admin/cms/checkout-previews/offers?site_id=site-a');
  assert.equal(offersResponse.status,200);
  const {offers}=await offersResponse.json();
  assert.deepEqual(offers.map(offer=>offer.id),['plan-starter']);
  assert.equal(offers[0].price_cents,250000);
  const create=await invoke(env,'acct-a','/api/admin/cms/checkout-previews?site_id=site-a',
    'POST',{customer_label:'customer123',offer_id:'plan-starter'});
  assert.equal(create.status,201);
  const initial=(await create.json()).preview;
  assert.equal(initial.status,'draft');
  assert.equal(initial.step,'start-trial');
  assert.equal(initial.journey.offer.price_cents,250000,'server derives price; client cannot overwrite');
  const fakePrice=await invoke(env,'acct-a','/api/admin/cms/checkout-previews?site_id=site-a',
    'POST',{offer_id:'plan-starter',price_cents:0});
  assert.equal(fakePrice.status,400);
  let revision=initial.revision;
  const url='/api/admin/cms/checkout-previews/'+initial.id+'?site_id=site-a';
  const badSkip=await invoke(env,'acct-a',url,'PATCH',{step:'first-run',expected_revision:revision});
  assert.equal(badSkip.status,422);
  const goals=await invoke(env,'acct-a',url,'PATCH',{step:'goals',goals:['website','branding'],expected_revision:revision});
  assert.equal(goals.status,200);
  revision=(await goals.json()).preview.revision;
  const stale=await invoke(env,'acct-a',url,'PATCH',{step:'setup',expected_revision:1});
  assert.equal(stale.status,409);
  const setup=await invoke(env,'acct-a',url,'PATCH',{step:'setup',site_name:'customer123 studio',expected_revision:revision});
  assert.equal(setup.status,200);
  revision=(await setup.json()).preview.revision;
  const complete=await invoke(env,'acct-a',url,'PATCH',{step:'first-run',expected_revision:revision});
  assert.equal(complete.status,200);
  const finished=(await complete.json()).preview;
  assert.equal(finished.status,'completed');
  assert.deepEqual(finished.journey.goals,['website','branding']);
  assert.equal(finished.journey.site_name,'customer123 studio');
  const replay=await invoke(env,'acct-a',url);
  assert.equal((await replay.json()).preview.status,'completed');
  const extra=await invoke(env,'acct-a',url,'PATCH',{step:'first-run',expected_revision:finished.revision});
  assert.equal(extra.status,409);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM orders').get().n,0);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM cms_checkout_previews').get().n,1);
 }finally{sqlite.close();}
});
test('cross-account or unknown site cannot reveal offers or previews',async()=>{
 const {sqlite,env}=dbFixture();
 try{
  assert.equal((await invoke(env,null,'/api/admin/cms/checkout-previews/offers?site_id=site-a')).status,403);
  assert.equal((await invoke(env,'acct-b','/api/admin/cms/checkout-previews/offers?site_id=site-a')).status,404);
  const b=await invoke(env,'acct-b','/api/admin/cms/checkout-previews/offers?site_id=site-b');
  const offers=(await b.json()).offers;
  assert.deepEqual(offers.map(x=>x.id),['product:5']);
  const bad=await invoke(env,'acct-a','/api/admin/cms/checkout-previews?site_id=site-a','POST',
    {offer_id:'plan-inactive'});
  assert.equal(bad.status,422);
  const owner=await invoke(env,'acct-a','/api/admin/cms/checkout-previews?site_id=site-a','POST',{offer_id:'plan-starter'});
  const item=(await owner.json()).preview;
  assert.equal((await invoke(env,'acct-b','/api/admin/cms/checkout-previews/'+item.id+'?site_id=site-b')).status,404);
  assert.equal((await invoke(env,'acct-b','/api/admin/cms/checkout-previews?site_id=site-b')).status,200);
  assert.equal((await (await invoke(env,'acct-b','/api/admin/cms/checkout-previews?site_id=site-b')).json()).previews.length,0);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM orders').get().n,0);
 }finally{sqlite.close();}
});
test('preview refuses provider/card payload injection and out-of-order steps',async()=>{
 const {sqlite,env}=dbFixture();
 try{
  const created=await invoke(env,'acct-a','/api/admin/cms/checkout-previews?site_id=site-a','POST',{offer_id:'plan-starter'});
  const item=(await created.json()).preview;
  const url='/api/admin/cms/checkout-previews/'+item.id+'?site_id=site-a';
  const rejected=await invoke(env,'acct-a',url,'PATCH',{expected_revision:1,step:'goals',goals:['buy-card']});
  assert.equal(rejected.status,400);
  assert.equal(sqlite.prepare('SELECT revision FROM cms_checkout_previews').get().revision,1);
  const badBody=await invoke(env,'acct-a',url,'PATCH',{expected_revision:1,step:'setup',payment_card:'424242'});
  assert.equal(badBody.status,400);
 }finally{sqlite.close();}
});

test('standalone legacy product schema never exposes unscoped products or alters existing paid orders',async()=>{
 const sqlite=new DatabaseSync(':memory:');
 try{
  sqlite.exec(`
   PRAGMA foreign_keys=ON;
   CREATE TABLE accounts(id TEXT PRIMARY KEY);
   CREATE TABLE cms_sites(id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id),name TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active');
   CREATE TABLE cms_definitions(id TEXT PRIMARY KEY,account_id TEXT);
   CREATE TABLE products(id INTEGER PRIMARY KEY,title TEXT NOT NULL,description TEXT,price_cents INTEGER,status TEXT);
   CREATE TABLE orders(id INTEGER PRIMARY KEY,status TEXT,customer_email TEXT,total_cents INTEGER);
   INSERT INTO accounts(id) VALUES('acct-old');
   INSERT INTO cms_sites(id,account_id,name) VALUES('legacy-site','acct-old','Legacy store');
   INSERT INTO products(id,title,description,price_cents,status) VALUES(1,'Legacy shirt','A real product',2500,'active');
   INSERT INTO orders(id,status,customer_email,total_cents) VALUES(1,'paid','buyer@example.test',2500);
  `);
  const previewMigration=readFileSync(
   new URL('../db/migrations/006_checkout_preview_only.sql',import.meta.url),'utf8');
  sqlite.exec(previewMigration);
  const env={DB:{
   prepare(sql){let args=[];
    return {bind(...values){args=values;return this;},
     async first(){return sqlite.prepare(sql).get(...args)||null;},
     async all(){return {results:sqlite.prepare(sql).all(...args)};},
     async run(){const r=sqlite.prepare(sql).run(...args);return {meta:{changes:r.changes}};}};}
  }};
  const response=await invoke(env,'acct-old','/api/admin/cms/checkout-previews/offers?site_id=legacy-site');
  assert.equal(response.status,200);
  const data=await response.json();
  assert.deepEqual(data.offers,[],'legacy products have no site ownership; do not leak them');
  assert.equal(sqlite.prepare("SELECT status FROM orders WHERE id=1").get().status,'paid');
  assert.equal(sqlite.prepare("SELECT count(*) n FROM orders").get().n,1);
  assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{sqlite.close();}
});
