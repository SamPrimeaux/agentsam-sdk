import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  AgentSam,
  collectNpmDependencies,
  createOsvQueries,
  getToolCatalog,
  scanProjectSecurity,
  routeIntent,
} from '../src/index.js';
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

const securityDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-sca-test-'));
fs.writeFileSync(path.join(securityDir, 'package-lock.json'), JSON.stringify({
  lockfileVersion: 3,
  packages: {
    '': { dependencies: { lodash: '^4.17.20' } },
    'node_modules/lodash': { version: '4.17.20' },
  },
}, null, 2));

const deps = collectNpmDependencies(securityDir);
assert.equal(deps.length, 1);
assert.equal(deps[0].name, 'lodash');
assert.equal(deps[0].direct, true);
assert.deepEqual(createOsvQueries(deps), [{ package: { ecosystem: 'npm', name: 'lodash' }, version: '4.17.20' }]);

const securityReport = await scanProjectSecurity({ projectRoot: securityDir, queryOsv: false });
assert.equal(securityReport.scanner, 'agentsam-sca');
assert.equal(securityReport.dependency_count, 1);
assert.equal(securityReport.vulnerable_count, 0);

console.log('SDK smoke tests passed');
