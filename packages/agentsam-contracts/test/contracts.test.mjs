import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('contracts package stays framework neutral', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.peerDependencies, undefined);
});

test('operation and tool contracts are first-class package exports', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  for (const key of ['./tools', './operations', './authority', './execution', './providers', './events', './run', './hooks', './widgets']) {
    const entry = pkg.exports[key];
    assert.equal(typeof entry, 'object', `missing typed contract export: ${key}`);
    assert.match(entry.types, /^\.\/dist\/.+\.d\.ts$/);
    assert.match(entry.import, /^\.\/dist\/.+\.js$/);
  }
  for (const key of [
    './schemas/sam-operation.v1.schema.json',
    './schemas/agent-tool-definition.v1.schema.json',
    './schemas/sam-result.v1.schema.json',
  ]) {
    assert.equal(typeof pkg.exports[key], 'string', `missing portable schema export: ${key}`);
    assert.ok(pkg.files.includes('schemas'), 'package must publish its source schemas');
  }
});

test('protocol operation, tool and result schemas are exact package-owned mirrors', async () => {
  const pairs = [
    ['../schemas/sam-operation.v1.schema.json', '../../../protocol/sam/operation.schema.json'],
    ['../schemas/sam-result.v1.schema.json', '../../../protocol/sam/result.schema.json'],
    ['../schemas/agent-tool-definition.v1.schema.json', '../../../protocol/tools/agent-tool-definition.v1.schema.json'],
  ];
  for (const [source, mirror] of pairs) {
    const canonical = JSON.parse(await readFile(new URL(source, import.meta.url), 'utf8'));
    const published = JSON.parse(await readFile(new URL(mirror, import.meta.url), 'utf8'));
    assert.deepEqual(published, canonical, `protocol mirror drift: ${mirror}`);
  }
});
