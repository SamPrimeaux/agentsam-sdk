import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const MACHINE_RUNTIME_SCHEMA = 'agentsam.machine.runtime.v1';
export const MACHINE_PACKAGE = 'agentsam-machine-cli';

function expandHome(value, home) {
  if (!value) return value;
  if (value === '~') return home;
  if (value.startsWith('~/')) return path.join(home, value.slice(2));
  return value;
}

export function agentsamHome(env = process.env) {
  const home = os.homedir();
  const configured = String(env.AGENTSAM_HOME || '').trim();
  return configured ? path.resolve(expandHome(configured, home)) : path.join(home, '.agentsam');
}

export function machineRuntimeRoot(env = process.env) {
  return path.join(agentsamHome(env), 'runtimes', 'machine');
}

export function machineRuntimeStatePath(env = process.env) {
  return path.join(machineRuntimeRoot(env), 'current.json');
}

export function machineBinaryName() {
  return process.platform === 'win32' ? 'agentsam-machine.exe' : 'agentsam-machine';
}

export function machineManagedAliasPath(env = process.env) {
  return path.join(agentsamHome(env), 'bin', machineBinaryName());
}

export function readMachineRuntimeState(env = process.env) {
  const file = machineRuntimeStatePath(env);
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed?.schema !== MACHINE_RUNTIME_SCHEMA) return null;
    if (typeof parsed?.current_version !== 'string' || !parsed.current_version.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function managedMachineResolution(env = process.env) {
  const statePath = machineRuntimeStatePath(env);
  const state = readMachineRuntimeState(env);
  const tried = [statePath];
  if (!state) return { available: false, state: null, path: null, tried };

  const binary = path.join(
    machineRuntimeRoot(env),
    'versions',
    state.current_version,
    'bin',
    machineBinaryName(),
  );
  tried.push(binary);

  if (!fs.existsSync(binary) || !fs.statSync(binary).isFile()) {
    return { available: false, state, path: binary, tried };
  }
  return { available: true, state, path: binary, tried };
}

export function findExecutable(command, env = process.env) {
  const probe = process.platform === 'win32' ? ['where', [command]] : ['which', [command]];
  const result = spawnSync(probe[0], probe[1], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    env,
  });
  if (result.status !== 0) return null;
  return String(result.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || null;
}

export function machineBinaryVersion(binary, env = process.env) {
  const result = spawnSync(binary, ['--version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  });
  if (result.status !== 0) return null;
  const output = String(result.stdout || result.stderr || '').trim();
  const match = output.match(/(?:^|\s)(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)(?:\s|$)/);
  return match?.[1] || null;
}

export function machineRuntimeStatus(env = process.env) {
  const managed = managedMachineResolution(env);
  const cargo = findExecutable('cargo', env);
  return {
    schema: MACHINE_RUNTIME_SCHEMA,
    manager: 'agentsam',
    runtime_root: machineRuntimeRoot(env),
    state_path: machineRuntimeStatePath(env),
    installed: managed.available,
    current_version: managed.state?.current_version || null,
    binary: managed.path,
    source: managed.state?.source || null,
    installed_at_iso: managed.state?.installed_at_iso || null,
    stable_alias: machineManagedAliasPath(env),
    cargo: { available: Boolean(cargo), path: cargo },
  };
}

export function discoverLatestMachineVersion(env = process.env) {
  const cargo = findExecutable('cargo', env);
  if (!cargo) {
    const error = new Error('Cargo is required to install the current agentsam-machine crates.io distribution.');
    error.code = 'AGENTSAM_MACHINE_CARGO_MISSING';
    throw error;
  }

  const result = spawnSync(cargo, ['search', MACHINE_PACKAGE, '--limit', '1'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  });
  if (result.status !== 0) {
    const error = new Error(
      String(result.stderr || '').trim() ||
      'Unable to resolve latest ' + MACHINE_PACKAGE + ' version from crates.io.',
    );
    error.code = 'AGENTSAM_MACHINE_REGISTRY_LOOKUP_FAILED';
    throw error;
  }

  const match = String(result.stdout || '').match(/^agentsam-machine-cli\s*=\s*"([^"]+)"/m);
  if (!match) {
    const error = new Error('Unable to parse crates.io version for ' + MACHINE_PACKAGE + '.');
    error.code = 'AGENTSAM_MACHINE_REGISTRY_PARSE_FAILED';
    throw error;
  }
  return match[1];
}

function writeCurrentState(version, env = process.env) {
  const root = machineRuntimeRoot(env);
  fs.mkdirSync(root, { recursive: true });
  const state = {
    schema: MACHINE_RUNTIME_SCHEMA,
    manager: 'agentsam',
    package: MACHINE_PACKAGE,
    current_version: version,
    source: 'crates.io',
    installed_at_iso: new Date().toISOString(),
  };
  const target = machineRuntimeStatePath(env);
  const temp = target + '.tmp-' + process.pid;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temp, target);
  return state;
}

function syncManagedAlias(binary, env = process.env) {
  const alias = machineManagedAliasPath(env);
  fs.mkdirSync(path.dirname(alias), { recursive: true });
  try { fs.rmSync(alias, { force: true }); } catch {}
  if (process.platform === 'win32') fs.copyFileSync(binary, alias);
  else fs.symlinkSync(binary, alias);
  return alias;
}

export function installManagedMachine({
  env = process.env,
  version = null,
  force = false,
  write = () => {},
} = {}) {
  const cargo = findExecutable('cargo', env);
  if (!cargo) {
    const error = new Error(
      'Cargo is required by the current Machine distribution. Install Rust/Cargo, then rerun agentsam machine install.',
    );
    error.code = 'AGENTSAM_MACHINE_CARGO_MISSING';
    throw error;
  }

  const desired = version || discoverLatestMachineVersion(env);
  const root = machineRuntimeRoot(env);
  const versionsRoot = path.join(root, 'versions');
  const finalRoot = path.join(versionsRoot, desired);
  const finalBinary = path.join(finalRoot, 'bin', machineBinaryName());
  fs.mkdirSync(versionsRoot, { recursive: true });

  if (!force && fs.existsSync(finalBinary)) {
    const actual = machineBinaryVersion(finalBinary, env);
    if (actual === desired) {
      const state = writeCurrentState(desired, env);
      const alias = syncManagedAlias(finalBinary, env);
      return { changed: false, version: desired, binary: finalBinary, alias, state, source: 'managed-cache' };
    }
  }

  const stage = fs.mkdtempSync(path.join(root, '.install-'));
  write('Installing ' + MACHINE_PACKAGE + '@' + desired + ' from crates.io…\n');

  const result = spawnSync(
    cargo,
    ['install', MACHINE_PACKAGE, '--root', stage, '--version', desired, '--locked', '--force'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env },
  );
  if (result.status !== 0) {
    fs.rmSync(stage, { recursive: true, force: true });
    const error = new Error(
      String(result.stderr || result.stdout || '').trim() ||
      'cargo install failed for ' + MACHINE_PACKAGE + '@' + desired,
    );
    error.code = 'AGENTSAM_MACHINE_INSTALL_FAILED';
    throw error;
  }

  const stagedBinary = path.join(stage, 'bin', machineBinaryName());
  if (!fs.existsSync(stagedBinary)) {
    fs.rmSync(stage, { recursive: true, force: true });
    const error = new Error('cargo install completed without ' + machineBinaryName());
    error.code = 'AGENTSAM_MACHINE_INSTALL_BINARY_MISSING';
    throw error;
  }

  const actual = machineBinaryVersion(stagedBinary, env);
  if (actual !== desired) {
    fs.rmSync(stage, { recursive: true, force: true });
    const error = new Error(
      'installed Machine version mismatch: expected ' + desired + ', received ' + (actual || 'unknown'),
    );
    error.code = 'AGENTSAM_MACHINE_INSTALL_VERSION_MISMATCH';
    throw error;
  }

  if (fs.existsSync(finalRoot)) fs.rmSync(finalRoot, { recursive: true, force: true });
  fs.renameSync(stage, finalRoot);
  const state = writeCurrentState(desired, env);
  const alias = syncManagedAlias(finalBinary, env);
  return { changed: true, version: desired, binary: finalBinary, alias, state, source: 'crates.io' };
}

export function updateManagedMachine({
  env = process.env,
  force = false,
  write = () => {},
} = {}) {
  const latest = discoverLatestMachineVersion(env);
  const status = machineRuntimeStatus(env);
  if (!force && status.installed && status.current_version === latest) {
    return {
      changed: false,
      version: latest,
      binary: status.binary,
      alias: machineManagedAliasPath(env),
      state: readMachineRuntimeState(env),
      source: 'already-current',
    };
  }
  return installManagedMachine({ env, version: latest, force, write });
}
