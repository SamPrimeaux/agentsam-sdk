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

test('generic canonical tables support channels, materials and external references', () => {
  const db = database();
  db.exec([
    "INSERT INTO campaign_scopes(id,owner_kind,owner_ref) VALUES ('account:example','account','example');",
    "INSERT INTO campaigns(id,scope_id,name,slug,kind,status) VALUES ('c_1','account:example','Example campaign','example','event','draft');",
    "INSERT INTO campaign_channels(id,scope_id,campaign_id,channel_key) VALUES ('ch_1','account:example','c_1','email');",
    "INSERT INTO campaign_materials(id,scope_id,campaign_id,material_type,title,content_json) VALUES ('m_1','account:example','c_1','landing_page','Draft','{\"headline\":\"Example\"}');",
    "INSERT INTO campaign_asset_refs(id,scope_id,campaign_id,provider,external_asset_id) VALUES ('asset_1','account:example','c_1','asset_service','media_1');",
    "INSERT INTO campaign_source_links(id,scope_id,campaign_id,source_system,source_table,source_id) VALUES ('source_1','account:example','c_1','external','reference','ref_1');",
  ].join('\n'));
  assert.equal(count(db,'campaigns'),1);
  assert.equal(count(db,'campaign_channels'),1);
  assert.equal(count(db,'campaign_materials'),1);
  assert.equal(count(db,'campaign_asset_refs'),1);
  assert.equal(count(db,'campaign_source_links'),1);
  assert.equal(count(db,'campaign_publications'),0);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  db.close();
});

test('portable repository enforces authorized scope and optimistic revision on CRUD', async () => {
  const db = database();
  db.exec(`
    INSERT INTO campaign_scopes(id,owner_kind,owner_ref) VALUES
      ('account:a','account','a'),('account:b','account','b');
  `);
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
