import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publisher = path.join(root, 'scripts/sdk-release-publish.mjs');
const run = (...args) => spawnSync(process.execPath, [publisher, ...args], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, CI: '' },
});

test('release plan lists packages without publishing', () => {
  const result = run('--plan');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /AGENTSAM_STABLE_RELEASE/);
  assert.match(result.stdout, /@inneranimalmedia\/agentsam-sdk@/);
  assert.doesNotMatch(result.stdout, /@inneranimalmedia\/agentsam-design-canvas@/,
    'independently versioned installable apps must not enter the SDK coordinated train');
});

test('manual publishing refuses a noninteractive terminal before accessing npm', () => {
  const result = run('--publish-local', '--confirm=2.6.14');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /local_publish_requires_interactive_terminal/);
});

test('CI publishing requires approved main and GitHub OIDC rather than a forged CI flag', () => {
  const result = run('--publish');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /publish_requires_approved_main_and_github_oidc/);
});
