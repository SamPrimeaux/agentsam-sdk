import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { cleanInstallEnvironment, installStudioDependencies } from '../scripts/install-studio-deps.mjs';

test('nested npm script does not pass inherited allow-scripts into project npm ci', () => {
  const incoming = {
    PATH: '/usr/bin',
    npm_config_allow_scripts: 'esbuild,workerd',
    NPM_CONFIG_ALLOW_SCRIPTS: 'fsevents',
    npm_config_offline: 'true',
  };
  const expected = { PATH: '/usr/bin', npm_config_offline: 'true' };
  assert.deepEqual(cleanInstallEnvironment(incoming), expected);
  assert.deepEqual(incoming.npm_config_allow_scripts, 'esbuild,workerd');
});

test('studio installer clean-installs existing Ecommerce app and frontend in order', () => {
  const calls = [];
  installStudioDependencies({
    appDirectory: '/repo/apps/ecommerce-cms-agentsam',
    environment: { PATH: '/usr/bin', npm_config_allow_scripts: 'esbuild' },
    run: (program, args, options) => calls.push({ program, args, options }),
  });
  assert.equal(calls.length, 2);
  assert.ok(calls[0].program === 'npm' || calls[0].program === 'npm.cmd');
  assert.deepEqual(calls.map(({ options }) => options.cwd), [
    '/repo/apps/ecommerce-cms-agentsam',
    path.join('/repo/apps/ecommerce-cms-agentsam', 'frontend'),
  ]);
  for (const { args, options } of calls) {
    assert.deepEqual(args, ['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
    assert.equal(options.env.npm_config_allow_scripts, undefined);
    assert.equal(options.stdio, 'inherit');
  }
});
