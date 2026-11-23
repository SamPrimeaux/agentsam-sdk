import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  attachProductImage, listProductImages, setPrimaryProductImage, detachProductImage,
} from '../backend/admin/media.js';

function fakeEnv() {
  const db = new DatabaseSync(':memory:');
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE products(id INTEGER PRIMARY KEY,image_url TEXT);
    CREATE TABLE media_assets(id TEXT PRIMARY KEY,provider TEXT,provider_resource_id TEXT,source_uri TEXT,filename TEXT,
      content_type TEXT,media_kind TEXT,size_bytes INTEGER,width INTEGER,height INTEGER,status TEXT,metadata_json TEXT,created_by_user_id TEXT);
    CREATE TABLE images(id TEXT PRIMARY KEY,user_id TEXT,filename TEXT,mime_type TEXT,size INTEGER,width INTEGER,height INTEGER,
      cloudflare_image_id TEXT,r2_key TEXT,url TEXT,status TEXT);
    CREATE TABLE product_images(id INTEGER PRIMARY KEY,product_id INTEGER REFERENCES products(id),media_asset_id TEXT REFERENCES media_assets(id),
      position INTEGER,is_primary INTEGER,UNIQUE(product_id,media_asset_id));
    INSERT INTO products(id) VALUES (45);
    INSERT INTO media_assets VALUES
      ('asset_img_alpha','cloudflare_images','cf-alpha','https://example.com/alpha.png','alpha.png','image/png','image',100,10,10,'ready','{}','owner'),
      ('asset_img_private','cloudflare_images','cf-private','https://example.com/private.png','private.png','image/png','image',100,10,10,'ready','{}','other');
    INSERT INTO images VALUES
      ('img_old','owner','legacy.png','image/png',50,10,10,'cf-old',NULL,'https://example.com/legacy.png','active');
  `);
  const adapter={prepare(sql){return{bind(...args){const statement=db.prepare(sql);return{
    async first(){return statement.get(...args)??null;},
    async all(){return{results:statement.all(...args)};},
    async run(){return statement.run(...args);},
  };}};}};
  return {env:{DB:adapter,PRODUCT_MEDIA_SCHEMA:'platform',PRODUCT_MEDIA_OWNER_ID:'owner'},db};
}
function attachRequest(id) {
  return new Request('https://example.com/api/admin/products/45/images', {method:'POST',
    headers:{'content-type':'application/json'},body:JSON.stringify({media_asset_id:id})});
}

test('opaque media asset IDs attach, list, select primary and detach without a second image store',async()=>{
  const {env,db}=fakeEnv();
  assert.equal((await attachProductImage(attachRequest('asset_img_alpha'),env,'45')).status,200);
  assert.equal(db.prepare('SELECT image_url FROM products WHERE id=45').get().image_url,'https://example.com/alpha.png');
  const rows=await (await listProductImages(new Request('https://example.com'),env,'45')).json();
  assert.equal(rows.images.length,1);
  assert.equal(rows.images[0].id,'asset_img_alpha');
  assert.equal(rows.images[0].url,'https://example.com/alpha.png');
  assert.equal((await attachProductImage(attachRequest('asset_img_private'),env,'45')).status,404);
  assert.equal((await attachProductImage(attachRequest('asset_img_alpha'),env,'45')).status,409);
  assert.equal((await setPrimaryProductImage(null,env,'45','asset_img_private')).status,404);
  assert.equal((await setPrimaryProductImage(null,env,'45','asset_img_alpha')).status,200);
  assert.equal((await detachProductImage(null,env,'45','asset_img_alpha')).status,200);
  assert.equal(db.prepare('SELECT image_url FROM products WHERE id=45').get().image_url,null);
  db.close();
});

test('account-owned legacy images materialize into the existing universal media registry on attach',async()=>{
  const {env,db}=fakeEnv();
  assert.equal((await attachProductImage(attachRequest('img_old'),env,'45')).status,200);
  const row=db.prepare('SELECT id,provider,created_by_user_id,source_uri FROM media_assets WHERE id=?').get('img_old');
  assert.deepEqual({...row},{id:'img_old',provider:'cloudflare_images',created_by_user_id:'owner',source_uri:'https://example.com/legacy.png'});
  assert.equal(db.prepare('SELECT image_url FROM products WHERE id=45').get().image_url,'https://example.com/legacy.png');
  db.close();
});

test('media picker, product editor and hosted routes support opaque media IDs without JSON parse crashes',()=>{
  const text=(path)=>readFileSync(new URL(path,import.meta.url),'utf8');
  const editor=text('../frontend/static/product-edit.html');
  const picker=text('../frontend/static/js/media-picker.js');
  const worker=text('../../local-studio/backend/worker/index.js');
  const api=text('../backend/admin/api.js');
  assert.match(editor,/contentType\.includes\("application\/json"\)/);
  assert.match(editor,/encodeURIComponent\(assetId\)/);
  assert.match(editor,/source: "platform_registry"/);
  assert.match(picker,/String\(tile\.dataset\.assetId/);
  assert.match(picker,/provider=platform_registry/);
  assert.match(worker,/url\.searchParams\.get\("provider"\) === "platform_registry"/);
  assert.ok(api.includes('images\\/([A-Za-z0-9_-]+)'));
});
