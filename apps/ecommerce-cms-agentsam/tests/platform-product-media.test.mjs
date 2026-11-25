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
    CREATE TABLE media_assets(id TEXT PRIMARY KEY,provider TEXT,provider_account_id TEXT,provider_resource_id TEXT,source_uri TEXT,filename TEXT,
      content_type TEXT,media_kind TEXT,size_bytes INTEGER,width INTEGER,height INTEGER,status TEXT,metadata_json TEXT,created_by_user_id TEXT);
    CREATE TABLE images(id TEXT PRIMARY KEY,user_id TEXT,filename TEXT,mime_type TEXT,size INTEGER,width INTEGER,height INTEGER,
      cloudflare_image_id TEXT,r2_key TEXT,url TEXT,status TEXT);
    CREATE TABLE product_images(id INTEGER PRIMARY KEY,product_id INTEGER REFERENCES products(id),media_asset_id TEXT REFERENCES media_assets(id),
      position INTEGER,is_primary INTEGER,UNIQUE(product_id,media_asset_id));
    INSERT INTO products(id) VALUES (45),(46);
    INSERT INTO media_assets VALUES
      ('asset_img_alpha','cloudflare_images','acct_owner','cf-alpha','https://example.com/alpha.png','alpha.png','image/png','image',100,10,10,'ready','{}','owner'),
      ('asset_img_private','cloudflare_images','acct_other','cf-private','https://example.com/private.png','private.png','image/png','image',100,10,10,'ready','{}','other');
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
function attachAssetRequest(asset) {
  return new Request('https://example.com/api/admin/products/45/images', {method:'POST',
    headers:{'content-type':'application/json'},body:JSON.stringify({media_asset_id:asset.id,asset})});
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
  env.resolvePlatformMediaReference=async (input)=>({ok:true,asset:{id:input.id,url:input.url,filename:input.filename,
    content_type:input.content_type,media_kind:'image',status:'ready'}});
  assert.equal((await attachProductImage(attachRequest('asset_img_alpha'),env,'45')).status,409);
  assert.equal((await setPrimaryProductImage(null,env,'45','asset_img_alpha')).status,200);
  assert.equal((await detachProductImage(null,env,'45','asset_img_alpha')).status,200);
  assert.equal(db.prepare('SELECT image_url FROM products WHERE id=45').get().image_url,null);
  db.close();
});

test('shared provider references are usable through an account-owned product relationship',async()=>{
  const {env,db}=fakeEnv();
  env.PRODUCT_MEDIA_OWNER_ID='other';
  db.prepare('INSERT INTO product_images(product_id,media_asset_id,position,is_primary) VALUES(45,?,0,1)')
    .run('asset_img_alpha');
  const listed=await (await listProductImages(new Request('https://example.com'),env,'45')).json();
  assert.equal(listed.images.length,1);
  assert.equal(listed.images[0].id,'asset_img_alpha');
  env.resolvePlatformMediaReference=async (input)=>({ok:true,asset:{id:input.id,url:input.url,filename:input.filename,
    content_type:input.content_type,media_kind:'image',status:'ready'}});
  const crossProductAttach = new Request('https://example.com/api/admin/products/46/images', {method:'POST',
    headers:{'content-type':'application/json'},body:JSON.stringify({media_asset_id:'asset_img_alpha'})});
  assert.equal((await attachProductImage(crossProductAttach,env,'46')).status,200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM product_images WHERE media_asset_id=?').get('asset_img_alpha').n,2);
  assert.equal((await setPrimaryProductImage(null,env,'45','asset_img_alpha')).status,200);
  assert.equal((await detachProductImage(null,env,'45','asset_img_alpha')).status,200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM product_images WHERE product_id=45').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM product_images WHERE product_id=46').get().n,1);
  db.close();
});

test('legacy images receive a product reference only when attached',async()=>{
  const {env,db}=fakeEnv();
  assert.equal((await attachProductImage(attachRequest('img_old'),env,'45')).status,200);
  const row=db.prepare('SELECT id,provider,created_by_user_id,source_uri FROM media_assets WHERE id=?').get('img_old');
  assert.deepEqual({...row},{id:'img_old',provider:'cloudflare_images',created_by_user_id:'owner',source_uri:'https://example.com/legacy.png'});
  assert.equal(db.prepare('SELECT image_url FROM products WHERE id=45').get().image_url,'https://example.com/legacy.png');
  db.close();
});

test('provider-native Cloudflare images create one lightweight reference only when attached',async()=>{
  const {env,db}=fakeEnv();
  let resolverCalls=0;
  env.resolvePlatformMediaReference=async (input)=>{
    resolverCalls+=1;
    assert.equal(input.provider,'cloudflare_images');
    assert.equal(input.provider_account_id,'acct_owner');
    const existing=db.prepare('SELECT id,source_uri AS url,filename,content_type,media_kind,status FROM media_assets WHERE provider=? AND provider_account_id=? AND provider_resource_id=? AND created_by_user_id=?')
      .get('cloudflare_images','acct_owner','cf-native-1','owner');
    if(existing)return {ok:true,asset:existing};
    db.prepare(`INSERT INTO media_assets(id,provider,provider_account_id,provider_resource_id,source_uri,filename,content_type,media_kind,status,created_by_user_id)
      VALUES(?,?,?,?,?,?,?,'image','ready',?)`).run('asset_cfimg_reference','cloudflare_images','acct_owner','cf-native-1',
        'https://imagedelivery.net/hash/cf-native-1/public','native.png','image/png','owner');
    return {ok:true,asset:{id:'asset_cfimg_reference',url:'https://imagedelivery.net/hash/cf-native-1/public',
      filename:'native.png',content_type:'image/png',media_kind:'image',status:'ready'}};
  };
  const before=db.prepare('SELECT COUNT(*) AS n FROM media_assets').get().n;
  const asset={id:'cf-native-1',provider:'cloudflare_images',provider_account_id:'acct_owner',
    provider_resource_id:'cf-native-1',content_type:'image/png',filename:'native.png',
    url:'https://imagedelivery.net/hash/cf-native-1/public'};
  const response=await attachProductImage(attachAssetRequest(asset),env,'45');
  assert.equal(response.status,200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM media_assets').get().n,before+1);
  const link=db.prepare('SELECT media_asset_id FROM product_images WHERE product_id=45').get();
  assert.equal(link.media_asset_id,'asset_cfimg_reference');
  assert.equal(resolverCalls,1);
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
  assert.match(editor,/asset: p/);
  assert.match(picker,/String\(tile\.dataset\.assetId/);
  assert.ok(picker.includes("/api/admin/media?"));
  assert.doesNotMatch(picker,/provider=/);
  assert.match(worker,/handleStudioContentMediaApi/);
  assert.match(worker,/resolveCloudflareProductMediaReference/);
  assert.ok(api.includes('images\\/([A-Za-z0-9_-]+)'));
});
