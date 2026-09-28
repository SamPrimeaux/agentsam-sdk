#!/usr/bin/env node
import { existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHELL_ROOT = path.resolve(HERE, '..');
const REPO_ROOT = path.resolve(SHELL_ROOT, '../..');
const GO_RUNTIME = path.join(REPO_ROOT, 'apps/agentsam-go-worker/runtime');
const OUT_DIR = path.join(SHELL_ROOT, 'src-tauri/binaries');

function fail(message) {
  console.error('[prepare-sidecars] ERROR:', message);
  process.exit(1);
}

function rustHostTriple() {
  const explicit =
    process.env.AGENTSAM_TAURI_TARGET ||
    process.env.CARGO_BUILD_TARGET ||
    process.env.TAURI_ENV_TARGET_TRIPLE;
  if (explicit) return explicit.trim();

  const r = spawnSync('rustc', ['-vV'], { encoding: 'utf8' });
  if (r.status !== 0) fail('rustc -vV failed; set AGENTSAM_TAURI_TARGET');
  const match = String(r.stdout || '').match(/^host:\s*(\S+)/m);
  if (!match) fail('could not resolve Rust host target triple');
  return match[1];
}

function goTarget(triple) {
  const table = {
    'aarch64-apple-darwin': ['darwin', 'arm64'],
    'x86_64-apple-darwin': ['darwin', 'amd64'],
    'aarch64-pc-windows-msvc': ['windows', 'arm64'],
    'x86_64-pc-windows-msvc': ['windows', 'amd64'],
    'aarch64-unknown-linux-gnu': ['linux', 'arm64'],
    'x86_64-unknown-linux-gnu': ['linux', 'amd64'],
  };
  return table[triple] || null;
}

const target = rustHostTriple();
const mapped = goTarget(target);
if (!mapped) fail('unsupported Tauri target for agentsamd sidecar: ' + target);
if (!existsSync(path.join(GO_RUNTIME, 'go.mod'))) fail('missing Go runtime: ' + GO_RUNTIME);

mkdirSync(OUT_DIR, { recursive: true });
const [goos, goarch] = mapped;
const ext = goos === 'windows' ? '.exe' : '';
const output = path.join(OUT_DIR, 'agentsamd-' + target + ext);

console.log('[prepare-sidecars] building agentsamd for ' + target + ' (' + goos + '/' + goarch + ')');
const r = spawnSync(
  'go',
  ['build', '-trimpath', '-o', output, './cmd/agentsamd'],
  {
    cwd: GO_RUNTIME,
    stdio: 'inherit',
    env: {
      ...process.env,
      GOOS: goos,
      GOARCH: goarch,
      CGO_ENABLED: '0',
    },
  },
);
if (r.status !== 0) process.exit(r.status || 1);
console.log('[prepare-sidecars] ready: ' + output);
