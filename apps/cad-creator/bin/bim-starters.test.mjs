import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('./agentsam-cad-creator.mjs', import.meta.url));
function run(args, directory) {
  return spawnSync(process.execPath, [bin, 'bim', ...args], {
    env: { ...process.env, AGENTSAM_CAD_BIM_LIBRARY: directory },
    encoding: 'utf8', timeout: 10000,
  });
}
test('BIM library CLI starts empty without creating demo data or altering projects', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-bim-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const listed = run(['list'], directory);
  assert.equal(listed.status, 0, listed.stderr);
  assert.deepEqual(JSON.parse(listed.stdout).starters, []);
  const verified = run(['verify'], directory);
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(JSON.parse(verified.stdout).verified, 0);
});
test('BIM import rejects missing inputs and non-FCStd files without side effects', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-bim-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const missing = run(['import', path.join(directory, 'not-found.FCStd')], directory);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /Native FreeCAD file not found/);
  const wrong = path.join(directory, 'invalid.txt');
  fs.writeFileSync(wrong, 'not a FreeCAD model');
  const rejected = run(['import', wrong], directory);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /Only FreeCAD .FCStd source files/);
  assert.deepEqual(fs.readdirSync(directory), ['invalid.txt']);
});
