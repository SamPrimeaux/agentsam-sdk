import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('contracts package stays framework neutral', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.peerDependencies, undefined);
});

test('execution-plane contracts are exported as first-class package surfaces', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  for (const key of ['./tools', './authority', './execution', './providers', './events', './run', './hooks', './widgets']) {
    const entry = pkg.exports[key];
    assert.equal(typeof entry, 'object', `missing typed contract export: ${key}`);
    assert.match(entry.types, /^\.\/dist\/.+\.d\.ts$/);
    assert.match(entry.import, /^\.\/dist\/.+\.js$/);
  }
});
