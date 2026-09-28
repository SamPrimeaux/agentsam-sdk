import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cmsBin = path.join(root, 'apps/client-cms-editor/bin/agentsam-cms.mjs');

function scaffold(persistence) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-cms-scaffold-'));
  const target = path.join(temp, 'editor');
  execFileSync(process.execPath, [
    cmsBin,
    'scaffold',
    target,
    '--persistence',
    persistence,
  ], { cwd: root, stdio: 'pipe' });
  return { temp, target };
}

test('CMS editor scaffold is self-contained and records SQLite authority', () => {
  const { temp, target } = scaffold('sqlite');
  try {
    assert.equal(fs.existsSync(path.join(target, 'bin/agentsam-cms.mjs')), true);
    assert.equal(fs.existsSync(path.join(target, 'agentsam.app.json')), true);
    assert.equal(fs.existsSync(path.join(target, 'packages/agentsam-contracts/package.json')), true);
    assert.equal(fs.existsSync(path.join(target, 'packages/agentsam-workbench/package.json')), true);

    const rootPkg = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));
    assert.ok(rootPkg.workspaces.includes('packages/*'));

    const frontendPkg = JSON.parse(fs.readFileSync(path.join(target, 'frontend/package.json'), 'utf8'));
    assert.equal(frontendPkg.dependencies['@inneranimalmedia/agentsam-contracts'], '0.1.0');
    assert.equal(frontendPkg.dependencies['@inneranimalmedia/agentsam-workbench'], '0.1.0');

    const sharedPkg = JSON.parse(fs.readFileSync(path.join(target, 'shared/cms/package.json'), 'utf8'));
    assert.equal(sharedPkg.dependencies['@inneranimalmedia/agentsam-contracts'], '0.1.0');

    const escaped = [
      ...Object.values(frontendPkg.dependencies || {}),
      ...Object.values(sharedPkg.dependencies || {}),
    ].filter((value) => String(value).startsWith('file:'));
    assert.deepEqual(escaped, []);

    const runtime = JSON.parse(fs.readFileSync(path.join(target, '.agentsam/cms-runtime.json'), 'utf8'));
    assert.equal(runtime.schema, 'agentsam.cms.runtime.v1');
    assert.equal(runtime.app_id, 'client-cms-editor');
    assert.equal(runtime.authority, 'sqlite');
    assert.equal(runtime.cache, 'localStorage');
    assert.equal(runtime.cache_only, false);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('CMS editor localStorage option is explicitly cache-only', () => {
  const { temp, target } = scaffold('localStorage');
  try {
    const runtime = JSON.parse(fs.readFileSync(path.join(target, '.agentsam/cms-runtime.json'), 'utf8'));
    assert.equal(runtime.authority, null);
    assert.equal(runtime.cache, 'localStorage');
    assert.equal(runtime.cache_only, true);
    assert.match(runtime.note, /cache only/i);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
