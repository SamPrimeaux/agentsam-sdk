import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { handleBrandRegistryRequest } from "./brand-registry.js";

const ACCOUNT = "au_aaaaaaaaaaaaaaaa";
const OTHER = "au_bbbbbbbbbbbbbbbb";

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE accounts (id TEXT PRIMARY KEY, status TEXT NOT NULL);
    CREATE TABLE auth_users (
      id TEXT PRIMARY KEY, role TEXT, is_superadmin INTEGER DEFAULT 0,
      default_account_id TEXT, status TEXT
    );
    CREATE TABLE brands (
      id TEXT PRIMARY KEY DEFAULT ('brand_' || lower(hex(randomblob(6)))),
      parent_brand_id TEXT, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
      display_name TEXT, tagline TEXT, description TEXT, mission TEXT,
      architecture_model TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
      priority INTEGER DEFAULT 5, tags TEXT, domain TEXT, alternate_domains TEXT,
      subdomain TEXT, meta_title TEXT, meta_description TEXT, meta_keywords TEXT,
      og_image_url TEXT, twitter_handle TEXT, canonical_base_url TEXT,
      theme_json TEXT DEFAULT '{}', settings_json TEXT DEFAULT '{}',
      timezone TEXT DEFAULT 'America/Chicago', service_tier TEXT DEFAULT 'family',
      is_public INTEGER DEFAULT 0, requires_oauth INTEGER DEFAULT 1,
      notes TEXT, usage_notes TEXT, project_id TEXT, metadata_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(parent_brand_id) REFERENCES brands(id)
    );
    CREATE TABLE brand_asset (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL, brand_slug TEXT NOT NULL,
      asset_key TEXT NOT NULL, version TEXT NOT NULL, category TEXT NOT NULL,
      title TEXT, alt_text TEXT, description TEXT, meta_json TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE brand_asset_variant (
      id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES brand_asset(id) ON DELETE CASCADE,
      variant_key TEXT NOT NULL, file_format TEXT NOT NULL, width INTEGER, height INTEGER,
      file_size_bytes INTEGER, storage_provider TEXT NOT NULL, storage_location TEXT NOT NULL,
      delivery_url TEXT, custom_domain_url TEXT, cf_image_id TEXT, cf_variant_name TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
  `);
  const db = {
    prepare(sql) {
      let params = [];
      return {
        bind(...values) { params = values; return this; },
        async all() { return { results: sqlite.prepare(sql).all(...params) }; },
        async first() { return sqlite.prepare(sql).get(...params) ?? null; },
        async run() {
          const result = sqlite.prepare(sql).run(...params);
          return { meta: { changes: Number(result.changes) } };
        },
      };
    },
  };
  sqlite.prepare("INSERT INTO accounts (id,status) VALUES (?, 'active'), (?, 'active')").run(ACCOUNT, OTHER);
  sqlite.prepare("INSERT INTO auth_users (id,role,is_superadmin,default_account_id,status) VALUES (?, 'superadmin',1,?,'active'), (?, 'member',0,?,'active')")
    .run(ACCOUNT, ACCOUNT, OTHER, OTHER);
  sqlite.prepare("INSERT INTO brands (id,name,slug,display_name,architecture_model,status) VALUES ('brand_root','InnerAnimal','inneranimal','InnerAnimal','master_brand','active')").run();
  sqlite.prepare("INSERT INTO brand_asset (id,account_id,brand_slug,asset_key,version,category,title,meta_json,created_at,updated_at) VALUES ('asset_a',?,'inneranimal','logo.svg','v1','logo','InnerAnimal logo','{}',1,1)")
    .run(ACCOUNT);
  sqlite.prepare("INSERT INTO brand_asset_variant (id,asset_id,variant_key,file_format,storage_provider,storage_location,delivery_url,is_primary,created_at,updated_at) VALUES ('variant_a','asset_a','public','svg','r2','brands/inneranimal/logo.svg','https://cdn.example/logo.svg',1,1,1)").run();
  return { sqlite, env: { DB: db } };
}

test("brand registry GET reads shared identities and account-scoped asset variants", async () => {
  const { sqlite, env } = fixture();
  const list = await handleBrandRegistryRequest(new Request("https://studio.example/api/brands"), env, {
    accountId: ACCOUNT, userId: ACCOUNT,
  });
  assert.equal(list.status, 200);
  const payload = await list.json();
  assert.equal(payload.count, 1);
  assert.equal(payload.brands[0].slug, "inneranimal");
  assert.equal(payload.brands[0].assetCount, 1);

  const detail = await handleBrandRegistryRequest(new Request("https://studio.example/api/brands/inneranimal"), env, {
    accountId: ACCOUNT, userId: ACCOUNT, slug: "inneranimal",
  });
  const detailPayload = await detail.json();
  assert.equal(detail.status, 200);
  assert.equal(detailPayload.brand.assets.items[0].id, "asset_a");
  assert.equal(detailPayload.brand.assets.items[0].variants[0].deliveryUrl, "https://cdn.example/logo.svg");
  sqlite.close();
});

test("brand registry writes require superadmin and preserve the permanent slug on rename", async () => {
  const { sqlite, env } = fixture();
  const createRequest = () => new Request("https://studio.example/api/brands", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "PrimeTech", slug: "primetech", parentBrandId: "brand_root",
      architectureModel: "endorsed_brand", tagline: "Creative production systems",
    }),
  });
  const denied = await handleBrandRegistryRequest(createRequest(), env, { accountId: OTHER, userId: OTHER });
  assert.equal(denied.status, 403);
  for (const role of ["owner", "admin", "superadmin"]) {
    sqlite.prepare("UPDATE auth_users SET role=? WHERE id=?").run(role, OTHER);
    const deniedRole = await handleBrandRegistryRequest(createRequest(), env, { accountId: OTHER, userId: OTHER });
    assert.equal(deniedRole.status, 403, `role ${role} cannot write shared identities`);
  }

  const created = await handleBrandRegistryRequest(createRequest(), env, { accountId: ACCOUNT, userId: ACCOUNT });
  assert.equal(created.status, 201);
  const createdPayload = await created.json();
  assert.equal(createdPayload.brand.slug, "primetech");
  assert.equal(createdPayload.brand.parent_brand_id, "brand_root");

  const renamed = await handleBrandRegistryRequest(new Request("https://studio.example/api/brands/primetech", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "PrimeTech Studio", displayName: "PrimeTech Studio" }),
  }), env, { accountId: ACCOUNT, userId: ACCOUNT, slug: "primetech" });
  assert.equal(renamed.status, 200);
  const renamedPayload = await renamed.json();
  assert.equal(renamedPayload.brand.name, "PrimeTech Studio");
  assert.equal(renamedPayload.brand.slug, "primetech");
  sqlite.close();
});
