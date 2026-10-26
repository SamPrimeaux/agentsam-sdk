import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { handleStudioPlatformProducts } from '../backend/worker/studio-platform-products.js';

function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE code_repositories (id TEXT PRIMARY KEY, account_id TEXT, is_active INTEGER);
    CREATE TABLE agentsam_products(id TEXT PRIMARY KEY,slug TEXT,name TEXT,kind TEXT,status TEXT,version TEXT,repository_id TEXT,package_name TEXT,metadata TEXT);
    INSERT INTO code_repositories VALUES ('repo_a','account_a',1),('repo_b','account_b',1);
    INSERT INTO agentsam_products VALUES ('prod_a','one','One','app','released','1','repo_a','@demo/one','{"origin":"developer","preserved":true}');
    INSERT INTO agentsam_products VALUES ('prod_b','two','Two','app','released','1','repo_b','@demo/two','{"account_id":"account_b"}');
    INSERT INTO agentsam_products VALUES ('prod_c','three','Three','app','prototype','1',NULL,NULL,'{"account_id":"account_a"}');`);
  const DB = { prepare(query) {
    const statement = sql.prepare(query); let args = [];
    const wrapped = {
      bind(...values) { args = values; return wrapped; },
      async all() { return { results:statement.all(...args) }; },
      async first() { return statement.get(...args) || null; },
      async run() { return { meta:{ changes:Number(statement.run(...args).changes) } }; },
    };
    return wrapped;
  } };
  return { DB, sql };
}
const base = 'https://studio.example/api/admin/platform/products';
const patch = (id, body, extra = {}) => new Request(base + '/' + id, {
  method:'PATCH', headers:{'content-type':'application/json',...extra}, body:JSON.stringify(body),
});

test('platform list is bound to account metadata or a registered active repository', async () => {
  const env = database();
  const response = await handleStudioPlatformProducts(new Request(base),env,'account_a');
  const { products } = await response.json();
  assert.deepEqual(products.map(p=>p.id),['prod_a','prod_c']);
  assert.equal((await handleStudioPlatformProducts(new Request(base),env,null)).status,401);
  env.sql.close();
});

test('details save round-trips, preserves provenance and release identity, and rejects stale writes', async () => {
  const env = database();
  const { products } = await (await handleStudioPlatformProducts(new Request(base),env,'account_a')).json();
  const input = {...products[0], name:'Renamed',description:'Description',collection:'Apps',thumbnail_url:'/brand/one.svg'};
  const body = Object.fromEntries(['revision','name','description','collection','thumbnail_url'].map(k=>[k,input[k]]));
  const response = await handleStudioPlatformProducts(patch('prod_a',body),env,'account_a');
  assert.equal(response.status,200);
  const row=env.sql.prepare('SELECT * FROM agentsam_products WHERE id=?').get('prod_a');
  assert.equal(row.name,'Renamed');
  assert.equal(row.status,'released');
  assert.equal(row.version,'1');
  assert.equal(JSON.parse(row.metadata).preserved,true);
  assert.equal(JSON.parse(row.metadata).origin,'developer');
  const saved=(await response.json()).product;
  assert.equal(saved.collection,'Apps');
  assert.notEqual(saved.revision,body.revision);
  assert.equal((await handleStudioPlatformProducts(patch('prod_a',body),env,'account_a')).status,409);
  assert.equal((await handleStudioPlatformProducts(patch('prod_b',body),env,'account_a')).status,404);
  assert.equal((await handleStudioPlatformProducts(patch('prod_a',{...body,revision:saved.revision,status:'released'}),env,'account_a')).status,400);
  assert.equal((await handleStudioPlatformProducts(patch('prod_a',{...body,revision:saved.revision,thumbnail_url:'javascript:alert(1)'}),env,'account_a')).status,400);
  assert.equal((await handleStudioPlatformProducts(patch('prod_a',body,{origin:'https://other.example'}),env,'account_a')).status,403);
  env.sql.close();
});
