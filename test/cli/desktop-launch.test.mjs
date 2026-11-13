import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DesktopLaunchError, buildOpenUrl, findDesktopApp, isDirectoryArg, launchDesktop, resolveProjectDir,
} from '../../src/lib/desktop-launch.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'as-launch-'));
const weird = path.join(tmp, 'my proj & #1 é');
fs.mkdirSync(weird);
const file = path.join(tmp, 'f.txt');
fs.writeFileSync(file, 'x');

test('isDirectoryArg only matches unambiguous path forms', () => {
  for (const a of ['.', '..', '~', './x', '../x', '/abs', '~/x']) assert.equal(isDirectoryArg(a), true, a);
  for (const a of ['models', 'whoami', 'studio', 'tui', '', undefined, '-v']) assert.equal(isDirectoryArg(a), false, String(a));
});

test('resolveProjectDir realpaths and validates', () => {
  assert.equal(resolveProjectDir('.', { cwd: weird }), fs.realpathSync(weird));
  assert.equal(resolveProjectDir(null), null);
  assert.throws(() => resolveProjectDir(file), (e) => e.code === 'path_not_directory');
  assert.throws(() => resolveProjectDir(path.join(tmp, 'nope')), (e) => e.code === 'path_not_found');
  assert.throws(() => resolveProjectDir('a\0b'), (e) => e.code === 'invalid_path');
  assert.throws(() => resolveProjectDir('/' + 'a'.repeat(5000)), (e) => e.code === 'invalid_path');
});

test('symlinks resolve to their real target', () => {
  const link = path.join(tmp, 'lnk');
  fs.symlinkSync(weird, link);
  assert.equal(resolveProjectDir(link), fs.realpathSync(weird));
});

test('buildOpenUrl encodes and round-trips hostile characters', () => {
  const real = fs.realpathSync(weird);
  const url = buildOpenUrl(real);
  assert.ok(url.startsWith('agentsamstudio://open?path='));
  assert.equal(new URL(url).searchParams.get('path'), real);
  assert.ok(!/[ #]/.test(url));
  assert.equal(new URL(url).searchParams.get('t')?.length, 12);
  assert.notEqual(buildOpenUrl(real), buildOpenUrl(real), 'every launch must be a distinct URL');
});

test('findDesktopApp ignores backups/installers and prefers /Applications', () => {
  const out = [
    '/Users/u/Library/Application Support/com.inneranimalmedia.local-studio/backups/AgentSam Local Studio-pre.app',
    '/Users/u/iam-workspaces/x/installers/AgentSam Local Studio.app',
    '/Applications/AgentSam Local Studio.app',
  ].join('\n');
  assert.equal(findDesktopApp({ platform: 'darwin', exec: () => out, exists: () => false }), '/Applications/AgentSam Local Studio.app');
  assert.equal(findDesktopApp({ platform: 'darwin', exec: () => out.split('\n').slice(0, 2).join('\n'), exists: () => false }), null);
  assert.equal(findDesktopApp({ platform: 'darwin', exec: () => { throw new Error('no spotlight'); }, exists: (p) => p === '/Applications/AgentSam Local Studio.app' }), '/Applications/AgentSam Local Studio.app');
  assert.equal(findDesktopApp({ platform: 'linux' }), null);
});

test('launchDesktop uses argv (no shell) pinned to the discovered app', () => {
  const calls = [];
  const run = (cmd, args, opts) => calls.push({ cmd, args, opts });
  const find = () => '/Applications/AgentSam Local Studio.app';
  launchDesktop({ platform: 'darwin', find, run });
  launchDesktop({ platform: 'darwin', find, run, projectDir: '/tmp/a b', token: 'abc123' });
  assert.deepEqual(calls[0].args, ['-a', '/Applications/AgentSam Local Studio.app']);
  assert.deepEqual(calls[1].args, ['-a', '/Applications/AgentSam Local Studio.app', 'agentsamstudio://open?path=%2Ftmp%2Fa%20b&t=abc123']);
  assert.equal(calls[1].cmd, 'open');
  assert.ok(!calls[1].opts.shell);
});

test('launchDesktop reports missing app and unsupported platform actionably', () => {
  assert.throws(() => launchDesktop({ platform: 'darwin', find: () => null }),
    (e) => e instanceof DesktopLaunchError && e.code === 'app_not_installed' && /agentsam tui/.test(e.message));
  assert.throws(() => launchDesktop({ platform: 'linux' }), (e) => e.code === 'unsupported_platform');
  assert.throws(() => launchDesktop({ platform: 'darwin', find: () => '/x.app', run: () => { throw new Error('boom'); } }),
    (e) => e.code === 'launch_failed');
});
