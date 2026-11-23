import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {registerUploadedImageAsset} from '../backend/worker/content-media-api.js';

function registry() {
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE media_assets(
    id TEXT PRIMARY KEY, provider TEXT, provider_account_id TEXT,provider_resource_id TEXT,
    source_uri TEXT,filename TEXT,content_type TEXT,media_kind TEXT,size_bytes INTEGER,
    width INTEGER,height INTEGER,status TEXT,created_by_user_id TEXT,metadata_json TEXT);
  `);
  return {db,env:{DB:{prepare(sql){return{bind(...params){return{async run(){return db.prepare(sql).run(...params)}}}}}}}};
}

test('Cloudflare OAuth image upload registers one account-owned universal media asset for product use',async()=>{
 const {db,env}=registry();
 const normalized={id:'cf-id',cloudflare_image_id:'cf-id',filename:'sample.png',mime_type:'image/png',
  size_bytes:64,width:32,height:22,url:'https://imagedelivery.net/example/cf-id/public',folder:'products',category:'product'};
 const result=await registerUploadedImageAsset(env,'acct_a',normalized,'cf-account');
 assert.match(result.id,/^asset_img_[0-9a-f]{32}$/);
 const row=db.prepare('SELECT * FROM media_assets WHERE id=?').get(result.id);
 assert.equal(row.provider,'cloudflare_images');
 assert.equal(row.provider_resource_id,'cf-id');
 assert.equal(row.provider_account_id,'cf-account');
 assert.equal(row.created_by_user_id,'acct_a');
 assert.equal(row.source_uri,normalized.url);
 assert.equal(row.media_kind,'image');
 assert.equal(row.status,'ready');
 assert.equal(JSON.parse(row.metadata_json).folder,'products');
 db.close();
});

test('unresolvable image URLs do not create a product media registry record',async()=>{
 const {db,env}=registry();
 await assert.rejects(registerUploadedImageAsset(env,'acct_a',{
   cloudflare_image_id:'cf-bad',url:'javascript:alert(1)',filename:'bad.svg',mime_type:'image/svg+xml',
 },'cf-account'),/uploaded_media_delivery_url_missing/);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM media_assets').get().n,0);
 db.close();
});
