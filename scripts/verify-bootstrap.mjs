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
  assert.equal(generatedPackage.scripts?.pty, 'agentsam start-local');
  assert.equal(generatedPackage.scripts?.['db:status'], 'agentsam db status');
  assert.equal(generatedPackage.scripts?.tui, 'agentsam tui');
  assert.equal(
    generatedPackage.dependencies?.['@inneranimalmedia/agentsam-sdk'],
    sdkPackage.version,
    'prerelease scaffolds must install the exact SDK version that generated them',
  );
  assert.equal(config.project, 'my-agent');
  assert.equal(config.run_target, 'local');
  assert.ok(fs.existsSync(path.join(project, 'scripts', 'smoke.mjs')));
  assert.ok(fs.existsSync(path.join(project, 'gorilla', 'App.tsx')));

  run(['shell', 'demo', '--scene', 'dashboard', '--check']);

  console.log(`verify-bootstrap OK ${sdkPackage.name}@${sdkPackage.version}`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
