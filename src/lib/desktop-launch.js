/**
 * Desktop-first launcher: `agentsam` opens AgentSam Local Studio (Tauri app).
 *
 * Contract (macOS):
 *  - Discover the installed app by bundle identifier (never a hardcoded path
 *    as the only source of truth); ignore backup/installer copies.
 *  - Pin the launch to that exact bundle with `open -a <app> [url]`, passed as
 *    an argv array (no shell). LaunchServices starts the app when closed and
 *    delivers the URL to the running instance, so no duplicate windows.
 *  - The project directory is realpath'd, verified to be a directory, then sent
 *    percent-encoded as agentsamstudio://open?path=<abs>. The app must
 *    re-validate it; the CLI never interpolates it into a shell command.
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

/** `t` makes every launch a distinct URL: the app's deep-link queue drops exact duplicates,
 *  so re-running `agentsam .` (or switching back to a repo) must not look like a repeat. */
export function buildOpenUrl(realDir, token = randomBytes(6).toString('hex')) {
  return `${DESKTOP_URL_SCHEME}://open?path=${encodeURIComponent(realDir)}&t=${token}`;
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
  token,
} = {}) {
  if (platform !== 'darwin') {
    throw new DesktopLaunchError('unsupported_platform',
      `Desktop launch is currently supported on macOS only (this is ${platform}). Use: agentsam tui`);
  }
  const app = find({ platform });
  if (!app) {
    throw new DesktopLaunchError('app_not_installed',
      'AgentSam Local Studio is not installed.\n' +
      '  Install the desktop app, then run agentsam again.\n' +
      '  Terminal agent (separate from the desktop app): agentsam tui');
  }
  const args = ['-a', app];
  if (projectDir) args.push(buildOpenUrl(projectDir, token));
  try { run('open', args, { stdio: 'ignore' }); }
  catch (e) { throw new DesktopLaunchError('launch_failed', `Could not launch ${app}: ${e.message}`); }
  return { app, projectDir };
}
