import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { canonicalCampaignScope, createCampaignStore } from '../src/storage.js';
import { handleCampaignApi } from '../src/http.js';

const sql = (name) => readFileSync(new URL('../sql/' + name, import.meta.url), 'utf8');
const database = () => {
  const db = new DatabaseSync(':memory:');
  db.exec(sql('0001_campaign_core.sql'));
  return db;
};
const count = (db, table) => db.prepare('SELECT count(*) n FROM ' + table).get().n;
const adapter = (sqlite) => ({
  prepare(statement) {
    return {
      bind(...args) {
        const stmt = sqlite.prepare(statement);
        return {
          first: async () => stmt.get(...args) || null,
          all: async () => ({ results: stmt.all(...args) }),
          run: async () => ({ meta: { changes: stmt.run(...args).changes } }),
        };
      },
    };
  },
});

test('canonical D1 schema applies twice with no destructive reset', () => {
  const db = database();
  db.exec("INSERT INTO campaign_scopes(id,owner_kind,owner_ref) VALUES ('account:a','account','a')");
  db.exec(sql('0001_campaign_core.sql'));
  assert.equal(count(db, 'campaign_schema_versions'), 1);
  assert.equal(count(db, 'campaign_scopes'), 1);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'campaign_%'").all();
  assert.equal(tables.length, 11);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  db.close();
});

test('Fuel & Free Time seed imports campaigns, channels and packs exactly once', () => {
  const db = database();
  db.exec(\`
    CREATE TABLE growth_campaigns(
      id TEXT PRIMARY KEY, account_id TEXT, created_by TEXT, updated_by TEXT,
      name TEXT, slug TEXT, goal TEXT, audience TEXT, priority TEXT, brief TEXT,
      channels_json TEXT, status TEXT, approval_mode TEXT, primary_source TEXT,
      start_date TEXT, end_date TEXT, pack_json TEXT, metadata_json TEXT,
      session_count INTEGER, attributed_revenue_cents INTEGER, created_at TEXT, updated_at TEXT);
    INSERT INTO growth_campaigns VALUES(
      'gc_a','acct_a','user_a','user_a','Launch','launch','Awareness','Subscribers','normal',
      'Brief','["email","homepage_banner"]','review','draft_only','website_email',
      NULL,NULL,'{"email_subject":"Hello"}','{}',12,0,'2026-10-01','2026-10-02');
  \`);
  db.exec(sql('backfill/fuelnfreetime.sql'));
  db.exec(sql('backfill/fuelnfreetime.sql'));
  assert.equal(count(db, 'campaigns'), 1);
  assert.equal(count(db, 'campaign_scopes'), 1);
  assert.equal(count(db, 'campaign_channels'), 2);
  assert.equal(count(db, 'campaign_materials'), 1);
  assert.equal(count(db, 'campaign_metric_facts'), 1);
  assert.equal(count(db, 'campaign_source_links'), 1);
  assert.equal(count(db, 'campaign_publications'), 0);
  assert.equal(db.prepare('SELECT count(*) n FROM growth_campaigns').get().n, 1);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  db.close();
});

test('Companions maps fundraisers, updates, asset refs and emails without fake publication', () => {
  const db = database();
  db.exec(\`
    CREATE TABLE fundraising_campaigns (
      id TEXT PRIMARY KEY, tenant_id TEXT, title TEXT, slug TEXT, campaign_type TEXT,
      status TEXT, description TEXT, short_description TEXT, starts_at TEXT, ends_at TEXT,
      goal_amount_cents INTEGER, raised_amount_cents INTEGER, donor_count INTEGER,
      is_public INTEGER, config_json TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE campaign_updates (
      id TEXT PRIMARY KEY, tenant_id TEXT, campaign_id TEXT, title TEXT, body TEXT,
      update_type TEXT, milestone_amount_cents INTEGER, is_public INTEGER,
      published_at TEXT, status TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE cms_assets(id TEXT PRIMARY KEY,tenant_id TEXT,campaign_id TEXT,update_id TEXT,usage_type TEXT);
    CREATE TABLE email_campaigns(
      id TEXT PRIMARY KEY,tenant_id TEXT,name TEXT,subject TEXT,body_html TEXT,
      body_text TEXT,audience_type TEXT,status TEXT,scheduled_at TEXT,sent_at TEXT,
      created_by TEXT,created_at TEXT,updated_at TEXT);
    INSERT INTO fundraising_campaigns VALUES(
      'fund1','tenant_a','Freedom','freedom','fundraiser','active','Description','Short',
      NULL,NULL,10000,2500,2,1,'{}','2026-10-01','2026-10-02');
    INSERT INTO campaign_updates VALUES(
      'up1','tenant_a','fund1','Update','Body','general',NULL,1,'2026-10-03',
      'published','2026-10-02','2026-10-03');
    INSERT INTO cms_assets VALUES ('file1','tenant_a','fund1',NULL,'cover');
    INSERT INTO cms_assets VALUES ('file2','tenant_a',NULL,'up1','update');
    INSERT INTO email_campaigns VALUES (
      'email1','tenant_a','Email Launch','Subject','<p>Hello</p>','Hello',
      'manual','draft',NULL,NULL,'user_a','2026-10-01','2026-10-01');
  \`);
  db.exec(sql('backfill/companions.sql'));
  db.exec(sql('backfill/companions.sql'));
  assert.equal(count(db, 'campaigns'), 2);
  assert.equal(count(db, 'campaign_materials'), 2);
  assert.equal(count(db, 'campaign_asset_refs'), 2);
  assert.equal(count(db, 'campaign_source_links'), 2);
  assert.equal(count(db, 'campaign_publications'), 0);
  assert.equal(db.prepare("SELECT status FROM campaigns WHERE id='fundraising:fund1'").get().status,'active');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  db.close();
});

test('portable repository enforces authorized scope and optimistic revision on CRUD', async () => {
  const db = database();
  db.exec(\`
    INSERT INTO campaign_scopes(id,owner_kind,owner_ref) VALUES
      ('account:a','account','a'),('account:b','account','b');
  \`);
  assert.equal(canonicalCampaignScope('account','a'),'account:a');
  assert.throws(() => canonicalCampaignScope('bad','anything'), /invalid_campaign_scope/);
  const a = createCampaignStore(adapter(db), { authorizedScopeId:'account:a', actorId:'user_a' });
  const b = createCampaignStore(adapter(db), { authorizedScopeId:'account:b', actorId:'user_b' });
  const created = await a.create({name:'First',slug:'first',kind:'marketing'});
  assert.equal(created.revision, 1);
  assert.equal((await a.list()).length, 1);
  assert.equal(await b.get(created.id), null);
  assert.equal((await b.list()).length, 0);
  const changed = await a.update(created.id, 1, {brief:'Updated plan'});
  assert.equal(changed.brief,'Updated plan');
  assert.equal(changed.revision,2);
  await assert.rejects(() => a.update(created.id,1,{brief:'stale'}), /revision_conflict/);
  await assert.rejects(() => a.update(created.id,2,{status:'active'}), /campaign_patch_empty/);
  const archived = await a.archive(created.id,2);
  assert.equal(archived.status,'archived');
  assert.equal(archived.revision,3);
  await assert.rejects(() => a.archive(created.id,3), /revision_conflict/);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  db.close();
});


test('portable HTTP route fails closed and enforces capability + revision', async () => {
  const sqlite = database();
  sqlite.exec("INSERT INTO campaign_scopes(id,owner_kind,owner_ref) VALUES ('account:a','account','a')");
  const db = adapter(sqlite);
  const base = 'https://studio.example/api/campaigns/v1/campaigns';
  const unauthorized = await handleCampaignApi(new Request(base), {});
  assert.equal(unauthorized.status,503);
  const capabilities = [];
  const authorize = async (_request,{capability}) => {
    capabilities.push(capability);
    return { db, authorizedScopeId:'account:a', actorId:'user_a' };
  };
  const created = await handleCampaignApi(new Request(base, {
    method:'POST', headers:{'content-type':'application/json'},
    body:JSON.stringify({name:'Sample',slug:'sample',kind:'marketing'}),
  }), {authorize});
  assert.equal(created.status,201);
  const payload = await created.json();
  assert.equal(payload.ok,true);
  assert.equal(payload.campaign.status,'draft');
  const path = base + '/' + payload.campaign.id;
  const got = await handleCampaignApi(new Request(path),{authorize});
  assert.equal(got.status,200);
  assert.equal(got.headers.get('etag'),'"1"');
  const blocked = await handleCampaignApi(new Request(path, {
    method:'PATCH',headers:{'content-type':'application/json'},
    body:JSON.stringify({status:'active'}),
  }),{authorize});
  assert.equal(blocked.status,409);
  const patched = await handleCampaignApi(new Request(path, {
    method:'PATCH', headers:{'content-type':'application/json','if-match':'"1"'},
    body:JSON.stringify({brief:'Verified brief'}),
  }),{authorize});
  assert.equal(patched.status,200);
  assert.equal((await patched.json()).campaign.revision,2);
  const pub = await handleCampaignApi(new Request(path+'/publications',{method:'POST'}),{authorize});
  assert.equal(pub.status,501);
  assert.deepEqual(capabilities,[
    'campaign.create','campaign.read','campaign.update','campaign.update','campaign.publications.write'
  ]);
  sqlite.close();
});
