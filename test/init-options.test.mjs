import assert from 'node:assert/strict';
import test from 'node:test';

import {
  guidanceForRunTarget,
  listInitProjectTypeOptions,
  parseProjectTypeChoice,
  RUN_TARGET_OPTIONS,
} from '../src/lib/init-options.js';

test('init project types include presets, CF scaffolds, and ready apps', () => {
  const options = listInitProjectTypeOptions();
  const values = options.map((row) => row.value);
  assert.ok(values.includes('preset:fullstack'));
  assert.ok(values.includes('preset:cms'));
  assert.ok(values.includes('scaffold:cms'));
  assert.ok(values.includes('scaffold:worker-api'));
  assert.ok(values.some((value) => value.startsWith('app:')));
  assert.equal(parseProjectTypeChoice('scaffold:cms').kind, 'scaffold');
  assert.equal(parseProjectTypeChoice('app:local-studio').id, 'local-studio');
});

test('run targets are operational paths, not aspirational later flags', () => {
  const values = RUN_TARGET_OPTIONS.map((row) => row.value);
  assert.deepEqual(values, ['local', 'cloudflare', 'gcp', 'docker']);
  assert.match(RUN_TARGET_OPTIONS.find((row) => row.value === 'cloudflare').hint, /OAuth/);
  assert.match(guidanceForRunTarget('cloudflare').join('\n'), /connections setup/);
  assert.match(guidanceForRunTarget('gcp').join('\n'), /google-cloud/);
  assert.match(guidanceForRunTarget('docker').join('\n'), /dockerize/);
});
