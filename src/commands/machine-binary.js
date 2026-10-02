/**
 * Resolve the agentsam-machine native binary.
 * Preference order:
 *   1. AgentSam-managed user runtime under ~/.agentsam/runtimes/machine
 *   2. AGENTSAM_MACHINE_BIN explicit override
 *   3. agentsam-machine on PATH
 *   4. Built binary under native/agentsam-machine/target/{release,debug}
 *   5. cargo run --manifest-path (SDK contributor fallback)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { findExecutable, managedMachineResolution } from './machine-runtime.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const sdkRoot = path.resolve(here, '../..');
const machineCrate = path.join(sdkRoot, 'native/agentsam-machine');
const machineManifest = path.join(machineCrate, 'Cargo.toml');

/**
 * @typedef {{ kind: 'binary', path: string, source: string, version?: string } | { kind: 'cargo', manifest: string, source: string } | { kind: 'missing', tried: string[] }} MachineBinaryResolution
 */

/**
 * @returns {MachineBinaryResolution}
 */
export function resolveMachineBinary(env = process.env) {
  const tried = [];

  const managed = managedMachineResolution(env);
  tried.push(...managed.tried);
  if (managed.available) {
    return {
      kind: 'binary',
      path: managed.path,
      source: 'managed-runtime',
      version: managed.state.current_version,
    };
  }

  const explicit = String(env.AGENTSAM_MACHINE_BIN || '').trim();
  if (explicit) {
    tried.push(explicit);
    if (fs.existsSync(explicit) && fs.statSync(explicit).isFile()) {
      return { kind: 'binary', path: explicit, source: 'AGENTSAM_MACHINE_BIN' };
    }
  }

  const pathHit = findExecutable('agentsam-machine', env);
  if (pathHit) return { kind: 'binary', path: pathHit, source: 'PATH' };
  tried.push('PATH:agentsam-machine');

  for (const rel of ['target/release/agentsam-machine', 'target/debug/agentsam-machine']) {
    const candidate = path.join(machineCrate, rel);
    tried.push(candidate);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return {
        kind: 'binary',
        path: candidate,
        source: rel.includes('release') ? 'crate-release' : 'crate-debug',
      };
    }
  }

  if (fs.existsSync(machineManifest)) {
    const cargo = findExecutable('cargo', env);
    if (cargo) return { kind: 'cargo', manifest: machineManifest, source: 'cargo-run' };
    tried.push('cargo');
  }

  return { kind: 'missing', tried };
}

/**
 * @param {MachineBinaryResolution} resolution
 * @param {string[]} machineArgv
 * @param {{ stdio?: import('node:child_process').StdioOptions, env?: NodeJS.ProcessEnv }} [options]
 */
export function spawnMachine(resolution, machineArgv, options = {}) {
  const env = options.env || process.env;
  const stdio = options.stdio || 'inherit';
  const maxBuffer = options.maxBuffer || 32 * 1024 * 1024;

  if (resolution.kind === 'binary') {
    return spawnSync(resolution.path, machineArgv, { stdio, env, encoding: 'utf8', maxBuffer });
  }

  if (resolution.kind === 'cargo') {
    return spawnSync(
      'cargo',
      ['run', '--quiet', '--manifest-path', resolution.manifest, '--bin', 'agentsam-machine', '--', ...machineArgv],
      { stdio, env, encoding: 'utf8', maxBuffer },
    );
  }

  const err = new Error(
    'agentsam-machine is not installed. Run: agentsam machine install. ' +
    'Standalone Cargo users can run: cargo install agentsam-machine-cli. ' +
    'Tried: ' + ((resolution.tried || []).join(', ') || '(none)'),
  );
  err.code = 'AGENTSAM_MACHINE_BINARY_MISSING';
  throw err;
}

export function machineSdkRoot() {
  return sdkRoot;
}
