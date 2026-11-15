import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const patch = readFileSync(new URL('../db/patches/20261102_existing_cms_site_and_theme_storage.sql', import.meta.url), 'utf8');
const studioPatch = readFileSync(new URL('../db/patches/20261114_account_scoped_theme_studio.sql', import.meta.url), 'utf8');

test('live-schema repair preserves existing site identity and creates only canonical draft storage', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`
      PRAGMA foreign_keys=ON;
      CREATE TABLE accounts (id TEXT PRIMARY KEY);
      INSERT INTO accounts(id) VALUES ('au_owner'),('au_other');
      CREATE TABLE agentsam_products (id TEXT PRIMARY KEY);
      CREATE TABLE cms_sites (
        id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
        name TEXT NOT NULL, slug TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft', primary_domain TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(account_id,slug)
      );
      INSERT INTO cms_sites(id,account_id,name,slug,status,primary_domain) VALUES
        ('site_agentsam','au_owner','AgentSam','agentsam-sdk','active','agentsam.inneranimalmedia.com'),
        ('site_client','au_owner','Client','client','active','client.example.com'),
        ('site_other','au_other','Another site','one','draft',NULL);
    `);
    const before = db.prepare('SELECT id, account_id, name, slug, primary_domain FROM cms_sites ORDER BY id').all();
    db.exec(patch);
    db.exec(studioPatch);
    db.exec(studioPatch); // idempotent on retry
    assert.deepEqual(db.prepare('SELECT id, account_id, name, slug, primary_domain FROM cms_sites ORDER BY id').all(), before);
    assert.deepEqual(
      db.prepare('SELECT id FROM cms_sites WHERE is_default=1 ORDER BY id').all().map(x=>x.id),
      ['site_other']
    );
    db.prepare('UPDATE cms_sites SET is_default=1 WHERE id=?').run('site_client');
    assert.throws(() => db.prepare('UPDATE cms_sites SET is_default=1 WHERE id=?').run('site_agentsam'), /UNIQUE/i);
    db.prepare(`INSERT INTO cms_globals (id,account_id,site_id,global_key,global_type)
      VALUES ('global_1','au_owner','site_agentsam','theme-project:theme_resolve','theme-project')`).run();
    db.prepare(`INSERT INTO cms_revisions(account_id,site_id,entity_type,entity_id,revision_number,revision_kind,content_object_key)
      VALUES ('au_owner','site_agentsam','global','global_1',1,'draft','cms/test.json')`).run();
    db.prepare(`INSERT INTO cms_artifacts(id,account_id,artifact_key,artifact_type,version,object_prefix,manifest_object_key,content_hash)
      VALUES ('art_1','au_owner','theme/resolve','theme','2.6.13','cms/test','cms/test/manifest.json','abc')`).run();
    assert.equal(db.prepare('SELECT count(*) AS total FROM cms_globals').get().total,1);
    assert.equal(db.prepare('SELECT count(*) AS total FROM cms_revisions').get().total,1);
    assert.equal(db.prepare('SELECT count(*) AS total FROM cms_artifacts').get().total,1);
    db.prepare(`INSERT INTO cms_theme_studio_projects
      (id,account_id,project_id,inline_content_json,content_object_key,content_version)
      VALUES ('studio_1','au_owner','theme_plain_jane','{}','cms/accounts/au_owner/studio/theme-projects/theme_plain_jane/rev1.json',1)`).run();
    assert.equal(db.prepare('SELECT count(*) AS total FROM cms_theme_studio_projects').get().total,1);
    assert.equal(db.prepare('SELECT count(*) AS total FROM cms_sites').get().total,3,
      'creating a Theme Studio draft does not require or create a site');
    assert.throws(() => db.prepare(`INSERT INTO cms_globals(id,account_id,site_id,global_key,global_type)
      VALUES ('invalid','au_other','site_agentsam','attempt','theme-project')`).run(), /FOREIGN KEY/i);
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  } finally { db.close(); }
});
