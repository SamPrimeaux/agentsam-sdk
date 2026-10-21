import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'cli.js');

// Drives the real command line (not the generator) so a flag that is parsed but never forwarded fails here.
function generate(extraArgs) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-cad-cli-'));
  const share = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-cad-share-'));
  try {
    const run = spawnSync(process.execPath, [cli, 'dockerize', 'cad', '--cwd', cwd, '--write-only', '--tools', 'openscad', ...extraArgs(share)], { encoding: 'utf8', timeout: 60000 });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const root = path.join(cwd, '.agentsam', 'docker');
    const hash = fs.readdirSync(root).find(name => /^[0-9a-f]{10}$/.test(name));
    assert.ok(hash, 'dockerize wrote a versioned directory');
    return { compose: fs.readFileSync(path.join(root, hash, 'docker-compose.yml'), 'utf8'), share: fs.realpathSync(share) };
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
    fs.rmSync(share, { recursive: true, force: true });
  }
}

test('CLI defaults: writable root, no tmpfs, no extra mounts', () => {
  const { compose } = generate(() => []);
  assert.match(compose, /read_only: false/);
  assert.doesNotMatch(compose, /tmpfs/);
  assert.doesNotMatch(compose, /\/mounts\//);
});

test('CLI forwards --cad-mount into the generated service', () => {
  const { compose, share } = generate(dir => ['--cad-mount', `projects=${dir}`]);
  assert.ok(compose.includes('"target":"/mounts/projects"'), 'mount target present');
  assert.ok(compose.includes(JSON.stringify(share).slice(1, -1)), 'mount source is the authorized host directory');
  assert.match(compose, /"read_only":false/);
});

test('CLI forwards --cad-read-only-root as an explicit hardening opt-in', () => {
  const { compose } = generate(() => ['--cad-read-only-root']);
  assert.match(compose, /read_only: true/);
  assert.match(compose, /tmpfs/);
  assert.doesNotMatch(compose, /noexec/);
});
