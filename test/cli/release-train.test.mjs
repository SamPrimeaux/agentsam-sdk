import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('release train check enforces one first-party workspace version and exact internal pins', () => {
  const output = execFileSync(process.execPath, ['scripts/release-train.mjs', 'check'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.match(output, /PASS all first-party package intents, versions, and dependency pins aligned/);
});


test('independent ecommerce product release version remains distinct from root SDK train', () => {
  const manifest = JSON.parse(readFileSync(path.join(root, 'apps/ecommerce-cms-agentsam/package.json'), 'utf8'));
  const sdkManifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.notEqual(manifest.version, sdkManifest.version);
  const check = execFileSync(process.execPath, ['scripts/release-train.mjs', 'check'], {
    cwd: root, encoding: 'utf8',
  });
  assert.match(check, /PASS all first-party package intents, versions, and dependency pins aligned/);
});
