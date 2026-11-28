import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DesktopLaunchError, buildOpenUrl, findDesktopApp, isDirectoryArg, launchDesktop, resolveProjectDir, writeWorkspaceHandoff,
} from '../../src/cli/desktop-launch.js';

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

test('buildOpenUrl carries only a 256-bit handoff token, never a filesystem path', () => {
  const token = 'a'.repeat(64);
  const url = buildOpenUrl(token);
  const parsed = new URL(url);
  assert.equal(parsed.protocol, 'agentsamstudio:');
  assert.equal(parsed.hostname, 'open');
  assert.equal(parsed.searchParams.get('handoff'), token);
  assert.equal(parsed.searchParams.has('path'), false);
  assert.throws(() => buildOpenUrl('abc'), (error) => error.code === 'invalid_handoff_token');
});

test('workspace handoffs are random, short-lived, private files in the desktop app-data directory', () => {
  const home = path.join(tmp, 'handoff-home');
  const real = fs.realpathSync(weird);
  const first = writeWorkspaceHandoff(real, { home, now: 10_000 });
  const second = writeWorkspaceHandoff(real, { home, now: 10_000 });
  assert.notEqual(first.token, second.token);
  assert.equal(first.token.length, 64);
  assert.equal(first.expiresAt, 70_000);
  const record = JSON.parse(fs.readFileSync(first.filePath, 'utf8'));
  assert.deepEqual(record, { workspace_path: real, expires_at_ms: 70_000 });
  assert.equal(fs.statSync(first.filePath).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(first.filePath)).mode & 0o777, 0o700);
});

test('workspace handoff creation prunes expired unredeemed token files', () => {
  const home = path.join(tmp, 'handoff-prune-home');
  const first = writeWorkspaceHandoff('/tmp/old', { home, now: 1_000 });
  const staleTime = new Date(1_000);
  fs.utimesSync(first.filePath, staleTime, staleTime);
  const next = writeWorkspaceHandoff('/tmp/new', { home, now: 200_000 });
  assert.equal(fs.existsSync(first.filePath), false);
  assert.equal(fs.existsSync(next.filePath), true);
});

test('findDesktopApp prefers canonical installs and ignores versioned/build/backup copies', () => {
  const versioned = '/Users/u/Applications/AgentSam Local Studio 2.6.18.app';
  const out = [
    '/Users/u/Library/Application Support/com.inneranimalmedia.local-studio/backups/AgentSam Local Studio.app',
    '/Users/u/iam-workspaces/x/installers/AgentSam Local Studio.app',
    versioned,
    '/Users/u/worktrees/sdk/packages/agentsam-desktop-shell/target/release/bundle/macos/AgentSam Local Studio.app',
    '/Applications/AgentSam Local Studio.app',
  ].join('\n');
  assert.equal(findDesktopApp({ platform: 'darwin', home: '/Users/u', exec: () => out, exists: (p) => p === '/Applications/AgentSam Local Studio.app' }), '/Applications/AgentSam Local Studio.app');
  assert.equal(findDesktopApp({ platform: 'darwin', home: '/Users/u', exec: () => [versioned, '/Users/u/Library/Application Support/com.inneranimalmedia.local-studio/backups/AgentSam Local Studio.app'].join('\n'), exists: () => false }), null);
  assert.equal(findDesktopApp({ platform: 'darwin', home: '/Users/u', exec: () => '/Users/u/Tools/AgentSam Local Studio.app', exists: (p) => p === '/Users/u/Tools/AgentSam Local Studio.app' }), '/Users/u/Tools/AgentSam Local Studio.app');
  assert.equal(findDesktopApp({ platform: 'darwin', home: '/Users/u', exec: () => { throw new Error('no spotlight'); }, exists: (p) => p === '/Applications/AgentSam Local Studio.app' }), '/Applications/AgentSam Local Studio.app');
  assert.equal(findDesktopApp({ platform: 'linux' }), null);
});

test('launchDesktop uses argv and passes only the one-time token to the discovered app', () => {
  const calls = [];
  const run = (cmd, args, opts) => calls.push({ cmd, args, opts });
  const find = () => '/Applications/AgentSam Local Studio.app';
  const home = path.join(tmp, 'launch-home');
  const token = 'b'.repeat(64);
  launchDesktop({ platform: 'darwin', find, run });
  launchDesktop({ platform: 'darwin', find, run, home, projectDir: '/tmp/a b', token });
  assert.deepEqual(calls[0].args, ['-a', '/Applications/AgentSam Local Studio.app']);
  assert.deepEqual(calls[1].args, ['-a', '/Applications/AgentSam Local Studio.app', `agentsamstudio://open?handoff=${token}`]);
  assert.equal(calls[1].cmd, 'open');
  assert.ok(!calls[1].opts.shell);
  const handoffFile = path.join(home, 'Library', 'Application Support', 'com.inneranimalmedia.local-studio', 'handoffs', `${token}.json`);
  assert.equal(JSON.parse(fs.readFileSync(handoffFile, 'utf8')).workspace_path, '/tmp/a b');
});

test('launchDesktop removes an unredeemed handoff when LaunchServices fails', () => {
  const home = path.join(tmp, 'failed-launch-home');
  const token = 'c'.repeat(64);
  assert.throws(() => launchDesktop({
    platform: 'darwin', find: () => '/Applications/AgentSam Local Studio.app', home,
    projectDir: weird, token, run: () => { throw new Error('open failed'); },
  }), (error) => error.code === 'launch_failed');
  const handoffFile = path.join(home, 'Library', 'Application Support', 'com.inneranimalmedia.local-studio', 'handoffs', `${token}.json`);
  assert.equal(fs.existsSync(handoffFile), false);
});

test('launchDesktop reports missing app and unsupported platform actionably', () => {
  assert.throws(() => launchDesktop({ platform: 'darwin', find: () => null }),
    (e) => e instanceof DesktopLaunchError && e.code === 'app_not_installed' && /Terminal agent/.test(e.message));
  assert.throws(() => launchDesktop({ platform: 'linux' }), (e) => e.code === 'unsupported_platform');
  assert.throws(() => launchDesktop({ platform: 'darwin', find: () => '/x.app', run: () => { throw new Error('boom'); } }),
    (e) => e.code === 'launch_failed');
});
