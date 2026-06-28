import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AgentSam, routeIntent, getToolCatalog } from '../src/index.js';
import { scaffoldProject } from '../src/lib/scaffold.js';

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
const cwd = process.cwd();
process.chdir(tmp);
const dir = scaffoldProject({ projectName: 'CMS Demo', lane: 'CMS', provider: 'Cloudflare Workers', agent: 'cms' });
process.chdir(cwd);
assert.ok(fs.existsSync(path.join(dir, 'src/index.js')));
assert.ok(fs.readFileSync(path.join(dir, 'migrations/0001_agentsam_core.sql'), 'utf8').includes('cms_pages'));
assert.ok(fs.readFileSync(path.join(dir, 'package.json'), 'utf8').includes('wrangler'));

console.log('SDK smoke tests passed');
