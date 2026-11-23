import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compareVersions, checkForUpdate, detectInstall, promptForUpdate, readState } from '../../src/cli/update-check.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'as-upd-'));
const fakeFetch = (version) => async () => ({ ok: true, json: async () => ({ version }) });

test('compareVersions', () => {
  assert.equal(compareVersions('2.6.18', '2.6.17'), 1);
  assert.equal(compareVersions('2.6.17', '2.6.17'), 0);
  assert.equal(compareVersions('2.6.17-next.1', '2.6.17'), -1);
  assert.equal(compareVersions('2.10.0', '2.9.9'), 1);
});

test('detectInstall distinguishes source from npm', () => {
  assert.equal(detectInstall('/x/node_modules/@inneranimalmedia/agentsam-sdk/src/lib/a.js'), 'npm-global');
  assert.equal(detectInstall('/x/agentsam-sdk/src/lib/a.js'), 'source');
});

test('checkForUpdate offers newer, caches, honors skip and CI', async () => {
  const home = tmp();
  const base = { home, env: {}, current: '2.6.17', fetchImpl: fakeFetch('2.7.0'), install: 'npm-global' };
  const info = await checkForUpdate(base);
  assert.equal(info.latest, '2.7.0');
  assert.equal(readState(home).latest, '2.7.0');
  assert.equal(await checkForUpdate({ ...base, fetchImpl: async () => { throw new Error('offline'); } }).then((r) => r.latest), '2.7.0');
  assert.equal(await checkForUpdate({ ...base, env: { CI: '1' } }), null);
  assert.equal(await promptForUpdate(info, { home, write() {}, select: async () => 'version', isCancel: () => false }), 'skipped-version');
  assert.equal(await checkForUpdate(base), null);
});

test('fetch failure never throws', async () => {
  const r = await checkForUpdate({ home: tmp(), env: {}, current: '1.0.0', fetchImpl: async () => { throw new Error('x'); } });
  assert.equal(r, null);
});

test('promptForUpdate runs installer only for npm-global', async () => {
  let ran = 0;
  const deps = { home: tmp(), write() {}, select: async () => 'now', isCancel: () => false, install: async () => { ran++; return 0; } };
  assert.equal(await promptForUpdate({ current: '1.0.0', latest: '1.1.0', install: 'npm-global' }, deps), 'updated');
  assert.equal(await promptForUpdate({ current: '1.0.0', latest: '1.1.0', install: 'source' }, deps), 'skipped');
  assert.equal(ran, 1);
});
