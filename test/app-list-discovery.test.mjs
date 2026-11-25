import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runApp, findCheckoutRoot } from '../src/commands/app.js';

function fakeCheckout() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-checkout-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: '@inneranimalmedia/agentsam-sdk' }));
  const appDir = path.join(root, 'apps', 'demo-app');
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(path.join(appDir, 'agentsam.app.json'), JSON.stringify({ schema: 'agentsam.app.v1', kind: 'app', id: 'demo-app', name: 'Demo App' }));
  fs.mkdirSync(path.join(root, 'src', 'deep'), { recursive: true });
  return root;
}

test('findCheckoutRoot walks up from a nested directory to the sdk checkout', () => {
  const root = fakeCheckout();
  assert.equal(fs.realpathSync(findCheckoutRoot(path.join(root, 'src', 'deep'))), fs.realpathSync(root));
});

test('findCheckoutRoot returns null outside a checkout', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-none-'));
  assert.equal(findCheckoutRoot(dir), null);
});

test('app list discovers manifests from the checkout the user is standing in', async () => {
  const root = fakeCheckout();
  const prev = process.cwd();
  process.chdir(path.join(root, 'src', 'deep'));
  try {
    let out = '';
    await runApp(['list'], { write: (t) => { out += t; } });
    assert.match(out, /demo-app/);
  } finally {
    process.chdir(prev);
  }
});

test('app list says where it looked when nothing is found', async () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-empty-'));
  let out = '';
  await runApp(['list'], { root: empty, write: (t) => { out += t; } });
  assert.match(out, /No app manifests found/);
});
