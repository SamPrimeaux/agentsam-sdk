/**
 * Update notifier: cached, non-blocking registry check plus an install-aware
 * "Update available" prompt (Update now / Skip / Skip until next version).
 * State lives in ~/.agentsam/update-check.json. Never runs in CI or non-TTY.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import pkg from '../../package.json' with { type: 'json' };

export const PACKAGE_NAME = pkg.name;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 3000;

export function statePath(home = os.homedir()) {
  return path.join(home, '.agentsam', 'update-check.json');
}

export function readState(home) {
  try { return JSON.parse(fs.readFileSync(statePath(home), 'utf8')) || {}; } catch { return {}; }
}

export function writeState(patch, home) {
  try {
    const file = statePath(home);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ ...readState(home), ...patch }, null, 2));
  } catch { /* non-fatal */ }
}

export function parseVersion(v) {
  const m = String(v || '').trim().replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/);
  return m ? { nums: [+m[1], +m[2], +m[3]], pre: m[4] || '' } : null;
}

/** 1 if a > b, -1 if a < b, 0 if equal/unparseable. Prereleases sort below releases. */
export function compareVersions(a, b) {
  const pa = parseVersion(a); const pb = parseVersion(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) if (pa.nums[i] !== pb.nums[i]) return pa.nums[i] > pb.nums[i] ? 1 : -1;
  if (pa.pre === pb.pre) return 0;
  if (!pa.pre) return 1;
  if (!pb.pre) return -1;
  return pa.pre > pb.pre ? 1 : -1;
}

/** 'npm-global' when running from an installed package; 'source' for a git checkout/worktree. */
export function detectInstall(entry = fileURLToPath(import.meta.url)) {
  let real = entry;
  try { real = fs.realpathSync(entry); } catch { /* keep */ }
  return real.split(path.sep).includes('node_modules') ? 'npm-global' : 'source';
}

export async function fetchLatest({ fetchImpl = globalThis.fetch, name = PACKAGE_NAME } = {}) {
  if (typeof fetchImpl !== 'function') return null;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`https://registry.npmjs.org/${name.replace('/', '%2F')}/latest`, {
      signal: ctl.signal, headers: { accept: 'application/json' },
    });
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body?.version === 'string' ? body.version : null;
  } catch { return null; } finally { clearTimeout(t); }
}

export function releaseNotesUrl(version) {
  return `https://github.com/SamPrimeaux/agentsam-sdk/releases/tag/v${version}`;
}

export function updateCommand() {
  return `npm install -g ${PACKAGE_NAME}@latest`;
}

/**
 * Returns { current, latest, install } when an update should be offered, else null.
 * Uses the cache unless stale; a failed fetch never blocks or throws.
 */
export async function checkForUpdate({ home, env = process.env, now = Date.now(), current = pkg.version, fetchImpl, install = detectInstall() } = {}) {
  if (env.CI || env.AGENTSAM_NO_UPDATE_CHECK || env.NO_UPDATE_NOTIFIER) return null;
  const state = readState(home);
  let latest = state.latest || null;
  if (!state.checked_at || now - Date.parse(state.checked_at) > CHECK_INTERVAL_MS) {
    const fresh = await fetchLatest({ fetchImpl });
    if (fresh) { latest = fresh; writeState({ latest: fresh, checked_at: new Date(now).toISOString() }, home); }
  }
  if (!latest || compareVersions(latest, current) <= 0) return null;
  if (state.skipped_version === latest) return null;
  return { current, latest, install };
}

export function renderUpdateHeader({ current, latest }) {
  return [
    '',
    `  ✨ Update available! ${current} → ${latest}`,
    `  Release notes: ${releaseNotesUrl(latest)}`,
    '',
  ].join('\n');
}

function runInstall() {
  return new Promise((resolve) => {
    const child = spawn('npm', ['install', '-g', `${PACKAGE_NAME}@latest`], { stdio: 'inherit' });
    child.on('error', () => resolve(1));
    child.on('close', (code) => resolve(code ?? 1));
  });
}

/** Interactive prompt. Returns 'updated' | 'skipped' | 'skipped-version' | 'failed'. */
export async function promptForUpdate(info, { home, write = (s) => process.stderr.write(s), select, isCancel, install = runInstall } = {}) {
  if (!select) ({ select, isCancel } = await import('@clack/prompts'));
  write(`${renderUpdateHeader(info)}\n`);
  const options = [];
  if (info.install === 'npm-global') options.push({ value: 'now', label: 'Update now', hint: `runs \`${updateCommand()}\`` });
  else options.push({ value: 'now', label: 'Show update command', hint: 'this copy runs from source; update with git pull' });
  options.push({ value: 'skip', label: 'Skip' }, { value: 'version', label: 'Skip until next version' });
  const choice = await select({ message: 'Update AgentSam?', options });
  if (isCancel(choice) || choice === 'skip') return 'skipped';
  if (choice === 'version') { writeState({ skipped_version: info.latest }, home); return 'skipped-version'; }
  if (info.install !== 'npm-global') {
    write(`  Run: git pull && npm install   (or install globally: ${updateCommand()})\n`);
    return 'skipped';
  }
  const code = await install();
  if (code === 0) { write(`\n  ✓ Updated to ${info.latest}. Run \`agentsam\` again to start the new version.\n`); return 'updated'; }
  write(`\n  ✕ Update failed. Run it yourself: ${updateCommand()}\n`);
  return 'failed';
}
