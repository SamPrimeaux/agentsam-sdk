import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../backend/migrations/1380_ecommerce_cms_canonical_app_launch.sql', import.meta.url), 'utf8');

test('Commerce CMS launcher uses canonical Online Store without uninstalling the app', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec("CREATE TABLE apps (id TEXT PRIMARY KEY, launch_url TEXT, updated_at INTEGER);");
    db.exec("CREATE TABLE agentsam_app_installations (app_id TEXT,account_id TEXT,enabled INTEGER);");
    db.exec("INSERT INTO apps VALUES ('ecommerce-cms-agentsam','/apps/ecommerce-cms-agentsam',1),('cad-creator','/admin/cad',1);");
    db.exec("INSERT INTO agentsam_app_installations VALUES ('ecommerce-cms-agentsam','owner',1);");
    db.exec(sql);
    db.exec(sql);
    assert.equal(db.prepare("SELECT launch_url FROM apps WHERE id='ecommerce-cms-agentsam'").get().launch_url,'/admin/store');
    assert.equal(db.prepare("SELECT launch_url FROM apps WHERE id='cad-creator'").get().launch_url,'/admin/cad');
    assert.equal(db.prepare("SELECT enabled FROM agentsam_app_installations").get().enabled,1);
  } finally { db.close(); }
});
