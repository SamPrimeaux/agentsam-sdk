#!/usr/bin/env node
/**
 * Smoke test: scaffold a project, verify imports resolve, run health handler in-process.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-sdk-smoke-'));

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

console.log(`→ smoke temp dir: ${tmp}`);

const init = spawnSync(
  process.execPath,
  [
    path.join(root, 'src/cli.js'),
    'init',
    '--name',
    'smoke-project',
    '--lane',
    'fullstack',
    '--provider',
    'cloudflare',
    '--agent',
    'orchestrator',
    '--yes',
  ],
  { cwd: tmp, encoding: 'utf8' },
);

if (init.status !== 0) {
  console.error(init.stdout);
  console.error(init.stderr);
  fail('agentsam init failed');
}

const projectDir = path.join(tmp, 'smoke-project');
for (const file of ['package.json', 'src/index.js', 'wrangler.toml', 'agentsam.config.js']) {
  if (!fs.existsSync(path.join(projectDir, file))) fail(`missing ${file}`);
}

// Link local SDK into scaffold (simulates npm install for dev)
spawnSync('npm', ['link', root], { cwd: projectDir, stdio: 'inherit' });

const { AgentSam, version } = await import(pathToFileURL(path.join(root, 'src/index.js')).href);
if (!version) fail('version export missing');
if (!AgentSam) fail('AgentSam export missing');

const agent = new AgentSam({ env: {}, agent: 'orchestrator' });
const res = await agent.handle(new Request('http://localhost/health'));
const json = await res.json();
if (!json.ok) fail('health handler returned not ok');

console.log('✓ AgentSam health:', json);
console.log(`✓ agentsam-sdk smoke passed (v${version})`);
