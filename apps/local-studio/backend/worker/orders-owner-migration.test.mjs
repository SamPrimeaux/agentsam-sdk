import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const path = new URL('../migrations/1362_orders_account_site_checkout_preview.sql', import.meta.url);
const sql = readFileSync(path, 'utf8');

function dbFixture() {
  const db=new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON;');
  db.exec(`
    CREATE TABLE accounts(id TEXT PRIMARY KEY);
    CREATE TABLE cms_sites(
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      status TEXT NOT NULL DEFAULT 'active'
    );
    CREATE TABLE orders(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_email TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      total_cents INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE order_items(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      qty INTEGER NOT NULL DEFAULT 1,
      price_cents INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO accounts(id) VALUES ('acct-a'),('acct-b');
    INSERT INTO cms_sites(id,account_id) VALUES ('site-a','acct-a'),('site-b','acct-b');
  `);
  db.exec(sql);
  return db;
}

test('order writes cannot omit account/site identity or reference another account site',()=>{
  const db=dbFixture();
  try {
    assert.throws(()=>db.exec("INSERT INTO orders(customer_email,total_cents) VALUES ('test@example.com',1200)"),/orders_account_site_required/);
    assert.throws(()=>db.exec("INSERT INTO orders(account_id,site_id,total_cents) VALUES ('acct-a','site-b',1200)"),/orders_site_account_mismatch/);
    db.exec("INSERT INTO orders(account_id,site_id,customer_email,total_cents) VALUES ('acct-a','site-a','test@example.com',1200)");
    assert.deepEqual({...db.prepare('SELECT account_id,site_id,total_cents FROM orders').get()},{
      account_id:'acct-a',site_id:'site-a',total_cents:1200
    });
    assert.throws(()=>db.exec("UPDATE orders SET account_id='acct-b',site_id='site-b' WHERE id=1"),/orders_owner_immutable/);
    db.exec("UPDATE orders SET status='paid' WHERE id=1");
    assert.equal(db.prepare('SELECT status FROM orders WHERE id=1').get().status,'paid');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  } finally {db.close();}
});

test('preview checkout cannot be mistaken for a paid order, and is strictly site-owned',()=>{
  const db=dbFixture();
  try {
    assert.throws(()=>db.exec("INSERT INTO cms_checkout_previews(account_id,site_id) VALUES ('acct-a','site-b')"),/checkout_preview_site_account_mismatch/);
    assert.throws(()=>db.exec("INSERT INTO cms_checkout_previews(account_id,site_id,status) VALUES ('acct-a','site-a','paid')"),/CHECK constraint failed/);
    db.exec("INSERT INTO cms_checkout_previews(account_id,site_id,customer_label,selected_offer_sku) VALUES ('acct-a','site-a','customer123','stock-plan')");
    const row=db.prepare('SELECT id,account_id,site_id,step,status,revision FROM cms_checkout_previews').get();
    assert.match(row.id,/^cprev_[a-f0-9]{24}$/);
    assert.equal(row.status,'draft');
    assert.equal(row.step,'choose-plan');
    assert.equal(row.revision,1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,0);
    assert.throws(()=>db.prepare("UPDATE cms_checkout_previews SET site_id='site-b' WHERE id=?").run(row.id),/checkout_preview_owner_immutable/);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  } finally{db.close();}
});
