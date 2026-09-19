import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('install.sh is a bash npm bootstrap with platform detection', () => {
  const source = fs.readFileSync(path.join(root, 'scripts/install.sh'), 'utf8');
  assert.match(source, /AgentSam installer/);
  assert.match(source, /npm install --global/);
  assert.match(source, /Darwin-arm64/);
  assert.match(source, /--version/);
  assert.match(source, /--app/);
  assert.match(source, /standalone_ready/);
  assert.match(source, /checksum_contract/);
});
