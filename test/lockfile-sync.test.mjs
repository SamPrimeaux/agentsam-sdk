import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('every workspace and link path in package-lock.json exists on disk', () => {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const paths = new Set();
  for (const [key, value] of Object.entries(lock.packages)) {
    if (key && !key.includes('node_modules/')) paths.add(key);
    if (value.link && value.resolved) paths.add(value.resolved);
  }
  const missing = [...paths].filter((p) => !fs.existsSync(path.join(root, p)));
  assert.deepEqual(missing, []);
});

test('package.json bin map matches package-lock packages[""].bin', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const pkgBin = pkg.bin || {};
  const lockBin = (lock.packages && lock.packages[''] && lock.packages[''].bin) || {};
  assert.deepEqual(lockBin, pkgBin);
});
