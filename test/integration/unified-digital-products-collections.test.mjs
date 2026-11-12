import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const migration = readFileSync(new URL('../../migrations/d1/0027_unified_digital_products_collections.sql', import.meta.url), 'utf8');
function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE code_repositories(id TEXT PRIMARY KEY);
    CREATE TABLE cms_sites(id TEXT PRIMARY KEY, account_id TEXT NOT NULL);
    CREATE TABLE agentsam_products(id TEXT PRIMARY KEY DEFAULT ('prod_' || lower(hex(randomblob(8)))),
      slug TEXT UNIQUE,name TEXT,kind TEXT,status TEXT,description TEXT,repository_id TEXT,
      canonical_path TEXT,package_name TEXT,version TEXT,tags TEXT,metadata TEXT,catalog_visibility TEXT);
    CREATE TABLE products(id INTEGER PRIMARY KEY AUTOINCREMENT,slug TEXT UNIQUE,title TEXT,description TEXT,
      collection TEXT,price_cents INTEGER,status TEXT,site_id TEXT,product_kind TEXT,digital_ref TEXT);
    CREATE TABLE cms_collections(id TEXT PRIMARY KEY,name TEXT,description TEXT,slug TEXT,kind TEXT,
      allowed_item_types_json TEXT,site_id TEXT,account_id TEXT,status TEXT,visibility TEXT,
      sort_order INTEGER,metadata_json TEXT,created_at INTEGER,updated_at INTEGER);
    CREATE TABLE cms_collection_items(id TEXT PRIMARY KEY DEFAULT ('item_' || lower(hex(randomblob(8)))),
      account_id TEXT,site_id TEXT,collection_id TEXT,item_type TEXT,item_ref TEXT,
      sort_order INTEGER,status TEXT,presentation_json TEXT,UNIQUE(collection_id,item_type,item_ref));
    INSERT INTO code_repositories VALUES ('github:samprimeaux/agentsam-sdk');
    INSERT INTO cms_sites VALUES ('app-store','owner'),('merchant-2','elsewhere');
    INSERT INTO cms_collections(id,name,slug,site_id,account_id)
      VALUES ('embeds-existing','App embeds','embeds','app-store','owner'),
             ('identity-existing','Sign in','sign-in','app-store','owner');
    INSERT INTO cms_collection_items(account_id,site_id,collection_id,item_type,item_ref)
      VALUES ('owner','app-store','embeds-existing','product','prod_embeds_legacy'),
             ('owner','app-store','identity-existing','product','prod_identity_legacy');
    INSERT INTO products(slug,title,price_cents,status,site_id,product_kind,digital_ref)
      VALUES ('commerce-email','Commerce Email',0,'active','app-store','app','commerce-email');
    INSERT INTO products(slug,title,price_cents,status,site_id,product_kind,digital_ref)
      VALUES ('merchant-shirt','Merchant Shirt',2500,'active','merchant-2','physical',NULL);
  `);
  for(const slug of ['agentsam-local-studio','cad-creator','agentsam-ecommerce-cms',
    'identity-signin-inneranimalmedia','identity-signin-google','identity-signin-github',
    'identity-signin-cloudflare','identity-signin-chatgpt']) {
    db.prepare('INSERT INTO agentsam_products(slug,name,kind,status) VALUES (?,?,?,?)').run(slug,slug,'app','wired');
  }
  for(const slug of ['agentsam-brand','agentsam-campaign','completeful-product-studio',
    'announcement-bar','announcement-modal','contact-form','customer-billing',
    'newsletter-modal','newsletter-subscribe','cypress','violet','grove','ember',
    'forge','harbor','summit','resolve','iasf','plain-jane','revise']) {
    db.prepare('INSERT INTO products(slug,title,price_cents,status,site_id,product_kind,digital_ref) VALUES (?,?,0,?,?,?,?)')
      .run(slug,slug,'draft','app-store',slug.includes('newsletter')?'app_embed':'app',slug);
  }
  return db;
}
test('software and merch share Products -> Collections -> numeric memberships; no duplicate schema', () => {
  const db=database();
  const count=(q)=>db.prepare(q).get().n;
  try {
    db.exec(migration);
    assert.equal(count("SELECT COUNT(*) n FROM agentsam_products WHERE slug IN ('samsketch','agentsam-canvas','ecommerce-product-studio')"),3);
    assert.equal(count("SELECT COUNT(*) n FROM products WHERE site_id='app-store' AND slug IN ('agentsam-local-studio','cad-creator','samsketch','agentsam-canvas','ecommerce-product-studio','agentsam-ecommerce-cms','identity-signin-google','identity-signin-github','identity-signin-cloudflare','identity-signin-inneranimalmedia','identity-signin-chatgpt')"),11);
    assert.equal(count("SELECT COUNT(*) n FROM cms_collections WHERE site_id='app-store'"),6);
    assert.equal(count("SELECT COUNT(*) n FROM cms_collection_items WHERE site_id='app-store' AND item_ref LIKE 'prod_%'"),0);
    assert.equal(count("SELECT COUNT(*) n FROM cms_collection_items i JOIN products p ON CAST(p.id AS TEXT)=i.item_ref AND p.site_id=i.site_id WHERE i.site_id='app-store'"),35);
    assert.equal(count("SELECT COUNT(*) n FROM products WHERE site_id='app-store' AND status='active'"),1);
    assert.equal(count("SELECT COUNT(*) n FROM products WHERE site_id='merchant-2' AND status='active'"),1);
    const after=count("SELECT COUNT(*) n FROM cms_collection_items");
    db.exec(migration);
    assert.equal(count("SELECT COUNT(*) n FROM cms_collection_items"),after,'migration must be idempotent');
  } finally { db.close(); }
});
