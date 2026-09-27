import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CLI = path.join(ROOT, 'bin/agentsam');

function run(args, cwd = ROOT) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
}

function jsonFrom(text) {
  const start = text.indexOf('{');
  assert.notEqual(start, -1, `expected JSON output, received: ${text}`);
  return JSON.parse(text.slice(start));
}

test('agentsam inspect --help documents the positional path world-state contract', () => {
  const result = run(['inspect', '--help']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /agentsam inspect \[path\]/);
  assert.match(result.stdout, /deterministic repository world state/i);
  assert.match(result.stdout, /No model, embeddings, network, provider spend/i);
});

test('agentsam inspect accepts a repository path as the first positional argument', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-inspect-path-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'inspect-fixture', version: '1.0.0' }));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src/index.js'), 'export function fixture() { return 42; }\n');

  const result = run(['inspect', root, '--json', '--index']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = jsonFrom(result.stdout);
  assert.ok(output.snapshot_id);
  assert.ok(output.merkle_root || output.tree?.merkle_root);
  assert.match(JSON.stringify(output), /inspect-fixture|src\/index\.js/);
});
