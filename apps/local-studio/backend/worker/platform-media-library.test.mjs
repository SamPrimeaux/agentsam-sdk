import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from 'node:sqlite';
import { normalizeIamImage, normalizeIamMediaAsset, handlePlatformMediaRead } from "./platform-media-library.js";

const actor = { id: "au_test_owner" };

test("IAM Images -> merchant-compatible asset retains opaque string identity and provider", () => {
  const a = normalizeIamImage({
    id: "img_c1", filename: "DreamHouse.png", mime_type: "image/png", size: 123,
    created_at: 1782700000, updated_at: 1782700000,
    cloudflare_image_id: "cf_abc", r2_key: "images/owners/a.png",
    url: "https://imagedelivery.net/example/cf_abc/public",
  });
  assert.equal(a.id, "img_c1");
  assert.equal(a.source.provider, "cf_images");
  assert.equal(a.source.asset_id, "cf_abc");
  assert.equal(a.r2_key, "images/owners/a.png");
  assert.equal(a.status, "ready");
});

test("IAM media_assets -> provider-specific source, without fabricating public R2 URL", () => {
  const a = normalizeIamMediaAsset({
    id: "asset_a1", filename: "render.webp", content_type: "image/webp",
    object_key: "private/render.webp", bucket: "agent-sam",
    source_kind: "r2", source_uri: "r2://agent-sam/private/render.webp",
    status: "uploaded",
  });
  assert.equal(a.id, "asset_a1");
  assert.equal(a.url, null);
  assert.equal(a.source.provider, "r2");
  assert.equal(a.meta.source_bucket, "agent-sam");
});

test("Account-scoped listing filters and pages without assuming merchant table schema", async () => {
  const imageRows = [
    { id: "img_1", filename: "Owner.png", mime_type: "image/png", created_at: 1782700000, status: "active" },
    { id: "img_2", filename: "Owner2.png", mime_type: "image/png", created_at: 1782700001, status: "active" },
  ];
  const queries = [];
  const env = { DB: { prepare(sql) {
    queries.push(sql);
    return { bind(...args) {
      assert.deepEqual(args, [actor.id]);
      return { all: async () => ({ results: sql.includes("FROM images") ? imageRows : [] }) };
    } };
  } } };
  const res = await handlePlatformMediaRead(
    new Request("https://agentsam.example/api/admin/media?q=Owner"),
    env, new URL("https://agentsam.example/api/admin/media?q=Owner"), actor,
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.pagination.total, 2);
  assert.equal(body.assets[0].id, "img_2");
  assert.equal(body.capabilities.source_provider, "iam_registry");
  assert.equal(queries.length, 2);
  assert.match(queries[0], /WHERE user_id = \?/);
  assert.match(queries[1], /m.created_by_user_id = \?/);
  assert.doesNotMatch(queries[1], /workspace_members|m.workspace_id|m.source_kind|m.stream_uid|m.bucket,/);
});

test("Cannot read registry without authenticated principal", async () => {
  const res = await handlePlatformMediaRead(new Request("https://agentsam.example/api/admin/media"), {}, new URL("https://agentsam.example/api/admin/media"), null);
  assert.equal(res.status, 401);
});

test('real platform D1 schema lists account images and canonical media_assets without nonexistent columns',async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE images (
  id TEXT PRIMARY KEY,user_id TEXT,filename TEXT,original_filename TEXT,mime_type TEXT,size INTEGER,width INTEGER,height INTEGER,
  r2_key TEXT,cloudflare_image_id TEXT,url TEXT,thumbnail_url TEXT,alt_text TEXT,status TEXT,metadata TEXT,created_at INTEGER,updated_at INTEGER);
  CREATE TABLE media_assets(id TEXT PRIMARY KEY,filename TEXT,content_type TEXT,size_bytes INTEGER,width INTEGER,height INTEGER,
  object_key TEXT,bucket_id TEXT,provider TEXT,provider_resource_id TEXT,source_uri TEXT,status TEXT,metadata_json TEXT,
  created_at TEXT,updated_at TEXT,created_by_user_id TEXT);
  INSERT INTO images VALUES ('img_c1','au_test_owner','old.png','old.png','image/png',50,1,1,
  NULL,'cf_old','https://example.com/old.png',NULL,NULL,'active','{}',1790000000,1790000000);
  INSERT INTO media_assets VALUES ('asset_img_2','new.png','image/png',50,1,1,
  NULL,NULL,'cloudflare_images','cf_new','https://example.com/new.png','ready','{}',
  '2026-11-23','2026-11-23','au_test_owner');`);
 const env={DB:{prepare(sql){return{bind(...params){return{async all(){return{results:db.prepare(sql).all(...params)}}}}}}}};
 const request=new Request('https://agentsam.example/api/admin/media?provider=platform_registry');
 const response=await handlePlatformMediaRead(request,env,new URL(request.url),actor);
 assert.equal(response.status,200);
 const body=await response.json();
 assert.deepEqual(body.assets.map(asset=>asset.id).sort(),['asset_img_2','img_c1']);
 const canonical=body.assets.find(asset=>asset.id==='asset_img_2');
 assert.equal(canonical.url,'https://example.com/new.png');
 assert.equal(canonical.source.provider,'cf_images');
 db.close();
});
