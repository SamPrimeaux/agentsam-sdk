/**
 * Resolve the agentsam-machine native binary.
 * Preference order:
 *   1. AGENTSAM_MACHINE_BIN
 *   2. agentsam-machine on PATH
 *   3. Built binary under native/agentsam-machine/target/{release,debug}
 *   4. cargo run --manifest-path … (dev fallback inside the SDK repo)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const sdkRoot = path.resolve(here, '../..');
const machineCrate = path.join(sdkRoot, 'native/agentsam-machine');
const machineManifest = path.join(machineCrate, 'Cargo.toml');

/**
 * @typedef {{ kind: 'binary', path: string, source: string } | { kind: 'cargo', manifest: string, source: string } | { kind: 'missing', tried: string[] }} MachineBinaryResolution
 */

/**
 * @returns {MachineBinaryResolution}
 */
export function resolveMachineBinary(env = process.env) {
  const tried = [];

  const explicit = String(env.AGENTSAM_MACHINE_BIN || '').trim();
  if (explicit) {
    tried.push(explicit);
    if (fs.existsSync(explicit) && fs.statSync(explicit).isFile()) {
      return { kind: 'binary', path: explicit, source: 'AGENTSAM_MACHINE_BIN' };
    }
  }

  const pathHit = which('agentsam-machine');
  if (pathHit) {
    return { kind: 'binary', path: pathHit, source: 'PATH' };
  }
  tried.push('PATH:agentsam-machine');

  for (const rel of ['target/release/agentsam-machine', 'target/debug/agentsam-machine']) {
    const candidate = path.join(machineCrate, rel);
    tried.push(candidate);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return { kind: 'binary', path: candidate, source: rel.includes('release') ? 'crate-release' : 'crate-debug' };
    }
  }

  if (fs.existsSync(machineManifest)) {
    const cargo = which('cargo');
    if (cargo) {
      return { kind: 'cargo', manifest: machineManifest, source: 'cargo-run' };
    }
    tried.push('cargo');
  }

  return { kind: 'missing', tried };
}

/**
 * @param {MachineBinaryResolution} resolution
 * @param {string[]} machineArgv  args after `agentsam machine` (e.g. ['inspect', './site', '--json'])
 * @param {{ stdio?: import('node:child_process').StdioOptions, env?: NodeJS.ProcessEnv }} [options]
 */
export function spawnMachine(resolution, machineArgv, options = {}) {
  const env = options.env || process.env;
  const stdio = options.stdio || 'inherit';

  if (resolution.kind === 'binary') {
    return spawnSync(resolution.path, machineArgv, { stdio, env, encoding: 'utf8' });
  }
  if (resolution.kind === 'cargo') {
    return spawnSync(
      'cargo',
      ['run', '--quiet', '--manifest-path', resolution.manifest, '--bin', 'agentsam-machine', '--', ...machineArgv],
      { stdio, env, encoding: 'utf8' },
    );
  }
  const err = new Error(
    `agentsam-machine binary not found. Tried: ${(resolution.tried || []).join(', ') || '(none)'}. Build with: cargo build --manifest-path native/agentsam-machine/Cargo.toml --release`,
  );
  err.code = 'AGENTSAM_MACHINE_BINARY_MISSING';
  throw err;
}

function which(cmd) {
  const probe = process.platform === 'win32' ? ['where', [cmd]] : ['which', [cmd]];
  const result = spawnSync(probe[0], probe[1], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  if (result.status !== 0) return null;
  const line = String(result.stdout || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find(Boolean);
  return line || null;
}

export function machineSdkRoot() {
  return sdkRoot;
}
