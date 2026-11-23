import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { discoverProjectStores, selectKnowledgeStore } from '../../src/knowledge/store-discovery.js';
import { initRepository, readConfig } from '../../src/knowledge/config.js';
import { dispatchShellLine } from '../../src/commands/shell.js';

test('store discovery reads JSONC bindings without leaking credentials or selecting application storage', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-store-discovery-'));
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"stores"}');
  fs.writeFileSync(path.join(root, 'wrangler.jsonc'), `{
    // Existing application authority
    "vars": {"PASSWORD":"do-not-emit"},
    "d1_databases": [{"binding":"DB","database_name":"existing-app"}],
    "hyperdrive": [{"binding":"HYPERDRIVE","id":"existing-pool"}],
    "env": {"preview":{"d1_databases":[{"binding":"DB","database_name":"preview-app"}]}}
  }`);
  const result = await discoverProjectStores(root, { DATABASE_URL: 'postgres://secret:password@private/db' });
  assert.equal(result.candidates.find(c => c.driver === 'd1').name, 'existing-app');
  assert.equal(result.candidates.find(c => c.environment === 'preview').name, 'preview-app');
  assert.ok(result.candidates.filter(c => c.role === 'application').every(c => c.selectable === false));
  assert.equal(result.candidates.find(c => c.driver === 'postgres'), undefined, 'ambient DATABASE_URL must not be adopted; Postgres is opt-in');
  assert.doesNotMatch(JSON.stringify(result), /password|secret|do-not-emit/);
  assert.equal(fs.existsSync(path.join(root, '.agentsam')), false);
  let output = '';
  await dispatchShellLine('/db sources', { cwd: root, write: s => { output += s; }, interactive: false });
  assert.match(output, /existing-app/);
});

test('knowledge selection edits existing portable config without overwriting scope or moving runtime data', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-store-selection-'));
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"stores"}');
  initRepository(root, { repositoryId: 'repo:test', include: ['src'] });
  await selectKnowledgeStore(root, 'postgres', 'MY_DATABASE_URL');
  assert.deepEqual(readConfig(root).scope.include, ['src']);
  assert.equal(readConfig(root).storage.connection_env, 'MY_DATABASE_URL');
  assert.equal(fs.existsSync(path.join(root, '.agentsam/data/agentsam.sqlite')), false);
  await assert.rejects(() => selectKnowledgeStore(root, 'postgres', 'postgres://password@host/db'), /connection_env/);
  await assert.rejects(() => selectKnowledgeStore(root, 'postgres'), /connection_env_required/);
  await assert.rejects(() => selectKnowledgeStore(root, 'd1'), /d1_binding_not_found/);
  fs.writeFileSync(path.join(root, 'wrangler.jsonc'), '{"name":"x","d1_databases":[{"binding":"DB","database_name":"my-app-db","database_id":"abc"}]}');
  await selectKnowledgeStore(root, 'd1');
  assert.deepEqual(readConfig(root).storage, { driver: 'd1', database: 'my-app-db', binding: 'DB', config: 'wrangler.jsonc' });
  await selectKnowledgeStore(root, 'sqlite');
  assert.deepEqual(readConfig(root).storage, { driver: 'sqlite' });
});
