import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'src', 'cli.js');
const sdkPackage = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-bootstrap-'));

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: options.cwd || root,
    env: { ...process.env, NO_COLOR: '1' },
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
  }
  assert.equal(result.status, 0, `CLI failed: agentsam ${args.join(' ')}`);
  return result;
}

try {
  run(['init', '--name', 'my-agent', '--lane', 'fullstack', '--run-target', 'local', '--yes'], {
    cwd: tmp,
  });

  const project = path.join(tmp, 'my-agent');
  const generatedPackage = JSON.parse(fs.readFileSync(path.join(project, 'package.json'), 'utf8'));
  const config = JSON.parse(fs.readFileSync(path.join(project, '.agentsam', 'config.json'), 'utf8'));

  assert.equal(generatedPackage.scripts?.smoke, 'node --env-file=.env ./scripts/smoke.mjs');
  assert.equal(generatedPackage.scripts?.status, 'agentsam status');
  assert.equal(generatedPackage.scripts?.pty, 'agentsam start-local');
  assert.equal(generatedPackage.scripts?.['db:status'], 'agentsam db status');
  assert.equal(generatedPackage.scripts?.tui, undefined);
  assert.equal(generatedPackage.scripts?.['tui:rich'], undefined);
  assert.equal(
    generatedPackage.dependencies?.['@inneranimalmedia/agentsam-sdk'],
    sdkPackage.version.includes('-') ? sdkPackage.version : `^${sdkPackage.version}`,
    'scaffolds pin prereleases and accept compatible stable SDK versions',
  );
  assert.equal(config.schema_version, 2);
  assert.equal(config.project?.name, 'my-agent');
  assert.match(config.repository?.id || '', /^local:[0-9a-f-]{36}$/);
  assert.equal(config.product?.preset, 'fullstack');
  assert.equal(config.defaults?.runtime, 'local');
  assert.equal(config.defaults?.model, 'auto');
  assert.equal(config.defaults?.deploy_target, null);
  assert.equal(config.rules?.file, '.agentsamrules');
  assert.equal(config.local?.database, '.agentsam/data/agentsam.sqlite');
  assert.equal(config.local?.schema, 'db/schema.sql');
  assert.equal(config.sdk?.created_with, sdkPackage.version);
  assert.equal(config.account_id, undefined);
  assert.equal(config.current_run_id, undefined);
  assert.equal(config.latest_merkle_root, undefined);
  assert.ok(fs.existsSync(path.join(project, '.git')));
  assert.ok(fs.existsSync(path.join(project, '.env')));
  assert.ok(fs.existsSync(path.join(project, '.agentsamrules')));
  assert.match(fs.readFileSync(path.join(project, '.agentsamrules'), 'utf8'), /Agent Sam project rules/);
  assert.ok(fs.existsSync(path.join(project, '.env.example')));
  assert.ok(fs.existsSync(path.join(project, 'db', 'schema.sql')));
  assert.ok(fs.existsSync(path.join(project, '.agentsam', 'data', 'agentsam.sqlite')));
  assert.ok(fs.existsSync(path.join(project, 'src', 'agent.js')));
  assert.ok(fs.existsSync(path.join(project, 'scripts', 'smoke.mjs')));
  assert.ok(!fs.existsSync(path.join(project, 'wrangler.toml')));
  assert.ok(!fs.existsSync(path.join(project, 'agentsam.config.js')));
  assert.ok(!fs.existsSync(path.join(project, 'gorilla')));

  run(['status', '--json'], { cwd: project });
  run(['models', '--json'], { cwd: project });
  run(['db', 'status'], { cwd: project });

  console.log(`verify-bootstrap OK ${sdkPackage.name}@${sdkPackage.version}`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
