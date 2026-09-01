import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentSam, routeIntent, getToolCatalog } from '../src/index.js';
import { buildLocalScaffoldMeta, sdkDependencySpec } from '../src/lib/local-scaffold.js';
import { writeScaffoldFiles } from '../src/lib/write-files.js';
import { copyGorillaTemplate } from '../src/lib/gorilla-template.js';
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
  { path: 'src/index.js', content: 'export default {};\n' },
  { path: 'migrations/0001_agentsam_core.sql', content: 'CREATE TABLE cms_pages (id TEXT);\n' },
  { path: 'package.json', content: '{"name":"demo","devDependencies":{"wrangler":"^4"}}\n' },
]);
assert.ok(fs.existsSync(path.join(dir, 'src/index.js')));
assert.ok(fs.readFileSync(path.join(dir, 'migrations/0001_agentsam_core.sql'), 'utf8').includes('cms_pages'));
assert.ok(fs.readFileSync(path.join(dir, 'package.json'), 'utf8').includes('wrangler'));

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
assert.equal(listSlashCommands({ lane: 'deploy' }).length, 2);

printContextSummary({
  iam: { ready: true, source: 'sdk-token', detail: 'AGENTSAM_SDK_TOKEN' },
  gcp: { source: 'vm-metadata', email: 'execos@project.iam.gserviceaccount.com' },
  gcp_vm: true,
  github: { source: 'gh-cli', account: 'user@example.com' },
  cloudflare: { source: 'wrangler', account: 'user@cloudflare.test' },
});
assert.deepEqual(missingForInit({ iam: { ready: false } }, '', { runTarget: 'local' }), []);
assert.deepEqual(missingForInit({ iam: { ready: false } }, '', { runTarget: 'cloudflare' }), ['iam']);

const localMeta = buildLocalScaffoldMeta({ projectName: 'demo', lane: 'cms', runTarget: 'local' });
assert.equal(localMeta.laneKey, 'cms');
assert.ok(localMeta.files.some((f) => f.path === '.agentsam/start-local.md'));
assert.ok(localMeta.files.some((f) => f.path === 'wrangler.toml'));
assert.ok(localMeta.files.some((f) => f.path === '.env'));
assert.ok(!localMeta.files.some((f) => f.path.includes('execos')));

const gorillaDir = path.join(tmp, 'gorilla-project');
writeScaffoldFiles(gorillaDir, localMeta.files);
copyGorillaTemplate(gorillaDir, localMeta);
assert.ok(fs.existsSync(path.join(gorillaDir, 'gorilla', 'App.tsx')));
assert.ok(fs.existsSync(path.join(gorillaDir, 'vite.config.js')));
assert.ok(fs.readFileSync(path.join(gorillaDir, 'gorilla', 'App.tsx'), 'utf8').includes('demo'));

const tunnelPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'commands', 'tunnel.js');
const tunnelSrc = fs.readFileSync(tunnelPath, 'utf8');
assert.ok(tunnelSrc.includes('register-local'));
assert.ok(tunnelSrc.includes('cloudflared'));
assert.ok(fs.existsSync(tunnelPath));

console.log('SDK smoke tests passed');
