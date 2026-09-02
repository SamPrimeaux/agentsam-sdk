import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentSam, routeIntent, getToolCatalog } from '../src/index.js';
import { buildLocalScaffoldMeta, sdkDependencySpec } from '../src/lib/local-scaffold.js';
import { writeScaffoldFiles } from '../src/lib/write-files.js';
import { initializeLocalSqlite, createLocalSqliteDatabase } from '../src/local/sqlite.js';
import { printContextSummary, missingForInit } from '../src/lib/detect-context.js';

const app = new AgentSam({ project: 'smoke', lane: 'cms', agent: 'cms' });
let res = await app.handle(new Request('https://example.com/api/health'));
assert.equal(res.status, 200);
assert.equal((await res.json()).ok, true);

res = await app.handle(new Request('https://example.com/api/agentsam/info'));
const info = await res.json();
assert.equal(info.agent, 'cms');
assert.ok(info.capabilities.includes('page'));

res = await app.handle(new Request('https://example.com/api/agentsam/message', {
  method: 'POST',
  body: JSON.stringify({ message: 'create an analytics page in the cms' }),
}));
const message = await res.json();
assert.equal(message.agent, 'cms');
assert.equal(message.intent, 'cms_build');

assert.equal(routeIntent({ message: 'drop table users' }).requires_approval, true);
assert.ok(getToolCatalog('Data Solutions').some((tool) => tool.name === 'query'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-sdk-test-'));
const dir = writeScaffoldFiles(path.join(tmp, 'demo-project'), [
  { path: 'src/agent.js', content: 'export function createAgent() {}\n' },
  { path: 'db/schema.sql', content: 'CREATE TABLE cms_pages (id TEXT PRIMARY KEY);\n' },
  { path: '.env.example', content: 'AGENTSAM_DB=.agentsam/data/agentsam.sqlite\n' },
]);
assert.ok(fs.existsSync(path.join(dir, 'src/agent.js')));
assert.ok(fs.readFileSync(path.join(dir, 'db/schema.sql'), 'utf8').includes('cms_pages'));
assert.ok(fs.readFileSync(path.join(dir, '.env.example'), 'utf8').includes('AGENTSAM_DB'));

import { SLASH_COMMANDS, listSlashCommands } from '../src/lib/slash-commands.js';
import { createIdentityClient, AUTH_COOKIE_NAME } from '../src/index.js';
import { finalizeInboundOAuth } from '../packages/identity/src/oauth/callback.js';
assert.equal(AUTH_COOKIE_NAME, 'session');
assert.equal(createIdentityClient().providers.google()?.id, 'google');
const { GoogleProvider } = await import('@inneranimalmedia/agentsam-sdk/identity/providers/google');
assert.equal(GoogleProvider.id, 'google');
const { handleIdentityWorkerRequest } = await import('@inneranimalmedia/agentsam-sdk/identity/server/worker-router');
assert.equal(typeof handleIdentityWorkerRequest, 'function');
const { buildIdentityAppScaffold } = await import('../src/lib/identity-scaffold.js');
assert.ok(buildIdentityAppScaffold({ projectName: 'x' })['backend/src/index.js']);
await assert.rejects(() => finalizeInboundOAuth({}, new Request('https://x'), {}), /adapter/);
assert.ok(SLASH_COMMANDS.some((c) => c.cmd === '/deploy'));
assert.ok(SLASH_COMMANDS.some((c) => c.cmd === '/db'));
assert.ok(SLASH_COMMANDS.some((c) => c.cmd === '/agent'));
assert.deepEqual(
  listSlashCommands({ lane: 'deploy' }).map(({ cmd }) => cmd),
  ['/help', '/deploy'],
  'deploy lane keeps global help and excludes commands from other lanes',
);

printContextSummary({
  iam: { ready: true, source: 'sdk-token', detail: 'AGENTSAM_SDK_TOKEN' },
  gcp: { source: 'vm-metadata', email: 'execos@project.iam.gserviceaccount.com' },
  gcp_vm: true,
  github: { source: 'gh-cli', account: 'user@example.com' },
  cloudflare: { source: 'wrangler', account: 'user@cloudflare.test' },
});
assert.deepEqual(missingForInit({ iam: { ready: false } }, '', { runTarget: 'local' }), []);
assert.deepEqual(missingForInit({ iam: { ready: false } }, '', { runTarget: 'cloudflare' }), ['iam']);

assert.equal(sdkDependencySpec('2.0.0-alpha.identity.12'), '2.0.0-alpha.identity.12');
assert.equal(sdkDependencySpec('2.1.3'), '^2.1.3');
const prereleaseMeta = buildLocalScaffoldMeta(
  { projectName: 'alpha-demo', lane: 'fullstack', runTarget: 'local' },
  '2.0.0-alpha.identity.12',
);
const prereleasePackage = JSON.parse(prereleaseMeta.files.find((f) => f.path === 'package.json').content);
assert.equal(
  prereleasePackage.dependencies['@inneranimalmedia/agentsam-sdk'],
  '2.0.0-alpha.identity.12',
);

const localMeta = buildLocalScaffoldMeta({ projectName: 'demo', lane: 'cms', runTarget: 'local' });
assert.equal(localMeta.laneKey, 'cms');
assert.ok(localMeta.files.some((f) => f.path === '.agentsam/start-local.md'));
assert.ok(localMeta.files.some((f) => f.path === 'db/schema.sql'));
assert.ok(localMeta.files.some((f) => f.path === '.env'));
assert.ok(localMeta.files.some((f) => f.path === '.env.example'));
assert.ok(localMeta.files.some((f) => f.path === 'src/agent.js'));
assert.ok(!localMeta.files.some((f) => f.path === 'wrangler.toml'));
assert.ok(!localMeta.files.some((f) => f.path.startsWith('gorilla/')));
assert.ok(!localMeta.files.some((f) => f.path.includes('execos')));

const localDir = path.join(tmp, 'local-project');
writeScaffoldFiles(localDir, localMeta.files);
const localDb = await initializeLocalSqlite({
  dbPath: path.join(localDir, '.agentsam', 'data', 'agentsam.sqlite'),
  schemaPath: path.join(localDir, 'db', 'schema.sql'),
});
assert.ok(localDb.tables.includes('agent_sessions'));
const d1Like = await createLocalSqliteDatabase(localDb.dbPath);
await d1Like.prepare('INSERT INTO agent_sessions (id, agent, lane, status) VALUES (?, ?, ?, ?)').bind(
  'sess_test', 'cms', 'cms', 'created',
).run();
const persisted = await d1Like.prepare('SELECT id FROM agent_sessions WHERE id = ?').bind('sess_test').first();
assert.equal(persisted.id, 'sess_test');
d1Like.close();

const tunnelPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'commands', 'tunnel.js');
const tunnelSrc = fs.readFileSync(tunnelPath, 'utf8');
assert.ok(tunnelSrc.includes('register-local'));
assert.ok(tunnelSrc.includes('cloudflared'));
assert.ok(fs.existsSync(tunnelPath));

console.log('SDK smoke tests passed');
