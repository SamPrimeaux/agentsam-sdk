import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { linkLocalSdk } from './link-local-sdk.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-local-sdk-link-'));
  const localStudioRoot = path.join(root, 'apps', 'local-studio');
  fs.mkdirSync(localStudioRoot, { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: '@inneranimalmedia/agentsam-sdk', version: '2.6.18' }));
  for (const consumer of ['backend', 'frontend', 'shared/agentsam']) {
    const target = path.join(localStudioRoot, consumer, 'node_modules', '@inneranimalmedia', 'agentsam-sdk');
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({ name: '@inneranimalmedia/agentsam-sdk', version: '2.6.17' }));
  }
  return { repoRoot: root, localStudioRoot };
}

test('links the current SDK checkout into all three Local Studio consumers', () => {
  const f = fixture();
  try {
    const result = linkLocalSdk({ repoRoot: f.repoRoot, localStudioRoot: f.localStudioRoot });
    assert.equal(result.length, 3);
    for (const consumer of ['backend', 'frontend', 'shared/agentsam']) {
      const target = path.join(f.localStudioRoot, consumer, 'node_modules', '@inneranimalmedia', 'agentsam-sdk');
      assert.equal(fs.lstatSync(target).isSymbolicLink(), true);
      assert.equal(fs.realpathSync(target), fs.realpathSync(f.repoRoot));
    }
  } finally { fs.rmSync(f.repoRoot, { recursive: true, force: true }); }
});

test('local SDK linking is idempotent', () => {
  const f = fixture();
  try {
    linkLocalSdk({ repoRoot: f.repoRoot, localStudioRoot: f.localStudioRoot });
    const result = linkLocalSdk({ repoRoot: f.repoRoot, localStudioRoot: f.localStudioRoot });
    assert.deepEqual(result.map((item) => item.status), ['already-linked', 'already-linked', 'already-linked']);
  } finally { fs.rmSync(f.repoRoot, { recursive: true, force: true }); }
});

test('refuses to replace an unrelated package inside node_modules', () => {
  const f = fixture();
  try {
    const target = path.join(f.localStudioRoot, 'backend', 'node_modules', '@inneranimalmedia', 'agentsam-sdk');
    fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({ name: '@inneranimalmedia/not-the-sdk', version: '1.0.0' }));
    assert.throws(() => linkLocalSdk({ repoRoot: f.repoRoot, localStudioRoot: f.localStudioRoot }), /Refusing to replace/);
  } finally { fs.rmSync(f.repoRoot, { recursive: true, force: true }); }
});
