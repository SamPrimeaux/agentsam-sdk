import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  AgentSam,
  ToolRunner,
  routeIntent,
  getToolCatalog,
  runDoctor,
  scanCloudflareInventory,
} from '../src/index.js';
import { buildLocalScaffoldMeta } from '../src/lib/local-scaffold.js';
import { writeScaffoldFiles } from '../src/lib/write-files.js';
import { copyGorillaTemplate } from '../src/lib/gorilla-template.js';
import { printContextSummary, missingForInit } from '../src/lib/detect-context.js';
import { runStatus } from '../src/commands/status.js';
import { runCloudflareCommand } from '../src/commands/cloudflare.js';

const app = new AgentSam({ project: 'smoke', lane: 'cms', agent: 'cms' });
let res = await app.handle(new Request('https://example.com/api/health'));
assert.equal(res.status, 200);
assert.equal((await res.json()).ok, true);

res = await app.handle(new Request('https://example.com/api/agentsam/info'));
const info = await res.json();
assert.equal(info.agent, 'cms');
assert.ok(info.capabilities.includes('page'));
assert.ok(info.tools.some((tool) => tool.name === 'local.doctor'));
assert.ok(info.tools.some((tool) => tool.name === 'cloudflare.inventory'));

res = await app.handle(new Request('https://example.com/api/agentsam/message', {
  method: 'POST',
  body: JSON.stringify({ message: 'create an analytics page in the cms' }),
}));
const message = await res.json();
assert.equal(message.agent, 'cms');
assert.equal(message.intent, 'cms_build');

res = await app.handle(new Request('https://example.com/api/agentsam/tool', {
  method: 'POST',
  body: JSON.stringify({ tool: 'local.doctor', input: { cwd: process.cwd(), ptyHealthUrl: 'http://127.0.0.1:1/health' } }),
}));
const endpointToolResult = await res.json();
assert.equal(res.status, 200);
assert.equal(endpointToolResult.ok, true);
assert.equal(endpointToolResult.tool, 'local.doctor');

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
assert.ok(SLASH_COMMANDS.some((c) => c.cmd === '/deploy'));
assert.equal(listSlashCommands({ lane: 'deploy' }).length, 2);

printContextSummary({
  iam: { ready: true, source: 'sdk-token', detail: 'AGENTSAM_SDK_TOKEN' },
  gcp: { source: 'vm-metadata', email: 'connor@example.test' },
  gcp_vm: true,
  github: { source: 'gh-cli', account: 'connor@example.com' },
  cloudflare: { source: 'wrangler', account: 'connor@cloudflare.test' },
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

const runner = new ToolRunner({ runtime: 'local' });
runner.registerTool('demo.echo', async (input) => ({ echo: input.value }), { readOnly: true });
const toolResult = await runner.runTool('demo.echo', { value: 'ok' });
assert.equal(toolResult.ok, true);
assert.equal(toolResult.data.echo, 'ok');
assert.equal(toolResult.trace.runtime, 'local');

const doctor = await runDoctor({ cwd: gorillaDir });
assert.equal(doctor.ok, true);
assert.ok(Array.isArray(doctor.data.checks));

const previousToken = process.env.CLOUDFLARE_API_TOKEN;
const previousAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
delete process.env.CLOUDFLARE_API_TOKEN;
delete process.env.CLOUDFLARE_ACCOUNT_ID;
const inventory = await scanCloudflareInventory();
assert.equal(inventory.ok, false);
assert.equal(inventory.error.code, 'cloudflare_env_missing');
if (previousToken) process.env.CLOUDFLARE_API_TOKEN = previousToken;
if (previousAccount) process.env.CLOUDFLARE_ACCOUNT_ID = previousAccount;

assert.equal(typeof runStatus, 'function');
assert.equal(typeof runCloudflareCommand, 'function');

console.log('SDK smoke tests passed');
