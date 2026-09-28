#!/usr/bin/env node
import { chmodSync, copyFileSync, existsSync, mkdirSync, realpathSync } from 'node:fs';
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


// The JS bridges are part of the packaged desktop product. Bundle a Node
// runtime for the TARGET platform so customers do not need Node installed.
// Native-host builds can reuse process.execPath; cross-target builds must
// provide AGENTSAM_NODE_SIDECAR pointing at a target-compatible Node binary.
const nodeHostTriples = {
  'darwin:arm64': 'aarch64-apple-darwin',
  'darwin:x64': 'x86_64-apple-darwin',
  'win32:arm64': 'aarch64-pc-windows-msvc',
  'win32:x64': 'x86_64-pc-windows-msvc',
  'linux:arm64': 'aarch64-unknown-linux-gnu',
  'linux:x64': 'x86_64-unknown-linux-gnu',
};
const currentNodeTarget = nodeHostTriples[process.platform + ':' + process.arch] || null;
let nodeSource = process.env.AGENTSAM_NODE_SIDECAR
  ? path.resolve(process.env.AGENTSAM_NODE_SIDECAR)
  : null;
if (!nodeSource) {
  if (currentNodeTarget !== target) {
    fail('cross-target desktop build requires AGENTSAM_NODE_SIDECAR for ' + target
      + ' (current Node target is ' + (currentNodeTarget || 'unknown') + ')');
  }
  nodeSource = realpathSync(process.execPath);
}
if (!existsSync(nodeSource)) fail('Node sidecar not found: ' + nodeSource);
const nodeOutput = path.join(OUT_DIR, 'node-' + target + ext);
copyFileSync(nodeSource, nodeOutput);
if (goos !== 'windows') chmodSync(nodeOutput, 0o755);
console.log('[prepare-sidecars] bundled node runtime: ' + nodeOutput);
