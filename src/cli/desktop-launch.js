/**
 * Desktop-first launcher: `agentsam` opens AgentSam Local Studio (Tauri app).
 *
 * Contract (macOS):
 *  - Discover the installed app by bundle identifier (never a hardcoded path
 *    as the only source of truth); ignore backup/installer copies.
 *  - Pin the launch to that exact bundle with `open -a <app> [url]`, passed as
 *    an argv array (no shell). LaunchServices starts the app when closed and
 *    delivers the URL to the running instance, so no duplicate windows.
 *  - A project handoff is written as a short-lived, mode-0600 record in the
 *    desktop app-data directory. Only its 256-bit one-time token is sent over
 *    agentsamstudio://open; native redeems and revalidates the path exactly once.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DESKTOP_BUNDLE_ID = 'com.inneranimalmedia.local-studio';
export const DESKTOP_URL_SCHEME = 'agentsamstudio';
const APP_NAME = 'AgentSam Local Studio.app';
const MAX_PATH = 4096;

export class DesktopLaunchError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DesktopLaunchError';
    this.code = code;
  }
}

/** True only for unambiguous path forms so real command names never collide. */
export function isDirectoryArg(arg) {
  return typeof arg === 'string' && (
    arg === '.' || arg === '..' || arg === '~' ||
    arg.startsWith('./') || arg.startsWith('../') ||
    arg.startsWith('/') || arg.startsWith('~/')
  );
}

export function resolveProjectDir(arg, { cwd = process.cwd(), home = os.homedir(), fsImpl = fs } = {}) {
  if (arg == null) return null;
  if (typeof arg !== 'string' || !arg.length || arg.length > MAX_PATH || arg.includes('\0')) {
    throw new DesktopLaunchError('invalid_path', 'Invalid directory argument.');
  }
  const expanded = arg === '~' ? home : arg.startsWith('~/') ? path.join(home, arg.slice(2)) : arg;
  const absolute = path.resolve(cwd, expanded);
  let real;
  try { real = fsImpl.realpathSync(absolute); }
  catch { throw new DesktopLaunchError('path_not_found', `Directory not found: ${absolute}`); }
  if (!fsImpl.statSync(real).isDirectory()) {
    throw new DesktopLaunchError('path_not_directory', `Not a directory: ${real}`);
  }
  return real;
}

const HANDOFF_TTL_MS = 60_000;
const HANDOFF_TOKEN_RE = /^[a-f0-9]{64}$/i;

/** Persist the workspace target outside the URL; the native app atomically redeems this token once. */
export function writeWorkspaceHandoff(realDir, {
  home = os.homedir(),
  fsImpl = fs,
  token = randomBytes(32).toString('hex'),
  now = Date.now(),
} = {}) {
  if (!HANDOFF_TOKEN_RE.test(token)) {
    throw new DesktopLaunchError('invalid_handoff_token', 'Invalid desktop workspace handoff token.');
  }
  const directory = path.join(home, 'Library', 'Application Support', DESKTOP_BUNDLE_ID, 'handoffs');
  fsImpl.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const directoryStat = fsImpl.lstatSync(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new DesktopLaunchError('invalid_handoff_directory', 'Desktop workspace handoff storage must be a private directory.');
  }
  fsImpl.chmodSync(directory, 0o700);
  // Expired, unredeemed handoffs are harmless, but prune them as the CLI is reused.
  for (const entry of fsImpl.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !/^[a-f0-9]{64}\.json$/i.test(entry.name)) continue;
    const stalePath = path.join(directory, entry.name);
    try {
      if (fsImpl.statSync(stalePath).mtimeMs < now - HANDOFF_TTL_MS * 2) fsImpl.rmSync(stalePath, { force: true });
    } catch { /* A stale record is not allowed to block a new handoff. */ }
  }
  const filePath = path.join(directory, `${token}.json`);
  const record = { workspace_path: realDir, expires_at_ms: now + HANDOFF_TTL_MS };
  fsImpl.writeFileSync(filePath, JSON.stringify(record), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  return { token, filePath, expiresAt: record.expires_at_ms };
}

/** The URL carries no filesystem path; a random single-use token is all the native side receives. */
export function buildOpenUrl(token) {
  if (typeof token !== 'string' || !HANDOFF_TOKEN_RE.test(token)) {
    throw new DesktopLaunchError('invalid_handoff_token', 'Invalid desktop workspace handoff token.');
  }
  return `${DESKTOP_URL_SCHEME}://open?handoff=${token}`;
}

const IGNORED_APP_PATH = /\/(backups|installers|\.Trash|Trash)\//i;

export function findDesktopApp({
  platform = process.platform,
  home = os.homedir(),
  exec = execFileSync,
  exists = fs.existsSync,
} = {}) {
  if (platform !== 'darwin') return null;
  const preferred = ['/Applications', path.join(home, 'Applications')].map((d) => path.join(d, APP_NAME));
  let found = [];
  try {
    const out = String(exec('mdfind', [`kMDItemCFBundleIdentifier == '${DESKTOP_BUNDLE_ID}'`], { encoding: 'utf8', timeout: 5000 }));
    found = out.split('\n').map((s) => s.trim()).filter((p) => p.endsWith('.app') && !IGNORED_APP_PATH.test(p));
  } catch { /* Spotlight disabled or unavailable: fall back to standard locations */ }
  for (const p of preferred) if (found.includes(p)) return p;
  if (found.length) return found[0];
  return preferred.find((p) => exists(p)) || null;
}

export function launchDesktop({
  projectDir = null,
  platform = process.platform,
  find = findDesktopApp,
  run = execFileSync,
  home = os.homedir(),
  fsImpl = fs,
  now = Date.now,
  token,
} = {}) {
  if (platform !== 'darwin') {
    throw new DesktopLaunchError('unsupported_platform',
      `Desktop launch is currently supported on macOS only (this is ${platform}). Use: agentsam`);
  }
  const app = find({ platform });
  if (!app) {
    throw new DesktopLaunchError('app_not_installed',
      'AgentSam Local Studio is not installed.\n' +
      '  Install the desktop app, then run agentsam again.\n' +
      '  Terminal agent (no desktop app needed): agentsam');
  }
  const args = ['-a', app];
  const handoff = projectDir ? writeWorkspaceHandoff(projectDir, { home, fsImpl, token, now: now() }) : null;
  if (handoff) args.push(buildOpenUrl(handoff.token));
  try {
    run('open', args, { stdio: 'ignore' });
  } catch (e) {
    if (handoff) {
      try { fsImpl.rmSync(handoff.filePath, { force: true }); } catch { /* Keep the launch error authoritative. */ }
    }
    throw new DesktopLaunchError('launch_failed', `Could not launch ${app}: ${e.message}`);
  }
  return { app, projectDir, handoffToken: handoff?.token ?? null };
}
